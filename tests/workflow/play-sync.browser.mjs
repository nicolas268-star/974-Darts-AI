import {expect} from '@playwright/test';

export async function testPlaySync(browser, source, screenshot) {
 const base='http://127.0.0.1:3008';
 expect(new URL(source.url()).origin).toBe(base);
 const auth=await source.context().storageState();
 // Separate devices share only authentication, never their local/session storage.
 const phoneContext=await browser.newContext({bypassCSP:true,storageState:{cookies:auth.cookies,origins:[]},viewport:{width:390,height:1000},isMobile:true,hasTouch:true});
 const pcContext=await browser.newContext({bypassCSP:true,storageState:{cookies:auth.cookies,origins:[]},viewport:{width:1440,height:1100}});
 phoneContext.setDefaultTimeout(20000);pcContext.setDefaultTimeout(20000);
 const phone=await phoneContext.newPage(),pc=await pcContext.newPage();
 const errors=[];phone.on('pageerror',e=>errors.push(e.message));pc.on('pageerror',e=>errors.push(e.message));
 const enter=async(page,value)=>{const input=page.getByLabel('Fléchette',{exact:true});await expect(input).toBeEnabled();await input.fill(value);await input.press('Enter');};
 const counter=(page,n)=>expect(page.getByRole('region',{name:'Saisie de la volée'}).getByText(n+'/3 fléchettes jouées',{exact:true})).toBeVisible({timeout:15000});
 const writing=page=>expect(page.getByText('Saisie sur cet appareil',{exact:true})).toBeVisible();
 const screen=page=>expect(page.getByText('Écran de score · lecture seule',{exact:true})).toBeVisible();
 try{
  for(const [kind,start] of [['cricket','Lancer la partie'],['tictactoe','Créer la grille'],['clock','Lancer le tour'],['bob27','Commencer Bob’s 27'],['connect4','Lancer la partie'],['conquest','Lancer la partie'],['bull500','Lancer la partie']]){
   console.log('SYNC browser scenario:',kind);
   await phone.goto(base+'/play/'+kind);
   await phone.getByRole('button',{name:/^4 joueurs/}).click();
   await phone.getByLabel('Joueur 1',{exact:true}).fill('Téléphone Alice');
   await phone.getByRole('button',{name:new RegExp(start)}).click();
   await counter(phone,0);
   await phone.getByRole('button',{name:'Synchroniser PC / téléphone',exact:true}).click();
   await writing(phone);
   await pc.goto(base+'/play/'+kind+'?sync=1');
   await counter(pc,0);await screen(pc);await expect(pc.getByLabel('Fléchette',{exact:true})).toBeDisabled();
   if(kind==='cricket'){
    await phone.route('**/api/play/sync*',async route=>{
     if(route.request().method()==='POST'&&route.request().postDataJSON().action==='SAVE'){
      const response=await route.fetch();await new Promise(resolve=>setTimeout(resolve,1000));await route.fulfill({response});return;
     } await route.continue();
    });
    await enter(phone,'0');
    await expect(phone.getByText('Enregistrement en cours…',{exact:true})).toBeVisible();
    await expect(phone.getByLabel('Fléchette',{exact:true})).toBeFocused();
    await expect(phone.getByRole('button',{name:'Raté / 0',exact:true})).toBeDisabled();
    await counter(phone,1);await phone.unroute('**/api/play/sync*');
   } else { await enter(phone,'0');await counter(phone,1); }
   await counter(pc,1);
   await enter(phone,'0');await counter(phone,2);await counter(pc,2);
   await pc.getByRole('button',{name:'Saisir sur cet appareil',exact:true}).click();
   await writing(pc);
   // Submit immediately on the old device if it has not polled yet: CAS still prevents a stale save.
   await expect(phone.getByLabel('Fléchette',{exact:true})).toBeDisabled({timeout:15000});
   await enter(pc,'0');await counter(pc,3);await counter(phone,3);
   await pc.getByRole('button',{name:/Joueur suivant/}).click();await counter(pc,0);await counter(phone,0);
   await pc.getByRole('button',{name:'Annuler la dernière action',exact:true}).click();await counter(pc,3);await counter(phone,3);
   await pc.reload();await counter(pc,3);await screen(pc);
   await pc.getByRole('button',{name:'Saisir sur cet appareil',exact:true}).click();await writing(pc);
   if(kind==='cricket'){
    await screenshot(phone,'play-sync-phone-390.png');
    await screenshot(pc,'play-sync-pc-1440.png');
    for(const width of [320,390,1440]){
     await pc.setViewportSize({width,height:1100});
     await pc.getByText('Ouvrir sur l’autre appareil',{exact:true}).click();
     expect(await pc.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Cloud panel '+width).toBe(true);
     await pc.getByText('Ouvrir sur l’autre appareil',{exact:true}).click();
    }
   }
  }
  // An existing remote game is offered explicitly, never overwritten by an old local copy.
  await phone.goto(base+'/play/cricket');await counter(phone,0);
  const localBefore=await phone.evaluate(()=>localStorage.getItem(Object.keys(localStorage).find(k=>k.startsWith('974darts:play:v1:')&&k.endsWith(':cricket'))));
  await phone.getByRole('button',{name:'Synchroniser PC / téléphone',exact:true}).click();
  await expect(phone.getByText(/Une partie est déjà synchronisée/)).toBeVisible();
  expect(await phone.evaluate(()=>localStorage.getItem(Object.keys(localStorage).find(k=>k.startsWith('974darts:play:v1:')&&k.endsWith(':cricket'))))).toBe(localBefore);
  await phone.getByRole('button',{name:'Ouvrir la partie synchronisée',exact:true}).click();await counter(phone,3);
  // Fresh browser can find all seven cloud sessions from the hub.
  await pc.goto(base+'/play');
  await expect(pc.getByRole('region',{name:'Mes parties synchronisées'}).locator('.play-cloud-card')).toHaveCount(7);
  await screenshot(pc,'play-sync-hub.png');
  await pc.getByRole('link',{name:'Ouvrir Cricket sur cet appareil →',exact:true}).click();
  await counter(pc,3);
  await pc.getByRole('button',{name:'Saisir sur cet appareil',exact:true}).click();await writing(pc);
  await pc.getByRole('button',{name:'Annuler la dernière action',exact:true}).click();await counter(pc,2);
  await phone.goto(base+'/play/cricket?sync=1');await counter(phone,2);
  // The server commits, but the client loses the acknowledgement. Retrying must not add a dart.
  let lose=true;
  await pc.route('**/api/play/sync*',async route=>{
   if(lose&&route.request().method()==='POST'&&route.request().postDataJSON().action==='SAVE'){
    lose=false;await route.fetch();await route.abort('failed');return;
   }
   await route.continue();
  });
  await enter(pc,'0');
  await expect(pc.getByRole('button',{name:'Réessayer la synchronisation',exact:true})).toBeVisible();
  await expect(pc.getByLabel('Fléchette',{exact:true})).toBeDisabled();
  await counter(phone,3);
  pc.once('dialog',dialog=>dialog.accept());
  await pc.reload();
  await expect(pc.getByRole('button',{name:'Réessayer la synchronisation',exact:true})).toBeVisible();
  await pc.getByRole('button',{name:'Réessayer la synchronisation',exact:true}).click();
  await counter(pc,3);await screen(pc);
  await pc.getByRole('button',{name:'Saisir sur cet appareil',exact:true}).click();await writing(pc);
  await pc.unroute('**/api/play/sync*');
  // A disconnected display shows its last score, then catches up without overwriting.
  await phoneContext.setOffline(true);
  await expect(phone.getByRole('button',{name:'Réessayer la synchronisation',exact:true})).toBeVisible({timeout:18000});
  await pc.getByRole('button',{name:/Joueur suivant/}).click();await counter(pc,0);
  await phoneContext.setOffline(false);await phone.bringToFront();await counter(phone,0);
  // Expired login, foreign origins, invalid payloads and another account.
  expect((await phone.request.post(base+'/api/play/sync',{headers:{Origin:'https://foreign.invalid'},data:{}})).status()).toBe(403);
  expect((await phone.request.post(base+'/api/play/sync',{headers:{Origin:base},data:{kind:'cricket'}})).status()).toBe(400);
  const anon=await browser.newContext({bypassCSP:true});
  try {
   expect((await anon.request.get(base+'/api/play/sync')).status()).toBe(401);
   anon.setDefaultTimeout(20000);
   const joining=await anon.newPage();
   await joining.goto(base+'/play/cricket?sync=1');
   await joining.waitForURL('**/login?next=*');
   expect(new URL(joining.url()).searchParams.get('next')).toBe('/play/cricket?sync=1');
   await joining.locator('input[type=email]').fill('admin@example.invalid');await joining.locator('input[type=password]').fill('preview-only');await joining.locator('form button').first().click();
   await joining.waitForURL('**/play/cricket?sync=1');await counter(joining,0);await screen(joining);
  }finally{await anon.close();}
  const other=await browser.newContext({bypassCSP:true});const otherPage=await other.newPage();
  try {
   await otherPage.goto(base+'/login');await otherPage.locator('input[type=email]').fill('director@example.invalid');await otherPage.locator('input[type=password]').fill('preview-only');await otherPage.locator('form button').first().click();await otherPage.waitForURL('**/directeur-sportif',{timeout:30000});
   const response=await otherPage.request.get(base+'/api/play/sync');expect(response.ok()).toBe(true);expect((await response.json()).rows).toEqual([]);
  } finally {await other.close();}
  // Delete from the writer while the phone observes; lose the response after commit.
  await expect(phone.getByRole('button',{name:'Supprimer la partie',exact:true})).toHaveCount(0);
  const beforeDelete=(await (await pc.request.get(base+'/api/play/sync')).json()).rows;
  const cricketBefore=beforeDelete.find(row=>row.kind==='cricket');
  await pc.getByRole('button',{name:'Supprimer la partie',exact:true}).click();
  const confirmation=pc.getByRole('dialog',{name:'Supprimer cette partie ?'});
  await confirmation.getByRole('button',{name:'Conserver la partie',exact:true}).click();
  expect((await (await pc.request.get(base+'/api/play/sync?kind=cricket')).json()).row.revision).toBe(cricketBefore.revision);
  let deletedCommand=null;
  await pc.route('**/api/play/sync*',async route=>{
   if(!deletedCommand&&route.request().method()==='POST'&&route.request().postDataJSON().action==='SAVE'){
    deletedCommand=route.request().postDataJSON();await route.fetch();await route.abort('failed');return;
   }
   await route.continue();
  });
  await pc.getByRole('button',{name:'Supprimer la partie',exact:true}).click();
  await confirmation.getByRole('button',{name:'Confirmer la suppression',exact:true}).click();
  await expect(confirmation.getByRole('alert')).toContainText('Suppression non confirmée');
  await expect(phone.getByText('Aucune partie en cours dans cette session.',{exact:true})).toBeVisible({timeout:15000});
  await expect(phone.getByRole('region',{name:'Saisie de la volée'})).toHaveCount(0);
  await confirmation.getByRole('button',{name:'Fermer',exact:true}).click();
  await pc.getByRole('button',{name:'Réessayer la synchronisation',exact:true}).click();
  await expect(pc.getByText('Aucune partie en cours dans cette session.',{exact:true})).toBeVisible();
  const afterDelete=(await (await pc.request.get(base+'/api/play/sync')).json()).rows;
  const cricketAfter=afterDelete.find(row=>row.kind==='cricket');
  expect(cricketAfter.record.current).toBeNull();expect(cricketAfter.revision).toBe(cricketBefore.revision+1);
  expect(afterDelete.filter(row=>row.kind!=='cricket')).toEqual(beforeDelete.filter(row=>row.kind!=='cricket'));
  // A delayed pre-deletion SAVE cannot resurrect the session, even from the same writer.
  const stale=await pc.request.post(base+'/api/play/sync',{headers:{Origin:base},data:{...deletedCommand,command:crypto.randomUUID(),record:cricketBefore.record}});
  expect(stale.status()).toBe(409);expect((await stale.json()).row.record.current).toBeNull();
  expect(await phone.evaluate(()=>localStorage.getItem(Object.keys(localStorage).find(k=>k.startsWith('974darts:play:v1:')&&k.endsWith(':cricket'))))).toBe(localBefore);
  await phone.reload();await expect(phone.getByText('Aucune partie en cours dans cette session.',{exact:true})).toBeVisible();
  await pc.goto(base+'/play');
  await expect(pc.getByRole('region',{name:'Mes parties synchronisées'}).locator('.play-cloud-card')).toHaveCount(6);
  await expect(pc.getByRole('link',{name:'Ouvrir Cricket sur cet appareil →',exact:true})).toHaveCount(0);
  expect(errors).toEqual([]);
  console.log('PASS: PC/phone sync — 7 games, independent browser storage, handover, undo, hub, reload, lost acknowledgement, reconnect, deletion without resurrection and API access boundaries');
 }finally{await phoneContext.close();await pcContext.close();}
}
