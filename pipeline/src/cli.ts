// The pipeline CLI: `npm run pipeline -- <command>`. Dispatch lives in runCli.
import { fileURLToPath } from 'node:url';

import { createModelProvider } from './clients/modelProvider.js';
import { draftOracles } from './commands/draftOracles.js';
import { runCli } from './commands/runCli.js';
import { validateContent } from './commands/validate.js';

process.exitCode = await runCli(process.argv, {
    contentDir: fileURLToPath(new URL('../../content', import.meta.url)),
    createProvider: createModelProvider,
    draft: draftOracles,
    pipelineDir: fileURLToPath(new URL('../', import.meta.url)),
    stderr: (text) => process.stderr.write(text),
    stdout: (text) => process.stdout.write(text),
    validate: validateContent,
});
