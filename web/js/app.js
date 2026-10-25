import * as S from './store.js';
import { icon } from './icons.js';
import { $, $$, esc, ava, hydrate, toast, call, busy } from './ui.js';
import * as V from './views.js';
import * as SH from './sheets.js';
import { admit, bindAdmit, smsPage, settings } from './admit.js';
import { scanPage, bindScan, stopScan } from './scan.js';

try { const th = localStorage.getItem('daksho.theme'); if (th) document.documentElement.dataset.theme = th; } catch {}

const LOGO = `<svg width="34" height="34" viewBox="0 0 34 34" aria-hidden="true"><rect width="34" height="34" rx="9" fill="#1D4ED8"/><path d="M9 11.5h9.5a5.5 5.5 0 0 1 0 11H9z" fill="none" stroke="#fff" stroke-width="2.4" stroke-linejoin="round"/><path d="M9 17h7" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/><circle cx="25.5" cy="10" r="2.6" fill="#E0B44E"/></svg>`;

const NAV_STAFF = [
  ['today', '#/', 'আজ', 'today'],
  ['students', '#/students', 'ছাত্রছাত্রী', 'students'],
  ['dues', '#/dues', 'বকেয়া', 'dues'],
  ['sms', '#/sms', 'মেসেজ', 'sms'],
  ['scan', '#/scan', 'হাজিরা স্ক্যান', 'qr'],
  ['batches', '#/batches', 'ব্যাচ ও কোর্স', 'batch'],
  ['cash', '#/cash', 'হিসাব', 'cash'],
  ['enquiries', '#/enquiries', 'ভর্তি জিজ্ঞাসা', 'enquiry'],
  ['certs', '#/certs', 'সনদ', 'cert'],
  ['settings', '#/settings', 'সেটিংস', 'settings']
];
const NAV_TEACHER = [['today', '#/', 'আজ', 'today'], ['scan', '#/scan', 'হাজিরা স্ক্যান', 'qr'], ['batches', '#/batches', 'ব্যাচ', 'batch'], ['settings', '#/settings', 'সেটিংস', 'settings']];
const TITLES = { today: 'আজ', students: 'ছাত্রছাত্রী', dues: 'বকেয়া', sms: 'মেসেজ', batches: 'ব্যাচ ও কোর্স', cash: 'হিসাব', enquiries: 'ভর্তি জিজ্ঞাসা', certs: 'সনদ', settings: 'সেটিংস', more: 'আরও', admit: 'নতুন ভর্তি', s: 'প্রোফাইল', b: 'ব্যাচ', scan: 'হাজিরা স্ক্যান' };
const TEACHER_OK = new Set(['today', 'scan', 'batches', 'b', 's', 'settings', 'more']);

function route() {
  const h = location.hash.slice(1) || '/';
  const [path, qs] = h.split('?');
  const parts = path.split('/').filter(Boolean);
  return { name: parts[0] || 'today', id: parts[1], params: new URLSearchParams(qs || '') };
}

const active = name => ({ s: 'students', b: 'batches', admit: 'students' }[name] || name);

function shell(r, content, enter) {
  const s = S.get(), k = S.isTeacher() ? { lateOwers: 0 } : V.stats(), cur = active(r.name);
  const t = S.iso(S.today());
  const enqN = S.isTeacher() ? 0 : s.enquiries.filter(q => q.status === 'open' && q.next && q.next <= t).length;
  const badge = { dues: k.lateOwers, enquiries: enqN };
  const nav = S.isTeacher() ? NAV_TEACHER : NAV_STAFF;
  const tabs = S.isTeacher() ? ['today', 'scan', 'batches'] : ['today', 'students', 'dues', 'scan'];
  return `<div class="app ${enter ? 'enter' : ''}">
    <aside class="rail"><div class="brand">${LOGO}<div><b>${esc(s.centre.name)}</b><small>দক্ষ · সেন্টার ম্যানেজমেন্ট</small></div></div>
      ${S.isTeacher() ? `<a class="btn primary new" href="#/scan">${icon('qr')}হাজিরা স্ক্যান</a>` : `<a class="btn primary new" href="#/admit">${icon('plus')}নতুন ভর্তি</a>`}
      <nav class="nav">${nav.map(([key, h, l, i], n) => `${n === 5 && !S.isTeacher() ? '<div class="grp">সেন্টার</div>' : ''}<a href="${h}" ${cur === key ? 'aria-current="page"' : ''}>${icon(i)}${l}${badge[key] ? `<em>${S.bn(badge[key])}</em>` : ''}</a>`).join('')}</nav>
      <a class="guide" href="/manual/" target="_blank" rel="noopener">${icon('book')}ব্যবহারের গাইড</a>
      <div class="me"><span class="ava sm">${esc(s.user.name[0])}</span><div><b>${esc(s.user.name)}</b><small>${S.ROLE_LABEL[s.user.role]}</small></div><button class="iconbtn" data-themeflip aria-label="থিম বদলান">${icon(document.documentElement.dataset.theme === 'dark' ? 'sun' : 'moon')}</button></div></aside>
    <div class="main">
      <header class="top">
        <div class="brandm">${LOGO.replace('width="34" height="34"', 'width="30" height="30"')}<b>${esc(s.centre.short)}</b></div>
        ${S.isTeacher() ? '<span class="sp desk"></span>' : `<div class="search"><button data-palette>${icon('search')}নাম, রোল বা ফোন দিয়ে খুঁজুন<kbd>/</kbd></button></div><span class="sp desk"></span><button class="iconbtn mobonly" data-palette aria-label="খুঁজুন">${icon('search')}</button>`}
      </header>
      <main id="view">${content}</main>
    </div>
    <nav class="tabbar">${tabs.map(key => { const n = nav.find(x => x[0] === key); return `<a href="${n[1]}" ${cur === key ? 'aria-current="page"' : ''}>${icon(n[3])}${key === 'scan' ? 'হাজিরা' : n[2]}${badge[key] ? `<span class="badge">${S.bn(badge[key])}</span>` : ''}</a>`; }).join('')}<a href="#/more" ${!tabs.includes(cur) ? 'aria-current="page"' : ''}>${icon('more')}আরও${enqN ? `<span class="badge">${S.bn(enqN)}</span>` : ''}</a></nav>
    <div class="palette" id="pal"><div class="box" role="dialog" aria-label="খুঁজুন"><label class="searchbox">${icon('search')}<span class="sr">খুঁজুন</span><input class="inp" id="palq" placeholder="নাম, রোল বা ফোন নম্বর" autocomplete="off"></label><div class="res" id="palr"></div><div class="hintline"><span>↑↓ বাছুন</span><span>Enter খুলুন</span><span>Esc বন্ধ</span></div></div></div>
  </div>`;
}

function page(r) {
  if (S.isTeacher() && !TEACHER_OK.has(r.name)) return V.today();
  switch (r.name) {
    case 'today': return V.today();
    case 'students': return V.students(r.params);
    case 's': return V.profile(r.id, r.params);
    case 'admit': return admit(r.params, lastName !== 'admit');
    case 'dues': return V.dues(r.params);
    case 'sms': return smsPage();
    case 'scan': return scanPage(r.params);
    case 'batches': return V.batches();
    case 'b': return V.batchPage(r.id);
    case 'cash': return V.cash(r.params);
    case 'enquiries': return V.enquiries();
    case 'certs': return V.certs(r.params);
    case 'settings': return settings();
    case 'more': return V.more();
    default: return V.today();
  }
}

let lastName = null, booted = false;

async function verifyPage(no) {
  document.title = 'সনদ যাচাই';
  document.body.innerHTML = V.verifyHTML(null);
  let v;
  try { v = await S.api('verify/' + encodeURIComponent(no)); }
  catch (e) { v = { ok: false, no, error: e.status === 404 ? '' : e.message }; }
  document.body.innerHTML = V.verifyHTML(v);
  lastName = 'verify';
}

function loginPage(msg) {
  stopScan();
  document.title = 'লগইন · দক্ষ';
  document.body.innerHTML = `<div class="login"><form class="lcard" id="loginf" novalidate>${LOGO}<h1>দক্ষ</h1><p class="muted">ট্রেনিং সেন্টারের হিসাব। আপনার মোবাইল নম্বর আর পাসওয়ার্ড দিয়ে ঢুকুন।</p>
    <label class="field"><span>মোবাইল নম্বর</span><input class="inp lat" name="phone" type="tel" inputmode="numeric" autocomplete="username" required pattern="01[0-9]{9}" placeholder="01XXXXXXXXX"><span class="err">${icon('alert')}১১ সংখ্যার নম্বর</span></label>
    <label class="field"><span>পাসওয়ার্ড</span><input class="inp" name="password" type="password" autocomplete="current-password" required><span class="err">${icon('alert')}পাসওয়ার্ড দিন</span></label>
    <p class="lerr" id="lerr" role="alert">${msg ? esc(msg) : ''}</p>
    <button class="btn primary block">ঢুকুন</button>
    <p class="muted" style="font-size:var(--t-micro);text-align:center">পাসওয়ার্ড ভুলে গেলে সেন্টারের মালিককে বলুন। <a href="/" class="linkbtn">ডেমো দেখুন</a></p></form></div>`;
  const f = $('#loginf');
  setTimeout(() => f.phone.focus(), 50);
  f.onsubmit = ev => {
    ev.preventDefault();
    if (!f.checkValidity()) { $$('input', f).forEach(i => i.toggleAttribute('aria-invalid', !i.checkValidity())); f.querySelector(':invalid')?.focus(); return; }
    busy(f.querySelector('button'), async () => {
      try { await S.api('login', { phone: f.phone.value, password: f.password.value }); }
      catch (e) { $('#lerr').textContent = e.message; throw e; }
      await boot();
    }).catch(() => {});
  };
}

async function boot() {
  document.body.innerHTML = `<div class="login"><div class="lcard" style="align-items:center">${LOGO}<p class="muted">লোড হচ্ছে…</p></div></div>`;
  try { await S.load(); }
  catch (e) { if (e.status === 401) return loginPage(); document.body.innerHTML = `<div class="login"><div class="lcard">${LOGO}<b>${esc(e.message)}</b><button class="btn primary" onclick="location.reload()">আবার চেষ্টা</button></div></div>`; return; }
  booted = true; lastName = null;
  render();
}

function render() {
  const r0 = route();
  if (r0.name === 'verify') { stopScan(); verifyPage(decodeURIComponent(r0.id || '')); return; }
  if (!booted) return;
  const go = () => {
    const r = route();
    if (r.name === 'verify') return;
    stopScan();
    const scrollKeep = lastName === r.name ? window.scrollY : 0;
    document.body.innerHTML = shell(r, page(r), lastName !== r.name);
    document.title = (TITLES[r.name] || 'দক্ষ') + ' · ' + S.get().centre.short;
    hydrate();
    bind(r);
    if (scrollKeep) window.scrollTo(0, scrollKeep); else if (lastName !== r.name) window.scrollTo(0, 0);
    lastName = r.name;
  };
  if (document.startViewTransition && lastName && lastName !== r0.name && !matchMedia('(prefers-reduced-motion: reduce)').matches) { const vt = document.startViewTransition(go); vt.ready.catch(() => {}); vt.finished.catch(() => {}); vt.updateCallbackDone.catch(() => {}); } else go();
}

function bind(r) {
  if (r.name === 'students') {
    const list = $('#stlist'), q = $('#stq'), b = $('#stb');
    const draw = () => { list.innerHTML = V.studentList(r.params); hydrate(list); };
    draw();
    q.addEventListener('input', () => { r.params.set('q', q.value); history.replaceState(null, '', '#/students?' + r.params); draw(); });
    b.addEventListener('change', () => { r.params.set('b', b.value); history.replaceState(null, '', '#/students?' + r.params); draw(); });
    $$('[data-f]').forEach(c => c.onclick = () => { r.params.set('f', c.dataset.f); $$('[data-f]').forEach(x => x.setAttribute('aria-pressed', x === c)); history.replaceState(null, '', '#/students?' + r.params); draw(); });
    list.addEventListener('click', e => { const tr = e.target.closest('tr[data-go]'); if (tr) location.hash = tr.dataset.go; });
    if (r.params.get('q')) q.focus();
  }
  if (r.name === 'dues' || r.name === 'certs') $$('[data-f]').forEach(c => c.onclick = () => { location.hash = '#/' + r.name + '?f=' + c.dataset.f; });
  if (r.name === 'dues') {
    const upd = () => {
      const ids = $$('[data-tick]:checked').map(x => x.dataset.tick);
      const tot = ids.reduce((a, id) => { const d = S.due(S.get().enrollments.find(e => e.id === id)); return a + (d.overdue || d.next?.rem || 0); }, 0);
      $('#bulk').innerHTML = ids.length ? `<div class="bulkbar"><span><b>${S.bn(ids.length)} জন</b> · ${S.tk(tot)}</span><button class="btn primary sm" data-bulksms>${icon('send')}সবাইকে SMS</button></div>` : '';
      const b = $('[data-bulksms]'); if (b) b.onclick = () => SH.sms(ids);
    };
    $('#duelist').addEventListener('change', upd);
    $('#tickall')?.addEventListener('change', e => { $$('[data-tick]').forEach(x => x.checked = e.target.checked); upd(); });
  }
  if (r.name === 's') {
    $$('[data-tab]').forEach(t => t.onclick = () => { r.params.set('tab', t.dataset.tab); history.replaceState(null, '', `#/s/${r.id}?${r.params}`); render(); });
    $('#view').addEventListener('change', async e => { const k = e.target.dataset.upload; if (k && e.target.files[0]) { try { await SH.addDoc(r.id, k, e.target.files[0]); render(); } catch {} } });
  }
  if (r.name === 'admit') bindAdmit($('#view'), render);
  if (r.name === 'scan') bindScan($('#view'));
  if (r.name === 'sms') {
    $$('[data-rs]').forEach(b => b.onclick = () => {
      const rm = { ...S.get().centre.reminders }; const k = b.dataset.rs;
      rm[k] = Math.max(k === 'after' ? 1 : 0, Math.min(30, rm[k] + Number(b.dataset.d)));
      busy(null, () => S.act('settings', { reminders: rm })).then(render).catch(() => {});
    });
    $$('[data-rt]').forEach(i => i.onchange = () => { const rm = { ...S.get().centre.reminders, [i.dataset.rt]: i.checked }; S.act('settings', { reminders: rm }).then(() => toast('সেভ হয়েছে')).catch(e => { toast(e.message, null, true); render(); }); });
  }
  if (r.name === 'settings') {
    const f = $('#centref');
    if (f) f.onsubmit = ev => {
      ev.preventDefault();
      if (!f.checkValidity()) return f.reportValidity();
      busy(f.querySelector('button'), async () => { await S.act('settings', { centre: { name: f.name.value, short: f.short.value, address: f.address.value, phone: f.phone.value, bteb: f.bteb.value, prefix: f.prefix.value, opening: Number(f.opening.value) || 0 } }); toast('সেন্টারের তথ্য সেভ হয়েছে'); render(); }).catch(() => {});
    };
  }
}

function exportCSV(kind) {
  const s = S.get(); let rows;
  if (kind === 'payments') rows = [['receipt', 'date', 'time', 'roll', 'name', 'amount', 'method', 'trx', 'label', 'by', 'void'], ...s.payments.map(p => { const st = S.student(p.studentId) || {}; return [p.receipt, p.at, p.time || '', st.roll, st.en, p.amount, p.method, p.trx, p.label, p.by, p.void || '']; })];
  else if (kind === 'dues') rows = [['roll', 'name', 'phone', 'guardian_phone', 'batch', 'overdue', 'total_due', 'days_late'], ...V.dueRows().map(x => [x.st.roll, x.st.en, x.st.phone, x.st.guardianPhone, x.b.code, x.d.overdue, x.d.total, x.d.lateDays])];
  else rows = [['roll', 'name_bn', 'name_en', 'phone', 'guardian_phone', 'father', 'dob', 'batch', 'course', 'joined', 'status'], ...s.students.map(st => { const e = S.mainEnrol(st.id); return [st.roll, st.name, st.en, st.phone, st.guardianPhone, st.father, st.dob, e ? S.batch(e.batchId).code : '', e ? S.course(e.courseId).en || S.course(e.courseId).name : '', st.joined, e?.status || '']; })];
  const csv = '﻿' + rows.map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = `daksho-${kind}-${S.iso(S.today())}.csv`; a.click();
  toast('ফাইল নামানো হয়েছে');
}

const ACTIONS = '[data-collect],[data-sms],[data-call],[data-receipt],[data-att],[data-idcard],[data-cert],[data-docview],[data-expense],[data-newenq],[data-later],[data-autoq],[data-palette],[data-export],[data-themeflip],[data-theme],[data-newbatch],[data-editbatch],[data-newcourse],[data-editcourse],[data-newteacher],[data-smsgroup],[data-edit],[data-drop],[data-logout],[data-password],[data-newstaff],[data-staffact],[data-staffpw],[data-go]';

document.addEventListener('click', e => {
  const t = e.target.closest(ACTIONS);
  if (!t || !booted || (t.closest('dialog') && !t.matches('[data-receipt],[data-call]'))) return;
  const d = t.dataset;
  if ('collect' in d) SH.collect(d.collect);
  else if ('sms' in d) SH.sms([d.sms]);
  else if ('call' in d) call(d.call);
  else if ('receipt' in d) SH.receipt(d.receipt);
  else if ('att' in d) SH.attendance(d.att);
  else if ('idcard' in d) SH.idcard(d.idcard);
  else if ('cert' in d) SH.cert(d.cert);
  else if ('docview' in d) SH.docView(d.docview);
  else if ('expense' in d) SH.expense(d.expense);
  else if ('newenq' in d) SH.enquiry();
  else if ('later' in d) busy(t, () => S.act('enquiry', { id: d.later, next: S.addDays(S.iso(S.today()), 2) })).then(() => { toast('২ দিন পর আবার মনে করাবে'); render(); }).catch(() => {});
  else if ('autoq' in d) SH.autoList(V.autoQueue());
  else if ('palette' in d) openPalette();
  else if ('export' in d) exportCSV(d.export);
  else if ('newbatch' in d) SH.batchForm();
  else if ('editbatch' in d) SH.batchForm(d.editbatch);
  else if ('newcourse' in d) SH.courseForm();
  else if ('editcourse' in d) SH.courseForm(d.editcourse);
  else if ('newteacher' in d) SH.teacherForm();
  else if ('edit' in d) SH.editStudent(d.edit);
  else if ('drop' in d) SH.drop(d.drop);
  else if ('password' in d) SH.passwordForm();
  else if ('newstaff' in d) SH.staffForm();
  else if ('go' in d) location.hash = d.go;
  else if ('staffpw' in d) SH.staffPassword(d.staffpw);
  else if ('staffact' in d) busy(t, async () => { await S.api('staff', { id: d.staffact, active: d.on === '1' }); S.setStaff(S.get().staff.map(u => u.id === d.staffact ? { ...u, active: d.on === '1' } : u)); toast(d.on === '1' ? 'লগইন চালু হয়েছে' : 'লগইন বন্ধ হয়েছে'); render(); }).catch(() => {});
  else if ('logout' in d) busy(t, () => S.api('logout', {})).finally(() => { booted = false; try { sessionStorage.clear(); } catch {} loginPage(); });
  else if ('smsgroup' in d) { const ids = S.get().enrollments.filter(x => x.status === 'running' && S.due(x).overdue > 0).map(x => x.id); if (ids.length) SH.sms(ids, 'overdue'); }
  else if ('themeflip' in d || 'theme' in d) { const cur = document.documentElement.dataset.theme; const next = 'theme' in d ? d.theme : cur === 'dark' ? 'light' : 'dark'; if (next) document.documentElement.dataset.theme = next; else delete document.documentElement.dataset.theme; try { localStorage.setItem('daksho.theme', next); } catch {} render(); }
});

document.addEventListener('keydown', e => {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  const t = e.target.closest?.('[data-editcourse][role=button]');
  if (t) { e.preventDefault(); t.click(); }
});

let sel = 0;
function openPalette() {
  const p = $('#pal'); if (!p) return;
  p.classList.add('open'); const q = $('#palq'); q.value = ''; drawPal(''); q.focus();
}
function drawPal(v) {
  const s = S.get(), qq = v.trim().toLowerCase();
  const res = qq ? s.students.filter(st => V.matches(st, qq)).slice(0, 8) : s.students.slice(-6).reverse();
  sel = 0;
  $('#palr').innerHTML = (res.length ? res.map((st, i) => { const e = S.mainEnrol(st.id); const d = e ? S.due(e) : { total: 0 }; return `<a class="row ${i === 0 ? 'sel' : ''}" href="#/s/${st.id}" data-i="${i}">${ava(st, 'sm')}<div class="who"><b>${esc(st.name)}</b><small class="lat">${st.roll} · ${st.phone}${e ? ' · ' + esc(S.batch(e.batchId).code) : ''}</small></div>${d.total > 0 ? `<b class="money ${d.overdue ? 'late' : ''}">${S.tk(d.total)}</b>` : ''}</a>`; }).join('') : `<div class="empty"><b>${qq ? 'কাউকে পাওয়া যায়নি' : 'এখনও কেউ ভর্তি হয়নি'}</b></div>`) + (qq || !res.length ? '' : '<div style="padding:8px 16px;font-size:var(--t-micro);color:var(--ink-3)">সাম্প্রতিক ভর্তি</div>');
  hydrate($('#palr'));
}
document.addEventListener('input', e => { if (e.target.id === 'palq') drawPal(e.target.value); });
document.addEventListener('keydown', e => {
  const p = $('#pal');
  if (p?.classList.contains('open')) {
    const rows = $$('#palr .row');
    if (e.key === 'Escape') p.classList.remove('open');
    if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && rows.length) { e.preventDefault(); sel = (sel + (e.key === 'ArrowDown' ? 1 : -1) + rows.length) % rows.length; rows.forEach((r, i) => r.classList.toggle('sel', i === sel)); rows[sel]?.scrollIntoView({ block: 'nearest' }); }
    if (e.key === 'Enter' && rows[sel]) { location.hash = rows[sel].getAttribute('href'); p.classList.remove('open'); }
    return;
  }
  if (!booted || S.isTeacher()) return;
  const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName) || document.querySelector('dialog[open]');
  if (!typing && (e.key === '/' || (e.key === 'k' && (e.metaKey || e.ctrlKey)))) { e.preventDefault(); openPalette(); }
  if (!typing && e.key === 'n' && !e.metaKey && !e.ctrlKey) location.hash = '#/admit';
});
document.addEventListener('click', e => { if (e.target.id === 'pal') e.target.classList.remove('open'); if (e.target.closest('#palr .row')) $('#pal')?.classList.remove('open'); });

window.addEventListener('hashchange', render);
let lastSync = Date.now(), syncing = false;
async function refresh(force) {
  if (!booted || syncing || document.visibilityState !== 'visible') return;
  if (!force && Date.now() - lastSync < 10000) return;
  const r = route();
  if (document.querySelector('dialog[open]') || r.name === 'admit' || r.name === 'scan' || document.querySelector('#pal.open')) return;
  const a = document.activeElement;
  if (a && /INPUT|TEXTAREA|SELECT/.test(a.tagName)) return;
  syncing = true;
  try { await S.load(); lastSync = Date.now(); if (booted && route().name === r.name) render(); }
  catch {}
  finally { syncing = false; }
}
document.addEventListener('visibilitychange', () => refresh());
window.addEventListener('focus', () => refresh());
window.addEventListener('daksho:refresh', () => refresh(true));
setInterval(() => refresh(true), 60000);
window.addEventListener('daksho:401', () => { if (!booted) return; booted = false; document.querySelectorAll('dialog[open]').forEach(d => d.close()); loginPage('অনেকক্ষণ পর এসেছেন, আবার লগইন করুন'); });
S.on(() => {});
if (route().name === 'verify') render(); else boot();
