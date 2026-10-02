import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildContentManifest } from '../buildContentManifest.mjs';

const REPOSITORY_CONTENT_DIR = join(__dirname, '..', '..', 'content');
const BANK_SIZE_LIMIT_BYTES = 512 * 1024;
const MANIFEST_SIZE_LIMIT_BYTES = 64 * 1024;

describe('buildContentManifest size limits', () => {
    let workDir: string;
    let contentDir: string;
    let generatedPath: string;

    beforeEach(async () => {
        workDir = await mkdtemp(join(tmpdir(), 'content-manifest-size-'));
        contentDir = join(workDir, 'content');
        generatedPath = join(workDir, 'bundledContent.ts');
        await cp(REPOSITORY_CONTENT_DIR, contentDir, { recursive: true });
    });

    afterEach(async () => {
        await rm(workDir, { recursive: true, force: true });
    });

    it('rejects naming the bank path when a bank file is over 512 KB, even as valid JSON', async () => {
        const bankPath = join(contentDir, 'python', 'easy.json');
        const bankText = await readFile(bankPath, 'utf8');
        await writeFile(bankPath, bankText + ' '.repeat(BANK_SIZE_LIMIT_BYTES));

        await expect(buildContentManifest(contentDir, generatedPath)).rejects.toThrow(/python\/easy\.json/);
    });

    it('rejects naming the manifest when the manifest it would write is over 64 KB', async () => {
        const manifestPath = join(contentDir, 'manifest.json');
        const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as Record<string, unknown>;
        await writeFile(manifestPath, `${JSON.stringify({ ...manifest, notes: 'x'.repeat(MANIFEST_SIZE_LIMIT_BYTES) }, null, 2)}\n`);

        await expect(buildContentManifest(contentDir, generatedPath)).rejects.toThrow(/manifest\.json/);
    });
});
