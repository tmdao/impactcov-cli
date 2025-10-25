// Flat ESLint config for ESLint v9+
// Minimal, TypeScript-aware, and lenient for a CLI project.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default [
  {
    ignores: ['dist/**', 'node_modules/**', 'eslint.config.js'],
  },
  js.configs.recommended,
  // Type-aware rules; we'll selectively relax noisy ones below
  ...tseslint.configs.recommendedTypeChecked,
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        project: ['./tsconfig.json'],
        tsconfigRootDir: import.meta.dirname,
        ecmaVersion: 2020,
        sourceType: 'module',
      },
    },
    plugins: {
      'typescript-eslint': tseslint.plugin,
    },
    rules: {
      // Allow console for CLI output
      'no-console': 'off',
      // Enforce safe promise handling
      '@typescript-eslint/no-floating-promises': 'error',
  // Keep initial adoption low-noise: set unsafe rules to warn initially
  '@typescript-eslint/no-unsafe-assignment': 'warn',
  '@typescript-eslint/no-unsafe-call': 'warn',
  '@typescript-eslint/no-unsafe-member-access': 'warn',
  '@typescript-eslint/no-unsafe-return': 'warn',
  '@typescript-eslint/no-unsafe-argument': 'warn',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-redundant-type-constituents': 'off',
    },
  },
  // Disable formatting-related ESLint rules to avoid conflict with Prettier
  prettier,
];
