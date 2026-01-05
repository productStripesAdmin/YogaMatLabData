# YogaMatLabData

Data pipeline for [YogaMatLabApp](https://github.com/productStripesAdmin/YogaMatLabApp)

## Overview

This repository contains an automated data pipeline that:
1. Scrapes yoga mat product data from 19+ Shopify brand websites
2. Normalizes the data to a unified schema
3. Aggregates data into a single dataset
4. Detects changes (new/removed/updated products)
5. Makes data available to YogaMatLabApp via git submodule

## Quick Start

### Prerequisites

1. **YogaMatLabApp Setup** - The following must exist in YogaMatLabApp:
   - Convex `brands` table with scraping configuration fields
   - Query: `convex/brands/getScrapableBrands.ts`

2. **Environment Variables**
   ```bash
   cp .env.example .env
   # Edit .env and set your CONVEX_URL
   ```

### Installation

```bash
npm install
```

### Running the Pipeline

```bash
# Run each step individually
npm run fetch          # Phase 1: Fetch products.json from brands
npm run normalize      # Phase 2: Transform to unified schema (coming soon)
npm run aggregate      # Phase 3: Combine all brands (coming soon)
npm run detect-changes # Phase 4: Detect changes (coming soon)

# Or run the full pipeline
npm run pipeline
```

## Architecture

See [CLAUDE.md](./CLAUDE.md) for detailed architecture and implementation notes.

### Data Flow
```
Convex brands → Extract → Normalize → Aggregate → Detect Changes
                   ↓          ↓           ↓              ↓
              data/raw/  data/normalized/ data/aggregated/ data/changes/
```

### Directory Structure
```
YogaMatLabData/
├── config/              # Configuration files
├── scripts/             # Pipeline scripts
│   ├── extract-all-brands.ts
│   └── lib/            # Shared utilities
│       ├── shopify-scraper.ts
│       ├── image-downloader.ts
│       └── logger.ts
├── data/               # Extracted and processed data
│   ├── raw/{date}/     # Daily raw extractions
│   ├── normalized/{date}/
│   ├── aggregated/{date}/
│   └── changes/
└── logs/               # Pipeline execution logs
```

## Implementation Status

### Phase 1: Fetch Products ✅
- [x] Project setup (package.json, tsconfig.json)
- [x] Logger utility
- [x] JSON fetcher (fetch-products-json.ts)
- [x] Brand orchestrator (get-brands-from-convex.ts)
- [x] Convex integration
- [x] Refactored to use products.json (no browser automation!)

### Phase 2: Data Processing ✅
- [x] Field mapping configuration
- [x] Field mapper utility (extracts specs from descriptions)
- [x] Normalize script (Shopify → YogaMat schema)
- [x] Aggregate script (combines all brands + stats)
- [x] Detect changes script (tracks new/removed/changed products)

### Phase 3: Automation ✅
- [x] GitHub Actions workflow (daily at 2 AM UTC)
- [x] Latest symlinks updater
- [x] Automatic commits with changeset summary
- [x] Failure notifications (creates GitHub issues)
- [ ] Image downloader (TODO)

### Phase 4: Integration 🔄
- [ ] Git submodule setup in YogaMatLabApp (see INTEGRATION_INSTRUCTIONS.md)
- [ ] Convex bulk upsert mutation (in YogaMatLabApp)
- [ ] Import script for Convex (in YogaMatLabApp)

### Phase 5: Documentation
- [ ] Complete README
- [ ] Commit message generator

## Configuration

### Brand Configuration (in YogaMatLabApp Convex)

Brands are configured in YogaMatLabApp's Convex `brands` table:

```typescript
{
  name: string
  slug: string
  website: string
  scrapingEnabled: boolean
  shopifyCollectionUrl: string | null  // e.g., "/collections/yoga-mats"
  isShopify: boolean
  rateLimit: {
    delayBetweenProducts: number      // default: 500ms
    delayBetweenPages: number         // default: 1000ms
  }
}
```

## GitHub Actions Automation

The pipeline runs automatically every day at 2 AM UTC via GitHub Actions.

### Required Secrets

Set these in your GitHub repository settings (Settings → Secrets and variables → Actions):

1. **`CONVEX_URL`** - Your Convex deployment URL (e.g., `https://unique-dachshund-712.convex.cloud`)
2. **`PAT_TOKEN`** (optional) - Personal Access Token for cross-repo commits (if integrating with YogaMatLabApp)

### Manual Trigger

You can manually trigger the workflow from the Actions tab:
1. Go to Actions → Daily Product Extraction
2. Click "Run workflow"
3. Select branch and run

### What Happens Automatically

1. Fetches products from all enabled brands
2. Normalizes and aggregates data
3. Detects changes from previous day
4. Updates `latest/` symlinks
5. Commits results with changeset summary
6. Creates GitHub issue if pipeline fails

## Troubleshooting

### "CONVEX_URL environment variable is not set"
Make sure you've created a `.env` file with your Convex deployment URL:
```bash
CONVEX_URL=https://your-deployment.convex.cloud
```

### "Failed to fetch brands from Convex"
Ensure the `api.brands.getScrapableBrands` query exists in YogaMatLabApp's Convex functions.

### Rate Limiting / 429 Errors / 403 Forbidden
Some brands may block automated requests. Adjust the `rateLimit` values in the Convex brands table or check if the brand requires special headers.

## Development

For detailed development guidance, see [CLAUDE.md](./CLAUDE.md).

### Testing Individual Brands

To test extraction on a single brand, temporarily modify the query in Convex or filter in the extraction script.

### Logs

All extraction logs are saved to `logs/{date}.log` with timestamps and color-coded output.

## Integration with YogaMatLabApp

This repository generates data that is consumed by YogaMatLabApp. See [INTEGRATION_INSTRUCTIONS.md](./INTEGRATION_INSTRUCTIONS.md) for complete setup instructions.

### Quick Overview

1. **Add as Submodule** in YogaMatLabApp:
   ```bash
   git submodule add https://github.com/productStripesAdmin/YogaMatLabData.git data/external
   ```

2. **Create Import Script** in YogaMatLabApp to load `data/external/data/aggregated/latest/all-mats.json` into Convex

3. **Daily Updates**:
   ```bash
   npm run update-data  # Pulls latest data and imports to Convex
   ```

The data pipeline runs automatically daily at 2 AM UTC. YogaMatLabApp can pull and import the latest data whenever needed.

## Related Repositories

- [YogaMatLabApp](https://github.com/productStripesAdmin/YogaMatLabApp) - Main application
- [DATA_PIPELINE.md](./DATA_PIPELINE.md) - Detailed implementation plan
- [INTEGRATION_INSTRUCTIONS.md](./INTEGRATION_INSTRUCTIONS.md) - Integration guide for YogaMatLabApp

## License

Private repository
