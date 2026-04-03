const { test, expect } = require('@playwright/test');

test.describe('Landing header menu', () => {
  test('desktop shows full nav and CTA', async ({ page }) => {
    await page.goto('/');

    const { width } = page.viewportSize() || { width: 0 };
    if (width < 900) {
      test.skip(true, 'Not a desktop viewport');
    }

    await expect(page.locator('#nav-toggle')).toBeHidden();

    const menu = page.locator('#landing-nav-menu');
    await expect(menu).toBeVisible();
    await expect(menu.getByRole('link', { name: 'Features' })).toBeVisible();
    await expect(menu.getByRole('link', { name: 'Get started free' })).toBeVisible();
  });

  test('mobile can open nav menu', async ({ page }) => {
    await page.goto('/');

    const { width } = page.viewportSize() || { width: 0 };
    if (width >= 900) {
      test.skip(true, 'Not a mobile viewport');
    }

    await expect(page.locator('#nav-toggle')).toBeVisible();

    // Menu is closed initially on mobile.
    const menu = page.locator('#landing-nav-menu');
    await expect(menu).not.toBeVisible();

    await page.click('#nav-toggle');
    await expect(menu.getByRole('link', { name: 'Features' })).toBeVisible();
    await expect(menu.getByRole('link', { name: 'Get started free' })).toBeVisible();
  });
});

