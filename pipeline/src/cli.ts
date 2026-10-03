// The pipeline CLI: `npm run pipeline -- <command>`: `validate` or `draft-oracles`.
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { createModelProvider } from './clients/modelProvider.js';
import { draftOracles } from './commands/draftOracles.js';
import { validateContent } from './commands/validate.js';
import { createOracleSource } from './services/createOracleSource.js';
import { exitCodeFor } from './services/exitCodeFor.js';
import { pickProviderKind } from './services/pickProviderKind.js';

const PIPELINE_DIR = fileURLToPath(new URL('../', import.meta.url));
const FIRST_COMMAND_ARG = 2;

async function main(argv: string[]): Promise<number> {
    const [command] = argv.slice(FIRST_COMMAND_ARG);
    const contentDir = fileURLToPath(new URL('../../content', import.meta.url));
    if (command === 'draft-oracles') {
        await draftOracles({
            contentDir,
            log: (line) => process.stdout.write(`${line}\n`),
            oraclesDir: `${PIPELINE_DIR}oracles`,
            provider: createModelProvider(pickProviderKind(argv)),
        });
        return 0;
    }
    if (command !== 'validate') {
        process.stderr.write('Usage: pipeline validate | draft-oracles [--api]\n');
        return 1;
    }
    const report = await validateContent({
        contentDir,
        newRunId: randomUUID,
        now: () => new Date().toISOString(),
        oracleSource: createOracleSource(`${PIPELINE_DIR}oracles`),
        reportsDir: `${PIPELINE_DIR}reports`,
    });
    process.stdout.write(`${JSON.stringify(report.counts)}\n`);
    return exitCodeFor(report.counts);
}

process.exitCode = await main(process.argv);
