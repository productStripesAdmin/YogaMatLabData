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
  isAvailable?: boolean; // true if any variant available

  // Shopify options (size, color, style, etc.) - RAW DATA
  shopifyOptions?: Array<{
    name: string;
    position: number;
    values: string[];
  }>;

  // Normalized extractions from options
  availableColors?: string[]; // ["Blue", "Green", "Purple"]
  availableSizes?: Array<{
    length: number; // Always in cm
    width: number; // Always in cm
    unit: 'cm'; // Explicit unit marker
    originalString: string; // e.g., "Studio - 72\" L x 24\" W"
  }>;
  availableLengths?: Array<{
    value: number; // Always in cm
    unit: 'cm'; // Explicit unit marker
    originalString: string; // e.g., "Standard 71\"", "Long 85\""
  }>;
  availableThicknesses?: Array<{
    value: number; // Always in mm
    unit: 'mm'; // Explicit unit marker
    originalString: string; // e.g., "5 MM", "1/4 inch"
  }>;

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
function classifyOptionValues(values: string[]): 'thickness' | 'dimensions' | 'length' | 'width' | 'color' | 'unknown' {
  // Check all values to determine predominant pattern
  let thicknessCount = 0;
  let dimensionsCount = 0;
  let lengthCount = 0;

  for (const value of values) {
    // Pattern 1: Thickness (strongest signal)
    if (/\b(\d+(?:\.\d+)?)\s*(?:mm|millimeter)\b/i.test(value)) {
      thicknessCount++;
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
  if (dimensionsCount >= values.length * 0.5) return 'dimensions';
  if (lengthCount >= values.length * 0.5) return 'length';

  // Default to color if no clear pattern
  return 'color';
}

/**
 * Parses a dimension string and returns normalized values in cm
 * Examples:
 *   "Studio - 72\" L x 24\" W" → { length: 182.88, width: 60.96 }
 *   "72\" x 26\"" → { length: 182.88, width: 66.04 }
 *   "183cm x 61cm" → { length: 183, width: 61 }
 */
function parseDimensionString(dimStr: string): { length: number; width: number } | { length: number } | null {
  // Pattern 1: Full dimensions (L x W)
  const fullDimMatch = dimStr.match(/(\d+(?:\.\d+)?)\s*(?:inch|"|cm)?\s*[xX×]\s*(\d+(?:\.\d+)?)\s*(?:inch|"|cm)?/);

  if (fullDimMatch) {
    let length = parseFloat(fullDimMatch[1]);
    let width = parseFloat(fullDimMatch[2]);

    // Convert to cm if in inches (detect by unit or by value range)
    const isCm = dimStr.toLowerCase().includes('cm');
    if (!isCm) {
      // Assume inches, convert to cm
      length = length * 2.54;
      width = width * 2.54;
    }

    return { length, width };
  }

  // Pattern 2: Single dimension (length only)
  const singleDimMatch = dimStr.match(/(\d+(?:\.\d+)?)\s*(?:inch|"|cm)/);

  if (singleDimMatch) {
    let length = parseFloat(singleDimMatch[1]);

    const isCm = dimStr.toLowerCase().includes('cm');
    if (!isCm) {
      length = length * 2.54; // Convert inches to cm
    }

    return { length };
  }

  return null;
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
  const inchMatch = thicknessStr.match(/(\d+(?:\.\d+)?)\s*inch/i);
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
          const dimMatch = value.match(/(\d+(?:\.\d+)?)\s*(?:inch|"|cm)?\s*[xX×]\s*(\d+(?:\.\d+)?)\s*(?:inch|"|cm)?/i);
          if (dimMatch) {
            let length = parseFloat(dimMatch[1]);
            let width = parseFloat(dimMatch[2]);
            const isCm = value.toLowerCase().includes('cm');

            // Convert to cm
            if (!isCm) {
              length = length * 2.54;
              width = width * 2.54;
            }

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
          const singleMatch = value.match(/(\d+(?:\.\d+)?)\s*("|inch|cm)/i);
          if (singleMatch) {
            const numValue = parseFloat(singleMatch[1]);
            const unitMatch = singleMatch[2].toLowerCase();
            const isCm = unitMatch.includes('cm');
            const valueInCm = isCm ? numValue : numValue * 2.54;

            // Classify as length or width
            const dimension = classifySingleDimension(value, numValue, isCm ? 'cm' : 'inch');

            if (dimension === 'length') {
              return {
                length: {
                  value: valueInCm, // Normalized to cm
                  unit: 'cm', // Normalized unit
                  source: 'options',
                  originalText: value,
                }
              };
            } else {
              return {
                width: {
                  value: valueInCm, // Normalized to cm
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
  const dimensionPattern = /(\d+(?:\.\d+)?)\s*(?:inch|"|cm)?\s*[xX×]\s*(\d+(?:\.\d+)?)\s*(?:inch|"|cm)?/i;
  const lxwMatch = text.match(dimensionPattern);

  if (lxwMatch) {
    let length = parseFloat(lxwMatch[1]);
    let width = parseFloat(lxwMatch[2]);
    const isCm = text.toLowerCase().includes('cm');
    const originalText = lxwMatch[0];

    // Convert to cm
    if (!isCm) {
      length = length * 2.54;
      width = width * 2.54;
    }

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

/**
 * Extracts available colors from options ONLY (no variant fallback)
 * Returns undefined if no explicit color option exists
 */
function extractColors(product: ShopifyProduct): string[] | undefined {
  if (!product.options) return undefined;

  for (const option of product.options) {
    const optionName = option.name.toLowerCase();

    // Match explicit color option names
    if (
      optionName === 'color' ||
      optionName === 'colour' ||
      optionName === 'color/pattern' ||
      /(?:mat|yoga|sock|towel).*?(?:colour|color)/i.test(optionName) // Liforme pattern
    ) {
      const classification = classifyOptionValues(option.values);
      if (classification === 'thickness') {
        continue;
      }

      return option.values.filter(v => v && v !== 'Default Title');
    }
  }

  // NO FALLBACK to variants - return undefined if no color option exists
  return undefined;
}

/**
 * Extracts and normalizes dimensions from Size/Dimension options
 * Returns dimensions always in cm with original strings preserved
 */
function extractSizes(product: ShopifyProduct): Array<{
  length: number;
  width: number;
  unit: 'cm';
  originalString: string;
}> | undefined {
  if (!product.options) return undefined;

  const sizes: Array<{ length: number; width: number; unit: 'cm'; originalString: string }> = [];

  for (const option of product.options) {
    const optionName = option.name.toLowerCase();

    // Look for size/dimension options
    if (
      optionName === 'size' ||
      optionName === 'dimension' ||
      optionName === 'dimensions'
    ) {
      // Classify what this Size option actually contains
      const classification = classifyOptionValues(option.values);

      // Only process if it's dimensional data (not thickness or color)
      if (classification === 'dimensions') {
        for (const value of option.values) {
          if (value === 'Default Title') continue;

          const parsed = parseDimensionString(value);
          if (parsed && 'width' in parsed) {
            sizes.push({
              length: parsed.length,
              width: parsed.width,
              unit: 'cm',
              originalString: value
            });
          }
        }
      }
    }
  }

  return sizes.length > 0 ? sizes : undefined;
}

/**
 * Extracts single length dimensions (when width not specified)
 */
function extractLengths(product: ShopifyProduct): Array<{
  value: number;
  unit: 'cm';
  originalString: string;
}> | undefined {
  if (!product.options) return undefined;

  const lengths: Array<{ value: number; unit: 'cm'; originalString: string }> = [];

  for (const option of product.options) {
    const optionName = option.name.toLowerCase();

    if (
      optionName === 'size' ||
      optionName === 'length'
    ) {
      const classification = classifyOptionValues(option.values);

      if (classification === 'length') {
        for (const value of option.values) {
          if (value === 'Default Title') continue;

          const parsed = parseDimensionString(value);
          if (parsed && 'length' in parsed && !('width' in parsed)) {
            lengths.push({
              value: parsed.length,
              unit: 'cm',
              originalString: value
            });
          }
        }
      }
    }
  }

  return lengths.length > 0 ? lengths : undefined;
}

/**
 * Extracts and normalizes thickness values from options
 * Returns thickness always in mm with original strings preserved
 */
function extractThicknessOptions(product: ShopifyProduct): Array<{
  value: number;
  unit: 'mm';
  originalString: string;
}> | undefined {
  if (!product.options) return undefined;

  const thicknesses: Array<{ value: number; unit: 'mm'; originalString: string }> = [];

  for (const option of product.options) {
    const optionName = option.name.toLowerCase();
    const classification = classifyOptionValues(option.values);

    const isThicknessOption = optionName === 'thickness' || classification === 'thickness';
    if (!isThicknessOption) continue;

    for (const value of option.values) {
      if (value === 'Default Title') continue;

      const parsed = parseThicknessString(value);
      if (parsed !== null) {
        thicknesses.push({
          value: parsed,
          unit: 'mm',
          originalString: value
        });
      }
    }
  }

  return thicknesses.length > 0 ? thicknesses : undefined;
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
  const dimensions = extractDimensions(product, allText);

  return {
    // Required
    brandId: '', // Will be resolved later by looking up brand
    brandSlug,
    name: product.title,
    slug: generateSlug(brandSlug, product.handle),

    // Optional
    description: description || undefined,

    // Measurements (all in metric: mm, cm, kg)
    thickness: extractThickness(product, allText),
    length: dimensions.length,
    width: dimensions.width,
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
    isAvailable: getAvailability(product),

    // Shopify options and images (RAW DATA)
    shopifyOptions: mapOptions(product),
    images: mapImages(product),

    // Normalized extractions from options
    availableColors: extractColors(product),
    availableSizes: extractSizes(product),
    availableLengths: extractLengths(product),
    availableThicknesses: extractThicknessOptions(product),
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
