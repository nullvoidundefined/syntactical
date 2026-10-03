// The oracle allow-list is defense in depth in front of the Docker runner sandbox, which
// is the real control. These tests pin what the static check refuses (every bypass form the
// reviews found) and what it must still accept (realistic quiz oracles).
import { describe, expect, it } from 'vitest';

import { findRefusedConstruct } from '../../services/findRefusedConstruct.js';
import type { OracleLanguage } from '../../types/OracleLanguage.js';

type Form = [language: OracleLanguage, code: string];

const PYTHON_REFUSED: string[] = [
    'import os\nprint(os.getcwd())',
    'import sys\nprint(sys.version)',
    'import os, math',
    'import math, os',
    'import math as m, subprocess as s',
    'from os import path',
    'import os.path',
    'from . import sibling',
    'from socket import *',
    'import ctypes',
    'import pty',
    'import ftplib',
    'import smtplib',
    'import http.server',
    'import urllib.request',
    'import requests',
    'import multiprocessing',
    'import pickle',
    'if True: import os',
    'x = 1; import os',
    '__import__("math")',
    '__import__("o" + "s").system("id")',
    'import importlib\nimportlib.import_module("sub" + "process")',
    'import builtins\nprint(getattr(builtins, "ev" + "al"))',
    'setattr(object, "x", 1)',
    'sys.modules["o" + "s"].system("id")',
    'import math\nprint(vars(math))',
    'print(vars(os)["sys" + "tem"])',
    'print(os.__dict__)',
    'x = os\nx.system("id")',
    'print(().__class__.__base__.__subclasses__())',
    'print(__builtins__)',
    'def f(): pass\nprint(f.__globals__)',
    'print("{0.__class__}".format(1))',
    'print(globals())',
    'print(locals())',
    'print(eval("1 + 1"))',
    'exec("print(1)")',
    'compile("1", "f", "eval")',
    'print(open("/etc/passwd").read())',
    'breakpoint()',
    'print(input())',
    'from operator import attrgetter',
    'import operator\nprint(operator.methodcaller("x"))',
];

const NODE_REFUSED: string[] = [
    "const m = require('net');",
    "require('node:child_process').execSync('id')",
    "createRequire(__filename)('net')",
    "const { createRequire } = require('module');",
    "import net from 'net';",
    "import 'node:dgram';",
    "import('fs').then(console.log);",
    "import('ne' + 't').then(console.log);",
    "require('child_' + 'process');",
    'const n = "net"; require(`${n}`);',
    "const r = require;\nr('net');",
    "process.binding('spawn_sync');",
    "process['binding']('spawn_sync');",
    "process['bin' + 'ding']('spawn_sync');",
    'console.log(process.env);',
    "const f = fetch;\nf('http://x');",
    "fetch('http://x').then(console.log);",
    "new WebSocket('ws://x');",
    "new XMLHttpRequest();",
    'console.log(globalThis);',
    'console.log(global.process);',
    "Reflect.get(globalThis, 'process');",
    "console.log(new Function('return 1')());",
    "console.log(eval('1 + 1'));",
    "console.log([]['constr' + 'uctor']);",
    "console.log([]['const'.concat('ructor')]);",
    "console.log([]['constructor']);",
    'const k = [][`con${"s"}tructor`];',
    'console.log((() => {}).constructor("return 1")());',
    'console.log(module.constructor._load);',
    "Deno.run({ cmd: ['id'] });",
    "Bun.spawn(['id']);",
    'Error.prepareStackTrace = () => 1;',
    'console.log({}.__proto__);',
    'WebAssembly.instantiate(new Uint8Array());',
];

const POSTGRES_REFUSED: string[] = [
    "DO E'BEGIN PERFORM 1; END';",
    "SELECT set_config('role', 'postgres', false);",
    "SELECT set_config('session_authorization', 'postgres', false);",
    "SELECT query_to_xml('SEL' || 'ECT 1', true, false, '');",
    '\\! id',
    'SELECT 1;\n\\i /etc/passwd',
    '   \\o /tmp/out\nSELECT 1;',
    'SELECT 1 \\! id',
    "COPY t FROM PROGRAM 'id';",
    "COPY t FROM /* x */ PROGRAM 'id';",
    'SELECT 1; -- program',
    'COPY t TO STDOUT;',
    "SELECT lo_import('/etc/passwd');",
    "SELECT lo_export(1, '/tmp/x');",
    "SELECT pg_read_file('/etc/passwd');",
    "SELECT pg_read_binary_file('/etc/passwd');",
    "SELECT pg_ls_dir('/');",
    "SELECT dblink('host=x', 'select 1');",
    'CREATE EXTENSION file_fdw;',
    'CREATE SERVER s FOREIGN DATA WRAPPER postgres_fdw;',
    'SET ROLE postgres;',
    'SET SESSION AUTHORIZATION postgres;',
    "ALTER SYSTEM SET archive_command = 'id';",
    'DO $$ BEGIN PERFORM 1; END $$;',
    'CREATE FUNCTION f() RETURNS int AS $$ SELECT 1 $$ LANGUAGE sql;',
    "CREATE OR REPLACE FUNCTION f() RETURNS int AS 'select 1' LANGUAGE sql;",
    'CREATE LANGUAGE plpython3u;',
    "LOAD 'libx';",
];

const ACCEPTED: Form[] = [
    ['python', 'print(0.1 + 0.2)'],
    ['python', "from decimal import Decimal\nprint(Decimal('0.1') + Decimal('0.2'))"],
    ['python', 'from decimal import Decimal; print(Decimal("0.1") + Decimal("0.2"))'],
    ['python', 'import math\nprint(math.floor(-1.5))'],
    ['python', 'from collections import Counter\nprint(Counter("aab"))'],
    ['python', 'from itertools import chain\nimport functools, json\nprint(json.dumps(list(chain([1], [2]))))'],
    ['python', 'import re\nprint(re.sub(r"\\d", "#", "a1b2"))'],
    ['python', 'x = [3, 1, 2]\nx.sort()\nprint(x, "the program copies a list")'],
    ['python', 'def make(x):\n    return [x, x * 2]\nprint(make(2))'],
    ['python', 'print([i * 2 for i in range(3)], {"a": 1}["a"], ["b", "a"])'],
    ['node', 'console.log([1, 2, 3].map((n) => n * 2));'],
    ['node', 'console.log(0.1 + 0.2, typeof null, [] + {});'],
    ['node', "console.log(['b', 'a'].sort(), JSON.stringify({ a: [1] }), { a: 1 }.a);"],
    ['node', 'const s = new Set([1, 1, 2]);\nconsole.log(s.size, new Map([[1, "a"]]).get(1));'],
    ['node', 'Promise.resolve(1).then(console.log);\nconsole.log("sync");'],
    ['node', 'console.log(new Date(0).toISOString(), Number("12"), String(5).padStart(3, "0"));'],
    ['node', 'class A { get() { return this; } }\nconsole.log(typeof new A().get());'],
    ['postgres', 'SELECT 1 + 1'],
    ['postgres', "SELECT 'abc' ~ '^a' AS starts, 'programming' AS word"],
    ['postgres', 'SELECT a, count(*) FROM t GROUP BY a ORDER BY a'],
];

describe('findRefusedConstruct (defense in depth; the runner sandbox is the real control)', () => {
    it.each(PYTHON_REFUSED)('refuses Python: %s', async (code) => {
        expect(await findRefusedConstruct({ code, language: 'python' })).not.toBeNull();
    });

    it.each(NODE_REFUSED)('refuses Node: %s', async (code) => {
        expect(await findRefusedConstruct({ code, language: 'node' })).not.toBeNull();
    });

    it.each(POSTGRES_REFUSED)('refuses Postgres: %s', async (code) => {
        expect(await findRefusedConstruct({ code, language: 'postgres' })).not.toBeNull();
    });

    it.each(POSTGRES_REFUSED)('refuses Postgres in setupSql: %s', async (setupSql) => {
        expect(await findRefusedConstruct({ code: 'SELECT 1', language: 'postgres', setupSql })).not.toBeNull();
    });

    it('checks every choice program, not only the main one', async () => {
        const choiceCode = ['print(1)', 'import os'];
        expect(await findRefusedConstruct({ choiceCode, code: 'print(1)', language: 'python' })).toBe('import os');
    });

    it('names the construct it refused', async () => {
        expect(await findRefusedConstruct({ code: 'import socket', language: 'python' })).toBe('socket');
        expect(await findRefusedConstruct({ code: 'import json, pickle', language: 'python' })).toBe('import pickle');
        expect(await findRefusedConstruct({ code: "createRequire(__filename)('net')", language: 'node' })).toBe(
            'identifier createRequire',
        );
    });

    it.each(ACCEPTED)('accepts a realistic %s oracle: %s', async (language, code) => {
        expect(await findRefusedConstruct({ code, language })).toBeNull();
    });

    it('accepts Postgres setup SQL for a table', async () => {
        const setupSql = 'CREATE TABLE t (a int); INSERT INTO t VALUES (1), (2);';
        expect(await findRefusedConstruct({ code: 'SELECT sum(a) FROM t', language: 'postgres', setupSql })).toBeNull();
    });
});
