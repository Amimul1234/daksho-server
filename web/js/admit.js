import * as S from './store.js';
import { icon } from './icons.js';
import { $, $$, esc, toast, syncInvalid, phoneFmt, busy } from './ui.js';
import { upload } from './sheets.js';

const { bn, tk } = S;
const DKEY = 'daksho.app.draft';
let draft = null;
const saveDraft = () => { try { sessionStorage.setItem(DKEY, JSON.stringify(draft)); } catch {} };
const STEPS = ['ছাত্র/ছাত্রীর তথ্য', 'কোর্স ও সিট', 'ফি ও কিস্তি', 'কাগজপত্র', 'দেখে নিন'];

function fresh(params) {
  const s = S.get();
  const q = params.get('enq') ? s.enquiries.find(x => x.id === params.get('enq')) : null;
  const bId = params.get('b');
  const b = bId ? S.batch(bId) : null;
  return { step: 0, enq: q?.id || null, name: q?.name || '', en: '', phone: q?.phone || '', gender: 'm', dob: '', father: '', mother: '', guardianPhone: '', guardianRel: 'বাবা', address: '', idType: 'জন্মনিবন্ধন', idNo: '', education: 'এইচএসসি', institution: '', source: q?.source || 'ফেসবুক', blood: '', courseId: b?.courseId || q?.courseId || '', batchId: b?.id || '', seat: Number(params.get('seat')) || 0, discount: 0, discountReason: '', planKind: 'half', classN: 22, plan: null, payNow: null, method: 'cash', trx: '', sms: true, docs: {} };
}

export function admit(params, entering) {
  if (!draft) { try { draft = JSON.parse(sessionStorage.getItem(DKEY)); } catch {} }
  if (draft && !draft.done && ((draft.courseId && !S.get().courses.some(c => c.id === draft.courseId)) || (draft.batchId && !S.get().batches.some(b => b.id === draft.batchId)))) draft = null;
  if (draft?.done && !S.student(draft.done.sid)) draft = null;
  if (!draft || (entering && draft.done) || params.get('enq') || params.get('b') || params.get('new')) { draft = fresh(params); saveDraft(); history.replaceState(null, '', '#/admit'); }
  if (draft.done) return doneView();
  return `<div class="page" style="max-width:860px"><div class="pagehead"><h1>নতুন ভর্তি<span class="sub">রোল হবে <b class="lat">${S.nextRoll()}</b>${draft.enq ? ' · জিজ্ঞাসা থেকে' : ''}</span></h1>${draft.name || draft.courseId ? '<button class="btn quiet sm" data-wreset>নতুন করে শুরু</button>' : ''}</div>
    <ol class="steps">${STEPS.map((l, i) => `<li data-s="${i < draft.step ? 'done' : i === draft.step ? 'now' : ''}">${bn(i + 1)}. ${l}</li>`).join('')}</ol>
    <form id="wiz" class="wiz" novalidate>${stepBody()}</form></div>`;
}

function stepBody() {
  const s = S.get(), d = draft;
  const nav = (back, next, why = '') => `<div class="wizfoot">${back ? `<button type="button" class="btn secondary" data-wback>${icon('back')}আগের ধাপ</button>` : '<span></span>'}<div style="text-align:right"><button type="submit" class="btn primary" ${why ? 'disabled' : ''}>${next}${icon('chev')}</button>${why ? `<div class="why">${why}</div>` : ''}</div></div>`;
  if (d.step === 0) {
    const sel = (name, opts, v) => `<select class="inp" name="${name}">${opts.map(o => `<option ${o === v ? 'selected' : ''}>${o}</option>`).join('')}</select>`;
    return `<div class="formcard"><h3>ছাত্র/ছাত্রী</h3>
      <div class="photo-pick"><label class="ava lg" style="cursor:pointer" id="ppick" ${d.docs.photo ? `data-file="${d.docs.photo}"` : ''}>${icon('upload')}<input type="file" accept="image/*" capture="user" hidden data-dfile="photo"></label><div style="font-size:var(--t-small)"><b>ছবি</b><div class="muted">ওয়েবক্যাম বা মোবাইলে তুলুন, বা ফাইল দিন। পরেও দেওয়া যাবে।</div></div></div>
      <div class="grid2"><label class="field"><span>নাম (বাংলায়) <i>*</i></span><input class="inp" name="name" required value="${esc(d.name)}" autocomplete="off"><span class="err">${icon('alert')}নাম লিখুন</span></label>
      <label class="field"><span>নাম (ইংরেজিতে, সনদের জন্য) <i>*</i></span><input class="inp lat" name="en" required value="${esc(d.en)}" autocomplete="off" pattern="[A-Za-z .\\-]+" placeholder="Name as on certificate"><span class="err">${icon('alert')}ইংরেজি অক্ষরে লিখুন</span></label></div>
      <div class="grid3"><label class="field"><span>মোবাইল <i>*</i></span><input class="inp lat" name="phone" type="tel" inputmode="numeric" required pattern="01[0-9]{9}" value="${esc(d.phone)}" placeholder="01XXXXXXXXX"><span class="err">${icon('alert')}১১ সংখ্যার নম্বর</span></label>
      <label class="field"><span>জন্মতারিখ <i>*</i></span><input class="inp" name="dob" type="date" required value="${d.dob}" max="${S.addDays(S.iso(S.today()), -365 * 10)}"><span class="err">${icon('alert')}জন্মতারিখ দিন</span></label>
      <div class="field"><span>লিঙ্গ</span><div class="seg wide" role="group">${[['m', 'পুরুষ'], ['f', 'মহিলা']].map(([k, l]) => `<button type="button" data-g="${k}" aria-pressed="${d.gender === k}">${l}</button>`).join('')}</div></div></div>
      <div class="grid2"><label class="field"><span>পরিচয়পত্র</span>${sel('idType', ['জন্মনিবন্ধন', 'এনআইডি', 'নেই'], d.idType)}<span class="hint">এনআইডি না থাকলে জন্মনিবন্ধন যথেষ্ট</span></label><label class="field"><span>নম্বর</span><input class="inp lat" name="idNo" inputmode="numeric" value="${esc(d.idNo)}"></label></div>
      <label class="field"><span>ঠিকানা</span><input class="inp" name="address" value="${esc(d.address)}"></label></div>
      <div class="formcard"><h3>অভিভাবক <small id="minor">${minorNote()}</small></h3>
      <div class="grid2"><label class="field"><span>পিতার নাম <i>*</i></span><input class="inp" name="father" required value="${esc(d.father)}"><span class="err">${icon('alert')}পিতার নাম লিখুন</span></label><label class="field"><span>মাতার নাম</span><input class="inp" name="mother" value="${esc(d.mother)}"></label></div>
      <div class="grid2"><label class="field"><span>অভিভাবকের মোবাইল <i>*</i></span><input class="inp lat" name="guardianPhone" type="tel" inputmode="numeric" required pattern="01[0-9]{9}" value="${esc(d.guardianPhone)}" placeholder="01XXXXXXXXX"><span class="err">${icon('alert')}১১ সংখ্যার নম্বর</span></label><label class="field"><span>সম্পর্ক</span>${sel('guardianRel', ['বাবা', 'মা', 'ভাই', 'বোন', 'স্বামী', 'অন্যান্য'], d.guardianRel)}</label></div></div>
      <div class="formcard"><h3>শিক্ষা ও অন্যান্য</h3><div class="grid3"><label class="field"><span>সর্বশেষ পাস</span>${sel('education', ['অষ্টম শ্রেণি', 'এসএসসি (চলমান)', 'এসএসসি', 'এইচএসসি', 'ডিপ্লোমা', 'স্নাতক (চলমান)', 'স্নাতক', 'স্নাতকোত্তর'], d.education)}</label><label class="field"><span>প্রতিষ্ঠান</span><input class="inp" name="institution" value="${esc(d.institution)}"></label><label class="field"><span>কোথা থেকে জেনেছে</span>${sel('source', ['ফেসবুক', 'পরিচিতজন', 'সাইনবোর্ড', 'লিফলেট', 'পুরনো ছাত্র'], d.source)}</label></div></div>
      ${nav(false, 'কোর্স বাছাই')}`;
  }
  if (d.step === 1) {
    const t = S.iso(S.today());
    const c = d.courseId ? S.course(d.courseId) : null;
    const bs = c ? s.batches.filter(b => b.courseId === c.id && b.end > t) : [];
    const b = d.batchId ? S.batch(d.batchId) : null;
    const taken = b ? S.seatsTaken(b.id) : [];
    if (!s.courses.length) return `<div class="formcard"><div class="empty"><b>এখনও কোনো কোর্স নেই</b>আগে কোর্স আর ব্যাচ যোগ করুন, তারপর ভর্তি।<button type="button" class="btn primary sm" data-newcourse>কোর্স যোগ করুন</button></div></div>${nav(true, 'ফি ঠিক করুন', 'আগে কোর্স যোগ করুন')}`;
    return `<div class="formcard"><h3>কোর্স</h3><div class="pickgrid">${s.courses.map(x => `<button type="button" class="pick" data-course="${x.id}" aria-pressed="${d.courseId === x.id}"><span class="rd"></span><span><b>${esc(x.name)}</b><small>${bn(x.months)} মাস · ${bn(x.hours)} ঘণ্টা · ${x.kind}</small></span><span class="px">${tk(x.fee)}<small><br>ভর্তি ${tk(x.admission)}</small></span></button>`).join('')}</div></div>
      ${c ? `<div class="formcard"><h3>ব্যাচ</h3>${bs.length ? `<div class="pickgrid">${bs.map(x => { const n = S.seatsTaken(x.id).length, full = n >= x.seats; return `<button type="button" class="pick" data-batch="${x.id}" aria-pressed="${d.batchId === x.id}" ${full ? 'disabled' : ''}><span class="rd"></span><span><b><span class="lat">${x.code}</span> · ${x.days}</b><small>${S.timeBn(x.time)} · ${esc(S.teacher(x.teacher).name)} · ${x.start > t ? S.dateBn(x.start) + ' শুরু' : 'চলছে, ' + S.dateBn(x.start) + ' থেকে'}</small></span><span class="px" style="font-weight:600;font-size:var(--t-small)">${full ? '<span class="st late">পূর্ণ</span>' : `${bn(x.seats - n)}টি খালি`}</span></button>`; }).join('')}</div>` : '<div class="empty"><b>এই কোর্সের কোনো খোলা ব্যাচ নেই</b><button type="button" class="btn primary sm" data-newbatch>ব্যাচ খুলুন</button></div>'}</div>` : ''}
      ${b ? `<div class="formcard"><h3>সিট <small>${b.lab} · পিসি বেছে নিন</small></h3><div class="seats"><div class="front">সামনে · শিক্ষকের টেবিল</div>${Array.from({ length: b.seats }, (_, i) => i + 1).map(n => taken.includes(n) ? `<span class="seat taken" aria-label="পিসি ${n} নেওয়া">${String(n).padStart(2, '0')}</span>` : `<button type="button" class="seat ${d.seat === n ? 'mine' : ''}" data-seat="${n}" aria-pressed="${d.seat === n}">${String(n).padStart(2, '0')}</button>`).join('')}</div></div>` : ''}
      ${nav(true, 'ফি ঠিক করুন', !d.courseId ? 'আগে কোর্স বাছুন' : !d.batchId ? 'একটা ব্যাচ বাছুন' : !d.seat ? 'ল্যাবের একটা পিসি বাছুন' : '')}`;
  }
  if (d.step === 2) {
    const c = S.course(d.courseId), b = S.batch(d.batchId);
    const net = c.fee - (Number(d.discount) || 0);
    const start = S.iso(S.today()) > b.start ? S.iso(S.today()) : b.start;
    if (!d.plan || d.planNet !== net || d.planFor !== d.planKind + d.classN) { d.plan = S.presetPlan(d.planKind, net, S.iso(S.today()), c.inst, d.classN); d.payNow = null; d.planNet = net; d.planFor = d.planKind + d.classN; }
    const sum = d.plan.reduce((a, r) => a + (Number(r.amount) || 0), 0);
    const bigDisc = Number(d.discount) > 1000;
    if (d.payNow == null) d.payNow = c.admission + (d.plan[0]?.due === S.iso(S.today()) ? d.plan[0].amount : 0);
    const why = sum !== net ? `কিস্তির যোগফল ${tk(sum)}, কোর্স ফি ${tk(net)} এর সমান হতে হবে` : d.discount > 0 && !d.discountReason ? 'ছাড়ের কারণ লিখুন' : d.method !== 'cash' && !/^[A-Za-z0-9]{8,12}$/.test(d.trx) ? 'ট্রানজেকশন আইডি দিন' : '';
    return `<div class="formcard"><h3>ফি</h3>
      <div class="alloc" style="font-size:var(--t-body)"><div><span>${esc(c.name)} কোর্স ফি</span><b class="money">${tk(c.fee)}</b></div><div><span>ভর্তি ফি (আলাদা)</span><span class="money">${tk(c.admission)}</span></div>${c.boardFee ? `<div><span>বিটিইবি বোর্ড ফি (রেজিস্ট্রেশনের সময়)</span><span class="money">${tk(c.boardFee)}</span></div>` : ''}</div>
      <div class="grid2"><label class="field"><span>ছাড়</span><input class="inp" type="number" inputmode="numeric" min="0" max="${c.fee}" step="50" name="discount" value="${d.discount || ''}" placeholder="০"><span class="hint">${bigDisc ? '<span style="color:var(--soon)">৳১,০০০ এর বেশি ছাড়ে মালিকের অনুমোদন লাগবে</span>' : '৳১,০০০ পর্যন্ত ফ্রন্ট ডেস্ক দিতে পারে'}</span></label>
      <label class="field"><span>ছাড়ের কারণ</span><input class="inp" name="discountReason" list="dr" value="${esc(d.discountReason)}" ${d.discount > 0 ? 'required' : ''}><datalist id="dr"><option>এককালীন পরিশোধ<option>পুরনো ছাত্র<option>ভাই/বোন একই সেন্টারে<option>ফেসবুক অফার</datalist></label></div></div>
      <div class="formcard"><h3>কিস্তির নিয়ম</h3>
      <div class="seg wide" role="group">${[['half', 'অর্ধেক এখন, অর্ধেক পরে'], ['monthly', 'মাসে মাসে'], ['once', 'এককালীন']].map(([k, l]) => `<button type="button" data-plan="${k}" aria-pressed="${d.planKind === k}">${l}</button>`).join('')}</div>
      ${d.planKind === 'half' ? `<label class="field" style="max-width:280px"><span>বাকি অর্ধেক কততম ক্লাসের পর</span><div class="stepper"><button type="button" data-cn="-1" aria-label="কমান">−</button><span>${bn(d.classN)}</span><button type="button" data-cn="1" aria-label="বাড়ান">+</button></div><span class="hint">সপ্তাহে ৩ দিন ক্লাস ধরে তারিখ আন্দাজ করা হয়েছে, বদলাতে পারেন</span></label>` : ''}
      <div class="card" style="border-radius:var(--r-m)">${d.plan.map((r, i) => `<div class="inst"><span class="n">${bn(r.n)}</span><div class="grid2" style="gap:10px"><input class="inp" type="date" data-pd="${i}" value="${r.due}" aria-label="${S.S_bnOrd(r.n)} কিস্তির তারিখ"><input class="inp" type="number" inputmode="numeric" data-pa="${i}" value="${r.amount}" aria-label="${S.S_bnOrd(r.n)} কিস্তির টাকা"></div><small style="min-width:90px;text-align:right">${r.label ? esc(r.label) : S.relDay(r.due)}</small></div>`).join('')}
        <div class="inst" style="background:var(--surface-2)"><span></span><b>মোট</b><b class="money ${sum !== net ? 'late' : ''}">${tk(sum)} / ${tk(net)}</b></div></div></div>
      <div class="formcard"><h3>আজ কত দিচ্ছেন</h3><div class="grid2"><label class="field"><span>টাকা</span><input class="inp money" type="number" inputmode="numeric" name="payNow" min="0" value="${d.payNow}"><span class="hint">ভর্তি ফি ${tk(c.admission)}${d.plan[0]?.due === S.iso(S.today()) ? ' + ১ম কিস্তি ' + tk(d.plan[0].amount) : ''}</span></label>
        <div class="field"><span>মাধ্যম</span><div class="seg wide" role="group">${[['cash', 'ক্যাশ'], ['bkash', 'বিকাশ'], ['nagad', 'নগদ']].map(([k, l]) => `<button type="button" data-pm="${k}" aria-pressed="${d.method === k}">${l}</button>`).join('')}</div></div></div>
        ${d.method !== 'cash' ? `<label class="field" style="max-width:320px"><span>ট্রানজেকশন আইডি <i>*</i></span><input class="inp lat" name="trx" value="${esc(d.trx)}" style="text-transform:uppercase" placeholder="9KD7A2XQ1B" required pattern="[A-Za-z0-9]{8,12}"><span class="err">${icon('alert')}৮–১২ অক্ষর</span></label>` : ''}</div>
      ${nav(true, 'কাগজপত্র', why)}`;
  }
  if (d.step === 3) {
    return `<div class="formcard"><h3>কাগজপত্র <small>ছবি তুলুন বা স্ক্যান করা ফাইল দিন · এখন না থাকলে পরে প্রোফাইল থেকে দেওয়া যাবে</small></h3>
      ${S.DOC_KINDS.filter(k => k.id !== 'other').map(k => `<label class="dropzone ${d.docs[k.id] ? 'has' : ''}"><span class="thumbs" ${d.docs[k.id] ? `data-file="${d.docs[k.id]}"` : ''}>${icon(d.docs[k.id] ? 'check' : 'upload')}</span><span class="t"><b>${k.label}${k.need ? '' : ' <span class="muted" style="font-weight:400">(ঐচ্ছিক)</span>'}</b><small>${d.docs[k.id] ? 'রাখা হয়েছে · বদলাতে ট্যাপ করুন' : k.id === 'nid' ? 'এনআইডি বা জন্মনিবন্ধন সনদ' : k.id === 'ssc' ? 'বিটিইবি রেজিস্ট্রেশনে লাগে' : 'ছবি বা PDF'}</small></span><span class="btn secondary sm">${d.docs[k.id] ? 'বদলান' : 'যোগ করুন'}</span><input type="file" accept="image/*,application/pdf" data-dfile="${k.id}"></label>`).join('')}</div>
      ${nav(true, 'দেখে নিন')}`;
  }
  const c = S.course(d.courseId), b = S.batch(d.batchId);
  const missing = S.DOC_KINDS.filter(k => k.need && !d.docs[k.id]);
  const smsText = S.TEMPLATES.admission.replace('{নাম}', d.name.split(' ')[0]).replace('{রোল}', S.nextRoll()).replace('{সেন্টার}', s.centre.short);
  return `<div class="formcard"><h3>একবার দেখে নিন</h3>
    <div style="display:flex;gap:14px;align-items:center"><span class="ava lg" ${d.docs.photo ? `data-file="${d.docs.photo}"` : ''}>${esc(d.name[0] || '?')}</span><div><b style="font-size:1.125rem">${esc(d.name)}</b><div class="lat muted">${esc(d.en)} · ${S.nextRoll()}</div><div class="muted" style="font-size:var(--t-small)"><span class="lat">${phoneFmt(d.phone)}</span> · অভিভাবক <span class="lat">${phoneFmt(d.guardianPhone)}</span></div></div></div>
    <div class="alloc" style="font-size:var(--t-body)"><div><span>কোর্স</span><b>${esc(c.name)}</b></div><div><span>ব্যাচ</span><span><span class="lat">${b.code}</span> · ${b.days}, ${S.timeBn(b.time)} · পিসি <span class="lat">${String(d.seat).padStart(2, '0')}</span></span></div><div><span>কোর্স ফি</span><span class="money">${tk(c.fee - (d.discount || 0))}${d.discount ? ` <span class="muted">(${tk(d.discount)} ছাড়)</span>` : ''}</span></div><div><span>কিস্তি</span><span>${d.plan.map(r => tk(r.amount) + ' · ' + S.dateShort(r.due)).join('<br>')}</span></div><div class="tot"><span>আজ জমা (${d.method === 'cash' ? 'ক্যাশ' : d.method === 'bkash' ? 'বিকাশ' : 'নগদ'})</span><span class="money">${tk(d.payNow)}</span></div></div>
    ${missing.length ? `<div class="alloc" style="background:var(--soon-wash);border-color:transparent;color:var(--soon)"><div><span>${icon('alert')} বাকি কাগজ: ${missing.map(k => k.label).join(', ')}</span></div></div>` : ''}
    <label class="setrow" style="padding:0;border:0"><span class="t"><b>ভর্তির SMS পাঠান</b><small>${esc(smsText)}</small></span><span class="switch"><input type="checkbox" name="sms" ${d.sms ? 'checked' : ''}><i></i></span></label></div>
    <div class="wizfoot"><button type="button" class="btn secondary" data-wback>${icon('back')}আগের ধাপ</button><button type="submit" class="btn primary">${icon('check')}ভর্তি সম্পন্ন করুন</button></div>`;
}

function minorNote() {
  if (!draft.dob) return '';
  const age = (S.today() - S.parse(draft.dob)) / (365.25 * 864e5);
  return age < 18 ? '· অপ্রাপ্তবয়স্ক, অনুপস্থিতির SMS অভিভাবকের নম্বরে যাবে' : '';
}

function doneView() {
  const st = S.student(draft.done.sid);
  return `<div class="page" style="max-width:640px"><div class="card done"><span class="ok">${icon('check')}</span><h2>ভর্তি সম্পন্ন</h2><p class="muted">${esc(st.name)} · রোল <b class="lat">${st.roll}</b></p>
    <div class="btnrow" style="justify-content:center;margin-top:8px">${draft.done.pid ? `<button class="btn primary" data-receipt="${draft.done.pid}">${icon('receipt')}রসিদ প্রিন্ট</button>` : ''}<button class="btn secondary" data-idcard="${st.id}">${icon('idcard')}আইডি কার্ড</button><a class="btn secondary" href="#/s/${st.id}">প্রোফাইল</a></div>
    <a class="btn quiet" href="#/admit?new=1" style="margin-top:6px">${icon('plus')}আরেকজন ভর্তি</a></div></div>`;
}

export function bindAdmit(root, rerender) {
  const f = $('#wiz', root);
  $('[data-wreset]', root)?.addEventListener('click', () => { draft = fresh(new URLSearchParams()); saveDraft(); rerender(); });
  if (!f) return;
  syncInvalid(f);
  const d = draft;
  const pull = () => { new FormData(f).forEach((v, k) => { if (k in d && typeof v === 'string') d[k] = ['discount', 'payNow'].includes(k) ? Number(v) || 0 : v; }); if (f.sms) d.sms = f.sms.checked; saveDraft(); };
  f.addEventListener('input', e => {
    pull();
    if (e.target.name === 'dob') $('#minor', root).textContent = minorNote();
    if (['discount', 'discountReason', 'trx'].includes(e.target.name)) { clearTimeout(f._t); f._t = setTimeout(() => { const pos = e.target.selectionStart, n = e.target.name; rerender(); const el = $(`[name="${n}"]`); if (el) { el.focus(); try { el.setSelectionRange(pos, pos); } catch {} } }, 450); }
  });
  f.addEventListener('change', async e => {
    const k = e.target.dataset.dfile;
    if (k && e.target.files[0]) {
      const file = e.target.files[0];
      e.target.value = '';
      try {
        toast('ফাইল যাচ্ছে…');
        const doc = await upload(k, file, '');
        d.docs[k] = doc.id; saveDraft(); pull(); rerender();
        toast(S.DOC_KINDS.find(x => x.id === k).label + ' রাখা হয়েছে');
      } catch (err) { toast(err.message, null, true); }
    }
    const pd = e.target.dataset.pd, pa = e.target.dataset.pa;
    if (pd != null) { d.plan[pd].due = e.target.value; d.plan[pd].label = ''; saveDraft(); }
    if (pa != null) { d.plan[pa].amount = Number(e.target.value) || 0; saveDraft(); rerender(); }
  });
  root.addEventListener('click', e => {
    const t = e.target.closest('button'); if (!t || !root.contains(t)) return;
    if (t.dataset.g) { d.gender = t.dataset.g; $$('[data-g]', root).forEach(x => x.setAttribute('aria-pressed', x === t)); saveDraft(); }
    if (t.dataset.course) { pull(); d.courseId = t.dataset.course; d.batchId = ''; d.seat = 0; d.plan = null; d.payNow = null; saveDraft(); rerender(); }
    if (t.dataset.batch) { pull(); d.batchId = t.dataset.batch; d.seat = 0; saveDraft(); rerender(); }
    if (t.dataset.seat) { d.seat = Number(t.dataset.seat); saveDraft(); rerender(); }
    if (t.dataset.plan) { pull(); d.planKind = t.dataset.plan; d.plan = null; d.payNow = null; saveDraft(); rerender(); }
    if (t.dataset.cn) { d.classN = Math.max(4, Math.min(60, d.classN + Number(t.dataset.cn))); d.plan = null; saveDraft(); rerender(); }
    if (t.dataset.pm) { pull(); d.method = t.dataset.pm; saveDraft(); rerender(); }
    if (t.hasAttribute('data-wback')) { pull(); d.step--; saveDraft(); rerender(); window.scrollTo({ top: 0 }); }
  });
  f.addEventListener('submit', e => {
    e.preventDefault(); pull();
    if (!f.checkValidity()) { $$('input,select', f).forEach(i => i.toggleAttribute('aria-invalid', !i.checkValidity())); f.querySelector(':invalid')?.focus(); return; }
    if (d.step < 4) { d.step++; saveDraft(); rerender(); window.scrollTo({ top: 0 }); return; }
    busy(f.querySelector('button[type=submit]'), async () => { await finish(); rerender(); window.scrollTo({ top: 0 }); }).catch(() => {});
  });
}

async function finish() {
  const d = draft;
  const r = await S.act('admit', {
    student: { name: d.name, en: d.en, phone: d.phone, gender: d.gender, dob: d.dob, father: d.father, mother: d.mother, guardianPhone: d.guardianPhone, guardianRel: d.guardianRel, address: d.address, idType: d.idType, idNo: d.idNo, education: d.education, institution: d.institution, source: d.source, blood: d.blood },
    courseId: d.courseId, batchId: d.batchId, seat: d.seat, discount: Number(d.discount) || 0, discountReason: d.discountReason,
    plan: d.plan.map(x => ({ amount: Number(x.amount) || 0, due: x.due, label: x.label || '' })),
    payNow: Number(d.payNow) || 0, method: d.method, trx: d.trx, sms: !!d.sms, docs: d.docs, enquiryId: d.enq || ''
  });
  const st = r.up.student[0];
  const pays = r.up.payment || [];
  const m = (r.up.message || [])[0];
  draft = { done: { sid: st.id, pid: pays.length ? pays[pays.length - 1].id : null } }; saveDraft();
  toast('ভর্তি সম্পন্ন · রোল ' + st.roll + (m && m.status === 'demo' ? ' · ডেমো নম্বর, SMS যায়নি' : ''));
}

export function smsPage() {
  const s = S.get(), r = s.centre.reminders;
  const recent = s.messages.slice(0, 60);
  const kindL = { overdue: 'বকেয়া', due: 'আসন্ন কিস্তি', absent: 'অনুপস্থিত', admission: 'ভর্তি', paid: 'রসিদ', manual: 'নিজে পাঠানো' };
  const stL = { delivered: ['paid', 'পৌঁছেছে'], sent: ['paid', 'গেছে'], queued: ['soon', 'যাচ্ছে'], logged: ['none', 'গেটওয়ে বন্ধ'], demo: ['none', 'ডেমো নম্বর'], failed: ['late', 'যায়নি'] };
  const owner = S.isOwner();
  const step = (k, v, l) => `<div class="setrow"><div class="t"><b>${l}</b></div><div class="stepper"><button data-rs="${k}" data-d="-1" aria-label="কমান" ${owner ? '' : 'disabled'}>−</button><span>${bn(v)}</span><button data-rs="${k}" data-d="1" aria-label="বাড়ান" ${owner ? '' : 'disabled'}>+</button></div></div>`;
  const sample = { name: 'রাকিব হোসেন', roll: (s.centre.prefix || 'DK') + '-26-0001' };
  return `<div class="page"><div class="pagehead"><h1>মেসেজ<span class="sub">অটো রিমাইন্ডার, টেমপ্লেট আর পাঠানো SMS</span></h1>${s.enrollments.some(e => e.status === 'running' && S.due(e).overdue > 0) ? `<button class="btn primary" data-smsgroup>${icon('send')}সব বকেয়াকে SMS</button>` : ''}</div>
    <div class="cols"><div style="display:flex;flex-direction:column;gap:20px;min-width:0">
      <section class="sect"><div class="secthead"><h2>টেমপ্লেট</h2><span class="muted" style="font-size:var(--t-small)">বাংলা SMS ৭০ অক্ষরে একটা</span></div>
        <div class="card rows">${Object.entries(S.TEMPLATES).map(([k, v]) => { const text = v.replace('{নাম}', 'রাকিব').replace('{টাকা}', '২,০০০').replace('{তারিখ}', '২৮ অক্টো').replace('{রোল}', sample.roll).replace('{রসিদ}', 'R-1012').replace('{বাকি}', '৩,৫০০').replace('{সেন্টার}', s.centre.short); const p = S.smsParts(text); return `<div class="row" style="align-items:flex-start"><div class="who"><b>${kindL[k]}</b><small style="white-space:normal;color:var(--ink-2);font-size:var(--t-small)">${esc(text)}</small></div><span class="st ${p.parts > 1 ? 'soon' : 'paid'}">${bn(p.len)} অক্ষর · ${bn(p.parts)} SMS</span></div>`; }).join('')}</div></section>
      <section class="sect"><div class="secthead"><h2>পাঠানো SMS</h2></div><div class="card rows">${recent.length ? recent.map(m => { const st = S.student(m.studentId); const [c, l] = stL[m.status] || ['none', m.status]; return `<div class="row" style="align-items:flex-start"><div class="who"><b>${esc(st?.name || '')} <span class="muted" style="font-weight:400;font-size:var(--t-micro)">· ${kindL[m.kind] || ''} · ${S.relDay(m.at)}${m.time ? ' ' + bn(m.time) : ''} · <span class="lat">${phoneFmt(m.to)}</span></span></b><small style="white-space:normal">${esc(m.text)}</small></div><span class="st ${c}">${l}</span></div>`; }).join('') : '<div class="empty"><b>এখনও কোনো SMS যায়নি</b></div>'}</div></section>
    </div><aside style="display:flex;flex-direction:column;gap:20px">
      <div class="auto"><h3><span class="live" style="${s.smsLive ? '' : 'background:#E0B44E;box-shadow:0 0 0 4px rgba(224,180,78,.2)'}"></span>${s.smsLive ? 'SMS গেটওয়ে চালু' : 'SMS গেটওয়ে এখনও চালু হয়নি'}</h3><p>${s.smsLive ? `প্রেরক নাম <b class="lat">${esc(s.centre.sender || s.centre.short)}</b>` : 'সেন্টারের SMS ব্যালেন্স যোগ হলে সব মেসেজ আসলে যাবে। ততক্ষণ সব কিছু লেখা থাকছে, কিছু হারাবে না।'}</p><div class="meta"><span>এ পর্যন্ত <b>${num(s.centre.smsUsed || 0)}</b> SMS</span><span>প্রতিটি প্রায় <b>৳${bn((s.centre.smsRate || 0.35).toFixed(2))}</b></span></div></div>
      <section class="sect"><div class="secthead"><h2>অটো রিমাইন্ডার</h2></div><div class="card">
        ${step('before', r.before, 'কিস্তির কত দিন আগে')}
        <div class="setrow"><div class="t"><b>কিস্তির দিন</b></div><label class="switch"><input type="checkbox" data-rt="onDay" ${r.onDay ? 'checked' : ''} ${owner ? '' : 'disabled'} aria-label="কিস্তির দিন"><i></i></label></div>
        ${step('after', r.after, 'পার হলে কত দিন পর')}
        ${step('repeat', r.repeat, 'তারপর প্রতি কত দিনে')}
        <div class="setrow"><div class="t"><b>সব অটো SMS সন্ধ্যা ৭টায় যায়</b><small>রাতে বা সকালে কাউকে বিরক্ত করে না</small></div></div>
      </div>${owner ? '' : '<p class="muted" style="font-size:var(--t-micro)">নিয়ম বদলাতে পারেন শুধু মালিক।</p>'}</section></aside></div></div>`;
}

export function settings() {
  const s = S.get(), c = s.centre, owner = S.isOwner();
  const fld = (l, n, v, extra = '') => `<label class="field"><span>${l}</span><input class="inp" name="${n}" value="${esc(v ?? '')}" ${extra}></label>`;
  const theme = document.documentElement.dataset.theme || '';
  return `<div class="page" style="max-width:860px"><div class="pagehead"><h1>সেটিংস<span class="sub">${esc(s.user.name)} · ${S.ROLE_LABEL[s.user.role]} · <span class="lat">${phoneFmt(s.user.phone)}</span></span></h1><button class="btn secondary" data-logout>${icon('logout')}লগআউট</button></div>
    ${owner ? `<section class="sect"><div class="secthead"><h2>সেন্টার</h2></div><form class="formcard" id="centref" novalidate>
      <div class="grid2">${fld('সেন্টারের পুরো নাম <i>*</i>', 'name', c.name, 'required')}${fld('ছোট নাম (SMS-এর শেষে) <i>*</i>', 'short', c.short, 'required maxlength="14"')}</div>
      ${fld('ঠিকানা', 'address', c.address)}
      <div class="grid3">${fld('ফোন', 'phone', c.phone, 'class="inp lat" inputmode="tel"')}${fld('বিটিইবি কোড', 'bteb', c.bteb)}${fld('রোলের শুরুর অক্ষর', 'prefix', c.prefix, 'class="inp lat" maxlength="4" pattern="[A-Za-z]{1,4}" style="text-transform:uppercase"')}</div>
      ${fld('দিনের শুরুতে ড্রয়ারে কত টাকা থাকে', 'opening', c.opening || 0, 'type="number" inputmode="numeric" min="0"')}
      <div><button class="btn primary">সেভ করুন</button></div></form></section>
    <section class="sect"><div class="secthead"><h2>লগইন</h2><button class="linkbtn" data-newstaff>+ নতুন লগইন</button></div><div class="card rows">${s.staff.map(u => `<div class="row"><span class="ava sm">${esc(u.name[0])}</span><div class="who"><b>${esc(u.name)}</b><small>${S.ROLE_LABEL[u.role]} · <span class="lat">${phoneFmt(u.phone)}</span></small></div>${u.id === s.user.id ? '<span class="st lab">আপনি</span>' : `<button class="btn secondary sm" data-staffpw="${u.id}">পাসওয়ার্ড</button><button class="btn ${u.active ? 'danger' : 'secondary'} sm" data-staffact="${u.id}" data-on="${u.active ? 0 : 1}">${u.active ? 'বন্ধ করুন' : 'চালু করুন'}</button>`}</div>`).join('')}</div></section>` : ''}
    <section class="sect"><div class="secthead"><h2>আপনার অ্যাকাউন্ট</h2></div><div class="card">
      <div class="setrow"><div class="t"><b>পাসওয়ার্ড বদলান</b></div><button class="btn secondary sm" data-password>বদলান</button></div>
      <div class="setrow"><div class="t"><b>থিম</b></div><div class="seg">${[['', 'স্বয়ংক্রিয়'], ['light', 'আলো'], ['dark', 'অন্ধকার']].map(([k, l]) => `<button data-theme="${k}" aria-pressed="${theme === k}">${l}</button>`).join('')}</div></div>
      ${S.isTeacher() ? '' : `<div class="setrow"><div class="t"><b>এক্সেলে নামান</b><small>ছাত্রছাত্রী, পেমেন্ট, বকেয়া (CSV)</small></div><button class="btn secondary sm" data-export="students">ছাত্রছাত্রী</button><button class="btn secondary sm" data-export="payments">পেমেন্ট</button></div>`}
      <div class="setrow"><div class="t"><b>ব্যবহারের গাইড</b><small>ছবিসহ ধাপে ধাপে</small></div><a class="btn secondary sm" href="/manual/" target="_blank" rel="noopener">খুলুন</a></div>
    </div></section></div>`;
}
