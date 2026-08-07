A brand tile for the brands directory — avatar left, category badges right, story excerpt, product count.

```jsx
<BrandCard name="Ah Huat Roasters" excerpt="Third-generation kopi roasters from Ipoh." categories={["Food & Beverage"]} productCount={18} href="/brands/ah-huat" />
```

The avatar falls back to the brand's initial on a red-50 disc when no logo is uploaded — that fallback is the product's real behaviour, keep it.
