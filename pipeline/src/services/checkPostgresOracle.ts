// Strict pre-filter for drafted Postgres SQL (an oracle's code, choice code, or setup SQL).
// Comments are replaced with a space before the keyword rules run, so `DO/**/$$` and
// `SET/**/ROLE` read as the statements they are; the rules also run on the raw text,
// because a `--` inside a string literal would otherwise hide what follows it. Anything
// that can spell a name another way (unicode escapes, backslashes, dollar quotes) is
// refused outright. Defense in depth only; the Docker runner sandbox is the enforced
// control. Over-refusal is fine: a refused question falls back to the judged path.

interface Rule {
    name: string;
    pattern: RegExp;
}

const RULES: Rule[] = [
    { name: 'unicode escape', pattern: /\bU&/i },
    { name: 'backslash', pattern: /\\/ },
    { name: 'dollar quote', pattern: /\$[^\d\s$]*\$/u },
    { name: 'program', pattern: /\bprogram\b/i },
    { name: 'copy', pattern: /\bcopy\b/i },
    { name: 'large object', pattern: /\blo_\w+/i },
    { name: 'server file function', pattern: /\bpg_(?:read|ls|stat)_\w+/i },
    { name: 'dblink', pattern: /dblink/i },
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

// Postgres block comments nest, so strip the innermost ones until none are left.
const INNERMOST_BLOCK_COMMENT = /\/\*(?:(?!\/\*|\*\/)[\s\S])*\*\//g;
const LINE_COMMENT = /--[^\n\r]*/g;

function stripComments(text: string): string {
    let current = text;
    for (let previous = ''; previous !== current; ) {
        previous = current;
        current = current.replace(INNERMOST_BLOCK_COMMENT, ' ');
    }
    return current.replace(LINE_COMMENT, ' ');
}

function firstMatch(text: string): string | null {
    return RULES.find(({ pattern }) => pattern.test(text))?.name ?? null;
}

// Returns the reason the SQL is refused, or null when it is allowed.
export function checkPostgresOracle(sql: string): string | null {
    const stripped = stripComments(sql);
    // An unterminated comment opener is ambiguous to a reader; refuse it.
    if (stripped.includes('/*') || stripped.includes('*/')) {
        return 'unbalanced comment';
    }
    return firstMatch(sql) ?? firstMatch(stripped);
}
