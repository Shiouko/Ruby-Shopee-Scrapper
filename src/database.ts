import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { DB_PATH, CACHE_TTL_MS } from './config.js';
import type { Product, DatabaseStats } from './types.js';
import { log } from './utils.js';

let db: Database.Database | null = null;

/**
 * Initialize the SQLite database with WAL mode and required tables.
 */
export function getDatabase(): Database.Database {
  if (db) return db;

  // Ensure data directory exists
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  db = new Database(DB_PATH);

  // Enable WAL mode for better concurrency
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');

  // Create tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS products (
      item_id INTEGER PRIMARY KEY,
      shop_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      price_min REAL NOT NULL DEFAULT 0,
      price_max REAL NOT NULL DEFAULT 0,
      sold INTEGER NOT NULL DEFAULT 0,
      rating REAL NOT NULL DEFAULT 0,
      review_count INTEGER NOT NULL DEFAULT 0,
      stock INTEGER NOT NULL DEFAULT 0,
      image_url TEXT DEFAULT '',
      product_url TEXT DEFAULT '',
      category TEXT DEFAULT '',
      scraped_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS search_cache (
      query TEXT PRIMARY KEY,
      results_json TEXT NOT NULL,
      cached_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  log('info', 'Database initialized at', DB_PATH);
  return db;
}

/**
 * Save an array of products to the database (upsert).
 */
export function saveProducts(products: Product[]): number {
  const db = getDatabase();
  const stmt = db.prepare(`
    INSERT INTO products (item_id, shop_id, name, price_min, price_max, sold, rating, review_count, stock, image_url, product_url, category, scraped_at)
    VALUES (@item_id, @shop_id, @name, @price_min, @price_max, @sold, @rating, @review_count, @stock, @image_url, @product_url, @category, @scraped_at)
    ON CONFLICT(item_id) DO UPDATE SET
      shop_id = @shop_id,
      name = @name,
      price_min = @price_min,
      price_max = @price_max,
      sold = @sold,
      rating = @rating,
      review_count = @review_count,
      stock = @stock,
      image_url = @image_url,
      product_url = @product_url,
      category = @category,
      scraped_at = @scraped_at
  `);

  const transaction = db.transaction((items: Product[]) => {
    let count = 0;
    for (const item of items) {
      stmt.run(item);
      count++;
    }
    return count;
  });

  const saved = transaction(products);
  log('info', `Saved ${saved} products to database`);
  return saved;
}

/**
 * Get a single product by item_id.
 */
export function getProduct(itemId: number): Product | undefined {
  const db = getDatabase();
  const stmt = db.prepare('SELECT * FROM products WHERE item_id = ?');
  return stmt.get(itemId) as Product | undefined;
}

/**
 * List products with optional filters.
 */
export function listProducts(options: {
  minPrice?: number;
  maxPrice?: number;
  sort?: string;
  limit?: number;
  offset?: number;
} = {}): Product[] {
  const db = getDatabase();
  const conditions: string[] = [];
  const params: Record<string, unknown> = {};

  if (options.minPrice !== undefined) {
    conditions.push('price_max >= @minPrice');
    params.minPrice = options.minPrice;
  }
  if (options.maxPrice !== undefined) {
    conditions.push('price_min <= @maxPrice');
    params.maxPrice = options.maxPrice;
  }

  let orderBy = 'scraped_at DESC';
  switch (options.sort) {
    case 'price_asc':
      orderBy = 'price_min ASC';
      break;
    case 'price_desc':
      orderBy = 'price_max DESC';
      break;
    case 'sold':
      orderBy = 'sold DESC';
      break;
    case 'rating':
      orderBy = 'rating DESC';
      break;
    case 'name':
      orderBy = 'name ASC';
      break;
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = options.limit || 50;
  const offset = options.offset || 0;

  const sql = `SELECT * FROM products ${where} ORDER BY ${orderBy} LIMIT @limit OFFSET @offset`;
  params.limit = limit;
  params.offset = offset;

  const stmt = db.prepare(sql);
  return stmt.all(params) as Product[];
}

/**
 * Get cached search results if still valid.
 */
export function getCachedSearch(query: string): Product[] | null {
  const db = getDatabase();
  const stmt = db.prepare('SELECT results_json, cached_at FROM search_cache WHERE query = ?');
  const row = stmt.get(query) as { results_json: string; cached_at: string } | undefined;

  if (!row) return null;

  // Check TTL
  const cachedAt = new Date(row.cached_at).getTime();
  const now = Date.now();
  if (now - cachedAt > CACHE_TTL_MS) {
    // Cache expired, delete it
    db.prepare('DELETE FROM search_cache WHERE query = ?').run(query);
    return null;
  }

  try {
    return JSON.parse(row.results_json) as Product[];
  } catch {
    return null;
  }
}

/**
 * Cache search results.
 */
export function cacheSearch(query: string, results: Product[]): void {
  const db = getDatabase();
  const stmt = db.prepare(`
    INSERT INTO search_cache (query, results_json, cached_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(query) DO UPDATE SET
      results_json = excluded.results_json,
      cached_at = excluded.cached_at
  `);
  stmt.run(query, JSON.stringify(results));
}

/**
 * Clear expired cache entries.
 */
export function clearOldCache(): number {
  const db = getDatabase();
  const stmt = db.prepare(`
    DELETE FROM search_cache 
    WHERE cached_at < datetime('now', '-30 minutes')
  `);
  const result = stmt.run();
  if (result.changes > 0) {
    log('info', `Cleared ${result.changes} expired cache entries`);
  }
  return result.changes;
}

/**
 * Get database statistics.
 */
export function getStats(): DatabaseStats {
  const db = getDatabase();
  const productCount = (db.prepare('SELECT COUNT(*) as count FROM products').get() as { count: number }).count;
  const cacheCount = (db.prepare('SELECT COUNT(*) as count FROM search_cache').get() as { count: number }).count;
  const lastScrape = db.prepare('SELECT MAX(scraped_at) as last FROM products').get() as { last: string | null };

  let dbSizeKb = 0;
  try {
    const stats = fs.statSync(DB_PATH);
    dbSizeKb = Math.round(stats.size / 1024);
  } catch {
    // DB file might not exist yet
  }

  return {
    total_products: productCount,
    total_cached_searches: cacheCount,
    last_scrape_time: lastScrape.last,
    db_size_kb: dbSizeKb,
  };
}

/**
 * Close the database connection.
 */
export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
    log('info', 'Database connection closed');
  }
}
