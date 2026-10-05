import { resolveBankUrl } from '../resolveBankUrl';

const CONTENT_BASE_URL = 'https://syntactical.dev/content/';

describe('resolveBankUrl', () => {
  it.each([
    ['python/easy.json', `${CONTENT_BASE_URL}python/easy.json`],
    ['sql/hard.json', `${CONTENT_BASE_URL}sql/hard.json`],
    ['type-script/medium-2.json', `${CONTENT_BASE_URL}type-script/medium-2.json`],
    ['nested/deeper/bank.json', `${CONTENT_BASE_URL}nested/deeper/bank.json`],
    ['easy.json', `${CONTENT_BASE_URL}easy.json`],
  ])('resolves the safe relative path %p under the content base URL', (path, expectedUrl) => {
    expect(resolveBankUrl(path, CONTENT_BASE_URL)).toBe(expectedUrl);
  });

  it.each([
    ['the empty string', ''],
    ['a parent traversal', '../easy.json'],
    ['a nested parent traversal', 'python/../../secrets.json'],
    ['a current-directory segment', './python/easy.json'],
    ['a percent-encoded traversal', '%2e%2e/easy.json'],
    ['a nested percent-encoded traversal', 'python/%2E%2E/%2E%2E/easy.json'],
    ['a percent-encoded slash', 'python%2feasy.json'],
    ['a backslash separator', 'python\\easy.json'],
    ['a backslash traversal', '..\\..\\easy.json'],
    ['a leading slash', '/python/easy.json'],
    ['a root-relative path outside the base', '/other/easy.json'],
    ['an absolute https URL on another origin', 'https://evil.example/python/easy.json'],
    ['an absolute URL on the same origin', 'https://syntactical.dev/content/python/easy.json'],
    ['a protocol-relative URL', '//evil.example/python/easy.json'],
    ['a javascript: scheme', 'javascript:alert(1).json'],
    ['a data: scheme', 'data:application/json,{}.json'],
    ['a non-json extension', 'python/easy.txt'],
    ['no extension', 'python/easy'],
    ['an uppercase extension', 'python/easy.JSON'],
    ['an uppercase segment', 'Python/easy.json'],
    ['an underscore in a segment', 'python/easy_1.json'],
    ['an empty segment', 'python//easy.json'],
    ['a trailing slash', 'python/'],
    ['a query string', 'python/easy.json?v=1'],
    ['a fragment', 'python/easy.json#top'],
    ['surrounding whitespace', ' python/easy.json'],
    ['a bare extension', '.json'],
  ])('returns null for %s', (_description, path) => {
    expect(resolveBankUrl(path, CONTENT_BASE_URL)).toBeNull();
  });
});
