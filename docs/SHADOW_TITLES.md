# Shadow Titles (DEPRECATED)

> **Note:** The `titleAuto` feature has been deprecated and removed from the pipeline.
> Series names from `config/brand-series.json` are now the canonical display names for grouped products.
> This file is kept for historical reference only.

## Previous Behavior

Previously, normalization generated a "shadow title" set:

- `titleOriginal`: raw Shopify title (still preserved)
- `titleAuto`: auto-normalized title (REMOVED)
- `titleAutoConfidence`: heuristic confidence (REMOVED)
- `titleAutoVersion`: version string (REMOVED)

## Current Approach

Products now use:
- `titleOriginal` for traceability
- `seriesName` (from `config/brand-series.json`) for display in YogaMatLabApp
- `designName` for individual design/colorway names within a series
