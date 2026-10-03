// The pipeline CLI: `npm run pipeline -- <command>`. Dispatch lives in runCli.
import { fileURLToPath } from 'node:url';

import { createModelProvider } from './clients/modelProvider.js';
import { classify } from './commands/classify.js';
import { draftOracles } from './commands/draftOracles.js';
import { runCli } from './commands/runCli.js';
import { validateContent } from './commands/validate.js';

const { argv, env, stderr, stdout } = process;

process.exitCode = await runCli(argv, {
    classify,
    contentDir: fileURLToPath(new URL('../../content', import.meta.url)),
    createProvider: createModelProvider,
    defaultContentRoot: fileURLToPath(new URL('../../../syntactical-content', import.meta.url)),
    draft: draftOracles,
    env,
    pipelineDir: fileURLToPath(new URL('../', import.meta.url)),
    stderr: (text) => stderr.write(text),
    stdout: (text) => stdout.write(text),
    validate: validateContent,
});
