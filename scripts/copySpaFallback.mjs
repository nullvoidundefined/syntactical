// GitHub Pages has no rewrite rules, so a direct load of a client route
// would 404. Serving index.html as 404.html lets the router resolve any
// path, and .nojekyll stops Pages from dropping Expo's underscore files.
import { copyFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export async function copySpaFallback(outputDir) {
  await copyFile(join(outputDir, 'index.html'), join(outputDir, '404.html'));
  await writeFile(join(outputDir, '.nojekyll'), '');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  copySpaFallback(process.argv[2] ?? 'dist').catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
