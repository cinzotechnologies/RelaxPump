import { expect, type Page, test } from '@playwright/test';

const shot = (name: string, project: string) => `tests/visual/.results/shots/${name}-${project}.png`;

async function signIn(page: Page) {
  await page.goto('/admin/login');
  await page.getByLabel('Email').fill('cinzotechnologies@gmail.com');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

// 1×1 PNG
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

test('website editor: draft, preview, publish, put back', async ({ page }, info) => {
  test.setTimeout(120_000);
  await signIn(page);
  await page.goto('/admin/website?sec=hero');
  await expect(page.getByRole('heading', { name: 'Website content' })).toBeVisible();
  await page.screenshot({ path: shot('admin-website', info.project.name), fullPage: true });
  // the editor changes the shared local D1 — only one project does the round trip
  test.skip(info.project.name !== 'desktop', 'round trip runs once');

  await page.waitForLoadState('networkidle'); // hydrated before typing
  const title = page.getByLabel('Heading (line 1)');
  const original = 'Smart water tank'; // the design copy
  const temp = `Smart tank ${Date.now()}`;
  await title.fill(temp);
  await expect(page.getByText('Unpublished changes')).toBeVisible();
  await expect(page.getByText('Saving draft…')).toBeHidden({ timeout: 10_000 });

  // the live site is unchanged; preview shows the draft
  await page.goto('/');
  await expect(page.locator('.hero h1, h1').first()).not.toContainText(temp);
  await page.goto('/api/admin/preview?to=/');
  await expect(page.getByText('Preview — unpublished changes are shown.')).toBeVisible();
  await expect(page.locator('h1').first()).toContainText(temp);
  await page.getByRole('link', { name: 'Exit preview' }).click();
  await expect(page.getByText('Preview — unpublished changes are shown.')).toBeHidden();

  // publish → live
  await page.goto('/admin/website?sec=hero');
  await expect(page.getByLabel('Heading (line 1)')).toHaveValue(temp);
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: 'Publish' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Published to the website' })).toBeVisible();
  await page.goto('/');
  await expect(page.locator('h1').first()).toContainText(temp);

  // put it back and publish again
  await page.goto('/admin/website?sec=hero');
  await page.waitForLoadState('networkidle');
  await page.getByLabel('Heading (line 1)').fill(original);
  await expect(page.getByText('Saving draft…')).toBeHidden({ timeout: 10_000 });
  await page.getByRole('button', { name: 'Publish' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Published to the website' })).toBeVisible();
  await expect(page.getByText('Unpublished changes')).toBeHidden();

  // a bad link is refused and nothing is saved
  await page.getByRole('tab', { name: 'App download' }).click();
  await page.getByLabel('Google Play link').fill('javascript:alert(1)');
  await expect(page.getByRole('status').filter({ hasText: 'Use a full https:// link' })).toBeVisible({
    timeout: 10_000,
  });
  page.once('dialog', (d) => void d.accept());
  await page.getByRole('button', { name: 'Discard' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Changes discarded' })).toBeVisible();
  await expect(page.getByLabel('Google Play link')).toHaveValue(/^https:\/\/play\.google\.com/);
});

test('media: upload, shown in the grid, delete', async ({ page }, info) => {
  await signIn(page);
  await page.goto('/admin/media');
  await page.waitForLoadState('networkidle');
  await expect(page.getByRole('heading', { name: 'Images, videos and PDFs' })).toBeVisible();
  test.skip(info.project.name !== 'desktop', 'round trip runs once');

  await page
    .locator('.aupl input[type=file]')
    .setInputFiles({ name: 'Test Dot.png', mimeType: 'image/png', buffer: PNG });
  await expect(page.getByRole('status').filter({ hasText: 'Uploaded Test Dot.png' })).toBeVisible();
  const tile = page.locator('.amt', { hasText: 'Test Dot.png' }).first();
  await expect(tile).toContainText('Not used yet');
  const src = await tile.locator('img').getAttribute('src');
  expect(src).toMatch(/^\/media\/\d{4}\/\d{2}\/[0-9a-f]{8}-test-dot\.png$/);
  const r = await page.request.get(src!);
  expect(r.status()).toBe(200);
  expect(r.headers()['content-type']).toBe('image/png');
  await page.screenshot({ path: shot('admin-media', info.project.name), fullPage: true });

  // a script file is refused
  await page
    .locator('.aupl input[type=file]')
    .setInputFiles({ name: 'x.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg/>') });
  await expect(page.getByRole('status').filter({ hasText: 'x.svg:' })).toBeVisible();

  page.once('dialog', (d) => void d.accept());
  await tile.getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Deleted Test Dot.png' })).toBeVisible();
  expect((await page.request.get(src!)).status()).toBe(404);
});

test('admin APIs refuse cross-site and signed-out calls', async ({ request }) => {
  const r1 = await request.post('/api/admin/publish', { headers: { origin: 'https://evil.example' } });
  expect(r1.status()).toBe(403);
  const r2 = await request.post('/api/admin/publish', { headers: { origin: 'http://localhost:3000' } });
  expect(r2.status()).toBe(401);
  const r3 = await request.get('/api/admin/preview?to=/');
  expect(r3.status()).toBe(401);
});
