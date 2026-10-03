// Strict pre-filter for a drafted Node oracle. The program is parsed with acorn (which
// resolves unicode escapes into Identifier.name) and the whole tree is walked: no module,
// process, or global-object names, no reflection, no string-built property access, and
// computed member access only with an index that is provably a number. Defense in depth
// only; the Docker runner sandbox is the enforced control. Over-refusal is fine, because a
// refused question falls back to the judged path.
import { parse } from 'acorn';

// The fields of an acorn node this check reads; every node has a `type`, the rest depend on it.
interface AstNode {
    type: string;
    argument?: AstNode | null;
    computed?: boolean;
    declarations?: AstNode[];
    elements?: (AstNode | null)[];
    id?: AstNode | null;
    init?: AstNode | null;
    key?: AstNode;
    kind?: string;
    left?: AstNode;
    name?: string;
    operator?: string;
    param?: AstNode | null;
    params?: AstNode[];
    properties?: AstNode[];
    property?: AstNode;
    right?: AstNode;
    value?: unknown;
}

const NO_NODE: AstNode = { type: '' };

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
    'defineProperty',
    'fromCharCode',
    'fromCodePoint',
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

function isNumberLiteral(node: AstNode | null | undefined): boolean {
    const { type, value } = node ?? NO_NODE;
    return type === 'Literal' && typeof value === 'number';
}

// Every identifier a binding or assignment pattern introduces or writes.
function namesIn(pattern: AstNode | null | undefined): string[] {
    const { argument, elements, left, name, properties, type } = pattern ?? NO_NODE;
    switch (type) {
        case 'Identifier':
            return name === undefined ? [] : [name];
        case 'ObjectPattern':
            return (properties ?? []).flatMap((property) => {
                const { argument: rest, type: kind, value } = property;
                return namesIn(kind === 'RestElement' ? rest : (value as AstNode));
            });
        case 'ArrayPattern':
            return (elements ?? []).flatMap((element) => namesIn(element));
        case 'RestElement':
            return namesIn(argument);
        case 'AssignmentPattern':
            return namesIn(left);
        default:
            return [];
    }
}

interface Tally {
    counterDeclarations: Map<string, number>;
    declarations: Map<string, number>;
    tainted: Set<string>;
}

function countNames(counts: Map<string, number>, names: string[]): void {
    for (const name of names) {
        counts.set(name, (counts.get(name) ?? 0) + 1);
    }
}

// `for (let|var i = <number>; ...)`: each such declarator is a candidate counter.
function tallyForInit(init: AstNode | null | undefined, tally: Tally): void {
    const { declarations = [], kind, type } = init ?? NO_NODE;
    if (type !== 'VariableDeclaration' || kind === 'const') {
        return;
    }
    for (const declarator of declarations) {
        const { id, init: start } = declarator;
        const { name, type: idType } = id ?? NO_NODE;
        if (idType === 'Identifier' && name !== undefined && isNumberLiteral(start)) {
            countNames(tally.counterDeclarations, [name]);
        }
    }
}

function tallyAssignment(node: AstNode, tally: Tally): void {
    const { left, operator, right } = node;
    const isStep = COUNTER_STEP_OPERATORS.has(operator ?? '') && left?.type === 'Identifier' && isNumberLiteral(right);
    if (!isStep) {
        namesIn(left).forEach((name) => tally.tainted.add(name));
    }
}

function tallyNode(node: AstNode, tally: Tally): void {
    const { id, left, param, params, type } = node;
    switch (type) {
        case 'VariableDeclarator':
        case 'ClassDeclaration':
        case 'ClassExpression':
            countNames(tally.declarations, namesIn(id));
            break;
        case 'FunctionDeclaration':
        case 'FunctionExpression':
        case 'ArrowFunctionExpression':
            countNames(tally.declarations, [...namesIn(id), ...(params ?? []).flatMap((each) => namesIn(each))]);
            break;
        case 'CatchClause':
            countNames(tally.declarations, namesIn(param));
            break;
        case 'ForStatement':
            tallyForInit(node.init, tally);
            break;
        case 'ForInStatement':
        case 'ForOfStatement':
            if (left !== undefined && left.type !== 'VariableDeclaration') {
                namesIn(left).forEach((name) => tally.tainted.add(name));
            }
            break;
        case 'AssignmentExpression':
            tallyAssignment(node, tally);
            break;
        default:
    }
}

// A `for` counter qualifies as a numeric index only if every declaration of that name in the
// program is such a counter and nothing ever assigns it anything but a numeric step, so it can
// never hold a string.
function findCounters(root: AstNode): Set<string> {
    const tally: Tally = { counterDeclarations: new Map(), declarations: new Map(), tainted: new Set() };
    walk(root, (node) => tallyNode(node, tally));
    const { counterDeclarations, declarations, tainted } = tally;
    return new Set(
        [...counterDeclarations]
            .filter(([name, count]) => declarations.get(name) === count && !tainted.has(name))
            .map(([name]) => name),
    );
}

function isLengthMember(node: AstNode): boolean {
    const { computed, property, type } = node;
    const { name, type: propertyType } = property ?? NO_NODE;
    return type === 'MemberExpression' && !computed && propertyType === 'Identifier' && name === 'length';
}

// True only for an expression that always evaluates to a number.
function isStrictNumber(node: AstNode, counters: Set<string>): boolean {
    const { argument, name, operator, type, value } = node;
    switch (type) {
        case 'Literal':
            return typeof value === 'number';
        case 'Identifier':
            return name !== undefined && counters.has(name);
        case 'UnaryExpression':
            return SIGN_OPERATORS.has(operator ?? '') && !!argument && isStrictNumber(argument, counters);
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
    const { left, operator = '', right } = node;
    if (!left || !right) {
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
    const { computed, property } = node;
    if (computed) {
        return property && isStrictNumber(property, counters) ? null : 'computed member access';
    }
    const { name, type } = property ?? NO_NODE;
    if (type === 'Identifier' && name !== undefined && (BANNED_MEMBERS.has(name) || name.startsWith('_'))) {
        return `member ${name}`;
    }
    return null;
}

function findRefusedPatternKey(property: AstNode): string | null {
    const { computed, key, type } = property;
    if (type !== 'Property') {
        return null;
    }
    if (computed) {
        return 'computed destructuring key';
    }
    const { name, type: keyType, value } = key ?? NO_NODE;
    const keyName = keyType === 'Identifier' ? String(name) : String(value);
    return BANNED_MEMBERS.has(keyName) || keyName.startsWith('_') ? `destructured key ${keyName}` : null;
}

function findRefusedNode(node: AstNode, counters: Set<string>): string | null {
    const { name, properties, type } = node;
    if (REFUSED_NODE_TYPES.has(type)) {
        return `syntax ${type}`;
    }
    switch (type) {
        case 'Identifier':
            return name !== undefined && BANNED_IDENTIFIERS.has(name) ? `identifier ${name}` : null;
        case 'MemberExpression':
            return findRefusedMember(node, counters);
        case 'ObjectPattern':
            for (const property of properties ?? []) {
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
    const { computed, key, kind, type } = node;
    // A class constructor is written `constructor(...) {}`; its own key is the one allowed use of that name.
    const skipped = type === 'MethodDefinition' && kind === 'constructor' && !computed ? key : undefined;
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
