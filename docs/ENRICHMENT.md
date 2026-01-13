# Product Page Enrichment

Some brands render important product details on the **product page** (theme blocks / accordion content / metafields) that do **not** appear in Shopify `products.json` (`body_html`).

Example: Yoloha “Core Features” accordion content.

This repo supports an **optional enrichment step** that fetches product-page HTML and extracts additional fields.

## What It Produces

**Raw enrichment outputs (build artifacts)**
- `data/enriched/{date}/{brandSlug}.json` per brand (keyed by `handle`)
- `data/enriched/{date}/_summary.json`
- `data/enriched/latest` symlink via `npm run update-symlinks`

**Normalized product fields**
- `coreFeatures?: string[]` (raw feature bullets/lines from the product page)
- `coreFeaturesSource?: 'productPage'`
- `coreFeaturesConfidence?: number` (0..1)

During normalization, extracted `coreFeatures` are also appended into the `allText` used by other extractors, so they can improve derived fields like `thickness`, `weight`, `materials`, etc.

## Appended Text Sections (for missing specs)

Some brands (e.g. Alo Yoga) show important spec text (dimensions/weight) in a product-page section like “Fit”, but don’t include it in `products.json`.

For those brands, enrichment can extract one or more **headings** and append the resulting text into normalization’s `allText` (so existing parsers populate `length/width/thickness/weight`).

This is configured via `config/enrichment.json` using `appendText.headings` (e.g. `["Fit"]`).

If you know the section that should terminate extraction (e.g. “Shipping & Returns”), you can also provide `appendText.endHeadings` to bound the HTML window.

When enabled, the enrichment output also stores the extracted sections under `sections` (one entry per heading with `items[]`).

If an extracted section contains inline subheadings like `Specifications:` and `Features:` (common when a single accordion groups multiple blocks), enrichment will automatically split it into multiple `sections` entries (`heading: "Specifications"` and `heading: "Features"`).

For `aloyoga`, a `sections` entry with `heading: "Colors"` will be merged into the normalized `availableColors` list (deduped, with option-derived colors first).

## Manual Fallback (blocked sites)

Some sites block product-page requests (e.g. HTTP 403). For those brands you can supply a one-off manual enrichment file:

- `data/enriched/manual/{brandSlug}.json`

If `config/enrichment.json` sets `strategy: "manual"` for a brand (recommended for consistently-blocked sites like Alo), enrichment will **skip network fetch** and always copy the manual file into `data/enriched/{date}/{brandSlug}.json`.

Otherwise (default strategy), if enrichment runs but extracts **no usable data** (no `appendText`, no `sections`, no `coreFeatures`) and there were request errors, it will copy the manual file into `data/enriched/{date}/{brandSlug}.json` so normalization can proceed.

The manual file format matches the normal output shape:

```json
{
  "brandSlug": "aloyoga",
  "extractedAt": "2026-01-12T00:00:00.000Z",
  "products": [
    {
      "shopifyId": 7902722162868,
      "handle": "a0779u-lightweight-warrior-mat-black",
      "slug": "aloyoga-a0779u-lightweight-warrior-mat-black",
      "productUrl": "https://www.aloyoga.com/en-sg/products/a0779u-lightweight-warrior-mat-black",
      "extractedAt": "2026-01-12T00:00:00.000Z",
      "sections": [
        { "heading": "Description", "items": ["..."], "confidence": 1 },
        { "heading": "Fit", "items": ["Dimensions: 6.2ft x 2.2ft x 3mm", "Weight: Approximately 5 lbs"], "confidence": 1 },
        { "heading": "Fabrication", "items": ["Base: Natural Rubber", "Coating: Polyurethane"], "confidence": 1 }
      ],
      "appendText": {
        "headings": ["Description", "Fit", "Fabrication"],
        "text": "Description: ... Fit: Dimensions: ... Weight: ... Fabrication: Base: ...",
        "confidence": 1
      }
    }
  ]
}
```

## How To Run

```bash
# For today
npm run enrich

# For a specific date folder under data/raw/
npm run enrich 2026-01-11

# Single brand + limit for debugging
npm run enrich 2026-01-11 -- --brand yolohayoga --max-products 5 --force
```

Notes:
- Enrichment requires network access (fetching HTML).
- Which brands are enriched (and how) is controlled by `config/enrichment.json`.

## Adding/Adjusting Brand Rules

Edit `config/enrichment.json`:
- Set `brands.{brandSlug}.enabled = true`
- Set `baseUrl` and `productPathTemplate` (defaults to `/products/{handle}`)
- Configure the `coreFeatures.heading` (and optional `endHeadings`) to bound extraction.
- Headings are matched against the raw HTML. If the page renders text like `Specs & Features` as `Specs &amp; Features` in source, you can still configure `Specs & Features` (the matcher handles the common entity forms).

If a brand’s DOM changes, the enrichment output will contain per-product `errors` like “Core features not found”, which is a signal to update parsing rules.

For debugging extraction failures, enrichment records may include `debug.coreFeaturesHtmlPreview` (a small HTML snippet around the first “Core Features” occurrence, when present).

If the brand uses an accordion UI (like Yoloha), enrichment targets the `accordion__body` content after the “Core Features” heading rather than relying on `endHeadings` text boundaries.
