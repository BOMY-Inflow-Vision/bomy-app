The single source of truth for lifecycle colour — store status, product status, and order fulfilment status all use it.

```jsx
<StatusPill status="active" />
<StatusPill status="processing" />
<StatusPill status="cancelled" />
```

Green = settled/good (active, delivered, completed), gold = in-flight (pending, processing), navy = shipped, sand = inert (draft, archived), red = failed (cancelled, suspended).
