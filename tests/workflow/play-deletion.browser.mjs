import {expect} from '@playwright/test';

export async function testGameDeletion(browser, source, screenshot) {
 const base='http://127.0.0.1:3008', owner='00000000-0000-0000-0000-000000000001';
 const auth=await source.context().storageState();
 const context=await browser.newContext({bypassCSP:true,storageState:{cookies:auth.cookies,origins:[]},viewport:{width:390,height:1000}});
 context.setDefaultTimeout(20000);
 const page=await context.newPage(), errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 const dialog=page.getByRole('dialog',{name:'Supprimer cette partie ?'});
 try {
  // Each engine uses the same confirmation and persistent deletion contract.
  for(const [kind,start] of [['cricket','Lancer la partie'],['tictactoe','Créer la grille'],['clock','Lancer le tour'],['bob27','Commencer Bob’s 27'],['connect4','Lancer la partie'],['conquest','Lancer la partie'],['bull500','Lancer la partie']]) {
   await page.goto(base+'/play/'+kind);
   await page.getByRole('button',{name:new RegExp(start)}).click();
   await page.getByRole('button',{name:'Supprimer la partie',exact:true}).click();
   await expect(dialog.getByRole('button',{name:'Conserver la partie',exact:true})).toBeFocused();
   await dialog.getByRole('button',{name:'Conserver la partie',exact:true}).click();
   await expect(page.getByRole('region',{name:'Saisie de la volée'})).toBeVisible();
   await page.getByRole('button',{name:'Supprimer la partie',exact:true}).click();
   if(kind==='cricket') {
    await page.setViewportSize({width:320,height:800});
    const box=await dialog.boundingBox();expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(320);
    await screenshot(page,'play-delete-local-320.png',{fullPage:false});
   }
   await dialog.getByRole('button',{name:'Confirmer la suppression',exact:true}).click();
   await expect(dialog).toHaveCount(0);
   await expect(page.getByRole('button',{name:new RegExp(start)})).toBeVisible();
   await page.reload();
   await expect(page.getByRole('button',{name:new RegExp(start)})).toBeVisible();
   await expect(page.getByRole('button',{name:'Supprimer la partie',exact:true})).toHaveCount(0);
  }

  // Browser-only X01 fixture; real RLS and cascading deletion are tested in SQL.
  const games=new Map(['OWN001','OWN002','OTHER1'].map((code,index)=>[code,{
   id:'delete-game-'+index,session_code:code,created_by:index===2?'other-account':owner,
   starting_score:501,in_rule:'STRAIGHT_IN',out_rule:'DOUBLE_OUT',input_mode:'QUICK_SCORE',
   play_format:'SOLO',best_of_legs:1,status:'IN_PROGRESS',current_leg_number:1,current_turn:1,
   participant_names:['Alice'],role:index===2?'SCORER':'HOST',
  }]));
  let deletions=0,failNext=true;
  const routeGame=async route=>{
   const req=route.request(),url=new URL(req.url()),table=url.pathname.split('/').at(-1),method=req.method();
   if(!['players','live_games','live_game_players','live_legs','live_visits','list_my_live_game_sessions','join_live_game_session'].includes(table))return route.continue();
   const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'GET,POST,DELETE,OPTIONS'};
   if(method==='OPTIONS')return route.fulfill({status:204,headers});
   let data=[];
   if(table==='list_my_live_game_sessions')data=[...games.values()];
   else if(table==='join_live_game_session')data=[{role:'HOST'}];
   else if(table==='live_games') {
    data=[...games.values()].filter(game=>['id','session_code','created_by'].every(key=>!url.searchParams.get(key)?.startsWith('eq.')||url.searchParams.get(key)==='eq.'+game[key]));
    if(method==='DELETE') {
     deletions++;
     if(failNext) {failNext=false;return route.fulfill({status:500,headers,contentType:'application/json',body:JSON.stringify({message:'Connexion indisponible'})});}
     for(const game of data)if(game.created_by===owner)games.delete(game.session_code);
    }
   } else if(table==='live_game_players')data=[{id:'delete-player',player_id:null,display_name:'Alice',seat:1,side:1,legs_won:0,sets_won:0}];
   else if(table==='live_legs')data=[{id:'delete-leg',starting_game_player_id:'delete-player'}];
   await route.fulfill({status:200,headers,contentType:'application/json',body:JSON.stringify(req.headers().accept?.includes('vnd.pgrst.object')?data[0]??null:data)});
  };
  await context.route('http://127.0.0.1:55321/rest/v1/**',routeGame);
  await page.goto(base+'/play/501#sessions');
  await expect(page.locator('.x01-session-row')).toHaveCount(3);
  await expect(page.getByRole('button',{name:'Supprimer la session OTHER1',exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'Supprimer la session OWN001',exact:true}).click();
  await expect(dialog).toContainText('OWN001');
  await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);expect(deletions).toBe(0);
  await page.getByRole('button',{name:'Supprimer la session OWN001',exact:true}).click();
  await page.setViewportSize({width:390,height:844});
  await screenshot(page,'play-delete-x01-390.png',{fullPage:false});
  await dialog.getByRole('button',{name:'Confirmer la suppression',exact:true}).click();
  await expect(dialog.getByRole('alert')).toBeVisible();expect(games.size).toBe(3);
  await dialog.getByRole('button',{name:'Confirmer la suppression',exact:true}).click();
  await expect(dialog).toHaveCount(0);await expect(page.locator('.x01-session-row')).toHaveCount(2);
  expect(games.has('OWN001')).toBe(false);expect(games.has('OWN002')).toBe(true);expect(games.has('OTHER1')).toBe(true);
  await page.reload();await expect(page.locator('.x01-session-row')).toHaveCount(2);
  await page.locator('.x01-session-open').filter({hasText:'OWN002'}).click();
  await page.getByRole('button',{name:'Joueur Saisir et corriger les scores',exact:true}).click();
  await expect(page.getByLabel('Score de la volée',{exact:true})).toBeVisible();
  const displayContext=await browser.newContext({bypassCSP:true,storageState:{cookies:auth.cookies,origins:[]}});
  displayContext.setDefaultTimeout(20000);
  await displayContext.route('http://127.0.0.1:55321/rest/v1/**',routeGame);
  const display=await displayContext.newPage();
  try {
   await display.goto(base+'/play/501?session=OWN002&view=screen');
   await expect(display.getByText('Mode observateur',{exact:true})).toBeVisible();
   await page.getByRole('button',{name:'Supprimer la partie',exact:true}).click();
   await dialog.getByRole('button',{name:'Confirmer la suppression',exact:true}).click();
   await expect(page.getByText('Partie OWN002 supprimée.',{exact:true})).toBeVisible();
   await expect(display.getByText(/Cette partie n’est plus disponible/)).toBeVisible({timeout:15000});
   expect([...games.keys()]).toEqual(['OTHER1']);
  } finally {await displayContext.close();}
  await page.goto(base+'/play/501?session=OTHER1&view=screen');
  await expect(page.getByText('Mode observateur',{exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Supprimer la partie',exact:true})).toHaveCount(0);
  expect(errors).toEqual([]);
  console.log('PASS: deletion — seven local games and reload, accessible mobile confirmation, cancel, owner-only X01 actions, failed request retry, selected session only and observer notification');
 } finally {await context.close();}
}
