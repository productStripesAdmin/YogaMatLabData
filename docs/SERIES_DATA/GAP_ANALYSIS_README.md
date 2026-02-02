# Gap Analysis Tool Documentation

## Overview

The gap analysis tool identifies discrepancies between your review data sources and the brand-series configuration. This helps ensure all reviewed series are properly configured in the pipeline and highlights which series need review data.

## Files

### Analysis Script
- **Location:** `/tmp/find_series_gaps.js`
- **Purpose:** Analyzes differences between review data and brand-series.json
- **Run:** `node /tmp/find_series_gaps.js`

### Output Files

#### 1. SERIES_GAPS.md
- **Location:** `config/reviews/SERIES_GAPS.md`
- **Format:** Human-readable markdown
- **Content:**
  - Executive summary with statistics
  - High-priority series missing from config (scored + OGL reviewed)
  - Medium-priority series missing from config (Reddit data only)
  - Brand coverage statistics
  - Slug mismatch warnings
  - Action plan

#### 2. series-gaps-report.json
- **Location:** `config/reviews/series-gaps-report.json`
- **Format:** Machine-readable JSON
- **Structure:**
  ```json
  {
    "timestamp": "ISO 8601 timestamp",
    "summary": {
      "configTotal": 159,
      "reviewTotal": 56,
      "inReviewsNotConfig": 47,
      "inConfigNotReviews": 150
    },
    "missingFromConfig": [
      {
        "seriesKey": "alo-yoga:warrior-mat",
        "brand": "Alo Yoga",
        "series": "Warrior Mat",
        "sources": ["OutdoorGearLab", "Reddit", "Scored"]
      }
    ],
    "missingReviewData": [
      {
        "seriesKey": "42birds:imperial-eagle",
        "name": "\"The Imperial Eagle\" Cork Industrial",
        "tagline": "Durable cork mat line..."
      }
    ]
  }
  ```

## Data Sources

The analysis compares four data sources:

### 1. Configuration (Source of Truth for Pipeline)
- **File:** `config/brand-series.json`
- **Purpose:** Defines all brands and series the pipeline knows about
- **Format:** Array of brand objects with nested series

### 2. OutdoorGearLab Reviews
- **File:** `config/reviews/outdoorgearlab.json`
- **Content:** 18 professionally tested mats with detailed scoring
- **Fields Used:** `seriesKey`, `Brand`, `Series`, `Overall Score`

### 3. Reddit Community Data
- **File:** `config/reviews/reddit-sheet.json`
- **Content:** 44 community-recommended mats
- **Fields Used:** `seriesKey`, `Company`, `Name`, `Price (USD)`

### 4. Series Scores (Curated Scoring Data)
- **File:** `config/series-scores.json`
- **Content:** 20 fully scored and reviewed series
- **Fields Used:** `seriesKey`, `scores`, `review`, `isReviewed`

## Running the Analysis

### Quick Run
```bash
node /tmp/find_series_gaps.js
```

### Output
The script prints to console and generates two files:
- `config/reviews/SERIES_GAPS.md`
- `config/reviews/series-gaps-report.json`

### When to Run

Run the gap analysis:
- ✅ After adding new review data
- ✅ After updating brand-series.json
- ✅ After adding new scored series
- ✅ Before running the pipeline (to ensure data consistency)
- ✅ Periodically to identify series needing reviews

## Understanding the Output

### Gap Type 1: In Review Data but Missing from Config

**Priority Level:** HIGH - These must be fixed

**What it means:** You have review/scoring data for series that aren't in brand-series.json. The pipeline won't be able to match this data.

**Example:**
```
- alo-yoga:warrior-mat
  Brand: Alo Yoga, Series: Warrior Mat
  Sources: OGL, Reddit, Scored
```

**Action Required:** Add these series to brand-series.json

### Gap Type 2: In Config but Not in Review Data

**Priority Level:** MEDIUM - Nice to have

**What it means:** You have series configured in the pipeline, but no review/scoring data for them yet.

**Example:**
```
- 42birds:imperial-eagle
  Name: "The Imperial Eagle" Cork Industrial
  Tagline: Durable cork mat line geared toward heavier use
```

**Action Optional:** Consider gathering review data for these series

### Coverage Statistics

Shows which brands have good review coverage:

```
manduka              9/13 missing (31% coverage)
```

This means:
- 13 total series configured for Manduka
- 9 series have no review data
- 4 series have review data (31% coverage)

## Common Issues

### Issue 1: Slug Mismatches

**Problem:** Review data uses different brand slugs than config

**Example:**
- Reviews: `hugger-mugger:earth-elements`
- Config: `huggermugger:earth-elements`

**Impact:** Pipeline won't match the data even though it's for the same product

**Solution:** Choose canonical slugs and update either:
- Review data seriesKeys, OR
- Brand slugs in brand-series.json

**Recommendation:** Update brand-series.json to match review data slugs (review data is external/harder to change)

### Issue 2: Duplicate Series

**Problem:** Same series appears with multiple slugs

**Example:**
- `yoloha:unity-cork` (from OGL)
- `yoloha:unity` (from Reddit)

**Impact:** May be the same product with different naming

**Solution:**
1. Research which is correct
2. Update review data to use consistent seriesKey
3. Ensure brand-series.json has the correct variant

### Issue 3: Missing Brand Entirely

**Problem:** Review data has brands not in config

**Example:** `jollie:the-plush-mat` exists in reviews but brand `jollie` isn't in brand-series.json

**Solution:** Add the entire brand to brand-series.json:
```json
{
  "slug": "jollie",
  "series": [
    {
      "name": "The Plush",
      "slug": "the-plush-mat",
      "tagline": "...",
      "description": "...",
      "matchTitleAny": ["The Plush mat"],
      "priority": 10
    }
  ]
}
```

## Workflow for Fixing Gaps

### Step 1: Review the Report
```bash
node /tmp/find_series_gaps.js
cat config/reviews/SERIES_GAPS.md
```

### Step 2: Fix Slug Mismatches
Decide on canonical slugs and update brand-series.json:
- `huggermugger` → `hugger-mugger`
- `aloyoga` → `alo-yoga`
- `jadeyoga` → `jade`
- `yogadesignlab` → `yoga-design-lab`

### Step 3: Add High-Priority Series
For each series with OGL reviews + scores:
1. Find the correct brand in brand-series.json
2. Add series entry with proper matching rules
3. Verify seriesKey matches review data exactly

### Step 4: Add Medium-Priority Series
For series with only Reddit data:
1. Evaluate if series is important enough to add
2. Add to brand-series.json if needed
3. Consider adding to scoring queue

### Step 5: Re-run Analysis
```bash
node /tmp/find_series_gaps.js
```

Verify gaps are reduced.

## Integration with Pipeline

### How seriesKey Works

1. **Pipeline generates products:**
   - Scrapes Shopify stores
   - Normalizes product data
   - Assigns to series based on matching rules in brand-series.json
   - Creates seriesKey: `{brand.slug}:{series.slug}`

2. **Enrichment adds review data:**
   - `enrichWithScores()` in `scripts/lib/brand-series-index.ts`
   - Loads `config/series-scores.json`
   - Matches by seriesKey
   - Adds scores/review/metadata to series

3. **Gap analysis validates:**
   - Ensures review data seriesKeys exist in config
   - Identifies orphaned review data
   - Highlights missing coverage

### Pipeline Flow
```
Products → Normalize → Match to Series → Assign seriesKey → Enrich with Scores
                       ↑                                    ↑
                   brand-series.json                  series-scores.json
                                                            ↑
                                                    (validated by gap analysis)
```

## Maintenance Schedule

| Frequency | Task |
|-----------|------|
| **Before each pipeline run** | Quick check for critical gaps |
| **After adding review data** | Full gap analysis + fixes |
| **Monthly** | Coverage review, prioritize scoring new series |
| **Quarterly** | Brand coverage analysis, identify underrepresented brands |

## Example: Adding a Missing Series

### Scenario
Gap analysis shows: `b-yoga:strong` exists in Reddit data but not in config

### Steps

1. **Check the review data:**
```json
{
  "seriesKey": "b-yoga:strong",
  "Company": "B Yoga",
  "Name": "B Mat Strong",
  "Price (USD)": "$114"
}
```

2. **Find/create brand in brand-series.json:**
```json
{
  "slug": "b-yoga",
  "series": [
    // existing series...
  ]
}
```

3. **Add the series:**
```json
{
  "name": "B Mat Strong",
  "slug": "strong",
  "tagline": "Strong mat line (6mm thickness).",
  "description": "Rubber mat with non-slip grip.",
  "matchTitleAny": [
    "B Mat Strong",
    "The B Mat Strong"
  ],
  "matchAny": [
    "Strong"
  ],
  "priority": 20
}
```

4. **Verify seriesKey matches:**
- Brand slug: `b-yoga`
- Series slug: `strong`
- Combined: `b-yoga:strong` ✓

5. **Re-run analysis:**
```bash
node /tmp/find_series_gaps.js
```

Should no longer show `b-yoga:strong` as missing.

## Troubleshooting

### "Cannot find module"
**Problem:** Script can't find data files

**Solution:** Run from project root:
```bash
cd /Users/kevin/_projects/PROJECTS/YogaMatLab/YogaMatLabData
node /tmp/find_series_gaps.js
```

### "0 series in review data"
**Problem:** Review files don't have seriesKey field

**Solution:** Review files need seriesKey added. See SERIES_KEY_MAPPING.md

### "Too many gaps"
**Problem:** Large number of mismatches after initial setup

**Solution:**
1. Fix slug mismatches first (biggest impact)
2. Add high-priority series (scored)
3. Gradually add medium-priority series as needed

## Related Documentation

- **SERIES_KEY_MAPPING.md** - How seriesKeys are generated and used
- **SCORING_README.md** - Scoring methodology and rating system
- **_README.md** - Overview of review data sources
- **SIMPLE_CHANGES_NEEDED.md** - Pipeline integration guide

## Script Maintenance

The gap analysis script is located at `/tmp/find_series_gaps.js`. To update or modify:

1. Edit the script
2. Test with sample data
3. Verify output format
4. Update this documentation if behavior changes

### Future Enhancements

Potential improvements:
- [ ] Auto-suggest matching rules based on review data
- [ ] Fuzzy matching to identify near-duplicate seriesKeys
- [ ] Coverage trends over time
- [ ] Export gaps as GitHub issues
- [ ] Integration with CI/CD to block pipeline if critical gaps exist
