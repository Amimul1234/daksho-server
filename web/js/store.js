const DAY = 86400000;

export const bn = n => String(n).replace(/\d/g, d => '০১২৩৪৫৬৭৮৯'[d]);
export const tk = n => '৳' + bn(Math.round(n).toLocaleString('en-IN'));
export const num = n => bn(Math.round(n).toLocaleString('en-IN'));

const months = ['জানুয়ারি','ফেব্রুয়ারি','মার্চ','এপ্রিল','মে','জুন','জুলাই','আগস্ট','সেপ্টেম্বর','অক্টোবর','নভেম্বর','ডিসেম্বর'];
const monthsShort = ['জানু','ফেব্রু','মার্চ','এপ্রি','মে','জুন','জুলা','আগ','সেপ্টে','অক্টো','নভে','ডিসে'];
const weekdays = ['রবিবার','সোমবার','মঙ্গলবার','বুধবার','বৃহস্পতিবার','শুক্রবার','শনিবার'];
export const DAY_NAMES = ['রবি','সোম','মঙ্গল','বুধ','বৃহঃ','শুক্র','শনি'];

export const today = () => { const d = new Date(); d.setHours(0,0,0,0); return d; };
export const iso = d => { const x = new Date(d); return x.getFullYear() + '-' + String(x.getMonth()+1).padStart(2,'0') + '-' + String(x.getDate()).padStart(2,'0'); };
export const parse = s => { const [y,m,d] = String(s).split('-').map(Number); return new Date(y, m-1, d); };
export const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return iso(d); };
export const addMonths = (s, n) => { const d = parse(s); const day = d.getDate(); d.setDate(1); d.setMonth(d.getMonth() + n); d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth()+1, 0).getDate())); return iso(d); };
const diff = (a, b) => Math.round((parse(a) - parse(b)) / DAY);
export const daysFrom = s => diff(s, iso(today()));
export const dateBn = s => { const d = parse(s); return bn(d.getDate()) + ' ' + months[d.getMonth()]; };
export const dateShort = s => { const d = parse(s); return bn(d.getDate()) + ' ' + monthsShort[d.getMonth()]; };
export const dateFull = s => { const d = parse(s); return bn(d.getDate()) + ' ' + months[d.getMonth()] + ' ' + bn(d.getFullYear()); };
export const weekday = s => weekdays[parse(s).getDay()];
export const relDay = s => {
  const n = daysFrom(s);
  if (n === 0) return 'আজ';
  if (n === 1) return 'আগামীকাল';
  if (n === -1) return 'গতকাল';
  if (n > 1 && n < 7) return bn(n) + ' দিন পর';
  if (n < -1 && n > -31) return bn(-n) + ' দিন আগে';
  return dateShort(s);
};
export const timeBn = t => { const [h, m] = String(t || '00:00').split(':').map(Number); const p = h < 12 ? 'সকাল' : h < 15 ? 'দুপুর' : h < 18 ? 'বিকাল' : 'সন্ধ্যা'; return p + ' ' + bn(((h + 11) % 12) + 1) + ':' + bn(String(m).padStart(2,'0')); };
export const nowMinutes = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };
export const minutesOf = t => { const [h, m] = String(t || '0:0').split(':').map(Number); return h * 60 + m; };

export const DOC_KINDS = [
  { id: 'photo', label: 'ছবি', need: true },
  { id: 'nid', label: 'এনআইডি / জন্মনিবন্ধন', need: true },
  { id: 'ssc', label: 'এসএসসি সনদ / মার্কশিট', need: true },
  { id: 'hsc', label: 'এইচএসসি সনদ', need: false },
  { id: 'guardian', label: 'অভিভাবকের এনআইডি', need: false },
  { id: 'other', label: 'অন্যান্য', need: false }
];

export const TEMPLATES = {
  due: '{নাম}, {টাকা} টাকার কিস্তি {তারিখ} দেয়। -{সেন্টার}',
  overdue: '{নাম}, {টাকা} টাকা বকেয়া। দয়া করে জমা দিন। -{সেন্টার}',
  absent: '{নাম} আজ ক্লাসে আসেনি। -{সেন্টার}',
  admission: '{নাম}, ভর্তি সম্পন্ন। রোল {রোল}। স্বাগতম! -{সেন্টার}',
  paid: '{টাকা} টাকা পেয়েছি, রসিদ {রসিদ}। বাকি {বাকি}। -{সেন্টার}'
};

export const ADMISSION = 'ভর্তি ফি';

export function makePlan(total, count, start) {
  const per = Math.floor(total / count / 50) * 50;
  const plan = [];
  for (let i = 0; i < count; i++) plan.push({ n: i + 1, amount: i === count - 1 ? total - per * (count - 1) : per, due: addMonths(start, i) });
  return plan;
}

export const S_bnOrd = n => bn(n) + ({1:'ম',2:'য়',3:'য়',4:'র্থ',5:'ম',6:'ষ্ঠ',7:'ম',8:'ম',9:'ম',10:'ম'}[n] || 'তম');

export function presetPlan(kind, total, start, months, classN) {
  if (kind === 'once') return [{ n: 1, amount: total, due: start, label: 'ভর্তির দিন' }];
  if (kind === 'half') {
    const a = Math.round(total / 2 / 50) * 50;
    const est = addDays(start, Math.round(classN / 3 * 7));
    return [{ n: 1, amount: a, due: start, label: 'ভর্তির দিন' }, { n: 2, amount: total - a, due: est, label: S_bnOrd(classN) + ' ক্লাসের পর' }];
  }
  return makePlan(total, Math.max(2, months), start);
}

export function enrolDue(payments, e, t) {
  const day = t || iso(today());
  let paid = 0, admissionPaid = 0;
  for (const p of payments) {
    if (p.enrollmentId !== e.id || p.void) continue;
    if (p.label === ADMISSION) admissionPaid += p.amount; else paid += p.amount;
  }
  let left = paid;
  const rows = (e.plan || []).map(ins => {
    const covered = Math.max(0, Math.min(left, ins.amount)); left -= covered;
    const rem = ins.amount - covered;
    const dd = diff(ins.due, day);
    const st = rem === 0 ? 'paid' : dd < 0 ? 'late' : dd <= 3 ? 'soon' : 'later';
    return { ...ins, covered, rem, st, dd };
  });
  const net = e.fee - e.discount;
  const overdueRows = rows.filter(x => x.st === 'late').reduce((a, x) => a + x.rem, 0);
  const next = rows.find(x => x.rem > 0);
  const oldest = rows.find(x => x.st === 'late');
  const admissionDue = Math.max(0, e.admission - admissionPaid);
  const dropped = e.status === 'dropped';
  return { rows, paid, net, total: dropped ? 0 : net - paid + admissionDue, overdue: dropped ? 0 : overdueRows + admissionDue, next, oldest, lateDays: oldest ? -oldest.dd : 0, admissionDue, dueToday: rows.filter(x => x.rem > 0 && x.dd === 0).reduce((a, x) => a + x.rem, 0) };
}

export function smsParts(text) {
  const uni = /[^\x00-\x7F]/.test(text);
  const len = [...text].length;
  const single = uni ? 70 : 160, multi = uni ? 67 : 153;
  const parts = len === 0 ? 0 : len <= single ? 1 : Math.ceil(len / multi);
  return { len, parts, uni, limit: parts <= 1 ? single : parts * multi };
}

let state = null;
const listeners = new Set();
export const on = fn => { listeners.add(fn); return () => listeners.delete(fn); };
const emit = () => listeners.forEach(f => f());
export const get = () => state;
export const role = () => state?.user?.role || '';
export const isOwner = () => role() === 'owner';
export const isTeacher = () => role() === 'teacher';
export const ROLE_LABEL = { owner: 'মালিক', desk: 'ফ্রন্ট ডেস্ক', teacher: 'শিক্ষক' };

export class ApiError extends Error { constructor(msg, status) { super(msg); this.status = status; } }

export async function api(path, body, raw) {
  let res;
  try {
    res = await fetch('api/' + path, raw ? { method: 'POST', headers: { 'X-Daksho': '1' }, body: raw, credentials: 'same-origin' } : {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Daksho': '1' },
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: 'same-origin'
    });
  } catch {
    throw new ApiError('ইন্টারনেট সংযোগ নেই, আবার চেষ্টা করুন', 0);
  }
  let j = {};
  try { j = await res.json(); } catch {}
  if (res.status === 401 && path !== 'login' && path !== 'boot') window.dispatchEvent(new Event('daksho:401'));
  if (!res.ok) throw new ApiError(j.error || 'সার্ভারে সমস্যা হয়েছে, আবার চেষ্টা করুন', res.status);
  return j;
}

const LISTS = { student: 'students', enrollment: 'enrollments', payment: 'payments', doc: 'docs', message: 'messages', enquiry: 'enquiries', expense: 'expenses', course: 'courses', batch: 'batches', teacher: 'teachers' };

export function merge(up) {
  for (const [k, list] of Object.entries(up || {})) {
    if (!list || !list.length) continue;
    if (k === 'centre') { state.centre = list[list.length - 1]; continue; }
    if (k === 'att') { for (const a of list) state.attendance[a.id] = a; continue; }
    const arr = state[LISTS[k]];
    if (!arr) continue;
    for (const v of list) {
      const i = arr.findIndex(x => x.id === v.id);
      if (i >= 0) arr[i] = v; else if (k === 'message') arr.unshift(v); else arr.push(v);
    }
  }
  emit();
}

export async function act(path, body) {
  const r = await api(path, body);
  if (r.up) merge(r.up);
  return r;
}

export async function load() {
  const b = await api('boot');
  state = {
    centre: b.centre, user: b.user, staff: b.staff || [], smsLive: b.smsLive,
    courses: b.course || [], batches: b.batch || [], teachers: b.teacher || [], students: b.student || [], enrollments: b.enrollment || [],
    payments: b.payment || [], docs: b.doc || [], messages: b.message || [], enquiries: b.enquiry || [], expenses: b.expense || [],
    attendance: Object.fromEntries((b.att || []).map(a => [a.id, a]))
  };
  return state;
}

export const setStaff = list => { state.staff = list; emit(); };

export const student = id => state.students.find(x => x.id === id);
export const course = id => state.courses.find(x => x.id === id) || { id, name: '—', en: '', months: 0, hours: 0, fee: 0, admission: 0, kind: '', inst: 1 };
export const batch = id => state.batches.find(x => x.id === id) || { id, code: '—', days: '', time: '00:00', seats: 0, start: '', end: '', lab: '', courseId: '' };
export const teacher = id => state.teachers.find(x => x.id === id) || { id, name: '—', subject: '' };
export const enrolsOf = sid => state.enrollments.filter(e => e.studentId === sid);
export const mainEnrol = sid => { const l = enrolsOf(sid); return l.find(e => e.status === 'running') || l[l.length - 1]; };
export const paymentsOf = sid => state.payments.filter(p => p.studentId === sid).sort((a, b) => (b.at + (b.time || '')).localeCompare(a.at + (a.time || '')) || b.receipt.localeCompare(a.receipt, 'en', { numeric: true }));
export const docsOf = sid => state.docs.filter(d => d.studentId === sid);
export const due = e => enrolDue(state.payments, e);
export const missingDocs = sid => { const have = new Set(docsOf(sid).map(d => d.kind)); return DOC_KINDS.filter(k => k.need && !have.has(k.id)); };
export const attOf = (bid, d) => state.attendance[bid + '|' + d] || null;
export const seatsTaken = bid => state.enrollments.filter(e => e.batchId === bid && e.status === 'running').map(e => e.seat);
export const enrolledIn = (bid, d) => state.enrollments.filter(e => e.batchId === bid && e.status !== 'dropped' && e.joined <= d);
export const nextRoll = () => (state.centre.prefix || 'DK') + '-' + String(today().getFullYear()).slice(2) + '-' + String((state.centre.seq?.roll || 0) + 1).padStart(4, '0');
export const meetsOn = (b, d) => !!b && d >= b.start && d <= b.end && b.days.split(' ').includes(DAY_NAMES[parse(d).getDay()]);

export function fill(tpl, st, e, extra = {}) {
  const c = e ? course(e.courseId) : null;
  const d = e ? due(e) : null;
  const first = st.name.split(' ')[0];
  return tpl
    .replace(/\{নাম\}/g, first)
    .replace(/\{কোর্স\}/g, c ? c.name : '')
    .replace(/\{টাকা\}/g, num(extra.amount ?? (d?.next?.rem || d?.total || 0)))
    .replace(/\{তারিখ\}/g, extra.date ? dateShort(extra.date) : d?.next ? dateShort(d.next.due) : '')
    .replace(/\{রোল\}/g, st.roll)
    .replace(/\{রসিদ\}/g, extra.receipt || '')
    .replace(/\{বাকি\}/g, num(extra.left ?? (d?.total || 0)))
    .replace(/\{সেন্টার\}/g, state.centre.short);
}

export const fileURL = id => 'api/file/' + encodeURIComponent(id);
export const cardURL = st => location.origin + '/q/' + st.qr;
export const verifyURL = no => location.origin + '/app/#/verify/' + no;
