-- Migration 0018: Seed starter categories for the BOMY marketplace.
-- Uses ON CONFLICT DO NOTHING so re-runs are safe.

INSERT INTO categories (id, name, slug, sort_order, is_active, created_at)
VALUES
  (gen_random_uuid(), 'Fashion & Apparel',  'fashion-apparel',   10,  true, now()),
  (gen_random_uuid(), 'Beauty & Skincare',  'beauty-skincare',   20,  true, now()),
  (gen_random_uuid(), 'Health & Wellness',  'health-wellness',   30,  true, now()),
  (gen_random_uuid(), 'Home & Living',      'home-living',       40,  true, now()),
  (gen_random_uuid(), 'Electronics',        'electronics',       50,  true, now()),
  (gen_random_uuid(), 'Food & Beverages',   'food-beverages',    60,  true, now()),
  (gen_random_uuid(), 'Sports & Outdoors',  'sports-outdoors',   70,  true, now()),
  (gen_random_uuid(), 'Kids & Baby',        'kids-baby',         80,  true, now()),
  (gen_random_uuid(), 'Books & Stationery', 'books-stationery',  90,  true, now()),
  (gen_random_uuid(), 'Accessories',        'accessories',       100, true, now())
ON CONFLICT (slug) DO NOTHING;
