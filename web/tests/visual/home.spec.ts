import { expect, test } from '@playwright/test';

// Behaviour of the interactive home sections (docs/website-brief.md §2).

test('how it works: next arrow and tabs switch slides', async ({ page }) => {
  await page.goto('/');
  const slides = page.locator('#how .ft');
  await expect(slides.nth(0)).toHaveClass(/\bon\b/);
  await page.locator('#how').getByRole('button', { name: 'Next' }).click();
  await expect(slides.nth(1)).toHaveClass(/\bon\b/);
  await page.locator('#how').getByRole('tab').nth(3).click();
  await expect(slides.nth(3)).toHaveClass(/\bon\b/);
});

test('app screens: chips move the coverflow', async ({ page }) => {
  await page.goto('/');
  await page.locator('#app').getByRole('tab', { name: 'Usage' }).click();
  await expect(page.locator('#app .cfc').nth(3)).toHaveClass(/\bp0\b/);
  await expect(page.locator('#app .cap-t')).toHaveText('Usage');
});

test('install guide: play says video coming soon', async ({ page }) => {
  await page.goto('/');
  await page.locator('#guide').getByRole('button', { name: /Mount the sensors/ }).click();
  await expect(page.locator('#guide .ptitle')).toHaveText('Mount the sensors');
  await page.locator('#guide').getByRole('button', { name: 'Play video' }).click();
  await expect(page.getByRole('status')).toHaveText('Video coming soon');
});

test('manual: next turns a page', async ({ page }, info) => {
  await page.goto('/');
  await page.locator('#manual').getByRole('button', { name: 'Next page', exact: true }).last().click();
  if (info.project.name === 'desktop') {
    await expect(page.locator('#manual .leaf').first()).toHaveClass(/turned/);
    await expect(page.locator('#manual .donly')).toHaveText('Pages 1–2 of 10');
  } else {
    await expect(page.locator('#manual .mleaf').first()).toHaveClass(/turned/);
    await expect(page.locator('#manual .monly')).toHaveText('2 / 14');
  }
});

test('store teaser: notify me toggles', async ({ page }) => {
  await page.goto('/');
  const b = page.locator('#store').getByRole('button', { name: 'Notify me' }).first();
  await b.click();
  await expect(page.locator('#store').getByRole('button', { name: 'We will tell you' })).toHaveCount(1);
});
