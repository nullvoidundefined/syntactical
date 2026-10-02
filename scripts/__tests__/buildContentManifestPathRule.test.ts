import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { buildContentManifest } from '../buildContentManifest.mjs';

// Pass-through spy on readFile, so the test can see which files the build opened.
jest.mock('node:fs/promises', () => {
    const actualFs = jest.requireActual('node:fs/promises');
    return { ...actualFs, readFile: jest.fn(actualFs.readFile) };
});

const REPOSITORY_CONTENT_DIR = join(__dirname, '..', '..', 'content');
const HEX_SHA256_PATTERN = /[0-9a-f]{64}/;

type ManifestDocument = { languages: { banks: Record<string, { path: string; hash: string }> }[] };

function listReadPaths(): string[] {
    return (readFile as unknown as jest.Mock).mock.calls.map(([filePath]) => resolve(String(filePath)));
}

async function captureRejection(promise: Promise<unknown>): Promise<Error> {
    try {
        await promise;
    } catch (err) {
        return err as Error;
    }
    throw new Error('expected the build to reject');
}

describe('buildContentManifest bank path rule', () => {
    let workDir: string;
    let contentDir: string;
    let generatedPath: string;

    beforeEach(async () => {
        workDir = await mkdtemp(join(tmpdir(), 'content-manifest-path-'));
        contentDir = join(workDir, 'content');
        generatedPath = join(workDir, 'bundledContent.ts');
        await cp(REPOSITORY_CONTENT_DIR, contentDir, { recursive: true });
    });

    afterEach(async () => {
        await rm(workDir, { recursive: true, force: true });
    });

    // Each case plants a valid bank at the file the unsafe path would open if
    // joined onto the content directory, so only an up-front path check rejects it.
    it.each([
        ['../outside.json', () => join(workDir, 'outside.json')],
        ['/etc/hosts.json', () => join(contentDir, 'etc', 'hosts.json')],
    ])('rejects the bank path %s by name without reading the file it points at', async (unsafePath, targetOf) => {
        const targetPath = targetOf();
        const manifestPath = join(contentDir, 'manifest.json');
        const validBankBytes = await readFile(join(contentDir, 'python', 'easy.json'));
        await mkdir(dirname(targetPath), { recursive: true });
        await writeFile(targetPath, validBankBytes);
        const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as ManifestDocument;
        manifest.languages[0].banks.easy.path = unsafePath;
        await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
        (readFile as unknown as jest.Mock).mockClear();

        const err = await captureRejection(buildContentManifest(contentDir, generatedPath));

        expect(err).toBeInstanceOf(Error);
        expect(err.message).toContain(unsafePath);
        expect(err.message).not.toMatch(HEX_SHA256_PATTERN);
        expect(listReadPaths()).not.toContain(resolve(targetPath));
    });
});
