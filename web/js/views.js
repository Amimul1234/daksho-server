import * as S from './store.js';
import { icon } from './icons.js';
import { esc, ava, planBar, dueLabel, mth, methodName, phoneFmt } from './ui.js';

const { bn, tk, num } = S;
const tday = () => S.iso(S.today());

export function stats() {
  const s = S.get(), t = tday(), m = t.slice(0, 7);
  const pays = s.payments.filter(p => !p.void);
  const todayP = pays.filter(p => p.at === t);
  const monthP = pays.filter(p => p.at.startsWith(m));
  let outstanding = 0, overdue = 0, owers = 0, lateOwers = 0;
  for (const e of s.enrollments) {
    if (e.status === 'dropped') continue;
    const d = S.due(e);
    outstanding += d.total; overdue += d.overdue;
    if (d.total > 0) owers++;
    if (d.overdue > 0) lateOwers++;
  }
  return { todayAmt: todayP.reduce((a, p) => a + p.amount, 0), todayN: todayP.length, monthAmt: monthP.reduce((a, p) => a + p.amount, 0), outstanding, overdue, owers, lateOwers };
}

export function dueRows() {
  const s = S.get();
  return s.enrollments.filter(e => e.status !== 'dropped').map(e => ({ e, d: S.due(e), st: S.student(e.studentId), b: S.batch(e.batchId) })).filter(x => x.st && x.d.total > 0);
}

export function autoQueue() {
  const s = S.get(), r = s.centre.reminders, out = [];
  for (const { e, d, st } of dueRows()) {
    if (e.status !== 'running' || !d.next) continue;
    const late = d.lateDays;
    let kind = null;
    if (d.overdue > 0) { if (late === r.after || (late > r.after && r.repeat && (late - r.after) % r.repeat === 0)) kind = 'overdue'; }
    else if (r.before > 0 && d.next.dd === r.before) kind = 'due';
    else if (r.onDay && d.next.dd === 0) kind = 'due';
    if (kind) out.push({ st, e, kind, text: S.fill(S.TEMPLATES[kind], st, e, kind === 'overdue' ? { amount: d.overdue } : { amount: d.next.rem, date: d.next.due }) });
  }
  const sentToday = new Set(s.messages.filter(m => m.at === tday() && (m.kind === 'due' || m.kind === 'overdue')).map(m => m.studentId));
  return out.filter(x => !sentToday.has(x.st.id));
}

function hello() {
  const h = new Date().getHours();
  return h < 12 ? 'শুভ সকাল' : h < 17 ? 'শুভ দুপুর' : 'শুভ সন্ধ্যা';
}

function setup() {
  const s = S.get();
  const steps = [
    [s.courses.length > 0, 'কোর্স আর ফি যোগ করুন', 'data-newcourse', 'কোর্স যোগ'],
    [s.batches.length > 0, 'একটা ব্যাচ খুলুন: দিন, সময়, কয়টা পিসি', 'data-newbatch', 'ব্যাচ খুলুন'],
    [s.students.length > 0, 'প্রথম ছাত্র/ছাত্রী ভর্তি করুন', 'data-go="#/admit"', 'ভর্তি করুন']
  ];
  if (steps.every(x => x[0])) return '';
  const nextI = steps.findIndex(x => !x[0]);
  return `<section class="card pad setup"><h2>শুরু করা যাক</h2><p class="muted">তিনটা ধাপ, তারপর থেকে সব হিসাব নিজে চলবে।</p><ol>${steps.map(([done, l, attr, btn], i) => `<li class="${done ? 'done' : ''}"><span class="n">${done ? icon('check') : bn(i + 1)}</span><span class="t">${l}</span>${!done && i === nextI ? `<button class="btn primary sm" ${attr}>${btn}</button>` : ''}</li>`).join('')}</ol></section>`;
}

function classRow(b, t, mins) {
  const st = S.minutesOf(b.time);
  const state = mins >= st + 90 ? 'done' : mins >= st - 15 ? 'now' : '';
  const c = S.course(b.courseId), n = S.enrolledIn(b.id, t).length;
  const at = S.attOf(b.id, t);
  const status = at?.closed ? `<span class="st paid">হাজিরা শেষ · ${bn(at.present.length)}/${bn(n)}</span>` : at?.present.length ? `<span class="st lab">${bn(at.present.length)}/${bn(n)} এসেছে</span>` : '';
  return `<div class="cls ${state}"><time><b>${S.timeBn(b.time).split(' ')[1]}</b>${S.timeBn(b.time).split(' ')[0]}</time>
    <a class="who" href="#/b/${b.id}"><b>${esc(c.name)}</b><small><span class="lat">${esc(b.code)}</span> · ${esc(S.teacher(b.teacher).name)} · ${esc(b.lab)} · ${bn(n)} জন</small>${status ? `<small>${status}</small>` : ''}</a>
    ${at?.closed ? '' : `<a class="btn secondary sm" href="#/scan?b=${b.id}">${icon('qr')}স্ক্যান</a>`}</div>`;
}

export function today() {
  const s = S.get(), t = tday();
  const mins = S.nowMinutes();
  const classes = s.batches.filter(b => S.meetsOn(b, t)).sort((a, b) => a.time < b.time ? -1 : 1);
  const head = `<div class="pagehead"><div class="hello"><h1>${hello()}, ${esc(s.user.name.split(' ')[0])}</h1><p>${S.weekday(t)}, ${S.dateFull(t)}</p></div>
      ${S.isTeacher() ? `<a class="btn primary" href="#/scan">${icon('qr')}হাজিরা স্ক্যান</a>` : `<a class="btn primary mobonly" href="#/admit">${icon('plus')}নতুন ভর্তি</a>`}</div>`;
  const classCard = `<section class="sect"><div class="secthead"><h2>আজকের ক্লাস</h2><a href="#/batches">সব ব্যাচ</a></div>
      <div class="card classes">${classes.length ? classes.map(b => classRow(b, t, mins)).join('') : `<div class="empty"><b>আজ কোনো ক্লাস নেই</b>${s.batches.length ? '' : 'ব্যাচ খুললে এখানে দিনের ক্লাস দেখাবে'}</div>`}</div></section>`;
  if (S.isTeacher()) return `<div class="page">${head}${classCard}</div>`;
  const k = stats();
  const list = dueRows().filter(x => x.e.status === 'running' && (x.d.overdue > 0 || (x.d.next && x.d.next.dd <= 0))).sort((a, b) => b.d.lateDays - a.d.lateDays || b.d.overdue - a.d.overdue);
  const soon = dueRows().filter(x => x.e.status === 'running' && x.d.overdue === 0 && x.d.next && x.d.next.dd > 0 && x.d.next.dd <= 3);
  const enq = s.enquiries.filter(q => q.status === 'open' && q.next && q.next <= t);
  const q = autoQueue();
  const parts = q.reduce((a, x) => a + S.smsParts(x.text).parts, 0);
  const rm = s.centre.reminders;
  return `<div class="page">${head}${setup()}
    <div class="ledger stagger">
      <div class="lead"><small>আজ জমা</small><strong class="money">${tk(k.todayAmt)}</strong><em>${bn(k.todayN)}টি রসিদ · এ মাসে ${tk(k.monthAmt)}</em></div>
      <div><small>মোট বাকি</small><strong class="money">${tk(k.outstanding)}</strong><em>${bn(k.owers)} জনের কাছে, কোর্স শেষ হওয়া পর্যন্ত</em></div>
      <div><small>সময় পার হয়ে গেছে</small><strong class="money ${k.overdue ? 'late' : ''}">${tk(k.overdue)}</strong><em>${bn(k.lateOwers)} জন${k.lateOwers ? ' · <a class="linkbtn" href="#/dues">বকেয়া দেখুন</a>' : ''}</em></div>
    </div>
    <div class="cols">
      <div style="display:flex;flex-direction:column;gap:24px;min-width:0">
        <section class="sect"><div class="secthead"><h2>আজ টাকা নিতে হবে</h2><a href="#/dues">সব বকেয়া ${icon('chev', 'sm')}</a></div>
          <div class="card rows">${list.length ? list.slice(0, 6).map(x => dueRow(x)).join('') : `<div class="empty">${icon('check')}<b>আজ কারও কিস্তি বাকি নেই</b>${soon.length ? `সামনের ৩ দিনে ${bn(soon.length)} জনের কিস্তি আছে` : ''}</div>`}
          ${list.length > 6 ? `<a class="row hov" href="#/dues" style="min-height:48px;justify-content:center;color:var(--lab-ink);font-weight:600;font-size:var(--t-small)">আরও ${bn(list.length - 6)} জন</a>` : ''}</div>
        </section>
        ${classCard}
      </div>
      <aside style="display:flex;flex-direction:column;gap:20px">
        <div class="auto"><h3><span class="live"></span>আজ সন্ধ্যা ৭টায় অটো রিমাইন্ডার</h3>
          ${q.length ? `<p>${bn(q.length)} জনকে SMS যাবে · ${bn(parts)} SMS · প্রায় ${tk(parts * (s.centre.smsRate || 0.35))}</p><div class="bubble">${esc(q[0].text)}</div>` : `<p>আজ কাউকে রিমাইন্ডার পাঠানোর নেই। কিস্তির ${bn(rm.before)} দিন আগে, দিনে ও ${bn(rm.after)} দিন পরে নিজে যায়।</p>`}
          <div class="meta"><span>এ পর্যন্ত SMS <b>${num(s.centre.smsUsed || 0)}</b></span><span>${s.smsLive ? 'গেটওয়ে <b>চালু</b>' : 'গেটওয়ে <b>এখনও চালু হয়নি</b>'}</span></div>
          <div class="btnrow">${q.length ? `<button class="btn secondary sm" data-autoq>তালিকা দেখুন</button>` : ''}<a class="btn secondary sm" href="#/sms">নিয়ম বদলান</a></div>
        </div>
        <section class="sect"><div class="secthead"><h2>ফলো-আপ কল</h2><a href="#/enquiries">সব</a></div>
          <div class="card rows">${enq.length ? enq.map(q => `<div class="row"><span class="ava sm">${esc(q.name.replace('মোঃ ', '')[0])}</span><div class="who"><b>${esc(q.name)}</b><small>${esc(S.course(q.courseId).name)} · ${q.next < t ? `<span style="color:var(--late)">${S.relDay(q.next)} কথা ছিল</span>` : 'আজ'}</small></div><button class="iconbtn" data-call="${q.phone}" aria-label="কল">${icon('phone')}</button></div>`).join('') : `<div class="empty"><b>আজ কাউকে কল করার নেই</b></div>`}</div>
        </section>
      </aside>
    </div></div>`;
}

export function dueRow({ e, d, st, b }, opts = {}) {
  const show = d.overdue > 0 ? d.overdue : d.next ? d.next.rem : d.total;
  return `<div class="row hov" data-sid="${st.id}">
    ${opts.tick ? `<input type="checkbox" class="tick" data-tick="${e.id}" aria-label="${esc(st.name)} নির্বাচন" ${opts.checked ? 'checked' : ''}>` : ''}
    ${ava(st)}
    <a class="who" href="#/s/${st.id}"><b>${esc(st.name)}</b><small><span class="lat">${esc(b.code)}</span><span class="tot"> · মোট বাকি ${tk(d.total)}</span></small></a>
    <span class="planw" style="width:120px">${planBar(e)}</span>
    <div class="amt"><b class="money ${d.overdue > 0 ? 'late' : ''}">${tk(show)}</b>${dueLabel(d)}</div>
    <div class="acts"><button class="iconbtn" data-call="${st.phone}" aria-label="কল">${icon('phone')}</button><button class="iconbtn" data-sms="${e.id}" aria-label="SMS">${icon('sms')}</button><button class="btn secondary sm desk" data-collect="${e.id}">জমা নিন</button></div>
  </div>`;
}

function rowsOf() {
  return S.get().students.map(st => { const e = S.mainEnrol(st.id); return e ? { st, e, d: S.due(e), b: S.batch(e.batchId), miss: S.missingDocs(st.id) } : null; }).filter(Boolean);
}

export function students(params) {
  const s = S.get();
  const f = params.get('f') || 'all', bq = params.get('b') || '', qq = params.get('q') || '';
  const rows = rowsOf();
  const counts = { all: rows.length, running: 0, owe: 0, docs: 0, done: 0, dropped: 0 };
  rows.forEach(r => { if (r.e.status === 'running') counts.running++; if (r.d.overdue > 0) counts.owe++; if (r.miss.length) counts.docs++; if (r.e.status === 'completed') counts.done++; if (r.e.status === 'dropped') counts.dropped++; });
  const chips = [['all', 'সবাই'], ['running', 'চলমান'], ['owe', 'বকেয়া'], ['docs', 'কাগজ বাকি'], ['done', 'কোর্স শেষ'], ['dropped', 'বাদ']];
  return `<div class="page">
    <div class="pagehead"><h1>ছাত্রছাত্রী<span class="sub">${bn(counts.running)} জন চলমান · ${bn(s.batches.length)}টি ব্যাচ</span></h1><a class="btn primary" href="#/admit">${icon('plus')}নতুন ভর্তি</a></div>
    <div class="toolbar"><label class="searchbox">${icon('search')}<span class="sr">খুঁজুন</span><input class="inp" id="stq" type="search" placeholder="নাম, রোল বা ফোন নম্বর" value="${esc(qq)}" autocomplete="off"></label>
      <select class="inp" id="stb" style="width:auto;min-width:170px" aria-label="ব্যাচ"><option value="">সব ব্যাচ</option>${s.batches.map(b => `<option value="${b.id}" ${bq === b.id ? 'selected' : ''}>${esc(b.code)} · ${esc(S.course(b.courseId).name)}</option>`).join('')}</select></div>
    <div class="chips" role="group" aria-label="ফিল্টার">${chips.map(([k, l]) => `<button class="chip" data-f="${k}" aria-pressed="${f === k}">${l} <em>${bn(counts[k])}</em></button>`).join('')}</div>
    <div class="card" id="stlist"></div></div>`;
}

export function studentList(params) {
  const f = params.get('f') || 'all', bq = params.get('b') || '', qq = (params.get('q') || '').trim().toLowerCase();
  let rows = rowsOf();
  if (!rows.length && !qq) return `<div class="empty"><b>এখনও কেউ ভর্তি হয়নি</b><a class="btn primary sm" href="#/admit">${icon('plus')}প্রথম ভর্তি</a></div>`;
  if (f === 'running') rows = rows.filter(r => r.e.status === 'running');
  if (f === 'owe') rows = rows.filter(r => r.d.overdue > 0).sort((a, b) => b.d.lateDays - a.d.lateDays);
  if (f === 'docs') rows = rows.filter(r => r.miss.length);
  if (f === 'done') rows = rows.filter(r => r.e.status === 'completed');
  if (f === 'dropped') rows = rows.filter(r => r.e.status === 'dropped');
  if (bq) rows = rows.filter(r => r.e.batchId === bq);
  if (qq) rows = rows.filter(r => matches(r.st, qq));
  if (f !== 'owe') rows.sort((a, b) => b.st.roll.localeCompare(a.st.roll, 'en', { numeric: true }));
  if (!rows.length) return `<div class="empty"><b>কাউকে পাওয়া যায়নি</b>${qq ? 'বানান বা নম্বর আরেকবার দেখুন' : ''}</div>`;
  const statusCell = r => r.e.status === 'completed' ? (r.e.cert ? '<span class="st seal">সনদ দেওয়া</span>' : '<span class="st lab">কোর্স শেষ</span>') : r.e.status === 'dropped' ? '<span class="st none">বাদ</span>' : dueLabel(r.d);
  return `<table class="table"><thead><tr><th>নাম ও রোল</th><th>ব্যাচ</th><th>ফোন</th><th>কিস্তি</th><th>অবস্থা</th><th class="num">বাকি</th><th>কাগজ</th></tr></thead><tbody>
    ${rows.map(r => `<tr data-go="#/s/${r.st.id}"><td><div class="nm">${ava(r.st, 'sm')}<div><b>${esc(r.st.name)}</b><small>${r.st.roll}</small></div></div></td><td><span class="lat">${esc(r.b.code)}</span><br><small class="muted">${esc(S.course(r.b.courseId).name)}</small></td><td class="lat">${phoneFmt(r.st.phone)}</td><td>${planBar(r.e)}</td><td>${statusCell(r)}</td><td class="num money ${r.d.overdue > 0 ? 'late' : ''}"><b>${r.d.total > 0 ? tk(r.d.total) : '—'}</b></td><td>${r.miss.length ? `<span class="st soon">${bn(r.miss.length)}টি বাকি</span>` : '<span class="st paid">সব আছে</span>'}</td></tr>`).join('')}
    </tbody></table>
    <div class="rows mob">${rows.map(r => `<a class="row" href="#/s/${r.st.id}">${ava(r.st)}<div class="who"><b>${esc(r.st.name)}</b><small><span class="lat">${r.st.roll} · ${esc(r.b.code)}</span></small><span style="margin-top:6px">${planBar(r.e)}</span></div><div class="amt">${r.d.total > 0 ? `<b class="money ${r.d.overdue > 0 ? 'late' : ''}">${tk(r.d.total)}</b>` : ''}${statusCell(r)}</div></a>`).join('')}</div>`;
}

export function matches(st, q) {
  const digits = q.replace(/[০-৯]/g, d => '০১২৩৪৫৬৭৮৯'.indexOf(d)).replace(/\D/g, '');
  return st.name.toLowerCase().includes(q) || (st.en || '').toLowerCase().includes(q) || st.roll.toLowerCase().includes(q) || (digits.length >= 3 && (st.phone.includes(digits) || st.guardianPhone.includes(digits) || st.roll.replace(/\D/g, '').includes(digits)));
}

export function profile(id, params) {
  const s = S.get(), st = S.student(id);
  const e = st && S.mainEnrol(id);
  if (!st || !e) return `<div class="page"><div class="empty"><b>এই ছাত্র/ছাত্রী পাওয়া যায়নি</b><a class="btn secondary" href="#/students">তালিকায় ফিরুন</a></div></div>`;
  const d = S.due(e), b = S.batch(e.batchId), c = S.course(e.courseId);
  const teacher = S.isTeacher();
  const tab = params.get('tab') || (teacher ? 'att' : 'fees');
  const miss = S.missingDocs(id);
  const age = Math.floor((S.today() - S.parse(st.dob)) / (365.25 * 86400000));
  const msgs = s.messages.filter(m => m.studentId === id);
  const tabs = (teacher ? [['att', 'উপস্থিতি']] : [['fees', 'কিস্তি ও পেমেন্ট'], ['info', 'তথ্য'], ['docs', 'কাগজপত্র', miss.length], ['att', 'উপস্থিতি'], ['hist', 'মেসেজ ও ইতিহাস']]);
  return `<div class="page">
    <div><a class="btn quiet sm" href="#/students" style="margin-left:-10px">${icon('back')}ছাত্রছাত্রী</a></div>
    <div class="cols prof">
      <div style="display:flex;flex-direction:column;gap:18px;min-width:0">
        <div class="phead">${ava(st, 'lg')}<div><h1>${esc(st.name)}</h1><div class="en">${esc(st.en)} · <b>${st.roll}</b></div>
          <div class="tags"><span>${icon('batch')}${esc(b.code)} · ${esc(c.name)}</span><span>${icon('clock')}${esc(b.days)} · ${S.timeBn(b.time)}</span><span>${icon('seat')}${esc(b.lab)}, পিসি <span class="lat">${String(e.seat).padStart(2, '0')}</span></span></div></div></div>
        ${teacher ? '' : `<div class="pacts"><button class="btn primary" data-collect="${e.id}" ${e.status === 'dropped' || d.total <= 0 ? 'disabled' : ''}>${icon('wallet')}টাকা জমা নিন</button><button class="btn secondary" data-sms="${e.id}">${icon('sms')}SMS</button><button class="btn secondary" data-call="${st.phone}">${icon('phone')}কল</button><button class="btn secondary" data-idcard="${st.id}">${icon('idcard')}আইডি কার্ড</button></div>`}
        ${teacher ? '' : `<div class="duebox ${d.overdue > 0 ? 'owe' : ''}">
          <div class="figs"><div><small>কোর্স ফি</small><b class="money">${tk(d.net)}</b></div><div><small>জমা</small><b class="money paid">${tk(d.paid)}</b></div><div><small>বাকি</small><b class="money">${tk(Math.max(0, d.net - d.paid))}</b></div>${d.overdue > 0 ? `<div><small>সময় পার</small><b class="money late">${tk(d.overdue)}</b></div>` : ''}</div>
          ${planBar(e, true)}
          <div style="font-size:var(--t-small);color:var(--ink-2)">${e.status === 'dropped' ? `কোর্স ছেড়ে দিয়েছে: ${esc(e.dropNote || '')}` : d.total <= 0 ? 'সব কিস্তি পরিশোধিত।' : d.overdue > 0 ? `<b style="color:var(--late)">${d.oldest ? S.S_bnOrd(d.oldest.n) + ' কিস্তি ' + bn(d.lateDays) + ' দিন পার হয়েছে' : 'ভর্তি ফি বাকি'}</b>${d.oldest && d.admissionDue ? ' · ভর্তি ফি ' + tk(d.admissionDue) + ' বাকি' : ''}` : d.next ? `পরের কিস্তি ${tk(d.next.rem)}, ${S.dateBn(d.next.due)} (${S.relDay(d.next.due)})` : `ভর্তি ফি ${tk(d.admissionDue)} বাকি`}</div>
        </div>`}
        <div class="tabs" role="tablist">${tabs.map(([k, l, n]) => `<button role="tab" data-tab="${k}" aria-selected="${tab === k}">${l}${n ? `<em>${bn(n)}</em>` : ''}</button>`).join('')}</div>
        <div id="ptab">${profileTab(tab, st, e, d, msgs)}</div>
      </div>
      <aside style="display:flex;flex-direction:column;gap:14px">
        ${teacher ? '' : certCard(st, e, d)}
        <div class="card"><div class="dl" style="grid-template-columns:1fr">
          <div><dt>অভিভাবক</dt><dd>${esc(st.father)} (${esc(st.guardianRel)})<br><span class="lat">${phoneFmt(st.guardianPhone)}</span></dd></div>
          <div><dt>ফোন</dt><dd class="lat">${phoneFmt(st.phone)}</dd></div>
          <div><dt>বয়স</dt><dd>${bn(age)} বছর${age < 18 ? ' · <span class="st soon">অপ্রাপ্তবয়স্ক</span>' : ''}</dd></div>
          ${c.kind === 'বিটিইবি' ? `<div><dt>বোর্ড রেজি.</dt><dd class="lat">${esc(e.boardReg) || '<span class="st soon">বাকি</span>'}</dd></div>` : ''}
          <div><dt>ভর্তি</dt><dd>${S.dateFull(e.joined)}</dd></div>
        </div></div>
        ${teacher ? '' : `<div class="btnrow"><button class="btn quiet sm" data-edit="${st.id}">${icon('edit')}তথ্য বদলান</button>${e.status === 'running' ? `<button class="btn quiet sm" data-drop="${e.id}" style="color:var(--late)">কোর্স ছেড়ে দিয়েছে</button>` : ''}</div>`}
      </aside>
    </div></div>`;
}

function certCard(st, e, d) {
  const b = S.batch(e.batchId);
  if (e.cert) return `<div class="card pad" style="display:flex;gap:12px;align-items:center;border-color:color-mix(in srgb,var(--seal) 40%,var(--line));background:var(--seal-wash)">${icon('cert')}<div style="flex:1"><b style="font-weight:650;font-size:var(--t-small)">সনদ দেওয়া হয়েছে</b><div class="muted lat" style="font-size:var(--t-micro)">${e.cert.no} · ${S.dateShort(e.cert.at)}</div></div><button class="btn secondary sm" data-cert="${e.id}">দেখুন</button></div>`;
  if (e.status === 'dropped') return '';
  const ended = b.end <= tday() || e.status === 'completed';
  if (d.total > 0) return `<div class="card pad" style="display:flex;flex-direction:column;gap:6px"><b style="font-weight:650;font-size:var(--t-small);display:flex;gap:8px;align-items:center">${icon('cert')}সনদ আটকে আছে</b><span class="muted" style="font-size:var(--t-small)">${tk(d.total)} বাকি থাকা পর্যন্ত সনদ প্রিন্ট হবে না।${ended ? '' : ' কোর্স শেষ ' + S.dateBn(b.end) + '।'}</span></div>`;
  return `<div class="card pad" style="display:flex;flex-direction:column;gap:8px"><b style="font-weight:650;font-size:var(--t-small);display:flex;gap:8px;align-items:center">${icon('cert')}${ended ? 'সনদ দেওয়ার জন্য তৈরি' : 'টাকা পরিশোধিত'}</b><span class="muted" style="font-size:var(--t-small)">${ended ? 'কোনো বকেয়া নেই।' : 'কোর্স শেষ হবে ' + S.dateBn(b.end) + '। তখন সনদ দেওয়া যাবে।'}</span>${ended ? `<button class="btn primary sm" data-cert="${e.id}">সনদ তৈরি করুন</button>` : ''}</div>`;
}

function attHistory(st, e) {
  const s = S.get();
  const sessions = Object.values(s.attendance).filter(a => a.batchId === e.batchId && a.date >= e.joined && (a.closed || a.present.some(p => p.s === st.id))).sort((a, b) => b.date.localeCompare(a.date));
  if (!sessions.length) return `<div class="card"><div class="empty"><b>এখনও হাজিরা নেওয়া হয়নি</b></div></div>`;
  const mark = a => { const p = a.present.find(x => x.s === st.id); return p ? (S.minutesOf(p.t) > S.minutesOf(S.batch(e.batchId).time) + 15 ? ['soon', 'দেরিতে, ' + S.timeBn(p.t)] : ['paid', 'উপস্থিত']) : a.closed ? ['late', 'অনুপস্থিত'] : ['none', 'চলছে']; };
  const abs = sessions.filter(a => mark(a)[0] === 'late').length;
  return `<div class="card"><div style="padding:14px 16px;border-bottom:1px solid var(--line);display:flex;gap:20px;flex-wrap:wrap;font-size:var(--t-small)"><span>মোট ক্লাস <b>${bn(sessions.length)}</b></span><span>উপস্থিত <b style="color:var(--paid)">${bn(sessions.length - abs)}</b></span><span>অনুপস্থিত <b style="color:var(--late)">${bn(abs)}</b></span></div>
    <div class="rows">${sessions.map(a => { const [cls, l] = mark(a); return `<div class="row" style="min-height:48px"><div class="who"><b style="font-weight:500;font-size:var(--t-small)">${S.weekday(a.date)}, ${S.dateBn(a.date)}</b></div><span class="st ${cls}">${l}</span></div>`; }).join('')}</div></div>`;
}

export function profileTab(tab, st, e, d, msgs) {
  if (tab === 'att') return attHistory(st, e);
  if (tab === 'fees') {
    const pays = S.paymentsOf(st.id);
    return `<div style="display:flex;flex-direction:column;gap:18px">
      <div class="card">${e.admission ? `<div class="inst ${d.admissionDue ? 'late' : 'paid'}"><span class="n">${d.admissionDue ? 'ভ' : icon('check')}</span><div><b>ভর্তি ফি</b><small>${S.dateBn(e.joined)}${d.admissionDue && d.admissionDue < e.admission ? ' · ' + tk(d.admissionDue) + ' বাকি' : ''}</small></div><b class="money">${tk(e.admission)}</b></div>` : ''}
      ${d.rows.map(r => `<div class="inst ${r.st}"><span class="n">${r.st === 'paid' ? icon('check') : bn(r.n)}</span><div><b>${S.S_bnOrd(r.n)} কিস্তি${r.label && r.n > 1 ? ' · ' + esc(r.label) : ''}</b><small>${S.dateBn(r.due)} · ${r.st === 'paid' ? 'পরিশোধিত' : r.covered ? `${tk(r.covered)} জমা, ${tk(r.rem)} বাকি` : r.st === 'late' ? `<span style="color:var(--late)">${bn(-r.dd)} দিন পার</span>` : S.relDay(r.due)}</small></div><b class="money">${tk(r.amount)}</b></div>`).join('')}
      ${e.discount ? `<div class="inst"><span class="n">ছা</span><div><b>ছাড়</b><small>${esc(e.discountReason)}</small></div><b class="money">−${tk(e.discount)}</b></div>` : ''}</div>
      <section class="sect"><div class="secthead"><h2>পেমেন্ট</h2></div>
      <div class="card rows">${pays.length ? pays.map(p => `<div class="row" style="${p.void ? 'opacity:.55' : ''}"><div class="who"><b class="money" style="${p.void ? 'text-decoration:line-through' : ''}">${tk(p.amount)}</b><small>${S.dateBn(p.at)} · ${mth(p.method)}${p.trx ? ` <span class="lat">${p.trx}</span>` : ''} · ${p.label || 'কিস্তি'}${p.void ? ' · বাতিল: ' + esc(p.void) : ''}</small></div><span class="lat muted" style="font-size:var(--t-small)">${p.receipt}</span><button class="iconbtn" data-receipt="${p.id}" aria-label="রসিদ">${icon('receipt')}</button></div>`).join('') : '<div class="empty"><b>এখনও কোনো পেমেন্ট নেই</b></div>'}</div></section></div>`;
  }
  if (tab === 'info') {
    const rows = [['পুরো নাম', st.name], ['ইংরেজিতে', `<span class="lat">${esc(st.en)}</span>`], ['পিতা', st.father], ['মাতা', st.mother || '—'], ['জন্মতারিখ', S.dateFull(st.dob)], ['লিঙ্গ', st.gender === 'f' ? 'মহিলা' : 'পুরুষ'], ['রক্তের গ্রুপ', st.blood || '—'], [st.idType || 'পরিচয়পত্র', `<span class="lat">${esc(st.idNo) || '—'}</span>`], ['ঠিকানা', st.address || '—'], ['শিক্ষা', [st.education, st.institution].filter(Boolean).join(', ') || '—'], ['কোথা থেকে জেনেছে', st.source || '—'], ['অভিভাবকের ফোন', `<span class="lat">${phoneFmt(st.guardianPhone)}</span> (${esc(st.guardianRel)})`]];
    return `<div class="card"><dl class="dl">${rows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${String(v).startsWith('<') ? v : esc(v)}</dd></div>`).join('')}</dl></div>`;
  }
  if (tab === 'docs') {
    const docs = S.docsOf(st.id);
    return `<div class="docs">${S.DOC_KINDS.map(k => {
      const dd = docs.filter(x => x.kind === k.id).pop();
      if (dd) return `<div class="doc"><button class="thumb" data-docview="${dd.id}" style="border:0;padding:0" ${dd.type.startsWith('image') ? `data-file="${dd.id}"` : ''} aria-label="${k.label} দেখুন">${icon('file')}</button><div class="cap"><b>${k.label}</b><small>${S.dateShort(dd.at)} · ${bn(Math.max(1, Math.round(dd.size / 1024)))} KB</small></div></div>`;
      return `<label class="doc missing ${k.need ? 'need' : ''}"><span class="thumb">${icon('upload')}${k.need ? 'দরকারি, এখনও নেই' : 'যোগ করুন'}</span><span class="cap"><b>${k.label}</b><small>ছবি তুলুন বা ফাইল দিন</small></span><input type="file" accept="image/*,application/pdf" data-upload="${k.id}" hidden></label>`;
    }).join('')}</div>`;
  }
  const kindL = { overdue: 'বকেয়ার SMS', due: 'কিস্তির SMS', absent: 'অনুপস্থিতির SMS', admission: 'ভর্তির SMS', paid: 'রসিদের SMS', manual: 'SMS' };
  const ev = [
    ...S.paymentsOf(st.id).map(p => ({ at: p.at + (p.time || ''), day: p.at, k: 'pay', t: `${tk(p.amount)} জমা${p.void ? ' (বাতিল)' : ''}`, d: `${methodName[p.method]} · রসিদ ${p.receipt} · ${p.by}${p.void ? ' · বাতিল করেছেন ' + (p.voidBy || '') + ': ' + p.void : ''}` })),
    ...msgs.map(m => ({ at: m.at + (m.time || ''), day: m.at, k: 'sms', t: kindL[m.kind] || 'SMS', d: m.text })),
    { at: e.joined, day: e.joined, k: 'join', t: `${S.batch(e.batchId).code} ব্যাচে ভর্তি`, d: 'রোল ' + st.roll }
  ].sort((a, b) => b.at.localeCompare(a.at));
  return `<div class="card timeline" style="padding:6px 0">${ev.map(x => `<div class="tl ${x.k}"><span class="k">${icon(x.k === 'pay' ? 'wallet' : x.k === 'sms' ? 'sms' : 'students')}</span><div><b>${x.t}</b><small>${S.dateFull(x.day)}</small><p>${esc(x.d)}</p></div></div>`).join('')}</div>`;
}

export function dues(params) {
  const all = dueRows();
  const B = {
    soon: all.filter(x => x.d.overdue === 0 && x.d.next && x.d.next.dd >= 0 && x.d.next.dd <= 3),
    w1: all.filter(x => x.d.overdue > 0 && x.d.lateDays <= 7),
    w4: all.filter(x => x.d.overdue > 0 && x.d.lateDays > 7 && x.d.lateDays <= 30),
    old: all.filter(x => x.d.overdue > 0 && x.d.lateDays > 30)
  };
  const f = params.get('f') || 'w1';
  const sum = (l, k) => l.reduce((a, x) => a + (k === 'soon' ? x.d.next.rem : x.d.overdue), 0);
  const lateTotal = all.reduce((a, x) => a + x.d.overdue, 0);
  const list = (B[f] || all).sort((a, b) => b.d.lateDays - a.d.lateDays || (a.d.next?.dd ?? 0) - (b.d.next?.dd ?? 0));
  return `<div class="page">
    <div class="pagehead"><h1>বকেয়া<span class="sub">সময় পার হয়ে গেছে ${tk(lateTotal)} · কোর্স শেষ পর্যন্ত মোট বাকি ${tk(all.reduce((a, x) => a + x.d.total, 0))}</span></h1><button class="btn secondary" data-export="dues">${icon('upload')}এক্সেল</button></div>
    <div class="buckets" role="group" aria-label="কত দিন পার">
      ${[['soon', 'b1', '৩ দিনের মধ্যে দেয়'], ['w1', 'b2', '১–৭ দিন পার'], ['w4', 'b3', '৮–৩০ দিন পার'], ['old', 'b4', '৩০ দিনের বেশি']].map(([k, c, l]) => `<button class="${c}" data-f="${k}" aria-pressed="${f === k}"><small>${l}</small><b class="money">${tk(sum(B[k], k))}</b><em>${bn(B[k].length)} জন</em></button>`).join('')}
    </div>
    ${list.length ? `<div class="toolbar"><label style="display:flex;align-items:center;gap:8px;font-size:var(--t-small);font-weight:550"><input type="checkbox" class="tick" id="tickall" style="width:20px;height:20px;accent-color:var(--lab)">সবাইকে বেছে নিন</label><span class="muted" style="font-size:var(--t-small);margin-left:auto">${f === 'soon' ? 'এদের কাছে আজ কিছু পাওনা নেই, মনে করিয়ে দিন' : 'সবচেয়ে পুরনো বকেয়া আগে'}</span></div>` : ''}
    <div class="card rows" id="duelist">${list.length ? list.map(x => dueRow(x, { tick: true })).join('') : `<div class="empty">${icon('check')}<b>এই তালিকায় কেউ নেই</b></div>`}</div>
    <div id="bulk"></div></div>`;
}

export function batches() {
  const s = S.get(), t = tday();
  const groups = [['চলমান', s.batches.filter(b => b.start <= t && b.end >= t)], ['শীঘ্রই শুরু', s.batches.filter(b => b.start > t)], ['শেষ হয়েছে', s.batches.filter(b => b.end < t)]];
  const staff = !S.isTeacher();
  return `<div class="page"><div class="pagehead"><h1>ব্যাচ ও কোর্স<span class="sub">${bn(s.courses.length)}টি কোর্স · ${bn(s.batches.length)}টি ব্যাচ</span></h1>${staff ? `<div class="btnrow"><button class="btn secondary" data-newteacher>${icon('plus')}শিক্ষক</button><button class="btn primary" data-newbatch>${icon('plus')}নতুন ব্যাচ</button></div>` : ''}</div>
    ${s.batches.length ? groups.filter(g => g[1].length).map(([g, l]) => `<section class="sect"><div class="secthead"><h2>${g}</h2></div><div class="batchcards stagger">${l.map(b => bcard(b)).join('')}</div></section>`).join('') : `<div class="card"><div class="empty"><b>এখনও কোনো ব্যাচ নেই</b>${staff ? `<button class="btn primary sm" data-newbatch>${icon('plus')}প্রথম ব্যাচ খুলুন</button>` : ''}</div></div>`}
    <section class="sect"><div class="secthead"><h2>কোর্স ও ফি</h2>${staff ? `<button class="linkbtn" data-newcourse>+ নতুন কোর্স</button>` : ''}</div><div class="card rows">${s.courses.length ? s.courses.map(c => `<div class="row ${staff ? 'hov' : ''}" ${staff ? `data-editcourse="${c.id}" role="button" tabindex="0"` : ''}><div class="who"><b>${esc(c.name)}</b><small>${bn(c.months)} মাস${c.hours ? ' · ' + bn(c.hours) + ' ঘণ্টা' : ''} · ${esc(c.kind)}${c.boardFee ? ' · বোর্ড ফি ' + tk(c.boardFee) : ''}</small></div><div class="amt"><b class="money">${tk(c.fee)}</b><small>ভর্তি ${tk(c.admission)} · ${bn(c.inst)} কিস্তি</small></div></div>`).join('') : `<div class="empty"><b>কোনো কোর্স নেই</b></div>`}</div></section>
    ${s.teachers.length ? `<section class="sect"><div class="secthead"><h2>শিক্ষক</h2></div><div class="card rows">${s.teachers.map(x => `<div class="row" style="min-height:52px"><span class="ava sm">${esc(x.name[0])}</span><div class="who"><b>${esc(x.name)}</b><small>${esc(x.subject || '')}</small></div></div>`).join('')}</div></section>` : ''}</div>`;
}

function bcard(b) {
  const c = S.course(b.courseId), n = S.seatsTaken(b.id).length;
  const owe = S.isTeacher() ? 0 : S.get().enrollments.filter(e => e.batchId === b.id && e.status === 'running' && S.due(e).overdue > 0).length;
  const t = tday();
  const span = S.parse(b.end) - S.parse(b.start);
  const prog = span > 0 ? Math.min(1, Math.max(0, (S.today() - S.parse(b.start)) / span)) : 0;
  return `<a class="bcard" href="#/b/${b.id}"><div style="display:flex;justify-content:space-between;align-items:center"><span class="code">${esc(b.code)}</span>${b.start > t ? `<span class="st lab">${S.relDay(b.start)} শুরু</span>` : b.end < t ? '<span class="st none">শেষ</span>' : `<span class="st later">${bn(Math.round(prog * 100))}% সম্পন্ন</span>`}</div>
    <h3>${esc(c.name)}</h3><div class="meta"><span>${icon('clock')}${esc(b.days)} · ${S.timeBn(b.time)}</span><span>${icon('students')}${esc(S.teacher(b.teacher).name)}</span><span>${icon('seat')}${esc(b.lab)}</span></div>
    <div class="fillbar" role="img" aria-label="${bn(n)}/${bn(b.seats)} সিট"><i class="${n >= b.seats ? 'full' : ''}" style="width:${b.seats ? n / b.seats * 100 : 0}%"></i></div>
    <div class="bfoot"><span><b>${bn(n)}</b>/${bn(b.seats)} সিট${n >= b.seats ? ' · পূর্ণ' : ''}</span>${owe ? `<span class="st late">${bn(owe)} জন বকেয়া</span>` : ''}</div></a>`;
}

export function batchPage(id) {
  const s = S.get(), b = s.batches.find(x => x.id === id), t = tday();
  if (!b) return '<div class="page"><div class="empty"><b>ব্যাচ পাওয়া যায়নি</b></div></div>';
  const c = S.course(b.courseId);
  const staff = !S.isTeacher();
  const en = s.enrollments.filter(e => e.batchId === id && e.status !== 'dropped');
  const seats = Array.from({ length: b.seats }, (_, i) => { const e = en.find(x => x.seat === i + 1 && x.status === 'running'); const st = e && S.student(e.studentId); return st ? { e, st, owe: staff && S.due(e).overdue > 0 } : null; });
  const at = S.attOf(id, t);
  const sessions = Object.values(s.attendance).filter(a => a.batchId === id && a.closed).length;
  const bteb = c.kind === 'বিটিইবি';
  const today = S.meetsOn(b, t);
  const attLine = !today ? 'আজ এই ব্যাচের ক্লাস নেই' : at?.closed ? `আজকের হাজিরা শেষ · ${bn(at.present.length)} জন এসেছে, ${bn(at.absent.length)} জন আসেনি` : at?.present.length ? `${bn(at.present.length)}/${bn(en.length)} জন এসেছে, হাজিরা চলছে` : 'আজ ক্লাস আছে, হাজিরা এখনও শুরু হয়নি';
  return `<div class="page"><div><a class="btn quiet sm" href="#/batches" style="margin-left:-10px">${icon('back')}ব্যাচ</a></div>
    <div class="pagehead"><h1><span class="lat" style="color:var(--lab-ink)">${esc(b.code)}</span> · ${esc(c.name)}<span class="sub">${esc(b.days)} · ${S.timeBn(b.time)} · ${esc(S.teacher(b.teacher).name)} · ${S.dateBn(b.start)} থেকে ${S.dateBn(b.end)}</span></h1>
      <div class="btnrow">${staff ? `<button class="btn quiet sm" data-editbatch="${b.id}">${icon('edit')}বদলান</button>` : ''}${today && !at?.closed ? `<button class="btn secondary" data-att="${b.id}">${icon('check')}হাতে হাজিরা</button><a class="btn primary" href="#/scan?b=${b.id}">${icon('qr')}QR স্ক্যান</a>` : ''}${staff && en.length < b.seats ? `<a class="btn ${today && !at?.closed ? 'secondary' : 'primary'}" href="#/admit?b=${b.id}">${icon('plus')}ভর্তি</a>` : ''}</div></div>
    <div class="card pad" style="display:flex;gap:12px;align-items:center;font-size:var(--t-small)">${icon('calendar')}<div style="flex:1">${attLine}</div></div>
    ${bteb ? `<div class="card pad" style="display:flex;gap:12px;align-items:center;font-size:var(--t-small)">${icon('cert')}<div style="flex:1"><b>বিটিইবি ট্রেড: ${bn(en.length)} জন</b> <span class="muted">· কমপক্ষে ৫, সর্বোচ্চ ৫০ জন। ${en.filter(e => !e.boardReg).length ? bn(en.filter(e => !e.boardReg).length) + ' জনের বোর্ড রেজিস্ট্রেশন বাকি' : 'সবার রেজিস্ট্রেশন হয়েছে'}</span></div>${en.length >= 5 && en.length <= 50 ? '<span class="st paid">সীমার মধ্যে</span>' : '<span class="st soon">সীমার বাইরে</span>'}</div>` : ''}
    <div class="cols"><section class="sect"><div class="secthead"><h2>ল্যাবের সিট</h2><span class="muted" style="font-size:var(--t-small)">${bn(seats.filter(Boolean).length)}/${bn(b.seats)}${staff ? ' · লাল দাগ = বকেয়া' : ''}</span></div>
      <div class="seats"><div class="front">সামনে · শিক্ষকের টেবিল · ${esc(b.lab)}</div>${seats.map((x, i) => x ? `<a class="seat taken ${x.owe ? 'owe' : ''}" href="#/s/${x.st.id}" title="${esc(x.st.name)}">${String(i + 1).padStart(2, '0')}<small>${esc(x.st.name.split(' ')[0])}</small></a>` : staff ? `<a class="seat" href="#/admit?b=${b.id}&seat=${i + 1}" title="খালি সিট">${String(i + 1).padStart(2, '0')}</a>` : `<span class="seat">${String(i + 1).padStart(2, '0')}</span>`).join('')}</div></section>
      <aside class="card"><div class="dl" style="grid-template-columns:1fr">${staff ? `<div><dt>কোর্স ফি</dt><dd>${tk(c.fee)}</dd></div>` : ''}<div><dt>হাজিরা নেওয়া</dt><dd>${bn(sessions)}টি ক্লাস</dd></div>${staff ? `<div><dt>এই ব্যাচের বকেয়া</dt><dd class="money late">${tk(en.reduce((a, e) => a + S.due(e).overdue, 0))}</dd></div><div><dt>মোট বাকি</dt><dd>${tk(en.reduce((a, e) => a + S.due(e).total, 0))}</dd></div>` : ''}</div></aside></div>
    <section class="sect"><div class="secthead"><h2>ছাত্রছাত্রী</h2></div><div class="card rows">${en.length ? en.map(e => { const st = S.student(e.studentId); if (!st) return ''; const d = staff ? S.due(e) : null; const here = at?.present.some(p => p.s === st.id); return `<a class="row" href="#/s/${st.id}">${ava(st, 'sm')}<div class="who"><b>${esc(st.name)}</b><small class="lat">${st.roll} · PC ${String(e.seat).padStart(2, '0')}</small></div>${staff ? `<span class="planw" style="width:120px">${planBar(e)}</span>` : ''}<div class="amt">${d && d.total > 0 ? `<b class="money ${d.overdue ? 'late' : ''}">${tk(d.total)}</b>` : ''}${d ? dueLabel(d) : ''}${today ? (here ? '<span class="st paid">আজ এসেছে</span>' : at?.closed ? '<span class="st late">আজ আসেনি</span>' : '') : ''}</div></a>`; }).join('') : `<div class="empty"><b>এই ব্যাচে এখনও কেউ নেই</b></div>`}</div></section></div>`;
}

export function cash(params) {
  const s = S.get(), t = params.get('d') || tday();
  const pays = s.payments.filter(p => p.at === t && !p.void).sort((a, b) => b.receipt.localeCompare(a.receipt, 'en', { numeric: true }));
  const by = m => pays.filter(p => p.method === m).reduce((a, p) => a + p.amount, 0);
  const exps = s.expenses.filter(x => x.at === t);
  const out = exps.reduce((a, x) => a + x.amount, 0);
  const opening = s.centre.opening || 0;
  return `<div class="page"><div class="pagehead"><h1>হিসাব<span class="sub">দিনের জমা, খরচ আর ক্যাশ মেলানো</span></h1>
    <div class="btnrow"><a class="iconbtn" href="#/cash?d=${S.addDays(t, -1)}" aria-label="আগের দিন">${icon('back')}</a><b style="min-width:150px;text-align:center">${t === tday() ? 'আজ, ' : ''}${S.dateBn(t)}</b><a class="iconbtn" href="#/cash?d=${S.addDays(t, 1)}" aria-label="পরের দিন" style="${t >= tday() ? 'visibility:hidden' : ''}">${icon('chev')}</a></div></div>
    <div class="cols"><div style="display:flex;flex-direction:column;gap:20px;min-width:0">
      <div class="card"><div style="padding:16px"><small class="muted" style="font-size:var(--t-small)">মোট জমা</small><div style="font-size:1.75rem;font-weight:700" class="money">${tk(pays.reduce((a, p) => a + p.amount, 0))}</div><small class="muted">${bn(pays.length)}টি রসিদ</small></div>
        <div class="cashsum"><div><small>${mth('cash')}</small><b>${tk(by('cash'))}</b></div><div><small>${mth('bkash')}</small><b>${tk(by('bkash'))}</b></div><div><small>${mth('nagad')}</small><b>${tk(by('nagad'))}</b></div></div></div>
      <section class="sect"><div class="secthead"><h2>রসিদ</h2></div><div class="card rows">${pays.length ? pays.map(p => { const st = S.student(p.studentId); return st ? `<div class="row">${ava(st, 'sm')}<a class="who" href="#/s/${st.id}"><b>${esc(st.name)}</b><small><span class="lat">${p.receipt}</span> · ${mth(p.method)}${p.trx ? ' <span class="lat">' + p.trx + '</span>' : ''}${p.label ? ' · ' + p.label : ''}${p.time ? ' · ' + bn(p.time) : ''}</small></a><b class="money">${tk(p.amount)}</b><button class="iconbtn" data-receipt="${p.id}" aria-label="রসিদ">${icon('receipt')}</button></div>` : ''; }).join('') : '<div class="empty"><b>এই দিনে কোনো জমা নেই</b></div>'}</div></section>
    </div><aside style="display:flex;flex-direction:column;gap:20px">
      <section class="sect"><div class="secthead"><h2>ক্যাশ মেলানো</h2></div><div class="card closing"><div><span>দিনের শুরুতে ড্রয়ারে</span><span class="money">${tk(opening)}</span></div><div><span>ক্যাশে জমা</span><span class="money paid">+${tk(by('cash'))}</span></div><div><span>খরচ</span><span class="money late">−${tk(out)}</span></div><div><span>ড্রয়ারে থাকার কথা</span><span class="money">${tk(opening + by('cash') - out)}</span></div></div>
        <p class="muted" style="font-size:var(--t-micro)">বিকাশ ও নগদের টাকা মোবাইলে আসে, ড্রয়ারে নয়। দিন শেষে মোবাইলের ব্যালেন্সের সাথে মিলিয়ে নিন।${S.isOwner() ? ' ড্রয়ারের শুরুর টাকা সেটিংস থেকে বদলান।' : ''}</p></section>
      <section class="sect"><div class="secthead"><h2>খরচ</h2>${t === tday() ? `<button class="linkbtn" data-expense="${t}">+ খরচ যোগ</button>` : ''}</div><div class="card rows">${exps.length ? exps.map(x => `<div class="row" style="min-height:52px"><div class="who"><b style="font-weight:500">${esc(x.head)}</b>${x.note ? `<small>${esc(x.note)}</small>` : ''}</div><b class="money">${tk(x.amount)}</b></div>`).join('') : '<div class="empty"><b>খরচ নেই</b></div>'}</div></section>
    </aside></div></div>`;
}

export function certs(params) {
  const s = S.get(), t = tday(), f = params.get('f') || 'ready';
  const rows = s.enrollments.filter(e => e.status !== 'dropped').map(e => ({ e, st: S.student(e.studentId), b: S.batch(e.batchId), d: S.due(e) })).filter(x => x.st);
  const ended = rows.filter(x => x.b.end <= t || x.e.status === 'completed');
  const L = { ready: ended.filter(x => !x.e.cert && x.d.total <= 0), held: ended.filter(x => !x.e.cert && x.d.total > 0), given: rows.filter(x => x.e.cert) };
  const list = L[f];
  return `<div class="page"><div class="pagehead"><h1>সনদ<span class="sub">বকেয়া থাকলে সনদ প্রিন্ট হয় না। প্রতিটি সনদে QR কোড, যে কেউ যাচাই করতে পারে।</span></h1></div>
    <div class="seg" role="group">${[['ready', 'দেওয়ার জন্য তৈরি'], ['held', 'বকেয়ার জন্য আটকে'], ['given', 'দেওয়া হয়েছে']].map(([k, l]) => `<button data-f="${k}" aria-pressed="${f === k}">${l} <em>${bn(L[k].length)}</em></button>`).join('')}</div>
    <div class="card rows">${list.length ? list.map(x => `<div class="row">${ava(x.st)}<a class="who" href="#/s/${x.st.id}"><b>${esc(x.st.name)}</b><small><span class="lat">${x.st.roll} · ${esc(x.b.code)}</span> · ${esc(S.course(x.e.courseId).name)}</small></a>${f === 'held' ? `<div class="amt"><b class="money late">${tk(x.d.total)}</b><small>বাকি</small></div><button class="btn secondary sm" data-collect="${x.e.id}">জমা নিন</button>` : f === 'given' ? `<span class="lat muted" style="font-size:var(--t-small)">${x.e.cert.no}</span><button class="btn secondary sm" data-cert="${x.e.id}">${icon('print')}প্রিন্ট</button>` : `<button class="btn primary sm" data-cert="${x.e.id}">সনদ তৈরি</button>`}</div>`).join('') : `<div class="empty"><b>এই তালিকা খালি</b>${f === 'ready' ? 'কোর্স শেষ হলে আর টাকা পরিশোধ হলে এখানে আসবে' : ''}</div>`}</div></div>`;
}

export function enquiries() {
  const s = S.get(), t = tday();
  const open = s.enquiries.filter(q => q.status === 'open');
  const groups = [['আজ বা আগেই কথা ছিল', open.filter(q => q.next && q.next <= t)], ['সামনে', open.filter(q => !q.next || q.next > t)], ['ভর্তি হয়েছেন', s.enquiries.filter(q => q.status === 'won')]];
  const any = groups.some(g => g[1].length);
  return `<div class="page"><div class="pagehead"><h1>ভর্তি জিজ্ঞাসা<span class="sub">ফোনে বা সরাসরি যারা জানতে চেয়েছেন। কাকে কবে আবার ফোন করবেন।</span></h1><button class="btn primary" data-newenq>${icon('plus')}নতুন জিজ্ঞাসা</button></div>
    ${any ? groups.map(([g, l]) => l.length ? `<section class="sect"><div class="secthead"><h2>${g}</h2></div><div class="card rows">${l.map(q => `<div class="row"><span class="ava sm">${esc(q.name.replace('মোঃ ', '')[0])}</span><div class="who"><b>${esc(q.name)}</b><small>${esc(S.course(q.courseId).name)} · ${esc(q.source)}${q.next ? ' · ফোন ' + (q.next < t ? `<span style="color:var(--late)">${S.relDay(q.next)}</span>` : S.relDay(q.next)) : ''}</small>${q.note ? `<small style="white-space:normal;margin-top:2px;color:var(--ink-2)">${esc(q.note)}</small>` : ''}</div><div class="acts">${q.status === 'open' ? `<button class="iconbtn" data-call="${q.phone}" aria-label="কল">${icon('phone')}</button><button class="btn secondary sm" data-later="${q.id}">পরে</button><a class="btn primary sm" href="#/admit?enq=${q.id}">ভর্তি</a>` : '<span class="st paid">ভর্তি</span>'}</div></div>`).join('')}</div></section>` : '').join('') : `<div class="card"><div class="empty"><b>কোনো জিজ্ঞাসা নেই</b>কেউ ফোনে জানতে চাইলে এখানে লিখে রাখুন</div></div>`}</div>`;
}

export function more() {
  const items = S.isTeacher()
    ? [['#/scan', 'qr', 'হাজিরা স্ক্যান', 'আইডি কার্ডের QR'], ['#/batches', 'batch', 'ব্যাচ', 'সিট আর ছাত্রছাত্রী'], ['#/settings', 'settings', 'সেটিংস', 'পাসওয়ার্ড, লগআউট']]
    : [['#/scan', 'qr', 'হাজিরা স্ক্যান', 'আইডি কার্ডের QR'], ['#/batches', 'batch', 'ব্যাচ ও কোর্স', 'সিট, সময়, শিক্ষক'], ['#/cash', 'cash', 'হিসাব', 'দিনের জমা ও খরচ'], ['#/enquiries', 'enquiry', 'ভর্তি জিজ্ঞাসা', 'ফলো-আপ কল'], ['#/certs', 'cert', 'সনদ', 'প্রিন্ট ও যাচাই'], ['#/settings', 'settings', 'সেটিংস', 'সেন্টার, লগইন, পাসওয়ার্ড'], ['/manual/', 'book', 'ব্যবহারের গাইড', 'ছবিসহ ধাপে ধাপে']];
  return `<div class="page"><div class="pagehead"><h1>আরও</h1></div><div class="more-grid stagger">${items.map(([h, i, l, d]) => `<a href="${h}">${icon(i)}<b>${l}</b><small>${d}</small></a>`).join('')}</div></div>`;
}

export function verifyHTML(v) {
  if (!v) return `<div class="verify"><div class="vcard"><div style="padding:28px;text-align:center" class="muted">যাচাই করা হচ্ছে…</div></div></div>`;
  if (!v.ok) return `<div class="verify"><div class="vcard"><div class="vtop bad">${icon('alert')}<div><b>সনদ পাওয়া যায়নি</b><small class="lat">${esc(v.no || '')}</small></div></div><div style="padding:18px 20px;font-size:var(--t-small);color:var(--ink-2)">${v.error ? esc(v.error) : 'এই নম্বরে কোনো সনদ দেওয়া হয়নি। নম্বরটি আবার দেখুন বা সেন্টারে যোগাযোগ করুন।'}</div></div></div>`;
  return `<div class="verify"><div class="vcard"><div class="vtop">${icon('check')}<div><b>সনদটি আসল</b><small>${esc(v.centre.name)} যাচাই করেছে</small></div></div>
    <div style="padding:18px 20px;display:flex;gap:14px;align-items:center;border-bottom:1px solid var(--line)"><span class="ava lg">${esc(v.name[0])}</span><div><b style="font-size:1.125rem">${esc(v.name)}</b><div class="lat muted">${esc(v.en)}</div></div></div>
    <dl class="dl" style="grid-template-columns:1fr"><div><dt>সনদ নম্বর</dt><dd class="lat">${esc(v.no)}</dd></div><div><dt>কোর্স</dt><dd>${esc(v.course)}${v.hours ? ` (${bn(v.hours)} ঘণ্টা)` : ''}</dd></div><div><dt>ব্যাচ</dt><dd class="lat">${esc(v.batch)}</dd></div><div><dt>গ্রেড</dt><dd class="lat">${esc(v.grade)}</dd></div><div><dt>প্রদানের তারিখ</dt><dd>${S.dateFull(v.at)}</dd></div></dl>
    <div style="padding:14px 20px;font-size:var(--t-micro);color:var(--ink-3);border-top:1px solid var(--line)">${esc(v.centre.address || '')}${v.centre.phone ? ` · <span class="lat">${esc(v.centre.phone)}</span>` : ''}</div></div></div>`;
}
