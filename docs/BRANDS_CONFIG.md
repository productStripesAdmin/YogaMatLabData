# Brands Config (YogaMatLabData)

YogaMatLabData typically fetches brand configs from Convex (`brands:getScrapableBrands`). For local/dev workflows (or to move away from spreadsheet-driven brand setup), you can run the fetch step from a JSON file instead.

## File Location

Create one of:
- `config/brands.json` (preferred)
- `brands.json`

Or set `YML_BRANDS_PATH` to an absolute/relative path.

## Enable File Mode

Set:
- `YML_BRANDS_SOURCE=file`

If `CONVEX_URL` is also set, the fetch step will still pull:
- product exclusions (if configured in Convex)
- series definitions (if configured in Convex)

## Shape

```jsonc
[
  {
    "slug": "manduka",
    "name": "Manduka",
    "website": "https://www.manduka.com",
    "scrapingEnabled": true,
    "platform": "shopify",
    "productsJsonUrl": "https://www.manduka.com/collections/yoga-mats/products.json",
    "rateLimit": { "delayBetweenProducts": 500, "delayBetweenPages": 1000 },
    "platformConfig": {}
  }
]
```

Minimum required fields per brand: `slug`, `name`, `website`.
