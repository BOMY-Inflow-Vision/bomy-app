Mutually exclusive options. Use `variant="card"` whenever the choice has a price or a second line — shipping method, payment method, membership term.

```jsx
<RadioGroup
  variant="card"
  options={[
    { value: "std", label: "Standard", description: "3–5 working days", meta: "RM8.00" },
    { value: "exp", label: "Express", description: "Next working day", meta: "RM18.00" },
  ]}
/>
```
