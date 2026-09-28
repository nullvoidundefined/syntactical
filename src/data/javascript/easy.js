// JavaScript / Easy question bank.
// Foundational but still JavaScript-specific: coercion, scope, and
// standard-library behavior particular to the language, not generic
// programming trivia.

export const javascriptEasy = [
  {
    id: 'js-easy-01',
    type: 'mc',
    prompt: 'What does `typeof null` evaluate to?',
    code: 'typeof null',
    choices: ['"null"', '"object"', '"undefined"', 'Throws a TypeError'],
    answerIndex: 1,
    query: {
      title: 'typeof null is object',
      syntax: 'typeof null  // "object"',
      explanation:
        '`typeof null` returns the string "object". This is a long-standing bug in the original `typeof` table, not evidence that `null` is an object you can read properties from. `null === null` is the test that actually recognizes null, and reading a property off null throws.',
      tags: ['typeof', 'null'],
    },
  },
  {
    id: 'js-easy-02',
    type: 'mc',
    prompt: 'What does `typeof undefined` evaluate to?',
    code: 'typeof undefined',
    choices: ['"undefined"', '"object"', '"null"', 'Throws a ReferenceError'],
    answerIndex: 0,
    query: {
      title: 'typeof undefined is undefined',
      syntax: 'typeof undefined  // "undefined"',
      explanation:
        '`typeof` returns a string naming the operand\'s type, and the undefined value is reported as the string "undefined". It does not return the undefined value itself, and it does not throw. `null` is the nearby value that does not get its own typeof tag.',
      tags: ['typeof', 'undefined'],
    },
  },
  {
    id: 'js-easy-03',
    type: 'mc',
    prompt: 'What does `typeof` report for a function?',
    code: 'typeof function () {}',
    choices: ['"object"', '"undefined"', '"function"', '"callable"'],
    answerIndex: 2,
    query: {
      title: 'typeof function is function',
      syntax: 'typeof function () {}  // "function"',
      explanation:
        'Functions are objects, but `typeof` has a dedicated result, the string "function", for any callable. "object" is what `typeof` says for ordinary objects and arrays, so it is the wrong tag here. There is no "callable" result.',
      tags: ['typeof', 'functions'],
    },
  },
  {
    id: 'js-easy-04',
    type: 'mc',
    prompt: 'What does `typeof []` evaluate to?',
    code: 'typeof []',
    choices: ['"array"', '"object"', '"undefined"', '"list"'],
    answerIndex: 1,
    query: {
      title: 'typeof an array is object',
      syntax: 'typeof []  // "object"',
      explanation:
        'Arrays are objects, and `typeof` has no separate "array" result, so `typeof []` is "object". `Array.isArray` is the check that distinguishes an array from a plain object. "list" is not a JavaScript typeof tag.',
      tags: ['typeof', 'arrays'],
    },
  },
  {
    id: 'js-easy-05',
    type: 'mc',
    prompt: 'What does `typeof NaN` evaluate to?',
    code: 'typeof NaN',
    choices: ['"number"', '"nan"', '"undefined"', '"object"'],
    answerIndex: 0,
    query: {
      title: 'typeof NaN is number',
      syntax: 'typeof NaN  // "number"',
      explanation:
        '`NaN` is a numeric value, the IEEE-754 not-a-number bit pattern, so `typeof NaN` is "number". It is not its own type and it is not undefined. `Number.isNaN` is how you test for it, because a typeof check cannot.',
      tags: ['typeof', 'nan'],
    },
  },
  {
    id: 'js-easy-06',
    type: 'mc',
    prompt: 'What does `typeof` do with an identifier that was never declared?',
    code: 'typeof notDeclared',
    choices: ['Throws a ReferenceError', '"object"', '"null"', '"undefined"'],
    answerIndex: 3,
    query: {
      title: 'typeof an undeclared identifier',
      syntax: 'typeof notDeclared  // "undefined"',
      explanation:
        '`typeof` has a special case for an unresolvable reference: it returns the string "undefined" and does not throw. Reading that same identifier without `typeof` throws a ReferenceError. A `let` or `const` that exists but is still in the temporal dead zone is different: `typeof` on that binding still throws.',
      tags: ['typeof', 'scope'],
    },
  },
  {
    id: 'js-easy-07',
    type: 'mc',
    prompt: 'What does `1 == "1"` evaluate to?',
    code: '1 == "1"',
    choices: ['true', 'false', 'Throws a TypeError', '"1"'],
    answerIndex: 0,
    query: {
      title: 'Loose equality coerces the string',
      syntax: '1 == "1"  // true',
      explanation:
        'The `==` operator converts operands of different types before comparing. A numeric comparison converts the string "1" with `ToNumber`, and `1 == 1` is true. This is not a type match: `===` on the same operands is false.',
      tags: ['equality', 'coercion'],
    },
  },
  {
    id: 'js-easy-08',
    type: 'mc',
    prompt: 'What does `1 === "1"` evaluate to?',
    code: '1 === "1"',
    choices: ['true', 'false', 'Throws a TypeError', '"1"'],
    answerIndex: 1,
    query: {
      title: 'Strict equality does not coerce',
      syntax: '1 === "1"  // false',
      explanation:
        '`===` returns false when the types differ, and it does not convert the string to a number first. A number and a string are different types even when they look like the same digit. `==` is the operator that would coerce and return true here.',
      tags: ['equality', 'coercion'],
    },
  },
  {
    id: 'js-easy-09',
    type: 'mc',
    prompt: 'What does `null == undefined` evaluate to?',
    code: 'null == undefined',
    choices: ['false', 'Throws a TypeError', 'true', 'undefined'],
    answerIndex: 2,
    query: {
      title: 'null loosely equals undefined',
      syntax: 'null == undefined  // true',
      explanation:
        'Abstract equality defines `null == undefined` as true, and it does not convert either value to 0 or to a string first. No other value loosely equals null: `null == 0` and `null == false` are both false. `===` still treats null and undefined as different.',
      tags: ['equality', 'null'],
    },
  },
  {
    id: 'js-easy-10',
    type: 'mc',
    prompt: 'What does `null === undefined` evaluate to?',
    code: 'null === undefined',
    choices: ['false', 'true', 'undefined', 'Throws a TypeError'],
    answerIndex: 0,
    query: {
      title: 'null is not strictly undefined',
      syntax: 'null === undefined  // false',
      explanation:
        '`===` requires the same type and the same value. `null` and `undefined` are different types, so the comparison is false and nothing is thrown. The loose operator `==` is the one that treats this pair as equal.',
      tags: ['equality', 'null'],
    },
  },
  {
    id: 'js-easy-11',
    type: 'mc',
    prompt: 'What does `true == 1` evaluate to?',
    code: 'true == 1',
    choices: ['false', '1', '"true"', 'true'],
    answerIndex: 3,
    query: {
      title: 'true loosely equals 1',
      syntax: 'true == 1  // true',
      explanation:
        'When `==` compares a boolean to a number, it converts the boolean with `ToNumber`. `ToNumber(true)` is 1, so the comparison becomes `1 == 1`. `true === 1` stays false because the types still differ.',
      tags: ['equality', 'coercion'],
    },
  },
  {
    id: 'js-easy-12',
    type: 'mc',
    prompt: 'What does `false == 0` evaluate to?',
    code: 'false == 0',
    choices: ['false', 'true', '0', '""'],
    answerIndex: 1,
    query: {
      title: 'false loosely equals 0',
      syntax: 'false == 0  // true',
      explanation:
        '`==` converts the boolean before comparing it with a number. `ToNumber(false)` is 0, so `false == 0` is true. Strict equality does not do that conversion: `false === 0` is false.',
      tags: ['equality', 'coercion'],
    },
  },
  {
    id: 'js-easy-13',
    type: 'mc',
    prompt: 'What does `false == ""` evaluate to?',
    code: 'false == ""',
    choices: ['true', 'false', '""', 'Throws a TypeError'],
    answerIndex: 0,
    query: {
      title: 'false loosely equals an empty string',
      syntax: 'false == ""  // true',
      explanation:
        'Both sides of `==` are converted to numbers when a boolean meets a string. `ToNumber("")` is 0 and `ToNumber(false)` is 0, so the comparison is true. `false === ""` is false, and `Boolean("")` being false is a different rule from this equality.',
      tags: ['equality', 'coercion'],
    },
  },
  {
    id: 'js-easy-14',
    type: 'mc',
    prompt: 'What does `[] == false` evaluate to?',
    code: '[] == false',
    choices: ['false', 'undefined', 'true', 'Throws a TypeError'],
    answerIndex: 2,
    query: {
      title: 'An empty array loosely equals false',
      syntax: '[] == false  // true',
      explanation:
        'Abstract equality converts `[]` with `ToPrimitive` to the empty string, then to the number 0, and it converts `false` to 0 as well. The comparison is therefore true. The array is still truthy in a boolean context: `Boolean([])` is true, and `[] === false` is false.',
      tags: ['equality', 'arrays'],
    },
  },
  {
    id: 'js-easy-15',
    type: 'mc',
    prompt: 'What does `NaN === NaN` evaluate to?',
    code: 'NaN === NaN',
    choices: ['true', 'false', 'undefined', 'Throws a TypeError'],
    answerIndex: 1,
    query: {
      title: 'NaN is not strictly equal to itself',
      syntax: 'NaN === NaN  // false',
      explanation:
        'IEEE-754 says NaN compares unequal to every value, including itself, and both `===` and `==` follow that rule. A self-check with `===` can never detect NaN. `Object.is(NaN, NaN)` and `Number.isNaN` are the tests that return true.',
      tags: ['nan', 'equality'],
    },
  },
  {
    id: 'js-easy-16',
    type: 'mc',
    prompt: 'What do `Number.isNaN("foo")` and `isNaN("foo")` return?',
    code: 'Number.isNaN("foo")\nisNaN("foo")',
    choices: [
      'Both return false',
      'Both return true',
      'Number.isNaN returns true and isNaN returns false',
      'Number.isNaN returns false and isNaN returns true',
    ],
    answerIndex: 3,
    query: {
      title: 'Number.isNaN does not coerce',
      syntax: 'Number.isNaN("foo")  // false\nisNaN("foo")         // true',
      explanation:
        '`Number.isNaN` returns true only when the argument is already the number NaN, so the string "foo" is false. The global `isNaN` converts its argument with `ToNumber` first, `ToNumber("foo")` is NaN, and that coerced result makes `isNaN("foo")` true. They are not aliases.',
      tags: ['nan', 'coercion'],
    },
  },
  {
    id: 'js-easy-17',
    type: 'mc',
    prompt: 'What does `Object.is(NaN, NaN)` evaluate to?',
    code: 'Object.is(NaN, NaN)',
    choices: ['true', 'false', 'undefined', 'Throws a TypeError'],
    answerIndex: 0,
    query: {
      title: 'Object.is treats NaN as the same value',
      syntax: 'Object.is(NaN, NaN)  // true',
      explanation:
        '`Object.is` uses the SameValue comparison, which treats NaN as the same value as NaN. That is the deliberate difference from `===`, which is false for this pair. `Object.is` is not a general deep-equal for objects.',
      tags: ['nan', 'equality'],
    },
  },
  {
    id: 'js-easy-18',
    type: 'mc',
    prompt: 'How do `Object.is(+0, -0)` and `+0 === -0` compare?',
    code: 'Object.is(+0, -0)\n+0 === -0',
    choices: [
      'Both are true',
      'Both are false',
      'Object.is is false and === is true',
      'Object.is is true and === is false',
    ],
    answerIndex: 2,
    query: {
      title: 'Object.is distinguishes signed zero',
      syntax: 'Object.is(+0, -0)  // false\n+0 === -0         // true',
      explanation:
        '`===` follows ordinary equality, which treats positive zero and negative zero as the same number, so `+0 === -0` is true. `Object.is` uses SameValue and keeps the sign, so `Object.is(+0, -0)` is false. Signed zero still behaves like zero in arithmetic such as `1 / -0`, which is `-Infinity`.',
      tags: ['equality', 'numbers'],
    },
  },
  {
    id: 'js-easy-19',
    type: 'mc',
    prompt: 'What does `0.1 + 0.2 === 0.3` evaluate to?',
    code: '0.1 + 0.2 === 0.3',
    choices: ['true', 'false', 'undefined', 'Throws a RangeError'],
    answerIndex: 1,
    query: {
      title: 'Binary floats do not sum to 0.3',
      syntax: '0.1 + 0.2 === 0.3  // false',
      explanation:
        'JavaScript numbers are IEEE-754 binary floats, and 0.1 and 0.2 have no exact binary representation. Their sum is a value slightly larger than 0.3, so `===` against the literal 0.3 is false. The addition does not throw, and `===` is not broken for integers.',
      tags: ['numbers', 'equality'],
    },
  },
  {
    id: 'js-easy-20',
    type: 'mc',
    prompt: 'What does `Number("")` evaluate to?',
    code: 'Number("")',
    choices: ['0', 'NaN', '""', 'undefined'],
    answerIndex: 0,
    query: {
      title: 'Number of an empty string is 0',
      syntax: 'Number("")  // 0',
      explanation:
        '`Number` converts its argument with `ToNumber`. An empty string, and a string of only whitespace, converts to 0 rather than to NaN. A non-numeric string such as "10px" is the case that becomes NaN.',
      tags: ['coercion', 'numbers'],
    },
  },
  {
    id: 'js-easy-21',
    type: 'mc',
    prompt: 'What does `Number("10px")` evaluate to?',
    code: 'Number("10px")',
    choices: ['10', '0', '"10px"', 'NaN'],
    answerIndex: 3,
    query: {
      title: 'Number rejects a trailing unit',
      syntax: 'Number("10px")  // NaN',
      explanation:
        '`Number` requires the whole string, after trimming whitespace, to be a numeric literal. The trailing "px" makes "10px" invalid, so the result is NaN, not the leading 10. `parseInt("10px", 10)` is the call that stops at the first bad character and returns 10.',
      tags: ['coercion', 'numbers'],
    },
  },
  {
    id: 'js-easy-22',
    type: 'mc',
    prompt: 'What does `parseInt("10px", 10)` evaluate to?',
    code: 'parseInt("10px", 10)',
    choices: ['NaN', '10', '"10px"', 'Throws a SyntaxError'],
    answerIndex: 1,
    query: {
      title: 'parseInt stops at the first non-digit',
      syntax: 'parseInt("10px", 10)  // 10',
      explanation:
        '`parseInt` reads a numeric prefix and stops at the first character that is not valid in the given radix. With radix 10, "10px" yields 10 and the "px" is ignored. `Number("10px")` does not ignore that suffix: it returns NaN. Nothing here throws.',
      tags: ['parseint', 'coercion'],
    },
  },
  {
    id: 'js-easy-23',
    type: 'mc',
    prompt: 'What does `parseInt("08", 10)` evaluate to?',
    code: 'parseInt("08", 10)',
    choices: ['0', 'NaN', '8', '10'],
    answerIndex: 2,
    query: {
      title: 'A leading zero is still decimal',
      syntax: 'parseInt("08", 10)  // 8',
      explanation:
        'The radix argument 10 forces a decimal parse, so the leading 0 is just a digit and the value is 8. Older engines sometimes treated a leading zero as octal when the radix was omitted, which made "08" look invalid. With an explicit 10, that octal reading does not apply, and the result is not 0 or NaN.',
      tags: ['parseint', 'numbers'],
    },
  },
  {
    id: 'js-easy-24',
    type: 'mc',
    prompt: 'What does `parseFloat("3.14abc")` evaluate to?',
    code: 'parseFloat("3.14abc")',
    choices: ['3.14', 'NaN', '"3.14abc"', '3'],
    answerIndex: 0,
    query: {
      title: 'parseFloat keeps a numeric prefix',
      syntax: 'parseFloat("3.14abc")  // 3.14',
      explanation:
        '`parseFloat` parses a decimal prefix and stops at the first character that cannot continue the number. "3.14abc" therefore becomes 3.14, not NaN and not the original string. `Number("3.14abc")` is NaN, because `Number` refuses a trailing suffix.',
      tags: ['parsefloat', 'coercion'],
    },
  },
  {
    id: 'js-easy-25',
    type: 'mc',
    prompt: 'What does `+[]` evaluate to?',
    code: '+[]',
    choices: ['NaN', '0', '""', '[]'],
    answerIndex: 1,
    query: {
      title: 'Unary plus on an empty array is 0',
      syntax: '+[]  // 0',
      explanation:
        'Unary `+` converts with `ToNumber`. An array\'s primitive form is its `toString` join, an empty array joins to "", and `ToNumber("")` is 0. The expression does not stay an array, and it is not NaN. A plain object is the value that becomes NaN under the same operator.',
      tags: ['coercion', 'arrays'],
    },
  },
  {
    id: 'js-easy-26',
    type: 'mc',
    prompt: 'What does `+{}` evaluate to?',
    code: '+{}',
    choices: ['0', '"[object Object]"', '{}', 'NaN'],
    answerIndex: 3,
    query: {
      title: 'Unary plus on a plain object is NaN',
      syntax: '+{}  // NaN',
      explanation:
        'Unary `+` asks the object for a primitive. A plain object\'s `toString` is "[object Object]", and that string is not numeric, so the result is NaN. It does not become 0 the way `+[]` does, and the result is not the string "[object Object]" itself.',
      tags: ['coercion', 'objects'],
    },
  },
  {
    id: 'js-easy-27',
    type: 'mc',
    prompt: 'What does `String(null)` evaluate to?',
    code: 'String(null)',
    choices: ['"null"', '""', '"undefined"', 'Throws a TypeError'],
    answerIndex: 0,
    query: {
      title: 'String(null) is the word null',
      syntax: 'String(null)  // "null"',
      explanation:
        '`String` has an explicit case for null: it returns the four-character string "null". It does not return an empty string, and it does not throw the way `` `${null.missing}` `` would. `String(undefined)` is the separate string "undefined".',
      tags: ['coercion', 'null'],
    },
  },
  {
    id: 'js-easy-28',
    type: 'mc',
    prompt: 'What does `String(undefined)` evaluate to?',
    code: 'String(undefined)',
    choices: ['"null"', '""', '"undefined"', 'Throws a TypeError'],
    answerIndex: 2,
    query: {
      title: 'String(undefined) is the word undefined',
      syntax: 'String(undefined)  // "undefined"',
      explanation:
        '`String` converts undefined to the string "undefined", not to an empty string and not to "null". The conversion does not throw. Concatenation does the same conversion: `"" + undefined` is also "undefined".',
      tags: ['coercion', 'undefined'],
    },
  },
  {
    id: 'js-easy-29',
    type: 'mc',
    prompt: 'What does `Boolean("")` evaluate to?',
    code: 'Boolean("")',
    choices: ['true', 'false', '""', 'undefined'],
    answerIndex: 1,
    query: {
      title: 'An empty string is falsy',
      syntax: 'Boolean("")  // false',
      explanation:
        '`Boolean` uses the falsy list, and the empty string is on it, so `Boolean("")` is false. The result is an actual boolean, not the empty string echoed back. A string of the word "false", or a string of spaces, is non-empty and therefore true.',
      tags: ['boolean', 'coercion'],
    },
  },
  {
    id: 'js-easy-30',
    type: 'mc',
    prompt: 'What does `Boolean("false")` evaluate to?',
    code: 'Boolean("false")',
    choices: ['true', 'false', 'Throws a SyntaxError', 'undefined'],
    answerIndex: 0,
    query: {
      title: 'The string false is truthy',
      syntax: 'Boolean("false")  // true',
      explanation:
        'Any non-empty string is truthy, including the characters f-a-l-s-e. `Boolean` does not parse the string the way `JSON.parse` would, so it does not produce false. Only the empty string is a falsy string.',
      tags: ['boolean', 'coercion'],
    },
  },
  {
    id: 'js-easy-31',
    type: 'mc',
    prompt: 'What does `Boolean([])` evaluate to?',
    code: 'Boolean([])',
    choices: ['false', '0', '""', 'true'],
    answerIndex: 3,
    query: {
      title: 'An empty array is truthy',
      syntax: 'Boolean([])  // true',
      explanation:
        'Objects, arrays included, are truthy. `Boolean` does not convert the array to a string or a number first, so the empty array is true even though `[] == false` is also true. Emptiness is not the same rule as falsiness.',
      tags: ['boolean', 'arrays'],
    },
  },
  {
    id: 'js-easy-32',
    type: 'mc',
    prompt: 'What does `Boolean(0)` evaluate to?',
    code: 'Boolean(0)',
    choices: ['true', 'false', '0', 'undefined'],
    answerIndex: 1,
    query: {
      title: 'Zero is falsy',
      syntax: 'Boolean(0)  // false',
      explanation:
        '0 is on the falsy list, along with -0, NaN, "", null, undefined, and false. `Boolean(0)` is therefore the boolean false, not the number 0 left in place. A non-zero number, including a negative one, is truthy.',
      tags: ['boolean', 'numbers'],
    },
  },
  {
    id: 'js-easy-33',
    type: 'mc',
    prompt: 'What does `Boolean({})` evaluate to?',
    code: 'Boolean({})',
    choices: ['false', 'NaN', 'true', 'undefined'],
    answerIndex: 2,
    query: {
      title: 'A plain object is truthy',
      syntax: 'Boolean({})  // true',
      explanation:
        'Every object is truthy, including an object with no own properties. `Boolean` does not look inside the object and does not use the `ToNumber` path that makes `+{}` NaN. `null` is the empty-looking value that is falsy, and null is not an object you can use this way.',
      tags: ['boolean', 'objects'],
    },
  },
  {
    id: 'js-easy-34',
    type: 'mc',
    prompt: 'What does `null ?? "x"` evaluate to?',
    code: 'null ?? "x"',
    choices: ['"x"', 'null', 'undefined', 'Throws a TypeError'],
    answerIndex: 0,
    query: {
      title: 'Nullish coalescing replaces null',
      syntax: 'null ?? "x"  // "x"',
      explanation:
        'The `??` operator returns the right operand only when the left operand is null or undefined. `null` is nullish, so the result is "x". It does not throw, and it does not return null once a right-hand fallback is present.',
      tags: ['nullish-coalescing', 'null'],
    },
  },
  {
    id: 'js-easy-35',
    type: 'mc',
    prompt: 'What does `0 ?? "x"` evaluate to?',
    code: '0 ?? "x"',
    choices: ['"x"', '0', 'null', 'false'],
    answerIndex: 1,
    query: {
      title: 'Zero is not nullish',
      syntax: '0 ?? "x"  // 0',
      explanation:
        '`??` replaces only null and undefined. 0 is a real value, so the expression keeps 0 and does not evaluate the fallback. `||` is the operator that would treat 0 as missing and return "x".',
      tags: ['nullish-coalescing', 'numbers'],
    },
  },
  {
    id: 'js-easy-36',
    type: 'mc',
    prompt: 'What does `"" ?? "x"` evaluate to?',
    code: '"" ?? "x"',
    choices: ['"x"', 'null', 'undefined', '""'],
    answerIndex: 3,
    query: {
      title: 'An empty string is not nullish',
      syntax: '"" ?? "x"  // ""',
      explanation:
        'The empty string is falsy but not nullish, so `??` keeps it. The right-hand "x" is not used. `"" || "x"` returns "x" because `||` treats every falsy value as a reason to take the fallback.',
      tags: ['nullish-coalescing', 'coercion'],
    },
  },
  {
    id: 'js-easy-37',
    type: 'mc',
    prompt: 'What does `undefined ?? "x"` evaluate to?',
    code: 'undefined ?? "x"',
    choices: ['null', 'undefined', '"x"', 'Throws a TypeError'],
    answerIndex: 2,
    query: {
      title: 'Nullish coalescing replaces undefined',
      syntax: 'undefined ?? "x"  // "x"',
      explanation:
        '`undefined` is nullish, so `??` returns the right operand, "x". The result is not left as undefined, and the expression does not throw. 0 and "" would have been kept, because only null and undefined trigger the fallback.',
      tags: ['nullish-coalescing', 'undefined'],
    },
  },
  {
    id: 'js-easy-38',
    type: 'mc',
    prompt: 'What does `null?.prop` do?',
    code: 'null?.prop',
    choices: [
      'undefined, and it does not throw',
      'null',
      'Throws a TypeError',
      '"undefined"',
    ],
    answerIndex: 0,
    query: {
      title: 'Optional chaining on null',
      syntax: 'null?.prop  // undefined',
      explanation:
        'Optional chaining stops when the base is null or undefined and yields undefined instead of reading the property. `null.prop` without the question mark throws a TypeError. The result is the undefined value, not the string "undefined", and not null.',
      tags: ['optional-chaining', 'null'],
    },
  },
  {
    id: 'js-easy-39',
    type: 'mc',
    prompt: 'What does an optional call on `null` do?',
    code: 'const fn = null;\nfn?.();',
    choices: [
      'Throws a TypeError',
      'undefined, and it does not call anything',
      'null',
      'false',
    ],
    answerIndex: 1,
    query: {
      title: 'Optional call short-circuits on null',
      syntax: 'const fn = null;\nfn?.();  // undefined',
      explanation:
        'When the callee is null or undefined, `fn?.()` does not perform the call and the expression evaluates to undefined. A bare `fn()` would throw a TypeError because null is not callable. The short-circuit applies only to null and undefined: a non-nullish value that is not a function still throws when the call proceeds.',
      tags: ['optional-chaining', 'functions'],
    },
  },
  {
    id: 'js-easy-40',
    type: 'mc',
    prompt: 'What does `0 || "fallback"` evaluate to?',
    code: '0 || "fallback"',
    choices: ['0', 'false', '"fallback"', 'undefined'],
    answerIndex: 2,
    query: {
      title: 'Or replaces a falsy zero',
      syntax: '0 || "fallback"  // "fallback"',
      explanation:
        '`||` returns the first operand if it is truthy, otherwise the second. 0 is falsy, so the result is "fallback", and the result is that string rather than the boolean false. `??` would have kept the 0, because 0 is not nullish.',
      tags: ['operators', 'coercion'],
    },
  },
  {
    id: 'js-easy-41',
    type: 'mc',
    prompt: 'What does `0 && "value"` evaluate to?',
    code: '0 && "value"',
    choices: ['0', '"value"', 'false', 'null'],
    answerIndex: 0,
    query: {
      title: 'And returns the falsy operand',
      syntax: '0 && "value"  // 0',
      explanation:
        '`&&` returns the first operand when that operand is falsy, and it does not evaluate the second. The returned value is the number 0, not the boolean false and not "value". `||` on the same operands would return "value".',
      tags: ['operators', 'coercion'],
    },
  },
  {
    id: 'js-easy-42',
    type: 'mc',
    prompt: 'What does `"" || "fallback"` evaluate to?',
    code: '"" || "fallback"',
    choices: ['""', 'false', 'null', '"fallback"'],
    answerIndex: 3,
    query: {
      title: 'Or replaces an empty string',
      syntax: '"" || "fallback"  // "fallback"',
      explanation:
        'The empty string is falsy, so `||` skips it and returns "fallback". It does not return a boolean, and it does not keep the empty string. `??` would keep "", because an empty string is not null or undefined.',
      tags: ['operators', 'coercion'],
    },
  },
  {
    id: 'js-easy-43',
    type: 'mc',
    prompt: 'What happens if you assign a new value to a `const` binding?',
    code: 'const n = 1;\nn = 2;',
    choices: [
      'n becomes 2',
      'Throws a TypeError',
      'Throws a SyntaxError',
      'n stays 1 and the assignment is ignored',
    ],
    answerIndex: 1,
    query: {
      title: 'const cannot be reassigned',
      syntax: 'const n = 1;\nn = 2;  // TypeError',
      explanation:
        'A `const` binding cannot be assigned again after its initializer runs. The second assignment throws a TypeError at runtime. It is not a SyntaxError, because the statement is grammatically valid, and it is not a silent no-op.',
      tags: ['const', 'scope'],
    },
  },
  {
    id: 'js-easy-44',
    type: 'mc',
    prompt: 'What happens when you change a property of an object held by `const`?',
    code: 'const obj = { a: 1 };\nobj.a = 2;',
    choices: [
      'Throws a TypeError',
      'obj.a stays 1',
      'obj.a becomes 2',
      'The binding obj becomes undefined',
    ],
    answerIndex: 2,
    query: {
      title: 'const does not freeze the object',
      syntax: 'const obj = { a: 1 };\nobj.a = 2;  // obj.a is 2',
      explanation:
        '`const` protects the binding, not the value. Replacing `obj` with another object would throw, but writing `obj.a` mutates the existing object and leaves the binding in place. `Object.freeze` is what would reject the property write.',
      tags: ['const', 'objects'],
    },
  },
  {
    id: 'js-easy-45',
    type: 'mc',
    prompt: 'What happens when you read a `let` before its declaration line?',
    code: 'console.log(value);\nlet value = 1;',
    choices: ['Throws a ReferenceError', 'undefined', '1', 'Throws a SyntaxError'],
    answerIndex: 0,
    query: {
      title: 'let is in the temporal dead zone',
      syntax: 'console.log(value);  // ReferenceError\nlet value = 1;',
      explanation:
        'A `let` binding exists for the whole block, but it stays uninitialized until its declaration line runs. Reading it in that temporal dead zone throws a ReferenceError. It does not evaluate to undefined the way a `var` binding does, and the declaration is not a syntax error.',
      tags: ['let', 'scope'],
    },
  },
  {
    id: 'js-easy-46',
    type: 'mc',
    prompt: 'What does reading a `var` before its declaration line produce?',
    code: 'console.log(value);\nvar value = 1;',
    choices: ['Throws a ReferenceError', '1', 'Throws a TypeError', 'undefined'],
    answerIndex: 3,
    query: {
      title: 'var hoists as undefined',
      syntax: 'console.log(value);  // undefined\nvar value = 1;',
      explanation:
        'A `var` declaration is hoisted to the top of its function and initialized to undefined immediately. The assignment `value = 1` still happens on the original line, so an earlier read sees undefined rather than 1. It does not throw the ReferenceError that `let` throws in the same position.',
      tags: ['var', 'scope'],
    },
  },
  {
    id: 'js-easy-47',
    type: 'mc',
    prompt: 'How do `var` and `let` differ when both are declared inside an `if` block?',
    code: 'function demo() {\n  if (true) {\n    var a = 1;\n    let b = 2;\n  }\n}',
    choices: [
      'Both names are visible only inside the block',
      'var is visible throughout the function; let is visible only inside the block',
      'Both names are visible throughout the function',
      'let is visible throughout the function; var is visible only inside the block',
    ],
    answerIndex: 1,
    query: {
      title: 'var is function-scoped, let is block-scoped',
      syntax: 'if (true) {\n  var a = 1;\n  let b = 2;\n}\n// a is visible here, b is not',
      explanation:
        '`var` is scoped to the enclosing function, so `a` remains visible after the `if` block ends. `let` is scoped to the block, so `b` cannot be read outside that block. Swapping those two scopes is the usual mix-up with `var`.',
      tags: ['var', 'let', 'scope'],
    },
  },
  {
    id: 'js-easy-48',
    type: 'mc',
    prompt: 'What does this template literal evaluate to?',
    code: '`Hello, ${"Ada"}`',
    choices: [
      'The characters ${"Ada"} left as text',
      '"Hello, Ada"',
      '"Hello, "',
      'Throws a SyntaxError',
    ],
    answerIndex: 1,
    query: {
      title: 'Template literals interpolate',
      syntax: '`Hello, ${"Ada"}`  // "Hello, Ada"',
      explanation:
        'A template literal evaluates each `${...}` expression and inserts its string form into the result. The expression `"Ada"` becomes the text Ada between "Hello, " and the end. A normal single-quoted or double-quoted string would have left `${"Ada"}` as characters, and the template is not a syntax error.',
      tags: ['template-literals'],
    },
  },
  {
    id: 'js-easy-49',
    type: 'mc',
    prompt: 'What does a template nested inside another template evaluate to?',
    code: 'const n = 2;\n`a ${`b ${n}`}`',
    choices: ['"a b 2"', '"a ${`b ${n}`}"', 'Throws a SyntaxError', '"a b "'],
    answerIndex: 0,
    query: {
      title: 'Nested template literals',
      syntax: 'const n = 2;\n`a ${`b ${n}`}`  // "a b 2"',
      explanation:
        'The inner template is just an expression in the outer `${...}`, so it runs first and produces "b 2". The outer template then inserts that string, producing "a b 2". Nesting is legal. The outer template does not leave the inner backticks uninterpolated.',
      tags: ['template-literals'],
    },
  },
  {
    id: 'js-easy-50',
    type: 'mc',
    prompt: 'What does `String.raw` do with `\\n` in the template?',
    code: 'String.raw`\\n`',
    choices: [
      'A string of one newline character',
      'undefined',
      'Throws a SyntaxError',
      'A two-character string: backslash, then n',
    ],
    answerIndex: 3,
    query: {
      title: 'String.raw does not process escapes',
      syntax: 'String.raw`\\n` === "\\\\n"  // true',
      explanation:
        '`String.raw` returns the template\'s raw contents, so the characters backslash and n stay as two characters instead of becoming a newline. A normal template literal would turn `\\n` into one newline character. `${...}` interpolation still runs inside `String.raw`; only escape processing is skipped.',
      tags: ['template-literals', 'string-raw'],
    },
  },
  {
    id: 'js-easy-51',
    type: 'mc',
    prompt: 'What does `map` do to the array it is called on?',
    code: 'const items = [1, 2];\nconst doubled = items.map((n) => n * 2);',
    choices: [
      'It mutates items and returns that same array',
      'It returns a new array and leaves items unchanged',
      'It returns the length of items',
      'It returns undefined',
    ],
    answerIndex: 1,
    query: {
      title: 'map returns a new array',
      syntax: 'const items = [1, 2];\nitems.map((n) => n * 2);  // [2, 4], items is still [1, 2]',
      explanation:
        '`map` allocates a new array and fills it with whatever the callback returns. It does not write those return values back into the receiver, so the original length and slots stay as they were. Treating `map` as an in-place loop that assigns `items[i] = ...` is the wrong model. A callback can still mutate an object element, because the new array holds the same object references.',
      tags: ['arrays', 'map'],
    },
  },
  {
    id: 'js-easy-52',
    type: 'mc',
    prompt: 'Which elements does `filter` keep?',
    code: '[0, 1, "", 2].filter(Boolean)',
    choices: ['[1, 2]', '[0, 1, "", 2]', '[0, ""]', '[]'],
    answerIndex: 0,
    query: {
      title: 'filter keeps truthy callback results',
      syntax: '[0, 1, "", 2].filter(Boolean)  // [1, 2]',
      explanation:
        '`filter` keeps an element when the callback\'s return value is truthy, and it drops the element when that return value is falsy. `Boolean` is falsy for 0 and "", so those two are removed and `[1, 2]` remains. The test is truthiness of the callback result, not a required `=== true`, and the original array is not edited in place.',
      tags: ['arrays', 'filter'],
    },
  },
  {
    id: 'js-easy-53',
    type: 'mc',
    prompt: 'What does `find` return?',
    code: '[1, 2, 3].find((n) => n > 9)',
    choices: [
      'The index, or -1 when nothing matches',
      'A new array of every match',
      'The first matching element, or undefined when nothing matches',
      'true when something matches, otherwise false',
    ],
    answerIndex: 2,
    query: {
      title: 'find returns the element or undefined',
      syntax: '[1, 2, 3].find((n) => n > 2)  // 3\n[1, 2, 3].find((n) => n > 9)  // undefined',
      explanation:
        '`find` returns the first element for which the callback is truthy. If no element passes, it returns undefined, not -1 and not an empty array. `findIndex` is the method that returns an index or -1, and `filter` is the one that returns a new array of every match.',
      tags: ['arrays', 'find'],
    },
  },
  {
    id: 'js-easy-54',
    type: 'mc',
    prompt: 'What does `findIndex` return when nothing matches?',
    code: '[1, 2, 3].findIndex((n) => n > 9)',
    choices: ['undefined', 'null', 'false', '-1'],
    answerIndex: 3,
    query: {
      title: 'findIndex returns the index or -1',
      syntax: '[1, 2, 3].findIndex((n) => n === 2)  // 1\n[1, 2, 3].findIndex((n) => n > 9)   // -1',
      explanation:
        '`findIndex` returns the index of the first element whose callback is truthy. When nothing matches, the result is -1, the same sentinel `indexOf` uses. It does not return undefined; that sentinel belongs to `find`, which returns the element itself.',
      tags: ['arrays', 'findindex'],
    },
  },
  {
    id: 'js-easy-55',
    type: 'mc',
    prompt: 'What does `includes` return?',
    code: '["a", "b"].includes("b")',
    choices: ['1', 'true', '"b"', '0'],
    answerIndex: 1,
    query: {
      title: 'includes returns a boolean',
      syntax: '["a", "b"].includes("b")  // true\n[NaN].includes(NaN)        // true',
      explanation:
        '`includes` answers whether a value is present and always returns a boolean. It does not return the index or the element. It uses SameValueZero, so `[NaN].includes(NaN)` is true, unlike `indexOf`, which uses strict equality and misses NaN.',
      tags: ['arrays', 'includes'],
    },
  },
  {
    id: 'js-easy-56',
    type: 'mc',
    prompt: 'What does `indexOf` return when the value is absent?',
    code: '["a", "b"].indexOf("z")',
    choices: ['-1', 'undefined', 'false', 'null'],
    answerIndex: 0,
    query: {
      title: 'indexOf returns -1 when missing',
      syntax: '["a", "b"].indexOf("z")  // -1\n[NaN].indexOf(NaN)      // -1',
      explanation:
        '`indexOf` returns the first matching index, or -1 when nothing matches. The miss result is not undefined, false, or null. The search uses strict equality, so `[NaN].indexOf(NaN)` is also -1 even though a NaN element is present. `includes` is the boolean check, and it does find NaN.',
      tags: ['arrays', 'indexof'],
    },
  },
  {
    id: 'js-easy-57',
    type: 'mc',
    prompt: 'What does `push` return?',
    code: 'const items = [1];\nitems.push(2);',
    choices: [
      'The array [1, 2]',
      'The pushed element, 2',
      'The new length, 2',
      'undefined',
    ],
    answerIndex: 2,
    query: {
      title: 'push returns the new length',
      syntax: 'const items = [1];\nitems.push(2);  // 2, and items is [1, 2]',
      explanation:
        '`push` appends the arguments and returns the array\'s length after the append. It does mutate `items`, but the return value is the number 2, not the array and not the pushed element. Chaining `.push().push()` fails because that number has no `push` method.',
      tags: ['arrays', 'push'],
    },
  },
  {
    id: 'js-easy-58',
    type: 'mc',
    prompt: 'What does `pop` return?',
    code: 'const items = [1, 2];\nitems.pop();',
    choices: ['[1]', '2', '1', 'undefined'],
    answerIndex: 1,
    query: {
      title: 'pop returns the removed element',
      syntax: 'const items = [1, 2];\nitems.pop();  // 2, and items is [1]',
      explanation:
        '`pop` removes the last element and returns that element, so `[1, 2].pop()` returns 2 and leaves `[1]`. It does not return the shortened array. On an empty array, `pop` returns undefined rather than throwing.',
      tags: ['arrays', 'pop'],
    },
  },
  {
    id: 'js-easy-59',
    type: 'mc',
    prompt: 'What does `shift` return?',
    code: 'const items = [1, 2];\nitems.shift();',
    choices: ['[2]', '2', 'undefined', '1'],
    answerIndex: 3,
    query: {
      title: 'shift returns the first element',
      syntax: 'const items = [1, 2];\nitems.shift();  // 1, and items is [2]',
      explanation:
        '`shift` removes the element at index 0, shifts the rest down, and returns the removed element. `[1, 2].shift()` therefore returns 1, not 2 and not the remaining array. An empty array yields undefined, the same miss value as `pop`.',
      tags: ['arrays', 'shift'],
    },
  },
  {
    id: 'js-easy-60',
    type: 'mc',
    prompt: 'What does `unshift` return?',
    code: 'const items = [1];\nitems.unshift(0);',
    choices: ['The new length, 2', 'The array [0, 1]', '0', 'undefined'],
    answerIndex: 0,
    query: {
      title: 'unshift returns the new length',
      syntax: 'const items = [1];\nitems.unshift(0);  // 2, and items is [0, 1]',
      explanation:
        '`unshift` inserts arguments at the front and returns the length afterward. The return value is 2, not the array and not the inserted 0, even though `items` does become `[0, 1]`. That return contract matches `push`, not `shift`.',
      tags: ['arrays', 'unshift'],
    },
  },
  {
    id: 'js-easy-61',
    type: 'mc',
    prompt: 'After `items.slice(1)`, what is `items`?',
    code: 'const items = [1, 2, 3];\nconst part = items.slice(1);',
    choices: ['[2, 3]', '[1]', '[1, 2, 3]', 'undefined'],
    answerIndex: 2,
    query: {
      title: 'slice does not mutate',
      syntax: 'const items = [1, 2, 3];\nitems.slice(1);  // [2, 3], items is still [1, 2, 3]',
      explanation:
        '`slice` copies a range into a new array and leaves the receiver alone, so `items` is still `[1, 2, 3]` while `part` is `[2, 3]`. The end index is exclusive, and a negative index counts from the end. `splice` is the method that edits the original array.',
      tags: ['arrays', 'slice'],
    },
  },
  {
    id: 'js-easy-62',
    type: 'mc',
    prompt: 'What do `removed` and `items` hold after this `splice`?',
    code: 'const items = [1, 2, 3];\nconst removed = items.splice(1, 1);',
    choices: [
      'removed is 2 and items is [1, 3]',
      'removed is [2] and items is [1, 3]',
      'removed is [2] and items is still [1, 2, 3]',
      'removed is 2 and items is still [1, 2, 3]',
    ],
    answerIndex: 1,
    query: {
      title: 'splice mutates and returns the removed elements',
      syntax: 'const items = [1, 2, 3];\nitems.splice(1, 1);  // returns [2], items is [1, 3]',
      explanation:
        '`splice` edits the original array and returns an array of the deleted elements. Deleting one element still returns a one-element array, `[2]`, not the bare number 2 that `pop` would return. `items` becomes `[1, 3]`. A delete count of 0 returns an empty array and can still insert.',
      tags: ['arrays', 'splice'],
    },
  },
  {
    id: 'js-easy-63',
    type: 'mc',
    prompt: 'What do `next` and `items` hold after `concat`?',
    code: 'const items = [1];\nconst next = items.concat([2]);',
    choices: [
      'next is [1, 2] and items is still [1]',
      'next is [1, 2] and items is [1, 2]',
      'next is 2 and items is [1]',
      'next and items are the same array',
    ],
    answerIndex: 0,
    query: {
      title: 'concat returns a new array',
      syntax: 'const items = [1];\nitems.concat([2]);  // [1, 2], items is still [1]',
      explanation:
        '`concat` builds a new array and does not append into the receiver, so `items` stays `[1]` and `next` is `[1, 2]`. The two names do not point at one array. Array arguments are flattened one level only: `[1].concat([2, [3]])` is `[1, 2, [3]]`, not a fully flat list.',
      tags: ['arrays', 'concat'],
    },
  },
  {
    id: 'js-easy-64',
    type: 'mc',
    prompt: 'After this spread copy, what is `inner.n`?',
    code: 'const inner = { n: 1 };\nconst copy = [...[inner]];\ncopy[0].n = 9;',
    choices: ['1', 'undefined', 'Throws a TypeError', '9'],
    answerIndex: 3,
    query: {
      title: 'Array spread is a shallow copy',
      syntax: 'const inner = { n: 1 };\nconst copy = [...[inner]];\ncopy[0].n = 9;  // inner.n is 9',
      explanation:
        'Spreading an array allocates a new array and copies the element references into it. The object `inner` is not cloned, so `copy[0]` and `inner` are the same object and the write to `n` is visible through both. A change to `copy.length` or a replacement of `copy[0]` would not rewrite the source array. Spread is not a deep copy.',
      tags: ['arrays', 'spread'],
    },
  },
  {
    id: 'js-easy-65',
    type: 'mc',
    prompt: 'What is `merged.b`?',
    code: 'const merged = { ...{ a: 1, b: 2 }, ...{ b: 3 } };',
    choices: ['1', '2', '3', 'undefined'],
    answerIndex: 2,
    query: {
      title: 'Later object-spread keys win',
      syntax: '{ ...{ a: 1, b: 2 }, ...{ b: 3 } }  // { a: 1, b: 3 }',
      explanation:
        'Object spread copies enumerable own string properties from left to right. When `b` appears again, the later value 3 overwrites the earlier 2, and `a` stays 1. A "first key wins" reading is backwards. Non-enumerable properties and symbol keys are not copied by spread at all.',
      tags: ['objects', 'spread'],
    },
  },
  {
    id: 'js-easy-66',
    type: 'mc',
    prompt: 'What are `a` and `b` after these destructuring defaults?',
    code: 'const [a = 1] = [undefined];\nconst [b = 1] = [null];',
    choices: [
      'a is null and b is null',
      'a is 1 and b is null',
      'a is 1 and b is 1',
      'a is undefined and b is null',
    ],
    answerIndex: 1,
    query: {
      title: 'Array defaults apply only for undefined',
      syntax: 'const [a = 1] = [undefined];  // 1\nconst [b = 1] = [null];       // null',
      explanation:
        'A destructuring default runs when the element is undefined, including when the element is missing. `undefined` is replaced by 1, but `null` is a present value, so `b` stays null. 0 and "" would also be kept. The default is not a stand-in for every falsy element.',
      tags: ['destructuring', 'arrays'],
    },
  },
  {
    id: 'js-easy-67',
    type: 'mc',
    prompt: 'What are `a` and `b` in this pattern?',
    code: 'const [a, , b] = [1, 2, 3];',
    choices: [
      'a is 1 and b is 3',
      'a is 1 and b is 2',
      'Throws a SyntaxError',
      'a is 2 and b is 3',
    ],
    answerIndex: 0,
    query: {
      title: 'A hole in the pattern skips an element',
      syntax: 'const [a, , b] = [1, 2, 3];  // a is 1, b is 3',
      explanation:
        'An elision in an array pattern, the extra comma, skips that source element. `a` receives 1, the 2 is discarded, and `b` receives 3. The hole is not a syntax error, and it does not create a binding whose value is 2.',
      tags: ['destructuring', 'arrays'],
    },
  },
  {
    id: 'js-easy-68',
    type: 'mc',
    prompt: 'What is `tail`?',
    code: 'const [head, ...tail] = [1, 2, 3];',
    choices: ['2', 'undefined', '[3]', '[2, 3]'],
    answerIndex: 3,
    query: {
      title: 'Rest collects the remaining elements',
      syntax: 'const [head, ...tail] = [1, 2, 3];  // tail is [2, 3]',
      explanation:
        'A rest element in array destructuring gathers every remaining value into a new array. `head` is 1 and `tail` is `[2, 3]`, not the single number 2. If nothing remains, the rest binding is an empty array, not undefined. The rest element has to be last in the pattern.',
      tags: ['destructuring', 'arrays'],
    },
  },
  {
    id: 'js-easy-69',
    type: 'mc',
    prompt: 'Which binding does `const { a: b } = { a: 1 }` create?',
    code: 'const { a: b } = { a: 1 };',
    choices: [
      'Both a and b, each equal to 1',
      'a equal to 1, and no b',
      'b equal to 1, and this pattern does not declare a',
      'Throws a SyntaxError',
    ],
    answerIndex: 2,
    query: {
      title: 'Object destructuring can rename',
      syntax: 'const { a: b } = { a: 1 };  // b is 1',
      explanation:
        'In `{ a: b }`, `a` is the property to read and `b` is the local binding that receives it. The pattern declares `b`, set to 1, and does not declare `a`. Reading it as "a is 1" swaps the source property with the new name. The colon here is not a default and not a type annotation.',
      tags: ['destructuring', 'objects'],
    },
  },
  {
    id: 'js-easy-70',
    type: 'mc',
    prompt: 'What are `a` and `b` after these object defaults?',
    code: 'const { a = 1 } = { a: null };\nconst { b = 1 } = {};',
    choices: [
      'a is 1 and b is 1',
      'a is null and b is 1',
      'a is null and b is undefined',
      'a is 1 and b is undefined',
    ],
    answerIndex: 1,
    query: {
      title: 'Object defaults apply only for undefined',
      syntax: 'const { a = 1 } = { a: null };  // null\nconst { b = 1 } = {};            // 1',
      explanation:
        'An object-destructuring default replaces a property only when that property\'s value is undefined. An explicit `null` is kept, so `a` is null. A missing property counts as undefined, so `b` becomes 1. Falsy values such as 0 and "" are kept as well.',
      tags: ['destructuring', 'objects'],
    },
  },
  {
    id: 'js-easy-71',
    type: 'bool',
    prompt: 'A missing property destructures to `undefined`.',
    code: 'const { a } = { b: 1 };',
    answer: true,
    query: {
      title: 'A missing property is undefined',
      syntax: 'const { a } = { b: 1 };  // a is undefined',
      explanation:
        'Object destructuring reads the named property and, when it is absent, binds undefined. It does not throw just because the key is missing. A default is what would replace that undefined. Destructuring `null` or `undefined` as the whole source is the case that throws.',
      tags: ['destructuring', 'objects'],
    },
  },
  {
    id: 'js-easy-72',
    type: 'bool',
    prompt: 'Destructuring `null` throws a TypeError.',
    code: 'const { a } = null;',
    answer: true,
    query: {
      title: 'Destructuring null throws',
      syntax: 'const { a } = null;  // TypeError',
      explanation:
        'Destructuring requires the source to be coercible to an object. `null` and `undefined` fail that check and throw a TypeError before any property is read. A missing property on a real object does not throw; it binds undefined. Optional chaining is a different operator and is not implied by a destructuring pattern.',
      tags: ['destructuring', 'null'],
    },
  },
  {
    id: 'js-easy-73',
    type: 'bool',
    prompt: 'In an object literal, `{ name }` means `{ name: name }`.',
    code: 'const name = "Ada";\nconst person = { name };',
    answer: true,
    query: {
      title: 'Property shorthand copies the binding',
      syntax: 'const name = "Ada";\nconst person = { name };  // { name: "Ada" }',
      explanation:
        'Shorthand property syntax uses the identifier both as the key and as the value expression. `{ name }` is the same object as `{ name: name }`, so `person.name` is "Ada". It does not create a key with the value undefined, and it is not a destructuring pattern: that same brace shape on the left of `=` would unpack instead of build.',
      tags: ['objects'],
    },
  },
  {
    id: 'js-easy-74',
    type: 'bool',
    prompt: 'A computed property name evaluates its expression.',
    code: 'const key = "id";\nconst obj = { [key]: 1 };',
    answer: true,
    query: {
      title: 'Computed property names',
      syntax: 'const key = "id";\nconst obj = { [key]: 1 };  // { id: 1 }',
      explanation:
        'Brackets around a property name evaluate the expression and use the result as the key. `key` holds "id", so the object is `{ id: 1 }`, not an object whose key is the identifier "key". The expression can be any value that converts to a property key, including string concatenation such as `["a" + "b"]`.',
      tags: ['objects'],
    },
  },
  {
    id: 'js-easy-75',
    type: 'bool',
    prompt: '`for...of` yields values.',
    code: 'for (const value of ["a", "b"]) {\n  value;\n}',
    answer: true,
    query: {
      title: 'for...of yields values',
      syntax: 'for (const value of ["a", "b"]) {\n  value;  // "a", then "b"\n}',
      explanation:
        '`for...of` pulls values from the iterable protocol. On an array, the loop variable is "a" and then "b", the elements, not the index strings "0" and "1". `for...in` is the loop that yields keys. A plain object is not iterable, so `for...of` on `{}` throws.',
      tags: ['for-of', 'arrays'],
    },
  },
  {
    id: 'js-easy-76',
    type: 'bool',
    prompt: '`for...in` yields enumerable string keys, including inherited ones.',
    code: 'const proto = { inherited: 1 };\nconst obj = Object.create(proto);\nobj.own = 2;\nfor (const key in obj) {\n  key;\n}',
    answer: true,
    query: {
      title: 'for...in walks enumerable keys',
      syntax: 'for (const key in obj) {\n  key;  // "own" and "inherited"\n}',
      explanation:
        '`for...in` enumerates enumerable string keys on the object and continues up the prototype chain, so both "own" and "inherited" appear. It does not yield values, and it skips non-enumerable properties and symbol keys. `Object.keys` is the own-only list, so an inherited enumerable key shows up in `for...in` and not in `Object.keys`.',
      tags: ['for-in', 'objects'],
    },
  },
  {
    id: 'js-easy-77',
    type: 'bool',
    prompt: '`for...in` on an array yields the indexes as strings.',
    code: 'for (const key in ["a", "b"]) {\n  key;\n}',
    answer: true,
    query: {
      title: 'Array indexes in for...in are strings',
      syntax: 'for (const key in ["a", "b"]) {\n  key;  // "0", then "1"\n}',
      explanation:
        'Array indexes are property keys, and property keys that `for...in` visits are strings. The loop variable is "0" and then "1", not the numbers 0 and 1, and not the elements "a" and "b". `for...of` is what yields the elements. Other enumerable keys, including inherited ones, are visited too.',
      tags: ['for-in', 'arrays'],
    },
  },
  {
    id: 'js-easy-78',
    type: 'bool',
    prompt: '`JSON.stringify` omits object keys whose value is `undefined`.',
    code: 'JSON.stringify({ a: 1, b: undefined })',
    answer: true,
    query: {
      title: 'JSON drops undefined object properties',
      syntax: 'JSON.stringify({ a: 1, b: undefined })  // \'{"a":1}\'',
      explanation:
        'JSON has no undefined value. When an object property is undefined, `JSON.stringify` leaves that key out, so the result is \'{"a":1}\'. The key is not serialized as null. An undefined element inside an array is handled differently: that slot becomes null rather than disappearing.',
      tags: ['json'],
    },
  },
  {
    id: 'js-easy-79',
    type: 'bool',
    prompt: '`JSON.stringify` turns an array hole, or an `undefined` element, into `null`.',
    code: 'JSON.stringify([1, undefined, 3])',
    answer: true,
    query: {
      title: 'JSON array gaps become null',
      syntax: 'JSON.stringify([1, undefined, 3])  // "[1,null,3]"\nJSON.stringify([1, , 3])          // "[1,null,3]"',
      explanation:
        'In an array, both an explicit undefined element and a hole are serialized as null, so the slot stays in the JSON text. That differs from object properties, where undefined keys are omitted entirely. The array does not shrink, and the element is not left as the token undefined, which is not valid JSON.',
      tags: ['json', 'arrays'],
    },
  },
  {
    id: 'js-easy-80',
    type: 'bool',
    prompt: '`JSON.stringify` omits function-valued properties of an object.',
    code: 'JSON.stringify({ a: 1, b() {} })',
    answer: true,
    query: {
      title: 'JSON omits object methods',
      syntax: 'JSON.stringify({ a: 1, b() {} })  // \'{"a":1}\'',
      explanation:
        'Functions are not JSON values. `JSON.stringify` drops a function-valued property of an object the same way it drops undefined, so `b` is absent and the result is \'{"a":1}\'. A function element of an array is not dropped: that slot becomes null. The function source is never written into the JSON.',
      tags: ['json', 'functions'],
    },
  },
  {
    id: 'js-easy-81',
    type: 'bool',
    prompt: '`JSON.parse` of a JSON string returns the value that string describes.',
    code: 'JSON.parse(\'{"a":1}\')',
    answer: true,
    query: {
      title: 'JSON.parse returns the value',
      syntax: 'JSON.parse(\'{"a":1}\')  // { a: 1 }',
      explanation:
        '`JSON.parse` reads JSON text and returns the corresponding value: an object, array, string, number, boolean, or null. `JSON.parse(\'{"a":1}\').a` is the number 1, not a leftover string. Invalid JSON throws a SyntaxError. The reviver argument can rewrite values, but the default call returns the parsed data.',
      tags: ['json'],
    },
  },
  {
    id: 'js-easy-82',
    type: 'bool',
    prompt: 'An arrow function cannot be constructed with `new`.',
    code: 'new (() => {});',
    answer: true,
    query: {
      title: 'Arrows are not constructors',
      syntax: 'new (() => {});  // TypeError',
      explanation:
        'Arrow functions do not have a `[[Construct]]` internal method and do not get a `prototype` property. Calling one with `new` throws a TypeError. A `function` declaration or expression can be constructed with `new`. The arrow still runs fine as an ordinary call.',
      tags: ['arrow-functions'],
    },
  },
  {
    id: 'js-easy-83',
    type: 'bool',
    prompt: 'An arrow function does not bind its own `arguments` object.',
    code: 'const f = () => arguments;',
    answer: true,
    query: {
      title: 'Arrows have no own arguments',
      syntax: 'const f = () => arguments;\n// in a module, f() throws ReferenceError',
      explanation:
        'An arrow function does not create an `arguments` binding for its own parameters. At the top of a module, `arguments` is unresolved, so calling that arrow throws a ReferenceError. Nested inside a traditional function, the arrow sees that outer `arguments` object lexically, which lists the outer function\'s arguments, not the arrow\'s.',
      tags: ['arrow-functions'],
    },
  },
  {
    id: 'js-easy-84',
    type: 'bool',
    prompt: 'A function declaration is hoisted within its scope.',
    code: 'declared();\nfunction declared() {\n  return 1;\n}',
    answer: true,
    query: {
      title: 'Function declarations are hoisted',
      syntax: 'declared();  // 1\nfunction declared() {\n  return 1;\n}',
      explanation:
        'A function declaration is initialized for the whole of its scope before that scope starts running, so a call on an earlier line succeeds. In strict mode the scope is the enclosing block or function, and the name does not leak out of that block. A `const` function expression does not get this treatment: touching it early throws.',
      tags: ['functions', 'hoisting'],
    },
  },
  {
    id: 'js-easy-85',
    type: 'bool',
    prompt: 'A function expression assigned to `const` is in the temporal dead zone before its line.',
    code: 'expression();\nconst expression = function () {\n  return 1;\n};',
    answer: true,
    query: {
      title: 'A const function expression is not hoisted',
      syntax: 'expression();  // ReferenceError\nconst expression = function () {\n  return 1;\n};',
      explanation:
        'The `const` binding is hoisted but uninitialized, so a call before the declaration line throws a ReferenceError. The function value does not exist until that line runs. This is not the TypeError you would get from `var expression = function () {}`, where the hoisted binding is undefined and you try to call it. A function declaration, by contrast, can be called earlier in the same scope.',
      tags: ['functions', 'hoisting'],
    },
  },
  {
    id: 'js-easy-86',
    type: 'bool',
    prompt: 'A default parameter is used for `undefined`, and not for `null`.',
    code: 'function f(a = 1) {\n  return a;\n}',
    answer: true,
    query: {
      title: 'Defaults trigger on undefined only',
      syntax: 'function f(a = 1) {\n  return a;\n}\nf(undefined)  // 1\nf(null)       // null',
      explanation:
        'A default parameter initializer runs when the argument is undefined, including when the caller omits it. `f(undefined)` therefore returns 1. `null` is a passed value, so `f(null)` returns null and the default does not run. The same rule rejects the idea that every falsy argument, such as 0, is replaced.',
      tags: ['functions', 'default-parameters'],
    },
  },
  {
    id: 'js-easy-87',
    type: 'bool',
    prompt: 'A default parameter may read an earlier parameter.',
    code: 'function f(a, b = a) {\n  return b;\n}',
    answer: true,
    query: {
      title: 'Defaults can read earlier parameters',
      syntax: 'function f(a, b = a) {\n  return b;\n}\nf(4)  // 4',
      explanation:
        'Default expressions are evaluated left to right in a scope where earlier parameters are already initialized. `f(4)` leaves `b` undefined, so the default reads `a` and returns 4. A default cannot read a later parameter: that binding is still in the temporal dead zone, and the initializer throws a ReferenceError if it runs.',
      tags: ['functions', 'default-parameters'],
    },
  },
  {
    id: 'js-easy-88',
    type: 'bool',
    prompt: '`switch` compares the discriminant with each `case` using `===`.',
    code: 'switch (1) {\n  case "1":\n    break;\n}',
    answer: true,
    query: {
      title: 'switch uses strict equality',
      syntax: 'switch (1) {\n  case "1":\n    break;  // does not match\n  case 1:\n    break;  // matches\n}',
      explanation:
        'Each `case` label is compared with the discriminant using `===`. The number 1 does not match the string "1", so that branch is skipped. There is no `ToNumber` coercion the way `==` would apply. The comparison is not a truthiness test of the case label.',
      tags: ['switch', 'equality'],
    },
  },
  {
    id: 'js-easy-89',
    type: 'bool',
    prompt: '`switch` falls through to the next case when `break` is omitted.',
    code: 'switch (1) {\n  case 1:\n  case 2:\n    break;\n}',
    answer: true,
    query: {
      title: 'switch falls through without break',
      syntax: 'switch (1) {\n  case 1:\n    // runs, then continues\n  case 2:\n    // also runs\n    break;\n}',
      explanation:
        'Once a `case` matches, execution continues into the following cases until a `break`, a `return`, or the end of the switch. Matching `case 1` and omitting `break` also runs the body of `case 2`. Cases are not isolated blocks. A `break` is what stops that fall-through.',
      tags: ['switch'],
    },
  },
  {
    id: 'js-easy-90',
    type: 'bool',
    prompt: '`void expr` evaluates `expr` and then produces `undefined`.',
    code: 'void 0',
    answer: true,
    query: {
      title: 'void evaluates to undefined',
      syntax: 'void 0  // undefined',
      explanation:
        'The `void` operator evaluates its operand, discards that value, and returns undefined. `void 0` is undefined, and a side effect inside the operand still happens. It does not delete a binding, and it does not return 0. The operand expression runs; only its result is thrown away.',
      tags: ['operators', 'void'],
    },
  },
  {
    id: 'js-easy-91',
    type: 'bool',
    prompt: '`delete` returns `true` when it removes a configurable own property.',
    code: 'const obj = { a: 1 };\ndelete obj.a;',
    answer: true,
    query: {
      title: 'delete returns true after removal',
      syntax: 'const obj = { a: 1 };\ndelete obj.a;  // true, and obj.a is gone',
      explanation:
        'A property created by an ordinary assignment is configurable. `delete obj.a` removes that own property and returns true. In strict mode, deleting a non-configurable property throws a TypeError instead of returning false. `delete` also returns true when the property was already absent, so true alone does not prove a field was there.',
      tags: ['delete', 'objects'],
    },
  },
  {
    id: 'js-easy-92',
    type: 'bool',
    prompt: '`delete` on an array index leaves a hole and does not change `length`.',
    code: 'const items = ["x", "y", "z"];\ndelete items[1];',
    answer: true,
    query: {
      title: 'delete leaves an array hole',
      syntax: 'const items = ["x", "y", "z"];\ndelete items[1];\n// length is 3, and (1 in items) is false',
      explanation:
        '`delete items[1]` removes the own property at that index and returns true, but `length` stays 3. The index is then a hole: `1 in items` is false, while a direct read of `items[1]` is undefined. `splice(1, 1)` is what would close the gap and set `length` to 2. `delete` does not reindex the tail.',
      tags: ['delete', 'arrays'],
    },
  },
  {
    id: 'js-easy-93',
    type: 'bool',
    prompt: 'The `in` operator is `true` for an inherited property.',
    code: '"toString" in {}',
    answer: true,
    query: {
      title: 'in walks the prototype chain',
      syntax: '"toString" in {}  // true',
      explanation:
        'The `in` operator returns true when the property is found on the object or anywhere on its prototype chain. `toString` lives on `Object.prototype`, so `"toString" in {}` is true even though `{}` has no own properties. `Object.hasOwn({}, "toString")` is false. `in` is not a check of the property\'s value.',
      tags: ['in-operator', 'objects'],
    },
  },
  {
    id: 'js-easy-94',
    type: 'bool',
    prompt: '`Object.hasOwn` ignores the prototype chain.',
    code: 'Object.hasOwn({}, "toString")',
    answer: true,
    query: {
      title: 'Object.hasOwn is own properties only',
      syntax: 'Object.hasOwn({}, "toString")  // false\nObject.hasOwn({ a: 1 }, "a")  // true',
      explanation:
        '`Object.hasOwn` returns true only for an own property, whether or not that property is enumerable. `"toString" in {}` is true because of the prototype, but `Object.hasOwn({}, "toString")` is false. It does not invoke an instance method named `hasOwnProperty`, so a shadowed `hasOwnProperty` on the object cannot change the result.',
      tags: ['objects'],
    },
  },
  {
    id: 'js-easy-95',
    type: 'bool',
    prompt: '`Object.keys` skips non-enumerable properties and symbols.',
    code: 'const obj = {};\nObject.defineProperty(obj, "hidden", { value: 1, enumerable: false });\nconst sym = Symbol("s");\nobj[sym] = 2;\nobj.visible = 3;\nObject.keys(obj);',
    answer: true,
    query: {
      title: 'Object.keys lists enumerable string keys',
      syntax: 'Object.keys(obj)  // ["visible"]',
      explanation:
        '`Object.keys` returns an array of the object\'s own enumerable string keys. A non-enumerable property such as "hidden" is left out, and a symbol key is left out, so the list is `["visible"]`. `Object.getOwnPropertyNames` includes non-enumerable string keys, and `Object.getOwnPropertySymbols` lists symbol keys. Inherited enumerable names are omitted too.',
      tags: ['objects', 'object-keys'],
    },
  },
  {
    id: 'js-easy-96',
    type: 'bool',
    prompt: '`Math.max()` with no arguments is `-Infinity`.',
    code: 'Math.max()',
    answer: true,
    query: {
      title: 'Math.max of nothing is -Infinity',
      syntax: 'Math.max()  // -Infinity',
      explanation:
        'With no arguments, `Math.max` returns `-Infinity`, the identity value for maximum, so adding it to a later comparison cannot raise the result. It does not throw, and it does not return 0 or undefined. `Math.min()` with no arguments is the opposite identity, `Infinity`.',
      tags: ['math', 'numbers'],
    },
  },
  {
    id: 'js-easy-97',
    type: 'bool',
    prompt: '`Math.max([1, 2, 3])` is `NaN`, while `Math.max(...[1, 2, 3])` is `3`.',
    code: 'Math.max([1, 2, 3])\nMath.max(...[1, 2, 3])',
    answer: true,
    query: {
      title: 'Math.max does not unpack an array',
      syntax: 'Math.max([1, 2, 3])      // NaN\nMath.max(...[1, 2, 3])   // 3',
      explanation:
        '`Math.max` converts each argument with `ToNumber`. One array argument becomes `ToNumber([1, 2, 3])`, the array stringifies to "1,2,3", and that is NaN. Spreading passes three separate numbers, and the greatest is 3. An empty array is a different input: `Math.max([])` is 0, because an empty array converts to 0.',
      tags: ['math', 'arrays'],
    },
  },
  {
    id: 'js-easy-98',
    type: 'bool',
    prompt: "`'5' + 1` evaluates to `'51'`.",
    code: "'5' + 1",
    answer: true,
    query: {
      title: 'Plus concatenates when either side is a string',
      syntax: "'5' + 1  // \"51\"",
      explanation:
        'If either operand of `+` is a string, both sides are converted to strings and concatenated. The number 1 becomes "1", so the result is the string "51", not the number 6. Subtraction does not have a string mode: `\'5\' - 1` is the number 4. Evaluation is left to right, so `1 + 1 + "5"` is "25".',
      tags: ['coercion', 'operators'],
    },
  },
  {
    id: 'js-easy-99',
    type: 'bool',
    prompt: "`'5' - 1` evaluates to `4`.",
    code: "'5' - 1",
    answer: true,
    query: {
      title: 'Minus always coerces to numbers',
      syntax: "'5' - 1  // 4",
      explanation:
        'The `-` operator converts both operands with `ToNumber` and subtracts. `ToNumber("5")` is 5, so the result is the number 4, not the string "4" and not NaN. `+` is the operator that would have concatenated these operands into "51". A string that is not numeric, such as "5px", becomes NaN under subtraction.',
      tags: ['coercion', 'operators'],
    },
  },
  {
    id: 'js-easy-100',
    type: 'bool',
    prompt: '`true + true` evaluates to `2`.',
    code: 'true + true',
    answer: true,
    query: {
      title: 'Plus numeric-coerces booleans',
      syntax: 'true + true  // 2',
      explanation:
        'Neither operand of `+` is a string, so both are converted with `ToNumber`. `ToNumber(true)` is 1, and `1 + 1` is the number 2, not the boolean true. `true + false` is 1 by the same rule. `Boolean` context is unrelated: this expression never asks whether the sum is truthy.',
      tags: ['coercion', 'boolean'],
    },
  },
];
