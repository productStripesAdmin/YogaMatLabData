import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';

export interface BrandHashRecord {
  lastHash: string;
  lastFetched: string; // ISO timestamp
  lastChanged: string; // ISO timestamp
  totalProducts: number;
}

export interface HashRegistry {
  [brandSlug: string]: BrandHashRecord;
}

const HASH_REGISTRY_PATH = path.join(process.cwd(), 'data', '.hash-registry.json');

/**
 * Calculate SHA-256 hash of JSON data
 * Normalizes the data by sorting keys and consistent formatting
 */
export function calculateDataHash(data: any): string {
  // Normalize JSON by stringifying with sorted keys
  const normalized = JSON.stringify(data, Object.keys(data).sort(), 0);
  return crypto.createHash('sha256').update(normalized, 'utf8').digest('hex');
}

/**
 * Load the hash registry from disk
 */
export async function loadHashRegistry(): Promise<HashRegistry> {
  try {
    const content = await fs.readFile(HASH_REGISTRY_PATH, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    // File doesn't exist yet, return empty registry
    return {};
  }
}

/**
 * Save the hash registry to disk
 */
export async function saveHashRegistry(registry: HashRegistry): Promise<void> {
  await fs.writeFile(
    HASH_REGISTRY_PATH,
    JSON.stringify(registry, null, 2),
    'utf-8'
  );
}

/**
 * Check if brand data has changed since last fetch
 * Returns { changed: boolean, reason?: string }
 */
export async function checkDataChanged(
  brandSlug: string,
  data: any
): Promise<{ changed: boolean; reason?: string; previousHash?: string }> {
  const registry = await loadHashRegistry();
  const currentHash = calculateDataHash(data);
  const record = registry[brandSlug];

  if (!record) {
    return {
      changed: true,
      reason: 'First fetch',
    };
  }

  if (record.lastHash !== currentHash) {
    return {
      changed: true,
      reason: 'Data modified',
      previousHash: record.lastHash,
    };
  }

  return {
    changed: false,
    previousHash: record.lastHash,
  };
}

/**
 * Update hash record for a brand
 */
export async function updateHashRecord(
  brandSlug: string,
  data: any,
  productCount: number,
  dataChanged: boolean
): Promise<void> {
  const registry = await loadHashRegistry();
  const currentHash = calculateDataHash(data);
  const now = new Date().toISOString();

  const existingRecord = registry[brandSlug];

  registry[brandSlug] = {
    lastHash: currentHash,
    lastFetched: now,
    lastChanged: dataChanged ? now : (existingRecord?.lastChanged || now),
    totalProducts: productCount,
  };

  await saveHashRegistry(registry);
}

/**
 * Get hash record for a brand
 */
export async function getHashRecord(
  brandSlug: string
): Promise<BrandHashRecord | null> {
  const registry = await loadHashRegistry();
  return registry[brandSlug] || null;
}
