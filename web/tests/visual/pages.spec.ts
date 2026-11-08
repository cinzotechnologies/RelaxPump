import { expect, test } from '@playwright/test';

// Full-page screenshots for side-by-side review with reference/website/*.dc.html.
// Saved to tests/visual/.results/shots/ (git-ignored).
const shot = (name: string, project: string) => `tests/visual/.results/shots/${name}-${project}.png`;

test('home', async ({ page }, info) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.screenshot({ path: shot('home', info.project.name), fullPage: true });
});

test('phone menu opens', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone');
  await page.goto('/');
  await page.getByRole('button', { name: 'Open menu' }).click();
  await expect(page.locator('#mobile-menu')).toHaveClass(/open/);
  await page.waitForTimeout(400);
  await page.screenshot({ path: shot('menu', info.project.name) });
});
