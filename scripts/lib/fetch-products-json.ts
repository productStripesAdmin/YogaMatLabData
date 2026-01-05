/**
 * Fetches product data from Shopify's products.json API endpoint
 * Much simpler and faster than scraping individual product pages!
 */

export interface ShopifyProduct {
  id: number;
  title: string;
  handle: string;
  body_html: string;
  published_at: string;
  created_at: string;
  updated_at: string;
  vendor: string;
  product_type: string;
  tags: string[];
  variants: ShopifyVariant[];
  images?: ShopifyImage[];
  image?: ShopifyImage;
}

export interface ShopifyVariant {
  id: number;
  title: string;
  option1: string | null;
  option2: string | null;
  option3: string | null;
  sku: string;
  price: string;
  compare_at_price: string | null;
  grams: number;
  available: boolean;
  featured_image?: ShopifyImage;
}

export interface ShopifyImage {
  id: number;
  product_id: number;
  src: string;
  width: number;
  height: number;
  alt: string | null;
}

export interface ShopifyProductsResponse {
  products: ShopifyProduct[];
}

export interface FetchResult {
  products: ShopifyProduct[];
  success: boolean;
  error?: string;
  totalPages: number;
}

/**
 * Constructs the products.json URL for a Shopify store
 */
export function buildProductsJsonUrl(
  baseUrl: string,
  collectionPath: string,
  page: number = 1
): string {
  // Remove trailing slash from base URL
  const cleanBaseUrl = baseUrl.replace(/\/$/, '');

  // Ensure collection path starts with /
  const cleanPath = collectionPath.startsWith('/')
    ? collectionPath
    : `/${collectionPath}`;

  // Build URL with pagination
  const url = `${cleanBaseUrl}${cleanPath}/products.json`;

  return page > 1 ? `${url}?page=${page}` : url;
}

/**
 * Fetches a single page of products from Shopify products.json endpoint
 */
export async function fetchProductsPage(
  url: string,
  options: {
    timeout?: number;
    userAgent?: string;
  } = {}
): Promise<ShopifyProductsResponse> {
  const {
    timeout = 30000,
    userAgent = 'YogaMatLab Data Pipeline (contact@yogamatlab.com)',
  } = options;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': userAgent,
        'Accept': 'application/json',
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(
        `HTTP ${response.status}: ${response.statusText}`
      );
    }

    const data = await response.json();
    return data as ShopifyProductsResponse;
  } catch (error) {
    clearTimeout(timeoutId);

    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        throw new Error(`Request timeout after ${timeout}ms`);
      }
      throw error;
    }
    throw new Error('Unknown error fetching products');
  }
}

/**
 * Fetches all products from a Shopify collection with automatic pagination
 */
export async function fetchAllProducts(
  baseUrl: string,
  collectionPath: string,
  options: {
    maxPages?: number;
    delayBetweenPages?: number;
    onPageFetched?: (page: number, count: number) => void;
  } = {}
): Promise<FetchResult> {
  const {
    maxPages = 50, // Safety limit
    delayBetweenPages = 1000, // 1 second between pages
    onPageFetched,
  } = options;

  const allProducts: ShopifyProduct[] = [];
  let currentPage = 1;
  let hasMorePages = true;

  try {
    while (hasMorePages && currentPage <= maxPages) {
      const url = buildProductsJsonUrl(baseUrl, collectionPath, currentPage);
      const response = await fetchProductsPage(url);

      if (response.products.length === 0) {
        hasMorePages = false;
        break;
      }

      allProducts.push(...response.products);

      if (onPageFetched) {
        onPageFetched(currentPage, response.products.length);
      }

      // Check if there are more pages
      // Shopify typically returns empty array when no more products
      if (response.products.length < 30) {
        // Shopify default page size is 30
        hasMorePages = false;
      } else {
        currentPage++;

        // Delay between pages to be polite
        if (hasMorePages && delayBetweenPages > 0) {
          await new Promise((resolve) => setTimeout(resolve, delayBetweenPages));
        }
      }
    }

    return {
      products: allProducts,
      success: true,
      totalPages: currentPage,
    };
  } catch (error) {
    return {
      products: allProducts,
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      totalPages: currentPage - 1,
    };
  }
}

/**
 * Extracts the main image URL from a product
 */
export function getProductImageUrl(product: ShopifyProduct): string | null {
  // Try product-level image first
  if (product.image?.src) {
    return product.image.src;
  }

  // Try images array
  if (product.images && product.images.length > 0) {
    return product.images[0].src;
  }

  // Try first variant's featured image
  if (product.variants && product.variants.length > 0) {
    const firstVariant = product.variants[0];
    if (firstVariant.featured_image?.src) {
      return firstVariant.featured_image.src;
    }
  }

  return null;
}

/**
 * Gets the price range for a product (min and max across all variants)
 */
export function getPriceRange(product: ShopifyProduct): {
  min: number;
  max: number;
  currency: string;
} {
  const prices = product.variants.map((v) => parseFloat(v.price));

  return {
    min: Math.min(...prices),
    max: Math.max(...prices),
    currency: 'USD', // Shopify products.json doesn't include currency, assume USD
  };
}

/**
 * Checks if any variant is available
 */
export function isProductAvailable(product: ShopifyProduct): boolean {
  return product.variants.some((v) => v.available);
}
