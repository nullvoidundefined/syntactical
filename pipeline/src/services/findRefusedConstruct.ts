// Dispatches a drafted oracle to its language's strict checker: Python is parsed with
// `ast` by the host python3, Node with acorn, and Postgres SQL is comment-normalized and
// matched. A short list of network and process words is refused in every language first,
// so the reason names the obvious primitive. This is a strict pre-filter that refuses
// anything outside a small grammar; the Docker runner sandbox is the enforced control, and
// a refused question falls back to the judged path.
import type { Oracle } from '../types/Oracle.js';
import { checkNodeOracle } from './checkNodeOracle.js';
import { checkPostgresOracle } from './checkPostgresOracle.js';
import { checkPythonOracle } from './checkPythonOracle.js';

interface Rule {
    name: string;
    pattern: RegExp;
}

const COMMON_RULES: Rule[] = [
    { name: 'socket', pattern: /socket/i },
    { name: 'requests', pattern: /\brequests\b/i },
    { name: 'urllib', pattern: /urllib/i },
    { name: 'http.client', pattern: /http\.client/i },
    { name: 'fetch', pattern: /\bfetch\s*\(/i },
    { name: 'XMLHttpRequest', pattern: /XMLHttpRequest/i },
    { name: 'child_process', pattern: /child_process/i },
    { name: 'subprocess', pattern: /subprocess/i },
    { name: 'os.system', pattern: /\bos\s*\.\s*system\b/i },
    { name: 'COPY ... PROGRAM', pattern: /\bcopy\b[^;]*\b(?:from|to)\s+program\b/is },
    { name: 'dblink', pattern: /dblink/i },
    { name: 'eval', pattern: /\beval\b/i },
];

async function checkProgram(language: Oracle['language'], text: string): Promise<string | null> {
    const common = COMMON_RULES.find(({ pattern }) => pattern.test(text));
    if (common) {
        return common.name;
    }
    if (language === 'python') {
        return checkPythonOracle(text);
    }
    return language === 'node' ? checkNodeOracle(text) : checkPostgresOracle(text);
}

// Returns the first refused construct in the oracle, or null when it is allowed.
export async function findRefusedConstruct(
    oracle: Pick<Oracle, 'choiceCode' | 'code' | 'language' | 'setupSql'>,
): Promise<string | null> {
    const { choiceCode = [], code, language, setupSql = '' } = oracle;
    for (const text of [code, ...choiceCode]) {
        const refused = await checkProgram(language, text);
        if (refused) {
            return refused;
        }
    }
    // Setup SQL is Postgres input whatever the oracle language is.
    return setupSql === '' ? null : checkProgram('postgres', setupSql);
}
