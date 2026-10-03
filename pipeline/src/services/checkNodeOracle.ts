// Strict pre-filter for a drafted Node oracle. The program is parsed with acorn (which
// resolves unicode escapes into Identifier.name) and the whole tree is walked: no module,
// process, or global-object names, no reflection, no string-built property access, and
// computed member access only with an index that is provably a number. Defense in depth
// only; the Docker runner sandbox is the enforced control. Over-refusal is fine, because a
// refused question falls back to the judged path.
import { parse } from 'acorn';

type AstNode = { type: string } & Record<string, unknown>;

const BANNED_IDENTIFIERS = new Set([
    'Atomics',
    'Bun',
    'Deno',
    'Function',
    'Proxy',
    'Reflect',
    'SharedArrayBuffer',
    'WebAssembly',
    'WebSocket',
    'XMLHttpRequest',
    '__proto__',
    'arguments',
    'captureStackTrace',
    'constructor',
    'createRequire',
    'eval',
    'exports',
    'fetch',
    'getFunction',
    'getThis',
    'global',
    'globalThis',
    'module',
    'prepareStackTrace',
    'process',
    'prototype',
    'queueMicrotask',
    'require',
    'setImmediate',
    'setInterval',
    'setTimeout',
]);

// Also refused as the property of a non-computed member access or a destructured key.
const BANNED_MEMBERS = new Set([
    ...BANNED_IDENTIFIERS,
    '__defineGetter__',
    '__defineSetter__',
    '__lookupGetter__',
    '__lookupSetter__',
    'apply',
    'bind',
    'call',
    'callee',
    'caller',
    'defineProperties',
    'fromCharCode',
    'fromCodePoint',
    'defineProperty',
    'getOwnPropertyDescriptor',
    'getOwnPropertyDescriptors',
    'getOwnPropertyNames',
    'getOwnPropertySymbols',
    'getPrototypeOf',
    'setPrototypeOf',
]);

const REFUSED_NODE_TYPES = new Set([
    'ImportDeclaration',
    'ImportExpression',
    'MetaProperty',
    'TaggedTemplateExpression',
    'WithStatement',
]);

const LENIENT_ONLY_OPERATORS = new Set(['-', '*', '/', '%']);
const SIGN_OPERATORS = new Set(['-', '+']);
const COUNTER_STEP_OPERATORS = new Set(['+=', '-=']);

function isNode(value: unknown): value is AstNode {
    return typeof value === 'object' && value !== null && typeof (value as { type?: unknown }).type === 'string';
}

function childrenOf(node: AstNode): AstNode[] {
    const found: AstNode[] = [];
    for (const [key, value] of Object.entries(node)) {
        if (key === 'type') {
            continue;
        }
        for (const item of Array.isArray(value) ? value : [value]) {
            if (isNode(item)) {
                found.push(item);
            }
        }
    }
    return found;
}

function walk(node: AstNode, visit: (each: AstNode) => void): void {
    visit(node);
    for (const child of childrenOf(node)) {
        walk(child, visit);
    }
}

function isNumberLiteral(node: unknown): boolean {
    return isNode(node) && node.type === 'Literal' && typeof node.value === 'number';
}

// Every identifier a binding or assignment pattern introduces or writes.
function namesIn(pattern: unknown): string[] {
    if (!isNode(pattern)) {
        return [];
    }
    switch (pattern.type) {
        case 'Identifier':
            return [pattern.name as string];
        case 'ObjectPattern':
            return (pattern.properties as AstNode[]).flatMap((property) =>
                namesIn(property.type === 'RestElement' ? property.argument : property.value),
            );
        case 'ArrayPattern':
            return (pattern.elements as unknown[]).flatMap(namesIn);
        case 'RestElement':
            return namesIn(pattern.argument);
        case 'AssignmentPattern':
            return namesIn(pattern.left);
        default:
            return [];
    }
}

// A `for (let|var i = <number>; ...)` counter qualifies as a numeric index only if every
// declaration of that name in the program is such a counter and nothing ever assigns it
// anything but a numeric step, so it can never hold a string.
function findCounters(root: AstNode): Set<string> {
    const declarations = new Map<string, number>();
    const counterDeclarations = new Map<string, number>();
    const tainted = new Set<string>();
    const countIn = (counts: Map<string, number>, names: string[]): void => {
        for (const name of names) {
            counts.set(name, (counts.get(name) ?? 0) + 1);
        }
    };
    walk(root, (node) => {
        switch (node.type) {
            case 'VariableDeclarator':
                countIn(declarations, namesIn(node.id));
                break;
            case 'FunctionDeclaration':
            case 'FunctionExpression':
            case 'ArrowFunctionExpression':
                countIn(declarations, namesIn(node.id));
                countIn(declarations, (node.params as unknown[]).flatMap(namesIn));
                break;
            case 'ClassDeclaration':
            case 'ClassExpression':
                countIn(declarations, namesIn(node.id));
                break;
            case 'CatchClause':
                countIn(declarations, namesIn(node.param));
                break;
            case 'ForStatement': {
                const init = node.init;
                if (isNode(init) && init.type === 'VariableDeclaration' && init.kind !== 'const') {
                    for (const declarator of init.declarations as AstNode[]) {
                        if (isNode(declarator.id) && declarator.id.type === 'Identifier' && isNumberLiteral(declarator.init)) {
                            countIn(counterDeclarations, [declarator.id.name as string]);
                        }
                    }
                }
                break;
            }
            case 'ForInStatement':
            case 'ForOfStatement':
                if (isNode(node.left) && node.left.type !== 'VariableDeclaration') {
                    namesIn(node.left).forEach((name) => tainted.add(name));
                }
                break;
            case 'AssignmentExpression': {
                const isStep =
                    COUNTER_STEP_OPERATORS.has(node.operator as string) &&
                    isNode(node.left) &&
                    node.left.type === 'Identifier' &&
                    isNumberLiteral(node.right);
                if (!isStep) {
                    namesIn(node.left).forEach((name) => tainted.add(name));
                }
                break;
            }
            default:
        }
    });
    return new Set(
        [...counterDeclarations].filter(([name, count]) => declarations.get(name) === count && !tainted.has(name)).map(([name]) => name),
    );
}

function isLengthMember(node: AstNode): boolean {
    const { computed, property, type } = node as { computed?: boolean; property?: unknown; type: string };
    return type === 'MemberExpression' && !computed && isNode(property) && property.type === 'Identifier' && property.name === 'length';
}

// True only for an expression that always evaluates to a number.
function isStrictNumber(node: AstNode, counters: Set<string>): boolean {
    switch (node.type) {
        case 'Literal':
            return typeof node.value === 'number';
        case 'Identifier':
            return counters.has(node.name as string);
        case 'UnaryExpression':
            return SIGN_OPERATORS.has(node.operator as string) && isNode(node.argument) && isStrictNumber(node.argument, counters);
        case 'BinaryExpression':
            return isArithmetic(node, counters);
        default:
            return false;
    }
}

// A strict number, or a `.length` (a number for the built-ins quizzes use) that may only
// appear next to an operator that cannot concatenate two strings into a property name.
function isLenientNumber(node: AstNode, counters: Set<string>): boolean {
    return isStrictNumber(node, counters) || isLengthMember(node);
}

function isArithmetic(node: AstNode, counters: Set<string>): boolean {
    const { left, operator, right } = node as unknown as { left: unknown; operator: string; right: unknown };
    if (!isNode(left) || !isNode(right)) {
        return false;
    }
    if (LENIENT_ONLY_OPERATORS.has(operator)) {
        return isLenientNumber(left, counters) && isLenientNumber(right, counters);
    }
    // `+` is arithmetic only when one side is surely a number, so two `.length` strings never join.
    return (
        operator === '+' &&
        isLenientNumber(left, counters) &&
        isLenientNumber(right, counters) &&
        (isStrictNumber(left, counters) || isStrictNumber(right, counters))
    );
}

function findRefusedMember(node: AstNode, counters: Set<string>): string | null {
    const { computed, property } = node as unknown as { computed: boolean; property: AstNode };
    if (computed) {
        return isStrictNumber(property, counters) ? null : 'computed member access';
    }
    if (property.type === 'Identifier') {
        const name = property.name as string;
        if (BANNED_MEMBERS.has(name) || name.startsWith('_')) {
            return `member ${name}`;
        }
    }
    return null;
}

function findRefusedPatternKey(property: AstNode): string | null {
    if (property.type !== 'Property') {
        return null;
    }
    const { computed, key } = property as unknown as { computed: boolean; key: AstNode };
    if (computed) {
        return 'computed destructuring key';
    }
    const name = key.type === 'Identifier' ? (key.name as string) : String(key.value);
    return BANNED_MEMBERS.has(name) || name.startsWith('_') ? `destructured key ${name}` : null;
}

function findRefusedNode(node: AstNode, counters: Set<string>): string | null {
    if (REFUSED_NODE_TYPES.has(node.type)) {
        return `syntax ${node.type}`;
    }
    switch (node.type) {
        case 'Identifier':
            return BANNED_IDENTIFIERS.has(node.name as string) ? `identifier ${node.name as string}` : null;
        case 'MemberExpression':
            return findRefusedMember(node, counters);
        case 'ObjectPattern':
            for (const property of node.properties as AstNode[]) {
                const refused = findRefusedPatternKey(property);
                if (refused) {
                    return refused;
                }
            }
            return null;
        default:
            return null;
    }
}

function findRefusedIn(node: AstNode, counters: Set<string>): string | null {
    // A class constructor is written `constructor(...) {}`; its own key is the one allowed use of that name.
    const skipped = node.type === 'MethodDefinition' && node.kind === 'constructor' && !node.computed ? node.key : undefined;
    const refused = findRefusedNode(node, counters);
    if (refused) {
        return refused;
    }
    for (const child of childrenOf(node)) {
        if (child === skipped) {
            continue;
        }
        const found = findRefusedIn(child, counters);
        if (found) {
            return found;
        }
    }
    return null;
}

// Returns the reason the program is refused, or null when it is inside the allowed grammar.
export function checkNodeOracle(code: string): string | null {
    try {
        // The runner wraps the program as an async function body, so top-level await and return parse.
        const program = parse(code, {
            allowAwaitOutsideFunction: true,
            allowReturnOutsideFunction: true,
            ecmaVersion: 'latest',
            sourceType: 'script',
        }) as unknown as AstNode;
        return findRefusedIn(program, findCounters(program));
    } catch (error) {
        return error instanceof SyntaxError ? 'does not parse' : 'too complex to check';
    }
}
