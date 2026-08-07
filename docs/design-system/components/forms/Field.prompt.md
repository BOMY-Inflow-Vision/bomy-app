Wraps any control with its label and message so every form in the product spaces identically.

```jsx
<Field label="Email" htmlFor="email" required error={errors.email}>
  <Input id="email" invalid={!!errors.email} />
</Field>
```

`error` wins over `hint`. Pass `invalid` to the control yourself — `Field` does not reach into children.
