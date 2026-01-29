import type { ShopifyProduct } from './fetch-products-json.js';
import type { MaterialType, YogaMatFeature, TextureType } from '../../types/yogaMat.js';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

export interface NormalizedYogaMat {
  // Required fields
  brandId: string; // Will be resolved from brand slug // TODO Need more clarity on this
  brandSlug: string; // Used to lookup brandId
  name: string;
  slug: string;

  // Original title from pipeline (Shopify)
  titleOriginal?: string;

  // Series grouping (for brands that publish designs as separate products)
  seriesKey?: string; // e.g. "yolohayoga:unity-pro-cork"
  seriesName?: string; // e.g. "Unity Pro Cork"
  seriesConfidence?: number; // 0..1
  seriesVersion?: string; // e.g. "series-v1"
  designName?: string; // e.g. "Mountain Magic"
  designConfidence?: number; // 0..1
  designVersion?: string; // e.g. "series-v1"

  // Optional fields with data from Shopify
  description?: string;

  // Measurements (structured with units and source tracking)
  // Extracted from options first, then description/tags as fallback
  thickness?: {
    value: number; // Normalized value
    unit: 'mm'; // Always mm (normalized unit)
    source: 'options' | 'description';
    originalText: string; // Original text with original unit (e.g., "1/4 inch thick")
  };

  length?: {
    value: number; // Normalized value
    unit: 'cm'; // Always cm (normalized unit)
    source: 'options' | 'description';
    originalText: string; // Original text with original unit (e.g., "80\" Long")
  };

  width?: {
    value: number; // Normalized value
    unit: 'cm'; // Always cm (normalized unit)
    source: 'options' | 'description';
    originalText: string; // Original text with original unit (e.g., "28\" Wide")
  };

  diameter?: {
    value: number; // Normalized value
    unit: 'cm'; // Always cm (normalized unit)
    source: 'options' | 'description';
    originalText: string; // Original text with original unit (e.g., "36\" Diameter")
  };

  rolledDiameter?: {
    value: number; // Normalized value
    unit: 'cm'; // Always cm (normalized unit)
    source: 'options' | 'description';
    originalText: string; // Original text with original unit (e.g., "6 in. diameter rolled")
  };

  weight?: {
    value: number; // Normalized value
    unit: 'kg'; // Always kg (normalized unit)
    source: 'description' | 'variants';
    originalText: string; // Original text with original unit (e.g., "5 lbs", "2500 grams")
  };

  // Product attributes
  material?: MaterialType;
  materials?: MaterialType[];
  materialSource?: 'title' | 'tags' | 'description';
  materialConfidence?: number; // 0..1
  pvcFree?: boolean;
  texture?: TextureType;
  textures?: TextureType[];
  textureSource?: 'title' | 'tags' | 'description';
  textureConfidence?: number; // 0..1
  features?: YogaMatFeature[];
  coreFeatures?: string[];
  coreFeaturesSource?: 'productPage';
  coreFeaturesConfidence?: number; // 0..1
  productPageSections?: Array<{
    heading: string;
    items: string[];
    confidence: number; // 0..1
  }>;

  // Shopify metadata
  shopifyId: number;
  shopifyHandle: string;
  shopifyVendor: string;
  shopifyProductType: string;
  shopifyTags: string[];
  shopifyCreatedAt: string;
  shopifyPublishedAt: string;
  shopifyUpdatedAt: string;

  // Variants info
  variantsCount: number;
  minPrice?: number;
  maxPrice?: number;
  variantPriceValues?: number[]; // Unique prices across variants (sorted asc)
  priceCurrency?: string; // default "USD"
  priceCurrencyOriginal?: string; // e.g. "MYR" when source feed is not USD
  minPriceOriginal?: number;
  maxPriceOriginal?: number;
  variantPriceValuesOriginal?: number[];
  priceUsdRate?: number; // usdPerUnit used for conversion (if any)
  minGrams?: number;
  maxGrams?: number;
  variantGramsValues?: number[]; // Unique grams values across variants (sorted asc)
  variantGramsZeroOrMissingCount?: number; // Variants with grams <= 0 or invalid
  variantGramsCoverage?: number; // (variantsCount - zeroOrMissingCount) / variantsCount
  variantGramsAllZeroOrMissing?: boolean; // True if no variant has a positive grams value
  isAvailable?: boolean; // true if any variant available

  // Dimension query-friendly fields (derived, index-friendly)
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

  // Integer-coded option values for exact-match filters (derived)
  // Encoding: cm * 10 (tenths of cm), mm * 10 (tenths of mm)
  thicknessMmx10Values?: number[];
  lengthCMx10Values?: number[];
  widthCMx10Values?: number[];
  diameterCMx10Values?: number[];
  rolledDiameterCMx10Values?: number[];
  sizePairsCMx10Values?: Array<{
    lengthCMx10: number;
    widthCMx10: number;
  }>;

  // Shopify options (size, color, style, etc.) - RAW DATA
  shopifyOptions?: Array<{
    name: string;
    position: number;
    values: string[];
  }>;

  // Normalized extractions from options
  availableColors?: string[]; // ["Blue", "Green", "Purple"]
  availableDiameters?: Array<{
    value: number; // Always in cm
    unit: 'cm'; // Explicit unit marker
    originalString: string; // e.g., "36\" Diameter", "Round 6'"
  }>;

  // Canonical dimension options extracted from Shopify options (derived)
  dimensionOptions?: {
    sanity: {
      candidateCount: number; // dimension-like option values considered (excluding colors + Default Title)
      parsedCount: number; // candidate values that parsed into any numeric structure
      unparsedCount: number; // candidate values that could not be parsed
      coverage: number; // parsedCount / candidateCount (0..1)
      allUnparsed: boolean; // candidateCount > 0 && parsedCount === 0
    };
    thicknessMm?: Array<{
      value: number;
      sourceOptionName: string;
      rawValue: string;
      confidence: number; // 0..1
    }>;
    lengthCm?: Array<{
      value: number;
      sourceOptionName: string;
      rawValue: string;
      confidence: number; // 0..1
    }>;
    widthCm?: Array<{
      value: number;
      sourceOptionName: string;
      rawValue: string;
      confidence: number; // 0..1
    }>;
    diameterCm?: Array<{
      value: number;
      sourceOptionName: string;
      rawValue: string;
      confidence: number; // 0..1
    }>;
    rolledDiameterCm?: Array<{
      value: number;
      sourceOptionName: string;
      rawValue: string;
      confidence: number; // 0..1
    }>;
    sizePairsCm?: Array<{
      value: {
        lengthCm: number;
        widthCm: number;
      };
      sourceOptionName: string;
      rawValue: string;
      confidence: number; // 0..1
    }>;
    rawUnparsed: Array<{
      sourceOptionName: string;
      rawValue: string;
    }>;
  };

  // Product images array
  images?: Array<{
    src: string;
    alt: string | null;
    width: number;
    height: number;
    position: number;
  }>;
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
    .replace(/&ldquo;/g, '“')
    .replace(/&rdquo;/g, '”')
    .replace(/&lsquo;/g, '‘')
    .replace(/&rsquo;/g, '’')
    .replace(/&#39;/g, "'")
    .trim();
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

const SERIES_VERSION = 'series-v1';
const SERIES_MANUAL_VERSION = 'series-manual-v1';

type ManualSeriesConfigFile = Array<{
  slug: string;
  series: Array<{
    name?: string;
    slug?: string;
    description?: string;
    // Optional matching rules (prefer these over inference).
    matchAny?: string[];
    matchTitleAny?: string[];
    matchHandleAny?: string[];
    matchProductTypeAny?: string[];
    matchTagAny?: string[];
    matchTitleRegex?: string[];
    priority?: number;
  }>;
}>;

type ManualSeriesRule = {
  brandSlug: string;
  seriesName: string;
  seriesKeyPart: string;
  matchAny: string[];
  matchTitleAny: string[];
  matchHandleAny: string[];
  matchProductTypeAny: string[];
  matchTagAny: string[];
  matchTitleRegex: string[];
  priority: number;
};

let cachedManualSeriesRules: Map<string, ManualSeriesRule[]> | null = null;

// Product-level series overrides: productSlug → seriesKey
type ProductSeriesOverride = {
  productSlug: string;
  seriesKey: string;
  seriesName?: string;
  reason?: string;
};

let cachedProductSeriesOverrides: Map<string, ProductSeriesOverride> | null = null;

function loadProductSeriesOverrides(): Map<string, ProductSeriesOverride> {
  if (cachedProductSeriesOverrides) return cachedProductSeriesOverrides;

  const overrides = new Map<string, ProductSeriesOverride>();

  const candidatePaths = Array.from(
    new Set(
      [
        (process.env.YML_PRODUCT_SERIES_OVERRIDES_PATH ?? '').trim(),
        path.join(process.cwd(), 'config', 'product-series-overrides.json'),
      ].filter(Boolean)
    )
  );

  for (const filepath of candidatePaths) {
    try {
      if (!existsSync(filepath)) continue;
      const raw = readFileSync(filepath, 'utf-8');
      const data = JSON.parse(raw) as unknown;
      if (!Array.isArray(data)) continue;

      for (const item of data as ProductSeriesOverride[]) {
        const productSlug = (item?.productSlug ?? '').trim();
        const seriesKey = (item?.seriesKey ?? '').trim();
        if (!productSlug || !seriesKey) continue;

        overrides.set(productSlug, {
          productSlug,
          seriesKey,
          seriesName: item.seriesName?.trim() || undefined,
          reason: item.reason?.trim() || undefined,
        });
      }
      break; // Use first file found
    } catch {
      // ignore
    }
  }

  cachedProductSeriesOverrides = overrides;
  return overrides;
}

function normalizeMatchText(value: string): string {
  return (value ?? '')
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[“”″]/g, '"')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isBundleLikeText(text: string): boolean {
  const normalized = (text ?? '').toLowerCase();
  if (!normalized) return false;
  // Avoid false positives like "Combo Yoga Mat" (a legitimate series name for some brands).
  return /\b(bundle|bundles|kit|kits|set|sets|pack|packs)\b/i.test(normalized);
}

function loadManualSeriesRules(): Map<string, ManualSeriesRule[]> {
  if (cachedManualSeriesRules) return cachedManualSeriesRules;

  const rulesByBrand = new Map<string, ManualSeriesRule[]>();

  const candidatePaths = Array.from(
    new Set(
      [
        (process.env.YML_MANUAL_SERIES_PATH ?? '').trim(),
        path.join(process.cwd(), 'config', 'brand-series.json'),
        path.join(process.cwd(), 'config', 'manual-series.json'),
        path.join(process.cwd(), 'manual-series.json'),
        path.join(process.cwd(), 'brand-series.json'),
      ].filter(Boolean)
    )
  );

  let parsed: ManualSeriesConfigFile | null = null;
  for (const filepath of candidatePaths) {
    try {
      if (!existsSync(filepath)) continue;
      const raw = readFileSync(filepath, 'utf-8');
      const data = JSON.parse(raw) as unknown;
      if (Array.isArray(data)) {
        parsed = data as ManualSeriesConfigFile;
        break;
      }
    } catch {
      // ignore
    }
  }

  if (!parsed) {
    cachedManualSeriesRules = rulesByBrand;
    return rulesByBrand;
  }

  for (const brand of parsed) {
    const brandSlug = (brand?.slug ?? '').toLowerCase().trim();
    if (!brandSlug) continue;
    const series = Array.isArray(brand.series) ? brand.series : [];

    const rules: ManualSeriesRule[] = [];
    for (const item of series) {
      const seriesName = String(item?.name ?? '').replace(/\s+/g, ' ').trim();
      if (!seriesName) continue;

      const explicitKeyPart = String(item?.slug ?? '').toLowerCase().trim();
      const seriesKeyPart = explicitKeyPart.length > 0 ? explicitKeyPart : slugifyKeyPart(seriesName);
      if (!seriesKeyPart) continue;

      const matchAny = Array.isArray(item?.matchAny) ? item.matchAny.map(String) : [];
      const matchTitleAny = Array.isArray(item?.matchTitleAny) ? item.matchTitleAny.map(String) : [];
      const matchHandleAny = Array.isArray(item?.matchHandleAny) ? item.matchHandleAny.map(String) : [];
      const matchProductTypeAny = Array.isArray(item?.matchProductTypeAny) ? item.matchProductTypeAny.map(String) : [];
      const matchTagAny = Array.isArray(item?.matchTagAny) ? item.matchTagAny.map(String) : [];
      const matchTitleRegex = Array.isArray(item?.matchTitleRegex) ? item.matchTitleRegex.map(String) : [];
      const priority = typeof item?.priority === 'number' && Number.isFinite(item.priority) ? item.priority : 0;

      rules.push({
        brandSlug,
        seriesName,
        seriesKeyPart,
        matchAny,
        matchTitleAny,
        matchHandleAny,
        matchProductTypeAny,
        matchTagAny,
        matchTitleRegex,
        priority,
      });
    }

    if (rules.length > 0) rulesByBrand.set(brandSlug, rules);
  }

  cachedManualSeriesRules = rulesByBrand;
  return rulesByBrand;
}

function scoreManualSeriesRule(params: {
  rule: ManualSeriesRule;
  title: string;
  handle: string;
  productType: string;
  tags: string[];
}): { score: number; usedExplicitRules: boolean } {
  const title = params.title;
  const handle = params.handle;
  const productType = params.productType;
  const tags = params.tags.join(' ');

  let score = 0;
  let usedExplicitRules = false;

  const matchAny = (needle: string, haystack: string): boolean => {
    const n = normalizeMatchText(needle);
    if (!n) return false;
    const h = normalizeMatchText(haystack);
    return h.includes(n);
  };

  const addAnyMatches = (needles: string[], haystack: string, points: number) => {
    for (const needle of needles) {
      if (matchAny(needle, haystack)) score += points;
    }
  };

  // Explicit match rules (preferred).
  if (
    params.rule.matchAny.length > 0 ||
    params.rule.matchTitleAny.length > 0 ||
    params.rule.matchHandleAny.length > 0 ||
    params.rule.matchProductTypeAny.length > 0 ||
    params.rule.matchTagAny.length > 0 ||
    params.rule.matchTitleRegex.length > 0
  ) {
    usedExplicitRules = true;
    addAnyMatches(params.rule.matchAny, `${title} ${handle} ${productType} ${tags}`, 3);
    addAnyMatches(params.rule.matchTitleAny, title, 3);
    addAnyMatches(params.rule.matchHandleAny, handle, 4);
    addAnyMatches(params.rule.matchProductTypeAny, productType, 3);
    addAnyMatches(params.rule.matchTagAny, tags, 2);

    for (const pattern of params.rule.matchTitleRegex) {
      try {
        const re = new RegExp(pattern, 'i');
        if (re.test(title)) score += 4;
      } catch {
        // ignore invalid regex
      }
    }

    return { score, usedExplicitRules };
  }

  // Inference fallback: prefer exact phrase matches for the series name.
  const normalizedTitle = normalizeMatchText(title);
  const normalizedHandle = normalizeMatchText(handle);
  const normalizedType = normalizeMatchText(productType);
  const normalizedTags = normalizeMatchText(tags);

  const seriesNameNormalized = normalizeMatchText(params.rule.seriesName);
  if (seriesNameNormalized && normalizedTitle.includes(seriesNameNormalized)) score += 6;
  if (seriesNameNormalized && normalizedHandle.includes(seriesNameNormalized)) score += 4;

  // Token-level matching (avoid very short tokens unless configured explicitly).
  const allowedShortTokens = new Set(['xl', 'eko', 'grp', 'pro']);
  const tokens = Array.from(
    new Set(
      seriesNameNormalized
        .split(' ')
        .map(t => t.trim())
        .filter(Boolean)
        .filter(t => t.length >= 3 || allowedShortTokens.has(t))
        .filter(t => !['yoga', 'mat', 'mats', 'and', 'the', 'of', 'for', 'with'].includes(t))
    )
  );

  for (const token of tokens) {
    if (normalizedTitle.includes(token)) score += 2;
    if (normalizedHandle.includes(token)) score += 2;
    if (normalizedType.includes(token)) score += 1;
    if (normalizedTags.includes(token)) score += 1;
  }

  return { score, usedExplicitRules };
}

function extractSeriesFromManualConfig(params: {
  brandSlug: string;
  titleOriginal: string;
  handle?: string;
  productType?: string;
  tags?: string[];
}): Pick<NormalizedYogaMat, 'seriesKey' | 'seriesName' | 'seriesConfidence' | 'seriesVersion'> {
  const brandSlug = (params.brandSlug ?? '').toLowerCase().trim();
  const title = (params.titleOriginal ?? '').replace(/\s+/g, ' ').trim();
  const handle = (params.handle ?? '').toLowerCase().trim();
  const productType = (params.productType ?? '').replace(/\s+/g, ' ').trim();
  const tags = Array.isArray(params.tags) ? params.tags.map(String) : [];

  if (!brandSlug || !title) return {};
  // Avoid tags here: many stores add SEO tags containing "set"/"pack", which causes false positives.
  if (isBundleLikeText(`${productType} ${title} ${handle}`)) return {};

  const rulesByBrand = loadManualSeriesRules();
  const rules = rulesByBrand.get(brandSlug);
  if (!rules || rules.length === 0) return {};

  let best: { rule: ManualSeriesRule; score: number; usedExplicitRules: boolean } | null = null;

  for (const rule of rules) {
    // Avoid overly generic series names unless explicit match rules are provided.
    const nameNorm = normalizeMatchText(rule.seriesName);
    const hasExplicit =
      rule.matchAny.length > 0 ||
      rule.matchTitleAny.length > 0 ||
      rule.matchHandleAny.length > 0 ||
      rule.matchProductTypeAny.length > 0 ||
      rule.matchTagAny.length > 0 ||
      rule.matchTitleRegex.length > 0;
    if (!hasExplicit && nameNorm.length <= 3) continue;

    const scored = scoreManualSeriesRule({
      rule,
      title,
      handle,
      productType,
      tags,
    });
    if (scored.score <= 0) continue;

    if (
      !best ||
      scored.score > best.score ||
      (scored.score === best.score && rule.priority > best.rule.priority) ||
      (scored.score === best.score && rule.priority === best.rule.priority && rule.seriesName.length > best.rule.seriesName.length)
    ) {
      best = { rule, score: scored.score, usedExplicitRules: scored.usedExplicitRules };
    }
  }

  if (!best) return {};

  // Apply a small threshold for inferred matches to avoid accidental assignment.
  const threshold = best.usedExplicitRules ? 3 : 4;
  if (best.score < threshold) return {};

  const seriesKey = `${brandSlug}:${best.rule.seriesKeyPart}`;
  const confidence = best.usedExplicitRules ? 0.95 : Math.min(0.92, 0.7 + best.score * 0.05);

  return {
    seriesKey,
    seriesName: best.rule.seriesName,
    seriesConfidence: clamp01(confidence),
    seriesVersion: SERIES_MANUAL_VERSION,
  };
}

function pushUnique<T>(arr: T[], item: T, keyFn: (item: T) => string): void {
  const key = keyFn(item);
  if (arr.some(existing => keyFn(existing) === key)) return;
  arr.push(item);
}

type TextSource = 'title' | 'tags' | 'description';

/**
 * Generates a URL-safe slug from brand and product name
 */
export function generateSlug(brandSlug: string, productHandle: string): string {
  return `${brandSlug}-${productHandle}`;
}

function normalizeTitleKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[“”″]/g, '"')
    .replace(/[^a-z0-9]+/g, '');
}

function escapeForRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function slugifyKeyPart(value: string): string {
  return value
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[“”″]/g, '"')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function splitTitleOnDash(title: string): { prefix: string; suffix: string } | null {
  const parts = title.split(' - ').map(s => s.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  return { prefix: parts[0], suffix: parts.slice(1).join(' - ') };
}

function extractSeriesInfoHeuristic(params: {
  brandSlug: string;
  titleOriginal: string;
  handle?: string;
}): Pick<NormalizedYogaMat, 'seriesKey' | 'seriesName' | 'seriesConfidence' | 'seriesVersion' | 'designName' | 'designConfidence' | 'designVersion'> {
  const brandSlug = (params.brandSlug ?? '').toLowerCase().trim();
  const title = (params.titleOriginal ?? '').replace(/\s+/g, ' ').trim();
  const handle = (params.handle ?? '').toLowerCase().trim();

  if (!brandSlug || !title) return {};

  const make = (seriesName: string, designName: string | undefined, confidence: number) => {
    const keyPart = slugifyKeyPart(seriesName);
    if (!keyPart) return {};
    return {
      seriesKey: `${brandSlug}:${keyPart}`,
      seriesName,
      seriesConfidence: clamp01(confidence),
      seriesVersion: SERIES_VERSION,
      designName: designName && designName.trim().length > 0 ? designName.trim() : undefined,
      designConfidence: designName ? clamp01(Math.min(0.95, confidence)) : undefined,
      designVersion: designName ? SERIES_VERSION : undefined,
    };
  };

  // YOLOHA: "Mountain Magic Aura Cork Yoga Mat" (design prefix + stable series suffix).
  if (brandSlug === 'yolohayoga') {
    const suffixes: Array<{ suffix: string; seriesName: string }> = [
      { suffix: 'Unity Pro XL Cork Yoga Mat', seriesName: 'Unity Pro XL Cork' },
      { suffix: 'Unity Pro Cork Yoga Mat', seriesName: 'Unity Pro Cork' },
      { suffix: 'Nomad XL Cork Yoga Mat', seriesName: 'Nomad XL Cork' },
      { suffix: 'Nomad Air Cork Yoga Mat', seriesName: 'Nomad Air Cork' },
      { suffix: 'Nomad Cork Yoga Mat', seriesName: 'Nomad Cork' },
      { suffix: 'Original Cork Yoga Mat', seriesName: 'Original Cork' },
      { suffix: 'Kids Aura Cork Yoga Mat', seriesName: 'Kids Aura Cork' },
      { suffix: 'Aura Cork Yoga Mat', seriesName: 'Aura Cork' },
    ];

    for (const item of suffixes) {
      if (title.toLowerCase().endsWith(item.suffix.toLowerCase())) {
        const design = title.slice(0, Math.max(0, title.length - item.suffix.length)).trim();
        return make(item.seriesName, design.length > 0 ? design : undefined, 0.95);
      }
    }

    // Fallback: handle-based detection.
    if (handle.includes('unity-pro-xl-cork-yoga-mat') || handle.includes('unity-xl-cork-yoga-mat')) return make('Unity Pro XL Cork', undefined, 0.9);
    if (handle.includes('unity-pro-cork-yoga-mat')) return make('Unity Pro Cork', undefined, 0.9);
    if (handle.includes('nomad-xl-cork-yoga-mat')) return make('Nomad XL Cork', undefined, 0.9);
    if (handle.includes('travel-cork-yoga-mat') || title.toLowerCase().includes('nomad air')) return make('Nomad Air Cork', undefined, 0.88);
    if (handle.includes('nomad-cork-yoga-mat')) return make('Nomad Cork', undefined, 0.9);
    if (handle.includes('original-cork-yoga-mat')) return make('Original Cork', undefined, 0.9);
    if (handle.includes('kids-cork-yoga-mat') || title.toLowerCase().startsWith('kids ')) return make('Kids Aura Cork', undefined, 0.85);
    if (handle.includes('aura-cork-yoga-mat')) return make('Aura Cork', undefined, 0.9);
  }

  // Yoga Design Lab: "<Series> - <Design>"
  if (brandSlug === 'yogadesignlab') {
    const split = splitTitleOnDash(title);
    if (split) return make(split.prefix, split.suffix, 0.92);
  }

  // House of Mats: "<Design> Yoga mat - <Collection> - <thickness>"
  if (brandSlug === 'houseofmats') {
    const parts = title.split(' - ').map(s => s.trim()).filter(Boolean);
    if (parts.length >= 3) {
      const thicknessIndex = parts.findIndex(p => /\b\d+(?:\.\d+)?\s*mm\b/i.test(p));
      if (thicknessIndex > 0) {
        const designRaw = parts[0];
        const designName = designRaw.replace(/\byoga\s*mat\b/ig, '').replace(/\s+/g, ' ').trim() || undefined;
        const seriesName = parts.slice(1, thicknessIndex + 1).join(' - ');
        return make(seriesName, designName, 0.93);
      }
    }
  }

  // Shakti Warrior: "<Series> - <Design>"
  if (brandSlug === 'shaktiwarrior') {
    const split = splitTitleOnDash(title);
    if (split) return make(split.prefix, split.suffix, 0.88);
  }

  // Yogi Bare: "<Series> - <Design/Color>"
  if (brandSlug === 'yogibare') {
    const split = splitTitleOnDash(title);
    if (split) return make(split.prefix, split.suffix, 0.85);
  }

  // Liforme: handle identifies Travel / XL lines.
  if (brandSlug === 'liforme') {
    const stripVendor = (value: string) =>
      value.replace(/^liforme\s+/i, '').replace(/\s+/g, ' ').trim();

    if (handle.endsWith('travel-yoga-mat')) {
      const withoutVendor = stripVendor(title);
      const suffix = 'Travel Yoga Mat';
      const design = withoutVendor.toLowerCase().endsWith(suffix.toLowerCase())
        ? withoutVendor.slice(0, Math.max(0, withoutVendor.length - suffix.length)).trim()
        : '';
      return make('Travel Yoga Mat', design || undefined, 0.86);
    }

    if (handle.endsWith('xl-yoga-mat')) {
      const withoutVendor = stripVendor(title);
      const suffix = 'XL Yoga Mat';
      const design = withoutVendor.toLowerCase().endsWith(suffix.toLowerCase())
        ? withoutVendor.slice(0, Math.max(0, withoutVendor.length - suffix.length)).trim()
        : '';
      return make('XL Yoga Mat', design || undefined, 0.86);
    }
  }

  return {};
}

const SERIES_OVERRIDE_VERSION = 'series-override-v1';

function extractSeriesInfo(params: {
  brandSlug: string;
  titleOriginal: string;
  handle?: string;
  productType?: string;
  tags?: string[];
}): Pick<
  NormalizedYogaMat,
  | 'seriesKey'
  | 'seriesName'
  | 'seriesConfidence'
  | 'seriesVersion'
  | 'designName'
  | 'designConfidence'
  | 'designVersion'
> {
  const brandSlug = (params.brandSlug ?? '').toLowerCase().trim();
  const title = (params.titleOriginal ?? '').replace(/\s+/g, ' ').trim();
  const handle = (params.handle ?? '').toLowerCase().trim();
  const productType = (params.productType ?? '').replace(/\s+/g, ' ').trim();
  const tags = Array.isArray(params.tags) ? params.tags.map(String) : [];

  if (!brandSlug || !title) return {};

  // Check for product-level override first (highest priority)
  const productSlug = `${brandSlug}-${handle}`;
  const overrides = loadProductSeriesOverrides();
  const override = overrides.get(productSlug);
  if (override) {
    // Derive seriesName from seriesKey if not provided
    const seriesName = override.seriesName || override.seriesKey.split(':')[1]?.replace(/-/g, ' ') || override.seriesKey;
    return {
      seriesKey: override.seriesKey,
      seriesName,
      seriesConfidence: 1.0,
      seriesVersion: SERIES_OVERRIDE_VERSION,
    };
  }

  // Prevent bundle/set products from being treated as a "series" regardless of naming.
  // Avoid tags here: many stores add SEO tags containing "set"/"pack", which causes false positives.
  if (isBundleLikeText(`${productType} ${title} ${handle}`)) return {};

  const heuristic = extractSeriesInfoHeuristic({
    brandSlug,
    titleOriginal: params.titleOriginal,
    handle: params.handle,
  });

  const manual = extractSeriesFromManualConfig({
    brandSlug,
    titleOriginal: params.titleOriginal,
    handle: params.handle,
    productType,
    tags,
  });

  if (manual.seriesKey) {
    // Keep heuristic design parsing where it exists (it can still extract designName reliably for some brands).
    return {
      ...manual,
      designName: heuristic.designName,
      designConfidence: heuristic.designConfidence,
      designVersion: heuristic.designVersion,
    };
  }

  return heuristic;
}

/**
 * Extracts thickness from options (priority) or text (fallback)
 * Returns structured data with value normalized to mm
 */
function extractThickness(product: ShopifyProduct, text: string): {
  value: number; // Always in mm (normalized)
  unit: 'mm'; // Always 'mm' (normalized unit)
  source: 'options' | 'description';
  originalText: string; // Original text with original unit
} | undefined {
  // First, try to extract from options
  if (product.options) {
    for (const option of product.options) {
      if (option.name.toLowerCase() === 'size' || option.name.toLowerCase() === 'thickness') {
        // Check if values contain thickness info (e.g., "5 MM", "8 MM")
        for (const value of option.values) {
          const mmMatch = value.match(/(\d+(?:\.\d+)?)\s*mm/i);
          if (mmMatch) {
            return {
              value: parseFloat(mmMatch[1]), // Already in mm
              unit: 'mm',
              source: 'options',
              originalText: value,
            };
          }
          // Some brands use just numbers for thickness options
          const numMatch = value.match(/^(\d+(?:\.\d+)?)\s*$/);
          if (numMatch && parseFloat(numMatch[1]) < 20) { // Likely mm if < 20
            return {
              value: parseFloat(numMatch[1]), // Already in mm
              unit: 'mm',
              source: 'options',
              originalText: value,
            };
          }
        }
      }
    }
  }

  // Fallback: extract from text
  const patterns = [
    /(\d+(?:\.\d+)?)\s*mm/i,
    /(\d+(?:\.\d+)?)\s*millimeter/i,
    /(\d+\/\d+)\s*(?:inches?|inch|in\.?|["″”“])\s*(?:thick|thickness)?/i,
    /(\d+(?:\.\d+)?)\s*inch(?:es)?\s*thick/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const value = match[1];
      const originalText = match[0];
      const isInch = pattern.source.includes('inch');

      // Handle fractions like "1/4 inch"
      if (value.includes('/')) {
        const [num, den] = value.split('/').map(Number);
        return {
          value: (num / den) * 25.4, // Convert inches to mm
          unit: 'mm', // Normalized unit
          source: 'description',
          originalText,
        };
      }

      const numValue = parseFloat(value);

      // If pattern includes "inch", convert to mm
      if (isInch) {
        return {
          value: numValue * 25.4, // Convert inches to mm
          unit: 'mm', // Normalized unit
          source: 'description',
          originalText,
        };
      }

      return {
        value: numValue, // Already in mm
        unit: 'mm', // Normalized unit
        source: 'description',
        originalText,
      };
    }
  }

  return undefined;
}

/**
 * Classifies what type of data an option contains based on values
 */
function classifyOptionValues(values: string[]): 'thickness' | 'diameter' | 'dimensions' | 'length' | 'width' | 'color' | 'unknown' {
  // Check all values to determine predominant pattern
  let thicknessCount = 0;
  let dimensionsCount = 0;
  let lengthCount = 0;
  let diameterCount = 0;

  for (const value of values) {
    // Pattern 1: Thickness (strongest signal)
    // Support mm, inch/in, mixed strings like "7mm/0.3in"
    if (parseThicknessString(value) != null) {
      thicknessCount++;
      continue;
    }

    // Pattern 2: Diameter / round
    if (/\d/.test(value) && /\b(?:diam(?:eter)?|dia\.?|ø|round|circle|circular)\b/i.test(value)) {
      diameterCount++;
      continue;
    }

    // Pattern 2: Full dimensions (L x W)
    if (
      /\d+(?:\.\d+)?\s*(?:cm|mm|inches?|inch|in\.?|ft\.?|feet|foot|["'″”’′“‘])?\s*(?:\b(?:l|w|length|width|long|wide)\b)?\s*[xX×]\s*\d+(?:\.\d+)?\s*(?:cm|mm|inches?|inch|in\.?|ft\.?|feet|foot|["'″”’′“‘])?\s*(?:\b(?:l|w|length|width|long|wide)\b)?/i.test(value)
    ) {
      dimensionsCount++;
      continue;
    }

    // Pattern 3: Single dimension with qualifier
    if (/(long|tall|standard|extended|short)/i.test(value) && /\d+/.test(value)) {
      lengthCount++;
      continue;
    }
  }

  // Majority wins
  if (thicknessCount >= values.length * 0.5) return 'thickness';
  if (diameterCount >= values.length * 0.5) return 'diameter';
  if (dimensionsCount >= values.length * 0.5) return 'dimensions';
  if (lengthCount >= values.length * 0.5) return 'length';

  // Default to color if no clear pattern
  return 'color';
}

type LinearUnit = 'cm' | 'mm' | 'in' | 'ft';

function unitTokenToLinearUnit(token: string | undefined): LinearUnit | null {
  if (!token) return null;
  const lower = token.toLowerCase().trim().replace(/\.+$/, '');

  if (lower === 'cm') return 'cm';
  if (lower === 'mm') return 'mm';
  // Inches: ASCII quote (") as well as common Unicode variants (″ “ ”)
  if (lower === '"' || lower === '″' || lower === '”' || lower === '“' || lower === 'in' || lower === 'inch' || lower === 'inches') return 'in';
  // Feet: ASCII apostrophe (') as well as common Unicode variants (′ ‘ ’)
  if (lower === "'" || lower === '′' || lower === '’' || lower === '‘' || lower === 'ft' || lower === 'feet' || lower === 'foot') return 'ft';

  return null;
}

function isMetricUnit(unit: LinearUnit): boolean {
  return unit === 'cm' || unit === 'mm';
}

function linearToCm(value: number, unit: LinearUnit): number {
  if (unit === 'cm') return value;
  if (unit === 'mm') return value / 10;
  if (unit === 'ft') return value * 30.48;
  return value * 2.54; // inches
}

function inferUnlabeledLinearUnit(text: string, ...numbers: number[]): LinearUnit {
  const lower = text.toLowerCase();

  // Only treat quote characters as measurement units when they are adjacent to a number.
  // This avoids false positives from apostrophes in normal prose (e.g. "you’ll").
  const hasFeetUnit =
    /\b(?:ft|feet|foot)\b/i.test(text) || /\d\s*(?:'|′|’|‘)(?![a-z0-9])/i.test(text);
  const hasInchUnit =
    /\b(?:inch|in)\b/i.test(text) || /\d\s*(?:"|″|”|“)(?![a-z0-9])/i.test(text);

  if (hasFeetUnit) return 'ft';
  if (hasInchUnit) return 'in';
  if (lower.includes('cm')) return 'cm';
  if (lower.includes('mm')) return 'mm';

  const max = Math.max(...numbers.filter(n => Number.isFinite(n)));
  if (max >= 100) return 'cm';
  return 'in';
}

function extractAllLinearMeasurements(text: string): Array<{ value: number; unit: LinearUnit }> {
  const results: Array<{ value: number; unit: LinearUnit }> = [];
  const re = /(\d+(?:\.\d+)?)\s*(cm|mm|inches?|inch|in\.?|ft\.?|feet|foot|["'″”’′“‘])/ig;

  for (const match of text.matchAll(re)) {
    const value = parseFloat(match[1]);
    const unit = unitTokenToLinearUnit(match[2]);
    if (!Number.isFinite(value) || !unit) continue;
    results.push({ value, unit });
  }

  return results;
}

function parseSingleLinearToCm(text: string): number | null {
  // For length/width/diameter parsing, millimeters usually represent thickness.
  // Only treat `mm` as a linear unit when the value is large enough to plausibly
  // represent a dimension (e.g., `1830mm` -> 183cm). Small `mm` values like `3.5mm`
  // should not become `0.35cm`.
  const measurements = extractAllLinearMeasurements(text).filter((m) => {
    if (m.unit !== 'mm') return true;
    return m.value >= 100;
  });
  if (measurements.length === 0) return null;

  const firstCm = measurements.find(m => m.unit === 'cm');
  const firstNonMm = measurements.find(m => m.unit !== 'mm');
  const selected = firstCm ?? firstNonMm ?? measurements[0];
  return linearToCm(selected.value, selected.unit);
}

function encodeMmX10(valueMm: number): number {
  return Math.round(valueMm * 10);
}

function encodeCmX10(valueCm: number): number {
  return Math.round(valueCm * 10);
}

function computeMinMax(values: number[]): { min: number; max: number } | undefined {
  const filtered = values.filter(v => Number.isFinite(v));
  if (filtered.length === 0) return undefined;
  return { min: Math.min(...filtered), max: Math.max(...filtered) };
}

function isColorOptionName(optionNameLower: string): boolean {
  return (
    optionNameLower === 'color' ||
    optionNameLower === 'colour' ||
    optionNameLower === 'color/pattern' ||
    /(?:mat|yoga|sock|towel).*?(?:colour|color)/i.test(optionNameLower)
  );
}

function optionNameSuggestsDimensions(optionNameLower: string): boolean {
  return (
    optionNameLower.includes('size') ||
    optionNameLower.includes('dimension') ||
    optionNameLower.includes('length') ||
    optionNameLower.includes('width') ||
    optionNameLower.includes('thick') ||
    optionNameLower.includes('diam') ||
    optionNameLower.includes('round') ||
    optionNameLower.includes('circle') ||
    optionNameLower.includes('mat size') ||
    optionNameLower.includes('select')
  );
}

function hasExplicitLinearUnit(rawValue: string): boolean {
  return /(cm|mm|\b(?:inch|inches|in\.?|ft\.?|feet|foot)\b|["'″”’′“‘])/i.test(rawValue);
}

function makeOptionParseConfidence(params: {
  kind: 'thickness' | 'length' | 'width' | 'diameter' | 'sizePair';
  optionNameLower: string;
  rawValue: string;
  classification: ReturnType<typeof classifyOptionValues>;
  hasUnits: boolean;
  hasKeywords: boolean;
  isPlainNumber: boolean;
}): number {
  const { kind, optionNameLower, rawValue, classification, hasUnits, hasKeywords, isPlainNumber } = params;

  let confidence = 0.55;

  if (hasUnits) confidence += 0.15;
  if (hasKeywords) confidence += 0.15;

  if (kind !== 'sizePair' && classification === kind) confidence += 0.15;

  if (kind === 'sizePair') {
    confidence = 0.75;
    if (/[xX×]/.test(rawValue)) confidence += 0.10;
    if (hasUnits) confidence += 0.10;
    if (optionNameLower.includes('size') || optionNameLower.includes('dimension')) confidence += 0.05;
    return clamp01(confidence);
  }

  if (kind === 'thickness') {
    if (optionNameLower.includes('thick') || optionNameLower === 'thickness') confidence += 0.15;
    if (/\bmm\b|millimeter/i.test(rawValue)) confidence += 0.15;
    if (/\b(?:inch|in)\b/i.test(rawValue)) confidence += 0.10;
    if (isPlainNumber) confidence -= 0.10;
    return clamp01(confidence);
  }

  if (kind === 'diameter') {
    if (optionNameLower.includes('diam') || optionNameLower.includes('round') || optionNameLower.includes('circle')) confidence += 0.15;
    if (/\b(?:diam(?:eter)?|dia\.?|ø|round|circle|circular)\b/i.test(rawValue)) confidence += 0.15;
    return clamp01(confidence);
  }

  if (kind === 'length' || kind === 'width') {
    if (optionNameLower.includes(kind)) confidence += 0.15;
    if (/\b(?:long|length|tall)\b/i.test(rawValue)) confidence += kind === 'length' ? 0.10 : 0;
    if (/\b(?:wide|width|narrow)\b/i.test(rawValue)) confidence += kind === 'width' ? 0.10 : 0;
    return clamp01(confidence);
  }

  return clamp01(confidence);
}

/**
 * Parses a dimension string and returns normalized values in cm
 * Examples:
 *   "Studio - 72\" L x 24\" W" → { length: 182.88, width: 60.96 }
 *   "72\" x 26\"" → { length: 182.88, width: 66.04 }
 *   "183cm x 61cm" → { length: 183, width: 61 }
 */
function parseDimensionString(dimStr: string): { length: number; width: number } | { length: number } | null {
  const bestPair = pickBestDimensionPairMatch(dimStr);
  if (bestPair) return { length: bestPair.length, width: bestPair.width };

  // Pattern 2: Single dimension (length only)
  const single = parseSingleLinearToCm(dimStr);
  if (single != null) return { length: single };

  return null;
}

function pickBestDimensionPairMatch(dimStr: string): { length: number; width: number; matchText: string } | null {
  // Pattern: Full dimensions (L x W), including inches/feet, with optional labels like 68"L / 24"W.
  const pairRe = /(\d+(?:\.\d+)?)\s*(cm|mm|inches?|inch|in\.?|ft\.?|feet|foot|["'″”’′“‘])?\s*(?:\b(?:l|w|length|width|long|wide)\b)?\s*[xX×]\s*(\d+(?:\.\d+)?)\s*(cm|mm|inches?|inch|in\.?|ft\.?|feet|foot|["'″”’′“‘])?\s*(?:\b(?:l|w|length|width|long|wide)\b)?/ig;
  const pairMatches = Array.from(dimStr.matchAll(pairRe));
  if (pairMatches.length === 0) return null;

  const candidates = pairMatches
    .map((match) => {
      const leftValue = parseFloat(match[1]);
      const rightValue = parseFloat(match[3]);
      if (!Number.isFinite(leftValue) || !Number.isFinite(rightValue)) return null;

      const inferred = inferUnlabeledLinearUnit(dimStr, leftValue, rightValue);
      const leftUnit = unitTokenToLinearUnit(match[2]) ?? unitTokenToLinearUnit(match[4]) ?? inferred;
      const rightUnit = unitTokenToLinearUnit(match[4]) ?? unitTokenToLinearUnit(match[2]) ?? inferred;

      // For unlabeled pairs like `24" × 72"`, brands frequently use W×L ordering. We normalize
      // to `length >= width` to keep product fields and sanity checks consistent.
      const leftCm = linearToCm(leftValue, leftUnit);
      const rightCm = linearToCm(rightValue, rightUnit);
      const minDim = Math.min(leftCm, rightCm);
      const maxDim = Math.max(leftCm, rightCm);
      const length = maxDim;
      const width = minDim;

      // Filter out "dimension pairs" that are really "width x thickness" (e.g., 24"W x 4mm).
      const looksLikeThicknessPair = minDim < 5 && maxDim > 25;
      if (looksLikeThicknessPair) return null;

      const hasExplicitUnit = Boolean(unitTokenToLinearUnit(match[2]) || unitTokenToLinearUnit(match[4]));
      const hasMetricUnit = isMetricUnit(leftUnit) || isMetricUnit(rightUnit);

      // Prefer plausible mat-ish ranges, but remain permissive for accessories.
      let score = 0;
      if (minDim >= 10) score += 2;
      if (minDim >= 20) score += 1;
      if (maxDim >= 50) score += 1;
      if (maxDim >= 100) score += 1;
      if (hasExplicitUnit) score += 0.5;
      if (hasMetricUnit) score += 0.25;

      // If one dimension is extremely small, penalize heavily even if it passed the thickness filter.
      if (minDim < 10) score -= 2;

      // Break ties by favoring the larger overall footprint.
      score += Math.min((length * width) / 20000, 2);

      return {
        length,
        width,
        matchText: match[0],
        score,
      };
    })
    .filter((value): value is { length: number; width: number; matchText: string; score: number } => value != null);

  if (candidates.length === 0) {
    // Fallback: previous behavior - pick the first metric pair if any, otherwise the first match.
    const preferred = pairMatches.find(m => {
      const leftUnit = unitTokenToLinearUnit(m[2]);
      const rightUnit = unitTokenToLinearUnit(m[4]);
      return (leftUnit && isMetricUnit(leftUnit)) || (rightUnit && isMetricUnit(rightUnit));
    }) ?? pairMatches[0];

    const leftValue = parseFloat(preferred[1]);
    const rightValue = parseFloat(preferred[3]);
    const inferred = inferUnlabeledLinearUnit(dimStr, leftValue, rightValue);
    const leftUnit = unitTokenToLinearUnit(preferred[2]) ?? unitTokenToLinearUnit(preferred[4]) ?? inferred;
    const rightUnit = unitTokenToLinearUnit(preferred[4]) ?? unitTokenToLinearUnit(preferred[2]) ?? inferred;

    const leftCm = linearToCm(leftValue, leftUnit);
    const rightCm = linearToCm(rightValue, rightUnit);
    const minDim = Math.min(leftCm, rightCm);
    const maxDim = Math.max(leftCm, rightCm);
    return { length: maxDim, width: minDim, matchText: preferred[0] };
  }

  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];
  return { length: best.length, width: best.width, matchText: best.matchText };
}

function parseDiameterString(value: string, assumeDiameter: boolean): number | null {
  if (/[xX×]/.test(value)) return null;

  const looksDiameter = assumeDiameter || /\b(?:diam(?:eter)?|dia\.?|ø|round|circle|circular)\b/i.test(value);
  if (!looksDiameter) return null;

  return parseSingleLinearToCm(value);
}

function extractRolledDiameter(product: ShopifyProduct, text: string): NormalizedYogaMat['rolledDiameter'] | undefined {
  const lower = text.toLowerCase();
  const hasRolled = /\broll(?:ed|s)?\b/.test(lower);
  const hasDiameter = /\bdiam(?:eter)?\b|\bdia\.?\b|ø/.test(lower);
  if (!hasRolled || !hasDiameter) return undefined;

  // Prefer patterns like: "6 in. diameter rolled" / "diameter: 6 in when rolled"
  const directPattern = /(\d+(?:\.\d+)?)\s*(cm|mm|inches?|inch|in\.?|ft\.?|feet|foot|["'″”’′“‘])\s*(?:\bdiam(?:eter)?\b|\bdia\.?\b|ø)\s*(?:when\s+)?\broll(?:ed|s)?\b/i;
  const direct = text.match(directPattern);
  if (direct) {
    const value = parseFloat(direct[1]);
    const unit = unitTokenToLinearUnit(direct[2]) ?? inferUnlabeledLinearUnit(text, value);
    if (Number.isFinite(value)) {
      return {
        value: linearToCm(value, unit),
        unit: 'cm',
        source: 'description',
        originalText: direct[0],
      };
    }
  }

  const reversePattern = /\broll(?:ed|s)?\b[\s\S]{0,40}?(\d+(?:\.\d+)?)\s*(cm|mm|inches?|inch|in\.?|ft\.?|feet|foot|["'″”’′“‘])(?:\s*(?:\bdiam(?:eter)?\b|\bdia\.?\b|ø))?/i;
  const reverse = text.match(reversePattern);
  if (reverse) {
    const value = parseFloat(reverse[1]);
    const unit = unitTokenToLinearUnit(reverse[2]) ?? inferUnlabeledLinearUnit(text, value);
    if (Number.isFinite(value)) {
      return {
        value: linearToCm(value, unit),
        unit: 'cm',
        source: 'description',
        originalText: reverse[0],
      };
    }
  }

  return undefined;
}

/**
 * Parses a thickness string and returns normalized value in mm
 * Examples:
 *   "5 MM" → 5
 *   "1/4 inch" → 6.35
 *   "3/16 inch thick" → 4.76
 */
function parseThicknessString(thicknessStr: string): number | null {
  // Pattern 1: MM/millimeter
  const mmMatch = thicknessStr.match(/(\d+(?:\.\d+)?)\s*(?:mm|millimeter)/i);
  if (mmMatch) {
    return parseFloat(mmMatch[1]);
  }

  // Pattern 2: Fractional inches (e.g., "1/4 inch", "3/16 inch")
  const fractionMatch = thicknessStr.match(/(\d+)\/(\d+)\s*(?:inches?|inch|in\.?|["″”“])/i);
  if (fractionMatch) {
    const numerator = parseFloat(fractionMatch[1]);
    const denominator = parseFloat(fractionMatch[2]);
    return (numerator / denominator) * 25.4; // Convert inches to mm
  }

  // Pattern 3: Decimal inches (e.g., "0.25 inch", "1/8 inch thick")
  const inchMatch = thicknessStr.match(/(\d+(?:\.\d+)?)\s*(?:inch|in)\b/i);
  if (inchMatch) {
    return parseFloat(inchMatch[1]) * 25.4; // Convert inches to mm
  }

  return null;
}

/**
 * Determines if a single dimension value is length or width based on context
 */
function classifySingleDimension(value: string, numValue: number, unit: 'cm' | 'inch'): 'length' | 'width' {
  const lowerValue = value.toLowerCase();

  // Check for explicit keywords
  if (lowerValue.includes('long') || lowerValue.includes('tall') || lowerValue.includes('standard') || lowerValue.includes('extended')) {
    return 'length';
  }
  if (lowerValue.includes('wide') || lowerValue.includes('narrow')) {
    return 'width';
  }

  // Use numeric heuristics (convert to cm for comparison)
  const valueInCm = unit === 'cm' ? numValue : numValue * 2.54;

  // Most yoga mats: length 68-85" (172-216cm), width 24-30" (61-76cm)
  if (valueInCm > 152) return 'length'; // > 60 inches
  if (valueInCm < 102) return 'width';  // < 40 inches

  // Ambiguous range (40-60 inches / 102-152cm)
  // Default to length as most single-dimension options specify length
  return 'length';
}

function extractLabeledDimensionPairFromText(text: string): { length: number; width: number; matchText: string } | undefined {
  const cleaned = text.replace(/\s+/g, ' ');

  const unitToken = String.raw`(?:"|″|“|”|inches?|in\.?|cm|mm|ft\.?|feet|foot|')`;
  const number = String.raw`(\d+(?:\.\d+)?)`;
  const valueWithUnit = String.raw`${number}\s*(${unitToken})?`;
  const optionalCmParen = String.raw`(?:\s*\(\s*(\d+(?:\.\d+)?)\s*cm\s*\))?`;
  const between = String.raw`\s*${optionalCmParen}\s*`;
  const sep = String.raw`\s*(?:x|×)\s*`;

  const toCmFromMatch = (rawNumber: string, rawUnit: string | undefined, parenCm: string | undefined, fullMatch: string): number => {
    if (parenCm && Number.isFinite(parseFloat(parenCm))) return parseFloat(parenCm);
    const n = parseFloat(rawNumber);
    const unit = unitTokenToLinearUnit(rawUnit) ?? inferUnlabeledLinearUnit(fullMatch, n);
    return linearToCm(n, unit);
  };

  // Examples:
  //   70" (178 cm) long x 24" (61 cm) wide
  //   178 cm long x 61 cm wide
  const longThenWide = new RegExp(
    String.raw`${valueWithUnit}${between}(?:long|length|l\b)${sep}${valueWithUnit}${between}(?:wide|width|w\b)`,
    'i'
  );

  const wideThenLong = new RegExp(
    String.raw`${valueWithUnit}${between}(?:wide|width|w\b)${sep}${valueWithUnit}${between}(?:long|length|l\b)`,
    'i'
  );

  const m1 = cleaned.match(longThenWide);
  if (m1) {
    const length = toCmFromMatch(m1[1], m1[2], m1[3], m1[0]);
    const width = toCmFromMatch(m1[4], m1[5], m1[6], m1[0]);
    return { length, width, matchText: m1[0] };
  }

  const m2 = cleaned.match(wideThenLong);
  if (m2) {
    const width = toCmFromMatch(m2[1], m2[2], m2[3], m2[0]);
    const length = toCmFromMatch(m2[4], m2[5], m2[6], m2[0]);
    return { length, width, matchText: m2[0] };
  }

  return undefined;
}

/**
 * Extracts dimensions from options (priority) or text (fallback)
 * Returns length and width in cm
 */
function extractDimensions(product: ShopifyProduct, text: string): {
  length?: {
    value: number; // Always in cm (normalized)
    unit: 'cm'; // Always 'cm' (normalized unit)
    source: 'options' | 'description';
    originalText: string; // Original text with original unit
  };
  width?: {
    value: number; // Always in cm (normalized)
    unit: 'cm'; // Always 'cm' (normalized unit)
    source: 'options' | 'description';
    originalText: string; // Original text with original unit
  };
} {
  // First, try to extract from options
  const fromOptions: {
    length?: {
      value: number;
      unit: 'cm';
      source: 'options';
      originalText: string;
    };
    width?: {
      value: number;
      unit: 'cm';
      source: 'options';
      originalText: string;
    };
  } = {};

  if (product.options) {
    for (const option of product.options) {
      const optionName = option.name.toLowerCase();
      if (optionName === 'size' || optionName === 'dimensions' || optionName === 'dimension') {
        // Check for dimension patterns in values
        for (const value of option.values) {
          // Try to match length x width (e.g., "72\" x 26\"", "183cm x 61cm")
          const parsedPair = parseDimensionString(value);
          if (parsedPair && 'width' in parsedPair) {
            const length = parsedPair.length;
            const width = parsedPair.width;

            // Full pair in options is highest priority; return immediately.
            return {
              length: {
                value: length, // Normalized to cm
                unit: 'cm', // Normalized unit
                source: 'options',
                originalText: value,
              },
              width: {
                value: width, // Normalized to cm
                unit: 'cm', // Normalized unit
                source: 'options',
                originalText: value,
              }
            };
          }

          // Try to match single dimension (e.g., "Standard 71\"", "Long 85\"", "215cm")
          const parsedSingle = parseDimensionString(value);
          if (parsedSingle && !('width' in parsedSingle)) {
            const numValue = parsedSingle.length;

            // Avoid misclassifying thickness-only values like "3.5mm" as width/length.
            if (numValue < 20) {
              continue;
            }

            // Classify as length or width
            const dimension = classifySingleDimension(value, numValue, 'cm');

            if (dimension === 'length') {
              if (!fromOptions.length) {
                fromOptions.length = {
                  value: numValue, // Normalized to cm
                  unit: 'cm', // Normalized unit
                  source: 'options',
                  originalText: value,
                };
              }
            } else {
              if (!fromOptions.width) {
                fromOptions.width = {
                  value: numValue, // Normalized to cm
                  unit: 'cm', // Normalized unit
                  source: 'options',
                  originalText: value,
                };
              }
            }
          }
        }
      }
    }
  }

  if (fromOptions.length && fromOptions.width) {
    return fromOptions;
  }

  // Fallback: extract from text
  const cleanedText = stripHtml(text);

  const merged: {
    length?: {
      value: number;
      unit: 'cm';
      source: 'options' | 'description';
      originalText: string;
    };
    width?: {
      value: number;
      unit: 'cm';
      source: 'options' | 'description';
      originalText: string;
    };
  } = { ...fromOptions };

  // Pattern 0: Try explicit "long x wide" patterns (handles optional "(178 cm)" parentheticals).
  const labeledPair = extractLabeledDimensionPairFromText(cleanedText);
  if (labeledPair) {
    if (!merged.length) {
      merged.length = {
        value: labeledPair.length,
        unit: 'cm',
        source: 'description',
        originalText: labeledPair.matchText,
      };
    }
    if (!merged.width) {
      merged.width = {
        value: labeledPair.width,
        unit: 'cm',
        source: 'description',
        originalText: labeledPair.matchText,
      };
    }
    return merged;
  }

  // Pattern 1: Try L x W format first (e.g., "72\" x 26\"", "183cm x 61cm")
  const parsedLxW = pickBestDimensionPairMatch(cleanedText);
  if (parsedLxW) {
    const length = parsedLxW.length;
    const width = parsedLxW.width;
    const originalText = parsedLxW.matchText ?? cleanedText;

    if (!merged.length) {
      merged.length = {
        value: length, // Normalized to cm
        unit: 'cm', // Normalized unit
        source: 'description',
        originalText,
      };
    }
    if (!merged.width) {
      merged.width = {
        value: width, // Normalized to cm
        unit: 'cm', // Normalized unit
        source: 'description',
        originalText,
      };
    }
    return merged;
  }

  // Pattern 2: Try separate "X\" Long" and "X\" Wide" patterns
  // Examples: "80\" Long and 28\" Wide", "28\" wide and is available 80\" long"
  const result: {
    length?: {
      value: number; // Always in cm (normalized)
      unit: 'cm'; // Always 'cm' (normalized unit)
      source: 'options' | 'description';
      originalText: string; // Original text with original unit
    };
    width?: {
      value: number; // Always in cm (normalized)
      unit: 'cm'; // Always 'cm' (normalized unit)
      source: 'options' | 'description';
      originalText: string; // Original text with original unit
    };
  } = merged;

  const maybeParen = String.raw`(?:\s*\([^)]{0,60}\))?`;

  // Match length patterns
  const lengthPatterns = [
    new RegExp(String.raw`(\d+(?:\.\d+)?)\s*(inch|inches|in\.?|["″”“]|cm)?${maybeParen}\\s*(?:long|length|l\\b)`, 'i'),
    // e.g. "available in two lengths: 68\" and 74\"" (captures the first value)
    /(?:lengths?|length)\s*[:=]?\s*(\d+(?:\.\d+)?)\s*(inch|inches|in\.?|["″”“]|cm)/i,
  ];

  for (const pattern of lengthPatterns) {
    const lengthMatch = cleanedText.match(pattern);
    if (lengthMatch) {
      const lengthValue = parseFloat(lengthMatch[1]);
      const unitToken = lengthMatch[2];
      const unit = unitTokenToLinearUnit(unitToken) ?? inferUnlabeledLinearUnit(lengthMatch[0], lengthValue);
      const valueInCm = linearToCm(lengthValue, unit);

      result.length = {
        value: valueInCm, // Normalized to cm
        unit: 'cm', // Normalized unit
        source: 'description',
        originalText: lengthMatch[0],
      };
      break;
    }
  }

  // Match width patterns
  const widthPatterns = [
    new RegExp(String.raw`(\d+(?:\.\d+)?)\s*(inch|inches|in\.?|["″”“]|cm)?${maybeParen}\\s*(?:wide|width|w\\b)`, 'i'),
    /(?:width)\s*[:=]?\s*(\d+(?:\.\d+)?)\s*(inch|inches|in\.?|["″”“]|cm)/i,
  ];

  for (const pattern of widthPatterns) {
    const widthMatch = cleanedText.match(pattern);
    if (widthMatch) {
      const widthValue = parseFloat(widthMatch[1]);
      const unitToken = widthMatch[2];
      const unit = unitTokenToLinearUnit(unitToken) ?? inferUnlabeledLinearUnit(widthMatch[0], widthValue);
      const valueInCm = linearToCm(widthValue, unit);

      result.width = {
        value: valueInCm, // Normalized to cm
        unit: 'cm', // Normalized unit
        source: 'description',
        originalText: widthMatch[0],
      };
      break;
    }
  }

  // Final fallback: if width is still missing, infer from any linear measurements in text.
  // This helps cases like: `24" wide, available in two lengths: 68" and 74"` where the
  // "wide" keyword may be separated by extra tokens/markup.
  if (!result.width) {
    const candidates = Array.from(
      cleanedText.matchAll(/(?<!\/)(\d+(?:\.\d+)?)\s*(cm|mm|inches?|inch|in\.?|ft\.?|feet|foot|["'″”’′“‘])/ig)
    )
      .map((m) => {
        const value = parseFloat(m[1]);
        const unit = unitTokenToLinearUnit(m[2]);
        if (!Number.isFinite(value) || !unit) return null;
        return { valueCm: linearToCm(value, unit), matchText: m[0] };
      })
      .filter((v): v is { valueCm: number; matchText: string } => Boolean(v && Number.isFinite(v.valueCm)))
      // Filter out thickness-like values (mm-cm small) and keep plausible mat widths.
      .filter((v) => v.valueCm >= 40 && v.valueCm <= 110);

    if (candidates.length > 0) {
      // Prefer the smallest plausible width if multiple candidates exist.
      candidates.sort((a, b) => a.valueCm - b.valueCm);
      const picked = candidates[0];
      result.width = {
        value: picked.valueCm,
        unit: 'cm',
        source: 'description',
        originalText: picked.matchText,
      };
    }
  }

  // Return if we found at least length or width
  if (result.length || result.width) return result;
  return {};
}

/**
 * Extracts weight from text or variant grams
 * Returns structured data with value normalized to kg
 */
function extractWeight(product: ShopifyProduct, text: string): {
  value: number; // Always in kg (normalized)
  unit: 'kg'; // Always 'kg' (normalized unit)
  source: 'description' | 'variants';
  originalText: string; // Original text with original unit
} | undefined {
  // Try extracting from text first
  const patterns = [
    { regex: /(\d+(?:\.\d+)?)\s*kg/i, unit: 'kg' as const },
    { regex: /(\d+(?:\.\d+)?)\s*(?:lbs?|pounds?)/i, unit: 'lb' as const },
    { regex: /(\d+)\s*grams/i, unit: 'g' as const },
  ];

  for (const { regex, unit } of patterns) {
    const match = text.match(regex);
    if (match) {
      const value = parseFloat(match[1]);
      const originalText = match[0];
      let valueInKg: number;

      if (unit === 'kg') {
        valueInKg = value; // Already in kg
      } else if (unit === 'lb') {
        valueInKg = value / 2.20462; // Convert lbs to kg
      } else { // unit === 'g'
        valueInKg = value / 1000; // Convert grams to kg
      }

      return {
        value: valueInKg, // Normalized to kg
        unit: 'kg', // Normalized unit
        source: 'description',
        originalText,
      };
    }
  }

  return undefined;
}

/**
 * Extracts material type from text
 */
function extractMaterialsMeta(title: string, description: string, tags: string[]): {
  material?: MaterialType;
  materials?: MaterialType[];
  materialSource?: TextSource;
  materialConfidence?: number;
  pvcFree?: boolean;
} {
  const materialMap: Record<string, MaterialType> = {
    'natural rubber': 'Natural Rubber',
    'rubber': 'Natural Rubber',
    'pu leather': 'PU Leather',
    'polyurethane': 'PU Leather',
    'eco-pu': 'PU Leather',
    'eco pu': 'PU Leather',
    'pvc': 'PVC',
    'tpe': 'TPE',
    'cork': 'Cork',
    'jute': 'Jute',
    'cotton': 'Cotton',
    'nbr': 'NBR',
  };

  // Avoid false positives like "100% cork" matching "0%" within "100%".
  const negationRegex = /(?:free of|no|without|zero|non-|(?<!\d)0%)\s+[^.\,]+?(?=\s+is|base|gives|\.|\,|$)/g;
  const sortedKeys = Object.keys(materialMap).sort((a, b) => b.length - a.length);

  const detectPvcFree = (text: string): boolean => {
    const lower = text.toLowerCase();
    return /\bpvc\s*[-–—]?\s*free\b/.test(lower) || /\bfree\s+of\s+pvc\b/.test(lower);
  };

  const pvcFree = detectPvcFree(title) || detectPvcFree(description) || detectPvcFree(tags.join(' '));

  const detectAllInText = (text: string): MaterialType[] => {
    let cleanText = text.toLowerCase();
    cleanText = cleanText.replace(negationRegex, '');
    // Remove common "PVC-free" signals so we don't misclassify PVC-free mats as PVC.
    cleanText = cleanText.replace(/\bpvc\s*[-–—]?\s*free\b/g, '');
    cleanText = cleanText.replace(/\bfree\s+of\s+pvc\b/g, '');

    // Cotton often appears in accessory copy (e.g. "cotton strap included") and should not
    // be treated as the mat material unless explicitly tied to a mat/rug.
    if (/\bcotton\b/i.test(cleanText)) {
      const cottonMatRegex = /\bcotton\b[\s\S]{0,30}\b(?:yoga\s+)?(?:mat|rug)\b(?!\s*(?:strap|straps|carry|carrying|carrier|bag|bags|tote|sling|case|cover|pouch))|\b(?:yoga\s+)?(?:mat|rug)\b(?!\s*(?:strap|straps|carry|carrying|carrier|bag|bags|tote|sling|case|cover|pouch))[\s\S]{0,30}\bcotton\b/i;
      const cottonAccessoryRegex = /\bcotton\b[\s\S]{0,80}\b(?:strap|straps|carry|carrying|carrier|bag|bags|tote|sling|case|cover|pouch)\b|\b(?:strap|straps|carry|carrying|carrier|bag|bags|tote|sling|case|cover|pouch)\b[\s\S]{0,80}\bcotton\b/i;
      if (cottonAccessoryRegex.test(cleanText) && !cottonMatRegex.test(cleanText)) {
        cleanText = cleanText.replace(/\bcotton\b/gi, '');
      }
    }

    const found: MaterialType[] = [];
    for (const key of sortedKeys) {
      const regex = new RegExp(`\\b${key}\\b`, 'i');
      if (regex.test(cleanText)) {
        const material = materialMap[key];
        if (!found.includes(material)) found.push(material);
      }
    }
    return found;
  };

  const titleMaterials = detectAllInText(title);
  const tagMaterials = detectAllInText(tags.join(' '));
  const descriptionMaterials = detectAllInText(description);

  const allMaterials = Array.from(
    new Set([...titleMaterials, ...tagMaterials, ...descriptionMaterials])
  );

  const pickPrimary = (): { material?: MaterialType; source?: TextSource; confidence?: number } => {
    // Priority: title → tags → description
    // This prevents accessory mentions in the description (e.g., "cotton strap included")
    // from overriding the primary material in the title (e.g., "100% cork mat").
    if (titleMaterials.length > 0) {
      const material = titleMaterials[0];
      let confidence = 0.92;
      if (/\b100%\b/.test(title)) confidence += 0.05;
      if (/\bcork\b/i.test(title) && material === 'Cork') confidence += 0.03;
      return { material, source: 'title', confidence: clamp01(confidence) };
    }

    if (tagMaterials.length > 0) {
      return { material: tagMaterials[0], source: 'tags', confidence: 0.78 };
    }

    if (descriptionMaterials.length > 0) {
      const material = descriptionMaterials[0];
      let confidence = 0.65;
      if (/\bblend\b|\bcomposite\b/i.test(description)) confidence -= 0.05;
      return { material, source: 'description', confidence: clamp01(confidence) };
    }

    return {};
  };

  const primary = pickPrimary();

  return {
    material: primary.material,
    materials: allMaterials.length > 0 ? allMaterials : undefined,
    materialSource: primary.source,
    materialConfidence: primary.confidence,
    pvcFree: pvcFree || undefined,
  };
}

function extractTexturesMeta(title: string, description: string, tags: string[]): {
  texture?: TextureType;
  textures?: TextureType[];
  textureSource?: TextSource;
  textureConfidence?: number;
} {
  const textureKeywords: Array<{
    type: TextureType;
    patterns: RegExp[];
  }> = [
    { type: 'Suede-like', patterns: [/\bsuede\b/i, /\bmicrofiber\b/i, /\bsuede[-\s]?like\b/i] },
    { type: 'Textured', patterns: [/\btextured\b/i, /\btexture\b/i, /\bridged\b/i, /\braised\b/i] },
    { type: 'Grippy', patterns: [/\bgrippy\b/i, /\bnon[-\s]?slip\b/i, /\bnonslip\b/i, /\bsticky\b/i, /\bgrip\b/i] },
    { type: 'Smooth', patterns: [/\bsmooth\b/i] },
  ];

  const detectAll = (text: string): TextureType[] => {
    const found: TextureType[] = [];
    for (const { type, patterns } of textureKeywords) {
      if (patterns.some(p => p.test(text))) {
        found.push(type);
      }
    }
    return found;
  };

  const titleTextures = detectAll(title);
  const tagTextures = detectAll(tags.join(' '));
  const descriptionTextures = detectAll(description);

  const allTextures = Array.from(
    new Set([...titleTextures, ...tagTextures, ...descriptionTextures])
  );

  const pickPrimary = (): { texture?: TextureType; source?: TextSource; confidence?: number } => {
    if (titleTextures.length > 0) return { texture: titleTextures[0], source: 'title', confidence: 0.85 };
    if (tagTextures.length > 0) return { texture: tagTextures[0], source: 'tags', confidence: 0.75 };
    if (descriptionTextures.length > 0) return { texture: descriptionTextures[0], source: 'description', confidence: 0.65 };
    return {};
  };

  const primary = pickPrimary();

  return {
    texture: primary.texture,
    textures: allTextures.length > 0 ? allTextures : undefined,
    textureSource: primary.source,
    textureConfidence: primary.confidence,
  };
}

/**
 * Extracts features from description and tags
 */
function extractFeatures(text: string, tags: string[]): YogaMatFeature[] {
  const allText = `${text} ${tags.join(' ')}`.toLowerCase();
  const features: YogaMatFeature[] = [];

  const featureKeywords: Record<YogaMatFeature, string[]> = {
    // Note: "PVC-free" is tracked separately via `pvcFree` and should not be treated as a material or a generic feature.
    'Eco-Friendly': ['eco', 'sustainable', 'planet friendly', 'recycled', 'biodegradable', 'plant foam base', 'renewable'],
    'Reversible': ['reversible', 'two-sided', 'dual-sided'],
    'Non-Slip': ['non-slip', 'non slip', 'grippy', 'grip'],
    'Lightweight': ['lightweight', 'light weight', 'portable', 'extra light'],
    'Travel': ['travel', 'travel mat', 'traveling', 'travelling', 'travel-friendly', 'travel friendly', 'foldable'],
    'Alignment Marks': ['alignment', 'alignment marks', 'markers', 'guide', 'alignforme'],
    'Antimicrobial': ['antimicrobial', 'antibacterial', 'hygienic'],
    'Closed-Cell': ['closed-cell', 'closed cell', 'moisture resistant'],
    'Premium': ['premium', 'high-end', 'luxurious'],
  };

  for (const [feature, keywords] of Object.entries(featureKeywords)) {
    if (keywords.some(keyword => allText.includes(keyword))) {
      features.push(feature as YogaMatFeature);
    }
  }

  // Guardrail: dimension-like labels belong in `sizeTags` + buckets, not `features`.
  const blocked: Set<YogaMatFeature> = new Set(['Extra Thick', 'Extra Long', 'Extra Wide']);
  return Array.from(new Set(features)).filter(f => !blocked.has(f));
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

function getVariantPriceValues(product: ShopifyProduct): number[] | undefined {
  const prices = product.variants
    .map(v => parseFloat(v.price))
    .filter(p => Number.isFinite(p) && p > 0);

  if (prices.length === 0) return undefined;

  return Array.from(new Set(prices)).sort((a, b) => a - b);
}

type ExchangeRatesConfig = {
  usdPerUnit?: Record<string, number>;
};

let cachedBrandCurrency: Map<string, string> | null = null;
let cachedExchangeRates: ExchangeRatesConfig | null = null;

function loadBrandCurrency(): Map<string, string> {
  if (cachedBrandCurrency) return cachedBrandCurrency;
  const map = new Map<string, string>();
  try {
    const filepath = path.join(process.cwd(), 'config', 'brand-currency.json');
    if (!existsSync(filepath)) {
      cachedBrandCurrency = map;
      return map;
    }
    const raw = readFileSync(filepath, 'utf-8');
    const parsed = JSON.parse(raw) as unknown;
    const record = (parsed as { brandCurrency?: Record<string, string> })?.brandCurrency;
    if (record && typeof record === 'object') {
      for (const [key, value] of Object.entries(record)) {
        const brandSlug = String(key ?? '').toLowerCase().trim();
        const currency = String(value ?? '').toUpperCase().trim();
        if (!brandSlug || !currency) continue;
        map.set(brandSlug, currency);
      }
    }
  } catch {
    // ignore
  }
  cachedBrandCurrency = map;
  return map;
}

function loadExchangeRates(): ExchangeRatesConfig {
  if (cachedExchangeRates) return cachedExchangeRates;
  try {
    const filepath = path.join(process.cwd(), 'config', 'exchange-rates.json');
    if (!existsSync(filepath)) {
      cachedExchangeRates = {};
      return cachedExchangeRates;
    }
    const raw = readFileSync(filepath, 'utf-8');
    const parsed = JSON.parse(raw) as ExchangeRatesConfig;
    cachedExchangeRates = parsed && typeof parsed === 'object' ? parsed : {};
    return cachedExchangeRates;
  } catch {
    cachedExchangeRates = {};
    return cachedExchangeRates;
  }
}

function getBrandPriceCurrency(brandSlug: string): string {
  const slug = (brandSlug ?? '').toLowerCase().trim();
  const map = loadBrandCurrency();
  return map.get(slug) ?? 'USD';
}

function getUsdPerUnit(currency: string): number | undefined {
  const cur = (currency ?? '').toUpperCase().trim();
  if (!cur) return undefined;
  const envKey = `YML_FX_USD_PER_${cur}`;
  const envValue = (process.env as Record<string, string | undefined>)[envKey];
  if (envValue) {
    const parsed = parseFloat(envValue);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  const config = loadExchangeRates();
  const rate = config.usdPerUnit?.[cur];
  return typeof rate === 'number' && Number.isFinite(rate) && rate > 0 ? rate : undefined;
}

function convertPricesToUsd(values: number[] | undefined, currency: string): { values?: number[]; rate?: number } {
  const cur = (currency ?? '').toUpperCase().trim();
  if (!values || values.length === 0) return {};
  if (cur === 'USD') return { values, rate: 1 };
  const usdPerUnit = getUsdPerUnit(cur);
  if (!usdPerUnit) return {};
  const converted = values
    .map(v => v * usdPerUnit)
    .filter(v => Number.isFinite(v) && v > 0)
    // Round to cents for stable outputs.
    .map(v => Math.round(v * 100) / 100);
  if (converted.length === 0) return {};
  return { values: Array.from(new Set(converted)).sort((a, b) => a - b), rate: usdPerUnit };
}

/**
 * Gets weight range from variants (in grams)
 */
function getGramsRange(product: ShopifyProduct): { min: number; max: number } | undefined {
  const grams = product.variants.map(v => v.grams).filter(g => g > 0);

  if (grams.length === 0) return undefined;

  return {
    min: Math.min(...grams),
    max: Math.max(...grams),
  };
}

function getVariantGramsValues(product: ShopifyProduct): number[] | undefined {
  const grams = product.variants
    .map(v => v.grams)
    .filter(g => Number.isFinite(g) && g > 0);

  if (grams.length === 0) return undefined;

  return Array.from(new Set(grams)).sort((a, b) => a - b);
}

function getVariantGramsSanity(product: ShopifyProduct): {
  zeroOrMissingCount: number;
  coverage: number;
  allZeroOrMissing: boolean;
} {
  const total = product.variants.length;
  if (total === 0) {
    return {
      zeroOrMissingCount: 0,
      coverage: 0,
      allZeroOrMissing: true,
    };
  }

  const zeroOrMissingCount = product.variants.reduce((count, variant) => {
    const grams = variant.grams;
    if (!Number.isFinite(grams) || grams <= 0) return count + 1;
    return count;
  }, 0);

  const coverage = (total - zeroOrMissingCount) / total;

  return {
    zeroOrMissingCount,
    coverage,
    allZeroOrMissing: zeroOrMissingCount === total,
  };
}

/**
 * Checks if any variant is available
 */
function getAvailability(product: ShopifyProduct): boolean {
  return product.variants.some(v => v.available);
}

/**
 * Maps product images from Shopify format
 */
function mapImages(product: ShopifyProduct): Array<{
  src: string;
  alt: string | null;
  width: number;
  height: number;
  position: number;
}> | undefined {
  if (!product.images || product.images.length === 0) return undefined;

  return product.images.map(img => ({
    src: img.src,
    alt: img.alt,
    width: img.width,
    height: img.height,
    position: img.position,
  }));
}

/**
 * Maps product options from Shopify format
 */
function mapOptions(product: ShopifyProduct): Array<{
  name: string;
  position: number;
  values: string[];
}> | undefined {
  if (!product.options || product.options.length === 0) return undefined;

  return product.options.map(opt => ({
    name: opt.name,
    position: opt.position,
    values: opt.values,
  }));
}

function extractDiameter(product: ShopifyProduct, text: string): {
  value: number;
  unit: 'cm';
  source: 'options' | 'description';
  originalText: string;
} | undefined {
  // Avoid misclassifying "diameter rolled" as a round mat diameter.
  if (extractRolledDiameter(product, text)) return undefined;

  if (product.options) {
    for (const option of product.options) {
      const optionName = option.name.toLowerCase();
      const assumeDiameter = optionName.includes('diameter') || optionName.includes('round') || optionName === 'dia';

      for (const value of option.values) {
        if (value === 'Default Title') continue;

        const parsed = parseDiameterString(value, assumeDiameter);
        if (parsed != null) {
          return {
            value: parsed,
            unit: 'cm',
            source: 'options',
            originalText: value,
          };
        }
      }
    }
  }

  const directPattern = /(?:\bdiam(?:eter)?\b|\bdia\.?\b|ø|\bround\b|\bcircle\b|\bcircular\b)\s*[:\-]?\s*(\d+(?:\.\d+)?)\s*(cm|mm|inches?|inch|in\.?|ft\.?|feet|foot|["'″”’′“‘])/i;
  const directMatch = text.match(directPattern);
  if (directMatch) {
    const value = parseFloat(directMatch[1]);
    const unit = unitTokenToLinearUnit(directMatch[2]) ?? inferUnlabeledLinearUnit(text, value);
    if (Number.isFinite(value)) {
      return {
        value: linearToCm(value, unit),
        unit: 'cm',
        source: 'description',
        originalText: directMatch[0],
      };
    }
  }

  const reversePattern = /(\d+(?:\.\d+)?)\s*(cm|mm|inches?|inch|in\.?|ft\.?|feet|foot|["'″”’′“‘])\s*(?:\bdiam(?:eter)?\b|\bdia\.?\b|ø|\bround\b|\bcircle\b)/i;
  const reverseMatch = text.match(reversePattern);
  if (reverseMatch) {
    const value = parseFloat(reverseMatch[1]);
    const unit = unitTokenToLinearUnit(reverseMatch[2]) ?? inferUnlabeledLinearUnit(text, value);
    if (Number.isFinite(value)) {
      return {
        value: linearToCm(value, unit),
        unit: 'cm',
        source: 'description',
        originalText: reverseMatch[0],
      };
    }
  }

  return undefined;
}

/**
 * Extracts available colors from options ONLY (no variant fallback)
 * Returns undefined if no explicit color option exists
 */
function extractColors(product: ShopifyProduct): string[] | undefined {
  if (!product.options) return undefined;

  for (const option of product.options) {
    const optionName = option.name.toLowerCase();

    // Match explicit color option names
    if (isColorOptionName(optionName)) {
      const classification = classifyOptionValues(option.values);
      // Skip if this option contains thickness or dimensions (not colors)
      if (classification === 'thickness' || classification === 'dimensions' || classification === 'length' || classification === 'diameter') {
        continue;
      }

      return option.values.filter(v => v && v !== 'Default Title');
    }
  }

  // NO FALLBACK to variants - return undefined if no color option exists
  return undefined;
}

function extractEnrichedColorsFromSections(sections: Array<{ heading: string; items: string[] }> | undefined): string[] | undefined {
  if (!sections?.length) return undefined;

  const colorsSection = sections.find(s => {
    const heading = (s.heading ?? '').trim().toLowerCase();
    return heading === 'colors' || heading === 'colour' || heading === 'colours' || heading === 'color';
  });

  const items = colorsSection?.items?.filter((item) => typeof item === 'string') ?? [];
  const cleaned = items
    .map(v => v.replace(/\s+/g, ' ').trim())
    .filter(v => v.length > 0 && v !== 'Default Title');

  return cleaned.length > 0 ? cleaned : undefined;
}

function mergeUniqueStrings(primary: string[] | undefined, secondary: string[] | undefined): string[] | undefined {
  const all = [...(primary ?? []), ...(secondary ?? [])].filter(Boolean);
  if (all.length === 0) return undefined;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of all) {
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

type DimensionOptions = NonNullable<NormalizedYogaMat['dimensionOptions']>;

function extractDimensionOptionsFromText(text: string): DimensionOptions | undefined {
  const cleaned = stripHtml(text ?? '');
  if (!cleaned) return undefined;

  const thicknessCandidates: Array<NonNullable<DimensionOptions['thicknessMm']>[number]> = [];
  const rawMatches = Array.from(cleaned.matchAll(/(?<!\/)(\d+(?:\.\d+)?)\s*(?:mm|millimeter)\b/ig));

  for (const match of rawMatches) {
    const value = parseFloat(match[1]);
    if (!Number.isFinite(value) || value <= 0 || value > 30) continue; // thickness mm sanity

    const index = match.index ?? 0;
    const window = cleaned.slice(Math.max(0, index - 40), Math.min(cleaned.length, index + match[0].length + 40)).toLowerCase();
    const hasThicknessKeyword = /\bthick(?:ness)?\b/.test(window);
    const hasOptionsKeyword = /\boption(s)?\b/.test(window);

    let confidence = 0.62;
    if (hasThicknessKeyword) confidence += 0.15;
    if (hasOptionsKeyword) confidence += 0.10;

    pushUnique(thicknessCandidates, {
      value,
      sourceOptionName: 'description',
      rawValue: match[0],
      confidence: clamp01(confidence),
    }, (t) => `${t.value}|${t.sourceOptionName}|${t.rawValue}`);
  }

  if (thicknessCandidates.length === 0) return undefined;

  const candidateCount = rawMatches.length;
  const parsedCount = thicknessCandidates.length;
  const unparsedCount = Math.max(0, candidateCount - parsedCount);

  return {
    sanity: {
      candidateCount,
      parsedCount,
      unparsedCount,
      coverage: candidateCount > 0 ? parsedCount / candidateCount : 0,
      allUnparsed: candidateCount > 0 && parsedCount === 0,
    },
    thicknessMm: thicknessCandidates,
    rawUnparsed: [],
  };
}

function mergeDimensionOptions(primary: DimensionOptions | undefined, secondary: DimensionOptions | undefined): DimensionOptions | undefined {
  if (!primary && !secondary) return undefined;
  if (!primary) return secondary;
  if (!secondary) return primary;

  const merged: DimensionOptions = {
    sanity: {
      candidateCount: (primary.sanity?.candidateCount ?? 0) + (secondary.sanity?.candidateCount ?? 0),
      parsedCount: (primary.sanity?.parsedCount ?? 0) + (secondary.sanity?.parsedCount ?? 0),
      unparsedCount: (primary.sanity?.unparsedCount ?? 0) + (secondary.sanity?.unparsedCount ?? 0),
      coverage: 0,
      allUnparsed: false,
    },
    thicknessMm: [...(primary.thicknessMm ?? [])],
    lengthCm: primary.lengthCm ? [...primary.lengthCm] : undefined,
    widthCm: primary.widthCm ? [...primary.widthCm] : undefined,
    diameterCm: primary.diameterCm ? [...primary.diameterCm] : undefined,
    rolledDiameterCm: primary.rolledDiameterCm ? [...primary.rolledDiameterCm] : undefined,
    sizePairsCm: primary.sizePairsCm ? [...primary.sizePairsCm] : undefined,
    rawUnparsed: [...(primary.rawUnparsed ?? [])],
  };

  const mergeValueList = <T extends { value: any; sourceOptionName: string; rawValue: string }>(
    target: T[] | undefined,
    incoming: T[] | undefined,
    keyFn: (item: T) => string
  ): T[] | undefined => {
    if (!incoming || incoming.length === 0) return target;
    const out = target ? [...target] : [];
    for (const item of incoming) pushUnique(out, item, keyFn);
    return out.length > 0 ? out : undefined;
  };

  merged.thicknessMm = mergeValueList(
    merged.thicknessMm,
    secondary.thicknessMm,
    (t) => `${t.value}|${t.sourceOptionName}|${t.rawValue}`
  );
  merged.lengthCm = mergeValueList(
    merged.lengthCm,
    secondary.lengthCm,
    (t) => `${t.value}|${t.sourceOptionName}|${t.rawValue}`
  );
  merged.widthCm = mergeValueList(
    merged.widthCm,
    secondary.widthCm,
    (t) => `${t.value}|${t.sourceOptionName}|${t.rawValue}`
  );
  merged.diameterCm = mergeValueList(
    merged.diameterCm,
    secondary.diameterCm,
    (t) => `${t.value}|${t.sourceOptionName}|${t.rawValue}`
  );
  merged.rolledDiameterCm = mergeValueList(
    merged.rolledDiameterCm,
    secondary.rolledDiameterCm,
    (t) => `${t.value}|${t.sourceOptionName}|${t.rawValue}`
  );
  merged.sizePairsCm = mergeValueList(
    merged.sizePairsCm,
    secondary.sizePairsCm,
    (t) => `${t.value.lengthCm}x${t.value.widthCm}|${t.sourceOptionName}|${t.rawValue}`
  );
  merged.rawUnparsed = mergeValueList(
    merged.rawUnparsed,
    secondary.rawUnparsed,
    (t) => `${t.sourceOptionName}|${t.rawValue}`
  ) ?? [];

  const candidateCount = merged.sanity.candidateCount;
  const parsedCount = merged.sanity.parsedCount;
  merged.sanity.coverage = candidateCount > 0 ? parsedCount / candidateCount : 0;
  merged.sanity.allUnparsed = candidateCount > 0 && parsedCount === 0;

  return merged;
}

function deriveDimensionQueryFields(params: {
  thickness?: NormalizedYogaMat['thickness'];
  length?: NormalizedYogaMat['length'];
  width?: NormalizedYogaMat['width'];
  diameter?: NormalizedYogaMat['diameter'];
  rolledDiameter?: NormalizedYogaMat['rolledDiameter'];
  dimensionOptions?: NormalizedYogaMat['dimensionOptions'];
}): Pick<
  NormalizedYogaMat,
  | 'thicknessMmMin'
  | 'thicknessMmMax'
  | 'lengthCmMin'
  | 'lengthCmMax'
  | 'widthCmMin'
  | 'widthCmMax'
  | 'diameterCmMin'
  | 'diameterCmMax'
  | 'rolledDiameterCmMin'
  | 'rolledDiameterCmMax'
  | 'thicknessMmx10Values'
  | 'lengthCMx10Values'
  | 'widthCMx10Values'
  | 'diameterCMx10Values'
  | 'rolledDiameterCMx10Values'
  | 'sizePairsCMx10Values'
> {
  const thicknessMmValues: number[] = [];
  const lengthCmValues: number[] = [];
  const widthCmValues: number[] = [];
  const diameterCmValues: number[] = [];
  const rolledDiameterCmValues: number[] = [];
  const sizePairs: Array<{ lengthCm: number; widthCm: number }> = [];

  if (params.dimensionOptions) {
    params.dimensionOptions.thicknessMm?.forEach(t => thicknessMmValues.push(t.value));
    params.dimensionOptions.lengthCm?.forEach(l => lengthCmValues.push(l.value));
    params.dimensionOptions.widthCm?.forEach(w => widthCmValues.push(w.value));
    params.dimensionOptions.diameterCm?.forEach(d => diameterCmValues.push(d.value));
    params.dimensionOptions.rolledDiameterCm?.forEach(d => rolledDiameterCmValues.push(d.value));
    params.dimensionOptions.sizePairsCm?.forEach(p => {
      lengthCmValues.push(p.value.lengthCm);
      widthCmValues.push(p.value.widthCm);
      sizePairs.push({ lengthCm: p.value.lengthCm, widthCm: p.value.widthCm });
    });
  }

  // Fallback to single extracted values if options don't provide any values for a dimension.
  if (thicknessMmValues.length === 0 && params.thickness?.value != null) thicknessMmValues.push(params.thickness.value);
  if (lengthCmValues.length === 0 && params.length?.value != null) lengthCmValues.push(params.length.value);
  if (widthCmValues.length === 0 && params.width?.value != null) widthCmValues.push(params.width.value);
  if (diameterCmValues.length === 0 && params.diameter?.value != null) diameterCmValues.push(params.diameter.value);
  if (rolledDiameterCmValues.length === 0 && params.rolledDiameter?.value != null) rolledDiameterCmValues.push(params.rolledDiameter.value);

  // If we extracted a single LxW pair from text (same originalText), emit it as a size pair for query-friendly fields.
  if (
    sizePairs.length === 0 &&
    params.length?.value != null &&
    params.width?.value != null &&
    params.length.source === 'description' &&
    params.width.source === 'description' &&
    params.length.originalText &&
    params.length.originalText === params.width.originalText
  ) {
    sizePairs.push({ lengthCm: params.length.value, widthCm: params.width.value });
  }

  const thicknessMmRange = computeMinMax(thicknessMmValues);
  const lengthCmRange = computeMinMax(lengthCmValues);
  const widthCmRange = computeMinMax(widthCmValues);
  const diameterCmRange = computeMinMax(diameterCmValues);
  const rolledDiameterCmRange = computeMinMax(rolledDiameterCmValues);

  const thicknessMmx10Values = thicknessMmValues.length > 0
    ? Array.from(new Set(thicknessMmValues.map(encodeMmX10))).sort((a, b) => a - b)
    : undefined;
  const lengthCMx10Values = lengthCmValues.length > 0
    ? Array.from(new Set(lengthCmValues.map(encodeCmX10))).sort((a, b) => a - b)
    : undefined;
  const widthCMx10Values = widthCmValues.length > 0
    ? Array.from(new Set(widthCmValues.map(encodeCmX10))).sort((a, b) => a - b)
    : undefined;
  const diameterCMx10Values = diameterCmValues.length > 0
    ? Array.from(new Set(diameterCmValues.map(encodeCmX10))).sort((a, b) => a - b)
    : undefined;
  const rolledDiameterCMx10Values = rolledDiameterCmValues.length > 0
    ? Array.from(new Set(rolledDiameterCmValues.map(encodeCmX10))).sort((a, b) => a - b)
    : undefined;

  const sizePairsCMx10Values = sizePairs.length > 0
    ? Array.from(
      new Map(
        sizePairs.map(p => {
          const lengthCMx10 = encodeCmX10(p.lengthCm);
          const widthCMx10 = encodeCmX10(p.widthCm);
          return [`${lengthCMx10}x${widthCMx10}`, { lengthCMx10, widthCMx10 }];
        })
      ).values()
    ).sort((a, b) => (a.lengthCMx10 - b.lengthCMx10) || (a.widthCMx10 - b.widthCMx10))
    : undefined;

  return {
    thicknessMmMin: thicknessMmRange?.min,
    thicknessMmMax: thicknessMmRange?.max,
    lengthCmMin: lengthCmRange?.min,
    lengthCmMax: lengthCmRange?.max,
    widthCmMin: widthCmRange?.min,
    widthCmMax: widthCmRange?.max,
    diameterCmMin: diameterCmRange?.min,
    diameterCmMax: diameterCmRange?.max,
    rolledDiameterCmMin: rolledDiameterCmRange?.min,
    rolledDiameterCmMax: rolledDiameterCmRange?.max,
    thicknessMmx10Values,
    lengthCMx10Values,
    widthCMx10Values,
    diameterCMx10Values,
    rolledDiameterCMx10Values,
    sizePairsCMx10Values,
  };
}

function extractDimensionOptions(product: ShopifyProduct): NormalizedYogaMat['dimensionOptions'] | undefined {
  if (!product.options) return undefined;

  const thicknessMm: NonNullable<NonNullable<NormalizedYogaMat['dimensionOptions']>['thicknessMm']> = [];
  const lengthCm: NonNullable<NonNullable<NormalizedYogaMat['dimensionOptions']>['lengthCm']> = [];
  const widthCm: NonNullable<NonNullable<NormalizedYogaMat['dimensionOptions']>['widthCm']> = [];
  const diameterCm: NonNullable<NonNullable<NormalizedYogaMat['dimensionOptions']>['diameterCm']> = [];
  const rolledDiameterCm: NonNullable<NonNullable<NormalizedYogaMat['dimensionOptions']>['rolledDiameterCm']> = [];
  const sizePairsCm: NonNullable<NonNullable<NormalizedYogaMat['dimensionOptions']>['sizePairsCm']> = [];
  const rawUnparsed: NonNullable<NonNullable<NormalizedYogaMat['dimensionOptions']>['rawUnparsed']> = [];

  let candidateCount = 0;
  let parsedCount = 0;

  for (const option of product.options) {
    const optionNameLower = option.name.toLowerCase();

    if (isColorOptionName(optionNameLower)) continue;

    const classification = classifyOptionValues(option.values);
    const optionSeemsDimension = optionNameSuggestsDimensions(optionNameLower) || classification !== 'color';

    if (!optionSeemsDimension) continue;

    const assumeDiameter = optionNameLower.includes('diam') || optionNameLower.includes('round') || optionNameLower.includes('circle') || optionNameLower === 'dia';
    const assumeThickness = optionNameLower.includes('thick') || optionNameLower === 'thickness' || classification === 'thickness';

    for (const rawValue of option.values) {
      if (!rawValue || rawValue === 'Default Title') continue;
      candidateCount++;

      const hasUnits = hasExplicitLinearUnit(rawValue);
      const isPlainNumber = /^(\d+(?:\.\d+)?)$/.test(rawValue.trim());

      // 1) Diameter
      const diameter = parseDiameterString(rawValue, assumeDiameter);
      if (diameter != null) {
        const isRolled = /\broll(?:ed|s)?\b/i.test(rawValue) || optionNameLower.includes('rolled');
        const confidence = makeOptionParseConfidence({
          kind: 'diameter',
          optionNameLower,
          rawValue,
          classification,
          hasUnits,
          hasKeywords: /\b(?:diam(?:eter)?|dia\.?|ø|round|circle|circular)\b/i.test(rawValue),
          isPlainNumber,
        });

        pushUnique(
          isRolled ? rolledDiameterCm : diameterCm,
          { value: diameter, sourceOptionName: option.name, rawValue, confidence },
          i => `${i.sourceOptionName}|${i.rawValue}|${i.value.toFixed(4)}`
        );
        parsedCount++;
        continue;
      }

      // 2) Thickness
      const parsedThickness = parseThicknessString(rawValue);
      if (parsedThickness != null && (assumeThickness || /\bmm\b|millimeter|\b(?:inch|in)\b/i.test(rawValue) || isPlainNumber)) {
        // Heuristic: avoid capturing obviously-not-thickness values (e.g., 180cm, 72")
        if (!hasUnits && parsedThickness >= 20) {
          rawUnparsed.push({ sourceOptionName: option.name, rawValue });
          continue;
        }

        const confidence = makeOptionParseConfidence({
          kind: 'thickness',
          optionNameLower,
          rawValue,
          classification,
          hasUnits: /\bmm\b|millimeter|\b(?:inch|in)\b/i.test(rawValue) || isPlainNumber,
          hasKeywords: optionNameLower.includes('thick') || /\b(?:thick|thickness)\b/i.test(rawValue),
          isPlainNumber,
        });

        pushUnique(
          thicknessMm,
          { value: parsedThickness, sourceOptionName: option.name, rawValue, confidence },
          i => `${i.sourceOptionName}|${i.rawValue}|${i.value.toFixed(4)}`
        );
        parsedCount++;
        continue;
      }

      // 3) L×W size pair
      const parsedPair = parseDimensionString(rawValue);
      if (parsedPair && 'width' in parsedPair) {
        const confidence = makeOptionParseConfidence({
          kind: 'sizePair',
          optionNameLower,
          rawValue,
          classification,
          hasUnits,
          hasKeywords: /[xX×]/.test(rawValue),
          isPlainNumber,
        });

        pushUnique(
          sizePairsCm,
          {
            value: { lengthCm: parsedPair.length, widthCm: parsedPair.width },
            sourceOptionName: option.name,
            rawValue,
            confidence,
          },
          i => `${i.sourceOptionName}|${i.value.lengthCm.toFixed(4)}x${i.value.widthCm.toFixed(4)}`
        );
        parsedCount++;
        continue;
      }

      // 4) Single dimension (length or width)
      if (parsedPair && !('width' in parsedPair)) {
        const valueCm = parsedPair.length;

        let dimensionKind: 'length' | 'width' =
          optionNameLower.includes('width') ? 'width' :
            optionNameLower.includes('length') ? 'length' :
              classifySingleDimension(rawValue, valueCm, 'cm');

        const confidence = makeOptionParseConfidence({
          kind: dimensionKind,
          optionNameLower,
          rawValue,
          classification,
          hasUnits,
          hasKeywords: dimensionKind === 'length'
            ? /\b(?:long|length|tall|standard|extended|short)\b/i.test(rawValue)
            : /\b(?:wide|width|narrow)\b/i.test(rawValue),
          isPlainNumber,
        });

        if (dimensionKind === 'length') {
          pushUnique(
            lengthCm,
            { value: valueCm, sourceOptionName: option.name, rawValue, confidence },
            i => `${i.sourceOptionName}|${i.rawValue}|${i.value.toFixed(4)}`
          );
        } else {
          pushUnique(
            widthCm,
            { value: valueCm, sourceOptionName: option.name, rawValue, confidence },
            i => `${i.sourceOptionName}|${i.rawValue}|${i.value.toFixed(4)}`
          );
        }
        parsedCount++;
        continue;
      }

      rawUnparsed.push({ sourceOptionName: option.name, rawValue });
    }
  }

  const unparsedCount = rawUnparsed.length;
  const coverage = candidateCount > 0 ? parsedCount / candidateCount : 0;

  const result: NonNullable<NormalizedYogaMat['dimensionOptions']> = {
    sanity: {
      candidateCount,
      parsedCount,
      unparsedCount,
      coverage,
      allUnparsed: candidateCount > 0 && parsedCount === 0,
    },
    rawUnparsed,
  };
  if (thicknessMm.length > 0) result.thicknessMm = thicknessMm;
  if (lengthCm.length > 0) result.lengthCm = lengthCm;
  if (widthCm.length > 0) result.widthCm = widthCm;
  if (diameterCm.length > 0) result.diameterCm = diameterCm;
  if (rolledDiameterCm.length > 0) result.rolledDiameterCm = rolledDiameterCm;
  if (sizePairsCm.length > 0) result.sizePairsCm = sizePairsCm;

  return (
    result.rawUnparsed.length > 0 ||
    result.thicknessMm != null ||
    result.lengthCm != null ||
    result.widthCm != null ||
    result.diameterCm != null ||
    result.rolledDiameterCm != null ||
    result.sizePairsCm != null
  ) ? result : undefined;
}

function extractDiameters(product: ShopifyProduct): Array<{
  value: number;
  unit: 'cm';
  originalString: string;
}> | undefined {
  if (!product.options) return undefined;

  const diameters: Array<{ value: number; unit: 'cm'; originalString: string }> = [];

  for (const option of product.options) {
    const optionName = option.name.toLowerCase();
    const classification = classifyOptionValues(option.values);
    const isDiameterOption = optionName.includes('diameter') || optionName.includes('round') || optionName === 'dia';

    if (!isDiameterOption && classification !== 'diameter') continue;

    for (const value of option.values) {
      if (value === 'Default Title') continue;
      if (/\broll(?:ed|s)?\b/i.test(value)) continue;

      const parsed = parseDiameterString(value, isDiameterOption);
      if (parsed != null) {
        diameters.push({
          value: parsed,
          unit: 'cm',
          originalString: value
        });
      }
    }
  }

  return diameters.length > 0 ? diameters : undefined;
}

/**
 * Maps a Shopify product to normalized YogaMat format
 */
export function mapShopifyToYogaMat(
  product: ShopifyProduct,
  brandSlug: string,
  enrichment?: {
    coreFeatures?: { items: string[]; confidence: number };
    appendText?: string;
    productPageSections?: Array<{ heading: string; items: string[]; confidence: number }>;
  }
): NormalizedYogaMat {
  const description = stripHtml(product.body_html || '');
  const coreFeaturesText = enrichment?.coreFeatures?.items?.length
    ? enrichment.coreFeatures.items.join(' ')
    : '';
  const appendedText = enrichment?.appendText?.trim() ?? '';
  const sectionsText = enrichment?.productPageSections?.length
    ? enrichment.productPageSections
      .flatMap(section => section.items)
      .filter(item => typeof item === 'string' && item.trim().length > 0)
      .join(' ')
    : '';
  // Tags can contain unrelated size hints (e.g. "outdoor cushions 24 x 24") that pollute dimension parsing.
  // Use tags for broad feature/material extraction, but exclude them from dimension-focused parsing.
  const textForDimensions = `${product.title} ${description} ${sectionsText} ${coreFeaturesText} ${appendedText}`;
  const allText = `${product.title} ${description} ${product.tags.join(' ')} ${sectionsText} ${coreFeaturesText} ${appendedText}`;
  const priceCurrencyOriginal = getBrandPriceCurrency(brandSlug);
  const priceRangeOriginal = getPriceRange(product);
  const variantPriceValuesOriginal = getVariantPriceValues(product);
  const pricesUsd = convertPricesToUsd(
    variantPriceValuesOriginal ?? (Number.isFinite(priceRangeOriginal.min) && Number.isFinite(priceRangeOriginal.max)
      ? [priceRangeOriginal.min, priceRangeOriginal.max]
      : undefined),
    priceCurrencyOriginal
  );
  const hasUsdConversion = priceCurrencyOriginal !== 'USD' && pricesUsd.values && pricesUsd.rate;
  const priceRange = hasUsdConversion
    ? { min: pricesUsd.values![0], max: pricesUsd.values![pricesUsd.values!.length - 1] }
    : priceRangeOriginal;
  const gramsRange = getGramsRange(product);
  const gramsSanity = getVariantGramsSanity(product);
  const dimensions = extractDimensions(product, textForDimensions);
  const dimensionOptions = mergeDimensionOptions(
    extractDimensionOptions(product),
    extractDimensionOptionsFromText(textForDimensions)
  );
  const thickness = extractThickness(product, allText);
  const diameter = extractDiameter(product, textForDimensions);
  const rolledDiameter = extractRolledDiameter(product, textForDimensions);
  const descriptionForMaterials = `${description} ${sectionsText} ${coreFeaturesText} ${appendedText}`.trim();
  const materialsMeta = extractMaterialsMeta(product.title, descriptionForMaterials, product.tags);
  const texturesMeta = extractTexturesMeta(product.title, description, product.tags);
  const optionColors = extractColors(product);
  const enrichedColors = brandSlug === 'aloyoga'
    ? extractEnrichedColorsFromSections(enrichment?.productPageSections)
    : undefined;
  const availableColors = mergeUniqueStrings(optionColors, enrichedColors);
  const seriesInfo = extractSeriesInfo({
    brandSlug,
    titleOriginal: product.title,
    handle: product.handle,
    productType: product.product_type,
    tags: product.tags,
  });
  const dimensionQueryFields = deriveDimensionQueryFields({
    thickness,
    length: dimensions.length,
    width: dimensions.width,
    diameter,
    rolledDiameter,
    dimensionOptions,
  });

  return {
    // Required
    brandId: '', // Will be resolved later by looking up brand
    brandSlug,
    name: product.title,
    slug: generateSlug(brandSlug, product.handle),

    // Original title
    titleOriginal: product.title,

    ...seriesInfo,

    // Optional
    description: description || undefined,

    // Measurements (all in metric: mm, cm, kg)
    thickness,
    length: dimensions.length,
    width: dimensions.width,
    diameter,
    rolledDiameter,
    weight: extractWeight(product, allText),

    // Attributes
    material: materialsMeta.material,
    materials: materialsMeta.materials,
    materialSource: materialsMeta.materialSource,
    materialConfidence: materialsMeta.materialConfidence,
    pvcFree: materialsMeta.pvcFree,
    texture: texturesMeta.texture,
    textures: texturesMeta.textures,
    textureSource: texturesMeta.textureSource,
    textureConfidence: texturesMeta.textureConfidence,
    features: extractFeatures(allText, product.tags),
    coreFeatures: enrichment?.coreFeatures?.items?.length ? enrichment.coreFeatures.items : undefined,
    coreFeaturesSource: enrichment?.coreFeatures?.items?.length ? 'productPage' : undefined,
    coreFeaturesConfidence: enrichment?.coreFeatures?.items?.length ? enrichment.coreFeatures.confidence : undefined,
    productPageSections: enrichment?.productPageSections?.length ? enrichment.productPageSections : undefined,

    // Shopify metadata
    shopifyId: product.id,
    shopifyHandle: product.handle,
    shopifyVendor: product.vendor,
    shopifyProductType: product.product_type,
    shopifyTags: product.tags,
    shopifyCreatedAt: product.created_at,
    shopifyPublishedAt: product.published_at,
    shopifyUpdatedAt: product.updated_at,

    // Variants
    variantsCount: product.variants.length,
    minPrice: priceRange.min,
    maxPrice: priceRange.max,
    variantPriceValues: hasUsdConversion ? pricesUsd.values : variantPriceValuesOriginal,
    priceCurrency: hasUsdConversion ? 'USD' : (priceCurrencyOriginal || 'USD'),
    priceCurrencyOriginal: hasUsdConversion ? priceCurrencyOriginal : undefined,
    minPriceOriginal: hasUsdConversion ? priceRangeOriginal.min : undefined,
    maxPriceOriginal: hasUsdConversion ? priceRangeOriginal.max : undefined,
    variantPriceValuesOriginal: hasUsdConversion ? variantPriceValuesOriginal : undefined,
    priceUsdRate: hasUsdConversion ? pricesUsd.rate : undefined,
    minGrams: gramsRange?.min,
    maxGrams: gramsRange?.max,
    variantGramsValues: getVariantGramsValues(product),
    variantGramsZeroOrMissingCount: gramsSanity.zeroOrMissingCount,
    variantGramsCoverage: gramsSanity.coverage,
    variantGramsAllZeroOrMissing: gramsSanity.allZeroOrMissing,
    isAvailable: getAvailability(product),

    ...dimensionQueryFields,

    // Shopify options and images (RAW DATA)
    shopifyOptions: mapOptions(product),
    images: mapImages(product),

    // Normalized extractions from options
    availableColors,
    availableDiameters: extractDiameters(product),
    dimensionOptions,
  };
}

/**
 * Validates a normalized mat (checks required fields)
 */
export function validateNormalizedMat(mat: NormalizedYogaMat): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!mat.name) errors.push('Missing required field: name');
  if (!mat.slug) errors.push('Missing required field: slug');
  if (!mat.minPrice || mat.minPrice <= 0) errors.push('Invalid minPrice');
  if (!mat.brandSlug) errors.push('Missing required field: brandSlug');

  return {
    valid: errors.length === 0,
    errors,
  };
}
