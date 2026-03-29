import path from 'path';

// Shopee Malaysia base URL
export const SHOPEE_BASE_URL = 'https://shopee.com.my';

// API endpoints
export const SEARCH_ENDPOINT = `${SHOPEE_BASE_URL}/api/v4/search/search_items`;
export const ITEM_DETAIL_ENDPOINT = `${SHOPEE_BASE_URL}/api/v4/item/get`;

// Database path
export const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), 'data', 'shopee.db');

// Server config
export const PORT = parseInt(process.env.PORT || '3000', 10);

// Scraping config
export const MIN_DELAY_MS = 500;
export const MAX_DELAY_MS = 1000;
export const MAX_RETRIES = 3;
export const RETRY_BASE_DELAY_MS = 1000;
export const DEFAULT_SEARCH_LIMIT = 20;
export const SEARCH_PAGE_SIZE = 60; // Items per API request page

// Cache config
export const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

// Default HTTP headers for Shopee API requests
export const DEFAULT_HEADERS: Record<string, string> = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json',
  'Accept-Language': 'en-MY,en;q=0.9',
  'Referer': `${SHOPEE_BASE_URL}/`,
  'Content-Type': 'application/json',
  'X-Requested-With': 'XMLHttpRequest',
  'X-API-SOURCE': 'pc',
  'af-ac-enc-dat': '',
  'sz-token': '',
};
