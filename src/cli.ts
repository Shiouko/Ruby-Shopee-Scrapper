#!/usr/bin/env node
import { ShopeeScraper } from './scraper.js';
import { getDatabase, saveProducts, getProduct, listProducts, getStats } from './database.js';
import { formatPriceDisplay, log } from './utils.js';

// Initialize database
getDatabase();

const scraper = new ShopeeScraper();

function printUsage(): void {
  console.log(`
Ruby Shopee Scrapper CLI

Usage:
  npx tsx src/cli.ts search <query> [--limit N] [--page N]
  npx tsx src/cli.ts product <item_id> <shop_id>
  npx tsx src/cli.ts list [--limit N] [--sort price_asc|price_desc|sold|rating]
  npx tsx src/cli.ts stats

Examples:
  npx tsx src/cli.ts search "iphone 15" --limit 10
  npx tsx src/cli.ts search "laptop" --limit 20 --page 2
  npx tsx src/cli.ts product 123456789 987654321
  npx tsx src/cli.ts list --sort sold --limit 5
  npx tsx src/cli.ts stats
  `);
}

function parseArgs(args: string[]): Record<string, string> {
  const parsed: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].slice(2);
      const value = args[i + 1] || '';
      parsed[key] = value;
      i++;
    }
  }
  return parsed;
}

function printProduct(p: { item_id: number; shop_id: number; name: string; price_min: number; price_max: number; sold: number; rating: number; stock: number; product_url: string }): void {
  console.log(`\n  ${p.name}`);
  console.log(`  ID: ${p.item_id} | Shop: ${p.shop_id}`);
  const priceStr = p.price_min === p.price_max
    ? formatPriceDisplay(p.price_min * 100000)
    : `${formatPriceDisplay(p.price_min * 100000)} - ${formatPriceDisplay(p.price_max * 100000)}`;
  console.log(`  Price: ${priceStr}`);
  console.log(`  Sold: ${p.sold} | Rating: ${p.rating} | Stock: ${p.stock}`);
  console.log(`  URL: ${p.product_url}`);
}

async function main(): Promise<void> {
  const [command, ...restArgs] = process.argv.slice(2);
  const flags = parseArgs(restArgs);

  if (!command) {
    printUsage();
    process.exit(0);
  }

  switch (command) {
    case 'search': {
      const query = restArgs.find(a => !a.startsWith('--'));
      if (!query) {
        console.error('Error: search requires a query string');
        printUsage();
        process.exit(1);
      }
      const limit = parseInt(flags.limit || '20', 10);
      const page = parseInt(flags.page || '1', 10);

      console.log(`Searching for "${query}" (limit: ${limit}, page: ${page})...`);
      const products = await scraper.searchProducts(query, limit, page);

      if (products.length === 0) {
        console.log('No products found.');
      } else {
        console.log(`\nFound ${products.length} products:`);
        for (const p of products) {
          printProduct(p);
        }
        // Save to database
        saveProducts(products);
        console.log(`\nSaved ${products.length} products to database.`);
      }
      break;
    }

    case 'product': {
      const itemId = parseInt(restArgs.find(a => !a.startsWith('--')) || '', 10);
      const shopIdStr = restArgs.filter(a => !a.startsWith('--'))[1];
      const shopId = parseInt(shopIdStr || '', 10);

      if (isNaN(itemId) || isNaN(shopId)) {
        console.error('Error: product requires item_id and shop_id');
        printUsage();
        process.exit(1);
      }

      console.log(`Fetching product ${itemId} from shop ${shopId}...`);
      const product = await scraper.getProductDetail(itemId, shopId);

      if (!product) {
        console.log('Product not found.');
      } else {
        printProduct(product);
        saveProducts([product]);
        console.log('\nSaved to database.');
      }
      break;
    }

    case 'list': {
      const limit = parseInt(flags.limit || '20', 10);
      const sort = flags.sort || 'scraped_at';
      const products = listProducts({ limit, sort });

      if (products.length === 0) {
        console.log('No products in database. Use "search" or "product" to populate.');
      } else {
        console.log(`\n${products.length} products in database:`);
        for (const p of products) {
          printProduct(p);
        }
      }
      break;
    }

    case 'stats': {
      const stats = getStats();
      console.log('\nDatabase Statistics:');
      console.log(`  Total products: ${stats.total_products}`);
      console.log(`  Cached searches: ${stats.total_cached_searches}`);
      console.log(`  Last scrape: ${stats.last_scrape_time || 'never'}`);
      console.log(`  DB size: ${stats.db_size_kb} KB`);
      break;
    }

    default:
      console.error(`Unknown command: ${command}`);
      printUsage();
      process.exit(1);
  }
}

main().catch((error) => {
  log('error', 'CLI error', error);
  process.exit(1);
});
