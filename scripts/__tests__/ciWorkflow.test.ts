import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

describe('CI workflow', () => {
    it('grants the workflow token read-only contents access at the top level', async () => {
        const workflow = await readFile(join(__dirname, '..', '..', '.github', 'workflows', 'ci.yml'), 'utf8');

        expect(workflow).toMatch(/^permissions:\n {2}contents: read\n/m);
    });
});
