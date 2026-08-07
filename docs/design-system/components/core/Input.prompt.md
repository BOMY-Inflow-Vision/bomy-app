A 36px-tall text field with a warm focus ring (red glow, no blue).

```jsx
<Label htmlFor="q">Search products</Label>
<Input id="q" placeholder="Search products…" />
<Input invalid defaultValue="not-an-email" />
```

Always pair with `Label`. `invalid` turns the border red — BOMY validators return `{ ok:false, errors }`, so render the message under the field in `--danger-600`.
