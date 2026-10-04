/**
 * Matches the existing style: single quotes, 4-space indent, trailing commas, 100 columns.
 * JSON, YAML and Markdown keep 2-space indent, as package.json and the docs already use.
 * Format only the files you touch; see README.md.
 * @type {import('prettier').Config}
 */
const config = {
    singleQuote: true,
    tabWidth: 4,
    trailingComma: 'all',
    printWidth: 100,
    overrides: [
        {
            files: ['*.json', '*.yml', '*.yaml', '*.md'],
            options: { tabWidth: 2 },
        },
    ],
};

export default config;
