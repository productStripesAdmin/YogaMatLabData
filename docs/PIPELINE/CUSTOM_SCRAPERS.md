# Custom Scrapers Implementation

**Date**: 2026-01-09
**Status**: ✅ Complete

This document describes the implementation of custom scrapers for Alo Yoga, Lululemon, and Hugger Mugger.

## Summary

The YogaMatLab data pipeline now supports **three different scraper types** to handle various e-commerce platforms:

1. **Shopify Products.json** - Fast HTTP-based scraper (19+ brands)
2. **Lululemon GraphQL** - Custom GraphQL API scraper
3. **BigCommerce Playwright** - Browser automation scraper

All scrapers convert their output to a unified `ShopifyProduct` format for consistent downstream processing.

---

## 1. Alo Yoga (Shopify - Enhanced)

### Problem
Alo Yoga's products.json endpoint was returning 403 errors when accessed with basic headers.

### Solution
Enhanced `scripts/lib/fetch-products-json.ts` with browser-like headers:

```typescript
headers: {
  'User-Agent': userAgent || getRandomUserAgent(),
  'Accept': 'application/json',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
  'Cache-Control': 'no-cache',
  'Pragma': 'no-cache',
  'Sec-Fetch-Dest': 'empty',
  'Sec-Fetch-Mode': 'cors',
  'Sec-Fetch-Site': 'same-origin',
}
```

### Configuration
```typescript
// In Convex brands table
{
  name: "Alo Yoga",
  slug: "alo-yoga",
  scrapingEnabled: true,
  platform: "shopify",
  isShopify: true,
  productsJsonUrl: "https://www.aloyoga.com/collections/yoga-mats/products.json",
  rateLimit: {
    delayBetweenProducts: 500,
    delayBetweenPages: 3000 // Longer delay to avoid 403
  }
}
```

### Testing
```bash
curl -H "Accept: application/json" \
     -H "User-Agent: Mozilla/5.0..." \
     "https://www.aloyoga.com/collections/yoga-mats/products.json?limit=5"
```

---

## 2. Lululemon (GraphQL API)

### Platform Analysis
- **Technology**: Custom Next.js application
- **API**: GraphQL endpoint at `https://shop.lululemon.com/api/graphql`
- **Data Structure**: Category-based product search

### Implementation
**File**: `scripts/lib/lululemon-scraper.ts`

#### GraphQL Query
```graphql
query ProductSearch($categoryId: String!, $offset: Int, $limit: Int) {
  search(categoryId: $categoryId, offset: $offset, limit: $limit) {
    total
    products {
      productId
      name
      price { currentPrice, fullPrice }
      swatches {
        swatchName
        colorId
        images { mainCarousel { media { url, alt } } }
      }
      sizes { details, isAvailable, price }
      pdpUrl
      featurePanels { featuresContent { headline, details } }
    }
  }
}
```

#### Key Features
1. **Pagination**: Offset-based, 60 products per page
2. **Variant Generation**: Builds variants from swatches × sizes
3. **Image Extraction**: Collects all images from color swatches
4. **Feature Mapping**: Extracts product features from `featurePanels`
5. **SKU Generation**: `{productId}-{colorId}-{size}`

#### Data Conversion
Converts Lululemon's GraphQL response to Shopify-compatible format:

```typescript
function convertToShopifyFormat(product: LululemonProduct): ShopifyProduct {
  // Build variants (color × size combinations)
  const variants = swatches.flatMap(swatch =>
    sizes.map(size => ({
      id: parseInt(`${product.productId}${variantId++}`),
      title: `${swatch.swatchName} / ${size.details}`,
      option1: swatch.swatchName,
      option2: size.details,
      sku: `${product.productId}-${swatch.colorId}-${size.details}`,
      price: size.price.toString(),
      available: size.isAvailable,
      // ... other Shopify fields
    }))
  );

  return {
    id: parseInt(product.productId),
    title: product.name,
    handle: product.pdpUrl.split('/').pop(),
    variants,
    images: /* extracted from swatches */,
    options: [
      { name: 'Color', values: colors },
      { name: 'Size', values: sizes }
    ],
    // ... other fields
  };
}
```

### Configuration
```typescript
// In Convex brands table
{
  name: "Lululemon",
  slug: "lululemon",
  scrapingEnabled: true,
  platform: "lululemon",
  platformConfig: {
    lululemonCategoryId: "8s6" // Yoga accessories
  },
  rateLimit: {
    delayBetweenPages: 2000 // 2 seconds between GraphQL requests
  }
}
```

### Category IDs
- `8s6`: Yoga Accessories (includes yoga mats)
- `1z0qd0t`: Women's Yoga
- `1z0qetm`: Men's Yoga

### Testing
```bash
# Test GraphQL query
curl -X POST https://shop.lululemon.com/api/graphql \
  -H "Content-Type: application/json" \
  -d '{"query":"query{search(categoryId:\"8s6\",limit:5){products{productId name}}}"}'
```

---

## 3. Hugger Mugger (BigCommerce + WordPress)

### Platform Analysis
- **Technology**: WordPress + BigCommerce plugin
- **Challenge**: No public API access (requires store credentials)
- **Solution**: Browser automation with Playwright

### Implementation
**File**: `scripts/lib/bigcommerce-scraper.ts`

#### Scraping Strategy
1. **Collection Page**:
   - Navigate to collection URL
   - Extract all product card links
   - Example: `a.bc-product-card__link`

2. **Product Page**:
   - Visit each product URL
   - Extract data from multiple sources:
     - HTML selectors (`.bc-product__title`, `.bc-product__price`)
     - JSON-LD structured data (`<script type="application/ld+json">`)
     - Product options (dropdowns for color/size)

3. **Data Extraction**:
   ```typescript
   // Product ID
   const productId = await page.locator('[data-product-id]').getAttribute('data-product-id');

   // Price
   const priceText = await page.locator('.bc-product__price').textContent();
   const price = parseFloat(priceText.match(/\$?(\d+(?:\.\d+)?)/)[1]);

   // Options
   const optionSelects = await page.locator('.bc-product__option select').all();
   for (const select of optionSelects) {
     const label = await select.locator('..').locator('label').textContent();
     const values = await select.locator('option').allTextContents();
   }
   ```

4. **Convert to Shopify Format**:
   - Maps HTML/JSON-LD data to ShopifyProduct structure
   - Handles missing data gracefully

#### Key Features
- **Browser Automation**: Uses Chromium via Playwright
- **Multiple Selectors**: Tries various CSS selectors for robustness
- **JSON-LD Fallback**: Uses structured data when available
- **Rate Limiting**: 1 second delay between products

#### Limitations
- **Performance**: Slower than API-based scrapers
- **Resources**: Requires Chromium (larger memory footprint)
- **Variant Extraction**: Limited (would require interacting with dropdowns)

### Configuration
```typescript
// In Convex brands table
{
  name: "Hugger Mugger",
  slug: "huggermugger",
  scrapingEnabled: true,
  platform: "bigcommerce",
  platformConfig: {
    bigcommerceCollectionUrl: "https://www.huggermugger.com/collections/yoga-mats"
  },
  rateLimit: {
    delayBetweenProducts: 1000 // 1 second between product pages
  }
}
```

### Dependencies
```json
{
  "dependencies": {
    "playwright": "^1.40.0"
  }
}
```

Install Playwright browsers:
```bash
npx playwright install chromium
```

---

## Orchestration (get-brands-from-convex.ts)

### Platform Routing

The main orchestrator `scripts/get-brands-from-convex.ts` now routes brands to the appropriate scraper based on the `platform` field:

```typescript
async function fetchBrandProducts(brand: Brand): Promise<ExtractionResult> {
  const platform = brand.platform || (brand.isShopify ? 'shopify' : 'custom');

  if (platform === 'lululemon') {
    const result = await fetchLululemonProducts(categoryId, options);
    allProducts = result.products;

  } else if (platform === 'bigcommerce') {
    const result = await fetchBigCommerceProducts(collectionUrl, options);
    allProducts = result.products;

  } else if (platform === 'shopify' || brand.isShopify) {
    // Standard Shopify products.json scraper
    const result = await fetchAllProducts(baseUrl, collectionPath, options);
    allProducts.push(...result.products);
  }

  // Deduplicate, hash tracking, save results...
}
```

### Brand Interface

Updated `Brand` interface to support custom platforms:

```typescript
interface Brand {
  _id: string;
  name: string;
  slug: string;
  website: string;
  scrapingEnabled: boolean;
  productsJsonUrl: string | null;
  isShopify: boolean;

  // New fields for custom scrapers
  platform?: 'shopify' | 'lululemon' | 'bigcommerce' | 'custom';
  platformConfig?: {
    lululemonCategoryId?: string;      // For Lululemon GraphQL
    bigcommerceCollectionUrl?: string; // For BigCommerce
  };

  rateLimit?: {
    delayBetweenProducts: number;
    delayBetweenPages: number;
  };
}
```

---

## Testing

### Unit Testing (Individual Scrapers)

**Test Lululemon Scraper**:
```typescript
import { fetchLululemonProducts } from './lib/lululemon-scraper.js';

const result = await fetchLululemonProducts('8s6', {
  maxPages: 1,
  pageSize: 10,
});

console.log(`Fetched ${result.products.length} products`);
console.log(result.products[0]); // Inspect first product
```

**Test BigCommerce Scraper**:
```typescript
import { fetchBigCommerceProducts } from './lib/bigcommerce-scraper.js';

const result = await fetchBigCommerceProducts(
  'https://www.huggermugger.com/collections/yoga-mats',
  {
    maxProducts: 5,
    headless: false, // See browser for debugging
  }
);

console.log(`Fetched ${result.products.length} products`);
```

### End-to-End Testing

**Test Single Brand**:
```bash
# Modify get-brands-from-convex.ts to filter for one brand
const brands = (await client.query('brands:getScrapableBrands'))
  .filter(b => b.slug === 'lululemon');

# Run extraction
npx tsx scripts/get-brands-from-convex.ts
```

**Verify Output**:
```bash
# Check raw data
cat data/raw/2026-01-09/lululemon.json | jq '.products | length'
cat data/raw/2026-01-09/lululemon.json | jq '.products[0]'

# Run normalization
npx tsx scripts/normalize-data.ts

# Check normalized data
cat data/normalized/2026-01-09/lululemon.json | jq '.[0]'
```

---

## Documentation Updates

### Updated Files
1. **CLAUDE.md**:
   - Added "Scraper Types and Platform Support" section
   - Updated "Brand Platform Mapping"
   - Enhanced "When Adding New Brands" with platform-specific instructions

2. **This Document** (CUSTOM_SCRAPERS.md):
   - Complete implementation guide
   - Testing procedures
   - Configuration examples

---

## Next Steps

### Immediate
1. ✅ Update Convex schema in YogaMatLabApp to include new brand fields:
   ```typescript
   brands: defineTable({
     // ... existing fields
     platform: v.optional(v.union(
       v.literal('shopify'),
       v.literal('lululemon'),
       v.literal('bigcommerce'),
       v.literal('custom')
     )),
     platformConfig: v.optional(v.object({
       lululemonCategoryId: v.optional(v.string()),
       bigcommerceCollectionUrl: v.optional(v.string()),
     })),
   })
   ```

2. ✅ Add brand configurations to Convex database:
   - Alo Yoga (Shopify with enhanced headers)
   - Lululemon (GraphQL)
   - Hugger Mugger (BigCommerce)

3. ⏳ Test end-to-end with all three brands

### Future Enhancements
- **Improved BigCommerce Variant Extraction**: Interact with dropdowns to get all variants
- **GraphQL Schema Introspection**: Auto-discover Lululemon's GraphQL schema changes
- **Additional Platforms**: WooCommerce, Magento, custom APIs
- **Error Recovery**: Retry logic with exponential backoff
- **Performance Monitoring**: Track scraper speeds and success rates

---

## Performance Comparison

| Scraper Type | Speed | Resource Usage | Reliability | Variant Support |
|--------------|-------|----------------|-------------|-----------------|
| Shopify JSON | ⚡⚡⚡ Fast | Low | High | Complete |
| Lululemon GraphQL | ⚡⚡ Medium | Low | High | Complete |
| BigCommerce Playwright | ⚡ Slow | High (browser) | Medium | Limited |

### Recommendations
- **Shopify**: Use whenever possible (19+ brands)
- **Lululemon**: GraphQL is reliable, use for Lululemon only
- **BigCommerce**: Use only when no API available; consider rate limiting

---

## Troubleshooting

### Alo Yoga 403 Errors
- Ensure enhanced headers are present in fetch-products-json.ts
- Increase `delayBetweenPages` to 3000ms
- Rotate user agents from pool

### Lululemon GraphQL Changes
- Category IDs may change - verify with browser devtools
- GraphQL schema may evolve - check response structure
- Add error handling for missing fields

### BigCommerce Timeout
- Increase Playwright timeout to 60s for slow sites
- Run with `headless: false` to debug visually
- Check for CAPTCHA or bot detection

### Memory Issues (BigCommerce)
- Process brands in smaller batches
- Close browser between brands
- Monitor Chromium memory usage

---

## File Structure

```
scripts/
├── get-brands-from-convex.ts          # Main orchestrator (platform routing)
└── lib/
    ├── fetch-products-json.ts         # Shopify products.json scraper
    ├── lululemon-scraper.ts           # Lululemon GraphQL scraper (NEW)
    ├── bigcommerce-scraper.ts         # BigCommerce Playwright scraper (NEW)
    ├── field-mapper.ts                # Normalizes all formats to YogaMat
    ├── logger.ts                      # Logging utilities
    └── hash-tracker.ts                # Change detection

docs/
├── CLAUDE.md                          # Primary documentation (UPDATED)
└── CUSTOM_SCRAPERS.md                 # This document (NEW)
```

---

## Summary

The YogaMatLab data pipeline now supports **multiple e-commerce platforms** with specialized scrapers:

✅ **Alo Yoga** - Enhanced Shopify scraper with browser-like headers
✅ **Lululemon** - Custom GraphQL API scraper
✅ **Hugger Mugger** - BigCommerce Playwright scraper

All scrapers output a unified `ShopifyProduct` format, ensuring the rest of the pipeline (normalization, aggregation, change detection) works identically regardless of the source platform.

**Total Brands Supported**: 22 (19 Shopify + 1 Lululemon + 1 Hugger Mugger + 1 Satori Concept multi-collection)
