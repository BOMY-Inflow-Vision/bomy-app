A pill toast at the bottom centre, auto-dismissing after 4s.

```jsx
<Toast open={saved} message="Product published" action="View" onAction={view} onClose={() => setSaved(false)} />
```

**Use sparingly.** BOMY's default is inline confirmation — "Added to cart ✓" on the button itself. A toast is only right when the result of the action isn't visible where the user is looking.
