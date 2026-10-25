package main

import (
	"context"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"strings"
	"time"
)

type Sender interface {
	Send(ctx context.Context, phone, text string) error
	Live() bool
}

type LogSender struct{}

func (LogSender) Send(_ context.Context, phone, text string) error {
	log.Printf("sms (log only) to %s: %s", phone, text)
	return nil
}

func (LogSender) Live() bool { return false }

type BulkSMSBD struct {
	Key, SenderID, Endpoint string
}

func (BulkSMSBD) Live() bool { return true }

func (b BulkSMSBD) Send(ctx context.Context, phone, text string) error {
	ep := b.Endpoint
	if ep == "" {
		ep = "https://bulksmsbd.net/api/smsapi"
	}
	q := url.Values{"api_key": {b.Key}, "type": {"text"}, "number": {"88" + digits(phone)}, "senderid": {b.SenderID}, "message": {text}}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, ep, strings.NewReader(q.Encode()))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	res, err := (&http.Client{Timeout: 20 * time.Second}).Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(res.Body, 2048))
	if res.StatusCode != 200 || !strings.Contains(string(body), "202") {
		return fmt.Errorf("gateway %d: %s", res.StatusCode, strings.TrimSpace(string(body)))
	}
	return nil
}

func (a *App) enqueue(t Tx, m *Message) error {
	m.Parts = smsParts(m.Text)
	switch {
	case !validPhone(m.To):
		m.Status = "failed"
	case isDemoNumber(m.To):
		m.Status = "demo"
	case !a.sms.Live():
		a.sms.Send(context.Background(), m.To, m.Text)
		m.Status = "logged"
	default:
		m.Status = "queued"
		if _, err := t.Exec(`INSERT OR IGNORE INTO outbox(centre,id) VALUES(?,?)`, t.centre, m.ID); err != nil {
			return err
		}
	}
	return t.put("message", m.ID, m)
}

func (a *App) deliverOnce() int {
	type item struct{ centre, id string; tries int }
	rs, err := a.db.Query(`SELECT centre,id,tries FROM outbox ORDER BY rowid LIMIT 50`)
	if err != nil {
		return 0
	}
	var items []item
	for rs.Next() {
		var it item
		rs.Scan(&it.centre, &it.id, &it.tries)
		items = append(items, it)
	}
	rs.Close()
	n := 0
	for _, it := range items {
		var m Message
		if err := a.read(it.centre, func(t Tx) error { return t.get("message", it.id, &m) }); err != nil {
			a.db.Exec(`DELETE FROM outbox WHERE centre=? AND id=?`, it.centre, it.id)
			continue
		}
		ctx, cancel := context.WithTimeout(context.Background(), 25*time.Second)
		err := a.sms.Send(ctx, m.To, m.Text)
		cancel()
		a.write(it.centre, func(t Tx) error {
			if err == nil {
				m.Status = "sent"
			} else if it.tries >= 2 {
				log.Printf("sms to %s failed: %v", m.To, err)
				m.Status = "failed"
			} else {
				_, e := t.Exec(`UPDATE outbox SET tries=tries+1 WHERE centre=? AND id=?`, it.centre, it.id)
				return e
			}
			t.Exec(`DELETE FROM outbox WHERE centre=? AND id=?`, it.centre, it.id)
			return t.put("message", m.ID, m)
		})
		n++
	}
	return n
}
