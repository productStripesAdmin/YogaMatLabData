# DATA PIPELINE (Planning)

## Prompt

I want to create a data pipeline for [YogaMatLabApp](https://github.com/productStripesAdmin/YogaMatLabApp)

- For a given brand url, scrap product data
- Normalize the data
- Aggregate the data into a single file
- Make the data available to YogaMatLabApp
- Most brand website are shopify stores and have a products.json endpoint
- Some, however, are not shopify and don't have a products.json endpoint
- Run the pipeline frequently - every 24 hours at least - to ensure products are up to date. Products that have been removed should be logged so that redirects can be set-up as needs be.

> [!NOTE]
> The data pipeline code and associated data will all be held in a separate repo: [YogaMatLabData](https://github.com/productStripesAdmin/YogaMatLabData)

## Brand URLs with products.json endpoints

https://www.aloyoga.com/collections/yoga/products.json (or /en-sg if needed)
https://liforme.com/collections/yoga-mats/products.json
https://jadeyoga.com/collections/yoga-mats/products.json
https://yolohayoga.com/collections/yoga-mats/products.json
https://www.scoriaworld.com/collections/all-adult-cork-yoga-mats/products.json
https://www.gaiam.com/collections/printed-yoga-mats/products.json
https://www.yogi-bare.co.uk/collections/yoga-mats/products.json
https://shopbala.com/collections/mats/products.json
https://42birds.com/collections/cork-yoga-mats/products.json
https://ananday.com/collections/yoga-mats/products.json
https://okoliving.com/collections/mats/products.json
https://www.heathyoga.net/collections/tpe-alignment-yoga-mats/products.json
https://shopstakt.com/collections/stakt-mats/products.json
https://sensu.co/collections/all/products.json (for all products)
https://woloyoga.com/collections/yoga-mats/products.json
https://keepstore.com/collections/portable-yoga-mat-width-61cm/products.json
https://www.yogamatters.com/collections/yoga-mats/products.json
https://www.houseofmats.com/en-eu/collections/yoga-mats/products.json
https://www.shaktiwarriorshop.com/collections/mats/products.json

## Brand URLs without a products.json endpoints

https://shop.lululemon.com/c/yoga-mats/n1ac4r
https://www.sugamats.com/buy
https://www.huggermugger.com/mats/
https://byogamat.com/
https://gripyoga.com/yoga-mats/
https://www.ecoyoga.uk/

## Implementation Plan

Here is Claude's plan:
╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌
Data Pipeline Implementation Plan

Overview

Create an automated data pipeline to extract yoga mat product data from 19 Shopify brand websites daily, normalize to a unified schema, detect changes, and make data available to
YogaMatLabApp.

Strategy:
- Use existing Shopify scraper (fast, free, no API costs)
- Separate YogaMatLabData repository for data storage
- GitHub Actions for daily automated extraction (2 AM UTC)
- File-based change detection for redirect management
- Git submodule integration with YogaMatLabApp

Architecture

YogaMatLabData/
├── config/
│   └── field-mappings.json      # Shopify → YogaMat field transformations
│   └── enrichment.json          # Optional product-page enrichment rules
├── scripts/
│   ├── get-brands-from-convex.ts # Main orchestrator (queries Convex for brands)
│   ├── enrich-data.ts           # Optional product-page enrichment (HTML → structured fields)
│   ├── normalize-data.ts        # Shopify → YogaMat schema
│   ├── aggregate-data.ts        # Combine all brands
│   ├── detect-changes.ts        # Diff against previous day
│   ├── download-images.ts       # Batch image downloader
│   └── lib/
│       ├── shopify-scraper.ts   # Copy from YogaMatLabApp
│       ├── image-downloader.ts  # Copy from YogaMatLabApp
│       ├── field-mapper.ts      # Field transformations
│       └── logger.ts            # Structured logging
├── data/
│   ├── raw/{date}/              # Daily Shopify extractions
│   ├── normalized/{date}/       # Transformed to YogaMat schema
│   ├── aggregated/{date}/       # Combined datasets
│   │   └── all-products.json        # Single file with all mats
│   └── changes/                 # Changeset logs
└── .github/workflows/
    └── fetch-products.yml     # GitHub Actions automation

Brand Configuration (in YogaMatLabApp Convex):
- Brand scraping settings stored in Convex `brands` table
- Query via `api.brands.getScrapableBrands` at runtime
- No static config file needed

Implementation Phases

Phase 1: Core Extraction (Priority 1)

Files to create:

1. scripts/get-brands-from-convex.ts
  - Purpose: Main orchestrator that extracts from all brands sequentially
  - Key logic:
      - Query Convex for brands: `await client.query(api.brands.getScrapableBrands)`
    - Launch Playwright browser (headless)
    - For each enabled brand (filter by `scrapingEnabled: true`):
          - Construct full collection URL from brand website + shopifyCollectionUrl
      - Verify it's a Shopify site
      - Get product links with pagination
      - Extract product data from each link
      - Respect brand-specific rate limits from Convex
      - Save to data/raw/{date}/{brand-slug}.json
    - Handle individual brand failures gracefully (continue to next)
    - Generate extraction summary
  - Dependencies: shopify-scraper.ts, logger.ts, convex/browser (ConvexHttpClient)
  - Environment: Requires CONVEX_URL
2. scripts/lib/shopify-scraper.ts
  - Action: Copy from YogaMatLabApp/scripts/lib/shopify-scraper.ts
  - No modifications needed - works as-is
3. scripts/lib/logger.ts
  - Purpose: Structured console + file logging
  - Methods: info(), warn(), error()
  - Output: Console + logs/{date}.log
4. package.json
  - Dependencies: playwright, typescript, tsx, zod, convex
  - Scripts:
  {
  "fetch": "tsx scripts/get-brands-from-convex.ts",
  "enrich": "tsx scripts/enrich-data.ts",
  "normalize": "tsx scripts/normalize-data.ts",
  "aggregate": "tsx scripts/aggregate-data.ts",
  "detect-changes": "tsx scripts/detect-changes.ts"
}
5. .env (for local development)
  - CONVEX_URL=https://your-deployment.convex.cloud

Notes on Convex integration:
- For type safety, can optionally link/copy convex/_generated/ from YogaMatLabApp
- Alternative: Use dynamic imports without types (simpler for initial implementation)

Test manually: npm run fetch should extract 2-3 test brands successfully

Phase 2: Data Processing (Priority 2)

Files to create:

1. config/field-mappings.json
  - Purpose: Define Shopify → YogaMat field transformations
  - Content:
  {
  "shopifyToYogaMat": {
    "brand": { "source": "brand", "type": "string", "required": true },
    "model": { "source": "model", "type": "string", "required": true },
    "price": { "source": "price", "type": "number", "default": 99 },
    "thickness": { "source": "thickness", "type": "number", "unit": "mm", "default": 5 }
    // ... more mappings
  },
  "performanceMetricsDefaults": {
    "gripDry": 5, "gripWet": 5, "cushioning": 5,
    "durability": 5, "ecoRating": 5
  }
}
2. scripts/lib/field-mapper.ts
  - Purpose: Apply field mappings with validation
  - Methods:
      - mapShopifyToYogaMat(rawProduct, config) - Transform single product
    - generateSlug(brand, model) - Create URL-safe slug
    - validateMat(mat) - Schema validation against YogaMat type
  - Returns: Normalized YogaMat object
3. scripts/normalize-data.ts
  - Purpose: Transform raw Shopify extractions to YogaMat schema
  - Logic:
      - Read all files from data/raw/{date}/
    - For each brand file:
          - Load raw products array
      - Apply field mapper to each product
      - Validate against YogaMat schema
      - Set defaults for missing performance metrics
      - Generate unique slugs
    - Save to data/normalized/{date}/{brand-slug}.json
  - Output: YogaMat[] array per brand
4. scripts/aggregate-data.ts
  - Purpose: Combine all brands into single dataset
  - Logic:
      - Read all files from data/normalized/{date}/
    - Combine into single array
    - Ensure unique slugs (handle collisions with -2, -3 suffix)
    - Generate supporting files:
          - all-products.json - Combined array
      - all-products.csv - CSV export
      - brands-index.json - Brand metadata + counts
      - stats.json - Extraction statistics
    - Save to data/aggregated/{date}/
  - Output: Aggregated dataset
5. scripts/detect-changes.ts
  - Purpose: Diff against previous day's extraction
  - Logic:
      - Load data/aggregated/{prev-date}/all-products.json
    - Load data/aggregated/{curr-date}/all-products.json
    - Compare by slug:
          - New products (in current, not in previous)
      - Removed products (in previous, not in current)
      - Price changes (same slug, different price)
      - Spec changes (dimensions, materials)
    - Save changeset to data/changes/{date}-changeset.json
  - Output: Changeset with new/removed/changed products

Test manually: Run full pipeline npm run fetch && npm run enrich && npm run normalize && npm run aggregate && npm run detect-changes

Phase 3: Automation (Priority 3)

Files to create:

1. .github/workflows/fetch-products.yml
  - Purpose: GitHub Actions workflow for daily automation
  - Trigger: Cron schedule 0 2 * * * (2 AM UTC daily)
  - Also: Manual trigger via workflow_dispatch
  - Steps:
      - Checkout YogaMatLabData repo
    - Checkout YogaMatLabApp repo (for image storage)
    - Setup Node.js 20
    - Install dependencies + Playwright browsers
    - Run extraction pipeline (fetch → enrich → normalize → aggregate → detect-changes)
    - Download images to YogaMatLabApp
    - Update latest/ symlinks
    - Commit results to both repos
    - Send notification on failure (create GitHub issue)
  - Secrets needed:
      - PAT_TOKEN (Personal Access Token for cross-repo commits)
    - CONVEX_URL (Convex deployment URL for querying brands)
2. scripts/download-images.ts
  - Purpose: Batch download product images to YogaMatLabApp repo
  - Logic:
      - Read all mats from data/normalized/{date}/
    - Collect image URLs
    - Check if image already exists in YogaMatLabApp/public/images/mats/
    - Download missing images in batches of 5 (concurrency limit)
    - Optimize with Sharp (resize, convert to JPEG)
    - Save with slug-based filenames: {brand-slug}-{model-slug}.jpg
  - Dependencies: Copy image-downloader.ts from YogaMatLabApp
3. scripts/update-latest-symlinks.ts
  - Purpose: Update latest/ symlinks after successful extraction
  - Logic:
      - Create/update symlinks:
          - data/raw/latest → data/raw/{date}
      - data/normalized/latest → data/normalized/{date}
      - data/aggregated/latest → data/aggregated/{date}
    - Atomic operation (create temp symlink, then rename)

Test: Trigger workflow manually via GitHub Actions UI

Phase 4: Integration with YogaMatLabApp (Priority 4)

In YogaMatLabApp:

1. Add YogaMatLabData as git submodule
  - Command: git submodule add https://github.com/[user]/YogaMatLabData data/external
  - Result: data/external/ directory pointing to YogaMatLabData repo
  - Update command: git submodule update --remote data/external
2. scripts/import-mats-from-data.ts
  - Purpose: Import aggregated data to Convex database
  - Logic:
      - Read data/external/data/aggregated/latest/all-products.json
    - Connect to Convex using ConvexHttpClient
    - Import in batches of 50 (to avoid timeouts)
    - Use api.yogaMats.bulkUpsert mutation
    - Log progress
  - Usage: npm run import-mats (manual trigger)
3. package.json script in YogaMatLabApp
  - Add scripts:
  {
  "import-mats": "tsx scripts/import-mats-from-data.ts",
  "update-data": "git submodule update --remote data/external && npm run import-mats"
}

Phase 5: Documentation (Priority 5)

Files to create:

1. README.md (in YogaMatLabData)
  - Overview of pipeline
  - Directory structure explanation
  - How to run manually
  - How to update YogaMatLabApp
  - Troubleshooting common issues
2. scripts/generate-commit-message.ts
  - Purpose: Create detailed commit messages with extraction stats
  - Logic:
      - Read data/aggregated/latest/stats.json
    - Read data/changes/latest-changeset.json
    - Format as markdown summary
  - Output: Text for git commit message

Key Design Decisions

1. Sequential vs Parallel Extraction

Choice: Sequential (one brand at a time)
Reason: Avoid rate limiting, easier to debug, more polite to servers

2. File-based vs Database Storage

Choice: File-based (JSON + CSV)
Reason: Audit trail, easy to version control, simple to consume

3. Change Detection Strategy

Choice: Compare against previous day's aggregated file
Reason: Simple, reliable, provides point-in-time diffs

4. GitHub Actions vs Other Schedulers

Choice: GitHub Actions
Reason: Free, integrated with git, easy to debug, no extra infrastructure

5. Integration Method (Git Submodule)

Choice: Git submodule
Reason: Simple, versioned, fast (no network requests at runtime)

Error Handling

Individual Brand Failures

- Log error, continue to next brand
- Include in daily summary
- Retry next day automatically

Rate Limiting / IP Blocking

- Exponential backoff (2s → 4s → 8s)
- Respect configured delays
- Use polite user agent

GitHub Actions Timeout

- Set 2-hour timeout (generous for 19 brands)
- If timeout occurs, consider splitting into parallel jobs

Data Validation Failures

- Log validation errors
- Skip invalid products
- Include in summary report

Testing Strategy

Manual Testing (Phase 1-2)

1. Run extraction on 2-3 test brands: npm run fetch
2. Verify raw JSON output in data/raw/{date}/
3. Run normalization: npm run normalize
4. Verify normalized output matches YogaMat schema
5. Run aggregation: npm run aggregate
6. Verify all-products.json combines all brands correctly

Automation Testing (Phase 3)

1. Trigger workflow manually via GitHub UI
2. Monitor logs in real-time
3. Verify commits to both repos
4. Check failure notification system

Integration Testing (Phase 4)

1. Update submodule in YogaMatLabApp
2. Run npm run import-mats
3. Verify mats appear in Convex dashboard
4. Test app with imported data

Critical Files Summary

YogaMatLabData (new repo):
- scripts/get-brands-from-convex.ts - Main orchestrator (queries Convex brands)
- scripts/normalize-data.ts - Data transformation
- scripts/aggregate-data.ts - Data combination
- scripts/detect-changes.ts - Change detection
- config/field-mappings.json - Field transformation rules
- .github/workflows/fetch-products.yml - Automation

YogaMatLabApp (existing repo):
- convex/brands.ts - Brand schema with scraping config
- convex/brands/getScrapableBrands.ts - Query for pipeline
- scripts/import-mats-from-data.ts - Convex import
- .gitmodules - Submodule configuration
- data/external/ - Submodule directory (created by git)

Files to copy from YogaMatLabApp to YogaMatLabData:
- scripts/lib/shopify-scraper.ts (no changes)
- scripts/lib/image-downloader.ts (no changes)

Implementation Timeline

- Week 1: Phase 1 (extraction) + Phase 2 (processing) - Manual testing
- Week 2: Phase 3 (automation) + Phase 4 (integration) - Automated testing
- Week 3: Phase 5 (documentation) + Polish + Monitoring

Next Steps

1. In YogaMatLabApp: Add scraping fields to Convex brands schema
   - scrapingEnabled: boolean
   - shopifyCollectionUrl: string | null
   - isShopify: boolean
   - rateLimit: { delayBetweenProducts: number, delayBetweenPages: number }
2. In YogaMatLabApp: Create convex/brands/getScrapableBrands.ts query
3. Create YogaMatLabData repository on GitHub
4. Copy required files from YogaMatLabApp:
   - scripts/lib/shopify-scraper.ts
   - scripts/lib/image-downloader.ts
   - types/yogaMat.ts (for type definitions)
5. Begin Phase 1 implementation

---

Both scripts work together:

1. get-brands-from-convex.ts (Orchestrator)
  - Fetches brand configurations from Convex (including productsJsonUrl)
  - Parses pipe-delimited URLs: brand.productsJsonUrl.split('|')
  - Loops through each brand and collection URL
  - Calls fetchAllProducts() from fetch-products-json.ts
  - Handles deduplication (by Shopify ID across collections)
  - Manages hash tracking for change detection
  - Saves results to data/raw/{date}/{brandSlug}.json
2. fetch-products-json.ts (Utility Library)
  - Provides reusable functions: fetchProductsPage() and fetchAllProducts()
  - Takes baseUrl and collectionPath as parameters
  - Performs actual HTTP requests to Shopify products.json endpoints
  - Handles pagination (up to 250 products per page)
  - Returns ShopifyProduct[] array
  - Does NOT directly interact with Convex or brand configurations

In summary: get-brands-from-convex.ts orchestrates the entire fetching process (it's the script you run), while fetch-products-json.ts is a library of utility functions that perform the actual HTTP requests. The recent changes added pipe-delimited URL support and deduplication to the orchestrator script at scripts/get-brands-from-convex.ts:88-139.
