# 🚀 Quick Start: Series Scoring for YML_app

## What You Have Now

✅ **Enriched brand-series-index.json** with scoring fields for all 92 series
- 13 series have complete scores and reviews
- 79 series have `null` placeholders (ready for future scoring)

## File Locations

```
YogaMatLabData/
├── data/aggregated/2026-01-30/
│   └── brand-series-index.json      ← 🎯 USE THIS FILE
├── config/
│   ├── series-scores.json            ← Source scoring data
│   └── series-scores.types.ts        ← TypeScript types
└── scripts/
    └── enrich-brand-series-index.js  ← Regenerate enriched file
```

## Copy to YML_app (3 files)

```bash
# 1. Enriched data file
cp data/aggregated/2026-01-30/brand-series-index.json \
   ../YML_app/public/data/

# 2. TypeScript types
cp config/series-scores.types.ts \
   ../YML_app/src/types/

# 3. (Optional) Raw scores for reference
cp config/series-scores.json \
   ../YML_app/public/data/
```

## Use in YML_app

### Load Data
```typescript
// app/api/series/route.ts
import brandSeriesIndex from '@/public/data/brand-series-index.json';

export async function GET() {
  return Response.json(brandSeriesIndex);
}
```

### Filter Scored Series
```typescript
const scoredSeries = brandSeriesIndex.filter(s => s.isReviewed);
// Returns 13 series with complete scores
```

### Get Top Rated
```typescript
const topRated = brandSeriesIndex
  .filter(s => s.scores !== null)
  .sort((a, b) => (b.scores?.overall || 0) - (a.scores?.overall || 0))
  .slice(0, 5);

// Result:
// 1. Manduka PRO (9.1)
// 2. Manduka eKO (8.7)
// 3. Manduka GRP Hot Yoga (8.5)
// 4. Lululemon The Mat (8.4)
// ...
```

### Display on Series Page
```tsx
// app/series/[seriesKey]/page.tsx
export default function SeriesPage({ params }) {
  const series = brandSeriesIndex.find(
    s => s.seriesKey === params.seriesKey
  );

  return (
    <div>
      <h1>{series.seriesName}</h1>

      {series.isReviewed ? (
        <>
          <ScoreCard scores={series.scores} />
          <ReviewSection review={series.review} />
          <YogaStyleTags styles={series.yogaStyles} />
        </>
      ) : (
        <p>Full review coming soon!</p>
      )}
    </div>
  );
}
```

## When to Regenerate Enriched File

### Add New Scores
1. Edit `config/series-scores.json`
2. Run validation: `node config/validate-scores.js`
3. Regenerate: `node scripts/enrich-brand-series-index.js`
4. Copy new file to YML_app

### Update Existing Scores
Same process as adding new scores.

### New Products Scraped
When the data pipeline adds new series to brand-series-index.json:
1. Run: `node scripts/enrich-brand-series-index.js 2026-01-29 [new-date]`
2. Unscored series will get `null` values automatically
3. Copy to YML_app

## Field Structure Reference

```typescript
interface EnrichedSeries {
  // Original fields (from data pipeline)
  seriesKey: string;
  seriesName: string;
  minPrice: number;
  // ... 50+ other fields

  // ✅ NEW SCORING FIELDS (always present)
  scores: {
    gripDry: number;      // 0-10
    gripWet: number;      // 0-10
    durability: number;   // 0-10
    // ... 9 more metrics
    overall: number;      // 0-10
  } | null;

  review: {
    overview: string;
    pros: string[];
    cons: string[];
    bestFor: string;
    notIdealFor: string;
    lastUpdated: string;
  } | null;

  isReviewed: boolean;          // true = has scores
  yogaStyles: string[];         // ["Vinyasa", "Hot Yoga", ...]
  useCases: string[];           // ["Studio", "Home", "Travel"]
  affiliateLinks: {
    brandWebsite: string;
    amazon?: string;
  };
}
```

## Common Queries

### Find mats for Hot Yoga
```typescript
const hotYogaMats = brandSeriesIndex.filter(s =>
  s.isReviewed && s.yogaStyles.includes('Hot Yoga')
);
```

### Find budget-friendly (under $100)
```typescript
const budgetMats = brandSeriesIndex.filter(s =>
  s.isReviewed && s.minPrice < 100
);
```

### Find eco-friendly mats
```typescript
const ecoMats = brandSeriesIndex.filter(s =>
  s.scores && s.scores.ecoRating >= 8.0
);
```

### Best value (high score, low price)
```typescript
const valueMats = brandSeriesIndex
  .filter(s => s.scores)
  .sort((a, b) => {
    const aValue = (a.scores!.overall / a.minPrice) * 100;
    const bValue = (b.scores!.overall / b.minPrice) * 100;
    return bValue - aValue;
  });
```

## Helpful Commands

### Validate Scores
```bash
node config/validate-scores.js
```

### Regenerate Enriched File
```bash
node scripts/enrich-brand-series-index.js [input-date] [output-date]

# Use latest input
node scripts/enrich-brand-series-index.js

# Specify dates
node scripts/enrich-brand-series-index.js 2026-01-29 2026-01-30
```

### Check Coverage
```bash
node -e "
const data = require('./data/aggregated/2026-01-30/brand-series-index.json');
console.log('Total series:', data.length);
console.log('Scored series:', data.filter(s => s.isReviewed).length);
console.log('Unscored:', data.filter(s => !s.isReviewed).length);
"
```

## Documentation

- 📖 **Full Documentation**: `config/SCORING_README.md`
- 🚀 **Implementation Guide**: `SERIES_SCORING_IMPLEMENTATION.md`
- ✅ **Verification**: `VERIFICATION_COMPLETE.md`
- 📦 **Deliverables**: `DELIVERABLES.md`
- 💡 **API Examples**: `config/example-api-endpoint.ts`
- 📘 **Types**: `config/series-scores.types.ts`

## Need Help?

1. Check `VERIFICATION_COMPLETE.md` for examples
2. See `config/example-api-endpoint.ts` for API patterns
3. Review `config/series-scores.types.ts` for TypeScript helpers

---

**Ready to integrate! 🎉**

The enriched `brand-series-index.json` is production-ready with all scoring fields.
