#!/usr/bin/env node

/**
 * Screenshot Pages Script
 *
 * This script uses Playwright to visit all pages in the application
 * and save full-page screenshots with directory structure matching URLs.
 * It captures both desktop and mobile (iPhone) views.
 *
 * Usage:
 *   node scripts/screenshot-pages.js [base-url] [output-dir] [mode]
 *
 * Example:
 *   node scripts/screenshot-pages.js http://localhost:3000 ./screenshots all
 *   node scripts/screenshot-pages.js http://localhost:3000 ./screenshots desktop
 *   node scripts/screenshot-pages.js http://localhost:3000 ./screenshots mobile
 */

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const { createCanvas, loadImage } = require('canvas');

// Configuration
const BASE_URL = process.argv[2] || 'http://localhost:3000';
const OUTPUT_DIR = process.argv[3] || path.join(__dirname, '../screenshots');
const MODE = process.argv[4] || 'all'; // 'desktop', 'mobile', or 'all'

// Device configurations
const DEVICES = {
    desktop: {
        viewport: { width: 1920, height: 1080 },
        suffix: '',
        useFrame: false
    },
    mobile: {
        // iPhone 15 Pro dimensions
        viewport: { width: 393, height: 852 },
        deviceScaleFactor: 1,  // Use 1 to avoid scaling issues
        suffix: '-mobile',
        useFrame: false,  // No frame - show full scrollable content
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
        hasTouch: true
    }
};

// List of URLs to screenshot
const URLS = [
    // Main pages
    '/',
    '/policies',

    // Compliance overview
    '/compliance',
    '/compliance/tenants',
    '/compliance/teams',

    // Tagging compliance
    '/compliance/tagging',
    '/compliance/tagging/teams',

    // Database compliance
    '/compliance/database',

    // Load balancer compliance
    '/compliance/loadbalancers',
    '/compliance/loadbalancers/tls',
    '/compliance/loadbalancers/types',

    // KMS compliance
    '/compliance/kms',

    // Auto scaling compliance
    '/compliance/autoscaling',
    '/compliance/autoscaling/dimensions',
    '/compliance/autoscaling/empty',
];

/**
 * Convert URL path to filesystem path
 */
function urlToFilePath(urlPath, suffix = '') {
    // Remove leading slash
    let cleanPath = urlPath.replace(/^\//, '');

    // If root, use 'home'
    if (!cleanPath) {
        return `home${suffix}.png`;
    }

    // Replace slashes with directory separators
    const parts = cleanPath.split('/');

    // Last part becomes the filename, rest become directories
    if (parts.length === 1) {
        return `${parts[0]}${suffix}.png`;
    }

    const dirs = parts.slice(0, -1).join(path.sep);
    const filename = `${parts[parts.length - 1]}${suffix}.png`;

    return path.join(dirs, filename);
}

/**
 * Ensure directory exists
 */
function ensureDir(filePath) {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

/**
 * Create iPhone frame mockup with screenshot
 */
async function createiPhoneFrame(screenshotBuffer) {
    // iPhone 15 Pro frame dimensions
    const frameWidth = 493;
    const frameHeight = 1002;
    const screenX = 50;
    const screenY = 75;
    const screenWidth = 393;
    const screenHeight = 852;

    const canvas = createCanvas(frameWidth, frameHeight);
    const ctx = canvas.getContext('2d');

    // Draw background (iPhone frame)
    ctx.fillStyle = '#1d1d1f';
    ctx.fillRect(0, 0, frameWidth, frameHeight);

    // Draw rounded rectangle for device shape
    const cornerRadius = 50;
    ctx.beginPath();
    ctx.moveTo(cornerRadius, 0);
    ctx.lineTo(frameWidth - cornerRadius, 0);
    ctx.quadraticCurveTo(frameWidth, 0, frameWidth, cornerRadius);
    ctx.lineTo(frameWidth, frameHeight - cornerRadius);
    ctx.quadraticCurveTo(frameWidth, frameHeight, frameWidth - cornerRadius, frameHeight);
    ctx.lineTo(cornerRadius, frameHeight);
    ctx.quadraticCurveTo(0, frameHeight, 0, frameHeight - cornerRadius);
    ctx.lineTo(0, cornerRadius);
    ctx.quadraticCurveTo(0, 0, cornerRadius, 0);
    ctx.closePath();
    ctx.fill();

    // Draw screen area (white background)
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(screenX, screenY, screenWidth, screenHeight);

    // Load and draw the screenshot
    const screenshot = await loadImage(screenshotBuffer);
    ctx.drawImage(screenshot, screenX, screenY, screenWidth, screenHeight);

    // Draw notch (simplified)
    ctx.fillStyle = '#1d1d1f';
    const notchWidth = 120;
    const notchHeight = 30;
    const notchX = (frameWidth - notchWidth) / 2;
    const notchY = screenY;
    ctx.beginPath();
    ctx.moveTo(notchX + 10, notchY);
    ctx.lineTo(notchX + notchWidth - 10, notchY);
    ctx.quadraticCurveTo(notchX + notchWidth, notchY, notchX + notchWidth, notchY + 10);
    ctx.lineTo(notchX + notchWidth, notchY + notchHeight - 10);
    ctx.quadraticCurveTo(notchX + notchWidth, notchY + notchHeight, notchX + notchWidth - 10, notchY + notchHeight);
    ctx.lineTo(notchX + 10, notchY + notchHeight);
    ctx.quadraticCurveTo(notchX, notchY + notchHeight, notchX, notchY + notchHeight - 10);
    ctx.lineTo(notchX, notchY + 10);
    ctx.quadraticCurveTo(notchX, notchY, notchX + 10, notchY);
    ctx.closePath();
    ctx.fill();

    return canvas.toBuffer('image/png');
}

/**
 * Take screenshot for a specific device
 */
async function takeScreenshot(page, urlPath, deviceConfig, deviceName) {
    const fullUrl = `${BASE_URL}${urlPath}`;
    const relativePath = urlToFilePath(urlPath, deviceConfig.suffix);
    const outputPath = path.join(OUTPUT_DIR, relativePath);

    console.log(`  [${deviceName}] Visiting: ${fullUrl}`);

    // Navigate to page
    await page.goto(fullUrl, {
        waitUntil: 'networkidle',
        timeout: 30000
    });

    // Wait for any animations/dynamic content
    await page.waitForTimeout(1000);

    // Ensure directory exists
    ensureDir(outputPath);

    // Take screenshot
    const screenshotBuffer = await page.screenshot({
        fullPage: true
    });

    // If mobile with frame, composite onto iPhone frame
    if (deviceConfig.useFrame) {
        const framedBuffer = await createiPhoneFrame(screenshotBuffer);
        fs.writeFileSync(outputPath, framedBuffer);
    } else {
        fs.writeFileSync(outputPath, screenshotBuffer);
    }

    console.log(`  ✓ Saved: ${relativePath}`);
}

/**
 * Main screenshot function
 */
async function takeScreenshots() {
    console.log(`Starting screenshot capture...`);
    console.log(`Base URL: ${BASE_URL}`);
    console.log(`Output directory: ${OUTPUT_DIR}`);
    console.log(`Mode: ${MODE}`);
    console.log(`Total URLs: ${URLS.length}\n`);

    // Determine which devices to capture
    const devicesToCapture = MODE === 'all'
        ? ['desktop', 'mobile']
        : [MODE];

    // Validate mode
    if (!devicesToCapture.every(d => DEVICES[d])) {
        console.error(`Invalid mode: ${MODE}. Must be 'desktop', 'mobile', or 'all'`);
        process.exit(1);
    }

    // Ensure output directory exists
    if (!fs.existsSync(OUTPUT_DIR)) {
        fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }

    // Launch browser
    const browser = await chromium.launch({
        headless: true
    });

    let successCount = 0;
    let failCount = 0;

    // Capture screenshots for each device type
    for (const deviceName of devicesToCapture) {
        const deviceConfig = DEVICES[deviceName];

        console.log(`\n${'='.repeat(50)}`);
        console.log(`Capturing ${deviceName.toUpperCase()} screenshots`);
        console.log(`${'='.repeat(50)}\n`);

        // Create context with device-specific settings
        const context = await browser.newContext({
            viewport: deviceConfig.viewport,
            deviceScaleFactor: deviceConfig.deviceScaleFactor || 1,
            userAgent: deviceConfig.userAgent,
            isMobile: deviceName === 'mobile',
            hasTouch: deviceConfig.hasTouch || false
        });

        const page = await context.newPage();

        // Visit each URL and take screenshot
        for (const urlPath of URLS) {
            try {
                await takeScreenshot(page, urlPath, deviceConfig, deviceName);
                successCount++;
            } catch (error) {
                console.error(`  ✗ Failed: ${urlPath}`);
                console.error(`    Error: ${error.message}`);
                failCount++;
            }
        }

        await context.close();
    }

    await browser.close();

    // Summary
    console.log('\n' + '='.repeat(50));
    console.log('Screenshot capture complete!');
    console.log(`Total: ${URLS.length * devicesToCapture.length} | Success: ${successCount} | Failed: ${failCount}`);
    console.log(`Screenshots saved to: ${OUTPUT_DIR}`);
    console.log('='.repeat(50));
}

// Run the script
takeScreenshots().catch(error => {
    console.error('Script failed:', error);
    process.exit(1);
});
