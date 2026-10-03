import { expect } from '@playwright/test';

/** Real Next/React page on a disposable fixture, imported synthetic board; no physical camera. */
export async function testVisionCalibration(page, screenshot) {
  await page.setViewportSize({ width: 390, height: 844 });
  const writes = [], errors = [];
  const onRequest = request => { if (['POST','PUT','PATCH','DELETE'].includes(request.method()) && /\/api\//.test(request.url())) writes.push(request.url()); };
  const onError = error => errors.push(error.message);
  page.on('request', onRequest); page.on('pageerror', onError);
  try {
    await page.goto('http://127.0.0.1:3008/admin/vision');
    await expect(page.getByRole('heading', { name: 'Laboratoire de vision', exact: true })).toBeVisible();
    const image = await page.evaluate(() => {
      const canvas = document.createElement('canvas'); canvas.width = 800; canvas.height = 800;
      const ctx = canvas.getContext('2d'); ctx.fillStyle = '#1a1a1a'; ctx.fillRect(0, 0, 800, 800);
      for (let i = 0; i < 20; i++) {
        const a = -Math.PI / 2 + (i - .5) * Math.PI / 10;
        ctx.fillStyle = i % 2 ? '#dfd8b8' : '#333333'; ctx.beginPath(); ctx.moveTo(400,400); ctx.arc(400,400,280,a,a+Math.PI/10); ctx.closePath(); ctx.fill();
      }
      ctx.strokeStyle = '#aaaaaa'; ctx.lineWidth = 2;
      for (const r of [280, 280*162/170, 280*107/170, 280*99/170, 280*15.9/170, 280*6.35/170]) { ctx.beginPath(); ctx.arc(400,400,r,0,Math.PI*2); ctx.stroke(); }
      return canvas.toDataURL('image/png').split(',')[1];
    });
    await page.getByText('Tester avec deux images, sans caméra', { exact: true }).click();
    await page.getByLabel('Image AVANT', { exact: true }).setInputFiles({ name:'board.png', mimeType:'image/png', buffer: Buffer.from(image,'base64') });
    const launch = page.getByRole('button', { name:'Calibrer en grand · zoom et loupe', exact:true });
    await expect(launch).toBeEnabled(); await launch.click();
    const dialog = page.getByRole('dialog', { name:'Calibration guidée' });
    await expect(dialog).toBeVisible();
    const surface = dialog.getByRole('button', { name:/^Positionner le repère/ });
    const apply = dialog.getByRole('button', { name:'Appliquer la calibration', exact:true });
    async function tap(x,y) {
      const box = await surface.boundingBox();
      await surface.click({ position:{ x:box.width*x, y:box.height*y } });
    }
    await expect(apply).toBeDisabled();
    await tap(.5,.15);
    await expect(dialog.getByRole('button',{name:'Confirmer le point 20',exact:true})).toBeEnabled();
    await expect(dialog.locator('nav button[aria-current]')).toContainText('20');
    const x = Number(await surface.locator('circle').first().getAttribute('cx'));
    await dialog.getByRole('button',{name:'Déplacer le point vers la droite',exact:true}).click();
    expect(Number(await surface.locator('circle').first().getAttribute('cx'))-x).toBeCloseTo(1000/800,5);
    await dialog.getByRole('button',{name:'Déplacer le point vers la gauche',exact:true}).click();
    await dialog.getByRole('button',{name:'Zoom ×2',exact:true}).click();
    await expect(dialog.getByRole('button',{name:'Zoom ×2',exact:true})).toHaveAttribute('aria-pressed','true');
    await expect(dialog.locator('canvas[aria-label]')).toBeVisible();
    await dialog.getByRole('button',{name:'Confirmer le point 20',exact:true}).click();
    for (const [label,px,py] of [['6',.85,.5],['3',.5,.85],['11',.15,.5],['Bull',.7,.7]]) {
      await tap(px,py); await dialog.getByRole('button',{name:'Confirmer le point '+label,exact:true}).click();
    }
    await expect(dialog.getByRole('alert')).toContainText('Bull'); await expect(apply).toBeDisabled();
    await expect(surface.locator('circle')).toHaveCount(5);
    await tap(.5,.5); await dialog.getByRole('button',{name:'Confirmer le point Bull',exact:true}).click();
    await expect(dialog.getByText('Dernière vérification',{exact:true})).toBeVisible();
    await expect(surface.locator('path')).toHaveCount(26);
    await expect(apply).toBeDisabled();
    // Revisit and adjust one confirmed point without discarding any other point.
    await dialog.locator('nav button').nth(1).click();
    await dialog.getByRole('button',{name:'Déplacer le point vers la droite',exact:true}).click();
    await expect(dialog.getByText(/4\/5 confirmés/)).toBeVisible();
    await dialog.getByRole('button',{name:'Déplacer le point vers la gauche',exact:true}).click();
    await dialog.getByRole('button',{name:'Confirmer le point 6',exact:true}).click();
    await dialog.getByLabel('La grille suit les fils de ma cible.',{exact:true}).check();
    await expect(apply).toBeEnabled();
    expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth+1)).toBe(true);
    await screenshot(page,'vision-calibration-mobile.png',{fullPage:false});
    await apply.click(); await expect(dialog).toHaveCount(0);
    await expect(page.getByLabel('Les anneaux et secteurs se superposent correctement aux fils réels.',{exact:true})).toBeChecked();
    const parentImage = page.locator('canvas[aria-label="Image de référence : placez les repères"]').locator('..');
    const snapshot = await parentImage.locator('svg circle').evaluateAll(nodes => nodes.map(n => [n.getAttribute('cx'),n.getAttribute('cy')]));
    // Cancelled edits must not leak back to the live calibration.
    await launch.click(); await dialog.locator('nav button').nth(1).click(); await tap(.7,.4);
    await dialog.getByRole('button',{name:'Fermer sans appliquer',exact:true}).click();
    expect(await parentImage.locator('svg circle').evaluateAll(nodes => nodes.map(n => [n.getAttribute('cx'),n.getAttribute('cy')]))).toEqual(snapshot);
    await launch.click(); await expect(surface.locator('circle')).toHaveCount(5);
    await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0);
    expect(await page.evaluate(() => document.body.style.overflow)).not.toBe('hidden');
    expect(writes).toEqual([]); expect(errors).toEqual([]);
    console.log('PASS vision calibration: mobile dialog, zoom, loupe, one-pixel nudges, explicit confirmation, rejected Bull, single-point correction, atomic apply, cancel, Escape, zero API writes.');
  } finally {
    page.off('request',onRequest); page.off('pageerror',onError);
    await page.setViewportSize({width:1440,height:1100});
  }
}
