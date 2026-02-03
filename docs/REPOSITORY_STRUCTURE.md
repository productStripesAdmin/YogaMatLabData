# YogaMatLabData Repository Structure

**Last Updated:** 2026-02-02
**Status:** Cleaned and Organized

## Overview

YogaMatLabData is organized into focused directories with clear separation of concerns:

```
YogaMatLabData/
├── config/                 # Data & configuration files
│   ├── *.json             # Core data files (11 files)
│   └── reviews/           # Research data JSON files (4 files)
├── scripts/               # Executable scripts
├── data/                  # Pipeline output (raw, normalized, aggregated)
├── docs/                  # Documentation (31 markdown files)
├── .github/workflows/     # GitHub Actions automation
└── .claude/               # Claude Code settings
```

## Config Directory (Essential Data)

**Purpose:** Store all data configuration and research findings

### Core Data Files (11 JSON)
- **series-scores.json** (110 KB) - ⭐ Primary: 102 yoga mat series with 12-point scoring metrics
- **brands.json** (45 KB) - Brand metadata and configuration
- **brand-series.json** (72 KB) - Brand-to-series relationship mapping

### Schema & Rules (6 JSON)
- **field-mappings.json** - Shopify products.json → YogaMat schema transformation
- **dimension-labels.json** - Standard dimension definitions (cm, mm, lbs)
- **enrichment.json** - Data enrichment defaults and configuration
- **exchange-rates.json** - Currency conversion rates
- **brand-currency.json** - Brand-specific currency overrides
- **README.md** - Config folder documentation

### Research Data (reviews/ subdirectory, 4 JSON)
- **series-gaps-report.json** - Series coverage analysis
- **name-mismatches-report.json** - Brand/series name inconsistencies
- **outdoorgearlab.json** - Professional review benchmark data
- **reddit-sheet.json** - Community discussion and feedback data

### Backlog (1 JSON)
- **series-scores-remaining.json** - 20 unscored series (future research)

## Scripts Directory

- **extract-all-brands.ts** - Main orchestrator querying Convex for brands
- **normalize-data.ts** - Transform raw Shopify data to YogaMat schema
- **aggregate-data.ts** - Combine all brands into single dataset
- **detect-changes.ts** - Diff against previous day for change tracking
- **download-images.ts** - Batch image downloader with optimization
- **lib/** - Utility modules
  - shopify-scraper.ts / fetch-products-json.ts
  - lululemon-scraper.ts / bigcommerce-scraper.ts
  - image-downloader.ts / field-mapper.ts / logger.ts
- **merge_scores.py** - Python utility for score merging
- **sync-to-yml-app.sh** - Shell script for YogaMatLabApp integration

## Data Directory

**Structure:** `data/{raw,normalized,aggregated,changes}/{YYYY-MM-DD}/`

- **raw/{date}/** - Daily Shopify extractions by brand
- **normalized/{date}/** - Transformed to YogaMat schema
- **aggregated/{date}/** - Combined datasets with all-products.json
- **changes/{date}-changeset.json** - Daily changeset logs

## Docs Directory (31 Markdown Files)

### Core Documentation
- **DATA_PIPELINE.md** - Pipeline architecture and data flow
- **INTEGRATION_INSTRUCTIONS.md** - YogaMatLabApp integration guide
- **QUICK_START.md** - Getting started guide

### Configuration & Schema
- **BRANDS_CONFIG.md** - Brand configuration details
- **BRAND_SERIES.md** - Brand-series relationships
- **SERIES.md** - Series schema and structure
- **DIMENSIONS.md** - Dimension definitions
- **ENRICHMENT.md** - Data enrichment configuration

### Implementation Guides
- **SERIES_SCORING_IMPLEMENTATION.md** - How scoring was completed
- **DATA_NORMALIZATION_NOTES.md** - Normalization process
- **CUSTOM_SCRAPERS.md** - Platform-specific scraper documentation
- **DATA_PIPELINE_EDGE_CASES.md** - Edge case handling

### Research & Analysis
- **research-log.md** - Web research sessions and methodology
- **GAP_ANALYSIS_README.md** - Coverage gaps analysis
- **SERIES_AND_BRAND_GAPS.md** - Detailed gap report
- **SERIES_KEY_MAPPING.md** - Series key format and structure
- **QUICK_REFERENCE.md** - Quick lookup guide
- **INDEX.md** - Documentation index

### Status & Reference
- **DELIVERABLES.md** - Project deliverables summary
- **VERIFICATION_COMPLETE.md** - Verification status
- **SIMPLE_CHANGES_NEEDED.md** - Minor improvements needed
- **PIPELINE_MODIFICATION.md** - Pipeline modification notes
- **SOURCES_ATTRIBUTION_NEEDED.md** - Source citation follow-up
- **YML_APP_INTEGRATION.md** - App integration details

### Code Examples
- **example-api-endpoint.ts** - Sample API endpoint
- **enrichment-code-snippet.ts** - Enrichment implementation example

## GitHub Workflows

**.github/workflows/fetch-products.yml**
- Runs weekly on Wednesday at 15:00 UTC (7 AM PST / 8 AM PDT)
- Orchestrates full pipeline
- Detects changes and commits results
- Creates issues on failure
- Uploads logs as artifacts

## Key Files Summary

| File | Size | Purpose |
|------|------|---------|
| config/series-scores.json | 110 KB | ⭐ Main scoring data (102 series) |
| config/brands.json | 45 KB | Brand configuration |
| config/brand-series.json | 72 KB | Brand-series mapping |
| docs/ | ~500 KB | Complete documentation (31 files) |
| scripts/lib/ | ~50 KB | Scraper and utility modules |

## Data Flow

```
Brand Config (Convex)
    ↓
extract-all-brands.ts (Scraper selection)
    ↓
[shopify-scraper | lululemon-scraper | bigcommerce-scraper]
    ↓
raw/{date}/{brand}.json
    ↓
normalize-data.ts (field-mappings.json)
    ↓
normalized/{date}/{brand}.json
    ↓
aggregate-data.ts
    ↓
aggregated/{date}/all-products.json
    ↓
detect-changes.ts → changes/{date}-changeset.json
    ↓
download-images.ts
    ↓
YogaMatLabApp (via git submodule)
```

## Cleanup History

### Recent Organization (2026-02-02)
- ✅ Removed empty placeholder files
- ✅ Removed redundant backup files
- ✅ Moved TypeScript examples to docs/
- ✅ Moved markdown documentation from config/reviews/ to docs/
- ✅ Consolidated all data files in config/
- ✅ Organized scripts directory

### Before Cleanup
- Scattered markdown files across root and config/reviews/
- Empty placeholder files (product-exclusions.json, product-series-overrides.json)
- Backup files (series-scores.json.backup)
- Mixed code and config files

### After Cleanup
- Clear separation: config/ = data, docs/ = documentation, scripts/ = code
- 13 core JSON files in config/ (down from 16+)
- 31 comprehensive markdown documents in docs/
- Organized scripts with utilities in lib/ subdirectory

## File Organization Principles

1. **config/** - Only data and configuration JSON files
2. **docs/** - All markdown documentation and code examples
3. **scripts/** - Executable scripts and utilities
4. **data/** - Pipeline outputs (organized by type and date)
5. **.github/workflows/** - CI/CD automation
6. **.claude/** - Claude Code settings (local)

## Next Steps

See: [SOURCES_ATTRIBUTION_NEEDED.md](SOURCES_ATTRIBUTION_NEEDED.md) for pending work on adding source citations to all 102 scored series.
