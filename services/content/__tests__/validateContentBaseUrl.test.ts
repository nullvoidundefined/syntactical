import { validateContentBaseUrl } from '../validateContentBaseUrl';

const PRODUCTION_CONTENT_URL = 'https://nullvoidundefined.github.io/syntactical/content/';
const PREVIEW_CONTENT_URL = 'https://nullvoidundefined.github.io/syntactical/preview/content/';

describe('validateContentBaseUrl', () => {
    it.each([PRODUCTION_CONTENT_URL, PREVIEW_CONTENT_URL])('returns %s unchanged', (contentBaseUrl) => {
        expect(validateContentBaseUrl(contentBaseUrl)).toBe(contentBaseUrl);
    });

    it.each([
        ['undefined', undefined],
        ['null', null],
        ['an empty string', ''],
        ['a number', 42],
        ['a string that is not a URL', 'not a url'],
        ['the content path over http', 'http://nullvoidundefined.github.io/syntactical/content/'],
        ['another origin', 'https://evil.example/syntactical/content/'],
        ['a host that only starts with the owner host', 'https://nullvoidundefined.github.io.evil.example/syntactical/content/'],
        ['another path on the owner host', 'https://nullvoidundefined.github.io/other/content/'],
        ['the content path without its trailing slash', 'https://nullvoidundefined.github.io/syntactical/content'],
        ['the content path with credentials', 'https://user@nullvoidundefined.github.io/syntactical/content/'],
    ])('returns null for %s', (_label, value) => {
        expect(validateContentBaseUrl(value)).toBeNull();
    });
});
