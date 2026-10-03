// The Node pre-filter parses with acorn. It is defense in depth in front of the Docker
// runner sandbox, which is the enforced control.
import { describe, expect, it } from 'vitest';

import { checkNodeOracle } from '../../services/checkNodeOracle.js';

const REFUSED: string[] = [
    // Modules and the process
    "const m = require('net');",
    "require('node:child_process').execSync('id')",
    "const r = require;\nr('net');",
    "createRequire(__filename)('net')",
    "const { createRequire } = require('module');",
    'console.log(module.exports, exports);',
    "process.binding('spawn_sync');",
    "process['binding']('spawn_sync');",
    "process['bin' + 'ding']('spawn_sync');",
    'console.log(process.env);',
    '\\u0072equire("net");',
    'pr\\u006fcess.binding("spawn_sync");',
    'console.log([].\\u0063onstructor);',
    'console.log(global.process, globalThis);',
    'console.log(this.process);',
    // Syntax that loads or evals code
    "import net from 'net';",
    "import 'node:dgram';",
    "import('fs').then(console.log);",
    "import('ne' + 't').then(console.log);",
    'console.log(import.meta);',
    "console.log(new Function('return 1')());",
    "console.log(eval('1 + 1'));",
    "console.log(Reflect.get(globalThis, 'process'));",
    'new Proxy({}, {});',
    'with ({}) { console.log(1); }',
    'console.log(String.raw`x`);',
    'console.log(arguments);',
    "arguments[1]('net');",
    'function f() { return arguments[0]; }',
    // `this` is the global object in the runner, so it is refused outside a class body
    "console.log(Object.entries(this).find(([k]) => k === 'fe' + 'tch')[1]);",
    'console.log((function () { return this; })());',
    'console.log(this);',
    'const f = () => this;\nconsole.log(f());',
    'function f() { return this === undefined; }\nconsole.log(f());',
    'console.log({ get x() { return this; } }.x);',
    'class A extends (function () { return this; })() {}',
    'class A { static [(() => this)()] = 1; }',
    // Enumerating or copying an object's keys
    'console.log(Object.keys({ a: 1 }));',
    'console.log(Object.values({ a: 1 }));',
    'console.log(Object.entries({ a: 1 }));',
    'console.log(Object.fromEntries([["a", 1]]));',
    'console.log(Object.assign({}, { a: 1 }));',
    // Network and runtimes
    "const f = fetch;\nf('http://x');",
    "fetch('http://x').then(console.log);",
    "new WebSocket('ws://x');",
    'new XMLHttpRequest();',
    "Deno.run({ cmd: ['id'] });",
    "Bun.spawn(['id']);",
    'WebAssembly.instantiate(new Uint8Array());',
    'new SharedArrayBuffer(8);',
    'Atomics.wait(new Int32Array(8), 0, 0);',
    // Timers and stack-trace hooks
    "setTimeout(() => console.log('late'), 0);",
    'setInterval(() => 1, 1);',
    'queueMicrotask(() => 1);',
    'Error.prepareStackTrace = () => 1;',
    // String-built and nested property keys
    "console.log([]['constructor']);",
    "console.log([]['constr' + 'uctor']);",
    "console.log([]['const'.concat('ructor')]);",
    "const k = 'constr' + 'uctor';\n[][k][k]('return proc' + 'ess')();",
    "const a = { x: 'constructor' };\nconsole.log([][a['x']]);",
    "const o = { a: { b: 'constructor' } };\nconsole.log([][o.a.b]);",
    'const k = [][`con${"s"}tructor`];',
    "console.log([][{ length: 'constructor' }.length]);",
    "const o = { length: 'constr' };\nconsole.log([][o.length + 'uctor']);",
    "console.log([][({ length: 'constr' }).length + ({ length: 'uctor' }).length]);",
    'console.log([][1 + {}.x]);',
    'const i = 0;\nconsole.log([][i]);',
    // Unicode escapes, built names, and string timers
    "console.log([]['\\u0063onstructor']);",
    'console.log([][String.fromCharCode(99, 111, 110)]);',
    'console.log(String.fromCharCode(99, 111, 110));',
    'console.log(String.fromCodePoint(99));',
    "setTimeout('console.log(1)', 0);",
    'const fn = function () {};\nconsole.log(Object.getPrototypeOf(fn));',
    // Reflection without a computed key
    "console.log(Object.getOwnPropertyDescriptor(Object.getPrototypeOf(function () {}), 'constr' + 'uctor').value('return proc' + 'ess')());",
    'console.log(Object.getPrototypeOf(async function () {}));',
    'Object.setPrototypeOf({}, null);',
    'Object.defineProperty({}, "a", { value: 1 });',
    'console.log(Object.getOwnPropertyNames(Object));',
    'console.log((() => {}).constructor("return 1")());',
    'console.log([].constructor);',
    'console.log({}.__proto__);',
    'console.log(Array.prototype);',
    'console.log(console.log.call(null, 1));',
    'console.log(console.log.bind(null)(1));',
    'console.log(Math.max.apply(null, [1]));',
    "({}).__defineGetter__('x', () => 1);",
    // Destructuring keys
    'const { constructor: c } = [];',
    "const { ['constructor']: c } = [];",
    "const { 'constructor': c } = [];",
    'const { getPrototypeOf } = Object;',
    'const { _hidden } = { _hidden: 1 };',
    'function f({ [k]: v }) {}',
    // Underscore members
    'class A { constructor() { this._x = 1; } }',
    'console.log({}._private);',
    // A counter that is not provably numeric
    "for (let i = 0; i < 3; i++) { i = 'constructor'; console.log([][i]); }",
    "for (let i = 0; i < 1; i++) { const f = (i) => [][i]; f('constructor'); }",
    "for (var i = 0; i < 1; i++) {}\nvar i = 'constructor';\nconsole.log([][i]);",
    "for (let i = 0; i < 1; i++) {}\n[i] = ['constructor'];\nconsole.log([][i]);",
    "for (let i = 0; i < 1; i++) { i += 'x'; }\nconsole.log([][i]);",
    "let k = 'constructor';\nfor (k in { a: 1 }) {}\nfor (let i = 0; i < 1; i++) { console.log([][k]); }",
    'console.log([][undeclared]);',
    "for (let i = 'a'; i < 'b'; i++) { console.log([][i]); }",
    // Does not parse
    'console.log(',
    'const = 1;',
];

const ACCEPTED: string[] = [
    'console.log([1, 2, 3].map((n) => n * 2));',
    'console.log(0.1 + 0.2, typeof null, [] + {});',
    "console.log(['b', 'a'].sort(), JSON.stringify({ a: [1] }), Array.from({ length: 2 }, (_, i) => i));",
    'const s = new Set([1, 1, 2]);\nconsole.log(s.size, new Map([[1, "a"]]).get(1));',
    'Promise.resolve(1).then(console.log);\nconsole.log("sync");',
    'console.log(await Promise.resolve(2));',
    'return 1;',
    'console.log(new Date(0).toISOString(), Number("12"), String(5).padStart(3, "0"));',
    'class A {\n  constructor() { this.n = 1; }\n  inc() { return () => this.n + 1; }\n}\nconsole.log(new A().inc()());',
    'console.log([1, 2, 3].reduce((a, b) => a + b, 0), [1, 2, 3].filter((n) => n > 1), [3, 1].map(String));',
    'const arr = [10, 20, 30];\nfor (let i = 0; i < arr.length; i++) { console.log(arr[i]); }',
    'const arr = [10, 20, 30];\nfor (let i = 0; i < arr.length; i++) { console.log(arr[i]); }\nfor (let i = 2; i >= 0; i--) { console.log(arr[i], arr[i - 1], arr[i + 1]); }',
    'const arr = [10, 20, 30];\nconsole.log(arr[0], arr[1 + 1], arr[-1], arr[arr.length - 1], arr[arr.length - 2]);',
    'const arr = [1, 2, 3];\nfor (var j = 0; j < 3; j += 1) { console.log(arr[j] * 2); }',
    'class A {\n  constructor(x) { this.x = x; }\n  get() { return this.x; }\n}\nconsole.log(new A(1).get());',
    'const [a, b] = [1, 2];\nconst { x, y: z } = { x: 1, y: 2 };\nconsole.log(a, b, x, z, ...[1, 2]);',
    'const name = "w";\nconsole.log(`hello ${name} ${1 + 1}`);',
    'try { null.x; } catch (error) { console.log(error.name); } finally { console.log("done"); }',
    'console.log(/a+/.test("aa"), "a-b".split("-"), 10n ** 2n, a?.b);\nvar a;',
    'label: for (const n of [1, 2]) { if (n === 1) continue label; console.log(n); }',
    'const o = { a: 1, get b() { return 2; } };\nconsole.log(o.a, o.b, "a" in o, delete o.a);',
    'console.log(Number.MAX_SAFE_INTEGER + 2, 0.1 * 3, parseInt("08"), [10, 9, 1].sort());',
];

describe('checkNodeOracle (acorn; defense in depth, the runner sandbox is the enforced control)', () => {
    it.each(REFUSED)('refuses %j', (code) => {
        expect(checkNodeOracle(code)).not.toBeNull();
    });

    it.each(ACCEPTED)('accepts %j', (code) => {
        expect(checkNodeOracle(code)).toBeNull();
    });

    it('names what it refused, as acorn resolves it', () => {
        expect(checkNodeOracle('\\u0072equire("net")')).toBe('identifier require');
        expect(checkNodeOracle('console.log({}._x)')).toBe('member _x');
        expect(checkNodeOracle("[][k]['x']")).toBe('computed member access');
        expect(checkNodeOracle('console.log(')).toBe('does not parse');
    });

    it('refuses a program too deeply nested to check, instead of crashing', () => {
        const nested = `${'['.repeat(100_000)}${']'.repeat(100_000)}`;
        expect(checkNodeOracle(nested)).not.toBeNull();
    });
});
