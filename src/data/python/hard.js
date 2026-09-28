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
  {
    id: 'py-hard-11',
    type: 'mc',
    prompt: 'When a Python thread makes a blocking I/O call (for example, a network read), what happens to the GIL?',
    choices: [
      'The GIL stays held until the whole call returns',
      'The GIL is released for the duration of the blocking call, letting other threads run',
      'The interpreter spawns a second GIL for that thread',
      'The thread is suspended and its memory is immediately garbage collected',
    ],
    answerIndex: 1,
    query: {
      title: 'GIL release around blocking calls',
      syntax: '',
      explanation:
        "CPython's built-in I/O and most C-extension blocking calls release the GIL before making the underlying system call and re-acquire it afterward. That is exactly why threading is still useful for I/O-bound workloads even though the GIL prevents true parallel execution of Python bytecode: while one thread waits on the OS, another thread can run.",
      tags: ['gil', 'threading', 'io'],
    },
  },
  {
    id: 'py-hard-12',
    type: 'bool',
    prompt:
      'For CPU-bound work, switching from `threading` to `multiprocessing` typically improves throughput on a multi-core machine because each process gets its own GIL.',
    answer: true,
    query: {
      title: 'multiprocessing sidesteps the GIL',
      syntax: 'from multiprocessing import Pool',
      explanation:
        "Each process spawned by `multiprocessing` runs its own Python interpreter with its own GIL, so CPU-bound code can actually run on separate cores simultaneously, unlike threads which contend for one shared GIL. The tradeoff is that data must be pickled to cross process boundaries, and process startup and IPC carry real overhead that plain threading does not.",
      tags: ['multiprocessing', 'gil', 'concurrency'],
    },
  },
  {
    id: 'py-hard-13',
    type: 'bool',
    prompt:
      'If a class defines `__slots__` but inherits from a base class that does not define `__slots__`, instances of the subclass still get a `__dict__`.',
    answer: true,
    code: 'class Base:\n    pass\n\nclass Child(Base):\n    __slots__ = (\'x\',)',
    query: {
      title: '__slots__ only helps end to end',
      syntax: '',
      explanation:
        "`__slots__` only removes the per-instance `__dict__` if every class in the MRO opts into it. Here `Base` has no `__slots__`, so it still contributes a `__dict__` to every instance, and `Child` instances end up with both the slot descriptors and a dict, defeating the memory savings the subclass was trying to get.",
      tags: ['slots', 'inheritance', 'memory'],
    },
  },
  {
    id: 'py-hard-14',
    type: 'mc',
    prompt:
      "A class defines `__slots__ = ('x', 'y')` with no `'__weakref__'` entry. What happens when you call `weakref.ref(instance)` on it?",
    choices: [
      'It works exactly as it would without __slots__',
      'It raises TypeError because the instance has no slot to store the weak reference',
      'It silently returns None instead of a weakref',
      'It automatically adds a __dict__ to hold the reference',
    ],
    answerIndex: 1,
    query: {
      title: '__weakref__ must be an explicit slot',
      syntax: "__slots__ = ('x', 'y', '__weakref__')",
      explanation:
        "Without a `__dict__`, weak references need somewhere to live, and `__slots__` classes do not get that storage for free. If you want instances of a slotted class to be weakly referenceable, you must list `'__weakref__'` explicitly among the slots; otherwise `weakref.ref()` raises `TypeError: cannot create weak reference`.",
      tags: ['slots', 'weakref'],
    },
  },
  {
    id: 'py-hard-15',
    type: 'mc',
    prompt: 'When you write `MyClass(*args)` to instantiate an object, which method on the metaclass runs first?',
    code: 'class Meta(type):\n    def __call__(cls, *args, **kwargs):\n        print("creating instance")\n        return super().__call__(*args, **kwargs)',
    choices: ['Meta.__new__', 'Meta.__call__', 'MyClass.__new__', 'MyClass.__init__'],
    answerIndex: 1,
    query: {
      title: 'Metaclass __call__ intercepts instantiation',
      syntax: 'type(cls).__call__(cls, *args, **kwargs)',
      explanation:
        "Calling a class is calling its type, and a class's type is its metaclass. `Meta.__call__` runs first and is what normally goes on to invoke `cls.__new__` and then `cls.__init__`. Overriding `__call__` on a metaclass is how singleton patterns and other creation-time interception tricks are implemented.",
      tags: ['metaclasses', 'dunder'],
    },
  },
  {
    id: 'py-hard-16',
    type: 'mc',
    prompt: "What does `type('Foo', (Base,), {'x': 1})` produce?",
    code: "Foo = type('Foo', (Base,), {'x': 1})",
    choices: [
      'A TypeError, since type() only takes one argument',
      'A new class named Foo, inheriting from Base, with a class attribute x = 1',
      'An instance of Base with attribute x',
      'A tuple containing the class name and namespace',
    ],
    answerIndex: 1,
    query: {
      title: 'type() as a dynamic class factory',
      syntax: 'type(name, bases, namespace) -> class',
      explanation:
        "The three-argument form of `type()` is exactly what the `class` statement compiles down to: a name, a tuple of base classes, and a namespace dict of attributes and methods. It lets you build classes programmatically at runtime, which is how many ORMs and serialization libraries generate model classes dynamically.",
      tags: ['metaclasses', 'type'],
    },
  },
  {
    id: 'py-hard-17',
    type: 'mc',
    prompt: 'What is `__init_subclass__` used for?',
    code: 'class Plugin:\n    registry = []\n    def __init_subclass__(cls, **kwargs):\n        super().__init_subclass__(**kwargs)\n        Plugin.registry.append(cls)',
    choices: [
      'Running code every time a subclass is defined, without needing a custom metaclass',
      'Initializing instance attributes before __init__',
      'Preventing a class from ever being subclassed',
      'Replacing __new__ for immutable types',
    ],
    answerIndex: 0,
    query: {
      title: '__init_subclass__ hook',
      syntax: 'def __init_subclass__(cls, **kwargs): ...',
      explanation:
        "Added in Python 3.6, `__init_subclass__` is called automatically on the base class whenever a subclass is created, letting you run registration, validation, or configuration logic without writing a full custom metaclass. It receives the new subclass as `cls` plus any extra class keyword arguments passed in the class definition.",
      tags: ['classes', 'inheritance'],
    },
  },
  {
    id: 'py-hard-18',
    type: 'mc',
    prompt: "When is a descriptor's `__set_name__` method called?",
    code: 'class Descriptor:\n    def __set_name__(self, owner, name):\n        self.name = name\n\nclass Widget:\n    attr = Descriptor()',
    choices: [
      'Every time the attribute is set on an instance',
      'Once, automatically, right after the owning class body finishes executing',
      'Only if you call it manually after class creation',
      'Before __init__ runs on each new instance',
    ],
    answerIndex: 1,
    query: {
      title: '__set_name__',
      syntax: 'def __set_name__(self, owner, name): ...',
      explanation:
        "Python calls `__set_name__` on every descriptor found in a class namespace right after the class is created, passing the owning class and the attribute name it was bound to. This lets a descriptor learn its own name without the class author passing it explicitly, which is how many field-style descriptors know which attribute they back.",
      tags: ['descriptors', 'classes'],
    },
  },
  {
    id: 'py-hard-19',
    type: 'mc',
    prompt: "What makes an object a \"descriptor\" in Python's data model?",
    choices: [
      'It subclasses abc.ABC',
      'It defines any of __get__, __set__, or __delete__ and is stored as a class attribute',
      'It is decorated with @dataclass',
      'It implements __slots__',
    ],
    answerIndex: 1,
    query: {
      title: 'The descriptor protocol',
      syntax: '__get__(self, instance, owner)\n__set__(self, instance, value)\n__delete__(self, instance)',
      explanation:
        "Any object placed as a class attribute that implements one of `__get__`, `__set__`, or `__delete__` is a descriptor, and attribute access on instances of that class is routed through those methods instead of the plain instance `__dict__`. `property`, methods (via `__get__` binding `self`), and `functools.cached_property` are all descriptors under the hood.",
      tags: ['descriptors', 'internals'],
    },
  },
  {
    id: 'py-hard-20',
    type: 'bool',
    prompt:
      "A data descriptor (one that defines __set__ or __delete__) takes priority over an entry of the same name in the instance's __dict__.",
    answer: true,
    query: {
      title: 'Data descriptors override instance __dict__',
      syntax: '',
      explanation:
        "The attribute lookup algorithm checks the type's MRO for a data descriptor first, and uses it even when the instance has its own entry with the same name in `__dict__`. This is why `property` setters and getters can't be bypassed by assigning directly into `instance.__dict__[name]`, the descriptor still wins on the next `instance.name` access.",
      tags: ['descriptors', 'attributes'],
    },
  },
  {
    id: 'py-hard-21',
    type: 'mc',
    prompt: 'Under the hood, `@property` is implemented as:',
    choices: [
      'A compiler-level keyword with no runtime object behind it',
      'A built-in data descriptor whose __get__/__set__/__delete__ call the getter/setter/deleter functions you supplied',
      'A metaclass that intercepts all attribute access',
      'A subclass of dict',
    ],
    answerIndex: 1,
    query: {
      title: 'property as a descriptor',
      syntax: 'property(fget=None, fset=None, fdel=None, doc=None)',
      explanation:
        "`property` is a plain built-in class that implements the data descriptor protocol: its `__get__` calls the wrapped getter, `__set__` calls the setter (or raises AttributeError if none was given), and `__delete__` calls the deleter. `@property` decorator syntax is just sugar for constructing one of these and binding it to the method's name.",
      tags: ['descriptors', 'property'],
    },
  },
  {
    id: 'py-hard-22',
    type: 'bool',
    prompt:
      "A non-data descriptor (defines only __get__, no __set__) is overridden by an entry of the same name in the instance's __dict__.",
    answer: true,
    query: {
      title: 'Non-data descriptors lose to instance __dict__',
      syntax: '',
      explanation:
        "Without __set__ or __delete__, a descriptor is \"non-data,\" and the attribute lookup algorithm checks the instance __dict__ before falling back to it. This is exactly how plain functions work as methods: a function is a non-data descriptor via its __get__, but assigning instance.method = something_else shadows it because the instance dict is checked first.",
      tags: ['descriptors', 'attributes'],
    },
  },
  {
    id: 'py-hard-23',
    type: 'mc',
    prompt:
      'In a diamond inheritance layout (D inherits from B and C, both of which inherit from A), why should every __init__ call super().__init__(...) instead of naming a specific parent class?',
    code: 'class B(A):\n    def __init__(self):\n        super().__init__()\n\nclass C(A):\n    def __init__(self):\n        super().__init__()\n\nclass D(B, C):\n    def __init__(self):\n        super().__init__()',
    choices: [
      'It has no effect either way, they are equivalent',
      'super() follows the MRO cooperatively, so A.__init__ runs exactly once even though both B and C lead to it',
      'Naming the parent directly is required for diamond inheritance to work at all',
      'super() only works in classes that inherit from object directly',
    ],
    answerIndex: 1,
    query: {
      title: 'Cooperative super() calls',
      syntax: 'super().__init__(*args, **kwargs)',
      explanation:
        'Calling `super()` defers to whatever comes next in the MRO, not to a hardcoded parent. In the diamond, D\u2019s MRO is [D, B, C, A, object], so D.__init__ calling super() reaches B.__init__, which calling super() reaches C.__init__ (not A directly), which calling super() finally reaches A.__init__ exactly once. Hardcoding A.__init__(self) in both B and C would run A.__init__ twice.',
      tags: ['mro', 'super', 'inheritance'],
    },
  },
  {
    id: 'py-hard-24',
    type: 'bool',
    prompt:
      'The zero-argument form `super()` only works inside a method defined with a class statement because the compiler secretly supplies the enclosing class via a hidden closure cell.',
    answer: true,
    query: {
      title: 'How bare super() finds its class',
      syntax: 'super()  # roughly super(__class__, self) inside a method',
      explanation:
        "Python 3's zero-argument super() is a compiler trick: inside a method body, the compiler adds an implicit __class__ closure cell referencing the class being defined, and super() reads that cell plus the first positional argument (usually self) to reconstruct super(__class__, self). Call it from a plain function that is not defined inside a class body, and it raises RuntimeError: super(): no arguments.",
      tags: ['super', 'internals'],
    },
  },
  {
    id: 'py-hard-25',
    type: 'mc',
    prompt: 'Why must you override `__new__` instead of `__init__` to customize construction of a subclass of `int` or `str`?',
    code: "class PositiveInt(int):\n    def __new__(cls, value):\n        if value <= 0:\n            raise ValueError('must be positive')\n        return super().__new__(cls, value)",
    choices: [
      'Because __init__ does not exist for built-in types',
      'Because the immutable value is already fixed by the time __init__ runs; __new__ is what actually builds the object',
      'Because __new__ runs faster than __init__',
      'There is no real difference, either works identically',
    ],
    answerIndex: 1,
    query: {
      title: '__new__ owns construction of immutables',
      syntax: '__new__(cls, *args, **kwargs) -> instance',
      explanation:
        "For mutable objects, __new__ allocates a blank instance and __init__ fills it in afterward. Immutable types like int and str can't be mutated after allocation, so the actual value has to be baked in during __new__ itself; by the time __init__ runs the object already holds its final value and __init__ has no way to change it.",
      tags: ['new', 'init', 'immutability'],
    },
  },
  {
    id: 'py-hard-26',
    type: 'bool',
    prompt: 'If `__new__` returns an object that is not an instance of `cls`, Python skips calling `__init__` on it.',
    answer: true,
    code: 'class Factory:\n    def __new__(cls, *args):\n        return object()  # not a Factory instance',
    query: {
      title: '__init__ only runs for matching types',
      syntax: '',
      explanation:
        "After __new__ returns, the interpreter checks isinstance(returned_object, cls). __init__ is only invoked automatically when that check passes. Returning an object of an unrelated type, or an already-initialized existing instance (as some caching patterns do), silently bypasses __init__ entirely, which is a common source of \"why didn't my __init__ run\" bugs.",
      tags: ['new', 'init'],
    },
  },
  {
    id: 'py-hard-27',
    type: 'mc',
    prompt: 'The pattern below is a common way to implement a singleton. What mechanism does it rely on?',
    code: 'class Singleton:\n    _instance = None\n    def __new__(cls):\n        if cls._instance is None:\n            cls._instance = super().__new__(cls)\n        return cls._instance',
    choices: [
      '__new__ can return a previously created instance instead of always allocating a new one',
      'Python automatically deduplicates classes with identical names',
      'A built-in @singleton decorator in functools',
      'Metaclasses are required for this to work at all',
    ],
    answerIndex: 0,
    query: {
      title: 'Singleton via __new__',
      syntax: '__new__(cls) -> object',
      explanation:
        "__new__ is free to return any object, including one it built and cached on a previous call. Note that __init__ still runs again on every call in this pattern unless it is also guarded, since Python calls __init__ whenever the returned object is an instance of cls, even if that same instance was returned before.",
      tags: ['new', 'design-patterns'],
    },
  },
  {
    id: 'py-hard-28',
    type: 'mc',
    prompt: "What happens when you call a `weakref.ref` object after its referent has been garbage collected?",
    code: 'import weakref\nr = weakref.ref(obj)\ndel obj\nr()',
    choices: ['It raises ReferenceError', 'It returns None', 'It re-creates the object', 'It raises AttributeError'],
    answerIndex: 1,
    query: {
      title: 'Dead weak references return None',
      syntax: 'weakref.ref(obj, callback=None)',
      explanation:
        'Calling a live weak reference returns the referent; once that referent has been collected, calling the same weakref object returns None instead of raising. You can also register an optional callback that fires exactly once, at collection time, which is useful for cleanup bookkeeping tied to an object\u2019s lifetime.',
      tags: ['weakref', 'gc'],
    },
  },
  {
    id: 'py-hard-29',
    type: 'mc',
    prompt: 'What is the main use case for `weakref.WeakValueDictionary`?',
    choices: [
      'Storing secrets that expire automatically after a timeout',
      'A cache that lets its cached objects be garbage collected once nothing else references them, instead of keeping them alive forever',
      'A dictionary that is faster than the built-in dict',
      'A thread-safe alternative to the built-in dict',
    ],
    answerIndex: 1,
    query: {
      title: 'WeakValueDictionary as a non-owning cache',
      syntax: 'weakref.WeakValueDictionary()',
      explanation:
        'A regular dict used as a cache holds a strong reference to every cached value, keeping them alive indefinitely and defeating garbage collection. WeakValueDictionary holds only weak references to its values, so an entry is dropped automatically as soon as the last strong reference elsewhere in the program disappears, avoiding unbounded memory growth from caching.',
      tags: ['weakref', 'caching'],
    },
  },
  {
    id: 'py-hard-30',
    type: 'bool',
    prompt: "Two objects that only reference each other (a reference cycle) will never be reclaimed by CPython's memory management.",
    answer: false,
    code: 'a = {}\nb = {}\na["b"] = b\nb["a"] = a\ndel a, b',
    query: {
      title: 'Cyclic garbage collector',
      syntax: 'gc.collect()',
      explanation:
        "Plain reference counting alone can never reclaim a cycle, because each object in the cycle still holds a nonzero refcount from the other. CPython solves this with a separate generational cycle-detecting garbage collector that periodically scans for and reclaims groups of objects unreachable from the rest of the program despite referencing each other, running automatically or via an explicit gc.collect().",
      tags: ['gc', 'refcounting'],
    },
  },
  {
    id: 'py-hard-31',
    type: 'mc',
    prompt: "CPython's cyclic garbage collector organizes tracked objects into how many generations, and why?",
    choices: [
      'Just one, scanned on every allocation',
      'Three, on the assumption that most garbage is short-lived, so newer generations are scanned far more often than older ones',
      'Infinitely many, one per object',
      'Two, corresponding to mutable and immutable objects',
    ],
    answerIndex: 1,
    query: {
      title: 'Generational garbage collection',
      syntax: 'gc.get_threshold() -> (700, 10, 10)',
      explanation:
        'Objects that survive a collection are promoted to an older generation. Generation 0 (newest) is scanned very frequently since most objects die young; generations 1 and 2 are scanned progressively less often. This tiered strategy avoids re-scanning long-lived objects on every minor collection, similar in spirit to generational garbage collectors in other managed runtimes.',
      tags: ['gc', 'internals'],
    },
  },
  {
    id: 'py-hard-32',
    type: 'bool',
    prompt: 'Since Python 3.4, objects with a custom __del__ method that participate in a reference cycle can still be collected by the garbage collector.',
    answer: true,
    query: {
      title: '__del__ and cyclic collection',
      syntax: '',
      explanation:
        "Before PEP 442 (Python 3.4), any cycle containing an object with __del__ was deemed uncollectable because the collector couldn't safely decide finalization order, and such cycles leaked into gc.garbage. PEP 442 introduced safe, well-defined finalization ordering for these cases, so modern CPython reclaims them too, though a __del__ that resurrects an object by storing a new reference to self is still a foot-gun.",
      tags: ['gc', 'del'],
    },
  },
  {
    id: 'py-hard-33',
    type: 'mc',
    prompt: 'What problem does `functools.wraps` solve when writing a decorator?',
    code: '@functools.wraps(fn)\ndef wrapper(*args, **kwargs):\n    return fn(*args, **kwargs)',
    choices: [
      'It makes the wrapper function run faster',
      "It copies the original function's __name__, __doc__, and other metadata onto the wrapper, and sets __wrapped__ to the original",
      'It prevents the decorator from being applied more than once',
      "It automatically caches the wrapped function's results",
    ],
    answerIndex: 1,
    query: {
      title: 'functools.wraps preserves identity',
      syntax: '@functools.wraps(wrapped)',
      explanation:
        "Without it, a decorated function's __name__, __doc__, __module__, and __qualname__ all become the wrapper's generic ones, breaking introspection, documentation tools, and stack traces that rely on a meaningful function name. wraps also sets wrapper.__wrapped__ = fn, letting tools like inspect.signature see through the decorator to the original signature.",
      tags: ['functools', 'decorators'],
    },
  },
  {
    id: 'py-hard-34',
    type: 'mc',
    prompt: 'What does `functools.partial(pow, exp=2)` produce?',
    code: 'square = functools.partial(pow, exp=2)\nsquare(5)',
    choices: [
      'A syntax error, partial cannot take keyword arguments',
      'A new callable that calls pow with exp already fixed to 2, letting you supply the remaining arguments later',
      'An immediate evaluation of pow(exp=2)',
      'A generator that yields powers of 2',
    ],
    answerIndex: 1,
    query: {
      title: 'functools.partial',
      syntax: 'functools.partial(func, *args, **kwargs) -> callable',
      explanation:
        'partial freezes some positional and/or keyword arguments of a callable and returns a new callable that only needs the remaining ones. It is a lightweight alternative to writing a small wrapper lambda or closure by hand, and the resulting object exposes .func, .args, and .keywords for introspection.',
      tags: ['functools', 'partial'],
    },
  },
  {
    id: 'py-hard-35',
    type: 'mc',
    prompt: 'What does `functools.reduce(lambda acc, x: acc + x, [1, 2, 3], 10)` evaluate to?',
    code: 'functools.reduce(lambda acc, x: acc + x, [1, 2, 3], 10)',
    choices: ['6', '16', '[10, 1, 2, 3]', 'A generator object'],
    answerIndex: 1,
    query: {
      title: 'functools.reduce with an initial value',
      syntax: 'functools.reduce(function, iterable, initializer=...)',
      explanation:
        'reduce folds an iterable down to a single value by repeatedly applying a binary function to an accumulator and the next element. With an explicit initializer of 10, the calls are f(10, 1) -> 11, f(11, 2) -> 13, f(13, 3) -> 16. Omitting the initializer instead uses the iterable\u2019s first element as the starting accumulator.',
      tags: ['functools', 'reduce'],
    },
  },
  {
    id: 'py-hard-36',
    type: 'mc',
    prompt: 'What does `functools.singledispatch` let you do?',
    code: '@functools.singledispatch\ndef render(obj):\n    raise NotImplementedError\n\n@render.register(int)\ndef _(obj):\n    return str(obj)',
    choices: [
      'Restrict a function to being called only once',
      'Define a generic function that dispatches to a different implementation based on the runtime type of its first argument',
      'Automatically parallelize a function across multiple cores',
      'Cache results keyed by argument type',
    ],
    answerIndex: 1,
    query: {
      title: 'Single-dispatch generic functions',
      syntax: '@func.register(SomeType)',
      explanation:
        "singledispatch implements a lightweight form of function overloading based on the type of the first argument, since Python doesn't support overloading by signature natively. Additional implementations are registered for specific types via .register, and the original decorated function becomes the fallback for any type without a specific registration.",
      tags: ['functools', 'dispatch'],
    },
  },
  {
    id: 'py-hard-37',
    type: 'bool',
    prompt: '`functools.cache` (added in Python 3.9) is exactly equivalent to `functools.lru_cache(maxsize=None)`.',
    answer: true,
    query: {
      title: 'functools.cache',
      syntax: '@functools.cache\ndef f(x): ...',
      explanation:
        '`functools.cache` is a thin, more readable alias for the unbounded case of lru_cache. It exists purely for ergonomics, writing @functools.cache is shorter than @functools.lru_cache(maxsize=None) for the common case of memoizing forever, and it carries the exact same memory-growth caveat.',
      tags: ['functools', 'caching'],
    },
  },
  {
    id: 'py-hard-38',
    type: 'bool',
    prompt: 'Calling `some_coroutine()` by itself, without await or asyncio.create_task, starts running the coroutine\u2019s body.',
    answer: false,
    code: 'coro = some_coroutine()  # nothing has run yet',
    query: {
      title: 'Coroutine objects are lazy',
      syntax: 'task = asyncio.create_task(coro)',
      explanation:
        "Calling an async def function only constructs a coroutine object; none of its body executes until something drives it, either awaiting it directly or scheduling it on the event loop with asyncio.create_task. Creating and then discarding a coroutine object without ever awaiting or scheduling it produces a \"coroutine was never awaited\" RuntimeWarning.",
      tags: ['asyncio', 'coroutines'],
    },
  },
  {
    id: 'py-hard-39',
    type: 'mc',
    prompt: 'What happens if you call `time.sleep(5)` (instead of `await asyncio.sleep(5)`) inside an async def function?',
    choices: [
      'It behaves identically to asyncio.sleep',
      'It blocks the entire event loop for 5 seconds, freezing every other task that loop is running',
      'It raises SyntaxError because blocking calls are forbidden in async functions',
      'It runs on a background thread automatically',
    ],
    answerIndex: 1,
    query: {
      title: 'Blocking calls stall the whole event loop',
      syntax: 'await asyncio.sleep(5)   # correct\ntime.sleep(5)             # blocks everything',
      explanation:
        'asyncio concurrency depends on every task voluntarily yielding control back to the loop at await points. time.sleep has no awareness of the event loop and simply blocks the one OS thread the loop runs on, so nothing else scheduled on that loop, no other task, no I/O callback, can make progress until the sleep finishes.',
      tags: ['asyncio', 'blocking'],
    },
  },
  {
    id: 'py-hard-40',
    type: 'mc',
    prompt: 'What does `await asyncio.sleep(0)` do?',
    choices: [
      'Nothing, it is a no-op that returns instantly without yielding',
      'Yields control back to the event loop for one iteration, letting other ready tasks run, then resumes',
      'Cancels the current task',
      'Raises a TimeoutError immediately',
    ],
    answerIndex: 1,
    query: {
      title: 'asyncio.sleep(0) as a cooperative yield',
      syntax: 'await asyncio.sleep(0)',
      explanation:
        'Even with a delay of zero, asyncio.sleep still suspends the current coroutine and hands control back to the event loop, which gets a chance to run other pending callbacks and tasks before resuming this one on the next loop iteration. It is a common idiom for deliberately yielding in a tight async loop that would otherwise never let anything else run.',
      tags: ['asyncio', 'event-loop'],
    },
  },
  {
    id: 'py-hard-41',
    type: 'mc',
    prompt: 'What is `async def gen(): yield 1` and how do you consume it?',
    code: 'async def gen():\n    yield 1\n    yield 2\n\nasync for value in gen():\n    print(value)',
    choices: [
      'A regular coroutine; consume it with await',
      'An async generator; consume it with async for, not a plain for loop',
      'A syntax error, async and yield cannot be combined',
      'Identical to a regular generator, just with extra syntax',
    ],
    answerIndex: 1,
    query: {
      title: 'Async generators',
      syntax: 'async def gen():\n    yield value\n\nasync for x in gen(): ...',
      explanation:
        'Combining async def with yield produces an async generator, a distinct object type from both coroutines and regular generators. It supports __anext__ instead of __next__, so it must be driven with async for (or manual await gen.__anext__()), and its body can itself contain await expressions, unlike a plain synchronous generator.',
      tags: ['asyncio', 'generators'],
    },
  },
  {
    id: 'py-hard-42',
    type: 'mc',
    prompt: 'Given that only one coroutine runs Python bytecode at a time on the event loop, why would you ever need asyncio.Lock?',
    choices: [
      'You never do, asyncio.Lock is vestigial',
      'To protect a critical section that spans an await point, since another task can run and interleave during that suspension even though nothing runs truly in parallel',
      'To prevent two threads from importing the same module',
      'To make coroutines run on separate CPU cores',
    ],
    answerIndex: 1,
    query: {
      title: 'Locks still matter in cooperative concurrency',
      syntax: 'async with asyncio.Lock(): ...',
      explanation:
        "Concurrency bugs don't require true parallelism, they require interleaving. If a coroutine reads shared state, awaits something (yielding control), and then writes based on that now-stale read, another task can run in between and corrupt the invariant. asyncio.Lock (and friends like Semaphore) serialize access across await boundaries even though the underlying execution is single-threaded.",
      tags: ['asyncio', 'concurrency'],
    },
  },
  {
    id: 'py-hard-43',
    type: 'bool',
    prompt: '`await expr` is essentially the modern equivalent of the older generator-based `yield from expr` for delegating to another coroutine.',
    answer: true,
    code: '# old style\ndef old():\n    yield from other()\n\n# modern\nasync def new():\n    await other()',
    query: {
      title: 'await as sugar over yield from',
      syntax: '',
      explanation:
        "Before native coroutines existed (pre-3.5), asyncio coroutines were plain generators decorated with @asyncio.coroutine, and yield from was used to delegate to a sub-coroutine, suspending until it completed. await was introduced as dedicated syntax for the same delegation semantics on proper coroutine objects, cleaner and less overloaded than reusing generator syntax for something that isn't really generating values.",
      tags: ['asyncio', 'generators'],
    },
  },
  {
    id: 'py-hard-44',
    type: 'mc',
    prompt: 'A generator has `return 42` instead of just falling off the end. How does the caller retrieve that 42?',
    code: 'def gen():\n    yield 1\n    return 42\n\ng = gen()\nnext(g)\ntry:\n    next(g)\nexcept StopIteration as e:\n    print(e.value)',
    choices: [
      'It is silently discarded, generators cannot return values',
      'It is attached as the .value attribute of the StopIteration raised when the generator finishes',
      "It becomes the generator's __repr__",
      'It is yielded one more time',
    ],
    answerIndex: 1,
    query: {
      title: 'Generator return values',
      syntax: 'except StopIteration as e:\n    result = e.value',
      explanation:
        'A return value inside a generator does not yield that value, it ends iteration by raising StopIteration(value), and that value is exposed via the exception\u2019s .value attribute. This is exactly the mechanism yield from uses to let a delegating generator capture the sub-generator\u2019s final result: result = yield from subgen().',
      tags: ['generators', 'stopiteration'],
    },
  },
  {
    id: 'py-hard-45',
    type: 'mc',
    prompt: "What problem does `contextvars.ContextVar` solve that `threading.local` does not, in async code?",
    code: 'request_id = contextvars.ContextVar("request_id")\nrequest_id.set("abc-123")',
    choices: [
      'It makes variables thread-safe, which threading.local already does',
      'It gives each asyncio Task its own isolated copy of the value, since many tasks share one OS thread and threading.local would see them all as the same context',
      'It automatically serializes the value to disk',
      'It replaces global variables entirely',
    ],
    answerIndex: 1,
    query: {
      title: 'contextvars for per-task state',
      syntax: 'var.set(value)\nvar.get()',
      explanation:
        'threading.local isolates state per OS thread, but an asyncio event loop typically runs many concurrent tasks on a single thread, so threading.local would see them all as one context and leak state between unrelated requests. contextvars isolates state per logical execution context instead, and each asyncio.Task automatically gets its own copy, making it the right tool for things like per-request IDs in async servers.',
      tags: ['contextvars', 'asyncio'],
    },
  },
  {
    id: 'py-hard-46',
    type: 'bool',
    prompt: 'The GIL guarantees that `counter += 1` is atomic across threads, so you never need a lock to safely increment a shared counter from multiple threads.',
    answer: false,
    code: 'counter += 1  # actually several bytecode ops under the hood',
    query: {
      title: 'The GIL protects bytecode instructions, not statements',
      syntax: '',
      explanation:
        'counter += 1 compiles to several bytecode instructions (load, add, store), and the GIL can switch to another thread between any of them, at the interpreter\u2019s configured switch interval. Two threads can both load the old value before either stores the incremented one, losing an update. The GIL prevents corrupting individual objects at the C level, it does not make multi-step Python operations atomic; a real threading.Lock is still needed.',
      tags: ['gil', 'threading', 'concurrency'],
    },
  },
  {
    id: 'py-hard-47',
    type: 'mc',
    prompt:
      "Why does `'hello' is 'hello'` typically evaluate to True inside the same module, while a string built at runtime through concatenation usually is not the same object as an equal literal?",
    choices: [
      'Both are actually always False, this is a trick question',
      'Literal identifier-like strings compiled in the same code object are interned by CPython, but strings built at runtime through concatenation or joins usually are not',
      'is always compares strings by value',
      'The second example raises a TypeError',
    ],
    answerIndex: 1,
    query: {
      title: 'String literal interning',
      syntax: '',
      explanation:
        "CPython interns string literals that look like identifiers (no spaces, valid Python names) at compile time, so equal literals in the same code often share one object, making is appear to work like ==. This is a CPython optimization detail, not a language guarantee, and it disappears the moment a string is constructed dynamically at runtime, which is exactly why comparing strings with is instead of == is fragile and non-portable.",
      tags: ['strings', 'interning', 'internals'],
    },
  },
  {
    id: 'py-hard-48',
    type: 'mc',
    prompt: "What does `sys.intern()` let you do that ordinary string literal interning does not cover?",
    code: 'a = sys.intern(build_string())\nb = sys.intern(build_string())\na is b  # True',
    choices: [
      'Force any runtime-built string into the intern pool so equal strings from different sources become the same object',
      'Make a string immutable (strings already are)',
      'Convert a string to bytes',
      'Cache the string on disk between program runs',
    ],
    answerIndex: 0,
    query: {
      title: 'Explicit interning',
      syntax: 'sys.intern(string) -> str',
      explanation:
        "Automatic literal interning only applies to strings the compiler sees as identifier-like literals. sys.intern() explicitly adds any string to the process-wide intern table and returns the canonical shared instance, useful when comparing huge numbers of dynamically-built strings for equality (like tokens in a parser) and wanting the speed of pointer comparison instead of character-by-character comparison.",
      tags: ['strings', 'interning'],
    },
  },
  {
    id: 'py-hard-49',
    type: 'mc',
    prompt: 'Why is `if x is None:` preferred over `if x == None:`?',
    choices: [
      'They are exactly equivalent in every case, is is just shorter',
      'None is a guaranteed process-wide singleton, and a class could define __eq__ to make == with None behave unexpectedly, so is is both faster and immune to that override',
      'is None only works inside functions',
      '== None raises a DeprecationWarning',
    ],
    answerIndex: 1,
    query: {
      title: 'Why "is None" beats "== None"',
      syntax: 'if x is None: ...',
      explanation:
        'There is exactly one None object for the lifetime of the process, so identity comparison is both correct and cheap (a pointer compare, no method dispatch). == goes through __eq__, which a poorly-behaved class could override to return something surprising when compared against None, making is None the robust, idiomatic check that every style guide and linter enforces.',
      tags: ['none', 'identity'],
    },
  },
  {
    id: 'py-hard-50',
    type: 'bool',
    prompt:
      'Unlike small integers, float literals with the same value are never guaranteed to be the same object, so `2.0 is 2.0` can legally be False even though it often prints True at the REPL.',
    answer: true,
    code: 'a = 2.0\nb = 2.0\na is b  # implementation detail, not guaranteed',
    query: {
      title: 'Floats are not interned',
      syntax: '',
      explanation:
        'CPython caches small integers (-5 to 256) but makes no such guarantee for floats; two float literals with the same value may or may not share an object depending on context (constant folding within one code object can coincidentally make them the same object, while floats built separately usually will not be). Relying on is for float comparison is a latent bug on a different CPython build or optimization level; always use == for float value comparison.',
      tags: ['floats', 'identity', 'internals'],
    },
  },
  {
    id: 'py-hard-51',
    type: 'mc',
    prompt: 'What problem do exception groups (`ExceptionGroup`, `except*`, Python 3.11+) solve?',
    code: 'try:\n    ...\nexcept* ValueError as eg:\n    handle(eg.exceptions)',
    choices: [
      'They let you catch multiple unrelated exception types with one except clause, which regular except (A, B) already does',
      'They let code that runs multiple independent operations (like asyncio TaskGroup) raise and handle several unrelated exceptions from that operation together, since a normal try can only ever propagate one exception at a time',
      'They deprecate the traceback module entirely',
      'They are only usable inside async functions',
    ],
    answerIndex: 1,
    query: {
      title: 'ExceptionGroup and except*',
      syntax: 'raise ExceptionGroup("msg", [err1, err2])',
      explanation:
        'Before 3.11, if several independent subtasks each failed with a different exception, only one exception could propagate at a time, losing the others. ExceptionGroup bundles multiple exceptions into one object that still carries all of them, and the new except* syntax can match and partially handle exceptions by type from within the group while re-raising the rest, exactly what asyncio.TaskGroup uses when concurrent tasks fail together.',
      tags: ['exceptions', 'exception-groups'],
    },
  },
  {
    id: 'py-hard-52',
    type: 'mc',
    prompt: 'What does `raise NewError("...") from original_error` do to the traceback?',
    code: 'try:\n    parse(data)\nexcept ValueError as e:\n    raise ConfigError("bad config") from e',
    choices: [
      'It discards original_error entirely',
      "It sets NewError.__cause__ to original_error, and the traceback display shows both, explicitly marking one as the direct cause of the other",
      'It merges both exceptions into a single message string',
      'It suppresses the traceback of NewError',
    ],
    answerIndex: 1,
    query: {
      title: 'Explicit exception chaining',
      syntax: 'raise NewException("msg") from original_exception',
      explanation:
        'The from clause sets the new exception\u2019s __cause__ attribute and marks __suppress_context__ = True, so the printed traceback shows "The above exception was the direct cause of the following exception" rather than the more ambiguous implicit chaining message. It is the idiomatic way to translate a low-level exception into a higher-level, more meaningful one without losing the original diagnostic information.',
      tags: ['exceptions', 'chaining'],
    },
  },
  {
    id: 'py-hard-53',
    type: 'bool',
    prompt:
      'If a new exception is raised while already handling another exception, and you do not use `raise ... from ...`, Python still links the two via __context__, and the traceback shows "During handling of the above exception, another exception occurred."',
    answer: true,
    code: 'try:\n    risky()\nexcept ValueError:\n    raise TypeError("second problem")  # no explicit from',
    query: {
      title: 'Implicit exception context',
      syntax: '',
      explanation:
        'Python automatically tracks the exception that was active when a new one is raised, storing it on __context__, even without an explicit from clause. This differs from __cause__ (explicit, via from) but serves a similar diagnostic purpose: showing why an error handler itself failed. raise ... from None explicitly suppresses this display when the original exception is genuinely irrelevant.',
      tags: ['exceptions', 'chaining'],
    },
  },
  {
    id: 'py-hard-54',
    type: 'bool',
    prompt: 'Defining `__eq__` on a class without also defining `__hash__` makes instances of that class unhashable.',
    answer: true,
    code: 'class Point:\n    def __init__(self, x, y):\n        self.x, self.y = x, y\n    def __eq__(self, other):\n        return (self.x, self.y) == (other.x, other.y)\n\n{Point(1, 2)}  # TypeError: unhashable type',
    query: {
      title: 'Overriding __eq__ nukes the default __hash__',
      syntax: '',
      explanation:
        "Python's default __hash__ (based on id()) is only consistent with the default __eq__ (also identity-based). Once you override __eq__ to compare by value, the interpreter sets __hash__ to None automatically, since the inherited identity-based hash would now violate the invariant that equal objects hash equally. You must explicitly define __hash__ alongside a custom __eq__ if you still want the objects usable in sets or as dict keys.",
      tags: ['hash', 'eq', 'gotchas'],
    },
  },
  {
    id: 'py-hard-55',
    type: 'mc',
    prompt: "Why is it dangerous to use a mutable object as a dictionary key by giving it a custom __hash__ based on its current mutable state?",
    choices: [
      'It is not dangerous, Python recomputes the hash whenever the key changes',
      "If the object's hash changes after insertion, the dict can no longer find it in its bucket, effectively losing the entry even though the key object still exists",
      'It causes a MemoryError',
      'Dictionaries do not allow custom __hash__ at all',
    ],
    answerIndex: 1,
    query: {
      title: 'The hash-invariance contract',
      syntax: '__hash__(self) -> int  # must not change while used as a key',
      explanation:
        "A dict places a key in a bucket based on its hash at insertion time. If the object is later mutated in a way that changes what __hash__ would now return, the dict does not rehash existing entries, so a subsequent lookup with the same (now different) hash lands in the wrong bucket and the entry appears to vanish. Well-behaved hashable types are therefore either immutable or compute their hash only from immutable fields.",
      tags: ['hash', 'dict', 'gotchas'],
    },
  },
  {
    id: 'py-hard-56',
    type: 'mc',
    prompt: "What happens if you try to instantiate a class that inherits from abc.ABC and has an unimplemented @abstractmethod?",
    code: 'class Shape(abc.ABC):\n    @abc.abstractmethod\n    def area(self): ...\n\nShape()  # ?',
    choices: [
      'It succeeds, abstractmethod is purely documentation',
      'It raises TypeError at instantiation time, listing the abstract methods that were never overridden',
      'It raises NotImplementedError only when area() is actually called',
      'It silently returns None instead of an instance',
    ],
    answerIndex: 1,
    query: {
      title: 'ABCMeta enforces abstract methods',
      syntax: 'class Shape(abc.ABC):\n    @abc.abstractmethod\n    def area(self): ...',
      explanation:
        "abc.ABC uses ABCMeta as its metaclass, which tracks every method decorated with @abstractmethod and refuses to construct an instance of a class where any remain unoverridden, raising TypeError listing the abstract method. This check happens eagerly at instantiation, not lazily at call time, which is what makes ABCs useful for enforcing an interface contract.",
      tags: ['abc', 'abstractmethod'],
    },
  },
  {
    id: 'py-hard-57',
    type: 'mc',
    prompt: 'What does calling `MyABC.register(SomeClass)` do?',
    code: 'class Drawable(abc.ABC):\n    @abc.abstractmethod\n    def draw(self): ...\n\nDrawable.register(ThirdPartyWidget)\nisinstance(ThirdPartyWidget(), Drawable)  # True',
    choices: [
      'It makes SomeClass literally inherit from MyABC, changing its MRO',
      'It registers SomeClass as a "virtual subclass," so isinstance/issubclass checks against MyABC succeed even though SomeClass never actually inherits from it',
      'It raises an error unless SomeClass already implements every abstract method',
      "It copies MyABC's methods onto SomeClass",
    ],
    answerIndex: 1,
    query: {
      title: 'Virtual subclassing',
      syntax: 'ABC.register(cls)',
      explanation:
        "register lets a class satisfy isinstance/issubclass checks against an ABC without changing its actual inheritance hierarchy or MRO, useful for retrofitting third-party classes you don't control into your interface. Unlike real inheritance, registration performs no method verification: it is on you to make sure SomeClass actually behaves like a Drawable.",
      tags: ['abc', 'isinstance'],
    },
  },
  {
    id: 'py-hard-58',
    type: 'mc',
    prompt: "Why does `isinstance([1, 2], collections.abc.Iterable)` return True even though `list` never explicitly inherits from Iterable?",
    choices: [
      'It does not, this would raise TypeError',
      "Several collections.abc classes implement __subclasshook__ to recognize any class that defines the right dunder methods (like __iter__), without requiring explicit registration or inheritance",
      'list secretly inherits from Iterable internally, contradicting the premise',
      'isinstance always returns True for built-in types',
    ],
    answerIndex: 1,
    query: {
      title: 'Structural ABCs via __subclasshook__',
      syntax: 'class Iterable(metaclass=ABCMeta):\n    @classmethod\n    def __subclasshook__(cls, C):\n        return _check_methods(C, "__iter__")',
      explanation:
        'Some collections.abc classes override __subclasshook__ to perform duck-typed structural checks: any class that defines __iter__ is automatically considered a subclass of Iterable for isinstance/issubclass purposes, no explicit register() or inheritance needed. This blends Python\u2019s dynamic duck typing with the more formal ABC framework, so structurally-compatible built-ins just work.',
      tags: ['abc', 'collections'],
    },
  },
  {
    id: 'py-hard-59',
    type: 'mc',
    prompt: 'For a custom iterator class (not just an iterable), what should `__iter__` return?',
    code: 'class Counter:\n    def __iter__(self):\n        return self\n    def __next__(self):\n        ...',
    choices: [
      'A brand new object every time, never self',
      'self, since an iterator is defined as an object that is its own iterator',
      '__iter__ is optional on iterators and may be omitted',
      'A list of all remaining values',
    ],
    answerIndex: 1,
    query: {
      title: 'Iterators are their own __iter__',
      syntax: '__iter__(self) -> iterator with __next__',
      explanation:
        "The iterator protocol says any object with __next__ should also implement __iter__ returning itself, so the object can be used directly wherever an iterable is expected (an object that always calls iter() on its target first, like a for loop). This is why you can write `for x in my_iterator:` without an extra layer, and it's the important distinction between a merely-iterable object (like a list) and an actual iterator.",
      tags: ['iterators', 'protocol'],
    },
  },
  {
    id: 'py-hard-60',
    type: 'bool',
    prompt: 'A custom `__next__` method signals "no more items" by returning None, the same way a function that falls off the end does.',
    answer: false,
    code: 'def __next__(self):\n    if done:\n        raise StopIteration\n    return next_value',
    query: {
      title: '__next__ must raise, not return, to end iteration',
      syntax: '',
      explanation:
        "None is a perfectly valid value an iterator might legitimately yield, so it can't double as an end-of-iteration sentinel. The protocol instead requires __next__ to raise StopIteration when exhausted; every for loop and every function that consumes iterators (like list(), comprehensions, next() with no default) is written expecting that exception, not a None return, to know when to stop.",
      tags: ['iterators', 'stopiteration'],
    },
  },
  {
    id: 'py-hard-61',
    type: 'mc',
    prompt: 'What does implementing `__call__` on a class let you do?',
    code: 'class Adder:\n    def __init__(self, n):\n        self.n = n\n    def __call__(self, x):\n        return x + self.n\n\nadd5 = Adder(5)\nadd5(10)  # 15',
    choices: [
      'Nothing, __call__ is reserved for internal use',
      'Make instances of the class invokable with function-call syntax, blurring the line between "object" and "function"',
      'Override how the class itself is instantiated',
      'Allow the class to be used only as a decorator, never called directly',
    ],
    answerIndex: 1,
    query: {
      title: 'Making objects callable',
      syntax: '__call__(self, *args, **kwargs)',
      explanation:
        'Any object whose class defines __call__ can be invoked with obj(...) just like a function. This underlies stateful callables such as class-based decorators, memoizing wrappers that need to store extra state, and configuration-carrying "model objects" you call directly with input data, letting you carry configuration alongside behavior in a way a plain function cannot.',
      tags: ['dunder', 'callable'],
    },
  },
  {
    id: 'py-hard-62',
    type: 'bool',
    prompt: 'Writing `def __getattribute__(self, name): return self.__dict__[name]` inside a class is likely to cause infinite recursion.',
    answer: true,
    code: 'def __getattribute__(self, name):\n    return self.__dict__[name]  # self.__dict__ triggers __getattribute__ again',
    query: {
      title: 'The __getattribute__ recursion trap',
      syntax: 'return object.__getattribute__(self, name)',
      explanation:
        "Every attribute access, including self.__dict__ itself, goes through __getattribute__ when it's overridden, so referencing self.__dict__ inside your own override calls the same overridden method again, forever. The safe pattern is to delegate to the base implementation, object.__getattribute__(self, name), for default behavior and only special-case what you actually need to intercept.",
      tags: ['dunder', 'attributes', 'gotchas'],
    },
  },
  {
    id: 'py-hard-63',
    type: 'mc',
    prompt: 'What happens if you try to do `str.upper = lambda self: "patched"`?',
    choices: [
      "It succeeds and every string's .upper() now returns \"patched\"",
      'It raises TypeError, because built-in types implemented in C are immutable from pure Python and cannot be monkeypatched directly',
      'It only patches new string instances created after the assignment',
      'It silently does nothing',
    ],
    answerIndex: 1,
    query: {
      title: 'Immutable C-level types resist monkeypatching',
      syntax: '',
      explanation:
        "Types written in C, like str, int, list, and dict, store their attribute tables in a way pure Python code cannot mutate; assigning to an attribute of the type object raises TypeError: cannot set 'upper' attribute of immutable type 'str'. This is a deliberate safety boundary, in contrast to pure-Python classes, which are perfectly happy to have their methods reassigned at runtime.",
      tags: ['monkeypatching', 'internals'],
    },
  },
  {
    id: 'py-hard-64',
    type: 'mc',
    prompt: "What extra safety does `unittest.mock.patch('module.func', autospec=True)` give you over a plain patch?",
    choices: [
      'It makes the mock run the real implementation once before mocking',
      'It makes the mock enforce the original function\u2019s signature, so calling it with the wrong number or kind of arguments in a test raises TypeError instead of silently passing',
      'It patches every function in the module automatically',
      'It disables the mock entirely in CI',
    ],
    answerIndex: 1,
    query: {
      title: 'autospec catches signature drift',
      syntax: "@mock.patch('module.func', autospec=True)",
      explanation:
        'A plain mock accepts any call signature, so a test can pass the wrong arguments to a mocked function and still pass, silently drifting out of sync with the real implementation\u2019s signature. autospec=True inspects the real object and constrains the mock to the same call signature, so tests fail loudly the moment the mock is called in a way the real function could never actually be called.',
      tags: ['mock', 'testing'],
    },
  },
  {
    id: 'py-hard-65',
    type: 'bool',
    prompt:
      'Patching a method on a single instance (instance.method = new_func) affects only that one object, while patching it on the class (Class.method = new_func) affects every instance, including ones already created.',
    answer: true,
    query: {
      title: 'Instance-level vs class-level patching scope',
      syntax: 'instance.method = new_func       # this instance only\nClass.method = new_func          # all instances',
      explanation:
        "Assigning directly on an instance just adds an entry to that instance's own __dict__, shadowing the class method for that object alone. Assigning on the class modifies the shared class attribute that every instance's attribute lookup falls back to, so the change is visible everywhere immediately, even to objects constructed before the patch, since method lookup happens at call time, not at construction time.",
      tags: ['monkeypatching', 'classes'],
    },
  },
  {
    id: 'py-hard-66',
    type: 'mc',
    prompt: 'What does `sys.setrecursionlimit(n)` actually control?',
    choices: [
      'The maximum depth of nested loops',
      'The maximum depth of the Python call stack before a RecursionError is raised, as a safety net against genuine infinite recursion crashing the interpreter',
      'The maximum number of imported modules',
      'The maximum size of a single function body',
    ],
    answerIndex: 1,
    query: {
      title: 'sys.setrecursionlimit',
      syntax: 'sys.setrecursionlimit(3000)\nsys.getrecursionlimit()',
      explanation:
        'CPython raises RecursionError once the Python call stack exceeds this limit (default 1000), preventing an unbounded recursive bug from silently crashing the whole process with a C stack overflow. Raising the limit does not make more stack space magically appear, it just moves the guardrail; setting it too high can still crash the interpreter on genuinely deep recursion.',
      tags: ['recursion', 'sys'],
    },
  },
  {
    id: 'py-hard-67',
    type: 'bool',
    prompt: 'CPython performs tail-call optimization, so a recursive function written in tail-recursive style will not grow the call stack.',
    answer: false,
    query: {
      title: 'No tail-call optimization in CPython',
      syntax: '',
      explanation:
        'Unlike some functional languages, CPython deliberately does not implement tail-call optimization; every recursive call adds a new frame to the call stack regardless of whether it is the last operation in the function. This is intentional: TCO would erase useful stack frames from tracebacks, making debugging harder. Deeply tail-recursive algorithms must be rewritten iteratively in Python to avoid hitting the recursion limit.',
      tags: ['recursion', 'internals'],
    },
  },
  {
    id: 'py-hard-68',
    type: 'mc',
    prompt: 'What advantage does `memoryview(some_bytes)[10:20]` have over `some_bytes[10:20]`?',
    code: 'data = bytes(10_000_000)\nview = memoryview(data)[10:20]   # no copy\nchunk = data[10:20]                # copies 10 bytes into a new object',
    choices: [
      'None, they are identical operations',
      'The memoryview slice shares the underlying buffer with the original object with no copy, while slicing bytes directly allocates a new object and copies the data',
      'memoryview slices are always faster to print',
      'memoryview makes the data mutable even though bytes is immutable',
    ],
    answerIndex: 1,
    query: {
      title: 'memoryview and the buffer protocol',
      syntax: 'memoryview(obj)[start:stop]',
      explanation:
        "memoryview exposes an object's underlying memory buffer (via the buffer protocol) without copying it, and slicing a memoryview produces another view into the same memory rather than a fresh copy. This matters a lot for large binary data, network protocol parsing, or numeric buffers, where copying gigabytes of data just to look at a slice of it would be wasteful.",
      tags: ['memoryview', 'buffer-protocol'],
    },
  },
  {
    id: 'py-hard-69',
    type: 'mc',
    prompt: 'Which of bytes, bytearray, and memoryview is mutable, and how does that differ from the others?',
    choices: [
      'All three are mutable',
      'bytes is immutable like str; bytearray is a mutable buffer you can modify in place; memoryview is a view that may or may not be writable depending on what it wraps, and never owns the underlying data itself',
      'None of the three are mutable',
      'Only memoryview is mutable; bytes and bytearray are both immutable',
    ],
    answerIndex: 1,
    query: {
      title: 'The bytes-like type family',
      syntax: 'bytearray(b"hello")[0] = 72',
      explanation:
        "bytes is the immutable binary counterpart to str. bytearray is its mutable sibling, letting you modify individual bytes in place, useful for building up binary data incrementally. memoryview does not hold data at all, it is a lens onto another object's buffer, and whether you can write through it depends entirely on whether the underlying buffer (e.g. a bytearray) is itself writable.",
      tags: ['bytes', 'bytearray', 'memoryview'],
    },
  },
  {
    id: 'py-hard-70',
    type: 'mc',
    prompt: 'Given `original = [[1, 2], [3, 4]]` and `shallow = copy.copy(original)`, what happens if you do `shallow[0].append(99)`?',
    code: 'original = [[1, 2], [3, 4]]\nshallow = copy.copy(original)\nshallow[0].append(99)\nprint(original[0])',
    choices: [
      'It prints [1, 2], original is unaffected',
      'It prints [1, 2, 99], because a shallow copy only duplicates the outer list; the inner lists are shared references',
      'It raises TypeError',
      'It creates a brand new inner list automatically',
    ],
    answerIndex: 1,
    query: {
      title: 'Shallow copy shares nested mutable objects',
      syntax: 'copy.copy(obj)     # shallow\ncopy.deepcopy(obj)  # recursive',
      explanation:
        'copy.copy duplicates only the top-level container; every element inside it is the exact same object as in the original, not a copy. Mutating a nested mutable element through the shallow copy is therefore visible through the original too. copy.deepcopy recursively duplicates every nested object instead, so the two structures become fully independent.',
      tags: ['copy', 'deepcopy'],
    },
  },
  {
    id: 'py-hard-71',
    type: 'mc',
    prompt: 'How can a class customize what `copy.deepcopy` does to its instances?',
    code: 'class Node:\n    def __deepcopy__(self, memo):\n        new = Node()\n        memo[id(self)] = new\n        new.children = copy.deepcopy(self.children, memo)\n        return new',
    choices: [
      'It cannot, deepcopy always uses the same generic algorithm',
      'By defining a __deepcopy__(self, memo) method, which the copy module calls instead of its default recursive strategy',
      'By setting __slots__ to an empty tuple',
      'By overriding __eq__',
    ],
    answerIndex: 1,
    query: {
      title: 'Customizing deepcopy',
      syntax: '__copy__(self)\n__deepcopy__(self, memo)',
      explanation:
        "When present, __deepcopy__ takes over entirely for that class, which is essential when default recursive copying would be wrong (for example, an object wrapping a file handle, socket, or database connection that should not be duplicated). It receives a memo dict shared by the whole deepcopy call, and implementations are expected to register memo[id(self)] = new_object early to correctly handle cycles.",
      tags: ['copy', 'dunder'],
    },
  },
  {
    id: 'py-hard-72',
    type: 'bool',
    prompt: '`copy.deepcopy` can safely handle an object graph that contains a reference cycle, without recursing forever.',
    answer: true,
    code: 'a = {}\na["self"] = a\nb = copy.deepcopy(a)  # does not infinite-loop',
    query: {
      title: 'The memo dict prevents infinite recursion',
      syntax: 'copy.deepcopy(x, memo={})',
      explanation:
        "deepcopy keeps a memo dictionary mapping id(original_object) to the already-created copy. Before recursing into an object, it checks whether that object's id is already in the memo, and reuses the existing copy if so instead of recursing again. This is what lets deepcopy correctly and safely reproduce cyclic structures, including the cycle itself, in the copy.",
      tags: ['copy', 'deepcopy', 'cycles'],
    },
  },
  {
    id: 'py-hard-73',
    type: 'mc',
    prompt: 'Why does passing a lambda as the target function to `multiprocessing.Process` typically fail on some platforms?',
    code: "p = multiprocessing.Process(target=lambda: print('hi'))\np.start()  # PicklingError on some start methods",
    choices: [
      'Lambdas are not real functions in Python',
      'Spawning a new process needs to pickle the target and its arguments to hand them to the child process, and lambdas (and most local closures) cannot be pickled',
      'Lambdas run synchronously and block the process pool',
      'multiprocessing does not support functions with zero arguments',
    ],
    answerIndex: 1,
    query: {
      title: 'multiprocessing needs picklable targets',
      syntax: 'import pickle\npickle.dumps(some_function)',
      explanation:
        'With the spawn start method (the default on Windows and macOS), a brand-new interpreter process is created and the target callable plus its arguments are serialized with pickle to send across the process boundary. Pickle can only reference functions by their importable module-level name, so lambdas, nested functions, and other unpicklable objects fail; the fix is to define a real module-level function instead.',
      tags: ['multiprocessing', 'pickle'],
    },
  },
  {
    id: 'py-hard-74',
    type: 'mc',
    prompt: "Since separate processes don't share memory the way threads do, how does `multiprocessing.Value` let processes share a single mutable value?",
    code: 'counter = multiprocessing.Value("i", 0)\nwith counter.get_lock():\n    counter.value += 1',
    choices: [
      'It secretly uses threads under the hood instead of real processes',
      'It allocates memory in an OS-backed shared-memory segment that every process maps into its own address space, giving them a genuinely shared piece of memory rather than separate copies',
      'It copies the value to every process once at startup and never updates it again',
      'It uses sockets to synchronously transmit every read and write',
    ],
    answerIndex: 1,
    query: {
      title: 'Explicit shared memory for multiprocessing',
      syntax: 'multiprocessing.Value(typecode, initial)\nmultiprocessing.Array(typecode, sequence)',
      explanation:
        "Regular process memory is isolated, changes in a child process don't appear in the parent. multiprocessing.Value and Array opt specific pieces of data into OS-level shared memory that all participating processes map, giving genuinely shared, mutable storage across process boundaries, though you still need to manage synchronization yourself with the accompanying lock, since multiple processes writing concurrently can still race.",
      tags: ['multiprocessing', 'shared-memory'],
    },
  },
  {
    id: 'py-hard-75',
    type: 'mc',
    prompt: "A context manager's __exit__ method returns True while an exception is propagating through the with block. What happens?",
    code: 'class Suppressor:\n    def __enter__(self): return self\n    def __exit__(self, exc_type, exc_val, tb):\n        return True\n\nwith Suppressor():\n    raise ValueError("boom")\nprint("still runs")',
    choices: [
      'The exception still propagates after __exit__ finishes',
      'The exception is suppressed entirely, execution continues normally after the with block as if nothing was raised',
      'It raises a new SystemExit',
      'It only works for exceptions of type Warning',
    ],
    answerIndex: 1,
    query: {
      title: 'Exact __exit__ suppression semantics',
      syntax: '__exit__(self, exc_type, exc_val, tb) -> bool',
      explanation:
        'A truthy return from __exit__ is a deliberate signal telling the with statement to swallow the in-flight exception rather than let it propagate. Any falsy return, including None (the implicit result of a function with no explicit return), lets the exception continue propagating normally. This exact contract is easy to get backwards; forgetting to return anything means exceptions always propagate, which is usually what you want unless you are deliberately building something like contextlib.suppress.',
      tags: ['context-managers', 'exceptions'],
    },
  },
  {
    id: 'py-hard-76',
    type: 'mc',
    prompt: 'What does `contextlib.suppress(FileNotFoundError)` do?',
    code: 'with contextlib.suppress(FileNotFoundError):\n    os.remove("maybe_missing.txt")',
    choices: [
      'Logs the exception without stopping it from propagating',
      'Turns try/except FileNotFoundError: pass into a reusable context manager, silently ignoring exactly that exception type if it occurs inside the block',
      'Retries the block up to 3 times before giving up',
      'Suppresses all warnings, not exceptions',
    ],
    answerIndex: 1,
    query: {
      title: 'contextlib.suppress',
      syntax: 'with contextlib.suppress(ExcType1, ExcType2): ...',
      explanation:
        "suppress is a small built-in context manager whose __exit__ returns True only when the exception raised inside the block matches one of the given types, otherwise it lets it propagate. It exists purely to replace the common try: ... except SomeError: pass idiom with something that reads more intentionally and is a little harder to accidentally over-broaden into catching everything.",
      tags: ['contextlib', 'exceptions'],
    },
  },
  {
    id: 'py-hard-77',
    type: 'mc',
    prompt: 'How does `@contextlib.contextmanager` turn a generator function into a context manager?',
    code: "@contextlib.contextmanager\ndef managed():\n    print('enter')\n    try:\n        yield 'resource'\n    finally:\n        print('exit')",
    choices: [
      'It wraps the generator so that code before the yield runs on __enter__ (the yielded value becomes the as target), and code after the yield runs on __exit__',
      'It converts the function into a class with no relation to the yield',
      'It requires two separate yield statements, one for enter and one for exit',
      'It only works with async generators',
    ],
    answerIndex: 0,
    query: {
      title: 'Generator-based context managers',
      syntax: '@contextlib.contextmanager\ndef cm():\n    setup\n    try:\n        yield value\n    finally:\n        teardown',
      explanation:
        'The decorator wraps the generator in a helper object implementing __enter__/__exit__. Calling __enter__ advances the generator to its yield, using the yielded value as the with ... as target; calling __exit__ resumes the generator past the yield (or throws the exception into it, if one occurred), letting a try/finally around the yield guarantee cleanup runs. This is a much lighter-weight way to write simple context managers than defining a full class.',
      tags: ['contextlib', 'generators'],
    },
  },
  {
    id: 'py-hard-78',
    type: 'bool',
    prompt: "If a context manager's __enter__ method itself raises an exception, its __exit__ method is still called to clean up.",
    answer: false,
    code: 'class Bad:\n    def __enter__(self):\n        raise RuntimeError("setup failed")\n    def __exit__(self, *exc):\n        print("never runs")\n\nwith Bad():\n    pass',
    query: {
      title: '__exit__ is not called if __enter__ fails',
      syntax: '',
      explanation:
        'The with statement guarantees that __exit__ runs if the block was actually entered, meaning __enter__ completed successfully. If __enter__ itself raises, the object never finished entering, so there is nothing to clean up from the with statement\u2019s point of view, and __exit__ is skipped entirely; the exception from __enter__ just propagates normally.',
      tags: ['context-managers', 'exceptions'],
    },
  },
  {
    id: 'py-hard-79',
    type: 'mc',
    prompt: 'What does this function return?',
    code: "def f():\n    try:\n        return 1\n    finally:\n        print('cleanup')\n\nf()",
    choices: [
      'It returns 1 without ever printing "cleanup"',
      'It prints "cleanup" and then returns 1; finally always runs even when try exits via return',
      'It raises an exception because return and finally conflict',
      'It returns None instead of 1',
    ],
    answerIndex: 1,
    query: {
      title: 'finally always runs',
      syntax: 'try:\n    return value\nfinally:\n    cleanup()',
      explanation:
        'A finally block runs no matter how the try block exits: normally, via an exception, or via return/break/continue. Here, Python evaluates the return value 1, then executes the finally block, then actually returns. If finally itself contained a return, that would override and replace the pending return value entirely, a classic and confusing gotcha.',
      tags: ['try-finally', 'control-flow'],
    },
  },
  {
    id: 'py-hard-80',
    type: 'mc',
    prompt: "When does the else clause of a try/except/else block run?",
    code: "try:\n    risky()\nexcept ValueError:\n    handle()\nelse:\n    print('no exception occurred')",
    choices: [
      'Whenever except does not match, even if a different exception occurred',
      'Only if the try block completed with no exception raised at all',
      'Always, right after the try block, regardless of exceptions',
      'Only if except explicitly re-raises',
    ],
    answerIndex: 1,
    query: {
      title: 'try/else semantics',
      syntax: 'try:\n    ...\nexcept X:\n    ...\nelse:\n    # only if no exception\n    ...',
      explanation:
        'The else clause on a try statement specifically means "ran the whole try block clean, with zero exceptions of any kind." It is not simply "the except did not match"; an exception of a completely different, unhandled type would propagate normally instead of running else. It exists to separate code that might raise from code that should only run on success, avoiding accidentally catching exceptions raised by that success-path code in the same except.',
      tags: ['try-except-else', 'control-flow'],
    },
  },
  {
    id: 'py-hard-81',
    type: 'bool',
    prompt:
      'If an exception is already propagating out of a try block and the finally block then raises a different exception, the original exception is lost and the new one propagates instead.',
    answer: true,
    code: "def f():\n    try:\n        raise ValueError('first')\n    finally:\n        raise TypeError('second')  # this one wins",
    query: {
      title: 'finally exceptions override in-flight ones',
      syntax: '',
      explanation:
        'A new exception raised inside finally replaces whatever exception was already propagating; the original is set as the new one\u2019s __context__ (implicit chaining) so it still shows up in the traceback for diagnosis, but only the new exception continues to propagate to the caller. This is a real footgun in cleanup code: a finally: connection.close() that itself raises can silently mask the actual root-cause error that triggered the cleanup.',
      tags: ['try-finally', 'exceptions'],
    },
  },
  {
    id: 'py-hard-82',
    type: 'mc',
    prompt: 'Given `class C: x = 1` and `c = C(); c.x = 2`, what is `C.x` afterward?',
    code: 'class C:\n    x = 1\n\nc = C()\nc.x = 2\nprint(C.x, c.x)',
    choices: ['1, then it becomes 2', '2 and 2', '1 and 2', 'AttributeError'],
    answerIndex: 2,
    query: {
      title: 'Instance attributes shadow, not overwrite, class attributes',
      syntax: '',
      explanation:
        "Assigning c.x = 2 creates a brand new entry in c's own __dict__; it never touches the class attribute C.x, which still holds 1. Every other instance of C that hasn't separately set its own x still sees the shared class value 1 through fallback lookup. This distinction is the root of the classic mutable class attribute gotcha when the shared default is something mutable instead of an int.",
      tags: ['classes', 'attributes'],
    },
  },
  {
    id: 'py-hard-83',
    type: 'bool',
    prompt:
      'Given `class Bag: items = []`, calling `Bag().items.append(1)` on two different instances of Bag will make both instances see the same appended item, since neither assigned its own items attribute.',
    answer: true,
    code: 'class Bag:\n    items = []\n\na, b = Bag(), Bag()\na.items.append(1)\nprint(b.items)  # [1]',
    query: {
      title: 'Mutable class attributes are shared state',
      syntax: '',
      explanation:
        "Because neither instance ever assigns self.items = ..., a.items and b.items both resolve, via fallback, to the exact same list object living on the class. Mutating it through one instance mutates the shared object every instance sees. This is the class-level sibling of the mutable default argument trap; the fix is the same idea, initialize the mutable value per-instance inside __init__.",
      tags: ['classes', 'gotchas', 'mutability'],
    },
  },
  {
    id: 'py-hard-84',
    type: 'mc',
    prompt: "What happens if you try to define `class C(A, B):` where A's metaclass is MetaA and B's metaclass is an unrelated MetaB (neither a subclass of the other)?",
    choices: [
      'Python picks MetaA arbitrarily since it is listed first',
      'It raises TypeError: metaclass conflict, since Python cannot determine a single consistent metaclass for C',
      'It silently creates C with metaclass type, ignoring both',
      'It merges MetaA and MetaB automatically into a new metaclass',
    ],
    answerIndex: 1,
    query: {
      title: 'Metaclass conflicts',
      syntax: 'TypeError: metaclass conflict',
      explanation:
        'Every class has exactly one metaclass, and when inheriting from multiple bases with unrelated metaclasses, Python has no principled way to pick one without violating consistency for the other. Resolving this for real requires deliberately defining a new metaclass that itself inherits from both MetaA and MetaB, one of the sharper edges of combining metaclass-heavy libraries together.',
      tags: ['metaclasses', 'inheritance'],
    },
  },
  {
    id: 'py-hard-85',
    type: 'mc',
    prompt: 'To make an abstract property, which decorator order is correct?',
    code: 'class Shape(abc.ABC):\n    @property\n    @abc.abstractmethod\n    def area(self): ...',
    choices: [
      '@abc.abstractmethod must be the outermost (topmost) decorator',
      '@property must be the outermost decorator, with @abc.abstractmethod directly beneath it, closest to the function',
      'Order does not matter for decorators in Python',
      'Abstract properties are not possible in Python at all',
    ],
    answerIndex: 1,
    query: {
      title: 'Stacking @property with @abstractmethod',
      syntax: '@property\n@abc.abstractmethod\ndef area(self): ...',
      explanation:
        'abstractmethod just tags the function object so ABCMeta can find it later; property then has to wrap that already-tagged function. If the order were reversed, property would wrap the plain function first, and the resulting property object, not a plain function, would be what abstractmethod decorates, which does not correctly propagate the "this is abstract" marker that ABCMeta looks for.',
      tags: ['abc', 'property', 'decorators'],
    },
  },
  {
    id: 'py-hard-86',
    type: 'mc',
    prompt: 'What is `__radd__` for, and when does Python call it?',
    code: "class Money:\n    def __radd__(self, other):\n        ...\n\n5 + Money(10)  # int.__add__ returns NotImplemented, so Money.__radd__ is tried",
    choices: [
      'It is called instead of __add__ whenever the left operand is a subclass',
      'It is the fallback for a + b when a.__add__(b) returns NotImplemented (or a lacks __add__), letting b handle the operation with the operands reversed',
      'It is used only for in-place addition (+=)',
      'It is deprecated in favor of __add__ alone',
    ],
    answerIndex: 1,
    query: {
      title: 'The reflected operator fallback protocol',
      syntax: 'a + b\n# tries a.__add__(b); if NotImplemented, tries b.__radd__(a)',
      explanation:
        'Binary operators try the left operand\u2019s forward method first; only if that returns the special NotImplemented sentinel (not raises an exception, returns it) does Python fall back to the right operand\u2019s reflected method. This is exactly how 5 + Money(10) can work even though int knows nothing about Money: int.__add__ bails out with NotImplemented, and Money.__radd__ picks up the slack.',
      tags: ['operators', 'dunder'],
    },
  },
  {
    id: 'py-hard-87',
    type: 'bool',
    prompt: 'A well-behaved __eq__ implementation should return NotImplemented, not False, when comparing against a type it does not know how to handle.',
    answer: true,
    code: 'class Vector:\n    def __eq__(self, other):\n        if not isinstance(other, Vector):\n            return NotImplemented\n        return self.x == other.x and self.y == other.y',
    query: {
      title: 'NotImplemented lets the other side try',
      syntax: 'return NotImplemented',
      explanation:
        'Returning False for an unrecognized type asserts "definitely not equal," permanently closing the door. Returning NotImplemented instead tells Python "I do not know how to compare these, ask the other operand," giving the other object\u2019s __eq__ a chance to weigh in; only if both sides return NotImplemented does Python fall back to identity-based comparison. Getting this wrong can silently break equality checks between related types in a hierarchy.',
      tags: ['eq', 'operators', 'notimplemented'],
    },
  },
  {
    id: 'py-hard-88',
    type: 'mc',
    prompt: 'What does `@functools.total_ordering` do?',
    code: '@functools.total_ordering\nclass Version:\n    def __eq__(self, other): ...\n    def __lt__(self, other): ...\n    # __le__, __gt__, __ge__ generated automatically',
    choices: [
      'Nothing without also defining all six comparison methods manually',
      'Given __eq__ and just one of __lt__/__le__/__gt__/__ge__, it fills in the remaining ordering methods automatically',
      'It sorts a list of instances of the class',
      'It makes the class immutable',
    ],
    answerIndex: 1,
    query: {
      title: 'functools.total_ordering',
      syntax: '@functools.total_ordering\nclass C:\n    def __eq__(self, other): ...\n    def __lt__(self, other): ...',
      explanation:
        'Implementing all of __eq__, __lt__, __le__, __gt__, __ge__ by hand for every ordered class is repetitive and error-prone. total_ordering derives the missing comparisons from whichever one you defined plus __eq__, at a small performance cost compared to hand-written versions, trading a bit of speed for a lot less boilerplate and fewer chances to make the six methods inconsistent with each other.',
      tags: ['functools', 'operators'],
    },
  },
  {
    id: 'py-hard-89',
    type: 'bool',
    prompt: 'If two members of an `enum.Enum` are assigned the same value, the second one defined becomes an alias for the first rather than a separate distinct member.',
    answer: true,
    code: 'class Color(enum.Enum):\n    RED = 1\n    CRIMSON = 1  # alias for RED\n\nColor.CRIMSON is Color.RED  # True',
    query: {
      title: 'Enum value aliasing',
      syntax: 'list(Color)  # CRIMSON is not listed separately',
      explanation:
        'Enum enforces that each distinct value maps to exactly one canonical member; a subsequent name assigned the same value becomes an alias that resolves to the original member object rather than creating a second one. Color.CRIMSON is Color.RED is True, and iterating the enum with list(Color) skips aliases entirely, showing only canonical members. Use @enum.unique if you want duplicate values to raise an error instead.',
      tags: ['enum', 'gotchas'],
    },
  },
  {
    id: 'py-hard-90',
    type: 'mc',
    prompt: 'By default, `@dataclass` generates __eq__ but sets __hash__ to None (unhashable). What changes if you add `frozen=True`?',
    code: '@dataclass(frozen=True)\nclass Point:\n    x: int\n    y: int',
    choices: [
      'Nothing changes regarding hashing',
      'Because the instance is now immutable, dataclass also generates a __hash__ based on the fields, making instances usable as dict keys or set members',
      'frozen=True disables __eq__ instead',
      'frozen=True has no effect on hashing but prevents attribute reads',
    ],
    answerIndex: 1,
    query: {
      title: 'dataclass frozen + hash generation',
      syntax: '@dataclass(frozen=True)',
      explanation:
        'A mutable dataclass with a generated value-based __eq__ is deliberately made unhashable by default, the same reasoning as any class overriding __eq__ without __hash__: mutation could invalidate its hash while used as a key. frozen=True makes attribute assignment raise after construction, which restores the safety __hash__ needs, so dataclass generates one automatically from the same fields used in __eq__ unless you explicitly set eq=False or unsafe_hash.',
      tags: ['dataclasses', 'hash', 'immutability'],
    },
  },
  {
    id: 'py-hard-91',
    type: 'mc',
    prompt: 'Why must a mutable default for a dataclass field be written as `field(default_factory=list)` instead of `= []`?',
    code: '@dataclass\nclass Bag:\n    items: list = field(default_factory=list)  # correct\n    # items: list = []  # raises ValueError at class definition time',
    choices: [
      'It has no real reason, both are equally valid',
      'dataclass explicitly detects a mutable default value and raises ValueError at class-definition time, precisely to prevent the shared-mutable-default bug that plain function defaults are prone to',
      'default_factory makes the field read-only',
      'Lists cannot be class attributes at all',
    ],
    answerIndex: 1,
    query: {
      title: 'Dataclasses reject mutable defaults outright',
      syntax: 'field(default_factory=callable_with_no_args)',
      explanation:
        'Rather than let dataclass users fall into the classic mutable-default-argument trap silently, dataclass explicitly checks whether a field default is an instance of list, dict, or set and raises ValueError at class definition time if so. default_factory instead stores a zero-argument callable invoked fresh for every new instance, guaranteeing each instance gets its own independent mutable object.',
      tags: ['dataclasses', 'mutability'],
    },
  },
  {
    id: 'py-hard-92',
    type: 'bool',
    prompt: 'If a class defines __repr__ but not __str__, calling `str(instance)` falls back to using __repr__.',
    answer: true,
    query: {
      title: '__str__ falls back to __repr__',
      syntax: '',
      explanation:
        "The base object.__str__ implementation simply calls self.__repr__(), so any class that only defines __repr__ still gets sensible behavior from str(), print(), and f-string interpolation. The reverse is not true: defining only __str__ does not affect repr(), which keeps the default <ClassName object at 0x...> form unless __repr__ is also overridden.",
      tags: ['repr', 'str', 'dunder'],
    },
  },
  {
    id: 'py-hard-93',
    type: 'mc',
    prompt: 'What actually happens to an attribute named `self.__secret` (two leading underscores, at most one trailing) inside a class body?',
    code: "class Base:\n    def __init__(self):\n        self.__secret = 42\n\nBase().__dict__  # {'_Base__secret': 42}",
    choices: [
      'Nothing, it is stored exactly as __secret',
      'The compiler mangles the name to _ClassName__secret, a weak mechanism to avoid accidental name clashes in subclasses, not true privacy',
      'It raises a SyntaxError',
      'It becomes a read-only class attribute',
    ],
    answerIndex: 1,
    query: {
      title: 'Double-underscore name mangling',
      syntax: '__attr  ->  _ClassName__attr  (inside the class body)',
      explanation:
        'Any identifier of the form __spam (at least two leading underscores, at most one trailing) written inside a class body is rewritten by the compiler to _ClassName__spam, where ClassName is the enclosing class\u2019s name stripped of leading underscores. This is meant to prevent a subclass\u2019s own __spam attribute from silently colliding with a base class\u2019s internal __spam; it is a naming convenience, not real access control, since instance._Base__secret still works from outside.',
      tags: ['name-mangling', 'classes'],
    },
  },
  {
    id: 'py-hard-94',
    type: 'bool',
    prompt: '`sys.getrefcount(obj)` returns exactly the number of references to obj that existed before you called the function.',
    answer: false,
    code: 'x = []\nsys.getrefcount(x)  # returns at least 2, not 1',
    query: {
      title: "getrefcount includes its own temporary reference",
      syntax: 'sys.getrefcount(obj) -> int',
      explanation:
        'Passing obj as an argument to getrefcount itself creates one additional temporary reference (the parameter binding for the duration of the call), so the returned count is always one higher than the number of references that existed in the caller\u2019s own code. This trips people up when they expect a freshly-created object with one binding to report 1.',
      tags: ['refcounting', 'sys'],
    },
  },
  {
    id: 'py-hard-95',
    type: 'mc',
    prompt: "Why is it unsafe to use id() values as long-lived, unique identifiers for objects, for example stored in a dict across a program's lifetime?",
    code: 'cache = {}\ncache[id(obj)] = "some metadata"\ndel obj\n# id() of a brand new, unrelated object can now collide with the old key',
    choices: [
      'id() values are actually random and change on every call',
      'Once an object is garbage collected, CPython is free to reuse its memory address (and thus its id()) for a completely different, later object',
      'id() is not available for user-defined classes',
      'id() values are only unique within a single thread',
    ],
    answerIndex: 1,
    query: {
      title: 'id() uniqueness only holds for live objects',
      syntax: 'id(obj)  # guaranteed unique only among currently-alive objects',
      explanation:
        "CPython's id() is guaranteed unique and constant only for the lifetime of the object; commonly it is literally the object's memory address. Once that object is destroyed, the allocator is free to hand that same address to a brand-new, entirely unrelated object, so a stale id() value stored somewhere can silently \"match\" the wrong later object, a subtle bug when using id() as a dict key beyond an object's actual lifetime.",
      tags: ['id', 'gc', 'gotchas'],
    },
  },
  {
    id: 'py-hard-96',
    type: 'mc',
    prompt: 'What does `1 < 2 < 0` evaluate to, and why is it not the same as chaining bool results?',
    code: '1 < 2 < 0\n# vs\n(1 < 2) < 0   # bool(True) < 0, a totally different comparison',
    choices: [
      'True, because 1 < 2 is True and True is truthy',
      'False, because Python evaluates it as (1 < 2) and (2 < 0), short-circuiting on the first false comparison, with each operand evaluated at most once',
      'It raises a SyntaxError',
      'It is identical to (1 < 2) < 0, which is also False, so it does not matter',
    ],
    answerIndex: 1,
    query: {
      title: 'Chained comparison semantics',
      syntax: 'a < b < c  ==  (a < b) and (b < c)   # but b evaluated only once',
      explanation:
        'Python chained comparisons implicitly AND each adjacent pair, short-circuiting as soon as one is false, and critically each middle expression is evaluated only once even though it conceptually participates in two comparisons. This differs from explicitly writing (1 < 2) < 0, which first computes the boolean True, then compares that boolean (as 1) against 0, giving False here too but for an entirely different, coincidental reason.',
      tags: ['comparisons', 'operators'],
    },
  },
  {
    id: 'py-hard-97',
    type: 'bool',
    prompt:
      'Once an iterator (as opposed to an iterable like a list) has been fully consumed by a for loop or list(), calling iter() on it again gives you a fresh pass over the same elements.',
    answer: false,
    code: 'it = iter([1, 2, 3])\nlist(it)         # [1, 2, 3], consumes it\nlist(iter(it))   # [], still exhausted',
    query: {
      title: 'Iterators cannot be rewound',
      syntax: '',
      explanation:
        "An iterator's __iter__ is required to return itself, so calling iter() on an already-exhausted iterator just gives back the same, still-exhausted object; there is no built-in way to reset it. This is a fundamental difference from a container like a list: calling iter(some_list) repeatedly always gives a brand-new iterator starting from the beginning, because the list is iterable but is not itself an iterator.",
      tags: ['iterators', 'gotchas'],
    },
  },
  {
    id: 'py-hard-98',
    type: 'bool',
    prompt: 'Calling a generator function, e.g. `g = my_gen()`, executes the function body up to the first yield immediately.',
    answer: false,
    code: "def my_gen():\n    print('starting')\n    yield 1\n\ng = my_gen()  # nothing printed yet\nnext(g)         # NOW 'starting' prints, then yields 1",
    query: {
      title: 'Generator bodies are fully lazy',
      syntax: '',
      explanation:
        "Calling a generator function does not run any of its code, it only constructs and returns a generator object holding the suspended frame. None of the body executes, not even the code before the first yield, until the generator is actually driven forward via next(), .send(), or a for loop. This is a common surprise for anyone assuming print statements or side effects near the top of the function fire at creation time.",
      tags: ['generators', 'laziness'],
    },
  },
  {
    id: 'py-hard-99',
    type: 'mc',
    prompt: 'A class defines `__len__` but not `__bool__`. What does `bool(instance)` use to decide truthiness?',
    code: 'class Bag:\n    def __len__(self):\n        return self._count\n\nbool(Bag())  # falls back to len() != 0',
    choices: [
      'It is always True regardless of __len__',
      'It falls back to __len__, treating the instance as falsy exactly when len(instance) == 0',
      'It raises TypeError since __bool__ is required',
      "It uses the object's __repr__ string length instead",
    ],
    answerIndex: 1,
    query: {
      title: 'Truthiness fallback chain',
      syntax: 'bool(obj)\n# tries obj.__bool__(); if absent, tries len(obj) != 0; else True',
      explanation:
        "Python's truth-value algorithm checks __bool__ first; if a class does not define it but does define __len__, that is used instead, treating a length of zero as falsy and any nonzero length as truthy. Only if neither is defined does an object default to always being truthy. This fallback is exactly why empty built-in containers like [], {}, and \"\" are falsy without any of them needing an explicit __bool__.",
      tags: ['bool', 'len', 'truthiness'],
    },
  },
  {
    id: 'py-hard-100',
    type: 'mc',
    prompt:
      "Both @staticmethod and @classmethod are themselves implemented as descriptors. What is the key functional difference in what their __get__ binds?",
    code: 'class C:\n    @classmethod\n    def make(cls): return cls()\n    @staticmethod\n    def helper(): return 42',
    choices: [
      'They are functionally identical; the decorators are just stylistic',
      "classmethod's __get__ binds the owning class as the first argument (cls); staticmethod's __get__ binds nothing extra at all, behaving like a plain function attached to the class",
      'staticmethod binds the instance; classmethod binds nothing',
      'Both bind the instance, differing only in return type',
    ],
    answerIndex: 1,
    query: {
      title: 'staticmethod and classmethod as descriptors',
      syntax: 'classmethod.__get__(instance, owner) -> bound method with cls\nstaticmethod.__get__(instance, owner) -> plain underlying function',
      explanation:
        "A regular method's descriptor binds the instance as the first argument (self). classmethod overrides that binding to pass the class instead, which is why cls.make() and instance.make() both receive the class, not an instance, useful for alternate constructors. staticmethod goes further and binds nothing at all, unwrapping to the plain underlying function, which is why it can be called with no implicit first argument whatsoever, from either the class or an instance.",
      tags: ['staticmethod', 'classmethod', 'descriptors'],
    },
  },
];
