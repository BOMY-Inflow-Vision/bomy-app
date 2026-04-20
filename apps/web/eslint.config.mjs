import { next } from "@bomy/config/eslint"
import tseslint from "typescript-eslint"

export default tseslint.config(...next, {
  ignores: [".next/**", "node_modules/**", "next-env.d.ts"],
})
