/**
 * BigCommerce WordPress Plugin Scraper
 *
 * Hugger Mugger uses WordPress with the BigCommerce plugin.
 * This scraper uses Playwright to extract product data from the rendered pages.
 *
 * Note: BigCommerce has a REST API, but accessing it requires store credentials.
 * Since we don't have API access, we use browser automation to scrape the public site.
 */

import { chromium, type Browser, type Page } from 'playwright';
import type { ShopifyProduct, ShopifyVariant, ShopifyImage, ShopifyOptions } from './fetch-products-json.js';

/**
 * BigCommerce product structure extracted from HTML
 */
interface BigCommerceProduct {
  id: string;
  name: string;
  price: number;
  compareAtPrice?: number;
  url: string;
  imageUrl?: string;
  description?: string;
  variants: Array<{
    option1?: string;
    option2?: string;
    price: number;
    available: boolean;
    sku?: string;
  }>;
  options: Array<{
    name: string;
    values: string[];
  }>;
}

export interface BigCommerceFetchResult {
  products: ShopifyProduct[];
  success: boolean;
  error?: string;
  totalProducts: number;
}

/**
 * Extract product data from a BigCommerce product page
 */
async function extractProductData(page: Page, url: string): Promise<BigCommerceProduct | null> {
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });

    // Extract product JSON-LD structured data if available
    const jsonLd = await page.locator('script[type="application/ld+json"]').first().textContent();
    let structuredData: any = null;

    if (jsonLd) {
      try {
        structuredData = JSON.parse(jsonLd);
      } catch {
        // Ignore parse errors
      }
    }

    // Extract product ID (from data attributes or URL)
    const productId = await page.locator('[data-product-id]').first().getAttribute('data-product-id')
      || url.split('/').pop()
      || `product-${Date.now()}`;

    // Extract product name
    const name = await page.locator('.bc-product__title, h1.product-title, .product-name').first().textContent()
      || structuredData?.name
      || 'Unknown Product';

    // Extract price
    let price = 0;
    const priceText = await page.locator('.bc-product__price, .product-price, .price').first().textContent();
    if (priceText) {
      const priceMatch = priceText.match(/\$?(\d+(?:\.\d+)?)/);
      if (priceMatch) {
        price = parseFloat(priceMatch[1]);
      }
    }

    // Extract compare at price (original price if on sale)
    let compareAtPrice: number | undefined;
    const compareText = await page.locator('.bc-product__original-price, .original-price, .was-price').first().textContent();
    if (compareText) {
      const compareMatch = compareText.match(/\$?(\d+(?:\.\d+)?)/);
      if (compareMatch) {
        compareAtPrice = parseFloat(compareMatch[1]);
      }
    }

    // Extract main image
    const imageUrl = await page.locator('.bc-product__image img, .product-image img').first().getAttribute('src')
      || structuredData?.image
      || undefined;

    // Extract description
    const description = await page.locator('.bc-product__description, .product-description, .description').first().innerHTML()
      || structuredData?.description
      || '';

    // Extract options (color, size, etc.)
    const options: Array<{ name: string; values: string[] }> = [];
    const optionSelects = await page.locator('.bc-product__option select, .product-option select').all();

    for (const select of optionSelects) {
      const label = await select.locator('..').locator('label').first().textContent();
      const optionValues = await select.locator('option').allTextContents();

      if (label && optionValues.length > 0) {
        options.push({
          name: label.trim().replace(':', ''),
          values: optionValues.filter(v => v.trim() !== '' && v.trim().toLowerCase() !== 'select an option'),
        });
      }
    }

    // For now, create a single variant (full variant extraction requires interacting with dropdowns)
    const variants = [{
      option1: options[0]?.values[0],
      option2: options[1]?.values[0],
      price,
      available: true, // Assume available if page loaded
      sku: productId,
    }];

    return {
      id: productId,
      name: name.trim(),
      price,
      compareAtPrice,
      url,
      imageUrl,
      description,
      variants,
      options,
    };
  } catch (error) {
    console.error(`Error extracting product from ${url}:`, error);
    return null;
  }
}

/**
 * Convert BigCommerce product to Shopify-compatible format
 */
function convertToShopifyFormat(product: BigCommerceProduct): ShopifyProduct {
  const now = new Date().toISOString();

  // Build variants
  const variants: ShopifyVariant[] = product.variants.map((variant, index) => ({
    id: parseInt(`${product.id}${index + 1}`) || Date.now() + index,
    title: [variant.option1, variant.option2].filter(Boolean).join(' / ') || 'Default',
    option1: variant.option1 || null,
    option2: variant.option2 || null,
    option3: null,
    sku: variant.sku || `${product.id}-${index + 1}`,
    price: variant.price.toString(),
    compare_at_price: product.compareAtPrice ? product.compareAtPrice.toString() : null,
    grams: 0,
    available: variant.available,
    required_shipping: true,
    taxable: true,
    position: index + 1,
    product_id: parseInt(product.id) || Date.now(),
    created_at: now,
    updated_at: now,
  }));

  // Build images array
  const images: ShopifyImage[] = product.imageUrl
    ? [{
        id: 1,
        product_id: parseInt(product.id) || Date.now(),
        src: product.imageUrl,
        alt: product.name,
        width: 0,
        height: 0,
        position: 1,
        variant_ids: [],
        created_at: now,
        updated_at: now,
      }]
    : [];

  // Build options array
  const options: ShopifyOptions[] = product.options.map((opt, index) => ({
    name: opt.name,
    position: index + 1,
    values: opt.values,
  }));

  return {
    id: parseInt(product.id) || Date.now(),
    title: product.name,
    handle: product.url.split('/').pop()?.replace(/\?.*$/, '') || product.name.toLowerCase().replace(/\s+/g, '-'),
    body_html: product.description || '',
    published_at: now,
    created_at: now,
    updated_at: now,
    vendor: 'Hugger Mugger',
    product_type: 'Yoga Mats',
    tags: [],
    variants,
    images,
    options,
  };
}

/**
 * Fetch yoga mats from Hugger Mugger's BigCommerce store
 *
 * @param collectionUrl - URL of the yoga mats collection page
 * @param options - Fetch options including pagination and browser settings
 */
export async function fetchBigCommerceProducts(
  collectionUrl: string,
  options: {
    maxProducts?: number;
    headless?: boolean;
    delayBetweenProducts?: number;
    onProductFetched?: (current: number, total: number) => void;
  } = {}
): Promise<BigCommerceFetchResult> {
  const {
    maxProducts = 100,
    headless = true,
    delayBetweenProducts = 1000, // 1 second between products
    onProductFetched,
  } = options;

  let browser: Browser | null = null;
  const allProducts: ShopifyProduct[] = [];

  try {
    // Launch browser
    browser = await chromium.launch({ headless });
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });
    const page = await context.newPage();

    // Navigate to collection page
    await page.goto(collectionUrl, { waitUntil: 'networkidle', timeout: 30000 });

    // Extract all product links from collection page
    const productLinks = await page.locator('a.bc-product-card__link, a.product-card, .product-item a').evaluateAll((links) =>
      links
        .map(link => (link as HTMLAnchorElement).href)
        .filter((href, index, self) => href && self.indexOf(href) === index) // Deduplicate
    );

    const productsToFetch = productLinks.slice(0, maxProducts);
    console.log(`Found ${productLinks.length} products, fetching ${productsToFetch.length}...`);

    // Fetch each product
    for (let i = 0; i < productsToFetch.length; i++) {
      const productUrl = productsToFetch[i];

      if (onProductFetched) {
        onProductFetched(i + 1, productsToFetch.length);
      }

      const productData = await extractProductData(page, productUrl);

      if (productData) {
        const shopifyProduct = convertToShopifyFormat(productData);
        allProducts.push(shopifyProduct);
      }

      // Delay between products
      if (i < productsToFetch.length - 1 && delayBetweenProducts > 0) {
        await new Promise(resolve => setTimeout(resolve, delayBetweenProducts));
      }
    }

    await browser.close();

    return {
      products: allProducts,
      success: true,
      totalProducts: allProducts.length,
    };
  } catch (error) {
    if (browser) {
      await browser.close();
    }

    return {
      products: allProducts,
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      totalProducts: allProducts.length,
    };
  }
}
