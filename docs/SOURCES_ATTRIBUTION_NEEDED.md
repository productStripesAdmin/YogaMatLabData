# Sources Attribution - Follow-up Work

**Status:** Pending
**Priority:** High
**Created:** 2026-02-02

## Current State

The `config/series-scores.json` file contains comprehensive scoring data for 102 yoga mat series, but **sources/citations are currently missing**. The research was conducted through web searches and professional reviews, but the URLs were not captured in the final merge.

## What's Missing

Each series should include a `sources` array with the research sources used for scoring. For example:

```json
{
  "seriesKey": "aloyoga:warrior",
  "scores": { ... },
  "review": { ... },
  "sources": [
    {
      "title": "Alo Yoga Warrior Mat Review - #1 Selling Yoga Mat | Avenly Lane",
      "url": "https://www.avenlylane.com/alo-yoga-warrior-mat-review/",
      "type": "professional_review"
    },
    {
      "title": "Warrior Yoga Mat | Yoga Accessories | ALO",
      "url": "https://www.aloyoga.com/products/w7092r-warrior-mat-black",
      "type": "manufacturer"
    }
  ]
}
```

## Batch Research Tasks with Sources

The following task IDs contain the research outputs with source URLs embedded in WebSearch results:

- **Batch 1:** aba0ac0 - 42 Birds, Alo Yoga, Ananday, Gaiam (10 series)
- **Batch 2:** a0a2f0d - Additional series (10 series)
- **Batch 3:** a467224 - Cork mat research (10 series)
- **Batch 4:** aafa73b - Material comparisons (10 series)
- **Batch 5:** a3557c7 - Performance metrics (10 series)
- **Batch 6:** adb8bef - Scoria and Shakti Warrior (10 series)
- **Batch 7:** a1ce492 - Cork durability research (10 series)
- **Batch 8:** a76c44b - Pricing and durability comparisons (10 series)
- **Batch 9:** a70b809 - Yoga Design Lab and Yoga Matters series (10 series)
- **Batch 10:** ae64655 - Additional series (10 series)
- **Batch 11:** aadc5cc - Additional series (10 series)
- **Batch 12:** a5530bb - Final series (10 series)

## Required Work

1. **Extract Sources**: For each batch, extract WebSearch result URLs from task outputs
2. **Organize by Series**: Group sources by seriesKey
3. **Categorize**: Label each source by type:
   - `manufacturer` - Official brand website
   - `professional_review` - Professional review sites (Outdoor Gear Lab, etc.)
   - `retailer` - E-commerce/retail sites
   - `user_review` - Consumer review aggregators
   - `news_media` - News/lifestyle publications
4. **Add to JSON**: Update `series-scores.json` with sources array for each series
5. **Verify**: Ensure all active URLs are accessible and relevant

## Expected Outcome

Updated `config/series-scores.json` with complete source attribution, allowing users to:
- Verify scoring basis
- Access original reviews
- Explore detailed product information
- Build trust in recommendations

## Notes

- Sources in batch outputs are embedded in task logs
- Some URLs may be from temporary search results (need verification)
- Priority is complete attribution over perfection - include all found sources
- Consider creating a separate `SOURCES_BY_SERIES.md` as reference document
