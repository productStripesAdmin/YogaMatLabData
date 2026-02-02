# Review Data & Gap Analysis Documentation Index

## 📚 Documentation Files

### Getting Started
- **[QUICK_REFERENCE.md](./QUICK_REFERENCE.md)** - Quick commands and common tasks
- **[_README.md](./_README.md)** - Overview of review data sources

### Core Documentation
- **[GAP_ANALYSIS_README.md](./GAP_ANALYSIS_README.md)** - Complete gap analysis tool documentation
- **[SERIES_KEY_MAPPING.md](./SERIES_KEY_MAPPING.md)** - How seriesKeys work and mapping reference
- **[SCORING_README.md](./SCORING_README.md)** - Scoring methodology and rating system

### Generated Reports
- **[SERIES_GAPS.md](./SERIES_GAPS.md)** - Current gap analysis results (auto-generated)
- **[series-gaps-report.json](./series-gaps-report.json)** - Machine-readable gap data

## 📊 Data Files

### Review Sources
- **[outdoorgearlab.json](./outdoorgearlab.json)** - 18 professionally tested mats
- **[reddit-sheet.json](./reddit-sheet.json)** - 44 community-recommended mats
- **[reddit_thread_1mj8g83.md](./reddit_thread_1mj8g83.md)** - Reddit discussion summary

### Configuration
- **[../series-scores.json](../series-scores.json)** - 20 scored and reviewed series
- **[../brand-series.json](../brand-series.json)** - Pipeline series configuration

## 🔧 Tools

### Gap Analysis Script
```bash
node /tmp/find_series_gaps.js
```
Analyzes differences between review data and series configuration.

## 🚀 Quick Start

### 1. Run Gap Analysis
```bash
cd /Users/kevin/_projects/PROJECTS/YogaMatLab/YogaMatLabData
node /tmp/find_series_gaps.js
```

### 2. Review Results
```bash
cat config/reviews/SERIES_GAPS.md
```

### 3. Fix High-Priority Gaps
See SERIES_GAPS.md for list of scored series missing from config.

### 4. Update Configuration
Edit `config/brand-series.json` to add missing series.

### 5. Verify
Re-run gap analysis to confirm fixes.

## 📖 Documentation Map

```
Review Data Documentation
│
├─ Quick Start
│  ├─ QUICK_REFERENCE.md ← Start here for commands
│  └─ _README.md ← Overview
│
├─ Deep Dive
│  ├─ GAP_ANALYSIS_README.md ← How the tool works
│  ├─ SERIES_KEY_MAPPING.md ← Data structure details
│  └─ SCORING_README.md ← Rating methodology
│
└─ Generated Reports
   ├─ SERIES_GAPS.md ← Human-readable
   └─ series-gaps-report.json ← Machine-readable
```

## 🎯 Common Tasks

### Task: "I want to run the gap analysis"
→ See **QUICK_REFERENCE.md**

### Task: "I need to understand how seriesKeys work"
→ See **SERIES_KEY_MAPPING.md**

### Task: "I want to add a missing series to the config"
→ See **GAP_ANALYSIS_README.md** → "Example: Adding a Missing Series"

### Task: "I want to understand the scoring system"
→ See **SCORING_README.md**

### Task: "What's the current status of gaps?"
→ See **SERIES_GAPS.md**

## 📈 Current Stats (2026-01-31)

- **159** series configured in pipeline
- **56** unique series in review data
- **47** series missing from config (need to add)
- **150** series without review data
- **20** fully scored series
- **18** OutdoorGearLab tested
- **44** Reddit community recommendations

## 🔗 Related Files

### In config/
- `series-scores.json` - Scored series data
- `brand-series.json` - Pipeline configuration
- `SCORING_README.md` - Scoring documentation

### In scripts/lib/
- `brand-series-index.ts` - Pipeline enrichment logic

## 🆘 Getting Help

1. **Quick commands?** → QUICK_REFERENCE.md
2. **How does it work?** → GAP_ANALYSIS_README.md
3. **What needs fixing?** → SERIES_GAPS.md
4. **Understanding data?** → SERIES_KEY_MAPPING.md

## 🔄 Workflow Summary

```
1. Add review data
   ↓
2. Run gap analysis (node /tmp/find_series_gaps.js)
   ↓
3. Review SERIES_GAPS.md
   ↓
4. Fix slug mismatches if any
   ↓
5. Add missing series to brand-series.json
   ↓
6. Re-run analysis to verify
   ↓
7. Run pipeline (npm run pipeline)
   ↓
8. Verify enriched data includes scores
```

## 📝 Notes

- All review files include `seriesKey` field for mapping
- Gap analysis should be run before pipeline execution
- High-priority gaps (scored series) should be fixed first
- Slug mismatches need immediate attention

---

**Last Updated:** 2026-01-31
**Next Review:** After next review data addition
