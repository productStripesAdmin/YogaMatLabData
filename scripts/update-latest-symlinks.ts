import { promises as fs } from 'fs';
import path from 'path';
import { logger } from './lib/logger.js';

async function createSymlink(target: string, linkPath: string): Promise<void> {
  try {
    // Check if symlink already exists
    try {
      const stats = await fs.lstat(linkPath);
      if (stats.isSymbolicLink()) {
        // Remove existing symlink
        await fs.unlink(linkPath);
        logger.info(`Removed existing symlink: ${linkPath}`);
      }
    } catch (error) {
      // Symlink doesn't exist, which is fine
    }

    // Create new symlink
    await fs.symlink(target, linkPath, 'dir');
    logger.success(`Created symlink: ${linkPath} → ${target}`);
  } catch (error) {
    logger.error(`Failed to create symlink: ${linkPath}`, error);
    throw error;
  }
}

async function updateSymlinks(date: string): Promise<void> {
  const dataDir = path.join(process.cwd(), 'data');

  const symlinks = [
    {
      target: path.join(dataDir, 'raw', date),
      link: path.join(dataDir, 'raw', 'latest'),
    },
    {
      target: path.join(dataDir, 'normalized', date),
      link: path.join(dataDir, 'normalized', 'latest'),
    },
    {
      target: path.join(dataDir, 'aggregated', date),
      link: path.join(dataDir, 'aggregated', 'latest'),
    },
  ];

  for (const { target, link } of symlinks) {
    // Verify target exists
    try {
      await fs.access(target);
    } catch (error) {
      logger.warn(`Target directory doesn't exist: ${target}`);
      continue;
    }

    // Create relative symlink
    const relativePath = path.relative(path.dirname(link), target);
    await createSymlink(relativePath, link);
  }
}

async function main() {
  logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  logger.info('YogaMatLab Data Pipeline - Update Latest Symlinks');
  logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  // Use today's date or accept date argument
  const date = process.argv[2] || new Date().toISOString().split('T')[0];
  logger.info(`Processing date: ${date}`);

  await updateSymlinks(date);

  logger.success('Symlinks updated successfully');
  logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

main().catch((error) => {
  logger.error('Fatal error updating symlinks', error);
  process.exit(1);
});
