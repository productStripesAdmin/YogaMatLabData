# Product Series Scoring Implementation

## Summary

This document describes the implementation of product series-level scoring and recommendations for YogaMatLab.

## What Was Created

### 1. Core Scoring Data
**File:** `config/series-scores.json`

Contains comprehensive scoring and review data for 19 yoga mat series including:
- Manduka (PRO, eKO, GRP Hot Yoga, GRP Adapt 2.0, PROlite, Begin)
- Lululemon (The Mat, Reversible Mat, Take Form)
- Jade (Harmony, Fusion, Voyager)
- Liforme (Original)
- Yoloha (Unity Pro, Aura)
- Gaiam (Premium)
- Alo Yoga (Warrior)
- Hugger Mugger (Earth Elements, Para Rubber)
- Yoga Design Lab (Combo)

### 2. Documentation
**File:** `config/SCORING_README.md`

Complete guide covering:
- Data structure and field definitions
- Scoring methodology (0-10 scale)
- Data sources (OutdoorGearLab, Reddit, editorial)
- Integration instructions
- Maintenance procedures
- Current coverage status

### 3. TypeScript Types
**File:** `config/series-scores.types.ts`

Type-safe definitions for:
- `SeriesScores` - 12 performance metrics
- `SeriesReview` - editorial content structure
- `YogaStyle` and `UseCase` enums
- `EnrichedBrandSeriesEntry` - merged data type
- Helper functions for filtering and sorting

## Data Structure

Each scored series includes:

```json
{
  "seriesKey": "manduka:pro",
  "scores": {
    "gripDry": 8.0,
    "gripWet": 6.5,
    "durability": 10.0,
    "cushioning": 10.0,
    "ecoRating": 8.0,
    "portability": 4.0,
    "easeOfCleaning": 9.5,
    "stability": 10.0,
    "initialOdor": 6.0,
    "value": 7.5,
    "performance": 9.0,
    "overall": 9.1
  },
  "review": {
    "overview": "...",
    "pros": [...],
    "cons": [...],
    "bestFor": "...",
    "notIdealFor": "...",
    "lastUpdated": "2026-01-29"
  },
  "isReviewed": true,
  "yogaStyles": ["Vinyasa", "Power Yoga", "Hatha", "Yin", "Restorative"],
  "useCases": ["Studio", "Home"],
  "affiliateLinks": {
    "brandWebsite": "https://..."
  }
}
```

## Integration with YML_app

### Step 1: Load the Scoring Data

```typescript
import { SeriesScoresData } from '@/config/series-scores.types';

const seriesScores: SeriesScoresData = await fetch(
  '/api/series-scores'
).then(r => r.json());
```

### Step 2: Enrich Brand Series Index

```typescript
import { enrichBrandSeriesWithScores } from '@/config/series-scores.types';

const brandSeriesIndex = await fetch(
  '/data/aggregated/2026-01-29/brand-series-index.json'
).then(r => r.json());

const enrichedSeries = enrichBrandSeriesWithScores(
  brandSeriesIndex,
  seriesScores
);
```

### Step 3: Filter and Sort

```typescript
import { filterSeriesByCriteria, sortSeries } from '@/config/series-scores.types';

// Find mats for hot yoga
const hotYogaMats = filterSeriesByCriteria(enrichedSeries, {
  yogaStyle: 'Hot Yoga',
  minGripWet: 8.0,
  requiresReviewed: true
});

// Sort by overall score
const topRated = sortSeries(hotYogaMats, 'overall', 'desc');
```

## Scoring Metrics (0-10 Scale)

| Metric | Description | Priority |
|--------|-------------|----------|
| **gripDry** | Traction when dry | High |
| **gripWet** | Traction when sweaty | High |
| **durability** | Long-term wear resistance | High |
| **performance** | Overall athletic performance | High |
| **cushioning** | Joint protection | Medium |
| **ecoRating** | Environmental friendliness | Medium |
| **portability** | Transport ease | Medium |
| **stability** | Firmness for balance | Medium |
| **value** | Price-to-performance | Medium |
| **easeOfCleaning** | Maintenance | Low |
| **initialOdor** | Chemical smell | Low |
| **overall** | Weighted average | - |

## Rating Tiers

| Score Range | Rating |
|-------------|--------|
| 9.0-10.0 | Exceptional |
| 8.0-8.9 | Excellent |
| 7.0-7.9 | Very Good |
| 6.0-6.9 | Good |
| 5.0-5.9 | Fair |
| 4.0-4.9 | Below Average |
| 0.0-3.9 | Poor |

## Use Cases for App Features

### 1. Series Detail Page
Display full scores and review:
```typescript
const series = enrichedSeries.find(s => s.seriesKey === 'manduka:pro');

// Show score radar chart
<ScoreRadar scores={series.scores} />

// Show pros/cons
<ReviewSection review={series.review} />

// Show recommended yoga styles
<YogaStyleBadges styles={series.yogaStyles} />
```

### 2. Comparison Tool
Compare multiple series side-by-side:
```typescript
const comparison = ['manduka:pro', 'lululemon:the-mat', 'liforme:standard']
  .map(key => enrichedSeries.find(s => s.seriesKey === key));

<ComparisonTable series={comparison} />
```

### 3. Recommendation Engine
Find best match based on user preferences:
```typescript
const recommended = filterSeriesByCriteria(enrichedSeries, {
  yogaStyle: userPreferences.style,
  maxPrice: userPreferences.budget,
  minGripWet: userPreferences.sweaty ? 8.0 : undefined,
  minEcoRating: userPreferences.ecoFriendly ? 7.0 : undefined,
  requiresReviewed: true
});

const sorted = sortSeries(recommended, 'overall', 'desc');
const topPick = sorted[0];
```

### 4. Filter/Sort Interface
```typescript
<SeriesGrid
  series={enrichedSeries}
  filters={{
    yogaStyle: selectedStyle,
    useCase: selectedUseCase,
    priceRange: [minPrice, maxPrice],
    minScores: {
      overall: 7.0,
      gripWet: userNeedsWetGrip ? 7.5 : undefined
    }
  }}
  sortBy="overall"
  sortDirection="desc"
/>
```

## Data Sources

Scores synthesized from:

1. **OutdoorGearLab** - Professional testing lab
   - 18 mats tested with standardized metrics
   - File: `config/reviews/outdoorgearlab.json`

2. **Reddit Community** - User experiences
   - Real-world durability feedback
   - File: `config/reviews/reddit-sheet.json`

3. **Editorial Analysis** - Expert synthesis
   - Cross-source validation
   - Normalization to consistent scale

## Next Steps

### Immediate (Required for Launch)
- [ ] Integrate scoring data into YML_app API
- [ ] Create UI components for score display
- [ ] Build comparison tool
- [ ] Implement recommendation engine
- [ ] Add filtering by scores

### Short-term Enhancements
- [ ] Add Amazon affiliate links
- [ ] Score remaining top 20 series
- [ ] Create score update workflow
- [ ] Add user ratings aggregation

### Long-term Features
- [ ] Price tracking over time
- [ ] Seasonal recommendations
- [ ] Mat degradation timeline estimates
- [ ] Video review integration
- [ ] Community voting on scores

## File Structure

```
YogaMatLabData/
├── config/
│   ├── series-scores.json           # Main scoring data
│   ├── series-scores.types.ts       # TypeScript definitions
│   ├── SCORING_README.md            # Documentation
│   └── reviews/
│       ├── outdoorgearlab.json      # Source data
│       └── reddit-sheet.json        # Source data
├── data/
│   └── aggregated/
│       └── 2026-01-29/
│           └── brand-series-index.json  # To be enriched
└── SERIES_SCORING_IMPLEMENTATION.md  # This file
```

## Example: Complete Integration Flow

```typescript
// 1. Load data
import seriesScoresData from '@/config/series-scores.json';
import { enrichBrandSeriesWithScores, filterSeriesByCriteria, sortSeries } from '@/types/series-scores';

// 2. Fetch brand series index
const brandSeriesIndex = await loadBrandSeriesIndex();

// 3. Enrich with scores
const enriched = enrichBrandSeriesWithScores(brandSeriesIndex, seriesScoresData);

// 4. User selects "Hot Yoga" and budget up to $150
const filtered = filterSeriesByCriteria(enriched, {
  yogaStyle: 'Hot Yoga',
  maxPrice: 150,
  minGripWet: 8.0,
  requiresReviewed: true
});

// 5. Sort by overall score
const results = sortSeries(filtered, 'overall', 'desc');

// 6. Display top 5
const topFive = results.slice(0, 5);

// Results:
// 1. Manduka GRP Hot Yoga (9.5 wet grip, $130)
// 2. Manduka GRP Adapt 2.0 (9.0 wet grip, $90)
// 3. Liforme Original (9.0 wet grip, $140)
// 4. Lululemon The Mat (8.5 wet grip, $98)
// 5. Yoloha Unity Pro (9.0 wet grip, $159) ❌ over budget
```

## Maintenance

### Adding New Series
1. Research from review sources
2. Convert scores to 0-10 scale
3. Write comprehensive review
4. Validate seriesKey format
5. Add to `series-scores.json`
6. Update this document's coverage count

### Updating Existing Scores
1. Review new data
2. Update affected metrics
3. Revise review content if needed
4. Update `lastUpdated` timestamp

## Support

For questions about the scoring system:
- Review: `config/SCORING_README.md`
- Types: `config/series-scores.types.ts`
- Data: `config/series-scores.json`
