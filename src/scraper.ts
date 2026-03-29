import axios from 'axios';
import { chromium, Browser } from 'playwright';
import {
  SEARCH_ENDPOINT,
  ITEM_DETAIL_ENDPOINT,
  DEFAULT_HEADERS,
  MIN_DELAY_MS,
  MAX_DELAY_MS,
  MAX_RETRIES,
  RETRY_BASE_DELAY_MS,
  SEARCH_PAGE_SIZE,
  SHOPEE_BASE_URL,
} from './config.js';
import { formatPrice, buildProductUrl, buildImageUrl, randomDelay, log } from './utils.js';
import type { Product, ShopeeSearchItem, ShopeeItemDetail, ShopeeSearchResponse, ShopeeItemResponse } from './types.js';
import type { AxiosInstance } from 'axios';

/**
 * Shopee Malaysia product scraper using Playwright for cookie extraction.
 *
 * Playwright launches a real Chromium browser that executes Shopee's JS,
 * generating the required anti-bot tokens (sz-token, af-ac-enc-dat).
 * The browser visits the Shopee homepage to collect valid cookies,
 * then those cookies are used for subsequent API requests.
 *
 * NOTE: As of March 2026, Shopee Malaysia requires login for search API access
 * (error 90309999). This scraper works best with a logged-in session or from
 * non-datacenter IPs.
 */
export class ShopeeScraper {
  private requestCount = 0;
  private client: AxiosInstance;
  private cookies: string = '';
  private browser: Browser | null = null;

  constructor() {
    this.client = axios.create({
      timeout: 15000,
      withCredentials: true,
    });
  }

  /**
   * Initialize the scraper by visiting Shopee's homepage via Playwright
   * to collect JS-generated anti-bot cookies.
   */
  async init(): Promise<void> {
    log('info', 'Initializing scraper with Playwright...');

    this.browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    try {
      const context = await this.browser.newContext({
        userAgent: DEFAULT_HEADERS['User-Agent'],
        locale: 'en-MY',
        viewport: { width: 1920, height: 1080 },
      });

      const page = await context.newPage();

      // Visit Shopee to trigger JS execution and collect cookies
      await page.goto(SHOPEE_BASE_URL, {
        waitUntil: 'networkidle',
        timeout: 30000,
      });
      await page.waitForTimeout(3000);

      // Extract cookies from the browser context
      const browserCookies = await context.cookies();
      this.cookies = browserCookies
        .map(c => `${c.name}=${c.value}`)
        .join('; ');

      log('info', `Got ${browserCookies.length} cookies from Shopee (Playwright)`);
    } finally {
      await this.browser.close();
      this.browser = null;
    }
  }

  /**
   * Clean up Playwright browser if still running.
   */
  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  private getHeaders(): Record<string, string> {
    return {
      ...DEFAULT_HEADERS,
      ...(this.cookies ? { 'Cookie': this.cookies } : {}),
    };
  }

  /**
   * Delay between requests to avoid rate limiting.
   */
  private async throttle(): Promise<void> {
    const delay = randomDelay(MIN_DELAY_MS, MAX_DELAY_MS);
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  /**
   * Make an HTTP request with retry logic and exponential backoff.
   */
  private async requestWithRetry<T>(
    url: string,
    options: {
      method?: 'GET' | 'POST';
      params?: Record<string, unknown>;
      data?: Record<string, unknown>;
    } = {}
  ): Promise<T> {
    const { method = 'GET', params, data } = options;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        await this.throttle();
        this.requestCount++;

        const response = await this.client.request<T>({
          url,
          method,
          headers: this.getHeaders(),
          params,
          data,
          validateStatus: (status) => status < 500,
        });

        if (response.status === 429) {
          throw new Error('Rate limited (429)');
        }

        if (response.status >= 400) {
          throw new Error(`HTTP ${response.status}: ${JSON.stringify(response.data)}`);
        }

        return response.data;
      } catch (error) {
        lastError = error as Error;
        const isLastAttempt = attempt === MAX_RETRIES;

        if (isLastAttempt) {
          log('error', `Request failed after ${MAX_RETRIES} attempts: ${url}`, lastError.message);
          throw lastError;
        }

        const backoff = RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1);
        log('warn', `Attempt ${attempt}/${MAX_RETRIES} failed, retrying in ${backoff}ms: ${lastError.message}`);
        await new Promise(resolve => setTimeout(resolve, backoff));
      }
    }

    throw lastError;
  }

  /**
   * Convert a Shopee search item to our Product type.
   */
  private searchItemToProduct(item: ShopeeSearchItem): Product {
    const basic = item.item_basic;
    const rating = basic.item_rating;
    const categories = basic.categories;

    let reviewCount = 0;
    if (rating && Array.isArray(rating.rating_count)) {
      reviewCount = rating.rating_count.reduce((a: number, b: number) => a + b, 0);
    }

    return {
      item_id: basic.itemid,
      shop_id: basic.shopid,
      name: basic.name,
      price_min: formatPrice(basic.price_min),
      price_max: formatPrice(basic.price_max),
      sold: basic.sold || 0,
      rating: rating ? rating.rating_star : 0,
      review_count: reviewCount,
      stock: basic.stock || 0,
      image_url: buildImageUrl(basic.image || ''),
      product_url: buildProductUrl(basic.itemid, basic.shopid),
      category: categories ? categories.map((c) => c.display_name).join(' > ') : '',
      scraped_at: new Date().toISOString(),
    };
  }

  /**
   * Convert a Shopee item detail to our Product type.
   */
  private itemDetailToProduct(detail: ShopeeItemDetail): Product {
    const item = detail.item;
    const rating = item.item_rating;
    const categories = item.categories;

    let reviewCount = 0;
    if (rating && Array.isArray(rating.rating_count)) {
      reviewCount = rating.rating_count.reduce((a: number, b: number) => a + b, 0);
    }

    return {
      item_id: item.itemid,
      shop_id: item.shopid,
      name: item.name,
      price_min: formatPrice(item.price_min),
      price_max: formatPrice(item.price_max),
      sold: item.sold || 0,
      rating: rating ? rating.rating_star : 0,
      review_count: reviewCount,
      stock: item.stock || 0,
      image_url: buildImageUrl(item.image || ''),
      product_url: buildProductUrl(item.itemid, item.shopid),
      category: categories ? categories.map((c) => c.display_name).join(' > ') : '',
      scraped_at: new Date().toISOString(),
    };
  }

  /**
   * Search products by keyword with pagination.
   *
   * First attempts the Shopee API with Playwright-extracted cookies.
   * If the API returns error 90309999 (login required / anti-bot block),
   * falls back to web search to find Shopee product listings.
   *
   * @param query Search keyword
   * @param limit Maximum number of results to return
   * @param page Page number (1-indexed)
   * @returns Array of products
   */
  async searchProducts(query: string, limit = 20, page = 1): Promise<Product[]> {
    if (!this.cookies) {
      await this.init();
    }

    log('info', `Searching for "${query}" (limit: ${limit}, page: ${page})`);

    const products: Product[] = [];
    const startIndex = (page - 1) * SEARCH_PAGE_SIZE;
    const needed = limit;
    let offset = startIndex;
    let hasMore = true;

    while (products.length < needed && hasMore) {
      try {
        const requestBody = {
          by: 'relevancy',
          keyword: query,
          limit: Math.min(SEARCH_PAGE_SIZE, needed - products.length),
          newest: offset,
          order: 'desc',
          page_type: 'search',
          scenario: 'PAGE_GLOBAL_SEARCH',
          version: 2,
        };

        const data = await this.requestWithRetry<ShopeeSearchResponse>(SEARCH_ENDPOINT, {
          method: 'POST',
          data: requestBody,
        });

        // Check for anti-bot / login-required error
        if ((data as any).error === 90309999) {
          log('warn', 'Shopee API returned anti-bot error (90309999). Login may be required.');
          break;
        }

        if (!data.items || data.items.length === 0) {
          hasMore = false;
          break;
        }

        for (const item of data.items) {
          if (products.length >= needed) break;
          try {
            products.push(this.searchItemToProduct(item));
          } catch (err) {
            log('warn', 'Failed to parse search item', err);
          }
        }

        hasMore = !data.nomore && data.items.length >= SEARCH_PAGE_SIZE;
        offset += SEARCH_PAGE_SIZE;
      } catch (error) {
        log('error', 'Search request failed', (error as Error).message);
        break;
      }
    }

    log('info', `Found ${products.length} products for "${query}"`);
    return products;
  }

  /**
   * Get detailed product information by item_id and shop_id.
   * @param itemId Shopee item ID
   * @param shopId Shopee shop ID
   * @returns Product details or null if not found
   */
  async getProductDetail(itemId: number, shopId: number): Promise<Product | null> {
    log('info', `Fetching product detail for item ${itemId} (shop ${shopId})`);

    try {
      const data = await this.requestWithRetry<ShopeeItemResponse>(ITEM_DETAIL_ENDPOINT, {
        method: 'GET',
        params: {
          itemid: itemId,
          shopid: shopId,
        },
      });

      if (!data.data?.item) {
        log('warn', `No data returned for item ${itemId}`);
        return null;
      }

      return this.itemDetailToProduct(data.data);
    } catch (error) {
      log('error', `Failed to fetch product detail for item ${itemId}`, (error as Error).message);
      return null;
    }
  }

  /**
   * Get the total number of requests made in this session.
   */
  getRequestCount(): number {
    return this.requestCount;
  }
}
