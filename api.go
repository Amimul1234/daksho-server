package main

import (
	"fmt"
	"net/http"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"
)

var trxRe = regexp.MustCompile(`^[A-Za-z0-9]{8,12}$`)
var timeRe = regexp.MustCompile(`^([01]\d|2[0-3]):[0-5]\d$`)

func (a *App) apiBoot(w http.ResponseWriter, r *http.Request, u User) {
	out := map[string]any{}
	err := a.read(u.Centre, func(t Tx) error {
		c, err := t.centreData()
		if err != nil {
			return err
		}
		out["centre"] = c
		out["user"] = u
		out["today"] = a.today()
		out["smsLive"] = a.sms.Live()
		kinds := []string{"course", "batch", "teacher", "student", "enrollment", "enquiry", "att"}
		if u.Role != "teacher" {
			kinds = append(kinds, "payment", "doc", "message", "expense")
		}
		for _, k := range kinds {
			rows, err := list[map[string]any](t, k)
			if err != nil {
				return err
			}
			if k == "message" {
				sort.Slice(rows, func(i, j int) bool {
					return fmt.Sprint(rows[i]["at"], rows[i]["time"]) > fmt.Sprint(rows[j]["at"], rows[j]["time"])
				})
				if len(rows) > 600 {
					rows = rows[:600]
				}
			}
			out[k] = rows
		}
		if u.Role == "teacher" {
			docs, err := list[Doc](t, "doc")
			if err != nil {
				return err
			}
			photos := []Doc{}
			for _, d := range docs {
				if d.Kind == "photo" {
					photos = append(photos, d)
				}
			}
			out["doc"] = photos
		}
		if u.Role == "owner" {
			rs, err := t.Query(`SELECT id,phone,name,role,active FROM users WHERE centre=? ORDER BY role,name`, u.Centre)
			if err != nil {
				return err
			}
			defer rs.Close()
			staff := []User{}
			for rs.Next() {
				var s User
				var act int
				rs.Scan(&s.ID, &s.Phone, &s.Name, &s.Role, &act)
				s.Active = act == 1
				staff = append(staff, s)
			}
			out["staff"] = staff
		}
		return nil
	})
	if err != nil {
		fail(w, err)
		return
	}
	writeJSON(w, 200, out)
}

type admitReq struct {
	Student        Student           `json:"student"`
	CourseID       string            `json:"courseId"`
	BatchID        string            `json:"batchId"`
	Seat           int               `json:"seat"`
	Discount       int               `json:"discount"`
	DiscountReason string            `json:"discountReason"`
	Plan           []Inst            `json:"plan"`
	PayNow         int               `json:"payNow"`
	Method         string            `json:"method"`
	Trx            string            `json:"trx"`
	SMS            bool              `json:"sms"`
	Docs           map[string]string `json:"docs"`
	EnquiryID      string            `json:"enquiryId"`
}

func checkStudent(s *Student) error {
	s.Name = strings.TrimSpace(s.Name)
	s.En = strings.TrimSpace(s.En)
	s.Father = strings.TrimSpace(s.Father)
	switch {
	case s.Name == "":
		return bad("নাম লিখুন")
	case s.En == "":
		return bad("ইংরেজি নাম লিখুন, সনদে এটাই ছাপা হবে")
	case !validPhone(s.Phone):
		return bad("মোবাইল নম্বর ১১ সংখ্যার হতে হবে")
	case !validPhone(s.GuardianPhone):
		return bad("অভিভাবকের মোবাইল নম্বর ১১ সংখ্যার হতে হবে")
	case parseDay(s.Dob).IsZero():
		return bad("জন্মতারিখ দিন")
	case s.Father == "":
		return bad("পিতার নাম লিখুন")
	}
	s.Phone = digits(s.Phone)
	s.GuardianPhone = digits(s.GuardianPhone)
	if s.Gender != "f" {
		s.Gender = "m"
	}
	return nil
}

func checkMethod(method, trx string, amount int) error {
	if amount <= 0 {
		return nil
	}
	switch method {
	case "cash":
	case "bkash", "nagad":
		if !trxRe.MatchString(trx) {
			return bad("বিকাশ বা নগদে দিলে ৮–১২ অক্ষরের ট্রানজেকশন আইডি দিন")
		}
	default:
		return bad("কীভাবে টাকা দিলেন বাছুন")
	}
	return nil
}

func seatTaken(t Tx, batchID string, seat int, except string) (bool, error) {
	es, err := list[Enrollment](t, "enrollment")
	if err != nil {
		return false, err
	}
	for _, e := range es {
		if e.BatchID == batchID && e.Seat == seat && e.Status == "running" && e.ID != except {
			return true, nil
		}
	}
	return false, nil
}

func (a *App) nextReceipt(c *Centre) string {
	c.Seq.Receipt++
	return fmt.Sprintf("R-%d", 1000+c.Seq.Receipt)
}

func (a *App) addPayment(t Tx, c *Centre, u User, e Enrollment, amount int, method, trx, label string, up Up) (Payment, error) {
	p := Payment{ID: newID("p"), Receipt: a.nextReceipt(c), StudentID: e.StudentID, EnrollmentID: e.ID, Amount: amount, At: a.today(), Time: a.clock(), Method: method, Trx: strings.ToUpper(trx), Label: label, By: firstName(u.Name)}
	if method == "cash" {
		p.Trx = ""
	}
	up.add("payment", p)
	return p, t.put("payment", p.ID, p)
}

func firstName(s string) string {
	f := strings.Fields(s)
	if len(f) == 0 {
		return s
	}
	return f[0]
}

func (a *App) apiAdmit(w http.ResponseWriter, r *http.Request, u User) {
	var b admitReq
	if err := readBody(r, &b); err != nil {
		fail(w, err)
		return
	}
	up := Up{}
	err := a.write(u.Centre, func(t Tx) error {
		c, err := t.centreData()
		if err != nil {
			return err
		}
		st := b.Student
		if err := checkStudent(&st); err != nil {
			return err
		}
		var course Course
		var batch Batch
		if t.get("course", b.CourseID, &course) != nil {
			return bad("কোর্স বাছুন")
		}
		if t.get("batch", b.BatchID, &batch) != nil || batch.CourseID != course.ID {
			return bad("ব্যাচ বাছুন")
		}
		if b.Seat < 1 || b.Seat > batch.Seats {
			return bad("ল্যাবের একটা পিসি বাছুন")
		}
		if taken, err := seatTaken(t, batch.ID, b.Seat, ""); err != nil {
			return err
		} else if taken {
			return conflict("এই পিসিতে আগেই একজন ভর্তি হয়েছে, অন্য পিসি বাছুন")
		}
		if b.Discount < 0 || b.Discount > course.Fee {
			return bad("ছাড়ের পরিমাণ ঠিক নেই")
		}
		if b.Discount > 1000 && u.Role != "owner" {
			return forbidden("৳১,০০০ এর বেশি ছাড়ে মালিকের অনুমোদন লাগবে, মালিক নিজে ভর্তি করুন")
		}
		if b.Discount > 0 && strings.TrimSpace(b.DiscountReason) == "" {
			return bad("ছাড়ের কারণ লিখুন")
		}
		net := course.Fee - b.Discount
		if len(b.Plan) == 0 || len(b.Plan) > 24 {
			return bad("কিস্তির হিসাব দিন")
		}
		sum := 0
		plan := make([]Inst, len(b.Plan))
		for i, in := range b.Plan {
			if in.Amount < 0 || parseDay(in.Due).IsZero() {
				return bad("কিস্তির তারিখ বা টাকা ঠিক নেই")
			}
			sum += in.Amount
			plan[i] = Inst{N: i + 1, Amount: in.Amount, Due: in.Due, Label: in.Label}
		}
		if sum != net {
			return bad(fmt.Sprintf("কিস্তির যোগফল ৳%s, কোর্স ফি ৳%s এর সমান হতে হবে", money(sum), money(net)))
		}
		if b.PayNow < 0 || b.PayNow > course.Admission+net {
			return bad("আজকের জমার পরিমাণ ঠিক নেই")
		}
		if err := checkMethod(b.Method, b.Trx, b.PayNow); err != nil {
			return err
		}
		c.Seq.Roll++
		st.ID = newID("s")
		st.Roll = fmt.Sprintf("%s-%s-%04d", c.Prefix, a.today()[2:4], c.Seq.Roll)
		st.Joined = a.today()
		st.QR = token(6)
		if _, err := t.Exec(`INSERT INTO qr(token,centre,student) VALUES(?,?,?)`, st.QR, u.Centre, st.ID); err != nil {
			return err
		}
		if err := t.put("student", st.ID, st); err != nil {
			return err
		}
		up.add("student", st)
		e := Enrollment{ID: newID("e"), StudentID: st.ID, BatchID: batch.ID, CourseID: course.ID, Seat: b.Seat, Fee: course.Fee, Admission: course.Admission, Discount: b.Discount, DiscountReason: strings.TrimSpace(b.DiscountReason), Plan: plan, Status: "running", Joined: a.today()}
		if err := t.put("enrollment", e.ID, e); err != nil {
			return err
		}
		up.add("enrollment", e)
		left := b.PayNow
		if left > 0 {
			adm := left
			if adm > course.Admission {
				adm = course.Admission
			}
			if adm > 0 {
				if _, err := a.addPayment(t, &c, u, e, adm, b.Method, b.Trx, admissionLabel, up); err != nil {
					return err
				}
				left -= adm
			}
			if left > 0 {
				if _, err := a.addPayment(t, &c, u, e, left, b.Method, b.Trx, "", up); err != nil {
					return err
				}
			}
		}
		for kind, id := range b.Docs {
			var d Doc
			if t.get("doc", id, &d) == nil && d.StudentID == "" {
				d.StudentID = st.ID
				d.Kind = kind
				t.put("doc", d.ID, d)
				up.add("doc", d)
			}
		}
		if b.EnquiryID != "" {
			var q Enquiry
			if t.get("enquiry", b.EnquiryID, &q) == nil {
				q.Status, q.Next = "won", ""
				t.put("enquiry", q.ID, q)
				up.add("enquiry", q)
			}
		}
		if b.SMS {
			m := Message{ID: newID("m"), StudentID: st.ID, To: st.Phone, Kind: "admission", Text: fill(Templates["admission"], c, st, fillArgs{}), At: a.today(), Time: a.clock()}
			if err := a.enqueue(t, &m); err != nil {
				return err
			}
			c.SmsUsed += m.Parts
			up.add("message", m)
		}
		up.add("centre", c)
		return t.saveCentre(c)
	})
	if err != nil {
		fail(w, err)
		return
	}
	writeJSON(w, 200, map[string]any{"up": up})
}

func (a *App) apiPay(w http.ResponseWriter, r *http.Request, u User) {
	var b struct {
		EnrollmentID string `json:"enrollmentId"`
		Amount       int    `json:"amount"`
		Method       string `json:"method"`
		Trx          string `json:"trx"`
		SMS          bool   `json:"sms"`
	}
	if err := readBody(r, &b); err != nil {
		fail(w, err)
		return
	}
	up := Up{}
	err := a.write(u.Centre, func(t Tx) error {
		c, err := t.centreData()
		if err != nil {
			return err
		}
		var e Enrollment
		if err := t.get("enrollment", b.EnrollmentID, &e); err != nil {
			return missing("ভর্তির তথ্য পাওয়া যায়নি")
		}
		if e.Status == "dropped" {
			return conflict("এই ছাত্র/ছাত্রী কোর্স ছেড়ে দিয়েছে")
		}
		pays, err := list[Payment](t, "payment")
		if err != nil {
			return err
		}
		d := dueOf(e, pays, a.today())
		if b.Amount < 1 || b.Amount > d.Total {
			return bad(fmt.Sprintf("১ থেকে ৳%s এর মধ্যে লিখুন", money(d.Total)))
		}
		if err := checkMethod(b.Method, b.Trx, b.Amount); err != nil {
			return err
		}
		left := b.Amount
		var last Payment
		if d.AdmissionDue > 0 {
			adm := left
			if adm > d.AdmissionDue {
				adm = d.AdmissionDue
			}
			if last, err = a.addPayment(t, &c, u, e, adm, b.Method, b.Trx, admissionLabel, up); err != nil {
				return err
			}
			left -= adm
		}
		if left > 0 {
			if last, err = a.addPayment(t, &c, u, e, left, b.Method, b.Trx, "", up); err != nil {
				return err
			}
		}
		if b.SMS {
			var st Student
			if t.get("student", e.StudentID, &st) == nil {
				m := Message{ID: newID("m"), StudentID: st.ID, To: st.Phone, Kind: "paid", At: a.today(), Time: a.clock(),
					Text: fill(Templates["paid"], c, st, fillArgs{Amount: b.Amount, Receipt: last.Receipt, Left: d.Total - b.Amount})}
				if err := a.enqueue(t, &m); err != nil {
					return err
				}
				c.SmsUsed += m.Parts
				up.add("message", m)
			}
		}
		up.add("centre", c)
		return t.saveCentre(c)
	})
	if err != nil {
		fail(w, err)
		return
	}
	writeJSON(w, 200, map[string]any{"up": up})
}

func (a *App) apiVoid(w http.ResponseWriter, r *http.Request, u User) {
	var b struct{ PaymentID, Why string }
	if err := readBody(r, &b); err != nil {
		fail(w, err)
		return
	}
	up := Up{}
	err := a.write(u.Centre, func(t Tx) error {
		var p Payment
		if err := t.get("payment", b.PaymentID, &p); err != nil {
			return missing("রসিদ পাওয়া যায়নি")
		}
		if p.Void != "" {
			return conflict("রসিদটি আগেই বাতিল হয়েছে")
		}
		if strings.TrimSpace(b.Why) == "" {
			return bad("কেন বাতিল করছেন লিখুন")
		}
		p.Void = strings.TrimSpace(b.Why)
		p.VoidBy = firstName(u.Name)
		up.add("payment", p)
		return t.put("payment", p.ID, p)
	})
	if err != nil {
		fail(w, err)
		return
	}
	writeJSON(w, 200, map[string]any{"up": up})
}

func (a *App) apiStudent(w http.ResponseWriter, r *http.Request, u User) {
	var b struct {
		Student  Student `json:"student"`
		BoardReg *string `json:"boardReg"`
	}
	if err := readBody(r, &b); err != nil {
		fail(w, err)
		return
	}
	up := Up{}
	err := a.write(u.Centre, func(t Tx) error {
		var old Student
		if err := t.get("student", b.Student.ID, &old); err != nil {
			return missing("ছাত্র/ছাত্রী পাওয়া যায়নি")
		}
		s := b.Student
		if err := checkStudent(&s); err != nil {
			return err
		}
		s.Roll, s.QR, s.Joined = old.Roll, old.QR, old.Joined
		up.add("student", s)
		if b.BoardReg != nil {
			es, _ := list[Enrollment](t, "enrollment")
			for _, e := range es {
				if e.StudentID == s.ID && e.Status != "dropped" {
					e.BoardReg = strings.TrimSpace(*b.BoardReg)
					t.put("enrollment", e.ID, e)
					up.add("enrollment", e)
				}
			}
		}
		return t.put("student", s.ID, s)
	})
	if err != nil {
		fail(w, err)
		return
	}
	writeJSON(w, 200, map[string]any{"up": up})
}

func (a *App) apiReissueCard(w http.ResponseWriter, r *http.Request, u User) {
	var b struct{ StudentID string }
	if err := readBody(r, &b); err != nil {
		fail(w, err)
		return
	}
	up := Up{}
	err := a.write(u.Centre, func(t Tx) error {
		var s Student
		if err := t.get("student", b.StudentID, &s); err != nil {
			return missing("ছাত্র/ছাত্রী পাওয়া যায়নি")
		}
		t.Exec(`DELETE FROM qr WHERE token=?`, s.QR)
		s.QR = token(6)
		if _, err := t.Exec(`INSERT INTO qr(token,centre,student) VALUES(?,?,?)`, s.QR, u.Centre, s.ID); err != nil {
			return err
		}
		up.add("student", s)
		return t.put("student", s.ID, s)
	})
	if err != nil {
		fail(w, err)
		return
	}
	writeJSON(w, 200, map[string]any{"up": up})
}

func (a *App) apiDrop(w http.ResponseWriter, r *http.Request, u User) {
	var b struct{ EnrollmentID, Note string }
	if err := readBody(r, &b); err != nil {
		fail(w, err)
		return
	}
	up := Up{}
	err := a.write(u.Centre, func(t Tx) error {
		var e Enrollment
		if err := t.get("enrollment", b.EnrollmentID, &e); err != nil {
			return missing("ভর্তির তথ্য পাওয়া যায়নি")
		}
		if strings.TrimSpace(b.Note) == "" {
			return bad("কেন ছেড়ে দিল লিখুন")
		}
		e.Status, e.DropNote = "dropped", strings.TrimSpace(b.Note)
		up.add("enrollment", e)
		return t.put("enrollment", e.ID, e)
	})
	if err != nil {
		fail(w, err)
		return
	}
	writeJSON(w, 200, map[string]any{"up": up})
}

func (a *App) apiSMS(w http.ResponseWriter, r *http.Request, u User) {
	var b struct {
		Items []struct {
			StudentID    string `json:"studentId"`
			EnrollmentID string `json:"enrollmentId"`
			Text         string `json:"text"`
			Kind         string `json:"kind"`
			Guardian     bool   `json:"guardian"`
		} `json:"items"`
	}
	if err := readBody(r, &b); err != nil {
		fail(w, err)
		return
	}
	if len(b.Items) == 0 || len(b.Items) > 500 {
		fail(w, bad("কাউকে বাছা হয়নি"))
		return
	}
	up := Up{}
	err := a.write(u.Centre, func(t Tx) error {
		c, err := t.centreData()
		if err != nil {
			return err
		}
		for _, it := range b.Items {
			text := strings.TrimSpace(it.Text)
			if text == "" || smsParts(text) > 3 {
				return bad("মেসেজ খালি বা অনেক লম্বা")
			}
			var st Student
			if err := t.get("student", it.StudentID, &st); err != nil {
				return missing("ছাত্র/ছাত্রী পাওয়া যায়নি")
			}
			to := st.Phone
			if it.Guardian {
				to = st.GuardianPhone
			}
			kind := it.Kind
			if kind == "" {
				kind = "manual"
			}
			if (kind == "due" || kind == "overdue") && it.EnrollmentID != "" && !it.Guardian {
				if _, err := t.once("rem|"+it.EnrollmentID+"|"+kind+"|"+a.today(), a.now().Unix()); err != nil {
					return err
				}
			}
			m := Message{ID: newID("m"), StudentID: st.ID, To: to, Kind: kind, Text: text, At: a.today(), Time: a.clock()}
			if err := a.enqueue(t, &m); err != nil {
				return err
			}
			c.SmsUsed += m.Parts
			up.add("message", m)
		}
		up.add("centre", c)
		return t.saveCentre(c)
	})
	if err != nil {
		fail(w, err)
		return
	}
	writeJSON(w, 200, map[string]any{"up": up})
}

func (a *App) apiCert(w http.ResponseWriter, r *http.Request, u User) {
	var b struct{ EnrollmentID, Grade string }
	if err := readBody(r, &b); err != nil {
		fail(w, err)
		return
	}
	grades := map[string]bool{"A+": true, "A": true, "A-": true, "B": true, "C": true}
	if !grades[b.Grade] {
		fail(w, bad("গ্রেড বাছুন"))
		return
	}
	up := Up{}
	err := a.write(u.Centre, func(t Tx) error {
		c, err := t.centreData()
		if err != nil {
			return err
		}
		var e Enrollment
		if err := t.get("enrollment", b.EnrollmentID, &e); err != nil {
			return missing("ভর্তির তথ্য পাওয়া যায়নি")
		}
		if e.Cert != nil {
			return conflict("এই কোর্সের সনদ আগেই দেওয়া হয়েছে")
		}
		var batch Batch
		t.get("batch", e.BatchID, &batch)
		if e.Status != "completed" && batch.End > a.today() {
			return conflict("কোর্স এখনও শেষ হয়নি")
		}
		pays, _ := list[Payment](t, "payment")
		if d := dueOf(e, pays, a.today()); d.Total > 0 {
			return conflict(fmt.Sprintf("৳%s বাকি আছে, বকেয়া থাকলে সনদ দেওয়া যায় না", money(d.Total)))
		}
		c.Seq.Cert++
		e.Cert = &Cert{No: fmt.Sprintf("%s-C-%04d", c.Prefix, c.Seq.Cert), At: a.today(), Grade: b.Grade}
		e.Status = "completed"
		if _, err := t.Exec(`INSERT INTO certs(no,centre,enrollment) VALUES(?,?,?)`, e.Cert.No, u.Centre, e.ID); err != nil {
			return conflict("সনদ নম্বর মেলেনি, আবার চেষ্টা করুন")
		}
		up.add("enrollment", e)
		up.add("centre", c)
		if err := t.saveCentre(c); err != nil {
			return err
		}
		return t.put("enrollment", e.ID, e)
	})
	if err != nil {
		fail(w, err)
		return
	}
	writeJSON(w, 200, map[string]any{"up": up})
}

func (a *App) apiVerify(w http.ResponseWriter, r *http.Request) {
	no := strings.ToUpper(strings.TrimSpace(r.PathValue("no")))
	if a.throttle("verify|"+clientIP(r), 60, 10*time.Minute) {
		fail(w, httpErr{429, "একটু পরে আবার চেষ্টা করুন"})
		return
	}
	var centre, eid string
	if err := a.db.QueryRow(`SELECT centre,enrollment FROM certs WHERE no=?`, no).Scan(&centre, &eid); err != nil {
		writeJSON(w, 404, map[string]any{"ok": false, "no": no})
		return
	}
	out := map[string]any{"ok": true, "no": no}
	a.read(centre, func(t Tx) error {
		c, _ := t.centreData()
		var e Enrollment
		var s Student
		var co Course
		var b Batch
		t.get("enrollment", eid, &e)
		t.get("student", e.StudentID, &s)
		t.get("course", e.CourseID, &co)
		t.get("batch", e.BatchID, &b)
		out["centre"] = map[string]string{"name": c.Name, "address": c.Address, "phone": c.Phone}
		out["name"], out["en"], out["course"], out["hours"], out["batch"] = s.Name, s.En, co.Name, co.Hours, b.Code
		if e.Cert != nil {
			out["grade"], out["at"] = e.Cert.Grade, e.Cert.At
		}
		return nil
	})
	writeJSON(w, 200, out)
}

func (a *App) apiEnquiry(w http.ResponseWriter, r *http.Request, u User) {
	var q Enquiry
	if err := readBody(r, &q); err != nil {
		fail(w, err)
		return
	}
	up := Up{}
	err := a.write(u.Centre, func(t Tx) error {
		if q.ID != "" {
			var old Enquiry
			if err := t.get("enquiry", q.ID, &old); err != nil {
				return missing("জিজ্ঞাসা পাওয়া যায়নি")
			}
			if q.Next != "" && parseDay(q.Next).IsZero() {
				return bad("তারিখ ঠিক নেই")
			}
			old.Next = q.Next
			if q.Status == "lost" || q.Status == "open" {
				old.Status = q.Status
			}
			up.add("enquiry", old)
			return t.put("enquiry", old.ID, old)
		}
		q.Name = strings.TrimSpace(q.Name)
		if q.Name == "" || !validPhone(q.Phone) {
			return bad("নাম আর ১১ সংখ্যার ফোন নম্বর দিন")
		}
		q.ID, q.Phone, q.At, q.Status = newID("q"), digits(q.Phone), a.today(), "open"
		up.add("enquiry", q)
		return t.put("enquiry", q.ID, q)
	})
	if err != nil {
		fail(w, err)
		return
	}
	writeJSON(w, 200, map[string]any{"up": up})
}

func (a *App) apiExpense(w http.ResponseWriter, r *http.Request, u User) {
	var x Expense
	if err := readBody(r, &x); err != nil {
		fail(w, err)
		return
	}
	x.Head = strings.TrimSpace(x.Head)
	if x.Head == "" || x.Amount < 1 || x.Amount > 10000000 {
		fail(w, bad("খরচের খাত আর টাকার পরিমাণ লিখুন"))
		return
	}
	if parseDay(x.At).IsZero() || x.At > a.today() {
		x.At = a.today()
	}
	x.ID, x.By = newID("x"), firstName(u.Name)
	err := a.write(u.Centre, func(t Tx) error { return t.put("expense", x.ID, x) })
	if err != nil {
		fail(w, err)
		return
	}
	writeJSON(w, 200, map[string]any{"up": Up{"expense": {x}}})
}

func (a *App) apiCourse(w http.ResponseWriter, r *http.Request, u User) {
	var c Course
	if err := readBody(r, &c); err != nil {
		fail(w, err)
		return
	}
	c.Name = strings.TrimSpace(c.Name)
	switch {
	case c.Name == "":
		fail(w, bad("কোর্সের নাম লিখুন"))
		return
	case c.Fee < 0 || c.Admission < 0 || c.BoardFee < 0:
		fail(w, bad("ফি ঠিক নেই"))
		return
	case c.Months < 1 || c.Months > 36:
		fail(w, bad("কোর্স কত মাসের লিখুন"))
		return
	}
	if c.Inst < 1 || c.Inst > 24 {
		c.Inst = c.Months
	}
	if c.Kind == "" {
		c.Kind = "নিজস্ব"
	}
	err := a.write(u.Centre, func(t Tx) error {
		if c.ID == "" {
			c.ID = newID("k")
		} else {
			var old Course
			if err := t.get("course", c.ID, &old); err != nil {
				return missing("কোর্স পাওয়া যায়নি")
			}
		}
		return t.put("course", c.ID, c)
	})
	if err != nil {
		fail(w, err)
		return
	}
	writeJSON(w, 200, map[string]any{"up": Up{"course": {c}}})
}

func (a *App) apiBatch(w http.ResponseWriter, r *http.Request, u User) {
	var b Batch
	if err := readBody(r, &b); err != nil {
		fail(w, err)
		return
	}
	b.Code = strings.TrimSpace(b.Code)
	b.Days = strings.Join(strings.Fields(b.Days), " ")
	err := a.write(u.Centre, func(t Tx) error {
		var c Course
		if t.get("course", b.CourseID, &c) != nil {
			return bad("কোর্স বাছুন")
		}
		switch {
		case b.Code == "":
			return bad("ব্যাচের কোড লিখুন, যেমন OA-২৭")
		case b.Days == "":
			return bad("কোন কোন দিন ক্লাস বাছুন")
		case !timeRe.MatchString(b.Time):
			return bad("ক্লাসের সময় দিন")
		case b.Seats < 1 || b.Seats > 200:
			return bad("কয়টা সিট লিখুন")
		case parseDay(b.Start).IsZero():
			return bad("শুরুর তারিখ দিন")
		}
		for _, d := range strings.Fields(b.Days) {
			ok := false
			for _, n := range dayNames {
				if n == d {
					ok = true
				}
			}
			if !ok {
				return bad("দিনের নাম ঠিক নেই")
			}
		}
		if parseDay(b.End).IsZero() || b.End < b.Start {
			b.End = addMonths(b.Start, c.Months)
		}
		if b.ID == "" {
			b.ID = newID("b")
		} else {
			var old Batch
			if err := t.get("batch", b.ID, &old); err != nil {
				return missing("ব্যাচ পাওয়া যায়নি")
			}
			es, _ := list[Enrollment](t, "enrollment")
			for _, e := range es {
				if e.BatchID == b.ID && e.Status == "running" && e.Seat > b.Seats {
					return conflict("সিট কমানো যাবে না, বেশি নম্বরের পিসিতে ছাত্র আছে")
				}
			}
		}
		return t.put("batch", b.ID, b)
	})
	if err != nil {
		fail(w, err)
		return
	}
	writeJSON(w, 200, map[string]any{"up": Up{"batch": {b}}})
}

func (a *App) apiTeacher(w http.ResponseWriter, r *http.Request, u User) {
	var x Teacher
	if err := readBody(r, &x); err != nil {
		fail(w, err)
		return
	}
	x.Name = strings.TrimSpace(x.Name)
	if x.Name == "" {
		fail(w, bad("শিক্ষকের নাম লিখুন"))
		return
	}
	if x.ID == "" {
		x.ID = newID("t")
	}
	if err := a.write(u.Centre, func(t Tx) error { return t.put("teacher", x.ID, x) }); err != nil {
		fail(w, err)
		return
	}
	writeJSON(w, 200, map[string]any{"up": Up{"teacher": {x}}})
}

func (a *App) apiSettings(w http.ResponseWriter, r *http.Request, u User) {
	var b struct {
		Centre    *Centre    `json:"centre"`
		Reminders *Reminders `json:"reminders"`
	}
	if err := readBody(r, &b); err != nil {
		fail(w, err)
		return
	}
	up := Up{}
	err := a.write(u.Centre, func(t Tx) error {
		c, err := t.centreData()
		if err != nil {
			return err
		}
		if b.Centre != nil {
			n := b.Centre
			if strings.TrimSpace(n.Name) == "" || strings.TrimSpace(n.Short) == "" {
				return bad("সেন্টারের নাম আর ছোট নাম লিখুন")
			}
			c.Name, c.Short, c.Address, c.Phone, c.Bteb = strings.TrimSpace(n.Name), strings.TrimSpace(n.Short), strings.TrimSpace(n.Address), strings.TrimSpace(n.Phone), strings.TrimSpace(n.Bteb)
			if p := strings.ToUpper(strings.TrimSpace(n.Prefix)); regexp.MustCompile(`^[A-Z]{1,4}$`).MatchString(p) {
				c.Prefix = p
			}
			if n.Opening >= 0 {
				c.Opening = n.Opening
			}
		}
		if b.Reminders != nil {
			rm := *b.Reminders
			if rm.Before < 0 || rm.Before > 30 || rm.After < 1 || rm.After > 30 || rm.Repeat < 0 || rm.Repeat > 30 {
				return bad("রিমাইন্ডারের দিন ঠিক নেই")
			}
			c.Reminders = rm
		}
		up.add("centre", c)
		return t.saveCentre(c)
	})
	if err != nil {
		fail(w, err)
		return
	}
	writeJSON(w, 200, map[string]any{"up": up})
}

func (a *App) apiStaff(w http.ResponseWriter, r *http.Request, u User) {
	var b struct {
		ID       string `json:"id"`
		Phone    string `json:"phone"`
		Name     string `json:"name"`
		Role     string `json:"role"`
		Password string `json:"password"`
		Active   *bool  `json:"active"`
	}
	if err := readBody(r, &b); err != nil {
		fail(w, err)
		return
	}
	if b.ID != "" && b.Password != "" {
		if len(b.Password) < 6 {
			fail(w, bad("পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের দিন"))
			return
		}
		h, _ := hashPw(b.Password)
		a.mu.Lock()
		res, _ := a.db.Exec(`UPDATE users SET pw=? WHERE id=? AND centre=?`, h, b.ID, u.Centre)
		if b.ID != u.ID {
			a.db.Exec(`DELETE FROM sessions WHERE user=?`, b.ID)
		}
		a.mu.Unlock()
		if n, _ := res.RowsAffected(); n == 0 {
			fail(w, missing("পাওয়া যায়নি"))
			return
		}
		writeJSON(w, 200, map[string]bool{"ok": true})
		return
	}
	if b.ID != "" {
		if b.ID == u.ID {
			fail(w, bad("নিজের অ্যাকাউন্ট বন্ধ করা যায় না"))
			return
		}
		act := 0
		if b.Active != nil && *b.Active {
			act = 1
		}
		a.mu.Lock()
		res, _ := a.db.Exec(`UPDATE users SET active=? WHERE id=? AND centre=?`, act, b.ID, u.Centre)
		if act == 0 {
			a.db.Exec(`DELETE FROM sessions WHERE user=?`, b.ID)
		}
		a.mu.Unlock()
		if n, _ := res.RowsAffected(); n == 0 {
			fail(w, missing("পাওয়া যায়নি"))
			return
		}
		writeJSON(w, 200, map[string]bool{"ok": true})
		return
	}
	if b.Role != "desk" && b.Role != "teacher" && b.Role != "owner" {
		fail(w, bad("কাজ বাছুন"))
		return
	}
	if strings.TrimSpace(b.Name) == "" || !validPhone(b.Phone) || len(b.Password) < 6 {
		fail(w, bad("নাম, ১১ সংখ্যার মোবাইল আর কমপক্ষে ৬ অক্ষরের পাসওয়ার্ড দিন"))
		return
	}
	h, _ := hashPw(b.Password)
	id := newID("u")
	a.mu.Lock()
	_, err := a.db.Exec(`INSERT INTO users(id,centre,phone,name,role,pw) VALUES(?,?,?,?,?,?)`, id, u.Centre, digits(b.Phone), strings.TrimSpace(b.Name), b.Role, h)
	a.mu.Unlock()
	if err != nil {
		fail(w, conflict("এই নম্বরে আগেই একটা অ্যাকাউন্ট আছে"))
		return
	}
	writeJSON(w, 200, map[string]any{"user": User{ID: id, Centre: u.Centre, Phone: digits(b.Phone), Name: strings.TrimSpace(b.Name), Role: b.Role, Active: true}})
}

func atoi(s string) int { n, _ := strconv.Atoi(s); return n }
