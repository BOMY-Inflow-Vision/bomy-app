A button in the BOMY palette — red for primary commerce actions, gold only for membership/reward moments.

```jsx
<Button variant="primary" size="lg" fullWidth>Add to cart</Button>
<Button variant="outline">Clear</Button>
<Button variant="reward">Join now — RM75/yr</Button>
<Button loading>Saving…</Button>
```

Variants: `primary` (red 600), `secondary` (navy 800), `reward` (gold 400 on navy-900 text), `outline`, `ghost`, `destructive`, `link`. Sizes `sm` 32px / `md` 36px / `lg` 44px / `icon` 36px square. Hover darkens one step; press scales to 0.985. Never put two `primary` buttons in one view.
