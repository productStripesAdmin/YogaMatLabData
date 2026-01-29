# PIPELINE OVERVIEW

Last updated: 2026-01-19

YML_data (fetch → normalize → aggregate) → YML_app (import-data → Convex)

## Canonical Data

- Brands and product endpoints are maintained in brands.json
- [Sync brands](http://localhost:3000/admin/sync-brands) in YML_app syncs brands to convex.
- Brand series - i.e. individual yoga mat styles - are maintained in brand-series.json. _These are imported into convex during the import step._

## Workflow Files

[_series-assignments.json](/data/normalized/latest/_series-assignments.json) -> Check products assigned to series and unassigned products
[_summary.json](/data/normalized/latest/_summary.json) -> Check product warnings (e.g. width too low, etc.)

## Config to be aware of

- `config/brands.json` - Brand definitions & endpoints
- `config/brand-series.json` - Series match rules
- `config/product-exclusions.json` - Products to exclude
- `config/product-series-overrides.json` - Manual assignment fixes
- `config/dimension-labels.json` for standard dimension labels
- `config/brand-currency.json` + `config/exchange-rates.json` for converting non-USD Shopify prices to USD

## Data Fetching and Preparation

### YML_data repo

- `npm run fetch`: Fetch raw data from product.json endpoints (and elsewhere as defined for custom set-ups)
- `npm run enrich`: Fetches additional data as defined in enrichment.json
- `npm run normalize`: Process and normalize the raw data:
  - Extract measurements (dimensions, thicknesses, weights, etc.)
  - Extract colors
  - Extract designs
  - Extract materials
  - Extract features (non-dimension marketing features like `Travel`; size/shape/weight live in dedicated fields)
  - Generate a consistent "auto title". This step can be deprecated as it's no-longer needed as individual products are no-longer displayed and just relevant from a data aggregation & variant point of view.
  - Exclude products with product type != yoga mat
- `npm run aggregate`: Aggregate the normalized data into a single file. Outputs:
  - all-products.csv (just for reference)
  - all-products.json (just for reference)
  - brand-series-index.json -> see below:
    - *This is the most important file as it links products to series and shows unassigned products. If a product is mis-assigned or unassigned the normalization step needs to be updated.*
    - *In addition, product data - all products link to a series - is aggregated at the series level data which in-turn defines the variants available for each series. This is crucial. If the aggregate data is incorrect, the aggregate step needs to be updated.* Aggregate data should include:
      - Measurements (dimensions, thicknesses, weights, etc.)
      - Colors
      - Designs
      - Materials
      - Features (excluding dimension-like tags; see `sizeTags` + buckets in `brand-series-index.json`)
  - stats.json
- `npm run detect-changes`: Detects changes from the last run
- `npm run update-symlinks`: Links "latest files" to the last run

### Pipeline Outputs

- data/normalized/{date}/_series-assignments.json - Audit file
- data/aggregated/{date}/brand-series-index.json - **Primary output for app** Images now included.
- data/aggregated/{date}/all-products.json - Diagnostic/archive only

## Data Importing

### YML_app repo

- `npm run update-data`: Digests the latest aggregated data files and saves to convex:  
  - brand-series-index.json -> brandSeries table
  - Includes: Automatic series cleanup during import (removes series no longer in source data)
  - During the import, a convex/seriesDefinitions.ts table is populated. Needed for series metadata (taglines, descriptions, priority sorting).
  - [Import data](http://localhost:3000/admin/import-data). Instructions for running npm run update-data

## Deprecated

- [Sync series](http://localhost:3000/admin/sync-series) in YML_app syncs series to convex. Is this needed? Or should it happen during the import-data phase?
- brands-index.json -> simple product count for each brand. Is this needed?
- all-products.json -> no longer saved to convex/products.ts tabla. Data no-longer stored in convex. Kept in YML_data for reference.
- Product exclusions (config/product-exclusions.json) - for excluding specific products. No longer needed as the product to series mapping is the main control point now.

## Run pipeline for a specific brand

You can now run the full pipeline for a single brand (or a few) using YML_BRANDS:

YML_BRANDS=aloyoga npm run pipeline 
or multiple:
YML_BRANDS=aloyoga,liforme npm run pipeline

What happens with YML_BRANDS set:

- fetch, enrich, normalize, aggregate only process those brands.
- detect-changes and update-symlinks are skipped (to avoid updating data/**/latest from a partial run).

**The problem with this^ is that the latest aggregate files are overwritten and just include the brand in question.**


## Appendix

1. "Is sync series still needed?"

Recommendation: No, it should happen during import-data.

The series definitions in config/brand-series.json are match rules, not the actual series data. The real series data (with aggregated measurements, colors, prices, etc.) comes from brand-series-index.json. Syncing should happen when importing data, not separately.

2. "Is all-products.json still needed?"

Recommendation: Keep it, but don't import to Convex.

- Keep in YML_data: Useful for debugging, auditing series assignments, and generating aggregate data
- Don't store in Convex: Individual products aren't displayed in the app; series are. The aggregate data in brand-series-index.json is what matters.

However, one thing to consider: product images. Currently images are on individual products. If you remove products from Convex, you'd need to add representative images to brand-series-index.json. I'd suggest adding:
{
  "seriesKey": "manduka:pro",
  "images": [
    { "src": "...", "alt": "..." }
  ]
}

3. "Is brands-index.json needed?"

Recommendation: Probably not.

It's just a product count per brand. This can be derived from brand-series-index.json if needed. Could be useful for quick stats but not essential.

Decided to delete it.

4. Auto-title deprecation

**UPDATE:** titleAuto has been removed from the pipeline. Series names from `config/brand-series.json` are now the canonical display names. The `titleOriginal` field is preserved for traceability.

Decided to delete it.


### Summary of Changes

1. Removed brands-index.json generation

- Removed from scripts/aggregate-data.ts

2. Removed titleAuto generation

- Removed type definition from NormalizedYogaMat in scripts/lib/field-mapper.ts
- Removed TITLE_AUTO_VERSION constant
- Removed generateTitleAuto() function
- Removed titleAuto generation from mapShopifyToYogaMat()
- Removed references from scripts/normalize-data.ts (SeriesAssignmentProduct interface)
- Removed references from scripts/lib/brand-series-index.ts (shouldExcludeFromSeriesIndex and name fallback)
- Updated documentation files: docs/DATA_NORMALIZATION_NOTES.md, docs/SHADOW_TITLES.md, docs/SERIES.md, docs/20260119_PIPELINE_OVERVIEW.md

3. Added measurement validation

- Added MEASUREMENT_THRESHOLDS constants in scripts/normalize-data.ts
- Added validateMeasurements() function to detect suspicious values
- Added measurementWarnings tracking in normalizeBrand()
- Added warnings to NormalizationSummary and console output
- Summary warning entries include `shopifyId` when available.
- Width and weight warnings are relaxed for square mats (e.g. 198×198cm “Squared” mats) so they don’t trip the standard width/weight max. Weight warnings are also relaxed for extra-long-and-wide mats.
- Discarded product-type summary entries include `shopifyIds` to help identify which products were filtered out.
- Normalization summary includes `totalSeries` (unique `seriesKey` count across normalized products).

4. Created config/dimension-labels.json

- Standard labels for length (Mini, Travel, Standard, Long, Extra Long)
- Standard labels for width (Narrow, Standard, Wide, Extra Wide)
- Standard labels for thickness (Thin, Standard, Thick, Extra Thick)
- Standard labels for shape (Rectangular, Square, Round)

5. Added dimension labels to series index

- Added lengthLabel, widthLabel, thicknessLabel, shapeLabel to SeriesIndexRecord
- Added getDimensionLabel() and getShapeLabel() helper functions
- Labels are derived from measurements using config/dimension-labels.json

6. Added images to series index

- Added images field to SeriesIndexRecord
- Added ProductImage interface and mergeUniqueImages() helper function
- Aggregates unique images from all products in a series (deduplicated by URL)
