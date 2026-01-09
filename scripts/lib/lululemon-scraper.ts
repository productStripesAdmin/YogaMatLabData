/**
 * Lululemon GraphQL Scraper
 *
 * Lululemon uses a custom Next.js application with GraphQL API.
 * This scraper queries their GraphQL endpoint to fetch yoga mat products.
 *
 * GraphQL endpoint: https://shop.lululemon.com/api/graphql
 * Product search uses category filtering and pagination.
 */

import type { ShopifyProduct, ShopifyVariant, ShopifyImage, ShopifyOptions } from './fetch-products-json.js';

/**
 * Pool of realistic user agents for rotation
 */
const USER_AGENTS = [
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15',
];

function getRandomUserAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

/**
 * Lululemon GraphQL product structure
 */
interface LululemonProduct {
  productId: string;
  name: string;
  price: {
    currentPrice: number;
    fullPrice: number;
  };
  swatches: Array<{
    swatchName: string;
    colorId: string;
    images: Array<{
      mainCarousel: {
        media: {
          mediaType: string;
          url: string;
          alt: string;
        };
      };
    }>;
  }>;
  sizes: Array<{
    details: string;
    isAvailable: boolean;
    price: number;
  }>;
  pdpUrl: string;
  featurePanels: Array<{
    featuresContent: Array<{
      headline: string;
      details: string;
    }>;
  }>;
}

interface LululemonSearchResponse {
  data: {
    search: {
      products: LululemonProduct[];
      total: number;
    };
  };
}

export interface LululemonFetchResult {
  products: ShopifyProduct[];
  success: boolean;
  error?: string;
  totalProducts: number;
}

/**
 * GraphQL query for searching yoga mats
 * This query structure is based on Lululemon's public GraphQL schema
 */
function buildSearchQuery(categoryId: string, offset: number = 0, limit: number = 60): string {
  return JSON.stringify({
    operationName: 'ProductSearch',
    variables: {
      categoryId,
      offset,
      limit,
      locale: 'en-US',
      currency: 'USD',
      filters: [],
      sortOption: 'featured',
    },
    query: `
      query ProductSearch($categoryId: String!, $offset: Int, $limit: Int, $locale: String!, $currency: String!, $filters: [FilterInput!], $sortOption: String) {
        search(categoryId: $categoryId, offset: $offset, limit: $limit, locale: $locale, currency: $currency, filters: $filters, sortOption: $sortOption) {
          total
          products {
            productId
            name
            price {
              currentPrice
              fullPrice
            }
            swatches {
              swatchName
              colorId
              images {
                mainCarousel {
                  media {
                    mediaType
                    url
                    alt
                  }
                }
              }
            }
            sizes {
              details
              isAvailable
              price
            }
            pdpUrl
            featurePanels {
              featuresContent {
                headline
                details
              }
            }
          }
        }
      }
    `,
  });
}

/**
 * Convert Lululemon product to Shopify-compatible format
 * This allows the rest of the pipeline to work with a unified structure
 */
function convertToShopifyFormat(product: LululemonProduct): ShopifyProduct {
  const now = new Date().toISOString();

  // Extract all unique colors from swatches
  const colors = product.swatches.map(s => s.swatchName);

  // Extract sizes from size array
  const sizes = product.sizes.map(s => s.details);

  // Build variants (one per color/size combination)
  const variants: ShopifyVariant[] = [];
  let variantId = 1;

  for (const swatch of product.swatches) {
    for (const size of product.sizes) {
      variants.push({
        id: parseInt(`${product.productId}${variantId++}`),
        title: `${swatch.swatchName} / ${size.details}`,
        option1: swatch.swatchName,
        option2: size.details,
        option3: null,
        sku: `${product.productId}-${swatch.colorId}-${size.details}`,
        price: size.price.toString(),
        compare_at_price: product.price.fullPrice > size.price ? product.price.fullPrice.toString() : null,
        grams: 0, // Lululemon doesn't provide weight
        available: size.isAvailable,
        required_shipping: true,
        taxable: true,
        position: variantId - 1,
        product_id: parseInt(product.productId),
        created_at: now,
        updated_at: now,
      });
    }
  }

  // Build images array from all swatches
  const images: ShopifyImage[] = [];
  let imageId = 1;

  for (const swatch of product.swatches) {
    for (const image of swatch.images) {
      if (image.mainCarousel?.media?.url) {
        images.push({
          id: imageId++,
          product_id: parseInt(product.productId),
          src: image.mainCarousel.media.url,
          alt: image.mainCarousel.media.alt || product.name,
          width: 0, // Unknown
          height: 0, // Unknown
          position: imageId - 1,
          variant_ids: [],
          created_at: now,
          updated_at: now,
        });
      }
    }
  }

  // Extract features and description
  const features = product.featurePanels?.[0]?.featuresContent || [];
  const description = features.map(f => `<p><strong>${f.headline}</strong>: ${f.details}</p>`).join('\n');

  // Build tags from features
  const tags = features.map(f => f.headline);

  // Build options array
  const options: ShopifyOptions[] = [
    {
      name: 'Color',
      position: 1,
      values: colors,
    },
    {
      name: 'Size',
      position: 2,
      values: sizes,
    },
  ];

  return {
    id: parseInt(product.productId),
    title: product.name,
    handle: product.pdpUrl.split('/').pop() || product.name.toLowerCase().replace(/\s+/g, '-'),
    body_html: description,
    published_at: now,
    created_at: now,
    updated_at: now,
    vendor: 'Lululemon',
    product_type: 'Yoga Accessories',
    tags,
    variants,
    images,
    options,
  };
}

/**
 * Fetch yoga mats from Lululemon's GraphQL API
 *
 * @param categoryId - Lululemon's internal category ID for yoga mats (e.g., "8s6" for yoga accessories)
 * @param options - Fetch options including pagination and delays
 */
export async function fetchLululemonProducts(
  categoryId: string = '8s6', // Default: yoga accessories category
  options: {
    maxPages?: number;
    pageSize?: number;
    delayBetweenPages?: number;
    onPageFetched?: (page: number, count: number, total: number) => void;
  } = {}
): Promise<LululemonFetchResult> {
  const {
    maxPages = 10,
    pageSize = 60,
    delayBetweenPages = 2000, // 2 seconds between pages (be polite)
    onPageFetched,
  } = options;

  const graphqlUrl = 'https://shop.lululemon.com/api/graphql';
  const allProducts: ShopifyProduct[] = [];

  try {
    let offset = 0;
    let page = 1;
    let totalProducts = 0;
    let hasMore = true;

    while (hasMore && page <= maxPages) {
      const query = buildSearchQuery(categoryId, offset, pageSize);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);

      try {
        const response = await fetch(graphqlUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': getRandomUserAgent(),
            'Accept': 'application/json',
            'Accept-Language': 'en-US,en;q=0.9',
            'Origin': 'https://shop.lululemon.com',
            'Referer': 'https://shop.lululemon.com/c/yoga-accessories/_/N-8s6',
          },
          body: query,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data: LululemonSearchResponse = await response.json();

        if (!data.data?.search?.products) {
          throw new Error('Invalid GraphQL response structure');
        }

        const { products, total } = data.data.search;
        totalProducts = total;

        if (products.length === 0) {
          hasMore = false;
          break;
        }

        // Convert to Shopify format
        const convertedProducts = products.map(convertToShopifyFormat);
        allProducts.push(...convertedProducts);

        if (onPageFetched) {
          onPageFetched(page, products.length, totalProducts);
        }

        // Check if there are more pages
        offset += pageSize;
        if (offset >= totalProducts) {
          hasMore = false;
        } else {
          page++;

          // Delay between pages
          if (hasMore && delayBetweenPages > 0) {
            await new Promise(resolve => setTimeout(resolve, delayBetweenPages));
          }
        }
      } catch (error) {
        clearTimeout(timeoutId);

        if (error instanceof Error && error.name === 'AbortError') {
          throw new Error('Request timeout after 30s');
        }
        throw error;
      }
    }

    return {
      products: allProducts,
      success: true,
      totalProducts,
    };
  } catch (error) {
    return {
      products: allProducts,
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      totalProducts: allProducts.length,
    };
  }
}

/**
 * Helper function to find Lululemon category IDs
 * Common categories:
 * - 8s6: Yoga Accessories (includes yoga mats)
 * - 1z0qd0t: Women's Yoga
 * - 1z0qetm: Men's Yoga
 */
export function getLululemonCategoryIds() {
  return {
    yogaAccessories: '8s6',
    womensYoga: '1z0qd0t',
    mensYoga: '1z0qetm',
  };
}
