# Series Grouping

Some brands publish the “same mat” as many separate Shopify products (one per design/colorway), rather than variants. YogaMatLabData derives a `series` grouping so YogaMatLabApp can display one product-card per mat “series” and show the available designs as options.

## Output Fields

In `data/normalized/**` and `data/aggregated/**` products may include:

- `seriesKey`: stable grouping key (e.g. `yolohayoga:unity-pro-cork`)
- `seriesName`: display name for the series (e.g. `Unity Pro Cork`)
- `seriesConfidence` / `seriesVersion`: heuristic metadata (`0..1` + version string)
- `designName`: design/colorway name when the product title/handle indicates it (e.g. `Mountain Magic`)
- `designConfidence` / `designVersion`: heuristic metadata (`0..1` + version string)

In `data/aggregated/**` the aggregator also writes:

- `brand-series-index.json`: one record per `(brandSlug, seriesKey)` with unioned `designNames` / `availableColors` and index-friendly dimension + price fields (min/max + integer-coded arrays).
- Each series record also includes `tagline` and `description` (from `config/brand-series.json`), `productShopifyIds` (for traceability), a best-guess `material` (with `materials` union + `materialConfidence`), `pvcFree` when detected, normalized `features` (excluding dimension-like tags), canonical `shapeLabel` (`Rectangle` | `Square` | `Round`), size tags (`sizeTags`, e.g. `Extra-Long`, `Extra-Wide`), and bucket fields (`thicknessBucket`, `lengthBucket`, `widthBucket`, `weightBucket` where values include `Ultralight`/`Light`/`Normal`/`Heavy`, plus `lengthBucket` supports `XL`, `widthBucket` supports `XW`, and `thicknessBucket` supports `XT`). It also includes `priceBucket` (`Value` | `Mid-Range` | `Premium` | `Luxury`) derived from series `minPrice` (USD).

Notes:
- Bundle/set products (e.g. titles/product types containing `bundle`, `set`, `kit`) are excluded from `brand-series-index.json` so the series view stays focused on mats/designs.
- YogaMatLabData supports a curated brand series mapping file (`config/brand-series.json`) to set stable `seriesKey`/`seriesName` without relying on title inference. Heuristics remain as a fallback when no manual match is found. See `docs/BRAND_SERIES.md`.

## Current Heuristics

Implemented in `scripts/lib/field-mapper.ts` (`series-v1`).

- `yolohayoga`: detects stable suffixes like `Aura Cork Yoga Mat`, `Unity Pro Cork Yoga Mat`, including `XL`/`Air`/`Kids` variants; treats any leading prefix as `designName`.
- `yogadesignlab`: uses the title format `<Series> - <Design>`.
- `houseofmats`: uses the title format `<Design> Yoga mat - <Collection/Edition> - <thickness>`.
- `shaktiwarrior` / `yogibare`: uses the title format `<Series> - <Design>`.
- `liforme`: uses handle suffixes for `travel-yoga-mat` and `xl-yoga-mat`.

Notes:
- Not every brand will have `series*` fields; for many brands, each product is already “unique enough” without grouping.
- YogaMatLabApp should still allow manual overrides downstream if needed (similar to shadow titles).

---

I now have a comprehensive view of the series assignments across all brands. Let me provide my analysis and recommendations for series name improvements.

  Series Names Analysis & Recommendations

  Based on reviewing all series assignments, here are my findings and recommendations:

  Issues Found

  1. Inconsistent series naming patterns across brands
  ┌────────────────┬──────────────────────────────────────────────────────────┐
  │    Pattern     │                         Examples                         │
  ├────────────────┼──────────────────────────────────────────────────────────┤
  │ Material-based │ shaktiwarrior:cork, shaktiwarrior:hemp, yogamatters:cork │
  ├────────────────┼──────────────────────────────────────────────────────────┤
  │ Product line   │ manduka:pro, manduka:eko, liforme:original               │
  ├────────────────┼──────────────────────────────────────────────────────────┤
  │ Size/variant   │ scoria:x-thick, scoria:x-tall, scoria:x-wide             │
  ├────────────────┼──────────────────────────────────────────────────────────┤
  │ Descriptive    │ yogamatters:ultra-lightweight, yogibare:evergrip         │
  └────────────────┴──────────────────────────────────────────────────────────┘
  4. "Cork (Standard)" naming
  - scoria:standard → "Cork (Standard)"
  - thesatoriconcept:standard → "Cork (Standard)"

  Both use identical series names but are different brands. Consider making these more distinctive.

  5. Unassigned products in Yogamatters that should be assigned
  Products from other brands sold on Yogamatters are unassigned:
  - Jade Yoga products (Harmony, Travel, Voyager)
  - Manduka products (PRO, PROlite, eKO)
  - Yoga Design Lab products

  These should either be excluded from Yogamatters or handled separately since they're resold products, not Yogamatters series.

  6. Yuneyoga - all 219 products in one series
  yuneyoga:standard contains 219 products, which seems like a catch-all rather than a meaningful series grouping.

  Recommendations

  Series name changes to consider:
  ┌────────────────────────────────────────────────────────┬───────────────────────────────────────────┬────────────────────────────────────────────────┐
  │                        Current                         │                Recommended                │                     Reason                     │
  ├────────────────────────────────────────────────────────┼───────────────────────────────────────────┼────────────────────────────────────────────────┤
  │ scoria:standard → "Cork (Standard)"                    │ "Standard Cork" or just "Standard"        │ Matches other pattern like "X-Thick", "Travel" │
  ├────────────────────────────────────────────────────────┼───────────────────────────────────────────┼────────────────────────────────────────────────┤
  │ thesatoriconcept:standard → "Cork (Standard)"          │ "Standard"                                │ Simpler, brand context already implied         │
  ├────────────────────────────────────────────────────────┼───────────────────────────────────────────┼────────────────────────────────────────────────┤
  │ yogibare:performance-pilates → "Performance / Pilates" │ "Performance Pilates"                     │ Remove awkward slash                           │
  ├────────────────────────────────────────────────────────┼───────────────────────────────────────────┼────────────────────────────────────────────────┤
  │ yuneyoga:standard → "Yune (Standard)"                  │ Consider splitting by style/design themes │ 219 products is too broad                      │
  └────────────────────────────────────────────────────────┴───────────────────────────────────────────┴────────────────────────────────────────────────┘
  Configuration changes needed:

  1. Handle resold products - Yogamatters sells Jade, Manduka, and Yoga Design Lab products. Options:
    - Add a reseller flag to exclude from series assignments
    - Create a special "Third Party" or "Partner Brands" series
  3. Yuneyoga series breakdown - Consider adding series for:
    - Zodiac collection (Aries, Cancer, Capricorn, Aquarius, etc.)
    - Location/Nature collection (Bear Creek, Buffalo Hills, etc.)
    - Design themes (Camo series, etc.)

  Would you like me to implement any of these changes to config/brand-series.json?
