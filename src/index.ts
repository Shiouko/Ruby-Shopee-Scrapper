import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { PORT } from './config.js';
import { ShopeeScraper } from './scraper.js';
import {
  getDatabase,
  saveProducts,
  getProduct,
  listProducts,
  getCachedSearch,
  cacheSearch,
  clearOldCache,
  getStats,
  closeDatabase,
} from './database.js';
import { log } from './utils.js';
import type { ApiInfo } from './types.js';

// Initialize database on startup
getDatabase();

const app = new Hono();
const scraper = new ShopeeScraper();

// --- Routes ---

// Root - API info
app.get('/', (c) => {
  const info: ApiInfo = {
    name: 'Ruby Shopee Scrapper',
    version: '1.0.0',
    status: 'running',
    endpoints: [
      'GET  /',
      'GET  /api/search?q=keyword&limit=20&page=1',
      'GET  /api/product/:id',
      'GET  /api/products?min_price=&max_price=&sort=&limit=',
      'GET  /api/stats',
      'POST /api/scrape',
      'GET  /api/health',
    ],
  };
  return c.json(info);
});

// Health check
app.get('/api/health', (c) => {
  return c.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Search products
app.get('/api/search', async (c) => {
  const query = c.req.query('q');
  if (!query) {
    return c.json({ error: 'Missing required query parameter: q' }, 400);
  }

  const limit = Math.min(parseInt(c.req.query('limit') || '20', 10), 200);
  const page = parseInt(c.req.query('page') || '1', 10);

  try {
    // Check cache first
    const cached = getCachedSearch(`${query}:page${page}`);
    if (cached) {
      log('info', `Cache hit for search: ${query}`);
      return c.json({
        query,
        page,
        cached: true,
        count: cached.length,
        products: cached.slice(0, limit),
      });
    }

    // Scrape fresh results
    const products = await scraper.searchProducts(query, limit, page);

    // Cache results
    if (products.length > 0) {
      cacheSearch(`${query}:page${page}`, products);
      saveProducts(products);
    }

    return c.json({
      query,
      page,
      cached: false,
      count: products.length,
      products,
    });
  } catch (error) {
    log('error', 'Search failed', error);
    return c.json({ error: 'Search failed', message: (error as Error).message }, 500);
  }
});

// Get product detail
app.get('/api/product/:id', async (c) => {
  const itemId = parseInt(c.req.param('id'), 10);
  if (isNaN(itemId)) {
    return c.json({ error: 'Invalid item ID' }, 400);
  }

  try {
    // Check local database first
    const cached = getProduct(itemId);
    if (cached) {
      return c.json({ product: cached, source: 'cache' });
    }

    // If not cached, we need a shop_id to fetch from API
    // Return the cached version if available
    return c.json({ error: 'Product not found in cache. Use /api/search or /api/scrape to populate.' }, 404);
  } catch (error) {
    log('error', 'Product fetch failed', error);
    return c.json({ error: 'Failed to fetch product', message: (error as Error).message }, 500);
  }
});

// List cached products with filters
app.get('/api/products', (c) => {
  const minPrice = c.req.query('min_price') ? parseFloat(c.req.query('min_price')!) : undefined;
  const maxPrice = c.req.query('max_price') ? parseFloat(c.req.query('max_price')!) : undefined;
  const sort = c.req.query('sort') || 'scraped_at';
  const limit = Math.min(parseInt(c.req.query('limit') || '50', 10), 200);
  const offset = parseInt(c.req.query('offset') || '0', 10);

  try {
    const products = listProducts({ minPrice, maxPrice, sort, limit, offset });
    return c.json({
      count: products.length,
      limit,
      offset,
      products,
    });
  } catch (error) {
    log('error', 'List products failed', error);
    return c.json({ error: 'Failed to list products', message: (error as Error).message }, 500);
  }
});

// Database stats
app.get('/api/stats', (c) => {
  try {
    const stats = getStats();
    return c.json(stats);
  } catch (error) {
    log('error', 'Stats fetch failed', error);
    return c.json({ error: 'Failed to fetch stats', message: (error as Error).message }, 500);
  }
});

// Trigger scrape job
app.post('/api/scrape', async (c) => {
  try {
    const body = await c.req.json<{ query?: string; limit?: number }>();
    const query = body.query;
    const limit = Math.min(body.limit || 20, 200);

    if (!query) {
      return c.json({ error: 'Missing required field: query' }, 400);
    }

    log('info', `Scrape triggered for "${query}" (limit: ${limit})`);
    const products = await scraper.searchProducts(query, limit);

    if (products.length > 0) {
      saveProducts(products);
      cacheSearch(query, products);
    }

    return c.json({
      message: `Scraped ${products.length} products for "${query}"`,
      count: products.length,
      products,
    });
  } catch (error) {
    log('error', 'Scrape failed', error);
    return c.json({ error: 'Scrape failed', message: (error as Error).message }, 500);
  }
});

// --- Start server ---

const server = serve({
  fetch: app.fetch,
  port: PORT,
}, (info) => {
  log('info', `Server running on http://localhost:${info.port}`);
});

// Periodic cache cleanup
setInterval(() => {
  clearOldCache();
}, 10 * 60 * 1000); // Every 10 minutes

// Graceful shutdown
function shutdown() {
  log('info', 'Shutting down...');
  closeDatabase();
  server.close();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

export { app };
