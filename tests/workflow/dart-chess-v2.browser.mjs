import { expect } from '@playwright/test';

export async function testDartChessV2(browser, source, screenshot, base = 'http://127.0.0.1:3008') {
 const auth = await source.context().storageState();
 const phoneContext = await browser.newContext({bypassCSP:true,ignoreHTTPSErrors:base.startsWith('https:'),storageState:{cookies:auth.cookies,origins:[]},viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 const pcContext = await browser.newContext({bypassCSP:true,ignoreHTTPSErrors:base.startsWith('https:'),storageState:{cookies:auth.cookies,origins:[]},viewport:{width:1440,height:1000}});
 phoneContext.setDefaultTimeout(20000); pcContext.setDefaultTimeout(20000);
 const phone = await phoneContext.newPage(), pc = await pcContext.newPage(), errors=[];
 phone.on('pageerror',e=>errors.push(e.message)); pc.on('pageerror',e=>errors.push(e.message));
 const square=(p,s)=>p.locator(`[data-square="${s}"]`);
 const state=p=>p.evaluate(()=>{const key=Object.keys(localStorage).find(k=>k.startsWith('974darts:play:v1:')&&k.endsWith(':dartchess'));return key?JSON.parse(localStorage.getItem(key)).current?.game:null;});
 const saved=p=>expect(p.locator('.play-save-panel')).toContainText('Partie sauvegardée sur ce navigateur');
 const writing=p=>expect(p.getByText('Saisie sur cet appareil',{exact:true})).toBeVisible();
 const readonly=p=>expect(p.getByText('Écran de score · lecture seule',{exact:true})).toBeVisible();
 async function move(p,a,b){await square(p,a).click();await expect(square(p,b)).toHaveClass(/legal/);await square(p,b).click();}
 async function dart(p,d){const i=p.getByLabel('Fléchette',{exact:true});await expect(i).toBeEnabled();await i.fill(d);await i.press('Enter');}
 async function setup(mode, opponent='HUMAN', p=phone){
  await p.getByLabel('Mode de jeu',{exact:true}).selectOption(mode);
  await p.getByLabel('Adversaire',{exact:true}).selectOption(opponent);
  if(opponent==='AI'){await p.getByLabel('Niveau IA').selectOption('EASY');await p.getByLabel('Votre couleur').selectOption('BLACK');}
  await p.getByRole('button',{name:'Commencer la partie →',exact:true}).click();await expect(p.locator('.dc-square')).toHaveCount(64);
 }
 async function fresh(p=phone){await p.getByRole('button',{name:'Nouvelle partie',exact:true}).click();await p.getByRole('button',{name:'Confirmer la nouvelle partie',exact:true}).click();}
 try {
  await phone.goto(base+'/play/dart-chess');
  // Webpack dev adds the worker runtime on first route compilation; load it fully.
  await phone.reload();
  for(const [width,height] of [[320,740],[390,844],[844,390],[820,1180],[1440,1000]]){
   await phone.setViewportSize({width,height});
   expect(await phone.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  }
  await phone.setViewportSize({width:390,height:844});
  await setup('CLASSIC');await saved(phone);await move(phone,'e2','e4');
  await expect(phone.locator('.dc-status')).toContainText('Validez votre déplacement');
  await expect(square(phone,'e2')).toHaveAttribute('aria-label',/Pion blanc/);
  await dart(phone,'0');await saved(phone);await dart(phone,'0');await saved(phone);await dart(phone,'0');await saved(phone);
  await expect(phone.locator('.dc-status')).toContainText('Déplacement échoué');
  await phone.getByRole('button',{name:'↶ Annuler dernière action',exact:true}).click();await phone.getByRole('button',{name:'Confirmer',exact:true}).click();await saved(phone);
  await phone.reload();await expect(phone.locator('.dc-target')).toContainText('1 fléchette(s) restante(s)');
  const classicTarget=await phone.locator('.dc-target>strong').innerText();await dart(phone,'T'+classicTarget.split(' ').at(-1));await saved(phone);
  await expect(square(phone,'e4')).toHaveAttribute('aria-label',/Pion blanc/);
  await fresh();await setup('CHAOS');await saved(phone);
  await move(phone,'e2','e4');await saved(phone);await move(phone,'d7','d5');await saved(phone);await move(phone,'e4','d5');await saved(phone);
  await phone.getByRole('button',{name:'Renfort · 2 énergies',exact:true}).click();await saved(phone);
  await expect(phone.locator('.dc-target')).toContainText('4 fléchette(s) restante(s)');
  await phone.reload();await expect(phone.locator('.dc-darts span')).toHaveCount(4);
  await screenshot(phone,'dart-chess-chaos-mobile.png');
  for(let i=0;i<3;i++){await dart(phone,'0');await saved(phone);}
  await expect(phone.locator('.dc-target')).toContainText('1 fléchette(s) restante(s)');
  await dart(phone,'50');await saved(phone);await expect(square(phone,'d5')).toHaveAttribute('aria-label',/Pion blanc/);
  await expect(phone.locator('.dc-chaos')).toContainText('3/6');
  // Exercise a real Web Worker and automatic simulated throws, not a mocked move.
  await fresh();await setup('CLASSIC','AI');
  await expect.poll(async()=>{const s=await state(phone);return s?.activeParticipant===1&&s?.ply>0;},{timeout:30000}).toBe(true);
  const aiState=await state(phone);expect(aiState.log.some(e=>e.dart.startsWith('IA ·'))).toBe(true);
  await phone.getByRole('button',{name:'↶ Annuler dernière action',exact:true}).click();await phone.getByRole('button',{name:'Confirmer',exact:true}).click();await saved(phone);
  await expect(phone.getByRole('button',{name:'Reprendre le tour IA',exact:true})).toBeVisible();
  const paused=JSON.stringify(await state(phone));await phone.waitForTimeout(1200);expect(JSON.stringify(await state(phone))).toBe(paused);
  await screenshot(phone,'dart-chess-ai-mobile.png');
  await fresh();await setup('CLASSIC');await saved(phone);
  await phone.getByRole('button',{name:'Synchroniser PC / téléphone',exact:true}).click();await writing(phone);
  await pc.goto(base+'/play/dart-chess?sync=1');await readonly(pc);
  await expect(square(pc,'e2')).toBeDisabled();
  await move(phone,'e2','e4');await expect(pc.locator('.dc-target')).toContainText('Secteur');
  await expect(pc.getByLabel('Fléchette',{exact:true})).toBeDisabled();
  await dart(phone,'0');await expect(pc.locator('.dc-target')).toContainText('2 fléchette(s) restante(s)');
  await pc.reload();await readonly(pc);await expect(pc.locator('.dc-target')).toContainText('2 fléchette(s) restante(s)');
  await pc.getByRole('button',{name:'Saisir sur cet appareil',exact:true}).click();await writing(pc);
  await expect(phone.getByLabel('Fléchette',{exact:true})).toBeDisabled({timeout:15000});
  const target=await pc.locator('.dc-target>strong').innerText();await dart(pc,'S'+target.split(' ').at(-1));
  await expect(square(phone,'e4')).toHaveAttribute('aria-label',/Pion blanc/);await expect(square(pc,'e4')).toHaveAttribute('aria-label',/Pion blanc/);
  await pc.getByRole('button',{name:'↶ Annuler dernière action',exact:true}).click();await pc.getByRole('button',{name:'Confirmer',exact:true}).click();
  await expect(phone.locator('.dc-target')).toContainText('2 fléchette(s) restante(s)');
  await screenshot(pc,'dart-chess-sync-desktop.png');
  // Verify the eighth allowed kind is not silently truncated by the list API.
  for(const kind of ['cricket','tictactoe','clock','bob27','connect4','conquest','bull500']){
   const r=await pc.request.post(base+'/api/play/sync',{headers:{Origin:base},data:{kind,expected:0,device:crypto.randomUUID(),command:crypto.randomUUID(),action:'ENABLE',record:{version:1,revision:0,current:null,completed:[]}}});expect([200,409]).toContain(r.status());
  }
  const list=await (await pc.request.get(base+'/api/play/sync')).json();expect(list.rows).toHaveLength(8);expect(list.rows.some(r=>r.kind==='dartchess')).toBe(true);
  // Only the scoring device may execute the worker and simulated throws.
  await fresh(pc);await setup('CLASSIC','AI',pc);
  const remote=async()=> (await (await pc.request.get(base+'/api/play/sync?kind=dartchess')).json()).row;
  await expect.poll(async()=>{const g=(await remote())?.record.current?.game;return g?.activeParticipant===1&&g?.ply>0;},{timeout:30000}).toBe(true);
  await readonly(phone);await expect(phone.getByLabel('Échiquier')).toBeVisible();
  const settled=await remote();expect(settled.record.current.game.log.some(e=>e.dart.startsWith('IA ·'))).toBe(true);
  await phone.waitForTimeout(2500);expect((await remote()).revision).toBe(settled.revision);
  await screenshot(pc,'dart-chess-ai-sync-desktop.png');
  // Deletion propagates to the phone and a new authenticated visit retains ?sync=1.
  await pc.getByRole('button',{name:'Supprimer la partie',exact:true}).click();await pc.getByRole('button',{name:'Confirmer la suppression',exact:true}).click();
  await expect(phone.getByText('Aucune partie en cours dans cette session.',{exact:true})).toBeVisible({timeout:15000});
  const anon=await browser.newContext({ignoreHTTPSErrors:base.startsWith('https:')});try{const page=await anon.newPage();await page.goto(base+'/play/dart-chess?sync=1');expect(new URL(page.url()).searchParams.get('next')).toBe('/play/dart-chess?sync=1');}finally{await anon.close();}
  expect(errors).toEqual([]);
  console.log('PASS: Dart Chess V2 — Classic, Chaos, real AI worker, simulated throws, undo pause, responsive setup, two-device sync, handover, partial reload, 8-kind listing, deletion, login return');
 } catch(e) {await Promise.allSettled([screenshot(phone,'dart-chess-v2-failure-phone.png'),screenshot(pc,'dart-chess-v2-failure-pc.png')]);throw e;}
 finally {await phoneContext.close();await pcContext.close();}
}
