# Manual Fallback Data

This directory contains manually fetched product data for brands that cannot be automatically scraped due to aggressive bot protection (e.g., Cloudflare challenges).

## How It Works

When the extraction script (`get-brands-from-convex.ts`) fails to fetch data for a brand, it will automatically check this directory for a fallback file and copy it to today's date.

## Usage

### 1. Fetch Data Manually in Browser

For brands with Cloudflare protection (like Alo Yoga):

1. Open your browser
2. Navigate to: `https://www.aloyoga.com/collections/yoga/products.json`
3. Wait for Cloudflare challenge to complete
4. Browser will display the JSON data
5. Copy all the JSON content

### 2. Save to This Directory

Create a file named `{brand-slug}.json` in this directory (recommended). The fetch script also supports a few fallback filename variants (e.g. removing dashes), but matching the Convex `brand.slug` is best.

**Format:**
```json
{
  "products": [
    {
      "id": 123,
      "title": "Product Name",
      "handle": "product-handle",
      ...
    }
  ]
}
```

**Example for Alo Yoga (Convex slug: `alo-yoga`):**
- Recommended: `data/raw/manual/alo-yoga.json`
- Also supported: `data/raw/manual/aloyoga.json`

### 3. Run the Pipeline

```bash
# Run extraction (will use fallback for failed brands)
npx tsx scripts/get-brands-from-convex.ts

# Continue with normalization
npx tsx scripts/normalize-data.ts
npx tsx scripts/aggregate-data.ts
```

The script will automatically:
- Try to scrape Alo Yoga
- If it fails (403 error), use `data/raw/manual/alo-yoga.json`
- Copy it to `data/raw/{today}/alo-yoga.json`
- Log: `📋 Used manual fallback for alo-yoga (extraction failed)`

## Current Manual Brands

### Alo Yoga
- **Reason**: Cloudflare JavaScript challenge
- **URL**: `https://www.aloyoga.com/collections/yoga/products.json`
- **File**: `alo-yoga.json`
- **Update Frequency**: Weekly/Monthly (as needed)

## Notes

- Files in this directory are **version controlled** (checked into git)
- Update these files periodically to keep data fresh
- The pipeline will use the manual fallback on failure.
- For consistently blocked brands (like Alo Yoga), the pipeline will **prefer the manual file and skip live fetch** when a manual file is present.
