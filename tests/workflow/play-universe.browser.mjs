import { expect } from "@playwright/test";

export async function testPlayUniverse(page, screenshot) {
  const errors=[];
  const onError=(error)=>errors.push(error.message);
  page.on("pageerror",onError);
  await page.setViewportSize({width:1440,height:1000});
  await page.goto("http://127.0.0.1:3008/play");
  await expect(page.getByRole("heading",{name:"Univers Jeux"})).toBeVisible();
  await expect(page.locator(".play-universe-game")).toHaveCount(8);
  await screenshot(page,"play-universe-desktop.png");
  await page.goto("http://127.0.0.1:3008/play/cricket");
  await page.getByRole("button",{name:/^4 joueurs/}).click();
  const longName="Alice avec un nom très long";
  await page.getByLabel("Joueur 1",{exact:true}).fill(longName);
  await page.getByRole("button",{name:/Lancer la partie/}).click();
  const panel=page.getByRole("region",{name:"Saisie de la volée"});
  await expect(panel.getByRole("heading",{name:longName})).toBeVisible();
  await expect(panel.getByRole("button",{name:/Joueur suivant/})).toBeDisabled();
  await panel.getByLabel("Fléchette",{exact:true}).fill("T20");
  await panel.getByLabel("Fléchette",{exact:true}).press("Enter");
  await expect(panel.getByText("1/3 fléchettes jouées",{exact:true})).toBeVisible();
  await expect(page.getByLabel(longName+" · 20 · 3 marques",{exact:true})).toBeVisible();
  await panel.getByRole("button",{name:"Raté / 0",exact:true}).click();
  await panel.getByLabel("Fléchette",{exact:true}).fill("1");
  await panel.getByLabel("Fléchette",{exact:true}).press("Enter");
  await expect(panel.getByText("3/3 fléchettes jouées",{exact:true})).toBeVisible();
  await expect(panel.getByRole("heading",{name:longName})).toBeVisible();
  await expect(panel.getByLabel("Fléchette",{exact:true})).toBeDisabled();
  await expect(panel.getByText("Volée terminée",{exact:true})).toBeVisible();
  await panel.getByRole("button",{name:/Joueur suivant/}).click();
  await expect(panel.getByRole("heading",{name:"Adversaire",exact:true})).toBeVisible();
  await panel.getByRole("button",{name:"Annuler la dernière action",exact:true}).click();
  await expect(panel.getByRole("heading",{name:longName})).toBeVisible();
  await expect(panel.getByText("3/3 fléchettes jouées",{exact:true})).toBeVisible();
  await panel.getByRole("button",{name:"Annuler la dernière action",exact:true}).click();
  await expect(panel.getByText("2/3 fléchettes jouées",{exact:true})).toBeVisible();

  for(const width of [320,390,430,820,1440]){
    await page.setViewportSize({width,height:1000});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),"Cricket at "+width).toBe(true);
    await expect(page.locator(".cricket-multi-scoreboard article")).toHaveCount(4);
    const input=panel.getByLabel("Fléchette",{exact:true});
    expect(await input.evaluate(el=>parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(16);
    await panel.scrollIntoViewIfNeeded();
    await screenshot(page,"play-cricket-"+width+".png",{fullPage:false});
  }
  for(const [path,start] of [["tictactoe","Créer la grille"],["bob27","Commencer Bob’s 27"],["clock","Lancer le tour"]]){
    await page.setViewportSize({width:390,height:1000});
    await page.goto("http://127.0.0.1:3008/play/"+path);
    await page.getByRole("button",{name:/^4 joueurs/}).click();
    await page.getByRole("button",{name:new RegExp(start)}).click();
    for(let dart=0;dart<3;dart++) await page.getByRole("button",{name:"Raté / 0",exact:true}).click();
    await expect(page.getByText("3/3 fléchettes jouées",{exact:true})).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),path+" mobile").toBe(true);
    await page.getByRole("button",{name:/Joueur suivant/}).click();
    await expect(page.getByText("0/3 fléchettes jouées",{exact:true})).toBeVisible();
  }


  for (const path of ["connect4", "conquest", "bull500"]) {
    await page.setViewportSize({ width: 320, height: 1000 });
    await page.goto("http://127.0.0.1:3008/play/" + path);
    await page.getByRole("button", { name: /^4 joueurs/ }).click();
    await page.getByLabel("Joueur 1", { exact: true }).fill(longName);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), path + " setup 320").toBe(true);
    await page.getByRole("button", { name: "Lancer la partie →", exact: true }).click();
    const turn = page.getByRole("region", { name: "Saisie de la volée" });
    const enter = async (value) => {
      const field = turn.getByLabel("Fléchette", { exact: true });
      await field.fill(value); await field.press("Enter");
    };
    const undo = turn.getByRole("button", { name: "Annuler la dernière action", exact: true });
    const next = turn.getByRole("button", { name: /Joueur suivant/ });
    if (path === "connect4") {
      await enter("T14");
      await expect(turn.getByText("1/3 fléchettes jouées", { exact: true })).toBeVisible();
      await expect(turn.getByText("Non jouée", { exact: true })).toHaveCount(2);
      await expect(turn.getByLabel("Fléchette", { exact: true })).toBeDisabled();
      await expect(page.getByRole("cell", { name: "Ligne 6, secteur 14 : " + longName, exact: true })).toBeVisible();
      await next.click(); await expect(turn.getByRole("heading", { name: "Adversaire", exact: true })).toBeVisible();
      await undo.click(); await expect(turn.getByText("1/3 fléchettes jouées", { exact: true })).toBeVisible();
      await undo.click(); await expect(page.getByRole("cell", { name: "Ligne 6, secteur 14 : vide", exact: true })).toBeVisible();
      await expect(turn.getByLabel("Fléchette", { exact: true })).toBeEnabled();
      for (let i = 0; i < 3; i++) await enter("0");
      await expect(turn.getByText("3/3 fléchettes jouées", { exact: true })).toBeVisible();
    } else if (path === "conquest") {
      await enter("T20"); await enter("19"); await enter("D19");
      await expect(page.getByLabel("Territoire 20 : " + longName, { exact: true })).toBeVisible();
      await expect(page.getByLabel("Territoire 19 : " + longName, { exact: true })).toBeVisible();
      await expect(turn.getByText("3/3 fléchettes jouées", { exact: true })).toBeVisible();
      await undo.click(); await expect(page.getByLabel("Territoire 19 : libre", { exact: true })).toBeVisible();
      await enter("D19"); await next.click(); await enter("T20");
      await expect(page.getByLabel("Territoire 20 : Adversaire", { exact: true })).toBeVisible();
      await expect(page.locator(".fun-scores article").first()).toHaveAttribute("aria-label", longName + " · 1");
    } else {
      await enter("T20"); await enter("25"); await enter("50");
      await expect(page.locator(".fun-scores article").first()).toHaveAttribute("aria-label", longName + " · 0");
      await expect(turn.getByText("3/3 fléchettes jouées", { exact: true })).toBeVisible();
      await next.click(); await expect(turn).toContainText("Commencez par le Bull 50");
      await enter("50"); await enter("T20"); await enter("20");
      await expect(page.locator(".fun-scores article").nth(1)).toHaveAttribute("aria-label", "Adversaire · 80");
      await undo.click(); await expect(page.locator(".fun-scores article").nth(1)).toHaveAttribute("aria-label", "Adversaire · 60");
      await enter("20");
    }
    for (const width of [320, 390, 430, 820, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      await expect(page.locator(".fun-scores article")).toHaveCount(4);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), path + " at " + width).toBe(true);
      if (width === 390 || width === 1440) await screenshot(page, "play-" + path + "-" + width + ".png");
    }
  }
  // Finish a real game, then correct the winning dart and check exit confirmation.
  await page.setViewportSize({ width: 390, height: 1000 });
  await page.goto("http://127.0.0.1:3008/play/connect4");
  await page.getByRole("button", { name: "Nouvelle partie", exact: true }).click();
  await page.getByRole("button", { name: "Confirmer la nouvelle partie", exact: true }).click();
  await page.getByRole("button", { name: /^Solo/ }).click();
  await page.getByLabel("Joueur 1", { exact: true }).fill("Alice");
  await page.getByRole("button", { name: "Lancer la partie →", exact: true }).click();
  for (const value of ["14", "15", "16", "17"]) {
    await page.getByLabel("Fléchette", { exact: true }).fill(value);
    await page.getByLabel("Fléchette", { exact: true }).press("Enter");
    if (value !== "17") await page.getByRole("button", { name: /Volée suivante/ }).click();
  }
  await expect(page.getByRole("heading", { name: "Alice gagne !", exact: true })).toBeVisible();
  await expect(page.locator(".fun-connect-cell.winning")).toHaveCount(4);
  await page.getByRole("button", { name: "Annuler la dernière action", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Alice gagne !", exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Fléchette", { exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Nouvelle partie", exact: true }).click();
  await page.getByRole("button", { name: "Continuer la partie", exact: true }).click();
  await expect(page.locator(".fun-connect-cell.fun-owner-0")).toHaveCount(3);
  await page.getByRole("button", { name: "Nouvelle partie", exact: true }).click();
  await page.getByRole("button", { name: "Confirmer la nouvelle partie", exact: true }).click();
  await expect(page.getByRole("button", { name: "Lancer la partie →", exact: true })).toBeVisible();

  // Browser-only X01 fixture. It never writes to a real Supabase database.
  let game=null,players=[],legs=[],visits=[],throws=[],sequence=0;
  const endpoint="http://127.0.0.1:55321/rest/v1/**";
  const x01Route=async(route)=>{
    const req=route.request(),url=new URL(req.url()),table=url.pathname.split("/").at(-1),method=req.method();
    if(!["players","live_games","live_game_players","live_legs","live_visits","live_throws","list_my_live_game_sessions","join_live_game_session"].includes(table))return route.continue();
    if(method==="OPTIONS")return route.fulfill({status:204,headers:{"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"*","Access-Control-Allow-Methods":"GET,POST,PATCH,DELETE,OPTIONS"}});
    const body=req.postDataJSON();
    let data=[];
    if(table==="players")data=[];
    else if(table==="list_my_live_game_sessions")data=game?[game]:[];
    else if(table==="join_live_game_session")data=[{role:"HOST"}];
    else if(table==="live_games"){
      if(method==="POST")game={...body,id:"game-1",session_code:"PLAY01"};
      if(method==="PATCH")Object.assign(game,body);
      data=game?[game]:[];
    }else if(table==="live_game_players"){
      if(method==="POST")players=body.map(p=>({...p,id:"player-"+p.seat,legs_won:0,sets_won:0}));
      if(method==="PATCH")players.forEach(p=>{if(!url.searchParams.has("side")||"eq."+p.side===url.searchParams.get("side"))Object.assign(p,body)});
      data=players;
    }else if(table==="live_legs"){
      if(method==="POST")legs.push({...body,id:"leg-"+(++sequence)});
      if(method==="PATCH")Object.assign(legs.at(-1),body);
      data=[legs.at(-1)].filter(Boolean);
    }else if(table==="live_visits"){
      if(method==="POST")visits.push({...body,id:"visit-"+(++sequence)});
      if(method==="DELETE")visits=visits.filter(v=>"eq."+v.id!==url.searchParams.get("id"));
      data=method==="POST"?[visits.at(-1)]:visits;
    }else if(table==="live_throws"){
      if(method==="POST")throws.push(...body);
      data=throws.filter(t=>!url.searchParams.has("visit_id")||"eq."+t.visit_id===url.searchParams.get("visit_id"));
    }
    const single=req.headers().accept?.includes("vnd.pgrst.object");
    await route.fulfill({status:200,contentType:"application/json",headers:{"Access-Control-Allow-Origin":"*"},body:JSON.stringify(single?data[0]??null:data)});
  };
  await page.route(endpoint,x01Route);
  try{
    await page.goto("http://127.0.0.1:3008/play/501");
    await page.getByRole("button",{name:/^4 joueurs/}).click();
    await page.getByRole("button",{name:/Créer la session/}).click();
    const score=page.getByLabel("Score de la volée",{exact:true});
    await expect(score).toHaveCount(1);
    await expect(score).toHaveValue("");
    await score.fill("179");
    await score.press("Enter");
    await expect(page.locator(".x01-alert.error")).toContainText("score réalisable");
    expect(visits.length).toBe(0);
    await score.fill("100");await score.press("Enter");
    await expect(score).toHaveValue("");
    expect(visits.length).toBe(1);expect(visits[0].score_after).toBe(401);
    await score.fill("0");await score.press("Enter");
    await expect(score).toHaveValue("");
    expect(visits.length).toBe(2);expect(visits[1].score_after).toBe(501);
    await page.getByRole("button",{name:"Flèche par flèche",exact:true}).click();
    for(const value of ["T20","20","0"]){
      const dart=page.getByLabel("Fléchette",{exact:true});
      await dart.fill(value);await dart.press("Enter");
    }
    await expect(page.getByText("3/3 fléchettes jouées",{exact:true})).toBeVisible();
    await page.getByRole("button",{name:"Valider la volée",exact:true}).click();
    await expect(page.getByText("0/3 fléchettes jouées",{exact:true})).toBeVisible();
    expect(visits.length).toBe(3);expect(visits[2].score_scored).toBe(80);expect(throws.length).toBe(3);
    await page.getByText("Historique des volées · leg 1",{exact:true}).click();
    await page.getByRole("button",{name:"Corriger la dernière volée",exact:true}).click();
    await expect(page.getByText("3/3 fléchettes jouées",{exact:true})).toBeVisible();
    expect(visits.length).toBe(2);
    await page.getByRole("button",{name:"Annuler la dernière fléchette",exact:true}).click();
    await page.getByLabel("Fléchette",{exact:true}).fill("D20");
    await page.getByLabel("Fléchette",{exact:true}).press("Enter");
    await page.getByRole("button",{name:"Valider la volée",exact:true}).click();
    await expect(page.getByText("0/3 fléchettes jouées",{exact:true})).toBeVisible();
    expect(visits.length).toBe(3);expect(visits[2].score_scored).toBe(120);
    for(const width of [320,390,430,820,1440]){
      await page.setViewportSize({width,height:1000});
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),"X01 at "+width).toBe(true);
      await expect(page.locator(".play-score-strip article")).toHaveCount(4);
      await page.locator(".play-turn-panel").scrollIntoViewIfNeeded();
      await screenshot(page,"play-x01-"+width+".png",{fullPage:false});
    }
    const auth=await page.context().storageState();
    const displayContext=await page.context().browser().newContext({storageState:{cookies:auth.cookies,origins:[]},viewport:{width:1440,height:1000}});
    const display=await displayContext.newPage();
    await display.route(endpoint,x01Route);
    try {
      await display.goto("http://127.0.0.1:3008/play/501?session=PLAY01&view=screen");
      await expect(display.getByText("Mode observateur",{exact:true})).toBeVisible();
      await expect(display.getByLabel("Fléchette",{exact:true})).toHaveCount(0);
      for(const value of ["T20","0","0"]){
        await page.getByLabel("Fléchette",{exact:true}).fill(value);await page.getByLabel("Fléchette",{exact:true}).press("Enter");
      }
      await page.getByRole("button",{name:"Valider la volée",exact:true}).click();
      await expect(display.locator(".play-score-strip article").last()).toContainText("441",{timeout:15000});
      await screenshot(display,"play-x01-pc-observer.png");
      game.status="COMPLETED";players[0].legs_won=1;
      await expect(display.getByText("Match terminé",{exact:true})).toBeVisible({timeout:15000});
    } finally { await displayContext.close(); }
  }finally{await page.unroute(endpoint);}
  page.off("pageerror",onError);
  expect(errors).toEqual([]);
  console.log("PASS: Univers Jeux, keyboard X01, four-player mobile layouts, triple vs dart count, miss, 3/3 handover undo, Puissance 4 victory, territory capture, Bull 500 scoring and seven local games.");
}
