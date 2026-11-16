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
  await expect(page.locator('.shop-list article.pc')).toHaveCount(9);
  await page.getByRole('tab', { name: 'Add-ons' }).click();
  await expect(page.locator('.shop-list article.pc')).toHaveCount(2);
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
  await expect(drawer.getByText('Household Controller')).toBeVisible();
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

test('plan your kit: Household, PHE only, Both; the kit goes into the cart', async ({ page }, info) => {
  await page.goto('/store');
  await page.getByRole('link', { name: 'Plan your kit' }).click();
  const plan = page.locator('#plan');
  // Household (default): pump options, Tank Kit × 3
  await expect(plan.locator('.po')).toHaveCount(4);
  await expect(plan.locator('.kr').filter({ hasText: 'Tank Kit' }).locator('.kq')).toHaveText('× 3');
  await page.getByRole('button', { name: 'One less tank' }).click();
  await page.getByRole('button', { name: 'One less tank' }).click();
  // one tank: a Level Sensor instead of a Tank Kit
  await expect(plan.locator('.kr').filter({ hasText: 'Level Sensor' })).toBeVisible();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await plan.screenshot({ path: shot('plan-household', info.project.name) });

  // PHE only: no pump
  await plan.getByRole('button', { name: 'PHE lines', exact: true }).click();
  await expect(plan.locator('.rcard').filter({ hasText: 'Pump' })).toContainText('None');
  await expect(plan.locator('.po')).toHaveCount(0);
  await page.getByRole('button', { name: 'One more PHE line' }).click();
  await expect(plan.locator('.kr').filter({ hasText: 'PHE Line Kit' }).locator('.kq')).toHaveText('× 3');
  await plan.screenshot({ path: shot('plan-phe', info.project.name) });

  // Both → everything into the cart
  await plan.getByRole('button', { name: 'Both' }).click();
  await expect(plan.locator('.kr')).toHaveCount(5);
  await page.getByRole('button', { name: 'Add this kit to cart' }).click();
  const drawer = page.getByRole('complementary', { name: 'Cart' });
  await expect(drawer).toHaveClass(/open/);
  for (const n of ['Household Controller', 'Level Sensor', 'Pump Kit', 'PHE Controller', 'PHE Line Kit'])
    await expect(drawer.getByText(n)).toBeVisible();
  await expect(page.locator('.cnt')).toHaveText(String(1 + 1 + 1 + 1 + 3));
});
