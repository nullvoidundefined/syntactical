// Serves the web export the way Cloudflare Pages does: a path is answered by the exported file at that path, then by
// <path>.html, then by <path>/index.html, and anything else by 404.html with status 404 (an empty 404 when the export
// has none). The public content is served under /content/ from its own directory. Pages also redirects /python to
// /python/ for a directory page; this host serves the page without the redirect.
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import { extname, join, normalize, sep } from 'node:path';

import { BASE_PATH, LOOPBACK } from './e2eEnv';

const CONTENT_PATH = `${BASE_PATH}/content/`;
const NOT_FOUND = 404;
const NOT_FOUND_PAGE = '404.html';
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

// The exported page for a path: the file itself, then <path>.html, then <path>/index.html.
function findPage(root: string, relativePath: string): string | null {
  const trimmed = relativePath.replace(/\/+$/, '');
  const asHtml = trimmed === '' ? null : findFile(root, `${trimmed}.html`);
  return findFile(root, relativePath) ?? asHtml ?? findFile(root, join(trimmed, 'index.html'));
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
      file = findPage(webDir, path.slice(BASE_PATH.length + 1));
    }
    const status = file === null ? NOT_FOUND : OK;
    const served = file ?? findFile(webDir, NOT_FOUND_PAGE);
    if (served === null) {
      response.writeHead(NOT_FOUND).end();
      return;
    }
    response.writeHead(status, { 'Content-Type': MIME_TYPES[extname(served)] ?? 'application/octet-stream' });
    createReadStream(served).pipe(response);
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, LOOPBACK, () => resolve(server));
  });
}

export { startWebHost };
