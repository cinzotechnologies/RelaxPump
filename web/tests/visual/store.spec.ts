import { expect, test } from '@playwright/test';

const shot = (name: string, project: string) => `tests/visual/.results/shots/${name}-${project}.png`;

test('store page screenshot', async ({ page }, info) => {
  await page.goto('/store');
  await page.waitForLoadState('networkidle');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.screenshot({ path: shot('store', info.project.name), fullPage: true });
});

test('categories filter the grid', async ({ page }) => {
  await page.goto('/store');
  await expect(page.locator('.shop-list article.pc')).toHaveCount(5);
  await page.getByRole('tab', { name: 'Add-ons' }).click();
  await expect(page.locator('.shop-list article.pc')).toHaveCount(3);
  await expect(page.getByText('Not sure what you need?')).toHaveCount(0);
  await page.getByRole('tab', { name: 'Service' }).click();
  await expect(page.locator('.shop-list article.pc')).toHaveCount(1);
  await expect(page.getByText('Not sure what you need?')).toBeVisible();
});

test('add to cart, stepper, drawer, checkout (ordering closed), cart survives reload', async ({
  page,
}, info) => {
  await page.goto('/store');
  await page.getByRole('button', { name: 'Add to cart' }).first().click();
  await page.getByRole('button', { name: 'Add one' }).first().click();
  await expect(page.locator('.cnt')).toHaveText('2');

  await page.reload();
  await expect(page.locator('.cnt')).toHaveText('2');

  await page.getByRole('button', { name: /Open cart/ }).click();
  const drawer = page.getByRole('complementary', { name: 'Cart' });
  await expect(drawer).toHaveClass(/open/);
  await expect(drawer.getByText('RelaxPump Controller Kit')).toBeVisible();
  await page.waitForTimeout(600);
  await page.screenshot({ path: shot('cart', info.project.name) });

  await drawer.getByRole('button', { name: 'Checkout' }).click();
  await expect(drawer.getByRole('heading', { name: 'Checkout' })).toBeVisible();
  await expect(drawer.getByRole('button', { name: 'Place order — opens soon' })).toBeDisabled();
  await drawer.getByText('UPI').click();
  await expect(drawer.locator('label.pay.on')).toHaveText('UPI');
  await page.screenshot({ path: shot('checkout', info.project.name) });

  await page.keyboard.press('Escape');
  await expect(page.locator('aside.drawer')).not.toHaveClass(/open/);
});

test('empty cart shows browse button', async ({ page }) => {
  await page.goto('/store');
  await page.getByRole('button', { name: /Open cart/ }).click();
  await expect(page.getByText('Your cart is empty')).toBeVisible();
  await page.getByRole('button', { name: 'Browse products' }).click();
  await expect(page.locator('aside.drawer')).not.toHaveClass(/open/);
});
