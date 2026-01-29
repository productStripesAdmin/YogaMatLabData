import { promises as fs } from 'fs';
import path from 'path';
import { logger } from './lib/logger.js';
import type { ShopifyProductsResponse } from './lib/fetch-products-json.js';
import type { NormalizedYogaMat } from './lib/field-mapper.js';
import { indexCoreFeatures, type BrandEnrichmentOutput } from './lib/product-page-enricher.js';
import { describeBrandFilter, parseBrandFilterFromEnv } from './lib/brand-filter.js';

interface NormalizationSummary {
  date: string;
  totalBrands: number;
  totalProducts: number;
  validProducts: number;
  invalidProducts: number;
  discardedProducts: number;
  excludedProducts: number;
  excludedByRules: number;
  productsWithMeasurementWarnings: number;
  totalSeries: number;
  brands: Array<{
    brandSlug: string;
    totalProducts: number;
    validProducts: number;
    invalidProducts: number;
    discardedProducts: number;
    excludedProducts: number;
    excludedByRules: number;
    discardedProductTypes: Array<{ productType: string; count: number; shopifyIds: number[] }>;
    excludedRules: Array<{ reason: string; count: number; shopifyIds: number[] }>;
    measurementWarnings: Array<{
      productName: string;
      slug: string;
      shopifyId?: number;
      warnings: Array<{
        field: string;
        value: number;
        threshold: { min: number; max: number; unit: string };
        issue: 'too_low' | 'too_high';
      }>;
    }>;
    errors: Array<{
      productName: string;
      errors: string[];
    }>;
  }>;
}

type BrandsMetadata = Array<{
  slug: string;
  scrapingEnabled?: boolean;
}>;

type ProductExclusion = {
  brandSlug: string;
  shopifyId: number;
  remove?: boolean;
  reason?: string;
};

type FieldMapperModule = typeof import('./lib/field-mapper.js');

let mapShopifyToYogaMatFn: FieldMapperModule['mapShopifyToYogaMat'] | null = null;
let validateNormalizedMatFn: FieldMapperModule['validateNormalizedMat'] | null = null;

async function loadFieldMapper(date: string): Promise<void> {
  // Series config is canonical in this repo (`config/brand-series.json`). Only use Convex-sourced series config when explicitly enabled.
  const seriesSource = (process.env.YML_SERIES_CONFIG_SOURCE ?? 'file').toLowerCase().trim();
  if (seriesSource === 'convex' && !process.env.YML_MANUAL_SERIES_PATH) {
    const candidates = [
      path.join(process.cwd(), 'data', 'raw', date, '_brand-series.json'),
      // Backwards-compat for older runs.
      path.join(process.cwd(), 'data', 'raw', date, '_manual-series.json'),
    ];

    for (const candidate of candidates) {
      try {
        await fs.access(candidate);
        process.env.YML_MANUAL_SERIES_PATH = candidate;
        logger.info(
          `Using Convex series definitions from: ${path.relative(process.cwd(), candidate)}`
        );
        break;
      } catch {
        // continue
      }
    }
  }

  const mod = (await import('./lib/field-mapper.js')) as FieldMapperModule;
  mapShopifyToYogaMatFn = mod.mapShopifyToYogaMat;
  validateNormalizedMatFn = mod.validateNormalizedMat;
}

function getBrandSlugVariants(brandSlug: string): string[] {
  const slug = (brandSlug ?? '').toLowerCase().trim();
  if (!slug) return [];
  const noDashes = slug.replace(/-/g, '');
  const underscore = slug.replace(/-/g, '_');
  return Array.from(new Set([slug, noDashes, underscore]));
}

function exclusionKey(brandSlug: string, shopifyId: number): string {
  return `${brandSlug.toLowerCase().trim()}:${shopifyId}`;
}

async function loadProductExclusions(date: string): Promise<{ excluded: Set<string>; sourcePaths: string[] }> {
  const sourcePaths: string[] = [];
  const excluded = new Set<string>();

  const candidatePaths = [
    path.join(process.cwd(), 'data', 'raw', date, '_product-exclusions.json'),
    path.join(process.cwd(), 'config', 'product-exclusions.json'),
  ];

  for (const filepath of candidatePaths) {
    try {
      const raw = await fs.readFile(filepath, 'utf-8');
      const parsed = JSON.parse(raw) as unknown;
      const items = Array.isArray(parsed) ? (parsed as ProductExclusion[]) : [];
      sourcePaths.push(filepath);

      for (const item of items) {
        const shopifyId = Number((item as any)?.shopifyId);
        if (!Number.isFinite(shopifyId)) continue;

        const removeFlag = (item as any)?.remove;
        if (typeof removeFlag === 'boolean' && removeFlag !== true) continue;

        const brandSlug = String((item as any)?.brandSlug ?? '').trim();
        if (!brandSlug) continue;

        for (const variant of getBrandSlugVariants(brandSlug)) {
          excluded.add(exclusionKey(variant, shopifyId));
        }
      }
    } catch {
      // optional file
    }
  }

  return { excluded, sourcePaths };
}

// Measurement validation thresholds (in cm for length/width, mm for thickness)
const MEASUREMENT_THRESHOLDS = {
  length: { min: 50, max: 250, unit: 'cm' },    // 50cm to 250cm
  width: { min: 20, max: 150, unit: 'cm' },     // 20cm to 150cm
  thickness: { min: 0.5, max: 30, unit: 'mm' }, // 0.5mm to 30mm
  weight: { min: 0.2, max: 10, unit: 'kg' },    // 0.2kg to 10kg
};

const MIN_USD_PRICE = 50;

function shouldExcludeByPrice(product: NormalizedYogaMat): { reason: string } | null {
  const currency = (product.priceCurrency ?? '').toUpperCase().trim() || 'USD';
  // Only enforce the threshold when prices are normalized to USD.
  if (currency !== 'USD') return null;

  const minPrice = typeof product.minPrice === 'number' ? product.minPrice : undefined;
  const maxPrice = typeof product.maxPrice === 'number' ? product.maxPrice : undefined;

  if (minPrice != null && Number.isFinite(minPrice) && minPrice < MIN_USD_PRICE) {
    return { reason: `price_below_${MIN_USD_PRICE}_usd` };
  }
  if (maxPrice != null && Number.isFinite(maxPrice) && maxPrice < MIN_USD_PRICE) {
    return { reason: `price_below_${MIN_USD_PRICE}_usd` };
  }

  return null;
}

function isSquareMatProduct(product: NormalizedYogaMat): boolean {
  const haystacks: string[] = [
    product.name ?? '',
    product.slug ?? '',
    product.shopifyProductType ?? '',
    ...(product.shopifyTags ?? []),
  ];

  const combined = haystacks.join(' ').toLowerCase();
  if (/\bsquare(d)?\b/.test(combined)) return true;

  const length = product.lengthCmMax ?? product.lengthCmMin;
  const width = product.widthCmMax ?? product.widthCmMin;
  if (length == null || width == null) return false;
  if (!Number.isFinite(length) || !Number.isFinite(width)) return false;

  const average = (length + width) / 2;
  const diff = Math.abs(length - width);

  // Only treat as "square" for reasonably large items; avoid misclassifying small accessories.
  if (average < 80) return false;

  // Allow a small tolerance (2cm or 2% of average, whichever is larger).
  const tolerance = Math.max(2, average * 0.02);
  return diff <= tolerance;
}

function isExtraLongAndWideMatProduct(product: NormalizedYogaMat): boolean {
  const haystacks: string[] = [
    product.name ?? '',
    product.slug ?? '',
    product.shopifyProductType ?? '',
    ...(product.shopifyTags ?? []),
  ];

  const combined = haystacks.join(' ').toLowerCase();
  const hasKeywordSignal =
    (/\bextra\s+long\b/.test(combined) && /\bwide\b/.test(combined)) ||
    /\bextra\s+long\s+and\s+wide\b/.test(combined) ||
    /\b(xw|xlw)\b/.test(combined) ||
    /\bextra\s*wide\b/.test(combined);

  const length = product.lengthCmMax ?? product.lengthCmMin;
  const width = product.widthCmMax ?? product.widthCmMin;
  const hasDimensionSignal =
    length != null &&
    width != null &&
    Number.isFinite(length) &&
    Number.isFinite(width) &&
    length >= 200 &&
    width >= 70;

  return hasKeywordSignal || hasDimensionSignal;
}

interface MeasurementWarning {
  field: string;
  value: number;
  threshold: { min: number; max: number; unit: string };
  issue: 'too_low' | 'too_high';
}

function validateMeasurements(product: NormalizedYogaMat): MeasurementWarning[] {
  const warnings: MeasurementWarning[] = [];
  const isSquare = isSquareMatProduct(product);
  const isExtraLongWide = !isSquare && isExtraLongAndWideMatProduct(product);
  const widthThreshold = isSquare
    ? { ...MEASUREMENT_THRESHOLDS.width, max: MEASUREMENT_THRESHOLDS.length.max }
    : MEASUREMENT_THRESHOLDS.width;
  const weightThreshold = (isSquare || isExtraLongWide)
    ? { ...MEASUREMENT_THRESHOLDS.weight, max: 12.5 }
    : MEASUREMENT_THRESHOLDS.weight;

  // Check length
  if (product.lengthCmMin != null && product.lengthCmMin < MEASUREMENT_THRESHOLDS.length.min) {
    warnings.push({ field: 'lengthCmMin', value: product.lengthCmMin, threshold: MEASUREMENT_THRESHOLDS.length, issue: 'too_low' });
  }
  if (product.lengthCmMax != null && product.lengthCmMax > MEASUREMENT_THRESHOLDS.length.max) {
    warnings.push({ field: 'lengthCmMax', value: product.lengthCmMax, threshold: MEASUREMENT_THRESHOLDS.length, issue: 'too_high' });
  }

  // Check width
  if (product.widthCmMin != null && product.widthCmMin < widthThreshold.min) {
    warnings.push({ field: 'widthCmMin', value: product.widthCmMin, threshold: widthThreshold, issue: 'too_low' });
  }
  if (product.widthCmMax != null && product.widthCmMax > widthThreshold.max) {
    warnings.push({ field: 'widthCmMax', value: product.widthCmMax, threshold: widthThreshold, issue: 'too_high' });
  }

  // Check thickness
  if (product.thicknessMmMin != null && product.thicknessMmMin < MEASUREMENT_THRESHOLDS.thickness.min) {
    warnings.push({ field: 'thicknessMmMin', value: product.thicknessMmMin, threshold: MEASUREMENT_THRESHOLDS.thickness, issue: 'too_low' });
  }
  if (product.thicknessMmMax != null && product.thicknessMmMax > MEASUREMENT_THRESHOLDS.thickness.max) {
    warnings.push({ field: 'thicknessMmMax', value: product.thicknessMmMax, threshold: MEASUREMENT_THRESHOLDS.thickness, issue: 'too_high' });
  }

  // Check weight
  if (product.weight?.value != null) {
    if (product.weight.value < weightThreshold.min) {
      warnings.push({ field: 'weight', value: product.weight.value, threshold: weightThreshold, issue: 'too_low' });
    }
    if (product.weight.value > weightThreshold.max) {
      warnings.push({ field: 'weight', value: product.weight.value, threshold: weightThreshold, issue: 'too_high' });
    }
  }

  return warnings;
}

function includesMatHint(text: string): boolean {
  const normalized = text.toLowerCase();
  if (/\bmat(s)?\b/i.test(normalized)) return true;
  // Some brands sell "Yoga Rugs" (relevant products) which should pass the product_type gate.
  if (/\byoga\s+rug(s)?\b/i.test(normalized)) return true;
  // Also match "yogamat" without whitespace (rare but seen in some systems).
  const compact = normalized.replace(/\s+/g, '');
  return /yogamat(s)?/i.test(compact) || /yogarug(s)?/i.test(compact);
}

function looksLikeMultipack(text: string): boolean {
  const lower = text.toLowerCase();
  return (
    /\bbox(?:\s+|-)of(?:\s+|-)?\d+\b/.test(lower) ||
    /\bpack(?:\s+|-)of(?:\s+|-)?\d+\b/.test(lower) ||
    /\bcase(?:\s+|-)of(?:\s+|-)?\d+\b/.test(lower) ||
    /\bset(?:\s+|-)of(?:\s+|-)?\d+\b/.test(lower)
  );
}

function shouldDiscardByProductType(params: {
  productType: string;
  title: string;
  tags: string[];
  bodyHtml?: string;
}): boolean {
  const productType = params.productType.trim();
  if (!productType) return false; // Empty types are ambiguous; keep.

  // Multipack hints should primarily come from the title/tags/product_type. Body HTML often contains
  // unrelated phrases like “set of 2/3…” that can create false positives.
  const multipackText = [
    params.title,
    params.tags.join(' '),
    productType,
  ].join(' ');

  // Discard wholesale/bulk multi-packs even if the title contains "mat".
  // These cause noise in series grouping (e.g. "Yoga Mat - Long - Box of 7").
  if (looksLikeMultipack(multipackText)) return true;

  // Priority: if product_type itself suggests "mat", keep.
  if (includesMatHint(productType)) return false;

  // Fallback: some stores use bespoke product_type values (e.g. "Harmony", "MUSHROOM") for mats.
  // If title/tags still clearly indicate mats, keep.
  if (includesMatHint(params.title)) return false;
  if (includesMatHint(params.tags.join(' '))) return false;

  // Last resort: check body_html for mat hints.
  // Some brands use series names as product_type (e.g. Jade Yoga uses "MUSHROOM", "Harmony")
  // that don't contain "mat", but the description clearly describes a yoga mat.
  if (params.bodyHtml && includesMatHint(params.bodyHtml)) return false;

  return true;
}

async function ensureNormalizedDirectory(date: string) {
  const normalizedDir = path.join(process.cwd(), 'data', 'normalized', date);
  await fs.mkdir(normalizedDir, { recursive: true });
  logger.info(`Created normalized directory: ${normalizedDir}`);
}

async function loadEnabledBrandSlugs(date: string): Promise<{ enabled: Set<string>; sourcePath: string } | null> {
  const sourcePath = path.join(process.cwd(), 'data', 'raw', date, '_brands.json');
  try {
    const raw = await fs.readFile(sourcePath, 'utf-8');
    const parsed = JSON.parse(raw) as unknown;
    const brands = Array.isArray(parsed) ? (parsed as BrandsMetadata) : null;
    if (!brands) return null;

    const enabled = new Set(
      brands
        .filter(b => typeof b?.slug === 'string' && b.slug.trim().length > 0)
        // Treat missing scrapingEnabled as enabled for backwards compatibility.
        .filter(b => b.scrapingEnabled !== false)
        .map(b => b.slug)
    );

    return { enabled, sourcePath };
  } catch {
    return null;
  }
}

async function getRawFiles(date: string): Promise<string[]> {
  const rawDir = path.join(process.cwd(), 'data', 'raw', date);

  try {
    const files = await fs.readdir(rawDir);
    // Filter out summary file and only get JSON files
    return files.filter(f => f.endsWith('.json') && !f.startsWith('_'));
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to read raw data directory: ${rawDir} - ${msg}`);
  }
}

async function normalizeBrand(
  brandSlug: string,
  date: string,
  excludedShopifyIds: Set<string>
): Promise<{
  brandSlug: string;
  products: NormalizedYogaMat[];
  validProducts: number;
  invalidProducts: number;
  discardedProducts: number;
  excludedProducts: number;
  excludedByRules: number;
  discardedProductTypes: Array<{ productType: string; count: number; shopifyIds: number[] }>;
  excludedRules: Array<{ reason: string; count: number; shopifyIds: number[] }>;
  measurementWarnings: Array<{ productName: string; slug: string; shopifyId?: number; warnings: MeasurementWarning[] }>;
  errors: Array<{ productName: string; errors: string[] }>;
}> {
  logger.info(`Processing brand: ${brandSlug}`);

  // Read raw Shopify data
  const rawPath = path.join(process.cwd(), 'data', 'raw', date, `${brandSlug}.json`);
  const rawData = await fs.readFile(rawPath, 'utf-8');
  const shopifyData: ShopifyProductsResponse = JSON.parse(rawData);

  logger.info(`  Found ${shopifyData.products.length} products`);

  // Optional: load per-brand product-page enrichment (e.g. Core Features from accordion content)
  let coreFeaturesIndex: ReturnType<typeof indexCoreFeatures> | undefined;
  let appendTextIndex: Map<string, string> | undefined;
  let sectionsIndex: Map<string, Array<{ heading: string; items: string[]; confidence: number }>> | undefined;
  const enrichPath = path.join(process.cwd(), 'data', 'enriched', date, `${brandSlug}.json`);
  try {
    const enrichedRaw = await fs.readFile(enrichPath, 'utf-8');
    const enriched: BrandEnrichmentOutput = JSON.parse(enrichedRaw);
    coreFeaturesIndex = indexCoreFeatures(enriched);
    appendTextIndex = new Map(
      enriched.products
        .filter(p => typeof p.appendText?.text === 'string' && p.appendText.text.trim().length > 0)
        .map(p => [p.handle, p.appendText!.text])
    );
    sectionsIndex = new Map(
      enriched.products
        .filter(p => Array.isArray(p.sections) && p.sections.length > 0)
        .map(p => [p.handle, p.sections as Array<{ heading: string; items: string[]; confidence: number }>])
    );
    logger.info(`  Loaded enrichment: ${coreFeaturesIndex.size} product(s)`);
  } catch {
    // No enrichment file for this brand/date. This is expected unless npm run enrich has been run.
  }

  const normalizedProducts: NormalizedYogaMat[] = [];
  const errors: Array<{ productName: string; errors: string[] }> = [];
  const measurementWarnings: Array<{ productName: string; slug: string; shopifyId?: number; warnings: MeasurementWarning[] }> = [];
  let validCount = 0;
  let invalidCount = 0;
  let discardedCount = 0;
  let excludedCount = 0;
  let excludedByRulesCount = 0;
  const discardedTypeInfo = new Map<string, { count: number; shopifyIds: number[] }>();
  const excludedRuleInfo = new Map<string, { count: number; shopifyIds: number[] }>();

  const trackDiscardedProduct = (productType: string, productId: number | undefined) => {
    const key = productType;
    const existing = discardedTypeInfo.get(key) ?? { count: 0, shopifyIds: [] };
    existing.count += 1;
    if (typeof productId === 'number' && Number.isFinite(productId)) {
      existing.shopifyIds.push(productId);
    }
    discardedTypeInfo.set(key, existing);
  };

  const trackExcludedRule = (reason: string, productId: number | undefined) => {
    const key = reason;
    const existing = excludedRuleInfo.get(key) ?? { count: 0, shopifyIds: [] };
    existing.count += 1;
    if (typeof productId === 'number' && Number.isFinite(productId)) {
      existing.shopifyIds.push(productId);
    }
    excludedRuleInfo.set(key, existing);
  };

  for (const shopifyProduct of shopifyData.products) {
    const shopifyId = Number((shopifyProduct as any)?.id);
    if (Number.isFinite(shopifyId) && excludedShopifyIds.has(exclusionKey(brandSlug, shopifyId))) {
      excludedCount++;
      continue;
    }

    if (shouldDiscardByProductType({
      productType: shopifyProduct.product_type ?? '',
      title: shopifyProduct.title ?? '',
      tags: Array.isArray(shopifyProduct.tags) ? shopifyProduct.tags : [],
      bodyHtml: shopifyProduct.body_html ?? '',
    })) {
      discardedCount++;
      const type = (shopifyProduct.product_type ?? '').trim();
      trackDiscardedProduct(type, Number.isFinite(shopifyId) ? shopifyId : undefined);
      continue;
    }

    try {
      if (!mapShopifyToYogaMatFn || !validateNormalizedMatFn) {
        throw new Error('Field mapper not initialized');
      }

      // Map to normalized format
      const enrichment = coreFeaturesIndex?.get(shopifyProduct.handle);
      const appendText = appendTextIndex?.get(shopifyProduct.handle);
      const sections = sectionsIndex?.get(shopifyProduct.handle);
      const normalized = mapShopifyToYogaMatFn(
        shopifyProduct,
        brandSlug,
        (enrichment || appendText)
          ? { coreFeatures: enrichment, appendText, productPageSections: sections }
          : undefined
      );

      // Validate
      const validation = validateNormalizedMatFn(normalized);

      if (validation.valid) {
        const excludedRule = shouldExcludeByPrice(normalized);
        if (excludedRule) {
          excludedByRulesCount++;
          trackExcludedRule(excludedRule.reason, Number.isFinite(shopifyId) ? shopifyId : undefined);
          continue;
        }

        // Check for suspicious measurements
        const measWarnings = validateMeasurements(normalized);
        if (measWarnings.length > 0) {
          const normalizedShopifyId =
            typeof normalized.shopifyId === 'number' && Number.isFinite(normalized.shopifyId)
              ? normalized.shopifyId
              : undefined;
          const rawShopifyId = Number.isFinite(shopifyId) ? shopifyId : undefined;

          measurementWarnings.push({
            productName: shopifyProduct.title,
            slug: normalized.slug,
            shopifyId: normalizedShopifyId ?? rawShopifyId,
            warnings: measWarnings,
          });
        }
        normalizedProducts.push(normalized);
        validCount++;
      } else {
        logger.warn(`  Invalid product: ${shopifyProduct.title}`, validation.errors);
        errors.push({
          productName: shopifyProduct.title,
          errors: validation.errors,
        });
        invalidCount++;
      }
    } catch (error) {
      logger.error(`  Failed to normalize product: ${shopifyProduct.title}`, error);
      errors.push({
        productName: shopifyProduct.title,
        errors: [error instanceof Error ? error.message : 'Unknown error'],
      });
      invalidCount++;
    }
  }

  logger.success(`  Normalized ${validCount} valid products`);
  if (invalidCount > 0) {
    logger.warn(`  Skipped ${invalidCount} invalid products`);
  }
  if (discardedCount > 0) {
    logger.warn(`  Discarded ${discardedCount} product(s) by product_type filter`);
  }
  if (excludedCount > 0) {
    logger.warn(`  Excluded ${excludedCount} product(s) by product exclusions list`);
  }
  if (excludedByRulesCount > 0) {
    logger.warn(`  Excluded ${excludedByRulesCount} product(s) by pipeline rules`);
  }
  if (measurementWarnings.length > 0) {
    logger.warn(`  Suspicious measurements: ${measurementWarnings.length} product(s)`);
  }

  return {
    brandSlug,
    products: normalizedProducts,
    validProducts: validCount,
    invalidProducts: invalidCount,
    discardedProducts: discardedCount,
    excludedProducts: excludedCount,
    excludedByRules: excludedByRulesCount,
    discardedProductTypes: Array.from(discardedTypeInfo.entries())
      .map(([productType, info]) => ({
        productType,
        count: info.count,
        shopifyIds: info.shopifyIds.sort((a, b) => a - b),
      }))
      .sort((a, b) => b.count - a.count || a.productType.localeCompare(b.productType)),
    excludedRules: Array.from(excludedRuleInfo.entries())
      .map(([reason, info]) => ({
        reason,
        count: info.count,
        shopifyIds: info.shopifyIds.sort((a, b) => a - b),
      }))
      .sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason)),
    measurementWarnings,
    errors,
  };
}

async function saveNormalizedData(
  date: string,
  results: Array<{
    brandSlug: string;
    products: NormalizedYogaMat[];
  }>
): Promise<void> {
  for (const result of results) {
    const filename = `${result.brandSlug}.json`;
    const filepath = path.join(process.cwd(), 'data', 'normalized', date, filename);

    await fs.writeFile(
      filepath,
      JSON.stringify(result.products, null, 2),
      'utf-8'
    );

    logger.info(`Saved ${result.products.length} products to ${filename}`);
  }
}

async function generateSummary(
  date: string,
  results: Array<{
    brandSlug: string;
    validProducts: number;
    invalidProducts: number;
    discardedProducts: number;
    excludedProducts: number;
    excludedByRules: number;
    discardedProductTypes: Array<{ productType: string; count: number; shopifyIds: number[] }>;
    excludedRules: Array<{ reason: string; count: number; shopifyIds: number[] }>;
    measurementWarnings: Array<{ productName: string; slug: string; shopifyId?: number; warnings: MeasurementWarning[] }>;
    products: NormalizedYogaMat[];
    errors: Array<{ productName: string; errors: string[] }>;
  }>
): Promise<NormalizationSummary> {
  const seriesKeys = new Set<string>();
  for (const result of results) {
    for (const product of result.products) {
      if (typeof product.seriesKey === 'string' && product.seriesKey.trim().length > 0) {
        seriesKeys.add(product.seriesKey);
      }
    }
  }

  const summary: NormalizationSummary = {
    date,
    totalBrands: results.length,
    totalProducts: results.reduce((sum, r) => sum + r.validProducts + r.invalidProducts + r.discardedProducts + r.excludedProducts, 0),
    validProducts: results.reduce((sum, r) => sum + r.validProducts, 0),
    invalidProducts: results.reduce((sum, r) => sum + r.invalidProducts, 0),
    discardedProducts: results.reduce((sum, r) => sum + r.discardedProducts, 0),
    excludedProducts: results.reduce((sum, r) => sum + r.excludedProducts, 0),
    excludedByRules: results.reduce((sum, r) => sum + (r.excludedByRules ?? 0), 0),
    productsWithMeasurementWarnings: results.reduce((sum, r) => sum + r.measurementWarnings.length, 0),
    totalSeries: seriesKeys.size,
    brands: results.map(r => ({
      brandSlug: r.brandSlug,
      totalProducts: r.validProducts + r.invalidProducts + r.discardedProducts + r.excludedProducts,
      validProducts: r.validProducts,
      invalidProducts: r.invalidProducts,
      discardedProducts: r.discardedProducts,
      excludedProducts: r.excludedProducts,
      excludedByRules: r.excludedByRules ?? 0,
      discardedProductTypes: r.discardedProductTypes,
      excludedRules: r.excludedRules ?? [],
      measurementWarnings: r.measurementWarnings,
      errors: r.errors,
    })),
  };

  // Save summary
  const summaryPath = path.join(
    process.cwd(),
    'data',
    'normalized',
    date,
    '_summary.json'
  );
  await fs.writeFile(summaryPath, JSON.stringify(summary, null, 2), 'utf-8');

  return summary;
}

interface SeriesAssignmentProduct {
  slug: string;
  titleOriginal: string;
  productType?: string;
  seriesVersion?: string;
}

interface SeriesAssignmentRecord {
  seriesKey: string;
  seriesName: string;
  productCount: number;
  products: SeriesAssignmentProduct[];
}

interface SeriesAssignmentsSummary {
  date: string;
  brands: Array<{
    brandSlug: string;
    totalProducts: number;
    assignedProducts: number;
    unassignedProducts: number;
    series: SeriesAssignmentRecord[];
    unassigned: SeriesAssignmentProduct[];
  }>;
}

async function generateSeriesAssignmentsSummary(
  date: string,
  results: Array<{
    brandSlug: string;
    products: NormalizedYogaMat[];
  }>
): Promise<SeriesAssignmentsSummary> {
  const summary: SeriesAssignmentsSummary = {
    date,
    brands: [],
  };

  for (const result of results) {
    const seriesMap = new Map<string, { seriesName: string; products: SeriesAssignmentProduct[] }>();
    const unassigned: SeriesAssignmentProduct[] = [];

    for (const product of result.products) {
      const productInfo: SeriesAssignmentProduct = {
        slug: product.slug,
        titleOriginal: product.titleOriginal || product.name,
        productType: product.shopifyProductType,
        seriesVersion: product.seriesVersion,
      };

      if (product.seriesKey) {
        const existing = seriesMap.get(product.seriesKey);
        if (existing) {
          existing.products.push(productInfo);
        } else {
          seriesMap.set(product.seriesKey, {
            seriesName: product.seriesName || product.seriesKey,
            products: [productInfo],
          });
        }
      } else {
        unassigned.push(productInfo);
      }
    }

    // Convert map to sorted array
    const series: SeriesAssignmentRecord[] = Array.from(seriesMap.entries())
      .map(([seriesKey, data]) => ({
        seriesKey,
        seriesName: data.seriesName,
        productCount: data.products.length,
        products: data.products.sort((a, b) => a.slug.localeCompare(b.slug)),
      }))
      .sort((a, b) => b.productCount - a.productCount || a.seriesKey.localeCompare(b.seriesKey));

    summary.brands.push({
      brandSlug: result.brandSlug,
      totalProducts: result.products.length,
      assignedProducts: result.products.length - unassigned.length,
      unassignedProducts: unassigned.length,
      series,
      unassigned: unassigned.sort((a, b) => a.slug.localeCompare(b.slug)),
    });
  }

  // Sort brands alphabetically
  summary.brands.sort((a, b) => a.brandSlug.localeCompare(b.brandSlug));

  // Save to file
  const assignmentsPath = path.join(
    process.cwd(),
    'data',
    'normalized',
    date,
    '_series-assignments.json'
  );
  await fs.writeFile(assignmentsPath, JSON.stringify(summary, null, 2), 'utf-8');

  // Print console summary
  logger.info('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  logger.info('SERIES ASSIGNMENTS');
  logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  for (const brand of summary.brands) {
    if (brand.series.length === 0 && brand.unassigned.length === 0) continue;

    logger.info(`\n${brand.brandSlug} (${brand.assignedProducts}/${brand.totalProducts} assigned):`);

    for (const s of brand.series) {
      logger.info(`  ${s.seriesKey} (${s.seriesName}) - ${s.productCount} product(s)`);
    }

    if (brand.unassigned.length > 0) {
      logger.warn(`  [unassigned] - ${brand.unassigned.length} product(s)`);
      // Show first few unassigned for visibility
      const preview = brand.unassigned.slice(0, 3);
      for (const p of preview) {
        logger.info(`    • ${p.titleOriginal}`);
      }
      if (brand.unassigned.length > 3) {
        logger.info(`    ... and ${brand.unassigned.length - 3} more`);
      }
    }
  }

  logger.info('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  logger.info(`Saved detailed series assignments to: data/normalized/${date}/_series-assignments.json`);

  return summary;
}

async function main() {
  logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  logger.info('YogaMatLab Data Pipeline - Normalize Data');
  logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const startTime = Date.now();

  // Use today's date or accept date argument
  let date = process.argv[2] || new Date().toISOString().split('T')[0];

  // Check if raw data exists for the specified date, fall back to latest if not
  const rawDir = path.join(process.cwd(), 'data', 'raw', date);
  try {
    await fs.access(rawDir);
  } catch {
    // Try to use the 'latest' symlink
    const latestLink = path.join(process.cwd(), 'data', 'raw', 'latest');
    try {
      const latestTarget = await fs.readlink(latestLink);
      date = latestTarget;
      logger.warn(`No raw data for ${process.argv[2] || new Date().toISOString().split('T')[0]}, using latest: ${date}`);
    } catch {
      throw new Error(`No raw data directory found for ${date} and no 'latest' symlink available`);
    }
  }

  logger.info(`Processing date: ${date}`);

  await loadFieldMapper(date);

  // Ensure normalized directory exists
  await ensureNormalizedDirectory(date);

  // If fetch saved brands metadata, use it to avoid normalizing disabled brands even if raw files exist.
  const enabledBrandsMeta = await loadEnabledBrandSlugs(date);
  const exclusions = await loadProductExclusions(date);
  if (exclusions.excluded.size > 0) {
    const sources = exclusions.sourcePaths.map(p => path.relative(process.cwd(), p)).join(', ');
    logger.info(`Loaded ${exclusions.excluded.size} excluded shopifyId(s) from: ${sources}`);
  }

  // Get all raw brand files
  const rawFilesAll = await getRawFiles(date);
  const envFilter = parseBrandFilterFromEnv();
  if (envFilter && envFilter.size > 0) {
    logger.info(`Brand filter: ${describeBrandFilter(envFilter)}`);
  }

  const rawFiles = rawFilesAll
    .filter((file) => (enabledBrandsMeta ? enabledBrandsMeta.enabled.has(file.replace('.json', '')) : true))
    .filter((file) => (envFilter ? envFilter.has(file.replace('.json', '')) : true));

  if (enabledBrandsMeta) {
    const ignored = rawFilesAll.length - rawFiles.length;
    if (ignored > 0) {
      logger.warn(
        `Ignoring ${ignored} raw brand file(s) because scrapingEnabled=false (${path.relative(process.cwd(), enabledBrandsMeta.sourcePath)})`
      );
    }
  }

  logger.info(`Found ${rawFiles.length} brand files to process`);

  if (rawFiles.length === 0) {
    logger.warn('No raw data files found. Run npm run fetch first.');
    process.exit(0);
  }

  // Process each brand
  const results = [];
  for (let i = 0; i < rawFiles.length; i++) {
    const file = rawFiles[i];
    const brandSlug = file.replace('.json', '');

    logger.info(`\n[${i + 1}/${rawFiles.length}] Processing: ${brandSlug}`);

    const result = await normalizeBrand(brandSlug, date, exclusions.excluded);
    results.push(result);
  }

  // Save normalized data
  logger.info('\nSaving normalized data...');
  await saveNormalizedData(date, results);

  // Generate summary
  const summary = await generateSummary(date, results);

  // Generate series assignments summary
  await generateSeriesAssignmentsSummary(date, results);

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);

  logger.info('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  logger.info('NORMALIZATION SUMMARY');
  logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  logger.success(`Total brands: ${summary.totalBrands}`);
  logger.success(`Total products processed: ${summary.totalProducts}`);
  logger.success(`Valid products: ${summary.validProducts}`);
  if (summary.discardedProducts > 0) {
    logger.warn(`Discarded products (product_type filter): ${summary.discardedProducts}`);
  }
  if (summary.excludedProducts > 0) {
    logger.warn(`Excluded products (exclusions list): ${summary.excludedProducts}`);
  }
  if (summary.excludedByRules > 0) {
    logger.warn(`Excluded products (pipeline rules): ${summary.excludedByRules}`);
  }
  if (summary.invalidProducts > 0) {
    logger.warn(`Invalid products: ${summary.invalidProducts}`);
  }
  logger.info(`Duration: ${duration}s`);
  logger.info(`Date: ${date}`);

  if (summary.invalidProducts > 0) {
    logger.warn('\nBrands with invalid products:');
    summary.brands
      .filter(b => b.invalidProducts > 0)
      .forEach(b => {
        logger.warn(`  ${b.brandSlug}: ${b.invalidProducts} invalid`);
        b.errors.forEach(e => {
          logger.error(`    - ${e.productName}: ${e.errors.join(', ')}`);
        });
      });
  }

  if (summary.discardedProducts > 0) {
    logger.warn('\nBrands with discarded products (product_type filter):');
    summary.brands
      .filter(b => b.discardedProducts > 0)
      .forEach(b => {
        const topTypes = b.discardedProductTypes.slice(0, 5);
        const suffix = b.discardedProductTypes.length > 5 ? ` (+${b.discardedProductTypes.length - 5} more types)` : '';
        logger.warn(`  ${b.brandSlug}: ${b.discardedProducts} discarded`);
        for (const item of topTypes) {
          logger.info(`    - ${item.count} × ${item.productType || '(empty)'}`);
        }
        if (suffix) logger.info(`    ${suffix}`);
      });
  }

  if (summary.excludedProducts > 0) {
    logger.warn('\nBrands with excluded products (exclusions list):');
    summary.brands
      .filter(b => (b.excludedProducts ?? 0) > 0)
      .forEach(b => {
        logger.warn(`  ${b.brandSlug}: ${b.excludedProducts} excluded`);
      });
  }

  if (summary.excludedByRules > 0) {
    logger.warn('\nBrands with excluded products (pipeline rules):');
    summary.brands
      .filter(b => (b.excludedByRules ?? 0) > 0)
      .forEach(b => {
        logger.warn(`  ${b.brandSlug}: ${b.excludedByRules} excluded`);
        for (const item of b.excludedRules.slice(0, 5)) {
          logger.info(`    - ${item.count} × ${item.reason}`);
        }
        if (b.excludedRules.length > 5) {
          logger.info(`    ... and ${b.excludedRules.length - 5} more reason(s)`);
        }
      });
  }

  if (summary.productsWithMeasurementWarnings > 0) {
    logger.warn(`\nProducts with suspicious measurements: ${summary.productsWithMeasurementWarnings}`);
    summary.brands
      .filter(b => b.measurementWarnings.length > 0)
      .forEach(b => {
        logger.warn(`  ${b.brandSlug}: ${b.measurementWarnings.length} product(s)`);
        b.measurementWarnings.slice(0, 3).forEach(mw => {
          const details = mw.warnings.map(w => {
            const expected = w.issue === 'too_low'
              ? `min=${w.threshold.min}${w.threshold.unit}`
              : `max=${w.threshold.max}${w.threshold.unit}`;
            return `${w.field}=${w.value}${w.threshold.unit} (${expected})`;
          }).join(', ');
          logger.warn(`    - ${mw.slug}: ${details}`);
        });
        if (b.measurementWarnings.length > 3) {
          logger.info(`    ... and ${b.measurementWarnings.length - 3} more`);
        }
      });
  }

  logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  logger.info('Next step: Run npm run aggregate to combine all brands');
}

main().catch((error) => {
  logger.error('Fatal error in normalization', error instanceof Error ? error.message : error);
  if (error instanceof Error && error.stack) {
    console.error(error.stack);
  }
  process.exit(1);
});
