import coreWebVitals from 'eslint-config-next/core-web-vitals';
import tseslint from 'typescript-eslint';

/** @type {import('eslint').Linter.Config[]} */
export default [
  ...coreWebVitals,
  {
    plugins: {
      '@typescript-eslint': tseslint.plugin,
    },
    rules: {
      'react-hooks/exhaustive-deps': 'warn',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
    },
  },
];
