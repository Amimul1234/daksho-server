package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"mime/multipart"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"os"
	"sync"
	"testing"
	"time"
)

type fakeSMS struct {
	mu   sync.Mutex
	sent []string
}

func (f *fakeSMS) Live() bool { return true }
func (f *fakeSMS) Send(_ context.Context, phone, text string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.sent = append(f.sent, phone+"|"+text)
	return nil
}

type env struct {
	t   *testing.T
	a   *App
	srv *httptest.Server
	sms *fakeSMS
	now time.Time
}

func newEnv(t *testing.T) *env {
	f := &fakeSMS{}
	a, err := newApp(t.TempDir(), t.TempDir(), f)
	if err != nil {
		t.Fatal(err)
	}
	e := &env{t: t, a: a, sms: f, now: time.Date(2026, 10, 25, 10, 5, 0, 0, dhaka)}
	a.now = func() time.Time { return e.now }
	t.Cleanup(func() { a.db.Close() })
	e.srv = httptest.NewServer(a.routes())
	t.Cleanup(e.srv.Close)
	return e
}

type client struct {
	e *env
	h *http.Client
}

func (e *env) login(phone, pw string) *client {
	jar, _ := cookiejar.New(nil)
	c := &client{e: e, h: &http.Client{Jar: jar}}
	code, body := c.post("/app/api/login", map[string]string{"phone": phone, "password": pw})
	if code != 200 {
		e.t.Fatalf("login %s: %d %v", phone, code, body)
	}
	return c
}

func (c *client) do(method, path string, payload any) (int, map[string]any) {
	var rd *bytes.Reader
	if payload != nil {
		b, _ := json.Marshal(payload)
		rd = bytes.NewReader(b)
	} else {
		rd = bytes.NewReader(nil)
	}
	req, _ := http.NewRequest(method, c.e.srv.URL+path, rd)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Daksho", "1")
	res, err := c.h.Do(req)
	if err != nil {
		c.e.t.Fatal(err)
	}
	defer res.Body.Close()
	out := map[string]any{}
	json.NewDecoder(res.Body).Decode(&out)
	return res.StatusCode, out
}

func (c *client) post(path string, payload any) (int, map[string]any) { return c.do("POST", path, payload) }

func (c *client) must(path string, payload any) map[string]any {
	code, out := c.post(path, payload)
	if code != 200 {
		c.e.t.Fatalf("%s: %d %v", path, code, out)
	}
	return out
}

func first(out map[string]any, kind string) map[string]any {
	up, _ := out["up"].(map[string]any)
	l, _ := up[kind].([]any)
	if len(l) == 0 {
		return nil
	}
	return l[len(l)-1].(map[string]any)
}

func all(out map[string]any, kind string) []any {
	up, _ := out["up"].(map[string]any)
	l, _ := up[kind].([]any)
	return l
}

type fixture struct {
	owner  *client
	course string
	batch  string
}

func (e *env) centre(phone string) fixture {
	if _, err := e.a.createCentre("দিগন্ত কম্পিউটার", "দিগন্ত", phone, "মালিক", "secret1"); err != nil {
		e.t.Fatal(err)
	}
	o := e.login(phone, "secret1")
	co := first(o.must("/app/api/course", map[string]any{"name": "অফিস অ্যাপ্লিকেশন", "en": "Office", "months": 3, "hours": 72, "fee": 6000, "admission": 1000, "inst": 2}), "course")
	bt := first(o.must("/app/api/batch", map[string]any{"courseId": co["id"], "code": "OA-1", "days": "রবি মঙ্গল বৃহঃ", "time": "10:00", "seats": 3, "start": "2026-10-20", "lab": "ল্যাব ১"}), "batch")
	return fixture{owner: o, course: co["id"].(string), batch: bt["id"].(string)}
}

func admitBody(f fixture, seat int, phone string, plan []map[string]any, payNow int) map[string]any {
	return map[string]any{
		"student":  map[string]any{"name": "রাকিব হোসেন", "en": "Rakib Hossain", "phone": phone, "guardianPhone": "01711000002", "dob": "2009-01-01", "father": "আব্দুল"},
		"courseId": f.course, "batchId": f.batch, "seat": seat, "plan": plan, "payNow": payNow, "method": "cash", "sms": true,
	}
}

func twoPlan() []map[string]any {
	return []map[string]any{{"amount": 3000, "due": "2026-10-25"}, {"amount": 3000, "due": "2026-11-25"}}
}

func (e *env) dues(c *client, eid string) Due {
	var d Due
	e.a.read(e.a.centres()[0], func(t Tx) error {
		var en Enrollment
		t.get("enrollment", eid, &en)
		pays, _ := list[Payment](t, "payment")
		d = dueOf(en, pays, e.a.today())
		return nil
	})
	return d
}

func TestAdmitAndPaymentAllocation(t *testing.T) {
	e := newEnv(t)
	f := e.centre("01711000001")
	out := f.owner.must("/app/api/admit", admitBody(f, 1, "01711000003", twoPlan(), 4000))
	st := first(out, "student")
	if st["roll"] != "DK-26-0001" {
		t.Fatalf("roll %v", st["roll"])
	}
	pays := all(out, "payment")
	if len(pays) != 2 || pays[0].(map[string]any)["label"] != admissionLabel || pays[1].(map[string]any)["amount"].(float64) != 3000 {
		t.Fatalf("payments %v", pays)
	}
	if pays[0].(map[string]any)["receipt"] == pays[1].(map[string]any)["receipt"] {
		t.Fatal("receipts must differ")
	}
	eid := first(out, "enrollment")["id"].(string)
	if d := e.dues(f.owner, eid); d.Total != 3000 || d.Overdue != 0 {
		t.Fatalf("after admit %+v", d)
	}
	if code, _ := f.owner.post("/app/api/pay", map[string]any{"enrollmentId": eid, "amount": 3500, "method": "cash"}); code != 400 {
		t.Fatalf("overpay allowed: %d", code)
	}
	if code, _ := f.owner.post("/app/api/pay", map[string]any{"enrollmentId": eid, "amount": 2000, "method": "bkash"}); code != 400 {
		t.Fatalf("bkash without trx allowed: %d", code)
	}
	f.owner.must("/app/api/pay", map[string]any{"enrollmentId": eid, "amount": 2000, "method": "bkash", "trx": "9kd7a2xq1b"})
	d := e.dues(f.owner, eid)
	if d.Total != 1000 || d.Rows[1].Covered != 2000 || d.Rows[1].Rem != 1000 {
		t.Fatalf("partial %+v", d)
	}
	e.now = e.now.AddDate(0, 1, 5)
	if d := e.dues(f.owner, eid); d.Overdue != 1000 || d.LateDays != 5 {
		t.Fatalf("late %+v", d)
	}
}

func TestAdmitRejectsBadPlanAndTakenSeat(t *testing.T) {
	e := newEnv(t)
	f := e.centre("01711000001")
	if code, _ := f.owner.post("/app/api/admit", admitBody(f, 1, "01711000003", []map[string]any{{"amount": 1000, "due": "2026-10-25"}}, 0)); code != 400 {
		t.Fatalf("plan sum mismatch allowed: %d", code)
	}
	f.owner.must("/app/api/admit", admitBody(f, 1, "01711000003", twoPlan(), 0))
	if code, _ := f.owner.post("/app/api/admit", admitBody(f, 1, "01711000004", twoPlan(), 0)); code != 409 {
		t.Fatalf("taken seat allowed: %d", code)
	}
	if code, _ := f.owner.post("/app/api/admit", admitBody(f, 4, "01711000004", twoPlan(), 0)); code != 400 {
		t.Fatalf("seat beyond lab allowed: %d", code)
	}
}

func TestRolesVoidAndDiscount(t *testing.T) {
	e := newEnv(t)
	f := e.centre("01711000001")
	f.owner.must("/app/api/staff", map[string]any{"phone": "01711000009", "name": "তানিয়া", "role": "desk", "password": "deskpw1"})
	f.owner.must("/app/api/staff", map[string]any{"phone": "01711000008", "name": "শিক্ষক", "role": "teacher", "password": "teach11"})
	desk := e.login("01711000009", "deskpw1")
	teacher := e.login("01711000008", "teach11")
	body := admitBody(f, 1, "01711000003", []map[string]any{{"amount": 4500, "due": "2026-10-25"}}, 1000)
	body["discount"], body["discountReason"] = 1500, "পুরনো ছাত্র"
	if code, _ := desk.post("/app/api/admit", body); code != 403 {
		t.Fatalf("desk big discount allowed: %d", code)
	}
	out := f.owner.must("/app/api/admit", body)
	pid := first(out, "payment")["id"].(string)
	if code, _ := desk.post("/app/api/void", map[string]any{"paymentId": pid, "why": "ভুল"}); code != 403 {
		t.Fatalf("desk void allowed: %d", code)
	}
	if code, _ := teacher.post("/app/api/pay", map[string]any{"enrollmentId": first(out, "enrollment")["id"], "amount": 100, "method": "cash"}); code != 403 {
		t.Fatalf("teacher pay allowed: %d", code)
	}
	code, boot := teacher.do("GET", "/app/api/boot", nil)
	if code != 200 || boot["payment"] != nil {
		t.Fatalf("teacher sees money: %d %v", code, boot["payment"])
	}
	if l, _ := boot["doc"].([]any); len(l) != 0 {
		t.Fatalf("teacher sees non-photo files: %v", l)
	}
	f.owner.must("/app/api/void", map[string]any{"paymentId": pid, "why": "ভুল এন্ট্রি"})
	if code, _ := f.owner.post("/app/api/void", map[string]any{"paymentId": pid, "why": "আবার"}); code != 409 {
		t.Fatalf("double void: %d", code)
	}
	if d := e.dues(f.owner, first(out, "enrollment")["id"].(string)); d.AdmissionDue != 1000 {
		t.Fatalf("void did not restore due %+v", d)
	}
	req, _ := http.NewRequest("POST", e.srv.URL+"/app/api/void", bytes.NewReader([]byte(`{}`)))
	res, _ := f.owner.h.Do(req)
	if res.StatusCode != 403 {
		t.Fatalf("post without X-Daksho header: %d", res.StatusCode)
	}
}

func TestCertificateGateAndVerify(t *testing.T) {
	e := newEnv(t)
	f := e.centre("01711000001")
	out := f.owner.must("/app/api/admit", admitBody(f, 1, "01711000003", twoPlan(), 4000))
	eid := first(out, "enrollment")["id"].(string)
	if code, _ := f.owner.post("/app/api/cert", map[string]any{"enrollmentId": eid, "grade": "A"}); code != 409 {
		t.Fatalf("cert before course end: %d", code)
	}
	e.now = time.Date(2026, 1, 25, 10, 0, 0, 0, dhaka).AddDate(1, 0, 0)
	if code, _ := f.owner.do("GET", "/app/api/boot", nil); code != 401 {
		t.Fatalf("session older than 60 days still works: %d", code)
	}
	f.owner = e.login("01711000001", "secret1")
	if code, _ := f.owner.post("/app/api/cert", map[string]any{"enrollmentId": eid, "grade": "A"}); code != 409 {
		t.Fatalf("cert with dues: %d", code)
	}
	f.owner.must("/app/api/pay", map[string]any{"enrollmentId": eid, "amount": 3000, "method": "cash"})
	c := first(f.owner.must("/app/api/cert", map[string]any{"enrollmentId": eid, "grade": "A"}), "enrollment")["cert"].(map[string]any)
	if c["no"] != "DK-C-0001" {
		t.Fatalf("cert no %v", c["no"])
	}
	if code, _ := f.owner.post("/app/api/cert", map[string]any{"enrollmentId": eid, "grade": "A"}); code != 409 {
		t.Fatalf("second cert: %d", code)
	}
	res, _ := http.Get(e.srv.URL + "/app/api/verify/dk-c-0001")
	var v map[string]any
	json.NewDecoder(res.Body).Decode(&v)
	if v["ok"] != true || v["en"] != "Rakib Hossain" {
		t.Fatalf("verify %v", v)
	}
	res, _ = http.Get(e.srv.URL + "/app/api/verify/DK-C-9999")
	if res.StatusCode != 404 {
		t.Fatalf("fake cert verified")
	}
}

func TestQRScanAttendanceAndClose(t *testing.T) {
	e := newEnv(t)
	f := e.centre("01711000001")
	s1 := first(f.owner.must("/app/api/admit", admitBody(f, 1, "01711000003", twoPlan(), 0)), "student")
	s2 := first(f.owner.must("/app/api/admit", admitBody(f, 2, "01711000004", twoPlan(), 0)), "student")
	_ = s2
	f.owner.must("/app/api/staff", map[string]any{"phone": "01711000008", "name": "শিক্ষক", "role": "teacher", "password": "teach11"})
	teacher := e.login("01711000008", "teach11")
	url := "https://daksho.shishirbd.shop/q/" + s1["qr"].(string)
	res := teacher.must("/app/api/att/scan", map[string]any{"code": url})
	if res["status"] != "ok" || res["late"] != false || res["count"].(float64) != 1 || res["total"].(float64) != 2 {
		t.Fatalf("scan %v", res)
	}
	if _, ok := res["overdue"]; ok {
		t.Fatalf("teacher sees dues %v", res["overdue"])
	}
	if r := teacher.must("/app/api/att/scan", map[string]any{"code": s1["qr"]}); r["status"] != "already" {
		t.Fatalf("rescan %v", r["status"])
	}
	if r := teacher.must("/app/api/att/scan", map[string]any{"code": "https://x/q/000000000000"}); r["status"] != "unknown" {
		t.Fatalf("unknown %v", r["status"])
	}
	n := 0
	e.a.read(e.a.centres()[0], func(t Tx) error {
		ms, _ := list[Message](t, "message")
		for _, m := range ms {
			if m.Kind == "absent" {
				n++
			}
		}
		return nil
	})
	if n != 0 {
		t.Fatalf("absent sms before close: %d", n)
	}
	out := teacher.must("/app/api/att/close", map[string]any{"batchId": f.batch, "sms": true})
	ms := all(out, "message")
	if len(ms) != 1 || ms[0].(map[string]any)["to"] != "01711000002" {
		t.Fatalf("absent sms %v", ms)
	}
	if again := teacher.must("/app/api/att/close", map[string]any{"batchId": f.batch, "sms": true}); len(all(again, "message")) != 0 {
		t.Fatal("absent sms sent twice")
	}
	e.now = e.now.Add(30 * time.Minute)
	late := teacher.must("/app/api/att/scan", map[string]any{"code": s2["qr"]})
	if late["status"] != "ok" || late["late"] != true || late["notified"] != true {
		t.Fatalf("late scan %v", late)
	}
	e.now = time.Date(2026, 10, 26, 10, 0, 0, 0, dhaka)
	if r := teacher.must("/app/api/att/scan", map[string]any{"code": s1["qr"]}); r["status"] != "not_today" {
		t.Fatalf("monday scan %v", r["status"])
	}
	if r := teacher.must("/app/api/att/scan", map[string]any{"code": s1["qr"], "force": true}); r["status"] != "ok" {
		t.Fatalf("forced scan %v", r["status"])
	}
	for i := 0; i < 50 && e.a.deliverOnce() > 0; i++ {
	}
	if len(e.sms.sent) == 0 {
		t.Fatal("outbox never delivered")
	}
}

func TestManualSheetUsesSameRecord(t *testing.T) {
	e := newEnv(t)
	f := e.centre("01711000001")
	s1 := first(f.owner.must("/app/api/admit", admitBody(f, 1, "01711000003", twoPlan(), 0)), "student")
	s2 := first(f.owner.must("/app/api/admit", admitBody(f, 2, "01711000004", twoPlan(), 0)), "student")
	f.owner.must("/app/api/att/scan", map[string]any{"code": s1["qr"]})
	out := f.owner.must("/app/api/att/close", map[string]any{"batchId": f.batch, "manual": true, "absent": []string{s1["id"].(string)}})
	at := first(out, "att")
	if ab := at["absent"].([]any); len(ab) != 1 || ab[0] != s1["id"] {
		t.Fatalf("manual absent %v", ab)
	}
	if p := at["present"].([]any); len(p) != 1 || p[0].(map[string]any)["s"] != s2["id"] {
		t.Fatalf("manual present %v", p)
	}
}

func TestRemindersOnceADay(t *testing.T) {
	e := newEnv(t)
	f := e.centre("01711000001")
	f.owner.must("/app/api/admit", admitBody(f, 1, "01711000003", []map[string]any{{"amount": 3000, "due": "2026-10-25"}, {"amount": 3000, "due": "2026-10-28"}}, 4000))
	if n := e.a.runReminders(); n != 1 {
		t.Fatalf("reminders %d", n)
	}
	if n := e.a.runReminders(); n != 0 {
		t.Fatalf("second run sent %d", n)
	}
	e.now = e.now.AddDate(0, 0, 3)
	var eid, sid string
	e.a.read(e.a.centres()[0], func(t Tx) error {
		es, _ := list[Enrollment](t, "enrollment")
		eid, sid = es[0].ID, es[0].StudentID
		return nil
	})
	f.owner = e.login("01711000001", "secret1")
	f.owner.must("/app/api/sms", map[string]any{"items": []map[string]any{{"studentId": sid, "enrollmentId": eid, "kind": "due", "text": "কিস্তি আজ"}}})
	if n := e.a.runReminders(); n != 0 {
		t.Fatalf("evening reminder after a manual one: %d", n)
	}
}

func TestCentresAreIsolated(t *testing.T) {
	e := newEnv(t)
	a := e.centre("01711000001")
	b := e.centre("01811000001")
	out := a.owner.must("/app/api/admit", admitBody(a, 1, "01711000003", twoPlan(), 0))
	st := first(out, "student")
	eid := first(out, "enrollment")["id"].(string)
	var buf bytes.Buffer
	mw := multipart.NewWriter(&buf)
	mw.WriteField("kind", "nid")
	mw.WriteField("studentId", st["id"].(string))
	fw, _ := mw.CreateFormFile("file", "nid.png")
	png, _ := os.ReadFile("testdata/tiny.png")
	fw.Write(png)
	mw.Close()
	req, _ := http.NewRequest("POST", e.srv.URL+"/app/api/upload", &buf)
	req.Header.Set("Content-Type", mw.FormDataContentType())
	req.Header.Set("X-Daksho", "1")
	res, err := a.owner.h.Do(req)
	if err != nil || res.StatusCode != 200 {
		t.Fatalf("upload %v %d", err, res.StatusCode)
	}
	var up map[string]any
	json.NewDecoder(res.Body).Decode(&up)
	did := up["doc"].(map[string]any)["id"].(string)
	if r, _ := a.owner.h.Get(e.srv.URL + "/app/api/file/" + did); r.StatusCode != 200 {
		t.Fatalf("own file %d", r.StatusCode)
	}
	if r, _ := b.owner.h.Get(e.srv.URL + "/app/api/file/" + did); r.StatusCode != 404 {
		t.Fatalf("other centre read file: %d", r.StatusCode)
	}
	a.owner.must("/app/api/staff", map[string]any{"phone": "01711000008", "name": "শিক্ষক", "role": "teacher", "password": "teach11"})
	if r, _ := e.login("01711000008", "teach11").h.Get(e.srv.URL + "/app/api/file/" + did); r.StatusCode != 404 {
		t.Fatalf("teacher read an NID: %d", r.StatusCode)
	}
	if r, _ := http.Get(e.srv.URL + "/app/api/file/" + did); r.StatusCode != 401 {
		t.Fatalf("anonymous read file: %d", r.StatusCode)
	}
	if code, _ := b.owner.post("/app/api/pay", map[string]any{"enrollmentId": eid, "amount": 100, "method": "cash"}); code != 404 {
		t.Fatalf("other centre pay: %d", code)
	}
	if r := b.owner.must("/app/api/att/scan", map[string]any{"code": st["qr"]}); r["status"] != "unknown" {
		t.Fatalf("other centre scan %v", r["status"])
	}
	_, boot := b.owner.do("GET", "/app/api/boot", nil)
	if l, _ := boot["student"].([]any); len(l) != 0 {
		t.Fatalf("other centre sees students %d", len(l))
	}
}

func TestReceiptNumbersUnderConcurrency(t *testing.T) {
	e := newEnv(t)
	f := e.centre("01711000001")
	out := f.owner.must("/app/api/admit", admitBody(f, 1, "01711000003", twoPlan(), 0))
	eid := first(out, "enrollment")["id"].(string)
	var wg sync.WaitGroup
	for i := 0; i < 20; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			f.owner.post("/app/api/pay", map[string]any{"enrollmentId": eid, "amount": 100, "method": "cash"})
		}()
	}
	wg.Wait()
	seen := map[string]bool{}
	e.a.read(e.a.centres()[0], func(t Tx) error {
		ps, _ := list[Payment](t, "payment")
		for _, p := range ps {
			if seen[p.Receipt] {
				return fmt.Errorf("dup")
			}
			seen[p.Receipt] = true
		}
		return nil
	})
	if len(seen) != 20 {
		t.Fatalf("receipts %d", len(seen))
	}
}

func TestDuesFixtureMatchesClient(t *testing.T) {
	b, err := os.ReadFile("testdata/dues-cases.json")
	if err != nil {
		t.Fatal(err)
	}
	var cases []struct {
		Name       string     `json:"name"`
		Today      string     `json:"today"`
		Enrollment Enrollment `json:"enrollment"`
		Payments   []Payment  `json:"payments"`
		Want       struct {
			Total, Overdue, LateDays, AdmissionDue, NextRem int
			Sts                                             []string
		} `json:"want"`
	}
	if err := json.Unmarshal(b, &cases); err != nil {
		t.Fatal(err)
	}
	for _, c := range cases {
		d := dueOf(c.Enrollment, c.Payments, c.Today)
		next := 0
		if d.Next != nil {
			next = d.Next.Rem
		}
		var sts []string
		for _, r := range d.Rows {
			sts = append(sts, r.St)
		}
		if d.Total != c.Want.Total || d.Overdue != c.Want.Overdue || d.LateDays != c.Want.LateDays || d.AdmissionDue != c.Want.AdmissionDue || next != c.Want.NextRem || fmt.Sprint(sts) != fmt.Sprint(c.Want.Sts) {
			t.Errorf("%s: got total=%d overdue=%d late=%d adm=%d next=%d sts=%v", c.Name, d.Total, d.Overdue, d.LateDays, d.AdmissionDue, next, sts)
		}
	}
}

func TestNoCloseOnDayWithoutClassAndOfflineScanTime(t *testing.T) {
	e := newEnv(t)
	f := e.centre("01711000001")
	s1 := first(f.owner.must("/app/api/admit", admitBody(f, 1, "01711000003", twoPlan(), 0)), "student")
	e.now = time.Date(2026, 10, 26, 10, 0, 0, 0, dhaka)
	f.owner = e.login("01711000001", "secret1")
	if code, out := f.owner.post("/app/api/att/close", map[string]any{"batchId": f.batch, "sms": true}); code != 409 {
		t.Fatalf("closed a class that is not held: %d %v", code, out)
	}
	if code, _ := f.owner.post("/app/api/att/close", map[string]any{"batchId": f.batch, "manual": true, "absent": []string{s1["id"].(string)}, "sms": true}); code != 409 {
		t.Fatalf("manual close on a day without class: %d", code)
	}
	e.now = time.Date(2026, 10, 27, 10, 40, 0, 0, dhaka)
	scanned := time.Date(2026, 10, 27, 10, 2, 0, 0, dhaka).UnixMilli()
	r := f.owner.must("/app/api/att/scan", map[string]any{"code": s1["qr"], "at": scanned})
	if r["status"] != "ok" || r["late"] != false {
		t.Fatalf("offline scan judged by arrival time: %v", r)
	}
	if p := r["att"].(map[string]any)["present"].([]any)[0].(map[string]any)["t"]; p != "10:02" {
		t.Fatalf("scan time %v", p)
	}
}

func TestOwnerResetsStaffPassword(t *testing.T) {
	e := newEnv(t)
	f := e.centre("01711000001")
	u := f.owner.must("/app/api/staff", map[string]any{"phone": "01711000009", "name": "তানিয়া", "role": "desk", "password": "deskpw1"})["user"].(map[string]any)
	desk := e.login("01711000009", "deskpw1")
	f.owner.must("/app/api/staff", map[string]any{"id": u["id"], "password": "newpass9"})
	if code, _ := desk.do("GET", "/app/api/boot", nil); code != 401 {
		t.Fatalf("old session survived a reset: %d", code)
	}
	e.login("01711000009", "newpass9")
	if code, _ := desk.post("/app/api/staff", map[string]any{"id": u["id"], "password": "hacked99"}); code != 401 && code != 403 {
		t.Fatalf("desk reset a password: %d", code)
	}
}
