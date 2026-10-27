// e2e/support/__tests__/startWebHost.test.ts
/// <reference types="jest" />
// The e2e web host answers as Cloudflare Pages does: the exported file at the path, then <path>.html, then
// <path>/index.html, and otherwise 404.html with status 404, so a deep link gets its own static page and an unknown
// path the not-found page. The public content is served under /content/ from its own directory.
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { get, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { startWebHost } from '../startWebHost';

type Reply = { body: string; status: number };

const WEB_FILES: Record<string, string> = {
  '404.html': 'not found page',
  '_expo/static/js/web/entry.js': 'bundle',
  'index.html': 'home page',
  'python/easy/play.html': 'play page',
  'python/index.html': 'python page',
  'settings.html': 'settings page',
};

let server: Server;
let port: number;

async function writeTree(root: string, files: Record<string, string>): Promise<void> {
  for (const [path, text] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), text);
  }
}

function request(path: string): Promise<Reply> {
  return new Promise((resolve, reject) => {
    get({ host: '127.0.0.1', path, port }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk: string) => {
        body += chunk;
      });
      response.on('end', () => resolve({ body, status: response.statusCode ?? 0 }));
    }).on('error', reject);
  });
}

beforeAll(async () => {
  const root = await mkdtemp(join(tmpdir(), 'web-host-'));
  const webDir = join(root, 'web');
  const contentDir = join(root, 'content');
  await writeTree(webDir, WEB_FILES);
  await writeTree(contentDir, { 'manifest.json': '{}' });
  server = await startWebHost({ contentDir, port: 0, webDir });
  ({ port } = server.address() as AddressInfo);
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('startWebHost', () => {
  it.each([
    ['/', { body: 'home page', status: 200 }],
    ['/settings', { body: 'settings page', status: 200 }],
    ['/python', { body: 'python page', status: 200 }],
    ['/python/', { body: 'python page', status: 200 }],
    ['/python/easy/play?count=20', { body: 'play page', status: 200 }],
    ['/_expo/static/js/web/entry.js', { body: 'bundle', status: 200 }],
    ['/content/manifest.json', { body: '{}', status: 200 }],
    ['/cobol', { body: 'not found page', status: 404 }],
    ['/python/expert/play', { body: 'not found page', status: 404 }],
    ['/content/cobol/easy.json', { body: 'not found page', status: 404 }],
  ])('answers %s', async (path, expected) => {
    expect(await request(path)).toEqual(expected);
  });
});
