package main

import (
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"

	_ "modernc.org/sqlite"
)

var ErrNotFound = errors.New("not found")

const schema = `
CREATE TABLE IF NOT EXISTS centres(
  id TEXT PRIMARY KEY,
  created INTEGER NOT NULL,
  data TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS users(
  id TEXT PRIMARY KEY,
  centre TEXT NOT NULL,
  phone TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  pw TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS sessions(
  token TEXT PRIMARY KEY,
  user TEXT NOT NULL,
  created INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS rows(
  centre TEXT NOT NULL,
  kind TEXT NOT NULL,
  id TEXT NOT NULL,
  data TEXT NOT NULL,
  PRIMARY KEY(centre, kind, id)
);
CREATE TABLE IF NOT EXISTS qr(
  token TEXT PRIMARY KEY,
  centre TEXT NOT NULL,
  student TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS certs(
  no TEXT PRIMARY KEY,
  centre TEXT NOT NULL,
  enrollment TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS outbox(
  centre TEXT NOT NULL,
  id TEXT NOT NULL,
  tries INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(centre, id)
);
CREATE TABLE IF NOT EXISTS sent(
  centre TEXT NOT NULL,
  k TEXT NOT NULL,
  created INTEGER NOT NULL,
  PRIMARY KEY(centre, k)
);
`

func openDB(path string) (*sql.DB, error) {
	db, err := sql.Open("sqlite", path+"?_pragma=journal_mode(WAL)&_pragma=busy_timeout(5000)&_pragma=foreign_keys(1)")
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(1)
	if _, err := db.Exec(schema); err != nil {
		return nil, err
	}
	return db, nil
}

func newID(p string) string {
	b := make([]byte, 6)
	rand.Read(b)
	return p + hex.EncodeToString(b)
}

func token(n int) string {
	b := make([]byte, n)
	rand.Read(b)
	return hex.EncodeToString(b)
}

type Tx struct {
	*sql.Tx
	centre string
}

func (t Tx) get(kind, id string, v any) error {
	var s string
	err := t.QueryRow(`SELECT data FROM rows WHERE centre=? AND kind=? AND id=?`, t.centre, kind, id).Scan(&s)
	if errors.Is(err, sql.ErrNoRows) {
		return ErrNotFound
	}
	if err != nil {
		return err
	}
	return json.Unmarshal([]byte(s), v)
}

func (t Tx) put(kind, id string, v any) error {
	b, err := json.Marshal(v)
	if err != nil {
		return err
	}
	_, err = t.Exec(`INSERT INTO rows(centre,kind,id,data) VALUES(?,?,?,?) ON CONFLICT(centre,kind,id) DO UPDATE SET data=excluded.data`, t.centre, kind, id, string(b))
	return err
}

func list[T any](t Tx, kind string) ([]T, error) {
	rs, err := t.Query(`SELECT data FROM rows WHERE centre=? AND kind=?`, t.centre, kind)
	if err != nil {
		return nil, err
	}
	defer rs.Close()
	out := []T{}
	for rs.Next() {
		var s string
		if err := rs.Scan(&s); err != nil {
			return nil, err
		}
		var v T
		if err := json.Unmarshal([]byte(s), &v); err != nil {
			return nil, err
		}
		out = append(out, v)
	}
	return out, rs.Err()
}

func (t Tx) centreData() (Centre, error) {
	var s string
	var c Centre
	if err := t.QueryRow(`SELECT data FROM centres WHERE id=?`, t.centre).Scan(&s); err != nil {
		return c, err
	}
	err := json.Unmarshal([]byte(s), &c)
	return c, err
}

func (t Tx) saveCentre(c Centre) error {
	b, _ := json.Marshal(c)
	_, err := t.Exec(`UPDATE centres SET data=? WHERE id=?`, string(b), t.centre)
	return err
}

func (t Tx) once(k string, now int64) (bool, error) {
	r, err := t.Exec(`INSERT OR IGNORE INTO sent(centre,k,created) VALUES(?,?,?)`, t.centre, k, now)
	if err != nil {
		return false, err
	}
	n, _ := r.RowsAffected()
	return n == 1, nil
}
