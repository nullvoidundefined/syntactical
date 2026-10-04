// Where the e2e run's pieces live: fixed loopback ports (overridable) and the state file the
// global setup writes for the specs. The specs read it; they never start anything themselves.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const LOOPBACK = '127.0.0.1';
const DEFAULT_WEB_PORT = 4710;
const DEFAULT_API_PORT = 4711;
const BASE_PATH = '/syntactical';
const STATE_DIR_VARIABLE = 'E2E_STATE_DIR';

interface E2eState {
  apiUrl: string;
  codesFile: string;
  contentDir: string;
  databaseUrl: string;
  paidContentDir: string;
  webUrl: string;
}

function readPort(name: string, fallback: number): number {
  const raw = process.env[name];
  return raw === undefined || raw === '' ? fallback : Number(raw);
}

const webPort = readPort('E2E_WEB_PORT', DEFAULT_WEB_PORT);
const apiPort = readPort('E2E_API_PORT', DEFAULT_API_PORT);
const webOrigin = `http://${LOOPBACK}:${webPort}`;
const apiOrigin = `http://${LOOPBACK}:${apiPort}`;

function readState(): E2eState {
  const dir = process.env[STATE_DIR_VARIABLE];
  if (dir === undefined) throw new Error('The e2e global setup has not run');
  return JSON.parse(readFileSync(join(dir, 'state.json'), 'utf8')) as E2eState;
}

export { apiOrigin, apiPort, BASE_PATH, LOOPBACK, readState, STATE_DIR_VARIABLE, webOrigin, webPort };
export type { E2eState };
