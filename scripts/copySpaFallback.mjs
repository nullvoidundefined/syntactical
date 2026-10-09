// GitHub Pages has no rewrite rules, so a direct load of a client route
// would 404. Serving index.html as 404.html lets the router resolve any
// path, and .nojekyll stops Pages from dropping Expo's underscore files.
import { copyFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export async function copySpaFallback(outputDir) {
  await copyFile(join(outputDir, 'index.html'), join(outputDir, '404.html'));
  await writeFile(join(outputDir, '.nojekyll'), '');
}

// Compare as file URLs: a plain string compare breaks on a path with a space, and a symlink needs
// its real path.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  copySpaFallback(process.argv[2] ?? 'dist').catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
