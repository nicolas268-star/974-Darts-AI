import {expect} from '@playwright/test';

export async function testMobileStatistics(page, screenshot) {
  const routes = [
    ['/stats', false], ['/players?season=2027', true], ['/championships/2027', true],
    ['/teams', false], ['/teams/a', false], ['/matches/result1', true],
    ['/players/p1?season=2027', true], ['/players/compare/p1/p3', false],
    ['/players/p1/tournaments', true], ['/duos', true], ['/duos/p1/p2', true],
    ['/records/180', true], ['/records/finishes', true], ['/records/mvp-2026', true],
    ['/competitions/classement-individuel', true], ['/tournaments', false],
    ['/tournaments/blind-draw-championship', true],
    ['/tournaments/blind-draw-championship/manche-1/joueurs/nicolas-pdc', false],
    ['/players/p1/career', false], ['/tournaments/t1', true],
    ['/players?season=2028', true], ['/competitions', false], ['/records/mvp', false],
  ];
  const failures = [];
  for (const [index, [route, hasCards]] of routes.entries()) {
    try {
      await page.setViewportSize({width:390,height:844});
      const response = await page.goto('http://127.0.0.1:3008'+route);
      expect(response.status(), route).toBe(200);
      await expect(page.locator('main.stats-responsive')).toBeVisible();
      await page.locator('main h1, main h2, main h3').first().waitFor();
      const mobile = page.locator('[data-stats-cards]:visible');
      if (hasCards) {
        await expect(mobile.first()).toBeVisible();
        expect(await mobile.locator('li').count(), route+' populated rows').toBeGreaterThan(0);
        // No data is lost by moving secondary metrics into disclosures.
        await mobile.locator('details').evaluateAll(nodes => nodes.forEach(node => { node.open = true; }));
        const firstTable = page.locator('main table').first();
        const desktopValues = await firstTable.locator('tbody tr').first().locator('th,td').allTextContents();
        const mobileValues = await mobile.first().locator('li').first().textContent();
        for (const value of desktopValues) if(value.trim()) expect(mobileValues.replace(/\s+/g,' '),route+' preserves cells').toContain(value.replace(/\s+/g,' ').trim());
      }
      for (const width of [320, 390, 430]) {
        await page.setViewportSize({width,height:844});
        const overflow = await page.evaluate(() => {
          if (document.documentElement.scrollWidth <= innerWidth + 1) return [];
          return [...document.querySelectorAll('body *')].filter(el => {
            const r=el.getBoundingClientRect(),s=getComputedStyle(el);
            return r.width && r.right>innerWidth+1 && s.position!=='fixed' && !el.closest('nextjs-portal');
          }).slice(0,12).map(el=>({tag:el.tagName,cls:el.className,width:Math.round(el.getBoundingClientRect().width)}));
        });
        expect(overflow,`${route} at ${width}px`).toEqual([]);
        const fields = await page.locator('main input:visible, main select:visible').evaluateAll(nodes=>nodes.map(node=>({font:parseFloat(getComputedStyle(node).fontSize),height:node.getBoundingClientRect().height})));
        for(const field of fields) { expect(field.font,route+' input zoom').toBeGreaterThanOrEqual(16); expect(field.height).toBeGreaterThanOrEqual(44); }
      }
      await page.setViewportSize({width:390,height:844});
      if(hasCards) await mobile.locator('details').evaluateAll(nodes=>nodes.forEach(node=>{node.open=false}));
      await screenshot(page,`mobile-stats-${index}-top.png`,{fullPage:false});
      if(hasCards) {
        await mobile.first().scrollIntoViewIfNeeded();
        await screenshot(page,`mobile-stats-${index}-cards.png`,{fullPage:false});
        const toggle=mobile.getByText(/Autres statistiques/).first();
        if(await toggle.count()) {
          await toggle.click();
          await expect(mobile.locator('details[open]').first()).toBeVisible();
        }
      }
      // Same route resized to desktop must retain its semantic table.
      await page.setViewportSize({width:1440,height:1000});
      if(hasCards) { await expect(page.locator('main table').first()).toBeVisible(); await expect(mobile.first()).toHaveCount(0); }
      if(index===1 || index===2) await screenshot(page,`desktop-stats-${index}.png`,{fullPage:false});
      console.log('PASS responsive stats:',route);
    } catch(error) {
      failures.push(`${route}: ${error.message}`);
      await screenshot(page,`mobile-stats-${index}-failure.png`,{fullPage:false});
    }
  }
  await page.setViewportSize({width:390,height:844});
  await page.goto('http://127.0.0.1:3008/duos');
  const cards=page.locator('[data-stats-cards]:visible li');
  await page.getByLabel('Trier les duos').selectOption('duo');
  const before=await cards.first().textContent();
  await page.getByRole('button',{name:/Ordre croissant/}).click();
  expect(await cards.first().textContent()).not.toBe(before);
  await page.getByPlaceholder('Rechercher un joueur, un duo ou une équipe…').fill('zzzz');
  await expect(cards).toContainText('Aucun duo');
  await page.goto('http://127.0.0.1:3008/players/p1?season=2027');
  await page.getByLabel('Filtrer par résultat').selectOption('Défaite');
  await expect(page.locator('[data-stats-cards]:visible')).toContainText('Aucun match');
  const viewport=await page.locator('meta[name=viewport]').getAttribute('content');
  expect(viewport).not.toMatch(/user-scalable=no|maximum-scale=1/);
  if(failures.length) throw new Error(failures.join('\n\n'));
  console.log('PASS: statistics at 320/390/430px, complete cell values, desktop tables, touch disclosures, duo sorting/search and history filters.');
}
