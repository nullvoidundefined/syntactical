// Postgres / Easy question bank.
// Foundational but still Postgres-specific, deliberately avoiding generic
// SQL trivia that any relational database would share.

export const postgresEasy = [
  {
    id: 'pg-easy-01',
    type: 'mc',
    prompt: 'What does the `||` operator do between two text values in Postgres?',
    code: "SELECT 'foo' || 'bar';",
    choices: ['Bitwise OR', 'String concatenation', 'Logical OR', 'Array union'],
    answerIndex: 1,
    query: {
      title: 'String concatenation with `||`',
      syntax: "text1 || text2",
      explanation:
        '`||` is the standard-SQL concatenation operator and Postgres implements it directly on text values. Unlike the `CONCAT()` function, which treats a `NULL` argument as an empty string, `||` propagates `NULL`: if either side is `NULL`, the whole expression evaluates to `NULL`.',
      tags: ['strings', 'operators'],
    },
  },
  {
    id: 'pg-easy-02',
    type: 'bool',
    prompt: "`'a' || NULL` evaluates to `'a'` in Postgres.",
    answer: false,
    query: {
      title: '`||` and NULL propagation',
      syntax: "SELECT 'a' || NULL; -- NULL",
      explanation:
        'The `||` operator follows standard NULL-propagation rules: any operand being `NULL` makes the whole expression `NULL`, it does not treat `NULL` as an empty string. If you want NULL-safe concatenation, wrap the nullable side in `COALESCE(col, \'\')` first, or use `CONCAT()`, which does skip NULLs.',
      tags: ['strings', 'null'],
    },
  },
  {
    id: 'pg-easy-03',
    type: 'mc',
    prompt: "What is different about `ILIKE` compared to `LIKE`?",
    code: "SELECT * FROM users WHERE name ILIKE 'jan%';",
    choices: [
      'ILIKE matches case-insensitively; LIKE is case-sensitive',
      'ILIKE only works on integers',
      'ILIKE is faster because it ignores indexes',
      'ILIKE and LIKE are aliases for the exact same behavior',
    ],
    answerIndex: 0,
    query: {
      title: '`ILIKE`: case-insensitive pattern matching',
      syntax: "expr ILIKE pattern",
      explanation:
        '`ILIKE` is a Postgres extension to the standard `LIKE` operator that folds case before comparing, so `\'Jan%\'` and `\'jan%\'` match the same rows. Standard SQL `LIKE` has no case-insensitive variant; other engines simulate it with a case-insensitive collation instead of a dedicated operator.',
      tags: ['strings', 'postgres-extension'],
    },
  },
  {
    id: 'pg-easy-04',
    type: 'mc',
    prompt: 'In psql, which meta-command lists all the tables in the current database?',
    choices: ['\\l', '\\dt', '\\c', '\\d'],
    answerIndex: 1,
    query: {
      title: 'psql: `\\dt`',
      syntax: '\\dt\n\\dt schema.*',
      explanation:
        '`\\dt` prints a summary table of relations of kind "table" in the schemas on your `search_path`. It is distinct from `\\d`, which describes one specific relation in detail, and from `\\l`, which lists databases rather than tables.',
      tags: ['psql', 'tooling'],
    },
  },
  {
    id: 'pg-easy-05',
    type: 'mc',
    prompt: 'Which psql meta-command lists every database on the server you are connected to?',
    choices: ['\\l', '\\dt', '\\dn', '\\du'],
    answerIndex: 0,
    query: {
      title: 'psql: `\\l`',
      syntax: '\\l\n\\list',
      explanation:
        '`\\l` (or the long form `\\list`) queries the cluster-wide catalog of databases, showing each database\u2019s owner, encoding, and access privileges. This is a cluster-level command: it works the same no matter which single database your current session happens to be connected to.',
      tags: ['psql', 'tooling'],
    },
  },
  {
    id: 'pg-easy-06',
    type: 'mc',
    prompt: 'What does the psql meta-command `\\c mydb` do?',
    choices: [
      'Copies a table into mydb',
      'Switches the current psql session to connect to the mydb database',
      'Creates a new database called mydb',
      'Checks mydb for corruption',
    ],
    answerIndex: 1,
    query: {
      title: 'psql: `\\c` to switch databases',
      syntax: '\\c mydb\n\\c mydb myuser',
      explanation:
        'Postgres connections are scoped to a single database: you cannot query across databases in one connection the way you can switch schemas. `\\c dbname` closes the current libpq connection and opens a new one to the named database (optionally as a different user), which is why it prints a fresh "You are now connected to..." message.',
      tags: ['psql', 'tooling'],
    },
  },
  {
    id: 'pg-easy-07',
    type: 'bool',
    prompt: 'Typing `\\q` inside a `psql` session runs `COMMIT` before exiting if a transaction is open.',
    answer: false,
    query: {
      title: 'psql: `\\q` does not commit for you',
      syntax: '\\q',
      explanation:
        '`\\q` is a client-side meta-command that simply closes the connection. If you have an open transaction with uncommitted work, disconnecting causes Postgres to roll it back automatically, exactly as if the connection had dropped for any other reason. `\\q` never issues a `COMMIT` on your behalf.',
      tags: ['psql', 'transactions'],
    },
  },
  {
    id: 'pg-easy-08',
    type: 'mc',
    prompt: 'What does toggling `\\x` in psql change?',
    choices: [
      'It switches result output from tabular rows to one column-per-line "expanded" format',
      'It enables extended SQL syntax',
      'It exports the last query result to a file',
      'It shows the query execution plan',
    ],
    answerIndex: 0,
    query: {
      title: 'psql: `\\x` expanded display',
      syntax: '\\x\n\\x auto',
      explanation:
        'Wide result sets with many columns wrap awkwardly in psql\u2019s default grid layout. `\\x` toggles "expanded display," printing each row as a vertical list of `column | value` pairs instead, which is far more readable for wide rows. `\\x auto` only switches to expanded mode when a row would not fit in the terminal width.',
      tags: ['psql', 'tooling'],
    },
  },
  {
    id: 'pg-easy-09',
    type: 'mc',
    prompt: 'When you create a column with `id SERIAL PRIMARY KEY`, what backing object does Postgres create alongside it?',
    choices: [
      'A trigger that runs on every SELECT',
      'A sequence, by default named `<table>_<column>_seq`',
      'A materialized view',
      'A second hidden table',
    ],
    answerIndex: 1,
    query: {
      title: 'SERIAL and its backing sequence',
      syntax: 'CREATE TABLE t (id SERIAL PRIMARY KEY);\n-- creates sequence t_id_seq',
      explanation:
        'Declaring a `SERIAL` column is shorthand that Postgres expands into a plain integer column plus a dedicated sequence object, conventionally named `<table>_<column>_seq`, wired up as the column\u2019s default via `nextval(...)`. You can query or reset that sequence directly with `SELECT nextval(\'t_id_seq\')` or `ALTER SEQUENCE`.',
      tags: ['schema', 'sequences'],
    },
  },
  {
    id: 'pg-easy-10',
    type: 'bool',
    prompt: '`BIGSERIAL` and `SERIAL` back onto the same underlying integer range.',
    answer: false,
    query: {
      title: 'SERIAL vs BIGSERIAL range',
      syntax: 'id SERIAL       -- integer, up to ~2.1 billion\nid BIGSERIAL    -- bigint, up to ~9.2 quintillion',
      explanation:
        '`SERIAL` expands to a 4-byte `integer` column with a sequence capped at the `integer` range, while `BIGSERIAL` expands to an 8-byte `bigint` column with a sequence capped at the much larger `bigint` range. Picking `SERIAL` for a table expected to grow past ~2.1 billion rows is a common source of "sequence exhausted" incidents.',
      tags: ['schema', 'sequences'],
    },
  },
  {
    id: 'pg-easy-11',
    type: 'mc',
    prompt: 'With `id INT GENERATED ALWAYS AS IDENTITY`, what happens if you try to `INSERT` an explicit value into `id`?',
    code: "CREATE TABLE t (id INT GENERATED ALWAYS AS IDENTITY);\nINSERT INTO t (id) VALUES (5);",
    choices: [
      'It succeeds silently, using 5',
      'It raises an error unless you add OVERRIDING SYSTEM VALUE',
      'Postgres ignores your value and generates the next identity value instead',
      'It converts the table\u2019s identity column back into a plain integer',
    ],
    answerIndex: 1,
    query: {
      title: 'GENERATED ALWAYS AS IDENTITY',
      syntax: 'INSERT INTO t (id) OVERRIDING SYSTEM VALUE VALUES (5);',
      explanation:
        '`GENERATED ALWAYS AS IDENTITY` is stricter than `SERIAL`: it refuses an explicit value in that column by default, which prevents accidental gaps or collisions from application code bypassing the generator. `GENERATED BY DEFAULT AS IDENTITY` behaves more like `SERIAL`, silently accepting an explicit value when one is supplied.',
      tags: ['schema', 'identity'],
    },
  },
  {
    id: 'pg-easy-12',
    type: 'bool',
    prompt: 'An unquoted identifier like `SELECT Name FROM users` is folded to lowercase before Postgres looks it up.',
    answer: true,
    query: {
      title: 'Identifier case folding',
      syntax: 'CREATE TABLE users (Name text);  -- column is actually stored as "name"\nSELECT Name FROM users;         -- works, folds to name\nSELECT "Name" FROM users;       -- fails, no column literally named Name',
      explanation:
        'Postgres folds every unquoted identifier to lowercase during parsing, both when the object is created and when it is referenced, which is why `Name`, `name`, and `NAME` all resolve to the same column. Wrapping an identifier in double quotes disables folding and preserves whatever case you typed, including mixed case.',
      tags: ['identifiers', 'gotchas'],
    },
  },
  {
    id: 'pg-easy-13',
    type: 'mc',
    prompt: 'What does `SELECT "hello"` do if no column named `hello` exists in scope?',
    choices: [
      'Returns the string value "hello"',
      'Raises an error because double quotes denote an identifier, not a string literal',
      'Returns NULL',
      'Silently returns zero rows',
    ],
    answerIndex: 1,
    query: {
      title: 'Double quotes are always identifiers',
      syntax: "SELECT 'hello';   -- the string 'hello'\nSELECT \"hello\";   -- looks for a column/identifier named hello",
      explanation:
        'Postgres reserves double quotes exclusively for quoted identifiers (table names, column names) and single quotes exclusively for string literals; the two are never interchangeable. `SELECT "hello"` is parsed as a reference to a column called `hello`, and fails with a "column does not exist" error if none is in scope.',
      tags: ['identifiers', 'gotchas'],
    },
  },
  {
    id: 'pg-easy-14',
    type: 'bool',
    prompt: 'In Postgres, `VARCHAR(n)` is measurably faster to store and query than `TEXT` for short strings.',
    answer: false,
    query: {
      title: 'TEXT vs VARCHAR(n)',
      syntax: 'name TEXT\nname VARCHAR(255)',
      explanation:
        'Internally, Postgres stores `TEXT` and `VARCHAR(n)` the same way, as a length-prefixed, potentially TOASTed byte sequence; there is no separate fixed-width storage format for `VARCHAR`. The only functional difference is that `VARCHAR(n)` adds a length check that raises an error on insert if the value exceeds `n` characters.',
      tags: ['data-types'],
    },
  },
  {
    id: 'pg-easy-15',
    type: 'mc',
    prompt: "A column declared `CHAR(10)` holding the value 'hi' will actually be stored as:",
    choices: [
      "'hi' exactly, 2 characters",
      "'hi' padded with 8 trailing spaces, 10 characters",
      "An error, because 'hi' is shorter than 10",
      "'hi' truncated to an empty string",
    ],
    answerIndex: 1,
    query: {
      title: 'CHAR(n) blank-padding',
      syntax: "col CHAR(10)\nSELECT length('hi'::char(10)); -- 10",
      explanation:
        '`CHAR(n)` (also called `character(n)`) is a fixed-length type: Postgres right-pads shorter values with spaces up to exactly `n` characters. Comparisons between two `CHAR(n)` values ignore trailing spaces, which frequently surprises people expecting `CHAR` and `TEXT` to compare identically. Most Postgres schemas prefer `TEXT` or `VARCHAR(n)` and avoid `CHAR(n)` for this reason.',
      tags: ['data-types', 'gotchas'],
    },
  },
  {
    id: 'pg-easy-16',
    type: 'mc',
    prompt: 'If you create a table with no schema specified, which schema does it land in by default?',
    choices: ['information_schema', 'pg_catalog', 'public', 'default'],
    answerIndex: 2,
    query: {
      title: 'The default `public` schema',
      syntax: 'CREATE TABLE t (id int);\n-- equivalent to:\nCREATE TABLE public.t (id int);',
      explanation:
        'A freshly created database ships with a schema literally named `public`, and it is the first schema on the default `search_path`, so unqualified `CREATE TABLE` and unqualified references both resolve there unless you have changed the search path. Since Postgres 15, `public` is no longer writable by every role by default, which is a common upgrade surprise.',
      tags: ['schemas'],
    },
  },
  {
    id: 'pg-easy-17',
    type: 'mc',
    prompt: 'What does `SET search_path TO app, public;` change for the current session?',
    choices: [
      'Which database the session is connected to',
      'The order of schemas Postgres searches when you reference an unqualified table or function name',
      'Which user the session is running as',
      'The default transaction isolation level',
    ],
    answerIndex: 1,
    query: {
      title: '`search_path`',
      syntax: 'SET search_path TO app, public;\nSELECT current_schemas(true);',
      explanation:
        'When you write an unqualified name like `orders`, Postgres checks each schema on `search_path`, in order, until it finds a match. Setting `search_path TO app, public` means an `app.orders` table would shadow a `public.orders` table of the same name for that session, without needing to schema-qualify every query.',
      tags: ['schemas'],
    },
  },
  {
    id: 'pg-easy-18',
    type: 'bool',
    prompt: '`DELETE FROM orders WHERE id = 1 RETURNING *;` gives back the row as it looked before the delete.',
    answer: true,
    query: {
      title: 'RETURNING on DELETE',
      syntax: 'DELETE FROM orders WHERE id = 1 RETURNING *;',
      explanation:
        'RETURNING works on `DELETE` just as it does on `INSERT` and `UPDATE`: since the row still exists at the moment the statement computes its result set, the values returned are the row\u2019s last state before removal. This saves a `SELECT ... FOR UPDATE` followed by a separate `DELETE` when your application needs to log or reuse what was removed.',
      tags: ['dml', 'postgres-extension'],
    },
  },
  {
    id: 'pg-easy-19',
    type: 'mc',
    prompt: 'What does `RETURNING *` give you after an `INSERT`?',
    code: "INSERT INTO users (email) VALUES ('a@b.com') RETURNING *;",
    choices: [
      'Only the primary key column',
      'Every column of the newly inserted row',
      'The number of rows inserted',
      'The full query plan used for the insert',
    ],
    answerIndex: 1,
    query: {
      title: 'RETURNING *',
      syntax: 'INSERT ... RETURNING *;\nINSERT ... RETURNING id, email;',
      explanation:
        'RETURNING accepts the same kind of target list as a SELECT: `*` for every column, or an explicit list for just the ones you need. Asking for `*` is convenient during development but explicit columns are usually preferred in application code so an unrelated schema change does not silently alter what your app receives back.',
      tags: ['dml', 'postgres-extension'],
    },
  },
  {
    id: 'pg-easy-20',
    type: 'mc',
    prompt: 'What does `INSERT INTO t (id) VALUES (1) ON CONFLICT DO NOTHING;` do if a row with `id = 1` already exists?',
    choices: [
      'Raises a unique-violation error as usual',
      'Silently skips the insert for that row instead of erroring',
      'Overwrites the existing row with the new values',
      'Deletes the existing row',
    ],
    answerIndex: 1,
    query: {
      title: 'ON CONFLICT DO NOTHING',
      syntax: 'INSERT INTO t (id) VALUES (1)\nON CONFLICT DO NOTHING;',
      explanation:
        'Without `ON CONFLICT`, inserting a duplicate key raises a unique-violation error and aborts the statement (or the whole transaction, if not inside a savepoint). `DO NOTHING` tells Postgres to swallow that specific conflict and move on as if the row was never proposed, which is handy for idempotent "insert if not present" logic.',
      tags: ['upsert', 'postgres-extension'],
    },
  },
  {
    id: 'pg-easy-21',
    type: 'mc',
    prompt: 'What does the `(id)` in `ON CONFLICT (id) DO NOTHING` specify?',
    choices: [
      'The column(s) to update afterward',
      'Which unique or exclusion constraint\u2019s violation should be caught',
      'The columns to return',
      'A filter applied before the insert runs',
    ],
    answerIndex: 1,
    query: {
      title: 'ON CONFLICT target',
      syntax: 'ON CONFLICT (col1, col2) DO NOTHING\nON CONFLICT ON CONSTRAINT constraint_name DO NOTHING',
      explanation:
        'The column list (or `ON CONSTRAINT name`) after `ON CONFLICT` names the specific unique or exclusion constraint whose violation you want to intercept. Without a target, a bare `ON CONFLICT DO NOTHING` catches a violation of any unique or exclusion constraint on the table, which is looser and usually less intentional.',
      tags: ['upsert', 'postgres-extension'],
    },
  },
  {
    id: 'pg-easy-22',
    type: 'mc',
    prompt: 'Which expression builds a Postgres array literal directly in SQL?',
    choices: ["'[1, 2, 3]'", 'ARRAY[1, 2, 3]', '{{1, 2, 3}}', 'LIST(1, 2, 3)'],
    answerIndex: 1,
    query: {
      title: 'The ARRAY[] constructor',
      syntax: "SELECT ARRAY[1, 2, 3];\nSELECT ARRAY['a', 'b'];",
      explanation:
        '`ARRAY[...]` is a Postgres-native constructor that builds a typed array value from a comma-separated element list, inferring the element type automatically. Arrays are a first-class Postgres type most other mainstream relational databases simply do not have; there is no ANSI SQL equivalent syntax.',
      tags: ['arrays', 'postgres-extension'],
    },
  },
  {
    id: 'pg-easy-23',
    type: 'bool',
    prompt: "The text form '{1,2,3}' cast to `int[]` is equivalent to `ARRAY[1,2,3]`.",
    answer: true,
    query: {
      title: 'Array literal text form',
      syntax: "SELECT '{1,2,3}'::int[];\nSELECT ARRAY[1,2,3];",
      explanation:
        'Postgres arrays have two equivalent spellings: the `ARRAY[...]` constructor and a curly-brace text literal that gets cast to an array type, `\'{1,2,3}\'::int[]`. The text form is what you get back when Postgres prints an array (in `psql` output, for instance), and it is also what many client drivers expect when sending array parameters.',
      tags: ['arrays'],
    },
  },
  {
    id: 'pg-easy-24',
    type: 'mc',
    prompt: 'Given `SELECT ARRAY[10, 20, 30][1];`, what does this return?',
    choices: ['10', '20', 'An error, arrays are 0-indexed and index 1 is out of range', 'NULL'],
    answerIndex: 0,
    query: {
      title: 'Arrays are 1-indexed by default',
      syntax: "SELECT (ARRAY[10, 20, 30])[1]; -- 10",
      explanation:
        'Unlike most programming languages, Postgres arrays default to 1-based indexing: the first element is `arr[1]`, not `arr[0]`. Accessing an out-of-range index does not error, it simply returns `NULL`, which is another common source of confusion coming from languages where that would raise an exception.',
      tags: ['arrays', 'gotchas'],
    },
  },
  {
    id: 'pg-easy-25',
    type: 'mc',
    prompt: 'What does `array_length(ARRAY[10, 20, 30], 1)` return?',
    choices: ['0', '1', '3', 'NULL'],
    answerIndex: 2,
    query: {
      title: 'array_length()',
      syntax: 'array_length(anyarray, dimension int) -> int',
      explanation:
        '`array_length` takes the array and a dimension number, since Postgres arrays can be multidimensional; for an ordinary one-dimensional array you pass `1`. For a `NULL` array or an out-of-range dimension it returns `NULL` rather than `0`, so checking "is this array non-empty" usually needs `array_length(arr, 1) > 0`, not a truthiness check.',
      tags: ['arrays'],
    },
  },
  {
    id: 'pg-easy-26',
    type: 'mc',
    prompt: "For `data` typed `jsonb` holding {\"user\": {\"name\": \"Ana\"}}, what does `data -> 'user'` return?",
    choices: [
      "The text value 'Ana'",
      'A jsonb value: {"name": "Ana"}',
      'An error, -> only works on top-level scalars',
      'NULL, because -> requires a numeric index',
    ],
    answerIndex: 1,
    query: {
      title: 'The `->` jsonb operator',
      syntax: "jsonb -> 'key'  -- returns jsonb\njsonb -> 0      -- array element as jsonb",
      explanation:
        '`->` extracts a field or array element and keeps the result as `jsonb`, which is why nesting further operators after it works, e.g. `data -> \'user\' -> \'name\'`. It never converts the result to `text` for you; for that you need the double-arrow variant.',
      tags: ['json', 'operators'],
    },
  },
  {
    id: 'pg-easy-27',
    type: 'mc',
    prompt: "What is the key difference between `data -> 'name'` and `data ->> 'name'` on a jsonb column?",
    choices: [
      '-> is faster but does the same thing as ->>',
      '-> returns a jsonb value; ->> returns the value as text',
      '-> only works on arrays, ->> only works on objects',
      'They are interchangeable aliases',
    ],
    answerIndex: 1,
    query: {
      title: '`->` vs `->>`',
      syntax: "data -> 'name'   -- jsonb, e.g. \"Ana\" with quotes\ndata ->> 'name'  -- text, e.g. Ana with no quotes",
      explanation:
        'Both operators extract a field, but `->` keeps the result as `jsonb` (a JSON string still carries its quotes), while `->>` unwraps it to plain Postgres `text`. You need `->>` whenever you want to compare the value against an ordinary string or feed it into a text function.',
      tags: ['json', 'operators'],
    },
  },
  {
    id: 'pg-easy-28',
    type: 'mc',
    prompt: 'What does the jsonb containment operator `@>` test?',
    code: "SELECT '{\"a\": 1, \"b\": 2}'::jsonb @> '{\"a\": 1}'::jsonb;",
    choices: [
      'Whether the left jsonb value structurally contains the right one',
      'Whether two jsonb values are byte-for-byte identical',
      'String concatenation of two jsonb values',
      'Whether the left value is greater than the right, alphabetically',
    ],
    answerIndex: 0,
    query: {
      title: 'jsonb `@>` containment',
      syntax: "left_jsonb @> right_jsonb -> boolean",
      explanation:
        '`@>` asks "does the left document contain all the key/value pairs (or array elements) on the right?" without requiring an exact match on the rest of the structure. It is the operator a GIN index on a `jsonb` column is built to accelerate, which is why it shows up constantly in Postgres JSON queries.',
      tags: ['json', 'operators'],
    },
  },
  {
    id: 'pg-easy-29',
    type: 'mc',
    prompt: "What does `jsonb_build_object('id', 1, 'active', true)` produce?",
    choices: [
      "The text '1, true'",
      'The jsonb value {"id": 1, "active": true}',
      'An array [1, true]',
      'An error, because the arguments must all share one type',
    ],
    answerIndex: 1,
    query: {
      title: 'jsonb_build_object()',
      syntax: "jsonb_build_object(key1, value1, key2, value2, ...) -> jsonb",
      explanation:
        '`jsonb_build_object` takes an alternating key/value argument list, of any mix of scalar types, and assembles a `jsonb` object from it directly in SQL. It is the common way to shape a row (or several columns) into JSON for an API response without leaving the database.',
      tags: ['json', 'functions'],
    },
  },
  {
    id: 'pg-easy-30',
    type: 'bool',
    prompt: 'Calling `NOW()` twice inside the same transaction can return two different timestamps if enough time passes between the calls.',
    answer: false,
    query: {
      title: 'NOW() is stable per transaction',
      syntax: "BEGIN;\nSELECT NOW(); -- same value\n-- ... time passes ...\nSELECT NOW(); -- still the same value\nCOMMIT;",
      explanation:
        '`NOW()` (and its equivalents `CURRENT_TIMESTAMP`, `transaction_timestamp()`) is marked STABLE and fixed to the time the current transaction began, so every call within one transaction returns the identical value no matter how long the transaction runs. If you need the wall-clock time to advance within a transaction, use `clock_timestamp()` instead.',
      tags: ['date-time', 'transactions'],
    },
  },
  {
    id: 'pg-easy-31',
    type: 'mc',
    prompt: 'What type does `CURRENT_DATE` return, compared to `NOW()`?',
    choices: [
      'CURRENT_DATE returns a date with no time component; NOW() returns a full timestamp with time zone',
      'They return the exact same type and value',
      'CURRENT_DATE includes the time zone offset; NOW() does not',
      'CURRENT_DATE is a function you must call with parentheses; NOW() is not',
    ],
    answerIndex: 0,
    query: {
      title: 'CURRENT_DATE vs NOW()',
      syntax: "SELECT CURRENT_DATE;      -- 2024-05-01\nSELECT NOW();             -- 2024-05-01 14:32:10.123456+00",
      explanation:
        '`CURRENT_DATE` is a date-only value with no clock time at all, while `NOW()` returns a `timestamptz` carrying both the date and the time down to microsecond precision, plus a time zone. Both are stable within a transaction for the same reason: they are pinned to the transaction\u2019s start time, not evaluated fresh per call.',
      tags: ['date-time'],
    },
  },
  {
    id: 'pg-easy-32',
    type: 'bool',
    prompt: '`clock_timestamp()` can return a different value on every call within the same transaction, unlike `NOW()`.',
    answer: true,
    query: {
      title: 'clock_timestamp() vs NOW()',
      syntax: 'SELECT clock_timestamp(); -- advances on every call, even mid-transaction',
      explanation:
        '`clock_timestamp()` is VOLATILE and reads the actual system clock at the moment it runs, so successive calls inside one long transaction (or even one statement processing many rows) can each return a slightly later value. This makes it useful for measuring elapsed wall-clock time, which `NOW()`, frozen at transaction start, cannot do.',
      tags: ['date-time'],
    },
  },
  {
    id: 'pg-easy-33',
    type: 'mc',
    prompt: 'What does `COALESCE(discount, 0)` return when `discount` is `NULL`?',
    choices: ['NULL', '0', 'An error', 'An empty string'],
    answerIndex: 1,
    query: {
      title: 'COALESCE for default values',
      syntax: 'COALESCE(nullable_col, fallback_value)',
      explanation:
        '`COALESCE` scans its arguments left to right and returns the first one that is not `NULL`. Using a literal like `0` as the second argument is the standard idiom for "treat a missing value as a default" directly in a query, without needing a `CASE WHEN col IS NULL THEN 0 ELSE col END` expression.',
      tags: ['null', 'functions'],
    },
  },
  {
    id: 'pg-easy-34',
    type: 'mc',
    prompt: 'What does `COALESCE(a, b, c, d)` return when `a` and `b` are both `NULL` but `c` is not?',
    choices: ['NULL', 'The value of a', 'The value of c', 'The value of d'],
    answerIndex: 2,
    query: {
      title: 'COALESCE with more than two arguments',
      syntax: 'COALESCE(val1, val2, val3, ..., valN)',
      explanation:
        'COALESCE is not limited to two arguments: it accepts any number and evaluates them in order, short-circuiting at the first non-NULL one and never evaluating the arguments after it. This makes it useful for a fallback chain, like "prefer the user\u2019s nickname, then their first name, then a generic placeholder."',
      tags: ['null', 'functions'],
    },
  },
  {
    id: 'pg-easy-35',
    type: 'mc',
    prompt: 'What problem does `SELECT DISTINCT ON (customer_id) *` solve that plain `DISTINCT` cannot?',
    code: 'SELECT DISTINCT ON (customer_id) *\nFROM orders\nORDER BY customer_id, created_at DESC;',
    choices: [
      'It removes duplicate rows across all columns, same as DISTINCT',
      'It picks one row per customer_id (the first, per ORDER BY), keeping every column from that row',
      'It counts distinct customer_id values',
      'It sorts customer_id values alphabetically',
    ],
    answerIndex: 1,
    query: {
      title: 'DISTINCT ON',
      syntax: "SELECT DISTINCT ON (expr) ... ORDER BY expr, tiebreaker ...;",
      explanation:
        '`DISTINCT ON` is a Postgres-only extension that keeps only the first row for each distinct value of the given expression(s), where "first" is defined by the `ORDER BY` clause (which must start with the same expression). Plain `DISTINCT` only dedupes identical whole rows and has no concept of "one row per group, picked by a rule."',
      tags: ['distinct', 'postgres-extension'],
    },
  },
  {
    id: 'pg-easy-36',
    type: 'bool',
    prompt: 'A `DISTINCT ON (col)` query without an `ORDER BY` starting with `col` is guaranteed to pick a deterministic row per group.',
    answer: false,
    query: {
      title: 'DISTINCT ON requires a matching ORDER BY',
      syntax: 'SELECT DISTINCT ON (customer_id) *\nFROM orders\nORDER BY customer_id, created_at DESC;',
      explanation:
        'DISTINCT ON keeps the first row per group according to whatever order the rows arrive in; without an ORDER BY that leads with the same expression(s), that order is whatever the planner happens to produce, which is not guaranteed and can change between runs. The ORDER BY is not optional decoration here, it is what makes "first row" meaningful.',
      tags: ['distinct', 'gotchas'],
    },
  },
  {
    id: 'pg-easy-37',
    type: 'mc',
    prompt: 'Which of these can you insert directly into a boolean column without casting?',
    choices: ['The bare integer 1', "The string 'yes'", "The string 'maybe'", "A null string ''"],
    answerIndex: 1,
    query: {
      title: 'Boolean input literals',
      syntax: "col boolean\nINSERT ... VALUES ('yes');   -- true\nINSERT ... VALUES ('t');     -- true\nINSERT ... VALUES (1);       -- error: integer vs boolean",
      explanation:
        'Postgres\u2019s boolean input parser accepts several text spellings: `\'true\'`/`\'false\'`, `\'t\'`/`\'f\'`, `\'yes\'`/`\'no\'`, `\'y\'`/`\'n\'`, and `\'1\'`/`\'0\'` as strings. A bare, unquoted integer like `1` is a different type entirely and Postgres will not implicitly cast it, raising "column is of type boolean but expression is of type integer" instead.',
      tags: ['data-types', 'gotchas'],
    },
  },
  {
    id: 'pg-easy-38',
    type: 'bool',
    prompt: 'The keywords `TRUE` and `FALSE` in Postgres are case-insensitive.',
    answer: true,
    query: {
      title: 'TRUE/FALSE keyword casing',
      syntax: 'SELECT true, TRUE, True; -- all equivalent',
      explanation:
        'Like all unquoted SQL keywords, `TRUE` and `FALSE` are case-insensitive in Postgres, so `true`, `True`, and `TRUE` all parse identically as the boolean literal. This is different from a quoted string like `\'t\'`, which does go through the boolean type\u2019s text-parsing rules rather than being treated as a keyword.',
      tags: ['data-types'],
    },
  },
  {
    id: 'pg-easy-39',
    type: 'mc',
    prompt: 'What does a `CHECK` constraint enforce?',
    code: 'CREATE TABLE products (\n  price NUMERIC CHECK (price > 0)\n);',
    choices: [
      'That the column cannot be NULL',
      'That every row must satisfy the given boolean expression before it is allowed to commit',
      'That the column is unique',
      'That the table has at least one row',
    ],
    answerIndex: 1,
    query: {
      title: 'CHECK constraints',
      syntax: 'CREATE TABLE t (col type CHECK (boolean_expression));\nALTER TABLE t ADD CONSTRAINT name CHECK (expr);',
      explanation:
        'A `CHECK` constraint attaches an arbitrary boolean expression to a table; any `INSERT` or `UPDATE` producing a row where the expression evaluates to `false` is rejected (a `NULL` result is treated as passing, not failing). This pushes simple business-rule validation into the database itself, rather than relying only on application-layer checks.',
      tags: ['constraints'],
    },
  },
  {
    id: 'pg-easy-40',
    type: 'bool',
    prompt: 'Plain `EXPLAIN` (without ANALYZE) actually executes the query to measure its real runtime.',
    answer: false,
    query: {
      title: 'EXPLAIN does not run the query',
      syntax: 'EXPLAIN SELECT * FROM orders WHERE customer_id = 5;',
      explanation:
        'Plain `EXPLAIN` asks the planner to produce and print its chosen plan, along with estimated costs and row counts, without ever executing the statement. This makes it safe to run on a write statement (`EXPLAIN DELETE ...`) purely to see what plan would be used, since nothing actually happens to the data.',
      tags: ['explain'],
    },
  },
  {
    id: 'pg-easy-41',
    type: 'mc',
    prompt: 'Which view is part of the SQL-standard `information_schema`, portable across databases in spirit, rather than being Postgres-specific?',
    choices: ['pg_stat_activity', 'information_schema.columns', 'pg_class', 'pg_indexes'],
    answerIndex: 1,
    query: {
      title: 'information_schema vs pg_catalog',
      syntax: "SELECT column_name, data_type\nFROM information_schema.columns\nWHERE table_name = 'orders';",
      explanation:
        '`information_schema` is defined by the SQL standard, so `information_schema.columns` (and `.tables`, `.table_constraints`, etc.) look and behave similarly across Postgres, MySQL, and SQL Server. Postgres\u2019s own `pg_catalog` schema (`pg_class`, `pg_indexes`, `pg_stat_activity`) is native and exposes far more detail, but is not portable to other engines.',
      tags: ['catalog'],
    },
  },
  {
    id: 'pg-easy-42',
    type: 'mc',
    prompt: 'What advantage does `pg_catalog.pg_tables` have over `information_schema.tables`?',
    choices: [
      'It is faster to type',
      'It exposes Postgres-specific detail like the tablespace and whether row security is enabled, which the standard view omits',
      'It works across multiple database engines',
      'It shows only temporary tables',
    ],
    answerIndex: 1,
    query: {
      title: 'pg_tables: the Postgres-native catalog view',
      syntax: "SELECT * FROM pg_catalog.pg_tables WHERE schemaname = 'public';",
      explanation:
        '`information_schema.tables` sticks to columns the SQL standard defines, so it cannot expose Postgres-only concepts. `pg_catalog.pg_tables` is a Postgres-native view over the internal catalog and includes fields like `tablespace` and `rowsecurity` that have no standard equivalent, at the cost of not existing on other database engines.',
      tags: ['catalog'],
    },
  },
  {
    id: 'pg-easy-43',
    type: 'mc',
    prompt: 'Which psql meta-command lists the schemas in the current database?',
    choices: ['\\dn', '\\dt', '\\df', '\\dv'],
    answerIndex: 0,
    query: {
      title: 'psql: `\\dn`',
      syntax: '\\dn',
      explanation:
        '`\\dn` ("describe namespaces") lists every schema in the current database along with its owner. It is the schema-level counterpart to `\\dt` (tables), `\\df` (functions), and `\\dv` (views), all of which follow the same `\\d<letter>` naming convention.',
      tags: ['psql', 'tooling'],
    },
  },
  {
    id: 'pg-easy-44',
    type: 'mc',
    prompt: 'Which psql meta-command lists user-defined functions?',
    choices: ['\\dn', '\\df', '\\dv', '\\du'],
    answerIndex: 1,
    query: {
      title: 'psql: `\\df`',
      syntax: '\\df\n\\df schema.*',
      explanation:
        '`\\df` prints the functions visible on your `search_path`, including their argument and return types. Like the other `\\d`-family commands, it accepts a pattern argument to filter by schema or name, e.g. `\\df app.*` to see only functions in the `app` schema.',
      tags: ['psql', 'tooling'],
    },
  },
  {
    id: 'pg-easy-45',
    type: 'bool',
    prompt: 'Typing `\\timing` in psql shows how long each query took to execute after every result.',
    answer: true,
    query: {
      title: 'psql: `\\timing`',
      syntax: '\\timing\nSELECT 1;\n-- Time: 0.421 ms',
      explanation:
        '`\\timing` is a toggle: once turned on, psql prints a "Time: N ms" line after every statement\u2019s result, measured client-side around the round trip. It is a quick way to eyeball query latency during interactive work without reaching for `EXPLAIN ANALYZE`.',
      tags: ['psql', 'tooling'],
    },
  },
  {
    id: 'pg-easy-46',
    type: 'mc',
    prompt: 'What does the function `current_database()` return?',
    choices: [
      'The name of the database the current session is connected to',
      'A list of all databases on the server',
      'The current schema',
      'The size of the current database in bytes',
    ],
    answerIndex: 0,
    query: {
      title: 'current_database()',
      syntax: 'SELECT current_database();',
      explanation:
        'Because a single connection is always scoped to exactly one database, `current_database()` has no arguments and simply reports that database\u2019s name. It is commonly used in monitoring queries or multi-tenant setups where the same query text runs against several differently named databases.',
      tags: ['functions', 'introspection'],
    },
  },
  {
    id: 'pg-easy-47',
    type: 'mc',
    prompt: 'What does `current_user` return inside a session?',
    choices: [
      'The operating-system user running the Postgres server process',
      'The role name the current session is authenticated and executing as',
      'The database owner, regardless of who is connected',
      'The IP address of the client',
    ],
    answerIndex: 1,
    query: {
      title: 'current_user',
      syntax: 'SELECT current_user;\nSELECT session_user;',
      explanation:
        '`current_user` reflects the role currently in effect for privilege checks, which can change mid-session if you run `SET ROLE` or `SET SESSION AUTHORIZATION`. `session_user` instead always reports the role that originally authenticated the connection, so the two can diverge after a role switch.',
      tags: ['functions', 'roles'],
    },
  },
  {
    id: 'pg-easy-48',
    type: 'mc',
    prompt: 'What does `SELECT version();` return?',
    choices: [
      'The version of your SQL client only',
      'A string describing the Postgres server version, build platform, and compiler',
      'The current schema version number',
      'The highest supported SQL standard year',
    ],
    answerIndex: 1,
    query: {
      title: 'version()',
      syntax: "SELECT version();\n-- PostgreSQL 16.2 on x86_64-pc-linux-gnu, compiled by gcc ..., 64-bit",
      explanation:
        '`version()` returns one descriptive string covering the server\u2019s Postgres release, target platform, and compiler, useful for quickly confirming what you are actually connected to. For just the numeric version in a script-friendly form, `SHOW server_version;` or `current_setting(\'server_version_num\')` is easier to parse.',
      tags: ['functions', 'introspection'],
    },
  },
  {
    id: 'pg-easy-49',
    type: 'mc',
    prompt: 'What is the default TCP port a Postgres server listens on?',
    choices: ['3306', '1433', '5432', '5433'],
    answerIndex: 2,
    query: {
      title: 'Default Postgres port',
      syntax: 'psql -h localhost -p 5432 -U postgres',
      explanation:
        'Postgres defaults to port 5432, which is why connection strings and client tools omit it and only specify a port when connecting to a non-default instance (a second cluster on the same machine, for example, is often configured on 5433). MySQL\u2019s default (3306) and SQL Server\u2019s (1433) are different conventions entirely.',
      tags: ['tooling'],
    },
  },
  {
    id: 'pg-easy-50',
    type: 'mc',
    prompt: "What does the `::` operator do in `SELECT '123'::int;`?",
    choices: [
      'Namespace qualification, like schema::table',
      "Type casting, equivalent to CAST('123' AS int)",
      'String repetition',
      'Array slicing',
    ],
    answerIndex: 1,
    query: {
      title: 'The `::` cast shorthand',
      syntax: "SELECT '123'::int;\nSELECT '123' :: int;      -- whitespace is fine\nSELECT CAST('123' AS int); -- equivalent, standard form",
      explanation:
        '`::` is Postgres\u2019s own shorthand cast operator, syntactic sugar for the ANSI-standard `CAST(expr AS type)` form, both compiling down to the exact same cast internally. It reads left-to-right and binds tightly, so it is common to see chained casts like `data->>\'age\'::int` when pulling a typed value out of jsonb.',
      tags: ['casting', 'postgres-extension'],
    },
  },
  {
    id: 'pg-easy-51',
    type: 'bool',
    prompt: "`CAST('123' AS integer)` and `'123'::integer` always produce identical results in Postgres.",
    answer: true,
    query: {
      title: 'CAST() and :: are equivalent',
      syntax: "SELECT CAST('123' AS integer) = '123'::integer; -- true",
      explanation:
        'The `::` operator is not a separate casting mechanism, it is parsed as an alternate spelling of the same `CAST` expression the SQL standard defines. Either form invokes the identical cast function under the hood, so they are interchangeable everywhere a cast is legal; `::` is simply more concise and more idiomatic in Postgres-flavored SQL.',
      tags: ['casting'],
    },
  },
  {
    id: 'pg-easy-52',
    type: 'mc',
    prompt: "What type does the literal `INTERVAL '1 day'` produce?",
    choices: [
      'A plain integer representing seconds',
      'A dedicated interval type representing a span of time',
      'A timestamp one day in the future',
      'A text string that must be parsed manually',
    ],
    answerIndex: 1,
    query: {
      title: 'The INTERVAL type',
      syntax: "SELECT INTERVAL '1 day';\nSELECT INTERVAL '3 hours 30 minutes';",
      explanation:
        '`interval` is its own Postgres data type representing a duration (internally stored as separate months, days, and microseconds components, not just a total number of seconds), independent of any fixed calendar date. It parses flexible human-readable text like `\'1 day\'`, `\'3 hours 30 minutes\'`, or `\'2 years\'` directly.',
      tags: ['date-time', 'data-types'],
    },
  },
  {
    id: 'pg-easy-53',
    type: 'mc',
    prompt: "What does `SELECT NOW() + INTERVAL '7 days';` compute?",
    choices: [
      'A syntax error, you cannot add an interval to a timestamp',
      'A timestamp exactly 7 days after the current transaction time',
      'The number 7',
      'An interval representing 7 days from an unspecified point',
    ],
    answerIndex: 1,
    query: {
      title: 'Adding an interval to a timestamp',
      syntax: "SELECT NOW() + INTERVAL '7 days';\nSELECT CURRENT_DATE - INTERVAL '1 month';",
      explanation:
        'Postgres overloads `+` and `-` between a `timestamp`/`date` and an `interval` to shift the date forward or backward by that span, handling month-length and leap-year differences correctly (adding one month to Jan 31 lands on Feb 28/29, not an invalid date). This reads far more naturally than computing a raw number of seconds yourself.',
      tags: ['date-time'],
    },
  },
  {
    id: 'pg-easy-54',
    type: 'mc',
    prompt: "What does `AGE(timestamp '2024-01-01', timestamp '2023-01-01')` return?",
    choices: ['The number 365', 'An interval, e.g. "1 year"', 'A boolean', 'A date'],
    answerIndex: 1,
    query: {
      title: 'AGE()',
      syntax: "AGE(timestamp, timestamp) -> interval\nAGE(timestamp) -> interval  -- compared against today",
      explanation:
        '`AGE()` subtracts two timestamps but, unlike plain `-`, expresses the result in calendar-aware units like years and months rather than a raw number of days, which reads far more naturally for something like "how old is this account." Called with a single argument, it compares against the current transaction date.',
      tags: ['date-time', 'functions'],
    },
  },
  {
    id: 'pg-easy-55',
    type: 'mc',
    prompt: 'What does `SELECT * FROM generate_series(1, 5);` produce?',
    choices: [
      'A single row containing the array [1,2,3,4,5]',
      'Five rows, one per integer from 1 to 5',
      'An error, generate_series only works with dates',
      'One row containing the number 5',
    ],
    answerIndex: 1,
    query: {
      title: 'generate_series()',
      syntax: 'generate_series(start, stop [, step]) -> setof int\ngenerate_series(start_ts, stop_ts, interval) -> setof timestamp',
      explanation:
        '`generate_series` is a set-returning function: called in a FROM clause, it produces one row per value in the requested range, which is a convenient way to generate a calendar of dates, fill gaps in a report, or build test data without a real table backing it.',
      tags: ['functions', 'set-returning'],
    },
  },
  {
    id: 'pg-easy-56',
    type: 'mc',
    prompt: "What does `STRING_AGG(name, ', ')` do when used as an aggregate?",
    code: "SELECT STRING_AGG(name, ', ') FROM tags;",
    choices: [
      'Counts the number of distinct names',
      'Concatenates every name in the group into one string, separated by the given delimiter',
      'Sorts the names alphabetically without combining them',
      'Returns only the first name in the group',
    ],
    answerIndex: 1,
    query: {
      title: 'STRING_AGG()',
      syntax: "STRING_AGG(expression, delimiter [ORDER BY ...])",
      explanation:
        '`STRING_AGG` collapses many rows\u2019 values into a single delimited string, similar to MySQL\u2019s differently-named `GROUP_CONCAT`. You can add an `ORDER BY` inside the aggregate call itself to control the order values appear in the joined string, independent of the query\u2019s outer `ORDER BY`.',
      tags: ['aggregates', 'strings'],
    },
  },
  {
    id: 'pg-easy-57',
    type: 'mc',
    prompt: "What does `regexp_replace('2024-05-01', '-', '/', 'g')` return?",
    choices: ["'2024/05-01'", "'2024/05/01'", "'2024-05-01'", 'An error'],
    answerIndex: 1,
    query: {
      title: 'regexp_replace()',
      syntax: "regexp_replace(source, pattern, replacement [, flags])",
      explanation:
        '`regexp_replace` substitutes text matching a POSIX regular expression, and by default only replaces the first match; the `\'g\'` flag makes it replace every match instead, which is why all the dashes turn into slashes here. Postgres\u2019s regex support is built on POSIX syntax with its own extensions, not PCRE, so some patterns from other languages need adjusting.',
      tags: ['strings', 'functions'],
    },
  },
  {
    id: 'pg-easy-58',
    type: 'mc',
    prompt: "What does `name ~* '^jan'` test?",
    choices: [
      'Whether name starts with "jan", case-sensitively',
      'Whether name starts with "jan", case-insensitively',
      'Whether name equals exactly "jan"',
      'Whether name does not contain "jan"',
    ],
    answerIndex: 1,
    query: {
      title: 'The `~*` case-insensitive regex operator',
      syntax: "col ~  pattern   -- case-sensitive regex match\ncol ~* pattern   -- case-insensitive regex match\ncol !~ pattern   -- does not match",
      explanation:
        '`~` and `~*` are Postgres operator syntax for POSIX regular expression matching, with the star variant folding case before comparing. This gives you full regex power (anchors, character classes, quantifiers) in a `WHERE` clause, well beyond what `LIKE`/`ILIKE`\u2019s wildcard-only patterns can express.',
      tags: ['strings', 'operators'],
    },
  },
  {
    id: 'pg-easy-59',
    type: 'bool',
    prompt: 'Postgres supports both `LIMIT 10` and the SQL-standard `FETCH FIRST 10 ROWS ONLY` to cap a result set.',
    answer: true,
    query: {
      title: 'LIMIT vs FETCH FIRST',
      syntax: 'SELECT * FROM t ORDER BY id LIMIT 10;\nSELECT * FROM t ORDER BY id FETCH FIRST 10 ROWS ONLY;',
      explanation:
        '`LIMIT`/`OFFSET` is the traditional Postgres (and MySQL) idiom, while `FETCH FIRST n ROWS ONLY` is the ANSI SQL:2008 standard phrasing; Postgres accepts both and they behave the same way. Reaching for the standard form can matter for portability if the same query needs to run unmodified against, say, Oracle or DB2.',
      tags: ['querying'],
    },
  },
  {
    id: 'pg-easy-60',
    type: 'mc',
    prompt: '`a IS DISTINCT FROM b` is preferred over `a <> b` when either side might be `NULL`. Why?',
    choices: [
      'IS DISTINCT FROM is faster to execute',
      'IS DISTINCT FROM treats two NULLs as equal and a NULL vs a value as distinct, instead of returning NULL for either case',
      'They are exactly identical in every case',
      'IS DISTINCT FROM only works on numeric types',
    ],
    answerIndex: 1,
    query: {
      title: 'IS [NOT] DISTINCT FROM',
      syntax: "NULL <> NULL              -- NULL (unknown)\nNULL IS DISTINCT FROM NULL -- false\n1 IS DISTINCT FROM NULL    -- true",
      explanation:
        'Ordinary `<>` follows three-valued logic: comparing anything against `NULL`, including another `NULL`, yields `NULL` rather than `true` or `false`, which silently drops rows from a `WHERE` clause. `IS DISTINCT FROM` treats `NULL` as a comparable value, so it always returns a definite `true`/`false`, making it the safe choice for change-detection logic.',
      tags: ['null', 'operators'],
    },
  },
  {
    id: 'pg-easy-61',
    type: 'mc',
    prompt: "What does `CREATE TYPE mood AS ENUM ('sad', 'ok', 'happy');` create?",
    choices: [
      'A CHECK constraint template you must attach manually to every column',
      'A new named type whose values are restricted to the listed labels, usable as a column type',
      'A lookup table populated with those three rows',
      'A trigger that validates mood values',
    ],
    answerIndex: 1,
    query: {
      title: 'CREATE TYPE ... AS ENUM',
      syntax: "CREATE TYPE mood AS ENUM ('sad', 'ok', 'happy');\nCREATE TABLE t (current_mood mood);",
      explanation:
        'Postgres lets you define a genuine enumerated type once, with `CREATE TYPE ... AS ENUM`, and then reuse it across any number of columns or tables, with values compared and sorted by their declared list order rather than alphabetically. This is a distinct feature from a `CHECK (col IN (...))` constraint, which only guards one column at a time and has no shared, sortable type identity.',
      tags: ['data-types', 'postgres-extension'],
    },
  },
  {
    id: 'pg-easy-62',
    type: 'mc',
    prompt: 'What does `CREATE TYPE point_2d AS (x int, y int);` define?',
    choices: [
      'A view with columns x and y',
      'A composite (structured) type bundling named, typed fields together',
      'A function returning a point',
      'A table alias',
    ],
    answerIndex: 1,
    query: {
      title: 'Composite types',
      syntax: "CREATE TYPE point_2d AS (x int, y int);\nSELECT (1, 2)::point_2d;",
      explanation:
        'A composite type groups several named fields into one reusable structured type, similar to a lightweight struct, that you can use as a column type, a function\u2019s return type, or a cast target. Every table also implicitly has a composite type matching its own row shape, which is why row-level casts like `SELECT t.*::text` work.',
      tags: ['data-types', 'postgres-extension'],
    },
  },
  {
    id: 'pg-easy-63',
    type: 'mc',
    prompt: 'What does `CREATE DOMAIN positive_int AS integer CHECK (VALUE > 0);` let you do?',
    choices: [
      'Nothing new, it is identical to using integer directly',
      'Define a reusable type that behaves like integer but automatically enforces the CHECK on every column that uses it',
      'Restrict the domain to a single specific value',
      'Create a new network domain for DNS purposes',
    ],
    answerIndex: 1,
    query: {
      title: 'CREATE DOMAIN',
      syntax: "CREATE DOMAIN positive_int AS integer CHECK (VALUE > 0);\nCREATE TABLE t (qty positive_int);",
      explanation:
        'A domain wraps a base type with extra constraints (here, a `CHECK` referencing the special `VALUE` keyword) and packages that as one named type you can reuse across many tables. It centralizes the validation rule in one place instead of copy-pasting the same `CHECK (qty > 0)` onto every table that has a quantity column.',
      tags: ['data-types', 'postgres-extension'],
    },
  },
  {
    id: 'pg-easy-64',
    type: 'bool',
    prompt: '`\\copy` and `COPY` always run in exactly the same place: on the Postgres server.',
    answer: false,
    query: {
      title: '`\\copy` (client-side) vs `COPY` (server-side)',
      syntax: "\\copy t FROM '/local/path/data.csv' CSV;    -- reads from the psql client machine\nCOPY t FROM '/server/path/data.csv' CSV;   -- reads from the server's filesystem",
      explanation:
        'Plain SQL `COPY` reads or writes a file on the Postgres server\u2019s own filesystem and requires server-level file permissions, which is a nonstarter for a managed/hosted database you cannot SSH into. `\\copy` is a psql-only wrapper that streams the data through the client connection instead, letting you load a file that only exists on your local machine.',
      tags: ['psql', 'bulk-load'],
    },
  },
  {
    id: 'pg-easy-65',
    type: 'mc',
    prompt: 'Why is `COPY` typically much faster than issuing many individual `INSERT` statements for the same rows?',
    choices: [
      'It skips all constraint checking',
      'It streams rows in bulk through a specialized fast path instead of parsing and planning one statement per row',
      'It only works on empty tables',
      'It disables the primary key temporarily',
    ],
    answerIndex: 1,
    query: {
      title: 'COPY for bulk loading',
      syntax: "COPY t (col1, col2) FROM STDIN WITH (FORMAT csv);",
      explanation:
        'Each individual `INSERT` pays the cost of parsing, planning, and a network round trip. `COPY` instead streams many rows through a dedicated bulk-loading code path in one pass, still enforcing constraints and firing row-level triggers as it goes, which is why it is the standard tool for loading CSV exports rather than generating thousands of INSERT statements.',
      tags: ['bulk-load'],
    },
  },
  {
    id: 'pg-easy-66',
    type: 'mc',
    prompt: 'What does `pg_typeof(3.14)` return?',
    choices: ["'float4'", "'numeric'", "'double precision'", "'int'"],
    answerIndex: 1,
    query: {
      title: 'pg_typeof()',
      syntax: "SELECT pg_typeof(3.14);   -- numeric\nSELECT pg_typeof(3.14::real); -- real",
      explanation:
        '`pg_typeof` reports the actual resolved data type Postgres assigned to any expression, which is a quick way to confirm what type a literal, column, or function result really is without guessing. An unqualified decimal literal like `3.14` defaults to `numeric`, not a floating-point type, unless you explicitly cast it.',
      tags: ['functions', 'introspection'],
    },
  },
  {
    id: 'pg-easy-67',
    type: 'mc',
    prompt: "What does `SELECT nextval('my_seq');` do to the sequence `my_seq`?",
    choices: [
      'Only previews the next value without changing sequence state',
      'Advances the sequence and returns the new current value',
      'Resets the sequence back to 1',
      'Deletes the sequence',
    ],
    answerIndex: 1,
    query: {
      title: 'Sequences: nextval() and currval()',
      syntax: "CREATE SEQUENCE my_seq;\nSELECT nextval('my_seq');  -- advances and returns\nSELECT currval('my_seq');  -- last value this session got, no advance",
      explanation:
        'Sequences are independent, transaction-spanning counter objects. `nextval()` has a side effect: it permanently advances the counter (even if the surrounding transaction later rolls back, which is intentional, so concurrent transactions never collide on the same value) and returns the new value. `currval()` just re-reads the value your own session last obtained, without advancing anything.',
      tags: ['sequences'],
    },
  },
  {
    id: 'pg-easy-68',
    type: 'bool',
    prompt: "A sequence value obtained with `nextval()` is given back to the sequence if the transaction that called it rolls back.",
    answer: false,
    query: {
      title: 'Sequences are not transactional',
      syntax: "BEGIN;\nSELECT nextval('my_seq'); -- returns 5\nROLLBACK;\nSELECT nextval('my_seq'); -- returns 6, not 5 again",
      explanation:
        'Sequence advancement is deliberately exempt from transactional rollback: if it were not, two concurrent transactions could both be handed the same "next" value while waiting to see which one commits, defeating the entire purpose of a sequence. This is why gaps in a `SERIAL` primary key after aborted inserts are completely normal, not a bug.',
      tags: ['sequences', 'transactions'],
    },
  },
  {
    id: 'pg-easy-69',
    type: 'mc',
    prompt: 'What does `CREATE TABLE managers () INHERITS (employees);` set up?',
    choices: [
      'A foreign key from managers to employees',
      'A child table that automatically includes every column of employees and appears in queries against employees unless excluded with ONLY',
      'A view that unions managers and employees',
      'A trigger that copies rows between the two tables',
    ],
    answerIndex: 1,
    query: {
      title: 'Table inheritance',
      syntax: 'CREATE TABLE employees (id int, name text);\nCREATE TABLE managers (bonus numeric) INHERITS (employees);\nSELECT * FROM employees;        -- includes managers rows too\nSELECT * FROM ONLY employees;   -- excludes managers rows',
      explanation:
        'Postgres table inheritance is a genuine, native feature (distinct from foreign keys or views) that lets a child table automatically pick up its parent\u2019s columns and be included in queries against the parent by default. It predates and partly overlaps with declarative partitioning, but inheritance is more general and does not require the child ranges to be non-overlapping.',
      tags: ['schema', 'postgres-extension'],
    },
  },
  {
    id: 'pg-easy-70',
    type: 'mc',
    prompt: 'What does `created_at TIMESTAMPTZ DEFAULT now()` set up?',
    choices: [
      'A CHECK constraint requiring a timestamp',
      'A column default computed by calling the now() function at insert time, if no value is supplied',
      'An automatic trigger that updates the column on every UPDATE',
      'A column that is always NULL until manually set',
    ],
    answerIndex: 1,
    query: {
      title: 'Function-based column defaults',
      syntax: 'created_at TIMESTAMPTZ DEFAULT now()\nid UUID DEFAULT gen_random_uuid()',
      explanation:
        'A column `DEFAULT` is not limited to a constant, it can be any expression, including a function call, evaluated fresh for each row that omits an explicit value on insert. `DEFAULT now()` is the standard way to stamp a "created at" column without every application code path having to remember to set it.',
      tags: ['schema', 'defaults'],
    },
  },
  {
    id: 'pg-easy-71',
    type: 'mc',
    prompt: 'What does `gen_random_uuid()` return?',
    choices: [
      'A random integer',
      'A randomly generated UUID value',
      'The UUID of the current session',
      'A deterministic UUID based on the table name',
    ],
    answerIndex: 1,
    query: {
      title: 'gen_random_uuid()',
      syntax: "id UUID PRIMARY KEY DEFAULT gen_random_uuid();",
      explanation:
        '`gen_random_uuid()` produces a random version-4 UUID and, as of Postgres 13, is built into core (`pgcrypto`\u2019s older `gen_random_uuid()` and the `uuid-ossp` extension\u2019s `uuid_generate_v4()` served the same purpose before that). UUID primary keys avoid the "guessable sequential id" and cross-database-merge problems a `SERIAL` key can have, at the cost of larger index entries.',
      tags: ['data-types', 'functions'],
    },
  },
  {
    id: 'pg-easy-72',
    type: 'mc',
    prompt: 'What does `CREATE EXTENSION IF NOT EXISTS pgcrypto;` do?',
    choices: [
      'Creates a new database',
      'Loads a bundled, optional set of extra types/functions/operators into the current database',
      'Encrypts every existing table automatically',
      'Installs a new version of Postgres itself',
    ],
    answerIndex: 1,
    query: {
      title: 'CREATE EXTENSION',
      syntax: 'CREATE EXTENSION IF NOT EXISTS pgcrypto;\nCREATE EXTENSION IF NOT EXISTS pg_trgm;',
      explanation:
        'Postgres ships with a large catalog of optional extensions (cryptographic functions, trigram text search, UUID generators, and more) that are not enabled by default; `CREATE EXTENSION` registers one into the current database, exposing its functions/types/operators. This modular design keeps a fresh database\u2019s catalog small until you explicitly opt into what you need.',
      tags: ['extensions'],
    },
  },
  {
    id: 'pg-easy-73',
    type: 'mc',
    prompt: 'Which psql meta-command lists the extensions currently installed in the database?',
    choices: ['\\dx', '\\df', '\\dn', '\\dt'],
    answerIndex: 0,
    query: {
      title: 'psql: `\\dx`',
      syntax: '\\dx',
      explanation:
        '`\\dx` lists every extension registered in the current database along with its installed version, which is a quick sanity check before relying on an extension-provided function like `gen_random_uuid()` or `similarity()` in a query.',
      tags: ['psql', 'tooling'],
    },
  },
  {
    id: 'pg-easy-74',
    type: 'mc',
    prompt: 'What problem do dollar-quoted string literals like `$$...$$` solve?',
    code: "SELECT $$It's a string with an apostrophe$$;",
    choices: [
      'They make queries run faster',
      'They let you write a string containing single quotes without doubling or backslash-escaping them',
      'They are required for every string in Postgres',
      'They mark a string as case-insensitive',
    ],
    answerIndex: 1,
    query: {
      title: 'Dollar-quoted strings',
      syntax: "$$ any text, including 'quotes', goes here $$\n$tag$ any text $tag$",
      explanation:
        'A single-quoted literal containing an apostrophe needs escaping (doubling it), which gets unreadable fast inside larger blocks like function bodies. Dollar-quoting, `$$...$$` or a tagged `$tag$...$tag$` to allow nested dollar-quoted blocks, treats everything between the markers as literal text with no escaping needed, which is why it is the standard way to write `plpgsql` function bodies.',
      tags: ['strings', 'postgres-extension'],
    },
  },
  {
    id: 'pg-easy-75',
    type: 'mc',
    prompt: 'What does `INSERT INTO t (a, b) VALUES (1, 2), (3, 4), (5, 6);` do?',
    choices: [
      'Inserts only the last row, (5, 6)',
      'Inserts three separate rows in one statement',
      'Raises a syntax error, VALUES only accepts one row',
      'Inserts one row with six columns',
    ],
    answerIndex: 1,
    query: {
      title: 'Multi-row VALUES',
      syntax: 'INSERT INTO t (a, b)\nVALUES (1, 2), (3, 4), (5, 6);',
      explanation:
        'The `VALUES` clause of an `INSERT` accepts any number of comma-separated row groups, each becoming its own inserted row, planned and executed as a single statement. This is both more concise and generally faster than issuing one `INSERT` per row, since it avoids the per-statement parse/plan overhead N times over.',
      tags: ['dml'],
    },
  },
  {
    id: 'pg-easy-76',
    type: 'mc',
    prompt: 'What does `TABLE orders;` do on its own, with no SELECT keyword?',
    choices: [
      'It is a syntax error, TABLE cannot start a statement',
      'It is shorthand equivalent to SELECT * FROM orders',
      'It creates an empty table called orders',
      'It drops the orders table',
    ],
    answerIndex: 1,
    query: {
      title: 'The TABLE command shorthand',
      syntax: 'TABLE orders;\n-- equivalent to:\nSELECT * FROM orders;',
      explanation:
        '`TABLE name` is a small Postgres convenience: a standalone statement equivalent to `SELECT * FROM name` with no filtering or projection. It also composes inside a larger query, e.g. `TABLE orders UNION TABLE archived_orders`, which reads more tersely than spelling out `SELECT * FROM` twice.',
      tags: ['querying', 'postgres-extension'],
    },
  },
  {
    id: 'pg-easy-77',
    type: 'mc',
    prompt: "What does a standalone `VALUES (1, 'a'), (2, 'b');` statement produce?",
    choices: [
      'An error, VALUES must appear inside an INSERT',
      'An ad hoc result set of rows, with no backing table required',
      'A new temporary table named VALUES',
      'A single array containing both rows',
    ],
    answerIndex: 1,
    query: {
      title: 'Standalone VALUES',
      syntax: "VALUES (1, 'a'), (2, 'b');\n-- usable anywhere a query is:\nSELECT * FROM (VALUES (1, 'a'), (2, 'b')) AS t(id, label);",
      explanation:
        '`VALUES` is not limited to `INSERT`, it can stand on its own as a complete query producing literal rows on the fly, or be used as a subquery/CTE source. This is handy for constructing small lookup tables or test fixtures inline without a real `CREATE TABLE`.',
      tags: ['querying'],
    },
  },
  {
    id: 'pg-easy-78',
    type: 'mc',
    prompt: 'What does `SELECT unnest(ARRAY[1, 2, 3]);` produce?',
    choices: [
      'One row containing the array [1, 2, 3]',
      'Three separate rows: 1, 2, and 3',
      'The number 3 (the array length)',
      'An error, unnest only works on jsonb',
    ],
    answerIndex: 1,
    query: {
      title: 'unnest()',
      syntax: "SELECT unnest(ARRAY[1, 2, 3]);\nSELECT * FROM unnest(ARRAY['a','b']) AS t(label);",
      explanation:
        '`unnest` is a set-returning function that flips an array "sideways" into one row per element, the inverse operation of `array_agg`. It is the standard way to join an array column against another table, since you cannot directly `JOIN` on an array value without first expanding it into rows.',
      tags: ['arrays', 'functions'],
    },
  },
  {
    id: 'pg-easy-79',
    type: 'mc',
    prompt: '`array_agg(product)` is used as an aggregate function in a GROUP BY. What does it do?',
    code: 'SELECT customer_id, array_agg(product) FROM orders GROUP BY customer_id;',
    choices: [
      'Counts how many products there are',
      'Collects every value in the group into a single array',
      'Concatenates the products into one string',
      'Returns only the first product per group',
    ],
    answerIndex: 1,
    query: {
      title: 'array_agg()',
      syntax: 'array_agg(expression [ORDER BY ...]) -> array',
      explanation:
        '`array_agg` is the reverse of `unnest`: instead of collapsing rows into a single delimited string like `STRING_AGG`, it packs them into a genuine Postgres array value, preserving each element\u2019s original type rather than converting everything to text. Like `STRING_AGG`, it accepts an `ORDER BY` inside the call to control element order.',
      tags: ['arrays', 'aggregates'],
    },
  },
  {
    id: 'pg-easy-80',
    type: 'mc',
    prompt: 'What does the psql meta-command `\\!` do?',
    choices: [
      'Reverses the last query',
      'Runs a shell command without leaving the psql session',
      'Marks a query as urgent',
      'Deletes the current connection',
    ],
    answerIndex: 1,
    query: {
      title: 'psql: `\\!` shell escape',
      syntax: '\\! ls -la\n\\! echo hello',
      explanation:
        '`\\!` hands its argument off to your operating system shell and prints the result inline, without disconnecting from Postgres, which is convenient for checking a local file or running a quick command mid-session. With no argument, it drops you into an interactive subshell you can exit to return to psql.',
      tags: ['psql', 'tooling'],
    },
  },
  {
    id: 'pg-easy-81',
    type: 'mc',
    prompt: 'What does `\\i setup.sql` do inside psql?',
    choices: [
      'Imports a CSV file into a table',
      'Reads and executes the SQL commands in setup.sql as if you had typed them',
      'Installs a new extension named setup',
      'Ignores the setup.sql file',
    ],
    answerIndex: 1,
    query: {
      title: 'psql: `\\i` execute a script file',
      syntax: '\\i /path/to/setup.sql',
      explanation:
        '`\\i` reads a file from the local filesystem (the client machine, same as `\\copy`) and feeds its contents into psql line by line, exactly as though you had pasted the script in yourself. It is the standard way to replay a saved `.sql` file, including one containing other meta-commands.',
      tags: ['psql', 'tooling'],
    },
  },
  {
    id: 'pg-easy-82',
    type: 'mc',
    prompt: "What does `pg_size_pretty(pg_total_relation_size('orders'))` return?",
    choices: [
      'The raw byte count as an integer',
      'The size formatted as a human-readable string like "24 MB"',
      'The number of rows in orders',
      'A boolean, whether the table fits in memory',
    ],
    answerIndex: 1,
    query: {
      title: 'pg_size_pretty()',
      syntax: "SELECT pg_size_pretty(pg_total_relation_size('orders'));",
      explanation:
        '`pg_total_relation_size` returns a raw byte count (table plus indexes plus TOAST), which is exact but unreadable at a glance. `pg_size_pretty` wraps any such byte count and formats it with the most sensible unit (kB, MB, GB), which is why the two are almost always used together in monitoring queries.',
      tags: ['functions', 'introspection'],
    },
  },
  {
    id: 'pg-easy-83',
    type: 'mc',
    prompt: "What does `pg_database_size('mydb')` return?",
    choices: [
      'The number of tables in mydb',
      'The total on-disk size of the mydb database, in bytes',
      'The maximum allowed size for mydb',
      'The number of active connections to mydb',
    ],
    answerIndex: 1,
    query: {
      title: 'pg_database_size()',
      syntax: "SELECT pg_size_pretty(pg_database_size('mydb'));",
      explanation:
        '`pg_database_size` sums the on-disk footprint of every table, index, and other object belonging to the named database, returned in bytes. It is commonly wrapped in `pg_size_pretty()` for a readable report, and is a cheap way to track database growth over time without walking every relation individually.',
      tags: ['functions', 'introspection'],
    },
  },
  {
    id: 'pg-easy-84',
    type: 'mc',
    prompt: 'What does `NULLIF(quantity, 0)` return when `quantity` is 0?',
    choices: ['0', 'NULL', 'An error', '-1'],
    answerIndex: 1,
    query: {
      title: 'NULLIF()',
      syntax: 'NULLIF(a, b) -- NULL if a = b, otherwise a',
      explanation:
        '`NULLIF(a, b)` returns `NULL` when the two arguments are equal, and otherwise returns `a` unchanged. It is most often reached for to avoid a division-by-zero error: `total / NULLIF(quantity, 0)` turns a would-be error into a clean `NULL` result whenever `quantity` is zero.',
      tags: ['null', 'functions'],
    },
  },
  {
    id: 'pg-easy-85',
    type: 'mc',
    prompt: 'What does `GREATEST(3, 7, 2)` return?',
    choices: ['3', '7', '2', 'An array of all three'],
    answerIndex: 1,
    query: {
      title: 'GREATEST() / LEAST()',
      syntax: 'GREATEST(val1, val2, ...) -> largest, ignoring NULLs unless all are NULL\nLEAST(val1, val2, ...)    -> smallest, same NULL handling',
      explanation:
        '`GREATEST` and `LEAST` take any number of comparable arguments and return the largest or smallest, skipping `NULL` values unless every argument is `NULL` (in which case the result is `NULL`). They are handy for clamping a value, e.g. `GREATEST(price, 0)` to prevent a negative price, without a `CASE` expression.',
      tags: ['functions'],
    },
  },
  {
    id: 'pg-easy-86',
    type: 'mc',
    prompt: "What does `to_char(NOW(), 'YYYY-MM-DD')` produce?",
    choices: [
      'The timestamp unchanged',
      'The date formatted as a string using the given pattern',
      'An error, to_char only works on numbers',
      'The number of days since 1970',
    ],
    answerIndex: 1,
    query: {
      title: 'to_char() formatting',
      syntax: "to_char(timestamp, 'YYYY-MM-DD')\nto_char(1234.5, 'FM9999.00')",
      explanation:
        '`to_char` converts a date/time or numeric value into a formatted `text` string using a template mini-language (`YYYY`, `MM`, `DD`, `HH24`, and dozens more tokens), which is far more flexible than relying on a client library or the default output format. It has a numeric counterpart pattern language too, for formatting currency-style output.',
      tags: ['date-time', 'functions'],
    },
  },
  {
    id: 'pg-easy-87',
    type: 'mc',
    prompt: "What is `to_date('2024-05-01', 'YYYY-MM-DD')` used for?",
    choices: [
      'Converting a date into a formatted string',
      'Parsing a text string into a date, according to the given format pattern',
      'Adding two dates together',
      'Validating that a date is in the future',
    ],
    answerIndex: 1,
    query: {
      title: 'to_date() / to_timestamp()',
      syntax: "to_date(text, format) -> date\nto_timestamp(text, format) -> timestamptz",
      explanation:
        '`to_date` and `to_timestamp` are the inverse of `to_char`: they parse a text value into a real date/timestamp according to an explicit format pattern, which matters whenever the incoming text is not already in Postgres\u2019s default ISO 8601-ish format (day-first dates from a CSV export, for example).',
      tags: ['date-time', 'functions'],
    },
  },
  {
    id: 'pg-easy-88',
    type: 'mc',
    prompt: '`EXTRACT(MONTH FROM order_date)` is run on a date in May. What does it return?',
    choices: [
      'The month name as text, e.g. "May"',
      'The numeric month, e.g. 5',
      'A full date truncated to the first of the month',
      'The number of months since order_date',
    ],
    answerIndex: 1,
    query: {
      title: 'EXTRACT()',
      syntax: "EXTRACT(field FROM source)\nEXTRACT(YEAR FROM order_date)\nEXTRACT(DOW FROM order_date)  -- day of week, 0=Sunday",
      explanation:
        '`EXTRACT` pulls a single numeric component (year, month, day, hour, day-of-week, and more) out of a date/time/interval value. It is commonly used for grouping reports by period, e.g. `GROUP BY EXTRACT(YEAR FROM order_date), EXTRACT(MONTH FROM order_date)`.',
      tags: ['date-time', 'functions'],
    },
  },
  {
    id: 'pg-easy-89',
    type: 'mc',
    prompt: "What does `date_trunc('month', order_date)` return?",
    choices: [
      'Just the month number',
      'A timestamp rounded down to the first moment of that month',
      'The number of days remaining in the month',
      'The month name as text',
    ],
    answerIndex: 1,
    query: {
      title: 'date_trunc()',
      syntax: "date_trunc('month', order_date) -- 2024-05-01 00:00:00\ndate_trunc('day', now())",
      explanation:
        'Unlike `EXTRACT`, which pulls out a single numeric field, `date_trunc` zeroes out everything smaller than the given precision and returns a full timestamp back, which is what you want for grouping by calendar period while still being able to compare, sort, and display the result as a real date rather than a bare integer.',
      tags: ['date-time', 'functions'],
    },
  },
  {
    id: 'pg-easy-90',
    type: 'bool',
    prompt: "After `UPDATE orders SET status = 'shipped' WHERE id = 1 RETURNING status;`, the returned value reflects the row before the update.",
    answer: false,
    query: {
      title: 'RETURNING on UPDATE reflects the new row',
      syntax: "UPDATE orders SET status = 'shipped' WHERE id = 1 RETURNING status; -- 'shipped'",
      explanation:
        'RETURNING on an UPDATE reports the row\u2019s values after the update has been applied, not before, since it operates on the final row version the statement produces. If you need the old value too, you must capture it separately beforehand, for example with a `SELECT` in the same transaction, since RETURNING has no "OLD vs NEW" distinction the way a trigger does.',
      tags: ['dml', 'gotchas'],
    },
  },
  {
    id: 'pg-easy-91',
    type: 'mc',
    prompt: 'Which psql meta-command lists views instead of ordinary tables?',
    choices: ['\\dv', '\\dt', '\\dm', '\\di'],
    answerIndex: 0,
    query: {
      title: 'psql: `\\dv`',
      syntax: '\\dv',
      explanation:
        '`\\dv` lists views specifically, separate from `\\dt` (ordinary tables), `\\dm` (materialized views), and `\\di` (indexes), following the same `\\d<letter>` naming pattern used throughout psql\u2019s describe commands.',
      tags: ['psql', 'tooling'],
    },
  },
  {
    id: 'pg-easy-92',
    type: 'mc',
    prompt: 'Which psql meta-command lists database roles (users and groups)?',
    choices: ['\\du', '\\dn', '\\dt', '\\dv'],
    answerIndex: 0,
    query: {
      title: 'psql: `\\du`',
      syntax: '\\du',
      explanation:
        '`\\du` ("describe users") lists every role in the cluster along with its attributes, like whether it can log in, create databases, or is a superuser. Postgres does not distinguish "users" and "groups" as separate object types internally, both are roles, which is why this command shows both.',
      tags: ['psql', 'roles'],
    },
  },
  {
    id: 'pg-easy-93',
    type: 'mc',
    prompt: 'What does `SHOW work_mem;` do?',
    choices: [
      'Changes the work_mem setting for the session',
      'Displays the current value of the work_mem configuration parameter',
      'Shows how much memory the current query is using right now',
      'Lists all configuration parameters at once',
    ],
    answerIndex: 1,
    query: {
      title: 'SHOW',
      syntax: 'SHOW work_mem;\nSHOW ALL;',
      explanation:
        '`SHOW parameter_name` is a read-only lookup of one server configuration setting as it applies to your current session, whether that value came from `postgresql.conf`, a per-role override, or a `SET` in the current session. `SHOW ALL` dumps every parameter at once; the underlying data is also queryable as a real table via `pg_settings`.',
      tags: ['configuration'],
    },
  },
  {
    id: 'pg-easy-94',
    type: 'mc',
    prompt: "What does `SET statement_timeout = '5s';` change?",
    choices: [
      'It changes the setting permanently for the whole server',
      'It changes the setting only for the current session, until the session ends or it is reset',
      'It changes the setting only for the very next statement',
      'It has no effect unless the server is restarted',
    ],
    answerIndex: 1,
    query: {
      title: 'SET for session-level configuration',
      syntax: "SET statement_timeout = '5s';\nRESET statement_timeout;\nSET LOCAL statement_timeout = '5s'; -- transaction-scoped instead",
      explanation:
        'A plain `SET parameter = value` changes that setting for the rest of the current session only, leaving every other connection and the server default untouched; `RESET` reverts it. `SET LOCAL` narrows the scope further, to just the current transaction, which is useful for a one-off override you do not want to leak into later queries on the same connection.',
      tags: ['configuration'],
    },
  },
  {
    id: 'pg-easy-95',
    type: 'mc',
    prompt: 'Given `arr = ARRAY[10, 20, 30, 40]`, what does `arr[2:3]` return?',
    choices: ['[20, 30]', '[10, 20, 30]', '20', '[30, 40]'],
    answerIndex: 0,
    query: {
      title: 'Array slicing',
      syntax: "SELECT (ARRAY[10, 20, 30, 40])[2:3]; -- {20,30}",
      explanation:
        'Postgres supports slice syntax on arrays, `arr[lower:upper]`, returning a sub-array containing the elements at those 1-based positions inclusive on both ends. Omitting either bound, `arr[:2]` or `arr[3:]`, slices from the start or through to the end respectively.',
      tags: ['arrays'],
    },
  },
  {
    id: 'pg-easy-96',
    type: 'mc',
    prompt: 'What does a `LATERAL` subquery in a FROM clause let you do that a plain subquery cannot?',
    code: 'SELECT c.name, top.*\nFROM customers c,\nLATERAL (\n  SELECT * FROM orders o\n  WHERE o.customer_id = c.id\n  ORDER BY o.created_at DESC LIMIT 1\n) top;',
    choices: [
      'Run faster than any other join type',
      'Reference columns from an earlier FROM item inside the subquery itself, effectively looping "for each row"',
      'Return results without needing a FROM clause at all',
      'Skip WHERE clause evaluation',
    ],
    answerIndex: 1,
    query: {
      title: 'LATERAL joins',
      syntax: 'FROM a, LATERAL (subquery referencing a.col) AS b',
      explanation:
        'An ordinary subquery in FROM is planned once, in isolation, and cannot see columns from a sibling FROM item. Marking it `LATERAL` (implicit for functions, explicit for subqueries) lets it reference columns from FROM items listed before it, conceptually re-running the subquery once per row, which is exactly what you need for a "top N per group" query like fetching each customer\u2019s most recent order.',
      tags: ['joins', 'postgres-extension'],
    },
  },
  {
    id: 'pg-easy-97',
    type: 'mc',
    prompt: 'If you have a table literally named `order`, which of these is required to reference it?',
    choices: ['SELECT * FROM order;', 'SELECT * FROM "order";', "SELECT * FROM 'order';", 'Nothing extra, order works fine unquoted'],
    answerIndex: 1,
    query: {
      title: 'Quoting reserved words as identifiers',
      syntax: 'CREATE TABLE "order" (id int);\nSELECT * FROM "order";',
      explanation:
        '`ORDER` is a reserved SQL keyword (it introduces `ORDER BY`), so using it unquoted as a table or column name causes a parse error. Wrapping it in double quotes tells Postgres to treat it strictly as an identifier rather than a keyword, letting you use otherwise-reserved words as names, though it is generally best avoided for readability.',
      tags: ['identifiers', 'gotchas'],
    },
  },
  {
    id: 'pg-easy-98',
    type: 'mc',
    prompt: 'What does `pg_sleep(2)` do when called in a query?',
    choices: [
      'Puts the whole Postgres server to sleep for 2 seconds',
      'Pauses execution of the current session for 2 seconds, then returns',
      'Deletes rows older than 2 seconds',
      'Schedules the query to run again in 2 seconds',
    ],
    answerIndex: 1,
    query: {
      title: 'pg_sleep()',
      syntax: 'SELECT pg_sleep(2);',
      explanation:
        '`pg_sleep(seconds)` simply pauses the calling backend for the given duration and then returns void; it does not affect any other session or the server as a whole. It is mostly a testing and demonstration tool, for example to deliberately hold a lock open in one session while observing blocking behavior from another.',
      tags: ['functions'],
    },
  },
  {
    id: 'pg-easy-99',
    type: 'bool',
    prompt: '`SELECT random();` can return exactly 1.0.',
    answer: false,
    query: {
      title: 'RANDOM()',
      syntax: 'SELECT random(); -- double precision in [0, 1)',
      explanation:
        '`random()` returns a `double precision` value in the half-open range from 0 inclusive up to, but never including, 1. It takes no seed argument; to get a reproducible sequence for testing you call the separate `setseed(value)` function first, rather than passing a seed to `random()` itself.',
      tags: ['functions'],
    },
  },
  {
    id: 'pg-easy-100',
    type: 'mc',
    prompt: "Why does inserting the literal 'don''t' (with two single quotes) store the text don't (with one apostrophe)?",
    code: "INSERT INTO t (note) VALUES ('don''t');",
    choices: [
      'Postgres treats the doubled quote as a typo and ignores the second one',
      'A doubled single quote inside a single-quoted literal is the standard way to escape an embedded quote character',
      'It is invalid syntax and would raise an error',
      'It inserts two separate rows',
    ],
    answerIndex: 1,
    query: {
      title: 'Escaping quotes inside string literals',
      syntax: "SELECT 'don''t';  -- don't\nSELECT E'don\\'t'; -- also don't, using an escape string literal",
      explanation:
        'The SQL standard (and Postgres by default) escapes an embedded single quote inside a plain string literal by doubling it, not with a backslash. Backslash escapes only work inside an `E\'...\'` "escape string" literal, and are not honored in a plain string unless the `standard_conforming_strings` setting has been turned off, which is not the modern default.',
      tags: ['strings', 'gotchas'],
    },
  },
];
