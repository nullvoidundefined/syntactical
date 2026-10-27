// scripts/__tests__/writeHostFilesSitemap.test.ts
// The host files include sitemap.xml and robots.txt for https://syntactical.dev. The sitemap lists every static page
// except the admin console and the purchase return page, one URL per track, and one per bank; never a layout, the
// document shell, the not-found route, a test file, a dynamic segment, or the length and play steps. Track and bank
// pages are directory pages, listed with the trailing slash Pages serves them at. robots.txt keeps crawlers off the
// two unlisted pages and names the sitemap.
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { buildRobots, buildSitemap, writeSitemapFiles } from '../writeHostFiles.mjs';

const ORIGIN = 'https://syntactical.dev';
const REPO_ROOT = join(__dirname, '..', '..');

function countUrls(xml: string): number {
  return (xml.match(/<url>/g) ?? []).length;
}

function listLocs(xml: string): string[] {
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
}

// The path's segments without the leading and trailing slash: '/python/medium/' is ['python', 'medium'].
function listSegments(path: string): string[] {
  return path.replace(/^\/|\/$/g, '').split('/');
}

async function makeFixture() {
  const root = await mkdtemp(join(tmpdir(), 'sitemap-'));
  const appDir = join(root, 'app');
  await mkdir(join(appDir, '[language]', '[difficulty]'), { recursive: true });
  await mkdir(join(appDir, '__tests__'));
  for (const file of [
    'index.tsx',
    '_layout.tsx',
    '+not-found.tsx',
    '+html.tsx',
    'admin.tsx',
    'privacy.tsx',
    'purchase-complete.tsx',
    'settings.tsx',
    '[language]/index.tsx',
    '[language]/[difficulty]/index.tsx',
    '[language]/[difficulty]/length.tsx',
    '[language]/[difficulty]/play.tsx',
    '__tests__/privacy.test.tsx',
  ]) {
    await writeFile(join(appDir, file), '');
  }
  const manifestPath = join(root, 'manifest.json');
  const banks = { easy: {}, hard: {}, medium: {} };
  await writeFile(
    manifestPath,
    JSON.stringify({
      languages: [
        { banks, id: 'python' },
        { banks, id: 'go' },
      ],
    }),
  );
  return { appDir, manifestPath, root };
}

describe('buildSitemap', () => {
  it('lists the static pages, each track, and each bank, and nothing else', async () => {
    const { appDir, manifestPath } = await makeFixture();
    const xml = await buildSitemap({ appDir, manifestPath });
    expect(
      xml.startsWith(
        '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
      ),
    ).toBe(true);
    // 3 static pages (home, privacy, settings) + 2 tracks + 6 banks.
    expect(countUrls(xml)).toBe(11);
    expect(listLocs(xml)).toEqual([
      `${ORIGIN}/`,
      `${ORIGIN}/privacy`,
      `${ORIGIN}/settings`,
      `${ORIGIN}/python/`,
      `${ORIGIN}/python/easy/`,
      `${ORIGIN}/python/hard/`,
      `${ORIGIN}/python/medium/`,
      `${ORIGIN}/go/`,
      `${ORIGIN}/go/easy/`,
      `${ORIGIN}/go/hard/`,
      `${ORIGIN}/go/medium/`,
    ]);
  });

  it('lists the 12 tracks and 36 banks of the real manifest beside the real static pages', async () => {
    const xml = await buildSitemap({
      appDir: join(REPO_ROOT, 'app'),
      manifestPath: join(REPO_ROOT, 'content/manifest.json'),
    });
    const paths = listLocs(xml).map((loc) => loc.slice(ORIGIN.length));
    const manifest = require('../../content/manifest.json') as { languages: { id: string }[] };
    const trackIds = new Set(manifest.languages.map(({ id }) => id));
    const isTrackPath = (path: string) => trackIds.has(listSegments(path)[0]);
    expect(paths.filter((path) => isTrackPath(path) && listSegments(path).length === 1)).toHaveLength(12);
    expect(paths.filter((path) => isTrackPath(path) && listSegments(path).length === 2)).toHaveLength(36);
    // 7 static pages today: /, /delete-account, /privacy, /review, /settings, /sign-in, /sign-up.
    // Update this count, and the list in the comment, when a page route is added or removed.
    expect(countUrls(xml)).toBe(7 + 12 + 36);
    expect(paths).not.toContain('/admin');
    expect(paths).not.toContain('/purchase-complete');
  });
});

describe('robots and the written files', () => {
  it('keeps crawlers off the unlisted pages and names the sitemap', () => {
    expect(buildRobots()).toBe(
      ['User-agent: *', 'Disallow: /admin', 'Disallow: /purchase-complete', `Sitemap: ${ORIGIN}/sitemap.xml`, ''].join(
        '\n',
      ),
    );
  });

  it('writes sitemap.xml and robots.txt into the output directory', async () => {
    const { appDir, manifestPath, root } = await makeFixture();
    const outputDir = join(root, 'dist');
    await mkdir(outputDir);
    await writeSitemapFiles(outputDir, { appDir, manifestPath });
    expect(countUrls(await readFile(join(outputDir, 'sitemap.xml'), 'utf8'))).toBe(11);
    expect(await readFile(join(outputDir, 'robots.txt'), 'utf8')).toBe(buildRobots());
  });
});
