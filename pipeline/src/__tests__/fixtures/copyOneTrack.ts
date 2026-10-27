// pipeline/src/__tests__/fixtures/copyOneTrack.ts
// Test support: copies one track out of a content directory, its bank files and the manifest pruned to that
// track, so a test that needs one track does not copy every bank in the repository.
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

type Manifest = { languages: { banks: Record<string, { path: string }>; id: string }[] };

export async function copyOneTrack(fromDir: string, toDir: string, trackId: string): Promise<void> {
    const manifest = JSON.parse(await readFile(join(fromDir, 'manifest.json'), 'utf8')) as Manifest;
    const [track, ...others] = manifest.languages.filter(({ id }) => id === trackId);
    if (track === undefined || others.length > 0) throw new Error(`expected one track ${trackId} in ${fromDir}`);
    for (const { path } of Object.values(track.banks)) {
        await mkdir(dirname(join(toDir, path)), { recursive: true });
        await cp(join(fromDir, path), join(toDir, path));
    }
    await writeFile(join(toDir, 'manifest.json'), `${JSON.stringify({ ...manifest, languages: [track] }, null, 2)}\n`);
}
