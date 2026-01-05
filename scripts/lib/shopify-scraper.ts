import { Page } from 'playwright';

export interface ProductLink {
  url: string;
  title: string;
}

export interface ProductData {
  brand: string;
  model: string;
  price: number;
  thickness?: number;
  length?: number;
  width?: number;
  weight?: number;
  material?: string;
  texture?: string;
  imageUrl?: string;
  description?: string;
  features?: string[];
  variants?: Array<{
    name: string;
    price: number;
  }>;
}

/**
 * Detect if a website is using Shopify
 */
export async function isShopifySite(page: Page): Promise<boolean> {
  try {
    // Check for Shopify-specific meta tags or scripts
    const shopifyIndicators = await page.evaluate(() => {
      // Check meta tag
      const metaTag = document.querySelector('meta[name="shopify-digital-wallet"]');
      if (metaTag) return true;

      // Check for Shopify scripts
      const scripts = Array.from(document.querySelectorAll('script[src]'));
      const hasShopifyScript = scripts.some(script =>
        script.getAttribute('src')?.includes('shopify') ||
        script.getAttribute('src')?.includes('cdn.shopify.com')
      );
      if (hasShopifyScript) return true;

      // Check for Shopify global object
      if (typeof (window as any).Shopify !== 'undefined') return true;

      return false;
    });

    return shopifyIndicators;
  } catch (error) {
    return false;
  }
}

/**
 * Extract all product links from a Shopify collection page (with pagination support)
 */
export async function getProductLinks(page: Page, collectionUrl: string): Promise<ProductLink[]> {
  console.log('🔍 Extracting product links from collection page...');

  const allLinks: ProductLink[] = [];
  const seenUrls = new Set<string>();
  let currentPage = 1;
  let hasMorePages = true;

  while (hasMorePages) {
    // Construct paginated URL (Shopify uses ?page=N)
    const pageUrl = currentPage === 1
      ? collectionUrl
      : `${collectionUrl}${collectionUrl.includes('?') ? '&' : '?'}page=${currentPage}`;

    console.log(`  Loading page ${currentPage}...`);
    await page.goto(pageUrl, { waitUntil: 'networkidle', timeout: 30000 });

    // Scroll to load lazy-loaded products
    await page.evaluate(async () => {
      await new Promise<void>((resolve) => {
        let totalHeight = 0;
        const distance = 100;
        const timer = setInterval(() => {
          const scrollHeight = document.body.scrollHeight;
          window.scrollBy(0, distance);
          totalHeight += distance;

          if (totalHeight >= scrollHeight) {
            clearInterval(timer);
            resolve();
          }
        }, 100);
      });
    });

    await page.waitForTimeout(1000);

    // Extract product links from current page
    const pageData = await page.evaluate(() => {
      const links: ProductLink[] = [];

      // Common Shopify product link selectors
      const selectors = [
        'a[href*="/products/"]',
        '.product-item a[href*="/products/"]',
        '.product-card a[href*="/products/"]',
        '.grid-product__link',
        '.product__title a',
        '[data-product-handle] a',
      ];

      selectors.forEach(selector => {
        const elements = document.querySelectorAll(selector);
        elements.forEach(element => {
          const anchor = element as HTMLAnchorElement;
          let href = anchor.href;

          // Skip if not a product URL
          if (!href.includes('/products/')) return;

          // Clean up URL (remove query params and hash)
          href = href.split('?')[0].split('#')[0];

          // Get title from link text or nearby heading
          let title = anchor.textContent?.trim() || '';
          if (!title) {
            const heading = anchor.querySelector('h1, h2, h3, h4, .product-title, .product__title');
            title = heading?.textContent?.trim() || '';
          }

          if (title && href) {
            links.push({ url: href, title });
          }
        });
      });

      // Check if there's a next page link
      const nextPageLink = document.querySelector(
        'a[rel="next"], .pagination__next, .next, a[href*="page="]'
      );
      const hasNext = nextPageLink !== null;

      return { links, hasNext };
    });

    // Add unique links from this page
    let newLinksCount = 0;
    pageData.links.forEach(link => {
      if (!seenUrls.has(link.url)) {
        seenUrls.add(link.url);
        allLinks.push(link);
        newLinksCount++;
      }
    });

    console.log(`    Found ${newLinksCount} new products on page ${currentPage}`);

    // Check if we should continue to next page
    if (!pageData.hasNext || newLinksCount === 0) {
      hasMorePages = false;
    } else {
      currentPage++;
      // Small delay between pagination requests
      await page.waitForTimeout(500);
    }
  }

  console.log(`✓ Found ${allLinks.length} total product links across ${currentPage} page(s)`);
  return allLinks;
}

/**
 * Extract product data from a Shopify product page
 */
export async function extractProductData(
  page: Page,
  productUrl: string,
  brandName: string
): Promise<ProductData | null> {
  try {
    await page.goto(productUrl, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(1000);

    // Use evaluateHandle to avoid bundler issues with function serialization
    const productData = await page.evaluate(`
      (function(brand) {
        // Define all helper functions
      function extractNumber(text) {
        const match = text.match(/[\d.]+/);
        return match ? parseFloat(match[0]) : undefined;
      }

      function convertToMm(value, unit) {
        if (unit.toLowerCase().includes('inch') || unit === 'in' || unit === '"') {
          return value * 25.4;
        }
        if (unit.toLowerCase().includes('cm')) {
          return value * 10;
        }
        return value; // Assume mm
      }

      function convertToInches(value, unit) {
        if (unit.toLowerCase().includes('cm')) {
          return value / 2.54;
        }
        if (unit.toLowerCase().includes('mm')) {
          return value / 25.4;
        }
        return value; // Assume inches
      }

      function convertToLbs(value, unit) {
        if (unit.toLowerCase().includes('kg')) {
          return value * 2.20462;
        }
        if (unit.toLowerCase().includes('oz')) {
          return value / 16;
        }
        return value; // Assume lbs
      }

      // Extract product title
      const titleElement = document.querySelector('.product__title, .product-title, h1[class*="title"], h1[class*="product"]');
      const model = titleElement?.textContent?.trim() || '';

      // Extract price - try multiple strategies
      let price = 0;

      // Strategy 1: Look for any element with price-related classes
      const priceSelectors = [
        '.price__current',
        '.product__price',
        '.price-item--regular',
        '.money',
        '[data-price]'
      ];

      for (let s = 0; s < priceSelectors.length; s++) {
        const selector = priceSelectors[s];
        const elements = document.querySelectorAll(selector);
        for (let i = 0; i < elements.length; i++) {
          const el = elements[i];
          const priceText = (el.textContent || '').trim();
          // Match price patterns like "99", "99.00", also handles "$99" and "From $99"
          const priceMatch = priceText.match(/[\\d,]+\\.?\\d*/);
          if (priceMatch) {
            const cleanPrice = priceMatch[0].replace(/,/g, '');
            const parsedPrice = parseFloat(cleanPrice);
            if (parsedPrice > 0) {
              price = parsedPrice;
              break;
            }
          }
        }
        if (price > 0) break;
      }

      // Strategy 2: Try data attributes
      if (price === 0) {
        const priceDataElement = document.querySelector('[data-price], [data-product-price]');
        if (priceDataElement) {
          const dataPrice = priceDataElement.getAttribute('data-price') || priceDataElement.getAttribute('data-product-price');
          if (dataPrice) {
            price = parseFloat(dataPrice) / 100; // Shopify stores price in cents
          }
        }
      }

      // Strategy 3: Try Shopify JSON-LD
      if (price === 0) {
        const scriptTags = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
        for (const script of scriptTags) {
          try {
            const json = JSON.parse(script.textContent || '');
            if (json.offers?.price) {
              price = parseFloat(json.offers.price);
              break;
            }
            if (json.offers?.lowPrice) {
              price = parseFloat(json.offers.lowPrice);
              break;
            }
          } catch (e) {
            // Continue to next script
          }
        }
      }

      // Strategy 4: Try Shopify product JSON
      if (price === 0) {
        const productJsonScript = document.querySelector('script[type="application/json"][data-product-json]');
        if (productJsonScript) {
          try {
            const productJson = JSON.parse(productJsonScript.textContent || '');
            if (productJson.price) {
              price = parseFloat(productJson.price) / 100;
            } else if (productJson.variants && productJson.variants.length > 0) {
              price = parseFloat(productJson.variants[0].price) / 100;
            }
          } catch (e) {
            // Continue
          }
        }
      }

      // Extract main image
      let imageUrl = '';
      const imgElement = document.querySelector('.product__media img, .product-image img, img[class*="product"]');
      if (imgElement) {
        imageUrl = imgElement.src || imgElement.dataset.src || '';
        // Clean up Shopify CDN URLs
        if (imageUrl.startsWith('//')) {
          imageUrl = 'https:' + imageUrl;
        }
      }

      // Extract description
      let description = '';
      const descElement = document.querySelector('.product__description, .product-description, [class*="description"]');
      if (descElement) {
        description = descElement.textContent?.trim() || '';
      }

      // Extract specifications from description or product details
      let thickness;
      let length;
      let width;
      let weight;
      let material;

      const fullText = description + ' ' + document.body.innerText;

      // Extract thickness (common patterns: "6mm", "1/4 inch", "0.25 inches")
      const thicknessMatch = fullText.match(/(\d+(?:\.\d+)?)\s*(mm|millimeter|inch|in|"|')/i);
      if (thicknessMatch) {
        const value = parseFloat(thicknessMatch[1]);
        const unit = thicknessMatch[2];
        thickness = convertToMm(value, unit);
      }

      // Extract dimensions (common patterns: "72" x 24"", "183cm x 61cm")
      const dimensionMatch = fullText.match(/(\d+(?:\.\d+)?)\s*(inch|in|cm|"|')\s*[xX×]\s*(\d+(?:\.\d+)?)\s*(inch|in|cm|"|')/i);
      if (dimensionMatch) {
        const lengthVal = parseFloat(dimensionMatch[1]);
        const lengthUnit = dimensionMatch[2];
        const widthVal = parseFloat(dimensionMatch[3]);
        const widthUnit = dimensionMatch[4];

        length = convertToInches(lengthVal, lengthUnit);
        width = convertToInches(widthVal, widthUnit);
      }

      // Extract weight (common patterns: "5 lbs", "2.3 kg", "80 oz")
      const weightMatch = fullText.match(/(\d+(?:\.\d+)?)\s*(lbs?|pounds?|kg|kilograms?|oz|ounces?)/i);
      if (weightMatch) {
        const value = parseFloat(weightMatch[1]);
        const unit = weightMatch[2];
        weight = convertToLbs(value, unit);
      }

      // Extract material (common keywords)
      const materials = ['PVC', 'TPE', 'Natural Rubber', 'Cork', 'Jute', 'Cotton', 'Polyurethane', 'PU', 'EVA', 'NBR'];
      for (const mat of materials) {
        if (fullText.toLowerCase().includes(mat.toLowerCase())) {
          material = mat;
          break;
        }
      }

      // Extract features (look for bullet points or feature lists)
      const features = [];
      const featureElements = document.querySelectorAll('.product__features li, .features li, [class*="feature"] li, ul li');
      for (let i = 0; i < featureElements.length; i++) {
        const el = featureElements[i];
        const text = el.textContent?.trim();
        if (text && text.length < 100) { // Avoid long paragraphs
          features.push(text);
        }
      }

      return {
        brand: brand,
        model: model,
        price: price,
        thickness: thickness,
        length: length,
        width: width,
        weight: weight,
        material: material,
        imageUrl: imageUrl || undefined,
        description: description || undefined,
        features: features.length > 0 ? features : undefined,
      };
    })("${brandName.replace(/"/g, '\\"')}")`) as ProductData;

    // Validate required fields (only model is required)
    if (!productData.model) {
      console.warn(`  ⚠ Skipping ${productUrl} - missing model name`);
      return null;
    }

    // Set default price if not found (can be updated manually later)
    if (productData.price === 0) {
      productData.price = 99; // Default placeholder price
      console.log(`  ℹ Using default price ($99) - actual price not found`);
    }

    return productData;
  } catch (error) {
    console.error(`  ❌ Error extracting data from ${productUrl}:`, error instanceof Error ? error.message : 'Unknown error');
    return null;
  }
}
