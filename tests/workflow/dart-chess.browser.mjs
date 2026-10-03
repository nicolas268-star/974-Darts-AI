import { expect } from '@playwright/test';

export async function testDartChess(browser, source, screenshot, baseURL = 'http://127.0.0.1:3008') {
 const auth = await source.context().storageState();
 const context = await browser.newContext({bypassCSP:true,storageState:{cookies:auth.cookies,origins:[]},viewport:{width:390,height:844}});
 context.setDefaultTimeout(20000);
 const page = await context.newPage(), errors = [];
 page.on('pageerror', e => errors.push(e.message));
 const square = s => page.locator(`[data-square="${s}"]`);
 const status = () => page.locator('.dc-status');
 const saved = () => expect(page.locator('.play-save-panel')).toContainText('Partie sauvegardée sur ce navigateur');
 async function move(from, to) { await saved(); await square(from).click(); await expect(square(to)).toHaveClass(/legal/); await square(to).click(); await saved(); }
 async function dart(value) { const input=page.getByLabel('Fléchette',{exact:true});await expect(input).toBeEnabled();await input.fill(value);await input.press('Enter');await saved(); }
 async function undo() { await page.getByRole('button',{name:'↶ Annuler dernière action',exact:true}).click();await page.getByRole('button',{name:'Confirmer',exact:true}).click();await saved(); }
 async function fresh() {await page.getByRole('button',{name:'Nouvelle partie',exact:true}).click();await page.getByRole('button',{name:'Confirmer la nouvelle partie',exact:true}).click();await page.getByRole('button',{name:'Commencer la partie →',exact:true}).click();await saved();}
 try {
  await page.goto(baseURL+'/play/dart-chess');
  await page.getByLabel('♔ Joueur blanc',{exact:true}).fill('Alice');await page.getByLabel('♚ Joueur noir',{exact:true}).fill('Bob');
  await page.getByRole('button',{name:'Commencer la partie →',exact:true}).click();await expect(page.locator('.dc-square')).toHaveCount(64);await saved();
  await square('e2').click();await expect(square('e4')).toHaveClass(/legal/);await square('e5').click();await expect(square('e2')).toHaveAttribute('aria-label',/Pion blanc/);
  await move('e2','e4');await expect(page.locator('.dc-square').first()).toHaveAttribute('data-square','h1');
  await move('d7','d5');await move('e4','d5');await expect(status()).toContainText('Capture du Pion');
  const target=await page.locator('.dc-target>strong').innerText();const successful='S'+target.split(' ').at(-1);
  await dart('0');await expect(page.locator('.dc-target')).toContainText('2 fléchette(s) restante(s)');
  await page.reload();await expect(page.locator('.dc-target>strong')).toHaveText(target);await expect(page.locator('.dc-target')).toContainText('2 fléchette(s) restante(s)');
  for (const [width,height] of [[320,740],[390,844],[844,390],[820,1180],[1440,1000]]) {
   await page.setViewportSize({width,height});
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'No overflow at '+width+'×'+height).toBe(true);
   const board=await page.locator('.dc-board').boundingBox();expect(Math.abs(board.width-board.height)).toBeLessThan(2);
   expect(board.x).toBeGreaterThanOrEqual(0);expect(board.x+board.width).toBeLessThanOrEqual(width+1);
   await page.getByLabel('Fléchette',{exact:true}).scrollIntoViewIfNeeded();await expect(page.getByLabel('Fléchette',{exact:true})).toBeInViewport();
   for(const button of await page.locator('.play-dart-entry button').all())expect((await button.boundingBox()).height).toBeGreaterThanOrEqual(44);
   if(width===390 || width===1440){await page.evaluate(()=>scrollTo(0,0));await screenshot(page,`dart-chess-${width}.png`);}
  }
  await page.setViewportSize({width:390,height:844});await dart(successful);await expect(square('d5')).toHaveAttribute('aria-label',/Pion blanc/);await expect(page.locator('.dc-target')).toHaveCount(0);
  await undo();await expect(square('d5')).toHaveAttribute('aria-label',/Pion noir/);await expect(page.locator('.dc-target')).toContainText('2 fléchette(s) restante(s)');
  await dart('0');await dart('0');await expect(status()).toContainText('Capture échouée');await expect(page.locator('.dc-players .active')).toContainText('Bob');await expect(square('e4')).toHaveAttribute('aria-label',/Pion blanc/);
  await fresh();for(const [a,b] of [['f2','f3'],['e7','e5'],['g2','g4'],['d8','h4']])await move(a,b);
  await expect(status()).toContainText('King Checkout');await expect(square('e1')).toBeDisabled();
  for(const d of ['S20','T20','0'])await dart(d);
  await page.getByRole('button',{name:'Fléchettes retirées · nouvelle volée',exact:true}).click();await saved();await dart('D20');
  await expect(status()).toContainText('Bob gagne');await undo();await expect(status()).toContainText('King Checkout');await dart('D20');
  await page.goto(baseURL+'/play');await expect(page.locator('.play-saved-card').filter({hasText:'Dart Chess'})).toContainText('PARTIE TERMINÉE');
  await page.getByRole('link',{name:'Revoir Dart Chess →',exact:true}).click();await expect(status()).toContainText('Bob gagne');
  await page.getByRole('button',{name:'Supprimer la partie',exact:true}).click();await page.getByRole('button',{name:'Confirmer la suppression',exact:true}).click();
  await expect(page.getByRole('button',{name:'Commencer la partie →',exact:true})).toBeVisible();await page.reload();await expect(page.getByRole('button',{name:'Commencer la partie →',exact:true})).toBeVisible();
  expect(errors).toEqual([]);
  console.log('PASS: Dart Chess UI — legal board, rotation, captures, misses, partial reload, undo, King Checkout, hub resume, deletion, 320/390 portrait, 844 landscape, 820 tablet, 1440 desktop.');
 } catch(error) {await screenshot(page,'dart-chess-failure.png');throw error;} finally {await context.close();}
}
