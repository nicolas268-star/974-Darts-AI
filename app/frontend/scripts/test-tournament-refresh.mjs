import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import ts from "typescript";
import { NextRequest } from "next/server.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const nativeRequire = createRequire(import.meta.url);
let auth = { user: { id: "admin" }, demo: false, admin: true };
let session = { access_token: "test-session" };
const mod = { exports: {} };
const code = ts.transpileModule(readFileSync(resolve(root, "app/api/tournaments/[code]/refresh/[action]/route.ts"), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText;
new Function("require", "module", "exports", code)(name => {
  if (name === "@/lib/auth/session") return { getCurrentUser: async () => auth, isSoleAdministrator: data => data.admin };
  if (name === "@/lib/supabase/server") return { createClient: async () => ({ auth: { getSession: async () => ({ data: { session } }) } }) };
  if (name === "@/lib/site-url") return { getSiteOrigin: () => "https://974darts.re" };
  return nativeRequire(name);
}, mod, mod.exports);
const post = mod.exports.POST;
const nativeFetch = globalThis.fetch;
const previousEnv = { BACKEND_API_URL: process.env.BACKEND_API_URL, INTERNAL_API_TOKEN: process.env.INTERNAL_API_TOKEN };
process.env.BACKEND_API_URL = "https://backend.invalid";
process.env.INTERNAL_API_TOKEN = "test-internal";
let calls = [];
const request = (action, data = {}, options = {}) => post(new NextRequest(`https://974darts.re/api/tournaments/oc1/refresh/${action}`, {
  method: "POST", headers: { origin: "https://974darts.re", "content-type": "application/json", ...options.headers },
  body: typeof data === "string" ? data : JSON.stringify(data),
}), { params: Promise.resolve({ code: options.code ?? "oc1", action }) });
try {
  globalThis.fetch = async (url, options) => { calls.push({ url: String(url), options }); return Response.json({ preview_id: "p1", changes: [], warnings: [], can_apply: true }); };
  auth = { user: null, demo: false, admin: false };
  assert.equal((await request("preview")).status, 401);
  auth = { user: { id: "player" }, demo: false, admin: false };
  assert.equal((await request("preview")).status, 403);
  auth = { user: { id: "admin" }, demo: false, admin: true };
  assert.equal((await request("preview", {}, { headers: { origin: "https://attacker.invalid" } })).status, 403);
  assert.equal((await request("publish")).status, 404);
  assert.equal((await request("preview", {}, { code: "../ranking" })).status, 404);
  assert.equal((await request("preview", {}, { headers: { "content-type": "text/plain" } })).status, 415);
  assert.equal((await request("preview", "invalid")).status, 400);
  assert.equal((await request("preview", "null")).status, 400);
  assert.equal((await request("apply", { preview_id: "p1" })).status, 400);
  assert.equal((await request("preview", " ".repeat(17_000))).status, 413);
  assert.equal(calls.length, 0, "Rejected requests never reach backend");
  let response = await request("preview", { points: 999, action: "PUBLISH" });
  assert.equal(response.status, 200);
  assert.equal(calls[0].url, "https://backend.invalid/api/v1/competitions/tournaments/oc1/refresh/preview");
  assert.deepEqual(JSON.parse(calls[0].options.body), {}, "Preview cannot smuggle point publication inputs");
  assert.equal(calls[0].options.headers.Authorization, "Bearer test-session");
  assert.equal(calls[0].options.headers["X-Internal-Token"], "test-internal");
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.doesNotMatch(await response.text(), /test-session|test-internal/);
  response = await request("apply", { preview_id: "p1", confirmed: true, points: 999 });
  assert.equal(response.status, 200);
  assert.deepEqual(JSON.parse(calls[1].options.body), { preview_id: "p1", confirmed: true });
  globalThis.fetch = async () => Response.json({ detail: "Nouvelle validation officielle requise." }, { status: 409 });
  response = await request("apply", { preview_id: "expired", confirmed: true });
  assert.equal(response.status, 409); assert.match(await response.text(), /validation officielle/);
  session = null;
  assert.equal((await request("preview")).status, 401);
  console.log("PASS refresh proxy: admin and origin checks, path allowlist, bounded body, explicit preview confirmation, JWT relay, private cache, backend conflicts and points excluded from forwarded payloads.");
} finally {
  globalThis.fetch = nativeFetch;
  for (const [key, value] of Object.entries(previousEnv)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
}
