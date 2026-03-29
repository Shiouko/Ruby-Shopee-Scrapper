# Ruby Shopee Scrapper

An efficient Shopee Malaysia product scraper with a REST API backend, built with TypeScript and Hono.

## Features

- **Fast API-based scraping** -- Uses Shopee's public JSON API endpoints, no browser automation needed
- **REST API server** -- Search, fetch details, and query cached products via HTTP
- **SQLite caching** -- Local database with WAL mode for fast reads and search result caching
- **Rate limiting** -- Built-in request throttling (500-1000ms) and retry with exponential backoff
- **CLI tool** -- Quick command-line searches without starting the server
- **TypeScript** -- Fully typed codebase for reliability

## Tech Stack

- **Runtime:** Node.js + TypeScript
- **Web Framework:** Hono (lightweight, fast)
- **Database:** SQLite via better-sqlite3 (WAL mode)
- **HTTP Client:** Axios
- **Dev Tools:** tsx (TypeScript execution), tsc (compilation)

## Installation

```bash
# Clone the repo
git clone https://github.com/Shiouko/Ruby-Shopee-Scrapper.git
cd Ruby-Shopee-Scrapper

# Install dependencies
npm install

# Start development server
npm run dev
```

## Usage

### Start the API Server

```bash
# Development (with hot reload)
npm run dev

# Production
npm run build
npm start
```

The server runs on `http://localhost:3000` by default. Set `PORT` env var to change.

### CLI Usage

```bash
# Search products
npx tsx src/cli.ts search "iphone 15" --limit 10

# Search with pagination
npx tsx src/cli.ts search "laptop" --limit 20 --page 2

# Get product detail
npx tsx src/cli.ts product 123456789 987654321

# List cached products
npx tsx src/cli.ts list --sort sold --limit 5

# Show database stats
npx tsx src/cli.ts stats
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | API server port |
| `DB_PATH` | `./data/shopee.db` | SQLite database path |

## API Endpoints

### `GET /`
API info and available endpoints.

**Response:**
```json
{
  "name": "Ruby Shopee Scrapper",
  "version": "1.0.0",
  "status": "running",
  "endpoints": ["GET /", "GET /api/search", "..."]
}
```

### `GET /api/health`
Health check endpoint.

**Response:**
```json
{ "status": "ok", "timestamp": "2024-01-01T00:00:00.000Z" }
```

### `GET /api/search?q=keyword&limit=20&page=1`
Search for products on Shopee Malaysia.

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `q` | string | *required* | Search keyword |
| `limit` | number | `20` | Max results (max: 200) |
| `page` | number | `1` | Page number |

**Response:**
```json
{
  "query": "iphone 15",
  "page": 1,
  "cached": false,
  "count": 20,
  "products": [
    {
      "item_id": 123456789,
      "shop_id": 987654321,
      "name": "Apple iPhone 15 128GB",
      "price_min": 3999.00,
      "price_max": 5499.00,
      "sold": 1500,
      "rating": 4.8,
      "review_count": 320,
      "stock": 50,
      "image_url": "https://cf.shopee.com.my/file/...",
      "product_url": "https://shopee.com.my/product/987654321/123456789",
      "category": "Mobile & Gadgets > Mobile Phones",
      "scraped_at": "2024-01-01T00:00:00.000Z"
    }
  ]
}
```

### `GET /api/product/:id`
Get a cached product by item_id.

**Response:**
```json
{
  "product": { "...": "..." },
  "source": "cache"
}
```

### `GET /api/products?min_price=&max_price=&sort=&limit=50&offset=0`
List cached products with optional filters.

| Param | Type | Description |
|-------|------|-------------|
| `min_price` | number | Minimum price filter |
| `max_price` | number | Maximum price filter |
| `sort` | string | Sort: `price_asc`, `price_desc`, `sold`, `rating`, `name` |
| `limit` | number | Results per page (max: 200) |
| `offset` | number | Pagination offset |

### `GET /api/stats`
Database statistics.

**Response:**
```json
{
  "total_products": 150,
  "total_cached_searches": 5,
  "last_scrape_time": "2024-01-01T00:00:00.000Z",
  "db_size_kb": 128
}
```

### `POST /api/scrape`
Trigger a scrape job.

**Body:**
```json
{
  "query": "mechanical keyboard",
  "limit": 30
}
```

**Response:**
```json
{
  "message": "Scraped 30 products for \"mechanical keyboard\"",
  "count": 30,
  "products": ["..."]
}
```

## Architecture

```
src/
  index.ts      -- Hono API server (routes + server setup)
  scraper.ts    -- ShopeeScraper class (API calls, parsing)
  database.ts   -- SQLite layer (CRUD, caching, stats)
  types.ts      -- TypeScript interfaces
  config.ts     -- Configuration constants
  utils.ts      -- Helpers (formatting, logging)
  cli.ts        -- Command-line interface
```

**Data Flow:**
1. API request or CLI command triggers a search/scrape
2. ShopeeScraper makes HTTP requests to Shopee's API with throttling
3. Responses are parsed into typed Product objects
4. Results are cached in SQLite and returned to the client
5. Subsequent requests check the cache first (30-min TTL)

## Rate Limiting Notes

Shopee's API has rate limiting in place. This scraper:
- Waits 500-1000ms (random) between requests
- Retries failed requests up to 3 times with exponential backoff
- Caches search results for 30 minutes to reduce API calls
- Uses SQLite WAL mode for efficient concurrent reads

**Please use responsibly.** Avoid scraping large volumes in short periods.

## License

MIT
