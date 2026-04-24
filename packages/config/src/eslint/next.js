import { base } from "./base.js"
import tseslint from "typescript-eslint"

/**
 * ESLint config for Next.js apps (apps/web, apps/admin).
 */
export const next = tseslint.config(...base, {
  rules: {
    "@typescript-eslint/no-misused-promises": [
      "error",
      { checksVoidReturn: { attributes: false } },
    ],
  },
})
