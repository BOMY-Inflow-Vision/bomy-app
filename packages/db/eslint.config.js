import { node } from "@bomy/config/eslint"
import tseslint from "typescript-eslint"

export default tseslint.config(...node, {
  ignores: ["node_modules/**", "dist/**", "scripts/migrate.mjs"],
})
