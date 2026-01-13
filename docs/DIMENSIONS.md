# Dimensions & Options (Normalization)

This pipeline stores **two kinds** of dimension information:

1) **Single extracted measurements** (best-effort, from options first then description fallback)
2) **Option-derived measurements** (preserve all option values + provenance for filtering/display)

All normalized measurements are metric:
- Thickness: `mm`
- Length/width/diameter: `cm`

## Single extracted measurements

These fields are useful for basic display/sorting when a product clearly has a single measurement:
- `thickness?: { value: number; unit: 'mm'; source: 'options' | 'description'; originalText: string }`
- `length?: { value: number; unit: 'cm'; source: 'options' | 'description'; originalText: string }`
- `width?: { value: number; unit: 'cm'; source: 'options' | 'description'; originalText: string }`
- `diameter?: { value: number; unit: 'cm'; source: 'options' | 'description'; originalText: string }` (round/circular mats)
- `rolledDiameter?: { value: number; unit: 'cm'; source: 'options' | 'description'; originalText: string }` (diameter when rolled, e.g. `6 in. diameter rolled`)

## Option-derived extractions

Some option-derived convenience fields exist, but dimension-related ones are now centralized in `dimensionOptions` + query-friendly summaries.

Dimension option legacy fields removed:
- `availableSizes`
- `availableLengths`
- `availableThicknesses`

Remaining (for display convenience):
- `availableDiameters?: Array<{ value: number; unit: 'cm'; originalString: string }>`

## `dimensionOptions` (canonical option parsing)

`dimensionOptions` is the canonical, provenance-preserving parse layer over `shopifyOptions`. It:
- Extracts **all dimension-related option values** it can interpret (thickness/length/width/diameter and L×W pairs)
- Keeps the original strings and where they came from (`sourceOptionName`, `rawValue`)
- Adds a `confidence` score (0..1) so downstream consumers can decide how aggressively to trust/use a parsed value
- Adds sanity/coverage metrics so you can quickly see whether option parsing is likely reliable for a given product
- Preserves anything dimension-related that couldn’t be parsed in `rawUnparsed`

Shape:

```ts
dimensionOptions?: {
  sanity: {
    candidateCount: number;
    parsedCount: number;
    unparsedCount: number;
    coverage: number; // 0..1
    allUnparsed: boolean;
  };
  thicknessMm?: Array<{ value: number; sourceOptionName: string; rawValue: string; confidence: number }>;
  lengthCm?: Array<{ value: number; sourceOptionName: string; rawValue: string; confidence: number }>;
  widthCm?: Array<{ value: number; sourceOptionName: string; rawValue: string; confidence: number }>;
  diameterCm?: Array<{ value: number; sourceOptionName: string; rawValue: string; confidence: number }>;
  rolledDiameterCm?: Array<{ value: number; sourceOptionName: string; rawValue: string; confidence: number }>;
  sizePairsCm?: Array<{
    value: { lengthCm: number; widthCm: number };
    sourceOptionName: string;
    rawValue: string;
    confidence: number;
  }>;
  rawUnparsed: Array<{ sourceOptionName: string; rawValue: string }>;
};
```

Notes:
- `dimensionOptions` does **not** imply variant-combination availability; it’s a set of parsed option values.
- Values can be sourced from options with ambiguous names like `Size`; parsing is driven primarily by the option values themselves (e.g., `5 MM`, `72" x 26"`, `68" Length`, `Round 6'`, `53" dia`).

## Query-friendly dimension fields

To make Convex queries simpler (and index-friendly), the pipeline also emits summary fields derived from `dimensionOptions` (falling back to single extracted measurements when needed):

- `thicknessMmMin` / `thicknessMmMax`
- `lengthCmMin` / `lengthCmMax` (includes L×W pairs)
- `widthCmMin` / `widthCmMax` (includes L×W pairs)
- `diameterCmMin` / `diameterCmMax`
- `rolledDiameterCmMin` / `rolledDiameterCmMax`

And integer-coded arrays for exact-match filters without float equality issues:

- `thicknessMmx10Values`: unique thicknesses encoded as `mm * 10` (e.g., `4.5mm -> 45`)
- `lengthCMx10Values` / `widthCMx10Values` / `diameterCMx10Values` / `rolledDiameterCMx10Values`: unique values encoded as `cm * 10`
- `sizePairsCMx10Values`: unique pairs as `{ lengthCMx10, widthCMx10 }`

## Weight (variants)

This pipeline also captures per-variant weight signals without persisting full variant objects:
- `minGrams` / `maxGrams`: range across variant `grams` (excluding `0`)
- `variantGramsValues?: number[]`: unique variant `grams` values (sorted asc, excluding `0`)
- `variantGramsZeroOrMissingCount?: number`: variants with missing/invalid/0 grams (<= 0 or not finite)
- `variantGramsCoverage?: number`: share of variants with positive grams
- `variantGramsAllZeroOrMissing?: boolean`: true if no variant has positive grams

## Price (variants)

- `minPrice` / `maxPrice`: range across variant prices
- `variantPriceValues?: number[]`: unique variant prices (sorted asc)

## Material & Texture

- `material`: primary material (title → tags → description)
- `materials?: MaterialType[]`: all detected material components (e.g., cork + natural rubber blends)
- `materialSource?: 'title' | 'tags' | 'description'` and `materialConfidence?: number` (0..1) for QA
- `texture`: primary texture (if detected)
- `textures?: TextureType[]`: all detected texture signals
- `textureSource?: 'title' | 'tags' | 'description'` and `textureConfidence?: number` (0..1) for QA
