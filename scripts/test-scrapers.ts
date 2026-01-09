/**
 * Test script for custom scrapers
 *
 * Usage:
 *   npx tsx scripts/test-scrapers.ts shopify
 *   npx tsx scripts/test-scrapers.ts lululemon
 *   npx tsx scripts/test-scrapers.ts bigcommerce
 */

import { fetchAllProducts } from './lib/fetch-products-json.js';
import { fetchLululemonProducts } from './lib/lululemon-scraper.js';
import { fetchBigCommerceProducts } from './lib/bigcommerce-scraper.js';

const scraperType = process.argv[2] || 'shopify';

async function testShopify() {
  console.log('🧪 Testing Shopify Scraper (Liforme)...\n');

  const result = await fetchAllProducts(
    'https://uk.liforme.com',
    '/collections/yoga-mats',
    {
      maxPages: 1,
      delayBetweenPages: 0,
      onPageFetched: (page, count) => {
        console.log(`  Page ${page}: Found ${count} products`);
      },
    }
  );

  console.log(`\n✅ Success: ${result.success}`);
  console.log(`📦 Products fetched: ${result.products.length}`);
  console.log(`📄 Total pages: ${result.totalPages}`);

  if (result.products.length > 0) {
    console.log('\n📋 First product sample:');
    const product = result.products[0];
    console.log({
      id: product.id,
      title: product.title,
      vendor: product.vendor,
      variants: product.variants.length,
      images: product.images.length,
      options: product.options.map(o => `${o.name}: ${o.values.join(', ')}`),
      minPrice: Math.min(...product.variants.map(v => parseFloat(v.price))),
      maxPrice: Math.max(...product.variants.map(v => parseFloat(v.price))),
    });
  }

  if (result.error) {
    console.log(`\n⚠️  Error: ${result.error}`);
  }
}

async function testLululemon() {
  console.log('🧪 Testing Lululemon GraphQL Scraper...\n');

  const result = await fetchLululemonProducts('8s6', {
    maxPages: 1,
    pageSize: 10,
    delayBetweenPages: 0,
    onPageFetched: (page, count, total) => {
      console.log(`  Page ${page}: Found ${count} products (${total} total available)`);
    },
  });

  console.log(`\n✅ Success: ${result.success}`);
  console.log(`📦 Products fetched: ${result.products.length}`);
  console.log(`📊 Total products available: ${result.totalProducts}`);

  if (result.products.length > 0) {
    console.log('\n📋 First product sample:');
    const product = result.products[0];
    console.log({
      id: product.id,
      title: product.title,
      vendor: product.vendor,
      variants: product.variants.length,
      images: product.images.length,
      options: product.options.map(o => `${o.name}: ${o.values.join(', ')}`),
      minPrice: Math.min(...product.variants.map(v => parseFloat(v.price))),
      maxPrice: Math.max(...product.variants.map(v => parseFloat(v.price))),
    });
  }

  if (result.error) {
    console.log(`\n⚠️  Error: ${result.error}`);
  }
}

async function testBigCommerce() {
  console.log('🧪 Testing BigCommerce Scraper (Hugger Mugger)...\n');
  console.log('⚠️  This test requires Playwright to be installed.');
  console.log('   If not installed, run: npx playwright install chromium\n');

  const result = await fetchBigCommerceProducts(
    'https://www.huggermugger.com/collections/yoga-mats',
    {
      maxProducts: 3,
      headless: true,
      delayBetweenProducts: 500,
      onProductFetched: (current, total) => {
        console.log(`  Fetching product ${current}/${total}...`);
      },
    }
  );

  console.log(`\n✅ Success: ${result.success}`);
  console.log(`📦 Products fetched: ${result.products.length}`);

  if (result.products.length > 0) {
    console.log('\n📋 First product sample:');
    const product = result.products[0];
    console.log({
      id: product.id,
      title: product.title,
      vendor: product.vendor,
      variants: product.variants.length,
      images: product.images.length,
      options: product.options.map(o => `${o.name}: ${o.values.join(', ')}`),
      price: product.variants[0]?.price,
    });
  }

  if (result.error) {
    console.log(`\n⚠️  Error: ${result.error}`);
  }
}

async function main() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('YogaMatLab Custom Scrapers - Test Suite');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const startTime = Date.now();

  try {
    if (scraperType === 'shopify') {
      await testShopify();
    } else if (scraperType === 'lululemon') {
      await testLululemon();
    } else if (scraperType === 'bigcommerce') {
      await testBigCommerce();
    } else {
      console.log('❌ Invalid scraper type. Use: shopify, lululemon, or bigcommerce');
      process.exit(1);
    }
  } catch (error) {
    console.log('\n❌ Test failed with error:');
    console.error(error);
    process.exit(1);
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`\n⏱️  Duration: ${duration}s`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

main();
