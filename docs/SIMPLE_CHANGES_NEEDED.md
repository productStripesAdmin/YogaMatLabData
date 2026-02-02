# Simple Changes to scripts/lib/brand-series-index.ts

You need to make 3 simple edits to ONE file: `scripts/lib/brand-series-index.ts`

---

## Change 1: Add New Fields to Interface (Line 273)

**Location:** After line 272 (after the `images` field in `SeriesIndexRecord` interface)

**Add these lines:**

```typescript
  // Scoring and review data
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
```

---

## Change 2: Modify Return Statement (Line 682)

**Find this (line 682):**
```typescript
  return out;
```

**Replace with:**
```typescript
  return enrichWithScores(out);
```

---

## Change 3: Add Helper Function (After line 683)

**Location:** Right after the closing `}` of `buildSeriesIndex` function (after line 683)

**Add this entire function:**

```typescript
// Enrich series index with scoring data
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
    // If no scoring file, return original data
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

## Summary

1. **Add** new fields to `SeriesIndexRecord` interface (~30 lines)
2. **Change** `return out;` to `return enrichWithScores(out);` (1 line)
3. **Add** `enrichWithScores()` function (~35 lines)

**Total:** ~66 lines added/changed in ONE file

---

## Test It

After making changes:

```bash
# Run your pipeline
npm run build
# or however you normally run it

# Check output has scoring fields
cat data/aggregated/[date]/brand-series-index.json | grep -A 5 '"scores"'
```

You should see the manduka:pro entry has scores populated, and other series have `"scores": null`.
