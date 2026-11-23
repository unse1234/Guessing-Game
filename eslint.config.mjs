import js from '@eslint/js';
import nextVitals from 'eslint-config-next/core-web-vitals';
import tseslint from 'typescript-eslint';

export default [
  {
    ignores: [
      '**/.next/**',
      '**/dist/**',
      '**/out/**',
      '**/coverage/**',
      '**/node_modules/**',
      '**/next-env.d.ts',
      '.husky/_/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...nextVitals.map((config) =>
    config.ignores
      ? config
      : { ...config, files: ['apps/web/**/*.{js,jsx,ts,tsx}'] },
  ),
  {
    files: ['apps/web/**/*.{js,jsx,ts,tsx}'],
    settings: { next: { rootDir: 'apps/web/' } },
  },
];
