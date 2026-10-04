// Copies one access tier of bank files, and nothing else, out of a content checkout for the server
// image. Used by server/Dockerfile.
//
//   node copyContent.mjs <manifest.json> <fromDir> <toDir> <free|paid>
//
// Every bank the manifest lists for that tier must exist under fromDir and match the manifest
// hash, or the build fails here rather than the server failing at startup. The free tier also
// copies the manifest itself. Files outside the manifest (a .git directory, deploy notes, other
// banks) are never copied.
import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join, posix } from 'node:path';

const [manifestPath, fromDir, toDir, access] = process.argv.slice(2);
if (!manifestPath || !fromDir || !toDir || (access !== 'free' && access !== 'paid')) {
  console.error('usage: copyContent.mjs <manifest.json> <fromDir> <toDir> <free|paid>');
  process.exit(2);
}

function fail(message) {
  console.error(`copyContent: ${message}`);
  process.exit(1);
}

function isSafeRelativePath(path) {
  return (
    typeof path === 'string' &&
    path.length > 0 &&
    !path.startsWith('/') &&
    !path.includes('\\') &&
    posix.normalize(path) === path &&
    !path.split('/').includes('..')
  );
}

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const entries = manifest.languages
  .flatMap(({ banks }) => Object.values(banks))
  .filter((entry) => entry.access === access);
if (entries.length === 0) {
  fail(`the manifest lists no ${access} banks`);
}

for (const { hash, path } of entries) {
  if (!isSafeRelativePath(path)) {
    fail(`unsafe bank path ${path}`);
  }
  let bytes;
  try {
    bytes = readFileSync(join(fromDir, path));
  } catch {
    fail(`${access} bank missing: ${path}`);
  }
  if (createHash('sha256').update(bytes).digest('hex') !== hash) {
    fail(`bank hash mismatch: ${path}`);
  }
  const target = join(toDir, path);
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(join(fromDir, path), target);
}

if (access === 'free') {
  mkdirSync(toDir, { recursive: true });
  copyFileSync(manifestPath, join(toDir, 'manifest.json'));
}
console.log(`copyContent: copied ${entries.length} ${access} bank(s)`);
