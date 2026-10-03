// The Python pre-filter runs the real host python3 checker (no Docker). It is defense in
// depth in front of the Docker runner sandbox, which is the enforced control.
import { describe, expect, it } from 'vitest';

import { checkPythonOracle } from '../../services/checkPythonOracle.js';

const REFUSED: string[] = [
    // Imports outside the safe set, and import forms
    'import os\nprint(os.getcwd())',
    'import sys',
    'import os, math',
    'import math, os',
    'import math as m, subprocess as s',
    'from os import path',
    'import os.path',
    'from . import sibling',
    'from socket import *',
    'from math import *',
    'import ctypes',
    'import random',
    'from random import randint',
    'from random import _os',
    'import random\nprint(random._os.system("id"))',
    'from string import Formatter',
    'import math\nprint(math._x)',
    'import json\nprint(json._default_encoder)',
    'import collections\nprint(collections._sys)',
    'import collections.abc as _c',
    'import json.tool',
    'import pickle',
    'if True: import os',
    'x = 1; import os',
    'def f():\n    import os',
    // Names Python resolves to a banned builtin (full-width letters are NFKC-normalized)
    '\uFF45\uFF58\uFF45\uFF43("print(1)")',
    '\uFF45\uFF56\uFF41\uFF4C("1")',
    'print(eval("1 + 1"))',
    'exec("print(1)")',
    'compile("1", "f", "eval")',
    'print(open("/etc/passwd").read())',
    'breakpoint()',
    'print(input())',
    'print(getattr(1, "real"))',
    'setattr(1, "x", 1)',
    'print(hasattr(1, "x"))',
    'print(vars(1))',
    'print(globals())',
    'print(locals())',
    'print(dir(1))',
    'print(type(1))',
    'print(object())',
    'print(memoryview(b"x"))',
    'help(1)',
    // Underscore identifiers of every kind
    'print(__builtins__)',
    'print(__name__)',
    '__import__("math")',
    '__import__("o" + "s").system("id")',
    'x = _y',
    'print(().__class__)',
    'print([].__class__.__base__.__subclasses__())',
    'def f(): pass\nprint(f.__globals__)',
    'print(f(_a=1))',
    'def f(_a): pass',
    'def _f(): pass',
    'try:\n    pass\nexcept Exception as _e:\n    pass',
    // Attribute chains into other modules
    'import collections\nprint(collections._sys.modules["o" + "s"])',
    'print(random._os.system("id"))',
    'import typing\nprint(typing.sys.modules)',
    'from typing import sys',
    'import dataclasses\nprint(dataclasses.inspect)',
    'print(sys.modules["o" + "s"].system("id"))',
    'x = os\nx.system("id")',
    'import math\nprint(math.os)',
    // Format-string and accessor routes
    'print("{0._" "_class__}".format(1))',
    'print("{}".format(1))',
    'print("{a}".format_map({"a": 1}))',
    'import string\nprint(string.Formatter().get_field("0.__class__", [1], {}))',
    'from operator import attrgetter',
    'import operator\nprint(operator.methodcaller("x"))',
    'import typing\nprint(typing.get_type_hints(print))',
    // Frame and generator objects
    'g = (i for i in [1])\nprint(g.gi_frame.f_builtins["__imp" + "ort__"])',
    'g = (i for i in [1])\nprint(g.gi_code)',
    'def f(): pass\nprint(f.func_code)',
    // Syntax outside the grammar
    'class A:\n    pass',
    '@print\ndef f(): pass',
    'with open("x") as f:\n    pass',
    'async def f(): pass',
    'def f():\n    yield 1',
    'global x',
    'del x',
    'match 1:\n    case 1:\n        pass',
    'import math\nprint(math.floor(-1.5)',
    'print("a\u0000b")',
    `${'('.repeat(2000)}1${')'.repeat(2000)}`,
];

const ACCEPTED: string[] = [
    'print(0.1 + 0.2)',
    "from decimal import Decimal\nprint(Decimal('0.1') + Decimal('0.2'))",
    'from decimal import Decimal; print(Decimal("0.1") + Decimal("0.2"))',
    'import json\nprint(json.dumps({"a": [1, 2]}, sort_keys=True))',
    'import re\nprint(re.sub(r"\\d", "#", "a1b2"), re.compile("a+").match("aa").group())',
    'import math\nprint(math.floor(-1.5), math.sqrt(16))',
    'import collections.abc\nfrom collections import Counter, OrderedDict\nprint(Counter("aab"))',
    'from itertools import chain\nimport functools\nprint(list(chain([1], [2])), functools.reduce(lambda a, b: a + b, [1, 2, 3]))',
    'from functools import reduce\nprint(reduce(lambda a, b: a + b, map(lambda x: x * 2, filter(lambda x: x > 1, [1, 2, 3]))))',
    'x = 5\nprint(f"{x} and {x!r:>5} and {[1, 2][0]} and {x + 1:03d}")',
    'a = [1, 2, 3]\nprint(a[0], a[-1], a[1:], a[::-1], {"k": 1}["k"])',
    'def add(a, b=2, *rest, **named):\n    return a + b\nprint(add(1), add(1, b=3))',
    'try:\n    int("x")\nexcept ValueError as error:\n    print(str(error))\nelse:\n    print("ok")',
    'total = 0\nfor i in range(3):\n    if i == 1:\n        continue\n    total += i\nprint(total)',
    'n = 3\nwhile n:\n    n -= 1\nprint(n)',
    'print([i * 2 for i in range(3)], {i for i in "aab"}, {k: v for k, v in [(1, 2)]}, list(i for i in [1]))',
    'x, *y = [1, 2, 3]\nprint(x, y, "a" if x else "b", 1 < 2 < 3, not x and y)',
    'print(sorted([3, 1, 2], key=lambda n: -n), "the program copies a list")',
    'assert 1 + 1 == 2\nprint("done")',
    'x: int = 1\nx += 1\nprint(x)',
    'print(0.1 + 0.2 == 0.3, round(0.1 + 0.2, 2), 7 // 2, -7 % 3, 2 ** 10)',
];

describe('checkPythonOracle (real python3; defense in depth, the runner sandbox is the enforced control)', () => {
    it.each(REFUSED)('refuses %j', async (code) => {
        expect(await checkPythonOracle(code)).not.toBeNull();
    });

    it.each(ACCEPTED)('accepts %j', async (code) => {
        expect(await checkPythonOracle(code)).toBeNull();
    });

    it('names what it refused, as Python resolves it', async () => {
        expect(await checkPythonOracle('import json, pickle')).toBe('import pickle');
        expect(await checkPythonOracle('\uFF45\uFF58\uFF45\uFF43("1")')).toBe('name exec');
        expect(await checkPythonOracle('print(random._os)')).toBe('attribute _os');
    });

    it('fails closed when the checker cannot run', async () => {
        const broken = async () => {
            throw new Error('python3 could not start');
        };
        expect(await checkPythonOracle('print(1)', broken)).toMatch(/^python checker unavailable \(/);
    });

    it('fails closed when the checker prints something that is not a verdict', async () => {
        const garbage = async () => ({ stdout: 'not json' });
        const wrongShape = async () => ({ stdout: '{"ok": "yes"}' });
        expect(await checkPythonOracle('print(1)', garbage)).toMatch(/^python checker unavailable \(/);
        expect(await checkPythonOracle('print(1)', wrongShape)).toMatch(/^python checker unavailable \(/);
    });
});
