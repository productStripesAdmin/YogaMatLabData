# YogaMatLabApp Integration Instructions

**INSTRUCTIONS FOR CLAUDE INSTANCE IN YogaMatLabApp REPOSITORY**

This document provides step-by-step instructions for integrating the YogaMatLabData pipeline with YogaMatLabApp.

## Overview

YogaMatLabData is now generating daily product data from Shopify brands. This integration will:
1. Add YogaMatLabData as a git submodule
2. Create a Convex mutation for bulk upserting yoga mats
3. Create an import script to load data into Convex
4. Add npm scripts for easy data updates

## Prerequisites

Before starting, ensure:
- YogaMatLabData repository is set up and running (GitHub Actions workflow is active)
- Convex `yogaMats` table schema is defined
- You have the necessary Convex permissions

## Step 1: Add Git Submodule

Add YogaMatLabData as a git submodule in the `data/external` directory:

```bash
git submodule add https://github.com/productStripesAdmin/YogaMatLabData.git data/external
git commit -m "Add YogaMatLabData as submodule for automated product data"
```

This creates:
- `data/external/` directory containing the YogaMatLabData repository
- `.gitmodules` file tracking the submodule configuration

## Step 2: Create Convex Bulk Upsert Mutation

Create a new file: `convex/yogaMats/bulkUpsert.ts`

```typescript
import { v } from "convex/values";
import { mutation } from "../_generated/server";
import { Id } from "../_generated/dataModel";

// Define the yoga mat input schema based on the normalized data structure
const yogaMatInput = v.object({
  slug: v.string(),
  name: v.string(),
  brandSlug: v.string(),
  price: v.number(),
  currency: v.string(),
  url: v.string(),
  imageUrl: v.optional(v.string()),
  description: v.optional(v.string()),
  material: v.optional(v.string()),
  thickness: v.optional(v.number()),
  dimensions: v.optional(
    v.object({
      length: v.optional(v.number()),
      width: v.optional(v.number()),
    })
  ),
  weight: v.optional(v.number()),
  features: v.optional(v.array(v.string())),
  colors: v.optional(v.array(v.string())),
  tags: v.optional(v.array(v.string())),
  inStock: v.boolean(),
  rating: v.optional(v.number()),
  reviewCount: v.optional(v.number()),
  scrapedAt: v.string(),
  productId: v.string(),
});

export const bulkUpsert = mutation({
  args: {
    mats: v.array(yogaMatInput),
  },
  handler: async (ctx, args) => {
    const results = {
      inserted: 0,
      updated: 0,
      errors: 0,
    };

    for (const mat of args.mats) {
      try {
        // Check if mat already exists by slug
        const existing = await ctx.db
          .query("yogaMats")
          .withIndex("by_slug", (q) => q.eq("slug", mat.slug))
          .first();

        if (existing) {
          // Update existing mat
          await ctx.db.patch(existing._id, mat);
          results.updated++;
        } else {
          // Insert new mat
          await ctx.db.insert("yogaMats", mat);
          results.inserted++;
        }
      } catch (error) {
        console.error(`Error upserting mat ${mat.slug}:`, error);
        results.errors++;
      }
    }

    return results;
  },
});
```

**Important:** Adjust the schema based on your existing `yogaMats` table definition. The above schema matches the normalized data output from YogaMatLabData.

## Step 3: Ensure yogaMats Table Has Slug Index

In your Convex schema file (likely `convex/schema.ts`), ensure the `yogaMats` table has an index on `slug`:

```typescript
yogaMats: defineTable({
  slug: v.string(),
  name: v.string(),
  brandSlug: v.string(),
  // ... other fields
}).index("by_slug", ["slug"]),
```

## Step 4: Create Import Script

Create a new file: `scripts/import-mats-from-data.ts`

```typescript
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import { promises as fs } from "fs";
import path from "path";
import "dotenv/config";

const BATCH_SIZE = 50; // Process 50 mats at a time

interface NormalizedYogaMat {
  slug: string;
  name: string;
  brandSlug: string;
  price: number;
  currency: string;
  url: string;
  imageUrl?: string;
  description?: string;
  material?: string;
  thickness?: number;
  dimensions?: {
    length?: number;
    width?: number;
  };
  weight?: number;
  features?: string[];
  colors?: string[];
  tags?: string[];
  inStock: boolean;
  rating?: number;
  reviewCount?: number;
  scrapedAt: string;
  productId: string;
}

interface AggregatedData {
  products: NormalizedYogaMat[];
  stats: {
    totalProducts: number;
    totalBrands: number;
    priceStats: {
      min: number;
      max: number;
      average: number;
      median: number;
    };
  };
}

async function importMatsToConvex() {
  console.log("🚀 Starting yoga mat import to Convex...\n");

  // Check for Convex URL
  const convexUrl = process.env.CONVEX_URL || process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!convexUrl) {
    throw new Error(
      "CONVEX_URL or NEXT_PUBLIC_CONVEX_URL environment variable is not set"
    );
  }

  // Initialize Convex client
  const client = new ConvexHttpClient(convexUrl);

  // Read aggregated data
  const dataPath = path.join(
    process.cwd(),
    "data/external/data/aggregated/latest/all-products.json"
  );

  console.log(`📂 Reading data from: ${dataPath}`);

  let data: AggregatedData;
  try {
    const fileContent = await fs.readFile(dataPath, "utf-8");
    data = JSON.parse(fileContent);
  } catch (error) {
    throw new Error(
      `Failed to read aggregated data. Have you run 'git submodule update --remote'?\n${error}`
    );
  }

  console.log(`📊 Found ${data.products.length} products from ${data.stats.totalBrands} brands\n`);

  // Process in batches
  let totalInserted = 0;
  let totalUpdated = 0;
  let totalErrors = 0;

  for (let i = 0; i < data.products.length; i += BATCH_SIZE) {
    const batch = data.products.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(data.products.length / BATCH_SIZE);

    console.log(`📦 Processing batch ${batchNum}/${totalBatches} (${batch.length} products)...`);

    try {
      const result = await client.mutation(api.yogaMats.bulkUpsert.bulkUpsert, {
        mats: batch,
      });

      totalInserted += result.inserted;
      totalUpdated += result.updated;
      totalErrors += result.errors;

      console.log(
        `   ✓ Inserted: ${result.inserted}, Updated: ${result.updated}, Errors: ${result.errors}`
      );
    } catch (error) {
      console.error(`   ✗ Batch ${batchNum} failed:`, error);
      totalErrors += batch.length;
    }

    // Small delay between batches to avoid overwhelming Convex
    if (i + BATCH_SIZE < data.products.length) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("📈 IMPORT SUMMARY");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`✨ Total Inserted: ${totalInserted}`);
  console.log(`🔄 Total Updated: ${totalUpdated}`);
  console.log(`❌ Total Errors: ${totalErrors}`);
  console.log(`📊 Total Processed: ${data.products.length}`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  if (totalErrors > 0) {
    console.log("⚠️  Some products failed to import. Check the logs above for details.\n");
  } else {
    console.log("✅ All products imported successfully!\n");
  }

  client.close();
}

importMatsToConvex().catch((error) => {
  console.error("❌ Fatal error during import:", error);
  process.exit(1);
});
```

## Step 5: Add NPM Scripts

Add the following scripts to your `package.json`:

```json
{
  "scripts": {
    "import-mats": "tsx scripts/import-mats-from-data.ts",
    "update-data": "git submodule update --remote data/external && npm run import-mats",
    "init-submodule": "git submodule update --init --recursive"
  }
}
```

## Step 6: Add TypeScript Dependency (if needed)

Ensure you have `tsx` installed for running TypeScript scripts:

```bash
npm install -D tsx
```

## Step 7: Update .gitignore

Add to `.gitignore` if not already present:

```
# Git submodules are tracked, but we ignore the submodule content changes
# (we only care about which commit the submodule points to)
```

Note: The `data/external/` directory itself should be committed (it contains the submodule reference), but Git will track it specially as a submodule.

## Usage

### Initial Setup (One-time)

```bash
# Initialize the submodule (if cloning the repo fresh)
npm run init-submodule
```

### Importing Data

```bash
# Option 1: Update submodule and import in one command
npm run update-data

# Option 2: Manual steps
git submodule update --remote data/external
npm run import-mats
```

### Daily Workflow

The YogaMatLabData repository automatically runs daily at 2 AM UTC via GitHub Actions. To get the latest data:

```bash
npm run update-data
```

This will:
1. Pull the latest data from YogaMatLabData submodule
2. Import all products into Convex
3. Show summary of inserted/updated products

## Data Structure

The aggregated data file (`all-products.json`) contains:

```typescript
{
  "products": [...], // Array of normalized yoga mat products
  "stats": {
    "totalProducts": 57,
    "totalBrands": 2,
    "priceStats": {
      "min": 52,
      "max": 350,
      "average": 156.8,
      "median": 145
    },
    "materialBreakdown": { ... },
    "featureBreakdown": { ... }
  }
}
```

## Troubleshooting

### "Failed to read aggregated data"
- Run `git submodule update --init --recursive` to initialize the submodule
- Run `git submodule update --remote` to pull latest data

### "CONVEX_URL is not set"
- Ensure `.env` or `.env.local` has `CONVEX_URL` or `NEXT_PUBLIC_CONVEX_URL`

### Submodule shows "modified" in git status
- This is normal if YogaMatLabData has new commits
- Run `git submodule update --remote` to update to latest
- Commit the submodule reference change: `git add data/external && git commit -m "Update data submodule"`

### Import fails with schema errors
- Verify the `yogaMatInput` schema in `bulkUpsert.ts` matches your Convex `yogaMats` table schema
- Adjust field types as needed

## Next Steps

After completing this integration:

1. **Test the import**: Run `npm run update-data` and verify products appear in Convex dashboard
2. **Set up automation** (optional): Create a GitHub Action in YogaMatLabApp to automatically pull and import data daily
3. **Update your app**: Ensure your frontend queries the `yogaMats` table to display products

## Support

If you encounter issues:
1. Check the YogaMatLabData repository logs (GitHub Actions)
2. Verify the submodule is properly initialized
3. Ensure Convex schema matches the import script expectations
