/* Drives the real app in Chromium against the real server code on in-memory sheets.
   Usage: node tests/e2e.test.js   (screenshots land in tests/shots/) */
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { start } = require('./dev-server');

const NOW = '2026-11-11T04:30:00Z', PORT = 8791, URL = 'http://localhost:' + PORT;
const shots = path.join(__dirname, 'shots');

(async () => {
  const { gas, server, addAttendance } = await start(PORT, { now: NOW });
  addAttendance(gas, 'STUDENT ATTENDANCE - NOVEMBER 2026', [
    { batch: 'A,B', regNo: '2051868', name: 'AMALA B', course: 'PCAIASP', marks: ' PPPPPP PPP' },
    { batch: 'A', regNo: '2017211', name: 'SREELEKSHMI S', course: 'PCAIA', marks: ' LPPPLP P  ' },
    { batch: 'D', regNo: '2039365, 2039366', name: 'AMITH RAJ', course: 'DAIMSO, ADVEX', marks: ' PP        ' },
    { batch: 'B', regNo: '2058851-52', name: 'DEVA NARAYANAN A', course: 'TALLY, GCC VAT, ZOHO', marks: '     PP PPP' }
  ], 30);
  const pin = gas.data().getSheetByName('STAFF').data[1][2];
  fs.mkdirSync(shots, { recursive: true });
  const browser = await chromium.launch();
  const errors = [];
  let step = '';

  async function open(mode, viewport) {
    const ctx = await browser.newContext({ viewport: viewport || { width: 390, height: 844 }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    await page.clock.setFixedTime(new Date(NOW));
    await page.addInitScript(() => { window.__opened = []; window.open = u => { window.__opened.push(String(u)); return {}; }; });
    page.on('console', m => { if (m.type() === 'error') errors.push(step + ': ' + m.text()); });
    page.on('pageerror', e => errors.push(step + ': ' + e.message));
    await page.goto(URL + '/?mode=' + mode);
    return page;
  }
  const nav = (page, name) => page.getByRole('navigation').getByRole('button', { name, exact: true }).click();
  const submit = page => page.locator('.overlay button[type=submit]').click();
  const gone = page => page.locator('.overlay').waitFor({ state: 'detached' });
  const opened = page => page.evaluate(() => window.__opened.splice(0));
  async function check(page, name) {
    await page.waitForTimeout(150);
    const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert(over <= 0, name + ': page scrolls sideways by ' + over + 'px');
    await page.screenshot({ path: path.join(shots, name + '.png'), fullPage: true });
  }
  async function signIn(page, name, p) { await page.fill('#m-name', name); await page.fill('#m-pin', p); await page.getByRole('button', { name: 'Sign in', exact: true }).click(); }

  try {
    /* ---- director ---- */
    step = 'sign in';
    const page = await open('office');
    await signIn(page, 'Director', '000000');
    await page.getByText('Wrong name or PIN').waitFor();
    await signIn(page, 'Director', pin);
    await page.getByRole('heading', { name: 'Today' }).waitFor();

    step = 'pull students';
    await nav(page, 'More');
    await page.getByRole('button', { name: /Pull students/ }).click();
    await page.getByText(/Add 4 students/).waitFor();
    await page.getByRole('button', { name: 'Add them' }).click();
    await page.getByText('4 of 4 students').waitFor();
    await page.fill('#s-q', 'amala');
    await page.getByText('1 of 4 students').waitFor();

    step = 'student + fee plan';
    await page.getByRole('button', { name: /AMALA B/ }).click();
    await page.getByRole('heading', { name: 'AMALA B' }).waitFor();
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await page.fill('#f-phone', '98470 12345');
    await submit(page); await gone(page);
    await page.getByText('9847012345').or(page.getByText('98470 12345')).first().waitFor();
    await page.getByRole('button', { name: 'Set fee plan' }).click();
    await page.fill('#f-total', '40000'); await page.fill('#f-discount', '5000'); await page.fill('#f-down', '5000');
    await page.fill('#f-count', '6'); await page.fill('#f-firstDue', '2026-10-31');
    await submit(page); await gone(page);
    await page.getByText('late by 11 days').waitFor();

    step = 'collect fee';
    await page.getByRole('button', { name: 'Collect fee' }).click();
    assert.strictEqual(await page.inputValue('#f-amount'), '5000', 'amount is pre-filled with what is overdue');
    await page.fill('#f-amount', '6000'); await page.selectOption('#f-mode', 'GPAY');
    await submit(page);
    await page.locator('.receipt').getByText('GC-000001').waitFor();
    await check(page, 'receipt');
    await page.getByRole('button', { name: 'Send on WhatsApp' }).click();
    const sent = await opened(page);
    assert.match(sent[0], /^https:\/\/wa\.me\/919847012345\?text=Receipt%20GC-000001/);
    await page.getByRole('button', { name: 'Close' }).click();
    await page.getByText('₹29,000').first().waitFor();
    await check(page, 'student');

    step = 'dues + reminder';
    await nav(page, 'Fees');
    await page.getByText('not reminded yet').waitFor();
    await page.getByRole('button', { name: 'Remind on WhatsApp' }).click();
    assert.match(decodeURIComponent((await opened(page))[0]), /wa\.me\/919847012345\?text=Dear AMALA B, a fee instalment of Rs\.4000 for PCAIASP is due on 11 Nov/);
    await page.getByRole('button', { name: 'Refresh' }).click();
    await page.getByText('reminded 11 Nov').waitFor();
    await check(page, 'fees');
    await page.getByRole('tab', { name: 'Today' }).click();
    await page.getByText('AMALA B · ₹6,000').waitFor();
    await page.getByRole('button', { name: /Copy rows/ }).waitFor();

    step = 'attendance';
    await nav(page, 'Attendance');
    await page.getByText('7 days absent').waitFor();
    await page.getByRole('button', { name: 'WhatsApp parent' }).first().click();
    assert.match(decodeURIComponent((await opened(page))[0]), /AMITH RAJ has been absent .* for 7 days/);
    await check(page, 'attendance');

    step = 'computers';
    await nav(page, 'Computers');
    for (const label of ['PC-01', 'PC-02']) {
      await page.getByRole('button', { name: 'New computer' }).click();
      await page.fill('#f-label', label); await page.fill('#f-lab', 'Software lab');
      await submit(page); await gone(page);
      await page.locator('.pc', { hasText: label }).waitFor();
    }
    await page.locator('.pc', { hasText: 'PC-02' }).click();
    await page.getByRole('button', { name: 'Report a fault' }).click();
    await page.fill('#f-problem', 'Monitor flickers'); await submit(page); await gone(page);
    await page.locator('.pc', { hasText: '1 fault' }).waitFor();
    await nav(page, 'Students');
    await page.getByRole('button', { name: /AMALA B/ }).click();
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await page.selectOption('#f-computer', 'PC-01'); await submit(page); await gone(page);
    await nav(page, 'Computers');
    await page.locator('.pc.used', { hasText: 'AMALA' }).waitFor();
    await check(page, 'computers');

    step = 'upgrades';
    await nav(page, 'Upgrades');
    const amala = page.locator('.card', { hasText: 'AMALA B' });
    await amala.getByText('Power BI (POWER BI)').waitFor();
    await amala.getByRole('button', { name: 'Suggest on WhatsApp' }).first().click();
    assert.match(decodeURIComponent((await opened(page))[0]), /Hi AMALA B, since you are doing PCAIASP, Power BI is the best next step/);
    await check(page, 'upgrades');

    step = 'enquiry -> admission';
    await nav(page, 'Enquiries');
    await page.getByRole('button', { name: 'New enquiry' }).click();
    await page.fill('#f-name', 'Rahul Krishnan'); await page.fill('#f-phone', '9000000001'); await page.selectOption('#f-course', 'TALLY'); await page.selectOption('#f-source', 'Instagram');
    await submit(page); await gone(page);
    await page.getByText('Follow up today (1)').waitFor();
    await check(page, 'enquiries');
    await page.getByRole('button', { name: 'Admit' }).click();
    assert.strictEqual(await page.inputValue('#f-name'), 'Rahul Krishnan');
    await page.fill('#f-batch', 'C'); await submit(page);
    await page.getByText('5 of 5 students').waitFor();

    /* ---- student ---- */
    step = 'student app';
    const sp = await open('student');
    await page.waitForTimeout(50);
    await sp.fill('#s-reg', '2051868'); await sp.fill('#s-phone', '9000000000');
    await sp.getByRole('button', { name: 'Sign in', exact: true }).click();
    await sp.getByText(/does not match/).waitFor();
    await sp.fill('#s-phone', '9847012345');
    await sp.getByRole('button', { name: 'Sign in', exact: true }).click();
    await sp.getByRole('heading', { name: 'Hi Amala' }).waitFor();
    await sp.getByText('Your computer: PC-01').first().waitFor();
    await sp.getByText('Next: ₹4,000 by 11 Nov 2026.').waitFor();
    await sp.fill('#l-from', '2026-11-12'); await sp.fill('#l-to', '2026-11-13'); await sp.fill('#l-why', 'Family function');
    await sp.getByRole('button', { name: 'Apply for leave' }).click();
    await sp.locator('.pill', { hasText: 'pending' }).waitFor();
    await sp.getByRole('button', { name: 'I am interested' }).first().click();
    await sp.getByRole('button', { name: 'We will call you' }).waitFor();
    await check(sp, 'student-app');

    step = 'approve leave';
    await nav(page, 'Leaves');
    await page.getByText('Waiting for a decision').waitFor();
    await page.getByRole('button', { name: 'Approve' }).click();
    await page.locator('.pill', { hasText: 'approved' }).waitFor();
    await check(page, 'leaves');

    step = 'home';
    await nav(page, 'Home');
    const tile = t => page.locator('.tile2', { hasText: t });
    await tile('Collected today').locator('b', { hasText: '₹6,000' }).waitFor();
    await tile('Upgrade leads').getByText('1', { exact: true }).waitFor();
    await tile('Computers down').getByText('0 of 2').waitFor();
    await tile('Active students').getByText('5', { exact: true }).waitFor();
    await check(page, 'home');
    await nav(page, 'Batches');
    await page.locator('.card', { hasText: 'Batch A' }).getByText('2', { exact: true }).waitFor();
    await check(page, 'batches');

    /* ---- tutor ---- */
    step = 'tutor role';
    await nav(page, 'More');
    await page.getByRole('button', { name: /Staff logins/ }).click();
    await page.getByRole('button', { name: 'Add' }).click();
    await page.fill('#f-name', 'Anjali'); await page.fill('#f-pin', '1111'); await page.selectOption('#f-role', 'tutor');
    await submit(page); await gone(page);
    await page.getByText('Anjali').waitFor();
    await page.getByRole('button', { name: 'Back' }).click();
    await check(page, 'more');
    await page.getByRole('button', { name: /Sign out/ }).click();
    await signIn(page, 'Anjali', '1111');
    await page.getByText('Signed in as Anjali (tutor)').waitFor();
    await nav(page, 'Students');
    await page.getByText('5 of 5 students').waitFor();
    assert.strictEqual(await page.getByRole('navigation').getByRole('button', { name: 'Fees' }).count(), 0, 'tutors have no Fees section');
    assert.strictEqual(await page.getByText('₹').count(), 0, 'tutors see no amounts');
    await page.getByRole('button', { name: /AMALA B/ }).click();
    await page.getByRole('heading', { name: 'Attendance · November' }).waitFor();
    assert.strictEqual(await page.getByRole('button', { name: 'Collect fee' }).count(), 0);

    /* ---- wide screen + old screens still start ---- */
    step = 'desktop';
    const wide = await open('office', { width: 1280, height: 800 });
    await signIn(wide, 'Director', pin);
    await wide.getByRole('heading', { name: 'Today' }).waitFor();
    await check(wide, 'home-desktop');
    step = 'setup screen';
    const setup = await open('');
    await setup.getByRole('button', { name: /Centre Manager/ }).waitFor();
    await setup.getByRole('button', { name: /TV display/ }).waitFor();
    await check(setup, 'setup');

    assert.deepStrictEqual(errors, [], 'browser console errors');
    console.log('All browser checks passed');
  } catch (e) {
    console.log('FAILED at step "' + step + '": ' + e.message.split('\n').slice(0, 6).join('\n'));
    if (errors.length) console.log('console errors:\n' + errors.join('\n'));
    process.exitCode = 1;
  } finally {
    await browser.close();
    server.close();
  }
})();
