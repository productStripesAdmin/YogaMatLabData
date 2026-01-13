import 'dotenv/config';
import { ConvexHttpClient } from 'convex/browser';
import { promises as fs } from 'fs';
import path from 'path';
import { logger } from './lib/logger.js';
import type { ShopifyProductsResponse } from './lib/fetch-products-json.js';
import type { ShopifyProduct } from './lib/fetch-products-json.js';
import {
  buildProductUrl,
  createProductEnrichmentRecord,
  extractAppendTextForProduct,
  extractSectionsFromHtml,
  extractCoreFeaturesForProduct,
  fetchHtml,
  getDefaultProductPageTemplate,
  shouldEnrichBrand,
  type BrandEnrichmentConfig,
  type BrandEnrichmentOutput,
  type EnrichmentConfig,
} from './lib/product-page-enricher.js';

interface BrandMeta {
  slug: string;
  website?: string;
}

interface EnrichmentSummary {
  date: string;
  totalBrandsConsidered: number;
  brandsEnriched: number;
  productsFetched: number;
  productsWithCoreFeatures: number;
  productsWithAppendText: number;
  productsWithSections: number;
  errors: number;
  brands: Array<{
    brandSlug: string;
    products: number;
    productsWithCoreFeatures: number;
    productsWithAppendText: number;
    productsWithSections: number;
    sectionsExtracted: string[];
    errors: number;
  }>;
}

function parseArgs(argv: string[]) {
  const args = [...argv];
  const date = args[0] && !args[0].startsWith('--')
    ? args.shift()!
    : new Date().toISOString().split('T')[0];

  const getFlag = (name: string) => {
    const idx = args.indexOf(`--${name}`);
    if (idx === -1) return undefined;
    return args[idx + 1];
  };

  const brandSlug = getFlag('brand');
  const maxProductsRaw = getFlag('max-products');
  const maxProducts = maxProductsRaw ? Number(maxProductsRaw) : undefined;

  const force = args.includes('--force');

  return { date, brandSlug, maxProducts, force };
}

async function ensureEnrichedDirectory(date: string) {
  const enrichedDir = path.join(process.cwd(), 'data', 'enriched', date);
  await fs.mkdir(enrichedDir, { recursive: true });
  logger.info(`Created enriched directory: ${enrichedDir}`);
}

async function getRawBrandFiles(date: string): Promise<string[]> {
  const rawDir = path.join(process.cwd(), 'data', 'raw', date);
  const files = await fs.readdir(rawDir);
  return files.filter(f => f.endsWith('.json') && !f.startsWith('_'));
}

async function loadConfig(): Promise<EnrichmentConfig> {
  const configPath = path.join(process.cwd(), 'config', 'enrichment.json');
  const raw = await fs.readFile(configPath, 'utf-8');
  return JSON.parse(raw) as EnrichmentConfig;
}

async function loadBrandMetaIndex(date: string): Promise<Map<string, BrandMeta>> {
  const index = new Map<string, BrandMeta>();

  // Prefer per-run brand metadata if present.
  const localBrandsPath = path.join(process.cwd(), 'data', 'raw', date, '_brands.json');
  try {
    const raw = await fs.readFile(localBrandsPath, 'utf-8');
    const brands = JSON.parse(raw) as BrandMeta[];
    for (const brand of brands) {
      if (brand?.slug) index.set(brand.slug, brand);
    }
    return index;
  } catch {
    // fall through
  }

  // Fallback: query Convex for enabled brands.
  const convexUrl = process.env.CONVEX_URL;
  if (!convexUrl) return index;

  const client = new ConvexHttpClient(convexUrl);
  try {
    const brands = await client.query('brands:getScrapableBrands' as any);
    for (const brand of brands as Array<{ slug: string; website?: string }>) {
      if (brand?.slug) index.set(brand.slug, { slug: brand.slug, website: brand.website });
    }
  } catch (error) {
    logger.warn('Failed to load brands from Convex (website lookup disabled)', error);
  }

  return index;
}

function resolveBaseUrl(brandSlug: string, brandConfig: BrandEnrichmentConfig, brandMetaIndex: Map<string, BrandMeta>): string | undefined {
  if (brandConfig.baseUrl) return brandConfig.baseUrl;
  const meta = brandMetaIndex.get(brandSlug);
  const website = meta?.website;
  if (!website) return undefined;
  try {
    return new URL(website).toString();
  } catch {
    return undefined;
  }
}

async function enrichBrand(params: {
  date: string;
  brandSlug: string;
  config: EnrichmentConfig;
  brandConfig: BrandEnrichmentConfig;
  baseUrl: string;
  maxProducts?: number;
  force: boolean;
}): Promise<{
  output?: BrandEnrichmentOutput;
  errors: number;
  productsFetched: number;
  productsWithCoreFeatures: number;
  productsWithAppendText: number;
  productsWithSections: number;
  sectionsExtracted: string[];
}> {
  const manualPath = path.join(process.cwd(), 'data', 'enriched', 'manual', `${params.brandSlug}.json`);
  const rawPath = path.join(process.cwd(), 'data', 'raw', params.date, `${params.brandSlug}.json`);
  const rawData = await fs.readFile(rawPath, 'utf-8');
  const shopifyData: ShopifyProductsResponse = JSON.parse(rawData);

  const outPath = path.join(process.cwd(), 'data', 'enriched', params.date, `${params.brandSlug}.json`);
  if (!params.force) {
    try {
      await fs.access(outPath);
      logger.info(`  Skipping (already enriched): ${params.brandSlug}`);
      return {
        errors: 0,
        productsFetched: 0,
        productsWithCoreFeatures: 0,
        productsWithAppendText: 0,
        productsWithSections: 0,
        sectionsExtracted: [],
      };
    } catch {
      // continue
    }
  }

  // Strategy: manual-only (skip network fetch entirely)
  if (params.brandConfig.strategy === 'manual') {
    try {
      await fs.access(manualPath);
      const rawFallback = await fs.readFile(manualPath, 'utf-8');
      const parsed = JSON.parse(rawFallback) as BrandEnrichmentOutput;
      const nowIso = new Date().toISOString();
      const patched: BrandEnrichmentOutput = {
        ...parsed,
        brandSlug: params.brandSlug,
        extractedAt: nowIso,
        products: Array.isArray(parsed.products)
          ? parsed.products.map((p) => ({ ...p, extractedAt: nowIso }))
          : [],
      };

      await fs.writeFile(outPath, JSON.stringify(patched, null, 2), 'utf-8');
      logger.success(`  Used manual enrichment (strategy=manual): data/enriched/manual/${params.brandSlug}.json`);
      const sectionsExtracted = new Set<string>();
      let productsWithAppendText = 0;
      let productsWithSections = 0;
      for (const product of patched.products) {
        if (product.appendText?.text?.trim()) productsWithAppendText++;
        if (product.sections?.length) {
          productsWithSections++;
          for (const section of product.sections) {
            if (section?.heading) sectionsExtracted.add(section.heading);
          }
        }
      }

      return {
        output: patched,
        errors: 0,
        productsFetched: patched.products.length,
        productsWithCoreFeatures: patched.products.filter(p => p.coreFeatures?.items?.length).length,
        productsWithAppendText,
        productsWithSections,
        sectionsExtracted: Array.from(sectionsExtracted).sort((a, b) => a.localeCompare(b)),
      };
    } catch (error) {
      logger.warn(`  Missing manual enrichment file: data/enriched/manual/${params.brandSlug}.json`);
      return {
        output: undefined,
        errors: 1,
        productsFetched: 0,
        productsWithCoreFeatures: 0,
        productsWithAppendText: 0,
        productsWithSections: 0,
        sectionsExtracted: [],
      };
    }
  }

  const extractedAt = new Date().toISOString();
  const productPathTemplate = params.brandConfig.productPathTemplate ?? getDefaultProductPageTemplate();

  const products = params.maxProducts != null
    ? shopifyData.products.slice(0, params.maxProducts)
    : shopifyData.products;

  let errors = 0;
  let productsFetched = 0;
  let productsWithCoreFeatures = 0;
  let productsWithAppendText = 0;
  let productsWithSections = 0;
  const sectionsExtracted = new Set<string>();

  const records = [];
  for (const product of products) {
    const url = buildProductUrl({
      baseUrl: params.baseUrl,
      productPathTemplate,
      handle: product.handle,
    });

    const record = await enrichOneProduct({
      product,
      brandSlug: params.brandSlug,
      productUrl: url,
      config: params.config,
      brandConfig: params.brandConfig,
    });

    productsFetched++;
    if (record.coreFeatures?.items?.length) productsWithCoreFeatures++;
    if (record.appendText?.text?.trim()) productsWithAppendText++;
    if (record.sections?.length) {
      productsWithSections++;
      for (const section of record.sections) {
        if (section?.heading) sectionsExtracted.add(section.heading);
      }
    }
    if (record.errors?.length) errors += record.errors.length;
    records.push(record);

    await new Promise((resolve) => setTimeout(resolve, params.config.defaults.delayBetweenProductsMs));
  }

  const output: BrandEnrichmentOutput = {
    brandSlug: params.brandSlug,
    extractedAt,
    products: records,
  };

  const hasAnyUsefulExtraction = records.some((record) =>
    Boolean(
      record.coreFeatures?.items?.length ||
      record.appendText?.text?.trim() ||
      record.sections?.length
    )
  );

  if (!hasAnyUsefulExtraction && errors > 0 && params.brandConfig.strategy !== 'fetch') {
    try {
      await fs.access(manualPath);
      const rawFallback = await fs.readFile(manualPath, 'utf-8');
      const parsed = JSON.parse(rawFallback) as BrandEnrichmentOutput;
      const nowIso = new Date().toISOString();
      const patched: BrandEnrichmentOutput = {
        ...parsed,
        brandSlug: params.brandSlug,
        extractedAt: nowIso,
        products: Array.isArray(parsed.products)
          ? parsed.products.map((p) => ({ ...p, extractedAt: nowIso }))
          : [],
      };

      await fs.writeFile(outPath, JSON.stringify(patched, null, 2), 'utf-8');
      logger.success(`  Used manual enrichment fallback: data/enriched/manual/${params.brandSlug}.json`);

      return { output: patched, errors: 0, productsFetched, productsWithCoreFeatures: 0 };
    } catch {
      // No fallback available, proceed with saving live (failed) output for debugging.
    }
  }

  await fs.writeFile(outPath, JSON.stringify(output, null, 2), 'utf-8');
  logger.success(`  Saved enriched data: data/enriched/${params.date}/${params.brandSlug}.json`);

  return {
    output,
    errors,
    productsFetched,
    productsWithCoreFeatures,
    productsWithAppendText,
    productsWithSections,
    sectionsExtracted: Array.from(sectionsExtracted).sort((a, b) => a.localeCompare(b)),
  };
}

async function enrichOneProduct(params: {
  product: ShopifyProduct;
  brandSlug: string;
  productUrl: string;
  config: EnrichmentConfig;
  brandConfig: BrandEnrichmentConfig;
}): Promise<ReturnType<typeof createProductEnrichmentRecord>> {
  const errors: string[] = [];
  let html: string | undefined;

  try {
    html = await fetchHtml(params.productUrl, {
      timeoutMs: params.config.defaults.timeoutMs,
      userAgent: params.config.defaults.userAgent,
    });
  } catch (error) {
    errors.push(error instanceof Error ? error.message : 'Unknown fetch error');
  }

  let coreFeatures: { items: string[]; confidence: number } | undefined;
  let appendText: { text: string; confidence: number; headings: string[] } | undefined;
  let sections: Array<{ heading: string; items: string[]; confidence: number }> | undefined;
  if (html) {
    try {
      const extracted = extractCoreFeaturesForProduct(html, params.brandConfig);
      if (extracted?.items?.length) {
        coreFeatures = extracted;
      } else if (params.brandConfig.coreFeatures) {
        const hasHeading = new RegExp('core\\s+features', 'i').test(html);
        errors.push(hasHeading ? 'Core features heading found but no items extracted' : 'Core features heading not found');
      }
    } catch (error) {
      errors.push(error instanceof Error ? error.message : 'Unknown core features parse error');
    }

    try {
      const extractedAppend = extractAppendTextForProduct(html, params.brandConfig);
      if (extractedAppend?.text) {
        appendText = extractedAppend;
        sections = extractSectionsFromHtml(html, extractedAppend.headings, params.brandConfig.appendText?.endHeadings);
      } else if (params.brandConfig.appendText?.headings?.length) {
        errors.push(`Append text headings not found: ${params.brandConfig.appendText.headings.join(', ')}`);
      }
    } catch (error) {
      errors.push(error instanceof Error ? error.message : 'Unknown append text parse error');
    }
  }

  const record = createProductEnrichmentRecord({
    product: params.product,
    brandSlug: params.brandSlug,
    productUrl: params.productUrl,
    coreFeatures,
    appendText,
    sections,
    errors,
    extractedAt: new Date().toISOString(),
  });

  // Attach a small debug preview when parsing failed but the page was fetched.
  if (params.brandConfig.coreFeatures && !record.coreFeatures?.items?.length && html) {
    const idx = html.search(/core\s+features/i);
    const start = idx >= 0 ? Math.max(0, idx - 2000) : 0;
    const preview = html
      .slice(start, start + 8000)
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 2000);

    if (preview) {
      record.debug = {
        ...(record.debug ?? {}),
        coreFeaturesHtmlPreview: preview,
      };
    }
  }

  return record;
}

async function saveSummary(date: string, summary: EnrichmentSummary): Promise<void> {
  const summaryPath = path.join(process.cwd(), 'data', 'enriched', date, '_summary.json');
  await fs.writeFile(summaryPath, JSON.stringify(summary, null, 2), 'utf-8');
}

async function main() {
  logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  logger.info('YogaMatLab Data Pipeline - Enrich Product Pages');
  logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const { date, brandSlug, maxProducts, force } = parseArgs(process.argv.slice(2));
  logger.info(`Processing date: ${date}`);

  const config = await loadConfig();
  await ensureEnrichedDirectory(date);

  const brandMetaIndex = await loadBrandMetaIndex(date);

  const rawFiles = await getRawBrandFiles(date);
  const allBrandSlugs = rawFiles.map(f => f.replace('.json', ''));
  const targets = brandSlug ? allBrandSlugs.filter(s => s === brandSlug) : allBrandSlugs;

  const summary: EnrichmentSummary = {
    date,
    totalBrandsConsidered: targets.length,
    brandsEnriched: 0,
    productsFetched: 0,
    productsWithCoreFeatures: 0,
    productsWithAppendText: 0,
    productsWithSections: 0,
    errors: 0,
    brands: [],
  };

  for (let i = 0; i < targets.length; i++) {
    const slug = targets[i];
    logger.info(`\n[${i + 1}/${targets.length}] Enriching: ${slug}`);

    if (!shouldEnrichBrand(config, slug)) {
      logger.info(`  Skipping (no enrichment rules): ${slug}`);
      continue;
    }

    const brandConfig = config.brands[slug];
    const baseUrl = resolveBaseUrl(slug, brandConfig, brandMetaIndex);

    if (!baseUrl) {
      logger.warn(`  Skipping (missing baseUrl/website): ${slug}`);
      continue;
    }

    const result = await enrichBrand({
      date,
      brandSlug: slug,
      config,
      brandConfig,
      baseUrl,
      maxProducts,
      force,
    });

    if (result.output) summary.brandsEnriched++;
    summary.productsFetched += result.productsFetched;
    summary.productsWithCoreFeatures += result.productsWithCoreFeatures;
    summary.errors += result.errors;

    summary.productsWithAppendText += result.productsWithAppendText;
    summary.productsWithSections += result.productsWithSections;

    summary.brands.push({
      brandSlug: slug,
      products: result.productsFetched,
      productsWithCoreFeatures: result.productsWithCoreFeatures,
      productsWithAppendText: result.productsWithAppendText,
      productsWithSections: result.productsWithSections,
      sectionsExtracted: result.sectionsExtracted,
      errors: result.errors,
    });
  }

  await saveSummary(date, summary);

  logger.info('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  logger.info('ENRICHMENT SUMMARY');
  logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  logger.success(`Brands enriched: ${summary.brandsEnriched}`);
  logger.success(`Products fetched: ${summary.productsFetched}`);
  logger.success(`Products with coreFeatures: ${summary.productsWithCoreFeatures}`);
  logger.success(`Products with appendText: ${summary.productsWithAppendText}`);
  logger.success(`Products with sections: ${summary.productsWithSections}`);
  if (summary.errors > 0) logger.warn(`Errors: ${summary.errors}`);
  if (summary.brandsEnriched > 0) {
    logger.info('\nBrands & extracted sections:');
    for (const brand of summary.brands.filter(b => b.products > 0)) {
      const headings = brand.sectionsExtracted.length > 0 ? brand.sectionsExtracted.join(', ') : '(none)';
      logger.info(`- ${brand.brandSlug}: ${brand.products} products; sections: ${headings}`);
    }
  }
  logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

main().catch((error) => {
  logger.error('Fatal error enriching product pages', error);
  process.exit(1);
});
