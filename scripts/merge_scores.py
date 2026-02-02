#!/usr/bin/env python3
"""
Script to merge newly researched yoga mat series into series-scores.json
"""
import json
from pathlib import Path

# Existing series data (current 24 series)
existing_data = [
  {"seriesKey": "manduka:pro", "scores": {"gripDry": 8.0, "gripWet": 6.5, "durability": 10.0, "cushioning": 10.0, "ecoRating": 8.0, "portability": 4.0, "easeOfCleaning": 9.5, "stability": 10.0, "initialOdor": 6.0, "value": 7.5, "performance": 9.0, "overall": 9.1}, "review": {"overview": "The Manduka PRO is the gold standard for studio yoga mats, offering exceptional durability with a lifetime guarantee. Its dense 6mm cushioning provides joint-friendly support while maintaining stability for inversions.", "pros": ["Exceptional durability with lifetime warranty", "Dense cushioning perfect for joint protection", "Easy to clean and maintain"], "cons": ["Heavy at 7.5 lbs", "Slippery when wet", "Premium price"], "bestFor": "Serious practitioners who want a mat that lasts decades", "notIdealFor": "Hot yoga, travel, beginners on a budget", "lastUpdated": "2026-01-31"}, "isReviewed": True, "yogaStyles": ["Vinyasa", "Power Yoga", "Hatha", "Yin"], "useCases": ["Studio", "Home"], "affiliateLinks": {"brandWebsite": "https://www.manduka.com/products/manduka-pro-yoga-mat"}},
]

# New series data from research (will be added)
new_series = [
  # Batch 1: 42birds, aloyoga, ananday, gaiam unscored (15 series)
  {"seriesKey": "42birds:imperial-eagle", "scores": {"gripDry": 8.5, "gripWet": 9.0, "durability": 8.2, "cushioning": 7.5, "ecoRating": 9.0, "portability": 5.5, "easeOfCleaning": 8.0, "stability": 8.8, "initialOdor": 8.5, "value": 7.5, "performance": 8.5, "overall": 8.3}, "review": {"overview": "Premium cork yoga mat with industrial-grade construction. Features 100% sustainable cork top with natural rubber base. 6mm thickness provides excellent grip in wet conditions.", "pros": ["Superior wet grip performance", "Naturally antimicrobial", "Quick drying", "Excellent stability", "Eco-friendly materials", "Quality construction"], "cons": ["Heavy at 5.5 lbs", "Higher price point", "Limited portability", "Can delaminate with heavy use"], "bestFor": "Hot yoga practitioners, eco-conscious yogis, experienced practitioners", "notIdealFor": "Travelers, budget-conscious beginners, those seeking lightweight mats", "lastUpdated": "2026-02-01"}, "isReviewed": True, "yogaStyles": ["Hot Yoga", "Vinyasa", "Power Yoga"], "useCases": ["Studio practice", "Dedicated home practice"], "affiliateLinks": {"42birds": "https://42birds.com/products/industrial-mat-the-imperial-eagle", "freepeople": "https://www.freepeople.com/shop/42-birds-the-imperial-eagle-cork-yoga-mat/"}},
]

output_file = Path(__file__).parent.parent / "data/scores/series-scores.json"

# Read existing file
with open(output_file) as f:
    existing = json.load(f)

print(f"Current series count: {len(existing)}")
print(f"New series to add: {len(new_series)}")

# Merge (new data overwrites existing with same key)
series_dict = {s["seriesKey"]: s for s in existing}
for s in new_series:
    series_dict[s["seriesKey"]] = s

# Convert back to list, sorted by seriesKey
merged = sorted(series_dict.values(), key=lambda x: x["seriesKey"])

# Write merged data
with open(output_file, 'w') as f:
    json.dump(merged, f, indent=2)

print(f"Merged total: {len(merged)} series")
print(f"File saved to: {output_file}")
