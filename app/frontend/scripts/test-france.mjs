import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import ts from "typescript";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const nativeRequire = createRequire(import.meta.url), cache = new Map();
let authorized = false, rpcError = null;
const calls = [];
function load(file) {
  if (!/\.(ts|tsx)$/.test(file)) file += file.includes("components") ? ".tsx" : ".ts";
  if (cache.has(file)) return cache.get(file);
  const mod = { exports: {} };
  const code = ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
  } }).outputText;
  new Function("require", "module", "exports", code)(name => {
    if (name.endsWith(".css")) return {};
    if (name === "next/link") return function Link({ children, ...props }) { return createElement("a", props, children); };
    if (name === "next/navigation") return { useRouter: () => ({ refresh() {} }) };
    if (name === "@/lib/auth/session") return { authorizeAdminApi: async () => authorized
      ? { ok: true, auth: { user: { id: "trusted-session-admin" } } }
      : { ok: false, response: Response.json({ error: "Forbidden" }, { status: 403 }) } };
    if (name === "@/lib/site-url") return { getSiteOrigin: () => "https://example.test" };
    if (name === "@/lib/france-server") return { franceServiceClient: () => ({ rpc: async (...args) => {
      calls.push(args); return { error: rpcError };
    } }) };
    if (name.startsWith("@/")) return load(resolve(root, name.slice(2)));
    if (name.startsWith(".")) return load(resolve(dirname(file), name));
    return nativeRequire(name);
  }, mod, mod.exports);
  cache.set(file, mod.exports);
  return mod.exports;
}
const { committeeFromRow, competitionFromRow, publicInventory, officialN01Url, httpsReference } = load(resolve(root, "lib/france-model.ts"));
const committee = committeeFromRow({ id: "test", payload: { name: "Comité Démonstration", organism_type: "COMMITTEE", verification_status: "VERIFIED", raw: "PRIVATE_RAW", actor: "PRIVATE_ACTOR" } });
const competition = competitionFromRow({ id: "t_test", payload: { title: "Tournoi fictif", committee_id: "test", source_public: true, verification_status: "VERIFIED", raw: "PRIVATE_RAW", players: ["PRIVATE_PLAYER"] } });
assert.doesNotMatch(JSON.stringify({ committee, competition }), /PRIVATE/);
assert.equal(competition.participants, null);
assert.equal(publicInventory([committee], [competition]).competitions.length, 1);
for (const invalid of [
  { ...competition, verification_status: "REVIEW_REQUIRED" }, { ...competition, source_public: false },
  { ...competition, committee_id: "unknown" }, { ...competition, committee_id: null },
]) assert.equal(publicInventory([committee], [invalid]).competitions.length, 0);
for (const invalid of [{ ...committee, organism_type: "UNKNOWN" }, { ...committee, verification_status: "REVIEW_REQUIRED" }]) {
  assert.deepEqual(publicInventory([invalid], [competition]), { committees: [], competitions: [] });
}
for (const url of ["javascript:alert(1)", "http://n01darts.com/n01/tournament/comp.php?id=t_test", "https://evil.test/n01/tournament/comp.php?id=t_test", "https://n01darts.com/redirect?id=t_test", "https://a:b@n01darts.com/n01/tournament/comp.php?id=t_test"]) assert.equal(officialN01Url(url), null);
assert.ok(officialN01Url("https://n01darts.com/n01/tournament/comp.php?id=t_test"));
assert.equal(httpsReference("https://user:secret@example.test"), null);
const Directory = load(resolve(root, "components/france/FranceDirectory.tsx")).default;
const html = renderToStaticMarkup(createElement(Directory, { committees: [committee], competitions: [] }));
assert.match(html, /0 compétition confirmée/);
assert.match(html, /Identité vérifiée/);
assert.doesNotMatch(html, /Tournoi fictif|PRIVATE/);
const Admin = load(resolve(root, "components/france/FranceAdmin.tsx")).default;
const adminHtml = renderToStaticMarkup(createElement(Admin, { inventory: { committees: [committee], competitions: [], candidates: [], runs: [], leagueCount: 0 } }));
assert.match(adminHtml, /Aucun élément pour ces filtres/);

const { POST } = load(resolve(root, "app/api/admin/comites-france/route.ts"));
const { NextRequest } = nativeRequire("next/server");
const base = { n01_id: "t_test", committee_id: "test", status: "REJECTED", reason: "Organisateur non établi", confirmed: true };
const request = (body = base, headers = {}) => new NextRequest("https://example.test/api/admin/comites-france", {
  method: "POST", headers: { origin: "https://example.test", "content-type": "application/json", ...headers }, body: JSON.stringify(body),
});
assert.equal((await POST(request())).status, 403);
assert.equal(calls.length, 0);
authorized = true;
assert.equal((await POST(request(base, { origin: "https://evil.test" }))).status, 403);
assert.equal((await POST(request(base, { "content-type": "text/plain" }))).status, 415);
assert.equal((await POST(request({ ...base, actor: "spoofed-admin" }))).status, 400);
assert.equal((await POST(request({ ...base, confirmed: false }))).status, 400);
assert.equal((await POST(request({ ...base, reason: "x".repeat(13000) }))).status, 413);
assert.equal((await POST(request({ ...base, status: "VERIFIED" }))).status, 400);
assert.equal((await POST(request({ ...base, status: "VERIFIED", evidence: { url: "javascript:alert(1)", kind: "OFFICIAL_LINK", justification: "Preuve fictive" } }))).status, 400);
assert.equal(calls.length, 0);
let response = await POST(request());
assert.equal(response.status, 200);
assert.equal(response.headers.get("cache-control"), "private, no-store");
assert.equal(calls[0][0], "france_inventory_command");
assert.equal(calls[0][1].p_payload.actor, "trusted-session-admin");
assert.equal(calls[0][1].p_payload.evidence, undefined);
response = await POST(request({ ...base, status: "VERIFIED", evidence: { url: "https://example.test/proof", kind: "OFFICIAL_LINK", justification: "Source fictive ciblée", target: "t_spoofed", checked_at: "1900-01-01" } }));
assert.equal(response.status, 200);
assert.equal(calls[1][1].p_payload.evidence.target, "t_test");
assert.ok(Date.parse(calls[1][1].p_payload.evidence.checked_at) > Date.now() - 60000);
rpcError = { message: "PRIVATE_DATABASE_ERROR" };
response = await POST(request());
assert.equal(response.status, 409);
assert.doesNotMatch(await response.text(), /PRIVATE_DATABASE_ERROR/);
console.log("PASS Comités France: publication filters, private-field projection, source URLs, honest empty states, admin authorization, CSRF, size limit, evidence and trusted audit actor.");
