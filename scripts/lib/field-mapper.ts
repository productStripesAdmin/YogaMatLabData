import type { ShopifyProduct } from './fetch-products-json.js';
import type { MaterialType, YogaMatFeature, TextureType } from '../../types/yogaMat.js';

export interface NormalizedYogaMat {
  // Required fields
  brandId: string; // Will be resolved from brand slug
  brandSlug: string; // Used to lookup brandId
  name: string;
  slug: string;
  price: number;

  // Optional fields with data from Shopify
  description?: string;
  imageUrl?: string;
  priceRange?: {
    min: number;
    max: number;
  };

  // Measurements (extracted from description/tags)
  thickness?: number; // in mm
  length?: number; // in inches
  width?: number; // in inches
  weight?: number; // in lbs

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
  hasMultipleColors: boolean;
  availableColors?: string[];
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
 * Extracts thickness from text (returns mm)
 */
function extractThickness(text: string): number | undefined {
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
 * Extracts dimensions from text (returns inches)
 */
function extractDimensions(text: string): { length?: number; width?: number } {
  // Pattern: "72" x 24"" or "183cm x 61cm"
  const dimensionPattern = /(\d+(?:\.\d+)?)\s*(?:inch|"|cm)?\s*[xX×]\s*(\d+(?:\.\d+)?)\s*(?:inch|"|cm)?/i;
  const match = text.match(dimensionPattern);

  if (match) {
    let length = parseFloat(match[1]);
    let width = parseFloat(match[2]);

    // Check if units are cm (convert to inches)
    if (text.toLowerCase().includes('cm')) {
      length = length / 2.54;
      width = width / 2.54;
    }

    return { length, width };
  }

  return {};
}

/**
 * Extracts weight from text (returns lbs)
 */
function extractWeight(text: string): number | undefined {
  const patterns = [
    /(\d+(?:\.\d+)?)\s*(?:lbs?|pounds?)/i,
    /(\d+(?:\.\d+)?)\s*kg/i,
    /(\d+)\s*grams/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const value = parseFloat(match[1]);

      if (pattern.source.includes('kg')) {
        return value * 2.20462;
      }
      if (pattern.source.includes('gram')) {
        return value * 0.00220462;
      }

      return value; // Already in lbs
    }
  }

  return undefined;
}

/**
 * Extracts material type from text
 */
function extractMaterial(text: string, tags: string[]): MaterialType | undefined {
  const allText = `${text} ${tags.join(' ')}`.toLowerCase();

  const materialMap: Record<string, MaterialType> = {
    'pvc': 'PVC',
    'tpe': 'TPE',
    'natural rubber': 'Natural Rubber',
    'rubber': 'Natural Rubber',
    'cork': 'Cork',
    'jute': 'Jute',
    'cotton': 'Cotton',
    'polyurethane': 'PU Leather',
    'pu leather': 'PU Leather',
    'nbr': 'NBR',
  };

  for (const [keyword, material] of Object.entries(materialMap)) {
    if (allText.includes(keyword)) {
      return material;
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
    'Eco-Friendly': ['eco', 'sustainable', 'planet friendly', 'recycled', 'biodegradable', 'pvc-free', 'pvc free'],
    'Reversible': ['reversible', 'two-sided', 'dual-sided'],
    'Extra Thick': ['extra thick', 'cushioned', 'plush', '6mm', '7mm', '8mm'],
    'Non-Slip': ['non-slip', 'non slip', 'grippy', 'grip'],
    'Lightweight': ['lightweight', 'light weight', 'travel', 'portable'],
    'Extra Long': ['extra long', '85', '215cm'],
    'Extra Wide': ['extra wide', 'wide', '26', '30'],
    'Alignment Marks': ['alignment', 'alignment marks', 'markers', 'guide', 'alignforme'],
    'Antimicrobial': ['antimicrobial', 'antibacterial', 'hygienic'],
    'Closed-Cell': ['closed-cell', 'closed cell', 'moisture resistant'],
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
 * Gets main image URL
 */
function getImageUrl(product: ShopifyProduct): string | undefined {
  if (product.image?.src) return product.image.src;
  if (product.images && product.images.length > 0) return product.images[0].src;
  if (product.variants[0]?.featured_image?.src) return product.variants[0].featured_image.src;
  return undefined;
}

/**
 * Extracts available colors from variants
 */
function extractColors(product: ShopifyProduct): string[] | undefined {
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
  const dimensions = extractDimensions(allText);

  return {
    // Required
    brandId: '', // Will be resolved later by looking up brand
    brandSlug,
    name: product.title,
    slug: generateSlug(brandSlug, product.handle),
    price: parseFloat(product.variants[0]?.price || '0'),

    // Optional
    description: description || undefined,
    imageUrl: getImageUrl(product),
    priceRange,

    // Measurements
    thickness: extractThickness(allText),
    length: dimensions.length,
    width: dimensions.width,
    weight: extractWeight(allText),

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
    hasMultipleColors: product.variants.length > 1,
    availableColors: extractColors(product),
  };
}

/**
 * Validates a normalized mat (checks required fields)
 */
export function validateNormalizedMat(mat: NormalizedYogaMat): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!mat.name) errors.push('Missing required field: name');
  if (!mat.slug) errors.push('Missing required field: slug');
  if (!mat.price || mat.price <= 0) errors.push('Invalid price');
  if (!mat.brandSlug) errors.push('Missing required field: brandSlug');

  return {
    valid: errors.length === 0,
    errors,
  };
}
