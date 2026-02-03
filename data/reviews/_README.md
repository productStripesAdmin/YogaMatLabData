# README

Folder to capture external review data and research sources for yoga mat series

## Data Files

### reddit-sheet.json
Community feedback data from Reddit

- Source: [Yoga Mat Comparison](https://docs.google.com/spreadsheets/d/1_N6Ws3iG4CojgrlLCRWiA4OPuRfzsoMrJ3CBNlDP1Q0/edit?gid=0#gid=0)
- [Local version](https://docs.google.com/spreadsheets/d/1nzmdA2y_rGWuSF94Yny4ThjY1B_DAEprOGAYKiJpKZw/edit?gid=821412209#gid=821412209)

### outdoorgearlab.json
Professional reviews from OutdoorGearLab.com

- Source: [The Best Yoga Mats](https://www.outdoorgearlab.com/topics/fitness/best-yoga-mat)
- [Grok](https://grok.com/share/bGVnYWN5_5c170086-d9df-4d5d-b393-320f60663cbe)
- [Local version](https://docs.google.com/spreadsheets/d/1nzmdA2y_rGWuSF94Yny4ThjY1B_DAEprOGAYKiJpKZw/edit?gid=476359272#gid=476359272)

### research-sources.json
Structured research documentation with sources, specifications, and findings for individual series.

See `RESEARCH_SOURCES_FORMAT.md` for schema and examples.

**Included in gap analysis:** Yes - contributes to identifying series with research data

**Used by scripts:**
- `find-series-gaps.cjs` - Counts research-documented series in gap analysis
- `scripts/check-series-alignment.ts` - Can reference for data completeness

## Documentation

### RESEARCH_SOURCES_FORMAT.md
Detailed schema and guidelines for adding research data to `research-sources.json`

### research-log.md
Historical research notes and methodology documentation (legacy format)