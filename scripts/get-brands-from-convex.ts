import 'dotenv/config';
import { ConvexHttpClient } from 'convex/browser';
import { promises as fs } from 'fs';
import path from 'path';
import { logger } from './lib/logger.js';
import {
  fetchAllProducts,
  type ShopifyProduct,
  type FetchResult,
} from './lib/fetch-products-json.js';
import {
  fetchLululemonProducts,
  type LululemonFetchResult,
} from './lib/lululemon-scraper.js';
import {
  fetchBigCommerceProducts,
  type BigCommerceFetchResult,
} from './lib/bigcommerce-scraper.js';
import {
  checkDataChanged,
  updateHashRecord,
} from './lib/hash-tracker.js';

interface Brand {
  _id: string;
  name: string;
  slug: string;
  website: string;
  scrapingEnabled: boolean;
  productsJsonUrl: string | null;
  isShopify: boolean;
  platform?: 'shopify' | 'lululemon' | 'bigcommerce' | 'custom'; // Platform type for custom scrapers
  platformConfig?: {
    lululemonCategoryId?: string; // For Lululemon GraphQL
    bigcommerceCollectionUrl?: string; // For BigCommerce
  };
  rateLimit?: {
    delayBetweenProducts: number;
    delayBetweenPages: number;
  };
}

interface ExtractionResult {
  brand: Brand;
  products: ShopifyProduct[];
  success: boolean;
  error?: string;
  totalPages: number;
  dataChanged?: boolean; // Whether data hash changed since last fetch
  usedFallback?: boolean; // Whether manual fallback was used
}

interface ExtractionSummary {
  date: string;
  totalBrands: number;
  successfulBrands: number;
  failedBrands: number;
  totalProducts: number;
  results: Array<{
    brandName: string;
    brandSlug: string;
    success: boolean;
    productCount: number;
    totalPages: number;
    error?: string;
  }>;
}

async function ensureDataDirectories(date: string) {
  const rawDir = path.join(process.cwd(), 'data', 'raw', date);
  await fs.mkdir(rawDir, { recursive: true });
  logger.info(`Created data directory: ${rawDir}`);
}

async function fetchBrandProducts(brand: Brand): Promise<ExtractionResult> {
  try {
    logger.brandStart(brand.name);

    // Determine platform and route to appropriate scraper
    const platform = brand.platform || (brand.isShopify ? 'shopify' : 'custom');
    logger.info(`Platform: ${platform}`);

    let allProducts: ShopifyProduct[] = [];
    let totalPages = 0;
    let allErrors: string[] = [];

    // Get rate limits or use defaults
    // Alo Yoga requires longer delays to avoid 403 blocking
    const rateLimit = brand.rateLimit || {
      delayBetweenProducts: 500,
      delayBetweenPages: brand.slug === 'alo-yoga' ? 3000 : 1000,
    };

    // Route to appropriate scraper based on platform
    if (platform === 'lululemon') {
      // Lululemon GraphQL scraper
      const categoryId = brand.platformConfig?.lululemonCategoryId || '8s6'; // Default: yoga accessories
      logger.info(`  Fetching from Lululemon GraphQL (categoryId: ${categoryId})`);

      const result: LululemonFetchResult = await fetchLululemonProducts(categoryId, {
        maxPages: 10,
        pageSize: 60,
        delayBetweenPages: rateLimit.delayBetweenPages,
        onPageFetched: (page, count, total) => {
          logger.info(`    Page ${page}: Found ${count} products (${total} total)`);
        },
      });

      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch from Lululemon');
      }

      allProducts = result.products;
      totalPages = Math.ceil(result.totalProducts / 60);
      logger.info(`    ✓ Fetched ${result.products.length} products`);

    } else if (platform === 'bigcommerce') {
      // BigCommerce Playwright scraper
      const collectionUrl = brand.platformConfig?.bigcommerceCollectionUrl || brand.productsJsonUrl;

      if (!collectionUrl) {
        throw new Error('No collection URL configured for BigCommerce brand');
      }

      logger.info(`  Fetching from BigCommerce (${collectionUrl})`);

      const result: BigCommerceFetchResult = await fetchBigCommerceProducts(collectionUrl, {
        maxProducts: 100,
        headless: true,
        delayBetweenProducts: rateLimit.delayBetweenProducts,
        onProductFetched: (current, total) => {
          logger.info(`    Product ${current}/${total}`);
        },
      });

      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch from BigCommerce');
      }

      allProducts = result.products;
      totalPages = 1; // BigCommerce scraper doesn't have pagination concept
      logger.info(`    ✓ Fetched ${result.products.length} products`);

    } else if (platform === 'shopify' || brand.isShopify) {
      // Shopify products.json scraper (standard)
      if (!brand.productsJsonUrl) {
        throw new Error('No productsJsonUrl configured for this brand');
      }

      // Parse pipe-delimited URLs for brands with multiple collections
      const urls = brand.productsJsonUrl
        .split('|')
        .map(url => url.trim())
        .filter(url => url.length > 0);

      logger.info(`Found ${urls.length} collection(s) to fetch`);

      // Fetch from each collection URL
      for (let i = 0; i < urls.length; i++) {
        const fullUrl = urls[i];

        try {
          // Extract base URL and collection path
          const url = new URL(fullUrl);
          const baseUrl = `${url.protocol}//${url.host}`;
          const collectionPath = url.pathname.replace('/products.json', '');

          logger.info(`  [${i + 1}/${urls.length}] Fetching: ${baseUrl}${collectionPath}/products.json`);

          // Fetch all products with pagination
          const result: FetchResult = await fetchAllProducts(
            baseUrl,
            collectionPath,
            {
              maxPages: 50,
              delayBetweenPages: rateLimit.delayBetweenPages,
              onPageFetched: (page, count) => {
                logger.info(`    Page ${page}: Found ${count} products`);
              },
            }
          );

          if (!result.success) {
            allErrors.push(`Collection ${i + 1}: ${result.error || 'Failed to fetch'}`);
            logger.warn(`    ⚠ Failed to fetch collection ${i + 1}: ${result.error}`);
          } else {
            allProducts.push(...result.products);
            totalPages += result.totalPages;
            logger.info(`    ✓ Fetched ${result.products.length} products from collection ${i + 1}`);
          }

          // Delay between collections to be polite
          if (i < urls.length - 1) {
            await new Promise((resolve) => setTimeout(resolve, rateLimit.delayBetweenPages));
          }
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : 'Unknown error';
          allErrors.push(`Collection ${i + 1}: ${errorMsg}`);
          logger.warn(`    ⚠ Error fetching collection ${i + 1}: ${errorMsg}`);
        }
      }
    } else {
      throw new Error(`Unsupported platform: ${platform}`);
    }

    // Deduplicate products by ID (same product might be in multiple collections)
    const uniqueProducts = Array.from(
      new Map(allProducts.map(p => [p.id, p])).values()
    );

    if (uniqueProducts.length < allProducts.length) {
      logger.info(`  ℹ Removed ${allProducts.length - uniqueProducts.length} duplicate(s)`);
    }

    if (uniqueProducts.length === 0 && allErrors.length > 0) {
      throw new Error(`All collections failed: ${allErrors.join('; ')}`);
    }

    // Check if data has changed using hash tracking
    const dataCheck = await checkDataChanged(brand.slug, uniqueProducts);
    const dataChanged = dataCheck.changed;

    if (dataChanged) {
      logger.info(`  ✓ Data changed (${dataCheck.reason})`);
    } else {
      logger.info(`  ℹ No changes detected`);
    }

    // Update hash record
    await updateHashRecord(
      brand.slug,
      uniqueProducts,
      uniqueProducts.length,
      dataChanged
    );

    logger.brandComplete(brand.name, uniqueProducts.length);

    return {
      brand,
      products: uniqueProducts,
      success: true,
      totalPages: totalPages,
      dataChanged,
      error: allErrors.length > 0 ? `Partial success: ${allErrors.join('; ')}` : undefined,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    logger.brandError(brand.name, error as Error);

    return {
      brand,
      products: [],
      success: false,
      error: errorMessage,
      totalPages: 0,
    };
  }
}

async function saveResults(
  date: string,
  results: ExtractionResult[]
): Promise<void> {
  for (const result of results) {
    const filename = `${result.brand.slug}.json`;
    const filepath = path.join(process.cwd(), 'data', 'raw', date, filename);

    if (result.products.length === 0 && !result.success) {
      // Check if there's a manual/fallback file we can use
      const fallbackPath = path.join(process.cwd(), 'data', 'raw', 'manual', filename);

      try {
        await fs.access(fallbackPath);
        // Fallback file exists, copy it to today's date
        await fs.copyFile(fallbackPath, filepath);
        logger.success(`📋 Used manual fallback for ${result.brand.slug} (live fetch failed, but fallback available)`);

        // Mark this result as successful with fallback
        result.success = true;
        result.usedFallback = true;

        // Load the fallback data to get product count
        const fallbackData = JSON.parse(await fs.readFile(fallbackPath, 'utf-8'));
        result.products = fallbackData.products || [];

        continue;
      } catch {
        // No fallback file, skip this brand
        logger.warn(`⚠️  No data for ${result.brand.slug} and no manual fallback found`);
        continue;
      }
    }

    // Save as Shopify format for normalization later
    const shopifyFormat = {
      products: result.products,
    };

    await fs.writeFile(
      filepath,
      JSON.stringify(shopifyFormat, null, 2),
      'utf-8'
    );

    logger.info(`Saved ${result.products.length} products to ${filename}`);
  }
}

async function generateSummary(
  date: string,
  results: ExtractionResult[]
): Promise<ExtractionSummary> {
  const summary: ExtractionSummary = {
    date,
    totalBrands: results.length,
    successfulBrands: results.filter((r) => r.success).length,
    failedBrands: results.filter((r) => !r.success).length,
    totalProducts: results.reduce((sum, r) => sum + r.products.length, 0),
    results: results.map((r) => ({
      brandName: r.brand.name,
      brandSlug: r.brand.slug,
      success: r.success,
      productCount: r.products.length,
      totalPages: r.totalPages,
      error: r.error,
    })),
  };

  // Save summary to file
  const summaryPath = path.join(
    process.cwd(),
    'data',
    'raw',
    date,
    '_summary.json'
  );
  await fs.writeFile(summaryPath, JSON.stringify(summary, null, 2), 'utf-8');

  return summary;
}

async function main() {
  logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  logger.info('YogaMatLab Data Pipeline - Fetch Products from Brands');
  logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const startTime = Date.now();
  const date = new Date().toISOString().split('T')[0];

  // Check for CONVEX_URL
  const convexUrl = process.env.CONVEX_URL;
  if (!convexUrl) {
    logger.error('CONVEX_URL environment variable is not set');
    logger.info('Please set CONVEX_URL in your .env file');
    process.exit(1);
  }

  // Initialize Convex client
  logger.info('Connecting to Convex...');
  const client = new ConvexHttpClient(convexUrl);

  // Query brands from Convex
  logger.info('Fetching scrapable brands from Convex...');
  let brands: Brand[];
  try {
    // Note: This assumes api.brands.getScrapableBrands exists in YogaMatLabApp
    brands = await client.query('brands:getScrapableBrands' as any);
    logger.success(`Found ${brands.length} enabled brands`);
  } catch (error) {
    logger.error('Failed to fetch brands from Convex', error);
    logger.info(
      'Make sure api.brands.getScrapableBrands query exists in YogaMatLabApp'
    );
    process.exit(1);
  }

  if (brands.length === 0) {
    logger.warn('No brands enabled for scraping');
    process.exit(0);
  }

  // Ensure data directories exist
  await ensureDataDirectories(date);

  // Fetch products from each brand sequentially
  const results: ExtractionResult[] = [];

  for (let i = 0; i < brands.length; i++) {
    const brand = brands[i];
    logger.info(`\n[${i + 1}/${brands.length}] Processing: ${brand.name}`);

    const result = await fetchBrandProducts(brand);
    results.push(result);

    // Delay between brands for politeness (1-2 seconds for weekly runs)
    if (i < brands.length - 1) {
      const delay = 1000 + Math.random() * 1000; // Random 1-2 seconds
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  // Save all results
  logger.info('\nSaving results...');
  await saveResults(date, results);

  // Generate and display summary
  const summary = await generateSummary(date, results);

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);

  logger.info('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  logger.info('EXTRACTION SUMMARY');
  logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  logger.success(`Total brands processed: ${summary.totalBrands}`);
  logger.success(`Successful: ${summary.successfulBrands}`);

  // Show fallback brands separately
  const fallbackBrands = results.filter((r) => r.usedFallback);
  if (fallbackBrands.length > 0) {
    logger.info(`Used manual fallback: ${fallbackBrands.length}`);
  }

  if (summary.failedBrands > 0) {
    logger.error(`Failed: ${summary.failedBrands}`);
  }
  logger.success(`Total products extracted: ${summary.totalProducts}`);
  logger.info(`Duration: ${duration}s`);
  logger.info(`Date: ${date}`);

  // Show fallback brands
  if (fallbackBrands.length > 0) {
    logger.info('\nBrands using manual fallback:');
    fallbackBrands.forEach((r) => {
      logger.info(`  ✓ ${r.brand.name}: ${r.products.length} products (fallback)`);
    });
  }

  if (summary.failedBrands > 0) {
    logger.warn('\nFailed brands:');
    summary.results
      .filter((r) => !r.success)
      .forEach((r) => {
        logger.error(`  - ${r.brandName}: ${r.error}`);
      });
  }

  logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Exit with error only if no products were extracted
  if (summary.totalProducts === 0) {
    logger.error('PIPELINE FAILED: No products were successfully extracted from any brand');
    logger.info('Next step: Fix brand configurations or check for rate limiting');
    try {
      client.close();
    } catch (e) {
      // Ignore close errors
    }
    process.exit(1);
  }

  logger.info('Next step: Run npm run normalize to transform data to YogaMat schema');

  try {
    client.close();
  } catch (e) {
    // Ignore close errors - not critical for pipeline success
  }
}

main().catch((error) => {
  logger.error('Fatal error in extraction pipeline', error);
  process.exit(1);
});
