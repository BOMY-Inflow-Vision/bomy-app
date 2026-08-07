A native `<select>` styled like `Input` — country, state, shipping method, category.

```jsx
<Select options={[{value:"MY",label:"Malaysia"},{value:"SG",label:"Singapore"}]} defaultValue="MY" />
```

Native on purpose: BOMY forms are server-action forms and the mobile picker is better than any custom menu. For a *filter* use `FilterPills` or `CategoryList` instead.
