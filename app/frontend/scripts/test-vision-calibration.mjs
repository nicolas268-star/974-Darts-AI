import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const code = ts.transpileModule(readFileSync(resolve(root, "lib/vision/calibration-ui.ts"), "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
const mod = { exports: {} }; new Function("module", "exports", code)(mod, mod.exports);
const { FULL_VIEW, newDraft, setDraftPoint, confirmDraftPoint, zoomView, viewToImage, nudgePoint } = mod.exports;
let count = 0;
function test(name, fn) { fn(); console.log("PASS calibration UI: " + name); count++; }
const points = [{ x: .5, y: .15 }, { x: .85, y: .5 }, { x: .5, y: .85 }, { x: .15, y: .5 }, { x: .5, y: .5 }];
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9);

test("new wizard contains five empty points, not guessed detections", () => {
  const d = newDraft(); assert.equal(d.points.length, 5); assert.equal(d.active, 0); assert.ok(d.points.every(p => p === null)); assert.ok(d.confirmed.every(ok => !ok));
});
test("approximate tap does not advance or confirm", () => {
  const d = setDraftPoint(newDraft(), points[0]); assert.equal(d.active, 0); assert.equal(d.confirmed[0], false); assert.deepEqual(d.points[0], points[0]);
});
test("explicit confirmation advances through all five points", () => {
  let d = newDraft(); for (let i = 0; i < 5; i++) { assert.equal(d.active, i); d = confirmDraftPoint(setDraftPoint(d, points[i])); }
  assert.ok(d.confirmed.every(Boolean)); assert.deepEqual(d.points, points); assert.equal(d.active, 4);
});
test("cannot confirm an empty point", () => {
  const d = newDraft(); assert.equal(confirmDraftPoint(d), d);
});
test("single-point edit preserves the other four positions and confirmations", () => {
  const original = newDraft(points), before = JSON.stringify(original);
  const d = setDraftPoint({ ...original, active: 2 }, { x: .51, y: .85 });
  for (let i = 0; i < 5; i++) if (i !== 2) { assert.deepEqual(d.points[i], points[i]); assert.equal(d.confirmed[i], true); }
  assert.equal(d.confirmed[2], false); assert.equal(JSON.stringify(original), before);
});
test("erase affects only selected point; confirm resumes it", () => {
  const d = setDraftPoint({ ...newDraft(points), active: 3 }, null); assert.equal(d.points[3], null); assert.equal(d.confirmed.filter(Boolean).length, 4);
  const restored = confirmDraftPoint(setDraftPoint(d, points[3])); assert.ok(restored.confirmed.every(Boolean));
});
test("draft is detached from supplied anchors", () => {
  const source = points.map(p => ({ ...p })), d = newDraft(source); source[0].x = 0; near(d.points[0].x, .5);
});
test("invalid seed is not confirmed", () => {
  const d = newDraft([{ x: NaN, y: 0 }, points[1]]); assert.equal(d.points[0], null); assert.equal(d.active, 0); assert.equal(d.confirmed[1], true);
});
test("full-frame clicks stay in original normalized coordinates", () => {
  assert.deepEqual(viewToImage(FULL_VIEW, .2, .7), { x: .2, y: .7 }); assert.deepEqual(viewToImage(FULL_VIEW, -1, 9), { x: 0, y: 1 });
});
test("2x and 4x clicks use crop coordinates, not display coordinates", () => {
  for (const zoom of [2, 4]) { const v = zoomView({ x: .5, y: .5 }, zoom); const p = viewToImage(v, .5, .5); near(p.x, .5); near(p.y, .5); near(viewToImage(v, 1, 0).x, .5 + .5 / zoom); }
});
test("edge crops remain inside the original frame", () => {
  for (const p of [{ x: 0, y: 0 }, { x: 1, y: 1 }]) for (const z of [1, 2, 4]) { const v = zoomView(p, z); assert.ok(v.x >= 0 && v.y >= 0); assert.ok(v.x + v.width <= 1 && v.y + v.height <= 1); }
});
test("one-pixel arrows respect portrait image dimensions", () => {
  const p = nudgePoint({ x: .5, y: .5 }, 1, -1, 720, 960); near(p.x - .5, 1 / 720); near(.5 - p.y, 1 / 960);
});
test("nudges clamp at the four image edges", () => {
  assert.deepEqual(nudgePoint({ x: 0, y: 1 }, -5, 5, 960, 720), { x: 0, y: 1 });
});
test("non-finite coordinates and unsupported zoom fail", () => {
  assert.throws(() => zoomView(points[0], 0)); assert.throws(() => zoomView(points[0], 3)); assert.throws(() => viewToImage(FULL_VIEW, NaN, 0)); assert.throws(() => nudgePoint(points[0], 1, 0, 0, 720)); assert.throws(() => setDraftPoint(newDraft(), { x: 2, y: .5 }));
});
test("dialog does not request a second camera or upload images", () => {
  const client = readFileSync(resolve(root, "app/admin/vision/CalibrationAssistant.tsx"), "utf8");
  assert.doesNotMatch(client, /\bfetch\s*\(|getUserMedia|localStorage|supabase|\/api\/play/);
  assert.match(client, /onCancel=/); assert.match(client, /Fermer sans appliquer/); assert.match(client, /if \(!preview\.calibration \|\| !accepted \|\| disabled\) return/);
  assert.match(client, /onClick=\{clickImage\}/); assert.doesNotMatch(client, /onPointerDown=/);
});
console.log(`${count} calibration editor checks passed.`);
