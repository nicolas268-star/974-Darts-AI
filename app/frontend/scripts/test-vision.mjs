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
function pixelCalibration(width, height) {
  const r = Math.min(width, height) * .38;
  return v.calibrate([{ x: .5, y: .5 - r / height }, { x: .5 + r / width, y: .5 }, { x: .5, y: .5 + r / height }, { x: .5 - r / width, y: .5 }, { x: .5, y: .5 }]);
}
function wire(f, angle, offset = 0, halfWidth = .65) {
  const c = Math.cos(angle), s = Math.sin(angle), cx = f.width / 2, cy = f.height / 2;
  for (let y = 0; y < f.height; y++) for (let x = 0; x < f.width; x++) {
    const along = (x - cx) * c + (y - cy) * s, across = -(x - cx) * s + (y - cy) * c - offset;
    if (Math.abs(along) > 70) continue;
    const coverage = Math.max(0, Math.min(1, halfWidth + .5 - Math.abs(across)));
    const i = (y * f.width + x) * 4, value = 170 - 130 * coverage;
    f.data[i] = f.data[i + 1] = f.data[i + 2] = value;
  }
}
for (const [width, height] of [[540, 960], [960, 540]]) {
  for (const [name, angle] of [["horizontal", 0], ["vertical", Math.PI / 2], ["slanted", Math.PI / 4]]) {
    test(`${width}x${height} ${name} old wire displacement is not a new silhouette`, () => {
      const a = frame(170, width, height), b = frame(170, width, height), c = pixelCalibration(width, height);
      wire(a, angle); wire(b, angle, .75);
      const result = v.detect(a, b, c);
      assert.ok(result.changedFraction > 0, "the residual must remain visible in diagnostics");
      assert.equal(result.status, "NO_CHANGE"); assert.equal(result.boxes.length, 0); assert.equal(result.candidates.length, 0);
    });
  }
  test(`${width}x${height} softened old wire cannot stop surveillance`, () => {
    const a = frame(170, width, height), b = frame(170, width, height), c = pixelCalibration(width, height);
    wire(a, 0, 1, .5); wire(b, 0, 1, 1.2);
    const result = v.detect(a, b, c);
    assert.ok(result.changedFraction > 0); assert.equal(result.status, "NO_CHANGE");
  });
  for (const shaftWidth of [2, 4]) test(`${width}x${height} ${shaftWidth}px new shaft crosses an old edge without endpoint erosion`, () => {
    const a = frame(170, width, height), b = frame(170, width, height), c = pixelCalibration(width, height);
    const x = width / 2 + 40, y = height / 2 - 40;
    // A pre-existing edge crosses the shaft, including its first sample. The
    // full connected silhouette, not only its novel sites, supplies the tips.
    paintRect(a, x - 20, y, 40, 2, 30); paintRect(b, x - 20, y, 40, 2, 30);
    paintRect(b, x, y, shaftWidth, 80, 70);
    const result = v.detect(a, b, c);
    assert.equal(result.status, "CANDIDATES"); assert.equal(result.boxes.length, 1);
    assert.equal(result.candidates.length, 2);
    const endpoints = result.candidates.map(({ point }) => point.y * height).sort((a, b) => a - b);
    // At 2px sampling a one-column shaft loses only its isolated first/last
    // sample in the existing neighbour filter; admission must not erode it.
    // A two-column shaft retains both terminal rows. Endpoint averaging must
    // no longer pull either end into the next sampling row.
    const expected = shaftWidth === 2 ? [y + 2, y + 76] : [y, y + 78];
    endpoints.forEach((value, i) => near(value, expected[i]));
  });
}
function angledDart(f, tip, flightHalfWidth) {
  // A fixed 100px shaft points across the 20/1 boundary. Only its rear flight
  // area changes; the rasterized entry and the shaft geometry stay identical.
  const ux = .8, uy = .6;
  for (let y = 0; y < f.height; y++) for (let x = 0; x < f.width; x++) {
    const dx = x - tip.x, dy = y - tip.y, along = dx * ux + dy * uy, across = -dx * uy + dy * ux;
    if (along < -100 || along > 0) continue;
    const flight = flightHalfWidth * Math.max(0, 1 - Math.abs(along + 82) / 18);
    if (Math.abs(across) > Math.max(1.5, flight)) continue;
    const i = (y * f.width + x) * 4; f.data[i] = f.data[i + 1] = f.data[i + 2] = 30;
  }
}
test("angled entry stays in S1 when only the rear flight gets larger", () => {
  for (const [width, height] of [[540, 960], [960, 540]]) {
    const c = pixelCalibration(width, height), tip = { x: width / 2 + 24, y: height / 2 - 130 };
    const truth = v.scorePoint(v.project(c.imageToBoard, { x: tip.x / width, y: tip.y / height }));
    assert.equal(truth.label, "S1");
    let previous;
    for (const flightHalfWidth of [4, 12, 24]) {
      const a = frame(170, width, height), b = frame(170, width, height);
      angledDart(b, tip, flightHalfWidth);
      const result = v.detect(a, b, c);
      assert.equal(result.status, "CANDIDATES"); assert.equal(result.boxes.length, 1);
      assert.equal(result.candidates.length, 2);
      const candidate = [...result.candidates].sort((a, b) =>
        Math.hypot(a.point.x * width - tip.x, a.point.y * height - tip.y) - Math.hypot(b.point.x * width - tip.x, b.point.y * height - tip.y))[0];
      const pixels = { x: candidate.point.x * width, y: candidate.point.y * height };
      assert.ok(Math.hypot(pixels.x - tip.x, pixels.y - tip.y) <= 2, "larger flights must not retract the entry by multiple samples");
      assert.equal(candidate.score.label, "S1");
      if (previous) assert.ok(Math.hypot(pixels.x - previous.x, pixels.y - previous.y) <= 1, "entry must remain stable while only flight area changes");
      previous = pixels;
    }
  }
});
test("the same pixel silhouette has identical portrait and landscape endpoints", () => {
  const endpoints = [];
  for (const [width, height] of [[540, 960], [960, 540]]) {
    const a = frame(170, width, height), b = frame(170, width, height);
    angledDart(b, { x: width / 2 + 24, y: height / 2 - 130 }, 24);
    const result = v.detect(a, b, pixelCalibration(width, height));
    assert.equal(result.status, "CANDIDATES"); assert.equal(result.candidates.length, 2);
    endpoints.push(result.candidates.map(({ point }) => ({ x: point.x * width - width / 2, y: point.y * height - height / 2 })).sort((a, b) => a.x - b.x));
  }
  endpoints[0].forEach((point, i) => { near(point.x, endpoints[1][i].x); near(point.y, endpoints[1][i].y); });
});
test("many displaced wire fragments remain noise but broad changes still stop analysis", () => {
  const a = frame(170), b = frame(170);
  for (let i = 0; i < 6; i++) { paintRect(a, 65, 70 + i * 18, 100, 1, 30); paintRect(b, 65, 71 + i * 18, 100, 1, 30); }
  assert.equal(v.detect(a, b, calibration).status, "NO_CHANGE");
  // The original changed-pixel fraction and 16% scene guard are evaluated
  // before admission, so novelty filtering cannot conceal broad occlusion.
  paintRect(b, 60, 60, 110, 110, 0);
  const broad = v.detect(a, b, calibration);
  assert.ok(broad.changedFraction > .16); assert.equal(broad.status, "SCENE_CHANGED");
});
test("missing reference neighbours cannot supply evidence for a new silhouette", () => {
  const width = 540, height = 960, a = frame(170, width, height), b = frame(170, width, height), c = pixelCalibration(width, height);
  const mask = new Uint8Array(width * height).fill(1), x = 310, y = 440;
  paintRect(b, x, y, 2, 80, 20);
  // Missing neighbours are between the detector's 2px sample sites, leaving
  // ROI coverage intact. Novelty must still require a complete valid patch.
  for (let py = y; py < y + 80; py++) mask[py * width + x + 1] = 0;
  const result = v.detect(a, b, c, 30, mask);
  assert.equal(result.status, "NO_CHANGE"); assert.equal(result.candidates.length, 0);
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
