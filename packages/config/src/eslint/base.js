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
        projectService: {
          // Allow config files (eslint.config.js, postcss.config.mjs, etc.)
          // that are not part of any tsconfig project to be linted with defaults.
          // Patterns are relative to the workspace root.
          allowDefaultProject: ["apps/*/eslint.config.js", "packages/*/eslint.config.js"],
        },
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
