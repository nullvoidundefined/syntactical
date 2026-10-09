// Every track in the shipped manifest must declare a category, or the home screen
// would drop it into the "More" group.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const CATEGORIES = ['frontend', 'backend', 'database'];

describe('shipped content manifest categories', () => {
  const manifest = JSON.parse(readFileSync(join(__dirname, '..', '..', 'content', 'manifest.json'), 'utf8')) as {
    languages: { id: string; category?: unknown }[];
  };

  it('gives every entry a known category', () => {
    const missing = manifest.languages.filter((entry) => !CATEGORIES.includes(entry.category as string));
    expect(missing.map((entry) => entry.id)).toEqual([]);
  });

  it('assigns the expected category to each current track', () => {
    const byId = Object.fromEntries(manifest.languages.map((entry) => [entry.id, entry.category]));
    expect(byId).toMatchObject({
      javascript: 'frontend',
      'frontend-security': 'frontend',
      python: 'backend',
      go: 'backend',
      ruby: 'backend',
      rails: 'backend',
      'backend-security': 'backend',
      postgres: 'database',
      sql: 'database',
    });
  });
});
