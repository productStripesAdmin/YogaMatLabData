import type { ShopifyProduct } from './fetch-products-json.js';
import type { MaterialType, YogaMatFeature, TextureType } from '../../types/yogaMat.js';

export interface NormalizedYogaMat {
  // Required fields
  brandId: string; // Will be resolved from brand slug // TODO Need more clarity on this
  brandSlug: string; // Used to lookup brandId
  name: string;
  slug: string;

  // Optional fields with data from Shopify
  description?: string;

  // Measurements (structured with units and source tracking)
  // Extracted from options first, then description/tags as fallback
  thickness?: {
    value: number; // Normalized value
    unit: 'mm'; // Always mm (normalized unit)
    source: 'options' | 'description';
    originalText: string; // Original text with original unit (e.g., "1/4 inch thick")
  };

  length?: {
    value: number; // Normalized value
    unit: 'cm'; // Always cm (normalized unit)
    source: 'options' | 'description';
    originalText: string; // Original text with original unit (e.g., "80\" Long")
  };

  width?: {
    value: number; // Normalized value
    unit: 'cm'; // Always cm (normalized unit)
    source: 'options' | 'description';
    originalText: string; // Original text with original unit (e.g., "28\" Wide")
  };

  diameter?: {
    value: number; // Normalized value
    unit: 'cm'; // Always cm (normalized unit)
    source: 'options' | 'description';
    originalText: string; // Original text with original unit (e.g., "36\" Diameter")
  };

  weight?: {
    value: number; // Normalized value
    unit: 'kg'; // Always kg (normalized unit)
    source: 'description' | 'variants';
    originalText: string; // Original text with original unit (e.g., "5 lbs", "2500 grams")
  };

  // Product attributes
  material?: MaterialType;
  texture?: TextureType;
  features?: YogaMatFeature[];

  // Shopify metadata
  shopifyId: number;
  shopifyHandle: string;
  shopifyVendor: string;
  shopifyProductType: string;
  shopifyTags: string[];
  shopifyCreatedAt: string;
  shopifyPublishedAt: string;
  shopifyUpdatedAt: string;

  // Variants info
  variantsCount: number;
  minPrice?: number;
  maxPrice?: number;
  priceCurrency?: string; // default "USD"
  minGrams?: number;
  maxGrams?: number;
  variantGramsValues?: number[]; // Unique grams values across variants (sorted asc)
  variantGramsZeroOrMissingCount?: number; // Variants with grams <= 0 or invalid
  variantGramsCoverage?: number; // (variantsCount - zeroOrMissingCount) / variantsCount
  variantGramsAllZeroOrMissing?: boolean; // True if no variant has a positive grams value
  isAvailable?: boolean; // true if any variant available

  // Dimension query-friendly fields (derived, index-friendly)
  thicknessMmMin?: number;
  thicknessMmMax?: number;
  lengthCmMin?: number;
  lengthCmMax?: number;
  widthCmMin?: number;
  widthCmMax?: number;
  diameterCmMin?: number;
  diameterCmMax?: number;

  // Integer-coded option values for exact-match filters (derived)
  // Encoding: cm * 10 (tenths of cm), mm * 10 (tenths of mm)
  thicknessMmx10Values?: number[];
  lengthCMx10Values?: number[];
  widthCMx10Values?: number[];
  diameterCMx10Values?: number[];
  sizePairsCMx10Values?: Array<{
    lengthCMx10: number;
    widthCMx10: number;
  }>;

  // Shopify options (size, color, style, etc.) - RAW DATA
  shopifyOptions?: Array<{
    name: string;
    position: number;
    values: string[];
  }>;

  // Normalized extractions from options
  availableColors?: string[]; // ["Blue", "Green", "Purple"]
  availableDiameters?: Array<{
    value: number; // Always in cm
    unit: 'cm'; // Explicit unit marker
    originalString: string; // e.g., "36\" Diameter", "Round 6'"
  }>;

  // Canonical dimension options extracted from Shopify options (derived)
  dimensionOptions?: {
    sanity: {
      candidateCount: number; // dimension-like option values considered (excluding colors + Default Title)
      parsedCount: number; // candidate values that parsed into any numeric structure
      unparsedCount: number; // candidate values that could not be parsed
      coverage: number; // parsedCount / candidateCount (0..1)
      allUnparsed: boolean; // candidateCount > 0 && parsedCount === 0
    };
    thicknessMm?: Array<{
      value: number;
      sourceOptionName: string;
      rawValue: string;
      confidence: number; // 0..1
    }>;
    lengthCm?: Array<{
      value: number;
      sourceOptionName: string;
      rawValue: string;
      confidence: number; // 0..1
    }>;
    widthCm?: Array<{
      value: number;
      sourceOptionName: string;
      rawValue: string;
      confidence: number; // 0..1
    }>;
    diameterCm?: Array<{
      value: number;
      sourceOptionName: string;
      rawValue: string;
      confidence: number; // 0..1
    }>;
    sizePairsCm?: Array<{
      value: {
        lengthCm: number;
        widthCm: number;
      };
      sourceOptionName: string;
      rawValue: string;
      confidence: number; // 0..1
    }>;
    rawUnparsed: Array<{
      sourceOptionName: string;
      rawValue: string;
    }>;
  };

  // Product images array
  images?: Array<{
    src: string;
    alt: string | null;
    width: number;
    height: number;
    position: number;
  }>;
}

/**
 * Strips HTML tags from a string
 */
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function pushUnique<T>(arr: T[], item: T, keyFn: (item: T) => string): void {
  const key = keyFn(item);
  if (arr.some(existing => keyFn(existing) === key)) return;
  arr.push(item);
}

/**
 * Generates a URL-safe slug from brand and product name
 */
export function generateSlug(brandSlug: string, productHandle: string): string {
  return `${brandSlug}-${productHandle}`;
}

/**
 * Extracts thickness from options (priority) or text (fallback)
 * Returns structured data with value normalized to mm
 */
function extractThickness(product: ShopifyProduct, text: string): {
  value: number; // Always in mm (normalized)
  unit: 'mm'; // Always 'mm' (normalized unit)
  source: 'options' | 'description';
  originalText: string; // Original text with original unit
} | undefined {
  // First, try to extract from options
  if (product.options) {
    for (const option of product.options) {
      if (option.name.toLowerCase() === 'size' || option.name.toLowerCase() === 'thickness') {
        // Check if values contain thickness info (e.g., "5 MM", "8 MM")
        for (const value of option.values) {
          const mmMatch = value.match(/(\d+(?:\.\d+)?)\s*mm/i);
          if (mmMatch) {
            return {
              value: parseFloat(mmMatch[1]), // Already in mm
              unit: 'mm',
              source: 'options',
              originalText: value,
            };
          }
          // Some brands use just numbers for thickness options
          const numMatch = value.match(/^(\d+(?:\.\d+)?)\s*$/);
          if (numMatch && parseFloat(numMatch[1]) < 20) { // Likely mm if < 20
            return {
              value: parseFloat(numMatch[1]), // Already in mm
              unit: 'mm',
              source: 'options',
              originalText: value,
            };
          }
        }
      }
    }
  }

  // Fallback: extract from text
  const patterns = [
    /(\d+(?:\.\d+)?)\s*mm/i,
    /(\d+(?:\.\d+)?)\s*millimeter/i,
    /(\d+\/\d+)\s*inch/i,
    /(\d+(?:\.\d+)?)\s*inch(?:es)?\s*thick/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const value = match[1];
      const originalText = match[0];
      const isInch = pattern.source.includes('inch');

      // Handle fractions like "1/4 inch"
      if (value.includes('/')) {
        const [num, den] = value.split('/').map(Number);
        return {
          value: (num / den) * 25.4, // Convert inches to mm
          unit: 'mm', // Normalized unit
          source: 'description',
          originalText,
        };
      }

      const numValue = parseFloat(value);

      // If pattern includes "inch", convert to mm
      if (isInch) {
        return {
          value: numValue * 25.4, // Convert inches to mm
          unit: 'mm', // Normalized unit
          source: 'description',
          originalText,
        };
      }

      return {
        value: numValue, // Already in mm
        unit: 'mm', // Normalized unit
        source: 'description',
        originalText,
      };
    }
  }

  return undefined;
}

/**
 * Classifies what type of data an option contains based on values
 */
function classifyOptionValues(values: string[]): 'thickness' | 'diameter' | 'dimensions' | 'length' | 'width' | 'color' | 'unknown' {
  // Check all values to determine predominant pattern
  let thicknessCount = 0;
  let dimensionsCount = 0;
  let lengthCount = 0;
  let diameterCount = 0;

  for (const value of values) {
    // Pattern 1: Thickness (strongest signal)
    if (/\b(\d+(?:\.\d+)?)\s*(?:mm|millimeter)\b/i.test(value)) {
      thicknessCount++;
      continue;
    }

    // Pattern 2: Diameter / round
    if (/\d/.test(value) && /\b(?:diam(?:eter)?|dia\.?|ø|round|circle|circular)\b/i.test(value)) {
      diameterCount++;
      continue;
    }

    // Pattern 2: Full dimensions (L x W)
    if (/\d+(?:\.\d+)?[\"\'cm]?\s*[xX×]\s*\d+(?:\.\d+)?[\"\'cm]?/.test(value)) {
      dimensionsCount++;
      continue;
    }

    // Pattern 3: Single dimension with qualifier
    if (/(long|tall|standard|extended|short)/i.test(value) && /\d+/.test(value)) {
      lengthCount++;
      continue;
    }
  }

  // Majority wins
  if (thicknessCount >= values.length * 0.5) return 'thickness';
  if (diameterCount >= values.length * 0.5) return 'diameter';
  if (dimensionsCount >= values.length * 0.5) return 'dimensions';
  if (lengthCount >= values.length * 0.5) return 'length';

  // Default to color if no clear pattern
  return 'color';
}

type LinearUnit = 'cm' | 'mm' | 'in' | 'ft';

function unitTokenToLinearUnit(token: string | undefined): LinearUnit | null {
  if (!token) return null;
  const lower = token.toLowerCase().trim();

  if (lower === 'cm') return 'cm';
  if (lower === 'mm') return 'mm';
  if (lower === '"' || lower === 'in' || lower === 'inch' || lower === 'inches') return 'in';
  if (lower === "'" || lower === 'ft' || lower === 'feet' || lower === 'foot') return 'ft';

  return null;
}

function isMetricUnit(unit: LinearUnit): boolean {
  return unit === 'cm' || unit === 'mm';
}

function linearToCm(value: number, unit: LinearUnit): number {
  if (unit === 'cm') return value;
  if (unit === 'mm') return value / 10;
  if (unit === 'ft') return value * 30.48;
  return value * 2.54; // inches
}

function inferUnlabeledLinearUnit(text: string, ...numbers: number[]): LinearUnit {
  const lower = text.toLowerCase();

  if (lower.includes("'")) return 'ft';
  if (lower.includes('"') || /\b(?:inch|in)\b/i.test(text)) return 'in';
  if (lower.includes('cm')) return 'cm';
  if (lower.includes('mm')) return 'mm';

  const max = Math.max(...numbers.filter(n => Number.isFinite(n)));
  if (max >= 100) return 'cm';
  return 'in';
}

function extractAllLinearMeasurements(text: string): Array<{ value: number; unit: LinearUnit }> {
  const results: Array<{ value: number; unit: LinearUnit }> = [];
  const re = /(\d+(?:\.\d+)?)\s*(cm|mm|inches?|inch|in|ft|feet|foot|["'])/ig;

  for (const match of text.matchAll(re)) {
    const value = parseFloat(match[1]);
    const unit = unitTokenToLinearUnit(match[2]);
    if (!Number.isFinite(value) || !unit) continue;
    results.push({ value, unit });
  }

  return results;
}

function parseSingleLinearToCm(text: string): number | null {
  const measurements = extractAllLinearMeasurements(text);
  if (measurements.length === 0) return null;

  const firstMetric = measurements.find(m => isMetricUnit(m.unit));
  const selected = firstMetric ?? measurements[0];
  return linearToCm(selected.value, selected.unit);
}

function encodeMmX10(valueMm: number): number {
  return Math.round(valueMm * 10);
}

function encodeCmX10(valueCm: number): number {
  return Math.round(valueCm * 10);
}

function computeMinMax(values: number[]): { min: number; max: number } | undefined {
  const filtered = values.filter(v => Number.isFinite(v));
  if (filtered.length === 0) return undefined;
  return { min: Math.min(...filtered), max: Math.max(...filtered) };
}

function isColorOptionName(optionNameLower: string): boolean {
  return (
    optionNameLower === 'color' ||
    optionNameLower === 'colour' ||
    optionNameLower === 'color/pattern' ||
    /(?:mat|yoga|sock|towel).*?(?:colour|color)/i.test(optionNameLower)
  );
}

function optionNameSuggestsDimensions(optionNameLower: string): boolean {
  return (
    optionNameLower.includes('size') ||
    optionNameLower.includes('dimension') ||
    optionNameLower.includes('length') ||
    optionNameLower.includes('width') ||
    optionNameLower.includes('thick') ||
    optionNameLower.includes('diam') ||
    optionNameLower.includes('round') ||
    optionNameLower.includes('circle') ||
    optionNameLower.includes('mat size') ||
    optionNameLower.includes('select')
  );
}

function hasExplicitLinearUnit(rawValue: string): boolean {
  return /(cm|mm|\b(?:inch|inches|in|ft|feet|foot)\b|["'])/i.test(rawValue);
}

function makeOptionParseConfidence(params: {
  kind: 'thickness' | 'length' | 'width' | 'diameter' | 'sizePair';
  optionNameLower: string;
  rawValue: string;
  classification: ReturnType<typeof classifyOptionValues>;
  hasUnits: boolean;
  hasKeywords: boolean;
  isPlainNumber: boolean;
}): number {
  const { kind, optionNameLower, rawValue, classification, hasUnits, hasKeywords, isPlainNumber } = params;

  let confidence = 0.55;

  if (hasUnits) confidence += 0.15;
  if (hasKeywords) confidence += 0.15;

  if (kind !== 'sizePair' && classification === kind) confidence += 0.15;

  if (kind === 'sizePair') {
    confidence = 0.75;
    if (/[xX×]/.test(rawValue)) confidence += 0.10;
    if (hasUnits) confidence += 0.10;
    if (optionNameLower.includes('size') || optionNameLower.includes('dimension')) confidence += 0.05;
    return clamp01(confidence);
  }

  if (kind === 'thickness') {
    if (optionNameLower.includes('thick') || optionNameLower === 'thickness') confidence += 0.15;
    if (/\bmm\b|millimeter/i.test(rawValue)) confidence += 0.15;
    if (/\b(?:inch|in)\b/i.test(rawValue)) confidence += 0.10;
    if (isPlainNumber) confidence -= 0.10;
    return clamp01(confidence);
  }

  if (kind === 'diameter') {
    if (optionNameLower.includes('diam') || optionNameLower.includes('round') || optionNameLower.includes('circle')) confidence += 0.15;
    if (/\b(?:diam(?:eter)?|dia\.?|ø|round|circle|circular)\b/i.test(rawValue)) confidence += 0.15;
    return clamp01(confidence);
  }

  if (kind === 'length' || kind === 'width') {
    if (optionNameLower.includes(kind)) confidence += 0.15;
    if (/\b(?:long|length|tall)\b/i.test(rawValue)) confidence += kind === 'length' ? 0.10 : 0;
    if (/\b(?:wide|width|narrow)\b/i.test(rawValue)) confidence += kind === 'width' ? 0.10 : 0;
    return clamp01(confidence);
  }

  return clamp01(confidence);
}

/**
 * Parses a dimension string and returns normalized values in cm
 * Examples:
 *   "Studio - 72\" L x 24\" W" → { length: 182.88, width: 60.96 }
 *   "72\" x 26\"" → { length: 182.88, width: 66.04 }
 *   "183cm x 61cm" → { length: 183, width: 61 }
 */
function parseDimensionString(dimStr: string): { length: number; width: number } | { length: number } | null {
  // Pattern 1: Full dimensions (L x W), including inches/feet (e.g., 6' x 4')
  const pairRe = /(\d+(?:\.\d+)?)\s*(cm|mm|inches?|inch|in|ft|feet|foot|["'])?\s*[xX×]\s*(\d+(?:\.\d+)?)\s*(cm|mm|inches?|inch|in|ft|feet|foot|["'])?/ig;
  const pairMatches = Array.from(dimStr.matchAll(pairRe));

  if (pairMatches.length > 0) {
    const preferred = pairMatches.find(m => {
      const leftUnit = unitTokenToLinearUnit(m[2]);
      const rightUnit = unitTokenToLinearUnit(m[4]);
      return (leftUnit && isMetricUnit(leftUnit)) || (rightUnit && isMetricUnit(rightUnit));
    }) ?? pairMatches[0];

    const leftValue = parseFloat(preferred[1]);
    const rightValue = parseFloat(preferred[3]);
    const inferred = inferUnlabeledLinearUnit(dimStr, leftValue, rightValue);

    const leftUnit = unitTokenToLinearUnit(preferred[2]) ?? unitTokenToLinearUnit(preferred[4]) ?? inferred;
    const rightUnit = unitTokenToLinearUnit(preferred[4]) ?? unitTokenToLinearUnit(preferred[2]) ?? inferred;

    const length = linearToCm(leftValue, leftUnit);
    const width = linearToCm(rightValue, rightUnit);

    return { length, width };
  }

  // Pattern 2: Single dimension (length only)
  const single = parseSingleLinearToCm(dimStr);
  if (single != null) return { length: single };

  return null;
}

function parseDiameterString(value: string, assumeDiameter: boolean): number | null {
  if (/[xX×]/.test(value)) return null;

  const looksDiameter = assumeDiameter || /\b(?:diam(?:eter)?|dia\.?|ø|round|circle|circular)\b/i.test(value);
  if (!looksDiameter) return null;

  return parseSingleLinearToCm(value);
}

/**
 * Parses a thickness string and returns normalized value in mm
 * Examples:
 *   "5 MM" → 5
 *   "1/4 inch" → 6.35
 *   "3/16 inch thick" → 4.76
 */
function parseThicknessString(thicknessStr: string): number | null {
  // Pattern 1: MM/millimeter
  const mmMatch = thicknessStr.match(/(\d+(?:\.\d+)?)\s*(?:mm|millimeter)/i);
  if (mmMatch) {
    return parseFloat(mmMatch[1]);
  }

  // Pattern 2: Fractional inches (e.g., "1/4 inch", "3/16 inch")
  const fractionMatch = thicknessStr.match(/(\d+)\/(\d+)\s*inch/i);
  if (fractionMatch) {
    const numerator = parseFloat(fractionMatch[1]);
    const denominator = parseFloat(fractionMatch[2]);
    return (numerator / denominator) * 25.4; // Convert inches to mm
  }

  // Pattern 3: Decimal inches (e.g., "0.25 inch", "1/8 inch thick")
  const inchMatch = thicknessStr.match(/(\d+(?:\.\d+)?)\s*(?:inch|in)\b/i);
  if (inchMatch) {
    return parseFloat(inchMatch[1]) * 25.4; // Convert inches to mm
  }

  return null;
}

/**
 * Determines if a single dimension value is length or width based on context
 */
function classifySingleDimension(value: string, numValue: number, unit: 'cm' | 'inch'): 'length' | 'width' {
  const lowerValue = value.toLowerCase();

  // Check for explicit keywords
  if (lowerValue.includes('long') || lowerValue.includes('tall') || lowerValue.includes('standard') || lowerValue.includes('extended')) {
    return 'length';
  }
  if (lowerValue.includes('wide') || lowerValue.includes('narrow')) {
    return 'width';
  }

  // Use numeric heuristics (convert to cm for comparison)
  const valueInCm = unit === 'cm' ? numValue : numValue * 2.54;

  // Most yoga mats: length 68-85" (172-216cm), width 24-30" (61-76cm)
  if (valueInCm > 152) return 'length'; // > 60 inches
  if (valueInCm < 102) return 'width';  // < 40 inches

  // Ambiguous range (40-60 inches / 102-152cm)
  // Default to length as most single-dimension options specify length
  return 'length';
}

/**
 * Extracts dimensions from options (priority) or text (fallback)
 * Returns length and width in cm
 */
function extractDimensions(product: ShopifyProduct, text: string): {
  length?: {
    value: number; // Always in cm (normalized)
    unit: 'cm'; // Always 'cm' (normalized unit)
    source: 'options' | 'description';
    originalText: string; // Original text with original unit
  };
  width?: {
    value: number; // Always in cm (normalized)
    unit: 'cm'; // Always 'cm' (normalized unit)
    source: 'options' | 'description';
    originalText: string; // Original text with original unit
  };
} {
  // First, try to extract from options
  if (product.options) {
    for (const option of product.options) {
      const optionName = option.name.toLowerCase();
      if (optionName === 'size' || optionName === 'dimensions' || optionName === 'dimension') {
        // Check for dimension patterns in values
        for (const value of option.values) {
          // Try to match length x width (e.g., "72\" x 26\"", "183cm x 61cm")
          const parsedPair = parseDimensionString(value);
          if (parsedPair && 'width' in parsedPair) {
            const length = parsedPair.length;
            const width = parsedPair.width;

            return {
              length: {
                value: length, // Normalized to cm
                unit: 'cm', // Normalized unit
                source: 'options',
                originalText: value,
              },
              width: {
                value: width, // Normalized to cm
                unit: 'cm', // Normalized unit
                source: 'options',
                originalText: value,
              }
            };
          }

          // Try to match single dimension (e.g., "Standard 71\"", "Long 85\"", "215cm")
          const parsedSingle = parseDimensionString(value);
          if (parsedSingle && !('width' in parsedSingle)) {
            const numValue = parsedSingle.length;

            // Classify as length or width
            const dimension = classifySingleDimension(value, numValue, 'cm');

            if (dimension === 'length') {
              return {
                length: {
                  value: numValue, // Normalized to cm
                  unit: 'cm', // Normalized unit
                  source: 'options',
                  originalText: value,
                }
              };
            } else {
              return {
                width: {
                  value: numValue, // Normalized to cm
                  unit: 'cm', // Normalized unit
                  source: 'options',
                  originalText: value,
                }
              };
            }
          }
        }
      }
    }
  }

  // Fallback: extract from text
  // Pattern 1: Try L x W format first (e.g., "72\" x 26\"", "183cm x 61cm")
  const parsedLxW = parseDimensionString(text);
  if (parsedLxW && 'width' in parsedLxW) {
    const length = parsedLxW.length;
    const width = parsedLxW.width;
    const originalText = text.match(/(\d+(?:\.\d+)?)\s*(?:cm|mm|inches?|inch|in|ft|feet|foot|["'])?\s*[xX×]\s*(\d+(?:\.\d+)?)\s*(?:cm|mm|inches?|inch|in|ft|feet|foot|["'])?/i)?.[0] ?? text;

    return {
      length: {
        value: length, // Normalized to cm
        unit: 'cm', // Normalized unit
        source: 'description',
        originalText,
      },
      width: {
        value: width, // Normalized to cm
        unit: 'cm', // Normalized unit
        source: 'description',
        originalText,
      }
    };
  }

  // Pattern 2: Try separate "X\" Long" and "X\" Wide" patterns
  // Examples: "80\" Long and 28\" Wide", "28\" wide and is available 80\" long"
  const result: {
    length?: {
      value: number; // Always in cm (normalized)
      unit: 'cm'; // Always 'cm' (normalized unit)
      source: 'options' | 'description';
      originalText: string; // Original text with original unit
    };
    width?: {
      value: number; // Always in cm (normalized)
      unit: 'cm'; // Always 'cm' (normalized unit)
      source: 'options' | 'description';
      originalText: string; // Original text with original unit
    };
  } = {};

  // Match length patterns
  const lengthPatterns = [
    /(\d+(?:\.\d+)?)\s*(?:inch|"|cm)?\s+(?:long|length|l\b)/i,
    /(?:long|length).*?(\d+(?:\.\d+)?)\s*(?:inch|"|cm)/i,
  ];

  for (const pattern of lengthPatterns) {
    const lengthMatch = text.match(pattern);
    if (lengthMatch) {
      const lengthValue = parseFloat(lengthMatch[1]);
      const isCm = text.toLowerCase().includes('cm');
      const valueInCm = isCm ? lengthValue : lengthValue * 2.54;

      result.length = {
        value: valueInCm, // Normalized to cm
        unit: 'cm', // Normalized unit
        source: 'description',
        originalText: lengthMatch[0],
      };
      break;
    }
  }

  // Match width patterns
  const widthPatterns = [
    /(\d+(?:\.\d+)?)\s*(?:inch|"|cm)?\s+(?:wide|width|w\b)/i,
    /(?:wide|width).*?(\d+(?:\.\d+)?)\s*(?:inch|"|cm)/i,
  ];

  for (const pattern of widthPatterns) {
    const widthMatch = text.match(pattern);
    if (widthMatch) {
      const widthValue = parseFloat(widthMatch[1]);
      const isCm = text.toLowerCase().includes('cm');
      const valueInCm = isCm ? widthValue : widthValue * 2.54;

      result.width = {
        value: valueInCm, // Normalized to cm
        unit: 'cm', // Normalized unit
        source: 'description',
        originalText: widthMatch[0],
      };
      break;
    }
  }

  // Return if we found at least length or width
  if (result.length || result.width) {
    return result;
  }

  return {};
}

/**
 * Extracts weight from text or variant grams
 * Returns structured data with value normalized to kg
 */
function extractWeight(product: ShopifyProduct, text: string): {
  value: number; // Always in kg (normalized)
  unit: 'kg'; // Always 'kg' (normalized unit)
  source: 'description' | 'variants';
  originalText: string; // Original text with original unit
} | undefined {
  // Try extracting from text first
  const patterns = [
    { regex: /(\d+(?:\.\d+)?)\s*kg/i, unit: 'kg' as const },
    { regex: /(\d+(?:\.\d+)?)\s*(?:lbs?|pounds?)/i, unit: 'lb' as const },
    { regex: /(\d+)\s*grams/i, unit: 'g' as const },
  ];

  for (const { regex, unit } of patterns) {
    const match = text.match(regex);
    if (match) {
      const value = parseFloat(match[1]);
      const originalText = match[0];
      let valueInKg: number;

      if (unit === 'kg') {
        valueInKg = value; // Already in kg
      } else if (unit === 'lb') {
        valueInKg = value / 2.20462; // Convert lbs to kg
      } else { // unit === 'g'
        valueInKg = value / 1000; // Convert grams to kg
      }

      return {
        value: valueInKg, // Normalized to kg
        unit: 'kg', // Normalized unit
        source: 'description',
        originalText,
      };
    }
  }

  return undefined;
}

/**
 * Extracts material type from text
 */
function extractMaterial(text: string, tags: string[]): MaterialType | undefined {
  const materialMap: Record<string, MaterialType> = {
    'natural rubber': 'Natural Rubber',
    'rubber': 'Natural Rubber',
    'pu leather': 'PU Leather',
    'polyurethane': 'PU Leather',
    'pvc': 'PVC',
    'tpe': 'TPE',
    'cork': 'Cork',
    'jute': 'Jute',
    'cotton': 'Cotton',
    'nbr': 'NBR',
  };

  // 1. Combine and lowercase
  let cleanText = `${text} ${tags.join(' ')}`.toLowerCase();

  // 2. The "De-falsifier": Remove negative phrases
  // This looks for "free of", "no", etc., until it hits a break (comma, period, or "and")
  const negationRegex = /(?:free of|no|without|zero|0%|non-)\s+[^.\,]+?(?=\s+is|base|gives|\.|\,|$)/g;
  cleanText = cleanText.replace(negationRegex, "");

  // 3. Sort keys by length (longest first)
  // Essential so 'natural rubber' matches before 'rubber'
  const sortedKeys = Object.keys(materialMap).sort((a, b) => b.length - a.length);

  // 4. Single Pass Search
  for (const key of sortedKeys) {
    // Optional: Use word boundaries \b to ensure 'cotton' doesn't match 'cottonwood'
    const regex = new RegExp(`\\b${key}\\b`, 'i');
    if (regex.test(cleanText)) {
      return materialMap[key];
    }
  }

  return undefined;
}

/**
 * Extracts features from description and tags
 */
function extractFeatures(text: string, tags: string[]): YogaMatFeature[] {
  const allText = `${text} ${tags.join(' ')}`.toLowerCase();
  const features: YogaMatFeature[] = [];

  const featureKeywords: Record<YogaMatFeature, string[]> = {
    'Eco-Friendly': ['eco', 'sustainable', 'planet friendly', 'recycled', 'biodegradable', 'pvc-free', 'pvc free', 'free of PVC', 'plant foam base', 'renewable'],
    'Reversible': ['reversible', 'two-sided', 'dual-sided'],
    'Extra Thick': ['extra thick', 'cushioned', 'plush', '6mm', '7mm', '8mm'],
    'Non-Slip': ['non-slip', 'non slip', 'grippy', 'grip'],
    'Lightweight': ['lightweight', 'light weight', 'travel', 'portable', 'extra light'],
    'Extra Long': ['extra long', '85', '215cm'], // TODO update this
    'Extra Wide': ['extra wide', 'wide', '26', '30'], // TODO update this
    'Alignment Marks': ['alignment', 'alignment marks', 'markers', 'guide', 'alignforme'],
    'Antimicrobial': ['antimicrobial', 'antibacterial', 'hygienic'],
    'Closed-Cell': ['closed-cell', 'closed cell', 'moisture resistant'],
    'Premium': ['premium', 'high-end', 'luxurious'],
  };

  for (const [feature, keywords] of Object.entries(featureKeywords)) {
    if (keywords.some(keyword => allText.includes(keyword))) {
      features.push(feature as YogaMatFeature);
    }
  }

  return features;
}

/**
 * Gets price range from variants
 */
function getPriceRange(product: ShopifyProduct): { min: number; max: number } {
  const prices = product.variants.map(v => parseFloat(v.price));
  return {
    min: Math.min(...prices),
    max: Math.max(...prices),
  };
}

/**
 * Gets weight range from variants (in grams)
 */
function getGramsRange(product: ShopifyProduct): { min: number; max: number } | undefined {
  const grams = product.variants.map(v => v.grams).filter(g => g > 0);

  if (grams.length === 0) return undefined;

  return {
    min: Math.min(...grams),
    max: Math.max(...grams),
  };
}

function getVariantGramsValues(product: ShopifyProduct): number[] | undefined {
  const grams = product.variants
    .map(v => v.grams)
    .filter(g => Number.isFinite(g) && g > 0);

  if (grams.length === 0) return undefined;

  return Array.from(new Set(grams)).sort((a, b) => a - b);
}

function getVariantGramsSanity(product: ShopifyProduct): {
  zeroOrMissingCount: number;
  coverage: number;
  allZeroOrMissing: boolean;
} {
  const total = product.variants.length;
  if (total === 0) {
    return {
      zeroOrMissingCount: 0,
      coverage: 0,
      allZeroOrMissing: true,
    };
  }

  const zeroOrMissingCount = product.variants.reduce((count, variant) => {
    const grams = variant.grams;
    if (!Number.isFinite(grams) || grams <= 0) return count + 1;
    return count;
  }, 0);

  const coverage = (total - zeroOrMissingCount) / total;

  return {
    zeroOrMissingCount,
    coverage,
    allZeroOrMissing: zeroOrMissingCount === total,
  };
}

/**
 * Checks if any variant is available
 */
function getAvailability(product: ShopifyProduct): boolean {
  return product.variants.some(v => v.available);
}

/**
 * Maps product images from Shopify format
 */
function mapImages(product: ShopifyProduct): Array<{
  src: string;
  alt: string | null;
  width: number;
  height: number;
  position: number;
}> | undefined {
  if (!product.images || product.images.length === 0) return undefined;

  return product.images.map(img => ({
    src: img.src,
    alt: img.alt,
    width: img.width,
    height: img.height,
    position: img.position,
  }));
}

/**
 * Maps product options from Shopify format
 */
function mapOptions(product: ShopifyProduct): Array<{
  name: string;
  position: number;
  values: string[];
}> | undefined {
  if (!product.options || product.options.length === 0) return undefined;

  return product.options.map(opt => ({
    name: opt.name,
    position: opt.position,
    values: opt.values,
  }));
}

function extractDiameter(product: ShopifyProduct, text: string): {
  value: number;
  unit: 'cm';
  source: 'options' | 'description';
  originalText: string;
} | undefined {
  if (product.options) {
    for (const option of product.options) {
      const optionName = option.name.toLowerCase();
      const assumeDiameter = optionName.includes('diameter') || optionName.includes('round') || optionName === 'dia';

      for (const value of option.values) {
        if (value === 'Default Title') continue;

        const parsed = parseDiameterString(value, assumeDiameter);
        if (parsed != null) {
          return {
            value: parsed,
            unit: 'cm',
            source: 'options',
            originalText: value,
          };
        }
      }
    }
  }

  const directPattern = /(?:\bdiam(?:eter)?\b|\bdia\.?\b|ø|\bround\b|\bcircle\b|\bcircular\b)\s*[:\-]?\s*(\d+(?:\.\d+)?)\s*(cm|mm|inches?|inch|in|ft|feet|foot|["'])/i;
  const directMatch = text.match(directPattern);
  if (directMatch) {
    const value = parseFloat(directMatch[1]);
    const unit = unitTokenToLinearUnit(directMatch[2]) ?? inferUnlabeledLinearUnit(text, value);
    if (Number.isFinite(value)) {
      return {
        value: linearToCm(value, unit),
        unit: 'cm',
        source: 'description',
        originalText: directMatch[0],
      };
    }
  }

  const reversePattern = /(\d+(?:\.\d+)?)\s*(cm|mm|inches?|inch|in|ft|feet|foot|["'])\s*(?:\bdiam(?:eter)?\b|\bdia\.?\b|ø|\bround\b|\bcircle\b)/i;
  const reverseMatch = text.match(reversePattern);
  if (reverseMatch) {
    const value = parseFloat(reverseMatch[1]);
    const unit = unitTokenToLinearUnit(reverseMatch[2]) ?? inferUnlabeledLinearUnit(text, value);
    if (Number.isFinite(value)) {
      return {
        value: linearToCm(value, unit),
        unit: 'cm',
        source: 'description',
        originalText: reverseMatch[0],
      };
    }
  }

  return undefined;
}

/**
 * Extracts available colors from options ONLY (no variant fallback)
 * Returns undefined if no explicit color option exists
 */
function extractColors(product: ShopifyProduct): string[] | undefined {
  if (!product.options) return undefined;

  for (const option of product.options) {
    const optionName = option.name.toLowerCase();

    // Match explicit color option names
    if (isColorOptionName(optionName)) {
      const classification = classifyOptionValues(option.values);
      // Skip if this option contains thickness or dimensions (not colors)
      if (classification === 'thickness' || classification === 'dimensions' || classification === 'length' || classification === 'diameter') {
        continue;
      }

      return option.values.filter(v => v && v !== 'Default Title');
    }
  }

  // NO FALLBACK to variants - return undefined if no color option exists
  return undefined;
}

function deriveDimensionQueryFields(params: {
  thickness?: NormalizedYogaMat['thickness'];
  length?: NormalizedYogaMat['length'];
  width?: NormalizedYogaMat['width'];
  diameter?: NormalizedYogaMat['diameter'];
  dimensionOptions?: NormalizedYogaMat['dimensionOptions'];
}): Pick<
  NormalizedYogaMat,
  | 'thicknessMmMin'
  | 'thicknessMmMax'
  | 'lengthCmMin'
  | 'lengthCmMax'
  | 'widthCmMin'
  | 'widthCmMax'
  | 'diameterCmMin'
  | 'diameterCmMax'
  | 'thicknessMmx10Values'
  | 'lengthCMx10Values'
  | 'widthCMx10Values'
  | 'diameterCMx10Values'
  | 'sizePairsCMx10Values'
> {
  const thicknessMmValues: number[] = [];
  const lengthCmValues: number[] = [];
  const widthCmValues: number[] = [];
  const diameterCmValues: number[] = [];
  const sizePairs: Array<{ lengthCm: number; widthCm: number }> = [];

  if (params.dimensionOptions) {
    params.dimensionOptions.thicknessMm?.forEach(t => thicknessMmValues.push(t.value));
    params.dimensionOptions.lengthCm?.forEach(l => lengthCmValues.push(l.value));
    params.dimensionOptions.widthCm?.forEach(w => widthCmValues.push(w.value));
    params.dimensionOptions.diameterCm?.forEach(d => diameterCmValues.push(d.value));
    params.dimensionOptions.sizePairsCm?.forEach(p => {
      lengthCmValues.push(p.value.lengthCm);
      widthCmValues.push(p.value.widthCm);
      sizePairs.push({ lengthCm: p.value.lengthCm, widthCm: p.value.widthCm });
    });
  }

  // Fallback to single extracted values if options don't provide any values for a dimension.
  if (thicknessMmValues.length === 0 && params.thickness?.value != null) thicknessMmValues.push(params.thickness.value);
  if (lengthCmValues.length === 0 && params.length?.value != null) lengthCmValues.push(params.length.value);
  if (widthCmValues.length === 0 && params.width?.value != null) widthCmValues.push(params.width.value);
  if (diameterCmValues.length === 0 && params.diameter?.value != null) diameterCmValues.push(params.diameter.value);

  const thicknessMmRange = computeMinMax(thicknessMmValues);
  const lengthCmRange = computeMinMax(lengthCmValues);
  const widthCmRange = computeMinMax(widthCmValues);
  const diameterCmRange = computeMinMax(diameterCmValues);

  const thicknessMmx10Values = thicknessMmValues.length > 0
    ? Array.from(new Set(thicknessMmValues.map(encodeMmX10))).sort((a, b) => a - b)
    : undefined;
  const lengthCMx10Values = lengthCmValues.length > 0
    ? Array.from(new Set(lengthCmValues.map(encodeCmX10))).sort((a, b) => a - b)
    : undefined;
  const widthCMx10Values = widthCmValues.length > 0
    ? Array.from(new Set(widthCmValues.map(encodeCmX10))).sort((a, b) => a - b)
    : undefined;
  const diameterCMx10Values = diameterCmValues.length > 0
    ? Array.from(new Set(diameterCmValues.map(encodeCmX10))).sort((a, b) => a - b)
    : undefined;

  const sizePairsCMx10Values = sizePairs.length > 0
    ? Array.from(
      new Map(
        sizePairs.map(p => {
          const lengthCMx10 = encodeCmX10(p.lengthCm);
          const widthCMx10 = encodeCmX10(p.widthCm);
          return [`${lengthCMx10}x${widthCMx10}`, { lengthCMx10, widthCMx10 }];
        })
      ).values()
    ).sort((a, b) => (a.lengthCMx10 - b.lengthCMx10) || (a.widthCMx10 - b.widthCMx10))
    : undefined;

  return {
    thicknessMmMin: thicknessMmRange?.min,
    thicknessMmMax: thicknessMmRange?.max,
    lengthCmMin: lengthCmRange?.min,
    lengthCmMax: lengthCmRange?.max,
    widthCmMin: widthCmRange?.min,
    widthCmMax: widthCmRange?.max,
    diameterCmMin: diameterCmRange?.min,
    diameterCmMax: diameterCmRange?.max,
    thicknessMmx10Values,
    lengthCMx10Values,
    widthCMx10Values,
    diameterCMx10Values,
    sizePairsCMx10Values,
  };
}

function extractDimensionOptions(product: ShopifyProduct): NormalizedYogaMat['dimensionOptions'] | undefined {
  if (!product.options) return undefined;

  const thicknessMm: NonNullable<NonNullable<NormalizedYogaMat['dimensionOptions']>['thicknessMm']> = [];
  const lengthCm: NonNullable<NonNullable<NormalizedYogaMat['dimensionOptions']>['lengthCm']> = [];
  const widthCm: NonNullable<NonNullable<NormalizedYogaMat['dimensionOptions']>['widthCm']> = [];
  const diameterCm: NonNullable<NonNullable<NormalizedYogaMat['dimensionOptions']>['diameterCm']> = [];
  const sizePairsCm: NonNullable<NonNullable<NormalizedYogaMat['dimensionOptions']>['sizePairsCm']> = [];
  const rawUnparsed: NonNullable<NonNullable<NormalizedYogaMat['dimensionOptions']>['rawUnparsed']> = [];

  let candidateCount = 0;
  let parsedCount = 0;

  for (const option of product.options) {
    const optionNameLower = option.name.toLowerCase();

    if (isColorOptionName(optionNameLower)) continue;

    const classification = classifyOptionValues(option.values);
    const optionSeemsDimension = optionNameSuggestsDimensions(optionNameLower) || classification !== 'color';

    if (!optionSeemsDimension) continue;

    const assumeDiameter = optionNameLower.includes('diam') || optionNameLower.includes('round') || optionNameLower.includes('circle') || optionNameLower === 'dia';
    const assumeThickness = optionNameLower.includes('thick') || optionNameLower === 'thickness' || classification === 'thickness';

    for (const rawValue of option.values) {
      if (!rawValue || rawValue === 'Default Title') continue;
      candidateCount++;

      const hasUnits = hasExplicitLinearUnit(rawValue);
      const isPlainNumber = /^(\d+(?:\.\d+)?)$/.test(rawValue.trim());

      // 1) Diameter
      const diameter = parseDiameterString(rawValue, assumeDiameter);
      if (diameter != null) {
        const confidence = makeOptionParseConfidence({
          kind: 'diameter',
          optionNameLower,
          rawValue,
          classification,
          hasUnits,
          hasKeywords: /\b(?:diam(?:eter)?|dia\.?|ø|round|circle|circular)\b/i.test(rawValue),
          isPlainNumber,
        });

        pushUnique(
          diameterCm,
          { value: diameter, sourceOptionName: option.name, rawValue, confidence },
          i => `${i.sourceOptionName}|${i.rawValue}|${i.value.toFixed(4)}`
        );
        parsedCount++;
        continue;
      }

      // 2) Thickness
      const parsedThickness = parseThicknessString(rawValue);
      if (parsedThickness != null && (assumeThickness || /\bmm\b|millimeter|\b(?:inch|in)\b/i.test(rawValue) || isPlainNumber)) {
        // Heuristic: avoid capturing obviously-not-thickness values (e.g., 180cm, 72")
        if (!hasUnits && parsedThickness >= 20) {
          rawUnparsed.push({ sourceOptionName: option.name, rawValue });
          continue;
        }

        const confidence = makeOptionParseConfidence({
          kind: 'thickness',
          optionNameLower,
          rawValue,
          classification,
          hasUnits: /\bmm\b|millimeter|\b(?:inch|in)\b/i.test(rawValue) || isPlainNumber,
          hasKeywords: optionNameLower.includes('thick') || /\b(?:thick|thickness)\b/i.test(rawValue),
          isPlainNumber,
        });

        pushUnique(
          thicknessMm,
          { value: parsedThickness, sourceOptionName: option.name, rawValue, confidence },
          i => `${i.sourceOptionName}|${i.rawValue}|${i.value.toFixed(4)}`
        );
        parsedCount++;
        continue;
      }

      // 3) L×W size pair
      const parsedPair = parseDimensionString(rawValue);
      if (parsedPair && 'width' in parsedPair) {
        const confidence = makeOptionParseConfidence({
          kind: 'sizePair',
          optionNameLower,
          rawValue,
          classification,
          hasUnits,
          hasKeywords: /[xX×]/.test(rawValue),
          isPlainNumber,
        });

        pushUnique(
          sizePairsCm,
          {
            value: { lengthCm: parsedPair.length, widthCm: parsedPair.width },
            sourceOptionName: option.name,
            rawValue,
            confidence,
          },
          i => `${i.sourceOptionName}|${i.value.lengthCm.toFixed(4)}x${i.value.widthCm.toFixed(4)}`
        );
        parsedCount++;
        continue;
      }

      // 4) Single dimension (length or width)
      if (parsedPair && !('width' in parsedPair)) {
        const valueCm = parsedPair.length;

        let dimensionKind: 'length' | 'width' =
          optionNameLower.includes('width') ? 'width' :
            optionNameLower.includes('length') ? 'length' :
              classifySingleDimension(rawValue, valueCm, 'cm');

        const confidence = makeOptionParseConfidence({
          kind: dimensionKind,
          optionNameLower,
          rawValue,
          classification,
          hasUnits,
          hasKeywords: dimensionKind === 'length'
            ? /\b(?:long|length|tall|standard|extended|short)\b/i.test(rawValue)
            : /\b(?:wide|width|narrow)\b/i.test(rawValue),
          isPlainNumber,
        });

        if (dimensionKind === 'length') {
          pushUnique(
            lengthCm,
            { value: valueCm, sourceOptionName: option.name, rawValue, confidence },
            i => `${i.sourceOptionName}|${i.rawValue}|${i.value.toFixed(4)}`
          );
        } else {
          pushUnique(
            widthCm,
            { value: valueCm, sourceOptionName: option.name, rawValue, confidence },
            i => `${i.sourceOptionName}|${i.rawValue}|${i.value.toFixed(4)}`
          );
        }
        parsedCount++;
        continue;
      }

      rawUnparsed.push({ sourceOptionName: option.name, rawValue });
    }
  }

  const unparsedCount = rawUnparsed.length;
  const coverage = candidateCount > 0 ? parsedCount / candidateCount : 0;

  const result: NonNullable<NormalizedYogaMat['dimensionOptions']> = {
    sanity: {
      candidateCount,
      parsedCount,
      unparsedCount,
      coverage,
      allUnparsed: candidateCount > 0 && parsedCount === 0,
    },
    rawUnparsed,
  };
  if (thicknessMm.length > 0) result.thicknessMm = thicknessMm;
  if (lengthCm.length > 0) result.lengthCm = lengthCm;
  if (widthCm.length > 0) result.widthCm = widthCm;
  if (diameterCm.length > 0) result.diameterCm = diameterCm;
  if (sizePairsCm.length > 0) result.sizePairsCm = sizePairsCm;

  return (
    result.rawUnparsed.length > 0 ||
    result.thicknessMm != null ||
    result.lengthCm != null ||
    result.widthCm != null ||
    result.diameterCm != null ||
    result.sizePairsCm != null
  ) ? result : undefined;
}

function extractDiameters(product: ShopifyProduct): Array<{
  value: number;
  unit: 'cm';
  originalString: string;
}> | undefined {
  if (!product.options) return undefined;

  const diameters: Array<{ value: number; unit: 'cm'; originalString: string }> = [];

  for (const option of product.options) {
    const optionName = option.name.toLowerCase();
    const classification = classifyOptionValues(option.values);
    const isDiameterOption = optionName.includes('diameter') || optionName.includes('round') || optionName === 'dia';

    if (!isDiameterOption && classification !== 'diameter') continue;

    for (const value of option.values) {
      if (value === 'Default Title') continue;

      const parsed = parseDiameterString(value, isDiameterOption);
      if (parsed != null) {
        diameters.push({
          value: parsed,
          unit: 'cm',
          originalString: value
        });
      }
    }
  }

  return diameters.length > 0 ? diameters : undefined;
}

/**
 * Maps a Shopify product to normalized YogaMat format
 */
export function mapShopifyToYogaMat(
  product: ShopifyProduct,
  brandSlug: string
): NormalizedYogaMat {
  const description = stripHtml(product.body_html || '');
  const allText = `${product.title} ${description} ${product.tags.join(' ')}`;
  const priceRange = getPriceRange(product);
  const gramsRange = getGramsRange(product);
  const gramsSanity = getVariantGramsSanity(product);
  const dimensions = extractDimensions(product, allText);
  const dimensionOptions = extractDimensionOptions(product);
  const thickness = extractThickness(product, allText);
  const diameter = extractDiameter(product, allText);
  const dimensionQueryFields = deriveDimensionQueryFields({
    thickness,
    length: dimensions.length,
    width: dimensions.width,
    diameter,
    dimensionOptions,
  });

  return {
    // Required
    brandId: '', // Will be resolved later by looking up brand
    brandSlug,
    name: product.title,
    slug: generateSlug(brandSlug, product.handle),

    // Optional
    description: description || undefined,

    // Measurements (all in metric: mm, cm, kg)
    thickness,
    length: dimensions.length,
    width: dimensions.width,
    diameter,
    weight: extractWeight(product, allText),

    // Attributes
    material: extractMaterial(allText, product.tags),
    features: extractFeatures(allText, product.tags),

    // Shopify metadata
    shopifyId: product.id,
    shopifyHandle: product.handle,
    shopifyVendor: product.vendor,
    shopifyProductType: product.product_type,
    shopifyTags: product.tags,
    shopifyCreatedAt: product.created_at,
    shopifyPublishedAt: product.published_at,
    shopifyUpdatedAt: product.updated_at,

    // Variants
    variantsCount: product.variants.length,
    minPrice: priceRange.min,
    maxPrice: priceRange.max,
    priceCurrency: 'USD', // Default to USD for Shopify products
    minGrams: gramsRange?.min,
    maxGrams: gramsRange?.max,
    variantGramsValues: getVariantGramsValues(product),
    variantGramsZeroOrMissingCount: gramsSanity.zeroOrMissingCount,
    variantGramsCoverage: gramsSanity.coverage,
    variantGramsAllZeroOrMissing: gramsSanity.allZeroOrMissing,
    isAvailable: getAvailability(product),

    ...dimensionQueryFields,

    // Shopify options and images (RAW DATA)
    shopifyOptions: mapOptions(product),
    images: mapImages(product),

    // Normalized extractions from options
    availableColors: extractColors(product),
    availableDiameters: extractDiameters(product),
    dimensionOptions,
  };
}

/**
 * Validates a normalized mat (checks required fields)
 */
export function validateNormalizedMat(mat: NormalizedYogaMat): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!mat.name) errors.push('Missing required field: name');
  if (!mat.slug) errors.push('Missing required field: slug');
  if (!mat.minPrice || mat.minPrice <= 0) errors.push('Invalid minPrice');
  if (!mat.brandSlug) errors.push('Missing required field: brandSlug');

  return {
    valid: errors.length === 0,
    errors,
  };
}
