// The only place gap-fill executes generated code: it hands `runOracle` the language, code,
// and setupSql and nothing else, with the fixed limits. Docker flags, the image, and
// limits are not parameters here, so no model output can reach them.
import type { runOracle } from '../../clients/dockerRunner.js';
import type { Oracle } from '../../types/Oracle.js';
import type { OracleRun } from '../../types/OracleRun.js';

import { GENERATE_RUN_LIMITS } from './GENERATE_RUN_LIMITS.js';

export function runSandboxed(run: typeof runOracle, oracle: Oracle): Promise<OracleRun> {
    const { code, language, setupSql } = oracle;
    return run({ code, language, ...(setupSql === undefined ? {} : { setupSql }) }, GENERATE_RUN_LIMITS);
}
