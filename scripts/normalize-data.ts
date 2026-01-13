import { promises as fs } from 'fs';
import path from 'path';
import { logger } from './lib/logger.js';
import type { ShopifyProductsResponse } from './lib/fetch-products-json.js';
import { mapShopifyToYogaMat, validateNormalizedMat, type NormalizedYogaMat } from './lib/field-mapper.js';
import { indexCoreFeatures, type BrandEnrichmentOutput } from './lib/product-page-enricher.js';

interface NormalizationSummary {
  date: string;
  totalBrands: number;
  totalProducts: number;
  validProducts: number;
  invalidProducts: number;
  discardedProducts: number;
  brands: Array<{
    brandSlug: string;
    totalProducts: number;
    validProducts: number;
    invalidProducts: number;
    discardedProducts: number;
    discardedProductTypes: Array<{ productType: string; count: number }>;
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

function includesMatHint(text: string): boolean {
  const normalized = text.toLowerCase();
  if (/\bmat(s)?\b/i.test(normalized)) return true;
  // Also match "yogamat" without whitespace (rare but seen in some systems).
  const compact = normalized.replace(/\s+/g, '');
  return /\byogamat(s)?\b/i.test(compact);
}

function shouldDiscardByProductType(params: { productType: string; title: string; tags: string[] }): boolean {
  const productType = params.productType.trim();
  if (!productType) return false; // Empty types are ambiguous; keep.

  // Priority: if product_type itself suggests "mat", keep.
  if (includesMatHint(productType)) return false;

  // Fallback: some stores use bespoke product_type values (e.g. "Harmony") for mats.
  // If title/tags still clearly indicate mats, keep.
  if (includesMatHint(params.title)) return false;
  if (includesMatHint(params.tags.join(' '))) return false;

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
    throw new Error(`Failed to read raw data directory: ${rawDir}`);
  }
}

async function normalizeBrand(
  brandSlug: string,
  date: string
): Promise<{
  brandSlug: string;
  products: NormalizedYogaMat[];
  validProducts: number;
  invalidProducts: number;
  discardedProducts: number;
  discardedProductTypes: Array<{ productType: string; count: number }>;
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
  let validCount = 0;
  let invalidCount = 0;
  let discardedCount = 0;
  const discardedTypeCounts = new Map<string, number>();

  for (const shopifyProduct of shopifyData.products) {
    if (shouldDiscardByProductType({
      productType: shopifyProduct.product_type ?? '',
      title: shopifyProduct.title ?? '',
      tags: Array.isArray(shopifyProduct.tags) ? shopifyProduct.tags : [],
    })) {
      discardedCount++;
      const type = (shopifyProduct.product_type ?? '').trim();
      discardedTypeCounts.set(type, (discardedTypeCounts.get(type) ?? 0) + 1);
      continue;
    }

    try {
      // Map to normalized format
      const enrichment = coreFeaturesIndex?.get(shopifyProduct.handle);
      const appendText = appendTextIndex?.get(shopifyProduct.handle);
      const sections = sectionsIndex?.get(shopifyProduct.handle);
      const normalized = mapShopifyToYogaMat(
        shopifyProduct,
        brandSlug,
        (enrichment || appendText)
          ? { coreFeatures: enrichment, appendText, productPageSections: sections }
          : undefined
      );

      // Validate
      const validation = validateNormalizedMat(normalized);

      if (validation.valid) {
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

  return {
    brandSlug,
    products: normalizedProducts,
    validProducts: validCount,
    invalidProducts: invalidCount,
    discardedProducts: discardedCount,
    discardedProductTypes: Array.from(discardedTypeCounts.entries())
      .map(([productType, count]) => ({ productType, count }))
      .sort((a, b) => b.count - a.count || a.productType.localeCompare(b.productType)),
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
    discardedProductTypes: Array<{ productType: string; count: number }>;
    products: NormalizedYogaMat[];
    errors: Array<{ productName: string; errors: string[] }>;
  }>
): Promise<NormalizationSummary> {
  const summary: NormalizationSummary = {
    date,
    totalBrands: results.length,
    totalProducts: results.reduce((sum, r) => sum + r.validProducts + r.invalidProducts + r.discardedProducts, 0),
    validProducts: results.reduce((sum, r) => sum + r.validProducts, 0),
    invalidProducts: results.reduce((sum, r) => sum + r.invalidProducts, 0),
    discardedProducts: results.reduce((sum, r) => sum + r.discardedProducts, 0),
    brands: results.map(r => ({
      brandSlug: r.brandSlug,
      totalProducts: r.validProducts + r.invalidProducts + r.discardedProducts,
      validProducts: r.validProducts,
      invalidProducts: r.invalidProducts,
      discardedProducts: r.discardedProducts,
      discardedProductTypes: r.discardedProductTypes,
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

async function main() {
  logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  logger.info('YogaMatLab Data Pipeline - Normalize Data');
  logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const startTime = Date.now();

  // Use today's date or accept date argument
  const date = process.argv[2] || new Date().toISOString().split('T')[0];
  logger.info(`Processing date: ${date}`);

  // Ensure normalized directory exists
  await ensureNormalizedDirectory(date);

  // If fetch saved brands metadata, use it to avoid normalizing disabled brands even if raw files exist.
  const enabledBrandsMeta = await loadEnabledBrandSlugs(date);

  // Get all raw brand files
  const rawFilesAll = await getRawFiles(date);
  const rawFiles = enabledBrandsMeta
    ? rawFilesAll.filter((file) => enabledBrandsMeta.enabled.has(file.replace('.json', '')))
    : rawFilesAll;

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

    const result = await normalizeBrand(brandSlug, date);
    results.push(result);
  }

  // Save normalized data
  logger.info('\nSaving normalized data...');
  await saveNormalizedData(date, results);

  // Generate summary
  const summary = await generateSummary(date, results);

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

  logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  logger.info('Next step: Run npm run aggregate to combine all brands');
}

main().catch((error) => {
  logger.error('Fatal error in normalization', error);
  process.exit(1);
});
