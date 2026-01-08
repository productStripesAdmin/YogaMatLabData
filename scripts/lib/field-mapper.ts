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

  // Measurements (all in metric units)
  // Extracted from options first, then description/tags as fallback
  thickness?: number; // in mm
  length?: number; // in cm
  width?: number; // in cm
  weight?: number; // in kg

  // Product attributes
  material?: MaterialType;
  texture?: TextureType;
  features?: YogaMatFeature[];

  // Shopify metadata
  shopifyId: number;
  shopifyHandle: string;
  shopifyTags: string[];
  shopifyUpdatedAt: string;

  // Variants info
  variantsCount: number;
  minPrice?: number;
  maxPrice?: number;
  priceCurrency?: string; // default "USD"
  minGrams?: number;
  maxGrams?: number;
  isAvailable?: boolean; // true if any variant available
  hasMultipleColors: boolean;
  availableColors?: string[];

  // Shopify options (size, color, style, etc.)
  shopifyOptions?: Array<{
    name: string;
    position: number;
    values: string[];
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
 * Returns value in mm
 */
function extractThickness(product: ShopifyProduct, text: string): number | undefined {
  // First, try to extract from options
  if (product.options) {
    for (const option of product.options) {
      if (option.name.toLowerCase() === 'size' || option.name.toLowerCase() === 'thickness') {
        // Check if values contain thickness info (e.g., "5 MM", "8 MM")
        for (const value of option.values) {
          const mmMatch = value.match(/(\d+(?:\.\d+)?)\s*mm/i);
          if (mmMatch) {
            return parseFloat(mmMatch[1]);
          }
          // Some brands use just numbers for thickness options
          const numMatch = value.match(/^(\d+(?:\.\d+)?)\s*$/);
          if (numMatch && parseFloat(numMatch[1]) < 20) { // Likely mm if < 20
            return parseFloat(numMatch[1]);
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

      // Handle fractions like "1/4 inch"
      if (value.includes('/')) {
        const [num, den] = value.split('/').map(Number);
        return (num / den) * 25.4; // Convert inches to mm
      }

      const numValue = parseFloat(value);

      // If pattern includes "inch", convert to mm
      if (pattern.source.includes('inch')) {
        return numValue * 25.4;
      }

      return numValue; // Already in mm
    }
  }

  return undefined;
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
function extractDimensions(product: ShopifyProduct, text: string): { length?: number; width?: number } {
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

            // Convert to cm based on unit
            if (value.toLowerCase().includes('cm')) {
              return { length, width }; // Already in cm
            } else {
              // Assume inches, convert to cm
              return {
                length: length * 2.54,
                width: width * 2.54
              };
            }
          }

          // Try to match single dimension (e.g., "Standard 71\"", "Long 85\"", "215cm")
          const singleMatch = value.match(/(\d+(?:\.\d+)?)\s*("|inch|cm)/i);
          if (singleMatch) {
            const numValue = parseFloat(singleMatch[1]);
            const unitMatch = singleMatch[2].toLowerCase();
            const unit = unitMatch.includes('cm') ? 'cm' : 'inch';
            const valueInCm = unit === 'cm' ? numValue : numValue * 2.54;

            // Classify as length or width
            const dimension = classifySingleDimension(value, numValue, unit);

            if (dimension === 'length') {
              return { length: valueInCm };
            } else {
              return { width: valueInCm };
            }
          }
        }
      }
    }
  }

  // Fallback: extract from text
  const dimensionPattern = /(\d+(?:\.\d+)?)\s*(?:inch|"|cm)?\s*[xX×]\s*(\d+(?:\.\d+)?)\s*(?:inch|"|cm)?/i;
  const match = text.match(dimensionPattern);

  if (match) {
    let length = parseFloat(match[1]);
    let width = parseFloat(match[2]);

    // Convert to cm based on unit in text
    if (text.toLowerCase().includes('cm')) {
      return { length, width }; // Already in cm
    } else {
      // Assume inches, convert to cm
      return {
        length: length * 2.54,
        width: width * 2.54
      };
    }
  }

  return {};
}

/**
 * Extracts weight from text or variant grams
 * Returns weight in kg
 */
function extractWeight(product: ShopifyProduct, text: string): number | undefined {
  // Try extracting from text first
  const patterns = [
    /(\d+(?:\.\d+)?)\s*kg/i,
    /(\d+(?:\.\d+)?)\s*(?:lbs?|pounds?)/i,
    /(\d+)\s*grams/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const value = parseFloat(match[1]);

      if (pattern.source.includes('kg')) {
        return value; // Already in kg
      }
      if (pattern.source.includes('lbs?|pounds?')) {
        return value / 2.20462; // Convert lbs to kg
      }
      if (pattern.source.includes('gram')) {
        return value / 1000; // Convert grams to kg
      }
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
 * Extracts available colors from options (priority) or variants (fallback)
 */
function extractColors(product: ShopifyProduct): string[] | undefined {
  // First, try to extract from options
  if (product.options) {
    for (const option of product.options) {
      const optionName = option.name.toLowerCase();
      if (optionName === 'color' || optionName === 'colour' || optionName === 'color/pattern') {
        return option.values.filter(v => v && v !== 'Default Title');
      }
    }
  }

  // Fallback: extract from variants (option1 is typically color)
  const colors = product.variants
    .map(v => v.option1)
    .filter((color): color is string => !!color && color !== 'Default Title');

  return colors.length > 0 ? [...new Set(colors)] : undefined;
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
    shopifyTags: product.tags,
    shopifyUpdatedAt: product.updated_at,

    // Variants
    variantsCount: product.variants.length,
    minPrice: priceRange.min,
    maxPrice: priceRange.max,
    priceCurrency: 'USD', // Default to USD for Shopify products
    minGrams: gramsRange?.min,
    maxGrams: gramsRange?.max,
    isAvailable: getAvailability(product),
    hasMultipleColors: product.variants.length > 1,
    availableColors: extractColors(product),

    // Shopify options and images
    shopifyOptions: mapOptions(product),
    images: mapImages(product),
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
