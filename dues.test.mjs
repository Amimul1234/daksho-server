import { readFileSync } from 'node:fs';
import { enrolDue } from './web/js/store.js';

const cases = JSON.parse(readFileSync(new URL('./testdata/dues-cases.json', import.meta.url)));
let bad = 0;
for (const c of cases) {
  const d = enrolDue(c.payments, c.enrollment, c.today);
  const got = { Total: d.total, Overdue: d.overdue, LateDays: d.lateDays, AdmissionDue: d.admissionDue, NextRem: d.next ? d.next.rem : 0, Sts: d.rows.map(r => r.st) };
  if (JSON.stringify(got) !== JSON.stringify(c.want)) { bad++; console.log('FAIL', c.name, JSON.stringify(got)); }
}
console.log(bad ? `${bad} of ${cases.length} cases differ` : `ok: ${cases.length} dues cases match the server`);
process.exit(bad ? 1 : 0);
