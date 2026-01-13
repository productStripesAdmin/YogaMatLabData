# DATA NORMALIZATION NOTES

[scripts/normalize-data](/scripts/normalize-data.ts)

## PRODUCT TYPE FILTER

Normalization discards products early (so they never appear in `data/normalized/**` or downstream `data/aggregated/**`) when:
- `product_type` is non-empty, and does **not** contain `mat`/`mats`, and
- the product title/tags also do **not** contain `mat`/`mats`.

This is primarily to prevent non-mat catalog items (e.g. apparel like leggings) from entering the dataset even if they appear in a `products.json` feed.

## SCRAPING ENABLED FILTER

Fetch writes `data/raw/{date}/_brands.json` (including each brand’s `scrapingEnabled` flag). During normalization, if that metadata file exists, we only process raw brand files whose `scrapingEnabled !== false`. This prevents stale raw files (e.g. pulled from CI) from accidentally leaking disabled brands into `data/normalized/**` and downstream outputs.

Fetch also removes any existing `data/raw/{date}/{brand}.json` files for brands that are not enabled (either `scrapingEnabled=false` or not present in the Convex brand list) so today’s raw folder reflects the current source of truth.

## SHADOW TITLES

Normalization also generates a consistent “shadow title” set for YogaMatLabApp:
- `titleOriginal` (raw Shopify title)
- `titleAuto` / `titleAutoConfidence` / `titleAutoVersion` (derived)

See `docs/SHADOW_TITLES.md`.

## BRANDS

need to store mat slug (ideally from products.json)
need to capture variants data & images

### 42birds.json

- brands.description: Remove "description benefits" from the start of each product description
- brands.material: Should be Cork for all. "free of PVC's" is being picked-up as PVC.
- brands.weight: Needs units (lbs)
- brands.thickness: Needs units (mm)

- Need to add dimensions: 72″ x 26” (available in description)
- Need to add diameter rolled, e.g. 4 in. diameter rolled (available in description)
- Should capture the following from the variants object (example data):
  - "grams": 1497,
  - "product_id": 876111003695,
  - "created_at": "2022-05-19T14:33:34-04:00",
  - "updated_at": "2026-01-06T01:07:27-05:00"

### ananday.json

- Need to extract the product details list, including, e.g. 72\" x 24\" x 4mm | 5.4 lbs
- Products have variants - need to save the variant details
- Need to exclude product reviews from description. _TBC what to do with description in general. Feels like these shouldn't be copied and should be our own._
