// The pipeline CLI: `npm run pipeline -- <command>`. Dispatch lives in runCli.
import { fileURLToPath } from 'node:url';

import { createModelProvider } from './clients/modelProvider.js';
import { classify } from './commands/classify.js';
import { draftOracles } from './commands/draftOracles.js';
import { draftTaxonomy } from './commands/draftTaxonomy.js';
import { enrich } from './commands/enrich.js';
import { gapFill } from './commands/gapFill.js';
import { publish } from './commands/publish.js';
import { review } from './commands/review.js';
import { rewritePrompts } from './commands/rewritePrompts.js';
import { runCli } from './commands/runCli.js';
import { validateContent } from './commands/validate.js';

const { argv, env, stderr, stdout } = process;

const repoDir = fileURLToPath(new URL('../../', import.meta.url));
const buildScript = new URL('../../scripts/buildContentManifest.mjs', import.meta.url).href;

process.exitCode = await runCli(argv, {
    // The build script is plain JS outside this package; load it by URL so tsc does not follow it.
    buildManifest: async (contentRoot) => {
        const { buildRepoContent } = (await import(buildScript)) as {
            buildRepoContent: (repoDir: string, contentRoot: string) => Promise<void>;
        };
        await buildRepoContent(repoDir, contentRoot);
    },
    classify,
    contentDir: fileURLToPath(new URL('../../content', import.meta.url)),
    createProvider: createModelProvider,
    defaultContentRoot: fileURLToPath(new URL('../../../syntactical-content', import.meta.url)),
    draft: draftOracles,
    draftTaxonomy,
    enrich,
    env,
    gapFill,
    pipelineDir: fileURLToPath(new URL('../', import.meta.url)),
    publish,
    review,
    rewritePrompts,
    stderr: (text) => stderr.write(text),
    stdout: (text) => stdout.write(text),
    validate: validateContent,
});
