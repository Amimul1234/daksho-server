package main

import (
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"golang.org/x/crypto/bcrypt"
)

func hashPw(p string) (string, error) {
	h, err := bcrypt.GenerateFromPassword([]byte(p), bcrypt.DefaultCost)
	return string(h), err
}

func newApp(dataDir, webDir string, sender Sender) (*App, error) {
	if err := os.MkdirAll(dataDir, 0o750); err != nil {
		return nil, err
	}
	db, err := openDB(filepath.Join(dataDir, "daksho.db"))
	if err != nil {
		return nil, err
	}
	return &App{db: db, sms: sender, data: dataDir, web: webDir, now: time.Now, hits: map[string][]time.Time{}}, nil
}

func (a *App) routes() http.Handler {
	m := http.NewServeMux()
	m.HandleFunc("POST /app/api/login", a.apiLogin)
	m.HandleFunc("POST /app/api/logout", a.auth("", a.apiLogout))
	m.HandleFunc("POST /app/api/password", a.auth("", a.apiPassword))
	m.HandleFunc("GET /app/api/boot", a.auth("", a.apiBoot))
	m.HandleFunc("POST /app/api/admit", a.auth("owner desk", a.apiAdmit))
	m.HandleFunc("POST /app/api/pay", a.auth("owner desk", a.apiPay))
	m.HandleFunc("POST /app/api/void", a.auth("owner", a.apiVoid))
	m.HandleFunc("POST /app/api/student", a.auth("owner desk", a.apiStudent))
	m.HandleFunc("POST /app/api/card", a.auth("owner desk", a.apiReissueCard))
	m.HandleFunc("POST /app/api/drop", a.auth("owner desk", a.apiDrop))
	m.HandleFunc("POST /app/api/sms", a.auth("owner desk", a.apiSMS))
	m.HandleFunc("POST /app/api/cert", a.auth("owner desk", a.apiCert))
	m.HandleFunc("POST /app/api/enquiry", a.auth("owner desk", a.apiEnquiry))
	m.HandleFunc("POST /app/api/expense", a.auth("owner desk", a.apiExpense))
	m.HandleFunc("POST /app/api/course", a.auth("owner desk", a.apiCourse))
	m.HandleFunc("POST /app/api/batch", a.auth("owner desk", a.apiBatch))
	m.HandleFunc("POST /app/api/teacher", a.auth("owner desk", a.apiTeacher))
	m.HandleFunc("POST /app/api/settings", a.auth("owner", a.apiSettings))
	m.HandleFunc("POST /app/api/staff", a.auth("owner", a.apiStaff))
	m.HandleFunc("POST /app/api/upload", a.auth("owner desk", a.apiUpload))
	m.HandleFunc("GET /app/api/file/{id}", a.auth("", a.apiFile))
	m.HandleFunc("POST /app/api/att/scan", a.auth("", a.apiScan))
	m.HandleFunc("POST /app/api/att/close", a.auth("", a.apiAttClose))
	m.HandleFunc("GET /app/api/verify/{no}", a.apiVerify)
	m.HandleFunc("GET /q/{tok}", a.cardLanding)
	fs := http.FileServer(http.Dir(a.web))
	m.HandleFunc("GET /app/", func(w http.ResponseWriter, r *http.Request) {
		p := strings.TrimPrefix(r.URL.Path, "/app")
		if p == "/" || p == "" {
			w.Header().Set("Cache-Control", "no-cache")
			http.ServeFile(w, r, filepath.Join(a.web, "index.html"))
			return
		}
		if strings.HasSuffix(p, ".js") || strings.HasSuffix(p, ".css") {
			w.Header().Set("Cache-Control", "no-cache")
		}
		r2 := r.Clone(r.Context())
		r2.URL.Path = p
		fs.ServeHTTP(w, r2)
	})
	m.HandleFunc("GET /app", func(w http.ResponseWriter, r *http.Request) { http.Redirect(w, r, "/app/", http.StatusFound) })
	return secHeaders(m)
}

func secHeaders(h http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Referrer-Policy", "same-origin")
		w.Header().Set("X-Frame-Options", "DENY")
		w.Header().Set("Permissions-Policy", "camera=(self), microphone=(), geolocation=()")
		h.ServeHTTP(w, r)
	})
}

func (a *App) centres() []string {
	rs, err := a.db.Query(`SELECT id FROM centres`)
	if err != nil {
		return nil
	}
	defer rs.Close()
	var ids []string
	for rs.Next() {
		var id string
		rs.Scan(&id)
		ids = append(ids, id)
	}
	return ids
}

type reminder struct {
	St   Student
	E    Enrollment
	Kind string
	Text string
	Key  string
}

func reminderQueue(c Centre, sts map[string]Student, es []Enrollment, pays []Payment, today string) []reminder {
	r := c.Reminders
	var out []reminder
	for _, e := range es {
		if e.Status != "running" {
			continue
		}
		st, ok := sts[e.StudentID]
		if !ok {
			continue
		}
		d := dueOf(e, pays, today)
		if d.Total <= 0 || d.Next == nil {
			continue
		}
		kind := ""
		switch {
		case d.Overdue > 0:
			late := d.LateDays
			if late == r.After || (late > r.After && r.Repeat > 0 && (late-r.After)%r.Repeat == 0) {
				kind = "overdue"
			}
		case d.Next.DD == r.Before && r.Before > 0:
			kind = "due"
		case r.OnDay && d.Next.DD == 0:
			kind = "due"
		}
		if kind == "" {
			continue
		}
		args := fillArgs{Amount: d.Next.Rem, Date: d.Next.Due}
		if kind == "overdue" {
			args = fillArgs{Amount: d.Overdue}
		}
		out = append(out, reminder{St: st, E: e, Kind: kind, Text: fill(Templates[kind], c, st, args), Key: "rem|" + e.ID + "|" + kind + "|" + today})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].E.ID < out[j].E.ID })
	return out
}

func (a *App) runReminders() int {
	n := 0
	for _, cid := range a.centres() {
		a.write(cid, func(t Tx) error {
			c, err := t.centreData()
			if err != nil {
				return err
			}
			sl, _ := list[Student](t, "student")
			sts := map[string]Student{}
			for _, s := range sl {
				sts[s.ID] = s
			}
			es, _ := list[Enrollment](t, "enrollment")
			pays, _ := list[Payment](t, "payment")
			for _, q := range reminderQueue(c, sts, es, pays, a.today()) {
				first, err := t.once(q.Key, a.now().Unix())
				if err != nil {
					return err
				}
				if !first {
					continue
				}
				m := Message{ID: newID("m"), StudentID: q.St.ID, To: q.St.Phone, Kind: q.Kind, Text: q.Text, At: a.today(), Time: a.clock()}
				if err := a.enqueue(t, &m); err != nil {
					return err
				}
				c.SmsUsed += m.Parts
				n++
			}
			return t.saveCentre(c)
		})
	}
	return n
}

func (a *App) backup() {
	dir := filepath.Join(a.data, "backups")
	os.MkdirAll(dir, 0o750)
	name := filepath.Join(dir, "daksho-"+a.today()+".db")
	if _, err := os.Stat(name); err == nil {
		return
	}
	if _, err := a.db.Exec(`VACUUM INTO ?`, name); err != nil {
		log.Printf("backup: %v", err)
		return
	}
	files, _ := filepath.Glob(filepath.Join(dir, "daksho-*.db"))
	sort.Strings(files)
	for len(files) > 14 {
		os.Remove(files[0])
		files = files[1:]
	}
}

func (a *App) loops() {
	go func() {
		for range time.Tick(10 * time.Second) {
			a.deliverOnce()
		}
	}()
	go func() {
		for range time.Tick(5 * time.Minute) {
			h := a.now().In(dhaka).Hour()
			if h >= 19 && h < 21 {
				if n := a.runReminders(); n > 0 {
					log.Printf("reminders: %d queued", n)
				}
			}
			if h >= 2 && h < 4 {
				a.backup()
			}
		}
	}()
}

func main() {
	addr := flag.String("addr", "127.0.0.1:8472", "listen address")
	data := flag.String("data", "./data", "data directory")
	web := flag.String("web", "./web", "web directory")
	secure := flag.Bool("secure", false, "mark cookies Secure (behind HTTPS)")
	newCentre := flag.String("new-centre", "", "create a centre with this name and exit")
	short := flag.String("short", "", "short name for SMS signature")
	phone := flag.String("phone", "", "owner phone")
	owner := flag.String("owner", "", "owner name")
	password := flag.String("password", "", "owner password")
	resetPw := flag.Bool("reset-password", false, "set a new password for -phone and exit")
	flag.Parse()

	var sender Sender = LogSender{}
	if key := os.Getenv("DAKSHO_SMS_KEY"); key != "" {
		sender = BulkSMSBD{Key: key, SenderID: os.Getenv("DAKSHO_SMS_SENDER")}
		log.Print("sms: gateway on")
	} else {
		log.Print("sms: log only (DAKSHO_SMS_KEY not set)")
	}
	a, err := newApp(*data, *web, sender)
	if err != nil {
		log.Fatal(err)
	}
	a.secure = *secure
	if *resetPw {
		if len(*password) < 6 {
			log.Fatal("password must be 6+ characters")
		}
		h, _ := hashPw(*password)
		res, err := a.db.Exec(`UPDATE users SET pw=?, active=1 WHERE phone=?`, h, digits(*phone))
		if err != nil {
			log.Fatal(err)
		}
		if n, _ := res.RowsAffected(); n == 0 {
			log.Fatal("no user with that phone")
		}
		a.db.Exec(`DELETE FROM sessions WHERE user IN (SELECT id FROM users WHERE phone=?)`, digits(*phone))
		fmt.Println("password reset for", digits(*phone))
		return
	}
	if *newCentre != "" {
		id, err := a.createCentre(*newCentre, *short, *phone, *owner, *password)
		if err != nil {
			log.Fatal(err)
		}
		fmt.Println("centre created:", id)
		return
	}
	a.loops()
	log.Printf("daksho on %s", *addr)
	srv := &http.Server{Addr: *addr, Handler: a.routes(), ReadHeaderTimeout: 10 * time.Second}
	log.Fatal(srv.ListenAndServe())
}
