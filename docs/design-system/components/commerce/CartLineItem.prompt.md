A cart row.

```jsx
<CartLineItem productName="Kopi O Kaw Drip Bags" storeName="Ah Huat Roasters" variantName="200g" price="RM24.90" quantity={2} onQuantityChange={setQty} onRemove={remove} />
```

Quantity uses two 28px outline icon buttons around a plain count — no number input. Remove is a ghost button in `--danger-600`, never an icon-only trash can.
