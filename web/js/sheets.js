import * as S from './store.js';
import { icon } from './icons.js';
import { $, $$, esc, ava, sheet, toast, printHTML, qrSVG, mth, methodName, isDemoNumber, phoneFmt, hydrate, syncInvalid, busy } from './ui.js';

const { bn, tk } = S;
const rerender = () => window.dispatchEvent(new HashChangeEvent('hashchange'));
const smsNote = m => m.status === 'demo' ? 'ডেমো নম্বর, SMS যায়নি' : m.status === 'logged' ? 'SMS গেটওয়ে চালু হয়নি, শুধু লেখা থাকল' : m.status === 'failed' ? 'নম্বর ঠিক নেই, SMS যায়নি' : 'SMS যাচ্ছে';

function invalid(f) {
  if (f.checkValidity()) return false;
  $$('input,select,textarea', f).forEach(i => i.toggleAttribute('aria-invalid', !i.checkValidity()));
  f.querySelector(':invalid')?.focus();
  return true;
}

export function collect(eid) {
  const e = S.get().enrollments.find(x => x.id === eid), st = S.student(e.studentId), d = S.due(e);
  if (d.total <= 0) return toast('কোনো টাকা বাকি নেই');
  const suggest = d.overdue > 0 ? d.overdue : d.next ? d.next.rem : d.admissionDue;
  sheet({
    title: 'টাকা জমা নিন', sub: `${esc(st.name)} · <span class="lat">${st.roll}</span>`,
    body: `<form id="payf" class="sh-body" style="padding:0;gap:16px" novalidate>
      <label class="field"><span>টাকার পরিমাণ <i>*</i></span><input class="inp money" name="amount" type="number" inputmode="numeric" min="1" max="${d.total}" required value="${suggest || ''}"><span class="err">${icon('alert')}১ থেকে ${tk(d.total)} এর মধ্যে লিখুন</span></label>
      <div class="chips">${[d.overdue && ['সব বকেয়া', d.overdue], d.next && ['পরের কিস্তি', d.next.rem], ['পুরো বাকি', d.total]].filter(Boolean).filter((x, i, a) => a.findIndex(y => y[1] === x[1]) === i).map(([l, v]) => `<button type="button" class="chip" data-amt="${v}">${l} ${tk(v)}</button>`).join('')}</div>
      <div class="field"><span>কীভাবে দিলেন</span><div class="seg wide" role="group">${['cash', 'bkash', 'nagad'].map((m, i) => `<button type="button" data-m="${m}" aria-pressed="${i === 0}">${mth(m)}</button>`).join('')}</div></div>
      <label class="field" id="trxf" hidden><span>ট্রানজেকশন আইডি (TrxID) <i>*</i></span><input class="inp lat" name="trx" placeholder="যেমন 9KD7A2XQ1B" autocomplete="off" pattern="[A-Za-z0-9]{8,12}" style="text-transform:uppercase"><span class="hint">মোবাইলে আসা মেসেজ থেকে। এতে পরে মিলিয়ে দেখা যায়।</span><span class="err">${icon('alert')}৮–১২ অক্ষরের আইডি লিখুন</span></label>
      <div class="alloc" id="alloc"></div>
      <label class="setrow" style="padding:0;border:0"><span class="t"><b>SMS-এ রসিদ পাঠান</b><small class="lat">${phoneFmt(st.phone)}</small></span><span class="switch"><input type="checkbox" name="sms" checked><i></i></span></label>
    </form>`,
    foot: `<button class="btn secondary" data-cancel>বাতিল</button><button class="btn primary" form="payf" type="submit" id="paybtn">${icon('check')}জমা করুন</button>`,
    onOpen(dlg) {
      const f = $('#payf', dlg); let method = 'cash';
      syncInvalid(f);
      const amt = f.amount, trx = f.trx;
      const draw = () => {
        const a = Number(amt.value) || 0; let left = a; const lines = [];
        if (d.admissionDue && left > 0) { const c = Math.min(left, d.admissionDue); left -= c; lines.push(['ভর্তি ফি', c, c === d.admissionDue]); }
        for (const r of d.rows) { if (left <= 0) break; if (!r.rem) continue; const c = Math.min(left, r.rem); left -= c; lines.push([S.S_bnOrd(r.n) + ' কিস্তি', c, c === r.rem]); }
        $('#alloc', dlg).innerHTML = a ? lines.map(([l, c, full]) => `<div><span>${l}${full ? '' : ' (আংশিক)'}</span><b class="money">${tk(c)}</b></div>`).join('') + `<div class="tot"><span>এরপর বাকি থাকবে</span><span class="money">${tk(Math.max(0, d.total - a))}</span></div>` : '<span class="muted">টাকার পরিমাণ লিখলে দেখাবে কোন কিস্তিতে যাবে</span>';
        $('#paybtn', dlg).innerHTML = `${icon('check')}${a ? tk(a) + ' ' : ''}জমা করুন`;
      };
      draw(); amt.addEventListener('input', draw);
      $$('[data-amt]', dlg).forEach(b => b.onclick = () => { amt.value = b.dataset.amt; draw(); });
      $$('[data-m]', dlg).forEach(b => b.onclick = () => { method = b.dataset.m; $$('[data-m]', dlg).forEach(x => x.setAttribute('aria-pressed', x === b)); $('#trxf', dlg).hidden = method === 'cash'; trx.required = method !== 'cash'; if (method !== 'cash') trx.focus(); });
      $('[data-cancel]', dlg).onclick = () => dlg.close();
      setTimeout(() => { amt.focus(); amt.select(); }, 60);
      f.onsubmit = ev => {
        ev.preventDefault();
        if (invalid(f)) return;
        const a = Number(amt.value);
        busy($('#paybtn', dlg), async () => {
          const r = await S.act('pay', { enrollmentId: eid, amount: a, method, trx: trx.value.trim(), sms: f.sms.checked });
          const pays = r.up.payment || [];
          const p = pays[pays.length - 1];
          dlg.close();
          const m = (r.up.message || [])[0];
          toast(`${tk(a)} জমা হয়েছে · রসিদ ${p.receipt}${m ? ' · ' + smsNote(m) : ''}`);
          rerender();
          setTimeout(() => receipt(p.id), 200);
        });
      };
    }
  });
}

export function receiptHTML(p) {
  const s = S.get(), st = S.student(p.studentId), e = s.enrollments.find(x => x.id === p.enrollmentId), d = S.due(e), c = S.course(e.courseId), b = S.batch(e.batchId);
  return `<div class="receipt"><h3>${esc(s.centre.name)}</h3><div class="c" style="font-size:8pt">${esc(s.centre.address)}${s.centre.phone ? `<br><span class="lat">${esc(s.centre.phone)}</span>` : ''}</div>
    <div class="ln"></div><div class="c" style="font-weight:700">টাকা জমার রসিদ${p.void ? ' (বাতিল)' : ''}</div>
    <div class="r"><span>রসিদ</span><b class="lat">${p.receipt}</b></div><div class="r"><span>তারিখ</span><span>${S.dateFull(p.at)}${p.time ? ', ' + bn(p.time) : ''}</span></div>
    <div class="ln"></div><div class="r"><span>নাম</span><b>${esc(st.name)}</b></div><div class="r"><span>রোল</span><span class="lat">${st.roll}</span></div><div class="r"><span>কোর্স</span><span>${esc(c.name)}</span></div><div class="r"><span>ব্যাচ</span><span class="lat">${esc(b.code)}</span></div>
    <div class="ln"></div><div class="r"><span>${p.label || 'কিস্তি'}</span><span class="big">${tk(p.amount)}</span></div><div class="r"><span>মাধ্যম</span><span>${methodName[p.method]}${p.trx ? ' <span class="lat">' + p.trx + '</span>' : ''}</span></div>
    <div class="ln"></div><div class="r"><span>মোট কোর্স ফি</span><span>${tk(d.net)}</span></div><div class="r"><span>এ পর্যন্ত জমা</span><span>${tk(d.paid)}</span></div><div class="r"><b>বাকি</b><b>${tk(Math.max(0, d.total))}</b></div>${d.next ? `<div class="r"><span>পরের কিস্তি</span><span>${tk(d.next.rem)}, ${S.dateShort(d.next.due)}</span></div>` : ''}
    <div class="ln"></div><div class="r" style="font-size:8pt"><span>গ্রহণকারী: ${esc(p.by)}</span><span>${p.void ? 'বাতিল: ' + esc(p.void) : 'ধন্যবাদ'}</span></div></div>`;
}

export function receipt(pid) {
  const p = S.get().payments.find(x => x.id === pid);
  if (!p) return;
  const owner = S.isOwner();
  sheet({
    title: 'রসিদ ' + p.receipt, sub: p.void ? 'বাতিল করা হয়েছে' : '',
    body: `<div class="preview-wrap">${receiptHTML(p)}</div><div class="seg wide" role="group" aria-label="কাগজ"><button data-paper="80mm" aria-pressed="true">৮০ মিমি থার্মাল</button><button data-paper="A5" aria-pressed="false">A5 কাগজ</button></div>
      ${p.void ? '' : `<div id="voidbox"></div><div class="muted" style="font-size:var(--t-micro)">ভুল হলে মুছে ফেলা যায় না, কারণসহ বাতিল করতে হয়। ${owner ? '' : 'বাতিল শুধু মালিক করতে পারেন।'}</div>`}`,
    foot: `${!p.void && owner ? `<button class="btn danger" data-void>বাতিল</button>` : ''}<button class="btn primary" data-print>${icon('print')}প্রিন্ট</button>`,
    onOpen(dlg) {
      let paper = '80mm';
      $$('[data-paper]', dlg).forEach(b => b.onclick = () => { paper = b.dataset.paper; $$('[data-paper]', dlg).forEach(x => x.setAttribute('aria-pressed', x === b)); });
      $('[data-print]', dlg).onclick = () => printHTML(paper === 'A5' ? `<div style="display:flex;justify-content:center;padding-top:8mm">${receiptHTML(p).replace('class="receipt"', 'class="receipt" style="width:120mm;font-size:11pt"')}</div>` : receiptHTML(p), paper === 'A5' ? 'A5' : '80mm auto');
      const v = $('[data-void]', dlg);
      if (v) v.onclick = () => {
        const box = $('#voidbox', dlg);
        if (!box.innerHTML) {
          box.innerHTML = `<label class="field"><span>কেন বাতিল করছেন <i>*</i></span><input class="inp" id="voidwhy" placeholder="যেমন: ভুল ছাত্রের নামে কাটা হয়েছিল"></label>`;
          v.textContent = 'বাতিল নিশ্চিত করুন';
          $('#voidwhy', dlg).focus();
          return;
        }
        const why = $('#voidwhy', dlg).value.trim();
        if (!why) return $('#voidwhy', dlg).focus();
        busy(v, async () => { await S.act('void', { paymentId: p.id, why }); dlg.close(); toast('রসিদ বাতিল হয়েছে, টাকা আবার বাকিতে ফিরেছে'); rerender(); });
      };
    }
  });
}

export function sms(eids, kind) {
  const s = S.get();
  const items = eids.map(id => { const e = s.enrollments.find(x => x.id === id); return { e, st: S.student(e.studentId), d: S.due(e) }; });
  const k0 = kind || (items.some(x => x.d.overdue > 0) ? 'overdue' : 'due');
  const one = items.length === 1;
  sheet({
    title: one ? 'SMS পাঠান' : `${bn(items.length)} জনকে SMS`, sub: one ? `${esc(items[0].st.name)} · <span class="lat">${phoneFmt(items[0].st.phone)}</span>` : 'প্রত্যেকের নাম আর টাকা আলাদা বসবে',
    body: `<div class="seg wide" role="group">${[['overdue', 'বকেয়া'], ['due', 'আসন্ন কিস্তি'], ['custom', 'নিজে লিখুন']].map(([k, l]) => `<button data-k="${k}" aria-pressed="${k === k0}">${l}</button>`).join('')}</div>
      <label class="field"><span>মেসেজ</span><textarea class="inp" id="smst" rows="3">${esc(S.TEMPLATES[k0])}</textarea></label>
      <div class="vars">${['{নাম}', '{টাকা}', '{তারিখ}', '{কোর্স}', '{রোল}', '{সেন্টার}'].map(v => `<button type="button" data-var="${v}">${v}</button>`).join('')}</div>
      <label class="setrow" style="padding:0;border:0"><span class="t"><b>অভিভাবকের নম্বরেও পাঠান</b><small>অপ্রাপ্তবয়স্কদের জন্য ভালো</small></span><span class="switch"><input type="checkbox" id="smsg"><i></i></span></label>
      <div class="counter" id="smsc"></div>
      <div class="phone"><div class="from">${esc(s.centre.sender || s.centre.short)}</div><div class="bub" id="smsp"></div>${one ? '' : `<div class="from" style="font-weight:500" id="smsw"></div>`}</div>`,
    foot: `<button class="btn secondary" data-cancel>বাতিল</button><button class="btn primary" id="smsgo">${icon('send')}পাঠান</button>`,
    onOpen(dlg) {
      const ta = $('#smst', dlg);
      let kindNow = k0;
      const draw = () => {
        const texts = items.map(x => S.fill(ta.value, x.st, x.e, ta.value.includes('বকেয়া') ? { amount: x.d.overdue || x.d.total } : {}));
        const parts = texts.map(t => S.smsParts(t));
        const max = parts.reduce((a, p) => p.len > a.len ? p : a, parts[0]);
        const mult = $('#smsg', dlg).checked ? 2 : 1;
        const total = parts.reduce((a, p) => a + p.parts, 0) * mult;
        $('#smsp', dlg).textContent = texts[0];
        if (!one) $('#smsw', dlg).textContent = `নমুনা: ${items[0].st.name}`;
        const c = $('#smsc', dlg);
        c.className = 'counter' + (max.parts > 1 ? ' over' : '');
        c.innerHTML = `<span><b>${bn(max.len)}</b>/${bn(max.uni ? 70 : 160)} অক্ষর</span><span class="bar"><i style="width:${Math.min(100, max.len / (max.uni ? 70 : 160) * 100)}%"></i></span><span><b class="parts">${bn(total)}</b> SMS · <b>${tk(total * (s.centre.smsRate || 0.35))}</b></span>${max.parts > 1 ? `<span style="width:100%;color:var(--soon)">বাংলা SMS ৭০ অক্ষরে একটা। এখন প্রতি জনে ${bn(max.parts)}টা কাটবে, খরচ ${bn(max.parts)} গুণ।</span>` : ''}${max.parts > 3 ? `<span style="width:100%;color:var(--late)">৩টার বেশি SMS এ ভাঙবে, ছোট করুন।</span>` : ''}`;
        $('#smsgo', dlg).disabled = max.parts > 3 || max.len === 0;
        $('#smsgo', dlg).innerHTML = `${icon('send')}${bn(items.length)} জনকে পাঠান`;
        return { texts, guardian: mult === 2 };
      };
      draw(); ta.addEventListener('input', draw); $('#smsg', dlg).addEventListener('change', draw);
      $$('[data-k]', dlg).forEach(b => b.onclick = () => { kindNow = b.dataset.k; $$('[data-k]', dlg).forEach(x => x.setAttribute('aria-pressed', x === b)); ta.value = b.dataset.k === 'custom' ? '{নাম}, ' : S.TEMPLATES[b.dataset.k]; draw(); ta.focus(); });
      $$('[data-var]', dlg).forEach(b => b.onclick = () => { const p = ta.selectionStart; ta.setRangeText(b.dataset.var, p, ta.selectionEnd, 'end'); ta.focus(); draw(); });
      $('[data-cancel]', dlg).onclick = () => dlg.close();
      $('#smsgo', dlg).onclick = ev => {
        const { texts, guardian } = draw();
        const kindSent = kindNow === 'custom' ? 'manual' : kindNow;
        const list = items.map((x, i) => ({ studentId: x.st.id, enrollmentId: x.e.id, text: texts[i], kind: kindSent }));
        if (guardian) items.forEach((x, i) => list.push({ studentId: x.st.id, text: texts[i], kind: kindSent, guardian: true }));
        busy(ev.currentTarget, async () => {
          const r = await S.act('sms', { items: list });
          dlg.close();
          const ms = r.up.message || [];
          const demo = ms.filter(m => m.status === 'demo').length, logged = ms.filter(m => m.status === 'logged').length;
          toast(`${bn(ms.length)}টি SMS তৈরি${demo ? ` · ${bn(demo)}টি ডেমো নম্বর, যায়নি` : ''}${logged ? ' · গেটওয়ে চালু হয়নি, শুধু লেখা থাকল' : ''}`);
          rerender();
        });
      };
    }
  });
}

export function attendance(bid) {
  const b = S.batch(bid), t = S.iso(S.today());
  const en = S.enrolledIn(bid, t).sort((a, c) => a.seat - c.seat);
  const at = S.attOf(bid, t);
  const present = new Set((at?.present || []).map(p => p.s));
  const marked = at && (at.closed || at.present.length);
  sheet({
    title: 'হাতে হাজিরা · ' + esc(b.code), sub: `${S.weekday(t)}, ${S.dateBn(t)} · শুধু যারা আসেনি তাদের ট্যাপ করুন`,
    body: `<div class="att">${en.map(e => { const st = S.student(e.studentId); if (!st) return ''; const age = (S.today() - S.parse(st.dob)) / (365.25 * 864e5); const abs = marked ? !present.has(st.id) : false; return `<label><input type="checkbox" data-abs="${st.id}" ${abs ? 'checked' : ''}>${ava(st, 'sm')}<span class="who"><b>${esc(st.name)}</b><small>PC ${String(e.seat).padStart(2, '0')}${age < 18 ? ' · অপ্রাপ্তবয়স্ক' : ''}${present.has(st.id) ? ' · স্ক্যান হয়েছে' : ''}</small></span><span class="pa"><span class="p">আছে</span><span class="a">নেই</span></span></label>`; }).join('') || '<div class="empty"><b>এই ব্যাচে কেউ নেই</b></div>'}</div>
      <label class="setrow" style="padding:0;border:0"><span class="t"><b>অনুপস্থিতদের অভিভাবককে SMS</b><small id="absn"></small></span><span class="switch"><input type="checkbox" id="abssms" ${at?.notified ? 'disabled' : 'checked'}><i></i></span></label>
      ${at?.notified ? '<p class="muted" style="font-size:var(--t-micro)">আজকের অনুপস্থিতির SMS আগেই গেছে, আবার যাবে না।</p>' : ''}`,
    foot: `<button class="btn primary block" id="attgo">হাজিরা শেষ করুন</button>`,
    onOpen(dlg) {
      const cnt = () => { const n = $$('[data-abs]:checked', dlg).length; $('#absn', dlg).textContent = `${bn(n)} জন অনুপস্থিত · ${bn(en.length - n)} জন উপস্থিত`; };
      cnt(); dlg.addEventListener('change', cnt);
      $('#attgo', dlg).onclick = ev => {
        const absent = $$('[data-abs]:checked', dlg).map(i => i.dataset.abs);
        busy(ev.currentTarget, async () => {
          const r = await S.act('att/close', { batchId: bid, manual: true, absent, sms: $('#abssms', dlg).checked });
          dlg.close();
          toast(`হাজিরা শেষ · ${bn(absent.length)} জন অনুপস্থিত${(r.up.message || []).length ? ` · ${bn(r.up.message.length)}টি SMS` : ''}`);
          rerender();
        });
      };
    }
  });
}

export function docView(did) {
  const d = S.get().docs.find(x => x.id === did), k = S.DOC_KINDS.find(x => x.id === d.kind), st = S.student(d.studentId);
  const img = d.type.startsWith('image');
  sheet({
    title: k.label, sub: esc(st?.name || ''), wide: true,
    body: img ? `<div class="preview-wrap"><img src="${S.fileURL(d.id)}" alt="${k.label}" style="max-width:100%;max-height:70dvh;border-radius:8px"></div>` : `<div class="preview-wrap" style="min-height:200px;align-items:center;gap:10px">${icon('file')} <a class="linkbtn lat" href="${S.fileURL(d.id)}" target="_blank" rel="noopener">${esc(d.name)} খুলুন</a></div>`,
    foot: `<label class="btn secondary">${icon('upload')}বদলান<input type="file" accept="image/*,application/pdf" hidden data-replace></label>${img ? `<button class="btn primary" data-dl>${icon('print')}প্রিন্ট</button>` : ''}`,
    onOpen(dlg) {
      $('[data-replace]', dlg).onchange = async ev => { const f = ev.target.files[0]; if (!f) return; try { await addDoc(st.id, d.kind, f); dlg.close(); rerender(); } catch {} };
      const p = $('[data-dl]', dlg);
      if (p) p.onclick = () => printHTML(`<div style="text-align:center"><img src="${S.fileURL(d.id)}" style="max-width:100%;max-height:270mm"></div>`, 'A4');
    }
  });
}

export async function upload(kind, file, studentId) {
  const blob = file.type.startsWith('image') ? await shrink(file) : file;
  if (blob.size > 8 * 1024 * 1024) throw new Error('ফাইল ৮ MB এর বেশি বড়');
  const fd = new FormData();
  fd.append('kind', kind);
  if (studentId) fd.append('studentId', studentId);
  fd.append('file', blob, file.name.replace(/\.(heic|png|webp)$/i, '.jpg'));
  const r = await S.api('upload', null, fd);
  S.merge(r.up);
  return r.doc;
}

export async function addDoc(sid, kind, file) {
  try {
    const d = await upload(kind, file, sid);
    toast(S.DOC_KINDS.find(k => k.id === kind).label + ' রাখা হয়েছে');
    return d.id;
  } catch (e) { toast(e.message, null, true); throw e; }
}

export function shrink(file, max = 1600) {
  return new Promise(res => {
    const img = new Image(); const u = URL.createObjectURL(file);
    img.onload = () => {
      const r = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas'); c.width = Math.round(img.width * r); c.height = Math.round(img.height * r);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      c.toBlob(b => { URL.revokeObjectURL(u); res(b || file); }, 'image/jpeg', 0.82);
    };
    img.onerror = () => { URL.revokeObjectURL(u); res(file); };
    img.src = u;
  });
}

export function idcardHTML(st) {
  const s = S.get(), e = S.mainEnrol(st.id), b = e ? S.batch(e.batchId) : null, c = e ? S.course(e.courseId) : null;
  const pid = S.docsOf(st.id).filter(x => x.kind === 'photo' && x.type.startsWith('image')).pop();
  return `<div class="idcard"><div class="h">${esc(s.centre.name)}<small>${esc(s.centre.address)}</small></div><div class="pic">${pid ? `<img src="${S.fileURL(pid.id)}" alt="">` : esc(st.name[0])}</div><div class="nm">${esc(st.name)}</div><div class="rl">${st.roll}</div>
    <dl>${c ? `<dt>কোর্স</dt><dd>${esc(c.name)}</dd><dt>ব্যাচ</dt><dd class="lat">${esc(b.code)}</dd><dt>সময়</dt><dd>${esc(b.days)}, ${S.timeBn(b.time)}</dd><dt>মেয়াদ</dt><dd>${S.dateShort(b.end)} পর্যন্ত</dd>` : ''}${st.blood ? `<dt>রক্ত</dt><dd class="lat">${esc(st.blood)}</dd>` : ''}</dl>
    <div class="f"><span>হাজিরায় স্ক্যান করুন${s.centre.phone ? `<br>জরুরি: <span class="lat">${esc(s.centre.phone)}</span>` : ''}</span>${qrSVG(S.cardURL(st))}</div><div class="stripe"></div></div>`;
}

export function idcard(sid) {
  const st = S.student(sid);
  sheet({
    title: 'আইডি কার্ড', sub: esc(st.name),
    body: `<div class="preview-wrap">${idcardHTML(st)}</div><p class="muted" style="font-size:var(--t-micro)">CR80 মাপ (৫৪ × ৮৬ মিমি)। কার্ডের QR দিয়ে হাজিরা হয়। কার্ড হারালে "নতুন QR" চাপুন, পুরনো কার্ড আর চলবে না।</p>`,
    foot: `${S.isTeacher() ? '' : `<button class="btn secondary" data-reissue>নতুন QR</button>`}<button class="btn primary" data-print>${icon('print')}প্রিন্ট</button>`,
    onOpen(dlg) {
      $('[data-print]', dlg).onclick = () => printHTML(idcardHTML(S.student(sid)), '54mm 86mm');
      const r = $('[data-reissue]', dlg);
      if (r) r.onclick = () => {
        if (!r.dataset.sure) { r.dataset.sure = '1'; r.textContent = 'নিশ্চিত? পুরনো কার্ড বন্ধ হবে'; return; }
        busy(r, async () => { await S.act('card', { studentId: sid }); $('.preview-wrap', dlg).innerHTML = idcardHTML(S.student(sid)); toast('নতুন QR তৈরি, কার্ডটি আবার প্রিন্ট করুন'); });
      };
    }
  });
}

export function certHTML(e) {
  const s = S.get(), st = S.student(e.studentId), b = S.batch(e.batchId), c = S.course(e.courseId);
  return `<div class="cert"><div class="in"><div class="org">${esc(s.centre.name)}</div><div class="addr">${esc(s.centre.address)}${s.centre.bteb ? ' · বিটিইবি কোড ' + esc(s.centre.bteb) : ''}</div>
    <div class="ttl"><small>Certificate of Completion</small>সনদপত্র</div>
    <div class="body">এই মর্মে প্রত্যয়ন করা যাচ্ছে যে<b>${esc(st.name)}</b><span class="lat" style="display:block;font-size:1.7cqw;letter-spacing:.08em;text-transform:uppercase;color:#5E6779;margin-top:-.4cqw">${esc(st.en)}</span>পিতা ${esc(st.father)}, রোল <span class="lat">${st.roll}</span>, ${S.dateBn(b.start)} থেকে ${S.dateFull(b.end)} পর্যন্ত <b style="display:inline;font-size:inherit">${esc(c.name)}</b>${c.hours ? ` (${bn(c.hours)} ঘণ্টা)` : ''} কোর্স সফলভাবে সম্পন্ন করে <b style="display:inline;font-size:inherit" class="lat">${e.cert.grade}</b> গ্রেড পেয়েছে।</div>
    <div class="foot"><div style="text-align:left">${qrSVG(S.verifyURL(e.cert.no))}<div class="lat" style="margin-top:.4cqw">${e.cert.no}</div><div>যাচাই: QR স্ক্যান করুন</div></div><div class="seal">${esc(s.centre.short)}<br>সিল</div><div class="sig">পরিচালক<br>${S.dateFull(e.cert.at)}</div></div></div></div>`;
}

export function cert(eid) {
  const s = S.get(), e = s.enrollments.find(x => x.id === eid), st = S.student(e.studentId);
  if (S.due(e).total > 0) return toast('বকেয়া থাকায় সনদ দেওয়া যাবে না', null, true);
  if (!e.cert) {
    return sheet({
      title: 'সনদ তৈরি', sub: esc(st.name),
      body: `<div class="field"><span>গ্রেড</span><div class="seg wide" role="group">${['A+', 'A', 'A-', 'B', 'C'].map((g, i) => `<button data-g="${g}" aria-pressed="${i === 1}" class="lat">${g}</button>`).join('')}</div></div><div class="alloc"><div><span>সনদ নম্বর</span><b class="lat">${esc(s.centre.prefix || 'DK')}-C-${String((s.centre.seq?.cert || 0) + 1).padStart(4, '0')}</b></div><div><span>তারিখ</span><span>${S.dateFull(S.iso(S.today()))}</span></div></div><p class="muted" style="font-size:var(--t-micro)">সনদ নম্বর দেওয়ার পর বদলানো যায় না। QR কোডে যে কেউ এটা যাচাই করতে পারবে।</p>`,
      foot: `<button class="btn primary block" data-make>${icon('cert')}সনদ তৈরি করুন</button>`,
      onOpen(dlg) {
        let g = 'A'; $$('[data-g]', dlg).forEach(b => b.onclick = () => { g = b.dataset.g; $$('[data-g]', dlg).forEach(x => x.setAttribute('aria-pressed', x === b)); });
        $('[data-make]', dlg).onclick = ev => busy(ev.currentTarget, async () => { await S.act('cert', { enrollmentId: eid, grade: g }); dlg.close(); rerender(); setTimeout(() => cert(eid), 150); });
      }
    });
  }
  sheet({ title: 'সনদ ' + e.cert.no, sub: esc(st.name), wide: true, body: `<div class="preview-wrap">${certHTML(e)}</div><a class="linkbtn" href="#/verify/${e.cert.no}" target="_blank">${icon('qr')} যাচাইয়ের পাতা খুলুন</a>`, foot: `<button class="btn primary block" data-print>${icon('print')}A4 প্রিন্ট</button>`, onOpen(dlg) { $('[data-print]', dlg).onclick = () => printHTML(certHTML(e).replace('class="cert"', 'class="cert" style="width:281mm;max-width:none"'), 'A4 landscape'); } });
}

function formSheet({ title, sub, fields, submit, onSubmit, after }) {
  sheet({
    title, sub,
    body: `<form id="fsf" class="sh-body" style="padding:0" novalidate>${fields}</form>`,
    foot: `<button class="btn primary block" form="fsf" id="fsgo">${submit}</button>`,
    onOpen(dlg) {
      const f = $('#fsf', dlg); syncInvalid(f);
      setTimeout(() => f.querySelector('input:not([type=hidden]),select,textarea')?.focus(), 60);
      after?.(dlg, f);
      f.onsubmit = ev => { ev.preventDefault(); if (invalid(f)) return; busy($('#fsgo', dlg), async () => { await onSubmit(f, dlg); dlg.close(); rerender(); }); };
    }
  });
}

const fld = (label, input, err) => `<label class="field"><span>${label}</span>${input}${err ? `<span class="err">${icon('alert')}${err}</span>` : ''}</label>`;
const opt = (list, v) => list.map(o => Array.isArray(o) ? `<option value="${esc(o[0])}" ${o[0] === v ? 'selected' : ''}>${esc(o[1])}</option>` : `<option ${o === v ? 'selected' : ''}>${esc(o)}</option>`).join('');

export function expense(day) {
  formSheet({
    title: 'খরচ যোগ করুন', submit: 'সেভ করুন',
    fields: `${fld('কীসের খরচ <i>*</i>', `<input class="inp" name="head" list="heads" required><datalist id="heads">${['চা-নাস্তা', 'বিদ্যুৎ বিল', 'ইন্টারনেট', 'ভাড়া', 'প্রিন্টার কালি', 'ফেসবুক বুস্ট', 'শিক্ষকের সম্মানী', 'পরিচ্ছন্নতা'].map(h => `<option>${h}`).join('')}</datalist>`, 'খরচের খাত লিখুন')}${fld('টাকা <i>*</i>', '<input class="inp money" name="amount" type="number" inputmode="numeric" min="1" required>', 'টাকার পরিমাণ লিখুন')}${fld('নোট', '<input class="inp" name="note">')}`,
    onSubmit: async f => { await S.act('expense', { head: f.head.value, amount: Number(f.amount.value), note: f.note.value, at: day }); toast('খরচ যোগ হয়েছে'); }
  });
}

export function enquiry() {
  const s = S.get();
  if (!s.courses.length) return toast('আগে একটা কোর্স যোগ করুন', null, true);
  formSheet({
    title: 'নতুন ভর্তি জিজ্ঞাসা', submit: 'সেভ করুন',
    fields: `${fld('নাম <i>*</i>', '<input class="inp" name="name" required>', 'নাম লিখুন')}${fld('ফোন <i>*</i>', '<input class="inp lat" name="phone" type="tel" inputmode="numeric" pattern="01[0-9]{9}" required placeholder="01XXXXXXXXX">', '১১ সংখ্যার মোবাইল নম্বর')}
      ${fld('কোন কোর্স', `<select class="inp" name="course">${opt(s.courses.map(c => [c.id, c.name]))}</select>`)}<div class="grid2">${fld('আবার কবে ফোন', `<input class="inp" type="date" name="next" value="${S.addDays(S.iso(S.today()), 2)}">`)}${fld('কোথা থেকে জেনেছে', `<select class="inp" name="src">${opt(['ফেসবুক', 'পরিচিতজন', 'সাইনবোর্ড', 'লিফলেট', 'পুরনো ছাত্র'])}</select>`)}</div>${fld('কী জানতে চেয়েছেন', '<textarea class="inp" name="note" rows="2"></textarea>')}`,
    onSubmit: async f => { await S.act('enquiry', { name: f.name.value, phone: f.phone.value, courseId: f.course.value, next: f.next.value, note: f.note.value, source: f.src.value }); toast('জিজ্ঞাসা সেভ হয়েছে'); }
  });
}

export function courseForm(id) {
  const c = id ? S.course(id) : { name: '', en: '', months: 3, hours: 72, fee: '', admission: '', kind: 'নিজস্ব', inst: 3, boardFee: '' };
  formSheet({
    title: id ? 'কোর্স বদলান' : 'নতুন কোর্স', submit: 'সেভ করুন',
    fields: `${fld('কোর্সের নাম <i>*</i>', `<input class="inp" name="name" required value="${esc(c.name)}" placeholder="যেমন: অফিস অ্যাপ্লিকেশন">`, 'নাম লিখুন')}${fld('ইংরেজিতে (সনদের জন্য)', `<input class="inp lat" name="en" value="${esc(c.en)}" placeholder="Office Application">`)}
      <div class="grid3">${fld('মেয়াদ (মাস) <i>*</i>', `<input class="inp" name="months" type="number" inputmode="numeric" min="1" max="36" required value="${c.months}">`, '১–৩৬')}${fld('মোট ঘণ্টা', `<input class="inp" name="hours" type="number" inputmode="numeric" min="0" value="${c.hours || ''}">`)}${fld('কিস্তি কয়টা', `<input class="inp" name="inst" type="number" inputmode="numeric" min="1" max="24" value="${c.inst}">`)}</div>
      <div class="grid3">${fld('কোর্স ফি <i>*</i>', `<input class="inp" name="fee" type="number" inputmode="numeric" min="0" required value="${c.fee}">`, 'ফি লিখুন')}${fld('ভর্তি ফি', `<input class="inp" name="admission" type="number" inputmode="numeric" min="0" value="${c.admission}">`)}${fld('বোর্ড ফি', `<input class="inp" name="boardFee" type="number" inputmode="numeric" min="0" value="${c.boardFee || ''}">`)}</div>
      ${fld('ধরন', `<select class="inp" name="kind">${opt(['নিজস্ব', 'বিটিইবি', 'এনএসডিএ', 'সরকারি প্রকল্প'], c.kind)}</select>`)}`,
    onSubmit: async f => { await S.act('course', { id: id || '', name: f.name.value, en: f.en.value, months: +f.months.value, hours: +f.hours.value || 0, inst: +f.inst.value || 0, fee: +f.fee.value || 0, admission: +f.admission.value || 0, boardFee: +f.boardFee.value || 0, kind: f.kind.value }); toast('কোর্স সেভ হয়েছে'); }
  });
}

export function batchForm(id) {
  const s = S.get();
  if (!s.courses.length) return courseForm();
  const b = id ? S.batch(id) : { courseId: s.courses[0].id, code: '', days: 'শনি সোম বুধ', time: '10:00', teacher: s.teachers[0]?.id || '', seats: 20, start: S.iso(S.today()), end: '', lab: 'ল্যাব ১' };
  const days = new Set(b.days.split(' '));
  formSheet({
    title: id ? 'ব্যাচ বদলান' : 'নতুন ব্যাচ', submit: 'সেভ করুন',
    fields: `${fld('কোর্স <i>*</i>', `<select class="inp" name="course">${opt(s.courses.map(c => [c.id, c.name]), b.courseId)}</select>`)}
      <div class="grid2">${fld('ব্যাচের কোড <i>*</i>', `<input class="inp lat" name="code" required value="${esc(b.code)}" placeholder="OA-২৭">`, 'কোড লিখুন')}${fld('ল্যাব', `<input class="inp" name="lab" value="${esc(b.lab)}">`)}</div>
      <div class="field"><span>ক্লাসের দিন <i>*</i></span><div class="chips" style="flex-wrap:wrap">${S.DAY_NAMES.map(d => `<button type="button" class="chip" data-day="${d}" aria-pressed="${days.has(d)}">${d}</button>`).join('')}</div></div>
      <div class="grid3">${fld('সময় <i>*</i>', `<input class="inp" name="time" type="time" required value="${b.time}">`, 'সময় দিন')}${fld('সিট (পিসি) <i>*</i>', `<input class="inp" name="seats" type="number" inputmode="numeric" min="1" max="200" required value="${b.seats}">`, '১–২০০')}${fld('শুরু <i>*</i>', `<input class="inp" name="start" type="date" required value="${b.start}">`, 'তারিখ দিন')}</div>
      ${fld('শিক্ষক', `<select class="inp" name="teacher"><option value="">—</option>${opt(s.teachers.map(t => [t.id, t.name]), b.teacher)}</select>`)}
      <p class="muted" style="font-size:var(--t-micro)">শেষের তারিখ কোর্সের মেয়াদ থেকে নিজে বসে যাবে।${s.teachers.length ? '' : ' শিক্ষক যোগ করতে ব্যাচ পাতার "শিক্ষক" বোতাম।'}</p>`,
    after: (dlg) => $$('[data-day]', dlg).forEach(x => x.onclick = () => x.setAttribute('aria-pressed', x.getAttribute('aria-pressed') !== 'true')),
    onSubmit: async (f, dlg) => {
      const d = $$('[data-day][aria-pressed="true"]', dlg).map(x => x.dataset.day).join(' ');
      await S.act('batch', { id: id || '', courseId: f.course.value, code: f.code.value, lab: f.lab.value, days: d, time: f.time.value, seats: +f.seats.value, start: f.start.value, end: id && f.course.value === b.courseId && f.start.value === b.start ? b.end : '', teacher: f.teacher.value });
      toast('ব্যাচ সেভ হয়েছে');
    }
  });
}

export function teacherForm() {
  formSheet({
    title: 'শিক্ষক যোগ করুন', submit: 'সেভ করুন',
    fields: `${fld('নাম <i>*</i>', '<input class="inp" name="name" required>', 'নাম লিখুন')}${fld('কী পড়ান', '<input class="inp" name="subject" placeholder="গ্রাফিক ডিজাইন">')}<p class="muted" style="font-size:var(--t-micro)">শিক্ষক নিজের ফোন থেকে হাজিরা নিতে চাইলে সেটিংস থেকে "শিক্ষক" হিসেবে লগইন খুলে দিন।</p>`,
    onSubmit: async f => { await S.act('teacher', { name: f.name.value, subject: f.subject.value }); toast('শিক্ষক যোগ হয়েছে'); }
  });
}

export function editStudent(sid) {
  const st = S.student(sid), e = S.mainEnrol(sid);
  const bteb = e && S.course(e.courseId).kind === 'বিটিইবি';
  formSheet({
    title: 'তথ্য বদলান', sub: esc(st.name), submit: 'সেভ করুন',
    fields: `<div class="grid2">${fld('নাম (বাংলায়) <i>*</i>', `<input class="inp" name="name" required value="${esc(st.name)}">`, 'নাম লিখুন')}${fld('নাম (ইংরেজিতে) <i>*</i>', `<input class="inp lat" name="en" required value="${esc(st.en)}">`, 'ইংরেজি নাম লিখুন')}</div>
      <div class="grid2">${fld('মোবাইল <i>*</i>', `<input class="inp lat" name="phone" type="tel" inputmode="numeric" pattern="01[0-9]{9}" required value="${esc(st.phone)}">`, '১১ সংখ্যার নম্বর')}${fld('অভিভাবকের মোবাইল <i>*</i>', `<input class="inp lat" name="guardianPhone" type="tel" inputmode="numeric" pattern="01[0-9]{9}" required value="${esc(st.guardianPhone)}">`, '১১ সংখ্যার নম্বর')}</div>
      <div class="grid2">${fld('পিতার নাম <i>*</i>', `<input class="inp" name="father" required value="${esc(st.father)}">`, 'পিতার নাম লিখুন')}${fld('মাতার নাম', `<input class="inp" name="mother" value="${esc(st.mother)}">`)}</div>
      <div class="grid2">${fld('জন্মতারিখ <i>*</i>', `<input class="inp" name="dob" type="date" required value="${st.dob}">`, 'তারিখ দিন')}${fld('রক্তের গ্রুপ', `<select class="inp" name="blood">${opt(['', 'A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'], st.blood)}</select>`)}</div>
      ${fld('ঠিকানা', `<input class="inp" name="address" value="${esc(st.address)}">`)}
      <div class="grid2">${fld('পরিচয়পত্র', `<select class="inp" name="idType">${opt(['জন্মনিবন্ধন', 'এনআইডি', 'নেই'], st.idType)}</select>`)}${fld('নম্বর', `<input class="inp lat" name="idNo" value="${esc(st.idNo)}">`)}</div>
      ${bteb ? fld('বিটিইবি রেজিস্ট্রেশন নম্বর', `<input class="inp lat" name="boardReg" value="${esc(e.boardReg || '')}">`) : ''}`,
    onSubmit: async f => {
      const body = { student: { ...st, name: f.name.value, en: f.en.value, phone: f.phone.value, guardianPhone: f.guardianPhone.value, father: f.father.value, mother: f.mother.value, dob: f.dob.value, blood: f.blood.value, address: f.address.value, idType: f.idType.value, idNo: f.idNo.value } };
      if (bteb) body.boardReg = f.boardReg.value;
      await S.act('student', body); toast('তথ্য সেভ হয়েছে');
    }
  });
}

export function drop(eid) {
  const e = S.get().enrollments.find(x => x.id === eid), st = S.student(e.studentId);
  formSheet({
    title: 'কোর্স ছেড়ে দিয়েছে', sub: esc(st.name), submit: 'নিশ্চিত করুন',
    fields: `<p style="font-size:var(--t-small);color:var(--ink-2)">বকেয়ার হিসাব থেকে বাদ যাবে, অটো SMS যাবে না। সব রসিদ আর তথ্য থেকে যাবে।</p>${fld('কারণ <i>*</i>', '<input class="inp" name="note" required placeholder="যেমন: পরিবার অন্য শহরে চলে গেছে">', 'কারণ লিখুন')}`,
    onSubmit: async f => { await S.act('drop', { enrollmentId: eid, note: f.note.value }); toast('বাদ দেওয়া হয়েছে'); }
  });
}

export function staffForm() {
  formSheet({
    title: 'নতুন লগইন', submit: 'লগইন খুলুন',
    fields: `${fld('নাম <i>*</i>', '<input class="inp" name="name" required>', 'নাম লিখুন')}${fld('মোবাইল (লগইনের জন্য) <i>*</i>', '<input class="inp lat" name="phone" type="tel" inputmode="numeric" pattern="01[0-9]{9}" required placeholder="01XXXXXXXXX">', '১১ সংখ্যার নম্বর')}
      ${fld('কাজ', `<select class="inp" name="role">${opt([['desk', 'ফ্রন্ট ডেস্ক: ভর্তি, টাকা, SMS'], ['teacher', 'শিক্ষক: শুধু হাজিরা'], ['owner', 'মালিক: সব কিছু']], 'desk')}</select>`)}
      ${fld('পাসওয়ার্ড <i>*</i>', '<input class="inp" name="password" type="text" minlength="6" required autocomplete="off">', 'কমপক্ষে ৬ অক্ষর')}<p class="muted" style="font-size:var(--t-micro)">পাসওয়ার্ডটা তাকে নিজে জানিয়ে দিন, পরে সে নিজে বদলাতে পারবে।</p>`,
    onSubmit: async f => { const r = await S.api('staff', { name: f.name.value, phone: f.phone.value, role: f.role.value, password: f.password.value }); S.setStaff([...S.get().staff, r.user]); toast('লগইন খোলা হয়েছে'); }
  });
}

export function passwordForm() {
  formSheet({
    title: 'পাসওয়ার্ড বদলান', submit: 'বদলান',
    fields: `${fld('পুরনো পাসওয়ার্ড <i>*</i>', '<input class="inp" name="old" type="password" required autocomplete="current-password">', 'লিখুন')}${fld('নতুন পাসওয়ার্ড <i>*</i>', '<input class="inp" name="nw" type="password" minlength="6" required autocomplete="new-password">', 'কমপক্ষে ৬ অক্ষর')}`,
    onSubmit: async f => { await S.api('password', { old: f.old.value, new: f.nw.value }); toast('পাসওয়ার্ড বদলানো হয়েছে'); }
  });
}

export function autoList(q) {
  sheet({ title: 'আজকের অটো রিমাইন্ডার', sub: `সন্ধ্যা ৭টায় নিজে যাবে · ${bn(q.length)} জন`, body: `<div class="rows card">${q.map(x => `<div class="row" style="align-items:flex-start">${ava(x.st, 'sm')}<div class="who"><b>${esc(x.st.name)}</b><small style="white-space:normal">${esc(x.text)}</small></div><span class="st ${x.kind === 'overdue' ? 'late' : 'soon'}">${x.kind === 'overdue' ? 'বকেয়া' : 'আসন্ন'}</span></div>`).join('')}</div><p class="muted" style="font-size:var(--t-micro)">এখনই পাঠালে সন্ধ্যায় এদের আর আলাদা করে যাবে না।</p>`, foot: `<button class="btn primary block" data-now>${icon('send')}এখনই পাঠান</button>` , onOpen(dlg) { $('[data-now]', dlg).onclick = ev => busy(ev.currentTarget, async () => { const r = await S.act('sms', { items: q.map(x => ({ studentId: x.st.id, enrollmentId: x.e.id, text: x.text, kind: x.kind })) }); dlg.close(); toast(`${bn((r.up.message || []).length)}টি SMS তৈরি`); rerender(); }); } });
}

export function staffPassword(id) {
  const u = S.get().staff.find(x => x.id === id);
  formSheet({
    title: 'নতুন পাসওয়ার্ড', sub: esc(u?.name || ''), submit: 'পাসওয়ার্ড বসান',
    fields: `${fld('নতুন পাসওয়ার্ড <i>*</i>', '<input class="inp" name="password" type="text" minlength="6" required autocomplete="off">', 'কমপক্ষে ৬ অক্ষর')}<p class="muted" style="font-size:var(--t-micro)">তার আগের লগইন সব ফোন থেকে বের হয়ে যাবে। নতুন পাসওয়ার্ডটা তাকে নিজে জানিয়ে দিন।</p>`,
    onSubmit: async f => { await S.api('staff', { id, password: f.password.value }); toast('পাসওয়ার্ড বদলানো হয়েছে'); }
  });
}
