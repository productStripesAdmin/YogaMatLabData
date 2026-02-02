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

function normalizeText(value: string): string {
  return (value ?? '')
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[“”″]/g, '"')
    .replace(/[^a-z0-9]+/g, ' ')
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

  const missing: Array<{
    source: 'reddit-sheet' | 'outdoorgearlab';
    brandName: string;
    brandSlug: string;
    seriesName: string;
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

    const matched = brandSeries.series.some((s) => seriesMatchesSource(s, candidate));
    if (!matched) {
      missing.push({
        source,
        brandName,
        brandSlug: slug,
        seriesName,
      });
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

  if (missingUnique.length === 0) {
    console.log('✓ Series config aligns with reddit/outdoorgearlab sources (for known brands).');
    return;
  }

  console.log('⚠ Series config mismatches found (for known brands):');
  for (const item of missingUnique) {
    console.log(
      `- [${item.source}] ${item.brandSlug}: missing match for "${item.seriesName}" (source brand: "${item.brandName}")`
    );
  }

  process.exitCode = 1;
}

main().catch((error) => {
  console.error('check-series-sources failed:', error);
  process.exitCode = 1;
});

