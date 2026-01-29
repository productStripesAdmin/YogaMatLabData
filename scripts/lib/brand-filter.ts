export function parseBrandFilterFromEnv(): Set<string> | null {
  const raw = (
    process.env.YML_BRANDS ??
    process.env.YML_BRAND ??
    process.env.YML_ONLY_BRANDS ??
    ''
  )
    .toString()
    .trim();

  if (!raw) return null;

  const slugs = raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  return slugs.length > 0 ? new Set(slugs) : null;
}

export function describeBrandFilter(filter: Set<string> | null): string {
  if (!filter || filter.size === 0) return '(none)';
  return Array.from(filter).sort().join(', ');
}

