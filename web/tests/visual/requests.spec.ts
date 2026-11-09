import { expect, type Page, test } from '@playwright/test';

// Uses RP_FAKE_FIREBASE=1 (playwright.config.ts): no real Firebase user is touched.
const shot = (name: string, project: string) => `tests/visual/.results/shots/${name}-${project}.png`;
const randPhone = (end = '') => {
  const body = `9${String(Math.floor(Math.random() * 1e9)).padStart(9, '0')}`;
  return end ? body.slice(0, 10 - end.length) + end : body;
};

async function signIn(page: Page) {
  await page.goto('/admin/login');
  await page.getByLabel('Email').fill('cinzotechnologies@gmail.com');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

test('public API checks the input', async ({ request }) => {
  const bad = await request.post('/api/reset-requests', { data: { name: '', phone: '98' } });
  expect(bad.status()).toBe(400);
  const badPhone = await request.post('/api/reset-requests', { data: { name: 'Lal', phone: '12345' } });
  expect((await badPhone.json()).error).toContain('10-digit');
});

test('forgot password: request → new password → WhatsApp → done', async ({ page, request }, info) => {
  test.setTimeout(120_000);
  test.skip(info.project.name !== 'desktop', 'round trip runs once');
  const phone = randPhone();
  const r = await request.post('/api/reset-requests', {
    data: { name: 'Test Ruati', phone: `+91 ${phone}` },
  });
  expect(r.status()).toBe(201);
  expect((await r.json()).message).toBe('We will send your new password on WhatsApp.');
  // a repeat does not add a second row
  expect((await request.post('/api/reset-requests', { data: { name: 'Test Ruati', phone } })).status()).toBe(
    201,
  );

  await signIn(page);
  await page.goto('/admin/requests');
  await page.waitForLoadState('networkidle');
  const row = page.getByRole('button', {
    name: new RegExp(`Test Ruati.*${phone.slice(0, 5)} ${phone.slice(5)}`),
  });
  await expect(row).toHaveCount(1);
  await row.click();

  await expect(page.getByRole('button', { name: 'Open WhatsApp' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Mark as done' })).toBeDisabled();
  await page.getByRole('button', { name: 'Generate' }).click();
  const pw = await page.getByLabel('New password').inputValue();
  expect(pw).toMatch(/^[A-HJ-NP-Za-km-z2-9]{8}$/);
  await page.getByRole('button', { name: 'Save new password' }).click();
  // first call compiles the route in dev — wait for the lasting state, not the 2.4 s toast
  await expect(page.getByRole('button', { name: 'Password saved' })).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.amsg')).toContainText(`New password: ${pw}`);

  const wa = page.getByRole('link', { name: 'Open WhatsApp' });
  const href = await wa.getAttribute('href');
  expect(href).toContain(`https://wa.me/91${phone}?text=`);
  expect(decodeURIComponent(href!.split('text=')[1])).toContain(`New password: ${pw}`);
  await page.screenshot({ path: shot('admin-requests', info.project.name), fullPage: true });

  await page.getByRole('button', { name: 'Mark as done' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Test Ruati marked as done' })).toBeVisible();
  await page.getByRole('tab', { name: /^Done/ }).click();
  await expect(
    page.getByRole('button', { name: new RegExp(`Test Ruati.*${phone.slice(0, 5)}`) }),
  ).toBeVisible();

  // after reload it stays done, with who did it
  await page.reload();
  await expect(page.getByText(/Done by cinzotechnologies@gmail\.com/)).toBeVisible();
});

test('a phone with no account can be closed', async ({ page, request }, info) => {
  test.setTimeout(120_000);
  test.skip(info.project.name !== 'desktop', 'round trip runs once');
  const phone = randPhone('0000'); // fake Firebase: no account
  expect((await request.post('/api/reset-requests', { data: { name: 'No Account', phone } })).status()).toBe(
    201,
  );
  await signIn(page);
  await page.goto('/admin/requests');
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: new RegExp(`No Account.*${phone.slice(0, 5)}`) }).click();
  await page.getByLabel('New password').fill('Ab3dEf7h');
  await page.getByRole('button', { name: 'Save new password' }).click();
  await expect(page.locator('.aerr')).toContainText('No RelaxPump account uses this phone number.', {
    timeout: 30_000,
  });
  await expect(page.getByRole('button', { name: 'Open WhatsApp' })).toBeDisabled();
  await page.getByRole('button', { name: 'Mark as done' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'No Account marked as done' })).toBeVisible();
});

test('requests page on phone', async ({ page }, info) => {
  await signIn(page);
  await page.goto('/admin/requests');
  await expect(page.getByRole('tab', { name: /^Waiting/ })).toBeVisible();
  await page.screenshot({ path: shot('admin-requests-list', info.project.name), fullPage: true });
});

test('admin reset APIs need sign-in', async ({ request }) => {
  const r = await request.post('/api/admin/reset-requests/x/password', {
    headers: { origin: 'http://localhost:3000' },
    data: { password: 'Ab3dEf7h' },
  });
  expect(r.status()).toBe(401);
});
