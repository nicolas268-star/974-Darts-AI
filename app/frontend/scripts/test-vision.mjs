import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
function load(file) {
  const source = ts.transpileModule(readFileSync(resolve(root, file), "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const mod = { exports: {} };
  new Function("module", "exports", source)(mod, mod.exports);
  return mod.exports;
}
const v = load("lib/vision/engine.ts");
let count = 0;
function test(name, fn) { fn(); count++; console.log("PASS vision: " + name); }
const anchors = [{ x: .5, y: .12 }, { x: .88, y: .5 }, { x: .5, y: .88 }, { x: .12, y: .5 }, { x: .5, y: .5 }];
const calibration = v.calibrate(anchors);
const point = (angle, radius) => ({ x: Math.sin(angle) * radius, y: -Math.cos(angle) * radius });
const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);
function frame(value = 120, width = 240, height = 240) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) { data[i] = value; data[i + 1] = value; data[i + 2] = value; data[i + 3] = 255; }
  return { width, height, data };
}
function paintRect(f, x, y, w, h, value) {
  for (let py = y; py < y + h; py++) for (let px = x; px < x + w; px++) {
    const i = (py * f.width + px) * 4; f.data[i] = f.data[i + 1] = f.data[i + 2] = value;
  }
}
test("all 20 sectors, all multipliers, clockwise orientation", () => {
  for (const [i, sector] of v.SECTORS.entries()) for (const [r, prefix, multiplier] of [[.4, "S", 1], [103 / 170, "T", 3], [166 / 170, "D", 2]]) {
    const score = v.scorePoint(point(i * Math.PI / 10, r));
    assert.equal(score.label, prefix + sector); assert.equal(score.value, sector * multiplier);
  }
});
test("bull, outer bull, miss and no invalid numeric points", () => {
  assert.equal(v.scorePoint({ x: 0, y: 0 }).label, "50");
  assert.equal(v.scorePoint({ x: .06, y: 0 }).label, "25");
  assert.equal(v.scorePoint({ x: 1.2, y: 0 }).label, "MISS");
  assert.throws(() => v.scorePoint({ x: NaN, y: 0 }));
});
test("near-wire flags angular and radial ambiguity", () => {
  assert.equal(v.scorePoint(point(Math.PI / 20, .7)).nearWire, true);
  assert.equal(v.scorePoint(point(0, 107 / 170)).nearWire, true);
  assert.equal(v.scorePoint(point(0, .4)).nearWire, false);
  assert.equal(v.scorePoint(point(0, .02)).nearWire, true);
});
test("sector boundary does not wrap to an undefined number", () => {
  for (let i = -100; i <= 100; i++) assert.match(v.scorePoint(point(i / 100 * Math.PI * 4, .4)).label, /^S(?:[1-9]|1[0-9]|20)$/);
});
test("manual labels validated, no score total mistaken for a sector", () => {
  assert.equal(v.validLabel(" t20 "), "T20");
  for (const label of ["D16", "S1", "25", "50", "MISS", "UNKNOWN"]) assert.equal(v.validLabel(label), label);
  for (const label of ["60", "D25", "T0", "S21", "", "NaN", "<script>"]) assert.equal(v.validLabel(label), null);
});
test("calibration and its inverse preserve reference points", () => {
  const mapped = v.project(calibration.imageToBoard, anchors[0]); near(mapped.x, 0); near(mapped.y, -1);
  for (let i = 0; i < 20; i++) {
    const p = point(i * Math.PI / 10, .6), image = v.project(calibration.boardToImage, p), restored = v.project(calibration.imageToBoard, image);
    near(p.x, restored.x); near(p.y, restored.y);
  }
  near(calibration.bullError, 0);
});
test("perspective homography, independent bull validation", () => {
  const h = [.31, .02, .50, -.01, .32, .49, .12, -.08, 1];
  const pts = [point(0, 1), point(Math.PI / 2, 1), point(Math.PI, 1), point(3 * Math.PI / 2, 1), { x: 0, y: 0 }].map(p => v.project(h, p));
  const c = v.calibrate(pts); const target = point(.3, .6), image = v.project(h, target), actual = v.project(c.imageToBoard, image);
  near(target.x, actual.x); near(target.y, actual.y);
});
test("calibration rejects missing, duplicated, mirrored or invalid points", () => {
  assert.throws(() => v.calibrate(anchors.slice(0, 4)));
  assert.throws(() => v.calibrate([anchors[0], anchors[0], anchors[2], anchors[3], anchors[4]]));
  assert.throws(() => v.calibrate([anchors[0], anchors[3], anchors[2], anchors[1], anchors[4]]));
  assert.throws(() => v.calibrate(anchors.map(p => ({ x: p.x / 10, y: p.y / 10 }))));
  assert.throws(() => v.calibrate([...anchors.slice(0, 4), { x: .7, y: .6 }]));
  assert.throws(() => v.calibrate([...anchors.slice(0, 4), { x: NaN, y: .5 }]));
});
test("calibration rejects clipped board and invalid projection", () => {
  assert.throws(() => v.calibrate([{ x: .5, y: 0 }, { x: 1, y: .5 }, { x: .5, y: 1 }, { x: 0, y: .5 }, { x: .5, y: .5 }]));
  assert.throws(() => v.project([0, 0, 0, 0, 0, 0, 0, 0, 0], { x: 0, y: 0 }));
});
test("no-change is not a zero-point dart", () => {
  const f = frame(), result = v.detect(f, f, calibration);
  assert.equal(result.status, "NO_CHANGE"); assert.equal(result.candidates.length, 0); near(result.changedFraction, 0);
});
test("moderate global brightness is compensated", () => {
  const result = v.detect(frame(110), frame(126), calibration);
  assert.equal(result.status, "NO_CHANGE"); near(result.brightnessShift, 16);
});
test("large brightness change refuses scoring", () => {
  const result = v.detect(frame(100), frame(170), calibration);
  assert.equal(result.status, "SCENE_CHANGED"); assert.equal(result.candidates.length, 0);
});
test("broad occlusion refuses scoring", () => {
  const a = frame(), b = frame(); paintRect(b, 60, 60, 110, 110, 0);
  const result = v.detect(a, b, calibration);
  assert.equal(result.status, "SCENE_CHANGED"); assert.equal(result.candidates.length, 0);
});
test("elongated new silhouette yields two alternatives, not a guaranteed tip", () => {
  const a = frame(), b = frame(); paintRect(b, 118, 60, 4, 45, 0);
  const result = v.detect(a, b, calibration);
  assert.equal(result.status, "CANDIDATES"); assert.equal(result.candidates.length, 2);
  assert.ok(result.candidates.every(c => /^S|^T|^D|^25$|^50$|^MISS$/.test(c.score.label)));
  assert.equal(result.boxes.length, 1);
});
test("compact change stays ambiguous", () => {
  const a = frame(), b = frame(); paintRect(b, 117, 117, 10, 10, 0);
  const result = v.detect(a, b, calibration);
  assert.equal(result.status, "AMBIGUOUS"); assert.equal(result.candidates.length, 0);
});
test("isolated noise is discarded", () => {
  const a = frame(), b = frame(); paintRect(b, 90, 90, 1, 1, 0); paintRect(b, 160, 140, 1, 1, 0);
  assert.equal(v.detect(a, b, calibration).status, "NO_CHANGE");
});
test("motion outside board is not a dart candidate", () => {
  const a = frame(), b = frame(); paintRect(b, 2, 2, 10, 25, 0);
  assert.equal(v.detect(a, b, calibration).status, "NO_CHANGE");
});
test("old dart is ignored after explicitly advancing reference", () => {
  const a = frame(), b = frame(); paintRect(a, 90, 70, 4, 40, 0); paintRect(b, 90, 70, 4, 40, 0); paintRect(b, 130, 70, 4, 40, 0);
  assert.equal(v.detect(a, b, calibration).boxes.length, 1);
  assert.equal(v.detect(b, b, calibration).status, "NO_CHANGE");
});
test("multiple separated changes refuse automatic interpretation", () => {
  const a = frame(), b = frame();
  for (let i = 0; i < 6; i++) paintRect(b, 60 + i * 20, 110, 4, 12, 0);
  assert.equal(v.detect(a, b, calibration).status, "SCENE_CHANGED");
});
test("motion measurement is bounded and catches hand movement", () => {
  const a = frame(), b = frame(); paintRect(b, 60, 60, 100, 100, 0);
  near(v.motionFraction(a, a), 0); assert.ok(v.motionFraction(a, b) > .004); assert.ok(v.motionFraction(a, b) <= 1);
});
test("invalid frames, mismatched dimensions and invalid thresholds fail closed", () => {
  const a = frame();
  assert.throws(() => v.detect(a, frame(120, 220, 240), calibration));
  assert.throws(() => v.detect({ ...a, data: new Uint8ClampedArray(4) }, a, calibration));
  assert.throws(() => v.detect(a, a, calibration, NaN));
  assert.throws(() => v.detect(a, a, calibration, 0));
  assert.throws(() => v.motionFraction(a, frame(120, 16, 16)));
});
test("frames and calibration are not mutated by analysis", () => {
  const a = frame(), b = frame(); paintRect(b, 118, 60, 4, 45, 0);
  const aa = a.data.slice(), bb = b.data.slice(), cc = JSON.stringify(calibration);
  v.detect(a, b, calibration);
  assert.deepEqual(a.data, aa); assert.deepEqual(b.data, bb); assert.equal(JSON.stringify(calibration), cc);
});
// Structural guards supplement, but do not replace, authenticated browser testing.
test("lab page has its own server guard and noindex", () => {
  const page = readFileSync(resolve(root, "app/admin/vision/page.tsx"), "utf8");
  assert.match(page, /await requireAdmin\(\)/); assert.match(page, /index: false/); assert.match(page, /force-dynamic/);
});
test("client is isolated from APIs, cloud storage and games", () => {
  const client = readFileSync(resolve(root, "app/admin/vision/VisionLab.tsx"), "utf8");
  assert.doesNotMatch(client, /\bfetch\s*\(|supabase|localStorage|sessionStorage|\/api\/play|useSyncedGame/);
  assert.match(client, /audio: false/); assert.match(client, /visibilitychange/); assert.match(client, /track\.stop\(\)/);
  assert.match(client, /savedIds\.current\.has/); assert.match(client, /includeImages && before && after/);
});
test("camera permission exception is confined to exact lab path", () => {
  const config = readFileSync(resolve(root, "next.config.ts"), "utf8");
  assert.match(config, /camera=\(\), microphone=\(\), geolocation=\(\)/);
  assert.match(config, /source: "\/admin\/vision"/);
  assert.equal((config.match(/camera=\(self\)/g) ?? []).length, 1);
});
test("navigation reloads the document when entering the lab", () => {
  const nav = readFileSync(resolve(root, "components/admin/AdminNavigation.tsx"), "utf8");
  assert.match(nav, /href: "\/admin\/vision"/); assert.match(nav, /item\.href === "\/admin\/vision"/); assert.match(nav, /<a/);
});
console.log(`${count} vision lab checks passed (synthetic images; not a measured real-board accuracy).`);
