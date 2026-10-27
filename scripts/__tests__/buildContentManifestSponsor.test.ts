// scripts/__tests__/buildContentManifestSponsor.test.ts
// The content build validates content/sponsor.json when it exists: a malformed or oversized file fails the
// build naming the file, while an absent or expired sponsor builds (the app skips an expired one).
import { cp, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { buildContentManifest } from '../buildContentManifest.mjs';

const REPOSITORY_CONTENT_DIR = join(__dirname, '..', '..', 'content');

const SPONSOR = {
  body: 'Managed Postgres with branching for every pull request.',
  endsOn: '2999-12-31',
  headline: 'Neon',
  href: 'https://neon.tech',
  startsOn: '2026-11-01',
};

describe('buildContentManifest and content/sponsor.json', () => {
  let workDir: string;
  let contentDir: string;
  let generatedPath: string;

  beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), 'content-sponsor-'));
    contentDir = join(workDir, 'content');
    generatedPath = join(workDir, 'bundledContent.ts');
    await cp(REPOSITORY_CONTENT_DIR, contentDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(workDir, { force: true, recursive: true });
  });

  async function writeSponsor(text: string) {
    await writeFile(join(contentDir, 'sponsor.json'), text);
  }

  it('builds with no sponsor file', async () => {
    await expect(buildContentManifest(contentDir, generatedPath)).resolves.toBeUndefined();
  });

  it('builds with a valid sponsor and with an expired one', async () => {
    await writeSponsor(JSON.stringify(SPONSOR));
    await expect(buildContentManifest(contentDir, generatedPath)).resolves.toBeUndefined();
    await writeSponsor(JSON.stringify({ ...SPONSOR, endsOn: '2020-01-31', startsOn: '2020-01-01' }));
    await expect(buildContentManifest(contentDir, generatedPath)).resolves.toBeUndefined();
  });

  it('fails on a sponsor file that is not JSON', async () => {
    await writeSponsor('{ headline: Neon');
    await expect(buildContentManifest(contentDir, generatedPath)).rejects.toThrow('sponsor.json is invalid: not JSON');
  });

  it('fails naming the rule a sponsor breaks', async () => {
    await writeSponsor(JSON.stringify({ ...SPONSOR, href: 'http://neon.tech' }));
    await expect(buildContentManifest(contentDir, generatedPath)).rejects.toThrow(
      'sponsor.json is invalid: href is invalid',
    );
  });

  it('fails on a sponsor file over 4 KiB', async () => {
    await writeSponsor(JSON.stringify({ ...SPONSOR, padding: ' '.repeat(5000) }));
    await expect(buildContentManifest(contentDir, generatedPath)).rejects.toThrow(
      'sponsor.json is over the 4096 byte limit',
    );
  });
});
