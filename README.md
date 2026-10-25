# Daksho server

Management system for computer training centres in Bangladesh: admissions with document upload, installment plans, receipts, dues tracking with scheduled SMS reminders, QR-code attendance, certificates with online verification, and daily cash. It runs in production for real centres.

Single Go binary, SQLite (modernc, no cgo), vanilla ES-module web client served from the same binary.

## Design
- **Multi-tenant by centre.** Every row carries its centre id and every query is scoped by the session's centre.
- **Roles.** Owner, front desk and teacher. Teachers never see money; only the owner can void a receipt, and a void needs a reason. Receipts are never deleted.
- **Dues.** `dueOf` derives each student's schedule (one-time, monthly, or "half now, half after class N") from the admission record. The same JSON fixture (`testdata/dues-cases.json`) is checked by the Go tests and by the client code, so server and browser always agree.
- **SMS outbox.** Messages are queued in a table and sent by a delivery loop; a `sent` key makes reminders idempotent across restarts. Reminders go out only in an evening window, Dhaka time. Without a gateway key the adapter only logs.
- **QR attendance.** Each student card carries an opaque token. Teachers scan at the door with a phone camera (with a JS decoder fallback where `BarcodeDetector` is missing), a USB scanner or by roll number. Offline scans queue in the browser with their original timestamp. Absent-guardian SMS goes out only when the class is closed, and closing is refused on days the batch has no class.
- **Security.** bcrypt passwords, HttpOnly session cookie (Secure behind TLS), a required custom header on every write as CSRF protection, uploads served only to authorised roles.

## Run
```
go test ./...
node dues.test.mjs
go run . -addr 127.0.0.1:8472
go run . -new-centre "Centre name" -short "Centre" -phone 017XXXXXXXX -owner "Owner" -password "change-me"
```
`e2e.mjs` drives a real Chrome with a fake camera feed of a QR card through admission, payment, scanning and closing attendance.
