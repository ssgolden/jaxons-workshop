const { chromium } = require('playwright');

(async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.setViewportSize({ width: 1280, height: 900 });

    // Go to homepage
    await page.goto('http://localhost:3006', { waitUntil: 'networkidle' });
    await page.screenshot({ path: 'screenshots/step-home.png' });
    console.log('1. Homepage captured');

    // Click on first product (Vanilla Dream)
    await page.click('.product-card:first-child');
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'screenshots/step-product-added.png' });
    console.log('2. Product added captured');

    // Click on cart button
    await page.click('.cart-toggle');
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'screenshots/step-cart.png' });
    console.log('3. Cart page captured');

    // Click continue to information
    await page.click('button:has-text("Continue to Information")');
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'screenshots/step-information.png' });
    console.log('4. Information step captured');

    // Fill in information
    await page.fill('input[type="email"]', 'test@example.com');
    await page.fill('input[type="text"]', 'Test User');
    await page.fill('input[type="tel"]', '+34 600 123 456');
    await page.waitForTimeout(300);
    await page.screenshot({ path: 'screenshots/step-info-filled.png' });
    console.log('5. Info filled captured');

    // Click continue to shipping
    await page.click('button:has-text("Continue to Shipping")');
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'screenshots/step-shipping.png' });
    console.log('6. Shipping step captured');

    // Click continue to payment
    await page.click('button:has-text("Continue to Payment")');
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'screenshots/step-payment.png' });
    console.log('7. Payment step captured');

    await browser.close();
    console.log('\nAll checkout steps captured successfully!');
})();
