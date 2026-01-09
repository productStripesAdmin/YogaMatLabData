import { fetchBigCommerceProducts } from './lib/bigcommerce-scraper.js';
import { logger } from './lib/logger.js';

async function testHuggerMugger() {
  logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  logger.info('Testing Hugger Mugger BigCommerce Scraper');
  logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const collectionUrl = 'https://www.huggermugger.com/yoga-mats/';
  logger.info(`\nFetching from: ${collectionUrl}`);
  logger.info('Timeout: 60 seconds (increased from 30s)\n');

  const startTime = Date.now();

  try {
    const result = await fetchBigCommerceProducts(collectionUrl, {
      maxProducts: 100,
      headless: true,
      delayBetweenProducts: 1000,
      onProductFetched: (current, total) => {
        logger.info(`  Product ${current}/${total}`);
      },
    });

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    if (result.success) {
      logger.success(`\n✓ Successfully fetched ${result.products.length} products`);
      logger.info(`Duration: ${duration}s`);

      // Show sample products
      if (result.products.length > 0) {
        logger.info('\nSample products:');
        result.products.slice(0, 3).forEach((p, i) => {
          logger.info(`  ${i + 1}. ${p.title} - $${p.variants[0]?.price}`);
        });
      }
    } else {
      logger.error(`\n✗ Failed: ${result.error}`);
      logger.info(`Duration: ${duration}s`);
    }
  } catch (error) {
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    logger.error('Unexpected error:', error);
    logger.info(`Duration: ${duration}s`);
    process.exit(1);
  }
}

testHuggerMugger();
