# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Purpose

YogaMatLabData is a data pipeline repository that scrapes yoga mat product information from 19+ Shopify brand websites, normalizes the data to a unified schema, and makes it available to the [YogaMatLabApp](https://github.com/productStripesAdmin/YogaMatLabApp) application. The pipeline runs daily via GitHub Actions to keep product data current.

## Core Architecture

### Data Flow
1. **Extract** → Scrape product data from brand Shopify stores using Playwright
2. **Normalize** → Transform raw Shopify data to unified YogaMat schema
3. **Aggregate** → Combine all brands into single dataset
4. **Detect Changes** → Diff against previous day to track additions/removals/updates
5. **Download Images** → Fetch and optimize product images

### Directory Structure
```
YogaMatLabData/
├── config/
│   └── field-mappings.json      # Shopify → YogaMat field transformations
├── scripts/
│   ├── extract-all-brands.ts    # Main orchestrator (queries Convex for brands)
│   ├── normalize-data.ts        # Data transformation
│   ├── aggregate-data.ts        # Combine all brands
│   ├── detect-changes.ts        # Change detection
│   ├── download-images.ts       # Batch image downloader
│   └── lib/
│       ├── shopify-scraper.ts   # Playwright-based Shopify scraper
│       ├── image-downloader.ts  # Image fetching with Sharp
│       ├── field-mapper.ts      # Field mapping logic
│       └── logger.ts            # Structured logging
├── data/
│   ├── raw/{date}/              # Daily Shopify extractions (by brand)
│   ├── normalized/{date}/       # Transformed to YogaMat schema
│   ├── aggregated/{date}/       # Combined datasets
│   │   └── all-products.json        # Single file with all products
│   └── changes/                 # Daily changeset logs
└── .github/workflows/
    └── fetch-products.yml     # Automated daily pipeline
```

## Data Schema

### YogaMat Type
The unified product schema is defined in `types/yogaMat.ts`. Key types:
- `YogaMat` - Main product type (references Convex schema)
- `Brand` - Brand information
- `MaterialType` - Material categories (PVC, TPE, Natural Rubber, Cork, etc.)
- `YogaStyle` - Compatible yoga styles (Vinyasa, Hot Yoga, etc.)
- `YogaMatFeature` - Product features (Eco-Friendly, Non-Slip, etc.)

### ProductData (Raw Shopify)
Raw scraped data structure from `scripts/lib/shopify-scraper.ts`:
```typescript
{
  brand: string
  model: string
  price: number
  thickness?: number  // in mm
  length?: number     // in inches
  width?: number      // in inches
  weight?: number     // in lbs
  material?: string
  texture?: string
  imageUrl?: string
  description?: string
  features?: string[]
  variants?: Array<{name: string, price: number}>
}
```

## Development Commands

### Running the Pipeline
Since package.json doesn't exist yet, the intended commands will be:
```bash
# Run full pipeline (once package.json is created)
npm run extract-all    # Extract from all brands
npm run normalize      # Transform to YogaMat schema
npm run aggregate      # Combine into single dataset
npm run detect-changes # Generate changeset

# Or run all at once
npm run pipeline       # Runs all steps sequentially
```

### Manual Execution (Current)
```bash
# Using tsx directly
npx tsx scripts/extract-all-brands.ts
npx tsx scripts/normalize-data.ts
npx tsx scripts/aggregate-data.ts
npx tsx scripts/detect-changes.ts
```

## Key Implementation Details

### Shopify Scraper (`scripts/lib/shopify-scraper.ts`)
- Uses Playwright for browser automation
- Handles pagination automatically (Shopify's `?page=N` pattern)
- Supports lazy-loading with scroll behavior
- Multiple fallback strategies for price extraction:
  1. Price-related CSS classes
  2. Data attributes
  3. JSON-LD structured data
  4. Shopify product JSON
- Converts all units to standard: mm (thickness), inches (dimensions), lbs (weight)
- Defaults to $99 if price not found

### Image Downloader (`scripts/lib/image-downloader.ts`)
- Uses Sharp for image optimization
- Resizes to max 1200px width
- Converts to JPEG (quality: 85) for consistency
- Processes in configurable batches (default: 3 concurrent)
- Saves to slug-based filenames: `{brand-slug}-{model-slug}.jpg`

### Brand Configuration (Convex)
Brand scraping configuration is stored in YogaMatLabApp's Convex `brands` table with these fields:
```typescript
{
  // Standard brand fields
  name: string
  slug: string
  website: string

  // Scraping configuration
  scrapingEnabled: boolean              // Toggle scraping on/off
  shopifyCollectionUrl: string | null   // e.g., "/collections/yoga-mats"
  isShopify: boolean
  rateLimit: {
    delayBetweenProducts: number        // ms between product pages (default: 500)
    delayBetweenPages: number           // ms between collection pages (default: 1000)
  }
}
```

The pipeline queries `api.brands.getScrapableBrands` at runtime to fetch enabled brands.

### Error Handling
- Individual brand failures don't stop the pipeline
- All errors logged to `logs/{date}.log`
- Pipeline continues to next brand on failure
- Validation errors skip invalid products but continue processing

## Integration with YogaMatLabApp

### Git Submodule
YogaMatLabApp includes this repo as a git submodule at `data/external/`:
```bash
# In YogaMatLabApp
git submodule update --remote data/external
npm run import-mats  # Import to Convex database
```

### Data Consumption
YogaMatLabApp reads from `data/aggregated/latest/all-products.json` via the submodule and imports to Convex database using `api.yogaMats.bulkUpsert` mutation.

## GitHub Actions Automation

### Daily Pipeline
- Runs at 2 AM UTC daily (`cron: 0 2 * * *`)
- Also supports manual trigger via `workflow_dispatch`
- Fetches products using simple HTTP requests (no Playwright needed!)
- Commits results with detailed changeset summary
- Creates GitHub issue on failure
- Uploads logs as artifacts (30-day retention)

### Workflow Steps
1. Checkout repository
2. Setup Node.js 20 with npm cache
3. Install dependencies (`npm ci`)
4. Create `.env` from secrets
5. Run full pipeline (`npm run pipeline`)
6. Update `latest/` symlinks
7. Generate commit message from changeset
8. Commit and push results
9. Upload logs as artifacts
10. Create issue if failed
11. Post execution summary

### Required Secrets
- `CONVEX_URL` - Convex deployment URL for querying brands table (required)
- `PAT_TOKEN` - Personal Access Token for cross-repo commits (optional, uses `github.token` by default)

### Commit Message Format
```
Data update: YYYY-MM-DD

📊 Changes detected:
- New products: X
- Removed products: Y
- Price changes: Z
- Total changes: N

🤖 Generated with YogaMatLab Data Pipeline
Run: #123
```

## Scraper Types and Platform Support

The pipeline supports three different scraper types to handle various e-commerce platforms:

### 1. Shopify Products.json Scraper ✅ (Primary)
**File**: `scripts/lib/fetch-products-json.ts`

**How it works**:
- Fetches from Shopify's public `/collections/{path}/products.json` API
- No browser automation needed - simple HTTP requests
- Supports pagination (up to 250 products per page)
- Handles multiple collections via pipe-delimited URLs

**Configuration**:
```typescript
{
  platform: 'shopify',
  isShopify: true,
  productsJsonUrl: 'https://brand.com/collections/yoga-mats/products.json',
  // Multiple collections:
  productsJsonUrl: 'https://brand.com/collections/mats/products.json|https://brand.com/collections/props/products.json'
}
```

**Brands using this**:
- Alo Yoga, Liforme, Jade Yoga, Yolo Ha Yoga, Scoria World
- Gaiam, Yogi-Bare, Bala, 42 Birds, Ananday
- Oko Living, HeatHyoga, Stakt, Sensu, Wolo Yoga
- Keep Store, Yoga Matters, House of Mats, Shakti Warrior, Satori Concept

**Advantages**:
- Fast and reliable (no browser needed)
- Low resource usage
- Built-in pagination
- Complete product data including variants, images, options

**Enhanced headers for Alo Yoga**:
Added browser-like headers to bypass 403 blocks:
- Accept-Language, Accept-Encoding
- Sec-Fetch-* headers for CORS compliance
- User-Agent rotation from pool

### 2. Lululemon GraphQL Scraper ✅
**File**: `scripts/lib/lululemon-scraper.ts`

**How it works**:
- Queries Lululemon's GraphQL API at `https://shop.lululemon.com/api/graphql`
- Uses category-based product search with pagination
- Converts GraphQL response to Shopify-compatible format

**Configuration**:
```typescript
{
  platform: 'lululemon',
  platformConfig: {
    lululemonCategoryId: '8s6' // yoga accessories category
  }
}
```

**GraphQL Query Structure**:
```graphql
query ProductSearch($categoryId: String!, $offset: Int, $limit: Int) {
  search(categoryId: $categoryId, offset: $offset, limit: $limit) {
    total
    products {
      productId
      name
      price { currentPrice, fullPrice }
      swatches { swatchName, colorId, images }
      sizes { details, isAvailable, price }
      pdpUrl
      featurePanels { featuresContent }
    }
  }
}
```

**Data Conversion**:
- Builds variants from color swatches × sizes
- Extracts features from `featurePanels`
- Maps images from all color swatches
- Generates SKUs from productId + colorId + size

**Category IDs**:
- `8s6`: Yoga Accessories (includes yoga mats)
- `1z0qd0t`: Women's Yoga
- `1z0qetm`: Men's Yoga

**Advantages**:
- Official API (more stable than scraping)
- Rich product data with variants
- Supports pagination (60 products per page)
- No browser automation needed

### 3. BigCommerce Playwright Scraper ✅
**File**: `scripts/lib/bigcommerce-scraper.ts`

**How it works**:
- Uses Playwright browser automation
- Extracts product links from collection pages
- Visits each product page to extract detailed data
- Parses HTML and JSON-LD structured data

**Configuration**:
```typescript
{
  platform: 'bigcommerce',
  platformConfig: {
    bigcommerceCollectionUrl: 'https://www.huggermugger.com/collections/yoga-mats'
  }
}
```

**Extraction Strategy**:
1. Navigate to collection page
2. Extract all product card links
3. Visit each product page
4. Extract data from:
   - HTML selectors (`.bc-product__title`, `.bc-product__price`)
   - JSON-LD structured data (`<script type="application/ld+json">`)
   - Product option dropdowns (colors, sizes)
5. Convert to Shopify-compatible format

**Brands using this**:
- Hugger Mugger (WordPress + BigCommerce plugin)

**Limitations**:
- Slower than API-based scrapers (browser automation)
- Higher resource usage (Chromium instance)
- Rate limiting important (1s delay between products)
- Variant extraction limited (requires dropdown interaction)

**Advantages**:
- Works with any rendered HTML (no API needed)
- Can extract from WordPress + BigCommerce hybrid sites
- Handles JavaScript-rendered content

## Brand Platform Mapping

### Shopify Brands (19+)
All brands use `/collections/{slug}/products.json` endpoints:
- **Alo Yoga** (`aloyoga.com/collections/yoga`) - Enhanced headers for 403 bypass
- Liforme, Jade Yoga, Yolo Ha Yoga, Scoria World
- Gaiam, Yogi-Bare, Bala, 42 Birds, Ananday
- Oko Living, HeatHyoga, Stakt, Sensu, Wolo Yoga
- Keep Store, Yoga Matters, House of Mats, Shakti Warrior
- **Satori Concept** (4 collections via pipe-delimited URLs)

### Lululemon (GraphQL API)
- **Lululemon** - Custom Next.js + GraphQL implementation

### BigCommerce Brands
- **Hugger Mugger** - WordPress + BigCommerce plugin (Playwright scraper)

### Future Brands (Pending Implementation)
Require investigation and custom scrapers:
- Sugamats, Byoga, Grip Yoga, EcoYoga

## Important Constraints

### Politeness
- Sequential brand processing (no parallel requests)
- Configurable delays between requests
- User agent identifies as "YogaMatLab Data Pipeline"

### Data Validation
- Only `model` is strictly required
- Missing `price` defaults to $99
- Invalid products logged but skipped
- All products validated against YogaMat schema

### Change Detection
Tracks three types of changes:
1. **New products** - In current day, not in previous
2. **Removed products** - In previous day, not in current (for redirect setup)
3. **Updated products** - Price changes, spec changes

## File Naming Conventions
- Raw data: `data/raw/{YYYY-MM-DD}/{brand-slug}.json`
- Normalized: `data/normalized/{YYYY-MM-DD}/{brand-slug}.json`
- Aggregated: `data/aggregated/{YYYY-MM-DD}/all-products.json`
- Changes: `data/changes/{YYYY-MM-DD}-changeset.json`
- Images: `{brand-slug}-{model-slug}.jpg`

## Dependencies (Planned)
```json
{
  "dependencies": {
    "playwright": "^1.x",
    "sharp": "^0.x",
    "zod": "^3.x",
    "convex": "^1.x"
  },
  "devDependencies": {
    "typescript": "^5.x",
    "tsx": "^4.x"
  }
}
```

## Implementation Status

### Phase 1: Core Extraction ✅ COMPLETE
- Convex brand query integration
- Products.json fetching (replaced Playwright scraping)
- Rate limiting and error handling
- Multi-brand orchestration

### Phase 2: Data Processing ✅ COMPLETE
- Field mapping configuration
- Normalization to YogaMat schema
- Data aggregation with statistics
- Change detection between runs

### Phase 3: Automation ✅ COMPLETE
- GitHub Actions workflow (daily at 2 AM UTC)
- Latest symlinks updater
- Automatic commits with changeset summary
- Failure notifications via GitHub issues
- Workflow runs successfully with partial brand failures

### Phase 4: Integration with YogaMatLabApp 🔄 IN PROGRESS
- See `INTEGRATION_INSTRUCTIONS.md` for complete setup guide
- Git submodule configuration
- Convex bulk upsert mutation (pending in YogaMatLabApp)
- Import script (pending in YogaMatLabApp)

### Phase 5: Documentation 📝 ONGOING
- README.md ✅
- CLAUDE.md ✅
- DATA_PIPELINE.md ✅
- INTEGRATION_INSTRUCTIONS.md ✅
- GitHub Actions setup guide ✅

## Notes for AI Assistants

### When Adding New Brands

#### Shopify Brands (Easiest)
1. Add to YogaMatLabApp's Convex `brands` table:
   ```typescript
   {
     scrapingEnabled: true,
     platform: 'shopify',  // or omit (defaults to shopify if isShopify: true)
     isShopify: true,
     productsJsonUrl: 'https://brand.com/collections/yoga-mats/products.json',
     rateLimit: { delayBetweenProducts: 500, delayBetweenPages: 1000 }
   }
   ```
2. Test: `curl "https://brand.com/collections/yoga-mats/products.json?limit=10"`
3. For multiple collections, use pipe-delimited URLs:
   ```
   productsJsonUrl: 'url1/products.json|url2/products.json|url3/products.json'
   ```

#### Lululemon
1. Add to Convex `brands` table:
   ```typescript
   {
     scrapingEnabled: true,
     platform: 'lululemon',
     platformConfig: {
       lululemonCategoryId: '8s6' // yoga accessories
     },
     rateLimit: { delayBetweenPages: 2000 } // 2s between GraphQL pages
   }
   ```
2. No testing needed - scraper auto-configured

#### BigCommerce Brands
1. Add to Convex `brands` table:
   ```typescript
   {
     scrapingEnabled: true,
     platform: 'bigcommerce',
     platformConfig: {
       bigcommerceCollectionUrl: 'https://www.brand.com/collections/yoga-mats'
     },
     rateLimit: { delayBetweenProducts: 1000 } // 1s between products
   }
   ```
2. Test with browser to verify collection page loads
3. Note: Slower than other scrapers (browser automation)

#### Unknown Platform
1. Investigate the brand's e-commerce platform:
   - Check HTML for platform indicators (Shopify, BigCommerce, WooCommerce, etc.)
   - Look for API endpoints in Network tab
   - Check for JSON-LD structured data
2. If Shopify, follow Shopify instructions above
3. If custom platform, create new scraper in `scripts/lib/{brand}-scraper.ts`
4. Update `get-brands-from-convex.ts` to route to new scraper

### When Modifying Scrapers
- Test on 2-3 brands before running full pipeline
- Shopify scraper has 4 price extraction fallbacks - maintain all
- Unit conversion functions in scraper are critical - don't break
- Always respect rate limits

### When Working with Data Schema
- YogaMat type references Convex schema in YogaMatLabApp
- Any schema changes require coordination with YogaMatLabApp
- Maintain backwards compatibility for existing data files

### Required Convex Setup (in YogaMatLabApp)
Before the pipeline can run, YogaMatLabApp must have:
1. **Brands schema** with scraping fields (see Brand Configuration section above)
2. **Convex query**: `convex/brands/getScrapableBrands.ts` that returns brands with `scrapingEnabled: true`
   ```typescript
   // Example query structure
   export const getScrapableBrands = query({
     handler: async (ctx) => {
       return await ctx.db
         .query("brands")
         .filter((q) => q.eq(q.field("scrapingEnabled"), true))
         .collect();
     },
   });
   ```
