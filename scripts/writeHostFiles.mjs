// Writes the files Cloudflare Pages reads beside the static web export: _headers and 404.html. Every path gets three
// security headers. Expo's content-hashed bundles under _expo/static/ and the bank files under content/ are cached
// for a year: the app fetches banks with cache: 'no-cache' (clients/fetchContentText.ts) and checks every download
// against the manifest hash, and Pages purges its edge cache on each deploy. The manifest, the sponsor file, and the
// sponsor icons revalidate on every request. 404.html is the exported not-found page, which Pages serves with status
// 404 for any path the export does not hold. It also writes sitemap.xml and robots.txt for https://syntactical.dev,
// and deletes Expo Router's own route list (_sitemap.html, which links every route, /admin included) and the pages it
// exports for the unfilled dynamic routes ([language].html and everything under [language]/), each a "Not found" page
// that Pages would serve with status 200.
import { promises, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const { access, copyFile, readFile, readdir, rm, writeFile } = promises;

const NOT_FOUND_PAGE = '+not-found.html';
const EXPO_ROUTER_SITEMAP = '_sitemap.html';
const YEAR = '  Cache-Control: public, max-age=31536000, immutable';
const NO_CACHE = '  Cache-Control: no-cache';
// The difficulty ids in DIFFICULTIES (@syntactical/content-schema); this script runs under plain node and cannot
// import the TypeScript package, and writeHostFiles.test.ts pins the list.
const BANK_FILES = ['easy.json', 'medium.json', 'hard.json'];

// Pages applies every rule that matches a path and joins repeated header values with a comma, so no two rules may set
// the same header on one path. A :placeholder matches one whole segment and the bank file names are literal, so the
// bank rules never match the manifest, the sponsor file, or a sponsor icon.
export const HOST_HEADERS = [
  '/*',
  '  X-Content-Type-Options: nosniff',
  '  Referrer-Policy: strict-origin-when-cross-origin',
  "  Content-Security-Policy: frame-ancestors 'none'",
  '',
  '/_expo/static/*',
  YEAR,
  '',
  '/content/manifest.json',
  NO_CACHE,
  '',
  '/content/sponsor.json',
  NO_CACHE,
  '',
  '/content/sponsor/*',
  NO_CACHE,
  '',
  ...BANK_FILES.flatMap((file) => [`/content/:track/${file}`, YEAR, '']),
].join('\n');

const SITE_ORIGIN = 'https://syntactical.dev';
// Pages with nothing for a search engine: the admin console and the purchase return page.
const UNLISTED_PAGES = ['admin', 'purchase-complete'];
const ROUTE_FILE = /\.(tsx|ts|jsx|js)$/;
const NON_ROUTE_NAMES = new Set(['_layout', '+not-found', '+html', '__tests__']);

function isDynamicSegment(name) {
  return name.startsWith('[');
}

// Static page paths from the app/ tree, slash-separated, '' for the home page. Dynamic segments
// come from the manifest instead.
async function listStaticPagePaths(dir, prefix = '') {
  const paths = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const base = entry.name.replace(ROUTE_FILE, '');
    if (NON_ROUTE_NAMES.has(base) || isDynamicSegment(base)) continue;
    if (entry.isDirectory()) {
      paths.push(...(await listStaticPagePaths(join(dir, entry.name), `${prefix}${entry.name}/`)));
    } else if (ROUTE_FILE.test(entry.name)) {
      paths.push(base === 'index' ? prefix.replace(/\/$/, '') : `${prefix}${base}`);
    }
  }
  return paths;
}

// One page per track and one per bank, each a directory page (<path>/index.html) that Pages serves at a trailing
// slash, the form the area 5 verification recorded and the pages' canonical URLs use. The length and play steps
// take query parameters and are not listed.
function listTrackPagePaths(manifest) {
  return manifest.languages.flatMap((language) => [
    `${language.id}/`,
    ...Object.keys(language.banks)
      .sort()
      .map((difficulty) => `${language.id}/${difficulty}/`),
  ]);
}

function toLoc(path) {
  return `${SITE_ORIGIN}/${path}`;
}

export async function buildSitemap({ appDir = 'app', manifestPath = 'content/manifest.json' } = {}) {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const staticPaths = (await listStaticPagePaths(appDir)).filter((path) => !UNLISTED_PAGES.includes(path)).sort();
  const urls = [...staticPaths, ...listTrackPagePaths(manifest)].map(
    (path) => `  <url><loc>${toLoc(path)}</loc></url>`,
  );
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('\n')}
</urlset>
`;
}

export function buildRobots() {
  const disallowed = UNLISTED_PAGES.map((page) => `Disallow: /${page}`);
  return ['User-agent: *', ...disallowed, `Sitemap: ${SITE_ORIGIN}/sitemap.xml`, ''].join('\n');
}

export async function writeSitemapFiles(outputDir, options = {}) {
  await writeFile(join(outputDir, 'sitemap.xml'), await buildSitemap(options));
  await writeFile(join(outputDir, 'robots.txt'), buildRobots());
}

// Deletes every file or directory whose name is a dynamic segment, at any depth, so no [segment] page is served.
async function removeDynamicRoutePages(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (isDynamicSegment(entry.name)) await rm(path, { recursive: true, force: true });
    else if (entry.isDirectory()) await removeDynamicRoutePages(path);
  }
}

export async function writeHostFiles(outputDir) {
  const notFoundPage = join(outputDir, NOT_FOUND_PAGE);
  try {
    await access(notFoundPage);
  } catch {
    throw new Error(`${NOT_FOUND_PAGE} is missing from the web export; app.config.ts must set web.output to 'static'`);
  }
  await copyFile(notFoundPage, join(outputDir, '404.html'));
  await rm(join(outputDir, EXPO_ROUTER_SITEMAP), { force: true });
  await removeDynamicRoutePages(outputDir);
  await writeFile(join(outputDir, '_headers'), HOST_HEADERS);
  await writeSitemapFiles(outputDir);
}

// Compare as file URLs: a plain string compare breaks on a path with a space, and a symlink needs its real path.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  writeHostFiles(process.argv[2] ?? 'dist').catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  });
}
