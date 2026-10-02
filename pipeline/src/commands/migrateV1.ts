// One-time conversion of a schema-1 content directory to schema 2. It keeps
// each bank's old hash, so run `npm run content:build` right after it to
// rehash; it ran once on 2026-10-03 and the committed content is now v2.
// Rewrites a content directory from schema 1 to schema 2 in place.
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { migrateBankV1 } from '../services/migrateBankV1.js';
import { migrateManifestV1 } from '../services/migrateManifestV1.js';

const JSON_INDENT = 2;

async function readJson(path: string): Promise<unknown> {
    return JSON.parse(await readFile(path, 'utf8'));
}

async function writeJson(path: string, value: unknown): Promise<void> {
    await writeFile(path, `${JSON.stringify(value, null, JSON_INDENT)}\n`);
}

export async function migrateContentDirectory(contentDir: string): Promise<void> {
    const manifestPath = join(contentDir, 'manifest.json');
    const manifest = (await readJson(manifestPath)) as {
        languages: { banks: Record<string, { path: string }> }[];
    };
    const bankPaths = manifest.languages.flatMap((language) =>
        Object.values(language.banks).map((bank) => bank.path),
    );
    const migratedManifest = migrateManifestV1(manifest);
    const migratedBanks = await Promise.all(
        bankPaths.map(async (path) => ({
            bank: migrateBankV1(await readJson(join(contentDir, path))),
            path: join(contentDir, path),
        })),
    );
    for (const { path, bank } of migratedBanks) {
        await writeJson(path, bank);
    }
    await writeJson(manifestPath, migratedManifest);
}
