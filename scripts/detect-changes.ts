import { promises as fs } from 'fs';
import path from 'path';
import { logger } from './lib/logger.js';
import type { NormalizedYogaMat } from './lib/field-mapper.js';

interface ProductChange {
  slug: string;
  name: string;
  brandSlug: string;
  changeType: 'added' | 'removed' | 'price_changed' | 'spec_changed';
  oldValue?: any;
  newValue?: any;
  details?: string;
}

interface Changeset {
  date: string;
  comparedWith: string;
  summary: {
    totalChanges: number;
    newProducts: number;
    removedProducts: number;
    priceChanges: number;
    specChanges: number;
  };
  changes: ProductChange[];
}

async function ensureChangesDirectory() {
  const changesDir = path.join(process.cwd(), 'data', 'changes');
  await fs.mkdir(changesDir, { recursive: true });
}

async function getPreviousDate(currentDate: string): Promise<string | null> {
  const aggregatedDir = path.join(process.cwd(), 'data', 'aggregated');

  try {
    const dirs = await fs.readdir(aggregatedDir);
    // Filter to only date directories (YYYY-MM-DD format)
    const dateDirs = dirs.filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();

    // Find the date before current
    const currentIndex = dateDirs.indexOf(currentDate);
    if (currentIndex > 0) {
      return dateDirs[currentIndex - 1];
    }

    return null;
  } catch (error) {
    return null;
  }
}

async function loadAggregatedData(date: string): Promise<NormalizedYogaMat[] | null> {
  const filepath = path.join(process.cwd(), 'data', 'aggregated', date, 'all-mats.json');

  try {
    const data = await fs.readFile(filepath, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    return null;
  }
}

function detectChanges(
  previous: NormalizedYogaMat[],
  current: NormalizedYogaMat[]
): ProductChange[] {
  const changes: ProductChange[] = [];

  // Create maps for quick lookup
  const previousMap = new Map(previous.map(p => [p.slug, p]));
  const currentMap = new Map(current.map(p => [p.slug, p]));

  // Detect new products
  for (const product of current) {
    if (!previousMap.has(product.slug)) {
      changes.push({
        slug: product.slug,
        name: product.name,
        brandSlug: product.brandSlug,
        changeType: 'added',
        newValue: {
          price: product.price,
          imageUrl: product.imageUrl,
        },
      });
    }
  }

  // Detect removed products and changes
  for (const product of previous) {
    const currentProduct = currentMap.get(product.slug);

    if (!currentProduct) {
      // Product removed
      changes.push({
        slug: product.slug,
        name: product.name,
        brandSlug: product.brandSlug,
        changeType: 'removed',
        oldValue: {
          price: product.price,
          imageUrl: product.imageUrl,
        },
      });
    } else {
      // Check for price changes
      if (product.price !== currentProduct.price) {
        changes.push({
          slug: product.slug,
          name: product.name,
          brandSlug: product.brandSlug,
          changeType: 'price_changed',
          oldValue: product.price,
          newValue: currentProduct.price,
          details: `$${product.price} → $${currentProduct.price}`,
        });
      }

      // Check for spec changes (thickness, dimensions, material)
      const specChanges: string[] = [];

      if (product.thickness !== currentProduct.thickness) {
        specChanges.push(`thickness: ${product.thickness}mm → ${currentProduct.thickness}mm`);
      }

      if (product.length !== currentProduct.length) {
        specChanges.push(`length: ${product.length}" → ${currentProduct.length}"`);
      }

      if (product.width !== currentProduct.width) {
        specChanges.push(`width: ${product.width}" → ${currentProduct.width}"`);
      }

      if (product.material !== currentProduct.material) {
        specChanges.push(`material: ${product.material} → ${currentProduct.material}`);
      }

      if (specChanges.length > 0) {
        changes.push({
          slug: product.slug,
          name: product.name,
          brandSlug: product.brandSlug,
          changeType: 'spec_changed',
          details: specChanges.join(', '),
        });
      }
    }
  }

  return changes;
}

function generateChangeset(
  currentDate: string,
  previousDate: string,
  changes: ProductChange[]
): Changeset {
  const summary = {
    totalChanges: changes.length,
    newProducts: changes.filter(c => c.changeType === 'added').length,
    removedProducts: changes.filter(c => c.changeType === 'removed').length,
    priceChanges: changes.filter(c => c.changeType === 'price_changed').length,
    specChanges: changes.filter(c => c.changeType === 'spec_changed').length,
  };

  return {
    date: currentDate,
    comparedWith: previousDate,
    summary,
    changes,
  };
}

async function saveChangeset(changeset: Changeset): Promise<void> {
  const filename = `${changeset.date}-changeset.json`;
  const filepath = path.join(process.cwd(), 'data', 'changes', filename);

  await fs.writeFile(filepath, JSON.stringify(changeset, null, 2), 'utf-8');
  logger.success(`Saved changeset to ${filename}`);

  // Also save as "latest-changeset.json" for easy access
  const latestPath = path.join(process.cwd(), 'data', 'changes', 'latest-changeset.json');
  await fs.writeFile(latestPath, JSON.stringify(changeset, null, 2), 'utf-8');
}

async function main() {
  logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  logger.info('YogaMatLab Data Pipeline - Detect Changes');
  logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const startTime = Date.now();

  // Use today's date or accept date argument
  const currentDate = process.argv[2] || new Date().toISOString().split('T')[0];
  logger.info(`Current date: ${currentDate}`);

  // Ensure changes directory exists
  await ensureChangesDirectory();

  // Load current data
  logger.info('Loading current aggregated data...');
  const currentData = await loadAggregatedData(currentDate);

  if (!currentData) {
    logger.error(`No aggregated data found for ${currentDate}`);
    logger.info('Run npm run aggregate first.');
    process.exit(1);
  }

  logger.success(`Loaded ${currentData.length} current products`);

  // Find previous date
  logger.info('Finding previous extraction date...');
  const previousDate = await getPreviousDate(currentDate);

  if (!previousDate) {
    logger.warn('No previous data found - this appears to be the first extraction');
    logger.info('Creating baseline changeset with all products as "added"');

    const changes: ProductChange[] = currentData.map(product => ({
      slug: product.slug,
      name: product.name,
      brandSlug: product.brandSlug,
      changeType: 'added' as const,
      newValue: {
        price: product.price,
        imageUrl: product.imageUrl,
      },
    }));

    const changeset = generateChangeset(currentDate, 'baseline', changes);
    await saveChangeset(changeset);

    logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    logger.info('CHANGESET SUMMARY (Baseline)');
    logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    logger.success(`Total products: ${changeset.summary.totalChanges}`);
    logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    process.exit(0);
  }

  logger.info(`Previous date: ${previousDate}`);

  // Load previous data
  logger.info('Loading previous aggregated data...');
  const previousData = await loadAggregatedData(previousDate);

  if (!previousData) {
    logger.error(`Failed to load previous data for ${previousDate}`);
    process.exit(1);
  }

  logger.success(`Loaded ${previousData.length} previous products`);

  // Detect changes
  logger.info('Detecting changes...');
  const changes = detectChanges(previousData, currentData);
  logger.success(`Detected ${changes.length} changes`);

  // Generate changeset
  const changeset = generateChangeset(currentDate, previousDate, changes);

  // Save changeset
  await saveChangeset(changeset);

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);

  logger.info('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  logger.info('CHANGESET SUMMARY');
  logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  logger.info(`Compared: ${previousDate} → ${currentDate}`);
  logger.success(`Total changes: ${changeset.summary.totalChanges}`);

  if (changeset.summary.newProducts > 0) {
    logger.success(`  New products: ${changeset.summary.newProducts}`);
  }

  if (changeset.summary.removedProducts > 0) {
    logger.warn(`  Removed products: ${changeset.summary.removedProducts}`);
  }

  if (changeset.summary.priceChanges > 0) {
    logger.info(`  Price changes: ${changeset.summary.priceChanges}`);
  }

  if (changeset.summary.specChanges > 0) {
    logger.info(`  Spec changes: ${changeset.summary.specChanges}`);
  }

  // Show some example changes
  if (changeset.summary.newProducts > 0) {
    logger.info('\nSample new products:');
    changes
      .filter(c => c.changeType === 'added')
      .slice(0, 3)
      .forEach(c => {
        logger.info(`  + ${c.brandSlug}: ${c.name}`);
      });
  }

  if (changeset.summary.removedProducts > 0) {
    logger.info('\nSample removed products:');
    changes
      .filter(c => c.changeType === 'removed')
      .slice(0, 3)
      .forEach(c => {
        logger.warn(`  - ${c.brandSlug}: ${c.name}`);
      });
  }

  if (changeset.summary.priceChanges > 0) {
    logger.info('\nSample price changes:');
    changes
      .filter(c => c.changeType === 'price_changed')
      .slice(0, 3)
      .forEach(c => {
        logger.info(`  $ ${c.brandSlug}: ${c.name} - ${c.details}`);
      });
  }

  logger.info(`\nDuration: ${duration}s`);
  logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  logger.success('Pipeline complete! Data ready for import to YogaMatLabApp');
}

main().catch((error) => {
  logger.error('Fatal error in change detection', error);
  process.exit(1);
});
