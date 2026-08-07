A centred modal. Closes on Escape, on scrim click, and on the corner ✕.

```jsx
<Dialog
  open={open}
  title="Archive this product?"
  description="Buyers will no longer see it. You can restore it later."
  onClose={close}
  footer={<><Button variant="ghost" onClick={close}>Cancel</Button><Button variant="destructive" onClick={archive}>Archive</Button></>}
/>
```

Cancel goes on the left, the committing action on the right. Never use a dialog for a message the page could show inline.
