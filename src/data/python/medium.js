// Python / Medium question bank.
// Every item targets Python-specific syntax or standard-library behavior,
// not general programming trivia that would apply to any language.

export const pythonMedium = [
  {
    id: 'py-med-01',
    type: 'mc',
    prompt: "What does `lst[::-1]` produce for `lst = [1, 2, 3]`?",
    code: 'lst = [1, 2, 3]\nlst[::-1]',
    choices: [
      'A new list, reversed',
      'The same list object, mutated in place',
      'A ValueError',
      'Only the first and last elements',
    ],
    answerIndex: 0,
    query: {
      title: 'Extended slicing: `seq[start:stop:step]`',
      syntax: 'sequence[start:stop:step]',
      explanation:
        'A negative step walks the sequence backward. Omitting start and stop with a step of -1 tells Python to walk the entire sequence from end to start, and slicing always returns a new list rather than mutating the original. This is distinct from `.reverse()`, which mutates the list in place and returns `None`.',
      tags: ['slicing', 'lists'],
    },
  },
  {
    id: 'py-med-02',
    type: 'mc',
    prompt: 'What happens when you evaluate `i` immediately after `y = [i for i in range(3)]` in Python 3?',
    code: 'y = [i for i in range(3)]\nprint(i)',
    choices: [
      'Prints `2`',
      'Prints `3`',
      'Raises `NameError`',
      'Prints `0`',
    ],
    answerIndex: 2,
    query: {
      title: 'Comprehension scoping',
      syntax: '[expr for target in iterable]',
      explanation:
        'Unlike a `for` loop, a list/set/dict comprehension runs in its own implicit function scope in Python 3. The loop variable does not leak into the enclosing scope, so referencing `i` afterward raises `NameError`. Python 2 leaked the variable; this is one of the behavior changes between the two.',
      tags: ['comprehensions', 'scope'],
    },
  },
  {
    id: 'py-med-03',
    type: 'bool',
    prompt:
      'A closure created inside a loop captures the loop variable by reference, so every lambda in `[lambda: i for i in range(3)]` returns `2` when called after the loop finishes.',
    answer: true,
    query: {
      title: 'Late-binding closures',
      syntax: 'lambda: i   # captures the variable, not its value',
      explanation:
        'Python closures bind to the variable itself, not its value at definition time. By the time any of the lambdas are called, the loop has finished and `i` holds its final value. The standard fix is to bind the current value as a default argument: `lambda i=i: i`.',
      tags: ['closures', 'gotchas'],
    },
  },
  {
    id: 'py-med-04',
    type: 'mc',
    prompt: 'Inside a function signature, `*args` collects extra positional arguments into a:',
    code: 'def f(*args):\n    print(type(args))',
    choices: ['dict', 'list', 'tuple', 'set'],
    answerIndex: 2,
    query: {
      title: 'Variadic positional parameters',
      syntax: 'def f(*args, **kwargs): ...',
      explanation:
        'The single-star form packs remaining positional arguments into a `tuple`, which is immutable and preserves call order. The double-star form (`**kwargs`) packs remaining keyword arguments into a `dict`. Mixing the two forms is common for wrapper functions that forward a call unchanged.',
      tags: ['functions', 'unpacking'],
    },
  },
  {
    id: 'py-med-05',
    type: 'mc',
    prompt: 'Which dunder method is invoked when Python enters a `with obj:` block?',
    code: 'class Resource:\n    def __enter__(self):\n        ...\n    def __exit__(self, exc_type, exc_val, tb):\n        ...',
    choices: ['__init__', '__call__', '__enter__', '__context__'],
    answerIndex: 2,
    query: {
      title: 'The context manager protocol',
      syntax: '__enter__(self) -> Any\n__exit__(self, exc_type, exc_val, tb) -> bool | None',
      explanation:
        "`__enter__` runs when the `with` block is entered and its return value is bound to the `as` target. `__exit__` always runs on exit, exception or not, and receives the exception info as three arguments. Returning a truthy value from `__exit__` suppresses the exception instead of letting it propagate.",
      tags: ['context-managers', 'dunder'],
    },
  },
  {
    id: 'py-med-06',
    type: 'mc',
    prompt: 'What are `bool([])` and `bool([0])`, respectively?',
    code: 'bool([]), bool([0])',
    choices: ['False, False', 'True, True', 'False, True', 'True, False'],
    answerIndex: 2,
    query: {
      title: 'Truthiness of containers',
      syntax: 'bool(obj) -> obj.__bool__() or len(obj) != 0',
      explanation:
        'Containers are falsy only when they are empty. `[]` has length zero and is falsy. `[0]` has one element, and the element being the falsy integer `0` is irrelevant, the container itself is non-empty and therefore truthy.',
      tags: ['truthiness', 'lists'],
    },
  },
  {
    id: 'py-med-07',
    type: 'bool',
    prompt:
      'In `def f(x=[]): x.append(1); return x`, every call to `f()` with no argument shares and mutates the same default list object.',
    answer: true,
    query: {
      title: 'The mutable default argument trap',
      syntax: 'def f(x=[]): ...   # evaluated once, at def time',
      explanation:
        'Default argument values are evaluated exactly once, when the function is defined, and stored on the function object. A mutable default like `[]` is therefore the same object across every call that omits the argument, and mutations accumulate. The idiomatic fix is `def f(x=None): x = [] if x is None else x`.',
      tags: ['functions', 'gotchas'],
    },
  },
  {
    id: 'py-med-08',
    type: 'mc',
    prompt: "What must the argument to `'-'.join(...)` be?",
    code: "'-'.join(['a', 'b', 'c'])",
    choices: [
      'A single string',
      'Any iterable of strings',
      'A list of any type',
      'A dictionary',
    ],
    answerIndex: 1,
    query: {
      title: 'str.join(iterable)',
      syntax: 'separator.join(iterable_of_str) -> str',
      explanation:
        "`join` is a method on the separator string, not on the collection, which trips up people coming from languages where it hangs off the list. It accepts any iterable, not just a list, but every element must already be a `str`; joining a list containing an `int` raises `TypeError`.",
      tags: ['strings', 'methods'],
    },
  },
  {
    id: 'py-med-09',
    type: 'mc',
    prompt: 'Inside a function signature, `**kwargs` collects extra keyword arguments into a:',
    code: 'def f(**kwargs):\n    print(type(kwargs))',
    choices: ['tuple', 'list', 'dict', 'namedtuple'],
    answerIndex: 2,
    query: {
      title: 'Variadic keyword parameters',
      syntax: 'def f(**kwargs): ...',
      explanation:
        'Every keyword argument not matched by an explicit parameter is collected into a regular `dict`, keyed by the argument name as a string, in the order the caller supplied them (dict ordering is insertion order as of Python 3.7).',
      tags: ['functions', 'unpacking'],
    },
  },
  {
    id: 'py-med-10',
    type: 'mc',
    prompt: 'What does `"{:.2f}".format(3.14159)` evaluate to?',
    code: '"{:.2f}".format(3.14159)',
    choices: ["'3.14'", "'3.1'", "'3.142'", "'3.14159'"],
    answerIndex: 0,
    query: {
      title: 'Format specification mini-language',
      syntax: '"{:[fill][align][sign][width].[precision][type]}".format(value)',
      explanation:
        "The `.2f` spec means fixed-point notation with two digits after the decimal point, rounding rather than truncating. The same mini-language works inside f-strings (`f'{value:.2f}'`) and with the built-in `format()` function.",
      tags: ['strings', 'formatting'],
    },
  },
];
