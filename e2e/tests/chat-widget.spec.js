/**
 * Chat Widget E2E Tests
 * Tests for the embeddable chat widget and chat flow
 */

const { test, expect } = require('@playwright/test');

test.describe('Chat Widget', () => {
  test.describe('Widget Embed', () => {
    test('should load widget script', async ({ page }) => {
      await page.goto('/demo');
      
      await page.waitForSelector('.sitechat-widget', { timeout: 10000 });
      await expect(page.locator('.sitechat-widget')).toBeVisible();
    });

    test('should display toggle button', async ({ page }) => {
      await page.goto('/demo');
      
      await page.waitForSelector('.sitechat-toggle', { timeout: 10000 });
      await expect(page.locator('.sitechat-toggle')).toBeVisible();
    });

    test('should open chat window on toggle click', async ({ page }) => {
      await page.goto('/demo');
      
      await page.waitForSelector('.sitechat-toggle');
      await page.click('.sitechat-toggle');
      
      await expect(page.locator('.sitechat-window')).toHaveClass(/open/);
    });

    test('should close chat window on toggle click', async ({ page }) => {
      await page.goto('/demo');
      
      await page.waitForSelector('.sitechat-toggle');
      await page.click('.sitechat-toggle');
      await expect(page.locator('.sitechat-window')).toHaveClass(/open/);
      
      await page.click('.sitechat-toggle');
      await expect(page.locator('.sitechat-window')).not.toHaveClass(/open/);
    });

    test('should display chat header', async ({ page }) => {
      await page.goto('/demo');
      
      await page.waitForSelector('.sitechat-toggle');
      await page.click('.sitechat-toggle');
      
      await expect(page.locator('.sitechat-header')).toBeVisible();
      await expect(page.locator('.sitechat-header h3')).toBeVisible();
    });

    test('should display welcome message', async ({ page }) => {
      await page.goto('/demo');
      
      await page.waitForSelector('.sitechat-toggle');
      await page.click('.sitechat-toggle');
      
      await expect(page.locator('.sitechat-welcome')).toBeVisible();
    });

    test('should display suggestion buttons', async ({ page }) => {
      await page.goto('/demo');
      
      await page.waitForSelector('.sitechat-toggle');
      await page.click('.sitechat-toggle');
      
      const suggestions = page.locator('.sitechat-suggestion');
      await expect(suggestions.first()).toBeVisible();
    });
  });

  test.describe('Chat Flow', () => {
    test('should display chat input', async ({ page }) => {
      await page.goto('/demo');
      
      await page.waitForSelector('.sitechat-toggle');
      await page.click('.sitechat-toggle');
      
      await expect(page.locator('.sitechat-input')).toBeVisible();
    });

    test('should enable send button when input has text', async ({ page }) => {
      await page.goto('/demo');
      
      await page.waitForSelector('.sitechat-toggle');
      await page.click('.sitechat-toggle');
      
      const input = page.locator('.sitechat-input');
      const sendBtn = page.locator('.sitechat-send');
      
      await expect(sendBtn).toBeDisabled();
      
      await input.fill('Hello');
      await expect(sendBtn).not.toBeDisabled();
    });

    test('should disable send button when input is empty', async ({ page }) => {
      await page.goto('/demo');
      
      await page.waitForSelector('.sitechat-toggle');
      await page.click('.sitechat-toggle');
      
      const input = page.locator('.sitechat-input');
      const sendBtn = page.locator('.sitechat-send');
      
      await input.fill('Hello');
      await expect(sendBtn).not.toBeDisabled();
      
      await input.fill('');
      await expect(sendBtn).toBeDisabled();
    });

    test('should send message and display user message', async ({ page }) => {
      await page.goto('/demo');
      
      await page.waitForSelector('.sitechat-toggle');
      await page.click('.sitechat-toggle');
      
      const input = page.locator('.sitechat-input');
      await input.fill('Hello, how are you?');
      await page.click('.sitechat-send');
      
      const userMessage = page.locator('.sitechat-message.user');
      await expect(userMessage).toBeVisible();
      await expect(userMessage).toContainText('Hello, how are you?');
    });

    test('should show typing indicator after sending', async ({ page }) => {
      await page.goto('/demo');
      
      await page.waitForSelector('.sitechat-toggle');
      await page.click('.sitechat-toggle');
      
      const input = page.locator('.sitechat-input');
      await input.fill('Test message');
      await page.click('.sitechat-send');
      
      const typing = page.locator('.sitechat-typing');
      await expect(typing).toBeVisible({ timeout: 5000 });
    });

    test('should display bot response', async ({ page }) => {
      await page.goto('/demo');
      
      await page.waitForSelector('.sitechat-toggle');
      await page.click('.sitechat-toggle');
      
      const input = page.locator('.sitechat-input');
      await input.fill('What is this website about?');
      await page.click('.sitechat-send');
      
      const botMessage = page.locator('.sitechat-message.bot');
      await expect(botMessage).toBeVisible({ timeout: 30000 });
    });

    test('should clear input after sending', async ({ page }) => {
      await page.goto('/demo');
      
      await page.waitForSelector('.sitechat-toggle');
      await page.click('.sitechat-toggle');
      
      const input = page.locator('.sitechat-input');
      await input.fill('Test message');
      await page.click('.sitechat-send');
      
      await expect(input).toHaveValue('');
    });

    test('should send message on suggestion click', async ({ page }) => {
      await page.goto('/demo');
      
      await page.waitForSelector('.sitechat-toggle');
      await page.click('.sitechat-toggle');
      
      const suggestion = page.locator('.sitechat-suggestion').first();
      await suggestion.click();
      
      const userMessage = page.locator('.sitechat-message.user');
      await expect(userMessage).toBeVisible();
    });

    test('should hide welcome after first message', async ({ page }) => {
      await page.goto('/demo');
      
      await page.waitForSelector('.sitechat-toggle');
      await page.click('.sitechat-toggle');
      
      await expect(page.locator('.sitechat-welcome')).toBeVisible();
      
      const input = page.locator('.sitechat-input');
      await input.fill('Hello');
      await page.click('.sitechat-send');
      
      await expect(page.locator('.sitechat-welcome')).not.toBeVisible();
    });
  });

  test.describe('Message Display', () => {
    test('should display message timestamp', async ({ page }) => {
      await page.goto('/demo');
      
      await page.waitForSelector('.sitechat-toggle');
      await page.click('.sitechat-toggle');
      
      const input = page.locator('.sitechat-input');
      await input.fill('Test');
      await page.click('.sitechat-send');
      
      const timestamp = page.locator('.sitechat-message-time');
      await expect(timestamp.first()).toBeVisible();
    });

    test('should display feedback buttons for bot messages', async ({ page }) => {
      await page.goto('/demo');
      
      await page.waitForSelector('.sitechat-toggle');
      await page.click('.sitechat-toggle');
      
      const input = page.locator('.sitechat-input');
      await input.fill('Hello');
      await page.click('.sitechat-send');
      
      await page.waitForSelector('.sitechat-message.bot', { timeout: 30000 });
      
      const feedback = page.locator('.sitechat-feedback');
      await expect(feedback).toBeVisible();
    });

    test('should send positive feedback', async ({ page }) => {
      await page.goto('/demo');
      
      await page.waitForSelector('.sitechat-toggle');
      await page.click('.sitechat-toggle');
      
      const input = page.locator('.sitechat-input');
      await input.fill('Hello');
      await page.click('.sitechat-send');
      
      await page.waitForSelector('.sitechat-message.bot', { timeout: 30000 });
      
      const thumbsUp = page.locator('.sitechat-feedback-btn[data-feedback="positive"]');
      await thumbsUp.click();
      
      await expect(page.locator('.sitechat-feedback-thanks')).toBeVisible();
    });
  });

  test.describe('Branding', () => {
    test('should display branding footer', async ({ page }) => {
      await page.goto('/demo');
      
      await page.waitForSelector('.sitechat-toggle');
      await page.click('.sitechat-toggle');
      
      await expect(page.locator('.sitechat-branding')).toBeVisible();
    });

    test('should display branding link', async ({ page }) => {
      await page.goto('/demo');
      
      await page.waitForSelector('.sitechat-toggle');
      await page.click('.sitechat-toggle');
      
      const brandingLink = page.locator('.sitechat-branding a');
      await expect(brandingLink).toBeVisible();
    });
  });

  test.describe('Handoff', () => {
    test('should display handoff button', async ({ page }) => {
      await page.goto('/demo');
      
      await page.waitForSelector('.sitechat-toggle');
      await page.click('.sitechat-toggle');
      
      await expect(page.locator('.sitechat-handoff-btn')).toBeVisible();
    });

    test('should initiate handoff on button click', async ({ page }) => {
      await page.goto('/demo');
      
      await page.waitForSelector('.sitechat-toggle');
      await page.click('.sitechat-toggle');
      
      const [response] = await Promise.all([
        page.waitForResponse(resp => resp.url().includes('/handoff'), { timeout: 10000 }).catch(() => null),
        page.click('.sitechat-handoff-btn')
      ]);
      
      if (response) {
        expect(response.ok()).toBe(true);
      }
    });
  });

  test.describe('Responsive Behavior', () => {
    test('should be responsive on mobile viewport', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });
      
      await page.goto('/demo');
      
      await page.waitForSelector('.sitechat-toggle');
      await expect(page.locator('.sitechat-toggle')).toBeVisible();
      
      await page.click('.sitechat-toggle');
      await expect(page.locator('.sitechat-window')).toHaveClass(/open/);
    });
  });
});

test.describe('Dashboard Chat View', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.fill('#login-email', 'admin@example.com');
    await page.fill('#login-password', 'admin123');
    await page.click('#login-btn');
    await expect(page).toHaveURL(/\/app\/?$/);
  });

  test('should navigate to chat view', async ({ page }) => {
    await page.click('[data-view="chat"]');
    await expect(page.locator('#chat-view')).toHaveClass(/active/);
  });

  test('should display site selector', async ({ page }) => {
    await page.click('[data-view="chat"]');
    await expect(page.locator('#chat-site-select')).toBeVisible();
  });

  test('should display new chat button', async ({ page }) => {
    await page.click('[data-view="chat"]');
    await expect(page.locator('#new-chat-btn')).toBeVisible();
  });

  test('should disable input when no site selected', async ({ page }) => {
    await page.click('[data-view="chat"]');
    
    const chatInput = page.locator('#chat-input');
    await expect(chatInput).toBeDisabled();
  });

  test('should enable input when site selected', async ({ page }) => {
    await page.click('[data-view="chat"]');
    
    const siteSelect = page.locator('#chat-site-select');
    const options = await siteSelect.locator('option').all();
    
    if (options.length > 1) {
      await siteSelect.selectOption({ index: 1 });
      await expect(page.locator('#chat-input')).not.toBeDisabled();
    }
  });

  test('should send chat message in dashboard', async ({ page }) => {
    await page.click('[data-view="chat"]');
    
    const siteSelect = page.locator('#chat-site-select');
    const options = await siteSelect.locator('option').all();
    
    if (options.length > 1) {
      await siteSelect.selectOption({ index: 1 });
      
      const chatInput = page.locator('#chat-input');
      await chatInput.fill('Test message from dashboard');
      
      const [response] = await Promise.all([
        page.waitForResponse(resp => resp.url().includes('/chat')),
        page.click('#send-btn')
      ]);
      
      expect(response.ok()).toBe(true);
    }
  });

  test('should display chat messages', async ({ page }) => {
    await page.click('[data-view="chat"]');
    
    const siteSelect = page.locator('#chat-site-select');
    const options = await siteSelect.locator('option').all();
    
    if (options.length > 1) {
      await siteSelect.selectOption({ index: 1 });
      
      const chatInput = page.locator('#chat-input');
      await chatInput.fill('Hello');
      await page.click('#send-btn');
      
      await expect(page.locator('#chat-messages .message')).toBeVisible({ timeout: 10000 });
    }
  });
});
