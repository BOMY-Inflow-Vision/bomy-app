// Every R3-owned word on the home page: the words the home page itself writes. Real data (product,
// brand and category names, excerpts, prices, counts), the "New" and "Sold out" words from
// productBadge, and text inside reused components (ProductCard, BrandCard, FilterPill) are NOT here.
//
// This file imports nothing: plain strings and small string builders only.
//
// COPY GATE: HOME_COPY_STATUS stays "draft" until Charlie approves the words below. The merge-gate
// test fails while it is "draft", and the PR does not merge until it is "approved".
export const HOME_COPY_STATUS: "draft" | "approved" = "draft"

export const HOME_COPY = {
  meta: {
    title: "BOMY — a curated brand collective",
    description: "Discover independent brands in one place.",
  },
  hero: {
    eyebrow: "A curated brand collective",
    title: "Good things from brands worth knowing.",
    sub: "BOMY brings independent sellers together, so you can see who made what you buy.",
    primary: "Browse products",
    secondary: "Meet the brands",
    featured: { label: "Just in", cta: "View product" },
    themed: { title: "New from our sellers", sub: "See what just arrived." },
    delivery: { title: "Shipping by Pos Laju", sub: "Each seller sets their own shipping fee." },
  },
  marquee: ["Curated", "Independent", "Brand by brand"],
  browse: {
    title: "Start with what you like",
    all: "See every product",
    count: (n: number) => (n === 1 ? "1 product" : `${n} products`),
  },
  favourites: {
    title: "Fresh from our sellers",
    all: "All",
    pillsLabel: "Browse by category",
  },
  promise: {
    eyebrow: "How we choose",
    statement:
      "We pick sellers one at a time, so what you find here has a name and a story behind it.",
    chip: "Membership",
  },
  stats: {
    title: "BOMY in numbers",
    labels: {
      brands: (n: number) => (n === 1 ? "Brand" : "Brands"),
      products: (n: number) => (n === 1 ? "Product" : "Products"),
      categories: (n: number) => (n === 1 ? "Category" : "Categories"),
    },
  },
  sellers: { title: "From our sellers", all: "All brands" },
  cta: {
    title: "Sell with us, or join as a member.",
    sell: "Sell with us",
    member: "Become a member",
  },
} as const
