import { promises as fs } from 'node:fs';
import path from 'node:path';

type BrandConfigFile = {
  brands: Array<{
    slug: string;
    name: string;
  }>;
};

type BrandSeriesConfigFile = Array<{
  slug: string;
  series: Array<{
    name: string;
    slug: string;
    description?: string;
    matchAny?: string[];
    matchTitleAny?: string[];
    matchHandleAny?: string[];
    matchProductTypeAny?: string[];
    matchTagAny?: string[];
    matchTitleRegex?: string[];
    priority?: number;
  }>;
}>;

type RedditRow = {
  Company?: string;
  Name?: string;
};

type OutdoorGearLabRow = {
  Brand?: string;
  Series?: string;
};

// Normalize text for loose matching (with special characters removed)
function normalizeText(value: string): string {
  return (value ?? '')
    .toLowerCase()
    .replace(/['']/g, "'")
    .replace(/[""″]/g, '"')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Normalize text for strict matching (preserving word order)
function normalizeTextStrict(value: string): string {
  return (value ?? '')
    .toLowerCase()
    .replace(/['']/g, "'")
    .replace(/[""″]/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function uniq<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

function stripBrandPrefix(seriesName: string, brandName: string): string {
  const s = seriesName.trim();
  if (!s) return s;

  const brand = brandName.trim();
  if (!brand) return s;

  const normalizedBrand = normalizeText(brand);
  if (!normalizedBrand) return s;

  const normalizedSeries = normalizeText(s);
  if (!normalizedSeries.startsWith(normalizedBrand + ' ')) return s;

  const remainder = normalizedSeries.slice((normalizedBrand + ' ').length).trim();
  return remainder.length > 0 ? remainder : s;
}

function collectSeriesTokens(series: BrandSeriesConfigFile[number]['series'][number]): string[] {
  const lists = [
    [series.name, series.slug],
    series.matchAny ?? [],
    series.matchTitleAny ?? [],
    series.matchHandleAny ?? [],
    series.matchProductTypeAny ?? [],
    series.matchTagAny ?? [],
    series.matchTitleRegex ?? [],
  ];
  return uniq(lists.flat().filter(Boolean).map(String));
}

function seriesMatchesSource(series: BrandSeriesConfigFile[number]['series'][number], sourceSeriesName: string): boolean {
  const normalizedSource = normalizeText(sourceSeriesName);
  if (!normalizedSource) return false;

  const tokens = collectSeriesTokens(series).map(normalizeText).filter(Boolean);

  if (tokens.includes(normalizedSource)) return true;

  // Allow partial containment for longer tokens (avoid matching "pro" everywhere).
  for (const token of tokens) {
    if (token.length < 5) continue;
    if (normalizedSource.includes(token) || token.includes(normalizedSource)) return true;
  }

  return false;
}

function resolveBrandSlug(
  brandName: string,
  byNormalizedBrandName: Map<string, string>,
  byNormalizedBrandSlug: Map<string, string>
): string | null {
  const normalized = normalizeText(brandName);
  if (!normalized) return null;

  const direct = byNormalizedBrandName.get(normalized);
  if (direct) return direct;

  // Common aliases from the source sheets.
  const aliases: Record<string, string> = {
    alo: 'aloyoga',
    'alo yoga': 'aloyoga',
    jade: 'jadeyoga',
    yoloha: 'yolohayoga',
    'yoloha yoga': 'yolohayoga',
  };

  const alias = aliases[normalized];
  if (alias) return alias;

  const bySlug = byNormalizedBrandSlug.get(normalized);
  if (bySlug) return bySlug;

  return null;
}

async function readJsonFile<T>(filepath: string): Promise<T> {
  const raw = await fs.readFile(filepath, 'utf-8');
  return JSON.parse(raw) as T;
}

async function main(): Promise<void> {
  const brandsPath = path.join(process.cwd(), 'config', 'brands.json');
  const seriesPath = path.join(process.cwd(), 'config', 'brand-series.json');
  const redditPath = path.join(process.cwd(), 'data', 'reviews', 'reddit-sheet.json');
  const outdoorgearlabPath = path.join(process.cwd(), 'data', 'reviews', 'outdoorgearlab.json');

  const brandsFile = await readJsonFile<BrandConfigFile>(brandsPath);
  const seriesFile = await readJsonFile<BrandSeriesConfigFile>(seriesPath);
  const reddit = await readJsonFile<RedditRow[]>(redditPath);
  const ogl = await readJsonFile<OutdoorGearLabRow[]>(outdoorgearlabPath);

  const byBrandSlug = new Map(seriesFile.map((b) => [b.slug, b]));

  const byNormalizedBrandName = new Map<string, string>();
  const byNormalizedBrandSlug = new Map<string, string>();
  for (const brand of brandsFile.brands) {
    byNormalizedBrandName.set(normalizeText(brand.name), brand.slug);
    byNormalizedBrandSlug.set(normalizeText(brand.slug), brand.slug);
  }

  // Build config index for name matching
  const configIndex = new Map<string, { configName: string; configSlug: string; brandSlug: string }>();
  for (const brand of seriesFile) {
    for (const series of brand.series) {
      const seriesKey = `${brand.slug}:${series.slug}`;
      configIndex.set(seriesKey, {
        configName: series.name,
        configSlug: series.slug,
        brandSlug: brand.slug
      });
    }
  }

  const missing: Array<{
    source: 'reddit-sheet' | 'outdoorgearlab';
    brandName: string;
    brandSlug: string;
    seriesName: string;
  }> = [];

  const nameVariations: Array<{
    seriesKey: string;
    configName: string;
    sourceNames: string[];
    source: 'reddit-sheet' | 'outdoorgearlab';
  }> = [];

  const processRow = (
    source: 'reddit-sheet' | 'outdoorgearlab',
    brandName: string,
    seriesName: string
  ) => {
    const slug = resolveBrandSlug(brandName, byNormalizedBrandName, byNormalizedBrandSlug);
    if (!slug) return;

    const brandSeries = byBrandSlug.get(slug);
    if (!brandSeries) return;

    const candidate = stripBrandPrefix(seriesName, brandName);

    const matchedSeries = brandSeries.series.find((s) => seriesMatchesSource(s, candidate));
    if (!matchedSeries) {
      missing.push({
        source,
        brandName,
        brandSlug: slug,
        seriesName,
      });
      return;
    }

    // Check for name variations in matched series
    const seriesKey = `${slug}:${matchedSeries.slug}`;
    const configEntry = configIndex.get(seriesKey);
    if (configEntry && normalizeTextStrict(configEntry.configName) !== normalizeTextStrict(seriesName)) {
      const existing = nameVariations.find((v) => v.seriesKey === seriesKey);
      if (existing) {
        if (!existing.sourceNames.includes(seriesName)) {
          existing.sourceNames.push(seriesName);
        }
      } else {
        nameVariations.push({
          seriesKey,
          configName: configEntry.configName,
          sourceNames: [seriesName],
          source
        });
      }
    }
  };

  for (const row of reddit) {
    const brandName = typeof row.Company === 'string' ? row.Company.trim() : '';
    const seriesName = typeof row.Name === 'string' ? row.Name.trim() : '';
    if (!brandName || !seriesName) continue;
    processRow('reddit-sheet', brandName, seriesName);
  }

  for (const row of ogl) {
    const brandName = typeof row.Brand === 'string' ? row.Brand.trim() : '';
    const seriesName = typeof row.Series === 'string' ? row.Series.trim() : '';
    if (!brandName || !seriesName) continue;
    processRow('outdoorgearlab', brandName, seriesName);
  }

  const missingUnique = uniq(
    missing.map((m) => `${m.source}::${m.brandSlug}::${m.seriesName}`)
  ).map((key) => missing.find((m) => `${m.source}::${m.brandSlug}::${m.seriesName}` === key)!);

  // Output section
  console.log('\n===============================================================');
  console.log('SERIES ALIGNMENT & NAME VALIDATION CHECK');
  console.log('===============================================================\n');

  // Check 1: Series alignment (config completeness)
  if (missingUnique.length === 0) {
    console.log('✓ Check 1: Series config aligns with reddit/outdoorgearlab sources');
    console.log('  All series in review sources have matching config entries.\n');
  } else {
    console.log('✗ Check 1: Series config mismatches found (for known brands):');
    console.log(`  Found ${missingUnique.length} series in reviews without config matches:\n`);
    for (const item of missingUnique) {
      console.log(
        `  - [${item.source}] ${item.brandSlug}: missing match for "${item.seriesName}" (source brand: "${item.brandName}")`
      );
    }
    console.log('');
  }

  // Check 2: Name variations (naming consistency)
  if (nameVariations.length === 0) {
    console.log('✓ Check 2: Series names are consistent');
    console.log('  All series names match exactly across config and review sources.\n');
  } else {
    console.log(`✓ Check 2: Found ${nameVariations.length} name variation(s) (acceptable):`);
    console.log('  These series match but have minor name differences:\n');
    for (const variation of nameVariations.slice(0, 10)) {
      console.log(`  - ${variation.seriesKey}`);
      console.log(`    Config: "${variation.configName}"`);
      console.log(`    Found: "${variation.sourceNames.join('", "')}"`);
      console.log(`    From: ${variation.source}\n`);
    }
    if (nameVariations.length > 10) {
      console.log(`  ... and ${nameVariations.length - 10} more name variations\n`);
    }
  }

  console.log('===============================================================\n');

  if (missingUnique.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error('check-series-sources failed:', error);
  process.exitCode = 1;
});

