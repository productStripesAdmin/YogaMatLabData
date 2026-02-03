# Research Sources Data Format

## Overview

`research-sources.json` stores structured research data for yoga mat series, including sources, specifications, and key findings used during the scoring process.

## JSON Schema

Each research entry is an object with the following structure:

```json
{
  "seriesKey": "brand:series",
  "researchSession": "Session name",
  "sessionDate": "YYYY-MM-DD",
  "sources": [
    {
      "title": "Article title",
      "publication": "Publication name",
      "url": "https://example.com/article"
    }
  ],
  "keyFindings": {
    "dimensions": {
      "length_cm": 180,
      "width_cm": 66,
      "thickness_mm": 5,
      "weight_kg": 2.38,
      "weight_lbs": 5.24
    },
    "materials": ["Material 1", "Material 2"],
    "price_usd": {
      "min": 78,
      "max": 88
    },
    "pros": ["Pro 1", "Pro 2"],
    "cons": ["Con 1", "Con 2"],
    "rating": "Rating or assessment",
    "bestFor": ["Use case 1", "Use case 2"],
    "notIdealFor": ["Not ideal for 1"]
  }
}
```

## Fields

- **seriesKey** (required): Format `{brand-slug}:{series-slug}` (e.g., `manduka:pro`)
- **researchSession** (optional): Name of research batch/session
- **sessionDate** (optional): Date research was completed (YYYY-MM-DD)
- **sources** (required): Array of source citations with:
  - **title**: Article/review title
  - **publication**: Publication name
  - **url**: Link to source
- **keyFindings** (optional): Object containing extracted data
  - **dimensions**: Size specs (length_cm, width_cm, thickness_mm, weight_kg/lbs)
  - **materials**: List of materials used
  - **price_usd**: Price range with min/max
  - **pros**: Strengths of the mat
  - **cons**: Weaknesses/drawbacks
  - **rating**: Numerical score or qualitative assessment
  - **bestFor**: Use cases where mat excels
  - **notIdealFor**: Use cases where mat is not suitable

## Adding New Research

To add research for a series:

1. Ensure the series exists in `config/brand-series.json`
2. Ensure the brand is marked as published (`"isPublished": true` in `config/brands.json`)
3. Add entry to `research-sources.json` with complete source citations
4. Run `npm run find-series-gaps` to regenerate the gap analysis report

## Integration with Gap Analysis

The `find-series-gaps.cjs` script automatically includes research sources in its analysis:
- Counts series with documented research sources
- Tracks which sources contributed to gap analysis
- Identifies series with multiple research sources

## Benefits of Structured Research Data

- **Traceability**: Every scoring decision has documented sources
- **Maintainability**: Can update findings or add new research without losing history
- **Analysis**: Gap reports show which series have research backing
- **Transparency**: Users can verify research sources and methodology
- **Scalability**: Easily add research for new series as they're investigated

## Example Entry

```json
{
  "seriesKey": "manduka:pro",
  "researchSession": "Premium Mats Research",
  "sessionDate": "2026-02-01",
  "sources": [
    {
      "title": "Manduka PRO Mat Review",
      "publication": "Outdoor Gear Lab",
      "url": "https://www.outdoorgearlab.com/reviews/manduka-pro"
    },
    {
      "title": "Best Premium Yoga Mats",
      "publication": "Yoga Journal",
      "url": "https://example.com/yoga-journal-review"
    }
  ],
  "keyFindings": {
    "dimensions": {
      "length_cm": 180,
      "width_cm": 66,
      "thickness_mm": 6,
      "weight_kg": 3.4,
      "weight_lbs": 7.5
    },
    "materials": ["PVC (OEKO-TEX certified)"],
    "price_usd": {
      "min": 130,
      "max": 150
    },
    "pros": [
      "Lifetime warranty",
      "Excellent cushioning",
      "Durable construction"
    ],
    "cons": [
      "Heavy",
      "Expensive",
      "Environmental concerns with PVC"
    ],
    "rating": 9,
    "ratingMax": 10,
    "bestFor": ["Professional studios", "Long-term investment"],
    "notIdealFor": ["Travel", "Hot yoga (can be slippery)"]
  }
}
```
