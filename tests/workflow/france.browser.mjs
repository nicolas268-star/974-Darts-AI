import { expect as baseExpect } from '@playwright/test';
const expect = baseExpect.configure({ timeout: 30000 });

export async function testFrance(browser, admin, screenshot) {
  const visitor = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await visitor.newPage();
  try {
    // Compile the new shared CSS/routes before attaching the development HMR client.
    await page.request.get('http://127.0.0.1:3008/comites/france/fixture-1');
    await page.request.get('http://127.0.0.1:3008/comites/france');
    await admin.request.get('http://127.0.0.1:3008/admin/comites-france');
    await admin.request.get('http://127.0.0.1:3008/api/admin/comites-france');
    await page.goto('http://127.0.0.1:3008/comites/france');
    await expect(page.getByRole('heading', { name: 'Les comités, partout en France.' })).toBeVisible();
    await expect(page.locator('main article')).toHaveCount(9);
    expect(await page.content()).not.toMatch(/Observation privée fictive|PRIVATE_RAW_MUST_NOT_LEAK/);
    await page.getByRole('button', { name: 'Suivants →' }).click();
    await expect(page.locator('main article')).toHaveCount(2);
    await page.getByRole('searchbox', { name: 'Rechercher un comité' }).fill('demonstration 01');
    await expect(page.locator('main article')).toHaveCount(1);
    await page.getByRole('link', { name: 'Voir la fiche' }).click();
    await expect(page.getByRole('heading', { name: 'Aucun rattachement confirmé pour le moment' })).toBeVisible();
    const protectedPage = await page.request.get('http://127.0.0.1:3008/admin/comites-france', { maxRedirects: 0 });
    expect(protectedPage.status()).toBe(307);
    expect(protectedPage.headers().location).toMatch(/\/login/);
    const denied = await page.request.post('http://127.0.0.1:3008/api/admin/comites-france', { data: {} });
    expect(denied.status()).toBe(401);

    await admin.goto('http://127.0.0.1:3008/admin/comites-france');
    await expect(admin.getByRole('heading', { name: 'Des pistes à confirmer.' })).toBeVisible();
    await expect(admin.getByRole('button', { name: 'Examiner', exact: true })).toHaveCount(2);
    expect(await admin.content()).not.toContain('PRIVATE_RAW_MUST_NOT_LEAK');
    await admin.getByRole('button', { name: 'Examiner', exact: true }).first().click();
    await admin.getByRole('combobox', { name: /^Décision/ }).selectOption('REJECTED');
    await admin.getByLabel('Justification de la décision').fill('Test isolé : organisme incorrect.');
    await admin.getByRole('checkbox').last().check();
    await admin.getByRole('button', { name: 'Enregistrer la décision' }).click();
    await expect(admin.getByRole('button', { name: 'Examiner', exact: true })).toHaveCount(1);
    await admin.getByRole('button', { name: 'Examiner', exact: true }).click();
    await admin.getByRole('combobox', { name: /^Décision/ }).selectOption('VERIFIED');
    await admin.getByLabel('Justification de la décision').fill('Test isolé : source officielle visant cette compétition.');
    await admin.getByLabel('Source fiable confirmant').fill('https://example.test/proof');
    await admin.getByRole('checkbox').last().check();
    await admin.getByRole('button', { name: 'Enregistrer la décision' }).click();
    await expect(admin.getByText('Aucun élément pour ces filtres.')).toBeVisible();
    await page.goto('http://127.0.0.1:3008/comites/france/fixture-1');
    await expect(page.getByRole('heading', { name: 'Observation privée fictive 2' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Observation privée fictive 1' })).toHaveCount(0);
    await admin.getByRole('button', { name: 'Observations', exact: true }).click();
    await expect(admin.locator('main tbody tr')).toHaveCount(2);
    await admin.getByRole('button', { name: 'Organismes', exact: true }).click();
    await expect(admin.locator('main article')).toHaveCount(11);
    await admin.getByRole('button', { name: 'Historique des imports', exact: true }).click();
    await expect(admin.getByText('Aucune exécution enregistrée.')).toBeVisible();
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto('http://127.0.0.1:3008/comites/france');
      await expect(page.getByRole('heading', { name: 'Les comités, partout en France.' })).toBeVisible();
      // Exercise hydrated controls before screenshots temporarily hide input carets.
      await page.getByRole('button', { name: 'Suivants →' }).click();
      await expect(page.locator('main article')).toHaveCount(2);
      await page.getByRole('button', { name: '← Précédents' }).click();
      await expect(page.locator('main article')).toHaveCount(9);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
      if (width === 390 || width === 1440) await screenshot(page, `france-public-${width}.png`);
    }
    await admin.setViewportSize({ width: 390, height: 1000 });
    await admin.getByRole('button', { name: 'Observations', exact: true }).click();
    expect(await admin.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await screenshot(admin, 'france-admin-mobile.png');
    await admin.setViewportSize({ width: 1440, height: 1100 });
    console.log('PASS France browser: search, pagination, public/private isolation, access control, rejection, evidence validation, publication, admin tabs and responsive widths.');
  } catch (error) {
    console.error('France visitor failure:', page.url(), await page.locator('main').innerText().catch(() => 'No main'));
    console.error('France admin failure:', admin.url(), await admin.locator('main').innerText().catch(() => 'No main'));
    await screenshot(page, 'france-failure.png');
    await screenshot(admin, 'france-admin-failure.png');
    throw error;
  } finally { await visitor.close(); }
}
