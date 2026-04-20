import { base } from "@bomy/config/eslint"
import tseslint from "typescript-eslint"

export default tseslint.config(...base, {
  ignores: [
    "node_modules/**",
    "**/node_modules/**",
    "**/dist/**",
    "**/.next/**",
    "**/coverage/**",
    "**/build/**",
    ".turbo/**",
    "infra/**",
  ],
})
