import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// Build the two public hubs with app/backend/tests/build_tournament_ui_fixtures.py first.
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repository = resolve(root, "../..");
const fixtureDirectory = process.env.TOURNAMENT_HUB_FIXTURES ?? resolve(repository, "artifacts/ui-tests");
const output = process.env.TOURNAMENT_QA_OUTPUT ?? resolve(repository, "test-results/tournaments");
const fixtures = await Promise.all(["t5", "oc1"].map(async name => JSON.parse(await readFile(resolve(fixtureDirectory, `nakka_${name}_hub.json`), "utf8"))));
const playwright = process.env.PLAYWRIGHT_MODULE_PATH
  ? await import(pathToFileURL(resolve(process.env.PLAYWRIGHT_MODULE_PATH, "index.mjs")).href)
  : createRequire(resolve(repository, "tests/workflow/package.json"))("playwright");
const api = createServer((request, response) => {
  const path = new URL(request.url, "http://local").pathname;
  const data = path.startsWith("/api/v1/competitions/tournaments/")
    ? fixtures.find(item => item.code.toLowerCase() === path.split("/").at(-1))
    : { championships: [], active_championship: null, tournaments: fixtures.filter(item => item.classification === "FRIENDLY"), official_tournaments: fixtures.filter(item => item.classification !== "FRIENDLY") };
  response.writeHead(data ? 200 : 404, { "Content-Type": "application/json" }); response.end(JSON.stringify(data ?? {}));
});
let server;
let browser;
let logs = "";
const errors = [];
const consoleErrors = [];
try {
  await mkdir(output, { recursive: true });
  await new Promise(done => api.listen(0, "127.0.0.1", done));
  const base = process.env.TOURNAMENT_QA_BASE_URL ?? "http://127.0.0.1:3019";
  if (!process.env.TOURNAMENT_QA_BASE_URL) {
    server = spawn(process.execPath, [resolve(root, "node_modules/next/dist/bin/next"), "dev", "--webpack", "--hostname", "127.0.0.1", "--port", "3019"], {
      cwd: root, env: { ...process.env, PYTHON_API_URL: `http://127.0.0.1:${api.address().port}`, NEXT_TELEMETRY_DISABLED: "1" }, stdio: ["ignore", "pipe", "pipe"],
    });
    server.stdout.on("data", chunk => { logs += chunk; }); server.stderr.on("data", chunk => { logs += chunk; });
    for (let attempt = 0; attempt < 80; attempt++) {
      try { await fetch(base + "/login"); break; } catch { if (attempt === 79) throw new Error("Next did not start: " + logs.slice(-3000)); await new Promise(done => setTimeout(done, 500)); }
    }
  }
  browser = await playwright.chromium.launch({ ...(process.env.CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.CHROMIUM_EXECUTABLE_PATH } : process.platform === "win32" ? { channel: "msedge" } : {}), headless: true });
  const page = await browser.newPage({ reducedMotion: "reduce" });
  // The repository has no favicon.ico; keep unrelated browser chrome out of this QA.
  await page.route("**/favicon.ico", route => route.fulfill({ status: 204, body: "" }));
  await page.addInitScript(() => localStorage.setItem("974-audience-opt-out", "true"));
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") consoleErrors.push(`${message.location().url}: ${message.text()}`); });
  for (const fixture of fixtures) {
    for (const width of [1440, 768, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      const response = await page.goto(`${base}/tournaments/${fixture.code.toLowerCase()}`, { waitUntil: "networkidle", timeout: 90_000 });
      assert.equal(response?.status(), 200);
      const main = page.locator("main"); await main.locator("h1").waitFor();
      assert.equal(await main.locator("h1").textContent(), fixture.name);
      assert.equal(await page.locator(".round-robin-card").count(), fixture.round_robin.length);
      assert.equal(await page.locator(".bracket-panel").count(), 2, "Real T5/OC1 each have primary and consolation");
      assert.doesNotMatch(await main.textContent(), /WINNER BRACKET|LOSER BRACKET/, "Consolation is not double elimination");
      assert.equal(await main.getByRole("link", { name: "Consulter la source Nakka" }).getAttribute("href"), fixture.source_url);
      for (const summary of await page.locator(".tournament-disclosure > summary").all()) await summary.click();
      await page.evaluate(() => window.scrollTo(0, 0));
      const size = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }));
      assert.ok(size.document <= size.viewport + 1, `${fixture.code} ${width}px overflow: ${JSON.stringify(size)}`);
      assert.ok(await page.locator(".visual-match-card").count() >= 27);
      await page.screenshot({ path: resolve(output, `${fixture.code.toLowerCase()}-${width}.png`), fullPage: true });
      await page.screenshot({ path: resolve(output, `${fixture.code.toLowerCase()}-${width}-viewport.png`) });
      console.log(`PASS browser: ${fixture.code} ${width}px, real pools, separate consolation, source link and no page overflow.`);
    }
  }
  assert.deepEqual(errors, [], "No browser runtime errors");
  assert.deepEqual(consoleErrors, [], "No browser console errors");
} catch (reason) {
  if (logs) console.error(logs.slice(-6000));
  throw reason;
} finally {
  await browser?.close(); server?.kill(); await new Promise(done => api.close(done));
}
