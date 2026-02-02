# Series Key Mapping

This document shows how external review data sources are mapped to series slugs in the pipeline.

## OutdoorGearLab Reviews (18 mats)

| seriesKey | Brand | Series | Overall Score |
|-----------|-------|--------|---------------|
| manduka:pro | Manduka | PRO | 91 |
| manduka:eko | Manduka | eKO | 87 |
| lululemon:the-mat | Lululemon | The Mat | 84 |
| liforme:original | Liforme | Original | 76 |
| iuga:eco-friendly-non-slip | Iuga | Eco Friendly Non Slip | 75 |
| yoloha:unity-cork | Yoloha | Unity Cork | 75 |
| prana:verde | Prana Verde | Verde | 73 |
| hugger-mugger:earth-elements | Hugger Mugger | Earth Elements | 70 |
| gaiam:premium-6mm | Gaiam | Premium 6mm | 62 |
| gaiam:performance-dry-grip | Gaiam | Performance Dry-Grip | 62 |
| alo-yoga:warrior-mat | Alo Yoga | Warrior Mat | 62 |
| jade:harmony | Jade | Harmony | 59 |
| gaiam:premium-reversible | Gaiam | Premium Reversible | 54 |
| yoga-design-lab:combo | Yoga Design Lab | Combo | 52 |
| manduka:eko-superlite | Manduka | eKO SuperLite | 48 |
| lululemon:the-workout-mat | Lululemon | The Workout Mat | 47 |
| jade:voyager | Jade | Voyager | 45 |
| primasole:foldable | Primasole | Foldable | 38 |

## Reddit Community Sheet (44 mats)

Selected examples:

| seriesKey | Company | Name | Price |
|-----------|---------|------|-------|
| jade:fusion | Jade | Fusion | $145 |
| yoloha:unity | Yoloha | Unity | $149 |
| hugger-mugger:para-rubber-mat | Hugger Mugger | Para Rubber Mat | $100 |
| b-yoga:strong | B Yoga | B Mat Strong | $114 |
| gaiam:premium-mat | Gaiam | Premium Mat | $30-40 |
| lululemon:take-form-mat | Lululemon | Take Form Mat | $138 |
| manduka:pro | Manduka | Manduka pro | $129.00 |
| manduka:grp-hot-yoga-mat | Manduka | GRP Hot Yoga Mat | $130.00 |
| yoloha:aura | Yoloha | Aura | $99 |
| yoloha:original-cork-mat | Yoloha | Original Cork Mat | $129 |
| manduka:eko | Manduka | EKO | $95.00 |
| hugger-mugger:earth-elements | Hugger Mugger | Earth Elements | $60 |
| jade:harmony | Jade | Harmony | $85 |
| jade:elite-s | Jade | Elite S | $120 |
| manduka:prolite | Manduka | Prolite | $99.00 |
| liforme:liforme-yoga-mat | Liforme | Liforme Yoga Mat | $140 |
| b-yoga:everyday | B Yoga | B Mat Everyday | $96 |
| b-yoga:cork | B Yoga | B Mat Cork | $98 |
| alo-yoga:warrior-mat | Alo Yoga | Warrior Mat | $100 |
| alo-yoga:air-mat | Alo Yoga | Air Mat | $80 |
| lululemon:the-mat | Lululemon | The Mat | $98 |
| lululemon:the-big-mat | Lululemon | The (Big) Mat | $124 |
| lululemon:the-reversible-mat | Lululemon | The Reversible Mat | $88 |
| lululemon:the-un-mat | Lululemon | The (Un) Mat | $78 |

## Usage

When creating scores or incorporating external review data:

1. Use the `seriesKey` field to match reviews to series
2. Cross-reference with `config/series-scores.json` 
3. This enables automated scoring updates when review data changes

## Generating seriesKey

The seriesKey follows the pattern: `{brand-slug}:{series-slug}`

Where:
- Both parts are lowercase
- Spaces become hyphens
- Special characters are removed
- The brand name is NOT duplicated in the series portion

Examples:
- "Manduka PRO" → `manduka:pro`
- "Lululemon The Mat" → `lululemon:the-mat`
- "B Yoga B Mat Strong" → `b-yoga:strong`
