import {chromium, expect} from '@playwright/test';
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import {fixture, identity} from '../../app/frontend/scripts/vision-fixtures.mjs';

const sharp = createRequire(new URL('../../app/frontend/package.json', import.meta.url))('sharp');
const origin = 'http://127.0.0.1:3010';
const consent = 'Inclure les images natives, les captures d’analyse et les diagnostics dans l’export (elles peuvent montrer les alentours de la cible).';
const retryLabel = 'Réessayer ce lancer · garder les fléchettes';
async function exported(page) {
  await page.getByLabel(consent, {exact:true}).check();
  const pending = page.waitForEvent('download');
  await page.getByRole('button', {name:'Exporter le journal JSON', exact:true}).click();
  const download = await pending;
  return JSON.parse(await readFile(await download.path(), 'utf8'));
}
async function stored(page, id) {
  return page.evaluate(id => new Promise((resolve, reject) => {
    const open = indexedDB.open('974darts-vision-journal', 1);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result, tx = db.transaction(['payloads'], 'readonly');
      const get = tx.objectStore('payloads').get(id);
      get.onerror = () => reject(get.error);
      get.onsuccess = async () => resolve(JSON.parse(await get.result.text()));
      tx.oncomplete = () => db.close();
    };
  }), id);
}

/** Real camera/canvas UI and IndexedDB; only worker outcomes are fault-injected. */
export async function testVisionRecovery() {
  const browser = await chromium.launch({headless:true, args:['--no-sandbox']});
  const context = await browser.newContext({acceptDownloads:true, viewport:{width:390,height:844}});
  context.setDefaultTimeout(30000);
  const auth = await (await fetch('http://127.0.0.1:55321/auth/v1/token', {
    method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({email:'admin@example.invalid',password:'preview-only'}),
  })).json();
  await context.addCookies([{name:'sb-127-auth-token',value:'base64-'+Buffer.from(JSON.stringify(auth)).toString('base64url'),url:origin,httpOnly:false,sameSite:'Lax'}]);
  const page = await context.newPage(), errors = [], writes = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => {
    if (['POST','PUT','PATCH','DELETE'].includes(request.method()) && /\/api\/|supabase/.test(request.url())) writes.push(request.url());
  });
  try {
    await page.goto(origin + '/admin/vision');
    await expect(page.getByRole('heading', {name:'Laboratoire de vision',exact:true})).toBeVisible();
    const width=960, height=540;
    const images = await Promise.all([
      fixture(width,height), fixture(width,height,{...identity,dx:4},{darts:[{x:width*.5,y:height*.31}]}),
    ].map(async frame => 'data:image/png;base64,' + (await sharp(frame.data,{raw:{width,height,channels:4}}).png().toBuffer()).toString('base64')));
    await page.evaluate(async images => {
      const canvas=document.createElement('canvas'); canvas.width=960; canvas.height=540;
      window.__recoverySetImage=async url=>{const image=new Image();image.src=url;await image.decode();canvas.getContext('2d').drawImage(image,0,0);};
      await window.__recoverySetImage(images[0]);
      navigator.mediaDevices.getUserMedia=async()=>{
        const stream=canvas.captureStream(15);
        window.__recoveryVideoTimer=setInterval(()=>canvas.getContext('2d').drawImage(canvas,0,0),66);
        return stream;
      };
      window.__recoveryRealWorker=Worker;
      window.__recoveryWorkerMode='REJECTED';
      window.__recoveryRequests=[];
      window.Worker=class {
        constructor(url) { this.url=url; this.onmessage=null; this.onerror=null; this.onmessageerror=null; }
        postMessage(request) {
          this.request=request;
          window.__recoveryRequests.push({referenceId:request.referenceId,captureId:request.captureId,sessionId:request.sessionId,calibration:request.calibration,threshold:request.threshold,enabled:request.enabled});
          this.mode=window.__recoveryWorkerMode;
          if (this.mode==='TIMEOUT') return;
          this.worker=new window.__recoveryRealWorker(this.url);
          this.worker.onerror=event=>this.onerror?.(event);
          this.worker.onmessage=event=>{
            if (this.mode==='REJECTED') {
              const result=event.data.result;
              result.stabilization={...result.stabilization,state:'REJECTED',reason:'Recalage refusé pour ce test.',aligned:null,validMask:null};
              result.detection=null; result.differences=null;
            }
            this.onmessage?.(event);
          };
          this.worker.postMessage(request);
        }
        terminate() {
          this.worker?.terminate();
          // A misbehaving, already timed-out worker must not resurrect its old result.
          if (this.mode==='TIMEOUT') setTimeout(()=>{
            window.__recoveryStaleDelivered=true;
            this.onmessage?.({data:{result:{sessionId:this.request.sessionId,referenceId:this.request.referenceId,captureId:this.request.captureId}}});
          },50);
        }
      };
    }, images);
    await page.getByRole('button',{name:'Activer la caméra arrière',exact:true}).click();
    await page.getByRole('button',{name:'Figer la référence · cible vide',exact:true}).click();
    await page.getByText('Positionner un point au clavier',{exact:true}).click();
    for (const [x,y] of [[50,12],[71.375,50],[50,88],[28.625,50],[50,50]]) {
      await page.getByLabel('X (%)',{exact:true}).fill(String(x));
      await page.getByLabel('Y (%)',{exact:true}).fill(String(y));
      await page.getByRole('button',{name:'Placer le point',exact:true}).click();
    }
    await page.getByLabel('Les anneaux et secteurs se superposent correctement aux fils réels.',{exact:true}).check();
    await page.evaluate(url=>window.__recoverySetImage(url),images[1]);
    await page.getByRole('button',{name:'Comparer maintenant',exact:true}).click();
    const recovery=page.getByRole('region',{name:'Capture sans proposition',exact:true});
    await expect(recovery).toBeVisible();
    await expect(recovery).toContainText('Gardez les fléchettes en place, sans nouveau lancer');
    await expect(page.getByRole('button',{name:'Garder les fléchettes en place · préparer le lancer suivant',exact:true})).toHaveCount(0);
    await expect(page.getByRole('button',{name:'Placer le point',exact:true})).toBeDisabled();
    const rejected=await exported(page);
    expect(rejected.currentAnalysis.stabilization.state).toBe('REJECTED');
    expect(rejected.currentAnalysis.detection).toBeNull();
    await recovery.getByLabel('Secteur réel observé',{exact:true}).fill('S20');
    await recovery.getByRole('button',{name:'Enregistrer le secteur observé',exact:true}).click();
    await expect(recovery.getByRole('button',{name:'Enregistrer le secteur observé',exact:true})).toBeDisabled();
    await expect.poll(async ()=>(await stored(page,rejected.currentAnalysis.captureId)).samples.length).toBe(1);
    const labelled=await stored(page,rejected.currentAnalysis.captureId);
    expect(labelled.samples).toHaveLength(1);
    expect(labelled.samples[0]).toMatchObject({truth:'S20',point:null,detection:null,annotationMode:'SECTOR_ONLY'});
    expect(labelled.currentAnalysis).toEqual(rejected.currentAnalysis);
    expect(labelled.nativePair).toEqual(rejected.nativePair);

    // Leave the same dart image in the live stream: no removal, new reference or recalibration.
    await recovery.getByRole('button',{name:retryLabel,exact:true}).click();
    await expect(recovery).toHaveCount(0);
    await expect(page.getByRole('button',{name:'Comparer maintenant',exact:true})).toBeEnabled();
    await page.evaluate(()=>window.__recoveryWorkerMode='ALIGNED');
    await page.getByRole('button',{name:'Comparer maintenant',exact:true}).click();
    await expect(page.getByText('Mesures du recalage · ALIGNED',{exact:true})).toBeVisible();
    const retry=await exported(page);
    expect(retry.currentAnalysis.referenceId).toBe(rejected.currentAnalysis.referenceId);
    expect(retry.currentAnalysis.sessionId).toBe(rejected.currentAnalysis.sessionId);
    expect(retry.currentAnalysis.calibration).toEqual(rejected.currentAnalysis.calibration);
    expect(retry.currentAnalysis.captureId).not.toBe(rejected.currentAnalysis.captureId);
    expect(retry.nativePair.before).toEqual(rejected.nativePair.before);
    expect(retry.nativePair.after.image).toEqual(rejected.nativePair.after.image);
    expect(await stored(page,rejected.currentAnalysis.captureId)).toEqual(labelled);
    const requests=await page.evaluate(()=>window.__recoveryRequests);
    expect(requests[1]).toMatchObject({...requests[0],captureId:requests[1].captureId});
    expect(retry.samples.filter(sample=>sample.id===retry.currentAnalysis.captureId)).toEqual([]);

    // The real AnalysisClient timeout must expose recovery, with no panel while busy.
    await page.getByRole('button',{name:'Réessayer la capture',exact:true}).click();
    await page.evaluate(()=>window.__recoveryWorkerMode='TIMEOUT');
    await page.getByRole('button',{name:'Comparer maintenant',exact:true}).click();
    await expect(page.getByRole('status',{name:'État de la surveillance',exact:true})).toContainText('Analyse en cours');
    await expect(recovery).toHaveCount(0);
    await expect(recovery).toBeVisible({timeout:20000});
    await expect(recovery).toContainText('L’analyse a été interrompue');
    await expect.poll(()=>page.evaluate(()=>window.__recoveryStaleDelivered)).toBe(true);
    const timedOut=await exported(page);
    expect(timedOut.currentAnalysis.stabilization.state).toBe('CANCELLED');
    expect(timedOut.currentAnalysis.detection).toBeNull();
    expect(timedOut.currentAnalysis.referenceId).toBe(rejected.currentAnalysis.referenceId);
    await recovery.getByRole('button',{name:retryLabel,exact:true}).click();
    await page.evaluate(()=>window.__recoveryWorkerMode='ALIGNED');
    await page.getByRole('button',{name:'Comparer maintenant',exact:true}).click();
    await expect(page.getByText('Mesures du recalage · ALIGNED',{exact:true})).toBeVisible();
    expect((await exported(page)).currentAnalysis.referenceId).toBe(rejected.currentAnalysis.referenceId);
    expect((await stored(page,timedOut.currentAnalysis.captureId)).currentAnalysis.detection).toBeNull();
    await expect(page.getByRole('checkbox',{name:/^Sélectionner l’essai \d+$/})).toHaveCount(4);

    // An explicit pause cancels the in-flight capture instead of reviving its late result.
    await page.getByRole('button',{name:'Réessayer la capture',exact:true}).click();
    await page.evaluate(()=>{window.__recoveryWorkerMode='TIMEOUT';window.__recoveryStaleDelivered=false;});
    await page.getByRole('button',{name:'Comparer maintenant',exact:true}).click();
    await expect(page.getByRole('status',{name:'État de la surveillance',exact:true})).toContainText('Analyse en cours');
    await page.getByRole('button',{name:'Pause',exact:true}).click();
    await expect.poll(()=>page.evaluate(()=>window.__recoveryStaleDelivered)).toBe(true);
    await expect(recovery).toHaveCount(0);
    await expect(page.getByRole('button',{name:'Comparer maintenant',exact:true})).toBeEnabled();
    await expect(page.getByRole('checkbox',{name:/^Sélectionner l’essai \d+$/})).toHaveCount(4);

    // A storage failure must not silently discard the only remaining failed image.
    await page.evaluate(()=>{
      window.__recoveryWorkerMode='REJECTED';
      window.__recoveryIndexedDB=indexedDB;
      Object.defineProperty(window,'indexedDB',{configurable:true,value:undefined});
    });
    await page.getByRole('button',{name:'Comparer maintenant',exact:true}).click();
    await expect(recovery).toBeVisible();
    await expect(page.getByRole('status',{name:'État du journal',exact:true})).toContainText('La capture actuelle reste disponible');
    const unsaved=await exported(page);
    page.once('dialog',dialog=>dialog.dismiss());
    await recovery.getByRole('button',{name:retryLabel,exact:true}).click();
    await expect(recovery).toBeVisible();
    expect((await exported(page)).currentAnalysis.captureId).toBe(unsaved.currentAnalysis.captureId);
    await page.evaluate(()=>Object.defineProperty(window,'indexedDB',{configurable:true,value:window.__recoveryIndexedDB}));
    await page.getByRole('button',{name:'Réessayer l’enregistrement de la capture',exact:true}).click();
    await expect(page.getByRole('checkbox',{name:/^Sélectionner l’essai \d+$/})).toHaveCount(5);
    await recovery.getByRole('button',{name:retryLabel,exact:true}).click();
    await expect(recovery).toHaveCount(0);
    expect((await stored(page,unsaved.currentAnalysis.captureId)).nativePair).toEqual(unsaved.nativePair);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    expect(errors).toEqual([]); expect(writes).toEqual([]);
    console.log('PASS recovery: rejected and real timeout, manual sector with null point/detection, same dart/reference/calibration/settings on retry, original journal images retained, late worker ignored, no automatic score or API write.');
  } finally { await context.close(); await browser.close(); }
}
