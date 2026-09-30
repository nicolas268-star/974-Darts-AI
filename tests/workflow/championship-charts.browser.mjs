import {expect} from '@playwright/test';

export async function testChampionshipCharts(page, screenshot) {
  for (const season of [2027, 2029, 2030, 2028]) {
    await page.setViewportSize({width:1440,height:1100});
    await page.goto(`http://127.0.0.1:3008/championships/${season}`);
    const charts=page.locator('[data-championship-charts]');
    await expect(charts).toBeVisible();
    const cards=charts.locator(':scope > article');
    await expect(cards).toHaveCount(3);
    const box=await cards.evaluateAll(nodes=>nodes.map(n=>n.getBoundingClientRect().top));
    expect(Math.max(...box)-Math.min(...box)).toBeLessThanOrEqual(1);
    expect(await charts.evaluate(node=>node.nextElementSibling.textContent)).toContain('Classement des équipes');
    if(season===2028) {
      await expect(charts.getByText(/Ces graphiques apparaîtront/)).toHaveCount(3);
    } else {
      await expect(charts.locator('.recharts-line').first()).toBeAttached();
      const data=await (await page.request.get(`http://127.0.0.1:8008/api/v1/competitions/championships/${season}`)).json();
      const latest=data.round_history.at(-1);
      await expect(charts.getByLabel('Journée',{exact:true})).toHaveValue(latest.round_id);
      await charts.getByText('Voir les points par journée',{exact:true}).click();
      const lastDetails=charts.locator('details > div').last();
      for(const team of data.standings) await expect(lastDetails).toContainText(`${team.points} pts`);
      await charts.getByText('Voir les points par journée',{exact:true}).click();
      await charts.getByLabel('Journée',{exact:true}).selectOption('r1');
      if(season===2029) await expect(charts.getByText('Aucun résultat publié',{exact:true})).toHaveCount(6);
    }
    await charts.scrollIntoViewIfNeeded();
    await screenshot(page,`championship-charts-${season}-desktop.png`,{fullPage:false});
    for(const width of [320,390,430,820]) {
      await page.setViewportSize({width,height:950});
      await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`charts ${season} at ${width}`).toBe(true);
      const positions=await cards.evaluateAll(nodes=>nodes.map(n=>({top:n.getBoundingClientRect().top,bottom:n.getBoundingClientRect().bottom})));
      expect(positions[1].top).toBeGreaterThan(positions[0].bottom);
      expect(positions[2].top).toBeGreaterThan(positions[1].bottom);
      for(const field of await charts.locator('select').evaluateAll(nodes=>nodes.map(n=>({font:parseFloat(getComputedStyle(n).fontSize),height:n.getBoundingClientRect().height})))) {
        expect(field.font).toBeGreaterThanOrEqual(16);
        expect(field.height).toBeGreaterThanOrEqual(44);
      }
      if(width===320 && season!==2028) {
        for(let n=0;n<3;n++) {
          await cards.nth(n).scrollIntoViewIfNeeded();
          await page.mouse.move(0,0);
          await screenshot(page,`championship-charts-${season}-mobile-${n}.png`,{fullPage:false});
        }
        await charts.getByLabel('Équipe à suivre',{exact:true}).selectOption('a');
        await expect(charts.locator('.recharts-line')).toHaveCount(1);
        await expect(charts.getByRole('list',{name:'Équipes représentées'}).locator('li')).toHaveCount(1);
        await charts.getByText('Voir les points par journée',{exact:true}).click();
        expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
        await charts.getByText('Voir les points par journée',{exact:true}).click();
        await charts.getByLabel('Équipe à suivre',{exact:true}).selectOption('');
      }
    }
  }
  console.log('PASS: championship charts, 3 desktop columns, mobile stack 320/390/430/820, 8 teams and 14 rounds, partial/empty rounds, filters and ranking totals.');
}
