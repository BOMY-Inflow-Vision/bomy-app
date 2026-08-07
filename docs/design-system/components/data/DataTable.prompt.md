The list table behind seller Products/Orders and the admin console.

```jsx
<DataTable
  selectable
  selected={sel} onSelectionChange={setSel}
  columns={[
    { key: "name", header: "Product" },
    { key: "status", header: "Status", render: (r) => <StatusPill status={r.status} /> },
    { key: "price", header: "Price", align: "right" },
  ]}
  rows={rows}
/>
```

Selected rows fill with `--surface-accent`. Money columns are right-aligned; machine strings (slug, order ref) use `--type-mono`. Put `FilterPills` above it, never inside.
