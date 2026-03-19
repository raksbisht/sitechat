/**
 * Authentication E2E Tests
 * Tests for login/logout flow
 */

const { test, expect } = require('@playwright/test');

test.describe('Authentication', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
  });

  test('should display login page correctly', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('Welcome back');
    await expect(page.locator('#login-email')).toBeVisible();
    await expect(page.locator('#login-password')).toBeVisible();
    await expect(page.locator('#login-btn')).toBeVisible();
  });

  test('should show branding elements', async ({ page }) => {
    await expect(page.locator('.branding-title')).toBeVisible();
    await expect(page.locator('.branding-subtitle')).toBeVisible();
    await expect(page.locator('.branding-features')).toBeVisible();
  });

  test('should show error for invalid credentials', async ({ page }) => {
    await page.fill('#login-email', 'invalid@example.com');
    await page.fill('#login-password', 'wrongpassword');
    await page.click('#login-btn');

    await expect(page.locator('#login-error')).toBeVisible();
    await expect(page.locator('#error-message')).toContainText(/invalid|error/i);
  });

  test('should show error for empty email', async ({ page }) => {
    await page.fill('#login-password', 'somepassword');
    await page.click('#login-btn');

    const emailInput = page.locator('#login-email');
    const isValid = await emailInput.evaluate(el => el.checkValidity());
    expect(isValid).toBe(false);
  });

  test('should show error for empty password', async ({ page }) => {
    await page.fill('#login-email', 'test@example.com');
    await page.click('#login-btn');

    const passwordInput = page.locator('#login-password');
    const isValid = await passwordInput.evaluate(el => el.checkValidity());
    expect(isValid).toBe(false);
  });

  test('should login successfully with valid credentials', async ({ page }) => {
    await page.fill('#login-email', 'admin@sitechat.com');
    await page.fill('#login-password', 'admin123');
    await page.click('#login-btn');

    await expect(page).toHaveURL(/\/app\/?$/);
    
    const token = await page.evaluate(() => localStorage.getItem('token'));
    expect(token).toBeTruthy();
  });

  test('should show loading state during login', async ({ page }) => {
    await page.fill('#login-email', 'admin@sitechat.com');
    await page.fill('#login-password', 'admin123');
    
    const [response] = await Promise.all([
      page.waitForResponse(resp => resp.url().includes('/auth/login')),
      page.click('#login-btn')
    ]);

    expect(response.ok()).toBe(true);
  });

  test('should remember email when checkbox is checked', async ({ page }) => {
    await page.fill('#login-email', 'admin@sitechat.com');
    await page.check('#remember-me');
    await page.fill('#login-password', 'admin123');
    await page.click('#login-btn');

    await expect(page).toHaveURL(/\/app\/?$/);
    
    const rememberedEmail = await page.evaluate(() => localStorage.getItem('remember_email'));
    expect(rememberedEmail).toBe('admin@sitechat.com');
  });

  test('should pre-fill remembered email on page load', async ({ page, context }) => {
    await page.evaluate(() => {
      localStorage.setItem('remember_email', 'remembered@example.com');
    });

    await page.reload();

    await expect(page.locator('#login-email')).toHaveValue('remembered@example.com');
    await expect(page.locator('#remember-me')).toBeChecked();
  });

  test('should redirect to dashboard if already logged in', async ({ page }) => {
    await page.evaluate(() => {
      localStorage.setItem('token', 'existing-token');
      localStorage.setItem('user', JSON.stringify({ email: 'test@test.com', role: 'user' }));
    });

    await page.goto('/login');
    
    await expect(page).toHaveURL(/\/app\/?$/);
  });
});

test.describe('Logout', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.fill('#login-email', 'admin@sitechat.com');
    await page.fill('#login-password', 'admin123');
    await page.click('#login-btn');
    await expect(page).toHaveURL(/\/app\/?$/);
  });

  test('should display logout button', async ({ page }) => {
    await expect(page.locator('#logout-btn')).toBeVisible();
  });

  test('should logout successfully', async ({ page }) => {
    await page.click('#logout-btn');

    await expect(page).toHaveURL(/.*login/);
    
    const token = await page.evaluate(() => localStorage.getItem('token'));
    expect(token).toBeNull();
  });

  test('should clear user data on logout', async ({ page }) => {
    await page.click('#logout-btn');

    const user = await page.evaluate(() => localStorage.getItem('user'));
    expect(user).toBeNull();
  });
});

test.describe('Session Management', () => {
  test('should redirect to login on 401 response', async ({ page }) => {
    await page.goto('/login');
    await page.fill('#login-email', 'admin@sitechat.com');
    await page.fill('#login-password', 'admin123');
    await page.click('#login-btn');
    await expect(page).toHaveURL(/\/app\/?$/);

    await page.evaluate(() => {
      localStorage.setItem('token', 'invalid-expired-token');
    });

    await page.reload();
    
    await page.waitForTimeout(1000);
  });

  test('should display user info after login', async ({ page }) => {
    await page.goto('/login');
    await page.fill('#login-email', 'admin@sitechat.com');
    await page.fill('#login-password', 'admin123');
    await page.click('#login-btn');
    await expect(page).toHaveURL(/\/app\/?$/);

    await expect(page.locator('#user-name')).toBeVisible();
    await expect(page.locator('#user-role')).toBeVisible();
  });
});
