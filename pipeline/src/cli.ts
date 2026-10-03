// The pipeline CLI: `npm run pipeline -- <command>`. Only `validate` is wired so far.
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { validateContent } from './commands/validate.js';
import { createOracleSource } from './services/createOracleSource.js';
import { exitCodeFor } from './services/exitCodeFor.js';

const PIPELINE_DIR = fileURLToPath(new URL('../', import.meta.url));
const FIRST_COMMAND_ARG = 2;

async function main(argv: string[]): Promise<number> {
    const [command] = argv.slice(FIRST_COMMAND_ARG);
    if (command !== 'validate') {
        process.stderr.write('Usage: pipeline validate\n');
        return 1;
    }
    const report = await validateContent({
        contentDir: fileURLToPath(new URL('../../content', import.meta.url)),
        newRunId: randomUUID,
        now: () => new Date().toISOString(),
        oracleSource: createOracleSource(`${PIPELINE_DIR}oracles`),
        reportsDir: `${PIPELINE_DIR}reports`,
    });
    process.stdout.write(`${JSON.stringify(report.counts)}\n`);
    return exitCodeFor(report.counts);
}

process.exitCode = await main(process.argv);
