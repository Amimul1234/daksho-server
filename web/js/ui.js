import * as S from './store.js';
import { icon } from './icons.js';

export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const seg = typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter('bn', { granularity: 'grapheme' }) : null;
export const initial = name => { const w = String(name || '?').trim(); return seg ? seg.segment(w)[Symbol.iterator]().next().value.segment : w[0]; };

export function hydrate(root = document) {
  $$('[data-file]', root).forEach(el => {
    const u = S.fileURL(el.dataset.file);
    if (el.tagName === 'IMG') { if (!el.src) el.src = u; return; }
    if (el.querySelector('img')) return;
    const img = new Image();
    img.alt = '';
    img.onload = () => { el.textContent = ''; el.append(img); };
    img.src = u;
  });
}

export async function busy(btn, fn) {
  if (btn?.dataset.busy) return;
  const html = btn?.innerHTML;
  if (btn) { btn.dataset.busy = '1'; btn.disabled = true; btn.innerHTML = '<span class="spin" aria-hidden="true"></span>' + (btn.textContent.trim() ? 'অপেক্ষা করুন' : ''); }
  try { return await fn(); }
  catch (e) { toast(e.message || 'সমস্যা হয়েছে', null, true); throw e; }
  finally { if (btn && btn.isConnected) { delete btn.dataset.busy; btn.disabled = false; btn.innerHTML = html; } }
}

export function photoId(sid) { const l = S.docsOf(sid).filter(x => x.kind === 'photo' && x.type.startsWith('image')); return l.length ? l[l.length - 1].id : null; }
export function ava(st, cls = '') {
  const pid = photoId(st.id);
  return `<span class="ava ${cls}" ${pid ? `data-file="${pid}"` : ''}>${esc(initial(st.name))}</span>`;
}

export function planBar(e, big) {
  const d = S.due(e);
  return `<span class="plan ${big ? 'big' : ''}" role="img" aria-label="${S.bn(d.rows.filter(r => r.st === 'paid').length)}/${S.bn(d.rows.length)} কিস্তি পরিশোধ">${d.rows.map(r => {
    if (r.st === 'paid') return '<i class="paid"></i>';
    if (r.covered > 0) return `<i class="part ${r.st}" style="--p:${Math.round(r.covered / r.amount * 100)}%"></i>`;
    return `<i class="${r.st === 'later' ? '' : r.st}"></i>`;
  }).join('')}</span>`;
}

export function dueLabel(d) {
  if (d.total <= 0) return '<span class="st paid">পরিশোধিত</span>';
  if (d.overdue > 0) return `<span class="st late">${d.lateDays > 0 ? S.bn(d.lateDays) + ' দিন পার' : 'ভর্তি ফি বাকি'}</span>`;
  if (d.next && d.next.dd <= 3) return `<span class="st soon">${d.next.dd === 0 ? 'আজ দেয়' : S.bn(d.next.dd) + ' দিন পর দেয়'}</span>`;
  return `<span class="st later">চলমান</span>`;
}

export const methodName = { cash: 'ক্যাশ', bkash: 'বিকাশ', nagad: 'নগদ' };
export const mth = m => `<span class="mth ${m}"><i></i>${methodName[m] || m}</span>`;

let toastT;
export function toast(msg, undo, err) {
  $('.toast')?.remove();
  const el = document.createElement('div');
  el.className = 'toast' + (err ? ' err' : ''); el.setAttribute('role', err ? 'alert' : 'status');
  el.innerHTML = `${icon(err ? 'alert' : 'check')}<span>${msg}</span>${undo ? '<button type="button">ফেরত নিন</button>' : ''}`;
  document.body.append(el);
  if (undo) el.querySelector('button').onclick = () => { undo(); el.remove(); };
  clearTimeout(toastT); toastT = setTimeout(() => el.remove(), 4200);
}

export function sheet({ title, sub = '', body, foot = '', wide = false, onOpen, onClose }) {
  const d = document.createElement('dialog');
  d.className = 'sheet' + (wide ? ' wide' : '');
  d.setAttribute('closedby', 'any');
  d.setAttribute('aria-labelledby', 'shT');
  d.innerHTML = `<div class="sh-head"><h2 id="shT">${title}${sub ? `<small>${sub}</small>` : ''}</h2><button class="iconbtn" data-x aria-label="বন্ধ করুন">${icon('close')}</button></div><div class="sh-body">${body}</div>${foot ? `<div class="sh-foot">${foot}</div>` : ''}`;
  document.body.append(d);
  d.querySelector('[data-x]').onclick = () => d.close();
  if (!('closedBy' in HTMLDialogElement.prototype)) {
    d.addEventListener('click', ev => {
      if (ev.target !== d) return;
      const r = d.getBoundingClientRect();
      if (r.top <= ev.clientY && ev.clientY <= r.bottom && r.left <= ev.clientX && ev.clientX <= r.right) return;
      d.close();
    });
  }
  d.addEventListener('close', () => { onClose?.(); d.remove(); });
  d.showModal();
  const first = d.querySelector('.sh-body .inp:not([type=date]), .sh-body textarea');
  if (first) first.focus(); else d.querySelector('.sh-body')?.setAttribute('tabindex', '-1'), d.querySelector('.sh-body')?.focus();
  hydrate(d);
  onOpen?.(d);
  return d;
}

export function printHTML(html, page) {
  let p = $('#print');
  if (!p) { p = document.createElement('div'); p.id = 'print'; document.body.append(p); }
  p.innerHTML = `<style>@page{size:${page};margin:${page.startsWith('80mm') ? '0' : '8mm'}}</style>${html}`;
  hydrate(p);
  setTimeout(() => window.print(), 250);
}

export function qrSVG(text, cls = '') {
  if (typeof qrcode === 'undefined') return `<svg class="${cls}" viewBox="0 0 10 10"><rect width="10" height="10" fill="#eee"/></svg>`;
  const q = qrcode(0, 'M'); q.addData(text); q.make();
  const n = q.getModuleCount();
  let d = '';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) d += `M${c} ${r}h1v1h-1z`;
  return `<svg class="${cls}" viewBox="-1 -1 ${n + 2} ${n + 2}" shape-rendering="crispEdges"><rect x="-1" y="-1" width="${n + 2}" height="${n + 2}" fill="#fff"/><path d="${d}" fill="#111826"/></svg>`;
}

export function isDemoNumber(p) { return /^01[01]/.test(String(p).replace(/\D/g, '')); }
export function call(phone) {
  if (isDemoNumber(phone)) return toast('ডেমো নম্বর, আসল কল যাবে না');
  location.href = 'tel:' + phone;
}

export function syncInvalid(form) {
  form.addEventListener('blur', e => { if (e.target.matches('[required],[pattern]')) e.target.toggleAttribute('aria-invalid', !e.target.checkValidity()); }, true);
  form.addEventListener('input', e => { if (e.target.checkValidity?.()) e.target.removeAttribute('aria-invalid'); });
}

export const phoneFmt = p => { const x = String(p).replace(/\D/g, ''); return x.length === 11 ? x.slice(0, 5) + ' ' + x.slice(5) : p; };
