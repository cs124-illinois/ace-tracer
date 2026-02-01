// @ts-check

import eslint from "@eslint/js"
import eslintConfigPrettier from "eslint-config-prettier"
import tseslint from "typescript-eslint"

export default [
  { ignores: ["**/dist/", "**/node_modules/", "**/.next/", "**/.turbo/", "**/out/"] },
  ...tseslint.config(eslint.configs.recommended, ...tseslint.configs.recommended, {
    rules: {
      "@typescript-eslint/no-namespace": "off",
      "@typescript-eslint/no-unused-expressions": "off",
      "@typescript-eslint/no-unused-vars": ["error", { caughtErrors: "none" }],
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/prefer-namespace-keyword": "off",
      "no-empty": "off",
    },
  }),
  eslintConfigPrettier,
]
