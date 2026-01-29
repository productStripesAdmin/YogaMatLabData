import type { NormalizedYogaMat } from './field-mapper.js';
import { readFileSync } from 'node:fs';
import path from 'node:path';

// Dimension label configuration types
interface DimensionRange {
  min?: number;
  max?: number;
  label: string;
  description: string;
}

interface DimensionLabelsConfig {
  length: Record<string, DimensionRange>;
  width: Record<string, DimensionRange>;
  thickness: Record<string, DimensionRange>;
  shape: Record<string, { label: string; description: string }>;
}

// Load dimension labels config
let dimensionLabelsConfig: DimensionLabelsConfig | null = null;

function loadDimensionLabelsConfig(): DimensionLabelsConfig | null {
  if (dimensionLabelsConfig !== null) return dimensionLabelsConfig;

  try {
    const configPath = path.join(process.cwd(), 'config', 'dimension-labels.json');
    const raw = readFileSync(configPath, 'utf-8');
    dimensionLabelsConfig = JSON.parse(raw) as DimensionLabelsConfig;
    return dimensionLabelsConfig;
  } catch {
    return null;
  }
}

type BrandSeriesConfigFile = Array<{
  slug: string;
  series: Array<{
    slug?: string;
    tagline?: string;
    description?: string;
  }>;
}>;

let brandSeriesConfigCache: Map<string, { tagline?: string; description?: string }> | null = null;

function loadBrandSeriesDescriptions(): Map<string, { tagline?: string; description?: string }> {
  if (brandSeriesConfigCache) return brandSeriesConfigCache;
  const map = new Map<string, { tagline?: string; description?: string }>();

  try {
    const configPath = path.join(process.cwd(), 'config', 'brand-series.json');
    const raw = readFileSync(configPath, 'utf-8');
    const parsed = JSON.parse(raw) as BrandSeriesConfigFile;

    if (Array.isArray(parsed)) {
      for (const brand of parsed) {
        const brandSlug = String(brand?.slug ?? '').toLowerCase().trim();
        if (!brandSlug) continue;

        const series = Array.isArray(brand?.series) ? brand.series : [];
        for (const entry of series) {
          const seriesSlug = String(entry?.slug ?? '').trim();
          if (!seriesSlug) continue;
          const key = `${brandSlug}:${seriesSlug}`;
          const tagline = typeof entry?.tagline === 'string' ? entry.tagline.trim() : '';
          const description = typeof entry?.description === 'string' ? entry.description.trim() : '';

          map.set(key, {
            tagline: tagline.length > 0 ? tagline : undefined,
            description: description.length > 0 ? description : undefined,
          });
        }
      }
    }
  } catch {
    // optional
  }

  brandSeriesConfigCache = map;
  return map;
}

function getDimensionLabel(
  type: 'length' | 'width' | 'thickness',
  minValue: number | undefined,
  maxValue: number | undefined
): string | undefined {
  const config = loadDimensionLabelsConfig();
  if (!config) return undefined;

  const ranges = config[type];
  if (!ranges) return undefined;

  // Use the max value if available (represents the largest variant), otherwise min
  const value = maxValue ?? minValue;
  if (value == null) return undefined;

  // Find the matching range
  for (const [key, range] of Object.entries(ranges)) {
    const matchesMin = range.min == null || value >= range.min;
    const matchesMax = range.max == null || value < range.max;
    if (matchesMin && matchesMax) {
      return range.label;
    }
  }

  return undefined;
}

function getShapeLabel(
  lengthCm: number | undefined,
  widthCm: number | undefined,
  diameterCm: number | undefined
): string | undefined {
  // Round mats have diameter
  if (diameterCm != null) return 'Round';

  // Square mats have similar length and width (within 10%)
  if (lengthCm != null && widthCm != null) {
    const ratio = Math.min(lengthCm, widthCm) / Math.max(lengthCm, widthCm);
    if (ratio >= 0.9) return 'Square';
  }

  // Default rectangle
  if (lengthCm != null || widthCm != null) return 'Rectangle';

  return undefined;
}

function getSizeBucket(
  value: number | undefined,
  thresholds: { sMax: number; mMax: number }
): 'S' | 'M' | 'L' | undefined {
  if (value == null || !Number.isFinite(value)) return undefined;
  if (value <= thresholds.sMax) return 'S';
  if (value <= thresholds.mMax) return 'M';
  return 'L';
}

function getThicknessBucket(
  valueMm: number | undefined
): 'S' | 'M' | 'L' | 'XT' | undefined {
  if (valueMm == null || !Number.isFinite(valueMm)) return undefined;
  if (valueMm <= 4) return 'S';
  if (valueMm <= 6) return 'M';
  if (valueMm <= 8) return 'L';
  return 'XT';
}

function getLengthBucket(
  valueCm: number | undefined
): 'S' | 'M' | 'L' | 'XL' | undefined {
  if (valueCm == null || !Number.isFinite(valueCm)) return undefined;
  if (valueCm <= 180) return 'S';
  if (valueCm <= 200) return 'M';
  if (valueCm <= 210) return 'L';
  return 'XL';
}

function getWidthBucket(
  valueCm: number | undefined
): 'S' | 'M' | 'L' | 'XW' | undefined {
  if (valueCm == null || !Number.isFinite(valueCm)) return undefined;
  if (valueCm >= 70) return 'XW';
  if (valueCm <= 61) return 'S';
  if (valueCm <= 66) return 'M';
  return 'L';
}

function getWeightBucket(
  valueKg: number | undefined
): 'Ultralight' | 'Light' | 'Normal' | 'Heavy' | undefined {
  if (valueKg == null || !Number.isFinite(valueKg)) return undefined;
  if (valueKg <= 1) return 'Ultralight';
  if (valueKg <= 2) return 'Light';
  if (valueKg <= 3) return 'Normal';
  return 'Heavy';
}

function getPriceBucket(
  minPriceUsd: number | undefined,
  currency: string | undefined
): 'Value' | 'Mid-Range' | 'Premium' | 'Luxury' | undefined {
  const cur = (currency ?? '').toUpperCase().trim() || 'USD';
  if (cur !== 'USD') return undefined;
  if (minPriceUsd == null || !Number.isFinite(minPriceUsd) || minPriceUsd <= 0) return undefined;
  if (minPriceUsd < 50) return undefined; // Should be excluded upstream, but keep defensive.
  if (minPriceUsd < 100) return 'Value';
  if (minPriceUsd < 150) return 'Mid-Range';
  if (minPriceUsd < 250) return 'Premium';
  return 'Luxury';
}

export interface SeriesIndexRecord {
  seriesKey: string;
  seriesSlug: string;
  brandSlug: string;
  seriesName: string;
  tagline?: string;
  description?: string;
  seriesConfidence?: number;
  seriesVersion?: string;
  designNames?: string[];
  availableColors?: string[]; // normalized
  productSlugs: string[];
  productShopifyIds?: number[];
  productCount: number;

  // Aggregated price/availability
  minPrice?: number;
  maxPrice?: number;
  priceCurrency?: string;
  variantPriceValues?: number[];
  isAvailable?: boolean;
  priceBucket?: 'Value' | 'Mid-Range' | 'Premium' | 'Luxury';

  // Materials / Features (normalized)
  materials?: string[];
  material?: string; // best guess
  materialConfidence?: number; // 0..1 (relative confidence among candidates)
  features?: string[];
  pvcFree?: boolean;

  // Classification buckets/tags (series-level)
  shapeLabel?: 'Rectangle' | 'Square' | 'Round';
  sizeTags?: string[]; // e.g. ["Extra-Long", "Extra-Wide"]
  thicknessBucket?: 'S' | 'M' | 'L' | 'XT';
  lengthBucket?: 'S' | 'M' | 'L' | 'XL';
  widthBucket?: 'S' | 'M' | 'L' | 'XW';
  weightBucket?: 'Ultralight' | 'Light' | 'Normal' | 'Heavy';

  // Aggregated weight (kg) and raw variant grams
  weightKgMin?: number;
  weightKgMax?: number;
  weightKgValues?: number[];
  minGrams?: number;
  maxGrams?: number;
  variantGramsValues?: number[];

  // Aggregated dimensions (index-friendly)
  thicknessMmMin?: number;
  thicknessMmMax?: number;
  lengthCmMin?: number;
  lengthCmMax?: number;
  widthCmMin?: number;
  widthCmMax?: number;
  diameterCmMin?: number;
  diameterCmMax?: number;
  rolledDiameterCmMin?: number;
  rolledDiameterCmMax?: number;

  thicknessMmx10Values?: number[];
  lengthCMx10Values?: number[];
  widthCMx10Values?: number[];
  diameterCMx10Values?: number[];
  rolledDiameterCMx10Values?: number[];
  sizePairsCMx10Values?: Array<{ lengthCMx10: number; widthCMx10: number }>;

  // Dimension labels (derived from config/dimension-labels.json)
  lengthLabel?: string;     // e.g., "Standard", "Long", "Extra Long"
  widthLabel?: string;      // e.g., "Standard", "Wide"
  thicknessLabel?: string;  // e.g., "Thin", "Standard", "Thick"
  shapeLabel?: string;      // e.g., "Rectangular", "Square", "Round"

  // Aggregated images from all products in the series
  images?: Array<{
    src: string;
    alt: string | null;
    width: number;
    height: number;
  }>;
}

function isBundleLike(text: string): boolean {
  const normalized = (text ?? '').toLowerCase();
  if (!normalized) return false;
  // Avoid false positives like "Combo Yoga Mat" (legitimate series name for some brands).
  return /\b(bundle|bundles|kit|kits|set|sets|pack|packs|bundle\s+and\s+save)\b/i.test(normalized);
}

function shouldExcludeFromSeriesIndex(product: NormalizedYogaMat): boolean {
  const productType = String((product as any)?.shopifyProductType ?? '');
  const titleOriginal = String((product as any)?.titleOriginal ?? '');
  const name = String((product as any)?.name ?? '');
  const shopifyHandle = String((product as any)?.shopifyHandle ?? '');

  // Avoid tags: many stores add SEO tags containing "set"/"pack", which causes false positives.
  const combined = [productType, titleOriginal, name, shopifyHandle].join(' ');

  // Series index is intended for "designs as products" mats. Bundles/sets should not appear as series.
  if (isBundleLike(combined)) return true;

  return false;
}

function mergeUniqueStringsCaseInsensitive(primary: string[] = [], secondary: string[] = []): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of [...primary, ...secondary]) {
    const cleaned = String(value ?? '').replace(/\s+/g, ' ').trim();
    if (!cleaned) continue;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(cleaned);
  }
  return out;
}

function mergeUniqueNumbers(primary: number[] = [], secondary: number[] = []): number[] {
  const out = Array.from(new Set([...primary, ...secondary].filter(n => Number.isFinite(n))));
  out.sort((a, b) => a - b);
  return out;
}

interface ProductImage {
  src: string;
  alt: string | null;
  width: number;
  height: number;
  position?: number;
}

function mergeUniqueImages(
  primary: ProductImage[] = [],
  secondary: ProductImage[] = []
): ProductImage[] {
  const seen = new Set<string>();
  const out: ProductImage[] = [];

  for (const img of [...primary, ...secondary]) {
    if (!img?.src) continue;
    // Use src as the unique key (avoid duplicate image URLs)
    if (seen.has(img.src)) continue;
    seen.add(img.src);
    out.push({
      src: img.src,
      alt: img.alt,
      width: img.width,
      height: img.height,
    });
  }

  return out;
}

function mergeUniqueSizePairs(
  primary: Array<{ lengthCMx10: number; widthCMx10: number }> = [],
  secondary: Array<{ lengthCMx10: number; widthCMx10: number }> = []
): Array<{ lengthCMx10: number; widthCMx10: number }> {
  const map = new Map<string, { lengthCMx10: number; widthCMx10: number }>();
  for (const pair of [...primary, ...secondary]) {
    if (!pair) continue;
    const lengthCMx10 = pair.lengthCMx10;
    const widthCMx10 = pair.widthCMx10;
    if (!Number.isFinite(lengthCMx10) || !Number.isFinite(widthCMx10)) continue;
    map.set(`${lengthCMx10}x${widthCMx10}`, { lengthCMx10, widthCMx10 });
  }
  return Array.from(map.values()).sort((a, b) => (a.lengthCMx10 - b.lengthCMx10) || (a.widthCMx10 - b.widthCMx10));
}

function minDefined(a: number | undefined, b: number | undefined): number | undefined {
  if (a == null) return b;
  if (b == null) return a;
  return Math.min(a, b);
}

function maxDefined(a: number | undefined, b: number | undefined): number | undefined {
  if (a == null) return b;
  if (b == null) return a;
  return Math.max(a, b);
}

function seriesKeyPart(seriesKey: string): string {
  const parts = seriesKey.split(':');
  return parts.length >= 2 ? parts.slice(1).join(':') : seriesKey;
}

function seriesSlugFromKey(seriesKey: string): string {
  // Return brand-free seriesSlug (e.g., "unity-pro" from "yolohayoga:unity-pro")
  // The seriesSlug is brand-scoped in the app, so no need to prefix with brandSlug here.
  // Global uniqueness for URLs is handled by canonicalSlug = brandSlug-seriesSlug in YogaMatLabApp.
  return seriesKeyPart(seriesKey);
}

export function buildSeriesIndex(products: NormalizedYogaMat[]): SeriesIndexRecord[] {
  type Mutable = SeriesIndexRecord & {
    _designNames: string[];
    _availableColors: string[];
    _variantPriceValues: number[];
    _weightKgValues: number[];
    _variantGramsValues: number[];
    _materialScores: Map<string, number>;
    _materials: string[];
    _features: string[];
    _sizePairs: Array<{ lengthCMx10: number; widthCMx10: number }>;
    _lengthCMx10Values: number[];
    _widthCMx10Values: number[];
    _thicknessMmx10Values: number[];
    _diameterCMx10Values: number[];
    _rolledDiameterCMx10Values: number[];
    _images: ProductImage[];
  };

  const groups = new Map<string, Mutable>();

  for (const product of products) {
    // Only include products that have an assigned seriesKey from brand-series.json
    // Products without a seriesKey are unassigned and should be excluded from the series index
    if (!product.seriesKey) continue;

    if (shouldExcludeFromSeriesIndex(product)) continue;

    const brandSlug = product.brandSlug;
    const key = product.seriesKey;
    const name = product.seriesName || product.titleOriginal || product.name;

    const group = groups.get(key) ?? {
      seriesKey: key,
      seriesSlug: seriesSlugFromKey(key),
      brandSlug,
      seriesName: name,
      seriesConfidence: product.seriesConfidence,
      seriesVersion: product.seriesVersion,
      productSlugs: [],
      productShopifyIds: [],
      productCount: 0,

      minPrice: undefined,
      maxPrice: undefined,
      priceCurrency: product.priceCurrency,
      variantPriceValues: undefined,
      isAvailable: undefined,

      material: undefined,
      materials: undefined,
      materialConfidence: undefined,
      pvcFree: undefined,

      weightKgMin: undefined,
      weightKgMax: undefined,
      weightKgValues: undefined,
      minGrams: undefined,
      maxGrams: undefined,
      variantGramsValues: undefined,

      thicknessMmMin: undefined,
      thicknessMmMax: undefined,
      lengthCmMin: undefined,
      lengthCmMax: undefined,
      widthCmMin: undefined,
      widthCmMax: undefined,
      diameterCmMin: undefined,
      diameterCmMax: undefined,
      rolledDiameterCmMin: undefined,
      rolledDiameterCmMax: undefined,

      thicknessMmx10Values: undefined,
      lengthCMx10Values: undefined,
      widthCMx10Values: undefined,
      diameterCMx10Values: undefined,
      rolledDiameterCMx10Values: undefined,
      sizePairsCMx10Values: undefined,

      _designNames: [],
      _availableColors: [],
      _variantPriceValues: [],
      _weightKgValues: [],
      _variantGramsValues: [],
      _materialScores: new Map<string, number>(),
      _materials: [],
      _features: [],
      _sizePairs: [],
      _lengthCMx10Values: [],
      _widthCMx10Values: [],
      _thicknessMmx10Values: [],
      _diameterCMx10Values: [],
      _rolledDiameterCMx10Values: [],
      _images: [],
    };

    group.productCount++;
    group.productSlugs.push(product.slug);
    if (typeof product.shopifyId === 'number' && Number.isFinite(product.shopifyId)) {
      group.productShopifyIds!.push(product.shopifyId);
    }

    group.seriesConfidence = maxDefined(group.seriesConfidence, product.seriesConfidence);
    group.seriesVersion = group.seriesVersion ?? product.seriesVersion;

    group.minPrice = minDefined(group.minPrice, product.minPrice);
    group.maxPrice = maxDefined(group.maxPrice, product.maxPrice);
    group.priceCurrency = group.priceCurrency ?? product.priceCurrency;
    group.isAvailable = (group.isAvailable ?? false) || Boolean(product.isAvailable);

    const primaryMaterial = typeof product.material === 'string' ? product.material : undefined;
    if (primaryMaterial) {
      const baseConfidence =
        typeof product.materialConfidence === 'number' && Number.isFinite(product.materialConfidence)
          ? product.materialConfidence
          : 0.6;
      const sourceMultiplier =
        product.materialSource === 'title' ? 1.2 :
          product.materialSource === 'tags' ? 1.0 :
            0.8;
      const score = baseConfidence * sourceMultiplier;
      group._materialScores.set(primaryMaterial, (group._materialScores.get(primaryMaterial) ?? 0) + score);
    }

    const materialList =
      Array.isArray(product.materials) && product.materials.length > 0
        ? product.materials
        : (primaryMaterial ? [primaryMaterial] : []);
    group._materials = mergeUniqueStringsCaseInsensitive(group._materials, materialList as string[]);

    group._features = mergeUniqueStringsCaseInsensitive(group._features, (product.features as string[]) ?? []);

    if (product.pvcFree === true) {
      group.pvcFree = true;
    }

    const weightKg = product.weight?.value;
    if (typeof weightKg === 'number' && Number.isFinite(weightKg)) {
      group.weightKgMin = minDefined(group.weightKgMin, weightKg);
      group.weightKgMax = maxDefined(group.weightKgMax, weightKg);
      group._weightKgValues = mergeUniqueNumbers(group._weightKgValues, [weightKg]);
    }

    group.minGrams = minDefined(group.minGrams, product.minGrams);
    group.maxGrams = maxDefined(group.maxGrams, product.maxGrams);
    group._variantGramsValues = mergeUniqueNumbers(group._variantGramsValues, product.variantGramsValues ?? []);

    group.thicknessMmMin = minDefined(group.thicknessMmMin, product.thicknessMmMin);
    group.thicknessMmMax = maxDefined(group.thicknessMmMax, product.thicknessMmMax);
    group.lengthCmMin = minDefined(group.lengthCmMin, product.lengthCmMin);
    group.lengthCmMax = maxDefined(group.lengthCmMax, product.lengthCmMax);
    group.widthCmMin = minDefined(group.widthCmMin, product.widthCmMin);
    group.widthCmMax = maxDefined(group.widthCmMax, product.widthCmMax);
    group.diameterCmMin = minDefined(group.diameterCmMin, product.diameterCmMin);
    group.diameterCmMax = maxDefined(group.diameterCmMax, product.diameterCmMax);
    group.rolledDiameterCmMin = minDefined(group.rolledDiameterCmMin, product.rolledDiameterCmMin);
    group.rolledDiameterCmMax = maxDefined(group.rolledDiameterCmMax, product.rolledDiameterCmMax);

    group._designNames = mergeUniqueStringsCaseInsensitive(group._designNames, product.designName ? [product.designName] : []);
    group._availableColors = mergeUniqueStringsCaseInsensitive(group._availableColors, product.availableColors ?? []);
    group._variantPriceValues = mergeUniqueNumbers(group._variantPriceValues, product.variantPriceValues ?? []);

    group._thicknessMmx10Values = mergeUniqueNumbers(group._thicknessMmx10Values, product.thicknessMmx10Values ?? []);
    group._lengthCMx10Values = mergeUniqueNumbers(group._lengthCMx10Values, product.lengthCMx10Values ?? []);
    group._widthCMx10Values = mergeUniqueNumbers(group._widthCMx10Values, product.widthCMx10Values ?? []);
    group._diameterCMx10Values = mergeUniqueNumbers(group._diameterCMx10Values, product.diameterCMx10Values ?? []);
    group._rolledDiameterCMx10Values = mergeUniqueNumbers(group._rolledDiameterCMx10Values, product.rolledDiameterCMx10Values ?? []);
    group._sizePairs = mergeUniqueSizePairs(group._sizePairs, product.sizePairsCMx10Values ?? []);
    group._images = mergeUniqueImages(group._images, product.images ?? []);

    groups.set(key, group);
  }

  const out: SeriesIndexRecord[] = [];
  const seriesMeta = loadBrandSeriesDescriptions();
  for (const group of groups.values()) {
    const productSlugs = Array.from(new Set(group.productSlugs)).sort((a, b) => a.localeCompare(b));
    const productShopifyIds = Array.from(new Set(group.productShopifyIds ?? [])).sort((a, b) => a - b);
    const designNames = group._designNames.length > 0 ? group._designNames : undefined;
    const availableColors = group._availableColors.length > 0 ? group._availableColors : undefined;
    const variantPriceValues = group._variantPriceValues.length > 0 ? group._variantPriceValues : undefined;
    const weightKgValues = group._weightKgValues.length > 0 ? group._weightKgValues : undefined;
    const variantGramsValues = group._variantGramsValues.length > 0 ? group._variantGramsValues : undefined;
    const materials = group._materials.length > 0 ? group._materials : undefined;
    const blockedFeatureTags = new Set(['extra long', 'extra wide', 'extra thick']);
    const featuresFiltered = group._features
      .map(v => String(v ?? '').trim())
      .filter(Boolean)
      .filter(v => !blockedFeatureTags.has(v.toLowerCase()));
    const features = featuresFiltered.length > 0 ? featuresFiltered : undefined;

    let material: string | undefined;
    let materialConfidence: number | undefined;
    if (group._materialScores.size > 0) {
      const entries = Array.from(group._materialScores.entries())
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
      const total = entries.reduce((sum, [, score]) => sum + score, 0);
      material = entries[0]?.[0];
      if (total > 0 && entries[0]) {
        materialConfidence = entries[0][1] / total;
      }
    }

    const thicknessMax = group.thicknessMmMax;
    const lengthMax = group.lengthCmMax;
    const widthMax = group.widthCmMax;
    const weightMax = group.weightKgMax;

    const thicknessBucket = getThicknessBucket(thicknessMax);
    const lengthBucket = getLengthBucket(lengthMax);
    const widthBucket = getWidthBucket(widthMax);
    const weightBucket = getWeightBucket(weightMax);

    const sizeTags = [
      typeof lengthMax === 'number' && Number.isFinite(lengthMax) && lengthMax >= 200 ? 'Extra-Long' : null,
      typeof widthMax === 'number' && Number.isFinite(widthMax) && widthMax >= 70 ? 'Extra-Wide' : null,
    ].filter((v): v is string => Boolean(v));

    out.push({
      seriesKey: group.seriesKey,
      seriesSlug: group.seriesSlug,
      brandSlug: group.brandSlug,
      seriesName: group.seriesName,
      tagline: seriesMeta.get(group.seriesKey)?.tagline,
      description: seriesMeta.get(group.seriesKey)?.description,
      seriesConfidence: group.seriesConfidence,
      seriesVersion: group.seriesVersion,
      designNames,
      availableColors,
      productSlugs,
      productShopifyIds: productShopifyIds.length > 0 ? productShopifyIds : undefined,
      productCount: productSlugs.length,

      minPrice: group.minPrice,
      maxPrice: group.maxPrice,
      priceCurrency: group.priceCurrency,
      variantPriceValues,
      isAvailable: group.isAvailable,
      priceBucket: getPriceBucket(group.minPrice, group.priceCurrency),

      material,
      materials,
      materialConfidence,
      features,
      pvcFree: group.pvcFree,

      shapeLabel: getShapeLabel(group.lengthCmMax, group.widthCmMax, group.diameterCmMax) as SeriesIndexRecord['shapeLabel'],
      sizeTags: sizeTags.length > 0 ? sizeTags : undefined,
      thicknessBucket,
      lengthBucket,
      widthBucket,
      weightBucket,

      weightKgMin: group.weightKgMin,
      weightKgMax: group.weightKgMax,
      weightKgValues,
      minGrams: group.minGrams,
      maxGrams: group.maxGrams,
      variantGramsValues,

      thicknessMmMin: group.thicknessMmMin,
      thicknessMmMax: group.thicknessMmMax,
      lengthCmMin: group.lengthCmMin,
      lengthCmMax: group.lengthCmMax,
      widthCmMin: group.widthCmMin,
      widthCmMax: group.widthCmMax,
      diameterCmMin: group.diameterCmMin,
      diameterCmMax: group.diameterCmMax,
      rolledDiameterCmMin: group.rolledDiameterCmMin,
      rolledDiameterCmMax: group.rolledDiameterCmMax,

      thicknessMmx10Values: group._thicknessMmx10Values.length > 0 ? group._thicknessMmx10Values : undefined,
      lengthCMx10Values: group._lengthCMx10Values.length > 0 ? group._lengthCMx10Values : undefined,
      widthCMx10Values: group._widthCMx10Values.length > 0 ? group._widthCMx10Values : undefined,
      diameterCMx10Values: group._diameterCMx10Values.length > 0 ? group._diameterCMx10Values : undefined,
      rolledDiameterCMx10Values: group._rolledDiameterCMx10Values.length > 0 ? group._rolledDiameterCMx10Values : undefined,
      sizePairsCMx10Values: group._sizePairs.length > 0 ? group._sizePairs : undefined,

      // Dimension labels
      lengthLabel: getDimensionLabel('length', group.lengthCmMin, group.lengthCmMax),
      widthLabel: getDimensionLabel('width', group.widthCmMin, group.widthCmMax),
      thicknessLabel: getDimensionLabel('thickness', group.thicknessMmMin, group.thicknessMmMax),
      // shapeLabel is now emitted above as a canonical enum for the app.

      // Images aggregated from all products
      images: group._images.length > 0 ? group._images : undefined,
    });
  }

  out.sort((a, b) =>
    a.brandSlug.localeCompare(b.brandSlug) ||
    (b.productCount - a.productCount) ||
    a.seriesName.localeCompare(b.seriesName)
  );

  return out;
}
