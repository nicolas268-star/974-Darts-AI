import {expect} from '@playwright/test';

// Runs within the isolated workflow auth fixture. All outgoing sharing is intercepted.
export async function testVisibility(admin, director, screenshot) {
  const origin='http://127.0.0.1:3008';
  const id='f678a113-699e-496e-ae0a-944d37d25893';
  const evening={id,round:'J1',date:'2026-09-28',home:'Kaz A Darts - A',away:'Kaz A Darts - B',home_score:17,away_score:3};
  const summary={whatsapp:'🎯 Kaz A Darts - A 17–3 Kaz A Darts - B\n45 legs · 10 joueurs\nPlus haut finish : Emmanuel GRASSET, 88.',facebook:'🎯 J1 · Kaz A Darts - A 17–3 Kaz A Darts - B\nBravo aux deux équipes !',mode:'statistics',note:'Résumé statistique prêt.',ai_available:true,fingerprint:'fixture',evening:{url:`https://974darts.re/matches/${id}`,matches:20,legs:45,players:10}};
  let generated=0;
  await admin.route('**/api/admin/visibility/**',async route=>{
    const url=new URL(route.request().url());
    if(url.pathname.endsWith('/evenings'))return route.fulfill({json:{evenings:[evening],ai_available:true}});
    if(route.request().method()==='POST'){
      expect(route.request().postDataJSON()).toEqual({result_id:id});generated++;
      return route.fulfill({json:{...summary,mode:'ai',note:'Analyse éditoriale IA : faits vérifiés.'}});
    }
    return route.fulfill({json:summary});
  });
  await admin.goto(origin+'/admin/visibility');
  await expect(admin.getByLabel('Texte pour le groupe',{exact:false})).toHaveValue(summary.whatsapp,{timeout:30000});
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
  expect(new URL(shared[0]).searchParams.get('text')).toBe(summary.whatsapp);
  const edited='Mon résumé modifié pour le groupe 🎯';
  await admin.locator('#whatsapp-draft').fill(edited);
  await admin.getByRole('button',{name:'Préparer la version Facebook'}).click();
  await expect(admin.locator('#facebook-draft')).toHaveValue(summary.facebook);
  await expect(admin.locator('#whatsapp-draft')).toHaveValue(edited);
  await admin.getByRole('button',{name:'Ouvrir dans WhatsApp',exact:true}).click();
  expect(generated).toBe(1);
  shared=await admin.evaluate(()=>window.__visibilityShares);
  expect(new URL(shared[1]).searchParams.get('text')).toBe(edited);
  await admin.getByRole('button',{name:'Copier et ouvrir Facebook'}).click();
  await expect(admin.getByText('Texte copié. Colle-le dans ta publication Facebook, puis publie depuis ton compte.')).toBeVisible();
  expect(await admin.evaluate(()=>window.__visibilityCopied)).toBe(summary.facebook);
  expect(await admin.evaluate(()=>window.__visibilityShares.at(-1))).toBe('https://www.facebook.com/');
  await screenshot(admin,'06-visibilite.png');
  await admin.setViewportSize({width:390,height:844});
  await screenshot(admin,'07-visibilite-mobile.png');
  const overflow=await admin.evaluate(()=>({
    width:window.innerWidth,scrollWidth:document.documentElement.scrollWidth,
    elements:[...document.querySelectorAll('main *')].filter(el=>el.getBoundingClientRect().right>window.innerWidth).map(el=>({tag:el.tagName,className:el.className})),
  }));
  expect(overflow.scrollWidth,JSON.stringify(overflow)).toBeLessThanOrEqual(overflow.width);
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
  await admin.unroute('**/api/admin/visibility/**');
  console.log('PASS: visibility summary, AI selection, WhatsApp text preservation, Facebook copy, API authorization, CSRF and mobile. No message sent.');
}
