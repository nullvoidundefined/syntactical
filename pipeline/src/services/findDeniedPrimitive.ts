// Static deny check for drafted oracles. Defense in depth only: the runner sandbox
// (no network, no privileges, resource limits) is the real control; this refuses
// the obvious network and process escapes before an oracle is accepted.
import type { Oracle } from '../types/Oracle.js';

const DENIED_PRIMITIVES: { name: string; pattern: RegExp }[] = [
    { name: 'socket', pattern: /socket/i },
    { name: 'requests', pattern: /\brequests\b/i },
    { name: 'urllib', pattern: /urllib/i },
    { name: 'http.client', pattern: /http\.client/i },
    { name: 'fetch(', pattern: /\bfetch\s*\(/i },
    { name: 'XMLHttpRequest', pattern: /XMLHttpRequest/i },
    { name: 'child_process', pattern: /child_process/i },
    { name: 'subprocess', pattern: /subprocess/i },
    { name: 'os.system', pattern: /\bos\s*\.\s*system\b/i },
    { name: 'COPY ... PROGRAM', pattern: /\bcopy\b[^;]*\b(?:from|to)\s+program\b/is },
    { name: 'dblink', pattern: /dblink/i },
];

export function findDeniedPrimitive(oracle: Pick<Oracle, 'choiceCode' | 'code' | 'setupSql'>): string | null {
    const { choiceCode = [], code, setupSql = '' } = oracle;
    const texts = [code, setupSql, ...choiceCode];
    const hit = DENIED_PRIMITIVES.find(({ pattern }) => texts.some((text) => pattern.test(text)));
    return hit ? hit.name : null;
}
