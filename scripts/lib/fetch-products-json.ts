/**
 * Fetches product data from Shopify's products.json API endpoint
 * Much simpler and faster than scraping individual product pages!
 */

/**
 * Pool of realistic user agents for rotation
 */
const USER_AGENTS = [
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Edge/120.0.0.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:121.0) Gecko/20100101 Firefox/121.0',
];

/**
 * Get a random user agent from the pool
 */
function getRandomUserAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

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
  images: ShopifyImage[]; // removed "image?: ShopifyImage;" on 20260108
  options: ShopifyOptions[];
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
  required_shipping: boolean; // added 20260108
  taxable: boolean; // added 20260108
  position: number; // added 20260108
  product_id: number; // added 20260108
  created_at: string; // added 20260108
  updated_at: string; // added 20260108
}


export interface ShopifyImage {
  id: number;
  product_id: number;
  src: string;
  alt: string | null;
  width: number;
  height: number;
  position: number; // added 20260108
  variant_ids?: number[]; // added 20260108
  created_at: string; // added 20260108
  updated_at: string; // added 20260108
}

// new added 20260108
export interface ShopifyOptions {
  name: string;
  position: number;
  values: string[];
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
  page: number = 1,
  limit: number = 250 // Shopify max is 250
): string {
  // Remove trailing slash from base URL
  const cleanBaseUrl = baseUrl.replace(/\/$/, '');

  // Ensure collection path starts with /
  const cleanPath = collectionPath.startsWith('/')
    ? collectionPath
    : `/${collectionPath}`;

  // Build URL with pagination and limit
  const url = `${cleanBaseUrl}${cleanPath}/products.json`;
  const params = new URLSearchParams();

  params.set('limit', limit.toString());
  if (page > 1) {
    params.set('page', page.toString());
  }

  return `${url}?${params.toString()}`;
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
    userAgent, // Will use random if not provided
  } = options;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    // Extract hostname from URL for Referer header
    const urlObj = new URL(url);
    const origin = `${urlObj.protocol}//${urlObj.host}`;

    const response = await fetch(url, {
      headers: {
        'User-Agent': userAgent || getRandomUserAgent(),
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br, zstd',
        'Referer': origin + '/', // Make it look like we're browsing the site
        'Origin': origin,
        'DNT': '1',
        'Connection': 'keep-alive',
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'same-origin',
        'Sec-Ch-Ua': '"Not A(Brand";v="99", "Google Chrome";v="120", "Chromium";v="120"',
        'Sec-Ch-Ua-Mobile': '?0',
        'Sec-Ch-Ua-Platform': '"macOS"',
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
      // Use limit=250 (Shopify max) for efficient pagination
      const url = buildProductsJsonUrl(baseUrl, collectionPath, currentPage, 250);
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
      // If we got fewer products than the limit, this is the last page
      if (response.products.length < 250) {
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
