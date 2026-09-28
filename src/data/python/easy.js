// Python / Easy question bank.
// Foundational but still Python-specific: idioms and behavior particular
// to the language, not generic "what is a variable" programming trivia.

export const pythonEasy = [
  {
    id: 'py-easy-01',
    type: 'mc',
    prompt: 'What does `int(-3.9)` evaluate to?',
    code: 'int(-3.9)',
    choices: ['-4', '-3', '-3.9', 'Raises a TypeError'],
    answerIndex: 1,
    query: {
      title: 'int() truncates toward zero',
      explanation:
        "int() on a float truncates the fractional part rather than rounding, and truncation moves toward zero rather than toward negative infinity. So -3.9 becomes -3, not -4. This differs from the `//` floor-division operator, which always rounds toward negative infinity.",
      tags: ['type-conversion', 'numbers'],
    },
  },
  {
    id: 'py-easy-02',
    type: 'mc',
    prompt: "What does `float('nan') == float('nan')` evaluate to?",
    code: "float('nan') == float('nan')",
    choices: ['True', 'False', 'Raises ValueError', 'None'],
    answerIndex: 1,
    query: {
      title: 'NaN is never equal to itself',
      explanation:
        "Python follows the IEEE 754 standard for floating point, under which NaN ('not a number') compares unequal to every value, including another NaN. This is why `math.isnan(x)` exists as the correct way to test for NaN rather than `x == float('nan')`.",
      tags: ['numbers', 'float'],
    },
  },
  {
    id: 'py-easy-03',
    type: 'mc',
    prompt: 'What is the type and value of `7 / 2` in Python 3?',
    code: '7 / 2',
    choices: ['int, 3', 'float, 3.5', 'float, 3.0', 'int, 3.5 (raises no error)'],
    answerIndex: 1,
    query: {
      title: 'True division always returns a float',
      explanation:
        'In Python 3, the `/` operator always performs true division and returns a float, even when both operands are ints and divide evenly. Use `//` for floor division when an integer-flavored result is wanted.',
      tags: ['operators', 'numbers'],
    },
  },
  {
    id: 'py-easy-04',
    type: 'mc',
    prompt: 'What does `-7 % 3` evaluate to in Python?',
    code: '-7 % 3',
    choices: ['-1', '1', '2', '-2'],
    answerIndex: 2,
    query: {
      title: 'Modulo result takes the sign of the divisor',
      explanation:
        "Python's `%` operator returns a result with the same sign as the divisor, not the dividend. `-7 % 3` computes as `-7 - (3 * floor(-7 / 3))`, which is `-7 - (3 * -3) = 2`. This differs from languages like C, where the result instead takes the sign of the dividend.",
      tags: ['operators', 'numbers'],
    },
  },
  {
    id: 'py-easy-05',
    type: 'mc',
    prompt: 'What does `-2 ** 2` evaluate to?',
    code: '-2 ** 2',
    choices: ['4', '-4', '-2', 'Raises SyntaxError'],
    answerIndex: 1,
    query: {
      title: 'Exponentiation binds tighter than unary minus',
      explanation:
        '`**` has higher precedence than unary minus, so `-2 ** 2` parses as `-(2 ** 2)`, which is `-4`, not `(-2) ** 2`, which would be `4`. Parenthesize explicitly when the base itself should be negative.',
      tags: ['operators', 'precedence'],
    },
  },
  {
    id: 'py-easy-06',
    type: 'bool',
    prompt: '`1 < 2 < 3` in Python is evaluated as `(1 < 2) and (2 < 3)`, not as `(1 < 2) < 3`.',
    answer: true,
    query: {
      title: 'Chained comparisons',
      syntax: '1 < 2 < 3   # True',
      explanation:
        "Python treats a chain of comparison operators as an implicit `and` of each adjacent pair, with the middle value evaluated only once. This differs from a naive left-to-right reading that would feed the boolean result of the first comparison into the second.",
      tags: ['operators', 'comparisons'],
    },
  },
  {
    id: 'py-easy-07',
    type: 'mc',
    prompt: 'What does the expression `3 or 5` evaluate to?',
    code: '3 or 5',
    choices: ['True', '5', '3', 'False'],
    answerIndex: 2,
    query: {
      title: '`and`/`or` return an operand, not a bool',
      explanation:
        "Unlike many languages, Python's `and` and `or` don't coerce to booleans, they return whichever actual operand decided the result. `or` returns its first operand as soon as it's truthy, short-circuiting before the second is even evaluated. Since 3 is truthy, the expression short-circuits and returns 3.",
      tags: ['operators', 'booleans'],
    },
  },
  {
    id: 'py-easy-08',
    type: 'mc',
    prompt: 'What does `not 0` evaluate to?',
    code: 'not 0',
    choices: ['False', '0', 'True', 'None'],
    answerIndex: 2,
    query: {
      title: '`not` always returns a bool',
      explanation:
        "`not` evaluates its operand's truthiness and returns the opposite as an actual `bool`, unlike `and`/`or`, which return one of their original operands. Since 0 is falsy, `not 0` is `True`.",
      tags: ['operators', 'booleans'],
    },
  },
  {
    id: 'py-easy-09',
    type: 'bool',
    prompt: '`True == 1` evaluates to `True` because `bool` is a subclass of `int` in Python.',
    answer: true,
    query: {
      title: 'bool is a subclass of int',
      syntax: 'isinstance(True, int)  # True',
      explanation:
        "Python's `bool` type is implemented as a subclass of `int`, with `True` behaving as 1 and `False` as 0 in arithmetic and comparisons. This is why `True + True == 2` and `isinstance(True, int)` both hold.",
      tags: ['booleans', 'numbers'],
    },
  },
  {
    id: 'py-easy-10',
    type: 'bool',
    prompt:
      "Comparing to `None` with `== None` instead of `is None` can behave unexpectedly if the object being compared defines its own `__eq__` method.",
    answer: true,
    query: {
      title: 'Prefer `is None` over `== None`',
      explanation:
        "`is None` checks identity against the single `None` singleton and can never be overridden. `== None` calls `__eq__`, which a class is free to override to return anything, so it can in principle give a surprising result even when the object plainly isn't `None`. This is why style guides recommend `is None` / `is not None`.",
      tags: ['none', 'comparisons'],
    },
  },
  {
    id: 'py-easy-11',
    type: 'mc',
    prompt: 'How do you check whether `x` is either an `int` or a `float` using `isinstance`?',
    code: 'isinstance(x, (int, float))',
    choices: [
      'isinstance(x, int, float)',
      'isinstance(x, (int, float))',
      'isinstance(x, [int, float])',
      'isinstance(x) in (int, float)',
    ],
    answerIndex: 1,
    query: {
      title: 'isinstance() accepts a tuple of types',
      explanation:
        'Passing a tuple as the second argument to `isinstance` checks whether the object is an instance of any type in that tuple. This is the idiomatic way to test against multiple types in one call rather than chaining `or`.',
      tags: ['types', 'builtins'],
    },
  },
  {
    id: 'py-easy-12',
    type: 'bool',
    prompt: 'Both lists and tuples support item assignment, like `x[0] = 5`, after creation.',
    answer: false,
    query: {
      title: 'Tuples are immutable',
      explanation:
        "Lists support in-place item assignment, but tuples do not. Attempting `t[0] = 5` on a tuple raises `TypeError: 'tuple' object does not support item assignment`. This immutability is part of what makes tuples hashable (when their contents are) and usable as dict keys.",
      tags: ['tuples', 'lists'],
    },
  },
  {
    id: 'py-easy-13',
    type: 'bool',
    prompt: "Given `s = 'hello'`, running `s[0] = 'H'` successfully changes `s` to `'Hello'`.",
    answer: false,
    query: {
      title: 'Strings are immutable',
      explanation:
        "Strings in Python cannot be modified in place; every string method that looks like a mutation actually returns a brand-new string object. `s[0] = 'H'` raises `TypeError: 'str' object does not support item assignment`. To get the capitalized version you'd write `s = 'H' + s[1:]` or call `s.capitalize()`.",
      tags: ['strings', 'immutability'],
    },
  },
  {
    id: 'py-easy-14',
    type: 'mc',
    prompt: 'What does `[10, 20, 30, 40, 50][1:3]` evaluate to?',
    code: '[10, 20, 30, 40, 50][1:3]',
    choices: ['[20, 30]', '[20, 30, 40]', '[10, 20]', '[30, 40]'],
    answerIndex: 0,
    query: {
      title: 'Slice bounds: start inclusive, stop exclusive',
      explanation:
        'A slice `[start:stop]` includes the element at `start` and excludes the element at `stop`, so `[1:3]` grabs indices 1 and 2 only. This half-open convention is consistent across all sequence slicing in Python.',
      tags: ['slicing', 'lists'],
    },
  },
  {
    id: 'py-easy-15',
    type: 'mc',
    prompt: "What does `'python'[-2]` evaluate to?",
    code: "'python'[-2]",
    choices: ["'n'", "'o'", "'h'", "'t'"],
    answerIndex: 1,
    query: {
      title: 'Negative indices count from the end',
      explanation:
        "Index -1 refers to the last character, -2 to the second-to-last, and so on. `'python'[-2]` is the same as `'python'[len('python') - 2]`, which lands on `'o'`.",
      tags: ['strings', 'indexing'],
    },
  },
  {
    id: 'py-easy-16',
    type: 'bool',
    prompt: 'Given `lst = [1, 2, 3]`, evaluating `lst[1:100]` raises an `IndexError`.',
    answer: false,
    query: {
      title: 'Slicing never raises IndexError',
      syntax: 'lst[1:100]  # [2, 3], no error',
      explanation:
        'Unlike direct indexing (`lst[100]`, which does raise `IndexError`), slicing silently clamps any out-of-range bound to the sequence\u2019s actual length. `lst[1:100]` simply returns everything from index 1 to the end.',
      tags: ['slicing', 'lists'],
    },
  },
  {
    id: 'py-easy-17',
    type: 'mc',
    prompt: 'What does `list(range(10))[::3]` evaluate to?',
    code: 'list(range(10))[::3]',
    choices: ['[0, 3, 6, 9]', '[0, 1, 2]', '[3, 6, 9]', '[0, 3, 6, 9, 10]'],
    answerIndex: 0,
    query: {
      title: 'The step argument in slicing',
      explanation:
        'The third slice component sets the step size. With start and stop omitted, `[::3]` walks the full sequence from the beginning, taking every third element: indices 0, 3, 6, and 9.',
      tags: ['slicing', 'lists'],
    },
  },
  {
    id: 'py-easy-18',
    type: 'bool',
    prompt: 'After `rows = [[]] * 3`, appending to `rows[0]` also affects `rows[1]` and `rows[2]`.',
    answer: true,
    query: {
      title: 'Multiplying a list of a mutable object shares references',
      syntax: 'rows = [[]] * 3\nrows[0].append(1)  # all three inner lists now show [1]',
      explanation:
        '`[[]] * 3` does not create three independent empty lists, it creates one empty list and repeats a reference to that same object three times. Mutating through any of the three names mutates the one shared underlying list. The fix is `[[] for _ in range(3)]`, which builds a genuinely new list on each iteration.',
      tags: ['lists', 'gotchas'],
    },
  },
  {
    id: 'py-easy-19',
    type: 'mc',
    prompt: "What does `'ab' * 3` evaluate to?",
    code: "'ab' * 3",
    choices: ["'ababab'", "'ab ab ab'", "['ab', 'ab', 'ab']", 'A TypeError'],
    answerIndex: 0,
    query: {
      title: 'Repeating a string with *',
      explanation:
        "The `*` operator, when one operand is a string and the other an int, repeats the string that many times and concatenates the copies with no separator. The same repetition behavior works on lists and tuples too.",
      tags: ['strings', 'operators'],
    },
  },
  {
    id: 'py-easy-20',
    type: 'mc',
    prompt: 'What does `[1, 2] + [3, 4]` evaluate to?',
    code: '[1, 2] + [3, 4]',
    choices: ['[1, 2, 3, 4]', '[[1, 2], [3, 4]]', '10', 'A TypeError, lists cannot use +'],
    answerIndex: 0,
    query: {
      title: 'List concatenation with +',
      explanation:
        '`+` between two lists returns a new list containing all elements of the left operand followed by all elements of the right operand, without mutating either input. This only works between two sequences of the same type; `[1, 2] + (3, 4)` raises `TypeError`.',
      tags: ['lists', 'operators'],
    },
  },
  {
    id: 'py-easy-21',
    type: 'mc',
    prompt: "Given `lst = [1, 2]`, what is the difference between `lst.append([3, 4])` and `lst.extend([3, 4])`?",
    choices: [
      'append adds [3, 4] as one nested element; extend adds 3 and 4 as separate elements',
      'They behave identically',
      'append raises a TypeError on lists; extend does not',
      'extend adds [3, 4] as one nested element; append adds 3 and 4 as separate elements',
    ],
    answerIndex: 0,
    query: {
      title: 'list.append vs list.extend',
      syntax: 'lst.append(x)   # adds x as a single new element\nlst.extend(it)  # adds every element of iterable it',
      explanation:
        '`append` always adds exactly one new element to the end of the list, whatever that argument is, even if it is itself a list. `extend` iterates over its argument and adds each item individually, so `lst.extend([3, 4])` grows the list by two elements, not one.',
      tags: ['lists', 'methods'],
    },
  },
  {
    id: 'py-easy-22',
    type: 'mc',
    prompt: "What does `lst.insert(1, 'x')` do to `lst = ['a', 'b', 'c']`?",
    code: "lst = ['a', 'b', 'c']\nlst.insert(1, 'x')",
    choices: [
      "Inserts 'x' at index 1, giving ['a', 'x', 'b', 'c']",
      "Replaces the item at index 1 with 'x'",
      "Appends 'x' to the end",
      'Raises IndexError because index 1 is already occupied',
    ],
    answerIndex: 0,
    query: {
      title: 'list.insert(index, value)',
      syntax: 'lst.insert(index, value)',
      explanation:
        'insert shifts every element at or after the given index one position to the right and places the new value there; it never overwrites an existing element. Inserting at an index beyond the list\u2019s length is safe too, it just appends to the end.',
      tags: ['lists', 'methods'],
    },
  },
  {
    id: 'py-easy-23',
    type: 'mc',
    prompt: 'What is the key difference between `lst.remove(value)` and `lst.pop(index)`?',
    choices: [
      'remove deletes by value (the first matching one); pop deletes by index and returns the removed item',
      'remove returns the removed item; pop does not',
      'They are aliases for the same operation',
      'pop only works on tuples',
    ],
    answerIndex: 0,
    query: {
      title: 'list.remove vs list.pop',
      syntax: 'lst.remove(value)  # removes first match, returns None\nlst.pop(index)      # removes by position, returns the item',
      explanation:
        '`remove` searches the list for the first element equal to the given value and deletes it, raising `ValueError` if no match exists, and returns `None`. `pop` deletes and returns the element at a given index (defaulting to the last one), raising `IndexError` if the index is out of range.',
      tags: ['lists', 'methods'],
    },
  },
  {
    id: 'py-easy-24',
    type: 'mc',
    prompt: 'Calling `lst.pop()` with no arguments removes and returns which element?',
    choices: ['The first element', 'The last element', 'A random element', 'The smallest element'],
    answerIndex: 1,
    query: {
      title: 'list.pop() defaults to the last index',
      syntax: 'lst.pop()      # same as lst.pop(-1)\nlst.pop(0)     # removes the first element instead',
      explanation:
        'With no argument, `pop` defaults to index -1, the last element, and this is an O(1) operation. Popping from the front with `pop(0)` is O(n) because every remaining element has to shift left, which is why a `deque` is preferred for frequent front removals.',
      tags: ['lists', 'methods'],
    },
  },
  {
    id: 'py-easy-25',
    type: 'mc',
    prompt: "What does `del lst[1]` do to `lst = ['a', 'b', 'c']`?",
    code: "lst = ['a', 'b', 'c']\ndel lst[1]",
    choices: [
      "Removes 'b', leaving ['a', 'c']",
      "Sets index 1 to None, leaving ['a', None, 'c']",
      'Deletes the entire list',
      "Removes 'a' and 'b'",
    ],
    answerIndex: 0,
    query: {
      title: 'del removes by position (or unbinds a name)',
      syntax: 'del lst[i]     # removes the item at index i\ndel name       # unbinds the name entirely',
      explanation:
        '`del` is a statement, not a function, and it can remove an item from a sequence by index, a key from a dict, or unbind a variable name entirely. `del lst[1]` shifts subsequent elements left, exactly like `pop`, but without returning the removed value.',
      tags: ['lists', 'del'],
    },
  },
  {
    id: 'py-easy-26',
    type: 'mc',
    prompt: 'What is the difference between `lst.sort()` and `sorted(lst)`?',
    choices: [
      'sort() mutates lst in place and returns None; sorted(lst) returns a new sorted list and leaves lst unchanged',
      'sorted(lst) mutates lst in place; sort() returns a new list',
      'They both return a new list and leave lst unchanged',
      'sort() only works on strings',
    ],
    answerIndex: 0,
    query: {
      title: 'list.sort() vs the sorted() builtin',
      syntax: 'lst.sort()        # in place, returns None\nnew = sorted(lst) # new list, lst untouched',
      explanation:
        '`sort` is a list method that reorders the list\u2019s own contents and, like most in-place mutators, returns `None`, so `x = lst.sort()` is a common bug that leaves `x` as `None`. `sorted` works on any iterable and always returns a brand-new list, leaving the original untouched.',
      tags: ['lists', 'builtins'],
    },
  },
  {
    id: 'py-easy-27',
    type: 'mc',
    prompt: 'How do you sort a list in descending order using the `sorted()` builtin?',
    choices: [
      'sorted(lst, reverse=True)',
      'sorted(lst, descending=True)',
      'sorted(lst)[::-1] is the only way',
      'reverse(sorted(lst))',
    ],
    answerIndex: 0,
    query: {
      title: 'sorted(..., reverse=True)',
      syntax: 'sorted(iterable, key=None, reverse=False)',
      explanation:
        '`sorted` takes a `reverse` keyword argument that flips the sort order without needing a separate reversal step afterward. Reversing the result of an ascending sort with slicing works too, but `reverse=True` is the idiomatic, more efficient way, since the sort algorithm handles it directly.',
      tags: ['lists', 'builtins'],
    },
  },
  {
    id: 'py-easy-28',
    type: 'mc',
    prompt: "What does `sorted(['banana', 'kiwi', 'fig'], key=len)` return?",
    code: "sorted(['banana', 'kiwi', 'fig'], key=len)",
    choices: [
      "['fig', 'kiwi', 'banana']",
      "['banana', 'kiwi', 'fig']",
      "['fig', 'banana', 'kiwi']",
      'A TypeError, since key must be a string',
    ],
    answerIndex: 0,
    query: {
      title: 'sorted(..., key=...)',
      syntax: 'sorted(iterable, key=function)',
      explanation:
        "The `key` argument takes a one-argument function applied to each element to compute its sort value, without changing what's actually stored. Sorting by `len` orders by string length: 'fig' (3), 'kiwi' (4), 'banana' (6).",
      tags: ['lists', 'builtins'],
    },
  },
  {
    id: 'py-easy-29',
    type: 'mc',
    prompt: "What does `max(['a', 'bbb', 'cc'], key=len)` return?",
    code: "max(['a', 'bbb', 'cc'], key=len)",
    choices: ["'bbb'", "'cc'", "'a'", '3'],
    answerIndex: 0,
    query: {
      title: 'min()/max() accept a key function too',
      syntax: 'max(iterable, key=function)',
      explanation:
        "Just like `sorted`, both `min` and `max` accept a `key` function to determine ranking without changing what's returned. Ranked by length, 'bbb' (length 3) is the longest, so it's returned as-is, not its length.",
      tags: ['builtins', 'numbers'],
    },
  },
  {
    id: 'py-easy-30',
    type: 'mc',
    prompt: 'What does `sum([1, 2, 3], 10)` evaluate to?',
    code: 'sum([1, 2, 3], 10)',
    choices: ['16', '6', '10', 'A TypeError'],
    answerIndex: 0,
    query: {
      title: 'sum(iterable, start)',
      syntax: 'sum(iterable, start=0)',
      explanation:
        "sum's optional second argument sets the starting value that every element is added to, defaulting to 0. `sum([1, 2, 3], 10)` computes `10 + 1 + 2 + 3`, which is 16.",
      tags: ['builtins', 'numbers'],
    },
  },
  {
    id: 'py-easy-31',
    type: 'bool',
    prompt: 'The built-in `len()` function works on strings, lists, tuples, and dicts, but not on sets.',
    answer: false,
    query: {
      title: 'len() works on any object defining __len__',
      explanation:
        '`len()` calls the object\u2019s `__len__` method, and strings, lists, tuples, dicts, and sets all implement it, returning their respective character/element/key counts. It raises `TypeError` only for objects that don\u2019t define `__len__`, such as an `int` or a plain generator object.',
      tags: ['builtins', 'sets'],
    },
  },
  {
    id: 'py-easy-32',
    type: 'mc',
    prompt: 'How many elements does `list(range(5))` contain?',
    code: 'list(range(5))',
    choices: ['4', '5', '6', 'It depends on the platform'],
    answerIndex: 1,
    query: {
      title: 'range(stop) excludes stop itself',
      syntax: 'range(stop)             # 0, 1, ..., stop-1\nrange(start, stop, step)',
      explanation:
        'range(5) produces the integers 0 through 4, five values total, because the stop argument is exclusive, matching the half-open convention used by slicing. range also doesn\u2019t build a list in memory, it\u2019s a lazy sequence; `list()` is what materializes it here.',
      tags: ['range', 'builtins'],
    },
  },
  {
    id: 'py-easy-33',
    type: 'mc',
    prompt: 'What does `list(range(10, 0, -2))` produce?',
    code: 'list(range(10, 0, -2))',
    choices: ['[10, 8, 6, 4, 2]', '[10, 8, 6, 4, 2, 0]', '[0, 2, 4, 6, 8, 10]', 'An empty list'],
    answerIndex: 0,
    query: {
      title: 'range() with a negative step',
      syntax: 'range(start, stop, step)',
      explanation:
        'With a negative step, range counts downward from start, stopping before it reaches stop. 0 is excluded because the stop bound is still exclusive regardless of direction, giving 10, 8, 6, 4, 2.',
      tags: ['range', 'builtins'],
    },
  },
  {
    id: 'py-easy-34',
    type: 'mc',
    prompt: "What does `list(enumerate(['a', 'b'], start=1))` produce?",
    code: "list(enumerate(['a', 'b'], start=1))",
    choices: [
      "[(1, 'a'), (2, 'b')]",
      "[(0, 'a'), (1, 'b')]",
      "[('a', 1), ('b', 2)]",
      "[(1, 'a'), (1, 'b')]",
    ],
    answerIndex: 0,
    query: {
      title: 'enumerate(iterable, start=0)',
      syntax: 'enumerate(iterable, start=0) -> yields (index, item) pairs',
      explanation:
        'enumerate pairs each element with a running counter, defaulting to 0, but the `start` keyword lets you offset that counter, useful for 1-based displays like line numbers. Each yielded pair keeps the counter first and the original item second.',
      tags: ['builtins', 'loops'],
    },
  },
  {
    id: 'py-easy-35',
    type: 'bool',
    prompt: "`list(zip([1, 2, 3], ['a', 'b']))` produces three pairs, filling the missing third value with `None`.",
    answer: false,
    query: {
      title: 'zip() truncates to the shortest iterable',
      syntax: "list(zip([1, 2, 3], ['a', 'b']))  # [(1, 'a'), (2, 'b')]",
      explanation:
        'zip stops as soon as any one of its input iterables runs out, silently dropping the leftover elements from the longer ones rather than padding with `None`. `itertools.zip_longest` is the variant that pads instead.',
      tags: ['builtins', 'loops'],
    },
  },
  {
    id: 'py-easy-36',
    type: 'bool',
    prompt: '`reversed([1, 2, 3])` returns a list, so you can index into it immediately, like `reversed([1, 2, 3])[0]`.',
    answer: false,
    query: {
      title: 'reversed() returns an iterator, not a list',
      syntax: 'list(reversed([1, 2, 3]))  # [3, 2, 1]',
      explanation:
        'reversed returns a lazy list_reverseiterator object, not a list, so it supports `next()` and `for` iteration but not indexing. Wrapping it in `list(...)` materializes it into an indexable list.',
      tags: ['builtins', 'lists'],
    },
  },
  {
    id: 'py-easy-37',
    type: 'mc',
    prompt: 'What does `all([1, 2, 0, 3])` evaluate to?',
    code: 'all([1, 2, 0, 3])',
    choices: ['False', 'True', '0', 'Raises TypeError'],
    answerIndex: 0,
    query: {
      title: 'all() and any() over truthiness',
      syntax: 'all(iterable)  # True if every element is truthy (or iterable is empty)\nany(iterable)  # True if at least one element is truthy',
      explanation:
        'all returns `True` only if every element in the iterable is truthy. Since 0 is falsy, its presence makes the whole result `False`, even though the other elements are truthy. An empty iterable makes `all` vacuously `True`.',
      tags: ['builtins', 'booleans'],
    },
  },
  {
    id: 'py-easy-38',
    type: 'mc',
    prompt: 'What does `list(map(lambda x: x * 2, [1, 2, 3]))` produce?',
    code: 'list(map(lambda x: x * 2, [1, 2, 3]))',
    choices: ['[2, 4, 6]', '[1, 2, 3, 1, 2, 3]', '6', 'A map object printed directly as a list of tuples'],
    answerIndex: 0,
    query: {
      title: 'map() applies a function to every element',
      syntax: 'map(function, iterable) -> lazy iterator of results',
      explanation:
        'map applies the given function to each element of the iterable and returns a lazy map object; wrapping it in `list()` forces evaluation and collects the results. Here every element is doubled, producing [2, 4, 6].',
      tags: ['builtins', 'lambda'],
    },
  },
  {
    id: 'py-easy-39',
    type: 'mc',
    prompt: 'What does `list(filter(lambda x: x % 2 == 0, [1, 2, 3, 4]))` produce?',
    code: 'list(filter(lambda x: x % 2 == 0, [1, 2, 3, 4]))',
    choices: ['[2, 4]', '[1, 3]', '[True, False, True, False]', '[1, 2, 3, 4]'],
    answerIndex: 0,
    query: {
      title: 'filter() keeps elements where the function is truthy',
      syntax: 'filter(function, iterable) -> lazy iterator of kept elements',
      explanation:
        'filter keeps only the elements for which the given function returns something truthy, discarding the rest, and returns a lazy iterator just like map. Here the lambda keeps even numbers, so 2 and 4 survive.',
      tags: ['builtins', 'lambda'],
    },
  },
  {
    id: 'py-easy-40',
    type: 'mc',
    prompt: 'Which of these is a valid way to write a one-line function that adds two numbers using `lambda`?',
    choices: ['lambda x, y: x + y', 'lambda(x, y): x + y', 'lambda x, y -> x + y', 'function(x, y) = x + y'],
    answerIndex: 0,
    query: {
      title: 'lambda expressions',
      syntax: 'lambda arg1, arg2: expression',
      explanation:
        'A lambda is an anonymous, single-expression function: parameters go before the colon, and the return value is whatever the expression after the colon evaluates to, with no explicit `return` keyword and no parentheses around the parameter list.',
      tags: ['lambda', 'functions'],
    },
  },
  {
    id: 'py-easy-41',
    type: 'mc',
    prompt: 'What does `[x * x for x in range(4)]` produce?',
    code: '[x * x for x in range(4)]',
    choices: ['[0, 1, 4, 9]', '[1, 4, 9, 16]', '[0, 1, 2, 3]', 'A generator object'],
    answerIndex: 0,
    query: {
      title: 'Basic list comprehension syntax',
      syntax: '[expression for item in iterable]',
      explanation:
        'A list comprehension evaluates the expression once per item pulled from the iterable and collects the results into a new list eagerly, unlike a generator expression, which stays lazy. Squaring 0 through 3 gives [0, 1, 4, 9].',
      tags: ['comprehensions', 'lists'],
    },
  },
  {
    id: 'py-easy-42',
    type: 'mc',
    prompt: 'What does `[x for x in range(10) if x % 3 == 0]` produce?',
    code: '[x for x in range(10) if x % 3 == 0]',
    choices: ['[0, 3, 6, 9]', '[3, 6, 9]', '[0, 1, 2]', '[1, 2, 4, 5, 7, 8]'],
    answerIndex: 0,
    query: {
      title: 'Filtering inside a comprehension',
      syntax: '[expression for item in iterable if condition]',
      explanation:
        'A trailing `if` clause inside a comprehension filters which items get included, evaluated before the expression is applied. 0 is included because `0 % 3 == 0`, giving [0, 3, 6, 9].',
      tags: ['comprehensions', 'lists'],
    },
  },
  {
    id: 'py-easy-43',
    type: 'mc',
    prompt: 'What does `{x: x * x for x in range(3)}` produce?',
    code: '{x: x * x for x in range(3)}',
    choices: ['{0: 0, 1: 1, 2: 4}', '[0, 1, 4]', '{0, 1, 4}', "A SyntaxError, dicts can't be built from comprehensions"],
    answerIndex: 0,
    query: {
      title: 'Dict comprehensions',
      syntax: '{key_expr: value_expr for item in iterable}',
      explanation:
        'A dict comprehension follows the same for/if structure as a list comprehension but produces key-value pairs instead of single values, building a new dict directly. Here each number maps to its own square.',
      tags: ['comprehensions', 'dicts'],
    },
  },
  {
    id: 'py-easy-44',
    type: 'mc',
    prompt: 'What does `{x % 3 for x in range(6)}` produce?',
    code: '{x % 3 for x in range(6)}',
    choices: ['{0, 1, 2}', '[0, 1, 2, 0, 1, 2]', '{0, 1, 2, 0, 1, 2}', '(0, 1, 2)'],
    answerIndex: 0,
    query: {
      title: 'Set comprehensions',
      syntax: '{expression for item in iterable}',
      explanation:
        'Curly braces around a single expression (no colon) build a set comprehension. Since sets discard duplicates automatically, the repeating pattern 0, 1, 2, 0, 1, 2 collapses down to just {0, 1, 2}.',
      tags: ['comprehensions', 'sets'],
    },
  },
  {
    id: 'py-easy-45',
    type: 'mc',
    prompt: "Given `users = [{'name': 'Al'}, {'name': 'Bo'}]`, how do you get `'Bo'`?",
    code: "users = [{'name': 'Al'}, {'name': 'Bo'}]",
    choices: ["users[1]['name']", "users['name'][1]", 'users[1].name', 'users[name][1]'],
    answerIndex: 0,
    query: {
      title: 'Indexing into nested structures',
      explanation:
        "Access happens left to right, one level at a time: `users[1]` first gets the second dict, and `['name']` then looks up that dict's `'name'` key. Dict attribute-style access like `.name` doesn't work on a plain dict, only on objects that explicitly define it.",
      tags: ['dicts', 'lists'],
    },
  },
  {
    id: 'py-easy-46',
    type: 'bool',
    prompt: "The `else` clause on a `for` loop runs after the loop finishes normally, but is skipped if the loop was exited early with `break`.",
    answer: true,
    query: {
      title: 'for/else',
      syntax: 'for item in iterable:\n    if condition:\n        break\nelse:\n    # runs only if break never executed',
      explanation:
        "A `for` (or `while`) loop can carry an `else` clause that executes once the loop's iterable is exhausted, but that clause is skipped entirely if a `break` interrupted the loop first. It's commonly used for a 'search and report not-found' pattern without a separate found-flag variable.",
      tags: ['loops', 'control-flow'],
    },
  },
  {
    id: 'py-easy-47',
    type: 'mc',
    prompt: 'Inside a loop, what does `continue` do that `break` does not?',
    choices: [
      'continue skips to the next iteration; break exits the loop entirely',
      'continue exits the loop entirely; break skips to the next iteration',
      'They are interchangeable',
      'continue only works in while loops',
    ],
    answerIndex: 0,
    query: {
      title: 'break vs continue',
      explanation:
        '`break` immediately terminates the nearest enclosing loop. `continue` skips the rest of the current iteration\u2019s body and jumps straight to the next iteration\u2019s condition check (or next item, for a `for` loop), without leaving the loop.',
      tags: ['loops', 'control-flow'],
    },
  },
  {
    id: 'py-easy-48',
    type: 'mc',
    prompt: 'What does the `pass` statement do?',
    code: 'def todo():\n    pass',
    choices: [
      'Nothing, it is a no-op placeholder required wherever a statement is syntactically needed',
      'Skips to the next loop iteration',
      'Exits the current function immediately',
      'Passes control to a parent class method',
    ],
    answerIndex: 0,
    query: {
      title: 'pass as a syntactic placeholder',
      explanation:
        'Python requires an indented block wherever one is syntactically expected (function bodies, if/else branches, loop bodies), and `pass` is a statement that does literally nothing, letting you write an empty block without a SyntaxError while you stub something out.',
      tags: ['syntax', 'control-flow'],
    },
  },
  {
    id: 'py-easy-49',
    type: 'mc',
    prompt: 'What values do `a` and `b` hold after `a, b = 1, 2`?',
    code: 'a, b = 1, 2',
    choices: ['a = 1, b = 2', 'a = 2, b = 1', 'a = (1, 2), b = (1, 2)', 'A SyntaxError'],
    answerIndex: 0,
    query: {
      title: 'Tuple unpacking assignment',
      syntax: 'a, b = 1, 2   # equivalent to a, b = (1, 2)',
      explanation:
        'The right-hand side `1, 2` implicitly builds a tuple, and the left-hand side unpacks it positionally, assigning each name to the value in the same position. The number of names must match the number of values or Python raises `ValueError`.',
      tags: ['unpacking', 'assignment'],
    },
  },
  {
    id: 'py-easy-50',
    type: 'mc',
    prompt: 'After `a, *b, c = [1, 2, 3, 4, 5]`, what is `b`?',
    code: 'a, *b, c = [1, 2, 3, 4, 5]',
    choices: ['[2, 3, 4]', '[2, 3, 4, 5]', '2', '[1, 2, 3, 4]'],
    answerIndex: 0,
    query: {
      title: 'Starred unpacking',
      syntax: 'a, *middle, z = some_list',
      explanation:
        'A single starred name in an unpacking target absorbs however many elements are left over as a list, after the non-starred names have each claimed exactly one element. `a` takes 1, `c` takes 5, and `b` collects everything in between: [2, 3, 4].',
      tags: ['unpacking', 'assignment'],
    },
  },
  {
    id: 'py-easy-51',
    type: 'mc',
    prompt: 'What is the idiomatic Python way to swap the values of `a` and `b`?',
    choices: ['a, b = b, a', 'swap(a, b)', 'a = b; b = a', 'temp = a; a = b; b = a'],
    answerIndex: 0,
    query: {
      title: 'Swapping via tuple unpacking',
      explanation:
        '`a, b = b, a` builds the tuple `(b, a)` on the right-hand side first, using the original values, then unpacks it into `a` and `b`. Because the right side is fully evaluated before any assignment happens, no temporary variable is needed and neither original value is lost.',
      tags: ['unpacking', 'assignment'],
    },
  },
  {
    id: 'py-easy-52',
    type: 'bool',
    prompt: 'Writing `t = 1, 2, 3` without parentheses still creates a tuple.',
    answer: true,
    query: {
      title: 'Parentheses are optional for tuple literals',
      syntax: 't = 1, 2, 3       # tuple\nt = (1, 2, 3)     # same thing, more explicit',
      explanation:
        'What actually makes a tuple is the comma, not the parentheses. `1, 2, 3` is parsed as a tuple literal; parentheses are just optional visual grouping, though they become necessary in some contexts, like function call arguments, to avoid ambiguity.',
      tags: ['tuples', 'syntax'],
    },
  },
  {
    id: 'py-easy-53',
    type: 'bool',
    prompt: '`(1)` and `(1,)` are both tuples containing the single value 1.',
    answer: false,
    query: {
      title: 'The single-element tuple needs a trailing comma',
      syntax: "type((1))   # <class 'int'>\ntype((1,))  # <class 'tuple'>",
      explanation:
        'Parentheses around a single value are just grouping, exactly like in arithmetic, so `(1)` is simply the int `1`. It is the trailing comma, not the parentheses, that tells Python to build a tuple, which is why a one-element tuple always needs `(1,)`.',
      tags: ['tuples', 'gotchas'],
    },
  },
  {
    id: 'py-easy-54',
    type: 'bool',
    prompt: 'After `a = b = c = []`, `a`, `b`, and `c` are three separate empty lists.',
    answer: false,
    query: {
      title: 'Chained assignment binds one object to multiple names',
      syntax: 'a = b = c = []\na.append(1)\nb  # [1], because a and b are the same object',
      explanation:
        'Chained assignment evaluates the right-hand side exactly once and binds every name in the chain to that same single object, not three independent copies. Mutating through any one of the names is visible through all of them, since they are aliases for one list.',
      tags: ['assignment', 'gotchas'],
    },
  },
  {
    id: 'py-easy-55',
    type: 'mc',
    prompt: 'What type does `d.items()` return for a dict `d`?',
    choices: [
      'A view object of (key, value) tuples that stays in sync with the dict',
      'A plain list of (key, value) tuples, a snapshot at call time',
      'A generator that can only be consumed once',
      'A new dict',
    ],
    answerIndex: 0,
    query: {
      title: 'dict.items() returns a dynamic view',
      syntax: 'd.keys()\nd.values()\nd.items()',
      explanation:
        '`.keys()`, `.values()`, and `.items()` all return dict view objects, which are iterable and reflect later changes to the dict rather than freezing a snapshot at call time. If you need an actual list, you have to wrap it explicitly: `list(d.items())`.',
      tags: ['dicts', 'methods'],
    },
  },
  {
    id: 'py-easy-56',
    type: 'mc',
    prompt: "What does `{'a': 1}.get('b', 0)` evaluate to?",
    code: "{'a': 1}.get('b', 0)",
    choices: ['0', 'None', 'Raises KeyError', "'b'"],
    answerIndex: 0,
    query: {
      title: 'dict.get(key, default)',
      syntax: 'd.get(key, default=None)',
      explanation:
        '`.get` looks up a key and returns its value if present, or the given default (falling back to `None` if no default is supplied) instead of raising `KeyError` the way `d[\'b\']` would. This makes it the idiomatic way to look up a key that might be missing.',
      tags: ['dicts', 'methods'],
    },
  },
  {
    id: 'py-easy-57',
    type: 'mc',
    prompt: "What does `d.setdefault('x', []).append(1)` do if `'x'` is not yet a key in `d`?",
    code: "d = {}\nd.setdefault('x', []).append(1)",
    choices: [
      "Inserts 'x': [] into d, then appends 1 to that new list, leaving d as {'x': [1]}",
      "Raises KeyError because 'x' does not exist",
      "Does nothing since 'x' is not present",
      'Overwrites d entirely with [1]',
    ],
    answerIndex: 0,
    query: {
      title: 'dict.setdefault(key, default)',
      syntax: 'd.setdefault(key, default)  # inserts default if key is missing, then returns the value',
      explanation:
        '`setdefault` checks whether the key exists; if not, it inserts the given default and then, either way, returns the value now stored under that key. Because it returns the actual stored object, chaining `.append(1)` mutates the list that is now living inside the dict.',
      tags: ['dicts', 'methods'],
    },
  },
  {
    id: 'py-easy-58',
    type: 'bool',
    prompt: "For a dict `d`, the expression `'x' in d` checks whether `'x'` is one of the dict's keys, not one of its values.",
    answer: true,
    query: {
      title: '`in` on a dict tests keys',
      syntax: "d = {'a': 1}\n'a' in d          # True, key check\n1 in d.values()   # need .values() to check values",
      explanation:
        'Iterating over a dict (and therefore membership testing with `in`) walks its keys by default. To test whether some value appears anywhere in the dict, you need `value in d.values()` explicitly.',
      tags: ['dicts', 'operators'],
    },
  },
  {
    id: 'py-easy-59',
    type: 'mc',
    prompt: "What does `'lo' in 'hello'` evaluate to?",
    code: "'lo' in 'hello'",
    choices: ['True', 'False', 'Raises TypeError', 'The index 3'],
    answerIndex: 0,
    query: {
      title: '`in` as a substring test on strings',
      explanation:
        "For strings, `in` checks for substring containment rather than exact element membership. `'lo'` appears as a contiguous substring inside `'hello'` (at index 3), so the expression is `True`.",
      tags: ['strings', 'operators'],
    },
  },
  {
    id: 'py-easy-60',
    type: 'mc',
    prompt: 'What is the time complexity of checking `x in some_list` for a plain Python list?',
    choices: ['O(n) in the worst case', 'O(1) always', 'O(log n)', 'O(n^2)'],
    answerIndex: 0,
    query: {
      title: '`in` on a list is a linear scan',
      explanation:
        'A list has no hashing or ordering structure to exploit for membership tests, so checking `x in some_list` walks the list element by element until it finds a match or reaches the end, worst case O(n). Sets and dicts, by contrast, support average-case O(1) membership tests via hashing.',
      tags: ['lists', 'operators'],
    },
  },
  {
    id: 'py-easy-61',
    type: 'mc',
    prompt: 'What does `set([1, 2, 2, 3, 3, 3])` evaluate to?',
    code: 'set([1, 2, 2, 3, 3, 3])',
    choices: ['{1, 2, 3}', '[1, 2, 3]', '{1: 1, 2: 2, 3: 3}', '{1, 2, 2, 3, 3, 3}'],
    answerIndex: 0,
    query: {
      title: 'Sets discard duplicates',
      explanation:
        'A set is an unordered collection of distinct hashable elements; constructing one from an iterable automatically drops repeats, keeping only one copy of each value. This is the standard idiom for deduplicating a list, though it also discards the original order.',
      tags: ['sets'],
    },
  },
  {
    id: 'py-easy-62',
    type: 'mc',
    prompt: 'What does `{1, 2, 3} & {2, 3, 4}` evaluate to?',
    code: '{1, 2, 3} & {2, 3, 4}',
    choices: ['{2, 3}', '{1, 2, 3, 4}', '{1, 4}', '{1, 2, 3}'],
    answerIndex: 0,
    query: {
      title: 'Set operators: & for intersection, | for union',
      syntax: 'a & b   # intersection\na | b   # union\na - b   # difference',
      explanation:
        '`&` computes the intersection: only elements present in both sets. `|` would give the union of all elements from either set. These operators mirror standard set theory and only work between two sets (or a set and a frozenset).',
      tags: ['sets', 'operators'],
    },
  },
  {
    id: 'py-easy-63',
    type: 'bool',
    prompt: "You can use a `list` as a dictionary key, as long as the list's contents don't change.",
    answer: false,
    query: {
      title: 'Dict keys must be hashable',
      syntax: "d = {[1, 2]: 'x'}  # TypeError: unhashable type: 'list'",
      explanation:
        'Dict keys must be hashable, meaning their hash value can\u2019t change over their lifetime, and lists are mutable, so Python disallows them as keys outright, regardless of whether you intend to mutate them. Tuples work fine as keys because they\u2019re immutable, as long as everything inside them is hashable too.',
      tags: ['dicts', 'hashing'],
    },
  },
  {
    id: 'py-easy-64',
    type: 'bool',
    prompt: "As of Python 3.7, iterating over a dict's keys yields them in the order they were inserted.",
    answer: true,
    query: {
      title: 'Dict insertion order is guaranteed (3.7+)',
      explanation:
        'Starting with Python 3.7, dict insertion-order preservation became an official language guarantee (it was a CPython implementation detail in 3.6). This is distinct from sets, which remain genuinely unordered with no ordering guarantee at all.',
      tags: ['dicts', 'ordering'],
    },
  },
  {
    id: 'py-easy-65',
    type: 'mc',
    prompt: "What does `'  hello  '.strip()` evaluate to?",
    code: "'  hello  '.strip()",
    choices: ["'hello'", "' hello '", "'hello  '", "'  hello'"],
    answerIndex: 0,
    query: {
      title: 'str.strip() removes leading/trailing whitespace',
      syntax: 's.strip()        # both ends\ns.lstrip()       # left only\ns.rstrip()       # right only',
      explanation:
        '`.strip()` removes whitespace (or, if given an argument, any of the specified characters) from both ends of the string, leaving interior whitespace untouched. `lstrip`/`rstrip` restrict the trimming to one side only.',
      tags: ['strings', 'methods'],
    },
  },
  {
    id: 'py-easy-66',
    type: 'bool',
    prompt: "`'a  b   c'.split()` with no arguments splits on runs of any whitespace and never produces empty strings between consecutive spaces.",
    answer: true,
    query: {
      title: 'str.split() with no separator',
      syntax: "'a  b   c'.split()  # ['a', 'b', 'c']",
      explanation:
        '.split() with no argument treats any run of whitespace as one delimiter and discards leading/trailing whitespace entirely, so extra spaces never create empty-string elements. This differs from `.split(\' \')`, which splits on every single space character literally and can produce empty strings for consecutive spaces.',
      tags: ['strings', 'methods'],
    },
  },
  {
    id: 'py-easy-67',
    type: 'mc',
    prompt: "What does `'a,b,,c'.split(',')` evaluate to?",
    code: "'a,b,,c'.split(',')",
    choices: ["['a', 'b', '', 'c']", "['a', 'b', 'c']", "['a,b,,c']", "['a', 'b', 'c', '']"],
    answerIndex: 0,
    query: {
      title: 'str.split(sep) with an explicit separator',
      explanation:
        'When you pass an explicit separator, `.split` treats every occurrence as a boundary literally, so two adjacent commas produce an empty string between them. This differs from the no-argument form, which collapses consecutive whitespace instead of preserving gaps.',
      tags: ['strings', 'methods'],
    },
  },
  {
    id: 'py-easy-68',
    type: 'mc',
    prompt: "What does `'banana'.replace('a', 'o', 2)` evaluate to?",
    code: "'banana'.replace('a', 'o', 2)",
    choices: ["'bonona'", "'bonono'", "'bonana'", "'banana'"],
    answerIndex: 0,
    query: {
      title: 'str.replace(old, new, count)',
      syntax: 's.replace(old, new, count=-1)   # count limits how many replacements happen, left to right',
      explanation:
        "The optional third argument caps how many occurrences get replaced, scanning left to right; without it every occurrence is replaced. Here only the first two of banana's three 'a's are swapped for 'o', leaving the third untouched.",
      tags: ['strings', 'methods'],
    },
  },
  {
    id: 'py-easy-69',
    type: 'mc',
    prompt: "What does `'Hello World'.lower()` evaluate to?",
    code: "'Hello World'.lower()",
    choices: ["'hello world'", "'HELLO WORLD'", "'Hello world'", "'hello World'"],
    answerIndex: 0,
    query: {
      title: 'str.upper() / str.lower()',
      explanation:
        '`.lower()` returns a new string with every cased character converted to lowercase, leaving non-alphabetic characters (like the space) unchanged; `.upper()` does the mirror-image conversion. Neither mutates the original string, since strings are immutable.',
      tags: ['strings', 'methods'],
    },
  },
  {
    id: 'py-easy-70',
    type: 'mc',
    prompt: 'Which method checks whether a string begins with a given prefix?',
    choices: ["'text'.startswith(prefix)", "'text'.find(prefix) == True", "'text'.index(prefix) == 0 is the only way", "prefix in 'text'[0]"],
    answerIndex: 0,
    query: {
      title: 'str.startswith() / str.endswith()',
      syntax: 's.startswith(prefix)\ns.endswith(suffix)',
      explanation:
        '`.startswith()` and `.endswith()` take a prefix or suffix string (or a tuple of them, to check several at once) and return a plain bool, without needing to compute or compare indices manually the way `.find()` or `.index()` would require.',
      tags: ['strings', 'methods'],
    },
  },
  {
    id: 'py-easy-71',
    type: 'mc',
    prompt: "What does `'abc123'.isalpha()` evaluate to?",
    code: "'abc123'.isalpha()",
    choices: ['False', 'True', 'Raises TypeError', "The string 'abc'"],
    answerIndex: 0,
    query: {
      title: 'str.isalpha() requires every character to be alphabetic',
      syntax: 's.isalpha()\ns.isdigit()\ns.isalnum()',
      explanation:
        '`.isalpha()` returns `True` only if the string is non-empty and every single character is alphabetic. Because `\'abc123\'` contains digits, the check fails for the whole string, `False`, even though part of it is purely alphabetic. `.isalnum()` would accept a mix of letters and digits.',
      tags: ['strings', 'methods'],
    },
  },
  {
    id: 'py-easy-72',
    type: 'mc',
    prompt: "Given `name = 'Ada'`, what does `f'Hello, {name}!'` evaluate to?",
    code: "name = 'Ada'\nf'Hello, {name}!'",
    choices: ["'Hello, Ada!'", "'Hello, {name}!'", "'Hello, name!'", 'A SyntaxError'],
    answerIndex: 0,
    query: {
      title: 'f-strings interpolate expressions directly',
      syntax: "f'{expression}'",
      explanation:
        'Prefixing a string literal with `f` marks it as an f-string, in which anything inside `{...}` is evaluated as a live Python expression and substituted into the string, converted to its string form automatically. This replaces the older, more verbose `%`-formatting and `.format()` call for most everyday use.',
      tags: ['strings', 'f-strings'],
    },
  },
  {
    id: 'py-easy-73',
    type: 'mc',
    prompt: "What does `f'{2 + 3}'` evaluate to?",
    code: "f'{2 + 3}'",
    choices: ["'5'", "'2 + 3'", '5', 'A SyntaxError, only variable names are allowed inside {}'],
    answerIndex: 0,
    query: {
      title: 'f-strings can hold arbitrary expressions',
      explanation:
        "The braces in an f-string aren't limited to simple variable names, they accept any valid Python expression, which is evaluated at string-creation time and converted to text. `2 + 3` evaluates to `5` first, then that result is inserted as the string `'5'`.",
      tags: ['strings', 'f-strings'],
    },
  },
  {
    id: 'py-easy-74',
    type: 'mc',
    prompt: 'For an object like a `datetime`, what is the main difference between `str(obj)` and `repr(obj)`?',
    choices: [
      'str() aims for a readable display; repr() aims for an unambiguous, often code-like representation',
      'They always return identical strings',
      'repr() is only usable in the interactive shell, never in scripts',
      'str() raises an error for objects without a custom __str__',
    ],
    answerIndex: 0,
    query: {
      title: 'str() vs repr()',
      syntax: 'str(obj)   # calls obj.__str__, falls back to __repr__\nrepr(obj)  # calls obj.__repr__',
      explanation:
        '`str()` is meant for a human-readable, informal display, while `repr()` aims to be unambiguous, ideally something that could be pasted back into Python to recreate an equivalent object. If a class defines only `__repr__`, `str()` falls back to using it too.',
      tags: ['strings', 'builtins'],
    },
  },
  {
    id: 'py-easy-75',
    type: 'mc',
    prompt: "What does `print('a\\tb')` output?",
    code: "print('a\\tb')",
    choices: ['a followed by a tab then b', 'a\\tb literally', 'ab', 'A SyntaxError'],
    answerIndex: 0,
    query: {
      title: 'Escape sequences in string literals',
      syntax: '\\n   newline\n\\t   tab\n\\\\  literal backslash',
      explanation:
        'Inside an ordinary (non-raw) string literal, a backslash introduces an escape sequence: `\\t` is interpreted as a single tab character, not the two characters backslash-t. `print` then writes that tab character to the output.',
      tags: ['strings', 'syntax'],
    },
  },
  {
    id: 'py-easy-76',
    type: 'mc',
    prompt: "What is the purpose of the `r` prefix on a string literal, as in `r'C:\\new\\folder'`?",
    choices: [
      'It disables escape sequence processing, so backslashes are kept literally',
      'It marks the string as read-only',
      'It converts the string to bytes',
      'It forces the string to lowercase',
    ],
    answerIndex: 0,
    query: {
      title: 'Raw string literals',
      syntax: "r'\\n'   # two characters: backslash, n\n'\\n'    # one character: newline",
      explanation:
        "A raw string tells Python not to interpret backslash escape sequences at all, so `r'\\n'` is literally a backslash followed by 'n', not a newline. This is especially useful for Windows file paths and regular expression patterns, both of which use backslashes heavily.",
      tags: ['strings', 'syntax'],
    },
  },
  {
    id: 'py-easy-77',
    type: 'bool',
    prompt: "Triple-quoted strings (`'''...'''` or `\"\"\"...\"\"\"`) are the only way to write a string literal that spans multiple lines.",
    answer: false,
    query: {
      title: 'Triple quotes are one way to span lines, not the only way',
      syntax: "'''line one\nline two'''\n\n'line one\\nline two'   # also spans two logical lines",
      explanation:
        'Triple-quoted strings can contain literal newlines directly, which is convenient for docstrings and blocks of text, but an ordinary quoted string can represent multiple lines too, either via an escaped `\\n` or by ending each line with a backslash continuation. Triple quotes are a convenience, not the only mechanism.',
      tags: ['strings', 'syntax'],
    },
  },
  {
    id: 'py-easy-78',
    type: 'bool',
    prompt: "Writing two adjacent string literals with nothing but whitespace between them, like `'ab' 'cd'`, automatically concatenates them into `'abcd'`.",
    answer: true,
    query: {
      title: 'Implicit string literal concatenation',
      syntax: "'ab' 'cd'      # 'abcd'\n('a'\n 'b')       # 'ab', useful for splitting a long literal across lines",
      explanation:
        'Python automatically joins adjacent string literals at compile time when nothing but whitespace (or a line continuation inside parentheses) separates them. This is a compile-time source-level trick, not runtime concatenation with `+`, and is often used to break a long literal across multiple lines.',
      tags: ['strings', 'syntax'],
    },
  },
  {
    id: 'py-easy-79',
    type: 'bool',
    prompt: "`int('42.5')` successfully returns `42` by dropping the fractional part.",
    answer: false,
    query: {
      title: "int() on a numeric-looking string doesn't parse floats",
      syntax: "int('42')     # 42, fine\nint('42.5')   # ValueError\nint(float('42.5'))  # 42, works via an intermediate float",
      explanation:
        "int() parses a string of digits directly and has no idea how to handle a decimal point in that string form, so it raises `ValueError: invalid literal for int() with base 10: '42.5'`. To get 42 you'd have to convert through `float()` first: `int(float('42.5'))`.",
      tags: ['type-conversion', 'gotchas'],
    },
  },
  {
    id: 'py-easy-80',
    type: 'mc',
    prompt: "What does `float('  3.14  ')` evaluate to?",
    code: "float('  3.14  ')",
    choices: ['3.14', 'A ValueError, since whitespace is not allowed', "'3.14'", '3'],
    answerIndex: 0,
    query: {
      title: 'float() tolerates surrounding whitespace',
      explanation:
        'float() (and int()) strip leading and trailing whitespace from the string before parsing the numeric content, so extra spaces around a valid number don\u2019t cause an error. Whitespace in the middle of the digits would still fail.',
      tags: ['type-conversion'],
    },
  },
  {
    id: 'py-easy-81',
    type: 'bool',
    prompt: "The string `'0'` is truthy, even though the integer `0` is falsy.",
    answer: true,
    query: {
      title: 'A non-empty string is truthy regardless of its content',
      syntax: "bool('0')   # True, non-empty string\nbool(0)     # False, the integer zero",
      explanation:
        'Truthiness for a string depends only on whether it\u2019s empty, not on what characters it contains. `\'0\'` has length 1, so it\u2019s truthy, which is a common source of bugs when code checks `if some_string:` expecting it to mirror numeric zero\u2019s falsiness.',
      tags: ['truthiness', 'strings'],
    },
  },
  {
    id: 'py-easy-82',
    type: 'mc',
    prompt: 'Which of these evaluates to `False`?',
    choices: ['bool(0.0)', "bool('False')", 'bool([0])', "bool(' ')"],
    answerIndex: 0,
    query: {
      title: 'Falsy values beyond just 0 and empty containers',
      syntax: "Falsy: 0, 0.0, '', [], {}, (), set(), None, False",
      explanation:
        '`0.0` is numerically zero and is falsy, same as the int `0`. Every other option here is truthy: `\'False\'` and `\' \'` are non-empty strings, and `[0]` is a non-empty list even though its only element is falsy.',
      tags: ['truthiness', 'booleans'],
    },
  },
  {
    id: 'py-easy-83',
    type: 'mc',
    prompt: 'What happens when the code inside a `try` block raises an exception that matches the `except` clause?',
    code: 'try:\n    risky()\nexcept ValueError:\n    handle()',
    choices: [
      'Execution jumps to the except block, and the program continues after the try/except',
      'The program terminates immediately regardless of the except clause',
      'The try block re-runs automatically',
      'The except clause is ignored unless finally is also present',
    ],
    answerIndex: 0,
    query: {
      title: 'Basic try/except control flow',
      syntax: 'try:\n    ...\nexcept SomeError:\n    ...',
      explanation:
        'As soon as an exception matching the except clause\u2019s type is raised inside the try block, execution immediately jumps into that except block, skipping any remaining code in the try block. After the except block finishes, execution resumes normally after the whole try/except statement.',
      tags: ['exceptions', 'control-flow'],
    },
  },
  {
    id: 'py-easy-84',
    type: 'mc',
    prompt: 'How do you catch both `ValueError` and `TypeError` with one `except` clause?',
    choices: [
      'except (ValueError, TypeError):',
      'except ValueError, TypeError:',
      'except [ValueError, TypeError]:',
      'except ValueError or TypeError:',
    ],
    answerIndex: 0,
    query: {
      title: 'Catching multiple exception types',
      syntax: 'except (ValueError, TypeError) as e:\n    ...',
      explanation:
        'A tuple of exception classes after `except` matches if the raised exception is an instance of any type in that tuple. The comma-separated form without parentheses was Python 2 syntax with different semantics and is a SyntaxError in Python 3.',
      tags: ['exceptions'],
    },
  },
  {
    id: 'py-easy-85',
    type: 'mc',
    prompt: 'In a `try`/`except`/`else`/`finally` statement, when does the `else` block run?',
    choices: [
      'Only if the try block completed with no exception raised',
      'Only if an exception was raised and caught',
      'Always, regardless of whether an exception occurred',
      'Only if there is no except clause at all',
    ],
    answerIndex: 0,
    query: {
      title: 'The try/else clause',
      syntax: 'try:\n    ...\nexcept SomeError:\n    ...\nelse:\n    # runs only if try raised nothing\nfinally:\n    # always runs',
      explanation:
        'The else clause on a try statement runs only when the try block finishes without raising any exception, which lets you separate "code that might fail" from "code that should only run on success" without putting the latter inside the try block itself. finally, by contrast, runs unconditionally, exception or not.',
      tags: ['exceptions', 'control-flow'],
    },
  },
  {
    id: 'py-easy-86',
    type: 'mc',
    prompt: 'What exception does `1 / 0` raise?',
    code: '1 / 0',
    choices: ['ZeroDivisionError', 'ValueError', 'ArithmeticError (never a subclass)', 'It returns float("inf") instead of raising'],
    answerIndex: 0,
    query: {
      title: 'ZeroDivisionError',
      explanation:
        'Unlike floating-point division in some languages, which produces `inf` or `nan` for a zero denominator, Python raises `ZeroDivisionError` for both `/` and `//` (and `%`) when the divisor is zero, whether the operands are ints or floats.',
      tags: ['exceptions', 'numbers'],
    },
  },
  {
    id: 'py-easy-87',
    type: 'mc',
    prompt: 'What is the difference between `IndexError` and `KeyError`?',
    choices: [
      'IndexError is raised for an out-of-range sequence index; KeyError is raised for a missing dict key',
      'They are the same exception under different names',
      'KeyError applies to lists; IndexError applies to dicts',
      'IndexError is only raised for negative indices',
    ],
    answerIndex: 0,
    query: {
      title: 'IndexError vs KeyError',
      syntax: "[1, 2][5]      # IndexError\n{'a': 1}['b']  # KeyError",
      explanation:
        'IndexError fires when you index a sequence (list, tuple, string) with a position outside its valid range. KeyError fires when you look up a dict (or similar mapping) with a key that isn\u2019t present. They\u2019re raised by different container types and are not interchangeable.',
      tags: ['exceptions', 'lists', 'dicts'],
    },
  },
  {
    id: 'py-easy-88',
    type: 'mc',
    prompt: "Which exception does `int('abc')` raise, and why is it that one rather than `TypeError`?",
    code: "int('abc')",
    choices: [
      'ValueError, because the argument is the right type (a string) but has an inappropriate value/content',
      'TypeError, because strings can never be converted to int',
      "KeyError, because 'abc' is not a valid key",
      'It raises nothing and returns 0',
    ],
    answerIndex: 0,
    query: {
      title: 'ValueError vs TypeError',
      explanation:
        'TypeError signals that an operation received an object of the wrong type entirely (say, passing a list where int() expects a string or number). ValueError signals the type was acceptable but the actual value doesn\u2019t make sense for the operation; a string is a valid argument type for int(), but "abc" isn\u2019t valid digit content.',
      tags: ['exceptions', 'type-conversion'],
    },
  },
  {
    id: 'py-easy-89',
    type: 'mc',
    prompt: "What does the statement `raise ValueError('bad input')` do?",
    code: "raise ValueError('bad input')",
    choices: [
      'Immediately raises a ValueError with that message, interrupting normal flow unless caught',
      'Logs a warning and continues execution',
      'Defines a new exception type named ValueError',
      'Only works inside an except block',
    ],
    answerIndex: 0,
    query: {
      title: 'Raising exceptions explicitly',
      syntax: "raise ExceptionType('message')",
      explanation:
        'raise explicitly triggers an exception right where it\u2019s called, immediately interrupting the normal control flow and propagating up the call stack until something catches it (or the program crashes with a traceback if nothing does). It works anywhere, not just inside an except block, though bare `raise` with no arguments only works inside one, to re-raise the current exception.',
      tags: ['exceptions'],
    },
  },
  {
    id: 'py-easy-90',
    type: 'mc',
    prompt: "What is the purpose of guarding code with `if __name__ == '__main__':` at the bottom of a script?",
    code: "if __name__ == '__main__':\n    main()",
    choices: [
      "The guarded code only runs when the file is executed directly, not when it's imported as a module",
      'It marks the entry point for the Python interpreter itself, required in every file',
      'It disables the garbage collector for that block',
      "It's required syntax for defining a main function",
    ],
    answerIndex: 0,
    query: {
      title: "The __name__ == '__main__' idiom",
      syntax: "__name__  # '__main__' when run directly, the module's own name when imported",
      explanation:
        "Python sets a module's `__name__` variable to `'__main__'` only when that file is the one being run directly, and to the module's actual name when it's imported elsewhere. Guarding script-only behavior this way lets a file be both a reusable importable module and a runnable script without the import triggering side effects.",
      tags: ['modules', 'idioms'],
    },
  },
  {
    id: 'py-easy-91',
    type: 'mc',
    prompt: 'What is the difference between `import math` and `from math import sqrt`?',
    choices: [
      "import math binds the name 'math' and requires math.sqrt(); from math import sqrt binds 'sqrt' directly into the current namespace",
      'They are functionally identical in every way',
      'from math import sqrt imports the entire module renamed as sqrt',
      'import math only works for standard library modules',
    ],
    answerIndex: 0,
    query: {
      title: 'import forms',
      syntax: 'import math\nmath.sqrt(4)\n\nfrom math import sqrt\nsqrt(4)',
      explanation:
        '`import math` binds the name `math` in the current namespace, so every attribute access needs the `math.` prefix. `from math import sqrt` instead binds just `sqrt` directly, letting you call it unqualified, but it also means it\u2019s less obvious at the call site which module a name came from.',
      tags: ['modules', 'imports'],
    },
  },
  {
    id: 'py-easy-92',
    type: 'mc',
    prompt: "Without the `global` keyword, what happens when a function assigns to a variable that also exists at module level?",
    code: 'count = 0\ndef increment():\n    count = count + 1  # UnboundLocalError\nincrement()',
    choices: [
      'Python treats the name as local to the function, and referencing it before that local assignment raises UnboundLocalError',
      'It transparently modifies the module-level variable',
      'It raises NameError immediately at function definition time',
      'It silently creates a second module-level variable',
    ],
    answerIndex: 0,
    query: {
      title: 'Assignment makes a name local by default',
      syntax: 'def increment():\n    global count\n    count += 1',
      explanation:
        'Python decides at compile time whether a name inside a function is local, based on whether the function assigns to it anywhere in its body. Assigning to `count` makes it local to `increment`, so the read on the right-hand side of `count + 1` refers to that not-yet-assigned local, raising `UnboundLocalError`. The `global` keyword tells Python to use the module-level variable instead.',
      tags: ['scope', 'functions'],
    },
  },
  {
    id: 'py-easy-93',
    type: 'bool',
    prompt: "A function can read a global variable's value freely without any special keyword, as long as it never assigns to a variable of the same name anywhere in its body.",
    answer: true,
    query: {
      title: 'Reading a global is unrestricted; assigning is what requires `global`',
      syntax: 'count = 0\ndef show():\n    print(count)  # fine, no assignment happens\nshow()',
      explanation:
        'Python only requires the `global` keyword when a function needs to assign to a module-level name from inside the function. Merely reading a global variable\u2019s current value works with no special syntax at all, since there\u2019s no local name to shadow it.',
      tags: ['scope', 'functions'],
    },
  },
  {
    id: 'py-easy-94',
    type: 'mc',
    prompt: 'Given `def f(a, b=1, c=2): return a, b, c`, what does `f(5, c=9)` return?',
    code: 'def f(a, b=1, c=2):\n    return a, b, c\nf(5, c=9)',
    choices: ['(5, 1, 9)', '(5, 9, 2)', 'A TypeError, c cannot be set without b', '(5, 1, 2)'],
    answerIndex: 0,
    query: {
      title: 'Keyword arguments can target any parameter',
      syntax: 'def f(a, b=1, c=2): ...\nf(5, c=9)   # a=5, b keeps its default 1, c=9',
      explanation:
        'Keyword arguments are matched by name rather than position, so `c=9` sets `c` directly regardless of where it falls in the parameter list, leaving `b` to fall back to its own default value of 1 since it was never supplied. This is what makes default parameters genuinely independent of each other.',
      tags: ['functions', 'arguments'],
    },
  },
  {
    id: 'py-easy-95',
    type: 'mc',
    prompt: "Given `def greet(name, greeting): ...`, which call is equivalent to `greet('Al', 'Hi')`?",
    choices: ["greet(greeting='Hi', name='Al')", "greet('Hi', 'Al')", "greet(name='Hi', greeting='Al')", 'greet(Hi, Al)'],
    answerIndex: 0,
    query: {
      title: 'Keyword arguments can be reordered freely',
      syntax: "greet(greeting='Hi', name='Al')  # order of keyword args doesn't matter",
      explanation:
        "Once arguments are passed by keyword, their order in the call no longer needs to match the parameter order in the function's definition, since each one is matched by name. Swapping positions without keywords, as in the second option, would incorrectly bind 'Hi' to name and 'Al' to greeting.",
      tags: ['functions', 'arguments'],
    },
  },
  {
    id: 'py-easy-96',
    type: 'bool',
    prompt: 'A function with no explicit `return` statement, or a bare `return` with no value, returns `None`.',
    answer: true,
    query: {
      title: 'Functions return None by default',
      syntax: 'def f():\n    pass\nf() is None  # True',
      explanation:
        'Every Python function returns something; if execution reaches the end of the function body without hitting a `return` statement, or hits a bare `return`, the function\u2019s result is `None`. There\u2019s no concept of a function with "no return value" the way some languages have a void type.',
      tags: ['functions', 'none'],
    },
  },
  {
    id: 'py-easy-97',
    type: 'mc',
    prompt: 'Given `def minmax(nums): return min(nums), max(nums)`, how would you capture both results?',
    code: 'def minmax(nums):\n    return min(nums), max(nums)\nlo, hi = minmax([3, 1, 4, 1, 5])',
    choices: [
      'lo, hi = minmax(nums), unpacking the returned tuple',
      'You cannot return two values from a Python function',
      'result[0], result[1] is the only valid syntax',
      'minmax returns a list, which cannot be unpacked',
    ],
    answerIndex: 0,
    query: {
      title: "'Multiple return values' are really one tuple",
      explanation:
        'return a, b builds and returns a single two-element tuple, not two separate values, Python functions only ever return one object. The caller then unpacks that tuple into separate names using ordinary tuple-unpacking assignment, which is why it looks like multiple return values.',
      tags: ['functions', 'tuples'],
    },
  },
  {
    id: 'py-easy-98',
    type: 'bool',
    prompt: 'Given `list1 = [1, 2, 3]` and `list2 = list1`, calling `list2.append(4)` also changes what `list1` shows.',
    answer: true,
    query: {
      title: 'Assignment aliases, it does not copy',
      syntax: 'list1 = [1, 2, 3]\nlist2 = list1        # same object, two names\nlist2.append(4)\nlist1                # [1, 2, 3, 4]',
      explanation:
        '`list2 = list1` doesn\u2019t duplicate the list, it just makes `list2` a second name pointing at the exact same list object as `list1`. Mutating through either name is visible through both. Getting an independent copy requires `list1.copy()`, `list(list1)`, or `list1[:]`.',
      tags: ['lists', 'gotchas'],
    },
  },
  {
    id: 'py-easy-99',
    type: 'bool',
    prompt: '`lst[:]` creates a new list containing the same elements, rather than returning a reference to the original list.',
    answer: true,
    query: {
      title: 'Full-slice copying',
      syntax: 'copy = lst[:]\ncopy is lst   # False, a distinct new list object',
      explanation:
        'Any slice, including the full slice `[:]`, always constructs a brand-new list object, even when the bounds cover the entire sequence. This makes `lst[:]` (along with `.copy()` and `list(lst)`) one of the standard idioms for a shallow copy, distinct from plain assignment, which shares the same object.',
      tags: ['lists', 'slicing'],
    },
  },
  {
    id: 'py-easy-100',
    type: 'bool',
    prompt: "`round(2.5)` always rounds up to `3`, the same 'round half up' rule taught in school.",
    answer: false,
    query: {
      title: 'round() uses round-half-to-even, not round-half-up',
      syntax: 'round(2.5)  # 2\nround(3.5)  # 4',
      explanation:
        "Python's built-in round() uses banker's rounding (round-half-to-even) for values exactly halfway between two integers, rounding to whichever neighbor is even. round(2.5) gives 2, not 3, and round(3.5) gives 4. Floating-point representation can also make 'exactly halfway' less exact than it looks, adding another layer of surprise.",
      tags: ['numbers', 'builtins'],
    },
  },
];
