// Static allow-list check for drafted oracles. The Docker runner sandbox (no network,
// no privileges, resource limits) is the real control; this is defense in depth.
// Oracles are short quiz snippets that need only language built-ins and a few pure
// standard-library modules, so the check refuses by default: Python imports only from
// a fixed safe set, Node gets no module, process, or global-object access at all, and
// Postgres gets no psql meta-commands, file, program, extension, or procedural-language
// routes. It over-refuses on purpose: a refused oracle only costs a question its
// execution check. Matching is on whole words anywhere in the text (strings and
// comments included), so a blocked name cannot hide behind an alias or a computed access.
import type { Oracle } from '../types/Oracle.js';

interface Rule {
    name: string;
    pattern: RegExp;
}

const SAFE_PYTHON_MODULES = new Set([
    'bisect',
    'collections',
    'copy',
    'dataclasses',
    'datetime',
    'decimal',
    'enum',
    'fractions',
    'functools',
    'heapq',
    'itertools',
    'json',
    'math',
    'operator',
    'random',
    're',
    'statistics',
    'string',
    'textwrap',
    'typing',
]);

// Network and process primitives, refused in every language.
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

const PYTHON_RULES: Rule[] = [
    { name: '__import__', pattern: /__import__/ },
    { name: 'importlib', pattern: /importlib/ },
    { name: 'getattr', pattern: /\bgetattr\b/ },
    { name: 'setattr', pattern: /\b(?:setattr|delattr)\b/ },
    { name: 'vars', pattern: /\bvars\b/ },
    { name: 'globals', pattern: /\bglobals\b/ },
    { name: 'locals', pattern: /\blocals\b/ },
    { name: 'sys', pattern: /\bsys\b/ },
    { name: 'os', pattern: /\bos\b/ },
    { name: 'exec', pattern: /\bexec\b/ },
    { name: 'compile', pattern: /\bcompile\b/ },
    { name: 'open', pattern: /\bopen\b/ },
    { name: 'breakpoint', pattern: /\bbreakpoint\b/ },
    { name: 'input', pattern: /\binput\b/ },
    { name: 'help', pattern: /\bhelp\b/ },
    { name: 'attrgetter', pattern: /\b(?:attrgetter|methodcaller)\b/ },
    {
        name: 'dunder escape',
        pattern: /__(?:dict|class|subclasses|builtins|globals|base|bases|mro|loader|spec|code|closure|func|self|getattribute|reduce|reduce_ex)__/,
    },
];

const NODE_RULES: Rule[] = [
    { name: 'fetch', pattern: /\bfetch\b/ },
    { name: 'require', pattern: /\b(?:require|createRequire)\b/ },
    { name: 'import', pattern: /\bimport\b/ },
    { name: 'module', pattern: /\bmodule\b/ },
    { name: 'process', pattern: /\bprocess\b/ },
    { name: 'global object', pattern: /\bglobal(?:This)?\b/ },
    { name: 'Reflect', pattern: /\bReflect\b/ },
    { name: 'Function', pattern: /\bFunction\b/ },
    { name: 'WebSocket', pattern: /\bWebSocket\b/ },
    { name: 'Deno/Bun', pattern: /\b(?:Deno|Bun)\b/ },
    { name: 'WebAssembly', pattern: /\bWebAssembly\b/ },
    { name: 'constructor', pattern: /\bconstructor\b|__proto__|__defineGetter__|__lookupGetter__/ },
    { name: 'stack trace hook', pattern: /\b(?:prepareStackTrace|captureStackTrace)\b/ },
    // A computed member access is allowed only with a plain index, an identifier, or one simple
    // string literal; a string built inside the brackets could spell any refused name.
    {
        name: 'computed string access',
        pattern:
            /(?<=[\w$)\]])(?<!\b(?:return|in|of|case|yield|await|else|typeof|new|delete|void|throw))\s*\[(?=[^\]]*['"`])(?!\s*(['"`])[^'"`\]$]*\1\s*\])/,
    },
];

const POSTGRES_RULES: Rule[] = [
    { name: 'psql meta-command', pattern: /^\s*\\/m },
    { name: 'psql meta-command', pattern: /\\[A-Za-z!?|]/ },
    { name: 'program', pattern: /\bprogram\b/i },
    { name: 'copy', pattern: /\bcopy\b/i },
    { name: 'large object', pattern: /\blo_\w+/i },
    { name: 'server file function', pattern: /\bpg_(?:read|ls|stat)_\w+/i },
    { name: 'create extension', pattern: /\bcreate\s+extension\b/i },
    { name: 'foreign data wrapper', pattern: /_fdw\b/i },
    { name: 'set role', pattern: /\bset\s+(?:local\s+|session\s+)?role\b/i },
    { name: 'set session authorization', pattern: /\bset\s+(?:(?:local|session)\s+)?session\s+authorization\b/i },
    { name: 'alter system', pattern: /\balter\s+system\b/i },
    { name: 'do block', pattern: /\bdo\s*(?:\$|')/i },
    { name: 'create function', pattern: /\bcreate\s+(?:or\s+replace\s+)?(?:function|procedure)\b/i },
    { name: 'language', pattern: /\blanguage\b/i },
    { name: 'load', pattern: /\bload\b/i },
];

// Matches an import statement of either form: `from X import ...` or `import X, Y as Z`.
const PYTHON_IMPORT = /(?:\bfrom\s+([\w.]+)\s+)?\bimport\s+([^\n;]*)/g;

function findUnsafePythonImport(text: string): string | null {
    for (const [, fromModule, names = ''] of text.matchAll(PYTHON_IMPORT)) {
        const modules = fromModule === undefined ? names.split(',').map((part) => part.trim().split(/\s+/)[0] ?? '') : [fromModule];
        const unsafe = modules.find((name) => !SAFE_PYTHON_MODULES.has(name.split('.')[0] ?? ''));
        if (unsafe !== undefined) {
            return `import ${unsafe}`;
        }
    }
    return null;
}

function firstMatch(rules: Rule[], text: string): string | null {
    return rules.find(({ pattern }) => pattern.test(text))?.name ?? null;
}

function findInProgram(language: Oracle['language'], text: string): string | null {
    const common = firstMatch(COMMON_RULES, text);
    if (common) {
        return common;
    }
    if (language === 'python') {
        return findUnsafePythonImport(text) ?? firstMatch(PYTHON_RULES, text);
    }
    return firstMatch(language === 'node' ? NODE_RULES : POSTGRES_RULES, text);
}

// Returns the first refused construct in the oracle, or null when it is allowed.
export function findRefusedConstruct(
    oracle: Pick<Oracle, 'choiceCode' | 'code' | 'language' | 'setupSql'>,
): string | null {
    const { choiceCode = [], code, language, setupSql = '' } = oracle;
    for (const text of [code, ...choiceCode]) {
        const found = findInProgram(language, text);
        if (found) {
            return found;
        }
    }
    // Setup SQL is Postgres input whatever the oracle language is.
    return setupSql === '' ? null : (firstMatch(COMMON_RULES, setupSql) ?? firstMatch(POSTGRES_RULES, setupSql));
}
