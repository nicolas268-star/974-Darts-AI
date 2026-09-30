import {expect} from '@playwright/test';

export async function testConquestWorld(browser, source, screenshot) {
 const auth=await source.context().storageState();
 const context=await browser.newContext({bypassCSP:true,storageState:{cookies:auth.cookies,origins:[]},viewport:{width:1440,height:1000}});
 context.setDefaultTimeout(20000);const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const score=(side,points)=>expect(page.locator('.conquest-scores article').nth(side)).toHaveAttribute('aria-label',`${['Alice','Bruno','Camille','David'][side]} · ${points}`);
 const enter=async (value,finishes=false)=>{
  await expect(page.locator('.play-dart-entry')).toHaveAttribute('aria-busy','false');
  const field=page.getByLabel('Fléchette',{exact:true});await field.fill(value);await field.press('Enter');if(!finishes)await expect(field).toHaveValue('');
 };
 const next=()=>page.getByRole('button',{name:/Joueur suivant|Volée suivante/}).click();
 try {
  await page.goto('http://127.0.0.1:3008/play/conquest');
  await expect(page.getByLabel('Mode de conquête')).toHaveValue('CONNECTED');await page.getByLabel('Points pour gagner').selectOption('24');
  await page.getByRole('button',{name:/^4 joueurs/}).click();
  for(const [i,name] of ['Alice','Bruno','Camille','David'].entries())await page.getByLabel('Joueur '+(i+1),{exact:true}).fill(name);
  await page.getByRole('button',{name:'Lancer la partie →',exact:true}).click();
  await expect(page.locator('.conquest-region')).toHaveCount(21);
  const labels=await page.locator('.conquest-region').evaluateAll(nodes=>nodes.map(n=>Number(n.getAttribute('data-target'))));
  expect([...labels].sort((a,b)=>a-b)).toEqual([...Array.from({length:20},(_,i)=>i+1),25]);
  const capture=id=>enter('T'+labels[id-1]);
  await capture(1);await score(0,2);
  await page.getByRole('button',{name:`Examiner ${labels[1]} · Canada Ouest`,exact:true}).click();
  await expect(page.getByRole('complementary',{name:'Détail du territoire'}).locator('.conquest-value')).toContainText('+3 points');
  await capture(2);await score(0,5);await capture(5);await score(0,8);
  await expect(page.getByText('3/3 fléchettes jouées',{exact:true})).toBeVisible();await next();
  await capture(2);await score(0,4);await score(1,2);
  await expect(page.locator('.fun-last-action')).toContainText('Alice perd 4 points');
  await page.getByRole('button',{name:'Annuler la dernière action',exact:true}).click();await score(0,8);await score(1,0);
  for(const id of [8,9,10])await capture(id);await score(1,9);await next();
  for(const id of [13,14,15])await capture(id);await score(2,9);await next();
  for(const id of [17,19,20])await capture(id);await score(3,8);
  const fills=await page.locator('.conquest-region').evaluateAll(elements=>[1,8,13,17].map(id=>getComputedStyle(elements[id-1].querySelector('path')).fill));
  expect(new Set(fills).size).toBe(4);
  for(const width of [320,390,430,820,1440]){
   await page.setViewportSize({width,height:1000});
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Conquest map at '+width).toBe(true);
   await page.getByRole('button',{name:`Examiner ${labels[19]} · Océanie`,exact:true}).click();
   await expect(page.getByRole('complementary',{name:'Détail du territoire'})).toContainText('David');
   if(width===390||width===1440)await screenshot(page,'conquest-world-'+width+'.png');
  }
  await page.getByRole('button',{name:'Agrandir la carte',exact:true}).click();
  const enlarged=page.getByRole('dialog',{name:'Conquête, carte agrandie'});
  await expect(enlarged).toBeVisible();await expect(enlarged.locator('.conquest-region')).toHaveCount(21);
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
  const alaska=page.getByRole('button',{name:`Territoire ${labels[0]} : Alice`,exact:true});await alaska.focus();await page.keyboard.press('Enter');
  await expect(page.getByRole('complementary',{name:'Détail du territoire'}).getByRole('heading',{name:'Alaska',exact:true})).toBeVisible();
  await expect(page.getByText('3/3 fléchettes jouées',{exact:true})).toBeVisible();
  await page.reload();await score(0,8);await score(1,9);await score(2,9);await score(3,8);
  await expect(page.getByRole('region',{name:'Saisie de la volée'})).toContainText('24 points');
  await page.getByRole('button',{name:'Annuler la dernière action',exact:true}).click();await score(3,5);
  await expect(page.getByRole('button',{name:`Territoire ${labels[19]} : libre`,exact:true})).toBeVisible();
  // Defense is visibly pending, survives reload, settles once and can be undone.
  await capture(20);await next();await enter('S'+labels[7]);
  await expect(page.locator('.conquest-defense-pending')).toContainText('Bruno recevra +1 point');await score(1,9);
  await page.reload();await expect(page.locator('.conquest-defense-pending')).toBeVisible();
  expect(await page.locator('.conquest-region').evaluateAll(nodes=>nodes.map(n=>Number(n.getAttribute('data-target'))))).toEqual(labels);
  await enter('0');await enter('0');await score(1,10);await expect(page.locator('.conquest-defense-pending')).toHaveCount(0);
  await page.getByRole('button',{name:'Annuler la dernière action',exact:true}).click();await score(1,9);
  await expect(page.locator('.conquest-defense-pending')).toBeVisible();await capture(8);
  await expect(page.locator('.conquest-defense-pending')).toHaveCount(0);await score(1,5);
  // Complete an actual Full game: all 20 numbered regions, then the strategic Bull.
  await page.getByRole('button',{name:'Nouvelle partie',exact:true}).click();await page.getByRole('button',{name:'Confirmer la nouvelle partie',exact:true}).click();
  await page.getByLabel('Mode de conquête').selectOption('FULL');await expect(page.getByLabel('Points pour gagner')).toHaveCount(0);
  await page.getByRole('button',{name:/^Solo/}).click();await page.getByLabel('Joueur 1',{exact:true}).fill('Alice');
  await page.getByRole('button',{name:'Lancer la partie →',exact:true}).click();
  await expect(page.locator('.conquest-region')).toHaveCount(21);
  const fullLabels=await page.locator('.conquest-region').evaluateAll(nodes=>nodes.map(n=>Number(n.getAttribute('data-target'))));
  expect(fullLabels).not.toEqual(labels);
  for(let i=0;i<20;i++){
   if(i>0&&i%3===0)await next();
   await enter('T'+fullLabels[i]);
  }
  await expect(page.locator('.conquest-coverage')).toContainText('20/21 territoires occupés');
  await expect(page.locator('.fun-winner')).toHaveCount(0);await enter('25');await next();
  await expect(page.getByRole('button',{name:'Territoire Bull : libre',exact:true})).toBeVisible();
  await page.reload();await enter('50',true);
  await expect(page.getByRole('heading',{name:'Alice gagne !',exact:true})).toBeVisible();
  await expect(page.locator('.conquest-coverage')).toContainText('21/21 territoires occupés');
  await expect(page.getByRole('button',{name:'Territoire Bull : Alice',exact:true})).toBeVisible();await score(0,75);
  await page.getByRole('button',{name:'Annuler la dernière action',exact:true}).click();
  await expect(page.locator('.fun-winner')).toHaveCount(0);await expect(page.getByRole('button',{name:'Territoire Bull : libre',exact:true})).toBeVisible();
  await enter('50',true);await page.getByRole('button',{name:'Rejouer',exact:true}).click();
  await expect(page.locator('.conquest-coverage')).toContainText('0/21 territoires occupés');
  expect(await page.locator('.conquest-region').evaluateAll(nodes=>nodes.map(n=>Number(n.getAttribute('data-target'))))).not.toEqual(fullLabels);
  await expect(page.locator('.conquest-coverage')).toContainText('0/21 territoires occupés');
  await expect(page.getByRole('heading',{name:'Full conquête · prenez toute la carte.',exact:true})).toBeVisible();
  // A defender can win during another player's turn; the enlarged screen must name that winner.
  await page.getByRole('button',{name:'Nouvelle partie',exact:true}).click();await page.getByRole('button',{name:'Confirmer la nouvelle partie',exact:true}).click();
  await page.getByLabel('Mode de conquête').selectOption('CLASSIC');await page.getByLabel('Points pour gagner').selectOption('5');
  await page.getByRole('button',{name:/^1 vs 1/}).click();await page.getByLabel('Joueur 1',{exact:true}).fill('Alice');await page.getByLabel('Joueur 2',{exact:true}).fill('Bruno');
  await page.getByRole('button',{name:'Lancer la partie →',exact:true}).click();await expect(page.locator('.conquest-region')).toHaveCount(21);
  for(const value of ['T1','T2','T3'])await enter(value);await next();
  for(let i=0;i<3;i++)await enter('0');await next();
  for(const value of ['T4','0','0'])await enter(value);await next();
  await enter('S1');await enter('0');await enter('0',true);
  await expect(page.getByRole('heading',{name:'Alice gagne !',exact:true})).toBeVisible();await score(0,5);
  await page.getByRole('button',{name:'Agrandir la carte',exact:true}).click();
  const resultScreen=page.getByRole('dialog',{name:'Conquête, carte agrandie'});
  await expect(resultScreen.locator('.conquest-stage-result')).toContainText('Alice gagne !');
  await expect(resultScreen.locator('.conquest-scores article').first()).toContainText('VICTOIRE');
  await resultScreen.getByRole('button',{name:'Fermer la vue agrandie',exact:true}).click();
  expect(errors).toEqual([]);
  console.log('PASS: Conquest world — shuffled territories, strategic Bull, defense settlement/cancel/undo/reload, complete Full victory and replay, adjacent and maritime points, bridge loss, undo, four colors, 320/390/430/820/1440px, zoom, keyboard, big screen and saved strategy');
 } finally {await context.close();}
}
