import {chromium,expect} from '@playwright/test';
import {createRequire} from 'node:module';
import {mkdir,readFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {fixture,identity} from '../../app/frontend/scripts/vision-fixtures.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..'),sharp=createRequire(resolve(root,'app/frontend/package.json'))('sharp');
const origin='http://127.0.0.1:3010',w=960,h=540;
const png=async(frame)=>sharp(frame.data,{raw:{width:frame.width,height:frame.height,channels:4}}).png().toBuffer();
async function calibrate(page){
 for(const [x,y]of [[50,12],[71.375,50],[50,88],[28.625,50],[50,50]]){
  await page.getByLabel('X (%)',{exact:true}).fill(String(x));await page.getByLabel('Y (%)',{exact:true}).fill(String(y));await page.getByRole('button',{name:'Placer le point',exact:true}).click();
 }
 await page.getByLabel('Les anneaux et secteurs se superposent correctement aux fils réels.',{exact:true}).check();
}
async function importFrame(page,target,frame){await page.getByLabel('Image '+target,{exact:true}).setInputFiles({name:'synthetic.png',mimeType:'image/png',buffer:await png(frame)});}
async function exported(page){const promise=page.waitForEvent('download');await page.getByRole('button',{name:'Exporter le journal JSON',exact:true}).click();const download=await promise;return JSON.parse(await readFile(await download.path(),'utf8'));}
const consent='Inclure les deux images brutes, la référence spatiale et les diagnostics dans l’export (elles peuvent montrer les alentours de la cible).';
export async function testVisionStabilization(){
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const context=await browser.newContext({bypassCSP:false,acceptDownloads:true,viewport:{width:390,height:844}});context.setDefaultTimeout(30000);
 const auth=await(await fetch('http://127.0.0.1:55321/auth/v1/token',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'admin@example.invalid',password:'preview-only'})})).json();
 await context.addCookies([{name:'sb-127-auth-token',value:'base64-'+Buffer.from(JSON.stringify(auth)).toString('base64url'),url:origin,httpOnly:false,sameSite:'Lax'}]);
 const page=await context.newPage(),writes=[],errors=[];let workers=0;
 page.on('worker',()=>workers++);page.on('pageerror',error=>errors.push(error.message));
 page.on('request',r=>{if(['POST','PUT','PATCH','DELETE'].includes(r.method())&&/\/api\/|supabase/.test(r.url()))writes.push(r.url());});
 await page.addInitScript(()=>{window.__visionCsp=[];document.addEventListener('securitypolicyviolation',e=>window.__visionCsp.push(e.violatedDirective));});
 try{
  const response=await page.goto(origin+'/admin/vision');
  expect(response.headers()['content-security-policy']).toContain("worker-src 'self'");expect(response.headers()['content-security-policy']).not.toContain('unsafe-eval');
  await expect(page.getByRole('heading',{name:'Laboratoire de vision',exact:true})).toBeVisible();
  await page.getByText('Tester avec deux images, sans caméra',{exact:true}).click();await page.getByText('Positionner un point au clavier',{exact:true}).click();
  const a=fixture(w,h),b=fixture(w,h,{...identity,dx:4},{darts:[{x:w*.5,y:h*.31}]});
  await importFrame(page,'AVANT',a);await calibrate(page);
  await expect(page.getByLabel('Stabilisation automatique',{exact:true})).toBeChecked();
  await importFrame(page,'APRÈS',b);
  await expect(page.getByText('Mesures du recalage · ALIGNED',{exact:true})).toBeVisible();
  const initial=await exported(page);expect(initial.schemaVersion).toBe(2);expect(initial.currentPair).toBeNull();expect(initial.currentAnalysis.stabilization.state).toBe('ALIGNED');expect(initial.currentAnalysis.detection.status).toBe('CANDIDATES');expect(workers).toBeGreaterThan(0);
  const surveillance=page.getByRole('status',{name:'État de la surveillance',exact:true});
  await expect(surveillance).toContainText('Surveillance arrêtée · capture figée');
  await expect(surveillance.locator('time')).toHaveAttribute('datetime',initial.currentAnalysis.capturedAt);
  await expect(surveillance.locator('time')).toHaveText(/^\d{2}:\d{2}:\d{2}$/);
  await expect(page.getByText('Vérifiez que la fléchette est visible dans l’image figée. Si elle est absente, utilisez « Réessayer la capture » : la référence AVANT reste conservée.',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Après brut',exact:true}).click();
  const raw=page.locator('canvas[aria-label="Après brut · sans saisie"]');await expect(raw).toHaveAttribute('data-anchors','[]');await expect(raw).toHaveAttribute('data-markers','[]');await expect(page.getByRole('button',{name:'Placer le point',exact:true})).toBeDisabled();
  await page.getByRole('button',{name:'Après recalé',exact:true}).click();await expect(page.getByRole('button',{name:'Placer le point',exact:true})).toBeEnabled();
  await page.getByLabel(consent,{exact:true}).check();
  const withImages=await exported(page);expect(withImages.currentPair.before).toMatch(/^data:image\/png;base64,/);expect(withImages.currentPair.after).toMatch(/^data:image\/png;base64,/);expect(withImages.currentPair.validMask.runs.length).toBeGreaterThan(0);
  expect(withImages.currentPair.capturedAt).toBe(initial.currentAnalysis.capturedAt);
  await page.getByLabel('Secteur réel observé',{exact:true}).fill('S20');await page.getByRole('button',{name:'Confirmer l’annotation',exact:true}).click();await expect(page.getByRole('button',{name:'Confirmer l’annotation',exact:true})).toBeDisabled();expect((await exported(page)).samples).toHaveLength(1);
  await page.getByRole('button',{name:'Garder les fléchettes en place · préparer le lancer suivant',exact:true}).click();
  await importFrame(page,'APRÈS',b);await expect(page.getByText('Aucun changement exploitable',{exact:true})).toBeVisible();
  const second=await exported(page);expect(second.currentAnalysis.sessionId).toBe(initial.currentAnalysis.sessionId);expect(second.currentAnalysis.referenceId).toBe(initial.currentAnalysis.captureId);expect(second.currentAnalysis.detection.candidates).toHaveLength(0);
  await page.getByRole('button',{name:'Réessayer la capture',exact:true}).click();
  await expect(surveillance).toContainText('Surveillance en pause');await expect(surveillance.locator('time')).toHaveCount(0);
  await importFrame(page,'APRÈS',fixture(w,h,identity,{flat:true}));await expect(page.getByText('Mesures du recalage · REJECTED',{exact:true})).toBeVisible();
  const rejected=await exported(page);expect(rejected.currentAnalysis.detection).toBeNull();expect(rejected.currentAnalysis.referenceId).toBe(second.currentAnalysis.referenceId);expect(rejected.samples).toHaveLength(1);
  expect(rejected.currentAnalysis.stabilization.metrics.validFraction).toBeNull();
  await page.getByText('Mesures du recalage · REJECTED',{exact:true}).click();
  await expect(page.getByText('Transformation non validée — aucun recalage appliqué.',{exact:true})).toBeVisible();
  await expect(page.getByText(/Couverture valide : non calculé/)).toBeVisible();
  await page.getByLabel(consent,{exact:true}).check();expect((await exported(page)).currentPair.after).toMatch(/^data:image\/png/);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await mkdir(resolve(root,'docs/ranking-workflow-preview'),{recursive:true});await page.screenshot({path:resolve(root,'docs/ranking-workflow-preview/vision-stabilization-mobile.png'),fullPage:true});
  await page.getByRole('button',{name:'Réessayer la capture',exact:true}).click();
  await page.evaluate(()=>{window.__realWorker=Worker;window.Worker=class{constructor(){throw Error('fixture unavailable');}};});
  await importFrame(page,'APRÈS',b);await expect(page.getByText('Mesures du recalage · CANCELLED',{exact:true})).toBeVisible();
  const cancelled=await exported(page);
  for(const name of ['errorBefore','errorAfter','improvement','textureRegions','concordantRegions','sectors','validFraction','brightnessShift','sharpnessRatio','saturatedFraction'])expect(cancelled.currentAnalysis.stabilization.metrics[name]).toBeNull();
  const cancelledDetails=page.locator('details').filter({has:page.getByText('Mesures du recalage · CANCELLED',{exact:true})});
  if(!await cancelledDetails.evaluate(node=>node.open))await page.getByText('Mesures du recalage · CANCELLED',{exact:true}).click();
  await expect(page.getByText('Transformation : non calculée.',{exact:true})).toBeVisible();
  await expect(page.getByText(/Erreur avant \/ après : non calculé \/ non calculé/)).toBeVisible();
  await page.getByRole('button',{name:'Réessayer la capture',exact:true}).click();
  await page.evaluate(()=>{window.Worker=class{postMessage(){}terminate(){window.__terminated=true;}};});
  await importFrame(page,'APRÈS',b);await expect(page.getByRole('button',{name:'Pause',exact:true})).toBeEnabled();await page.getByRole('button',{name:'Pause',exact:true}).click();expect(await page.evaluate(()=>window.__terminated)).toBe(true);
  await importFrame(page,'APRÈS',b);
  await expect(page.getByRole('button',{name:'Pause',exact:true})).toBeEnabled();
  await page.evaluate(()=>{window.__terminated=false;Object.defineProperty(document,'visibilityState',{configurable:true,get:()=> 'hidden'});document.dispatchEvent(new Event('visibilitychange'));});
  expect(await page.evaluate(()=>window.__terminated)).toBe(true);await expect(page.getByRole('button',{name:'Pause',exact:true})).toBeDisabled();
  await page.evaluate(()=>{delete document.visibilityState;window.Worker=window.__realWorker;});
  await importFrame(page,'AVANT',a);await calibrate(page);await importFrame(page,'APRÈS',a);await expect(page.getByText('Mesures du recalage · IDENTITY',{exact:true})).toBeVisible();expect((await exported(page)).currentAnalysis.sessionId).not.toBe(initial.currentAnalysis.sessionId);
  // Real video/canvas capture exercises manual and automatic paths using the same deterministic pair.
  const beforeUrl='data:image/png;base64,'+(await png(a)).toString('base64'),afterUrl='data:image/png;base64,'+(await png(b)).toString('base64');
  await page.evaluate(async url=>{
    const canvas=document.createElement('canvas');canvas.width=960;canvas.height=540;
    window.__setVisionImage=async value=>{const image=new Image();image.src=value;await image.decode();canvas.getContext('2d').drawImage(image,0,0);};
    await window.__setVisionImage(url);navigator.mediaDevices.getUserMedia=async()=>{if(window.__videoTimer)clearInterval(window.__videoTimer);const stream=canvas.captureStream(15);window.__videoTimer=setInterval(()=>canvas.getContext('2d').drawImage(canvas,0,0),66);return stream;};
  },beforeUrl);
  for(const mode of ['manual','automatic']){
    await page.evaluate(url=>window.__setVisionImage(url),beforeUrl);
    await page.getByRole('button',{name:/^(Activer la caméra arrière|Redémarrer la caméra)$/}).click();
    await expect(page.getByRole('button',{name:'Figer la référence · cible vide',exact:true})).toBeEnabled();await page.getByRole('button',{name:'Figer la référence · cible vide',exact:true}).click();await calibrate(page);
    if(mode==='automatic'){
      await page.getByRole('button',{name:'Armer la détection',exact:true}).click();
      // This message lasts until the next 250 ms capture tick; default assertion polling can miss it.
      await page.waitForFunction(()=>Array.from(document.querySelectorAll('[role="status"]')).some(node=>node.textContent==='Aucun mouvement significatif — surveillance active.'),null,{polling:'raf',timeout:5000});
      await expect(surveillance).toContainText('Surveillance active');await expect(surveillance.locator('time')).toHaveCount(0);
    }
    await page.evaluate(url=>window.__setVisionImage(url),afterUrl);
    if(mode==='manual')await page.getByRole('button',{name:'Comparer maintenant',exact:true}).click();
    await expect(page.getByText('Mesures du recalage · ALIGNED',{exact:true})).toBeVisible();
    const result=await exported(page);expect(result.currentAnalysis.detection.status).toBe(initial.currentAnalysis.detection.status);
    expect(result.currentAnalysis.stabilization.transform.dx).toBeCloseTo(initial.currentAnalysis.stabilization.transform.dx,0);
    expect(result.currentAnalysis.detection.changedFraction).toBeCloseTo(initial.currentAnalysis.detection.changedFraction,2);
    await expect(surveillance).toContainText('Surveillance arrêtée · capture figée');
    await expect(surveillance.locator('time')).toHaveAttribute('datetime',result.currentAnalysis.capturedAt);
    // The live camera keeps changing after detection, while the inspected capture stays frozen.
    await page.evaluate(url=>window.__setVisionImage(url),beforeUrl);
    await page.waitForTimeout(1100);
    const frozen=await exported(page);expect(frozen.currentAnalysis.captureId).toBe(result.currentAnalysis.captureId);expect(frozen.currentAnalysis.capturedAt).toBe(result.currentAnalysis.capturedAt);
    await expect(page.getByRole('button',{name:'Armer la détection',exact:true})).toBeDisabled();
    await page.getByRole('button',{name:'Arrêter la caméra',exact:true}).click();
  }
  await page.setViewportSize({width:1440,height:1000});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:resolve(root,'docs/ranking-workflow-preview/vision-stabilization-desktop.png'),fullPage:true});
  expect(writes).toEqual([]);expect(errors).toEqual([]);expect(await page.evaluate(()=>window.__visionCsp)).toEqual([]);
  console.log('PASS production Vision: real worker, production CSP, manual/automatic/import equivalence, coordinates, reference promotion, no duplicate, rejection exports, consent, cancellation, unavailable worker, new session, mobile, zero API writes.');
 }finally{await context.close();await browser.close();}
}
