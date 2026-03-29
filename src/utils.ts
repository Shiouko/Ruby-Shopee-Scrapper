import { SHOPEE_BASE_URL } from './config.js';

/**
 * Format price from Shopee's internal format (in 100000ths of currency unit) to display format.
 * Shopee stores prices multiplied by 100000.
 */
export function formatPrice(priceRaw: number): number {
  return priceRaw / 100000;
}

/**
 * Format a price as a display string in MYR.
 */
export function formatPriceDisplay(priceRaw: number): string {
  const price = formatPrice(priceRaw);
  return `RM ${price.toFixed(2)}`;
}

/**
 * Build a Shopee product URL from item_id and shop_id.
 */
export function buildProductUrl(itemId: number, shopId: number): string {
  return `${SHOPEE_BASE_URL}/product/${shopId}/${itemId}`;
}

/**
 * Build an image URL from Shopee's image hash.
 */
export function buildImageUrl(imageHash: string): string {
  if (!imageHash) return '';
  if (imageHash.startsWith('http')) return imageHash;
  return `https://cf.shopee.com.my/file/${imageHash}`;
}

/**
 * Sleep for a given number of milliseconds.
 */
export async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Generate a random delay between min and max milliseconds.
 */
export function randomDelay(minMs: number, maxMs: number): number {
  return Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
}

/**
 * Log with timestamp.
 */
export function log(level: 'info' | 'warn' | 'error', message: string, data?: unknown): void {
  const timestamp = new Date().toISOString();
  const prefix = `[${timestamp}] [${level.toUpperCase()}]`;
  if (data !== undefined) {
    console.log(`${prefix} ${message}`, data);
  } else {
    console.log(`${prefix} ${message}`);
  }
}

/**
 * Truncate a string to a max length with ellipsis.
 */
export function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 3) + '...';
}
