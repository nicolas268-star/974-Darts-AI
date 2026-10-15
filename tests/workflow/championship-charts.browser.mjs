import {expect} from '@playwright/test';

export async function testChampionshipCharts(page, screenshot, {base='http://127.0.0.1:3008',api='http://127.0.0.1:8008'}={}) {
  for (const season of [2027,2029,2030,2028]) {
    await page.setViewportSize({width:1920,height:1200});
    const data=await (await page.request.get(`${api}/api/v1/competitions/championships/${season}`)).json();
    await page.goto(`${base}/championships/${season}`);
    const dashboard=page.locator('[data-championship-charts]');
    await expect(dashboard).toBeVisible();
    const cards=dashboard.locator('div > article').filter({has:page.locator('h2')});
    await expect(cards).toHaveCount(3);
    const positions=await cards.evaluateAll(nodes=>nodes.map(n=>n.getBoundingClientRect().top));
    expect(Math.max(...positions)-Math.min(...positions)).toBeLessThanOrEqual(1);
    await expect(page.getByRole('heading',{name:'Classement des équipes',exact:true})).toHaveCount(1);
    const rows=dashboard.locator('[data-team-standings] tbody tr');
    await expect(rows).toHaveCount(data.standings.length);
    for(let i=0;i<data.standings.length;i++) {
      const team=data.standings[i],cells=rows.nth(i).locator('td,th');
      expect((await cells.allTextContents()).map(v=>v.trim())).toEqual([
        String(team.rank),team.name,String(team.points),String(team.played),String(team.wins),String(team.draws),String(team.losses),
        `${team.set_difference>0?'+':''}${team.set_difference}`,team.detail_complete?`${team.leg_difference>0?'+':''}${team.leg_difference}`:'—',
      ]);
      await expect(rows.nth(i).getByRole('link')).toHaveAttribute('href',`/teams/${team.team_id}`);
      const outcome=dashboard.locator('[data-match-outcomes] tbody tr').nth(i);
      expect((await outcome.locator('td,th').allTextContents()).map(v=>v.trim())).toEqual([
        team.name,String(team.played),String(team.wins),String(team.draws),String(team.losses),team.played?`${Math.round(team.wins/team.played*100)} %`:'—','',
      ]);
    }
    if(!data.round_history?.length) {
      await expect(dashboard.getByText('En attente',{exact:true})).toBeVisible();
      await expect(dashboard.getByText(/La progression apparaîtra/)).toBeVisible();
      await expect(dashboard.locator('.recharts-line')).toHaveCount(0);
    } else {
      await expect(dashboard.locator('.recharts-line')).toHaveCount(data.standings.length);
      await expect(dashboard.getByRole('list',{name:'Équipes représentées'}).locator('li')).toHaveCount(data.standings.length);
      await dashboard.getByText('Voir les points par journée',{exact:true}).click();
      const historyRows=dashboard.locator('details tbody tr');
      await expect(historyRows).toHaveCount(data.round_history.length*data.standings.length);
      for(let r=0;r<data.round_history.length;r++) for(let t=0;t<data.standings.length;t++) {
        const round=data.round_history[r],team=data.standings[t],score=round.teams.find(x=>x.team_id===team.team_id);
        expect(await historyRows.nth(r*data.standings.length+t).locator('th,td').allTextContents()).toEqual([round.round,team.name,score.points==null?'Aucun résultat publié':`${score.points} pts`,`${score.cumulative_points} pts`]);
      }
      const latest=data.round_history.at(-1);
      for(const team of data.standings) expect(latest.teams.find(x=>x.team_id===team.team_id).cumulative_points).toBe(team.points);
      await dashboard.getByText('Voir les points par journée',{exact:true}).click();
      const team=data.standings[0];
      await dashboard.getByLabel('Équipe à suivre',{exact:true}).selectOption(team.team_id);
      await expect(dashboard.locator('.recharts-line')).toHaveCount(data.standings.length);
      const opacities=await dashboard.locator('.recharts-line-curve').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('stroke-opacity')));
      if(data.round_history.length>1) expect(opacities.filter(v=>v==='0.2')).toHaveLength(data.standings.length-1);
      const legend=dashboard.getByRole('list',{name:'Équipes représentées'});
      await expect(legend.getByRole('button',{name:team.name,exact:true})).toHaveAttribute('aria-pressed','true');
      await legend.getByRole('button',{name:team.name,exact:true}).click();
      await expect(dashboard.getByLabel('Équipe à suivre',{exact:true})).toHaveValue('');
      const target=dashboard.locator('.recharts-line-dots circle').last();
      await target.hover({force:true});
      await expect(dashboard.locator('.recharts-tooltip-wrapper')).toContainText('pts gagnés');
      await expect(dashboard.locator('.recharts-tooltip-wrapper')).toContainText('cumul');
      await page.mouse.move(0,0);
      await dashboard.getByRole('button',{name:'Par journée',exact:true}).click();
      await expect(dashboard.getByRole('button',{name:'Par journée',exact:true})).toHaveAttribute('aria-pressed','true');
      const publishedDots=data.round_history.reduce((sum,r)=>sum+r.teams.filter(t=>t.points!=null).length,0);
      await expect(dashboard.locator('.recharts-line-dots circle')).toHaveCount(publishedDots);
      await dashboard.getByRole('button',{name:'Cumul',exact:true}).click();
    }
    await page.evaluate(()=>window.scrollTo(0,0));
    await screenshot(page,`championship-dashboard-${season}-desktop.png`,{fullPage:true});
    for(const width of [320,390,430,820,1440]) {
      await page.setViewportSize({width,height:1000});
      await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`season ${season} at ${width}`).toBe(true);
      if(width<1100) {
        const p=await cards.evaluateAll(nodes=>nodes.map(n=>({top:n.getBoundingClientRect().top,bottom:n.getBoundingClientRect().bottom})));
        expect(p[1].top).toBeGreaterThan(p[0].bottom);
        expect(p[2].top).toBeGreaterThan(p[1].bottom);
      }
      for(const field of await dashboard.locator('select').evaluateAll(nodes=>nodes.map(n=>({font:parseFloat(getComputedStyle(n).fontSize),height:n.getBoundingClientRect().height})))) {
        expect(field.font).toBeGreaterThanOrEqual(16);expect(field.height).toBeGreaterThanOrEqual(44);
      }
      if(width===390) { await page.evaluate(()=>window.scrollTo(0,0)); await screenshot(page,`championship-dashboard-${season}-mobile.png`,{fullPage:true}); }
    }
  }
  // Navigate through the real season links, then advance the refresh timer.
  await page.clock.install();
  await page.getByRole('navigation',{name:'Sélectionner la saison du championnat'}).getByRole('link',{name:'2027',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Championnat Interclubs 2027',exact:true})).toBeVisible();
  const dashboard=page.locator('[data-championship-charts]');
  const teamId=await dashboard.getByLabel('Équipe à suivre',{exact:true}).locator('option').nth(1).getAttribute('value');
  await dashboard.getByLabel('Équipe à suivre',{exact:true}).selectOption(teamId);
  await dashboard.getByRole('button',{name:'Par journée',exact:true}).click();
  const refreshed=page.waitForResponse(response=>response.url().includes('/championships/2027')&&response.request().headers().rsc==='1'&&response.status()===200);
  await page.clock.fastForward(60_001);
  await refreshed;
  await expect(dashboard.getByLabel('Équipe à suivre',{exact:true})).toHaveValue(teamId);
  await expect(dashboard.getByRole('button',{name:'Par journée',exact:true})).toHaveAttribute('aria-pressed','true');
  await page.clock.resume();
  console.log('PASS: official table values/order, all trajectories retained on selection, tooltip, daily publication gaps, cumulative reconciliation, empty/one/14 rounds, 320–1920px, season navigation and automatic refresh preserving selection/mode.');
}
