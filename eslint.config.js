import security from "eslint-plugin-security";

const browserGlobals = {
  window: "readonly",
  document: "readonly",
  navigator: "readonly",
  localStorage: "readonly",
  sessionStorage: "readonly",
  performance: "readonly",
  requestAnimationFrame: "readonly",
  supabase: "readonly",
  MPP_CONFIG: "readonly",
  MPPLogger: "readonly",
  MPPSession: "readonly"
};

export default [
  {
    ignores: ["node_modules/**", "site-dist/**", "playwright-report/**", "test-results/**", "supabase/functions/**"]
  },
  {
    files: ["app.js", "supabase.js", "js/**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "script",
      globals: browserGlobals
    },
    plugins: { security },
    rules: {
      "no-debugger": "error",
      "no-eval": "error",
      "no-implied-eval": "error",
      "no-new-func": "error",
      "no-alert": "error",
      "no-unused-vars": ["error", { "argsIgnorePattern": "^_", "caughtErrorsIgnorePattern": "^_", "varsIgnorePattern": "^(?:_|apiSupabase)$" }],
      "security/detect-eval-with-expression": "error"
    }
  },
  {
    files: ["scripts/**/*.mjs", "tests/**/*.mjs", "playwright.config.js"],
    languageOptions: { ecmaVersion: 2022, sourceType: "module" },
    plugins: { security },
    rules: {
      "no-debugger": "error",
      "no-eval": "error",
      "no-implied-eval": "error",
      "no-new-func": "error",
      "no-unused-vars": ["error", { "argsIgnorePattern": "^_", "caughtErrorsIgnorePattern": "^_", "varsIgnorePattern": "^_" }]
    }
  }
];
