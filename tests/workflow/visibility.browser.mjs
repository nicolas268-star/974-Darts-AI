import {expect} from '@playwright/test';

// Runs within the isolated workflow auth fixture. All outgoing sharing is intercepted.
export async function testVisibility(admin, director, screenshot) {
  const origin='http://127.0.0.1:3008';
  const id='f678a113-699e-496e-ae0a-944d37d25893';
  const evening={id,round:'J1',date:'2026-09-28',home:'Kaz A Darts - A',away:'Kaz A Darts - B',home_score:17,away_score:3};
  const summary={whatsapp:'🎯 Kaz A Darts - A 17–3 Kaz A Darts - B\n45 legs · 10 joueurs\nPlus haut finish : Emmanuel GRASSET, 88.',facebook:'🎯 J1 · Kaz A Darts - A 17–3 Kaz A Darts - B\nBravo aux deux équipes !',mode:'statistics',note:'Résumé statistique prêt.',ai_available:true,fingerprint:'fixture',evening:{url:`https://974darts.re/matches/${id}`,matches:20,legs:45,players:10}};
  const signature='974Darts · NDX Performance Lab';
  const signedWhatsApp=summary.whatsapp+'\n\n'+signature;
  const signedFacebook=summary.facebook+'\n\n'+signature;
  let generated=0;
  let automaticReady=false;
  let noEvenings=false;
  let unavailableEvenings=false;
  let summaryRequests=0;
  await admin.route('**/api/admin/visibility/**',async route=>{
    const url=new URL(route.request().url());
    if(url.pathname.endsWith('/evenings'))return unavailableEvenings ? route.fulfill({status:503,json:{error:'Service interclubs indisponible.'}}) : route.fulfill({json:{evenings:noEvenings?[]:[evening],ai_available:true,automation:{running:true,publication_enabled:true,next_at:'2026-09-30T22:00:00+04:00',recent:[{title:'J1 · rencontre tardive',status:'WAITING',message:'Le match est encore en cours.',retry_expired:false}]}}});
    summaryRequests++;
    if(route.request().method()==='POST'){
      expect(route.request().postDataJSON()).toEqual({result_id:id});generated++;
      return route.fulfill({json:{...summary,mode:'ai',note:'Analyse éditoriale IA : faits vérifiés.'}});
    }
    return route.fulfill({json:automaticReady?{...summary,mode:'ai',note:'Analyse préparée automatiquement.'}:summary});
  });
  await admin.goto(origin+'/admin/visibility');
  await expect(admin.getByLabel('Texte pour le groupe',{exact:false})).toHaveValue(signedWhatsApp,{timeout:30000});
  await expect(admin.locator('#facebook-draft')).toHaveValue(new RegExp(signature+'$'));
  await admin.getByLabel('Informations',{exact:true}).fill('Une annonce NDX Performance Lab');
  expect((await admin.locator('#facebook-draft').inputValue()).match(/NDX Performance Lab/g)).toHaveLength(1);
  await expect(admin.getByText('Championnat automatique · à partir de 22 h · suivi pendant 24 h · heure de La Réunion')).toBeVisible();
  await expect(admin.getByText(/Nouvelle vérification toutes les 10 minutes jusqu’à 22 h le lendemain\./)).toBeVisible();
  await expect(admin.getByText(/résultats, classement et statistiques des joueurs et des équipes sont mis à jour/)).toBeVisible();
  await admin.evaluate(()=>{
    window.__visibilityShares=[];
    window.open=()=>({opener:null,document:{title:''},closed:false,close(){this.closed=true},location:{replace(url){window.__visibilityShares.push(url)}}});
    Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.__visibilityCopied=text}}});
  });
  await admin.getByRole('button',{name:'Analyser et ouvrir WhatsApp'}).click();
  await expect(admin.getByText('WhatsApp ouvert : choisis le groupe Fléchettes Réunion, puis valide l’envoi.')).toBeVisible();
  expect(generated).toBe(1);
  let shared=await admin.evaluate(()=>window.__visibilityShares);
  expect(new URL(shared[0]).origin).toBe('https://wa.me');
  expect(new URL(shared[0]).searchParams.get('text')).toBe(signedWhatsApp);
  const edited='Mon résumé modifié pour le groupe 🎯';
  await admin.locator('#whatsapp-draft').fill(edited);
  await admin.getByRole('button',{name:'Préparer la version Facebook'}).click();
  await expect(admin.locator('#facebook-draft')).toHaveValue(signedFacebook);
  await expect(admin.locator('#whatsapp-draft')).toHaveValue(edited);
  await admin.getByRole('button',{name:'Ouvrir dans WhatsApp',exact:true}).click();
  expect(generated).toBe(1);
  shared=await admin.evaluate(()=>window.__visibilityShares);
  expect(new URL(shared[1]).searchParams.get('text')).toBe(edited);
  await admin.getByRole('button',{name:'Copier et ouvrir Facebook'}).click();
  await expect(admin.getByText('Texte copié. Colle-le dans ta publication Facebook, puis publie depuis ton compte.')).toBeVisible();
  expect(await admin.evaluate(()=>window.__visibilityCopied)).toBe(signedFacebook);
  expect(await admin.evaluate(()=>window.__visibilityShares.at(-1))).toBe('https://www.facebook.com/');
  await screenshot(admin,'06-visibilite.png');
  await admin.setViewportSize({width:390,height:844});
  await screenshot(admin,'07-visibilite-mobile.png');
  const overflow=await admin.evaluate(()=>({
    width:window.innerWidth,scrollWidth:document.documentElement.scrollWidth,
    elements:[...document.querySelectorAll('main *')].filter(el=>el.getBoundingClientRect().right>window.innerWidth).map(el=>({tag:el.tagName,className:el.className})),
  }));
  expect(overflow.scrollWidth,JSON.stringify(overflow)).toBeLessThanOrEqual(overflow.width);
  // BDC uses the published round data, without sending tournament IDs to the interclub API.
  const previousRequests=summaryRequests;
  const choice=admin.getByLabel('Rencontre ou manche BDC');
  await expect(choice.locator('optgroup[label="Blind Draw Championship"] option')).toHaveCount(2);
  await choice.selectOption('bdc-manche-2');
  await expect(admin.locator('#whatsapp-draft')).toHaveValue(/Blind Draw Championship · Manche 2/);
  const bdcDraft=await admin.locator('#whatsapp-draft').inputValue();
  expect(bdcDraft.endsWith(signature)).toBe(true);
  expect(bdcDraft.match(/NDX Performance Lab/g)).toHaveLength(1);
  expect(bdcDraft).toContain('7 doublettes · 14 joueurs · 25 matchs · 64 legs vérifiés');
  expect(bdcDraft).toContain('Kozu / Vincent s’imposent 3–2');
  expect(bdcDraft).toContain('Vincent (TDC) — 19 pts');
  expect(bdcDraft).toContain('sous réserve de validation du directeur sportif');
  await expect(admin.getByRole('link',{name:'Voir les statistiques'})).toHaveAttribute('href','https://974darts.re/tournaments/blind-draw-championship#resultats-manche-2');
  await admin.getByRole('button',{name:'Ouvrir dans WhatsApp',exact:true}).click();
  expect(new URL(await admin.evaluate(()=>window.__visibilityShares.at(-1))).searchParams.get('text')).toBe(bdcDraft);
  const editedBdc=bdcDraft+'\nÀ bientôt pour la prochaine manche !';
  await admin.locator('#whatsapp-draft').fill(editedBdc);
  await admin.getByRole('button',{name:'Préparer la version Facebook'}).click();
  await expect(admin.locator('#facebook-draft')).toHaveValue(/sous réserve de validation du directeur sportif/);
  await expect(admin.locator('#facebook-draft')).toHaveValue(new RegExp(signature+'$'));
  await expect(admin.locator('#whatsapp-draft')).toHaveValue(editedBdc);
  await admin.getByRole('button',{name:'Ouvrir dans WhatsApp',exact:true}).click();
  expect(new URL(await admin.evaluate(()=>window.__visibilityShares.at(-1))).searchParams.get('text')).toBe(editedBdc);
  expect(generated).toBe(1);
  expect(summaryRequests).toBe(previousRequests);
  await screenshot(admin,'08-visibilite-bdc-mobile.png');
  expect(await admin.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await choice.selectOption('bdc-manche-1');
  await expect(admin.locator('#whatsapp-draft')).toHaveValue(/Statistiques partielles — incident Nakka/);
  const firstRound=await admin.locator('#whatsapp-draft').inputValue();
  expect(firstRound).toContain('Classement cumulé après M1\n');
  expect(firstRound).not.toContain('M1 + M2');
  expect(firstRound).not.toContain('19 pts');
  expect(firstRound).not.toContain('Meilleure moyenne');
  await choice.selectOption(id);
  await expect(admin.locator('#whatsapp-draft')).toHaveValue(signedWhatsApp);
  // APIRequestContext bypasses the browser route mocks, exercising the real proxy guards.
  const denied=await director.request.get(origin+'/api/admin/visibility/evenings');
  expect(denied.status()).toBe(403);
  const csrf=await admin.request.post(origin+'/api/admin/visibility/summary',{headers:{Origin:'https://evil.invalid'},data:{result_id:id}});
  expect(csrf.status()).toBe(403);
  const malformed=await admin.request.get(origin+'/api/admin/visibility/summary?result_id=invalid');
  expect(malformed.status()).toBe(400);
  const anonymous=await admin.context().browser().newContext();
  expect((await anonymous.request.get(origin+'/api/admin/visibility/evenings')).status()).toBe(401);
  await anonymous.close();
  automaticReady=true;
  await admin.reload();
  await expect(admin.getByLabel('Texte pour le groupe',{exact:false})).toHaveValue(signedWhatsApp);
  await expect(admin.getByText('Synthèse IA',{exact:true})).toBeVisible();
  await expect(admin.getByRole('button',{name:'Ouvrir dans WhatsApp',exact:true})).toBeEnabled();
  expect(generated).toBe(1); // Reading a prepared nightly analysis never triggers another AI request.
  noEvenings=true;
  await admin.reload();
  await expect(admin.locator('#visibility-evening')).toHaveValue('bdc-manche-2');
  await expect(admin.locator('#whatsapp-draft')).toHaveValue(/Blind Draw Championship · Manche 2/);
  unavailableEvenings=true;
  await admin.reload();
  await expect(admin.locator('main').getByRole('alert')).toContainText('Les manches BDC restent disponibles.');
  await expect(admin.locator('#whatsapp-draft')).toHaveValue(/Blind Draw Championship · Manche 2/);
  await expect(admin.getByRole('button',{name:'Ouvrir dans WhatsApp',exact:true})).toBeEnabled();
  await admin.unroute('**/api/admin/visibility/**');
  console.log('PASS: visibility interclub/BDC selection, provisional points, M1 limits, WhatsApp text preservation, Facebook copy, offline BDC, API authorization, CSRF and mobile. No message sent.');
}
