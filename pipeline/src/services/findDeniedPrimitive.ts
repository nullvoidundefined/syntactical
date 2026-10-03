// Static deny check for drafted oracles. Defense in depth only: the runner sandbox
// (no network, no privileges, resource limits) is the real control, and a blocklist
// can never be complete. This floor refuses the obvious network, process, file, and
// dynamic-code routes early, and it over-refuses on purpose: a refused oracle only
// costs a question its execution check.
import type { Oracle } from '../types/Oracle.js';

type Scope = 'any' | 'node' | 'postgres' | 'python';

interface Rule {
    name: string;
    pattern: RegExp;
    scope: Scope;
}

const NODE_MODULES =
    '(?:node:)?(?:net|http|https|http2|dns|tls|dgram|worker_threads|child_process|cluster|vm|inspector)(?:/[\\w/-]*)?';

const RULES: Rule[] = [
    { name: 'socket', pattern: /socket/i, scope: 'any' },
    { name: 'requests', pattern: /\brequests\b/i, scope: 'any' },
    { name: 'urllib', pattern: /urllib/i, scope: 'any' },
    { name: 'http.client', pattern: /http\.client/i, scope: 'any' },
    { name: 'fetch(', pattern: /\bfetch\s*\(/i, scope: 'any' },
    { name: 'XMLHttpRequest', pattern: /XMLHttpRequest/i, scope: 'any' },
    { name: 'child_process', pattern: /child_process/i, scope: 'any' },
    { name: 'subprocess', pattern: /subprocess/i, scope: 'any' },
    { name: 'os.system', pattern: /\bos\s*\.\s*system\b/i, scope: 'any' },
    { name: 'COPY ... PROGRAM', pattern: /\bcopy\b[^;]*\b(?:from|to)\s+program\b/is, scope: 'any' },
    { name: 'dblink', pattern: /dblink/i, scope: 'any' },
    { name: 'eval(', pattern: /\beval\s*\(/i, scope: 'any' },

    { name: 'os process call', pattern: /\bos\s*\.\s*(?:popen|exec\w*|spawn\w*|posix_spawn\w*|fork\w*|kill\w*|startfile)\b/, scope: 'python' },
    { name: 'os import alias', pattern: /\bfrom\s+(?:os|posix|nt)\s+import\b|\bimport\s+(?:os|posix|nt)\s+as\b|\bimport\s+(?:posix|nt)\b/, scope: 'python' },
    { name: 'pty', pattern: /\bpty\b/, scope: 'python' },
    { name: 'importlib', pattern: /importlib/, scope: 'python' },
    { name: '__import__', pattern: /__import__/, scope: 'python' },
    { name: 'ctypes', pattern: /\bctypes\b/, scope: 'python' },
    { name: 'network module', pattern: /\b(?:ftplib|smtplib|telnetlib|poplib|imaplib|xmlrpc|socketserver|webbrowser|multiprocessing)\b/, scope: 'python' },
    { name: 'http.server', pattern: /http\.server/, scope: 'python' },
    { name: 'asyncio network', pattern: /\b(?:open_connection|open_unix_connection|start_server|start_unix_server|create_connection|create_server|create_datagram_endpoint)\b/, scope: 'python' },
    { name: 'exec(', pattern: /\bexec\s*\(/, scope: 'python' },
    { name: 'compile(', pattern: /\bcompile\s*\(/, scope: 'python' },
    { name: 'getattr on os/sys/builtins', pattern: /\bgetattr\s*\(\s*(?:os|sys|builtins|__builtins__|posix|importlib)\b/, scope: 'python' },
    { name: 'python dunder escape', pattern: /__(?:builtins|subclasses|globals|loader)__/, scope: 'python' },

    { name: 'dynamic import(', pattern: /\bimport\s*\(/, scope: 'node' },
    { name: 'node module import', pattern: new RegExp(`\\b(?:from|import)\\s*['"\`]${NODE_MODULES}['"\`]`), scope: 'node' },
    { name: 'node module require', pattern: new RegExp(`\\brequire\\s*\\(\\s*['"\`]${NODE_MODULES}['"\`]`), scope: 'node' },
    { name: 'dynamic require', pattern: /\brequire\b(?!\s*\(\s*['"`][^'"`+$\\]*['"`]\s*\))/, scope: 'node' },
    { name: 'process.binding', pattern: /\bprocess\s*\.\s*(?:binding|_linkedBinding|dlopen|mainModule)\b|\._load\b/, scope: 'node' },
    { name: 'Function(', pattern: /\bFunction\s*\(/, scope: 'node' },
    { name: '.constructor(', pattern: /\.\s*constructor\s*\(/, scope: 'node' },

    { name: 'program', pattern: /\bprogram\b/i, scope: 'postgres' },
    { name: 'pg file read', pattern: /pg_read_file|pg_read_binary_file|pg_ls_dir|pg_stat_file/i, scope: 'any' },
    { name: 'large object file io', pattern: /\blo_import\b|\blo_export\b/i, scope: 'any' },
    { name: 'create extension', pattern: /\bcreate\s+extension\b/i, scope: 'any' },
    { name: 'foreign data wrapper', pattern: /_fdw\b/i, scope: 'any' },
];

export function findDeniedPrimitive(oracle: Pick<Oracle, 'choiceCode' | 'code' | 'language' | 'setupSql'>): string | null {
    const { choiceCode = [], code, language, setupSql = '' } = oracle;
    const programs = [code, ...choiceCode];
    const hit = RULES.find(({ pattern, scope }) => {
        const texts = [
            ...(scope === 'any' || scope === language ? programs : []),
            ...(scope === 'any' || scope === 'postgres' ? [setupSql] : []),
        ];
        return texts.some((text) => pattern.test(text));
    });
    return hit ? hit.name : null;
}
