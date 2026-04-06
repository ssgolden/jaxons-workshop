const { chromium } = require('playwright');

(async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    // Set viewport to desktop size
    await page.setViewportSize({ width: 1280, height: 900 });

    // Navigate to the site
    await page.goto('http://localhost:3006', { waitUntil: 'networkidle' });

    // Take screenshot of full page
    await page.screenshot({
        path: 'screenshots/home-desktop.png',
        fullPage: true
    });
    console.log('Screenshot saved: screenshots/home-desktop.png');

    // Mobile view
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('http://localhost:3006', { waitUntil: 'networkidle' });
    await page.screenshot({
        path: 'screenshots/home-mobile.png',
        fullPage: true
    });
    console.log('Screenshot saved: screenshots/home-mobile.png');

    await browser.close();
})();
