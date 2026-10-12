import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Runs against the audited local snapshots; no mock or live scoring API is needed.
// PLAYWRIGHT_MODULE_PATH can point to the runtime-owned Playwright installation.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = process.env.BDC_PARTNERS_QA_OUTPUT || '/tmp/bdc-partners-qa';
const base = process.env.BDC_PARTNERS_QA_BASE || 'http://127.0.0.1:3014';
const route = '/tournaments/blind-draw-championship/partenaires';
const shared = route + '?player=nicolas-pdc&season=2027&phase=pool&rounds=1&rounds=2&left=jeff-tdc&right=laurent-bdc';
await mkdir(out, { recursive: true });
const playwright = await import(process.env.PLAYWRIGHT_MODULE_PATH
  ? pathToFileURL(resolve(process.env.PLAYWRIGHT_MODULE_PATH, 'index.mjs')).href
  : 'playwright');
const server = process.env.BDC_PARTNERS_QA_BASE ? null : spawn(process.execPath,
  [resolve(root, 'node_modules/next/dist/bin/next'), 'dev', '--webpack', '--hostname', '127.0.0.1', '--port', '3014'],
  { cwd: root, env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
let logs = '';
server?.stdout.on('data', chunk => { logs += chunk; });
server?.stderr.on('data', chunk => { logs += chunk; });
let browser;
const pageErrors = [];
const consoleErrors = [];
const results = [];
const pass = message => { results.push(message); console.log('PASS browser: ' + message); };

async function goto(page, path) {
  const response = await page.goto(base + path);
  assert.equal(response?.status(), 200, path);
  await page.locator('main').waitFor();
  await page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
}
function roundParams(url) {
  return new URL(url).searchParams.getAll('rounds').flatMap(value => value.split(',')).filter(Boolean).sort();
}
function card(page, partnerId) {
  return page.locator('[data-testid="partner-card"][data-partner-id="' + partnerId + '"]').filter({ visible: true });
}
function numberPattern(value) {
  return new RegExp(value.toFixed(2).replace('.', '[,.]'));
}
async function openFilters(page) {
  const disclosure = page.locator('[data-testid="filter-disclosure"]');
  if (await disclosure.count() && await disclosure.getAttribute('open') === null) await disclosure.locator('> summary').click();
}
async function noOverflow(page, path, width) {
  await page.setViewportSize({ width, height: 900 });
  await page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
  const dimensions = await page.evaluate(() => ({ width: innerWidth, page: document.documentElement.scrollWidth,
    offenders: [...document.querySelectorAll('main *')].filter(el => {
      const box = el.getBoundingClientRect();
      return box.width > 0 && (box.right > innerWidth + 1 || box.left < -1);
    }).slice(0, 8).map(el => ({ tag: el.tagName, class: el.className, text: el.textContent?.slice(0, 60) })) }));
  assert.ok(dimensions.page <= dimensions.width + 1, path + ' at ' + width + 'px: ' + JSON.stringify(dimensions));
}

try {
  let ready = false;
  for (let attempt = 0; attempt < 120; attempt++) {
    try { await fetch(base + '/login'); ready = true; break; } catch { await new Promise(done => setTimeout(done, 500)); }
  }
  assert.ok(ready, 'Next dev server did not start: ' + logs.slice(-2000));
  browser = await playwright.chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE_PATH, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1080 }, reducedMotion: 'reduce' });
  // Use the app's existing audience-measurement opt-out in this isolated QA
  // browser. This keeps the test independent of the unrelated analytics API.
  await page.addInitScript(() => localStorage.setItem('974-audience-opt-out', 'true'));
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });

  await goto(page, shared);
  const main = page.locator('main');
  const filters = page.locator('[data-testid="filters"]');
  await filters.waitFor({ state: 'attached' });
  assert.equal(await filters.locator('[name="player"]').inputValue(), 'nicolas-pdc');
  assert.equal(await filters.locator('[name="season"]').inputValue(), '2027');
  assert.equal(await filters.locator('[name="phase"]').inputValue(), 'pool');
  assert.deepEqual(roundParams(page.url()), ['1', '2']);
  assert.equal(new URL(page.url()).searchParams.get('left'), 'jeff-tdc');
  assert.equal(new URL(page.url()).searchParams.get('right'), 'laurent-bdc');
  assert.match(await main.textContent(), /Premières observations/);
  assert.match(await main.textContent(), /forme du jour/);
  for (const [id, personal, collective] of [['jeff-tdc', 42.46, 40.16], ['laurent-bdc', 41.84, 38.67]]) {
    const text = await card(page, id).textContent();
    assert.match(text, numberPattern(personal), id + ' individual weighted average');
    assert.match(text, numberPattern(collective), id + ' duo weighted average');
  }
  const jeffText = await card(page, 'jeff-tdc').textContent();
  assert.match(jeffText, /incomplet|partiel/i, 'The M1 match with missing legs stays visibly partial');
  assert.match(await main.textContent(), /provisoir/i, 'M2 points stay provisional');
  assert.match(await main.textContent(), /Meilleurs résultats observés/);
  assert.match(await main.textContent(), /Mon meilleur rendement individuel/);
  assert.match(await main.textContent(), /Meilleur scoring collectif/);
  assert.match(await page.locator('[data-criterion="results"] > strong').textContent(), /Laurent/);
  assert.match(await page.locator('[data-criterion="individual"] > strong').textContent(), /Jeff/);
  assert.match(await page.locator('[data-criterion="collective"] > strong').textContent(), /Jeff/);
  assert.equal(await card(page, 'jeff-tdc').locator('.bp-match-evolution-item').count(), 0, 'M1 has no invented chronological chart');
  assert.equal(await card(page, 'laurent-bdc').locator('.bp-match-evolution-item').count(), 6, 'M2 has six truly ordered observations');
  await page.screenshot({ path: resolve(out, 'nicolas-jeff-laurent-desktop.png'), fullPage: true });
  await page.reload();
  await filters.waitFor({ state: 'attached' });
  assert.equal(await filters.locator('[name="player"]').inputValue(), 'nicolas-pdc');
  assert.equal(await filters.locator('[name="left"]').inputValue(), 'jeff-tdc');
  assert.equal(await filters.locator('[name="right"]').inputValue(), 'laurent-bdc');
  assert.deepEqual(roundParams(page.url()), ['1', '2']);
  pass('shared URL reloads Nicolas / Jeff / Laurent with weighted averages, coverage and provisional M2 points.');

  const comparisonForm = page.locator('[data-testid="comparison"] form');
  await comparisonForm.locator('[name="left"]').selectOption('laurent-bdc');
  await comparisonForm.locator('[name="right"]').selectOption('jeff-tdc');
  await Promise.all([page.waitForURL(url => url.searchParams.get('left') === 'laurent-bdc'), comparisonForm.locator('button[type="submit"]').click()]);
  assert.equal(new URL(page.url()).searchParams.get('right'), 'jeff-tdc');
  assert.equal(new URL(page.url()).searchParams.get('phase'), 'pool');
  assert.deepEqual(roundParams(page.url()), ['1', '2']);
  assert.equal(await page.locator('[data-testid="partner-card"]:visible').first().getAttribute('data-partner-id'), 'laurent-bdc');
  await page.reload();
  assert.equal(await page.locator('[data-testid="partner-card"]:visible').first().getAttribute('data-partner-id'), 'laurent-bdc');
  pass('native side-by-side comparison can swap partners and preserves the same season, phase and rounds after reload.');

  // Native GET submission is exercised instead of reconstructing URLs in the test.
  await openFilters(page);
  await filters.locator('[name="phase"]').selectOption('finals');
  await Promise.all([page.waitForURL(url => url.searchParams.get('phase') === 'finals'), filters.locator('button[type="submit"]').click()]);
  await page.locator('[data-testid="filters"]').waitFor({ state: 'attached' });
  // The observed pairs may remain as context, but Nicolas has no final match,
  // so every filtered statistic and conclusion must be unavailable.
  assert.doesNotMatch(await main.textContent(), /42[,.]46|41[,.]84|40[,.]16|38[,.]67/, 'Stale KPI values must not survive the phase filter');
  for (const article of await page.locator('[data-criterion]').all()) {
    assert.match(await article.locator('> strong').textContent(), /insuffisantes/i);
  }
  assert.match(await main.textContent(), /aucun|pas de|insuffisant/i);
  pass('phase GET submission updates cards, charts and synthesis together; no Nicolas final is invented.');

  // Kévin played finals in both rounds, so this checks a real change of all
  // denominators and the M1 sets fallback, rather than two equivalent views.
  for (const [phase, fabienPersonal, fabienDuo, alexPersonal, alexDuo] of [
    ['pool', 47.55, 46.28, 45.07, 44.90], ['all', 47.64, 45.47, 47.05, 47.84]
  ]) {
    await goto(page, route + '?player=kevin-tdc&season=2027&phase=' + phase + '&rounds=1&rounds=2&left=fabien-pdc&right=alexandre-pdc');
    for (const [id, personal, collective] of [['fabien-pdc', fabienPersonal, fabienDuo], ['alexandre-pdc', alexPersonal, alexDuo]]) {
      const text = await card(page, id).textContent();
      assert.match(text, numberPattern(personal), id + ' filtered individual average in ' + phase);
      assert.match(text, numberPattern(collective), id + ' filtered duo average in ' + phase);
    }
    if (phase === 'all') assert.match(await main.textContent(), /sets|victoires en matchs/i, 'Mixed sets/legs comparison names its compatible results criterion');
  }
  pass('including Kévin finals changes individual and collective averages for both partners and documents the sets criterion.');

  await goto(page, route + '?player=nicolas-pdc&season=2027&phase=pool&rounds=1&left=jeff-tdc');
  assert.equal(await page.locator('[data-testid="partner-card"]:visible').count(), 1);
  assert.match(await card(page, 'jeff-tdc').textContent(), numberPattern(42.46));
  assert.doesNotMatch(await main.textContent(), /41[,.]84|38[,.]67/, 'M2 must not survive the round filter');
  assert.match(await main.textContent(), /un seul partenaire|seul partenaire|une seule association|pas.*alternative|sans.*alternative/i);
  assert.doesNotMatch(await main.textContent(), /Meilleure association observée à ce stade.*Jeff/i, 'No winner is announced without an observed alternative');
  pass('one included round gives one observed partner and no false winner or other-partner baseline.');

  await goto(page, route);
  assert.equal(await page.locator('[data-testid="partner-card"]:visible').count(), 0);
  assert.match(await main.textContent(), /sélectionn|choisi/i);
  await goto(page, route + '?player=not-a-player&season=2027&phase=pool');
  assert.equal(await page.locator('[data-testid="partner-card"]:visible').count(), 0);
  assert.match(await main.textContent(), /inconnu|invalide|introuvable/i);
  await goto(page, route + '?player=nicolas-pdc&season=2028&phase=pool');
  assert.equal(await page.locator('[data-testid="partner-card"]:visible').count(), 0);
  assert.doesNotMatch(await main.textContent(), /42[,.]46|41[,.]84/);
  assert.match(await main.textContent(), /aucun|pas de|non disponible|indisponible/i);
  pass('selection invitation, invalid ID and a season without participation have explicit empty states.');

  await goto(page, shared);
  await openFilters(page);
  const playerSelect = page.locator('[data-testid="filters"] [name="player"]');
  await playerSelect.focus();
  assert.equal(await playerSelect.evaluate(el => document.activeElement === el), true);
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement?.closest('[data-testid="filters"]') !== null), true);
  const accessibleControls = await page.locator('[data-testid="filters"] select').evaluateAll(nodes => nodes.map(el => ({
    name: el.name, labelled: !!el.labels?.length || !!el.getAttribute('aria-label') || !!el.getAttribute('aria-labelledby')
  })));
  assert.ok(accessibleControls.length >= 3);
  assert.ok(accessibleControls.every(control => control.labelled), JSON.stringify(accessibleControls));
  pass('native controls have accessible labels and remain keyboard reachable.');
  const disclosure = page.locator('[data-testid="filter-disclosure"]');
  if (await disclosure.count() && await disclosure.getAttribute('open') !== null) await disclosure.locator('> summary').click();

  for (const width of [320, 390, 430, 1440]) {
    await noOverflow(page, shared, width);
    assert.ok(await page.locator('[data-testid="partner-card"]:visible').count() >= 2);
    await page.screenshot({ path: resolve(out, 'nicolas-jeff-laurent-' + width + 'px.png'), fullPage: true });
  }
  pass('320 / 390 / 430px mobile cards and 1440px desktop have no horizontal page overflow.');
  await page.locator('[data-testid="comparison"] details').evaluateAll(nodes => nodes.forEach(el => { el.open = true; }));
  for (const width of [320, 390, 430, 1440]) await noOverflow(page, shared + ' (expanded)', width);
  await page.setViewportSize({ width: 390, height: 900 });
  await page.locator('[data-testid="comparison"]').scrollIntoViewIfNeeded();
  await page.screenshot({ path: resolve(out, 'comparison-expanded-mobile.png') });
  pass('expanded metric definitions, finishes, match sources and actual M2 evolution also fit every tested width.');

  await goto(page, '/tournaments/blind-draw-championship');
  const entry = page.locator('a').filter({ hasText: 'Analyse des partenaires' }).first();
  await entry.waitFor();
  assert.equal(new URL(await entry.getAttribute('href'), base).pathname, route);
  await goto(page, '/tournaments/blind-draw-championship/manche-1/joueurs/nicolas-pdc');
  const profileEntry = page.locator('a').filter({ hasText: 'Analyse des partenaires' }).first();
  await profileEntry.waitFor();
  const profileUrl = new URL(await profileEntry.getAttribute('href'), base);
  assert.equal(profileUrl.pathname, route);
  assert.equal(profileUrl.searchParams.get('player'), 'nicolas-pdc');
  pass('BDC hub and Nicolas M1 profile expose a working contextual partner-analysis link.');
  assert.deepEqual(pageErrors, [], 'Unexpected JavaScript errors');
  assert.deepEqual(consoleErrors, [], 'Unexpected browser console errors');
  pass('no browser JavaScript or console errors.');
} catch (error) {
  console.error(error.stack || error);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  server?.kill('SIGTERM');
  await writeFile(resolve(out, 'server.log'), logs);
  await writeFile(resolve(out, 'results.json'), JSON.stringify({ passed: results, pageErrors, consoleErrors, exitCode: process.exitCode || 0 }, null, 2));
}
