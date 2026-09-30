import {expect} from '@playwright/test';

// Independent legal checkout generator; the browser must validate the actual impacts.
function checkout(target) {
 const doubles=[...Array.from({length:20},(_,i)=>({score:2*(i+1),label:'D'+(i+1)})),{score:50,label:'50'}];
 const direct=doubles.find(d=>d.score===target);if(direct)return [direct.label];
 const firsts=[...Array.from({length:20},(_,i)=>({score:3*(20-i),label:'T'+(20-i)})),...Array.from({length:20},(_,i)=>({score:i+1,label:'S'+(i+1)})),{score:25,label:'25'}];
 for(const first of firsts){const last=doubles.find(d=>first.score+d.score===target);if(last)return [first.label,last.label];}
 throw new Error('No legal finish for '+target);
}

export async function testConquestUltra(browser,source,screenshot) {
 const auth=await source.context().storageState();
 const context=await browser.newContext({bypassCSP:true,storageState:{cookies:auth.cookies,origins:[]},viewport:{width:390,height:1000}});
 context.setDefaultTimeout(20000);const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const status=()=>page.locator('.fun-controls .conquest-ultra-status');
 const enter=async value=>{const input=page.getByLabel('Fléchette',{exact:true});await expect(input).toBeEnabled();await input.fill(value);await input.press('Enter');};
 const next=()=>page.getByRole('button',{name:'Volée suivante →',exact:true}).click();
 const attack=async region=>{await page.locator('.conquest-selector button').nth(region-1).click();await page.getByRole('button',{name:'Attaquer ce finish',exact:true}).click();await expect(page.getByLabel('Fléchette',{exact:true})).toBeEnabled();};
 try {
  await page.goto('http://127.0.0.1:3008/play/conquest');await page.getByLabel('Mode de conquête').selectOption('ULTRA');
  await expect(page.getByLabel('Points pour gagner')).toHaveCount(0);
  await page.getByRole('button',{name:/^Solo/}).click();await page.getByLabel('Joueur 1',{exact:true}).fill('Alice');
  await page.getByRole('button',{name:'Lancer la partie →',exact:true}).click();await expect(page.locator('.conquest-region')).toHaveCount(21);
  const targets=await page.locator('.conquest-region').evaluateAll(nodes=>nodes.map(n=>Number(n.getAttribute('data-target'))));
  expect(new Set(targets).size).toBe(21);expect(targets.every(n=>n>=2&&n<=78)).toBe(true);expect(targets[20]).toBe(50);
  await expect(page.getByLabel('Fléchette',{exact:true})).toBeDisabled();await expect(status()).toContainText('Choisissez un territoire');
  await attack(21);await expect(status()).toContainText('FINISH Bull · 50');
  await enter('T20');await expect(status().locator('strong').first()).toContainText('BUST');await expect(page.getByText('1/3 fléchettes jouées',{exact:true})).toBeVisible();
  await expect(page.getByLabel('Fléchette',{exact:true})).toBeDisabled();await page.getByRole('button',{name:'Annuler la dernière action',exact:true}).click();
  await enter('S18');await expect(status().locator('strong').first()).toContainText('32');
  await page.locator('.conquest-selector button').first().click();await expect(page.getByRole('button',{name:'Attaquer ce finish',exact:true})).toBeDisabled();
  await page.reload();await expect(status().locator('strong').first()).toContainText('32');
  expect(await page.locator('.conquest-region').evaluateAll(nodes=>nodes.map(n=>Number(n.getAttribute('data-target'))))).toEqual(targets);
  await enter('D16');await expect(status()).toContainText('Conquis !');await expect(page.locator('.conquest-coverage')).toContainText('1/21');
  await expect(page.getByRole('button',{name:'Territoire Bull · 50 : Alice',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Annuler la dernière action',exact:true}).click();await expect(status().locator('strong').first()).toContainText('32');
  await expect(page.getByRole('button',{name:'Territoire Bull · 50 : libre',exact:true})).toBeVisible();await enter('D16');await next();
  for(const width of [320,390,430,820,1440]){
   await page.setViewportSize({width,height:1000});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Ultra at '+width).toBe(true);
   if(width===390)await screenshot(page,'conquest-ultra-390.png');
  }
  for(let index=0;index<20;index++){
   await attack(index+1);
   const route=checkout(targets[index]);for(const dart of route)await enter(dart);
   await expect(page.locator('.conquest-coverage')).toContainText(`${index+2}/21`);
   if(index<19){await expect(page.locator('.fun-winner')).toHaveCount(0);await next();}
  }
  await expect(page.getByRole('heading',{name:'Alice gagne !',exact:true})).toBeVisible();
  await expect(page.locator('.conquest-scores article').first()).toHaveAttribute('aria-label','Alice · 75');
  await page.getByRole('button',{name:'Agrandir la carte',exact:true}).click();const enlarged=page.getByRole('dialog',{name:'Conquête, carte agrandie'});
  await expect(enlarged.locator('.conquest-stage-result')).toContainText('Alice gagne !');await screenshot(page,'conquest-ultra-big-screen.png',{fullPage:false});
  await page.keyboard.press('Escape');await page.getByRole('button',{name:'Rejouer',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Ultra conquête · terminez vos finishes.',exact:true})).toBeVisible();
  await expect(page.locator('.conquest-coverage')).toContainText('0/21');
  const replay=await page.locator('.conquest-region').evaluateAll(nodes=>nodes.map(n=>Number(n.getAttribute('data-target'))));expect(replay).not.toEqual(targets);expect(replay[20]).toBe(50);
  await expect(page.getByLabel('Fléchette',{exact:true})).toBeDisabled();expect(errors).toEqual([]);
  console.log('PASS: Conquest Ultra — random finishes, declared/locked attack, double out, bust, partial reload, undo, all 21 checkouts, Bull, replay, five widths and fullscreen winner');
 } finally {await context.close();}
}
