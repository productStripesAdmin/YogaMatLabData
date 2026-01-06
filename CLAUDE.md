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
    └── daily-extraction.yml     # Automated daily pipeline
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

## Brand URLs

### Shopify Brands (19+)
All brands have `/collections/{slug}/products.json` endpoints:
- Alo Yoga (`aloyoga.com/collections/yoga`)
- Liforme, Jade Yoga, Yolo Ha Yoga, Scoria World
- Gaiam, Yogi-Bare, Bala, 42 Birds, Ananday
- Oko Living, HeatHyoga, Stakt, Sensu, Wolo Yoga
- Keep Store, Yoga Matters, House of Mats, Shakti Warrior

### Non-Shopify Brands (Future)
Require custom scrapers:
- Lululemon, Sugamats, Hugger Mugger, Byoga, Grip Yoga, EcoYoga

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
1. Add to YogaMatLabApp's Convex `brands` table with scraping configuration:
   - Set `scrapingEnabled: true`
   - Provide `shopifyCollectionUrl` (e.g., "/collections/yoga-mats")
   - Set `isShopify: true` for Shopify sites
   - Configure rate limits or use defaults (500ms/1000ms)
2. Test extraction with single brand first
3. Verify products.json endpoint availability for Shopify brands
4. For non-Shopify sites, create custom scraper in `scripts/lib/`

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
