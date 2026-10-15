import {expect} from '@playwright/test';

// Real UI, FastAPI and PostgreSQL commands in the loopback-only fixture.
export async function testOptionalDsReview(admin, ds, screenshot) {
  const endpoint = 'http://127.0.0.1:3008/api/ranking-workflow/events/demo-double';
  const read = async () => (await admin.request.get(endpoint)).json();
  const before = await read();
  await admin.getByRole('button',{name:'Corriger / compléter'}).click();
  await admin.getByLabel('Motif de la modification').fill('Nouvelle version pour vérifier la relecture facultative.');
  await admin.getByRole('button',{name:'Enregistrer une nouvelle version'}).click();
  await expect(admin.getByText('À contrôler · v4',{exact:true})).toBeVisible();
  await expect(admin.getByTestId('ds-review')).toContainText('Non revu par le DS');
  await admin.getByLabel('Je confirme avoir contrôlé cette version et son impact sur le classement.').check();
  await expect(admin.getByRole('button',{name:'Valider le contrôle final'})).toBeEnabled();
  await admin.getByRole('button',{name:'Valider le contrôle final'}).click();
  await expect(admin.getByText('Prêt à publier · v4',{exact:true})).toBeVisible();
  await admin.getByLabel('Je confirme avoir contrôlé cette version et son impact sur le classement.').check();
  await admin.getByRole('button',{name:'Publier et mettre à jour le classement'}).click();
  await expect(admin.getByText('Publié · v4',{exact:true})).toBeVisible();
  await expect(admin.getByTestId('ds-review')).toContainText('Non revu par le DS');
  const published = await read();
  expect(published.revision.ds_review.status).toBe('NOT_REVIEWED');
  expect(published.decisions.filter(d=>d.action==='APPROVE_DS')).toEqual(before.decisions.filter(d=>d.action==='APPROVE_DS'));
  await ds.getByRole('button',{name:'Actualiser',exact:true}).click();
  await expect(ds.getByText('Publié · v4',{exact:true})).toBeVisible();
  await ds.getByLabel('Je confirme avoir contrôlé les résultats et le classement de cette compétition.').check();
  await ds.getByRole('button',{name:'Valider les résultats · v4'}).click();
  await expect(ds.getByText('Publié · v4',{exact:true})).toBeVisible();
  await expect(ds.getByTestId('ds-review')).toContainText('Validé par le DS');
  const late = await read();
  expect(late.event.published_revision_id).toBe(published.event.published_revision_id);
  expect(late.notifications).toEqual(published.notifications);
  expect(late.decisions.filter(d=>d.action==='PUBLISH')).toEqual(published.decisions.filter(d=>d.action==='PUBLISH'));
  await screenshot(ds,'06-ds-review-after-publication.png');
  // The Admin can also publish with no assigned DS account.
  await admin.getByRole('button',{name:'Actualiser',exact:true}).click();
  await admin.getByRole('button',{name:'Corriger / compléter'}).click();
  await admin.getByLabel('Directeur sportif assigné (facultatif)').selectOption('');
  await admin.getByLabel('Motif de la modification').fill('Vérification sans compte DS affecté.');
  await admin.getByRole('button',{name:'Enregistrer une nouvelle version'}).click();
  await expect(admin.getByText('À contrôler · v5',{exact:true})).toBeVisible();
  await admin.getByLabel('Je confirme avoir contrôlé cette version et son impact sur le classement.').check();
  await expect(admin.getByRole('button',{name:'Valider le contrôle final'})).toBeEnabled();
  await admin.getByRole('button',{name:'Valider le contrôle final'}).click();
  await expect(admin.getByText('Prêt à publier · v5',{exact:true})).toBeVisible();
  await admin.getByLabel('Je confirme avoir contrôlé cette version et son impact sur le classement.').check();
  await admin.getByRole('button',{name:'Publier et mettre à jour le classement'}).click();
  await expect(admin.getByText('Publié · v5',{exact:true})).toBeVisible();
  await expect(admin.getByTestId('ds-review')).toContainText('Non revu par le DS');
  await screenshot(admin,'07-admin-published-without-ds.png');
  await admin.getByRole('button',{name:'Compétitions',exact:true}).click();
  await expect(admin.locator('article').filter({hasText:'Validées par le DS'}).locator('strong')).toHaveText('0');
  await admin.getByRole('button',{name:'Non relues',exact:true}).click();
  await expect(admin.getByText('Open Club Double · Démonstration',{exact:true})).toBeVisible();
  console.log('PASS: UI publication without DS, late review without email/republication, new revision without inherited validation, publication without assigned DS.');
}
