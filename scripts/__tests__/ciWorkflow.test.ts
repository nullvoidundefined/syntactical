import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

describe('CI workflow', () => {
  it('grants the workflow token read-only contents access at the top level', async () => {
    const workflow = await readFile(join(__dirname, '..', '..', '.github', 'workflows', 'ci.yml'), 'utf8');

    expect(workflow).toMatch(/^permissions:\n {2}contents: read\n/m);
  });
});

describe('server deploy workflow', () => {
  const workflowsDir = join(__dirname, '..', '..', '.github', 'workflows');

  async function readJobs() {
    const workflow = await readFile(join(workflowsDir, 'server-deploy.yml'), 'utf8');
    const stagingStart = workflow.indexOf('\n  staging:\n');
    const productionStart = workflow.indexOf('\n  production:\n');
    return {
      production: workflow.slice(productionStart),
      staging: workflow.slice(stagingStart, productionStart),
      workflow,
    };
  }

  it('grants the workflow token read-only contents access at the top level', async () => {
    const { workflow } = await readJobs();

    expect(workflow).toMatch(/^permissions:\n {2}contents: read\n/m);
  });

  it('is never triggered by a pull request', async () => {
    const { workflow } = await readJobs();

    expect(workflow).not.toMatch(/pull_request/);
  });

  it('runs staging only on a push and production only on a manual run from main', async () => {
    const { production, staging } = await readJobs();

    expect(staging).toMatch(/^ {4}if: github\.event_name == 'push'$/m);
    expect(production).toMatch(
      /^ {4}if: github\.event_name == 'workflow_dispatch' && github\.ref == 'refs\/heads\/main'$/m,
    );
  });

  it('references each Railway token only in its own job', async () => {
    const { production, staging } = await readJobs();

    expect(staging).toContain('secrets.RAILWAY_TOKEN_STAGING');
    expect(staging).not.toContain('RAILWAY_TOKEN_PRODUCTION');
    expect(production).toContain('secrets.RAILWAY_TOKEN_PRODUCTION');
    expect(production).not.toContain('RAILWAY_TOKEN_STAGING');
  });

  it('deploys only after the image check in both jobs', async () => {
    const { production, staging } = await readJobs();

    for (const job of [staging, production]) {
      const check = job.indexOf('./.github/actions/check-api-image');
      expect(check).toBeGreaterThan(-1);
      expect(job.indexOf('deployToRailway.sh')).toBeGreaterThan(check);
    }
  });

  it('fails production when the content deploy key is empty, before the image is built', async () => {
    const { production } = await readJobs();

    const keyCheck = production.indexOf('Check the content deploy key is set');
    expect(keyCheck).toBeGreaterThan(-1);
    expect(production).toMatch(/\[ -n "\$CONTENT_DEPLOY_KEY" \] \|\| \{[^}]*exit 1/);
    expect(keyCheck).toBeLessThan(production.indexOf('./.github/actions/check-api-image'));
  });

  it('pins every third-party action to a full commit sha', async () => {
    for (const file of ['server-deploy.yml', 'server.yml']) {
      const text = await readFile(join(workflowsDir, file), 'utf8');
      const uses = [...text.matchAll(/uses: (\S+)/g)].map((match) => match[1]).filter((ref) => !ref.startsWith('./'));

      expect(uses.length).toBeGreaterThan(0);
      for (const ref of uses) {
        expect(ref).toMatch(/@[0-9a-f]{40}$/);
      }
    }
  });
});
