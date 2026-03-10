const { test, expect } = require('@playwright/test');

test.describe('SiteChat Dashboard Tab Testing', () => {
  const credentials = {
    email: 'admin@yourdomain.com',
    password: 'YourStr0ng!Passw0rd'
  };

  const tabs = [
    'Appearance',
    'Behavior',
    'Quick Prompts',
    'Triggers',
    'Training',
    'Handoff',
    'Leads',
    'Security',
    'Crawling',
    'Embed'
  ];

  test('Test all dashboard settings tabs', async ({ page }) => {
    const results = [];

    // Navigate to the dashboard
    console.log('Navigating to http://localhost:8000...');
    await page.goto('http://localhost:8000');
    await page.waitForLoadState('networkidle');
    
    // Take initial screenshot
    await page.screenshot({ path: 'screenshots/01-initial-page.png', fullPage: true });
    console.log('Initial page loaded');

    // Login
    console.log('Attempting login...');
    try {
      // Wait for login form
      await page.waitForSelector('input[type="email"], input[name="email"], #email', { timeout: 5000 });
      
      // Fill email
      const emailInput = page.locator('input[type="email"], input[name="email"], #email').first();
      await emailInput.fill(credentials.email);
      
      // Fill password
      const passwordInput = page.locator('input[type="password"], input[name="password"], #password').first();
      await passwordInput.fill(credentials.password);
      
      // Click login button
      const loginButton = page.locator('button[type="submit"], button:has-text("Login"), button:has-text("Sign In"), .login-btn').first();
      await loginButton.click();
      
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
      
      await page.screenshot({ path: 'screenshots/02-after-login.png', fullPage: true });
      console.log('Login completed');
    } catch (error) {
      console.log('Login form not found or already logged in:', error.message);
      await page.screenshot({ path: 'screenshots/02-login-error.png', fullPage: true });
    }

    // Click on a site to open settings
    console.log('Looking for a site to click...');
    try {
      // Wait for sites list
      await page.waitForTimeout(2000);
      
      // Try different selectors for site items
      const siteSelectors = [
        '.site-card',
        '.site-item',
        '[data-site-id]',
        '.sites-list li',
        '.site-row',
        'tr[data-site]',
        '.dashboard-site'
      ];
      
      let siteClicked = false;
      for (const selector of siteSelectors) {
        const sites = page.locator(selector);
        if (await sites.count() > 0) {
          await sites.first().click();
          siteClicked = true;
          console.log(`Clicked site using selector: ${selector}`);
          break;
        }
      }
      
      if (!siteClicked) {
        // Try clicking any clickable element that might be a site
        const clickableItems = page.locator('[onclick], [data-action="select"], .clickable');
        if (await clickableItems.count() > 0) {
          await clickableItems.first().click();
          console.log('Clicked using fallback selector');
        }
      }
      
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
      await page.screenshot({ path: 'screenshots/03-site-selected.png', fullPage: true });
      console.log('Site selected');
    } catch (error) {
      console.log('Could not find/click site:', error.message);
      await page.screenshot({ path: 'screenshots/03-site-selection-error.png', fullPage: true });
    }

    // Test each tab
    console.log('\n=== Testing Settings Tabs ===\n');
    
    for (let i = 0; i < tabs.length; i++) {
      const tabName = tabs[i];
      const result = {
        name: tabName,
        loaded: 'NO',
        description: ''
      };
      
      try {
        console.log(`Testing tab: ${tabName}...`);
        
        // Try different tab selectors
        const tabSelectors = [
          `button:has-text("${tabName}")`,
          `a:has-text("${tabName}")`,
          `.tab:has-text("${tabName}")`,
          `[data-tab="${tabName.toLowerCase().replace(' ', '-')}"]`,
          `.nav-tab:has-text("${tabName}")`,
          `.settings-tab:has-text("${tabName}")`,
          `li:has-text("${tabName}")`,
          `[role="tab"]:has-text("${tabName}")`
        ];
        
        let tabClicked = false;
        for (const selector of tabSelectors) {
          const tab = page.locator(selector).first();
          if (await tab.isVisible({ timeout: 1000 }).catch(() => false)) {
            await tab.click();
            tabClicked = true;
            break;
          }
        }
        
        if (!tabClicked) {
          result.description = 'Tab button not found';
          results.push(result);
          console.log(`  ${tabName}: Tab button not found`);
          continue;
        }
        
        await page.waitForTimeout(1500);
        await page.waitForLoadState('networkidle');
        
        // Take screenshot
        const screenshotName = `screenshots/tab-${String(i + 4).padStart(2, '0')}-${tabName.toLowerCase().replace(/\s+/g, '-')}.png`;
        await page.screenshot({ path: screenshotName, fullPage: true });
        
        // Check for content
        const contentSelectors = [
          '.tab-content',
          '.settings-content',
          '.panel-content',
          '[role="tabpanel"]',
          '.content-area',
          'form',
          '.settings-panel'
        ];
        
        let contentFound = false;
        let contentDescription = '';
        
        for (const selector of contentSelectors) {
          const content = page.locator(selector);
          if (await content.isVisible({ timeout: 500 }).catch(() => false)) {
            contentFound = true;
            const text = await content.first().textContent().catch(() => '');
            contentDescription = text.substring(0, 200).replace(/\s+/g, ' ').trim();
            break;
          }
        }
        
        // Check for specific elements based on tab
        if (tabName === 'Leads') {
          const leadsCapture = await page.locator('text=Lead Capture, text=Captured Leads, .leads-table, table').first().isVisible({ timeout: 1000 }).catch(() => false);
          if (leadsCapture) {
            contentFound = true;
            contentDescription = 'Lead Capture Settings and/or Captured Leads table visible';
          }
          // Special screenshot for Leads tab
          await page.screenshot({ path: 'screenshots/LEADS-TAB-VERIFICATION.png', fullPage: true });
          console.log('  Took special screenshot for Leads tab');
        }
        
        // Get visible text for description
        const pageText = await page.locator('body').textContent();
        const relevantText = pageText.substring(0, 500).replace(/\s+/g, ' ').trim();
        
        // Check if tab content is visible
        const hasContent = relevantText.length > 50;
        
        result.loaded = hasContent ? 'YES' : 'NO';
        result.description = contentDescription || relevantText.substring(0, 150) || 'Content area visible';
        
        results.push(result);
        console.log(`  ${tabName}: ${result.loaded} - ${result.description.substring(0, 80)}...`);
        
      } catch (error) {
        result.loaded = 'ERROR';
        result.description = error.message;
        results.push(result);
        console.log(`  ${tabName}: ERROR - ${error.message}`);
      }
    }

    // Print final results
    console.log('\n\n=== FINAL RESULTS ===\n');
    console.log(JSON.stringify(results, null, 2));
    
    // Write results to file
    const fs = require('fs');
    fs.writeFileSync('screenshots/test-results.json', JSON.stringify(results, null, 2));
    console.log('\nResults saved to screenshots/test-results.json');
  });
});
