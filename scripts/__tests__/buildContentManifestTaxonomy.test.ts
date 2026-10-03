import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildContentManifest } from '../buildContentManifest.mjs';

const REPOSITORY_CONTENT_DIR = join(__dirname, '..', '..', 'content');
const APPROVED = [{ description: 'Believes default arguments are rebuilt on each call.', id: 'python.mutable-default-args' }];
const DRAFT = [{ description: 'Only a draft, never bundled.', id: 'python.draft-only' }];

describe('buildContentManifest taxonomy', () => {
    let workDir: string;
    let contentDir: string;
    let taxonomyDir: string;
    let generatedPath: string;

    beforeEach(async () => {
        workDir = await mkdtemp(join(tmpdir(), 'content-taxonomy-'));
        contentDir = join(workDir, 'content');
        taxonomyDir = join(workDir, 'taxonomy');
        generatedPath = join(workDir, 'bundledContent.ts');
        await cp(REPOSITORY_CONTENT_DIR, contentDir, { recursive: true });
        await mkdir(taxonomyDir);
    });

    afterEach(async () => {
        await rm(workDir, { recursive: true, force: true });
    });

    async function readPythonMisconceptions(): Promise<unknown> {
        const manifest = JSON.parse(await readFile(join(contentDir, 'manifest.json'), 'utf8'));
        return manifest.languages.find(({ id }: { id: string }) => id === 'python').misconceptions;
    }

    function build(): Promise<void> {
        return buildContentManifest(contentDir, generatedPath, undefined, taxonomyDir);
    }

    it('copies the approved file into the manifest and ignores the draft', async () => {
        await writeFile(join(taxonomyDir, 'python.json'), JSON.stringify(APPROVED));
        await writeFile(join(taxonomyDir, 'python.draft.json'), JSON.stringify(DRAFT));

        await build();

        expect(await readPythonMisconceptions()).toEqual(APPROVED);
    });

    it('never reads a draft when no approved file exists', async () => {
        await writeFile(join(taxonomyDir, 'python.draft.json'), JSON.stringify(DRAFT));

        await build();

        expect(await readPythonMisconceptions()).toEqual([]);
    });

    it('fails with a named error when the approved file breaks the misconception rules', async () => {
        const wrongLanguage = [{ description: 'ok', id: 'javascript.hoisting' }];
        await writeFile(join(taxonomyDir, 'python.json'), JSON.stringify(wrongLanguage));

        await expect(build()).rejects.toThrow('taxonomy python.json is invalid: misconceptions[0].id is invalid');
    });

    it('fails when the approved file is not JSON instead of treating it as absent', async () => {
        await writeFile(join(taxonomyDir, 'python.json'), '{not json');

        await expect(build()).rejects.toThrow();
    });
});
