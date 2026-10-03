// The sandboxed runner, injected so tests never start Docker. In production it is `runOracle`.
import type { Oracle } from './Oracle.js';
import type { OracleRun } from './OracleRun.js';

export type OracleRunner = (oracle: Oracle) => Promise<OracleRun>;
