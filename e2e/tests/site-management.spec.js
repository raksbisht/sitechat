/**
 * Site Management E2E Tests
 * Tests for creating, editing, and deleting sites
 */

const { test, expect } = require('@playwright/test');

test.describe('Site Management', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.fill('#login-email', 'admin@example.com');
    await page.fill('#login-password', 'admin123');
    await page.click('#login-btn');
    await expect(page).toHaveURL(/\/app\/?$/);
  });

  test.describe('Sites View', () => {
    test('should display sites view by default', async ({ page }) => {
      await expect(page.locator('#sites-view')).toHaveClass(/active/);
    });

    test('should display add site button', async ({ page }) => {
      await expect(page.locator('#add-site-btn')).toBeVisible();
    });

    test('should display empty state when no sites', async ({ page }) => {
      const sitesGrid = page.locator('#sites-grid');
      const siteCards = sitesGrid.locator('.site-card');
      const emptyState = page.locator('#empty-state');

      const cardCount = await siteCards.count();
      if (cardCount === 0) {
        await expect(emptyState).toBeVisible();
      }
    });

    test('should display site cards when sites exist', async ({ page }) => {
      const sitesGrid = page.locator('#sites-grid');
      const siteCards = sitesGrid.locator('.site-card');
      
      const count = await siteCards.count();
      if (count > 0) {
        const firstCard = siteCards.first();
        await expect(firstCard.locator('.site-name')).toBeVisible();
        await expect(firstCard.locator('.site-url')).toBeVisible();
        await expect(firstCard.locator('.status-badge')).toBeVisible();
      }
    });
  });

  test.describe('Add Site Modal', () => {
    test('should open add site modal', async ({ page }) => {
      await page.click('#add-site-btn');
      await expect(page.locator('#add-site-modal')).toHaveClass(/active/);
    });

    test('should display source type selection step', async ({ page }) => {
      await page.click('#add-site-btn');
      await expect(page.locator('#step-source-type')).toHaveClass(/active/);
      await expect(page.locator('[data-type="website"]')).toBeVisible();
      await expect(page.locator('[data-type="documents"]')).toBeVisible();
      await expect(page.locator('[data-type="both"]')).toBeVisible();
    });

    test('should close modal on close button click', async ({ page }) => {
      await page.click('#add-site-btn');
      await expect(page.locator('#add-site-modal')).toHaveClass(/active/);
      
      await page.click('#close-modal');
      await expect(page.locator('#add-site-modal')).not.toHaveClass(/active/);
    });

    test('should close modal on backdrop click', async ({ page }) => {
      await page.click('#add-site-btn');
      await expect(page.locator('#add-site-modal')).toHaveClass(/active/);
      
      await page.click('#add-site-modal', { position: { x: 10, y: 10 } });
      await expect(page.locator('#add-site-modal')).not.toHaveClass(/active/);
    });

    test('should close modal on Escape key', async ({ page }) => {
      await page.click('#add-site-btn');
      await expect(page.locator('#add-site-modal')).toHaveClass(/active/);
      
      await page.keyboard.press('Escape');
      await expect(page.locator('#add-site-modal')).not.toHaveClass(/active/);
    });
  });

  test.describe('Website Crawling', () => {
    test('should show website form when website option selected', async ({ page }) => {
      await page.click('#add-site-btn');
      await page.click('[data-type="website"]');
      
      await expect(page.locator('#step-website')).toHaveClass(/active/);
      await expect(page.locator('#site-url')).toBeVisible();
      await expect(page.locator('#site-name')).toBeVisible();
      await expect(page.locator('#max-pages')).toBeVisible();
    });

    test('should focus URL input when website form shown', async ({ page }) => {
      await page.click('#add-site-btn');
      await page.click('[data-type="website"]');
      
      await expect(page.locator('#site-url')).toBeFocused();
    });

    test('should validate URL input', async ({ page }) => {
      await page.click('#add-site-btn');
      await page.click('[data-type="website"]');
      
      await page.fill('#site-url', 'invalid-url');
      await page.click('#submit-website');
      
      const urlInput = page.locator('#site-url');
      const isValid = await urlInput.evaluate(el => el.checkValidity());
      expect(isValid).toBe(false);
    });

    test('should go back to source selection', async ({ page }) => {
      await page.click('#add-site-btn');
      await page.click('[data-type="website"]');
      await page.click('#back-to-source');
      
      await expect(page.locator('#step-source-type')).toHaveClass(/active/);
    });

    test('should submit website for crawling', async ({ page }) => {
      await page.click('#add-site-btn');
      await page.click('[data-type="website"]');
      
      await page.fill('#site-url', 'https://example.com');
      await page.fill('#site-name', 'Example Site');
      await page.fill('#max-pages', '10');
      
      const [response] = await Promise.all([
        page.waitForResponse(resp => resp.url().includes('/embed/setup')),
        page.click('#submit-website')
      ]);
      
      const data = await response.json();
      expect(data.site_id).toBeTruthy();
    });
  });

  test.describe('Document Upload', () => {
    test('should show documents form when documents option selected', async ({ page }) => {
      await page.click('#add-site-btn');
      await page.click('[data-type="documents"]');
      
      await expect(page.locator('#step-documents')).toHaveClass(/active/);
      await expect(page.locator('#doc-site-name')).toBeVisible();
      await expect(page.locator('#upload-zone')).toBeVisible();
    });

    test('should highlight upload zone on drag over', async ({ page }) => {
      await page.click('#add-site-btn');
      await page.click('[data-type="documents"]');
      
      const uploadZone = page.locator('#upload-zone');
      
      await uploadZone.dispatchEvent('dragover');
      await expect(uploadZone).toHaveClass(/dragover/);
    });

    test('should disable submit button when no files selected', async ({ page }) => {
      await page.click('#add-site-btn');
      await page.click('[data-type="documents"]');
      
      await expect(page.locator('#submit-documents')).toBeDisabled();
    });
  });

  test.describe('Site Details Panel', () => {
    test('should open site details when card clicked', async ({ page }) => {
      const siteCards = page.locator('.site-card');
      const count = await siteCards.count();
      
      if (count > 0) {
        await siteCards.first().click();
        await expect(page.locator('#site-details-panel')).toHaveClass(/active/);
      }
    });

    test('should display site information in panel', async ({ page }) => {
      const siteCards = page.locator('.site-card');
      const count = await siteCards.count();
      
      if (count > 0) {
        await siteCards.first().click();
        
        await expect(page.locator('#detail-site-name')).toBeVisible();
        await expect(page.locator('#detail-url-small')).toBeVisible();
        await expect(page.locator('#detail-status')).toBeVisible();
      }
    });

    test('should display embed code', async ({ page }) => {
      const siteCards = page.locator('.site-card');
      const count = await siteCards.count();
      
      if (count > 0) {
        await siteCards.first().click();
        await expect(page.locator('#detail-embed-code')).toBeVisible();
      }
    });

    test('should copy embed code on button click', async ({ page }) => {
      const siteCards = page.locator('.site-card');
      const count = await siteCards.count();
      
      if (count > 0) {
        await siteCards.first().click();
        
        await page.click('#copy-detail-embed');
        
        await expect(page.locator('#copy-detail-embed')).toContainText('Copied');
      }
    });

    test('should close panel on close button click', async ({ page }) => {
      const siteCards = page.locator('.site-card');
      const count = await siteCards.count();
      
      if (count > 0) {
        await siteCards.first().click();
        await expect(page.locator('#site-details-panel')).toHaveClass(/active/);
        
        await page.click('#close-details-panel');
        await expect(page.locator('#site-details-panel')).not.toHaveClass(/active/);
      }
    });

    test('should close panel on overlay click', async ({ page }) => {
      const siteCards = page.locator('.site-card');
      const count = await siteCards.count();
      
      if (count > 0) {
        await siteCards.first().click();
        await expect(page.locator('#site-details-panel')).toHaveClass(/active/);
        
        await page.click('#side-panel-overlay');
        await expect(page.locator('#site-details-panel')).not.toHaveClass(/active/);
      }
    });
  });

  test.describe('Site Actions', () => {
    test('should trigger recrawl', async ({ page }) => {
      const siteCards = page.locator('.site-card');
      const count = await siteCards.count();
      
      if (count > 0) {
        await siteCards.first().click();
        
        page.on('dialog', dialog => dialog.accept());
        
        const [response] = await Promise.all([
          page.waitForResponse(resp => resp.url().includes('/crawl')),
          page.click('#recrawl-site')
        ]);
        
        expect(response.ok()).toBe(true);
      }
    });

    test('should confirm before delete', async ({ page }) => {
      const siteCards = page.locator('.site-card');
      const count = await siteCards.count();
      
      if (count > 0) {
        await siteCards.first().click();
        
        let dialogShown = false;
        page.on('dialog', dialog => {
          dialogShown = true;
          dialog.dismiss();
        });
        
        await page.click('#delete-site');
        expect(dialogShown).toBe(true);
      }
    });

    test('should navigate to chat view for testing', async ({ page }) => {
      const siteCards = page.locator('.site-card');
      const count = await siteCards.count();
      
      if (count > 0) {
        await siteCards.first().click();
        await page.click('#test-chat-btn');
        
        await expect(page.locator('#chat-view')).toHaveClass(/active/);
      }
    });
  });
});
