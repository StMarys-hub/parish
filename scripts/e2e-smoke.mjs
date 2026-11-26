import { chromium } from 'playwright';

const BASE_URL = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:4173';

async function assertAsset(path, expectedContentType) {
  const res = await fetch(`${BASE_URL}${path}`);
  if (!res.ok) {
    throw new Error(`Expected ${path} to return 200, got ${res.status}`);
  }
  const ct = res.headers.get('content-type') || '';
  if (expectedContentType && !ct.toLowerCase().includes(expectedContentType)) {
    throw new Error(`Expected ${path} content-type to include "${expectedContentType}", got "${ct}"`);
  }
}

async function run() {
  // 1. Verify PWA & Open Graph static assets are served
  await assertAsset('/', 'text/html');
  await assertAsset('/manifest.webmanifest', 'manifest');
  await assertAsset('/sw.js', 'javascript');
  await assertAsset('/og-card.png', 'image/png');
  await assertAsset('/pwa-192x192.png', 'image/png');

  // 2. Launch headless Chromium and verify core parishioner user flows
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const pageErrors = [];
  page.on('pageerror', (err) => pageErrors.push(err.message));

  await page.goto(BASE_URL, { waitUntil: 'networkidle' });

  // Verify Open Graph tags in DOM
  const ogImage = await page.locator('meta[property="og:image"]').getAttribute('content');
  if (!ogImage || !ogImage.includes('og-card.png')) {
    throw new Error(`Missing or invalid og:image meta tag: ${ogImage}`);
  }

  // Verify Home Bulletin view renders
  await page.getByRole('heading', { name: /St\. Mary's/i }).first().waitFor({ timeout: 10000 });
  await page.getByText(/Weekly Announcements/i).first().waitFor({ timeout: 10000 });

  // Open Instant Search and close it
  await page.getByRole('button', { name: /Search parish notices/i }).click();
  await page.getByRole('searchbox', { name: /Search parish notices/i }).waitFor({ timeout: 5000 });
  await page.getByRole('button', { name: 'Done' }).click();

  // Navigate to Schedules tab
  await page.getByRole('button', { name: 'Schedules' }).first().click();
  await page.getByText(/Regular Parish Schedules|Holy Qurbana/i).first().waitFor({ timeout: 5000 });

  // Navigate to Parish tab and verify all 3 segments
  await page.getByRole('button', { name: 'Parish' }).first().click();
  await page.getByRole('tab', { name: 'Church Info' }).waitFor({ timeout: 5000 });
  await page.getByRole('tab', { name: 'Services' }).click();
  await page.getByText(/Parish On Net/i).first().waitFor({ timeout: 5000 });
  await page.getByRole('tab', { name: 'Settings' }).click();
  await page.getByText(/Reading Text Size/i).first().waitFor({ timeout: 5000 });

  // Return to Bulletin tab
  await page.getByRole('button', { name: 'Bulletin' }).first().click();
  await page.getByText(/Weekly Announcements/i).first().waitFor({ timeout: 5000 });

  await browser.close();

  if (pageErrors.length > 0) {
    throw new Error(`Uncaught runtime page errors:\n${pageErrors.join('\n')}`);
  }

  console.log('E2E smoke test passed: assets, OG tags, search, schedules, and 3-segment parish tab verified.');
}

run().catch((err) => {
  console.error('E2E smoke test failed:', err);
  process.exit(1);
});
