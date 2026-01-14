# Shadow Titles

This repo emits a “shadow title” set during normalization so YogaMatLabApp can display consistent product names while preserving the original Shopify title.

## Output Fields

In `data/normalized/**` and `data/aggregated/**` products include:

- `titleOriginal`: raw Shopify title (source of truth for traceability)
- `titleAuto`: auto-normalized title (short, consistent display title)
- `titleAutoConfidence`: `0..1` heuristic confidence
- `titleAutoVersion`: heuristic version string (currently `shadow-title-v1`)

`name` remains the original Shopify title for backwards compatibility.

## High-Level Rules (v1)

The generator starts from the Shopify title and:

- Removes dimensions/weights/thickness tokens (e.g. `6mm`, `72"`, `2.5kg`, `72" x 24"`)
- Removes trailing color/pattern suffixes only when they match parsed `availableColors`
- Strips obvious vendor/brand suffix duplication (e.g. `... - JadeYoga`)
- Keeps the first dash-separated segment when titles are formatted like `Line Name - Color`
- Removes generic `Yoga Mat` / `Mat` suffixes when the remaining line name is still descriptive
- Does **not** prefix the brand/vendor (the UI should render brand separately, e.g. logo + name)

## Notes

- This is a heuristic and may be refined over time; use `titleAutoVersion` to track changes.
- YogaMatLabApp should prefer `titleManual ?? titleAuto ?? titleOriginal ?? name` for display.
