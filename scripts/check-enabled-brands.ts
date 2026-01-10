import { ConvexHttpClient } from 'convex/browser';
import 'dotenv/config';

const client = new ConvexHttpClient(process.env.CONVEX_URL!);

try {
  const brands = await client.query('brands:getScrapableBrands' as any);

  console.log('\n=== ENABLED BRANDS IN CONVEX ===\n');
  console.log('Total enabled brands:', brands.length);
  console.log('\n--- By Platform ---');

  const byPlatform: Record<string, any[]> = {};
  brands.forEach((b: any) => {
    const platform = b.platform || 'shopify'; // Default to shopify
    if (!byPlatform[platform]) byPlatform[platform] = [];
    byPlatform[platform].push(b);
  });

  Object.entries(byPlatform).forEach(([platform, brands]) => {
    console.log(`\n${platform.toUpperCase()} (${brands.length}):`);
    brands.forEach((b: any) => {
      console.log(`  - ${b.name} (slug: ${b.slug})`);
      if (platform === 'lululemon') {
        console.log(`    categoryId: ${b.platformConfig?.lululemonCategoryId || '8s6 (default)'}`);
      }
      if (platform === 'bigcommerce') {
        console.log(`    url: ${b.platformConfig?.bigcommerceCollectionUrl || b.productsJsonUrl}`);
      }
      if (platform === 'shopify') {
        const url = b.productsJsonUrl || 'NOT SET';
        console.log(`    url: ${url.substring(0, 80)}${url.length > 80 ? '...' : ''}`);
      }
    });
  });

  process.exit(0);
} catch (error: any) {
  console.error('Error fetching brands:', error.message);
  process.exit(1);
}
