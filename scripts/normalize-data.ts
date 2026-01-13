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
  brands: Array<{
    brandSlug: string;
    totalProducts: number;
    validProducts: number;
    invalidProducts: number;
    errors: Array<{
      productName: string;
      errors: string[];
    }>;
  }>;
}

async function ensureNormalizedDirectory(date: string) {
  const normalizedDir = path.join(process.cwd(), 'data', 'normalized', date);
  await fs.mkdir(normalizedDir, { recursive: true });
  logger.info(`Created normalized directory: ${normalizedDir}`);
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

  for (const shopifyProduct of shopifyData.products) {
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

  return {
    brandSlug,
    products: normalizedProducts,
    validProducts: validCount,
    invalidProducts: invalidCount,
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
    products: NormalizedYogaMat[];
    errors: Array<{ productName: string; errors: string[] }>;
  }>
): Promise<NormalizationSummary> {
  const summary: NormalizationSummary = {
    date,
    totalBrands: results.length,
    totalProducts: results.reduce((sum, r) => sum + r.validProducts + r.invalidProducts, 0),
    validProducts: results.reduce((sum, r) => sum + r.validProducts, 0),
    invalidProducts: results.reduce((sum, r) => sum + r.invalidProducts, 0),
    brands: results.map(r => ({
      brandSlug: r.brandSlug,
      totalProducts: r.validProducts + r.invalidProducts,
      validProducts: r.validProducts,
      invalidProducts: r.invalidProducts,
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

  // Get all raw brand files
  const rawFiles = await getRawFiles(date);
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

  logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  logger.info('Next step: Run npm run aggregate to combine all brands');
}

main().catch((error) => {
  logger.error('Fatal error in normalization', error);
  process.exit(1);
});
