/**
 * Matches the existing style: single quotes, 2-space indent, trailing commas, 120 columns.
 * pipeline/ and packages/progress/ are written with 4-space indent and keep it.
 * Chosen by measurement (IAN-601): this set flags the fewest files in `prettier --check .`.
 * Format only the files you touch; see README.md.
 * @type {import('prettier').Config}
 */
const config = {
  singleQuote: true,
  tabWidth: 2,
  trailingComma: 'all',
  printWidth: 120,
  overrides: [
    {
      files: ['pipeline/**', 'packages/progress/**'],
      options: { tabWidth: 4 },
    },
  ],
};

export default config;
