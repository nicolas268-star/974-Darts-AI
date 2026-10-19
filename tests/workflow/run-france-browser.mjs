// Portable, loopback-only smoke test for the real Next.js screens.
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { mkdirSync, openSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { testFrance } from './france.browser.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const output = resolve(root, 'test-results/france');
mkdirSync(output, { recursive: true });
const env = { ...process.env, NO_PROXY: '127.0.0.1,localhost', no_proxy: '127.0.0.1,localhost', SUPABASE_URL: 'http://127.0.0.1:55321', NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:55321', SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-anon-key', NEXT_PUBLIC_DEMO_MODE: 'false', NEXT_PUBLIC_SITE_URL: 'http://127.0.0.1:3008', ADMIN_USER_ID: '00000000-0000-0000-0000-000000000001', RANKING_WORKFLOW_ENABLED: 'true' };
const children = [];
function start(args, name, cwd = root) {
  const fd = openSync(resolve(output, name + '.log'), 'w');
  const child = spawn(process.execPath, args, { cwd, env, stdio: ['ignore', fd, fd], windowsHide: true });
  children.push(child);
}
async function ready(url) {
  for (let n = 0; n < 180; n++) {
    try { const response = await fetch(url); if (response.status < 500) return; } catch {}
    await delay(500);
  }
  throw new Error('Unavailable: ' + url);
}
let browser;
try {
  start(['tests/workflow/preview-server.mjs'], 'fixture');
  await ready('http://127.0.0.1:55321/auth/v1/user');
  start(['node_modules/next/dist/bin/next', 'dev', '--webpack', '--hostname', '127.0.0.1', '--port', '3008'], 'web', resolve(root, 'app/frontend'));
  await ready('http://127.0.0.1:3008/login');
  browser = await chromium.launch({ headless: true, channel: process.env.FRANCE_BROWSER_CHANNEL || undefined, args: ['--no-sandbox'] });
  // Match the existing loopback fixture harness: production CSP permits HTTPS Supabase only.
  const context = await browser.newContext({ bypassCSP: true, viewport: { width: 1440, height: 1100 } });
  context.setDefaultTimeout(60000);
  const admin = await context.newPage();
  await admin.goto('http://127.0.0.1:3008/login');
  await admin.locator('input[type=email]').fill('admin@example.invalid');
  await admin.locator('input[type=password]').fill('preview-only');
  await admin.locator('form button').first().click();
  await admin.waitForURL('**/admin', { timeout: 60000 });
  const screenshot = async (page, name) => {
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
    await page.screenshot({ path: resolve(output, name), fullPage: true });
  };
  await testFrance(browser, admin, screenshot);
} catch (error) { console.error(error); process.exitCode = 1; }
finally { if (browser) await browser.close(); for (const child of children) child.kill('SIGTERM'); }
