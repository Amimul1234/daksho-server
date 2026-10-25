package main

import (
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
)

var allowedTypes = map[string]string{"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "application/pdf": ".pdf"}

var docKinds = map[string]bool{"photo": true, "nid": true, "ssc": true, "hsc": true, "guardian": true, "other": true}

func (a *App) filePath(centre, id string) string {
	return filepath.Join(a.data, "files", centre, id)
}

func (a *App) apiUpload(w http.ResponseWriter, r *http.Request, u User) {
	r.Body = http.MaxBytesReader(w, r.Body, 9<<20)
	if err := r.ParseMultipartForm(9 << 20); err != nil {
		fail(w, bad("ফাইল ৮ MB এর বেশি বড়"))
		return
	}
	kind := r.FormValue("kind")
	sid := r.FormValue("studentId")
	if !docKinds[kind] {
		fail(w, bad("কাগজের ধরন বাছুন"))
		return
	}
	f, hdr, err := r.FormFile("file")
	if err != nil {
		fail(w, bad("ফাইল আসেনি"))
		return
	}
	defer f.Close()
	head := make([]byte, 512)
	n, _ := io.ReadFull(f, head)
	ct := http.DetectContentType(head[:n])
	if _, ok := allowedTypes[ct]; !ok {
		fail(w, bad("শুধু ছবি (JPG, PNG) বা PDF দেওয়া যাবে"))
		return
	}
	if _, err := f.Seek(0, io.SeekStart); err != nil {
		fail(w, err)
		return
	}
	d := Doc{ID: newID("d"), StudentID: sid, Kind: kind, Name: filepath.Base(hdr.Filename), Type: ct, At: a.today()}
	if sid != "" {
		var st Student
		if err := a.read(u.Centre, func(t Tx) error { return t.get("student", sid, &st) }); err != nil {
			fail(w, missing("ছাত্র/ছাত্রী পাওয়া যায়নি"))
			return
		}
	}
	dir := filepath.Dir(a.filePath(u.Centre, d.ID))
	if err := os.MkdirAll(dir, 0o750); err != nil {
		fail(w, err)
		return
	}
	out, err := os.OpenFile(a.filePath(u.Centre, d.ID), os.O_CREATE|os.O_WRONLY|os.O_EXCL, 0o640)
	if err != nil {
		fail(w, err)
		return
	}
	d.Size, err = io.Copy(out, f)
	out.Close()
	if err != nil {
		os.Remove(a.filePath(u.Centre, d.ID))
		fail(w, err)
		return
	}
	if err := a.write(u.Centre, func(t Tx) error { return t.put("doc", d.ID, d) }); err != nil {
		fail(w, err)
		return
	}
	writeJSON(w, 200, map[string]any{"up": Up{"doc": {d}}, "doc": d})
}

func (a *App) apiFile(w http.ResponseWriter, r *http.Request, u User) {
	id := r.PathValue("id")
	var d Doc
	if strings.ContainsAny(id, "/\\.") || a.read(u.Centre, func(t Tx) error { return t.get("doc", id, &d) }) != nil || (u.Role == "teacher" && d.Kind != "photo") {
		http.NotFound(w, r)
		return
	}
	w.Header().Set("Content-Type", d.Type)
	w.Header().Set("Cache-Control", "private, max-age=86400")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	http.ServeFile(w, r, a.filePath(u.Centre, d.ID))
}
