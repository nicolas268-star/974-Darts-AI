import {chromium, expect} from '@playwright/test';
import {createRequire} from 'node:module';
import {readFile, mkdir} from 'node:fs/promises';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {inflateRawSync} from 'node:zlib';
import {fixture, identity} from '../../app/frontend/scripts/vision-fixtures.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const sharp = createRequire(resolve(root, 'app/frontend/package.json'))('sharp');
const origin = 'http://127.0.0.1:3010';
const consent = 'Inclure les images natives, les captures d’analyse et les diagnostics dans l’export (elles peuvent montrer les alentours de la cible).';
const png = frame => sharp(frame.data, {raw:{width:frame.width,height:frame.height,channels:4}}).png().toBuffer();

// Read the actual downloaded archive independently of the browser's ZIP writer.
function unzip(buffer) {
  let end = -1;
  for (let offset = buffer.length - 22; offset >= Math.max(0, buffer.length - 65557); offset--) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) { end = offset; break; }
  }
  expect(end).toBeGreaterThanOrEqual(0);
  const count = buffer.readUInt16LE(end + 10), files = new Map();
  let offset = buffer.readUInt32LE(end + 16);
  for (let index = 0; index < count; index++) {
    expect(buffer.readUInt32LE(offset)).toBe(0x02014b50);
    const compression = buffer.readUInt16LE(offset + 10), size = buffer.readUInt32LE(offset + 20);
    const rawSize = buffer.readUInt32LE(offset + 24), nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30), commentLength = buffer.readUInt16LE(offset + 32);
    const local = buffer.readUInt32LE(offset + 42);
    const name = buffer.subarray(offset + 46, offset + 46 + nameLength).toString('utf8');
    expect(files.has(name)).toBe(false);
    expect(name).not.toMatch(/(^\/|\.\.)/);
    expect(buffer.readUInt32LE(local)).toBe(0x04034b50);
    const start = local + 30 + buffer.readUInt16LE(local + 26) + buffer.readUInt16LE(local + 28);
    const compressed = buffer.subarray(start, start + size);
    expect([0, 8]).toContain(compression);
    const content = compression === 8 ? inflateRawSync(compressed) : compressed;
    expect(content.length).toBe(rawSize);
    files.set(name, content);
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return files;
}
async function download(page, button) {
  const pending = page.waitForEvent('download');
  await page.getByRole('button', {name:button, exact:true}).click();
  const result = await pending;
  expect(await result.failure()).toBeNull();
  return {name:result.suggestedFilename(), bytes:await readFile(await result.path())};
}
async function currentExport(page) {
  return JSON.parse((await download(page, 'Exporter le journal JSON')).bytes.toString('utf8'));
}
async function archive(page, button) {
  const file = await download(page, button);
  expect(file.name).toMatch(/\.zip$/);
  const files = unzip(file.bytes);
  expect(files.has('manifest.json')).toBe(true);
  const manifest = JSON.parse(files.get('manifest.json').toString('utf8'));
  const captures = [...files].filter(([name]) => name !== 'manifest.json' && name.endsWith('.json'))
    .map(([name, bytes]) => ({name, data:JSON.parse(bytes.toString('utf8'))}));
  expect(captures.length).toBeGreaterThan(0);
  expect(manifest.kind).toBe('974darts-vision-journal-archive');
  expect(manifest.count).toBe(captures.length);
  expect(manifest.entries.map(entry=>entry.file).sort()).toEqual(captures.map(item=>item.name).sort());
  for (const {data} of captures) {
    expect(data.schemaVersion).toBe(2);
    expect(data.samples.every(sample => sample.id === data.currentAnalysis.captureId)).toBe(true);
  }
  return {manifest, captures};
}
async function calibrate(page) {
  for (const [x,y] of [[50,12],[71.375,50],[50,88],[28.625,50],[50,50]]) {
    await page.getByLabel('X (%)',{exact:true}).fill(String(x));
    await page.getByLabel('Y (%)',{exact:true}).fill(String(y));
    await page.getByRole('button',{name:'Placer le point',exact:true}).click();
  }
  await page.getByLabel('Les anneaux et secteurs se superposent correctement aux fils réels.',{exact:true}).check();
}
async function importFrame(page, target, frame) {
  await page.getByLabel('Image ' + target,{exact:true}).setInputFiles({name:'journal-synthetic.png',mimeType:'image/png',buffer:await png(frame)});
}
function byCaptureId(captures) { return new Map(captures.map(({data}) => [data.currentAnalysis.captureId, data])); }
function expectSnapshotPreserved(data, original) {
  expect(data.currentAnalysis).toEqual(original.currentAnalysis);
  expect(data.currentPair).toEqual(original.currentPair);
  expect(data.nativePair).toEqual(original.nativePair);
  expect(data.nativePair.after.captureId).toBe(data.currentAnalysis.captureId);
  expect(data.currentPair.captureId).toBe(data.currentAnalysis.captureId);
}

/** Production UI, real IndexedDB/downloads and synthetic images; never a live project. */
export async function testVisionJournal() {
  const browser = await chromium.launch({headless:true,args:['--no-sandbox']});
  const context = await browser.newContext({acceptDownloads:true,viewport:{width:390,height:844}});
  context.setDefaultTimeout(30000);
  const auth = await (await fetch('http://127.0.0.1:55321/auth/v1/token', {
    method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'admin@example.invalid',password:'preview-only'}),
  })).json();
  await context.addCookies([{name:'sb-127-auth-token',value:'base64-'+Buffer.from(JSON.stringify(auth)).toString('base64url'),url:origin,httpOnly:false,sameSite:'Lax'}]);
  const page = await context.newPage(), writes = [], errors = [];
  page.on('request', request => {
    if (['POST','PUT','PATCH','DELETE'].includes(request.method()) && /\/api\/|supabase/.test(request.url())) writes.push(request.url());
  });
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto(origin + '/admin/vision');
    await expect(page.getByRole('heading',{name:'Laboratoire de vision',exact:true})).toBeVisible();
    await expect(page.getByRole('button',{name:'Télécharger la sélection (0)',exact:true})).toBeDisabled();
    await page.getByText('Tester avec deux images, sans caméra',{exact:true}).click();
    await page.getByText('Positionner un point au clavier',{exact:true}).click();
    const w=1280,h=720, dart1={x:w*.5,y:h*.31}, dart2={x:w*.63,y:h*.5};
    const before=fixture(w,h), first=fixture(w,h,{...identity,dx:4},{darts:[dart1]});
    const second=fixture(w,h,{...identity,dx:4},{darts:[dart1,dart2]});
    await importFrame(page,'AVANT',before); await calibrate(page); await importFrame(page,'APRÈS',first);
    await expect(page.getByText('Mesures du recalage · ALIGNED',{exact:true})).toBeVisible();
    const rows = page.getByRole('checkbox',{name:/^Sélectionner l’essai \d+$/});
    await expect(rows).toHaveCount(1);
    await page.getByLabel('Secteur réel observé',{exact:true}).fill('S20');
    await page.getByRole('button',{name:'Confirmer l’annotation',exact:true}).click();
    await page.getByLabel(consent,{exact:true}).check();
    const firstExport=await currentExport(page);
    expect(firstExport.samples).toHaveLength(1);
    expect([firstExport.nativePair.after.width,firstExport.nativePair.after.height]).toEqual([w,h]);
    expect([firstExport.currentAnalysis.width,firstExport.currentAnalysis.height]).toEqual([960,540]);
    const originalPixels=await sharp(Buffer.from(firstExport.nativePair.after.image.split(',')[1],'base64')).ensureAlpha().raw().toBuffer();
    expect(originalPixels.equals(Buffer.from(first.data))).toBe(true);
    await page.getByRole('button',{name:'Garder les fléchettes en place · préparer le lancer suivant',exact:true}).click();
    await importFrame(page,'APRÈS',second);
    await expect(page.getByText('Mesures du recalage · ALIGNED',{exact:true})).toBeVisible();
    await expect(rows).toHaveCount(2);
    await page.getByLabel('Secteur réel observé',{exact:true}).fill('S6');
    await page.getByRole('button',{name:'Confirmer l’annotation',exact:true}).click();
    await page.getByLabel(consent,{exact:true}).check();
    const secondExport=await currentExport(page);
    expect(secondExport.nativePair.before).toEqual(firstExport.nativePair.after);
    expect(secondExport.currentAnalysis.referenceId).toBe(firstExport.currentAnalysis.captureId);
    await page.getByRole('button',{name:'Réessayer la capture',exact:true}).click();
    await importFrame(page,'APRÈS',fixture(w,h,identity,{flat:true}));
    await expect(page.getByText('Mesures du recalage · REJECTED',{exact:true})).toBeVisible();
    await expect(rows).toHaveCount(3);
    await page.getByLabel(consent,{exact:true}).check();
    const rejectedExport=await currentExport(page);
    expect(rejectedExport.currentAnalysis.detection).toBeNull();
    expect(new Set([firstExport,secondExport,rejectedExport].map(data=>data.currentAnalysis.captureId)).size).toBe(3);

    await page.getByLabel(consent,{exact:true}).uncheck();
    const withoutImages=await archive(page,'Télécharger tout le journal (3)');
    expect(withoutImages.captures).toHaveLength(3);
    expect(withoutImages.manifest.includeImages).toBe(false);
    for (const {data} of withoutImages.captures) {
      expect(data.currentPair).toBeNull(); expect(data.nativePair).toBeNull();
    }
    await page.getByLabel(consent,{exact:true}).check();
    await page.getByLabel('Sélectionner l’essai 1',{exact:true}).check();
    await page.getByLabel('Sélectionner l’essai 3',{exact:true}).check();
    const selected=await archive(page,'Télécharger la sélection (2)');
    expect(selected.captures).toHaveLength(2);
    expect(selected.manifest.includeImages).toBe(true);
    const selectedMap=byCaptureId(selected.captures);
    expect([...selectedMap.keys()].sort()).toEqual([firstExport.currentAnalysis.captureId,rejectedExport.currentAnalysis.captureId].sort());
    expectSnapshotPreserved(selectedMap.get(firstExport.currentAnalysis.captureId),firstExport);
    expectSnapshotPreserved(selectedMap.get(rejectedExport.currentAnalysis.captureId),rejectedExport);
    expect(selectedMap.get(firstExport.currentAnalysis.captureId).samples[0].truth).toBe('S20');
    expect(selectedMap.get(rejectedExport.currentAnalysis.captureId).samples).toEqual([]);
    await page.getByRole('button',{name:'Tout sélectionner',exact:true}).click();
    await expect(page.getByRole('button',{name:'Télécharger la sélection (3)',exact:true})).toBeEnabled();
    const all=await archive(page,'Télécharger tout le journal (3)'), allMap=byCaptureId(all.captures);
    expect(all.captures).toHaveLength(3);
    for (const original of [firstExport,secondExport,rejectedExport]) expectSnapshotPreserved(allMap.get(original.currentAnalysis.captureId),original);
    expect(allMap.get(secondExport.currentAnalysis.captureId).samples[0].truth).toBe('S6');
    // Exporting old entries must not replace or promote the currently inspected capture.
    expectSnapshotPreserved(await currentExport(page),rejectedExport);
    await page.getByRole('button',{name:'Tout désélectionner',exact:true}).click();
    await expect(page.getByRole('button',{name:'Télécharger la sélection (0)',exact:true})).toBeDisabled();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await mkdir(resolve(root,'docs/ranking-workflow-preview'),{recursive:true});
    await page.locator('section[aria-labelledby="journal-heading"]').screenshot({path:resolve(root,'docs/ranking-workflow-preview/vision-journal-mobile.png')});

    // IndexedDB must retain the actual three image pairs across a page reload.
    await page.reload();
    await expect(rows).toHaveCount(3);
    await expect(page.getByRole('button',{name:'Télécharger la sélection (0)',exact:true})).toBeDisabled();
    await expect(page.getByLabel(consent,{exact:true})).toBeEnabled();
    await expect(page.getByLabel(consent,{exact:true})).not.toBeChecked();
    await page.getByLabel(consent,{exact:true}).check();
    const restored=await archive(page,'Télécharger tout le journal (3)'), restoredMap=byCaptureId(restored.captures);
    expect(restored.captures).toHaveLength(3);
    for (const original of [firstExport,secondExport,rejectedExport]) expectSnapshotPreserved(restoredMap.get(original.currentAnalysis.captureId),original);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    page.once('dialog', dialog=>dialog.dismiss());
    await page.getByRole('button',{name:'Vider le journal',exact:true}).click();
    await expect(rows).toHaveCount(3);
    page.once('dialog', dialog=>dialog.accept());
    await page.getByRole('button',{name:'Vider le journal',exact:true}).click();
    await expect(rows).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole('button',{name:'Télécharger tout le journal (0)',exact:true})).toBeDisabled();
    await expect(rows).toHaveCount(0);

    // Browser storage can be denied; the current image and manual annotation must remain exportable.
    await page.addInitScript(()=>{
      window.__journalRealIndexedDB=window.indexedDB;
      Object.defineProperty(window,'indexedDB',{configurable:true,value:undefined});
    });
    await page.reload();
    await expect(page.getByRole('status',{name:'État du journal',exact:true})).toContainText('ne permet pas de conserver le journal local');
    await page.getByText('Tester avec deux images, sans caméra',{exact:true}).click();
    await page.getByText('Positionner un point au clavier',{exact:true}).click();
    await importFrame(page,'AVANT',before); await calibrate(page); await importFrame(page,'APRÈS',first);
    await expect(page.getByRole('status',{name:'État du journal',exact:true})).toContainText('La capture actuelle reste disponible');
    await page.getByLabel('Secteur réel observé',{exact:true}).fill('S20');
    await page.getByRole('button',{name:'Confirmer l’annotation',exact:true}).click();
    await expect(page.getByText('Annotation gardée pour cette page seulement.',{exact:false})).toBeVisible();
    await page.getByLabel(consent,{exact:true}).check();
    const fallback=await currentExport(page);
    expect(fallback.samples).toHaveLength(1); expect(fallback.samples[0].truth).toBe('S20');
    expect(fallback.nativePair.after.image).toBe(firstExport.nativePair.after.image);
    await expect(rows).toHaveCount(0);
    await expect(page.getByRole('button',{name:'Télécharger tout le journal (0)',exact:true})).toBeDisabled();
    page.once('dialog',dialog=>dialog.dismiss());
    await page.getByRole('button',{name:'Garder les fléchettes en place · préparer le lancer suivant',exact:true}).click();
    expectSnapshotPreserved(await currentExport(page),fallback);
    // Restoring storage then retrying must save that same annotation, without another capture.
    await page.evaluate(()=>Object.defineProperty(window,'indexedDB',{configurable:true,value:window.__journalRealIndexedDB}));
    await page.getByRole('button',{name:'Réessayer l’enregistrement de la capture',exact:true}).click();
    await expect(rows).toHaveCount(1);
    const recovered=await archive(page,'Télécharger tout le journal (1)');
    expectSnapshotPreserved(recovered.captures[0].data,fallback);
    expect(recovered.captures[0].data.samples).toEqual(fallback.samples);
    await page.getByRole('button',{name:'Garder les fléchettes en place · préparer le lancer suivant',exact:true}).click();
    await expect(page.getByLabel('Image APRÈS',{exact:true})).toBeEnabled();
    expect(writes).toEqual([]); expect(errors).toEqual([]);
    console.log('PASS journal: three distinct captures, selected/all ZIPs, schema2/native pixels, annotation updates, rejected capture, consent, reload persistence, confirmed durable clearing, storage-denied fallback/retry, empty selection, mobile layout, current capture preserved and zero API writes.');
  } finally { await context.close(); await browser.close(); }
}
