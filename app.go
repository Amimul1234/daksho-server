package main

import (
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"sync"
	"time"

	"golang.org/x/crypto/bcrypt"
)

type App struct {
	db     *sql.DB
	mu     sync.Mutex
	sms    Sender
	data   string
	web    string
	secure bool
	now    func() time.Time
	hits   map[string][]time.Time
	hitsMu sync.Mutex
}

type User struct {
	ID     string `json:"id"`
	Centre string `json:"centre"`
	Phone  string `json:"phone"`
	Name   string `json:"name"`
	Role   string `json:"role"`
	Active bool   `json:"active"`
}

type httpErr struct {
	code int
	msg  string
}

func (e httpErr) Error() string { return e.msg }

func bad(msg string) error       { return httpErr{400, msg} }
func forbidden(msg string) error { return httpErr{403, msg} }
func conflict(msg string) error  { return httpErr{409, msg} }
func missing(msg string) error   { return httpErr{404, msg} }

func (a *App) today() string { return a.now().In(dhaka).Format(day) }
func (a *App) clock() string { return a.now().In(dhaka).Format("15:04") }

func (a *App) read(centre string, fn func(Tx) error) error {
	tx, err := a.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	return fn(Tx{tx, centre})
}

func (a *App) write(centre string, fn func(Tx) error) error {
	a.mu.Lock()
	defer a.mu.Unlock()
	tx, err := a.db.Begin()
	if err != nil {
		return err
	}
	if err := fn(Tx{tx, centre}); err != nil {
		tx.Rollback()
		return err
	}
	return tx.Commit()
}

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(v)
}

func fail(w http.ResponseWriter, err error) {
	var he httpErr
	if errors.As(err, &he) {
		writeJSON(w, he.code, map[string]string{"error": he.msg})
		return
	}
	if errors.Is(err, ErrNotFound) {
		writeJSON(w, 404, map[string]string{"error": "পাওয়া যায়নি"})
		return
	}
	writeJSON(w, 500, map[string]string{"error": "সার্ভারে সমস্যা হয়েছে, আবার চেষ্টা করুন"})
}

func readBody(r *http.Request, v any) error {
	r.Body = http.MaxBytesReader(nil, r.Body, 1<<20)
	if err := json.NewDecoder(r.Body).Decode(v); err != nil {
		return bad("তথ্য ঠিকমতো আসেনি")
	}
	return nil
}

type Up map[string][]any

func (u Up) add(kind string, v any) { u[kind] = append(u[kind], v) }

func (a *App) userFor(r *http.Request) (User, bool) {
	c, err := r.Cookie("dk_s")
	if err != nil || len(c.Value) < 20 {
		return User{}, false
	}
	var u User
	var created int64
	var active int
	err = a.db.QueryRow(`SELECT u.id,u.centre,u.phone,u.name,u.role,u.active,s.created FROM sessions s JOIN users u ON u.id=s.user WHERE s.token=?`, c.Value).
		Scan(&u.ID, &u.Centre, &u.Phone, &u.Name, &u.Role, &active, &created)
	if err != nil || active != 1 {
		return User{}, false
	}
	if a.now().Unix()-created > 60*86400 {
		return User{}, false
	}
	u.Active = true
	return u, true
}

func (a *App) auth(roles string, fn func(http.ResponseWriter, *http.Request, User)) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		u, ok := a.userFor(r)
		if !ok {
			writeJSON(w, 401, map[string]string{"error": "আবার লগইন করুন"})
			return
		}
		if r.Method == http.MethodPost && r.Header.Get("X-Daksho") != "1" {
			writeJSON(w, 403, map[string]string{"error": "অনুরোধটি গ্রহণ করা যায়নি"})
			return
		}
		if roles != "" && !strings.Contains(roles, u.Role) {
			writeJSON(w, 403, map[string]string{"error": roleMsg(roles)})
			return
		}
		fn(w, r, u)
	}
}

func roleMsg(roles string) string {
	if roles == "owner" {
		return "এই কাজটি শুধু মালিক করতে পারেন"
	}
	return "এই কাজটি আপনার জন্য খোলা নেই"
}

func (a *App) throttle(key string, max int, per time.Duration) bool {
	a.hitsMu.Lock()
	defer a.hitsMu.Unlock()
	now := a.now()
	var keep []time.Time
	for _, t := range a.hits[key] {
		if now.Sub(t) < per {
			keep = append(keep, t)
		}
	}
	if len(keep) >= max {
		a.hits[key] = keep
		return true
	}
	a.hits[key] = append(keep, now)
	return false
}

func clientIP(r *http.Request) string {
	if f := r.Header.Get("X-Forwarded-For"); f != "" {
		return strings.TrimSpace(strings.Split(f, ",")[0])
	}
	h := r.RemoteAddr
	if i := strings.LastIndex(h, ":"); i > 0 {
		h = h[:i]
	}
	return h
}

func (a *App) apiLogin(w http.ResponseWriter, r *http.Request) {
	var b struct{ Phone, Password string }
	if err := readBody(r, &b); err != nil {
		fail(w, err)
		return
	}
	if a.throttle("login|"+clientIP(r), 10, 10*time.Minute) {
		fail(w, httpErr{429, "অনেকবার চেষ্টা হয়েছে, ১০ মিনিট পর আবার চেষ্টা করুন"})
		return
	}
	var id, hash string
	var active int
	err := a.db.QueryRow(`SELECT id,pw,active FROM users WHERE phone=?`, digits(b.Phone)).Scan(&id, &hash, &active)
	if err != nil || active != 1 || bcrypt.CompareHashAndPassword([]byte(hash), []byte(b.Password)) != nil {
		fail(w, httpErr{401, "মোবাইল নম্বর বা পাসওয়ার্ড মেলেনি"})
		return
	}
	t := token(24)
	if _, err := a.db.Exec(`INSERT INTO sessions(token,user,created) VALUES(?,?,?)`, t, id, a.now().Unix()); err != nil {
		fail(w, err)
		return
	}
	http.SetCookie(w, &http.Cookie{Name: "dk_s", Value: t, Path: "/app/", HttpOnly: true, Secure: a.secure, SameSite: http.SameSiteLaxMode, MaxAge: 60 * 86400})
	writeJSON(w, 200, map[string]bool{"ok": true})
}

func (a *App) apiLogout(w http.ResponseWriter, r *http.Request, u User) {
	if c, err := r.Cookie("dk_s"); err == nil {
		a.db.Exec(`DELETE FROM sessions WHERE token=?`, c.Value)
	}
	http.SetCookie(w, &http.Cookie{Name: "dk_s", Value: "", Path: "/app/", MaxAge: -1, HttpOnly: true, Secure: a.secure})
	writeJSON(w, 200, map[string]bool{"ok": true})
}

func (a *App) apiPassword(w http.ResponseWriter, r *http.Request, u User) {
	var b struct{ Old, New string }
	if err := readBody(r, &b); err != nil {
		fail(w, err)
		return
	}
	if len(b.New) < 6 {
		fail(w, bad("নতুন পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের দিন"))
		return
	}
	var hash string
	a.db.QueryRow(`SELECT pw FROM users WHERE id=?`, u.ID).Scan(&hash)
	if bcrypt.CompareHashAndPassword([]byte(hash), []byte(b.Old)) != nil {
		fail(w, bad("পুরনো পাসওয়ার্ড মেলেনি"))
		return
	}
	h, _ := bcrypt.GenerateFromPassword([]byte(b.New), bcrypt.DefaultCost)
	a.mu.Lock()
	a.db.Exec(`UPDATE users SET pw=? WHERE id=?`, string(h), u.ID)
	a.mu.Unlock()
	writeJSON(w, 200, map[string]bool{"ok": true})
}

func (a *App) createCentre(name, short, phone, ownerName, password string) (string, error) {
	if !validPhone(phone) || len(password) < 6 || strings.TrimSpace(name) == "" {
		return "", errors.New("need a name, an 11-digit phone and a password of 6+ characters")
	}
	if short == "" {
		short = strings.Fields(name)[0]
	}
	id := newID("c")
	c := Centre{ID: id, Name: name, Short: short, Phone: digits(phone), Prefix: "DK", SmsRate: 0.35, Reminders: Reminders{Before: 3, OnDay: true, After: 3, Repeat: 7, Quiet: true}}
	b, _ := json.Marshal(c)
	h, _ := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	a.mu.Lock()
	defer a.mu.Unlock()
	tx, err := a.db.Begin()
	if err != nil {
		return "", err
	}
	defer tx.Rollback()
	if _, err := tx.Exec(`INSERT INTO centres(id,created,data) VALUES(?,?,?)`, id, a.now().Unix(), string(b)); err != nil {
		return "", err
	}
	if _, err := tx.Exec(`INSERT INTO users(id,centre,phone,name,role,pw) VALUES(?,?,?,?,?,?)`, newID("u"), id, digits(phone), ownerName, "owner", string(h)); err != nil {
		return "", errors.New("this phone already has an account")
	}
	return id, tx.Commit()
}
