# YML_app Integration Guide

## Overview

Two options for integrating series scoring data into YML_app:

### Option A: Use Pre-Enriched File (Recommended - Simpler)
Copy the enriched `brand-series-index.json` that already has scoring fields merged in.

### Option B: Runtime Merge (More Flexible)
Keep files separate and merge scoring data at runtime in the app.

---

## Option A: Pre-Enriched File (RECOMMENDED)

### Step 1: Copy Files to YML_app

```bash
cd /path/to/YML_app

# Create data directory if it doesn't exist
mkdir -p public/data
mkdir -p src/types

# Copy enriched brand-series-index (has scoring fields merged)
cp ../YogaMatLabData/data/aggregated/2026-01-30/brand-series-index.json \
   public/data/brand-series-index.json

# Copy TypeScript types
cp ../YogaMatLabData/config/series-scores.types.ts \
   src/types/series-scores.types.ts
```

### Step 2: Load in Your App

```typescript
// app/api/series/route.ts (or wherever you load data)
import fs from 'fs';
import path from 'path';

export async function GET() {
  const filePath = path.join(process.cwd(), 'public/data/brand-series-index.json');
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

  // Data already has scores, review, isReviewed, etc.
  return Response.json(data);
}
```

### Step 3: Use in Components

```tsx
// app/series/[seriesKey]/page.tsx
import brandSeriesIndex from '@/public/data/brand-series-index.json';
import type { EnrichedBrandSeriesEntry } from '@/types/series-scores.types';

export default function SeriesPage({ params }: { params: { seriesKey: string } }) {
  const series = brandSeriesIndex.find(
    (s: EnrichedBrandSeriesEntry) => s.seriesKey === params.seriesKey
  );

  if (!series) return <div>Series not found</div>;

  return (
    <div>
      <h1>{series.seriesName}</h1>

      {series.isReviewed ? (
        <>
          <div>Overall Score: {series.scores.overall}/10</div>
          <div>{series.review.overview}</div>

          <h3>Pros</h3>
          <ul>
            {series.review.pros.map((pro, i) => (
              <li key={i}>{pro}</li>
            ))}
          </ul>

          <h3>Cons</h3>
          <ul>
            {series.review.cons.map((con, i) => (
              <li key={i}>{con}</li>
            ))}
          </ul>

          <div>
            <strong>Best for:</strong> {series.review.bestFor}
          </div>

          <div>
            <strong>Yoga Styles:</strong> {series.yogaStyles.join(', ')}
          </div>
        </>
      ) : (
        <div>Review coming soon!</div>
      )}
    </div>
  );
}
```

### Step 4: Update When Scores Change

When you add/update scores in YogaMatLabData:

```bash
# In YogaMatLabData
node scripts/enrich-brand-series-index.js

# Copy to YML_app
cp data/aggregated/[new-date]/brand-series-index.json \
   ../YML_app/public/data/brand-series-index.json
```

---

## Option B: Runtime Merge (More Flexible)

### Step 1: Copy Both Files

```bash
cd /path/to/YML_app

mkdir -p public/data
mkdir -p src/types

# Copy ORIGINAL brand-series-index (without scores)
cp ../YogaMatLabData/data/aggregated/2026-01-29/brand-series-index.json \
   public/data/brand-series-index.json

# Copy scoring data separately
cp ../YogaMatLabData/config/series-scores.json \
   public/data/series-scores.json

# Copy types AND helper functions
cp ../YogaMatLabData/config/series-scores.types.ts \
   src/types/series-scores.types.ts
```

### Step 2: Merge at Runtime

```typescript
// lib/data-loader.ts
import brandSeriesIndexRaw from '@/public/data/brand-series-index.json';
import seriesScores from '@/public/data/series-scores.json';
import { enrichBrandSeriesWithScores } from '@/types/series-scores.types';

// Cache the enriched data
let enrichedData: ReturnType<typeof enrichBrandSeriesWithScores> | null = null;

export function getEnrichedBrandSeries() {
  if (!enrichedData) {
    enrichedData = enrichBrandSeriesWithScores(
      brandSeriesIndexRaw,
      seriesScores
    );
  }
  return enrichedData;
}
```

### Step 3: Use in API Routes

```typescript
// app/api/series/route.ts
import { getEnrichedBrandSeries } from '@/lib/data-loader';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const enriched = getEnrichedBrandSeries();

  // Filter by yoga style
  const yogaStyle = searchParams.get('yogaStyle');
  if (yogaStyle) {
    const filtered = enriched.filter(s =>
      s.yogaStyles.includes(yogaStyle)
    );
    return Response.json(filtered);
  }

  return Response.json(enriched);
}
```

---

## Data Syncing Strategy

### Current State
- **YogaMatLabData**: Has both raw and enriched data
- **YML_app**: Needs one of the files

### When to Sync

#### Scenario 1: New Products Scraped (Data Pipeline Runs)
```bash
# In YogaMatLabData (happens automatically via GitHub Actions)
# 1. Pipeline creates new brand-series-index.json
# 2. Run enrichment script
node scripts/enrich-brand-series-index.js

# 3. Copy to YML_app
cp data/aggregated/[new-date]/brand-series-index.json \
   /path/to/YML_app/public/data/
```

#### Scenario 2: Scores Updated (No New Products)
```bash
# In YogaMatLabData
# 1. Edit config/series-scores.json
# 2. Validate
node config/validate-scores.js

# 3. Re-enrich latest data
node scripts/enrich-brand-series-index.js

# 4. Copy to YML_app
cp data/aggregated/[date]/brand-series-index.json \
   /path/to/YML_app/public/data/
```

### Automated Sync Options

#### Option 1: GitHub Actions Workflow
```yaml
# .github/workflows/sync-scoring-data.yml
name: Sync Scoring Data to YML_app

on:
  push:
    branches: [data]
    paths:
      - 'data/aggregated/**'
      - 'config/series-scores.json'

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Enrich brand-series-index
        run: node scripts/enrich-brand-series-index.js

      - name: Copy to YML_app repo
        run: |
          # Clone YML_app repo
          git clone https://github.com/your-org/YML_app.git

          # Copy enriched file
          cp data/aggregated/$(ls -t data/aggregated | head -1)/brand-series-index.json \
             YML_app/public/data/

          # Commit and push
          cd YML_app
          git config user.name "GitHub Actions"
          git config user.email "actions@github.com"
          git add public/data/brand-series-index.json
          git commit -m "Update scoring data from YogaMatLabData"
          git push
```

#### Option 2: NPM Script in YML_app
```json
// YML_app/package.json
{
  "scripts": {
    "sync-data": "cp ../YogaMatLabData/data/aggregated/latest/brand-series-index.json public/data/"
  }
}
```

Then run: `npm run sync-data`

#### Option 3: Git Submodule (Advanced)
Make YogaMatLabData a submodule in YML_app:

```bash
# In YML_app
git submodule add https://github.com/your-org/YogaMatLabData.git data-source

# In package.json
{
  "scripts": {
    "postinstall": "cd data-source && git pull && cd .. && npm run sync-data",
    "sync-data": "cp data-source/data/aggregated/latest/brand-series-index.json public/data/"
  }
}
```

---

## Recommended Setup for You

Based on your setup with separate repos, I recommend:

### 1. **In YogaMatLabData** (add to your existing pipeline)

Add this to your GitHub Actions workflow that runs the data pipeline:

```yaml
# .github/workflows/data-pipeline.yml
# ... existing steps ...

- name: Enrich with scoring data
  run: node scripts/enrich-brand-series-index.js

- name: Commit enriched file
  run: |
    git add data/aggregated/
    git commit -m "Add enriched brand-series-index with scores"
    git push
```

### 2. **In YML_app** (manual sync for now, automate later)

Create a sync script:

```bash
# sync-scoring-data.sh
#!/bin/bash

LATEST_DIR=$(ls -t ../YogaMatLabData/data/aggregated | head -1)

echo "Syncing scoring data from YogaMatLabData/$LATEST_DIR..."

cp ../YogaMatLabData/data/aggregated/$LATEST_DIR/brand-series-index.json \
   public/data/brand-series-index.json

echo "✅ Sync complete!"
```

Make it executable:
```bash
chmod +x sync-scoring-data.sh
```

Run whenever you want to update:
```bash
./sync-scoring-data.sh
```

### 3. **File Structure in YML_app**

```
YML_app/
├── public/
│   └── data/
│       └── brand-series-index.json  ← Enriched with scores
├── src/
│   ├── types/
│   │   └── series-scores.types.ts   ← Type definitions
│   ├── lib/
│   │   └── data-loader.ts           ← Optional: caching layer
│   └── app/
│       ├── api/
│       │   └── series/
│       │       └── route.ts         ← API endpoint
│       └── series/
│           └── [seriesKey]/
│               └── page.tsx         ← Series detail page
└── sync-scoring-data.sh             ← Manual sync script
```

---

## Migration Checklist

- [ ] Choose Option A (pre-enriched) or Option B (runtime merge)
- [ ] Copy files to YML_app
  - [ ] `brand-series-index.json` → `public/data/`
  - [ ] `series-scores.types.ts` → `src/types/`
  - [ ] (Optional) `series-scores.json` → `public/data/`
- [ ] Create API route to serve series data
- [ ] Create series detail page component
- [ ] Test with a scored series (e.g., `manduka:pro`)
- [ ] Test with unscored series (should show null/empty values)
- [ ] Create sync script for future updates
- [ ] (Optional) Set up automated sync

---

## Testing

### Test Scored Series
```bash
# In YML_app
curl http://localhost:3000/api/series | jq '.[] | select(.seriesKey == "manduka:pro")'

# Should show:
# - scores: { gripDry: 8, ... }
# - review: { overview: "...", ... }
# - isReviewed: true
```

### Test Unscored Series
```bash
curl http://localhost:3000/api/series | jq '.[] | select(.seriesKey == "42birds:imperial-eagle")'

# Should show:
# - scores: null
# - review: null
# - isReviewed: false
```

---

## Summary

**Simplest Path:**
1. Copy enriched `brand-series-index.json` to YML_app
2. Copy type definitions
3. Load and use in your components
4. Re-sync when scores update

**No pipeline changes needed** - enrichment happens post-pipeline in YogaMatLabData.

Let me know your YML_app structure and I can give you more specific code examples!
