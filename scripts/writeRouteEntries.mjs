// GitHub Pages answers 404 for any path without a file, even when 404.html
// renders the app. Writing a copy of index.html at <route>/index.html for
// every known route makes those paths return 200. Unknown paths still fall
// through to 404.html and the app's not-found screen.
import { copyFile, mkdir, readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const SKIPPED_NAMES = new Set(['_layout', '+not-found', '__tests__']);
const SCREEN_EXTENSION = /\.(tsx|ts|jsx|js)$/;

function isDynamicSegment(name) {
  return name.startsWith('[');
}

// Static routes from the app/ tree, as slash-separated paths ('' is the home page). Route groups
// ((name) folders), nested index files, and stray test files are not handled: app/ has none.
async function listStaticRoutes(dir, prefix = '') {
  const routes = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const base = entry.name.replace(SCREEN_EXTENSION, '');
    if (SKIPPED_NAMES.has(base) || isDynamicSegment(base)) continue;
    if (entry.isDirectory()) {
      routes.push(...(await listStaticRoutes(join(dir, entry.name), `${prefix}${entry.name}/`)));
    } else if (SCREEN_EXTENSION.test(entry.name) && base !== 'index') {
      routes.push(`${prefix}${base}`);
    }
  }
  return routes;
}

// Concrete routes for app/[language] and app/[language]/[difficulty]/*.
async function listManifestRoutes(appDir, manifestPath) {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const routes = [];
  for (const language of manifest.languages) {
    routes.push(language.id);
    for (const difficulty of Object.keys(language.banks)) {
      const base = `${language.id}/${difficulty}`;
      routes.push(base);
      const children = await listStaticRoutes(join(appDir, '[language]', '[difficulty]'));
      for (const child of children) routes.push(`${base}/${child}`);
    }
  }
  return routes;
}

export async function writeRouteEntries(outputDir, { appDir = 'app', manifestPath = 'content/manifest.json' } = {}) {
  const routes = [...(await listStaticRoutes(appDir)), ...(await listManifestRoutes(appDir, manifestPath))];
  const source = join(outputDir, 'index.html');
  for (const route of routes) {
    const target = join(outputDir, route, 'index.html');
    await mkdir(dirname(target), { recursive: true });
    await copyFile(source, target);
  }
  return routes;
}

// Compare as file URLs: a plain string compare breaks on a path with a space, and a symlink needs
// its real path.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  writeRouteEntries(process.argv[2] ?? 'dist').catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
