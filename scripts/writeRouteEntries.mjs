// GitHub Pages answers 404 for any path without a file, even when 404.html
// renders the app. Writing a copy of index.html at <route>/index.html for
// every known route makes those paths return 200. Unknown paths still fall
// through to 404.html and the app's not-found screen.
import { copyFile, mkdir, readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const SKIPPED_NAMES = new Set(['_layout', '+not-found', '__tests__']);
const SCREEN_EXTENSION = /\.(tsx|ts|jsx|js)$/;

function isDynamicSegment(name) {
  return name.startsWith('[');
}

// Static routes from the app/ tree, as slash-separated paths ('' is the home page).
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

if (import.meta.url === `file://${process.argv[1]}`) {
  writeRouteEntries(process.argv[2] ?? 'dist').catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
