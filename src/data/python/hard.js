// Python / Hard question bank.
// Focused on interpreter internals, concurrency model, and the protocol
// hooks that distinguish Python from surface-level scripting knowledge.

export const pythonHard = [
  {
    id: 'py-hard-01',
    type: 'mc',
    prompt: 'What algorithm does Python use to compute a class\u2019s Method Resolution Order (MRO)?',
    choices: [
      'Plain depth-first search',
      'Breadth-first search',
      'C3 linearization',
      'Topological sort of import order',
    ],
    answerIndex: 2,
    query: {
      title: 'C3 linearization',
      syntax: 'ClassName.__mro__',
      explanation:
        'Python 3 (new-style classes) resolves multiple inheritance with the C3 linearization algorithm, which guarantees a consistent order: a class always appears before its parents, and the relative order of base classes as written is preserved. You can inspect it directly via `Cls.__mro__` or `Cls.mro()`.',
      tags: ['classes', 'mro', 'internals'],
    },
  },
  {
    id: 'py-hard-02',
    type: 'bool',
    prompt: '`asyncio.gather()` runs its coroutines in parallel across multiple OS threads.',
    answer: false,
    query: {
      title: 'asyncio concurrency model',
      syntax: 'await asyncio.gather(coro1(), coro2())',
      explanation:
        "`asyncio` is single-threaded cooperative concurrency. `gather` schedules coroutines on the same event loop, and they interleave at `await` points, they never run truly in parallel on separate cores. True parallelism for CPU-bound work still requires `multiprocessing` or a thread pool for I/O-bound blocking calls.",
      tags: ['asyncio', 'concurrency'],
    },
  },
  {
    id: 'py-hard-03',
    type: 'mc',
    prompt: 'What does `functools.lru_cache(maxsize=None)` do?',
    code: '@functools.lru_cache(maxsize=None)\ndef fib(n): ...',
    choices: [
      'Disables caching entirely',
      'Caches results with no upper bound on entries',
      'Caches only calls made with default arguments',
      'Limits the cache to exactly zero entries',
    ],
    answerIndex: 1,
    query: {
      title: 'functools.lru_cache',
      syntax: '@functools.lru_cache(maxsize=128, typed=False)',
      explanation:
        "`maxsize` bounds how many distinct argument combinations are memoized before the least-recently-used entry is evicted. Passing `None` removes the bound, turning it into a plain unbounded memoization cache, useful for pure functions but a memory leak risk if the argument space is unbounded.",
      tags: ['functools', 'caching'],
    },
  },
  {
    id: 'py-hard-04',
    type: 'mc',
    prompt: 'What is the Global Interpreter Lock (GIL)?',
    choices: [
      'A static type-checking layer',
      'A mutex that allows only one thread to execute Python bytecode at a time',
      'The garbage collector\u2019s lock on the heap',
      'A lock that exists only in Python 2',
    ],
    answerIndex: 1,
    query: {
      title: 'The GIL',
      syntax: 'sys.getswitchinterval() / sys.setswitchinterval()',
      explanation:
        "CPython's GIL serializes bytecode execution across threads in one process, which simplifies the interpreter's memory management but means CPU-bound multi-threaded Python code rarely gets a speedup from more threads. It still exists in CPython 3, and I/O-bound threads benefit because the GIL is released during blocking I/O calls.",
      tags: ['gil', 'concurrency', 'internals'],
    },
  },
  {
    id: 'py-hard-05',
    type: 'mc',
    prompt: 'In CPython, what is true about `id(256) == id(256)`?',
    code: 'a = 256\nb = 256\nid(a) == id(b)',
    choices: [
      'Always `True`, due to small-integer interning',
      'Always `False`',
      'Undefined, depends on the machine\u2019s word size',
      'Raises `TypeError`',
    ],
    answerIndex: 0,
    query: {
      title: 'Small integer interning',
      syntax: '',
      explanation:
        "CPython pre-allocates and caches integers in the range -5 to 256 at startup, so every reference to one of these values inside that range points to the same object. This is a CPython implementation detail, not a language guarantee, other implementations are free to intern differently or not at all.",
      tags: ['internals', 'cpython'],
    },
  },
  {
    id: 'py-hard-06',
    type: 'mc',
    prompt: 'Which dunder method is the fallback called only when normal attribute lookup fails?',
    choices: ['__getattribute__', '__getattr__', '__setattr__', '__get__'],
    answerIndex: 1,
    query: {
      title: '__getattr__ vs __getattribute__',
      syntax: '__getattr__(self, name)\n__getattribute__(self, name)',
      explanation:
        "`__getattribute__` intercepts every single attribute access unconditionally and is easy to break into infinite recursion if implemented carelessly. `__getattr__` only fires as a fallback after normal lookup (instance dict, class dict, MRO) has already failed to find the attribute, making it the safer hook for things like lazy properties or proxies.",
      tags: ['dunder', 'attributes'],
    },
  },
  {
    id: 'py-hard-07',
    type: 'mc',
    prompt: 'What does the walrus operator `:=` do?',
    code: "if (n := len(data)) > 10:\n    print(n)",
    choices: [
      'Assigns a value and evaluates to that value, usable inside an expression',
      'Swaps the values of two variables',
      'Unpacks a dictionary into keyword arguments',
      'Chains multiple comparisons together',
    ],
    answerIndex: 0,
    query: {
      title: 'Assignment expressions (PEP 572)',
      syntax: '(name := expression)',
      explanation:
        "Introduced in Python 3.8, `:=` lets you assign to a name as part of a larger expression, most commonly to avoid computing the same value twice, such as inside a `while` or `if` condition. It requires parentheses in most contexts and is a statement-level assignment's expression-level sibling, not a replacement for `=`.",
      tags: ['syntax', 'pep572'],
    },
  },
  {
    id: 'py-hard-08',
    type: 'mc',
    prompt: 'When a metaclass constructs a new class object, which method is called first?',
    choices: ['__init__', '__new__', '__call__', '__class_getitem__'],
    answerIndex: 1,
    query: {
      title: 'Metaclass instantiation order',
      syntax: 'type.__new__(mcls, name, bases, namespace)\ntype.__init__(cls, name, bases, namespace)',
      explanation:
        "Creating a class is itself an instantiation of its metaclass (`type` by default). `__new__` runs first and is responsible for actually creating and returning the class object; `__init__` then receives that already-created object to finish configuring it. This mirrors ordinary object construction, just one level up.",
      tags: ['metaclasses', 'internals'],
    },
  },
  {
    id: 'py-hard-09',
    type: 'bool',
    prompt:
      'Calling `.send(value)` on a generator resumes it at the paused `yield` expression, and that expression itself evaluates to `value`.',
    answer: true,
    query: {
      title: 'Generators as coroutines',
      syntax: 'value = yield expr\ngen.send(value)',
      explanation:
        '`yield` used as an expression pauses the generator and, on the next `.send(value)`, that entire `yield` expression evaluates to `value` inside the generator body. This bidirectional communication is what let early Python coroutine libraries build cooperative concurrency on top of generators before native `async`/`await` existed.',
      tags: ['generators', 'coroutines'],
    },
  },
  {
    id: 'py-hard-10',
    type: 'mc',
    prompt: 'What does defining `__slots__` on a class primarily do?',
    code: "class Point:\n    __slots__ = ('x', 'y')",
    choices: [
      'Adds automatically generated getter/setter methods',
      'Removes the per-instance `__dict__` and restricts instances to the named attributes',
      'Makes the class abstract and unable to be instantiated',
      'Enables multiple inheritance from unrelated base classes',
    ],
    answerIndex: 1,
    query: {
      title: '__slots__',
      syntax: "__slots__ = ('attr1', 'attr2')",
      explanation:
        "By default every instance carries a `__dict__` for arbitrary attribute storage, which costs memory per instance. `__slots__` replaces that with a fixed set of descriptor-backed slots, saving memory and, as a side effect, blocking assignment of any attribute not listed, useful for high-volume value-like objects.",
      tags: ['classes', 'memory'],
    },
  },
];
