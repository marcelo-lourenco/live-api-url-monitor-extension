import globals from 'globals';
import tseslint from 'typescript-eslint';
import js from '@eslint/js';
import prettierConfig from 'eslint-config-prettier';

export default tseslint.config(
  // Global ignores for files that should never be linted.
  {
    ignores: ['node_modules/', 'dist/', 'out/'],
  },

  // Base recommended configs applied to all linted files.
  js.configs.recommended,
  ...tseslint.configs.recommended,

  // Configuration for the main extension source code.
  // It uses tsconfig.json and targets a Node.js environment.
  {
    files: ['src/**/*.ts'],
    ignores: ['src/views/webview/**/*.ts'], // Exclude webview files from this config block.
    languageOptions: {
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir: import.meta.dirname,
      },
      globals: {
        ...globals.node,
        ...globals.es2021, // Replaces env: { node: true, es6: true }
      },
    },
    rules: {
      // Your custom rules from .eslintrc.json
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
        },
      ],
      'no-console': [
        'warn',
        {
          allow: ['warn', 'error'],
        },
      ],
    },
  },

  // Configuration specifically for the webview TypeScript files.
  // It uses tsconfig.webview.json and targets a browser environment.
  {
    files: ['src/views/webview/**/*.ts'],
    languageOptions: {
      parserOptions: {
        project: './tsconfig.webview.json',
        tsconfigRootDir: import.meta.dirname,
      },
      globals: {
        ...globals.browser, // Webviews run in a browser-like context.
      },
    },
    // No specific rules were in the old config for webviews, so this is clean.
  },

  // Override for the Webpack config file.
  // Note that we target the new .cjs extension.
  {
    files: ['webpack.config.cjs'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
    rules: {
      '@typescript-eslint/no-var-requires': 'off',
    },
  },

  // Prettier config must be last to override other formatting rules.
  prettierConfig
);