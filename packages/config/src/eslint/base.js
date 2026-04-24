import js from "@eslint/js"
import tseslint from "typescript-eslint"
import prettierConfig from "eslint-config-prettier"

/**
 * Base ESLint config for all BOMY packages.
 * Extend this in each app/package's eslint.config.js.
 */
export const base = tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  prettierConfig,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
      },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "inline-type-imports" },
      ],
      "@typescript-eslint/no-import-type-side-effects": "error",
    },
  },
)
