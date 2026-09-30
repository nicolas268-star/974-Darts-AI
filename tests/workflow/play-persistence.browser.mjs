import { expect } from "@playwright/test";

export async function testPlayPersistence(page, screenshot) {
  const base = "http://127.0.0.1:3008";
  expect(new URL(page.url()).origin).toBe(base);
  // Only disposable loopback fixture data is removed.
  await page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith("974darts:play:v1:")).forEach(k => localStorage.removeItem(k)));
  const read = (target, kind) => target.evaluate(kind => {
    const key = Object.keys(localStorage).find(k => k.startsWith("974darts:play:v1:") && k.endsWith(":" + kind));
    return key ? {key, raw: localStorage.getItem(key), record: JSON.parse(localStorage.getItem(key))} : null;
  }, kind);
  const enter = async (target, value) => {
    const input = target.getByLabel("Fléchette", {exact:true});
    await input.fill(value); await input.press("Enter");
  };
  const counter = (target, n) => expect(target.getByRole("region", {name:"Saisie de la volée"}).getByText(n + "/3 fléchettes jouées", {exact:true})).toBeVisible();
  const saved = target => expect(target.getByText("Partie sauvegardée sur ce navigateur", {exact:true})).toBeVisible();
  const cases = [
    ["cricket", "Lancer la partie", "0"],
    ["tictactoe", "Créer la grille", "0"],
    ["clock", "Lancer le tour", "T1"],
    ["bob27", "Commencer Bob’s 27", "D1"],
    ["connect4", "Lancer la partie", "0"],
    ["conquest", "Lancer la partie", "T20"],
    ["bull500", "Lancer la partie", "25"],
  ];
  for (const [kind, start, first] of cases) {
    await page.setViewportSize({width:390,height:1000});
    await page.goto(base + "/play/" + kind);
    await page.getByRole("button",{name:/^4 joueurs/}).click();
    await page.getByLabel("Joueur 1",{exact:true}).fill("Sauvegarde Alice");
    if(kind === "cricket") await page.locator(".cricket-mode-grid button").filter({hasText:"Magic"}).click();
    if(kind === "tictactoe") await page.locator(".ttt-mode-grid button.hard").click();
    if(kind === "clock") await page.getByRole("button",{name:/^Triple/}).click();
    if(kind === "connect4") await page.getByLabel("Impacts acceptés").selectOption("DOUBLE");
    if(kind === "conquest") { await page.getByLabel("Mode de conquête").selectOption("CLASSIC");await page.getByLabel("Territoires pour gagner").selectOption("10"); }
    if(kind === "bull500") {
      await page.getByLabel("Déblocage du score").selectOption("25_OR_50");
      await page.getByLabel("Secteurs pour marquer").selectOption("19_OR_20");
    }
    await page.getByRole("button",{name:new RegExp(start)}).click();
    await saved(page);
    const initial = await read(page, kind);
    const firstValue = kind === "cricket" ? String(initial.record.current.game.targets[0].value) : first;
    await enter(page, firstValue);
    await enter(page, kind === "connect4" ? "D14" : kind === "bull500" ? "T19" : kind === "conquest" ? "D19" : "0");
    await counter(page,2); await saved(page);
    const before = await read(page,kind);
    await page.reload(); await counter(page,2); await saved(page);
    expect((await read(page,kind)).record).toEqual(before.record);
    await expect(page.getByRole("region",{name:"Saisie de la volée"}).getByRole("heading",{name:"Sauvegarde Alice",exact:true})).toBeVisible();
    if(kind !== "connect4") { await enter(page,"0"); await counter(page,3); }
    const complete = await read(page,kind);
    await page.getByRole("button",{name:/Joueur suivant/}).click();
    await counter(page,0); await saved(page);
    const handedOver = await read(page,kind);
    await page.reload(); await counter(page,0);
    expect((await read(page,kind)).record).toEqual(handedOver.record);
    await page.getByRole("button",{name:"Annuler la dernière action",exact:true}).click();
    await counter(page,kind === "connect4" ? 2 : 3);
    expect((await read(page,kind)).record.current.game).toEqual(complete.record.current.game);
    await page.getByRole("button",{name:"Annuler la dernière action",exact:true}).click();
    await counter(page,kind === "connect4" ? 1 : 2); await saved(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),kind+" saved mobile").toBe(true);
    await page.getByRole("link",{name:"Mettre en pause",exact:true}).click();
    const card=page.locator(".play-saved-card").filter({has:page.getByRole("heading",{name:kind==="clock"?"Tour de l’horloge":kind==="tictactoe"?"Morpion":kind==="bob27"?"Bob’s 27":kind==="connect4"?"Puissance 4":kind==="conquest"?"Conquête":kind==="bull500"?"Bull 500":"Cricket",exact:true})});
    await expect(card).toContainText("Sauvegarde Alice");
    await card.getByRole("link",{name:/Reprendre/}).click();
    await counter(page,kind === "connect4" ? 1 : 2);
  }

  // Finish, reopen and correct a win: no duplicate or stale result in history.
  await page.goto(base+"/play/connect4");
  await page.getByRole("button",{name:"Nouvelle partie",exact:true}).click();
  await page.getByRole("button",{name:"Confirmer la nouvelle partie",exact:true}).click();
  await page.getByRole("button",{name:/^Solo/}).click();
  await page.getByLabel("Joueur 1",{exact:true}).fill("Archive Alice");
  await page.getByRole("button",{name:/Lancer la partie/}).click();
  for(const value of ["14","15","16","17"]){
    await enter(page,value);
    if(value !== "17") await page.getByRole("button",{name:/Volée suivante/}).click();
  }
  await expect(page.getByRole("heading",{name:"Archive Alice gagne !",exact:true})).toBeVisible();
  await page.reload(); await expect(page.getByRole("heading",{name:"Archive Alice gagne !",exact:true})).toBeVisible();
  expect((await read(page,"connect4")).record.completed).toHaveLength(1);
  await page.getByRole("link",{name:"Mettre en pause",exact:true}).click();
  await expect(page.locator(".play-saved-history")).toContainText("Archive Alice gagne");
  await page.getByRole("link",{name:/Revoir Puissance 4/}).click();
  await page.getByRole("button",{name:"Annuler la dernière action",exact:true}).click();
  await counter(page,0);
  expect((await read(page,"connect4")).record.completed).toHaveLength(0);
  await enter(page,"17"); await expect(page.getByRole("heading",{name:"Archive Alice gagne !",exact:true})).toBeVisible();
  await page.getByRole("button",{name:"Rejouer",exact:true}).click();
  await counter(page,0);
  expect((await read(page,"connect4")).record.current.game.participants).toEqual([{name:"Archive Alice",side:0}]);
  expect((await read(page,"connect4")).record.completed).toHaveLength(1);

  // Two tabs must explicitly reload rather than overwrite each other's revision.
  await page.goto(base+"/play/conquest");
  const other=await page.context().newPage();
  try {
    await other.goto(base+"/play/conquest"); await counter(other,2);
    await enter(page,"0"); await counter(page,3);
    await expect(other.getByText(/Cette partie a changé dans un autre onglet/)).toBeVisible();
    await expect(other.getByLabel("Fléchette",{exact:true})).toBeDisabled();
    await other.getByRole("button",{name:"Recharger la sauvegarde",exact:true}).click();
    await counter(other,3);
    await other.getByRole("button",{name:/Joueur suivant/}).click(); await counter(other,0);
    await expect(page.getByText(/Cette partie a changé dans un autre onglet/)).toBeVisible();
    await page.getByRole("button",{name:"Recharger la sauvegarde",exact:true}).click(); await counter(page,0);
  } finally { await other.close(); }

  // Real browser quota failure keeps the playable state, warns, and can be retried.
  const fault=await page.context().newPage();
  try {
    await fault.addInitScript(() => {
      const original=Storage.prototype.setItem;
      Storage.prototype.setItem=function(key,value){
        if(key.startsWith("974darts:play:v1:"))throw new DOMException("Test quota","QuotaExceededError");
        return original.call(this,key,value);
      };
      window.restorePlayStorage=()=>{Storage.prototype.setItem=original;};
    });
    await fault.goto(base+"/play/bull500"); await counter(fault,2);
    const before=await read(fault,"bull500");
    await enter(fault,"0"); await counter(fault,3);
    await expect(fault.getByText(/Sauvegarde indisponible sur ce navigateur/)).toBeVisible();
    expect((await read(fault,"bull500")).raw).toBe(before.raw);
    await fault.evaluate(()=>window.restorePlayStorage());
    await fault.getByRole("button",{name:"Réessayer la sauvegarde",exact:true}).click(); await saved(fault);
    await fault.reload(); await counter(fault,3);
  } finally { await fault.close(); }

  // Corrupt data is not silently erased; recovery requires an explicit choice.
  const broken=await read(page,"clock");
  await page.evaluate(key=>localStorage.setItem(key,"{invalid"),broken.key);
  await page.goto(base+"/play/clock");
  await expect(page.getByText(/Sauvegarde illisible ou incompatible/)).toBeVisible();
  expect(await page.evaluate(key=>localStorage.getItem(key),broken.key)).toBe("{invalid");
  await page.getByRole("button",{name:"Effacer la sauvegarde illisible",exact:true}).click();
  await page.getByRole("button",{name:"Confirmer la nouvelle partie",exact:true}).click();
  await page.getByRole("button",{name:/Lancer le tour/}).click(); await counter(page,0); await saved(page);

  await page.goto(base+"/play");
  await expect(page.locator(".play-saved-card")).toHaveCount(7);
  for(const width of [320,390,1440]){
    await page.setViewportSize({width,height:1000});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),"saved games hub "+width).toBe(true);
    if(width!==320)await screenshot(page,"play-saved-games-"+width+".png");
  }
  console.log("PASS: local persistence in seven games, reload at 2/3 and handover, undo restored, pause/hub resume, finished history, replay settings, two-tab conflict, quota retry and corrupt-data recovery.");
}
