// Optional browser regression suite. Uses an isolated fixture app and the real
// component; no production route, authentication setting or data is modified.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { spawn } from "node:child_process";

const require = createRequire(import.meta.url);
const root = resolve(dirname(new URL(import.meta.url).pathname), "..");
const playwrightPath = process.env.PLAYWRIGHT_MODULE_PATH || resolve(root, "../../tests/workflow/node_modules/playwright");
const { chromium } = require(playwrightPath);
const fixtureRoot = mkdtempSync(resolve(tmpdir(), "974darts-captain-browser-"));
const out = resolve(process.env.CAPTAIN_QA_OUTPUT || "/tmp/974darts-captain-qa");
const port = process.env.CAPTAIN_QA_PORT || "3027";
mkdirSync(resolve(fixtureRoot, "app"), { recursive: true });
mkdirSync(out, { recursive: true });
symlinkSync(resolve(root, "node_modules"), resolve(fixtureRoot, "node_modules"), "dir");
writeFileSync(resolve(fixtureRoot, "package.json"), JSON.stringify({ name: "captain-nico-browser-fixture", version: "1.0.0", private: true }));
writeFileSync(resolve(fixtureRoot, "tsconfig.json"), JSON.stringify({ compilerOptions: { target: "ES2017", lib: ["dom", "dom.iterable", "esnext"], strict: true, skipLibCheck: true, esModuleInterop: true, module: "esnext", moduleResolution: "bundler", jsx: "react-jsx", resolveJsonModule: true, paths: { "@/*": [resolve(root, "*")] } }, include: ["**/*.ts", "**/*.tsx", ".next/types/**/*.ts"] }));
writeFileSync(resolve(fixtureRoot, "next.config.mjs"), `export default { experimental: { externalDir: true }, outputFileTracingRoot: ${JSON.stringify(root)}, webpack(config) { config.resolve.alias["@"] = ${JSON.stringify(root)}; return config; } };\n`);
writeFileSync(resolve(fixtureRoot, "app/layout.tsx"), `import ${JSON.stringify(resolve(root, "app/globals.css"))}; export default function Layout({children}:{children:React.ReactNode}) { return <html lang="fr"><body>{children}</body></html>; }\n`);
const player = (player_id, name, team, average, extra = {}) => ({ player_id, name, team, season_id: "season-2027", legs_played: average == null ? 0 : 32, legs_won: average == null ? 0 : 16, average_3_darts: average, first_9: average == null ? null : average + 7, win_rate: average == null ? null : 50, best_finish: average == null ? null : 72, elo: null, scores_180: 0, scores_170: 0, scores_140: 2, scores_100: 4, finishes: average == null ? 0 : 16, nakka_note: "Fixtures de validation", ...extra });
const players = [
  ...[46, 51, 43, 49, 62].map((mean, index) => player(`h${index + 1}`, `Fournaise ${index + 1}`, "Papangue Darts Club - Fournaise", mean)),
  player("matheo", "Matheo PREHU", "Papangue Darts Club - Fournaise", null),
  ...[44, 48, 41, 53, 45].map((mean, index) => player(`a${index + 1}`, `Neige ${index + 1}`, "Papangue Darts Club - Neige", mean)),
];
writeFileSync(resolve(fixtureRoot, "app/page.tsx"), `import CaptainNico from ${JSON.stringify(resolve(root, "app/admin/captain-nico/CaptainNico"))};\nimport styles from ${JSON.stringify(resolve(root, "app/admin/captain-nico/CaptainNico.module.css"))};\nconst fixturePlayers = ${JSON.stringify(players)};\nexport default async function Page({searchParams}:{searchParams:Promise<{omit?:string}>}) { const q=await searchParams; return <main className={styles.shell}><CaptainNico players={q.omit ? fixturePlayers.filter(p=>p.player_id!==q.omit) : fixturePlayers} duos={[]} seasonLabel="Saison 2027" /></main>; }\n`);

const server = spawn(process.execPath, [resolve(root, "node_modules/next/dist/bin/next"), "dev", "--webpack", "--hostname", "127.0.0.1", "--port", port], { cwd: fixtureRoot, env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" }, stdio: ["ignore", "pipe", "pipe"] });
let serverLog = "", browser;
server.stdout.on("data", b => serverLog += b);
server.stderr.on("data", b => serverLog += b);
const base = `http://127.0.0.1:${port}`;
const errors = [], results = [];
async function test(label, fn) { await fn(); results.push(label); console.log("PASS Captain Nico browser: " + label); }
async function ready(page) { await page.locator('[data-ready="true"]').waitFor(); }
async function overflow(page, width) { await page.setViewportSize({ width, height: 1000 }); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `horizontal overflow at ${width}px`); }
const storageKey = "captain-nico-v2:Saison 2027";
const slots = { home: ["A", "B", "C", "D"], away: ["E", "F", "G", "H"] };
const sideLabel = side => side === "home" ? "Votre équipe" : "Équipe adverse";
const slot = (page, side, role) => page.getByRole("combobox", { name: `${sideLabel(side)} · ${role}`, exact: true });
const simulationButton = page => page.getByRole("button", { name: /^Simulation/ });
const forecastButton = page => page.getByRole("button", { name: /^Prévision/ });
const simulationResults = page => page.getByTestId("simulation-results");
const forecastResults = page => page.getByTestId("forecast-results");
async function selectFour(page) {
  for (const side of ["home", "away"]) for (let i = 0; i < 4; i++) await slot(page, side, slots[side][i]).selectOption(`${side === "home" ? "h" : "a"}${i + 1}`);
}
async function selections(page) { return page.locator('[data-testid="selection-home"] select[aria-label*=" · "], [data-testid="selection-away"] select[aria-label*=" · "]').evaluateAll(elements => elements.map(el => el.value)); }

try {
  for (let i = 0; i < 80; i++) {
    try { if ((await fetch(base, { signal: AbortSignal.timeout(2500) })).ok) break; } catch {}
    await new Promise(r => setTimeout(r, 400));
    if (i === 79) throw Error(serverLog);
  }
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE_PATH, args: ["--no-sandbox"] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(base); await ready(page);

  await test("page loads without an automatic analysis", async () => {
    assert.equal(await simulationButton(page).count(), 1);
    assert.equal(await forecastButton(page).count(), 1);
    assert.equal(await simulationButton(page).isDisabled(), true);
    assert.equal(await forecastButton(page).isDisabled(), true);
    assert.equal(await simulationResults(page).count(), 0);
    assert.equal(await forecastResults(page).count(), 0);
    await selectFour(page);
    assert.equal(await simulationButton(page).isEnabled(), true);
    assert.equal(await forecastButton(page).isEnabled(), true);
    assert.equal(await simulationResults(page).count(), 0);
    assert.equal(await forecastResults(page).count(), 0);
  });

  await test("Simulation and Prévision run only on their own buttons and invalidate on changes", async () => {
    await simulationButton(page).click();
    assert.equal(await simulationResults(page).count(), 1);
    assert.equal(await forecastResults(page).count(), 0);
    await forecastButton(page).click();
    assert.equal(await forecastResults(page).count(), 1);
    assert.equal(await simulationResults(page).count(), 1);
    assert.equal(await page.getByTestId("match-row").count(), 20);
    const rows = await page.getByTestId("match-row").allTextContents();
    assert.ok(rows.every(row => /Fournaise [1-4]/.test(row) && /Neige [1-4]/.test(row)), "all 20 matchups name both sides");
    assert.equal(rows.filter(row => row.includes("Doubles")).length, 4);
    assert.ok(rows.filter(row => row.includes("Doubles")).every(row => row.includes(" + ")), "both doubles have paired names");
    await page.getByRole("combobox", { name: "Doubles équipe adverse", exact: true }).selectOption("1");
    assert.equal(await simulationResults(page).count(), 0);
    assert.equal(await forecastResults(page).count(), 0);
    await forecastButton(page).click();
    await page.getByRole("button", { name: "Descendre Votre équipe A", exact: true }).click();
    assert.equal(await forecastResults(page).count(), 0);
    await page.getByRole("button", { name: "Réinitialiser", exact: true }).click();
    await selectFour(page);
  });

  await test("Matheo is selectable without stats and an explicit assumption is required for a global forecast", async () => {
    await slot(page, "home", "A").selectOption("matheo");
    await forecastButton(page).click();
    assert.match(await forecastResults(page).textContent(), /Prévision globale non estimable.*Matheo PREHU/s);
    assert.doesNotMatch(await forecastResults(page).textContent(), /Score moyen du modèle/);
    await simulationButton(page).click();
    assert.match(await simulationResults(page).textContent(), /Comparaison chiffrée indisponible.*Matheo PREHU/s);
    await page.getByRole("spinbutton", { name: "Moyenne estimée Matheo PREHU", exact: true }).fill("47");
    assert.equal(await forecastResults(page).count(), 0);
    assert.equal(await simulationResults(page).count(), 0);
    await forecastButton(page).click();
    assert.match(await forecastResults(page).textContent(), /Score moyen du modèle/);
    assert.match(await forecastResults(page).textContent(), /Hypothèses du capitaine.*Matheo PREHU.*47/s);
    assert.equal(await page.getByTestId("match-row").count(), 20);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.screenshot({ path: resolve(out, "captain-assumed-forecast-desktop.png"), fullPage: true });
    await slot(page, "home", "A").selectOption("h1");
  });

  await test("reserve comparison can be applied and requires a new forecast", async () => {
    await slot(page, "home", "remplaçant 1").selectOption("h5");
    await simulationButton(page).click();
    assert.equal(await simulationResults(page).getByRole("button", { name: "Appliquer cette composition", exact: true }).count(), 3);
    await forecastButton(page).click();
    await simulationResults(page).getByRole("button", { name: "Appliquer cette composition", exact: true }).first().click();
    assert.equal(await simulationResults(page).count(), 0);
    assert.equal(await forecastResults(page).count(), 0);
    const current = await selections(page);
    assert.ok(current.slice(0, 4).includes("h5"), "strong reserve enters the proposed four starters");
    await forecastButton(page).click();
    assert.equal(await page.getByTestId("match-row").count(), 20);
    await simulationButton(page).click();
    await page.screenshot({ path: resolve(out, "captain-analysis-desktop.png"), fullPage: true });
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({ path: resolve(out, "captain-selection-desktop.png") });
    await forecastResults(page).screenshot({ path: resolve(out, "captain-forecast-desktop.png") });
  });

  await test("responsive analysis layout", async () => {
    for (const width of [320, 390, 1440]) await overflow(page, width);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: resolve(out, "captain-analysis-mobile.png"), fullPage: true });
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({ path: resolve(out, "captain-selection-mobile.png") });
    await forecastResults(page).screenshot({ path: resolve(out, "captain-forecast-mobile.png") });
  });

  await test("saved drafts restore selections and sanitize stale or duplicated players", async () => {
    await page.getByRole("textbox", { name: "Nom de la rencontre", exact: true }).fill("Match test Captain");
    await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
    const stored = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), storageKey);
    assert.equal(stored.version, 2);
    assert.equal(stored.title, "Match test Captain");
    await page.reload(); await ready(page);
    assert.equal(await page.getByRole("textbox", { name: "Nom de la rencontre", exact: true }).inputValue(), "Match test Captain");
    assert.equal(await forecastResults(page).count(), 0);
    assert.equal(await simulationResults(page).count(), 0);
    await page.evaluate(({ key, original }) => localStorage.setItem(key, JSON.stringify({ ...original, home: ["h1", "deleted-player", "h1", "h4", "matheo", ""], away: ["h1", "a2", "a3", "a4", "", ""] })), { key: storageKey, original: stored });
    await page.reload(); await ready(page);
    const clean = (await selections(page)).filter(Boolean);
    assert.equal(clean.includes("deleted-player"), false);
    assert.equal(clean.length, new Set(clean).size);
    assert.equal(await forecastButton(page).isDisabled(), true);
    await page.evaluate(key => localStorage.setItem(key, "{broken json"), storageKey);
    await page.reload(); await ready(page);
    assert.equal((await selections(page)).filter(Boolean).length, 0);
    await page.evaluate(key => localStorage.setItem(key, JSON.stringify({ version: 2, season: "Saison 2027", title: "Deleted player test", home: ["h1", "h2", "h3", "h4", "", ""], away: ["a1", "a2", "a3", "a4", "", ""], homePairing: 0, awayPairing: 0, assumptions: {} })), storageKey);
    await page.goto(base + "?omit=h2"); await ready(page);
    assert.equal((await selections(page)).includes("h2"), false);
    assert.equal(await forecastButton(page).isDisabled(), true);
  });

  await test("responsive layout", async () => {
    for (const width of [320, 390, 1440]) await overflow(page, width);
    await page.screenshot({ path: resolve(out, "captain-empty-desktop.png"), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: resolve(out, "captain-empty-mobile.png"), fullPage: true });
  });
  assert.deepEqual(errors, []);
  console.log(`${results.length} Captain Nico browser groups passed.`);
} catch (error) {
  writeFileSync(resolve(out, "server.log"), serverLog);
  throw error;
} finally {
  await browser?.close();
  if (server.exitCode == null) {
    server.kill("SIGTERM");
    await Promise.race([new Promise(r => server.once("exit", r)), new Promise(r => setTimeout(r, 3000))]);
  }
  if (!process.env.CAPTAIN_QA_KEEP) rmSync(fixtureRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
}
