The buy box: variant chips, price, availability, add-to-cart.

```jsx
<VariantPicker variants={[{ id:"1", name:"200g", price:"RM24.90", stockCount:12 }, { id:"2", name:"500g", price:"RM52.00", stockCount:0 }]} onAdd={addItem} />
```

Out-of-stock variants are struck through and disabled; back-order/pre-order variants stay selectable so the buyer can read the badge. The button confirms inline with "Added to cart ✓" for 2s — no toast.
