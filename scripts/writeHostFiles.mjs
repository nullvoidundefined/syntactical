// Writes the files Cloudflare Pages reads beside the static web export: _headers and 404.html. Every path gets three
// security headers. Expo's content-hashed bundles under _expo/static/ and the bank files under content/ are cached
// for a year: the app fetches banks with cache: 'no-cache' (clients/fetchContentText.ts) and checks every download
// against the manifest hash, and Pages purges its edge cache on each deploy. The manifest, the sponsor file, and the
// sponsor icons revalidate on every request. 404.html is the exported not-found page, which Pages serves with status
// 404 for any path the export does not hold.
import { promises, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const { access, copyFile, writeFile } = promises;

const NOT_FOUND_PAGE = '+not-found.html';
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

export async function writeHostFiles(outputDir) {
  const notFoundPage = join(outputDir, NOT_FOUND_PAGE);
  try {
    await access(notFoundPage);
  } catch {
    throw new Error(`${NOT_FOUND_PAGE} is missing from the web export; app.config.ts must set web.output to 'static'`);
  }
  await copyFile(notFoundPage, join(outputDir, '404.html'));
  await writeFile(join(outputDir, '_headers'), HOST_HEADERS);
}

// Compare as file URLs: a plain string compare breaks on a path with a space, and a symlink needs its real path.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  writeHostFiles(process.argv[2] ?? 'dist').catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  });
}
