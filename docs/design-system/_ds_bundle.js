/* @ds-bundle: {"format":4,"namespace":"BOMYDesignSystem_030168","components":[{"name":"BrandCard","sourcePath":"components/commerce/BrandCard.jsx"},{"name":"CartLineItem","sourcePath":"components/commerce/CartLineItem.jsx"},{"name":"ProductCard","sourcePath":"components/commerce/ProductCard.jsx"},{"name":"StatusPill","sourcePath":"components/commerce/StatusPill.jsx"},{"name":"StockStatus","sourcePath":"components/commerce/StockStatus.jsx"},{"name":"VariantPicker","sourcePath":"components/commerce/VariantPicker.jsx"},{"name":"Badge","sourcePath":"components/core/Badge.jsx"},{"name":"Button","sourcePath":"components/core/Button.jsx"},{"name":"Card","sourcePath":"components/core/Card.jsx"},{"name":"CardHeader","sourcePath":"components/core/Card.jsx"},{"name":"CardTitle","sourcePath":"components/core/Card.jsx"},{"name":"CardDescription","sourcePath":"components/core/Card.jsx"},{"name":"CardContent","sourcePath":"components/core/Card.jsx"},{"name":"CardFooter","sourcePath":"components/core/Card.jsx"},{"name":"Icon","sourcePath":"components/core/Icon.jsx"},{"name":"Input","sourcePath":"components/core/Input.jsx"},{"name":"Label","sourcePath":"components/core/Label.jsx"},{"name":"Textarea","sourcePath":"components/core/Textarea.jsx"},{"name":"DataTable","sourcePath":"components/data/DataTable.jsx"},{"name":"Dialog","sourcePath":"components/feedback/Dialog.jsx"},{"name":"EmptyState","sourcePath":"components/feedback/EmptyState.jsx"},{"name":"Toast","sourcePath":"components/feedback/Toast.jsx"},{"name":"Checkbox","sourcePath":"components/forms/Checkbox.jsx"},{"name":"Field","sourcePath":"components/forms/Field.jsx"},{"name":"RadioGroup","sourcePath":"components/forms/RadioGroup.jsx"},{"name":"Select","sourcePath":"components/forms/Select.jsx"},{"name":"Switch","sourcePath":"components/forms/Switch.jsx"},{"name":"CategoryList","sourcePath":"components/navigation/CategoryList.jsx"},{"name":"FilterPills","sourcePath":"components/navigation/FilterPills.jsx"},{"name":"Footer","sourcePath":"components/navigation/Footer.jsx"},{"name":"NavBar","sourcePath":"components/navigation/NavBar.jsx"},{"name":"Pagination","sourcePath":"components/navigation/Pagination.jsx"},{"name":"SellerSidebar","sourcePath":"components/navigation/SellerSidebar.jsx"},{"name":"Tabs","sourcePath":"components/navigation/Tabs.jsx"},{"name":"Wordmark","sourcePath":"components/navigation/Wordmark.jsx"}],"sourceHashes":{"components/commerce/BrandCard.jsx":"d1ff2440704a","components/commerce/CartLineItem.jsx":"f6337ad42e4b","components/commerce/ProductCard.jsx":"a3494385005b","components/commerce/StatusPill.jsx":"3b5a08142dcf","components/commerce/StockStatus.jsx":"95a10fb982bb","components/commerce/VariantPicker.jsx":"1ac36197d0da","components/core/Badge.jsx":"45b2f25b4f7c","components/core/Button.jsx":"799b41aad28d","components/core/Card.jsx":"f9e55b3dc2fc","components/core/Icon.jsx":"d98162e4dbd7","components/core/Input.jsx":"456b4ec03b6b","components/core/Label.jsx":"ed42b3dd67f7","components/core/Textarea.jsx":"7eebca743e3c","components/data/DataTable.jsx":"6c69a2e06ea9","components/feedback/Dialog.jsx":"bd6753375b61","components/feedback/EmptyState.jsx":"7e1b1656e230","components/feedback/Toast.jsx":"d7f07dc8c401","components/forms/Checkbox.jsx":"7fae94a4d8fc","components/forms/Field.jsx":"0c7bf20e6052","components/forms/RadioGroup.jsx":"66c8bef86db8","components/forms/Select.jsx":"04327e6081c5","components/forms/Switch.jsx":"e05dee226723","components/navigation/CategoryList.jsx":"982583ee7ea1","components/navigation/FilterPills.jsx":"d45e0bbdd3e9","components/navigation/Footer.jsx":"a2ce58a0288c","components/navigation/NavBar.jsx":"3d3fd2af12a5","components/navigation/Pagination.jsx":"862b05ccbd36","components/navigation/SellerSidebar.jsx":"a9b238dc5ce5","components/navigation/Tabs.jsx":"ef9c721d3865","components/navigation/Wordmark.jsx":"336f8af25ddc","ui_kits/buyer_site/BrandScreen.jsx":"d621b96d84cb","ui_kits/buyer_site/CartScreen.jsx":"6b6373571b97","ui_kits/buyer_site/CheckoutScreen.jsx":"6af0ff6827c8","ui_kits/buyer_site/HomeScreen.jsx":"f90365f12996","ui_kits/buyer_site/MembershipScreen.jsx":"69f6bdc02526","ui_kits/buyer_site/ProductScreen.jsx":"9cd1541990f0","ui_kits/buyer_site/ProductsScreen.jsx":"2b50086b4f7b","ui_kits/buyer_site/data.js":"ebfb1ec92ac1","ui_kits/seller_dashboard/OrdersScreen.jsx":"124989f77fcd","ui_kits/seller_dashboard/OverviewScreen.jsx":"3100fcf0cdb7","ui_kits/seller_dashboard/SellerProductsScreen.jsx":"aad08d98ac29"},"inlinedExternals":[],"unexposedExports":[]} */

(() => {

const __ds_ns = (window.BOMYDesignSystem_030168 = window.BOMYDesignSystem_030168 || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// components/commerce/StatusPill.jsx
try { (() => {
const TONES = {
  active: ["var(--success-100)", "var(--success-700)"],
  completed: ["var(--success-100)", "var(--success-700)"],
  delivered: ["var(--success-100)", "var(--success-700)"],
  pending: ["var(--warning-100)", "var(--warning-700)"],
  processing: ["var(--warning-100)", "var(--warning-700)"],
  shipped: ["var(--info-100)", "var(--info-700)"],
  draft: ["var(--surface-sunken)", "var(--text-muted)"],
  archived: ["var(--surface-sunken)", "var(--text-subtle)"],
  cancelled: ["var(--danger-100)", "var(--danger-700)"],
  suspended: ["var(--danger-100)", "var(--danger-700)"]
};
function StatusPill({
  status,
  children,
  style
}) {
  const [bg, fg] = TONES[status] || TONES.draft;
  return /*#__PURE__*/React.createElement("span", {
    style: {
      display: "inline-flex",
      alignItems: "center",
      borderRadius: "var(--radius-pill)",
      padding: "0.125rem 0.625rem",
      background: bg,
      color: fg,
      font: "var(--type-caption)",
      fontWeight: "var(--weight-semibold)",
      textTransform: "capitalize",
      ...style
    }
  }, children || status);
}
Object.assign(__ds_scope, { StatusPill });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/commerce/StatusPill.jsx", error: String((e && e.message) || e) }); }

// components/commerce/StockStatus.jsx
try { (() => {
function StockStatus({
  mode = "stock",
  stockCount = 0,
  preorderLeadDays
}) {
  if (mode === "backorder") {
    return /*#__PURE__*/React.createElement("span", {
      style: {
        display: "inline-block",
        borderRadius: "var(--radius-pill)",
        background: "var(--gold-100)",
        color: "var(--gold-800)",
        padding: "0.125rem 0.625rem",
        font: "var(--type-caption)",
        fontWeight: "var(--weight-semibold)"
      }
    }, "Back-order \u2014 ships when available");
  }
  if (mode === "preorder") {
    return /*#__PURE__*/React.createElement("span", {
      style: {
        display: "inline-block",
        borderRadius: "var(--radius-pill)",
        background: "var(--info-100)",
        color: "var(--info-700)",
        padding: "0.125rem 0.625rem",
        font: "var(--type-caption)",
        fontWeight: "var(--weight-semibold)"
      }
    }, "Pre-order", preorderLeadDays ? " — ships in " + preorderLeadDays + " days" : "");
  }
  return /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      font: "var(--type-body)",
      color: stockCount > 0 ? "var(--success-600)" : "var(--danger-600)"
    }
  }, stockCount > 0 ? stockCount + " in stock" : "Out of stock");
}
Object.assign(__ds_scope, { StockStatus });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/commerce/StockStatus.jsx", error: String((e && e.message) || e) }); }

// components/core/Badge.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const tones = {
  accent: {
    background: "var(--surface-accent)",
    color: "var(--red-700)"
  },
  brand: {
    background: "var(--action-primary)",
    color: "var(--text-on-brand)"
  },
  neutral: {
    background: "var(--surface-sunken)",
    color: "var(--text-muted)"
  },
  reward: {
    background: "var(--gold-100)",
    color: "var(--gold-800)"
  },
  success: {
    background: "var(--success-100)",
    color: "var(--success-700)"
  },
  warning: {
    background: "var(--warning-100)",
    color: "var(--warning-700)"
  },
  danger: {
    background: "var(--danger-100)",
    color: "var(--danger-700)"
  },
  outline: {
    background: "transparent",
    color: "var(--text-body)",
    borderColor: "var(--border-default)"
  }
};
function Badge({
  variant = "accent",
  children,
  style,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("span", _extends({}, rest, {
    style: {
      display: "inline-flex",
      alignItems: "center",
      gap: "var(--space-1)",
      borderRadius: "var(--radius-badge)",
      border: "1px solid transparent",
      padding: "0.125rem 0.625rem",
      fontFamily: "var(--font-sans)",
      fontSize: "var(--text-xs)",
      fontWeight: "var(--weight-semibold)",
      lineHeight: "var(--leading-normal)",
      ...tones[variant],
      ...style
    }
  }), children);
}
Object.assign(__ds_scope, { Badge });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Badge.jsx", error: String((e && e.message) || e) }); }

// components/commerce/BrandCard.jsx
try { (() => {
function BrandCard({
  name,
  excerpt,
  categories = [],
  productCount,
  href = "#",
  logoUrl
}) {
  const [hover, setHover] = React.useState(false);
  return /*#__PURE__*/React.createElement("a", {
    href: href,
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => setHover(false),
    style: {
      display: "flex",
      flexDirection: "column",
      height: "100%",
      boxSizing: "border-box",
      padding: "var(--space-5)",
      background: "var(--surface-card)",
      border: "1px solid var(--border-subtle)",
      borderRadius: "var(--radius-card)",
      boxShadow: hover ? "var(--shadow-md)" : "var(--shadow-sm)",
      textDecoration: "none",
      transition: "var(--transition-elevation)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: "var(--space-2)",
      marginBottom: "var(--space-3)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 48,
      height: 48,
      flexShrink: 0,
      display: "grid",
      placeItems: "center",
      borderRadius: "var(--radius-circle)",
      background: "var(--surface-accent)",
      color: "var(--red-700)",
      font: "var(--type-h3)",
      overflow: "hidden"
    }
  }, logoUrl ? /*#__PURE__*/React.createElement("img", {
    src: logoUrl,
    alt: "",
    style: {
      width: "100%",
      height: "100%",
      objectFit: "cover"
    }
  }) : name.charAt(0).toUpperCase()), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexWrap: "wrap",
      justifyContent: "flex-end",
      gap: "var(--space-1)"
    }
  }, categories.map(c => /*#__PURE__*/React.createElement(__ds_scope.Badge, {
    key: c
  }, c)))), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      font: "var(--type-h3)",
      color: hover ? "var(--text-brand)" : "var(--text-heading)"
    }
  }, name), excerpt && /*#__PURE__*/React.createElement("p", {
    style: {
      margin: "var(--space-1) 0 0",
      flex: 1,
      font: "var(--type-body)",
      color: "var(--text-muted)"
    }
  }, excerpt), productCount != null && /*#__PURE__*/React.createElement("p", {
    style: {
      margin: "var(--space-3) 0 0",
      font: "var(--type-caption)",
      color: "var(--text-subtle)"
    }
  }, productCount, " product", productCount === 1 ? "" : "s"));
}
Object.assign(__ds_scope, { BrandCard });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/commerce/BrandCard.jsx", error: String((e && e.message) || e) }); }

// components/core/Button.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const base = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "var(--space-2)",
  whiteSpace: "nowrap",
  fontFamily: "var(--font-sans)",
  fontWeight: "var(--weight-semibold)",
  borderRadius: "var(--radius-control)",
  border: "1px solid transparent",
  cursor: "pointer",
  transition: "var(--transition-color), box-shadow var(--duration-fast) var(--ease-standard)",
  textDecoration: "none"
};
const sizes = {
  sm: {
    height: "2rem",
    padding: "0 var(--space-3)",
    fontSize: "var(--text-xs)"
  },
  md: {
    height: "2.25rem",
    padding: "0 var(--space-4)",
    fontSize: "var(--text-base)"
  },
  lg: {
    height: "2.75rem",
    padding: "0 var(--space-6)",
    fontSize: "var(--text-md)"
  },
  icon: {
    height: "2.25rem",
    width: "2.25rem",
    padding: 0,
    fontSize: "var(--text-base)"
  }
};
const variants = {
  primary: {
    background: "var(--action-primary)",
    color: "var(--text-on-brand)",
    boxShadow: "var(--shadow-xs)"
  },
  secondary: {
    background: "var(--action-secondary)",
    color: "var(--text-inverse)",
    boxShadow: "var(--shadow-xs)"
  },
  reward: {
    background: "var(--action-reward)",
    color: "var(--text-on-reward)",
    boxShadow: "var(--shadow-xs)"
  },
  outline: {
    background: "var(--surface-card)",
    color: "var(--text-heading)",
    borderColor: "var(--border-default)",
    boxShadow: "var(--shadow-xs)"
  },
  ghost: {
    background: "transparent",
    color: "var(--text-body)"
  },
  destructive: {
    background: "var(--danger-600)",
    color: "#fff"
  },
  link: {
    background: "transparent",
    color: "var(--text-link)",
    height: "auto",
    padding: 0,
    textDecoration: "underline",
    textUnderlineOffset: "4px"
  }
};
const hovers = {
  primary: {
    background: "var(--action-primary-hover)"
  },
  secondary: {
    background: "var(--action-secondary-hover)"
  },
  reward: {
    background: "var(--action-reward-hover)"
  },
  outline: {
    background: "var(--action-ghost-hover)",
    borderColor: "var(--border-strong)"
  },
  ghost: {
    background: "var(--action-ghost-hover)"
  },
  destructive: {
    background: "var(--danger-700)"
  },
  link: {
    color: "var(--text-link-hover)"
  }
};
function Spinner() {
  return /*#__PURE__*/React.createElement("svg", {
    width: "14",
    height: "14",
    viewBox: "0 0 24 24",
    fill: "none",
    "aria-hidden": "true",
    style: {
      animation: "bomy-spin 700ms linear infinite"
    }
  }, /*#__PURE__*/React.createElement("circle", {
    cx: "12",
    cy: "12",
    r: "10",
    stroke: "currentColor",
    strokeWidth: "4",
    opacity: "0.25"
  }), /*#__PURE__*/React.createElement("path", {
    fill: "currentColor",
    opacity: "0.75",
    d: "M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
  }));
}
function Button({
  variant = "primary",
  size = "md",
  disabled,
  loading,
  fullWidth,
  as = "button",
  children,
  style,
  onClick,
  href,
  type = "button",
  ...rest
}) {
  const [hover, setHover] = React.useState(false);
  const [press, setPress] = React.useState(false);
  const Tag = as === "a" ? "a" : "button";
  const isOff = disabled || loading;
  const s = {
    ...base,
    ...sizes[size],
    ...variants[variant],
    ...(hover && !isOff ? hovers[variant] : null),
    ...(press && !isOff ? {
      transform: "scale(var(--press-scale))"
    } : null),
    ...(fullWidth ? {
      width: "100%"
    } : null),
    ...(isOff ? {
      background: variant === "ghost" || variant === "link" ? "transparent" : "var(--action-disabled-bg)",
      color: "var(--action-disabled-text)",
      borderColor: "transparent",
      cursor: "not-allowed",
      boxShadow: "none"
    } : null),
    ...style
  };
  return /*#__PURE__*/React.createElement(Tag, _extends({}, rest, Tag === "button" ? {
    type,
    disabled: isOff
  } : {
    href
  }, {
    style: s,
    onClick: isOff ? undefined : onClick,
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => {
      setHover(false);
      setPress(false);
    },
    onMouseDown: () => setPress(true),
    onMouseUp: () => setPress(false)
  }), /*#__PURE__*/React.createElement("style", null, "@keyframes bomy-spin{to{transform:rotate(360deg)}}"), loading && /*#__PURE__*/React.createElement(Spinner, null), children);
}
Object.assign(__ds_scope, { Button });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Button.jsx", error: String((e && e.message) || e) }); }

// components/commerce/VariantPicker.jsx
try { (() => {
function VariantPicker({
  variants = [],
  onAdd
}) {
  const [selectedId, setSelectedId] = React.useState(variants[0] ? variants[0].id : "");
  const [added, setAdded] = React.useState(false);
  const selected = variants.find(v => v.id === selectedId);
  const special = selected && (selected.fulfillmentMode === "backorder" || selected.fulfillmentMode === "preorder");
  function add() {
    if (!selected) return;
    onAdd && onAdd(selected);
    setAdded(true);
    setTimeout(() => setAdded(false), 2000);
  }
  if (!variants.length) return /*#__PURE__*/React.createElement("p", {
    style: {
      font: "var(--type-body)",
      color: "var(--text-muted)"
    }
  }, "No variants available.");
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: "var(--space-4)"
    }
  }, variants.length > 1 && /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("p", {
    style: {
      margin: "0 0 var(--space-2)",
      font: "var(--type-label)",
      color: "var(--text-heading)"
    }
  }, "Choose variant"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexWrap: "wrap",
      gap: "var(--space-2)"
    }
  }, variants.map(v => {
    const vSpecial = v.fulfillmentMode === "backorder" || v.fulfillmentMode === "preorder";
    const unavailable = v.stockCount === 0 && !vSpecial;
    const on = v.id === selectedId;
    return /*#__PURE__*/React.createElement("button", {
      key: v.id,
      type: "button",
      disabled: unavailable,
      onClick: () => setSelectedId(v.id),
      style: {
        padding: "0.375rem var(--space-3)",
        borderRadius: "var(--radius-sm)",
        border: "1px solid " + (on ? "var(--border-brand)" : "var(--border-default)"),
        background: on ? "var(--surface-accent)" : "var(--surface-card)",
        color: on ? "var(--red-700)" : "var(--text-heading)",
        font: "var(--type-body)",
        fontWeight: on ? "var(--weight-semibold)" : "var(--weight-regular)",
        cursor: unavailable ? "not-allowed" : "pointer",
        opacity: unavailable ? 0.5 : 1,
        textDecoration: unavailable ? "line-through" : "none",
        transition: "var(--transition-color)"
      }
    }, v.name);
  }))), selected && /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: "var(--space-1)"
    }
  }, /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      font: "var(--type-price)",
      color: "var(--text-brand)"
    }
  }, selected.price), /*#__PURE__*/React.createElement(__ds_scope.StockStatus, {
    mode: special ? selected.fulfillmentMode : "stock",
    stockCount: selected.stockCount,
    preorderLeadDays: selected.preorderLeadDays
  })), /*#__PURE__*/React.createElement(__ds_scope.Button, {
    size: "lg",
    fullWidth: true,
    disabled: !selected || selected.stockCount === 0,
    onClick: add
  }, added ? "Added to cart ✓" : "Add to cart"));
}
Object.assign(__ds_scope, { VariantPicker });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/commerce/VariantPicker.jsx", error: String((e && e.message) || e) }); }

// components/core/Card.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function Card({
  interactive,
  children,
  style,
  ...rest
}) {
  const [hover, setHover] = React.useState(false);
  return /*#__PURE__*/React.createElement("div", _extends({}, rest, {
    onMouseEnter: interactive ? () => setHover(true) : undefined,
    onMouseLeave: interactive ? () => setHover(false) : undefined,
    style: {
      background: "var(--surface-card)",
      border: "1px solid var(--border-subtle)",
      borderRadius: "var(--radius-card)",
      boxShadow: hover ? "var(--shadow-md)" : "var(--shadow-sm)",
      color: "var(--text-body)",
      transition: "var(--transition-elevation)",
      ...style
    }
  }), children);
}
function CardHeader({
  children,
  style,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("div", _extends({}, rest, {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: "var(--space-2)",
      padding: "var(--space-6)",
      ...style
    }
  }), children);
}
function CardTitle({
  children,
  style,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("h3", _extends({}, rest, {
    style: {
      font: "var(--type-h3)",
      color: "var(--text-heading)",
      margin: 0,
      ...style
    }
  }), children);
}
function CardDescription({
  children,
  style,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("p", _extends({}, rest, {
    style: {
      font: "var(--type-body)",
      color: "var(--text-muted)",
      margin: 0,
      ...style
    }
  }), children);
}
function CardContent({
  children,
  style,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("div", _extends({}, rest, {
    style: {
      padding: "0 var(--space-6) var(--space-6)",
      ...style
    }
  }), children);
}
function CardFooter({
  children,
  style,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("div", _extends({}, rest, {
    style: {
      display: "flex",
      alignItems: "center",
      gap: "var(--space-3)",
      padding: "0 var(--space-6) var(--space-6)",
      ...style
    }
  }), children);
}
Object.assign(__ds_scope, { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Card.jsx", error: String((e && e.message) || e) }); }

// components/core/Icon.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/* Icons are Heroicons v2 (MIT) — the same set the bomy-app codebase inlines by hand.
   Markup is embedded (not fetched, not used as a CSS mask) so stroke="currentColor"
   tints correctly and the glyph is present on the very first paint, including in
   static thumbnail captures. Regenerate from assets/icons/ when adding a glyph. */
const GLYPHS = {
  "outline/arrow-right": "<svg width=\"100%\" height=\"100%\" xmlns=\"http://www.w3.org/2000/svg\" fill=\"none\" viewBox=\"0 0 24 24\" stroke-width=\"1.5\" stroke=\"currentColor\" aria-hidden=\"true\" data-slot=\"icon\"><path stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3\"></path></svg>",
  "outline/banknotes": "<svg width=\"100%\" height=\"100%\" xmlns=\"http://www.w3.org/2000/svg\" fill=\"none\" viewBox=\"0 0 24 24\" stroke-width=\"1.5\" stroke=\"currentColor\" aria-hidden=\"true\" data-slot=\"icon\"><path stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M2.25 18.75a60.07 60.07 0 0 1 15.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 0 1 3 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 0 0-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 0 1-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 0 0 3 15h-.75M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm3 0h.008v.008H18V10.5Zm-12 0h.008v.008H6V10.5Z\"></path></svg>",
  "outline/bars-3": "<svg width=\"100%\" height=\"100%\" xmlns=\"http://www.w3.org/2000/svg\" fill=\"none\" viewBox=\"0 0 24 24\" stroke-width=\"1.5\" stroke=\"currentColor\" aria-hidden=\"true\" data-slot=\"icon\"><path stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5\"></path></svg>",
  "outline/building-storefront": "<svg width=\"100%\" height=\"100%\" xmlns=\"http://www.w3.org/2000/svg\" fill=\"none\" viewBox=\"0 0 24 24\" stroke-width=\"1.5\" stroke=\"currentColor\" aria-hidden=\"true\" data-slot=\"icon\"><path stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M13.5 21v-7.5a.75.75 0 0 1 .75-.75h3a.75.75 0 0 1 .75.75V21m-4.5 0H2.36m11.14 0H18m0 0h3.64m-1.39 0V9.349M3.75 21V9.349m0 0a3.001 3.001 0 0 0 3.75-.615A2.993 2.993 0 0 0 9.75 9.75c.896 0 1.7-.393 2.25-1.016a2.993 2.993 0 0 0 2.25 1.016c.896 0 1.7-.393 2.25-1.015a3.001 3.001 0 0 0 3.75.614m-16.5 0a3.004 3.004 0 0 1-.621-4.72l1.189-1.19A1.5 1.5 0 0 1 5.378 3h13.243a1.5 1.5 0 0 1 1.06.44l1.19 1.189a3 3 0 0 1-.621 4.72M6.75 18h3.75a.75.75 0 0 0 .75-.75V13.5a.75.75 0 0 0-.75-.75H6.75a.75.75 0 0 0-.75.75v3.75c0 .414.336.75.75.75Z\"></path></svg>",
  "outline/check": "<svg width=\"100%\" height=\"100%\" xmlns=\"http://www.w3.org/2000/svg\" fill=\"none\" viewBox=\"0 0 24 24\" stroke-width=\"1.5\" stroke=\"currentColor\" aria-hidden=\"true\" data-slot=\"icon\"><path stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"m4.5 12.75 6 6 9-13.5\"></path></svg>",
  "outline/chevron-down": "<svg width=\"100%\" height=\"100%\" xmlns=\"http://www.w3.org/2000/svg\" fill=\"none\" viewBox=\"0 0 24 24\" stroke-width=\"1.5\" stroke=\"currentColor\" aria-hidden=\"true\" data-slot=\"icon\"><path stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"m19.5 8.25-7.5 7.5-7.5-7.5\"></path></svg>",
  "outline/chevron-left": "<svg width=\"100%\" height=\"100%\" xmlns=\"http://www.w3.org/2000/svg\" fill=\"none\" viewBox=\"0 0 24 24\" stroke-width=\"1.5\" stroke=\"currentColor\" aria-hidden=\"true\" data-slot=\"icon\"><path stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M15.75 19.5 8.25 12l7.5-7.5\"></path></svg>",
  "outline/chevron-right": "<svg width=\"100%\" height=\"100%\" xmlns=\"http://www.w3.org/2000/svg\" fill=\"none\" viewBox=\"0 0 24 24\" stroke-width=\"1.5\" stroke=\"currentColor\" aria-hidden=\"true\" data-slot=\"icon\"><path stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"m8.25 4.5 7.5 7.5-7.5 7.5\"></path></svg>",
  "outline/clipboard-document-list": "<svg width=\"100%\" height=\"100%\" xmlns=\"http://www.w3.org/2000/svg\" fill=\"none\" viewBox=\"0 0 24 24\" stroke-width=\"1.5\" stroke=\"currentColor\" aria-hidden=\"true\" data-slot=\"icon\"><path stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25ZM6.75 12h.008v.008H6.75V12Zm0 3h.008v.008H6.75V15Zm0 3h.008v.008H6.75V18Z\"></path></svg>",
  "outline/cog-6-tooth": "<svg width=\"100%\" height=\"100%\" xmlns=\"http://www.w3.org/2000/svg\" fill=\"none\" viewBox=\"0 0 24 24\" stroke-width=\"1.5\" stroke=\"currentColor\" aria-hidden=\"true\" data-slot=\"icon\"><path stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z\"></path><path stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z\"></path></svg>",
  "outline/envelope": "<svg width=\"100%\" height=\"100%\" xmlns=\"http://www.w3.org/2000/svg\" fill=\"none\" viewBox=\"0 0 24 24\" stroke-width=\"1.5\" stroke=\"currentColor\" aria-hidden=\"true\" data-slot=\"icon\"><path stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75\"></path></svg>",
  "outline/exclamation-triangle": "<svg width=\"100%\" height=\"100%\" xmlns=\"http://www.w3.org/2000/svg\" fill=\"none\" viewBox=\"0 0 24 24\" stroke-width=\"1.5\" stroke=\"currentColor\" aria-hidden=\"true\" data-slot=\"icon\"><path stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z\"></path></svg>",
  "outline/gift": "<svg width=\"100%\" height=\"100%\" xmlns=\"http://www.w3.org/2000/svg\" fill=\"none\" viewBox=\"0 0 24 24\" stroke-width=\"1.5\" stroke=\"currentColor\" aria-hidden=\"true\" data-slot=\"icon\"><path stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M20.625 11.505v8.25a1.5 1.5 0 0 1-1.5 1.5H4.875a1.5 1.5 0 0 1-1.5-1.5v-8.25m8.25-6.375A2.625 2.625 0 1 0 9 7.755h2.625m0-2.625v2.625m0-2.625a2.625 2.625 0 1 1 2.625 2.625h-2.625m0 0v13.5M3 11.505h18c.621 0 1.125-.504 1.125-1.125v-1.5c0-.622-.504-1.125-1.125-1.125H3c-.621 0-1.125.503-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125Z\"></path></svg>",
  "outline/globe-alt": "<svg width=\"100%\" height=\"100%\" xmlns=\"http://www.w3.org/2000/svg\" fill=\"none\" viewBox=\"0 0 24 24\" stroke-width=\"1.5\" stroke=\"currentColor\" aria-hidden=\"true\" data-slot=\"icon\"><path stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0 1 12 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 0 1 3 12c0-1.605.42-3.113 1.157-4.418\"></path></svg>",
  "outline/heart": "<svg width=\"100%\" height=\"100%\" xmlns=\"http://www.w3.org/2000/svg\" fill=\"none\" viewBox=\"0 0 24 24\" stroke-width=\"1.5\" stroke=\"currentColor\" aria-hidden=\"true\" data-slot=\"icon\"><path stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12Z\"></path></svg>",
  "outline/information-circle": "<svg width=\"100%\" height=\"100%\" xmlns=\"http://www.w3.org/2000/svg\" fill=\"none\" viewBox=\"0 0 24 24\" stroke-width=\"1.5\" stroke=\"currentColor\" aria-hidden=\"true\" data-slot=\"icon\"><path stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z\"></path></svg>",
  "outline/magnifying-glass": "<svg width=\"100%\" height=\"100%\" xmlns=\"http://www.w3.org/2000/svg\" fill=\"none\" viewBox=\"0 0 24 24\" stroke-width=\"1.5\" stroke=\"currentColor\" aria-hidden=\"true\" data-slot=\"icon\"><path stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z\"></path></svg>",
  "outline/map-pin": "<svg width=\"100%\" height=\"100%\" xmlns=\"http://www.w3.org/2000/svg\" fill=\"none\" viewBox=\"0 0 24 24\" stroke-width=\"1.5\" stroke=\"currentColor\" aria-hidden=\"true\" data-slot=\"icon\"><path stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z\"></path><path stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z\"></path></svg>",
  "outline/minus": "<svg width=\"100%\" height=\"100%\" xmlns=\"http://www.w3.org/2000/svg\" fill=\"none\" viewBox=\"0 0 24 24\" stroke-width=\"1.5\" stroke=\"currentColor\" aria-hidden=\"true\" data-slot=\"icon\"><path stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M5 12h14\"></path></svg>",
  "outline/pencil-square": "<svg width=\"100%\" height=\"100%\" xmlns=\"http://www.w3.org/2000/svg\" fill=\"none\" viewBox=\"0 0 24 24\" stroke-width=\"1.5\" stroke=\"currentColor\" aria-hidden=\"true\" data-slot=\"icon\"><path stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10\"></path></svg>",
  "outline/photo": "<svg width=\"100%\" height=\"100%\" xmlns=\"http://www.w3.org/2000/svg\" fill=\"none\" viewBox=\"0 0 24 24\" stroke-width=\"1.5\" stroke=\"currentColor\" aria-hidden=\"true\" data-slot=\"icon\"><path stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z\"></path></svg>",
  "outline/plus": "<svg width=\"100%\" height=\"100%\" xmlns=\"http://www.w3.org/2000/svg\" fill=\"none\" viewBox=\"0 0 24 24\" stroke-width=\"1.5\" stroke=\"currentColor\" aria-hidden=\"true\" data-slot=\"icon\"><path stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M12 4.5v15m7.5-7.5h-15\"></path></svg>",
  "outline/shopping-bag": "<svg width=\"100%\" height=\"100%\" xmlns=\"http://www.w3.org/2000/svg\" fill=\"none\" viewBox=\"0 0 24 24\" stroke-width=\"1.5\" stroke=\"currentColor\" aria-hidden=\"true\" data-slot=\"icon\"><path stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M15.75 10.5V6a3.75 3.75 0 1 0-7.5 0v4.5m11.356-1.993 1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 0 1-1.12-1.243l1.264-12A1.125 1.125 0 0 1 5.513 7.5h12.974c.576 0 1.059.435 1.119 1.007ZM8.625 10.5a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm7.5 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z\"></path></svg>",
  "outline/shopping-cart": "<svg width=\"100%\" height=\"100%\" xmlns=\"http://www.w3.org/2000/svg\" fill=\"none\" viewBox=\"0 0 24 24\" stroke-width=\"1.5\" stroke=\"currentColor\" aria-hidden=\"true\" data-slot=\"icon\"><path stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 0 0-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 0 0-16.536-1.84M7.5 14.25 5.106 5.272M6 20.25a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Zm12.75 0a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Z\"></path></svg>",
  "outline/sparkles": "<svg width=\"100%\" height=\"100%\" xmlns=\"http://www.w3.org/2000/svg\" fill=\"none\" viewBox=\"0 0 24 24\" stroke-width=\"1.5\" stroke=\"currentColor\" aria-hidden=\"true\" data-slot=\"icon\"><path stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z\"></path></svg>",
  "outline/squares-2x2": "<svg width=\"100%\" height=\"100%\" xmlns=\"http://www.w3.org/2000/svg\" fill=\"none\" viewBox=\"0 0 24 24\" stroke-width=\"1.5\" stroke=\"currentColor\" aria-hidden=\"true\" data-slot=\"icon\"><path stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25A2.25 2.25 0 0 1 13.5 18v-2.25Z\"></path></svg>",
  "outline/star": "<svg width=\"100%\" height=\"100%\" xmlns=\"http://www.w3.org/2000/svg\" fill=\"none\" viewBox=\"0 0 24 24\" stroke-width=\"1.5\" stroke=\"currentColor\" aria-hidden=\"true\" data-slot=\"icon\"><path stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M11.48 3.499a.562.562 0 0 1 1.04 0l2.125 5.111a.563.563 0 0 0 .475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 0 0-.182.557l1.285 5.385a.562.562 0 0 1-.84.61l-4.725-2.885a.562.562 0 0 0-.586 0L6.982 20.54a.562.562 0 0 1-.84-.61l1.285-5.386a.562.562 0 0 0-.182-.557l-4.204-3.602a.562.562 0 0 1 .321-.988l5.518-.442a.563.563 0 0 0 .475-.345L11.48 3.5Z\"></path></svg>",
  "outline/trash": "<svg width=\"100%\" height=\"100%\" xmlns=\"http://www.w3.org/2000/svg\" fill=\"none\" viewBox=\"0 0 24 24\" stroke-width=\"1.5\" stroke=\"currentColor\" aria-hidden=\"true\" data-slot=\"icon\"><path stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0\"></path></svg>",
  "outline/truck": "<svg width=\"100%\" height=\"100%\" xmlns=\"http://www.w3.org/2000/svg\" fill=\"none\" viewBox=\"0 0 24 24\" stroke-width=\"1.5\" stroke=\"currentColor\" aria-hidden=\"true\" data-slot=\"icon\"><path stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M8.25 18.75a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 0 1-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 0 0-3.213-9.193 2.056 2.056 0 0 0-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 0 0-10.026 0 1.106 1.106 0 0 0-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12\"></path></svg>",
  "outline/user-circle": "<svg width=\"100%\" height=\"100%\" xmlns=\"http://www.w3.org/2000/svg\" fill=\"none\" viewBox=\"0 0 24 24\" stroke-width=\"1.5\" stroke=\"currentColor\" aria-hidden=\"true\" data-slot=\"icon\"><path stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M17.982 18.725A7.488 7.488 0 0 0 12 15.75a7.488 7.488 0 0 0-5.982 2.975m11.963 0a9 9 0 1 0-11.963 0m11.963 0A8.966 8.966 0 0 1 12 21a8.966 8.966 0 0 1-5.982-2.275M15 9.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z\"></path></svg>",
  "outline/x-mark": "<svg width=\"100%\" height=\"100%\" xmlns=\"http://www.w3.org/2000/svg\" fill=\"none\" viewBox=\"0 0 24 24\" stroke-width=\"1.5\" stroke=\"currentColor\" aria-hidden=\"true\" data-slot=\"icon\"><path stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M6 18 18 6M6 6l12 12\"></path></svg>",
  "solid/check-circle": "<svg width=\"100%\" height=\"100%\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" fill=\"currentColor\" aria-hidden=\"true\" data-slot=\"icon\"><path fill-rule=\"evenodd\" d=\"M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12Zm13.36-1.814a.75.75 0 1 0-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 0 0-1.06 1.06l2.25 2.25a.75.75 0 0 0 1.14-.094l3.75-5.25Z\" clip-rule=\"evenodd\"></path></svg>",
  "solid/heart": "<svg width=\"100%\" height=\"100%\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" fill=\"currentColor\" aria-hidden=\"true\" data-slot=\"icon\"><path d=\"m11.645 20.91-.007-.003-.022-.012a15.247 15.247 0 0 1-.383-.218 25.18 25.18 0 0 1-4.244-3.17C4.688 15.36 2.25 12.174 2.25 8.25 2.25 5.322 4.714 3 7.688 3A5.5 5.5 0 0 1 12 5.052 5.5 5.5 0 0 1 16.313 3c2.973 0 5.437 2.322 5.437 5.25 0 3.925-2.438 7.111-4.739 9.256a25.175 25.175 0 0 1-4.244 3.17 15.247 15.247 0 0 1-.383.219l-.022.012-.007.004-.003.001a.752.752 0 0 1-.704 0l-.003-.001Z\"></path></svg>",
  "solid/star": "<svg width=\"100%\" height=\"100%\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" fill=\"currentColor\" aria-hidden=\"true\" data-slot=\"icon\"><path fill-rule=\"evenodd\" d=\"M10.788 3.21c.448-1.077 1.976-1.077 2.424 0l2.082 5.006 5.404.434c1.164.093 1.636 1.545.749 2.305l-4.117 3.527 1.257 5.273c.271 1.136-.964 2.033-1.96 1.425L12 18.354 7.373 21.18c-.996.608-2.231-.29-1.96-1.425l1.257-5.273-4.117-3.527c-.887-.76-.415-2.212.749-2.305l5.404-.434 2.082-5.005Z\" clip-rule=\"evenodd\"></path></svg>"
};
function Icon({
  name,
  set = "outline",
  size = 20,
  basePath,
  label,
  style,
  ...rest
}) {
  const markup = GLYPHS[set + "/" + name] || "";
  return /*#__PURE__*/React.createElement("span", _extends({}, rest, {
    role: label ? "img" : undefined,
    "aria-label": label,
    "aria-hidden": label ? undefined : true,
    style: {
      display: "inline-flex",
      width: size,
      height: size,
      flexShrink: 0,
      lineHeight: 0,
      ...style
    },
    dangerouslySetInnerHTML: {
      __html: markup
    }
  }));
}
Object.assign(__ds_scope, { Icon });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Icon.jsx", error: String((e && e.message) || e) }); }

// components/commerce/CartLineItem.jsx
try { (() => {
function CartLineItem({
  productName,
  storeName,
  variantName,
  price,
  quantity = 1,
  imageUrl,
  onQuantityChange,
  onRemove,
  iconBase = "assets/icons"
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "flex-start",
      gap: "var(--space-4)",
      padding: "var(--space-4)",
      background: "var(--surface-card)",
      border: "1px solid var(--border-subtle)",
      borderRadius: "var(--radius-card)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 64,
      height: 64,
      flexShrink: 0,
      overflow: "hidden",
      borderRadius: "var(--radius-sm)",
      background: "var(--surface-sunken)",
      display: "grid",
      placeItems: "center",
      color: "var(--sand-400)"
    }
  }, imageUrl ? /*#__PURE__*/React.createElement("img", {
    src: imageUrl,
    alt: productName,
    style: {
      width: "100%",
      height: "100%",
      objectFit: "cover"
    }
  }) : /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "photo",
    size: 24,
    basePath: iconBase
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      font: "var(--type-label)",
      color: "var(--text-heading)"
    }
  }, productName), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: "2px 0 0",
      font: "var(--type-caption)",
      color: "var(--text-muted)"
    }
  }, storeName, " \xB7 ", variantName), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: "var(--space-1) 0 0",
      font: "var(--type-label)",
      fontWeight: "var(--weight-bold)",
      color: "var(--text-brand)"
    }
  }, price)), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: "var(--space-2)"
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Button, {
    variant: "outline",
    size: "icon",
    style: {
      height: "1.75rem",
      width: "1.75rem"
    },
    onClick: () => onQuantityChange && onQuantityChange(quantity - 1)
  }, "\u2212"), /*#__PURE__*/React.createElement("span", {
    style: {
      width: "1.5rem",
      textAlign: "center",
      font: "var(--type-body)"
    }
  }, quantity), /*#__PURE__*/React.createElement(__ds_scope.Button, {
    variant: "outline",
    size: "icon",
    style: {
      height: "1.75rem",
      width: "1.75rem"
    },
    onClick: () => onQuantityChange && onQuantityChange(quantity + 1)
  }, "+"), /*#__PURE__*/React.createElement(__ds_scope.Button, {
    variant: "ghost",
    size: "sm",
    style: {
      color: "var(--danger-600)"
    },
    onClick: onRemove
  }, "Remove")));
}
Object.assign(__ds_scope, { CartLineItem });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/commerce/CartLineItem.jsx", error: String((e && e.message) || e) }); }

// components/commerce/ProductCard.jsx
try { (() => {
function ProductCard({
  name,
  storeName,
  category,
  price,
  imageUrl,
  href = "#",
  iconBase = "assets/icons"
}) {
  const [hover, setHover] = React.useState(false);
  return /*#__PURE__*/React.createElement("a", {
    href: href,
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => setHover(false),
    style: {
      display: "block",
      overflow: "hidden",
      background: "var(--surface-card)",
      border: "1px solid var(--border-subtle)",
      borderRadius: "var(--radius-card)",
      boxShadow: hover ? "var(--shadow-md)" : "var(--shadow-sm)",
      textDecoration: "none",
      transition: "var(--transition-elevation)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      aspectRatio: "1 / 1",
      background: "var(--surface-sunken)",
      overflow: "hidden"
    }
  }, imageUrl ? /*#__PURE__*/React.createElement("img", {
    src: imageUrl,
    alt: name,
    style: {
      width: "100%",
      height: "100%",
      objectFit: "cover",
      transform: hover ? "scale(1.03)" : "none",
      transition: "transform var(--duration-slow) var(--ease-out)"
    }
  }) : /*#__PURE__*/React.createElement("div", {
    style: {
      height: "100%",
      display: "grid",
      placeItems: "center",
      color: "var(--sand-400)"
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "photo",
    size: 32,
    basePath: iconBase
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "var(--space-3)",
      display: "flex",
      flexDirection: "column",
      gap: "var(--space-1)",
      minWidth: 0
    }
  }, category && /*#__PURE__*/React.createElement(__ds_scope.Badge, {
    style: {
      alignSelf: "flex-start",
      marginBottom: "var(--space-1)"
    }
  }, category), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      font: "var(--type-label)",
      color: hover ? "var(--text-brand)" : "var(--text-heading)",
      whiteSpace: "nowrap",
      overflow: "hidden",
      textOverflow: "ellipsis"
    }
  }, name), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      font: "var(--type-caption)",
      color: "var(--text-muted)"
    }
  }, storeName), price && /*#__PURE__*/React.createElement("p", {
    style: {
      margin: "var(--space-1) 0 0",
      font: "var(--type-label)",
      fontWeight: "var(--weight-bold)",
      color: "var(--text-brand)"
    }
  }, price)));
}
Object.assign(__ds_scope, { ProductCard });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/commerce/ProductCard.jsx", error: String((e && e.message) || e) }); }

// components/core/Input.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function Input({
  invalid,
  style,
  ...rest
}) {
  const [focus, setFocus] = React.useState(false);
  return /*#__PURE__*/React.createElement("input", _extends({}, rest, {
    onFocus: e => {
      setFocus(true);
      rest.onFocus && rest.onFocus(e);
    },
    onBlur: e => {
      setFocus(false);
      rest.onBlur && rest.onBlur(e);
    },
    style: {
      width: "100%",
      height: "2.25rem",
      padding: "0 var(--space-3)",
      boxSizing: "border-box",
      background: "var(--surface-card)",
      color: "var(--text-heading)",
      border: "1px solid " + (invalid ? "var(--danger-600)" : focus ? "var(--border-focus)" : "var(--border-default)"),
      borderRadius: "var(--radius-input)",
      font: "var(--type-body)",
      outline: "none",
      boxShadow: focus ? "var(--shadow-focus)" : "var(--shadow-xs)",
      transition: "var(--transition-color), box-shadow var(--duration-fast) var(--ease-standard)",
      ...style
    }
  }));
}
Object.assign(__ds_scope, { Input });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Input.jsx", error: String((e && e.message) || e) }); }

// components/core/Label.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function Label({
  required,
  children,
  style,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("label", _extends({}, rest, {
    style: {
      display: "inline-block",
      font: "var(--type-label)",
      color: "var(--text-heading)",
      ...style
    }
  }), children, required && /*#__PURE__*/React.createElement("span", {
    style: {
      color: "var(--danger-600)",
      marginLeft: "0.15rem"
    }
  }, "*"));
}
Object.assign(__ds_scope, { Label });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Label.jsx", error: String((e && e.message) || e) }); }

// components/core/Textarea.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function Textarea({
  invalid,
  style,
  rows = 4,
  ...rest
}) {
  const [focus, setFocus] = React.useState(false);
  return /*#__PURE__*/React.createElement("textarea", _extends({
    rows: rows
  }, rest, {
    onFocus: e => {
      setFocus(true);
      rest.onFocus && rest.onFocus(e);
    },
    onBlur: e => {
      setFocus(false);
      rest.onBlur && rest.onBlur(e);
    },
    style: {
      width: "100%",
      minHeight: "3.75rem",
      padding: "var(--space-2) var(--space-3)",
      boxSizing: "border-box",
      background: "var(--surface-card)",
      color: "var(--text-heading)",
      border: "1px solid " + (invalid ? "var(--danger-600)" : focus ? "var(--border-focus)" : "var(--border-default)"),
      borderRadius: "var(--radius-input)",
      font: "var(--type-body)",
      outline: "none",
      resize: "vertical",
      boxShadow: focus ? "var(--shadow-focus)" : "var(--shadow-xs)",
      transition: "var(--transition-color), box-shadow var(--duration-fast) var(--ease-standard)",
      ...style
    }
  }));
}
Object.assign(__ds_scope, { Textarea });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Textarea.jsx", error: String((e && e.message) || e) }); }

// components/data/DataTable.jsx
try { (() => {
function DataTable({
  columns = [],
  rows = [],
  rowKey = "id",
  selectable,
  selected = [],
  onSelectionChange,
  emptyMessage = "Nothing here yet."
}) {
  const keyOf = (r, i) => typeof rowKey === "function" ? rowKey(r) : r[rowKey] != null ? r[rowKey] : i;
  const allKeys = rows.map(keyOf);
  const allOn = rows.length > 0 && allKeys.every(k => selected.includes(k));
  function toggleAll() {
    onSelectionChange && onSelectionChange(allOn ? [] : allKeys);
  }
  function toggleRow(k) {
    if (!onSelectionChange) return;
    onSelectionChange(selected.includes(k) ? selected.filter(x => x !== k) : [...selected, k]);
  }
  const box = (on, fn) => /*#__PURE__*/React.createElement("button", {
    type: "button",
    role: "checkbox",
    "aria-checked": on,
    onClick: fn,
    style: {
      width: "1rem",
      height: "1rem",
      padding: 0,
      display: "grid",
      placeItems: "center",
      cursor: "pointer",
      borderRadius: "var(--radius-xs)",
      border: "1px solid " + (on ? "var(--action-primary)" : "var(--border-default)"),
      background: on ? "var(--action-primary)" : "var(--surface-card)",
      transition: "var(--transition-color)"
    }
  }, on && /*#__PURE__*/React.createElement("svg", {
    width: "10",
    height: "10",
    viewBox: "0 0 24 24",
    fill: "none",
    "aria-hidden": "true"
  }, /*#__PURE__*/React.createElement("path", {
    d: "m4.5 12.75 6 6 9-13.5",
    stroke: "#fff",
    strokeWidth: "3.5",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  })));
  const cell = {
    padding: "var(--space-3) var(--space-5)",
    textAlign: "left"
  };
  return /*#__PURE__*/React.createElement("div", {
    style: {
      background: "var(--surface-card)",
      border: "1px solid var(--border-subtle)",
      borderRadius: "var(--radius-card)",
      boxShadow: "var(--shadow-sm)",
      overflow: "hidden"
    }
  }, /*#__PURE__*/React.createElement("table", {
    style: {
      width: "100%",
      borderCollapse: "collapse",
      font: "var(--type-body)"
    }
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", {
    style: {
      background: "var(--surface-sunken)",
      borderBottom: "1px solid var(--border-subtle)"
    }
  }, selectable && /*#__PURE__*/React.createElement("th", {
    style: {
      ...cell,
      width: "1rem"
    }
  }, box(allOn, toggleAll)), columns.map(c => /*#__PURE__*/React.createElement("th", {
    key: c.key,
    style: {
      ...cell,
      textAlign: c.align || "left",
      width: c.width,
      font: "var(--type-eyebrow)",
      textTransform: "uppercase",
      letterSpacing: "var(--tracking-wide)",
      color: "var(--text-muted)"
    }
  }, c.header)))), /*#__PURE__*/React.createElement("tbody", null, rows.length === 0 ? /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", {
    colSpan: columns.length + (selectable ? 1 : 0),
    style: {
      ...cell,
      padding: "var(--space-12)",
      textAlign: "center",
      color: "var(--text-muted)"
    }
  }, emptyMessage)) : rows.map((r, i) => {
    const k = keyOf(r, i);
    const on = selected.includes(k);
    return /*#__PURE__*/React.createElement("tr", {
      key: k,
      style: {
        borderBottom: "1px solid var(--border-subtle)",
        background: on ? "var(--surface-accent)" : "transparent",
        transition: "var(--transition-color)"
      }
    }, selectable && /*#__PURE__*/React.createElement("td", {
      style: cell
    }, box(on, () => toggleRow(k))), columns.map(c => /*#__PURE__*/React.createElement("td", {
      key: c.key,
      style: {
        ...cell,
        textAlign: c.align || "left",
        color: "var(--text-body)"
      }
    }, c.render ? c.render(r) : r[c.key])));
  }))));
}
Object.assign(__ds_scope, { DataTable });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data/DataTable.jsx", error: String((e && e.message) || e) }); }

// components/feedback/Dialog.jsx
try { (() => {
function Dialog({
  open,
  title,
  description,
  children,
  footer,
  onClose,
  width = "28rem"
}) {
  React.useEffect(() => {
    if (!open) return;
    const onKey = e => {
      if (e.key === "Escape") onClose && onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return /*#__PURE__*/React.createElement("div", {
    onClick: onClose,
    style: {
      position: "fixed",
      inset: 0,
      zIndex: 100,
      background: "var(--surface-overlay)",
      backdropFilter: "var(--blur-overlay)",
      display: "grid",
      placeItems: "center",
      padding: "var(--space-6)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    role: "dialog",
    "aria-modal": "true",
    onClick: e => e.stopPropagation(),
    style: {
      width: "100%",
      maxWidth: width,
      background: "var(--surface-card)",
      borderRadius: "var(--radius-panel)",
      boxShadow: "var(--shadow-xl)",
      overflow: "hidden"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "var(--space-6) var(--space-6) var(--space-4)",
      display: "flex",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: "var(--space-4)"
    }
  }, /*#__PURE__*/React.createElement("div", null, title && /*#__PURE__*/React.createElement("h2", {
    style: {
      font: "var(--type-h3)",
      color: "var(--text-heading)"
    }
  }, title), description && /*#__PURE__*/React.createElement("p", {
    style: {
      margin: "var(--space-2) 0 0",
      font: "var(--type-body)",
      color: "var(--text-muted)"
    }
  }, description)), /*#__PURE__*/React.createElement(__ds_scope.Button, {
    variant: "ghost",
    size: "icon",
    "aria-label": "Close",
    onClick: onClose,
    style: {
      marginTop: "-0.25rem",
      marginRight: "-0.5rem"
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: "18",
    height: "18",
    viewBox: "0 0 24 24",
    fill: "none",
    "aria-hidden": "true"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M6 18 18 6M6 6l12 12",
    stroke: "currentColor",
    strokeWidth: "1.5",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  })))), children && /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "0 var(--space-6)"
    }
  }, children), footer && /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "flex-end",
      gap: "var(--space-3)",
      padding: "var(--space-6)"
    }
  }, footer)));
}
Object.assign(__ds_scope, { Dialog });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/Dialog.jsx", error: String((e && e.message) || e) }); }

// components/feedback/EmptyState.jsx
try { (() => {
function EmptyState({
  icon,
  message,
  action,
  onAction,
  style
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      border: "1px dashed var(--border-default)",
      borderRadius: "var(--radius-panel)",
      padding: "var(--space-16) var(--space-6)",
      textAlign: "center",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: "var(--space-3)",
      ...style
    }
  }, icon && /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: icon,
    size: 28,
    style: {
      color: "var(--sand-400)"
    }
  }), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      font: "var(--type-body)",
      color: "var(--text-muted)"
    }
  }, message), action && /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: onAction,
    style: {
      background: "none",
      border: "none",
      padding: 0,
      cursor: "pointer",
      font: "var(--type-body)",
      color: "var(--text-link)",
      textDecoration: "underline",
      textUnderlineOffset: 4
    }
  }, action));
}
Object.assign(__ds_scope, { EmptyState });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/EmptyState.jsx", error: String((e && e.message) || e) }); }

// components/feedback/Toast.jsx
try { (() => {
const TONES = {
  success: ["var(--success-100)", "var(--success-700)"],
  error: ["var(--danger-100)", "var(--danger-700)"],
  info: ["var(--navy-900)", "var(--sand-50)"]
};
function Toast({
  open = true,
  tone = "success",
  message,
  action,
  onAction,
  onClose,
  duration = 4000
}) {
  React.useEffect(() => {
    if (!open || !duration || !onClose) return;
    const t = setTimeout(onClose, duration);
    return () => clearTimeout(t);
  }, [open, duration, onClose]);
  if (!open) return null;
  const [bg, fg] = TONES[tone];
  return /*#__PURE__*/React.createElement("div", {
    role: "status",
    style: {
      position: "fixed",
      left: "50%",
      bottom: "var(--space-8)",
      zIndex: 120,
      transform: "translateX(-50%)",
      display: "flex",
      alignItems: "center",
      gap: "var(--space-4)",
      padding: "var(--space-3) var(--space-5)",
      borderRadius: "var(--radius-pill)",
      background: bg,
      color: fg,
      boxShadow: "var(--shadow-lg)",
      font: "var(--type-label)"
    }
  }, message, action && /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: onAction,
    style: {
      background: "none",
      border: "none",
      padding: 0,
      cursor: "pointer",
      color: "inherit",
      font: "var(--type-label)",
      fontWeight: "var(--weight-bold)",
      textDecoration: "underline",
      textUnderlineOffset: 3
    }
  }, action));
}
Object.assign(__ds_scope, { Toast });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/Toast.jsx", error: String((e && e.message) || e) }); }

// components/forms/Checkbox.jsx
try { (() => {
function Checkbox({
  label,
  description,
  checked,
  defaultChecked,
  onChange,
  disabled,
  id,
  style
}) {
  const [inner, setInner] = React.useState(!!defaultChecked);
  const on = checked === undefined ? inner : checked;
  const uid = id || React.useId();
  function toggle() {
    if (disabled) return;
    if (checked === undefined) setInner(!on);
    onChange && onChange(!on);
  }
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "flex-start",
      gap: "var(--space-3)",
      ...style
    }
  }, /*#__PURE__*/React.createElement("button", {
    type: "button",
    role: "checkbox",
    "aria-checked": on,
    id: uid,
    disabled: disabled,
    onClick: toggle,
    style: {
      width: "1.125rem",
      height: "1.125rem",
      marginTop: "0.15rem",
      flexShrink: 0,
      padding: 0,
      display: "grid",
      placeItems: "center",
      borderRadius: "var(--radius-xs)",
      border: "1px solid " + (on ? "var(--action-primary)" : "var(--border-default)"),
      background: on ? "var(--action-primary)" : "var(--surface-card)",
      cursor: disabled ? "not-allowed" : "pointer",
      opacity: disabled ? 0.5 : 1,
      transition: "var(--transition-color)"
    }
  }, on && /*#__PURE__*/React.createElement("svg", {
    width: "12",
    height: "12",
    viewBox: "0 0 24 24",
    fill: "none",
    "aria-hidden": "true"
  }, /*#__PURE__*/React.createElement("path", {
    d: "m4.5 12.75 6 6 9-13.5",
    stroke: "#fff",
    strokeWidth: "3",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }))), (label || description) && /*#__PURE__*/React.createElement("label", {
    htmlFor: uid,
    onClick: toggle,
    style: {
      cursor: disabled ? "not-allowed" : "pointer"
    }
  }, label && /*#__PURE__*/React.createElement("span", {
    style: {
      display: "block",
      font: "var(--type-label)",
      color: "var(--text-heading)"
    }
  }, label), description && /*#__PURE__*/React.createElement("span", {
    style: {
      display: "block",
      marginTop: 2,
      font: "var(--type-caption)",
      color: "var(--text-muted)"
    }
  }, description)));
}
Object.assign(__ds_scope, { Checkbox });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Checkbox.jsx", error: String((e && e.message) || e) }); }

// components/forms/Field.jsx
try { (() => {
function Field({
  label,
  htmlFor,
  required,
  hint,
  error,
  children,
  style
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: "var(--space-2)",
      ...style
    }
  }, label && /*#__PURE__*/React.createElement(__ds_scope.Label, {
    htmlFor: htmlFor,
    required: required
  }, label), children, error ? /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      font: "var(--type-caption)",
      color: "var(--danger-600)"
    }
  }, error) : hint ? /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      font: "var(--type-caption)",
      color: "var(--text-muted)"
    }
  }, hint) : null);
}
Object.assign(__ds_scope, { Field });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Field.jsx", error: String((e && e.message) || e) }); }

// components/forms/RadioGroup.jsx
try { (() => {
function RadioGroup({
  name,
  options = [],
  value,
  defaultValue,
  onChange,
  variant = "list",
  style
}) {
  const [inner, setInner] = React.useState(defaultValue || options[0] && options[0].value);
  const current = value === undefined ? inner : value;
  function pick(v) {
    if (value === undefined) setInner(v);
    onChange && onChange(v);
  }
  return /*#__PURE__*/React.createElement("div", {
    role: "radiogroup",
    style: {
      display: "flex",
      flexDirection: "column",
      gap: "var(--space-2)",
      ...style
    }
  }, options.map(o => {
    const on = o.value === current;
    return /*#__PURE__*/React.createElement("button", {
      key: o.value,
      type: "button",
      role: "radio",
      "aria-checked": on,
      name: name,
      disabled: o.disabled,
      onClick: () => !o.disabled && pick(o.value),
      style: {
        display: "flex",
        alignItems: "center",
        gap: "var(--space-3)",
        textAlign: "left",
        width: "100%",
        padding: variant === "card" ? "var(--space-3) var(--space-4)" : 0,
        background: variant === "card" ? on ? "var(--surface-accent)" : "var(--surface-card)" : "transparent",
        border: variant === "card" ? "1px solid " + (on ? "var(--border-brand)" : "var(--border-subtle)") : "none",
        borderRadius: "var(--radius-control)",
        cursor: o.disabled ? "not-allowed" : "pointer",
        opacity: o.disabled ? 0.5 : 1,
        transition: "var(--transition-color)"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        width: "1.125rem",
        height: "1.125rem",
        flexShrink: 0,
        borderRadius: "50%",
        border: "1px solid " + (on ? "var(--action-primary)" : "var(--border-default)"),
        display: "grid",
        placeItems: "center",
        background: "var(--surface-card)"
      }
    }, on && /*#__PURE__*/React.createElement("span", {
      style: {
        width: "0.55rem",
        height: "0.55rem",
        borderRadius: "50%",
        background: "var(--action-primary)"
      }
    })), /*#__PURE__*/React.createElement("span", {
      style: {
        flex: 1,
        minWidth: 0
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        display: "block",
        font: "var(--type-label)",
        color: "var(--text-heading)"
      }
    }, o.label), o.description && /*#__PURE__*/React.createElement("span", {
      style: {
        display: "block",
        marginTop: 2,
        font: "var(--type-caption)",
        color: "var(--text-muted)"
      }
    }, o.description)), o.meta && /*#__PURE__*/React.createElement("span", {
      style: {
        font: "var(--type-label)",
        fontWeight: "var(--weight-bold)",
        color: "var(--text-heading)"
      }
    }, o.meta));
  }));
}
Object.assign(__ds_scope, { RadioGroup });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/RadioGroup.jsx", error: String((e && e.message) || e) }); }

// components/forms/Select.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function Select({
  options = [],
  invalid,
  style,
  children,
  ...rest
}) {
  const [focus, setFocus] = React.useState(false);
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: "relative",
      display: "block",
      ...style
    }
  }, /*#__PURE__*/React.createElement("select", _extends({}, rest, {
    onFocus: e => {
      setFocus(true);
      rest.onFocus && rest.onFocus(e);
    },
    onBlur: e => {
      setFocus(false);
      rest.onBlur && rest.onBlur(e);
    },
    style: {
      width: "100%",
      height: "2.25rem",
      padding: "0 2rem 0 var(--space-3)",
      boxSizing: "border-box",
      appearance: "none",
      background: "var(--surface-card)",
      color: "var(--text-heading)",
      border: "1px solid " + (invalid ? "var(--danger-600)" : focus ? "var(--border-focus)" : "var(--border-default)"),
      borderRadius: "var(--radius-input)",
      font: "var(--type-body)",
      outline: "none",
      cursor: "pointer",
      boxShadow: focus ? "var(--shadow-focus)" : "var(--shadow-xs)",
      transition: "var(--transition-color), box-shadow var(--duration-fast) var(--ease-standard)"
    }
  }), children || options.map(o => /*#__PURE__*/React.createElement("option", {
    key: o.value,
    value: o.value
  }, o.label))), /*#__PURE__*/React.createElement("svg", {
    width: "16",
    height: "16",
    viewBox: "0 0 24 24",
    fill: "none",
    "aria-hidden": "true",
    style: {
      position: "absolute",
      right: "var(--space-3)",
      top: "50%",
      transform: "translateY(-50%)",
      pointerEvents: "none",
      color: "var(--text-muted)"
    }
  }, /*#__PURE__*/React.createElement("path", {
    d: "m19.5 8.25-7.5 7.5-7.5-7.5",
    stroke: "currentColor",
    strokeWidth: "1.5",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  })));
}
Object.assign(__ds_scope, { Select });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Select.jsx", error: String((e && e.message) || e) }); }

// components/forms/Switch.jsx
try { (() => {
function Switch({
  label,
  description,
  checked,
  defaultChecked,
  onChange,
  disabled,
  style
}) {
  const [inner, setInner] = React.useState(!!defaultChecked);
  const on = checked === undefined ? inner : checked;
  function toggle() {
    if (disabled) return;
    if (checked === undefined) setInner(!on);
    onChange && onChange(!on);
  }
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: "var(--space-3)",
      ...style
    }
  }, /*#__PURE__*/React.createElement("button", {
    type: "button",
    role: "switch",
    "aria-checked": on,
    disabled: disabled,
    onClick: toggle,
    style: {
      width: "2.25rem",
      height: "1.25rem",
      flexShrink: 0,
      padding: 2,
      borderRadius: "var(--radius-pill)",
      border: "none",
      background: on ? "var(--action-primary)" : "var(--sand-300)",
      cursor: disabled ? "not-allowed" : "pointer",
      opacity: disabled ? 0.5 : 1,
      display: "flex",
      justifyContent: on ? "flex-end" : "flex-start",
      alignItems: "center",
      transition: "background-color var(--duration-fast) var(--ease-standard)"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: "1rem",
      height: "1rem",
      borderRadius: "50%",
      background: "#fff",
      boxShadow: "var(--shadow-xs)"
    }
  })), (label || description) && /*#__PURE__*/React.createElement("span", {
    style: {
      minWidth: 0
    }
  }, label && /*#__PURE__*/React.createElement("span", {
    style: {
      display: "block",
      font: "var(--type-label)",
      color: "var(--text-heading)"
    }
  }, label), description && /*#__PURE__*/React.createElement("span", {
    style: {
      display: "block",
      marginTop: 2,
      font: "var(--type-caption)",
      color: "var(--text-muted)"
    }
  }, description)));
}
Object.assign(__ds_scope, { Switch });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Switch.jsx", error: String((e && e.message) || e) }); }

// components/navigation/CategoryList.jsx
try { (() => {
function CategoryList({
  title = "Categories",
  items = [],
  active,
  onChange
}) {
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("p", {
    style: {
      margin: "0 0 var(--space-2)",
      font: "var(--type-eyebrow)",
      textTransform: "uppercase",
      letterSpacing: "var(--tracking-wide)",
      color: "var(--text-muted)"
    }
  }, title), /*#__PURE__*/React.createElement("ul", {
    style: {
      margin: 0,
      padding: 0,
      listStyle: "none",
      display: "flex",
      flexDirection: "column",
      gap: "var(--space-1)"
    }
  }, items.map(it => {
    const on = it.value === active;
    return /*#__PURE__*/React.createElement("li", {
      key: it.value
    }, /*#__PURE__*/React.createElement("button", {
      type: "button",
      onClick: () => onChange && onChange(it.value),
      style: {
        width: "100%",
        textAlign: "left",
        padding: "0.375rem var(--space-3)",
        cursor: "pointer",
        borderRadius: "var(--radius-sm)",
        border: "none",
        background: on ? "var(--surface-accent)" : "transparent",
        color: on ? "var(--red-700)" : "var(--text-body)",
        font: "var(--type-body)",
        fontWeight: on ? "var(--weight-semibold)" : "var(--weight-regular)",
        transition: "var(--transition-color)"
      }
    }, it.label));
  })));
}
Object.assign(__ds_scope, { CategoryList });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/CategoryList.jsx", error: String((e && e.message) || e) }); }

// components/navigation/FilterPills.jsx
try { (() => {
function FilterPills({
  items = [],
  active,
  onChange
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexWrap: "wrap",
      gap: "var(--space-2)"
    }
  }, items.map(it => {
    const on = it.value === active;
    return /*#__PURE__*/React.createElement("button", {
      key: it.value,
      type: "button",
      onClick: () => onChange && onChange(it.value),
      style: {
        padding: "0.25rem var(--space-3)",
        borderRadius: "var(--radius-pill)",
        border: "none",
        cursor: "pointer",
        background: on ? "var(--action-primary)" : "var(--surface-sunken)",
        color: on ? "var(--text-on-brand)" : "var(--text-muted)",
        font: "var(--type-caption)",
        fontWeight: "var(--weight-semibold)",
        textTransform: "capitalize",
        transition: "var(--transition-color)"
      }
    }, it.label);
  }));
}
Object.assign(__ds_scope, { FilterPills });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/FilterPills.jsx", error: String((e && e.message) || e) }); }

// components/navigation/Pagination.jsx
try { (() => {
function range(current, total) {
  if (total <= 7) return Array.from({
    length: total
  }, (_, i) => i + 1);
  const pages = [1];
  if (current > 3) pages.push("…");
  for (let p = Math.max(2, current - 1); p <= Math.min(total - 1, current + 1); p++) pages.push(p);
  if (current < total - 2) pages.push("…");
  pages.push(total);
  return pages;
}
function Pagination({
  page = 1,
  totalPages = 1,
  onChange
}) {
  if (totalPages <= 1) return null;
  return /*#__PURE__*/React.createElement("nav", {
    "aria-label": "Pagination",
    style: {
      display: "flex",
      justifyContent: "center",
      gap: "var(--space-1)"
    }
  }, range(page, totalPages).map((p, i) => p === "…" ? /*#__PURE__*/React.createElement("span", {
    key: "e" + i,
    "aria-hidden": "true",
    style: {
      width: "2.75rem",
      height: "2.75rem",
      display: "grid",
      placeItems: "center",
      color: "var(--text-subtle)"
    }
  }, "\u2026") : /*#__PURE__*/React.createElement("button", {
    key: p,
    type: "button",
    "aria-current": p === page ? "page" : undefined,
    onClick: () => onChange && onChange(p),
    style: {
      width: "2.75rem",
      height: "2.75rem",
      display: "grid",
      placeItems: "center",
      cursor: "pointer",
      borderRadius: "var(--radius-control)",
      font: "var(--type-body)",
      border: p === page ? "1px solid transparent" : "1px solid var(--border-subtle)",
      background: p === page ? "var(--action-primary)" : "transparent",
      color: p === page ? "var(--text-on-brand)" : "var(--text-muted)",
      transition: "var(--transition-color)"
    }
  }, p)));
}
Object.assign(__ds_scope, { Pagination });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/Pagination.jsx", error: String((e && e.message) || e) }); }

// components/navigation/Tabs.jsx
try { (() => {
function Tabs({
  items = [],
  active,
  onChange
}) {
  return /*#__PURE__*/React.createElement("nav", {
    style: {
      display: "flex",
      gap: "var(--space-1)",
      borderBottom: "1px solid var(--border-subtle)"
    }
  }, items.map(it => {
    const on = it.value === active;
    return /*#__PURE__*/React.createElement("button", {
      key: it.value,
      type: "button",
      onClick: () => onChange && onChange(it.value),
      style: {
        padding: "var(--space-2) var(--space-4)",
        background: "none",
        cursor: "pointer",
        border: "none",
        borderBottom: "2px solid " + (on ? "var(--border-brand)" : "transparent"),
        marginBottom: -1,
        font: "var(--type-label)",
        color: on ? "var(--text-brand)" : "var(--text-muted)",
        transition: "var(--transition-color)"
      }
    }, it.label);
  }));
}
Object.assign(__ds_scope, { Tabs });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/Tabs.jsx", error: String((e && e.message) || e) }); }

// components/navigation/Wordmark.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/* BOMY has no logo file — the intake asks for one to be designed. Until a real mark
   exists, the brand is set in type: the wordmark below. Do not substitute a drawn symbol. */
function Wordmark({
  size = 20,
  tone = "brand",
  href = "/",
  as = "a"
}) {
  const color = tone === "inverse" ? "var(--text-inverse)" : tone === "ink" ? "var(--text-heading)" : "var(--text-brand)";
  const Tag = as;
  return /*#__PURE__*/React.createElement(Tag, _extends({}, as === "a" ? {
    href
  } : {}, {
    style: {
      display: "inline-flex",
      alignItems: "baseline",
      gap: "0.08em",
      textDecoration: "none",
      fontFamily: "var(--font-display)",
      fontWeight: "var(--weight-extrabold)",
      fontSize: size,
      lineHeight: 1,
      letterSpacing: "var(--tracking-tighter)",
      color
    }
  }), "BOMY", /*#__PURE__*/React.createElement("span", {
    style: {
      width: "0.24em",
      height: "0.24em",
      borderRadius: "50%",
      background: "var(--gold-400)",
      display: "inline-block"
    }
  }));
}
Object.assign(__ds_scope, { Wordmark });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/Wordmark.jsx", error: String((e && e.message) || e) }); }

// components/navigation/Footer.jsx
try { (() => {
const QUICK = [{
  href: "/about",
  label: "About BOMY"
}, {
  href: "/contact",
  label: "Contact"
}];
const POLICIES = [{
  href: "/terms",
  label: "Terms of Service"
}, {
  href: "/privacy",
  label: "Privacy Policy"
}, {
  href: "/refund",
  label: "Refund and Return"
}, {
  href: "/shipping",
  label: "Shipping and Delivery"
}];
function Column({
  title,
  links
}) {
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      font: "var(--type-eyebrow)",
      textTransform: "uppercase",
      letterSpacing: "var(--tracking-wide)",
      color: "var(--text-muted)"
    }
  }, title), /*#__PURE__*/React.createElement("ul", {
    style: {
      margin: "var(--space-3) 0 0",
      padding: 0,
      listStyle: "none",
      display: "flex",
      flexDirection: "column",
      gap: "var(--space-2)"
    }
  }, links.map(l => /*#__PURE__*/React.createElement("li", {
    key: l.href
  }, /*#__PURE__*/React.createElement("a", {
    href: l.href,
    style: {
      font: "var(--type-body)",
      color: "var(--text-muted)",
      textDecoration: "none"
    }
  }, l.label)))));
}
function Footer({
  email = "contact@brandsofmalaysia.com",
  address = "19-2, Lorong Mayang Pasir 5, Taman Sri Tunas, 11950 Bayan Lepas, Pulau Pinang."
}) {
  return /*#__PURE__*/React.createElement("footer", {
    style: {
      marginTop: "var(--space-16)",
      borderTop: "1px solid var(--border-subtle)",
      background: "var(--surface-sunken)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: "var(--container-wide)",
      margin: "0 auto",
      padding: "var(--space-12) var(--space-4)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "2fr 1fr 1fr",
      gap: "var(--space-10)"
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(__ds_scope.Wordmark, {
    size: 28,
    as: "span"
  }), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: "var(--space-3) 0 0",
      font: "var(--type-body)",
      color: "var(--text-muted)"
    }
  }, "A curated Malaysian multivendor marketplace."), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: "var(--space-6) 0 0",
      font: "var(--type-body)",
      color: "var(--text-muted)"
    }
  }, "BOMY by Inflo Vision (202503276795)"), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: "var(--space-2) 0 0",
      font: "var(--type-body)",
      color: "var(--text-muted)"
    }
  }, "Email: ", /*#__PURE__*/React.createElement("a", {
    href: "mailto:" + email,
    style: {
      color: "var(--text-muted)"
    }
  }, email)), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: "var(--space-2) 0 0",
      font: "var(--type-body)",
      color: "var(--text-muted)"
    }
  }, "Address: ", address)), /*#__PURE__*/React.createElement(Column, {
    title: "Quick Links",
    links: QUICK
  }), /*#__PURE__*/React.createElement(Column, {
    title: "Policies",
    links: POLICIES
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: "var(--space-10)",
      paddingTop: "var(--space-6)",
      borderTop: "1px solid var(--border-subtle)"
    }
  }, /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      font: "var(--type-caption)",
      color: "var(--text-subtle)"
    }
  }, "\xA9 2026 BOMY. All rights reserved."))));
}
Object.assign(__ds_scope, { Footer });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/Footer.jsx", error: String((e && e.message) || e) }); }

// components/navigation/NavBar.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const DEFAULT_LINKS = [{
  href: "/products",
  label: "Products"
}, {
  href: "/brands",
  label: "Brands"
}, {
  href: "/membership",
  label: "Membership"
}, {
  href: "/seller/apply",
  label: "Sell with us"
}];
function NavLink({
  href,
  label,
  active,
  onClick
}) {
  const [hover, setHover] = React.useState(false);
  return /*#__PURE__*/React.createElement("a", {
    href: href,
    onClick: onClick,
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => setHover(false),
    style: {
      font: "var(--type-body)",
      textDecoration: "none",
      color: active || hover ? "var(--text-heading)" : "var(--text-muted)",
      transition: "var(--transition-color)"
    }
  }, label);
}
function NavBar({
  links = DEFAULT_LINKS,
  activeHref,
  cartCount = 0,
  signedIn,
  isSeller,
  iconBase = "assets/icons",
  onNavigate
}) {
  const authLinks = signedIn ? [...(isSeller ? [{
    href: "/seller/dashboard",
    label: "Seller"
  }] : []), {
    href: "/account",
    label: "Account"
  }] : [{
    href: "/auth/sign-in",
    label: "Sign in"
  }];
  return /*#__PURE__*/React.createElement("nav", {
    style: {
      position: "sticky",
      top: 0,
      zIndex: 50,
      background: "var(--surface-card)",
      borderBottom: "1px solid var(--border-subtle)",
      boxShadow: "var(--shadow-xs)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      height: "var(--nav-height)",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "0 var(--space-4)"
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Wordmark, {
    size: 20
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: "var(--space-5)"
    }
  }, links.map(l => /*#__PURE__*/React.createElement(NavLink, _extends({
    key: l.href
  }, l, {
    active: l.href === activeHref,
    onClick: onNavigate && (e => {
      e.preventDefault();
      onNavigate(l.href);
    })
  }))), /*#__PURE__*/React.createElement("a", {
    href: "/cart",
    "aria-label": "Cart",
    onClick: onNavigate && (e => {
      e.preventDefault();
      onNavigate("/cart");
    }),
    style: {
      position: "relative",
      display: "flex",
      color: "var(--text-muted)"
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "shopping-bag",
    size: 24,
    basePath: iconBase
  }), cartCount > 0 && /*#__PURE__*/React.createElement("span", {
    style: {
      position: "absolute",
      top: -6,
      right: -8,
      minWidth: 17,
      height: 17,
      padding: "0 4px",
      display: "grid",
      placeItems: "center",
      borderRadius: "var(--radius-pill)",
      background: "var(--action-primary)",
      color: "var(--text-on-brand)",
      fontFamily: "var(--font-sans)",
      fontSize: 10,
      fontWeight: "var(--weight-bold)"
    }
  }, cartCount > 99 ? "99+" : cartCount)), authLinks.map(l => /*#__PURE__*/React.createElement(NavLink, _extends({
    key: l.href
  }, l, {
    active: l.href === activeHref,
    onClick: onNavigate && (e => {
      e.preventDefault();
      onNavigate(l.href);
    })
  }))))));
}
Object.assign(__ds_scope, { NavBar });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/NavBar.jsx", error: String((e && e.message) || e) }); }

// components/navigation/SellerSidebar.jsx
try { (() => {
const NAV = [{
  href: "/seller/dashboard",
  label: "Overview",
  icon: "squares-2x2"
}, {
  href: "/seller/dashboard/subscriptions",
  label: "Subscriptions",
  icon: "sparkles"
}, {
  href: "/seller/dashboard/products",
  label: "Products",
  icon: "shopping-bag"
}, {
  href: "/seller/dashboard/orders",
  label: "Orders",
  icon: "clipboard-document-list"
}, {
  href: "/seller/dashboard/settings",
  label: "Settings",
  icon: "cog-6-tooth"
}];
function SellerSidebar({
  storeName = "My Store",
  items = NAV,
  activeHref,
  iconBase = "assets/icons",
  onNavigate
}) {
  return /*#__PURE__*/React.createElement("aside", {
    style: {
      width: "13rem",
      flexShrink: 0,
      display: "flex",
      flexDirection: "column",
      background: "var(--navy-900)",
      color: "var(--navy-200)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "var(--space-4) var(--space-5)",
      borderBottom: "1px solid var(--navy-800)",
      display: "flex",
      flexDirection: "column",
      gap: "var(--space-2)"
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Wordmark, {
    size: 18,
    tone: "inverse",
    as: "span"
  }), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      font: "var(--type-caption)",
      color: "var(--navy-300)"
    }
  }, storeName)), /*#__PURE__*/React.createElement("nav", {
    style: {
      display: "flex",
      flexDirection: "column",
      padding: "var(--space-2) 0"
    }
  }, items.map(it => {
    const on = it.href === activeHref;
    return /*#__PURE__*/React.createElement("a", {
      key: it.href,
      href: it.href,
      onClick: onNavigate && (e => {
        e.preventDefault();
        onNavigate(it.href);
      }),
      style: {
        display: "flex",
        alignItems: "center",
        gap: "var(--space-3)",
        padding: "var(--space-2) var(--space-5)",
        textDecoration: "none",
        borderLeft: "2px solid " + (on ? "var(--red-500)" : "transparent"),
        background: on ? "var(--navy-800)" : "transparent",
        color: on ? "#fff" : "var(--navy-300)",
        font: "var(--type-body)",
        transition: "var(--transition-color)"
      }
    }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
      name: it.icon,
      size: 18,
      basePath: iconBase
    }), it.label);
  })));
}
Object.assign(__ds_scope, { SellerSidebar });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/SellerSidebar.jsx", error: String((e && e.message) || e) }); }

// ui_kits/buyer_site/BrandScreen.jsx
try { (() => {
const {
  Button,
  Badge,
  ProductCard,
  Icon
} = window.BOMYDesignSystem_030168;
const ICONS = "../../assets/icons";
function BrandScreen({
  go
}) {
  const d = window.BOMY_DATA;
  const items = d.products.filter(p => p.store === "Ah Huat Roasters" || p.category === "Food & Beverage");
  return /*#__PURE__*/React.createElement("main", {
    style: {
      maxWidth: "var(--container-content)",
      margin: "0 auto",
      padding: "var(--space-8) var(--space-8) var(--space-16)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      borderRadius: "var(--radius-panel)",
      background: "var(--navy-900)",
      color: "var(--sand-100)",
      padding: "var(--space-12)",
      display: "flex",
      alignItems: "center",
      gap: "var(--space-6)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 72,
      height: 72,
      borderRadius: "var(--radius-circle)",
      background: "var(--gold-400)",
      color: "var(--navy-900)",
      display: "grid",
      placeItems: "center",
      font: "var(--type-h1)"
    }
  }, "A"), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h1", {
    style: {
      color: "#fff",
      font: "var(--type-h1)"
    }
  }, "Ah Huat Roasters"), /*#__PURE__*/React.createElement("p", {
    style: {
      marginTop: "var(--space-2)",
      font: "var(--type-body-lg)",
      color: "var(--navy-200)",
      maxWidth: "38rem"
    }
  }, "Third-generation kopi roasters from Ipoh. Still roasting over wood, still filling the same tins.")), /*#__PURE__*/React.createElement("div", {
    style: {
      marginLeft: "auto",
      display: "flex",
      flexDirection: "column",
      gap: "var(--space-2)"
    }
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "reward",
    size: "lg"
  }, "Subscribe to this brand"), /*#__PURE__*/React.createElement("span", {
    style: {
      font: "var(--type-caption)",
      color: "var(--navy-300)",
      textAlign: "center"
    }
  }, "Perks, drops & avatar gifts"))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "1.4fr 1fr",
      gap: "var(--space-8)",
      margin: "var(--space-12) 0"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: "var(--space-4)"
    }
  }, /*#__PURE__*/React.createElement("h2", {
    style: {
      font: "var(--type-h3)"
    }
  }, "Our story"), /*#__PURE__*/React.createElement("p", {
    style: {
      font: "var(--type-body)",
      color: "var(--text-muted)"
    }
  }, "Ah Huat started roasting in a shophouse on Jalan Bandar in 1962, selling to kopitiams two streets away. Three generations on we still roast over wood in small drums, because the char is the flavour."), /*#__PURE__*/React.createElement("p", {
    style: {
      font: "var(--type-body)",
      color: "var(--text-muted)"
    }
  }, "Everything is packed by hand in Ipoh. If a batch does not taste like the shop, it does not leave the shop."), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: "var(--space-2)"
    }
  }, /*#__PURE__*/React.createElement(Badge, null, "Food & Beverage"), /*#__PURE__*/React.createElement(Badge, {
    variant: "neutral"
  }, "Perak"), /*#__PURE__*/React.createElement(Badge, {
    variant: "success"
  }, "Verified brand"))), /*#__PURE__*/React.createElement("div", {
    style: {
      aspectRatio: "16 / 10",
      borderRadius: "var(--radius-media)",
      background: "var(--surface-sunken)",
      display: "grid",
      placeItems: "center",
      color: "var(--sand-400)",
      border: "1px solid var(--border-subtle)"
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "photo",
    size: 40,
    basePath: ICONS
  }))), /*#__PURE__*/React.createElement("h2", {
    style: {
      font: "var(--type-h3)",
      marginBottom: "var(--space-4)"
    }
  }, "Coffee & pantry"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
      gap: "var(--grid-gap)"
    }
  }, items.map(p => /*#__PURE__*/React.createElement("div", {
    key: p.id,
    onClick: () => go("/product"),
    style: {
      cursor: "pointer"
    }
  }, /*#__PURE__*/React.createElement(ProductCard, {
    name: p.name,
    storeName: p.store,
    price: p.price,
    iconBase: ICONS,
    href: "#"
  })))));
}
Object.assign(window, {
  BrandScreen
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/buyer_site/BrandScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/buyer_site/CartScreen.jsx
try { (() => {
const {
  Button,
  Card,
  CartLineItem
} = window.BOMYDesignSystem_030168;
const ICONS = "../../assets/icons";
function CartScreen({
  items,
  setItems,
  go
}) {
  const subtotal = items.reduce((s, i) => s + i.priceSen * i.quantity, 0);
  const fmt = sen => "RM" + (sen / 100).toFixed(2);
  return /*#__PURE__*/React.createElement("main", {
    style: {
      maxWidth: "var(--container-narrow)",
      margin: "0 auto",
      padding: "var(--space-8) var(--space-8) var(--space-16)"
    }
  }, /*#__PURE__*/React.createElement("h1", {
    style: {
      marginBottom: "var(--space-6)",
      font: "var(--type-h2)"
    }
  }, "Your Cart ", items.length > 0 && /*#__PURE__*/React.createElement("span", {
    style: {
      color: "var(--text-muted)"
    }
  }, "(", items.reduce((s, i) => s + i.quantity, 0), ")")), items.length === 0 ? /*#__PURE__*/React.createElement("div", {
    style: {
      border: "1px dashed var(--border-default)",
      borderRadius: "var(--radius-panel)",
      padding: "var(--space-20) 0",
      textAlign: "center"
    }
  }, /*#__PURE__*/React.createElement("p", {
    style: {
      font: "var(--type-body)",
      color: "var(--text-muted)"
    }
  }, "Your cart is empty."), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: "var(--space-4)"
    }
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "link",
    onClick: () => go("/products")
  }, "Browse products"))) : /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: "var(--space-4)"
    }
  }, items.map(it => /*#__PURE__*/React.createElement(CartLineItem, {
    key: it.id,
    productName: it.name,
    storeName: it.store,
    variantName: it.variant,
    price: fmt(it.priceSen),
    quantity: it.quantity,
    iconBase: ICONS,
    onQuantityChange: n => setItems(n <= 0 ? items.filter(x => x.id !== it.id) : items.map(x => x.id === it.id ? {
      ...x,
      quantity: n
    } : x)),
    onRemove: () => setItems(items.filter(x => x.id !== it.id))
  })), /*#__PURE__*/React.createElement(Card, {
    style: {
      padding: "var(--space-4)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      font: "var(--type-label)",
      color: "var(--text-heading)"
    }
  }, "Subtotal"), /*#__PURE__*/React.createElement("span", {
    style: {
      font: "var(--type-price)",
      fontSize: "var(--text-xl)",
      color: "var(--text-heading)"
    }
  }, fmt(subtotal))), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: "var(--space-1) 0 0",
      font: "var(--type-caption)",
      color: "var(--text-muted)"
    }
  }, "Shipping, vouchers, and any brand-subscription discounts are applied at checkout \u2014 the final price you pay will be shown there."), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: "var(--space-4)"
    }
  }, /*#__PURE__*/React.createElement(Button, {
    size: "lg",
    fullWidth: true,
    onClick: () => go("/checkout")
  }, "Continue to checkout")))));
}
Object.assign(window, {
  CartScreen
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/buyer_site/CartScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/buyer_site/CheckoutScreen.jsx
try { (() => {
const {
  Button,
  Card,
  Field,
  Input,
  Select,
  Checkbox,
  RadioGroup,
  Badge,
  Icon,
  Dialog
} = window.BOMYDesignSystem_030168;
const SHIPPING = [{
  value: "std",
  label: "Standard",
  description: "3–5 working days",
  meta: "RM8.00",
  sen: 800
}, {
  value: "exp",
  label: "Express",
  description: "Next working day",
  meta: "RM18.00",
  sen: 1800
}, {
  value: "pick",
  label: "Self-pickup",
  description: "Bayan Lepas warehouse only",
  meta: "Free",
  sen: 0
}];
const PAYMENT = [{
  value: "card",
  label: "Card",
  description: "Visa, Mastercard"
}, {
  value: "fpx",
  label: "FPX online banking",
  description: "All Malaysian banks"
}, {
  value: "ewallet",
  label: "E-wallet",
  description: "Touch 'n Go, GrabPay"
}];
const fmt = sen => "RM" + (sen / 100).toFixed(2);
function Summary({
  items,
  shipSen,
  member
}) {
  const subtotal = items.reduce((s, i) => s + i.priceSen * i.quantity, 0);
  const discount = member ? Math.round(subtotal * 0.05) : 0;
  const rows = [["Subtotal", fmt(subtotal)], ...(member ? [["Member discount (5%)", "−" + fmt(discount)]] : []), ["Shipping", shipSen === 0 ? "Free" : fmt(shipSen)]];
  return /*#__PURE__*/React.createElement(Card, {
    style: {
      padding: "var(--space-6)",
      position: "sticky",
      top: "calc(var(--nav-height) + var(--space-6))"
    }
  }, /*#__PURE__*/React.createElement("h2", {
    style: {
      font: "var(--type-h3)",
      marginBottom: "var(--space-4)"
    }
  }, "Order summary"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: "var(--space-3)",
      paddingBottom: "var(--space-4)",
      borderBottom: "1px solid var(--border-subtle)"
    }
  }, items.map(i => /*#__PURE__*/React.createElement("div", {
    key: i.id,
    style: {
      display: "flex",
      gap: "var(--space-3)",
      alignItems: "center"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 40,
      height: 40,
      flexShrink: 0,
      borderRadius: "var(--radius-xs)",
      background: "var(--surface-sunken)",
      display: "grid",
      placeItems: "center",
      color: "var(--sand-400)"
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "photo",
    size: 18
  })), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: "block",
      font: "var(--type-label)",
      color: "var(--text-heading)",
      whiteSpace: "nowrap",
      overflow: "hidden",
      textOverflow: "ellipsis"
    }
  }, i.name), /*#__PURE__*/React.createElement("span", {
    style: {
      display: "block",
      font: "var(--type-caption)",
      color: "var(--text-muted)"
    }
  }, i.variant, " \xB7 \xD7", i.quantity)), /*#__PURE__*/React.createElement("span", {
    style: {
      font: "var(--type-label)",
      color: "var(--text-heading)"
    }
  }, fmt(i.priceSen * i.quantity))))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: "var(--space-2)",
      padding: "var(--space-4) 0",
      borderBottom: "1px solid var(--border-subtle)"
    }
  }, rows.map(([l, v]) => /*#__PURE__*/React.createElement("div", {
    key: l,
    style: {
      display: "flex",
      justifyContent: "space-between",
      font: "var(--type-body)",
      color: l.startsWith("Member") ? "var(--success-600)" : "var(--text-muted)"
    }
  }, /*#__PURE__*/React.createElement("span", null, l), /*#__PURE__*/React.createElement("span", null, v)))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "baseline",
      paddingTop: "var(--space-4)"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      font: "var(--type-label)",
      color: "var(--text-heading)"
    }
  }, "Total"), /*#__PURE__*/React.createElement("span", {
    style: {
      font: "var(--type-price)",
      color: "var(--text-heading)"
    }
  }, fmt(subtotal - discount + shipSen))), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: "var(--space-2) 0 0",
      font: "var(--type-caption)",
      color: "var(--text-subtle)"
    }
  }, "All prices in MYR, inclusive of tax where applicable."));
}
function Step({
  n,
  title,
  children
}) {
  return /*#__PURE__*/React.createElement(Card, {
    style: {
      padding: "var(--space-6)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: "var(--space-3)",
      marginBottom: "var(--space-5)"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: "1.5rem",
      height: "1.5rem",
      flexShrink: 0,
      borderRadius: "50%",
      background: "var(--surface-accent)",
      color: "var(--red-700)",
      display: "grid",
      placeItems: "center",
      font: "var(--type-caption)",
      fontWeight: "var(--weight-bold)"
    }
  }, n), /*#__PURE__*/React.createElement("h2", {
    style: {
      font: "var(--type-h3)"
    }
  }, title)), children);
}
function CheckoutScreen({
  items,
  go
}) {
  const [ship, setShip] = React.useState("std");
  const [pay, setPay] = React.useState("fpx");
  const [member, setMember] = React.useState(true);
  const [placed, setPlaced] = React.useState(false);
  const shipSen = (SHIPPING.find(s => s.value === ship) || {}).sen || 0;
  return /*#__PURE__*/React.createElement("main", {
    style: {
      maxWidth: "var(--container-wide)",
      margin: "0 auto",
      padding: "var(--space-8) var(--space-8) var(--space-16)"
    }
  }, /*#__PURE__*/React.createElement("h1", {
    style: {
      font: "var(--type-h2)",
      marginBottom: "var(--space-6)"
    }
  }, "Checkout"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "minmax(0, 1.5fr) minmax(0, 1fr)",
      gap: "var(--space-8)",
      alignItems: "start"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: "var(--space-4)"
    }
  }, /*#__PURE__*/React.createElement(Step, {
    n: "1",
    title: "Contact"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
      gap: "var(--space-4)"
    }
  }, /*#__PURE__*/React.createElement(Field, {
    label: "Email",
    htmlFor: "email",
    required: true,
    hint: "Order updates are sent here."
  }, /*#__PURE__*/React.createElement(Input, {
    id: "email",
    defaultValue: "siti@example.com"
  })), /*#__PURE__*/React.createElement(Field, {
    label: "Phone",
    htmlFor: "phone",
    required: true
  }, /*#__PURE__*/React.createElement(Input, {
    id: "phone",
    defaultValue: "+60 12-345 6789"
  })))), /*#__PURE__*/React.createElement(Step, {
    n: "2",
    title: "Delivery address"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: "var(--space-4)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
      gap: "var(--space-4)"
    }
  }, /*#__PURE__*/React.createElement(Field, {
    label: "Full name",
    htmlFor: "name",
    required: true
  }, /*#__PURE__*/React.createElement(Input, {
    id: "name",
    defaultValue: "Siti Nurhaliza"
  })), /*#__PURE__*/React.createElement(Field, {
    label: "Country",
    htmlFor: "country",
    required: true
  }, /*#__PURE__*/React.createElement(Select, {
    id: "country",
    options: [{
      value: "MY",
      label: "Malaysia"
    }, {
      value: "SG",
      label: "Singapore"
    }, {
      value: "BN",
      label: "Brunei"
    }]
  }))), /*#__PURE__*/React.createElement(Field, {
    label: "Address",
    htmlFor: "addr1",
    required: true
  }, /*#__PURE__*/React.createElement(Input, {
    id: "addr1",
    defaultValue: "19-2, Lorong Mayang Pasir 5"
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
      gap: "var(--space-4)"
    }
  }, /*#__PURE__*/React.createElement(Field, {
    label: "City",
    htmlFor: "city",
    required: true
  }, /*#__PURE__*/React.createElement(Input, {
    id: "city",
    defaultValue: "Bayan Lepas"
  })), /*#__PURE__*/React.createElement(Field, {
    label: "State",
    htmlFor: "state",
    required: true
  }, /*#__PURE__*/React.createElement(Select, {
    id: "state",
    options: [{
      value: "png",
      label: "Pulau Pinang"
    }, {
      value: "kl",
      label: "Kuala Lumpur"
    }, {
      value: "sgr",
      label: "Selangor"
    }, {
      value: "jhr",
      label: "Johor"
    }]
  })), /*#__PURE__*/React.createElement(Field, {
    label: "Postcode",
    htmlFor: "post",
    required: true
  }, /*#__PURE__*/React.createElement(Input, {
    id: "post",
    defaultValue: "11950"
  }))), /*#__PURE__*/React.createElement(Checkbox, {
    label: "Save this address",
    description: "For faster checkout next time.",
    defaultChecked: true
  }))), /*#__PURE__*/React.createElement(Step, {
    n: "3",
    title: "Shipping method"
  }, /*#__PURE__*/React.createElement(RadioGroup, {
    variant: "card",
    options: SHIPPING,
    value: ship,
    onChange: setShip
  }), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: "var(--space-3) 0 0",
      font: "var(--type-caption)",
      color: "var(--text-muted)"
    }
  }, "Items ship from each brand separately \u2014 you may receive more than one parcel at no extra cost.")), /*#__PURE__*/React.createElement(Step, {
    n: "4",
    title: "Payment"
  }, /*#__PURE__*/React.createElement(RadioGroup, {
    variant: "card",
    options: PAYMENT,
    value: pay,
    onChange: setPay
  }), pay === "card" && /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: "var(--space-4)",
      display: "grid",
      gridTemplateColumns: "minmax(0, 2fr) minmax(0, 1fr) minmax(0, 1fr)",
      gap: "var(--space-4)"
    }
  }, /*#__PURE__*/React.createElement(Field, {
    label: "Card number",
    htmlFor: "cc"
  }, /*#__PURE__*/React.createElement(Input, {
    id: "cc",
    placeholder: "4242 4242 4242 4242"
  })), /*#__PURE__*/React.createElement(Field, {
    label: "Expiry",
    htmlFor: "exp"
  }, /*#__PURE__*/React.createElement(Input, {
    id: "exp",
    placeholder: "MM/YY"
  })), /*#__PURE__*/React.createElement(Field, {
    label: "CVC",
    htmlFor: "cvc"
  }, /*#__PURE__*/React.createElement(Input, {
    id: "cvc",
    placeholder: "123"
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: "var(--space-5)",
      padding: "var(--space-4)",
      background: "var(--surface-reward)",
      borderRadius: "var(--radius-control)",
      display: "flex",
      alignItems: "center",
      gap: "var(--space-3)"
    }
  }, /*#__PURE__*/React.createElement(Badge, {
    variant: "reward"
  }, "Member"), /*#__PURE__*/React.createElement(Checkbox, {
    checked: member,
    onChange: setMember,
    label: "Apply my membership discount",
    description: "5% off this order, included with your RM75/yr membership.",
    style: {
      flex: 1,
      minWidth: 0
    }
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: "var(--space-4)"
    }
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "ghost",
    onClick: () => go("/cart")
  }, "Back to cart"), /*#__PURE__*/React.createElement(Button, {
    size: "lg",
    onClick: () => setPlaced(true)
  }, "Place order"))), /*#__PURE__*/React.createElement(Summary, {
    items: items,
    shipSen: shipSen,
    member: member
  })), /*#__PURE__*/React.createElement(Dialog, {
    open: placed,
    title: "Order placed",
    description: "Thank you \u2014 a confirmation is on its way to your email. You can follow each parcel from your account.",
    onClose: () => setPlaced(false),
    footer: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(Button, {
      variant: "ghost",
      onClick: () => setPlaced(false)
    }, "Keep shopping"), /*#__PURE__*/React.createElement(Button, {
      onClick: () => {
        setPlaced(false);
        go("/");
      }
    }, "View orders"))
  }));
}
Object.assign(window, {
  CheckoutScreen
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/buyer_site/CheckoutScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/buyer_site/HomeScreen.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const {
  Button,
  Badge,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  ProductCard,
  BrandCard,
  Icon,
  Wordmark
} = window.BOMYDesignSystem_030168;
const ICONS = "../../assets/icons";
function Hero({
  go
}) {
  return /*#__PURE__*/React.createElement("section", {
    style: {
      background: "var(--red-600)",
      color: "#fff",
      position: "relative",
      overflow: "hidden"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: "var(--container-wide)",
      margin: "0 auto",
      padding: "var(--space-20) var(--space-8)",
      display: "grid",
      gridTemplateColumns: "1.15fr 1fr",
      gap: "var(--space-12)",
      alignItems: "center"
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      font: "var(--type-eyebrow)",
      textTransform: "uppercase",
      letterSpacing: "var(--tracking-widest)",
      color: "var(--gold-300)"
    }
  }, "Brands of Malaysia"), /*#__PURE__*/React.createElement("h1", {
    style: {
      margin: "var(--space-4) 0 0",
      font: "var(--type-display)",
      letterSpacing: "var(--tracking-tighter)",
      color: "#fff"
    }
  }, "The home of authentic Malaysian brands."), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: "var(--space-5) 0 0",
      font: "var(--type-body-lg)",
      color: "var(--red-100)",
      maxWidth: "34rem"
    }
  }, "We bring Malaysia's best-loved makers together under one trusted roof \u2014 for shoppers here and around the world."), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: "var(--space-3)",
      marginTop: "var(--space-8)"
    }
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "reward",
    size: "lg",
    onClick: () => go("/products")
  }, "Shop the marketplace"), /*#__PURE__*/React.createElement(Button, {
    size: "lg",
    variant: "outline",
    style: {
      background: "transparent",
      color: "#fff",
      borderColor: "rgba(255,255,255,.5)"
    },
    onClick: () => go("/brands")
  }, "Meet the brands"))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: "var(--space-3)"
    }
  }, [["gift", "Welcome Gift"], ["sparkles", "Quarterly Goodie Box"], ["truck", "Ships nationwide"], ["globe-alt", "MY & international"]].map(([icon, label]) => /*#__PURE__*/React.createElement("div", {
    key: label,
    style: {
      background: "rgba(255,255,255,.1)",
      borderRadius: "var(--radius-panel)",
      padding: "var(--space-5)",
      display: "flex",
      flexDirection: "column",
      gap: "var(--space-3)"
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: icon,
    size: 24,
    basePath: ICONS,
    style: {
      color: "var(--gold-300)"
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      font: "var(--type-label)",
      color: "#fff"
    }
  }, label))))));
}
function Section({
  title,
  action,
  onAction,
  children
}) {
  return /*#__PURE__*/React.createElement("section", {
    style: {
      maxWidth: "var(--container-wide)",
      margin: "0 auto",
      padding: "var(--space-16) var(--space-8) 0"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "baseline",
      justifyContent: "space-between",
      marginBottom: "var(--space-6)"
    }
  }, /*#__PURE__*/React.createElement("h2", null, title), action && /*#__PURE__*/React.createElement("a", {
    href: "#",
    onClick: e => {
      e.preventDefault();
      onAction();
    },
    style: {
      font: "var(--type-body)"
    }
  }, action)), children);
}
function HomeScreen({
  go
}) {
  const d = window.BOMY_DATA;
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(Hero, {
    go: go
  }), /*#__PURE__*/React.createElement(Section, {
    title: "Fresh from our makers",
    action: "Browse all products",
    onAction: () => go("/products")
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
      gap: "var(--grid-gap)"
    }
  }, d.products.slice(0, 4).map(p => /*#__PURE__*/React.createElement(ProductCard, {
    key: p.id,
    name: p.name,
    storeName: p.store,
    category: p.category,
    price: p.price,
    iconBase: ICONS,
    href: "#"
  })))), /*#__PURE__*/React.createElement(Section, {
    title: "Brands worth knowing",
    action: "See all brands",
    onAction: () => go("/brands")
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
      gap: "var(--grid-gap)"
    }
  }, d.brands.slice(0, 3).map(b => /*#__PURE__*/React.createElement(BrandCard, _extends({
    key: b.slug
  }, b, {
    href: "#"
  }))))), /*#__PURE__*/React.createElement(Section, {
    title: "Why BOMY exists"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
      gap: "var(--grid-gap)"
    }
  }, [["Great products stay hidden.", "Brilliant local makers have the craft but rarely the marketing reach. Without exposure, their best work never finds the people who would love it."], ["Growth is too costly to go it alone.", "Reaching new customers — and breaking into wider markets — takes resources most small brands simply don't have."], ["Stronger together.", "Under one trusted umbrella, Malaysian brands gain the exposure, infrastructure, and audience they couldn't reach alone."]].map(([t, b]) => /*#__PURE__*/React.createElement(Card, {
    key: t
  }, /*#__PURE__*/React.createElement(CardHeader, null, /*#__PURE__*/React.createElement(CardTitle, null, t), /*#__PURE__*/React.createElement(CardDescription, null, b)))))), /*#__PURE__*/React.createElement("section", {
    style: {
      maxWidth: "var(--container-wide)",
      margin: "var(--space-16) auto 0",
      padding: "0 var(--space-8)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      background: "var(--surface-reward)",
      border: "1px solid var(--gold-200)",
      borderRadius: "var(--radius-panel)",
      padding: "var(--space-12)",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: "var(--space-8)"
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(Badge, {
    variant: "reward"
  }, "Platform membership"), /*#__PURE__*/React.createElement("h2", {
    style: {
      marginTop: "var(--space-3)"
    }
  }, "Join the community backing local."), /*#__PURE__*/React.createElement("p", {
    style: {
      marginTop: "var(--space-2)",
      font: "var(--type-body-lg)",
      color: "var(--text-muted)",
      maxWidth: "38rem"
    }
  }, "A Welcome Gift, a quarterly Goodie Box from our brand partners, early access to new drops, and member-only vouchers.")), /*#__PURE__*/React.createElement(Button, {
    variant: "reward",
    size: "lg",
    onClick: () => go("/membership")
  }, "Join for RM75/yr"))));
}
Object.assign(window, {
  HomeScreen
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/buyer_site/HomeScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/buyer_site/MembershipScreen.jsx
try { (() => {
const {
  Button,
  Badge,
  Card,
  CardContent,
  Icon
} = window.BOMYDesignSystem_030168;
const ICONS = "../../assets/icons";
function MembershipScreen() {
  const perks = ["Welcome Gift (dispatched within 14 days of activation)", "Quarterly Goodie Box from BOMY brand partners", "Early access to new brands and limited drops", "Member-only vouchers and exclusive pricing"];
  return /*#__PURE__*/React.createElement("main", {
    style: {
      background: "var(--surface-sunken)",
      minHeight: "100%",
      padding: "var(--space-16) var(--space-4)",
      display: "flex",
      justifyContent: "center"
    }
  }, /*#__PURE__*/React.createElement(Card, {
    style: {
      width: "100%",
      maxWidth: "32rem",
      borderRadius: "var(--radius-2xl)",
      textAlign: "center"
    }
  }, /*#__PURE__*/React.createElement(CardContent, {
    style: {
      padding: "var(--space-10)"
    }
  }, /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      font: "var(--type-eyebrow)",
      textTransform: "uppercase",
      letterSpacing: "var(--tracking-widest)",
      color: "var(--gold-600)"
    }
  }, "#1 Platform Membership"), /*#__PURE__*/React.createElement("h1", {
    style: {
      margin: "var(--space-3) 0 var(--space-2)",
      font: "var(--type-h1)"
    }
  }, "Join BOMY"), /*#__PURE__*/React.createElement("p", {
    style: {
      font: "var(--type-body)",
      color: "var(--text-muted)"
    }
  }, "Annual membership \u2014 shop across all BOMY stores, receive exclusive perks, and unlock a Welcome Gift delivered to your door."), /*#__PURE__*/React.createElement("div", {
    style: {
      margin: "var(--space-8) 0",
      background: "var(--surface-reward)",
      borderRadius: "var(--radius-panel)",
      padding: "var(--space-5) var(--space-6)"
    }
  }, /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      font: "var(--type-display)",
      fontSize: "var(--text-4xl)",
      color: "var(--gold-700)"
    }
  }, "RM75/yr"), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: "var(--space-1) 0 0",
      font: "var(--type-caption)",
      color: "var(--gold-800)"
    }
  }, "billed annually \xB7 cancel anytime")), /*#__PURE__*/React.createElement("ul", {
    style: {
      listStyle: "none",
      padding: 0,
      margin: "0 0 var(--space-8)",
      display: "flex",
      flexDirection: "column",
      gap: "var(--space-2)",
      textAlign: "left"
    }
  }, perks.map(p => /*#__PURE__*/React.createElement("li", {
    key: p,
    style: {
      display: "flex",
      gap: "var(--space-2)",
      font: "var(--type-body)",
      color: "var(--text-muted)"
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "check-circle",
    set: "solid",
    size: 18,
    basePath: ICONS,
    style: {
      color: "var(--gold-500)",
      marginTop: 2
    }
  }), p))), /*#__PURE__*/React.createElement(Button, {
    variant: "reward",
    size: "lg",
    fullWidth: true
  }, "Join now \u2014 RM75/yr"), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: "var(--space-4) 0 0",
      font: "var(--type-caption)",
      color: "var(--text-subtle)"
    }
  }, "Payment processed securely \xB7 MYR"))));
}
Object.assign(window, {
  MembershipScreen
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/buyer_site/MembershipScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/buyer_site/ProductScreen.jsx
try { (() => {
const {
  Button,
  Badge,
  VariantPicker,
  Icon
} = window.BOMYDesignSystem_030168;
const ICONS = "../../assets/icons";
function ProductScreen({
  go,
  addToCart
}) {
  const [img, setImg] = React.useState(0);
  const thumbs = ["var(--sand-200)", "var(--sand-100)", "var(--gold-100)", "var(--red-100)"];
  return /*#__PURE__*/React.createElement("main", {
    style: {
      maxWidth: "var(--container-content)",
      margin: "0 auto",
      padding: "var(--space-8) var(--space-8) var(--space-16)"
    }
  }, /*#__PURE__*/React.createElement("nav", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: "var(--space-2)",
      marginBottom: "var(--space-6)",
      font: "var(--type-body)",
      color: "var(--text-muted)"
    }
  }, /*#__PURE__*/React.createElement("a", {
    href: "#",
    onClick: e => {
      e.preventDefault();
      go("/products");
    }
  }, "Products"), /*#__PURE__*/React.createElement("span", null, "/"), /*#__PURE__*/React.createElement("a", {
    href: "#",
    onClick: e => {
      e.preventDefault();
      go("/brand");
    }
  }, "Ah Huat Roasters"), /*#__PURE__*/React.createElement("span", null, "/"), /*#__PURE__*/React.createElement("span", {
    style: {
      color: "var(--text-heading)"
    }
  }, "Kopi O Kaw Drip Bags")), /*#__PURE__*/React.createElement("article", {
    style: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: "var(--space-8)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: "var(--space-3)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      aspectRatio: "1 / 1",
      borderRadius: "var(--radius-media)",
      background: thumbs[img],
      display: "grid",
      placeItems: "center",
      color: "var(--sand-400)",
      border: "1px solid var(--border-subtle)"
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "photo",
    size: 48,
    basePath: ICONS
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: "var(--space-2)"
    }
  }, thumbs.map((t, i) => /*#__PURE__*/React.createElement("button", {
    key: i,
    type: "button",
    onClick: () => setImg(i),
    style: {
      width: 64,
      height: 64,
      borderRadius: "var(--radius-sm)",
      background: t,
      cursor: "pointer",
      border: "2px solid " + (i === img ? "var(--border-brand)" : "var(--border-subtle)")
    }
  })))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: "var(--space-4)"
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("a", {
    href: "#",
    onClick: e => {
      e.preventDefault();
      go("/brand");
    },
    style: {
      font: "var(--type-eyebrow)",
      textTransform: "uppercase",
      letterSpacing: "var(--tracking-wide)"
    }
  }, "Ah Huat Roasters"), /*#__PURE__*/React.createElement("h1", {
    style: {
      marginTop: "var(--space-1)",
      font: "var(--type-h2)"
    }
  }, "Kopi O Kaw Drip Bags")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: "var(--space-2)"
    }
  }, /*#__PURE__*/React.createElement(Badge, null, "Beverages"), /*#__PURE__*/React.createElement(Badge, {
    variant: "reward"
  }, "Member price")), /*#__PURE__*/React.createElement("p", {
    style: {
      font: "var(--type-body)",
      color: "var(--text-muted)"
    }
  }, "Ten single-serve drip bags of dark-roast Liberica, roasted over wood in Ipoh the same way since 1962. Brews thick, bitter and sweet \u2014 kaw exactly as it should be."), /*#__PURE__*/React.createElement(VariantPicker, {
    variants: [{
      id: "1",
      name: "10 bags",
      price: "RM24.90",
      stockCount: 42
    }, {
      id: "2",
      name: "30 bags",
      price: "RM64.00",
      stockCount: 8
    }, {
      id: "3",
      name: "Gift tin",
      price: "RM88.00",
      stockCount: 0,
      fulfillmentMode: "preorder",
      preorderLeadDays: 14
    }],
    onAdd: addToCart
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: "var(--space-4)",
      paddingTop: "var(--space-2)",
      borderTop: "1px solid var(--border-subtle)",
      color: "var(--text-muted)",
      font: "var(--type-caption)"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 6
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "truck",
    size: 16,
    basePath: ICONS
  }), "Ships from Perak"), /*#__PURE__*/React.createElement("span", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 6
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "building-storefront",
    size: 16,
    basePath: ICONS
  }), "Sold by Ah Huat Roasters")))), /*#__PURE__*/React.createElement("section", {
    style: {
      marginTop: "var(--space-12)",
      maxWidth: "48rem"
    }
  }, /*#__PURE__*/React.createElement("h2", {
    style: {
      font: "var(--type-h3)",
      marginBottom: "var(--space-4)"
    }
  }, "Product Details"), /*#__PURE__*/React.createElement("p", {
    style: {
      font: "var(--type-body)",
      color: "var(--text-muted)"
    }
  }, "Roast: dark. Origin: Liberica, Kampung Kepayang. Each bag holds 12g of coarse-ground beans. Best brewed with 150ml water just off the boil. Store sealed, away from sunlight.")));
}
Object.assign(window, {
  ProductScreen
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/buyer_site/ProductScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/buyer_site/ProductsScreen.jsx
try { (() => {
const {
  Button,
  Input,
  CategoryList,
  Pagination,
  ProductCard,
  Icon
} = window.BOMYDesignSystem_030168;
const ICONS = "../../assets/icons";
function ProductsScreen({
  go,
  addToCart
}) {
  const d = window.BOMY_DATA;
  const [cat, setCat] = React.useState("");
  const [q, setQ] = React.useState("");
  const [page, setPage] = React.useState(1);
  const catLabel = (d.categories.find(c => c.value === cat) || {}).label;
  const list = d.products.filter(p => (!cat || p.category === catLabel) && p.name.toLowerCase().includes(q.toLowerCase()));
  return /*#__PURE__*/React.createElement("main", {
    style: {
      maxWidth: "var(--container-wide)",
      margin: "0 auto",
      padding: "var(--space-8) var(--space-8) var(--space-16)"
    }
  }, /*#__PURE__*/React.createElement("h1", {
    style: {
      marginBottom: "var(--space-6)",
      font: "var(--type-h2)"
    }
  }, "Products"), /*#__PURE__*/React.createElement("form", {
    onSubmit: e => e.preventDefault(),
    style: {
      display: "flex",
      gap: "var(--space-2)",
      marginBottom: "var(--space-6)"
    }
  }, /*#__PURE__*/React.createElement(Input, {
    value: q,
    onChange: e => setQ(e.target.value),
    placeholder: "Search products\u2026",
    style: {
      flex: 1
    }
  }), /*#__PURE__*/React.createElement(Button, {
    type: "submit"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "magnifying-glass",
    size: 16,
    basePath: ICONS
  }), "Search"), q && /*#__PURE__*/React.createElement(Button, {
    variant: "outline",
    onClick: () => setQ("")
  }, "Clear")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: "var(--space-6)",
      alignItems: "flex-start"
    }
  }, /*#__PURE__*/React.createElement("aside", {
    style: {
      width: "11rem",
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement(CategoryList, {
    items: d.categories,
    active: cat,
    onChange: setCat
  })), /*#__PURE__*/React.createElement("section", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("p", {
    style: {
      marginBottom: "var(--space-4)",
      font: "var(--type-body)",
      color: "var(--text-muted)"
    }
  }, list.length, " product", list.length === 1 ? "" : "s", q ? ` for "${q}"` : ""), list.length === 0 ? /*#__PURE__*/React.createElement("div", {
    style: {
      border: "1px dashed var(--border-default)",
      borderRadius: "var(--radius-panel)",
      padding: "var(--space-20) 0",
      textAlign: "center",
      color: "var(--text-muted)"
    }
  }, "No products found.") : /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
      gap: "var(--grid-gap)"
    }
  }, list.map(p => /*#__PURE__*/React.createElement("div", {
    key: p.id,
    onClick: () => go("/product"),
    style: {
      cursor: "pointer"
    }
  }, /*#__PURE__*/React.createElement(ProductCard, {
    name: p.name,
    storeName: p.store,
    category: p.category,
    price: p.price,
    iconBase: ICONS,
    href: "#"
  })))), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: "var(--space-8)"
    }
  }, /*#__PURE__*/React.createElement(Pagination, {
    page: page,
    totalPages: 6,
    onChange: setPage
  })))));
}
Object.assign(window, {
  ProductsScreen
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/buyer_site/ProductsScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/buyer_site/data.js
try { (() => {
window.BOMY_DATA = {
  categories: [{
    value: "",
    label: "All"
  }, {
    value: "fnb",
    label: "Food & Beverage"
  }, {
    value: "beauty",
    label: "Beauty"
  }, {
    value: "home",
    label: "Home & Living"
  }, {
    value: "sports",
    label: "Sports"
  }, {
    value: "auto",
    label: "Motor & Auto"
  }],
  products: [{
    id: "p1",
    name: "Kopi O Kaw Drip Bags",
    store: "Ah Huat Roasters",
    storeSlug: "ah-huat-roasters",
    category: "Food & Beverage",
    price: "from RM24.90",
    tone: "var(--sand-200)"
  }, {
    id: "p2",
    name: "Pandan Kaya Spread 220g",
    store: "Nyonya Pantry",
    storeSlug: "nyonya-pantry",
    category: "Food & Beverage",
    price: "from RM18.00",
    tone: "var(--success-100)"
  }, {
    id: "p3",
    name: "Bunga Raya Body Oil",
    store: "Selasih Skin",
    storeSlug: "selasih-skin",
    category: "Beauty",
    price: "from RM68.00",
    tone: "var(--red-100)"
  }, {
    id: "p4",
    name: "Songket Weave Cushion",
    store: "Rumah Tenun",
    storeSlug: "rumah-tenun",
    category: "Home & Living",
    price: "from RM95.00",
    tone: "var(--gold-100)"
  }, {
    id: "p5",
    name: "Sambal Hijau Chilli Paste",
    store: "Nyonya Pantry",
    storeSlug: "nyonya-pantry",
    category: "Food & Beverage",
    price: "from RM15.50",
    tone: "var(--success-100)"
  }, {
    id: "p6",
    name: "Pewter Tea Caddy",
    store: "Timah Works",
    storeSlug: "timah-works",
    category: "Home & Living",
    price: "from RM180.00",
    tone: "var(--navy-100)"
  }, {
    id: "p7",
    name: "Kelapa Cold-Press Shampoo",
    store: "Selasih Skin",
    storeSlug: "selasih-skin",
    category: "Beauty",
    price: "from RM42.00",
    tone: "var(--red-100)"
  }, {
    id: "p8",
    name: "Batik Trail Running Cap",
    store: "Jalur Athletics",
    storeSlug: "jalur-athletics",
    category: "Sports",
    price: "from RM89.00",
    tone: "var(--gold-100)"
  }],
  brands: [{
    name: "Ah Huat Roasters",
    slug: "ah-huat-roasters",
    excerpt: "Third-generation kopi roasters from Ipoh, still roasting over wood.",
    categories: ["Food & Beverage"],
    productCount: 18
  }, {
    name: "Nyonya Pantry",
    slug: "nyonya-pantry",
    excerpt: "Peranakan pantry staples cooked in small batches in Melaka.",
    categories: ["Food & Beverage"],
    productCount: 24
  }, {
    name: "Selasih Skin",
    slug: "selasih-skin",
    excerpt: "Botanical skincare made with Malaysian coconut, rice and hibiscus.",
    categories: ["Beauty"],
    productCount: 12
  }, {
    name: "Rumah Tenun",
    slug: "rumah-tenun",
    excerpt: "Handwoven songket homeware from Terengganu weaving families.",
    categories: ["Home & Living"],
    productCount: 9
  }, {
    name: "Timah Works",
    slug: "timah-works",
    excerpt: "Pewter craft from Kuala Lumpur, finished entirely by hand.",
    categories: ["Home & Living"],
    productCount: 15
  }, {
    name: "Jalur Athletics",
    slug: "jalur-athletics",
    excerpt: "Technical running gear designed for the Malaysian heat.",
    categories: ["Sports"],
    productCount: 21
  }]
};
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/buyer_site/data.js", error: String((e && e.message) || e) }); }

// ui_kits/seller_dashboard/OrdersScreen.jsx
try { (() => {
const {
  Button,
  Card,
  FilterPills,
  StatusPill
} = window.BOMYDesignSystem_030168;
const ORDERS = [{
  id: "ord_4d81a2f7",
  status: "processing",
  payout: "RM186.75",
  date: "31/07/2026"
}, {
  id: "ord_9c02be14",
  status: "shipped",
  payout: "RM64.00",
  date: "30/07/2026"
}, {
  id: "ord_1f77ca20",
  status: "delivered",
  payout: "RM248.20",
  date: "28/07/2026"
}, {
  id: "ord_77b3e0a9",
  status: "completed",
  payout: "RM52.10",
  date: "24/07/2026"
}, {
  id: "ord_08cd51be",
  status: "cancelled",
  payout: "RM0.00",
  date: "22/07/2026"
}];
function SellerOrdersScreen() {
  const [status, setStatus] = React.useState("");
  const rows = ORDERS.filter(o => !status || o.status === status);
  return /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "var(--space-8)"
    }
  }, /*#__PURE__*/React.createElement("h1", {
    style: {
      font: "var(--type-h3)",
      marginBottom: "var(--space-6)"
    }
  }, "Orders"), /*#__PURE__*/React.createElement("div", {
    style: {
      marginBottom: "var(--space-6)"
    }
  }, /*#__PURE__*/React.createElement(FilterPills, {
    items: [{
      value: "",
      label: "All"
    }, ...["processing", "shipped", "delivered", "completed", "cancelled"].map(s => ({
      value: s,
      label: s
    }))],
    active: status,
    onChange: setStatus
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: "var(--space-3)"
    }
  }, rows.map(o => /*#__PURE__*/React.createElement(Card, {
    key: o.id,
    style: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "var(--space-4) var(--space-6)"
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      font: "var(--type-mono)",
      color: "var(--text-muted)"
    }
  }, o.id, "\u2026"), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: "var(--space-1)"
    }
  }, /*#__PURE__*/React.createElement(StatusPill, {
    status: o.status
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: "right"
    }
  }, /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      font: "var(--type-label)",
      fontWeight: "var(--weight-bold)",
      color: "var(--text-heading)"
    }
  }, o.payout), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      font: "var(--type-caption)",
      color: "var(--text-muted)"
    }
  }, o.date)), /*#__PURE__*/React.createElement(Button, {
    variant: "link",
    style: {
      marginLeft: "var(--space-6)"
    }
  }, "View")))));
}
Object.assign(window, {
  SellerOrdersScreen
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/seller_dashboard/OrdersScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/seller_dashboard/OverviewScreen.jsx
try { (() => {
const {
  Button,
  Card,
  StatusPill,
  Icon,
  Badge
} = window.BOMYDesignSystem_030168;
const ICONS = "../../assets/icons";
function Stat({
  icon,
  label,
  value,
  hint
}) {
  return /*#__PURE__*/React.createElement(Card, {
    style: {
      padding: "var(--space-6)",
      display: "flex",
      flexDirection: "column",
      gap: "var(--space-2)"
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: icon,
    size: 20,
    basePath: ICONS,
    style: {
      color: "var(--text-muted)"
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      font: "var(--type-caption)",
      color: "var(--text-muted)"
    }
  }, label), /*#__PURE__*/React.createElement("span", {
    style: {
      font: "var(--type-price)",
      color: "var(--text-heading)"
    }
  }, value), hint && /*#__PURE__*/React.createElement("span", {
    style: {
      font: "var(--type-caption)",
      color: "var(--text-subtle)"
    }
  }, hint));
}
function OverviewScreen({
  go
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "var(--space-8)",
      display: "flex",
      flexDirection: "column",
      gap: "var(--space-6)"
    }
  }, /*#__PURE__*/React.createElement(Card, {
    style: {
      padding: "var(--space-6)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "flex-start",
      justifyContent: "space-between"
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h1", {
    style: {
      font: "var(--type-h3)"
    }
  }, "Ah Huat Roasters"), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: "2px 0 0",
      font: "var(--type-mono)",
      color: "var(--text-muted)"
    }
  }, "/ah-huat-roasters"), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: "var(--space-2) 0 0",
      font: "var(--type-body)",
      color: "var(--text-muted)"
    }
  }, "Store ID ", /*#__PURE__*/React.createElement("span", {
    style: {
      font: "var(--type-mono)"
    }
  }, "str_8f2a1c94\u2026"))), /*#__PURE__*/React.createElement(StatusPill, {
    status: "active"
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
      gap: "var(--grid-gap)"
    }
  }, /*#__PURE__*/React.createElement(Stat, {
    icon: "banknotes",
    label: "Payout this month",
    value: "RM4,182.50",
    hint: "net of 25% commission"
  }), /*#__PURE__*/React.createElement(Stat, {
    icon: "clipboard-document-list",
    label: "Orders to fulfil",
    value: "7",
    hint: "3 awaiting tracking"
  }), /*#__PURE__*/React.createElement(Stat, {
    icon: "shopping-bag",
    label: "Live products",
    value: "18",
    hint: "2 drafts"
  }), /*#__PURE__*/React.createElement(Stat, {
    icon: "sparkles",
    label: "Brand subscribers",
    value: "126",
    hint: "+9 this month"
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: "var(--grid-gap)"
    }
  }, /*#__PURE__*/React.createElement(Card, {
    style: {
      padding: "var(--space-6)",
      display: "flex",
      flexDirection: "column",
      gap: "var(--space-4)"
    }
  }, /*#__PURE__*/React.createElement("h2", {
    style: {
      font: "var(--type-h3)"
    }
  }, "Next steps"), [["Add tracking to 3 shipped orders", "orders"], ["Publish 2 draft products", "products"]].map(([t, r]) => /*#__PURE__*/React.createElement("div", {
    key: t,
    style: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: "var(--space-4)"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      font: "var(--type-body)",
      color: "var(--text-body)"
    }
  }, t), /*#__PURE__*/React.createElement(Button, {
    variant: "outline",
    size: "sm",
    onClick: () => go("/seller/dashboard/" + r)
  }, "Open")))), /*#__PURE__*/React.createElement(Card, {
    style: {
      padding: "var(--space-6)",
      display: "flex",
      flexDirection: "column",
      gap: "var(--space-3)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: "var(--space-2)"
    }
  }, /*#__PURE__*/React.createElement(Badge, {
    variant: "reward"
  }, "Brand subscriptions")), /*#__PURE__*/React.createElement("p", {
    style: {
      font: "var(--type-body)",
      color: "var(--text-muted)"
    }
  }, "You keep 90% of every brand subscription. Gift avatar items to subscribers to keep renewal rates up."), /*#__PURE__*/React.createElement(Button, {
    variant: "secondary",
    size: "sm",
    style: {
      alignSelf: "flex-start"
    },
    onClick: () => go("/seller/dashboard/subscriptions")
  }, "Manage tiers"))));
}
Object.assign(window, {
  OverviewScreen
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/seller_dashboard/OverviewScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/seller_dashboard/SellerProductsScreen.jsx
try { (() => {
const {
  Button,
  Card,
  FilterPills,
  StatusPill,
  Icon
} = window.BOMYDesignSystem_030168;
const ICONS = "../../assets/icons";
const ROWS = [{
  name: "Kopi O Kaw Drip Bags",
  slug: "kopi-o-kaw-drip-bags",
  status: "active",
  created: "12/03/2026"
}, {
  name: "Kopi Cham Blend 500g",
  slug: "kopi-cham-blend-500g",
  status: "active",
  created: "02/03/2026"
}, {
  name: "White Coffee Sachets",
  slug: "white-coffee-sachets",
  status: "draft",
  created: "28/02/2026"
}, {
  name: "Roaster's Gift Tin",
  slug: "roasters-gift-tin",
  status: "draft",
  created: "21/02/2026"
}, {
  name: "Kopi Kaw Cold Brew (2025)",
  slug: "kopi-kaw-cold-brew-2025",
  status: "archived",
  created: "04/11/2025"
}];
function SellerProductsScreen() {
  const [status, setStatus] = React.useState("");
  const rows = ROWS.filter(r => !status || r.status === status);
  return /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "var(--space-8)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: "var(--space-6)"
    }
  }, /*#__PURE__*/React.createElement("h1", {
    style: {
      font: "var(--type-h3)"
    }
  }, "Products"), /*#__PURE__*/React.createElement(Button, null, /*#__PURE__*/React.createElement(Icon, {
    name: "plus",
    size: 16,
    basePath: ICONS
  }), "New Product")), /*#__PURE__*/React.createElement("div", {
    style: {
      marginBottom: "var(--space-4)"
    }
  }, /*#__PURE__*/React.createElement(FilterPills, {
    items: [{
      value: "",
      label: "All"
    }, {
      value: "draft",
      label: "Draft"
    }, {
      value: "active",
      label: "Active"
    }, {
      value: "archived",
      label: "Archived"
    }],
    active: status,
    onChange: setStatus
  })), /*#__PURE__*/React.createElement(Card, {
    style: {
      overflow: "hidden"
    }
  }, /*#__PURE__*/React.createElement("table", {
    style: {
      width: "100%",
      borderCollapse: "collapse",
      font: "var(--type-body)"
    }
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", {
    style: {
      background: "var(--surface-sunken)",
      borderBottom: "1px solid var(--border-subtle)"
    }
  }, ["Product", "Slug", "Status", "Created", ""].map(h => /*#__PURE__*/React.createElement("th", {
    key: h,
    style: {
      textAlign: "left",
      padding: "var(--space-3) var(--space-5)",
      font: "var(--type-eyebrow)",
      textTransform: "uppercase",
      letterSpacing: "var(--tracking-wide)",
      color: "var(--text-muted)"
    }
  }, h)))), /*#__PURE__*/React.createElement("tbody", null, rows.map(r => /*#__PURE__*/React.createElement("tr", {
    key: r.slug,
    style: {
      borderBottom: "1px solid var(--border-subtle)"
    }
  }, /*#__PURE__*/React.createElement("td", {
    style: {
      padding: "var(--space-3) var(--space-5)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: "var(--space-3)"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 32,
      height: 32,
      borderRadius: "var(--radius-xs)",
      background: "var(--surface-sunken)",
      display: "grid",
      placeItems: "center",
      color: "var(--sand-400)"
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "photo",
    size: 16,
    basePath: ICONS
  })), /*#__PURE__*/React.createElement("span", {
    style: {
      font: "var(--type-label)",
      color: "var(--text-heading)"
    }
  }, r.name))), /*#__PURE__*/React.createElement("td", {
    style: {
      padding: "var(--space-3) var(--space-5)",
      font: "var(--type-mono)",
      color: "var(--text-muted)"
    }
  }, r.slug), /*#__PURE__*/React.createElement("td", {
    style: {
      padding: "var(--space-3) var(--space-5)"
    }
  }, /*#__PURE__*/React.createElement(StatusPill, {
    status: r.status
  })), /*#__PURE__*/React.createElement("td", {
    style: {
      padding: "var(--space-3) var(--space-5)",
      color: "var(--text-muted)"
    }
  }, r.created), /*#__PURE__*/React.createElement("td", {
    style: {
      padding: "var(--space-3) var(--space-5)"
    }
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "link",
    style: {
      fontSize: "var(--text-xs)"
    }
  }, "Edit"))))))));
}
Object.assign(window, {
  SellerProductsScreen
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/seller_dashboard/SellerProductsScreen.jsx", error: String((e && e.message) || e) }); }

__ds_ns.BrandCard = __ds_scope.BrandCard;

__ds_ns.CartLineItem = __ds_scope.CartLineItem;

__ds_ns.ProductCard = __ds_scope.ProductCard;

__ds_ns.StatusPill = __ds_scope.StatusPill;

__ds_ns.StockStatus = __ds_scope.StockStatus;

__ds_ns.VariantPicker = __ds_scope.VariantPicker;

__ds_ns.Badge = __ds_scope.Badge;

__ds_ns.Button = __ds_scope.Button;

__ds_ns.Card = __ds_scope.Card;

__ds_ns.CardHeader = __ds_scope.CardHeader;

__ds_ns.CardTitle = __ds_scope.CardTitle;

__ds_ns.CardDescription = __ds_scope.CardDescription;

__ds_ns.CardContent = __ds_scope.CardContent;

__ds_ns.CardFooter = __ds_scope.CardFooter;

__ds_ns.Icon = __ds_scope.Icon;

__ds_ns.Input = __ds_scope.Input;

__ds_ns.Label = __ds_scope.Label;

__ds_ns.Textarea = __ds_scope.Textarea;

__ds_ns.DataTable = __ds_scope.DataTable;

__ds_ns.Dialog = __ds_scope.Dialog;

__ds_ns.EmptyState = __ds_scope.EmptyState;

__ds_ns.Toast = __ds_scope.Toast;

__ds_ns.Checkbox = __ds_scope.Checkbox;

__ds_ns.Field = __ds_scope.Field;

__ds_ns.RadioGroup = __ds_scope.RadioGroup;

__ds_ns.Select = __ds_scope.Select;

__ds_ns.Switch = __ds_scope.Switch;

__ds_ns.CategoryList = __ds_scope.CategoryList;

__ds_ns.FilterPills = __ds_scope.FilterPills;

__ds_ns.Footer = __ds_scope.Footer;

__ds_ns.NavBar = __ds_scope.NavBar;

__ds_ns.Pagination = __ds_scope.Pagination;

__ds_ns.SellerSidebar = __ds_scope.SellerSidebar;

__ds_ns.Tabs = __ds_scope.Tabs;

__ds_ns.Wordmark = __ds_scope.Wordmark;

})();
