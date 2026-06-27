-- Migration 0020: Backfill products.cover_image_url.
-- Sets cover_image_url to the first uploaded image (by sort_order) for products
-- that already have images in product_images but cover_image_url IS NULL.
-- Idempotent: products with cover_image_url already set are untouched.
UPDATE products
SET cover_image_url = (
  SELECT url
  FROM product_images
  WHERE product_id = products.id
  ORDER BY sort_order ASC, created_at ASC, id ASC
  LIMIT 1
)
WHERE cover_image_url IS NULL
  AND EXISTS (SELECT 1 FROM product_images WHERE product_id = products.id);
