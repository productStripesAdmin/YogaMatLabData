# Gap Analysis Quick Reference

## Run the Analysis

```bash
cd /Users/kevin/_projects/PROJECTS/YogaMatLab/YogaMatLabData
node /tmp/find_series_gaps.js
```

## Check Results

```bash
# Human-readable summary
cat config/reviews/SERIES_GAPS.md

# Machine-readable data
cat config/reviews/series-gaps-report.json | jq '.summary'
```

## Common Commands

### View missing series (need to add to config)
```bash
cat config/reviews/series-gaps-report.json | jq -r '.missingFromConfig[] | "\(.seriesKey) - \(.brand) \(.series)"'
```

### Count gaps by priority
```bash
# High priority (have scores)
cat config/reviews/series-gaps-report.json | jq '[.missingFromConfig[] | select(.sources | contains(["Scored"]))] | length'

# Medium priority (Reddit only)
cat config/reviews/series-gaps-report.json | jq '[.missingFromConfig[] | select(.sources | contains(["Reddit"]) | not)] | length'
```

### View series without review data
```bash
cat config/reviews/series-gaps-report.json | jq -r '.missingReviewData[0:10][] | .seriesKey'
```

### Check coverage for a specific brand
```bash
# Example: Check Manduka coverage
echo "Manduka series in config:"
grep -A 2 '"slug": "manduka"' config/brand-series.json | grep -c '"slug"'

echo "Manduka series with reviews:"
cat config/reviews/series-gaps-report.json | jq '[.missingFromConfig[] | select(.seriesKey | startswith("manduka:"))] | length'
```

## Fix Workflow

1. **Identify gaps:** `node /tmp/find_series_gaps.js`
2. **Review high-priority:** Check SERIES_GAPS.md for scored series
3. **Add to config:** Edit `config/brand-series.json`
4. **Verify:** Re-run gap analysis
5. **Test pipeline:** `npm run pipeline`

## Critical Paths

| File | Purpose |
|------|---------|
| `/tmp/find_series_gaps.js` | Analysis script |
| `config/reviews/SERIES_GAPS.md` | Human-readable results |
| `config/reviews/series-gaps-report.json` | Machine-readable results |
| `config/reviews/GAP_ANALYSIS_README.md` | Full documentation |
| `config/brand-series.json` | Series configuration (update this) |
| `config/series-scores.json` | Scoring data (source of truth) |

## Known Issues to Fix

### Slug Mismatches (Update brand-series.json)
- `huggermugger` → `hugger-mugger`
- `aloyoga` → `alo-yoga`
- `jadeyoga` → `jade`
- `yogadesignlab` → `yoga-design-lab`

### High Priority Missing Series (20 total)
See SERIES_GAPS.md for complete list

## Quick Stats (As of 2026-01-31)

- ✅ **159** series in config
- ✅ **56** series with review data
- ⚠️ **47** series need to be added to config
- 💡 **150** series could use review data

### Top Brands Needing Work
1. **yogamatters** - 0% coverage (0/13)
2. **jadeyoga** - 0% coverage (0/11)
3. **yuneyoga** - 0% coverage (0/11)
4. **gaiam** - 0% coverage (0/8)

### Top Brands with Coverage
1. **manduka** - 31% coverage (4/13) ⭐
2. **lululemon** - Some coverage
3. **liforme** - Some coverage

## Maintenance

Run gap analysis:
- ✅ Before each pipeline run
- ✅ After adding review data
- ✅ After updating brand-series.json
- ✅ Monthly for coverage review

## Help

For detailed documentation, see: `config/reviews/GAP_ANALYSIS_README.md`
