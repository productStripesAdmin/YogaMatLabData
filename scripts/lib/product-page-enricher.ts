import type { ShopifyProduct } from './fetch-products-json.js';

const USER_AGENTS = [
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:121.0) Gecko/20100101 Firefox/121.0',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Edge/120.0.0.0',
];

function getRandomUserAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

export interface EnrichmentConfig {
  version: number;
  defaults: {
    delayBetweenProductsMs: number;
    timeoutMs: number;
    userAgent: string;
  };
  brands: Record<string, BrandEnrichmentConfig>;
}

export interface BrandEnrichmentConfig {
  enabled: boolean;
  strategy?: 'fetch' | 'manual' | 'fetchThenManual';
  baseUrl?: string;
  productPathTemplate?: string; // e.g. "/products/{handle}"
  coreFeatures?: {
    heading: string; // e.g. "Core Features"
    endHeadings?: string[]; // e.g. ["Shipping & Returns"]
  };
  appendText?: {
    headings: string[]; // e.g. ["Fit", "Details"]
    endHeadings?: string[];
  };
}

export interface ProductEnrichmentRecord {
  shopifyId: number;
  handle: string;
  slug: string;
  productUrl: string;
  extractedAt: string; // ISO
  coreFeatures?: {
    items: string[];
    confidence: number; // 0..1
  };
  appendText?: {
    text: string;
    confidence: number; // 0..1
    headings: string[];
  };
  sections?: Array<{
    heading: string;
    items: string[];
    confidence: number; // 0..1
  }>;
  debug?: {
    coreFeaturesHtmlPreview?: string; // for debugging (truncated)
    coreFeaturesTextPreview?: string; // for debugging (truncated)
  };
  errors?: string[];
}

export interface BrandEnrichmentOutput {
  brandSlug: string;
  extractedAt: string; // ISO
  products: ProductEnrichmentRecord[];
}

export type ProductEnrichmentIndex = Map<
  string,
  { items: string[]; confidence: number }
>;

export function buildProductUrl(params: {
  baseUrl: string;
  productPathTemplate: string;
  handle: string;
}): string {
  const base = new URL(params.baseUrl);
  if (!base.pathname.endsWith('/')) {
    base.pathname = `${base.pathname}/`;
  }

  let template = params.productPathTemplate;
  // If the base URL has a path prefix (e.g. /en-sg/), a leading "/" in the template will reset it.
  if (base.pathname !== '/' && template.startsWith('/')) {
    template = template.slice(1);
  }

  const path = template.replace('{handle}', encodeURIComponent(params.handle));
  return new URL(path, base.toString()).toString();
}

export async function fetchHtml(url: string, opts: { timeoutMs: number; userAgent: string }): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), opts.timeoutMs);

  try {
    const urlObj = new URL(url);
    const origin = `${urlObj.protocol}//${urlObj.host}`;
    const userAgent = opts.userAgent && opts.userAgent !== 'random'
      ? opts.userAgent
      : getRandomUserAgent();

    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      headers: {
        'User-Agent': userAgent,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': origin + '/',
        'Origin': origin,
        'DNT': '1',
        'Connection': 'keep-alive',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'same-origin',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1',
      },
      signal: controller.signal,
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText}`);
    }

    return await res.text();
  } finally {
    clearTimeout(timeoutId);
  }
}

export function extractCoreFeaturesFromHtml(html: string, params: {
  heading: string;
  endHeadings?: string[];
}): { items: string[]; confidence: number; rawSectionText?: string } | undefined {
  // Prefer extracting the accordion body directly (common on Shopify themes).
  const accordionBody = findAccordionBodyAfterHeading(html, params.heading);
  const section = accordionBody ?? findSectionByHeading(html, params.heading, params.endHeadings ?? []);
  if (!section) return undefined;

  // Many themes render accordion content without <li>/<p> tags (div/span + <br>),
  // so we try multiple extraction strategies:
  // 1) <li> items
  // 2) <p> paragraphs
  // 3) fallback to line-splitting the section’s plain text
  const liItems = extractListItems(section).map(cleanFeatureLine).filter(Boolean);
  const pItems = extractParagraphItems(section).map(cleanFeatureLine).filter(Boolean);
  const textItems = extractTextLines(section, params.heading, params.endHeadings ?? []).map(cleanFeatureLine).filter(Boolean);

  const hasSubheadings = textItems.some(line => /^\s*(specifications?|features)\s*:?\s*$/i.test(line));
  const pLooksLikeSpecs = pItems.some((line) =>
    /\d/.test(line) ||
    /^\s*(?:dimensions?|dimension|size|thickness|weight|length|width|materials?|care)\s*:/i.test(line)
  );

  const items = liItems.length > 0 && pLooksLikeSpecs
    ? [...pItems, ...liItems]
    : (
      liItems.length > 0 && !hasSubheadings
        ? liItems
        : (
          // Many themes store multi-line text inside a single <p> with <br> tags.
          // In that case, prefer the line-splitting strategy so we keep values distinct.
          hasSubheadings || (pItems.length === 1 && textItems.length > 1) || (textItems.length > pItems.length + 2)
            ? textItems
            : (pItems.length > 0 ? pItems : textItems)
        )
    );

  const deduped = dedupePreserveOrder(items);
  const confidence = computeCoreFeaturesConfidence({
    hasSection: true,
    extractedCount: deduped.length,
    usedListItems: liItems.length > 0,
    usedParagraphs: liItems.length === 0 && pItems.length > 0,
  });

  const rawSectionText = htmlToText(section).slice(0, 4000);

  return deduped.length > 0
    ? { items: deduped, confidence, rawSectionText }
    : undefined;
}

export function indexCoreFeatures(enriched: BrandEnrichmentOutput): ProductEnrichmentIndex {
  const index: ProductEnrichmentIndex = new Map();
  for (const product of enriched.products) {
    if (product.coreFeatures?.items?.length) {
      index.set(product.handle, {
        items: product.coreFeatures.items,
        confidence: product.coreFeatures.confidence,
      });
    }
  }
  return index;
}

export function getEnrichmentText(coreFeatures?: { items: string[] }): string {
  if (!coreFeatures?.items?.length) return '';
  return coreFeatures.items.join(' ');
}

function findSectionByHeading(html: string, heading: string, endHeadings: string[]): string | undefined {
  const normalizedHtml = html.replace(/\r\n?/g, '\n');
  const startIndex = findHeadingStartIndex(normalizedHtml, heading);
  if (startIndex == null) {
    const special = findSpecialSectionByHeading(normalizedHtml, heading);
    if (special) return special;
    return undefined;
  }
  const window = normalizedHtml.slice(startIndex, startIndex + 80_000);

  // Try to end at the next known accordion heading if present.
  let endIndex = window.length;
  for (const endHeading of endHeadings) {
    // Match only when the heading appears as visible text (not inside attributes like "description-1").
    const endRe = new RegExp(`>\\s*${escapeRegExp(endHeading)}\\b`, 'i');
    const endMatch = endRe.exec(window);
    if (endMatch && endMatch.index > 0) {
      endIndex = Math.min(endIndex, endMatch.index);
    }
  }

  return window.slice(0, endIndex);
}

function findSpecialSectionByHeading(html: string, heading: string): string | undefined {
  const lower = heading.trim().toLowerCase();

  // Shakti Warrior: "Measurement" content is rendered in a side-panel tab panel,
  // and may not have a nearby visible heading in the raw HTML.
  if (lower === 'measurement' || lower === 'measurements') {
    const panel = findFirstSidePanelTabPanel(html);
    if (panel) return panel;
  }

  return undefined;
}

function findFirstSidePanelTabPanel(html: string): string | undefined {
  // Prefer the active panel, otherwise fall back to the first panel.
  const normalizedHtml = html.replace(/\r\n?/g, '\n');
  const startReActive = /<div\b[^>]*class="[^"]*\bside-panel-content--tab-panel\b[^"]*\btab-active\b[^"]*"[^>]*>/i;
  const startReAny = /<div\b[^>]*class="[^"]*\bside-panel-content--tab-panel\b[^"]*"[^>]*>/i;

  const startMatch = startReActive.exec(normalizedHtml) ?? startReAny.exec(normalizedHtml);
  if (!startMatch) return undefined;

  const startIndex = startMatch.index;
  const nextMatch = startReAny.exec(normalizedHtml.slice(startIndex + startMatch[0].length));
  const nextIndex = nextMatch ? startIndex + startMatch[0].length + nextMatch.index : -1;

  const window = normalizedHtml.slice(startIndex, nextIndex > 0 ? nextIndex : startIndex + 80_000);
  return window;
}

function findAccordionBodyAfterHeading(html: string, heading: string): string | undefined {
  const normalizedHtml = html.replace(/\r\n?/g, '\n');
  const startIndex = findHeadingStartIndex(normalizedHtml, heading);
  if (startIndex == null) return undefined;
  const window = normalizedHtml.slice(startIndex, startIndex + 60_000);

  // Capture the first accordion body after the heading.
  const bodyRe = /<div\b[^>]*class="[^"]*\baccordion__(?:body|content)\b[^"]*"[^>]*>([\s\S]*?)<\/div>/i;
  const bodyMatch = bodyRe.exec(window);
  if (!bodyMatch) return undefined;

  return bodyMatch[1];
}

function extractListItems(htmlSection: string): string[] {
  const items: string[] = [];
  const liRe = /<li\b[^>]*>([\s\S]*?)<\/li>/gi;
  let match: RegExpExecArray | null;
  while ((match = liRe.exec(htmlSection)) !== null) {
    const text = htmlToText(match[1]);
    if (text) items.push(text);
  }
  return items;
}

function extractParagraphItems(htmlSection: string): string[] {
  const items: string[] = [];
  const pRe = /<p\b[^>]*>([\s\S]*?)<\/p>/gi;
  let match: RegExpExecArray | null;
  while ((match = pRe.exec(htmlSection)) !== null) {
    const text = htmlToText(match[1]);
    if (text) items.push(text);
  }
  return items;
}

function htmlToText(html: string): string {
  const withoutScripts = html
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ');
  const withTableText = withoutScripts
    .replace(/<tr\b[^>]*>\s*([\s\S]*?)<\/tr>/gi, (_m, row) => `\n${htmlRowToText(row)}\n`);
  const withoutTags = withTableText
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(div|p|li|h1|h2|h3|h4|h5|h6|section|article|ul|ol)>\s*/gi, '\n')
    .replace(/<[^>]+>/g, ' ');

  return decodeHtmlEntities(withTableText)
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function htmlRowToText(html: string): string {
  const thMatch = html.match(/<th\b[^>]*>([\s\S]*?)<\/th>/i);
  const tdMatch = html.match(/<td\b[^>]*>([\s\S]*?)<\/td>/i);

  const th = thMatch ? decodeHtmlEntities(thMatch[1].replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim() : '';
  const td = tdMatch ? decodeHtmlEntities(tdMatch[1].replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim() : '';

  if (!th && !td) return '';
  if (!th) return td;
  if (!td) return th;
  return `${th}: ${td}`;
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_m, n) => {
      const code = Number(n);
      return Number.isFinite(code) ? String.fromCharCode(code) : _m;
    });
}

function cleanFeatureLine(value: string): string | undefined {
  const trimmed = value.replace(/\s+/g, ' ').trim();
  if (!trimmed) return undefined;
  if (/^core features$/i.test(trimmed)) return undefined;
  return trimmed;
}

function dedupePreserveOrder(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

function computeCoreFeaturesConfidence(params: {
  hasSection: boolean;
  extractedCount: number;
  usedListItems: boolean;
  usedParagraphs: boolean;
}): number {
  if (!params.hasSection) return 0;
  if (params.extractedCount === 0) return 0;
  let confidence = 0.65;
  if (params.usedListItems) confidence += 0.15;
  if (params.usedParagraphs) confidence += 0.1;
  if (params.extractedCount >= 5) confidence += 0.15;
  if (params.extractedCount >= 10) confidence += 0.05;
  return Math.max(0, Math.min(1, confidence));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function findHeadingStartIndex(html: string, heading: string): number | null {
  // Prefer headings that appear as visible text nodes (avoids matching CSS variables like "size: 0.875rem").
  const candidates = dedupePreserveOrder([
    heading,
    escapeHtmlText(heading),
  ]).filter(Boolean);

  for (const candidate of candidates) {
    const visibleRe = new RegExp(`>\\s*(?:&nbsp;\\s*)*${escapeRegExp(candidate)}\\s*(?:&nbsp;\\s*)*<`, 'i');
    const visibleMatch = visibleRe.exec(html);
    if (visibleMatch) return visibleMatch.index;
  }

  // Fallback to the first occurrence anywhere.
  for (const candidate of candidates) {
    const anyRe = new RegExp(escapeRegExp(candidate), 'i');
    const anyMatch = anyRe.exec(html);
    if (anyMatch) return anyMatch.index;
  }

  return null;
}

function escapeHtmlText(value: string): string {
  // Minimal escaping for common headings like "Shipping & Returns" which appear as "&amp;" in source HTML.
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function extractTextLines(htmlSection: string, heading: string, endHeadings: string[]): string[] {
  const text = htmlToText(htmlSection);
  if (!text) return [];

  const lines = text
    .split('\n')
    .map(l => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  if (lines.length === 0) return [];

  const lowerHeading = heading.toLowerCase();
  const endSet = new Set(endHeadings.map(h => h.toLowerCase()));

  // Prefer lines that come after the heading line in plain text if present.
  let startIdx = 0;
  const headingIdx = lines.findIndex(l => l.toLowerCase() === lowerHeading);
  if (headingIdx >= 0) startIdx = headingIdx + 1;

  const out: string[] = [];
  for (let i = startIdx; i < lines.length; i++) {
    const line = lines[i];
    const lower = line.toLowerCase();

    if (endSet.has(lower)) break;
    // Avoid accidentally capturing other accordion titles.
    if (lower.includes('shipping') && lower.includes('return')) break;
    if (lower === 'shipping') break;
    if (lower === 'returns') break;
    if (lower === 'faq' || lower === 'faqs') break;

    out.push(line);
  }

  // If we didn’t find the heading line, fall back to the first "feature-like" lines.
  if (out.length === 0 && headingIdx === -1) {
    return lines
      .filter(l => l.toLowerCase() !== lowerHeading)
      .slice(0, 20);
  }

  return out.slice(0, 30);
}

export function getDefaultProductPageTemplate(): string {
  return '/products/{handle}';
}

export function shouldEnrichBrand(config: EnrichmentConfig, brandSlug: string): boolean {
  const brand = config.brands[brandSlug];
  return Boolean(brand?.enabled && (brand.coreFeatures || brand.appendText));
}

export function extractCoreFeaturesForProduct(html: string, brandConfig: BrandEnrichmentConfig): { items: string[]; confidence: number } | undefined {
  if (!brandConfig.coreFeatures) return undefined;
  const extracted = extractCoreFeaturesFromHtml(html, {
    heading: brandConfig.coreFeatures.heading,
    endHeadings: brandConfig.coreFeatures.endHeadings,
  });
  return extracted ? { items: extracted.items, confidence: extracted.confidence } : undefined;
}

export function extractAppendTextForProduct(html: string, brandConfig: BrandEnrichmentConfig): { text: string; confidence: number; headings: string[] } | undefined {
  const headings = brandConfig.appendText?.headings?.filter(Boolean) ?? [];
  if (headings.length === 0) return undefined;

  const sections = extractSectionsFromHtml(html, headings, brandConfig.appendText?.endHeadings);
  if (sections.length === 0) return undefined;

  const text = sections.map(s => `${s.heading}: ${s.items.join(' ')}`).join(' ');
  const confidence = sections.reduce((sum, s) => sum + s.confidence, 0) / sections.length;

  return { text, confidence: clamp01(confidence), headings };
}

function splitSectionBySubheadings(section: { heading: string; items: string[]; confidence: number }): Array<{ heading: string; items: string[]; confidence: number }> {
  // Some brands group multiple logical sections inside one accordion (e.g. Liforme "Specs & Features"),
  // but include inline subheadings like "Specifications:" and "Features:" within the content.
  // If present, split into multiple sections so downstream consumers can target them.
  const normalizedItems = section.items.map(i => i.replace(/\s+/g, ' ').trim()).filter(Boolean);

  const allowed = '(?:specifications?|features|care|materials?|dimensions?|dimension|size|weight|length|width|thickness)';
  const isSubheading = (line: string) => new RegExp(`^\\s*${allowed}\\s*:?\\s*$`, 'i').test(line);
  const labeledLine = new RegExp(`^\\s*(${allowed})\\s*:\\s*(.+)\\s*$`, 'i');

  if (!normalizedItems.some((line) => isSubheading(line) || labeledLine.test(line))) return [section];

  const out: Array<{ heading: string; items: string[]; confidence: number }> = [];
  let currentHeading: string | undefined;
  let currentItems: string[] = [];

  const flush = () => {
    if (!currentHeading || currentItems.length === 0) return;
    out.push({
      heading: currentHeading,
      items: currentItems,
      confidence: section.confidence,
    });
    currentItems = [];
  };

  for (const line of normalizedItems) {
    const labeled = labeledLine.exec(line);
    if (labeled) {
      flush();
      currentHeading = labeled[1].trim().replace(/:$/, '');
      currentItems.push(labeled[2].trim());
      continue;
    }

    if (isSubheading(line)) {
      flush();
      currentHeading = line.replace(/:$/, '').trim();
      continue;
    }
    currentItems.push(line);
  }

  flush();

  return out.length > 0 ? out : [section];
}

export function extractSectionsFromHtml(
  html: string,
  headings: string[],
  extraEndHeadings?: string[]
): Array<{ heading: string; items: string[]; confidence: number }> {
  const normalizedHeadings = headings.map(h => h.trim()).filter(Boolean);
  const normalizedExtraEnds = (extraEndHeadings ?? []).map(h => h.trim()).filter(Boolean);
  const out: Array<{ heading: string; items: string[]; confidence: number }> = [];

  for (let i = 0; i < normalizedHeadings.length; i++) {
    const heading = normalizedHeadings[i];
    const endHeadings = dedupePreserveOrder([
      ...normalizedHeadings.filter(h => h.toLowerCase() !== heading.toLowerCase()),
      ...normalizedExtraEnds,
    ]);

    const extracted = extractCoreFeaturesFromHtml(html, {
      heading,
      endHeadings,
    });

    if (!extracted?.items?.length) continue;

    const base = { heading, items: extracted.items, confidence: extracted.confidence };
    out.push(...splitSectionBySubheadings(base));
  }

  return out;
}

export function createProductEnrichmentRecord(params: {
  product: ShopifyProduct;
  brandSlug: string;
  productUrl: string;
  coreFeatures?: { items: string[]; confidence: number };
  appendText?: { text: string; confidence: number; headings: string[] };
  sections?: Array<{ heading: string; items: string[]; confidence: number }>;
  errors?: string[];
  extractedAt: string;
}): ProductEnrichmentRecord {
  return {
    shopifyId: params.product.id,
    handle: params.product.handle,
    slug: `${params.brandSlug}-${params.product.handle}`,
    productUrl: params.productUrl,
    extractedAt: params.extractedAt,
    coreFeatures: params.coreFeatures,
    appendText: params.appendText,
    sections: params.sections?.length ? params.sections : undefined,
    errors: params.errors?.length ? params.errors : undefined,
  };
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}
