# Brand Series Mapping (Manual Series Upkeep)

YogaMatLabData can assign `seriesKey` / `seriesName` from a curated config instead of inferring from titles. This is useful when series are “front-and-central” in YogaMatLabApp and you want stable keys + consistent naming.

## File Locations (first found wins)

- `config/brand-series.json`
- `config/manual-series.json`
- `manual-series.json`
- `brand-series.json`

Optional: set `YML_MANUAL_SERIES_PATH` to override the location.

## Cross-checking with reference sources

This repo also includes reference datasets under `config/`:

- `config/reddit-sheet.json`
- `config/outdoorgearlab.json`

These are not used directly by the pipeline, but they can be used to sanity-check that `config/brand-series.json` covers common “series” naming used in the wild.

Run:

```sh
npm run check-series-sources
```

## Convex Integration (optional)

`config/brand-series.json` is the canonical source of truth for the pipeline.

YogaMatLabApp can still store series definitions in Convex (for admin editing / sync), but YogaMatLabData will only fetch series definitions from Convex when explicitly enabled:

- Set `YML_SERIES_CONFIG_SOURCE=convex`

When enabled, the fetch step saves the Convex result to `data/raw/<date>/_brand-series.json`, and normalization will use that file for this run (fallback: `_manual-series.json`).

## Output Fields

When a product matches a manual rule:

- `seriesKey`: `${brandSlug}:${seriesSlug}` (stable key for Convex + series pages)
- `seriesName`: exactly the configured name
- `seriesVersion`: `series-manual-v1`

Heuristic series detection still runs as a fallback when no manual match is found.

## Minimal Config Shape

```jsonc
[
  {
    "slug": "yolohayoga",
    "series": [
      { "name": "Unity Pro", "slug": "unity-pro", "description": "…" },
      { "name": "Aura", "slug": "aura", "description": "…" }
    ]
  }
]
```

Notes:
- `description` is optional metadata (recommended) and should be kept short (≤255 chars) for UI display.
- Matching ignores `description` (it only uses the match fields below and/or the series name inference fallback).

## Optional Matching Rules

If you find name-only matching too loose/ambiguous, add explicit match helpers to a series entry:

```jsonc
{
  "name": "PRO™",
  "slug": "pro",
  "matchTitleAny": ["PRO"],
  "matchHandleAny": ["pro-yoga-mat"],
  "matchTitleRegex": ["\\bPRO\\b"],
  "priority": 10
}
```

Supported fields:
- `matchAny`: strings checked against `(title + handle + product_type + tags)`
- `matchTitleAny`
- `matchHandleAny`
- `matchProductTypeAny`
- `matchTagAny`
- `matchTitleRegex` (regex strings)
- `priority` (higher wins tie-breaks)

## Product-Level Overrides

When a specific product is mis-assigned by the rule-based matching and you can't fix it by adjusting match rules (without breaking other products), use product-level overrides.

**File:** `config/product-series-overrides.json`

```jsonc
[
  {
    "productSlug": "manduka-pro-yoga-mat-black-71",
    "seriesKey": "manduka:prolite",
    "seriesName": "PROlite®",
    "reason": "This product was incorrectly matched to PRO series"
  }
]
```

Fields:
- `productSlug` (required): The product's slug (`${brandSlug}-${shopifyHandle}`)
- `seriesKey` (required): The correct series key to assign
- `seriesName` (optional): Display name; if omitted, derived from seriesKey
- `reason` (optional): Documentation for why this override exists

Overrides take highest priority - they are checked before rule-based matching or heuristics.

When an override is applied:
- `seriesConfidence`: `1.0`
- `seriesVersion`: `series-override-v1`

Optional: set `YML_PRODUCT_SERIES_OVERRIDES_PATH` to override the file location.

## Series Assignments Summary

After normalization, the pipeline generates `data/normalized/{date}/_series-assignments.json` with a detailed breakdown of which products are assigned to which series. This file is useful for:

- Auditing series assignments
- Identifying unassigned products that need match rules
- Diffing between runs to spot assignment changes

The summary is also printed to the console during normalization.

## Bundles / Sets

Bundle-like products (titles/types containing `bundle`, `set`, `kit`, `pack`) are prevented from receiving a `seriesKey` and are also excluded from `brand-series-index.json`.
