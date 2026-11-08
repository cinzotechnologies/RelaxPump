import { expect, test } from '@playwright/test';

const shot = (name: string, project: string) => `tests/visual/.results/shots/${name}-${project}.png`;

test('admin: login gate, dev sign-in, dashboard, sign out', async ({ page }, info) => {
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/admin\/login$/);
  await page.screenshot({ path: shot('admin-login', info.project.name) });

  await page.getByLabel('Email').fill('stranger@example.com');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.locator('.lerr')).toHaveText('This email is not on the admin list.');

  await page.getByLabel('Email').fill('cinzotechnologies@gmail.com');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole('heading', { name: 'Hello, CINZO' })).toBeVisible();
  await expect(page.getByText('Website sections')).toBeVisible();
  await expect(page.getByText('Online ordering')).toBeVisible();
  await page.screenshot({ path: shot('admin-dashboard', info.project.name), fullPage: true });

  await page.getByRole('link', { name: 'Hero text and image' }).click();
  await expect(page).toHaveURL(/\/admin\/website\?sec=hero/);

  await page.goto('/api/admin/signout');
  await expect(page).toHaveURL(/\/admin\/login$/);
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/admin\/login$/);
});
