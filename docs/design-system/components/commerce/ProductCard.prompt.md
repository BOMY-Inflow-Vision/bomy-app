A product tile for the 2/3/4-up catalogue grid on /products and brand storefronts.

```jsx
<ProductCard name="Kopi O Kaw Drip Bags" storeName="Ah Huat Roasters" category="Beverages" price="from RM24.90" imageUrl="…" href="/products/ah-huat/kopi-o-kaw" />
```

Square image, category badge, name, brand, price in brand red. Image zooms 3% and the card lifts on hover. Prices arrive as formatted strings (`formatMyrSen`) — never do money math in the component.
