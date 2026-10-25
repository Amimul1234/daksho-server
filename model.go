package main

import (
	"sort"
	"strconv"
	"strings"
	"time"
)

const day = "2006-01-02"
const admissionLabel = "ভর্তি ফি"

var dhaka = time.FixedZone("BDT", 6*3600)

type Reminders struct {
	Before int  `json:"before"`
	OnDay  bool `json:"onDay"`
	After  int  `json:"after"`
	Repeat int  `json:"repeat"`
	Quiet  bool `json:"quiet"`
}

type Seq struct {
	Roll    int `json:"roll"`
	Receipt int `json:"receipt"`
	Cert    int `json:"cert"`
}

type Centre struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	Short     string    `json:"short"`
	Address   string    `json:"address"`
	Phone     string    `json:"phone"`
	Bteb      string    `json:"bteb"`
	Prefix    string    `json:"prefix"`
	Sender    string    `json:"sender"`
	SmsRate   float64   `json:"smsRate"`
	SmsUsed   int       `json:"smsUsed"`
	Opening   int       `json:"opening"`
	Reminders Reminders `json:"reminders"`
	Seq       Seq       `json:"seq"`
}

type Course struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	En        string `json:"en"`
	Months    int    `json:"months"`
	Hours     int    `json:"hours"`
	Fee       int    `json:"fee"`
	Admission int    `json:"admission"`
	Kind      string `json:"kind"`
	Inst      int    `json:"inst"`
	BoardFee  int    `json:"boardFee,omitempty"`
}

type Batch struct {
	ID       string `json:"id"`
	CourseID string `json:"courseId"`
	Code     string `json:"code"`
	Days     string `json:"days"`
	Time     string `json:"time"`
	Teacher  string `json:"teacher"`
	Seats    int    `json:"seats"`
	Start    string `json:"start"`
	End      string `json:"end"`
	Lab      string `json:"lab"`
}

type Teacher struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	Subject string `json:"subject"`
}

type Student struct {
	ID            string `json:"id"`
	Roll          string `json:"roll"`
	Name          string `json:"name"`
	En            string `json:"en"`
	Gender        string `json:"gender"`
	Father        string `json:"father"`
	Mother        string `json:"mother"`
	Dob           string `json:"dob"`
	Phone         string `json:"phone"`
	GuardianPhone string `json:"guardianPhone"`
	GuardianRel   string `json:"guardianRel"`
	Address       string `json:"address"`
	IDType        string `json:"idType"`
	IDNo          string `json:"idNo"`
	Education     string `json:"education"`
	Institution   string `json:"institution"`
	Source        string `json:"source"`
	Blood         string `json:"blood"`
	Joined        string `json:"joined"`
	Note          string `json:"note"`
	QR            string `json:"qr"`
}

type Inst struct {
	N      int    `json:"n"`
	Amount int    `json:"amount"`
	Due    string `json:"due"`
	Label  string `json:"label,omitempty"`
}

type Cert struct {
	No    string `json:"no"`
	At    string `json:"at"`
	Grade string `json:"grade"`
}

type Enrollment struct {
	ID             string `json:"id"`
	StudentID      string `json:"studentId"`
	BatchID        string `json:"batchId"`
	CourseID       string `json:"courseId"`
	Seat           int    `json:"seat"`
	Fee            int    `json:"fee"`
	Admission      int    `json:"admission"`
	Discount       int    `json:"discount"`
	DiscountReason string `json:"discountReason"`
	Plan           []Inst `json:"plan"`
	Status         string `json:"status"`
	Joined         string `json:"joined"`
	BoardReg       string `json:"boardReg"`
	Cert           *Cert  `json:"cert"`
	DropNote       string `json:"dropNote,omitempty"`
}

type Payment struct {
	ID           string `json:"id"`
	Receipt      string `json:"receipt"`
	StudentID    string `json:"studentId"`
	EnrollmentID string `json:"enrollmentId"`
	Amount       int    `json:"amount"`
	At           string `json:"at"`
	Time         string `json:"time"`
	Method       string `json:"method"`
	Trx          string `json:"trx"`
	Label        string `json:"label"`
	By           string `json:"by"`
	Note         string `json:"note"`
	Void         string `json:"void,omitempty"`
	VoidBy       string `json:"voidBy,omitempty"`
}

type Doc struct {
	ID        string `json:"id"`
	StudentID string `json:"studentId"`
	Kind      string `json:"kind"`
	Name      string `json:"name"`
	Type      string `json:"type"`
	Size      int64  `json:"size"`
	At        string `json:"at"`
}

type Message struct {
	ID        string `json:"id"`
	StudentID string `json:"studentId"`
	To        string `json:"to"`
	Kind      string `json:"kind"`
	Text      string `json:"text"`
	At        string `json:"at"`
	Time      string `json:"time"`
	Status    string `json:"status"`
	Parts     int    `json:"parts"`
}

type Enquiry struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	Phone    string `json:"phone"`
	CourseID string `json:"courseId"`
	At       string `json:"at"`
	Next     string `json:"next"`
	Note     string `json:"note"`
	Source   string `json:"source"`
	Status   string `json:"status"`
}

type Expense struct {
	ID     string `json:"id"`
	Head   string `json:"head"`
	Amount int    `json:"amount"`
	At     string `json:"at"`
	Note   string `json:"note"`
	By     string `json:"by"`
}

type Scan struct {
	Student string `json:"s"`
	Time    string `json:"t"`
	Via     string `json:"v"`
}

type Att struct {
	ID       string   `json:"id"`
	BatchID  string   `json:"batchId"`
	Date     string   `json:"date"`
	Present  []Scan   `json:"present"`
	Absent   []string `json:"absent"`
	Closed   bool     `json:"closed"`
	ClosedBy string   `json:"closedBy,omitempty"`
	ClosedAt string   `json:"closedAt,omitempty"`
	Notified bool     `json:"notified"`
}

func (a *Att) has(sid string) bool {
	for _, p := range a.Present {
		if p.Student == sid {
			return true
		}
	}
	return false
}

type DueRow struct {
	Inst
	Covered int    `json:"covered"`
	Rem     int    `json:"rem"`
	St      string `json:"st"`
	DD      int    `json:"dd"`
}

type Due struct {
	Rows         []DueRow
	Paid         int
	Net          int
	Total        int
	Overdue      int
	LateDays     int
	AdmissionDue int
	Next         *DueRow
	Oldest       *DueRow
}

func parseDay(s string) time.Time {
	t, err := time.ParseInLocation(day, s, dhaka)
	if err != nil {
		return time.Time{}
	}
	return t
}

func daysBetween(from, to string) int {
	return int(parseDay(to).Sub(parseDay(from)).Hours() / 24)
}

func addDays(s string, n int) string { return parseDay(s).AddDate(0, 0, n).Format(day) }

func addMonths(s string, n int) string {
	t := parseDay(s)
	d := t.Day()
	first := time.Date(t.Year(), t.Month(), 1, 0, 0, 0, 0, dhaka).AddDate(0, n, 0)
	last := first.AddDate(0, 1, -1).Day()
	if d > last {
		d = last
	}
	return time.Date(first.Year(), first.Month(), d, 0, 0, 0, 0, dhaka).Format(day)
}

func dueOf(e Enrollment, pays []Payment, today string) Due {
	paid, adm := 0, 0
	for _, p := range pays {
		if p.EnrollmentID != e.ID || p.Void != "" {
			continue
		}
		if p.Label == admissionLabel {
			adm += p.Amount
		} else {
			paid += p.Amount
		}
	}
	left := paid
	d := Due{Paid: paid, Net: e.Fee - e.Discount}
	for _, in := range e.Plan {
		cov := in.Amount
		if left < cov {
			cov = left
		}
		if cov < 0 {
			cov = 0
		}
		left -= cov
		r := DueRow{Inst: in, Covered: cov, Rem: in.Amount - cov, DD: daysBetween(today, in.Due)}
		switch {
		case r.Rem == 0:
			r.St = "paid"
		case r.DD < 0:
			r.St = "late"
		case r.DD <= 3:
			r.St = "soon"
		default:
			r.St = "later"
		}
		d.Rows = append(d.Rows, r)
	}
	for i := range d.Rows {
		r := &d.Rows[i]
		if r.St == "late" {
			d.Overdue += r.Rem
			if d.Oldest == nil {
				d.Oldest = r
			}
		}
		if r.Rem > 0 && d.Next == nil {
			d.Next = r
		}
	}
	if d.Oldest != nil {
		d.LateDays = -d.Oldest.DD
	}
	d.AdmissionDue = e.Admission - adm
	if d.AdmissionDue < 0 {
		d.AdmissionDue = 0
	}
	d.Total = d.Net - paid + d.AdmissionDue
	d.Overdue += d.AdmissionDue
	if e.Status == "dropped" {
		d.Total, d.Overdue = 0, 0
	}
	return d
}

var bnDigits = []rune("০১২৩৪৫৬৭৮৯")

func bn(s string) string {
	var b strings.Builder
	for _, r := range s {
		if r >= '0' && r <= '9' {
			b.WriteRune(bnDigits[r-'0'])
		} else {
			b.WriteRune(r)
		}
	}
	return b.String()
}

func money(n int) string {
	neg := n < 0
	if neg {
		n = -n
	}
	s := strconv.Itoa(n)
	if len(s) > 3 {
		head, tail := s[:len(s)-3], s[len(s)-3:]
		var parts []string
		for len(head) > 2 {
			parts = append([]string{head[len(head)-2:]}, parts...)
			head = head[:len(head)-2]
		}
		if head != "" {
			parts = append([]string{head}, parts...)
		}
		s = strings.Join(parts, ",") + "," + tail
	}
	if neg {
		s = "-" + s
	}
	return bn(s)
}

var monthsShort = []string{"জানু", "ফেব্রু", "মার্চ", "এপ্রি", "মে", "জুন", "জুলা", "আগ", "সেপ্টে", "অক্টো", "নভে", "ডিসে"}

func dateShort(s string) string {
	t := parseDay(s)
	if t.IsZero() {
		return s
	}
	return bn(strconv.Itoa(t.Day())) + " " + monthsShort[t.Month()-1]
}

var Templates = map[string]string{
	"due":       "{নাম}, {টাকা} টাকার কিস্তি {তারিখ} দেয়। -{সেন্টার}",
	"overdue":   "{নাম}, {টাকা} টাকা বকেয়া। দয়া করে জমা দিন। -{সেন্টার}",
	"absent":    "{নাম} আজ ক্লাসে আসেনি। -{সেন্টার}",
	"admission": "{নাম}, ভর্তি সম্পন্ন। রোল {রোল}। স্বাগতম! -{সেন্টার}",
	"paid":      "{টাকা} টাকা পেয়েছি, রসিদ {রসিদ}। বাকি {বাকি}। -{সেন্টার}",
}

type fillArgs struct {
	Amount  int
	Date    string
	Receipt string
	Left    int
	Course  string
}

func fill(tpl string, c Centre, st Student, a fillArgs) string {
	first := strings.Fields(st.Name)
	name := st.Name
	if len(first) > 0 {
		name = first[0]
	}
	r := strings.NewReplacer(
		"{নাম}", name,
		"{টাকা}", money(a.Amount),
		"{তারিখ}", dateShort(a.Date),
		"{রোল}", st.Roll,
		"{রসিদ}", a.Receipt,
		"{বাকি}", money(a.Left),
		"{কোর্স}", a.Course,
		"{সেন্টার}", c.Short,
	)
	return r.Replace(tpl)
}

func smsParts(text string) int {
	n := len([]rune(text))
	if n == 0 {
		return 0
	}
	uni := false
	for _, r := range text {
		if r > 127 {
			uni = true
			break
		}
	}
	single, multi := 160, 153
	if uni {
		single, multi = 70, 67
	}
	if n <= single {
		return 1
	}
	return (n + multi - 1) / multi
}

var dayNames = []string{"রবি", "সোম", "মঙ্গল", "বুধ", "বৃহঃ", "শুক্র", "শনি"}

func meetsOn(b Batch, date string) bool {
	t := parseDay(date)
	if t.IsZero() || date < b.Start || date > b.End {
		return false
	}
	want := dayNames[t.Weekday()]
	for _, d := range strings.Fields(b.Days) {
		if d == want {
			return true
		}
	}
	return false
}

func isDemoNumber(p string) bool {
	d := digits(p)
	return strings.HasPrefix(d, "010") || strings.HasPrefix(d, "011")
}

func digits(s string) string {
	var b strings.Builder
	for _, r := range s {
		if r >= '0' && r <= '9' {
			b.WriteRune(r)
		} else if r >= '০' && r <= '৯' {
			b.WriteRune('0' + (r - '০'))
		}
	}
	return b.String()
}

func validPhone(p string) bool {
	d := digits(p)
	return len(d) == 11 && strings.HasPrefix(d, "01")
}

func sortPays(p []Payment) {
	sort.Slice(p, func(i, j int) bool { return p[i].Receipt < p[j].Receipt })
}
