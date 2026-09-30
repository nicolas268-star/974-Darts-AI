import {expect} from '@playwright/test';

export async function testConquestWorld(browser, source, screenshot) {
 const auth=await source.context().storageState();
 const context=await browser.newContext({bypassCSP:true,storageState:{cookies:auth.cookies,origins:[]},viewport:{width:1440,height:1000}});
 context.setDefaultTimeout(20000);const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const score=(side,points)=>expect(page.locator('.conquest-scores article').nth(side)).toHaveAttribute('aria-label',`${['Alice','Bruno','Camille','David'][side]} · ${points}`);
 const enter=async value=>{
  await expect(page.locator('.play-dart-entry')).toHaveAttribute('aria-busy','false');
  const field=page.getByLabel('Fléchette',{exact:true});await field.fill(value);await field.press('Enter');await expect(field).toHaveValue('');
 };
 const next=()=>page.getByRole('button',{name:/Joueur suivant/}).click();
 try {
  await page.goto('http://127.0.0.1:3008/play/conquest');
  await expect(page.getByLabel('Mode de conquête')).toHaveValue('CONNECTED');await page.getByLabel('Points pour gagner').selectOption('24');
  await page.getByRole('button',{name:/^4 joueurs/}).click();
  for(const [i,name] of ['Alice','Bruno','Camille','David'].entries())await page.getByLabel('Joueur '+(i+1),{exact:true}).fill(name);
  await page.getByRole('button',{name:'Lancer la partie →',exact:true}).click();
  await expect(page.locator('.conquest-region')).toHaveCount(20);
  await enter('T1');await score(0,2);
  await page.getByRole('button',{name:'Examiner 2 · Canada Ouest',exact:true}).click();
  await expect(page.getByRole('complementary',{name:'Détail du territoire'}).locator('.conquest-value')).toContainText('+3 points');
  await enter('T2');await score(0,5);await enter('T5');await score(0,8);
  await expect(page.getByText('3/3 fléchettes jouées',{exact:true})).toBeVisible();await next();
  await enter('T2');await score(0,4);await score(1,2);
  await expect(page.locator('.fun-last-action')).toContainText('Alice perd 4 points');
  await page.getByRole('button',{name:'Annuler la dernière action',exact:true}).click();await score(0,8);await score(1,0);
  for(const value of ['T8','T9','T10'])await enter(value);await score(1,9);await next();
  for(const value of ['T13','T14','T15'])await enter(value);await score(2,9);await next();
  for(const value of ['T17','T19','T20'])await enter(value);await score(3,8);
  const fills=await page.locator('.conquest-region').evaluateAll(elements=>[1,8,13,17].map(id=>getComputedStyle(elements[id-1].querySelector('path')).fill));
  expect(new Set(fills).size).toBe(4);
  for(const width of [320,390,430,820,1440]){
   await page.setViewportSize({width,height:1000});
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Conquest map at '+width).toBe(true);
   await page.getByRole('button',{name:'Examiner 20 · Océanie',exact:true}).click();
   await expect(page.getByRole('complementary',{name:'Détail du territoire'})).toContainText('David');
   if(width===390||width===1440)await screenshot(page,'conquest-world-'+width+'.png');
  }
  await page.getByRole('button',{name:'Agrandir la carte',exact:true}).click();
  const enlarged=page.getByRole('dialog',{name:'Conquête, carte agrandie'});
  await expect(enlarged).toBeVisible();await expect(enlarged.locator('.conquest-region')).toHaveCount(20);
  await expect(enlarged.getByRole('button',{name:'Fermer la vue agrandie',exact:true})).toBeFocused();
  await screenshot(page,'conquest-world-big-screen.png',{fullPage:false});
  await page.keyboard.press('Escape');await expect(enlarged).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Agrandir la carte',exact:true})).toBeFocused();
  await page.setViewportSize({width:320,height:800});
  await page.getByRole('button',{name:'Zoomer',exact:true}).click();
  expect(await page.locator('.conquest-map-scroll').evaluate(el=>el.scrollWidth>el.clientWidth)).toBe(true);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  await page.getByRole('button',{name:'Vue complète',exact:true}).click();
  // Inspection is keyboard accessible and never adds a dart.
  const alaska=page.getByRole('button',{name:'Territoire 1 : Alice',exact:true});await alaska.focus();await page.keyboard.press('Enter');
  await expect(page.getByRole('complementary',{name:'Détail du territoire'}).getByRole('heading',{name:'Alaska',exact:true})).toBeVisible();
  await expect(page.getByText('3/3 fléchettes jouées',{exact:true})).toBeVisible();
  await page.reload();await score(0,8);await score(1,9);await score(2,9);await score(3,8);
  await expect(page.getByRole('region',{name:'Saisie de la volée'})).toContainText('24 points');
  await page.getByRole('button',{name:'Annuler la dernière action',exact:true}).click();await score(3,5);
  await expect(page.getByRole('button',{name:'Territoire 20 : libre',exact:true})).toBeVisible();
  expect(errors).toEqual([]);
  console.log('PASS: Conquest world — 20 territories, adjacent and maritime points, bridge loss, undo, four colors, 320/390/430/820/1440px, zoom, keyboard, big screen and saved strategy');
 } finally {await context.close();}
}
