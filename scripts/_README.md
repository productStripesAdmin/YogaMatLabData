# Scripts Directory

This folder contains all executable scripts for the YogaMatLabData pipeline and analysis tools.

## Pipeline Scripts (Core Data Processing)

These scripts are part of the automated data pipeline that runs daily via GitHub Actions.

### `get-brands-from-convex.ts`
**Purpose:** Fetch brand configuration from Convex database and scrape product data

**Inputs:** CONVEX_URL environment variable
**Outputs:** `data/raw/{date}/{brand}.json` files for each enabled brand
**Usage:** `npm run fetch` or `npx tsx scripts/get-brands-from-convex.ts`
**Details:** Queries Convex for enabled brands and selects appropriate scraper (Shopify, Lululemon, BigCommerce)

### `enrich-data.ts`
**Purpose:** Enhance raw product data with additional web page information

**Inputs:** `data/raw/{date}/` files, brand enrichment config
**Outputs:** `data/enriched/` folder with enhanced product data
**Usage:** `npm run enrich` or `npx tsx scripts/enrich-data.ts`
**Details:** Fetches product pages to extract core features, sections, and additional content

### `normalize-data.ts`
**Purpose:** Transform raw/enriched data to unified YogaMat schema

**Inputs:** `data/raw/` or `data/enriched/` files, `config/field-mappings.json`
**Outputs:** `data/normalized/{date}/{brand}.json` files
**Usage:** `npm run normalize` or `npx tsx scripts/normalize-data.ts`
**Details:** Applies field mappings, validates data, standardizes units and formats

### `aggregate-data.ts`
**Purpose:** Combine all normalized brand data into single unified dataset with series index

**Inputs:** `data/normalized/{date}/` files, `data/scores/series-scores.json`
**Outputs:** 
- `data/aggregated/{date}/all-products.json` - All yoga mats
- `data/aggregated/{date}/brand-series-index.json` - Series summary with scores embedded
- `data/aggregated/{date}/stats.json` - Statistics and breakdown
- `data/aggregated/{date}/all-products.csv` - CSV export
**Usage:** `npm run aggregate` or `npx tsx scripts/aggregate-data.ts`
**Details:** Merges scores from data/scores/series-scores.json into the series index

### `detect-changes.ts`
**Purpose:** Compare current aggregated data against previous day to track changes

**Inputs:** `data/aggregated/{date}/` current, `data/aggregated/{previous-date}/` previous
**Outputs:** `data/changes/{date}-changeset.json`
**Usage:** `npm run detect-changes` or `npx tsx scripts/detect-changes.ts`
**Details:** Identifies new products, removed products, price changes, updates

### `update-latest-symlinks.ts`
**Purpose:** Update `latest/` symlinks to point to most recent aggregated data

**Inputs:** `data/aggregated/` directory
**Outputs:** `data/aggregated/latest/` symlink updated
**Usage:** `npm run update-symlinks` or `npx tsx scripts/update-latest-symlinks.ts`
**Details:** Maintains `latest` directory for easy access to current data

### `download-images.ts`
**Purpose:** Download and optimize product images

**Inputs:** `data/aggregated/{date}/all-products.json` with image URLs
**Outputs:** Optimized JPEG images in configured storage location
**Usage:** `npm run download-images` or `npx tsx scripts/download-images.ts`
**Details:** Batch downloads, resizes to 1200px max, converts to JPEG (quality 85)

---

## Analysis & Validation Scripts

These scripts analyze data quality and consistency across sources.

### `check-enabled-brands.ts`
**Purpose:** Verify which brands are enabled for scraping in Convex

**Requires:** CONVEX_URL environment variable
**Outputs:** Console output grouped by platform
**Usage:** `npx tsx scripts/check-enabled-brands.ts`
**Details:** Shows Shopify, Lululemon, and BigCommerce brands with their configuration. Use to verify brand setup before running pipeline.

### `check-series-sources.ts`
**Purpose:** Validate series naming alignment between config and review sources

**Inputs:** 
- `config/brand-series.json` (config)
- `data/reviews/reddit-sheet.json` (community data)
- `data/reviews/outdoorgearlab.json` (professional reviews)
**Outputs:** Console report of mismatches
**Usage:** `npx tsx scripts/check-series-sources.ts`
**Details:** Checks if series in Reddit and OutdoorGearLab reviews match config entries. Supports brand aliases and partial name matching.

---

## Analysis & Report Generation Scripts

These scripts generate comprehensive gap and consistency reports.

### `find-series-gaps.cjs`
**Purpose:** Analyze series coverage gaps across config, reviews, and scoring data

**Inputs:** 
- `config/brand-series.json` (configuration)
- `data/reviews/reddit-sheet.json` (community feedback)
- `data/reviews/outdoorgearlab.json` (professional reviews)
- `data/scores/series-scores.json` (scoring data)
**Outputs:** 
- Console report with detailed analysis
- `data/scores/series-gaps-report.json` (detailed report)
**Usage:** `npm run find-series-gaps`
**Details:** 
- Identifies series in reviews but missing from config
- Identifies series in config lacking review/scoring data
- Shows brand-by-brand coverage percentages
- Highlights priority gaps

### `check-name-mismatches.cjs`
**Purpose:** Validate series naming consistency across all data sources

**Inputs:** 
- `config/brand-series.json` (config)
- `data/reviews/reddit-sheet.json` (community data)
- `data/reviews/outdoorgearlab.json` (professional reviews)
**Outputs:** 
- Console report with findings
- `data/scores/name-mismatches-report.json` (detailed report)
**Usage:** `npm run check-name-mismatches`
**Details:** 
- Compares series names with smart normalization
- Identifies major (critical) vs minor (formatting) mismatches
- Handles typos, special characters, and variations
- Generates detailed report for review

### `check-series-sources.ts`
**Purpose:** (See Analysis & Validation Scripts section above)

---

## Test & Debug Scripts

These are utility scripts for development and debugging.

### `test-dimensions.ts`
**Purpose:** Test dimension parsing and normalization

**Test dimension extraction from product specs
**Usage:** `npx tsx scripts/test-dimensions.ts`

### `test-scrapers.ts`
**Purpose:** Test individual scraper implementations

**Usage:** `npx tsx scripts/test-scrapers.ts`
**Details:** Validates scraper output format and error handling

### `test-series-index.ts`
**Purpose:** Test series index generation

**Usage:** `npx tsx scripts/test-series-index.ts`

### `test-series.ts`
**Purpose:** Test series matching and slug generation

**Usage:** `npx tsx scripts/test-series.ts`

### `check-enabled-brands.ts`
**Purpose:** (See Analysis & Validation Scripts section above)

### `debug-hugger-mugger-page.ts`
**Purpose:** Debug BigCommerce scraper for Hugger Mugger

**Usage:** `npx tsx scripts/debug-hugger-mugger-page.ts`
**Details:** Helps troubleshoot BigCommerce-specific scraping issues

### `test-hugger-mugger.ts`
**Purpose:** Test BigCommerce (Hugger Mugger) scraper functionality

**Usage:** `npx tsx scripts/test-hugger-mugger.ts`

---

## Utility Scripts

### `merge_scores.py`
**Purpose:** Merge newly researched yoga mat series scores into series-scores.json

**Inputs:** Hardcoded series data in script + existing `data/scores/series-scores.json`
**Outputs:** Updated `data/scores/series-scores.json`
**Usage:** `python scripts/merge_scores.py`
**Details:** Adds or updates series with 12-point metrics. Legacy script - update as needed for new batches.

---

## Pipeline Execution

### Full Pipeline
**Command:** `npm run pipeline`
**Runs:** fetch → enrich → normalize → aggregate → detect-changes → update-symlinks
**Output:** Complete updated data in `data/aggregated/latest/`

### Quick Analysis Suite
```bash
npm run check-enabled-brands        # Verify brand config
npm run check-series-sources        # Validate series names
npm run check-name-mismatches       # Find naming inconsistencies
npm run find-series-gaps            # Analyze coverage gaps
```

---

## Data Source Paths

| Data Type | Location | Purpose |
|---|---|---|
| Brand Config | `config/brands.json` | Brand metadata |
| Series Config | `config/brand-series.json` | Series definitions |
| Scoring Data | `data/scores/series-scores.json` | 102 scored series with metrics |
| Review Data | `data/reviews/reddit-sheet.json` | Community feedback |
| Review Data | `data/reviews/outdoorgearlab.json` | Professional reviews |
| Raw Pipeline | `data/raw/{date}/` | Daily brand scrapes |
| Normalized | `data/normalized/{date}/` | Transformed data |
| Aggregated | `data/aggregated/{date}/` | Final combined data |
| Latest | `data/aggregated/latest/` | Symlink to most recent |
| Changes | `data/changes/{date}-changeset.json` | Daily diff log |

---

## Environment Variables

```bash
CONVEX_URL          # Required for: check-enabled-brands, get-brands-from-convex
```

Set in `.env` file or GitHub Actions secrets.

---

## Notes

- TypeScript scripts (`.ts`) require `npx tsx` or npm script aliases
- CommonJS scripts (`.cjs`) run directly with `node`
- All scripts log to stdout + optional log files in `logs/`
- Scripts handle errors gracefully and continue processing other brands
- Use npm scripts for consistency: `npm run <script-name>`

