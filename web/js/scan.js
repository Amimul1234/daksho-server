import * as S from './store.js';
import { icon } from './icons.js';
import { $, $$, esc, ava, toast, busy, sheet } from './ui.js';

const { bn, tk } = S;
const QKEY = 'daksho.scanq';
let scanner = null, timer = null, lastCode = '', lastAt = 0, chosen = '', audio = null;

export function stopScan() {
  if (scanner) { try { scanner.stop(); scanner.destroy(); } catch {} scanner = null; }
  clearInterval(timer); timer = null;
  window.removeEventListener('online', flush);
}

const pending = () => { try { return JSON.parse(localStorage.getItem(QKEY) || '[]'); } catch { return []; } };
const setPending = l => { try { localStorage.setItem(QKEY, JSON.stringify(l)); } catch {} };

function todays() {
  const t = S.iso(S.today());
  return S.get().batches.filter(b => S.meetsOn(b, t)).sort((a, b) => a.time < b.time ? -1 : 1);
}

function autoBatch() {
  const now = S.nowMinutes();
  let best = null, bestD = 1e9;
  for (const b of todays()) { const d = Math.abs(now - S.minutesOf(b.time)); if (d < bestD) { bestD = d; best = b; } }
  return best;
}

export function scanPage(params) {
  chosen = params.get('b') || autoBatch()?.id || '';
  const list = todays();
  return `<div class="page scanpage"><div class="pagehead"><h1>হাজিরা স্ক্যান<span class="sub">আইডি কার্ডের QR ক্যামেরার সামনে ধরুন, বা USB স্ক্যানার দিয়ে স্ক্যান করুন</span></h1></div>
    ${list.length ? `<div class="chips" role="group" aria-label="ব্যাচ">${list.map(b => `<button class="chip" data-pick="${b.id}" aria-pressed="${b.id === chosen}">${esc(b.code)} · ${S.timeBn(b.time)}</button>`).join('')}</div>` : `<div class="card pad" style="font-size:var(--t-small)">${icon('calendar')} আজ কোনো ব্যাচের ক্লাস নেই। স্ক্যান করলে জিজ্ঞেস করবে তবুও উপস্থিত ধরবে কিনা।</div>`}
    <div class="scangrid">
      <div class="scanres"><div id="result" class="result idle" aria-live="assertive"><div class="band"><b>প্রস্তুত</b><span>কার্ড স্ক্যান করলে এখানে নাম দেখাবে</span></div></div><div id="pendingline"></div></div>
      <div class="camwrap"><video id="cam" playsinline muted></video><div class="camidle" id="camidle">${icon('qr')}<b>ক্যামেরা বন্ধ</b><button class="btn primary" id="camgo">${icon('qr')}ক্যামেরা চালু করুন</button><small id="camnote"></small></div></div>
      <form id="usbf" class="field scanusb" autocomplete="off"><span>USB স্ক্যানার বা রোল নম্বর</span><div style="display:flex;gap:8px"><input class="inp lat" id="usb" placeholder="স্ক্যান করুন বা DK-26-0001 লিখুন" autocomplete="off"><button class="btn secondary">যোগ</button></div></form>
    </div>
    <section class="sect" id="rollcall"></section></div>`;
}

function beep(ok) {
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    const o = audio.createOscillator(), g = audio.createGain();
    o.frequency.value = ok ? 880 : 220; o.type = 'sine';
    g.gain.setValueAtTime(0.18, audio.currentTime); g.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + (ok ? 0.15 : 0.35));
    o.connect(g); g.connect(audio.destination); o.start(); o.stop(audio.currentTime + (ok ? 0.16 : 0.36));
  } catch {}
  try { navigator.vibrate?.(ok ? 60 : [80, 60, 80]); } catch {}
}

function photo(st) {
  const p = S.docsOf(st.id).filter(x => x.kind === 'photo' && x.type.startsWith('image')).pop();
  return p ? `<span class="ava lg"><img src="${S.fileURL(p.id)}" alt=""></span>` : ava(st, 'lg');
}

function show(r, code) {
  const box = $('#result'); if (!box) return;
  const st = r.student;
  const b = r.batch;
  let cls = 'ok', title = 'উপস্থিত', line = '';
  if (r.status === 'ok' && r.late) { cls = 'late'; title = 'দেরিতে এসেছে'; }
  if (r.status === 'already') { cls = 'already'; title = 'আগেই হাজিরা হয়েছে'; }
  if (r.status === 'unknown') { cls = 'bad'; title = 'কার্ড চেনা যায়নি'; line = 'পুরনো বা অন্য সেন্টারের কার্ড হতে পারে। রোল নম্বর লিখে খুঁজুন।'; }
  if (r.status === 'no_course') { cls = 'bad'; title = 'কোনো চলমান কোর্স নেই'; }
  if (r.status === 'not_today') { cls = 'warn'; title = 'আজ এই ছাত্রের ক্লাস নেই'; line = b ? `${esc(b.code)}: ${esc(b.days)}` : ''; }
  if (r.status === 'wrong_batch') { cls = 'warn'; title = 'অন্য ব্যাচের ছাত্র'; line = (r.options || []).map(o => esc(o.code)).join(', '); }
  if (r.status === 'queued') { cls = 'already'; title = 'নেট নেই, রাখা হলো'; line = 'নেট ফিরলে নিজে যাবে'; }
  const okish = r.status === 'ok' || r.status === 'already';
  box.className = 'result ' + cls;
  box.innerHTML = `<div class="band">${icon(okish ? 'check' : 'alert')}<div><b>${title}</b>${b && okish ? `<span><span class="lat">${esc(b.code)}</span> · ${bn(r.count)}/${bn(r.total)} জন এসেছে${r.notified && r.status === 'ok' ? ' · অভিভাবককে আগেই অনুপস্থিতির SMS গেছে' : ''}</span>` : line ? `<span>${line}</span>` : ''}</div></div>
    ${st ? `<div class="who">${photo(st)}<div><b>${esc(st.name)}</b><small class="lat">${st.roll}</small>${r.overdue ? `<small class="owe">${tk(r.overdue)} বকেয়া · <a href="#/s/${st.id}">দেখুন</a></small>` : ''}</div></div>` : ''}
    ${r.status === 'not_today' ? `<button class="btn secondary block" data-force>তবুও আজ উপস্থিত ধরুন</button>` : ''}
    ${r.status === 'wrong_batch' ? `<div class="btnrow">${(r.options || []).map(o => `<button class="btn secondary sm" data-forceb="${o.id}">${esc(o.code)} এ ধরুন</button>`).join('')}</div>` : ''}`;
  beep(okish && r.status !== 'already');
  const f = $('[data-force]', box);
  if (f) f.onclick = () => send({ code, studentId: st?.id, batchId: b?.id || '', force: true });
  $$('[data-forceb]', box).forEach(x => x.onclick = () => send({ code, studentId: st?.id, batchId: x.dataset.forceb, force: true }));
}

async function send(body, fromQueue) {
  try {
    const r = await S.api('att/scan', body);
    if (r.att) S.merge({ att: [r.att] });
    if (!fromQueue) show(r, body.code);
    drawRoll();
    return true;
  } catch (e) {
    if (e.status === 0) {
      if (!fromQueue) { setPending([...pending(), { ...body, at: Date.now() }]); show({ status: 'queued' }, body.code); }
      drawPending();
      return false;
    }
    if (!fromQueue) { toast(e.message, null, true); beep(false); }
    return e.status >= 400 && e.status < 500;
  }
}

async function flush() {
  const l = pending();
  if (!l.length) return drawPending();
  const left = [];
  for (const it of l) { const done = await send(it, true); if (!done) left.push(it); }
  setPending(left);
  drawPending();
  if (l.length && !left.length) toast(`নেট ছাড়া নেওয়া ${bn(l.length)}টি হাজিরা জমা হয়েছে`);
}

function drawPending() {
  const el = $('#pendingline'); if (!el) return;
  const n = pending().length;
  el.innerHTML = n ? `<div class="card pad" style="font-size:var(--t-small);color:var(--soon)">${icon('alert')} ${bn(n)}টি হাজিরা নেট না থাকায় ফোনে রাখা আছে। নেট এলে নিজে যাবে।</div>` : '';
  const close = $('#closeatt');
  if (close) close.disabled = n > 0;
}

function onCode(code) {
  const now = Date.now();
  if (code === lastCode && now - lastAt < 3000) return;
  lastCode = code; lastAt = now;
  send({ code, batchId: '' });
}

function drawRoll() {
  const el = $('#rollcall'); if (!el) return;
  const b = S.get().batches.find(x => x.id === chosen);
  if (!b) { el.innerHTML = ''; return; }
  const t = S.iso(S.today());
  const at = S.attOf(b.id, t);
  const en = S.enrolledIn(b.id, t).map(e => ({ e, st: S.student(e.studentId) })).filter(x => x.st).sort((a, c) => a.e.seat - c.e.seat);
  const here = new Map((at?.present || []).map(p => [p.s, p]));
  const lateCut = S.minutesOf(b.time) + 15;
  el.innerHTML = `<div class="secthead"><h2><span class="lat">${esc(b.code)}</span> · ${bn(here.size)}/${bn(en.length)} জন এসেছে</h2>${at?.closed ? `<span class="st paid">হাজিরা শেষ${at.notified ? ' · SMS গেছে' : ''}</span>` : ''}</div>
    <div class="card rows">${en.map(({ e, st }) => { const p = here.get(st.id); return `<div class="row" style="min-height:54px">${ava(st, 'sm')}<div class="who"><b>${esc(st.name)}</b><small class="lat">${st.roll} · PC ${String(e.seat).padStart(2, '0')}</small></div>${p ? `<span class="st ${S.minutesOf(p.t) > lateCut ? 'soon' : 'paid'}">${S.timeBn(p.t)}${p.v === 'manual' ? ' · হাতে' : ''}</span>` : at?.closed ? '<span class="st late">আসেনি</span>' : `<button class="btn secondary sm" data-mark="${st.id}">আছে</button>`}</div>`; }).join('') || '<div class="empty"><b>এই ব্যাচে কেউ নেই</b></div>'}</div>
    ${en.length && !at?.closed && S.meetsOn(b, t) ? `<button class="btn primary block" id="closeatt">হাজিরা শেষ করুন</button><p class="muted" style="font-size:var(--t-micro)">শেষ করলে যারা স্ক্যান হয়নি তারা অনুপস্থিত হবে। অভিভাবকের SMS শুধু তখনই যায়, তার আগে না।</p>` : ''}`;
  $$('[data-mark]', el).forEach(x => x.onclick = () => send({ studentId: x.dataset.mark, batchId: b.id }));
  const c = $('#closeatt');
  if (c) c.onclick = () => confirmClose(b, en.length - here.size);
  drawPending();
}

function confirmClose(b, absent) {
  sheet({
    title: 'হাজিরা শেষ করবেন?', sub: `${esc(b.code)} · ${bn(absent)} জন এখনও স্ক্যান হয়নি`,
    body: `<p style="font-size:var(--t-small);color:var(--ink-2)">স্ক্যান না হওয়া ${bn(absent)} জন অনুপস্থিত হিসেবে ধরা হবে। পরে কেউ এলে স্ক্যান করলেই উপস্থিত হয়ে যাবে।</p>
      <label class="setrow" style="padding:0;border:0"><span class="t"><b>অনুপস্থিতদের অভিভাবককে SMS</b><small>"... আজ ক্লাসে আসেনি।"</small></span><span class="switch"><input type="checkbox" id="closesms" ${absent ? 'checked' : ''}><i></i></span></label>`,
    foot: `<button class="btn secondary" data-cancel>এখন না</button><button class="btn primary" id="closego">হাজিরা শেষ</button>`,
    onOpen(dlg) {
      $('[data-cancel]', dlg).onclick = () => dlg.close();
      $('#closego', dlg).onclick = ev => busy(ev.currentTarget, async () => {
        const r = await S.act('att/close', { batchId: b.id, sms: $('#closesms', dlg).checked });
        dlg.close();
        toast(`হাজিরা শেষ${(r.up.message || []).length ? ` · ${bn(r.up.message.length)}টি SMS` : ''}`);
        drawRoll();
      });
    }
  });
}

async function startCam() {
  const note = $('#camnote');
  if (!window.isSecureContext) { note.textContent = 'ক্যামেরার জন্য https লিংক লাগবে। USB স্ক্যানার বা রোল নম্বর ব্যবহার করুন।'; return; }
  try {
    const { default: QrScanner } = await import('../vendor/qr-scanner.min.js');
    if (!(await QrScanner.hasCamera())) { note.textContent = 'এই যন্ত্রে ক্যামেরা পাওয়া যায়নি। USB স্ক্যানার বা রোল নম্বর ব্যবহার করুন।'; return; }
    const video = $('#cam');
    if (!video) return;
    scanner = new QrScanner(video, r => onCode(r.data), { returnDetailedScanResult: true, highlightScanRegion: true, highlightCodeOutline: true, maxScansPerSecond: 8, preferredCamera: 'environment' });
    await scanner.start();
    $('#camidle').hidden = true;
    try { localStorage.setItem('daksho.cam', '1'); } catch {}
  } catch (e) {
    note.textContent = /Permission|NotAllowed/i.test(String(e?.name || e)) ? 'ক্যামেরার অনুমতি দেওয়া হয়নি। ব্রাউজারের ঠিকানার পাশের তালা চিহ্নে চেপে অনুমতি দিন।' : 'ক্যামেরা চালু করা গেল না: ' + (e?.message || e);
  }
}

export function bindScan(root) {
  stopScan();
  $$('[data-pick]', root).forEach(x => x.onclick = () => { chosen = x.dataset.pick; $$('[data-pick]', root).forEach(y => y.setAttribute('aria-pressed', y === x)); history.replaceState(null, '', '#/scan?b=' + chosen); drawRoll(); });
  $('#camgo', root).onclick = startCam;
  let auto = false;
  try { auto = localStorage.getItem('daksho.cam') === '1'; } catch {}
  if (auto) startCam();
  const usb = $('#usb', root);
  $('#usbf', root).onsubmit = ev => {
    ev.preventDefault();
    const v = usb.value.trim(); usb.value = '';
    if (!v) return;
    if (/^[A-Za-z]{1,4}-\d{2}-\d{1,5}$/.test(v)) {
      const st = S.get().students.find(s => s.roll.toLowerCase() === v.toLowerCase());
      if (!st) return show({ status: 'unknown' }, v);
      return send({ studentId: st.id, batchId: '' });
    }
    onCode(v);
  };
  if (matchMedia('(pointer:fine)').matches) usb.focus();
  window.addEventListener('online', flush);
  timer = setInterval(() => { if (pending().length) flush(); }, 15000);
  drawRoll();
  flush();
}
