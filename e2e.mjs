import puppeteer from 'puppeteer-core';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const BASE = process.env.BASE || 'http://127.0.0.1:8472/app/';
const OUT = process.env.OUT || 'e2e-out';
const CHROME = process.env.CHROME || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const OWNER = { phone: '01000000001', pw: 'test1234' };
fs.mkdirSync(OUT, { recursive: true });

const results = [];
const wait = ms => new Promise(r => setTimeout(r, ms));
function check(name, ok, detail = '') { results.push({ name, ok, detail }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? ' :: ' + detail : '')); }

const dayNames = ['রবি', 'সোম', 'মঙ্গল', 'বুধ', 'বৃহঃ', 'শুক্র', 'শনি'];
const now = new Date();
const todayISO = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
const startT = new Date(now.getTime() - 5 * 60000);
const classTime = `${String(startT.getHours()).padStart(2, '0')}:${String(startT.getMinutes()).padStart(2, '0')}`;

async function newBrowser(extra = []) {
  return puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--lang=bn-BD', '--window-size=1440,900', ...extra] });
}

async function openPage(browser, mobile) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }, { name: 'prefers-color-scheme', value: 'light' }]);
  await page.setViewport(mobile ? { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { width: 1440, height: 900, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error' && !/401|Failed to load resource/.test(m.text())) errors.push(m.text()); });
  page.errors = errors;
  return page;
}

async function shot(page, name) { await wait(250); await page.screenshot({ path: path.join(OUT, name + '.png') }); }
const text = page => page.evaluate(() => document.body.innerText);
const click = (page, sel) => page.$eval(sel, el => el.click());
async function setVal(page, sel, v) { await page.$eval(sel, (el, v) => { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }, v); }
async function go(page, hash) { await page.evaluate(h => { location.hash = h; }, hash); await wait(500); }
async function apiBoot(page) { return page.evaluate(async () => (await fetch('api/boot', { credentials: 'same-origin' })).json()); }
async function sheetDone(page) { await page.waitForFunction(() => !document.querySelector('dialog[open]'), { timeout: 8000 }); await wait(300); }

async function login(page, phone, pw) {
  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await page.waitForSelector('#loginf');
  await page.type('#loginf [name=phone]', phone);
  await page.type('#loginf [name=password]', pw);
  await click(page, '#loginf button');
  await page.waitForSelector('.app', { timeout: 10000 });
  await wait(400);
}

async function formSheet(page, fields, extra) {
  await page.waitForSelector('dialog[open] #fsf');
  for (const [n, v] of Object.entries(fields)) await setVal(page, `dialog[open] #fsf [name="${n}"]`, v);
  if (extra) await extra();
  await click(page, 'dialog[open] #fsgo');
  await sheetDone(page);
}

function tinyJpeg() {
  return Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=', 'base64');
}

async function admit(page, { name, en, phone, dob, seat, pay, method, trx, photo }) {
  await go(page, '#/admit?new=1');
  await page.waitForSelector('#wiz [name=name]');
  if (photo) {
    const input = await page.$('[data-dfile=photo]');
    await input.uploadFile(photo);
    await page.waitForFunction(() => document.querySelector('#ppick img'), { timeout: 10000 });
  }
  await setVal(page, '#wiz [name=name]', name);
  await setVal(page, '#wiz [name=en]', en);
  await setVal(page, '#wiz [name=phone]', phone);
  await setVal(page, '#wiz [name=dob]', dob);
  await setVal(page, '#wiz [name=father]', 'মোঃ করিম');
  await setVal(page, '#wiz [name=guardianPhone]', '01000000099');
  await click(page, '#wiz button[type=submit]'); await wait(400);
  await click(page, '[data-course]'); await wait(300);
  await click(page, '[data-batch]'); await wait(300);
  await click(page, `[data-seat="${seat}"]`); await wait(300);
  await click(page, '#wiz button[type=submit]'); await wait(400);
  if (method && method !== 'cash') { await click(page, `[data-pm=${method}]`); await wait(300); await setVal(page, '#wiz [name=trx]', trx); await wait(600); }
  if (pay != null) { await setVal(page, '#wiz [name=payNow]', String(pay)); await wait(200); }
  await click(page, '#wiz button[type=submit]'); await wait(400);
  await click(page, '#wiz button[type=submit]'); await wait(400);
  await click(page, '#wiz button[type=submit]');
  await page.waitForSelector('.done', { timeout: 10000 });
}

const browser = await newBrowser();
try {
  const owner = await openPage(browser);
  await owner.goto(BASE, { waitUntil: 'networkidle0' });
  await shot(owner, '01-login');
  await owner.type('#loginf [name=phone]', OWNER.phone);
  await owner.type('#loginf [name=password]', 'wrongpass');
  await click(owner, '#loginf button'); await wait(800);
  check('wrong password is refused', (await owner.$eval('#lerr', e => e.textContent)).includes('মেলেনি'));
  await login(owner, OWNER.phone, OWNER.pw);
  check('owner logs in and sees the setup steps', (await text(owner)).includes('শুরু করা যাক'));
  await shot(owner, '02-empty-today');

  await click(owner, '[data-newcourse]');
  await formSheet(owner, { name: 'অফিস অ্যাপ্লিকেশন', en: 'Office Application', months: '3', hours: '72', inst: '2', fee: '6000', admission: '1000' });
  await go(owner, '#/batches');
  await click(owner, '[data-newteacher]');
  await formSheet(owner, { name: 'মাহমুদুল হাসান', subject: 'অফিস' });
  await click(owner, '[data-newbatch]');
  await formSheet(owner, { code: 'OA-1', time: classTime, seats: '6', start: todayISO }, async () => {
    await owner.$$eval('dialog[open] [data-day]', els => els.forEach(e => e.setAttribute('aria-pressed', 'false')));
    await click(owner, `dialog[open] [data-day="${dayNames[now.getDay()]}"]`);
  });
  let boot = await apiBoot(owner);
  check('course, teacher and batch saved on the server', boot.course?.length === 1 && boot.teacher?.length === 1 && boot.batch?.length === 1 && boot.batch[0].days === dayNames[now.getDay()]);
  await shot(owner, '03-batches');

  await go(owner, '#/settings');
  await click(owner, '[data-newstaff]');
  await formSheet(owner, { name: 'তানিয়া আক্তার', phone: '01000000002', role: 'desk', password: 'desk1234' });
  await click(owner, '[data-newstaff]');
  await formSheet(owner, { name: 'মাহমুদুল হাসান', phone: '01000000003', role: 'teacher', password: 'teach1234' });
  check('owner adds desk and teacher logins', (await text(owner)).includes('তানিয়া আক্তার'));

  const photo = path.resolve(OUT, 'face.jpg');
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=0x9db4d8:s=300x360,drawbox=x=90:y=70:w=120:h=140:color=0xe9c7a8:t=fill,drawbox=x=40:y=230:w=220:h=130:color=0x3b2f45:t=fill', '-frames:v', '1', path.resolve(OUT, 'face.png')]);
  fs.writeFileSync(photo, tinyJpeg());
  await admit(owner, { name: 'মেহজাবিন রহমান', en: 'Mehjabin Rahman', phone: '01000000011', dob: '2010-03-14', seat: 2, pay: 4000, method: 'bkash', trx: '9KD7A2XQ1B', photo: path.resolve(OUT, 'face.png') });
  check('admission 1 done with roll DK-26-0001', (await text(owner)).includes('-0001'));
  await shot(owner, '04-admit-done');
  await admit(owner, { name: 'রাকিব হোসেন', en: 'Rakib Hossain', phone: '01000000012', dob: '2003-05-01', seat: 3, pay: 1000 });
  boot = await apiBoot(owner);
  const s1 = boot.student.find(s => s.en === 'Mehjabin Rahman'), s2 = boot.student.find(s => s.en === 'Rakib Hossain');
  const e1 = boot.enrollment.find(e => e.studentId === s1.id), e2 = boot.enrollment.find(e => e.studentId === s2.id);
  check('two students, seats 2 and 3, on the server', boot.student.length === 2 && e1.seat === 2 && e2.seat === 3);
  check('admission payments split: fee + installment, bKash TrxID kept', boot.payment.filter(p => p.studentId === s1.id).length === 2 && boot.payment.every(p => p.studentId !== s1.id || p.trx === '9KD7A2XQ1B'));
  check('photo uploaded and linked to the student', boot.doc.some(d => d.studentId === s1.id && d.kind === 'photo'));
  check('admission SMS logged (demo number, not sent)', boot.message.some(m => m.studentId === s1.id && m.kind === 'admission' && m.status === 'demo'));

  await owner.reload({ waitUntil: 'networkidle0' }); await wait(800);
  await go(owner, '#/students');
  check('data persists after reload', (await text(owner)).includes('মেহজাবিন রহমান'));
  await shot(owner, '05-students');

  await go(owner, '#/');
  const before = await owner.$eval('.ledger .lead strong', e => e.textContent);
  const desk = await openPage(browser);
  await login(desk, '01000000002', 'desk1234');
  await go(desk, '#/s/' + s2.id);
  check('desk in a separate browser sees the same student', (await text(desk)).includes('রাকিব হোসেন'));
  await click(desk, '[data-collect]');
  await desk.waitForSelector('dialog[open] #payf');
  await setVal(desk, 'dialog[open] [name=amount]', '2500');
  await click(desk, 'dialog[open] #paybtn');
  await desk.waitForFunction(() => document.querySelector('dialog[open] .receipt'), { timeout: 8000 });
  await shot(desk, '06-receipt');
  check('desk cannot see the void button', !(await desk.$('dialog[open] [data-void]')));
  await desk.keyboard.press('Escape'); await wait(300);
  boot = await apiBoot(desk);
  const pay2 = boot.payment.filter(p => p.studentId === s2.id && p.amount === 2500)[0];
  check('payment of 2,500 recorded with a receipt number', !!pay2 && /^R-\d+$/.test(pay2.receipt));
  await owner.evaluate(() => window.dispatchEvent(new Event('daksho:refresh')));
  await owner.waitForFunction(b => document.querySelector('.ledger .lead strong')?.textContent !== b, { timeout: 8000 }, before).catch(() => {});
  const after = await owner.$eval('.ledger .lead strong', e => e.textContent);
  check('owner screen picks up the desk payment without a reload', after !== before && after.includes('৭,৫০০'), before + ' -> ' + after);

  await owner.reload({ waitUntil: 'networkidle0' }); await wait(600);
  await go(owner, '#/s/' + s2.id);
  await owner.$$eval('[data-receipt]', (els, id) => els.find(e => e.dataset.receipt === id)?.click(), pay2.id);
  await owner.waitForSelector('dialog[open] [data-void]');
  await click(owner, 'dialog[open] [data-void]'); await wait(200);
  await setVal(owner, 'dialog[open] #voidwhy', 'ভুল ছাত্রের নামে কাটা');
  await click(owner, 'dialog[open] [data-void]');
  await sheetDone(owner);
  boot = await apiBoot(owner);
  check('owner voids the receipt with a reason; it stays in the record', boot.payment.find(p => p.id === pay2.id)?.void === 'ভুল ছাত্রের নামে কাটা');

  await go(owner, '#/s/' + s1.id);
  await click(owner, '[data-idcard]');
  await owner.waitForSelector('dialog[open] .idcard svg path');
  check('ID card shows a QR code', true);
  await shot(owner, '07-idcard');
  await owner.keyboard.press('Escape'); await wait(200);

  const qrgen = require('./web/vendor/qrcode.js');
  const q = qrgen(0, 'M'); q.addData(new URL(BASE).origin + '/q/' + s1.qr); q.make();
  const gif = Buffer.from(q.createDataURL(8, 32).split(',')[1], 'base64');
  fs.writeFileSync(path.resolve(OUT, 'qr.gif'), gif);
  const y4m = path.resolve(OUT, 'qr.y4m');
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', path.resolve(OUT, 'qr.gif'), '-vf', 'loop=loop=60:size=1:start=0,scale=280:280:flags=neighbor,pad=640:480:180:100:white,fps=10', '-frames:v', '60', '-pix_fmt', 'yuv420p', y4m]);
  const camBrowser = await newBrowser(['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--use-file-for-fake-video-capture=' + y4m]);
  try {
    const teacher = await openPage(camBrowser, true);
    await login(teacher, '01000000003', 'teach1234');
    check('teacher sees no money on the home screen', !(await text(teacher)).includes('আজ জমা'));
    boot = await apiBoot(teacher);
    check('teacher boot carries no payments and only photos', !boot.payment && (boot.doc || []).every(d => d.kind === 'photo'));
    await go(teacher, '#/scan');
    await click(teacher, '#camgo');
    await teacher.waitForFunction(() => document.querySelector('#result.ok, #result.late'), { timeout: 20000 }).catch(() => {});
    const res = await teacher.$eval('#result', e => e.className + ' | ' + e.innerText);
    check('camera scan of the ID-card QR marks Mehjabin present', /result (ok|late)/.test(res) && res.includes('মেহজাবিন'), res.replace(/\s+/g, ' ').slice(0, 120));
    check('scan result shows the student photo to the teacher', !!(await teacher.$('#result .who img')));
    await shot(teacher, '08-scan-camera');
    await teacher.waitForFunction(() => document.querySelector('#result.already'), { timeout: 9000 }).catch(() => {});
    check('the same card seen again says already marked', !!(await teacher.$('#result.already')));
    await setVal(teacher, '#usb', s2.roll);
    await teacher.$eval('#usbf', f => f.requestSubmit());
    await teacher.waitForFunction(n => document.querySelector('#result')?.innerText.includes(n), { timeout: 8000 }, 'রাকিব');
    check('roll number typed at the desk marks Rakib present', (await teacher.$eval('#result', e => e.innerText)).includes('রাকিব'));
    await setVal(teacher, '#usb', 'https://x/q/000000000000');
    await teacher.$eval('#usbf', f => f.requestSubmit());
    await teacher.waitForFunction(() => document.querySelector('#result.bad'), { timeout: 8000 });
    check('an unknown card is refused in red', true);
    boot = await apiBoot(teacher);
    const att = boot.att.find(a => a.date === todayISO);
    check('two students present on the server, none absent yet', att && att.present.length === 2 && !att.closed);
    check('no absent SMS before the class is closed', !boot.message);
    await teacher.waitForSelector('#closeatt');
    await click(teacher, '#closeatt');
    await teacher.waitForSelector('dialog[open] #closego');
    await click(teacher, 'dialog[open] #closego');
    await sheetDone(teacher);
    await shot(teacher, '09-scan-closed');
    check('class closed', (await text(teacher)).includes('হাজিরা শেষ'));
    check('teacher page has no script errors', teacher.errors.length === 0, teacher.errors.join(' | '));
  } finally { await camBrowser.close(); }

  boot = await apiBoot(owner);
  const att = boot.att.find(a => a.date === todayISO);
  check('nobody absent, so no absent SMS went out', att.closed && att.absent.length === 0 && !boot.message.some(m => m.kind === 'absent'));

  await go(owner, '#/s/' + s1.id);
  check('certificate is held while dues remain', (await text(owner)).includes('সনদ আটকে আছে'));
  await go(owner, '#/dues?f=soon');
  await shot(owner, '10-dues');
  await go(owner, '#/settings');
  await setVal(owner, '#centref [name=address]', 'সাতমাথা, বগুড়া');
  await click(owner, '#centref button'); await wait(800);
  boot = await apiBoot(owner);
  check('centre address saved', boot.centre.address === 'সাতমাথা, বগুড়া');
  await go(owner, '#/');
  await shot(owner, '11-today');
  const mob = await openPage(browser, true);
  await login(mob, OWNER.phone, OWNER.pw);
  await shot(mob, '12-phone-today');
  check('owner and desk pages have no script errors', owner.errors.length === 0 && desk.errors.length === 0 && mob.errors.length === 0, [...owner.errors, ...desk.errors, ...mob.errors].join(' | '));
} catch (e) {
  check('run finished without crashing', false, String(e.stack || e));
} finally {
  await browser.close();
}
const failed = results.filter(r => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 1));
process.exit(failed.length ? 1 : 0);
