package main

import (
	"html/template"
	"time"
	"net/http"
	"regexp"
	"sort"
	"strings"
)

var qrTokenRe = regexp.MustCompile(`([0-9a-f]{12})\s*$`)

func cleanCode(s string) string {
	s = strings.ToLower(strings.TrimSpace(s))
	if m := qrTokenRe.FindStringSubmatch(strings.TrimRight(s, "/")); m != nil {
		return m[1]
	}
	return ""
}

func enrolledOn(es []Enrollment, batchID, date string) []string {
	var ids []string
	for _, e := range es {
		if e.BatchID == batchID && e.Status != "dropped" && e.Joined <= date {
			ids = append(ids, e.StudentID)
		}
	}
	sort.Strings(ids)
	return ids
}

func minutes(hhmm string) int {
	if len(hhmm) < 5 {
		return 0
	}
	return atoi(hhmm[:2])*60 + atoi(hhmm[3:5])
}

type scanResult struct {
	Status   string   `json:"status"`
	Student  *Student `json:"student,omitempty"`
	Batch    *Batch   `json:"batch,omitempty"`
	Options  []Batch  `json:"options,omitempty"`
	Late     bool     `json:"late"`
	Overdue  int      `json:"overdue,omitempty"`
	Notified bool     `json:"notified"`
	Count    int      `json:"count"`
	Total    int      `json:"total"`
	Att      *Att     `json:"att,omitempty"`
}

func (a *App) apiScan(w http.ResponseWriter, r *http.Request, u User) {
	var b struct {
		Code      string `json:"code"`
		StudentID string `json:"studentId"`
		BatchID   string `json:"batchId"`
		Force     bool   `json:"force"`
		At        int64  `json:"at"`
	}
	if err := readBody(r, &b); err != nil {
		fail(w, err)
		return
	}
	var res scanResult
	err := a.write(u.Centre, func(t Tx) error {
		sid := b.StudentID
		if sid == "" {
			tok := cleanCode(b.Code)
			if tok == "" || t.QueryRow(`SELECT student FROM qr WHERE token=? AND centre=?`, tok, u.Centre).Scan(&sid) != nil {
				res.Status = "unknown"
				return nil
			}
		}
		var st Student
		if err := t.get("student", sid, &st); err != nil {
			res.Status = "unknown"
			return nil
		}
		res.Student = &st
		es, err := list[Enrollment](t, "enrollment")
		if err != nil {
			return err
		}
		today, when := a.today(), a.now()
		if b.At > 0 {
			if t0 := time.UnixMilli(b.At); !t0.After(when) && t0.In(dhaka).Format(day) == today {
				when = t0
			}
		}
		clock := when.In(dhaka).Format("15:04")
		now := minutes(clock)
		var mine []Batch
		for _, e := range es {
			if e.StudentID != sid || e.Status == "dropped" {
				continue
			}
			var bt Batch
			if t.get("batch", e.BatchID, &bt) == nil {
				mine = append(mine, bt)
			}
		}
		if len(mine) == 0 {
			res.Status = "no_course"
			return nil
		}
		var pick *Batch
		if b.BatchID != "" {
			for i := range mine {
				if mine[i].ID == b.BatchID {
					pick = &mine[i]
				}
			}
			if pick == nil {
				res.Status = "wrong_batch"
				res.Options = mine
				return nil
			}
			if !meetsOn(*pick, today) && !b.Force {
				res.Status = "not_today"
				res.Batch = pick
				return nil
			}
		} else {
			best := 1 << 30
			for i := range mine {
				if !meetsOn(mine[i], today) {
					continue
				}
				d := now - minutes(mine[i].Time)
				if d < 0 {
					d = -d
				}
				if d < best {
					best, pick = d, &mine[i]
				}
			}
			if pick == nil {
				if b.Force && len(mine) == 1 {
					pick = &mine[0]
				} else {
					res.Status = "not_today"
					res.Options = mine
					if len(mine) == 1 {
						res.Batch = &mine[0]
					}
					return nil
				}
			}
		}
		res.Batch = pick
		key := pick.ID + "|" + today
		var at Att
		if t.get("att", key, &at) != nil {
			at = Att{ID: key, BatchID: pick.ID, Date: today, Present: []Scan{}, Absent: []string{}}
		}
		enrolled := enrolledOn(es, pick.ID, today)
		res.Total = len(enrolled)
		res.Notified = at.Notified
		if at.has(sid) {
			res.Status = "already"
		} else {
			via := "qr"
			if b.StudentID != "" {
				via = "manual"
			}
			at.Present = append(at.Present, Scan{Student: sid, Time: clock, Via: via})
			var keep []string
			for _, x := range at.Absent {
				if x != sid {
					keep = append(keep, x)
				}
			}
			if keep == nil {
				keep = []string{}
			}
			at.Absent = keep
			res.Status = "ok"
			res.Late = now > minutes(pick.Time)+15
			if err := t.put("att", key, at); err != nil {
				return err
			}
		}
		res.Count = len(at.Present)
		res.Att = &at
		if u.Role != "teacher" {
			pays, _ := list[Payment](t, "payment")
			for _, e := range es {
				if e.StudentID == sid {
					res.Overdue += dueOf(e, pays, today).Overdue
				}
			}
		}
		return nil
	})
	if err != nil {
		fail(w, err)
		return
	}
	writeJSON(w, 200, res)
}

func (a *App) apiAttClose(w http.ResponseWriter, r *http.Request, u User) {
	var b struct {
		BatchID string   `json:"batchId"`
		Absent  []string `json:"absent"`
		Manual  bool     `json:"manual"`
		SMS     bool     `json:"sms"`
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
		var bt Batch
		if t.get("batch", b.BatchID, &bt) != nil {
			return missing("ব্যাচ পাওয়া যায়নি")
		}
		today := a.today()
		key := bt.ID + "|" + today
		var at Att
		if t.get("att", key, &at) != nil {
			at = Att{ID: key, BatchID: bt.ID, Date: today, Present: []Scan{}}
		}
		es, err := list[Enrollment](t, "enrollment")
		if err != nil {
			return err
		}
		enrolled := enrolledOn(es, bt.ID, today)
		if !meetsOn(bt, today) && len(at.Present) == 0 {
			return conflict("আজ এই ব্যাচের ক্লাস নেই, হাজিরা শেষ করা যাবে না")
		}
		if b.Manual {
			absent := map[string]bool{}
			for _, x := range b.Absent {
				absent[x] = true
			}
			kept := []Scan{}
			for _, p := range at.Present {
				if !absent[p.Student] {
					kept = append(kept, p)
				}
			}
			at.Present = kept
			for _, sid := range enrolled {
				if !absent[sid] && !at.has(sid) {
					at.Present = append(at.Present, Scan{Student: sid, Time: a.clock(), Via: "manual"})
				}
			}
		}
		at.Absent = []string{}
		for _, sid := range enrolled {
			if !at.has(sid) {
				at.Absent = append(at.Absent, sid)
			}
		}
		at.Closed, at.ClosedBy, at.ClosedAt = true, firstName(u.Name), a.clock()
		if b.SMS && !at.Notified {
			for _, sid := range at.Absent {
				var st Student
				if t.get("student", sid, &st) != nil {
					continue
				}
				first, err := t.once("absent|"+sid+"|"+key, a.now().Unix())
				if err != nil {
					return err
				}
				if !first {
					continue
				}
				m := Message{ID: newID("m"), StudentID: sid, To: st.GuardianPhone, Kind: "absent", Text: fill(Templates["absent"], c, st, fillArgs{}), At: today, Time: a.clock()}
				if err := a.enqueue(t, &m); err != nil {
					return err
				}
				c.SmsUsed += m.Parts
				up.add("message", m)
			}
			at.Notified = true
			up.add("centre", c)
			if err := t.saveCentre(c); err != nil {
				return err
			}
		}
		up.add("att", at)
		return t.put("att", key, at)
	})
	if err != nil {
		fail(w, err)
		return
	}
	writeJSON(w, 200, map[string]any{"up": up})
}

var cardPage = template.Must(template.New("q").Parse(`<!doctype html><html lang="bn"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>দক্ষ · আইডি কার্ড</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#F0F2F5;font-family:'Noto Sans Bengali',system-ui,sans-serif;color:#111826;padding:24px}main{max-width:380px;background:#fff;border:1px solid #E1E4EA;border-radius:18px;padding:28px 24px;text-align:center}b{display:block;font-size:20px;margin:10px 0 6px}p{color:#465063;line-height:1.6;margin:0}</style></head>
<body><main><svg width="48" height="48" viewBox="0 0 34 34"><rect width="34" height="34" rx="9" fill="#1D4ED8"/><path d="M9 11.5h9.5a5.5 5.5 0 0 1 0 11H9z" fill="none" stroke="#fff" stroke-width="2.4" stroke-linejoin="round"/><path d="M9 17h7" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/><circle cx="25.5" cy="10" r="2.6" fill="#E0B44E"/></svg>
<b>{{if .}}{{.}}{{else}}দক্ষ{{end}}</b><p>{{if .}}এটি এই সেন্টারের একজন শিক্ষার্থীর আইডি কার্ড। হাজিরার জন্য সেন্টারের স্ক্যানারে দেখান। কার্ড পেলে সেন্টারে ফেরত দিন।{{else}}এই কার্ডটি আর চালু নেই।{{end}}</p></main></body></html>`))

func (a *App) cardLanding(w http.ResponseWriter, r *http.Request) {
	tok := cleanCode(r.PathValue("tok"))
	name := ""
	var centre string
	if tok != "" && a.db.QueryRow(`SELECT centre FROM qr WHERE token=?`, tok).Scan(&centre) == nil {
		a.read(centre, func(t Tx) error {
			c, err := t.centreData()
			name = c.Name
			return err
		})
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	cardPage.Execute(w, name)
}
