import { promises as fs } from 'fs';
import path from 'path';
import { logger } from './lib/logger.js';
import type { NormalizedYogaMat } from './lib/field-mapper.js';

type BrandsMetadata = Array<{
  slug: string;
  scrapingEnabled?: boolean;
}>;

interface AggregationSummary {
  date: string;
  totalBrands: number;
  totalProducts: number;
  uniqueSlugs: number;
  duplicateSlugs: number;
  brands: Array<{
    brandSlug: string;
    productCount: number;
  }>;
  priceStats: {
    min: number;
    max: number;
    average: number;
    median: number;
  };
  materialBreakdown: Record<string, number>;
  featureBreakdown: Record<string, number>;
}

async function ensureAggregatedDirectory(date: string) {
  const aggregatedDir = path.join(process.cwd(), 'data', 'aggregated', date);
  await fs.mkdir(aggregatedDir, { recursive: true });
  logger.info(`Created aggregated directory: ${aggregatedDir}`);
}

async function getNormalizedFiles(date: string): Promise<string[]> {
  const normalizedDir = path.join(process.cwd(), 'data', 'normalized', date);

  try {
    const files = await fs.readdir(normalizedDir);
    // Filter out summary file and only get JSON files
    return files.filter(f => f.endsWith('.json') && !f.startsWith('_'));
  } catch (error) {
    throw new Error(`Failed to read normalized data directory: ${normalizedDir}`);
  }
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

async function loadNormalizedData(date: string): Promise<NormalizedYogaMat[]> {
  const enabledBrandsMeta = await loadEnabledBrandSlugs(date);
  const filesAll = await getNormalizedFiles(date);
  const files = enabledBrandsMeta
    ? filesAll.filter((file) => enabledBrandsMeta.enabled.has(file.replace('.json', '')))
    : filesAll;

  if (enabledBrandsMeta) {
    const ignored = filesAll.length - files.length;
    if (ignored > 0) {
      logger.warn(
        `Ignoring ${ignored} normalized brand file(s) because scrapingEnabled=false (${path.relative(process.cwd(), enabledBrandsMeta.sourcePath)})`
      );
    }
  }

  const allProducts: NormalizedYogaMat[] = [];

  for (const file of files) {
    const brandSlug = file.replace('.json', '');
    const filepath = path.join(process.cwd(), 'data', 'normalized', date, file);
    const data = await fs.readFile(filepath, 'utf-8');
    const products: NormalizedYogaMat[] = JSON.parse(data);

    logger.info(`Loaded ${products.length} products from ${brandSlug}`);
    allProducts.push(...products);
  }

  return allProducts;
}

/**
 * Ensures all slugs are unique by appending -2, -3, etc. to duplicates
 */
function ensureUniqueSlugs(products: NormalizedYogaMat[]): {
  products: NormalizedYogaMat[];
  duplicateCount: number;
} {
  const slugCounts = new Map<string, number>();
  const result: NormalizedYogaMat[] = [];
  let duplicateCount = 0;

  for (const product of products) {
    let slug = product.slug;
    const count = slugCounts.get(slug) || 0;

    if (count > 0) {
      // Slug collision - append counter
      slug = `${slug}-${count + 1}`;
      duplicateCount++;
      logger.warn(`Duplicate slug detected: ${product.slug} → ${slug}`);
    }

    slugCounts.set(product.slug, count + 1);

    result.push({
      ...product,
      slug,
    });
  }

  return { products: result, duplicateCount };
}

/**
 * Calculate statistics
 */
function calculateStats(products: NormalizedYogaMat[]): {
  priceStats: AggregationSummary['priceStats'];
  materialBreakdown: Record<string, number>;
  featureBreakdown: Record<string, number>;
  brandCounts: Record<string, number>;
} {
  // Price stats - use minPrice, filter out invalid prices (null, undefined, NaN)
  const validPrices = products
    .map(p => p.minPrice)
    .filter(p => p != null && !isNaN(p) && isFinite(p))
    .sort((a, b) => a - b);

  const priceStats = validPrices.length > 0 ? {
    min: Math.min(...validPrices),
    max: Math.max(...validPrices),
    average: validPrices.reduce((sum, p) => sum + p, 0) / validPrices.length,
    median: validPrices[Math.floor(validPrices.length / 2)],
  } : {
    min: 0,
    max: 0,
    average: 0,
    median: 0,
  };

  // Material breakdown
  const materialBreakdown: Record<string, number> = {};
  products.forEach(p => {
    if (p.material) {
      materialBreakdown[p.material] = (materialBreakdown[p.material] || 0) + 1;
    }
  });

  // Feature breakdown
  const featureBreakdown: Record<string, number> = {};
  products.forEach(p => {
    if (p.features) {
      p.features.forEach(feature => {
        featureBreakdown[feature] = (featureBreakdown[feature] || 0) + 1;
      });
    }
  });

  // Brand counts
  const brandCounts: Record<string, number> = {};
  products.forEach(p => {
    brandCounts[p.brandSlug] = (brandCounts[p.brandSlug] || 0) + 1;
  });

  return {
    priceStats,
    materialBreakdown,
    featureBreakdown,
    brandCounts,
  };
}

/**
 * Save aggregated data in multiple formats
 */
async function saveAggregatedData(
  date: string,
  products: NormalizedYogaMat[],
  stats: ReturnType<typeof calculateStats>
): Promise<void> {
  const aggregatedDir = path.join(process.cwd(), 'data', 'aggregated', date);

  // 1. Save all-products.json (main file with full NormalizedYogaMat objects)
  // This preserves ALL fields including structured measurements, arrays, etc.
  const allProductsPath = path.join(aggregatedDir, 'all-products.json');
  await fs.writeFile(allProductsPath, JSON.stringify(products, null, 2), 'utf-8');
  logger.success(`Saved ${products.length} products to all-products.json`);

  // 2. Save brands-index.json (brand metadata)
  const brandsIndex = Object.entries(stats.brandCounts).map(([slug, count]) => ({
    slug,
    productCount: count,
  }));
  const brandsIndexPath = path.join(aggregatedDir, 'brands-index.json');
  await fs.writeFile(brandsIndexPath, JSON.stringify(brandsIndex, null, 2), 'utf-8');
  logger.success(`Saved brands index with ${brandsIndex.length} brands`);

  // 3. Save stats.json (statistics)
  const statsPath = path.join(aggregatedDir, 'stats.json');
  await fs.writeFile(
    statsPath,
    JSON.stringify(
      {
        date,
        totalProducts: products.length,
        totalBrands: brandsIndex.length,
        priceStats: stats.priceStats,
        materialBreakdown: stats.materialBreakdown,
        featureBreakdown: stats.featureBreakdown,
      },
      null,
      2
    ),
    'utf-8'
  );
  logger.success('Saved statistics');

  // 4. Save all-products.csv (CSV export for spreadsheets)
  const csvHeader = [
    'slug',
    'name',
    'brandSlug',
    'description',
    'minPrice',
    'maxPrice',
    'priceCurrency',
    'thicknessValue',
    'thicknessUnit',
    'thicknessOriginal',
    'lengthValue',
    'lengthUnit',
    'lengthOriginal',
    'widthValue',
    'widthUnit',
    'widthOriginal',
    'weightValue',
    'weightUnit',
    'weightOriginal',
    'material',
    'texture',
    'features',
    'availableColors',
    'variantsCount',
    'isAvailable',
    'shopifyId',
    'shopifyHandle',
    'shopifyVendor',
    'shopifyProductType',
    'shopifyTags',
    'shopifyCreatedAt',
    'shopifyPublishedAt',
    'primaryImageUrl',
  ].join(',');

  const csvRows = products.map(p => {
    // Helper to escape CSV values
    const escapeCSV = (val: any) => {
      if (val == null) return '';
      const str = String(val);
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    return [
      escapeCSV(p.slug),
      escapeCSV(p.name),
      escapeCSV(p.brandSlug),
      escapeCSV(p.description),
      p.minPrice ?? '',
      p.maxPrice ?? '',
      p.priceCurrency || 'USD',
      p.thickness?.value ?? '',
      p.thickness?.unit ?? '',
      escapeCSV(p.thickness?.originalText),
      p.length?.value ?? '',
      p.length?.unit ?? '',
      escapeCSV(p.length?.originalText),
      p.width?.value ?? '',
      p.width?.unit ?? '',
      escapeCSV(p.width?.originalText),
      p.weight?.value ?? '',
      p.weight?.unit ?? '',
      escapeCSV(p.weight?.originalText),
      escapeCSV(p.material),
      escapeCSV(p.texture),
      escapeCSV(p.features?.join('; ')),
      escapeCSV(p.availableColors?.join('; ')),
      p.variantsCount,
      p.isAvailable ?? '',
      p.shopifyId,
      escapeCSV(p.shopifyHandle),
      escapeCSV(p.shopifyVendor),
      escapeCSV(p.shopifyProductType),
      escapeCSV(p.shopifyTags.join('; ')),
      escapeCSV(p.shopifyCreatedAt),
      escapeCSV(p.shopifyPublishedAt),
      escapeCSV(p.images?.[0]?.src),
    ].join(',');
  });

  const csv = [csvHeader, ...csvRows].join('\n');
  const csvPath = path.join(aggregatedDir, 'all-products.csv');
  await fs.writeFile(csvPath, csv, 'utf-8');
  logger.success('Saved CSV export');
}

/**
 * Generate summary
 */
async function generateSummary(
  date: string,
  products: NormalizedYogaMat[],
  duplicateCount: number,
  stats: ReturnType<typeof calculateStats>
): Promise<AggregationSummary> {
  const summary: AggregationSummary = {
    date,
    totalBrands: Object.keys(stats.brandCounts).length,
    totalProducts: products.length,
    uniqueSlugs: products.length,
    duplicateSlugs: duplicateCount,
    brands: Object.entries(stats.brandCounts).map(([brandSlug, productCount]) => ({
      brandSlug,
      productCount,
    })),
    priceStats: stats.priceStats,
    materialBreakdown: stats.materialBreakdown,
    featureBreakdown: stats.featureBreakdown,
  };

  // Save summary
  const summaryPath = path.join(
    process.cwd(),
    'data',
    'aggregated',
    date,
    '_summary.json'
  );
  await fs.writeFile(summaryPath, JSON.stringify(summary, null, 2), 'utf-8');

  return summary;
}

async function main() {
  logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  logger.info('YogaMatLab Data Pipeline - Aggregate Data');
  logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const startTime = Date.now();

  // Use today's date or accept date argument
  const date = process.argv[2] || new Date().toISOString().split('T')[0];
  logger.info(`Processing date: ${date}`);

  // Ensure aggregated directory exists
  await ensureAggregatedDirectory(date);

  // Load all normalized data
  logger.info('Loading normalized data...');
  let allProducts = await loadNormalizedData(date);
  logger.success(`Loaded ${allProducts.length} total products`);

  if (allProducts.length === 0) {
    logger.warn('No normalized data found. Run npm run normalize first.');
    process.exit(0);
  }

  // Ensure unique slugs
  logger.info('Ensuring unique slugs...');
  const { products, duplicateCount } = ensureUniqueSlugs(allProducts);
  if (duplicateCount > 0) {
    logger.warn(`Resolved ${duplicateCount} duplicate slugs`);
  }

  // Calculate statistics
  logger.info('Calculating statistics...');
  const stats = calculateStats(products);

  // Save aggregated data
  logger.info('Saving aggregated data...');
  await saveAggregatedData(date, products, stats);

  // Generate summary
  const summary = await generateSummary(date, products, duplicateCount, stats);

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);

  logger.info('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  logger.info('AGGREGATION SUMMARY');
  logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  logger.success(`Total brands: ${summary.totalBrands}`);
  logger.success(`Total products: ${summary.totalProducts}`);
  logger.success(`Unique slugs: ${summary.uniqueSlugs}`);
  if (summary.duplicateSlugs > 0) {
    logger.warn(`Duplicate slugs resolved: ${summary.duplicateSlugs}`);
  }

  logger.info('\nPrice Statistics:');
  logger.info(`  Min: $${summary.priceStats.min.toFixed(2)}`);
  logger.info(`  Max: $${summary.priceStats.max.toFixed(2)}`);
  logger.info(`  Average: $${summary.priceStats.average.toFixed(2)}`);
  logger.info(`  Median: $${summary.priceStats.median.toFixed(2)}`);

  logger.info('\nTop Materials:');
  Object.entries(summary.materialBreakdown)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .forEach(([material, count]) => {
      logger.info(`  ${material}: ${count}`);
    });

  logger.info('\nTop Features:');
  Object.entries(summary.featureBreakdown)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .forEach(([feature, count]) => {
      logger.info(`  ${feature}: ${count}`);
    });

  logger.info(`\nDuration: ${duration}s`);
  logger.info(`Date: ${date}`);

  logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  logger.info('Next step: Run npm run detect-changes to identify changes from previous day');
}

main().catch((error) => {
  logger.error('Fatal error in aggregation', error);
  process.exit(1);
});
