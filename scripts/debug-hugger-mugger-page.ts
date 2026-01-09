import { chromium } from 'playwright';

async function debugPage() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();

  console.log('Loading page...');
  await page.goto('https://www.huggermugger.com/mats/', {
    waitUntil: 'domcontentloaded',
    timeout: 60000
  });

  // Wait a bit for JS to render
  await page.waitForTimeout(3000);

  console.log('\n=== Checking for product links ===\n');

  // Try different selectors
  const selectors = [
    'a.bc-product-card__link',
    'a.product-card',
    '.product-item a',
    'a[href*="/products/"]',
    '.product a',
    '.productList a',
    'a.product-link',
    'a.productCard',
  ];

  for (const selector of selectors) {
    const count = await page.locator(selector).count();
    console.log(`${selector}: ${count} matches`);
  }

  // Get all links to see what's there
  console.log('\n=== All links on page ===\n');
  const allLinks = await page.locator('a').evaluateAll((links) =>
    links.slice(0, 20).map(link => ({
      href: (link as HTMLAnchorElement).href,
      text: link.textContent?.trim().substring(0, 50),
      classes: (link as HTMLElement).className,
    }))
  );

  allLinks.forEach((link, i) => {
    console.log(`${i + 1}. ${link.text}`);
    console.log(`   href: ${link.href}`);
    console.log(`   classes: ${link.classes}`);
    console.log('');
  });

  await browser.close();
}

debugPage().catch(console.error);
