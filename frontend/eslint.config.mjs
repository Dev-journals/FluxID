import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    rules: {
      // The set-state-in-effect rule (react-hooks v6) flags legitimate
      // state-sync-from-effect patterns used across the app; keep it off.
      "react-hooks/set-state-in-effect": "off",
    },
  },
]);

export default eslintConfig;
