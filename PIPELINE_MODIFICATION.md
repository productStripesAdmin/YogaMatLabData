# Simple Pipeline Modification

## What to Change

Add scoring enrichment to `scripts/lib/brand-series-index.ts` on the **main branch**.

---

## Step 1: Copy series-scores.json to main branch

```bash
git checkout main
cp config/series-scores.json config/  # Already there on data branch, copy to main
git add config/series-scores.json
git commit -m "Add series scoring data config"
```

---

## Step 2: Modify brand-series-index.ts

At the **very end** of the `buildSeriesIndex()` function (line ~700+), add this:

```typescript
// BEFORE (current code - last few lines):
export function buildSeriesIndex(products: NormalizedYogaMat[]): SeriesIndexRecord[] {
  // ... all existing code ...

  out.sort((a, b) =>
    a.brandSlug.localeCompare(b.brandSlug) ||
    (b.productCount - a.productCount) ||
    a.seriesName.localeCompare(b.seriesName)
  );

  return out;  // ← Currently returns here
}
```

```typescript
// AFTER (add enrichment before return):
export function buildSeriesIndex(products: NormalizedYogaMat[]): SeriesIndexRecord[] {
  // ... all existing code stays the same ...

  out.sort((a, b) =>
    a.brandSlug.localeCompare(b.brandSlug) ||
    (b.productCount - a.productCount) ||
    a.seriesName.localeCompare(b.seriesName)
  );

  // ✨ ADD THIS: Enrich with scoring data
  const enriched = enrichWithScores(out);

  return enriched;  // ← Return enriched instead of out
}

// ✨ ADD THIS FUNCTION at the end of the file:

interface SeriesScore {
  seriesKey: string;
  scores: any;
  review: any;
  isReviewed: boolean;
  yogaStyles: string[];
  useCases: string[];
  affiliateLinks: any;
}

function enrichWithScores(seriesIndex: SeriesIndexRecord[]): SeriesIndexRecord[] {
  let seriesScores: SeriesScore[] = [];

  try {
    const configPath = path.join(process.cwd(), 'config', 'series-scores.json');
    const raw = readFileSync(configPath, 'utf-8');
    seriesScores = JSON.parse(raw);
  } catch {
    // If no scoring file exists, just return original data
    return seriesIndex;
  }

  return seriesIndex.map(series => {
    const scoreData = seriesScores.find(s => s.seriesKey === series.seriesKey);

    return {
      ...series,
      scores: scoreData?.scores || null,
      review: scoreData?.review || null,
      isReviewed: scoreData?.isReviewed || false,
      yogaStyles: scoreData?.yogaStyles || [],
      useCases: scoreData?.useCases || [],
      affiliateLinks: scoreData?.affiliateLinks || {}
    };
  });
}
```

---

## Step 3: Update SeriesIndexRecord Interface

Add the new fields to the `SeriesIndexRecord` interface (around line 200):

```typescript
export interface SeriesIndexRecord {
  // ... all existing fields ...

  // Images aggregated from all products
  images?: Array<{
    src: string;
    alt: string | null;
    width: number;
    height: number;
  }>;

  // ✨ ADD THESE NEW FIELDS:
  scores?: {
    gripDry: number;
    gripWet: number;
    durability: number;
    cushioning: number;
    ecoRating: number;
    portability: number;
    easeOfCleaning: number;
    stability: number;
    initialOdor: number;
    value: number;
    performance: number;
    overall: number;
  } | null;

  review?: {
    overview: string;
    pros: string[];
    cons: string[];
    bestFor: string;
    notIdealFor: string;
    lastUpdated: string;
  } | null;

  isReviewed?: boolean;
  yogaStyles?: string[];
  useCases?: string[];
  affiliateLinks?: {
    brandWebsite?: string;
    amazon?: string;
    [key: string]: string | undefined;
  };
}
```

---

## That's It!

Your pipeline now:
1. Generates brand-series-index.json (as before)
2. **Automatically enriches** it with scoring data
3. Outputs the enriched version

No separate scripts needed. No manual steps. Just works!

---

## Testing

```bash
# On main branch
npm run pipeline  # or whatever command runs your pipeline

# Check output has scoring fields
cat data/aggregated/[date]/brand-series-index.json | grep -A 5 '"scores"'
```

---

## What Happens

**For scored series** (like manduka:pro):
```json
{
  "seriesKey": "manduka:pro",
  "scores": { "overall": 9.1, ... },
  "review": { ... },
  "isReviewed": true
}
```

**For unscored series**:
```json
{
  "seriesKey": "42birds:robin",
  "scores": null,
  "review": null,
  "isReviewed": false,
  "yogaStyles": [],
  "useCases": [],
  "affiliateLinks": {}
}
```

---

## Files Changed

On **main branch**:
- ✅ `config/series-scores.json` (copy from data branch)
- ✅ `scripts/lib/brand-series-index.ts` (add ~40 lines total)

That's literally it! Clean and simple.
