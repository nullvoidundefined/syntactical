// Serves the web export the way the static host does: the app under /syntactical/ (any path the
// files do not hold falls back to index.html, as the 404.html copy does on GitHub Pages) and the
// public content under /syntactical/content/. Paid banks are never in the content directory.
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import { extname, join, normalize, sep } from 'node:path';

import { BASE_PATH, LOOPBACK } from './e2eEnv';

const CONTENT_PATH = `${BASE_PATH}/content/`;
const NOT_FOUND = 404;
const OK = 200;
const MIME_TYPES: Record<string, string> = {
  '.css': 'text/css',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.woff2': 'font/woff2',
};

function findFile(root: string, relativePath: string): string | null {
  const file = normalize(join(root, relativePath));
  const isInside = file === root || file.startsWith(`${root}${sep}`);
  return isInside && existsSync(file) && statSync(file).isFile() ? file : null;
}

function startWebHost(options: { contentDir: string; port: number; webDir: string }): Promise<Server> {
  const { contentDir, port, webDir } = options;
  const server = createServer((request, response) => {
    const { pathname } = new URL(request.url ?? '/', `http://${LOOPBACK}`);
    const path = decodeURIComponent(pathname);
    let file: string | null = null;
    if (path.startsWith(CONTENT_PATH)) {
      file = findFile(contentDir, path.slice(CONTENT_PATH.length));
    } else if (path.startsWith(`${BASE_PATH}/`)) {
      file = findFile(webDir, path.slice(BASE_PATH.length + 1)) ?? findFile(webDir, 'index.html');
    }
    if (file === null) {
      response.writeHead(NOT_FOUND).end();
      return;
    }
    response.writeHead(OK, { 'Content-Type': MIME_TYPES[extname(file)] ?? 'application/octet-stream' });
    createReadStream(file).pipe(response);
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, LOOPBACK, () => resolve(server));
  });
}

export { startWebHost };
