/**
 * Product data structure returned by the scraper and stored in the database.
 */
export interface Product {
  item_id: number;
  shop_id: number;
  name: string;
  price_min: number;
  price_max: number;
  sold: number;
  rating: number;
  review_count: number;
  stock: number;
  image_url: string;
  product_url: string;
  category: string;
  scraped_at: string;
}

/**
 * Search result from Shopee API (internal representation).
 */
export interface ShopeeSearchItem {
  item_basic: {
    itemid: number;
    shopid: number;
    name: string;
    price_min: number;
    price_max: number;
    sold: number;
    liked_count: number;
    stock: number;
    image: string;
    images: string[];
    item_rating: {
      rating_star: number;
      rating_count: number[];
    };
    shop_location: string;
    catid: number;
    categories?: Array<{ id: number; display_name: string }>;
  };
}

/**
 * Item detail from Shopee API (internal representation).
 */
export interface ShopeeItemDetail {
  item: {
    itemid: number;
    shopid: number;
    name: string;
    price_min: number;
    price_max: number;
    sold: number;
    liked_count: number;
    stock: number;
    image: string;
    images: string[];
    item_rating: {
      rating_star: number;
      rating_count: number[];
    };
    categories?: Array<{ id: number; display_name: string }>;
    description?: string;
  };
}

/**
 * Search API response.
 */
export interface ShopeeSearchResponse {
  items: ShopeeSearchItem[];
  nomore: boolean;
  total_count?: number;
}

/**
 * Item detail API response.
 */
export interface ShopeeItemResponse {
  data?: ShopeeItemDetail;
  error?: string;
  error_msg?: string;
}

/**
 * Database stats response.
 */
export interface DatabaseStats {
  total_products: number;
  total_cached_searches: number;
  last_scrape_time: string | null;
  db_size_kb: number;
}

/**
 * API info response.
 */
export interface ApiInfo {
  name: string;
  version: string;
  status: string;
  endpoints: string[];
}
