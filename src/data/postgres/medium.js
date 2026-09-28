// Postgres / Medium question bank.
// Targets Postgres-specific syntax and behavior, deliberately avoiding
// generic SQL trivia that any relational database would share.

export const postgresMedium = [
  {
    id: 'pg-med-01',
    type: 'bool',
    prompt: '`SERIAL` is a real, distinct column type stored in the Postgres system catalog.',
    answer: false,
    query: {
      title: 'SERIAL is sugar, not a type',
      syntax: 'id SERIAL PRIMARY KEY\n-- expands to roughly:\nid INTEGER NOT NULL DEFAULT nextval(\'tbl_id_seq\')',
      explanation:
        '`SERIAL` is parser sugar: Postgres creates an `integer` (or `bigint` for `BIGSERIAL`) column, a backing sequence, and a `DEFAULT nextval(...)` on that column. `\\d` on the table shows a plain integer column, the "SERIAL-ness" is just the sequence wiring. Since PG10, `GENERATED ... AS IDENTITY` is the more standard-compliant alternative.',
      tags: ['schema', 'sequences'],
    },
  },
  {
    id: 'pg-med-02',
    type: 'mc',
    prompt: 'What does the `RETURNING` clause let you do?',
    code: 'INSERT INTO users (email) VALUES ($1) RETURNING id, created_at;',
    choices: [
      'Return the query execution plan instead of running it',
      'Return rows affected by an INSERT, UPDATE, or DELETE without a separate SELECT',
      'Roll back the statement after showing a preview',
      'Return only the count of affected rows',
    ],
    answerIndex: 1,
    query: {
      title: 'RETURNING',
      syntax: 'INSERT|UPDATE|DELETE ... RETURNING column_list | *',
      explanation:
        'RETURNING is a Postgres extension to standard DML that hands back column values from the exact rows a write statement touched, in one round trip, instead of writing and then issuing a follow-up SELECT. It is especially common for grabbing a newly generated primary key straight off an INSERT.',
      tags: ['dml', 'postgres-extension'],
    },
  },
  {
    id: 'pg-med-03',
    type: 'mc',
    prompt: 'Which index type does Postgres choose by default when you write `CREATE INDEX ON t (col)` with no method specified?',
    choices: ['GIN', 'GiST', 'B-tree', 'BRIN'],
    answerIndex: 2,
    query: {
      title: 'Default index access method',
      syntax: 'CREATE INDEX idx ON t (col);\n-- equivalent to:\nCREATE INDEX idx ON t USING btree (col);',
      explanation:
        'B-tree is the default and handles equality and ordered range queries well. GIN and GiST exist for composite/indexable-by-decomposition data like arrays, full-text search vectors, and geometric types; BRIN trades precision for a tiny footprint on huge, naturally-ordered tables like time-series logs.',
      tags: ['indexes'],
    },
  },
  {
    id: 'pg-med-04',
    type: 'bool',
    prompt: '`TRUNCATE` fires the row-level `ON DELETE` triggers defined on the table for every row removed.',
    answer: false,
    query: {
      title: 'TRUNCATE and triggers',
      syntax: 'TRUNCATE TABLE t;',
      explanation:
        'TRUNCATE deallocates the table\u2019s pages directly instead of deleting rows one at a time, so it does not invoke per-row `ON DELETE` triggers. It does fire `BEFORE TRUNCATE` / `AFTER TRUNCATE` statement-level triggers if any are defined. This is also why TRUNCATE is far faster than an unqualified DELETE on a large table.',
      tags: ['triggers', 'ddl'],
    },
  },
  {
    id: 'pg-med-05',
    type: 'mc',
    prompt: 'What does `EXPLAIN ANALYZE` do that plain `EXPLAIN` does not?',
    choices: [
      'Shows only the planner\u2019s cost estimates',
      'Actually executes the query and reports real timings alongside the plan',
      'Works only on SELECT statements',
      'Forces the planner to avoid using indexes',
    ],
    answerIndex: 1,
    query: {
      title: 'EXPLAIN vs EXPLAIN ANALYZE',
      syntax: 'EXPLAIN ANALYZE SELECT ...;',
      explanation:
        'Plain EXPLAIN only prints the planner\u2019s cost estimates without running anything. ANALYZE actually executes the statement (side effects included, for INSERT/UPDATE/DELETE) and layers real elapsed time and row counts per plan node on top, which is how you catch a planner misestimate that plain EXPLAIN would hide.',
      tags: ['explain', 'performance'],
    },
  },
  {
    id: 'pg-med-06',
    type: 'bool',
    prompt: 'A `UNIQUE` constraint in Postgres allows more than one row to have `NULL` in the constrained column.',
    answer: true,
    query: {
      title: 'NULL and UNIQUE',
      syntax: 'CREATE TABLE t (email TEXT UNIQUE);',
      explanation:
        'Postgres treats each `NULL` as distinct from every other `NULL` for the purposes of a UNIQUE constraint (the SQL standard leaves this implementation-defined, and Postgres follows the common interpretation), so multiple rows with `NULL` in a unique column are allowed. `NULLS NOT DISTINCT` (PG15+) opts into the opposite behavior.',
      tags: ['constraints', 'null'],
    },
  },
  {
    id: 'pg-med-07',
    type: 'mc',
    prompt: 'What is the primary purpose of running `VACUUM` on a table?',
    choices: [
      'Rebuild all indexes from scratch',
      'Reclaim storage occupied by dead row versions from updates and deletes',
      'Change a column\u2019s data type',
      'Encrypt table contents at rest',
    ],
    answerIndex: 1,
    query: {
      title: 'VACUUM',
      syntax: 'VACUUM [FULL] [ANALYZE] table_name;',
      explanation:
        'Because Postgres uses MVCC, an UPDATE or DELETE does not overwrite a row in place, it leaves the old row version as a "dead tuple." VACUUM scans for dead tuples and marks their space reusable (or, with FULL, physically compacts the table). Autovacuum runs this automatically in the background based on activity thresholds.',
      tags: ['vacuum', 'mvcc', 'maintenance'],
    },
  },
  {
    id: 'pg-med-08',
    type: 'mc',
    prompt: 'Which data type would you use to store a JSON document while keeping fast containment queries (`@>`) and indexing support?',
    choices: ['TEXT', 'JSON', 'JSONB', 'BYTEA'],
    answerIndex: 2,
    query: {
      title: 'JSON vs JSONB',
      syntax: "col JSONB\ncol @> '{\"active\": true}'::jsonb",
      explanation:
        'JSON stores an exact textual copy of the input (preserving whitespace and key order) and re-parses on every access. JSONB stores a decomposed binary format, strips insignificant whitespace and duplicate keys, and supports GIN indexing plus operators like `@>` for containment, at the cost of slightly slower input.',
      tags: ['json', 'data-types'],
    },
  },
  {
    id: 'pg-med-09',
    type: 'mc',
    prompt: 'What does the psql meta-command `\\d tablename` do?',
    choices: [
      'Deletes the table',
      'Describes the table: columns, types, indexes, and constraints',
      'Dumps the table\u2019s contents to a file',
      'Disables triggers on the table',
    ],
    answerIndex: 1,
    query: {
      title: 'psql meta-commands',
      syntax: '\\d tablename    -- describe\n\\dt              -- list tables\n\\di              -- list indexes',
      explanation:
        'Backslash commands are psql-client features, not SQL, so they only work inside the psql shell (or a compatible client), never inside a query sent over a driver. `\\d` on a specific relation prints its columns, types, defaults, indexes, and foreign keys in one shot.',
      tags: ['psql', 'tooling'],
    },
  },
  {
    id: 'pg-med-10',
    type: 'mc',
    prompt: 'Which Postgres-specific clause lets you upsert a row when a unique constraint would otherwise be violated?',
    code: 'INSERT INTO t (id, val) VALUES (1, \'x\')\nON CONFLICT (id) DO UPDATE SET val = EXCLUDED.val;',
    choices: [
      'ON DUPLICATE KEY UPDATE',
      'MERGE INTO',
      'ON CONFLICT DO UPDATE',
      'REPLACE INTO',
    ],
    answerIndex: 2,
    query: {
      title: 'ON CONFLICT (upsert)',
      syntax: 'INSERT ... ON CONFLICT (target) DO UPDATE SET col = EXCLUDED.col\n       ON CONFLICT (target) DO NOTHING',
      explanation:
        'Postgres\u2019s upsert syntax is `ON CONFLICT`, distinct from MySQL\u2019s `ON DUPLICATE KEY UPDATE`. The special `EXCLUDED` pseudo-table refers to the row that would have been inserted, letting you reference the attempted values inside the `DO UPDATE SET` clause.',
      tags: ['upsert', 'postgres-extension'],
    },
  },
  {
    id: 'pg-med-11',
    type: 'mc',
    prompt: 'What does `PARTITION BY` do inside a window function\u2019s `OVER` clause?',
    code: 'SELECT dept, salary,\n  AVG(salary) OVER (PARTITION BY dept) AS dept_avg\nFROM employees;',
    choices: [
      'Splits the table into separate physical partitions',
      'Divides the result rows into groups so the window function is computed independently within each group',
      'Removes duplicate rows within each department',
      'Filters out rows where salary is null',
    ],
    answerIndex: 1,
    query: {
      title: 'Window function PARTITION BY',
      syntax: 'aggregate_or_rank_fn(...) OVER (PARTITION BY col1, col2 ORDER BY col3)',
      explanation:
        'Unlike GROUP BY, a window function does not collapse rows. PARTITION BY resets the window\u2019s calculation for each group of rows sharing the same partition key, while every original row stays in the output, so you get a per-department average sitting alongside each employee\u2019s own row.',
      tags: ['window-functions'],
    },
  },
  {
    id: 'pg-med-12',
    type: 'bool',
    prompt: '`ROW_NUMBER()` and `RANK()` always return the same value for tied rows under an identical `ORDER BY`.',
    answer: false,
    query: {
      title: 'ROW_NUMBER vs RANK on ties',
      syntax: 'ROW_NUMBER() OVER (ORDER BY score DESC)\nRANK() OVER (ORDER BY score DESC)',
      explanation:
        '`ROW_NUMBER()` assigns a strictly increasing, unique integer per row regardless of ties, breaking ties arbitrarily. `RANK()` gives tied rows the same rank and then skips the next rank number(s) to account for the tie (1, 2, 2, 4). `DENSE_RANK()` behaves like RANK but never skips numbers (1, 2, 2, 3).',
      tags: ['window-functions'],
    },
  },
  {
    id: 'pg-med-13',
    type: 'mc',
    prompt: 'What do `LAG()` and `LEAD()` let a window function access?',
    choices: [
      'The minimum and maximum value in the whole table',
      'A value from a preceding or following row within the same window ordering',
      'The current row repeated twice',
      'Only aggregate totals, never individual row values',
    ],
    answerIndex: 1,
    query: {
      title: 'LAG / LEAD',
      syntax: 'LAG(price, 1) OVER (ORDER BY trade_date) AS prev_price',
      explanation:
        '`LAG(expr, offset)` reaches backward `offset` rows in the window\u2019s defined ordering, and `LEAD` reaches forward, without a self-join. This is the standard way to compute a row-over-row delta, like a day-over-day price change, directly in SQL.',
      tags: ['window-functions'],
    },
  },
  {
    id: 'pg-med-14',
    type: 'bool',
    prompt: 'The `FILTER` clause lets an aggregate function only consider rows matching a condition, without needing a separate `CASE WHEN`.',
    answer: true,
    query: {
      title: 'Aggregate FILTER clause',
      syntax: "COUNT(*) FILTER (WHERE status = 'paid') AS paid_count",
      explanation:
        '`FILTER (WHERE ...)` attaches a per-aggregate predicate so a single `SELECT` can compute several conditional aggregates (paid count, refunded count, etc.) side by side in one pass, instead of wrapping each argument in `CASE WHEN cond THEN val END`, which reads more clearly and lets the planner reason about each filter independently.',
      tags: ['aggregates'],
    },
  },
  {
    id: 'pg-med-15',
    type: 'mc',
    prompt: 'What does `ARRAY_AGG(name ORDER BY name)` return for a group of rows?',
    choices: [
      'A single concatenated string of names',
      'A Postgres array value containing each name, ordered as specified',
      'The count of distinct names',
      'A JSON object mapping row id to name',
    ],
    answerIndex: 1,
    query: {
      title: 'ARRAY_AGG',
      syntax: 'SELECT dept, ARRAY_AGG(name ORDER BY name) FROM employees GROUP BY dept;',
      explanation:
        '`ARRAY_AGG` collapses the grouped rows\u2019 expression into one native Postgres array value per group, and accepts its own `ORDER BY` independent of any outer query ordering, so the array\u2019s element order is controlled explicitly rather than depending on scan order.',
      tags: ['aggregates', 'arrays'],
    },
  },
  {
    id: 'pg-med-16',
    type: 'mc',
    prompt: 'What does `STRING_AGG(tag, \', \')` produce compared to `ARRAY_AGG(tag)`?',
    choices: [
      'The exact same array value',
      'A single delimited text string joining the grouped values instead of an array',
      'A JSONB array of tags',
      'It fails because STRING_AGG requires numeric input',
    ],
    answerIndex: 1,
    query: {
      title: 'STRING_AGG',
      syntax: "SELECT post_id, STRING_AGG(tag, ', ' ORDER BY tag) FROM post_tags GROUP BY post_id;",
      explanation:
        '`STRING_AGG` is Postgres\u2019s aggregate for joining text values with a delimiter, functionally similar to `ARRAY_AGG` followed by `array_to_string`, but in one call. Like `ARRAY_AGG`, it accepts an inner `ORDER BY` to control the concatenation order.',
      tags: ['aggregates', 'strings'],
    },
  },
  {
    id: 'pg-med-17',
    type: 'bool',
    prompt: '`FETCH FIRST 3 ROWS WITH TIES` can return more than 3 rows.',
    answer: true,
    query: {
      title: 'WITH TIES',
      syntax: 'SELECT * FROM scores ORDER BY score DESC FETCH FIRST 3 ROWS WITH TIES;',
      explanation:
        '`WITH TIES` (PG13+) extends the result past the requested row count to include every row that ties the last included row on the `ORDER BY` key, which plain `LIMIT` cannot do, so a request for the "top 3" honestly returns every 3rd-place tie instead of picking one arbitrarily.',
      tags: ['pagination'],
    },
  },
  {
    id: 'pg-med-18',
    type: 'mc',
    prompt: 'What is the basic form of a Common Table Expression used for?',
    code: 'WITH recent_orders AS (\n  SELECT * FROM orders WHERE created_at > now() - interval \'7 days\'\n)\nSELECT customer_id, count(*) FROM recent_orders GROUP BY customer_id;',
    choices: [
      'Permanently storing a subquery\u2019s result as a table',
      'Naming a subquery so it can be referenced, possibly more than once, in the statement that follows it',
      'Replacing all JOINs in a query',
      'Creating a database-level view',
    ],
    answerIndex: 1,
    query: {
      title: 'WITH ... AS (CTE)',
      syntax: 'WITH name AS (subquery) SELECT ... FROM name;',
      explanation:
        'A CTE gives a subquery a name for the duration of one statement, which reads cleaner than nesting and, unlike a subquery copy-pasted twice, lets the same computed result be referenced multiple times in the outer query without repeating the logic.',
      tags: ['cte'],
    },
  },
  {
    id: 'pg-med-19',
    type: 'bool',
    prompt: '`WITH RECURSIVE` can be used to walk a self-referencing hierarchy, such as an employee-to-manager table, without a fixed number of joins.',
    answer: true,
    query: {
      title: 'WITH RECURSIVE',
      syntax: 'WITH RECURSIVE org_chart AS (\n  SELECT id, manager_id, 1 AS depth FROM employees WHERE manager_id IS NULL\n  UNION ALL\n  SELECT e.id, e.manager_id, oc.depth + 1\n  FROM employees e JOIN org_chart oc ON e.manager_id = oc.id\n)\nSELECT * FROM org_chart;',
      explanation:
        'A recursive CTE repeatedly evaluates its recursive term against the rows produced by the previous iteration and `UNION ALL`s the results, stopping when an iteration produces no new rows. This is the standard way to traverse trees or graphs of arbitrary depth (org charts, category trees, bill-of-materials) in plain SQL.',
      tags: ['cte', 'recursion'],
    },
  },
  {
    id: 'pg-med-20',
    type: 'bool',
    prompt: 'In Postgres 12 and later, a CTE with no side effects and no recursion can be transparently inlined into the outer query by the planner unless it is marked `MATERIALIZED`.',
    answer: true,
    query: {
      title: 'CTE inlining default',
      syntax: 'WITH x AS (SELECT * FROM t WHERE flag) SELECT * FROM x JOIN other ON ...;\n-- planner may fold this like a subquery',
      explanation:
        'Before PG12, every CTE was an opaque optimization fence. Since PG12, a simple, non-recursive, side-effect-free CTE referenced once is eligible to be folded straight into the surrounding query, letting the planner push down filters and choose join order across the CTE boundary, exactly like an ordinary subquery would allow.',
      tags: ['cte', 'planner'],
    },
  },
  {
    id: 'pg-med-21',
    type: 'mc',
    prompt: 'Why does a `LATERAL` join let a subquery reference columns from a preceding table in the `FROM` clause?',
    code: 'SELECT c.name, top.*\nFROM customers c\nCROSS JOIN LATERAL (\n  SELECT * FROM orders o WHERE o.customer_id = c.id ORDER BY o.total DESC LIMIT 3\n) AS top;',
    choices: [
      'It doesn\u2019t; LATERAL is only cosmetic and changes nothing',
      'It evaluates the subquery once per row of the preceding table, with that row\u2019s values in scope',
      'It forces the subquery to run before any WHERE clause filtering',
      'It converts the subquery into a materialized view automatically',
    ],
    answerIndex: 1,
    query: {
      title: 'LATERAL joins',
      syntax: 'FROM a, LATERAL (subquery referencing a.col) AS b\n-- or: a CROSS JOIN LATERAL (...)',
      explanation:
        'A normal subquery in FROM is planned once, independent of other tables, so it cannot see their columns. `LATERAL` grants that visibility by conceptually re-evaluating the subquery for each outer row, which is exactly what you need for a "top N per group" query like grabbing each customer\u2019s three biggest orders.',
      tags: ['joins', 'lateral'],
    },
  },
  {
    id: 'pg-med-22',
    type: 'mc',
    prompt: 'What does the array operator `ANY` let you do in a `WHERE` clause?',
    code: "SELECT * FROM products WHERE 42 = ANY (tag_ids);",
    choices: [
      'Compare a scalar against every element of an array, matching if any element equals it',
      'Check whether an array is empty',
      'Sort the array elements',
      'Cast the array to text',
    ],
    answerIndex: 0,
    query: {
      title: 'Array ANY operator',
      syntax: 'expr operator ANY (array_expression)',
      explanation:
        '`x = ANY(array_col)` unrolls into "x equals at least one element of array_col," which is Postgres\u2019s array-native equivalent of `x IN (...)` but operating over an actual array column rather than a literal list, and it works with any comparison operator, not just `=`.',
      tags: ['arrays'],
    },
  },
  {
    id: 'pg-med-23',
    type: 'bool',
    prompt: 'The `@>` operator on two array columns checks whether the left array contains every element of the right array.',
    answer: true,
    query: {
      title: 'Array containment @>',
      syntax: "SELECT * FROM posts WHERE tags @> ARRAY['postgres', 'sql'];",
      explanation:
        '`@>` is the containment operator: `a @> b` is true when every element of `b` appears somewhere in `a`, regardless of order or extra elements in `a`. It is the array analog of the same `@>` operator used for JSONB containment, and it is GIN-indexable for fast lookups.',
      tags: ['arrays'],
    },
  },
  {
    id: 'pg-med-24',
    type: 'mc',
    prompt: 'What does the `&&` operator check between two array columns?',
    code: "SELECT * FROM posts WHERE tags && ARRAY['sql', 'nosql'];",
    choices: [
      'Whether both arrays are identical',
      'Whether the arrays share at least one common element (overlap)',
      'A logical AND on boolean array elements only',
      'Whether the first array is longer than the second',
    ],
    answerIndex: 1,
    query: {
      title: 'Array overlap &&',
      syntax: 'array1 && array2',
      explanation:
        '`&&` returns true if the two arrays have any element in common, useful for "any of these tags" style filters. It is distinct from `@>` (full containment) and, like containment, benefits from a GIN index on the array column for large tables.',
      tags: ['arrays'],
    },
  },
  {
    id: 'pg-med-25',
    type: 'bool',
    prompt: 'Postgres arrays are 1-indexed by default, so `my_array[1]` refers to the first element.',
    answer: true,
    query: {
      title: 'Array indexing base',
      syntax: 'SELECT tags[1] FROM posts;',
      explanation:
        'Unlike most programming languages, Postgres array subscripts start at 1 by default (though a custom lower bound can be set at creation). Accessing `array[0]` on a default array returns NULL, not the first element, which is a common source of off-by-one bugs for developers coming from 0-indexed languages.',
      tags: ['arrays'],
    },
  },
  {
    id: 'pg-med-26',
    type: 'mc',
    prompt: 'What does `unnest(tag_ids)` do when used in a `SELECT` list or `FROM` clause?',
    code: 'SELECT unnest(tag_ids) AS tag_id FROM products WHERE id = 1;',
    choices: [
      'Sorts the array in place',
      'Expands an array into one row per element',
      'Removes duplicate elements from the array',
      'Converts the array to a JSON string',
    ],
    answerIndex: 1,
    query: {
      title: 'unnest()',
      syntax: 'unnest(array_expression)',
      explanation:
        '`unnest` is a set-returning function that turns a single array value into a relation of one row per element, which is how you join array contents against another table or aggregate over them row-wise instead of manipulating the array as one opaque value.',
      tags: ['arrays', 'set-returning-functions'],
    },
  },
  {
    id: 'pg-med-27',
    type: 'bool',
    prompt: '`unnest(arr) WITH ORDINALITY` adds a column reporting each element\u2019s original position in the array.',
    answer: true,
    query: {
      title: 'WITH ORDINALITY',
      syntax: "SELECT * FROM unnest(ARRAY['a','b','c']) WITH ORDINALITY AS t(val, idx);",
      explanation:
        '`WITH ORDINALITY` can be attached to any set-returning function, not just `unnest`, and appends a 1-based integer column tracking the row\u2019s position in the function\u2019s output order, which is otherwise lost once the array is expanded into rows.',
      tags: ['arrays', 'set-returning-functions'],
    },
  },
  {
    id: 'pg-med-28',
    type: 'mc',
    prompt: 'What does `cardinality(my_array)` return?',
    choices: [
      'The data type of the array elements',
      'The total number of elements in the array',
      'The maximum possible size of the array',
      'A boolean for whether the array is empty',
    ],
    answerIndex: 1,
    query: {
      title: 'cardinality() vs array_length()',
      syntax: 'SELECT cardinality(tag_ids) FROM products;',
      explanation:
        '`cardinality` returns the total element count across all dimensions and returns 0 (not NULL) for an empty array, which makes it more predictable than `array_length(arr, 1)`, whose second argument selects a dimension and which returns NULL for an empty array.',
      tags: ['arrays'],
    },
  },
  {
    id: 'pg-med-29',
    type: 'mc',
    prompt: 'What makes `DISTINCT ON (customer_id)` different from a plain `DISTINCT`?',
    code: 'SELECT DISTINCT ON (customer_id) customer_id, order_date, total\nFROM orders\nORDER BY customer_id, order_date DESC;',
    choices: [
      'They are exact synonyms in Postgres',
      'DISTINCT ON keeps only the first row per group of the given expression(s), determined by ORDER BY, while plain DISTINCT deduplicates whole rows',
      'DISTINCT ON requires an index and plain DISTINCT does not',
      'DISTINCT ON removes NULL values automatically',
    ],
    answerIndex: 1,
    query: {
      title: 'DISTINCT ON',
      syntax: 'SELECT DISTINCT ON (expr) ... ORDER BY expr, tiebreaker;',
      explanation:
        '`DISTINCT ON` is a Postgres-only extension: it groups rows by the listed expression(s) and keeps exactly one row per group, specifically the first row in that group\u2019s `ORDER BY` order, which must start with the same expression(s). This is the idiomatic way to fetch "the latest order per customer" without a window function or subquery.',
      tags: ['postgres-extension'],
    },
  },
  {
    id: 'pg-med-30',
    type: 'bool',
    prompt: 'A foreign key defined with `ON DELETE CASCADE` will delete the child rows automatically when the referenced parent row is deleted.',
    answer: true,
    query: {
      title: 'ON DELETE CASCADE',
      syntax: 'ALTER TABLE orders ADD CONSTRAINT fk_customer\n  FOREIGN KEY (customer_id) REFERENCES customers (id) ON DELETE CASCADE;',
      explanation:
        'Without a specified action, deleting a referenced parent row raises a foreign-key violation if child rows exist. `ON DELETE CASCADE` instead propagates the delete: removing the parent automatically removes every referencing child row in the same transaction, no application-level cleanup step required.',
      tags: ['constraints', 'foreign-keys'],
    },
  },
  {
    id: 'pg-med-31',
    type: 'mc',
    prompt: 'What happens to `orders.customer_id` for existing rows when a referenced customer is deleted and the foreign key was declared `ON DELETE SET NULL`?',
    choices: [
      'The order rows are deleted along with the customer',
      'The delete is blocked with a constraint violation',
      'customer_id is set to NULL on those order rows, and the orders remain',
      'customer_id is set to the customer\u2019s old id string',
    ],
    answerIndex: 2,
    query: {
      title: 'ON DELETE SET NULL',
      syntax: 'FOREIGN KEY (customer_id) REFERENCES customers (id) ON DELETE SET NULL',
      explanation:
        '`ON DELETE SET NULL` keeps the referencing rows in place but nulls out the foreign key column, which only works if that column is nullable. It is the right choice when the child record should survive its parent\u2019s deletion (an order history that outlives a deleted account), unlike CASCADE which removes the children too.',
      tags: ['constraints', 'foreign-keys'],
    },
  },
  {
    id: 'pg-med-32',
    type: 'mc',
    prompt: 'What does `SAVEPOINT` let you do inside a transaction?',
    code: 'BEGIN;\nINSERT INTO logs (msg) VALUES (\'step 1\');\nSAVEPOINT before_risky;\nINSERT INTO logs (msg) VALUES (\'step 2\');\nROLLBACK TO before_risky;\nCOMMIT;',
    choices: [
      'Commit part of the transaction early',
      'Mark a point you can roll back to without discarding the whole transaction',
      'Create a backup of the entire database',
      'Pause the transaction and resume it later from another session',
    ],
    answerIndex: 1,
    query: {
      title: 'SAVEPOINT',
      syntax: 'SAVEPOINT name;\n... \nROLLBACK TO name;   -- or RELEASE SAVEPOINT name;',
      explanation:
        'A SAVEPOINT establishes a named point within an open transaction. `ROLLBACK TO` that name undoes everything since the savepoint while keeping earlier work in the transaction intact, which is how a single failed statement (say, one violating a constraint) can be recovered from without aborting the entire transaction and starting over.',
      tags: ['transactions'],
    },
  },
  {
    id: 'pg-med-33',
    type: 'bool',
    prompt: '`SET TRANSACTION ISOLATION LEVEL ...` must be issued before any query in the transaction has run, or Postgres raises an error.',
    answer: true,
    query: {
      title: 'Setting isolation level',
      syntax: 'BEGIN;\nSET TRANSACTION ISOLATION LEVEL REPEATABLE READ;\nSELECT ...;',
      explanation:
        'The isolation level determines what snapshot the transaction takes, and that snapshot is established the moment the first query runs. Because of that, Postgres requires `SET TRANSACTION ISOLATION LEVEL` (or the equivalent `BEGIN ISOLATION LEVEL ...`) to happen before any other command in the transaction, otherwise it errors rather than silently ignoring the request.',
      tags: ['transactions', 'isolation'],
    },
  },
  {
    id: 'pg-med-34',
    type: 'mc',
    prompt: 'What is the difference between `SELECT ... FOR UPDATE` and `SELECT ... FOR SHARE`?',
    choices: [
      'They are identical; FOR SHARE is just deprecated syntax',
      'FOR UPDATE takes an exclusive row lock blocking other writers and lockers; FOR SHARE takes a shared lock that still blocks writers but allows other FOR SHARE readers',
      'FOR SHARE locks the whole table, FOR UPDATE locks only one row',
      'FOR UPDATE only works inside stored procedures',
    ],
    answerIndex: 1,
    query: {
      title: 'FOR UPDATE vs FOR SHARE',
      syntax: 'SELECT * FROM accounts WHERE id = 1 FOR UPDATE;\nSELECT * FROM accounts WHERE id = 1 FOR SHARE;',
      explanation:
        'Both clauses lock the selected rows for the rest of the transaction so other transactions cannot modify them, but `FOR UPDATE` takes an exclusive lock (only one transaction may hold it), while `FOR SHARE` takes a weaker lock that multiple concurrent readers can hold simultaneously, while still preventing writes.',
      tags: ['locking'],
    },
  },
  {
    id: 'pg-med-35',
    type: 'mc',
    prompt: 'What is the main practical benefit of adding a partial index like `CREATE INDEX idx ON orders (customer_id) WHERE status = \'pending\'`?',
    choices: [
      'It indexes every row in the table, just with a smaller key',
      'It keeps the index small and fast by only covering the subset of rows the application actually queries by that filter',
      'It automatically deletes rows not matching the WHERE clause',
      'It replaces the need for a primary key',
    ],
    answerIndex: 1,
    query: {
      title: 'Partial index use case',
      syntax: "CREATE INDEX idx_pending ON orders (customer_id) WHERE status = 'pending';",
      explanation:
        'If most queries only ever care about a narrow slice of a large table (like pending orders out of a mostly-completed order history), indexing that slice alone keeps the index a fraction of the full table\u2019s size, which means faster lookups and less maintenance overhead than indexing every row, most of which the application never filters on.',
      tags: ['indexes'],
    },
  },
  {
    id: 'pg-med-36',
    type: 'bool',
    prompt: 'You can build an index on the result of an expression, like `lower(email)`, rather than on a raw column.',
    answer: true,
    query: {
      title: 'Expression (functional) indexes',
      syntax: 'CREATE INDEX idx_lower_email ON users (lower(email));',
      explanation:
        'A Postgres index can be built on any deterministic expression, not just a bare column reference. This lets a query filtering on `WHERE lower(email) = $1` use an index scan instead of a sequential scan, since a plain index on `email` cannot match a query that transforms the column before comparing.',
      tags: ['indexes'],
    },
  },
  {
    id: 'pg-med-37',
    type: 'mc',
    prompt: 'What access methods can an `EXCLUDE` constraint use, since it cannot rely on plain B-tree equality checks alone?',
    code: 'ALTER TABLE reservations ADD EXCLUDE USING gist (room_id WITH =, during WITH &&);',
    choices: [
      'Only hash indexes',
      'GiST or SP-GiST, which support operators beyond simple equality',
      'Only BRIN indexes',
      'It reuses the primary key\u2019s B-tree index directly',
    ],
    answerIndex: 1,
    query: {
      title: 'EXCLUDE constraint access methods',
      syntax: 'EXCLUDE USING gist (col WITH operator, ...)',
      explanation:
        'EXCLUDE constraints need an index type whose operator class can evaluate arbitrary operators like `&&` (overlaps), not just `=`, which rules out B-tree. GiST (and SP-GiST) support these operator classes, which is why nearly every EXCLUDE constraint in practice is declared `USING gist`.',
      tags: ['constraints'],
    },
  },
  {
    id: 'pg-med-38',
    type: 'bool',
    prompt: 'A `CHECK` constraint can reference more than one column of the same row in its condition.',
    answer: true,
    query: {
      title: 'Multi-column CHECK constraints',
      syntax: 'ALTER TABLE bookings ADD CONSTRAINT valid_range CHECK (end_date > start_date);',
      explanation:
        'A CHECK constraint\u2019s boolean expression can reference any columns of the row being inserted or updated, so it is not limited to validating a single column in isolation; it is the standard way to enforce a cross-column invariant like "end_date must be after start_date" at the database layer.',
      tags: ['constraints'],
    },
  },
  {
    id: 'pg-med-39',
    type: 'mc',
    prompt: 'What does declaring a constraint `DEFERRABLE INITIALLY DEFERRED` change about when it is checked?',
    code: 'ALTER TABLE t ADD CONSTRAINT fk_x FOREIGN KEY (x) REFERENCES y (id)\n  DEFERRABLE INITIALLY DEFERRED;',
    choices: [
      'The constraint is never checked',
      'The constraint check is postponed until COMMIT time instead of running after each statement',
      'The constraint only applies to SELECT statements',
      'The constraint is checked twice per statement',
    ],
    answerIndex: 1,
    query: {
      title: 'Deferrable constraints',
      syntax: 'CONSTRAINT ... DEFERRABLE INITIALLY DEFERRED\nSET CONSTRAINTS ALL IMMEDIATE;',
      explanation:
        'By default, constraints are checked immediately after each statement. A DEFERRABLE constraint can instead be deferred to transaction commit, which matters when a transaction temporarily violates a constraint mid-way, such as swapping two rows\u2019 unique keys, and would only be valid again once every statement in the transaction has run.',
      tags: ['constraints', 'transactions'],
    },
  },
  {
    id: 'pg-med-40',
    type: 'mc',
    prompt: 'What is a `DOMAIN` in Postgres?',
    code: "CREATE DOMAIN positive_int AS integer CHECK (VALUE > 0);\nCREATE TABLE t (qty positive_int);",
    choices: [
      'A network hostname setting for the server',
      'A user-defined data type based on an existing type, with optional constraints attached, reusable across many columns',
      'A synonym for SCHEMA',
      'A special kind of foreign key',
    ],
    answerIndex: 1,
    query: {
      title: 'CREATE DOMAIN',
      syntax: 'CREATE DOMAIN name AS base_type [CHECK (...)] [DEFAULT ...];',
      explanation:
        'A domain wraps a base type with a name and optional constraints (like a CHECK) so the same validation rule, such as "must be positive," can be applied consistently to many columns across many tables just by using the domain as the column type, rather than repeating the same CHECK on every table.',
      tags: ['data-types'],
    },
  },
  {
    id: 'pg-med-41',
    type: 'mc',
    prompt: 'How does declarative range partitioning divide a table\u2019s rows?',
    code: 'CREATE TABLE events (\n  id bigint, occurred_at timestamptz\n) PARTITION BY RANGE (occurred_at);\n\nCREATE TABLE events_2024 PARTITION OF events\n  FOR VALUES FROM (\'2024-01-01\') TO (\'2025-01-01\');',
    choices: [
      'Rows are split randomly across partitions for load balancing',
      'Each partition holds rows whose partition key falls within a defined, non-overlapping range',
      'Every partition holds an identical full copy of the data',
      'Partitioning only works on primary key columns',
    ],
    answerIndex: 1,
    query: {
      title: 'PARTITION BY RANGE',
      syntax: 'PARTITION BY RANGE (col)\n... PARTITION OF parent FOR VALUES FROM (a) TO (b);',
      explanation:
        'Range partitioning assigns each row to exactly one child table based on which non-overlapping range its partition key value falls into, which is the common pattern for time-series data (one partition per month or year), letting old partitions be dropped or archived in O(1) instead of a slow bulk DELETE.',
      tags: ['partitioning'],
    },
  },
  {
    id: 'pg-med-42',
    type: 'bool',
    prompt: 'Declarative list partitioning assigns each row to a partition based on a range of values rather than an exact match.',
    answer: false,
    query: {
      title: 'PARTITION BY LIST',
      syntax: 'CREATE TABLE orders (id bigint, region text) PARTITION BY LIST (region);\nCREATE TABLE orders_eu PARTITION OF orders FOR VALUES IN (\'DE\', \'FR\', \'ES\');',
      explanation:
        'List partitioning (as opposed to RANGE) assigns a row to a partition when its key exactly matches one of an explicit set of discrete values listed for that partition, which fits categorical data like region codes or status enums better than a continuous range would.',
      tags: ['partitioning'],
    },
  },
  {
    id: 'pg-med-43',
    type: 'mc',
    prompt: 'In the older table-inheritance style of partitioning (`INHERITS`), what does querying the parent table without `ONLY` return?',
    code: 'CREATE TABLE measurement_y2024 (...) INHERITS (measurement);\nSELECT * FROM measurement;        -- includes children\nSELECT * FROM ONLY measurement;   -- parent rows only',
    choices: [
      'Only rows physically stored in the parent table itself',
      'Rows from the parent table plus rows from every child table that inherits from it',
      'An error, because inherited tables cannot be queried together',
      'Only the schema definition, no rows',
    ],
    answerIndex: 1,
    query: {
      title: 'INHERITS and the ONLY keyword',
      syntax: 'CREATE TABLE child (...) INHERITS (parent);',
      explanation:
        'Table inheritance predates declarative partitioning and lets a child table\u2019s rows be included automatically when the parent is queried, by default. The `ONLY` keyword opts out of that automatic recursion and restricts the query to rows physically in the named table, which is also how declarative partitioning\u2019s parent tables behave under the hood.',
      tags: ['partitioning', 'inheritance'],
    },
  },
  {
    id: 'pg-med-44',
    type: 'mc',
    prompt: 'What is `pg_stat_activity` used for?',
    choices: [
      'Listing every table and its column definitions',
      'Showing currently running backend connections and the queries they are executing',
      'Storing query result caches',
      'Tracking historical index usage over the last year',
    ],
    answerIndex: 1,
    query: {
      title: 'pg_stat_activity',
      syntax: "SELECT pid, state, query, query_start FROM pg_stat_activity WHERE state != 'idle';",
      explanation:
        '`pg_stat_activity` is a system view with one row per server process, showing its backend PID, the client it serves, its current state (active, idle, idle in transaction), and the query text it is running or last ran. It is the first place to look when diagnosing a hung or long-running query in production.',
      tags: ['monitoring'],
    },
  },
  {
    id: 'pg-med-45',
    type: 'mc',
    prompt: 'What is the difference between `pg_cancel_backend(pid)` and `pg_terminate_backend(pid)`?',
    choices: [
      'They are exact aliases for the same function',
      'pg_cancel_backend asks the target process to abort its current query while keeping the connection open; pg_terminate_backend kills the whole backend process and connection',
      'pg_cancel_backend requires superuser and pg_terminate_backend does not',
      'pg_terminate_backend only works on the current session',
    ],
    answerIndex: 1,
    query: {
      title: 'Cancel vs terminate backend',
      syntax: 'SELECT pg_cancel_backend(1234);\nSELECT pg_terminate_backend(1234);',
      explanation:
        '`pg_cancel_backend` sends a soft interrupt: the running statement aborts, but the session and connection survive so the client can run another query. `pg_terminate_backend` sends a harder signal that closes the entire connection, which is closer to killing the client\u2019s network socket out from under it.',
      tags: ['monitoring', 'session-management'],
    },
  },
  {
    id: 'pg-med-46',
    type: 'bool',
    prompt: '`SHOW ALL` and `pg_settings` both expose the current server configuration parameters, but `pg_settings` is queryable with SQL `WHERE` clauses.',
    answer: true,
    query: {
      title: 'SHOW ALL vs pg_settings',
      syntax: "SHOW ALL;\nSELECT name, setting FROM pg_settings WHERE name LIKE 'work_mem%';",
      explanation:
        '`SHOW ALL` is a convenience command that prints every runtime parameter and its current value as plain text output. `pg_settings` exposes the same information as an actual system view, which means it can be filtered, joined, and queried like any other table, useful for scripting configuration checks.',
      tags: ['configuration'],
    },
  },
  {
    id: 'pg-med-47',
    type: 'mc',
    prompt: 'What does `ALTER SYSTEM SET work_mem = \'64MB\';` do differently from `SET work_mem = \'64MB\';`?',
    choices: [
      'ALTER SYSTEM only affects the current session; SET affects every connection',
      'ALTER SYSTEM writes the setting to postgresql.auto.conf so it persists across restarts and applies server-wide (after a reload for most params); SET only changes the current session',
      'They are identical in every respect',
      'ALTER SYSTEM requires stopping the whole cluster first',
    ],
    answerIndex: 1,
    query: {
      title: 'ALTER SYSTEM',
      syntax: "ALTER SYSTEM SET work_mem = '64MB';\nSELECT pg_reload_conf();",
      explanation:
        '`ALTER SYSTEM` edits `postgresql.auto.conf` (layered on top of `postgresql.conf`) so the change survives a restart and, for most parameters, takes effect cluster-wide after `pg_reload_conf()` or a restart. A plain `SET` only changes the value for the current session and is gone once that session ends.',
      tags: ['configuration'],
    },
  },
  {
    id: 'pg-med-48',
    type: 'bool',
    prompt: '`pg_size_pretty(pg_total_relation_size(\'orders\'))` includes the size of the table\u2019s indexes and TOAST data, not just the raw heap.',
    answer: true,
    query: {
      title: 'pg_total_relation_size',
      syntax: "SELECT pg_size_pretty(pg_total_relation_size('orders'));",
      explanation:
        '`pg_relation_size` reports only the main heap. `pg_total_relation_size` adds in every index on the table plus any associated TOAST table and its indexes, giving the true on-disk footprint of "the orders table" as a whole. `pg_size_pretty` just formats the raw byte count into a human-readable string like "1204 MB."',
      tags: ['monitoring', 'storage'],
    },
  },
  {
    id: 'pg-med-49',
    type: 'mc',
    prompt: 'What does the `COPY` command do that a series of individual `INSERT` statements does not?',
    code: "COPY products (id, name, price) FROM '/data/products.csv' WITH (FORMAT csv, HEADER true);",
    choices: [
      'Nothing extra, it is just shorthand for INSERT',
      'Streams rows in bulk between a file (or stdin) and a table using a much faster binary/text protocol path, bypassing per-row statement overhead',
      'Automatically deduplicates rows on load',
      'Only works for exporting data, never importing',
    ],
    answerIndex: 1,
    query: {
      title: 'COPY for bulk load',
      syntax: "COPY table_name (cols) FROM 'file' WITH (FORMAT csv, HEADER true);\nCOPY table_name TO 'file';",
      explanation:
        'COPY uses a dedicated bulk-transfer protocol that avoids parsing and planning a separate statement per row, which makes loading (or dumping) large datasets dramatically faster than issuing one INSERT per row, even when those inserts are batched inside a single transaction.',
      tags: ['bulk-operations'],
    },
  },
  {
    id: 'pg-med-50',
    type: 'mc',
    prompt: 'What is the difference between `\\copy` (in psql) and the SQL `COPY` command?',
    choices: [
      'There is no difference at all',
      '\\copy reads/writes the file on the psql client\u2019s machine and works with the client\u2019s local filesystem permissions; COPY reads/writes on the server and needs server-side filesystem access',
      '\\copy only works with CSV, COPY only works with binary format',
      '\\copy is deprecated and no longer works in modern Postgres',
    ],
    answerIndex: 1,
    query: {
      title: '\\copy vs COPY',
      syntax: "\\copy products FROM 'local_file.csv' WITH (FORMAT csv);",
      explanation:
        'Plain SQL `COPY` runs on the server process and needs a path the server itself can read or write (and superuser-ish privileges for arbitrary paths), which is a problem if your client and server are different machines. `\\copy` is a psql meta-command that streams the same data through the client connection instead, so it can reference a file on whatever machine psql is running on.',
      tags: ['bulk-operations', 'psql'],
    },
  },
  {
    id: 'pg-med-51',
    type: 'mc',
    prompt: 'What does calling `nextval(\'orders_id_seq\')` do?',
    choices: [
      'Returns the current value of the sequence without changing it',
      'Advances the sequence and returns the new, incremented value',
      'Resets the sequence back to 1',
      'Deletes the sequence object',
    ],
    answerIndex: 1,
    query: {
      title: 'nextval()',
      syntax: "SELECT nextval('orders_id_seq');",
      explanation:
        '`nextval` is the function that actually advances a sequence: each call atomically bumps the sequence\u2019s internal counter and returns the new value, which is what a `SERIAL` or `GENERATED AS IDENTITY` column\u2019s default expression calls under the hood on every insert. It is safe under concurrent access without extra locking.',
      tags: ['sequences'],
    },
  },
  {
    id: 'pg-med-52',
    type: 'bool',
    prompt: '`setval(\'orders_id_seq\', 1000)` permanently changes the column type or constraints of the table using that sequence.',
    answer: false,
    query: {
      title: 'setval()',
      syntax: "SELECT setval('orders_id_seq', 1000);",
      explanation:
        '`setval` only overwrites the sequence object\u2019s internal counter, forcing the next `nextval` call to return a value based on the new starting point; it never touches the table, column type, or constraints that happen to use the sequence as a default. A common use is realigning a sequence after a bulk data import that inserted explicit id values.',
      tags: ['sequences'],
    },
  },
  {
    id: 'pg-med-53',
    type: 'mc',
    prompt: 'What does marking a sequence `OWNED BY orders.id` accomplish?',
    code: 'ALTER SEQUENCE orders_id_seq OWNED BY orders.id;',
    choices: [
      'It gives a specific database role ownership permissions on the sequence',
      'It ties the sequence\u2019s lifecycle to that column, so dropping the column or table automatically drops the sequence too',
      'It makes the sequence read-only',
      'It shares the sequence\u2019s current value with every other sequence in the database',
    ],
    answerIndex: 1,
    query: {
      title: 'Sequence OWNED BY',
      syntax: 'ALTER SEQUENCE seq_name OWNED BY table.column;',
      explanation:
        'Without an OWNED BY link, a sequence is an independent object that survives even if the table using it is dropped, leaving orphaned sequence objects behind. `OWNED BY` (which `SERIAL` sets up automatically) makes the sequence dependent on that column, so `DROP TABLE` cleans it up too instead of leaving it dangling.',
      tags: ['sequences'],
    },
  },
  {
    id: 'pg-med-54',
    type: 'mc',
    prompt: 'What is the main practical difference between querying `information_schema.columns` and `pg_catalog.pg_attribute`?',
    choices: [
      'They return completely unrelated data',
      'information_schema is a SQL-standard, cross-database-portable view with a simplified/stable shape; pg_catalog exposes Postgres\u2019s actual internal system catalog with more detail and Postgres-specific columns',
      'pg_catalog only works for superusers',
      'information_schema is faster because it is precomputed nightly',
    ],
    answerIndex: 1,
    query: {
      title: 'information_schema vs pg_catalog',
      syntax: "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'orders';\nSELECT attname, atttypid FROM pg_catalog.pg_attribute WHERE attrelid = 'orders'::regclass;",
      explanation:
        '`information_schema` implements the SQL standard\u2019s metadata views, so the same query written against it is more likely to also work on another standard-compliant database, but it hides some Postgres-specific details. `pg_catalog` is the raw, Postgres-native system catalog everything (including information_schema) is ultimately built from, and it exposes internals like OIDs that information_schema abstracts away.',
      tags: ['catalogs'],
    },
  },
  {
    id: 'pg-med-55',
    type: 'mc',
    prompt: 'What does `to_regclass(\'orders\')` return if the table exists, versus if it does not?',
    choices: [
      'It always raises an error either way',
      'It returns the table\u2019s OID cast to a regclass (printing as the table name) if it exists, and NULL if it does not, instead of erroring',
      'It returns a boolean true/false',
      'It returns the table\u2019s row count',
    ],
    answerIndex: 1,
    query: {
      title: 'to_regclass()',
      syntax: "SELECT to_regclass('public.orders');",
      explanation:
        'Casting a text string directly to `regclass` (`\'orders\'::regclass`) errors out if the relation is missing, which is inconvenient for a existence check. `to_regclass` is the function form that instead returns NULL for a nonexistent relation, making "does this table exist" a simple NULL check rather than a caught exception.',
      tags: ['catalogs'],
    },
  },
  {
    id: 'pg-med-56',
    type: 'bool',
    prompt: 'The hidden `ctid` system column identifies a row\u2019s current physical location (block and offset) on disk, and can change after an UPDATE or VACUUM FULL.',
    answer: true,
    query: {
      title: 'ctid system column',
      syntax: 'SELECT ctid, * FROM orders WHERE id = 1;',
      explanation:
        'Every Postgres row has a hidden `ctid` giving its physical (page, offset) location within the table\u2019s file. Because Postgres never updates a row in place (MVCC), an UPDATE writes a new row version at a new ctid, and VACUUM FULL can relocate rows entirely, so ctid is only stable within a single transaction snapshot, never a durable row identifier to store elsewhere.',
      tags: ['storage', 'system-columns'],
    },
  },
  {
    id: 'pg-med-57',
    type: 'mc',
    prompt: 'What is `to_tsvector(\'english\', body)` used for?',
    code: "SELECT to_tsvector('english', 'The quick brown foxes are running');",
    choices: [
      'Converting text to a JSON array of words',
      'Producing a normalized, stemmed, stop-word-filtered representation of the text for full-text search',
      'Sorting the words in the input string alphabetically',
      'Encrypting the text column',
    ],
    answerIndex: 1,
    query: {
      title: 'to_tsvector',
      syntax: "to_tsvector('english', text) -- e.g. 'quick':2 'brown':3 'fox':4 'run':6",
      explanation:
        '`to_tsvector` runs the text through the chosen language\u2019s parser and dictionary, stripping common stop words ("the", "are") and reducing remaining words to a normalized lexeme (stemming "foxes" to "fox," "running" to "run") with their positions, producing the searchable representation full-text search matches against.',
      tags: ['full-text-search'],
    },
  },
  {
    id: 'pg-med-58',
    type: 'mc',
    prompt: 'How does `to_tsquery` combine with `@@` to perform a full-text search match?',
    code: "SELECT * FROM articles WHERE to_tsvector('english', body) @@ to_tsquery('english', 'fox & quick');",
    choices: [
      'to_tsquery parses the search terms into the same lexeme format, and @@ tests whether the tsvector satisfies that query, respecting AND/OR/NOT operators',
      '@@ performs a plain LIKE substring match',
      'to_tsquery ignores boolean operators entirely and just ORs every term',
      'The two functions are unrelated to each other',
    ],
    answerIndex: 0,
    query: {
      title: 'to_tsquery and @@',
      syntax: "tsvector_col @@ to_tsquery('english', 'term1 & term2')",
      explanation:
        '`to_tsquery` normalizes search terms the same way `to_tsvector` normalizes document text (so "foxes" in the query still matches "fox" in the document), and lets you combine terms with `&` (AND), `|` (OR), and `!` (NOT). The `@@` match operator then tests document-vector-satisfies-query, and can be backed by a GIN index for speed.',
      tags: ['full-text-search'],
    },
  },
  {
    id: 'pg-med-59',
    type: 'mc',
    prompt: 'What does the range type `int4range(1, 10)` represent by default?',
    choices: [
      'The two separate integers 1 and 10, nothing else',
      'A single value covering integers from 1 inclusive up to but not including 10',
      'A random integer between 1 and 10',
      'An array of every integer from 1 to 10',
    ],
    answerIndex: 1,
    query: {
      title: 'int4range',
      syntax: "SELECT int4range(1, 10);  -- [1,10)\nSELECT int4range(1, 10, '[]');  -- [1,10] inclusive both ends",
      explanation:
        'A range type stores a lower and upper bound as one value, with a default bound inclusivity of `[)` (lower inclusive, upper exclusive) for discrete ranges like `int4range`. This lets you use range-native operators like `@>` (contains) and `&&` (overlaps) directly instead of writing separate `>=`/`<` comparisons on two columns.',
      tags: ['range-types'],
    },
  },
  {
    id: 'pg-med-60',
    type: 'bool',
    prompt: '`tsrange` can be checked for overlap with another `tsrange` using the `&&` operator, the same way array overlap works.',
    answer: true,
    query: {
      title: 'tsrange overlap',
      syntax: "SELECT * FROM bookings\nWHERE during && tsrange('2024-06-01 09:00', '2024-06-01 10:00');",
      explanation:
        'Range types share the same `&&` "overlaps" operator used by arrays and other range types: two `tsrange` values overlap if they share any point in time. This is exactly the operator commonly paired with a GiST index and an `EXCLUDE` constraint to prevent double-booking a resource for overlapping time windows.',
      tags: ['range-types'],
    },
  },
  {
    id: 'pg-med-61',
    type: 'mc',
    prompt: 'What does `jsonb_set(doc, \'{address,city}\', \'"Austin"\')` do?',
    code: "SELECT jsonb_set('{\"address\": {\"city\": \"Dallas\"}}'::jsonb, '{address,city}', '\"Austin\"');",
    choices: [
      'Returns an error because JSONB is immutable',
      'Returns a new jsonb value with the value at that nested path replaced, leaving the original untouched',
      'Deletes the address key entirely',
      'Appends "Austin" as a new array element',
    ],
    answerIndex: 1,
    query: {
      title: 'jsonb_set()',
      syntax: "jsonb_set(target jsonb, path text[], new_value jsonb, create_if_missing boolean)",
      explanation:
        'JSONB values are immutable, so `jsonb_set` never mutates in place, it returns a brand-new jsonb value with the value at the given path array replaced. The typical usage is `UPDATE t SET doc = jsonb_set(doc, ...) WHERE ...`, reassigning the whole column to the function\u2019s result.',
      tags: ['json'],
    },
  },
  {
    id: 'pg-med-62',
    type: 'mc',
    prompt: 'What is the difference between the `->` and `->>` operators on a jsonb column?',
    code: "SELECT doc -> 'age', doc ->> 'age' FROM users;",
    choices: [
      'There is no difference, they are aliases',
      '-> returns the value as jsonb; ->> returns the same value cast to text',
      '-> only works on arrays, ->> only works on objects',
      '-> is for reading, ->> is for writing',
    ],
    answerIndex: 1,
    query: {
      title: 'jsonb -> vs ->>',
      syntax: "doc -> 'key'   -- jsonb result, e.g. 42\ndoc ->> 'key'  -- text result, e.g. '42'",
      explanation:
        '`->` extracts a field or array element and keeps it as a jsonb value (still quoted if it was a string, still typed if it was a number), which matters if you want to chain further jsonb operators on it. `->>` extracts the same thing but unwraps it straight to text, which is what you want to compare against a plain string or number directly.',
      tags: ['json'],
    },
  },
  {
    id: 'pg-med-63',
    type: 'bool',
    prompt: 'The `#>>` operator lets you extract a value from a jsonb document using a path array, returning it as text, in a single step.',
    answer: true,
    query: {
      title: '#> and #>> path operators',
      syntax: "SELECT doc #>> '{address,city}' FROM users;",
      explanation:
        '`#>` and `#>>` are the multi-level equivalents of `->` and `->>`: instead of one key at a time, they take a text array describing a path through nested objects/arrays and return the value at that path, as jsonb (`#>`) or as text (`#>>`), avoiding a chain of repeated `->` calls for deeply nested documents.',
      tags: ['json'],
    },
  },
  {
    id: 'pg-med-64',
    type: 'mc',
    prompt: 'What is a Postgres composite type, created with `CREATE TYPE`?',
    code: 'CREATE TYPE address AS (street text, city text, zip text);\nCREATE TABLE users (id int, home address);',
    choices: [
      'A type that can only hold a single scalar value',
      'A structured type combining multiple named fields, usable as a column type, function return type, or parameter',
      'A synonym for creating a new table',
      'A special constraint type',
    ],
    answerIndex: 1,
    query: {
      title: 'Composite types',
      syntax: 'CREATE TYPE name AS (field1 type1, field2 type2, ...);',
      explanation:
        'A composite type groups several named, typed fields into one reusable structure, similar to a struct. It can be used as a column\u2019s type (storing a nested record inside one column), as the return type of a function returning multiple values, or standalone, and its fields are accessed with dot notation like `home.city`.',
      tags: ['data-types'],
    },
  },
  {
    id: 'pg-med-65',
    type: 'mc',
    prompt: 'What does `CREATE TYPE status AS ENUM (\'pending\', \'shipped\', \'delivered\')` give you that a plain text column with a CHECK constraint does not?',
    choices: [
      'Nothing extra, they behave identically in every way',
      'A type with a fixed, ordered set of labels that sorts by declared order rather than alphabetically, and is compact to store',
      'Automatic translation of the enum values into multiple languages',
      'The ability to add new values without any DDL at all',
    ],
    answerIndex: 1,
    query: {
      title: 'ENUM types',
      syntax: "CREATE TYPE status AS ENUM ('pending', 'shipped', 'delivered');\nSELECT * FROM orders ORDER BY status;  -- sorts by declaration order",
      explanation:
        'A Postgres ENUM stores each label internally and orders comparisons and sorts by the position each value was declared in, not alphabetically, which a text + CHECK approach cannot give you for free. It is also compact on disk. The tradeoff is that adding a new enum value (or reordering) requires an `ALTER TYPE` DDL change rather than just inserting a new string.',
      tags: ['data-types'],
    },
  },
  {
    id: 'pg-med-66',
    type: 'bool',
    prompt: '`gen_random_uuid()` generates a random UUID and is available in modern Postgres without needing to load a separate extension.',
    answer: true,
    query: {
      title: 'gen_random_uuid()',
      syntax: 'SELECT gen_random_uuid();\nCREATE TABLE t (id uuid PRIMARY KEY DEFAULT gen_random_uuid());',
      explanation:
        'Historically, generating a UUID required the `uuid-ossp` extension (`uuid_generate_v4()`). Since PG13, `gen_random_uuid()` ships built into core (backed by `pgcrypto`\u2019s functionality folded in), so a random v4 UUID default no longer requires an explicit `CREATE EXTENSION` step on current versions.',
      tags: ['data-types', 'uuid'],
    },
  },
  {
    id: 'pg-med-67',
    type: 'mc',
    prompt: 'What is the practical benefit of `GENERATED ALWAYS AS IDENTITY` over the older `SERIAL` for a primary key column?',
    code: 'CREATE TABLE t (id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY);',
    choices: [
      'It performs noticeably faster at insert time',
      'It is SQL-standard syntax, and with ALWAYS it prevents an explicit INSERT from silently overriding the generated value unless OVERRIDING SYSTEM VALUE is used',
      'It removes the need for a backing sequence entirely',
      'It supports non-integer identity values',
    ],
    answerIndex: 1,
    query: {
      title: 'IDENTITY columns',
      syntax: 'GENERATED ALWAYS AS IDENTITY\nGENERATED BY DEFAULT AS IDENTITY',
      explanation:
        'Both SERIAL and IDENTITY are backed by a sequence, but SERIAL is a Postgres-only convention that quietly allows any explicit value to be inserted and desync the sequence. `GENERATED ALWAYS AS IDENTITY` is the SQL-standard form and actively rejects an explicit value on INSERT unless you opt in with `OVERRIDING SYSTEM VALUE`, catching accidental id collisions earlier.',
      tags: ['schema', 'sequences'],
    },
  },
  {
    id: 'pg-med-68',
    type: 'mc',
    prompt: 'What does `GENERATED ALWAYS AS (price * quantity) STORED` create?',
    code: 'CREATE TABLE line_items (\n  price numeric, quantity int,\n  total numeric GENERATED ALWAYS AS (price * quantity) STORED\n);',
    choices: [
      'A virtual column computed on every SELECT, never written to disk',
      'A column whose value is computed from other columns and physically stored on disk, recomputed automatically whenever the row changes',
      'A trigger that must be manually invoked',
      'A column that can be directly written to in an INSERT',
    ],
    answerIndex: 1,
    query: {
      title: 'Generated (computed) columns',
      syntax: 'col_name type GENERATED ALWAYS AS (expression) STORED',
      explanation:
        'A STORED generated column\u2019s value is computed from the row\u2019s other columns at write time and physically persisted, so reads pay no extra computation cost, unlike a plain view column computed on every read. Postgres does not support the SQL-standard VIRTUAL variant (computed on read, never stored); STORED is currently the only option.',
      tags: ['schema'],
    },
  },
  {
    id: 'pg-med-69',
    type: 'mc',
    prompt: 'What is the difference between `SIMILAR TO` and the `~` operator for pattern matching?',
    choices: [
      'They are exact synonyms',
      'SIMILAR TO uses SQL-standard regex-like wildcards (%, _), while ~ uses full POSIX regular expression syntax',
      'SIMILAR TO is case-insensitive by default and ~ is not',
      '~ only works on numeric columns',
    ],
    answerIndex: 1,
    query: {
      title: 'SIMILAR TO vs ~',
      syntax: "name SIMILAR TO 'A%_son'\nname ~ '^A.*son$'",
      explanation:
        'SIMILAR TO is the SQL-standard pattern operator, using LIKE-style `%`/`_` wildcards mixed with a few regex-like extras, but it is far less expressive than real regex. The `~` (and case-insensitive `~*`) operators give you full POSIX regular expression matching, which is what most Postgres code actually reaches for over SIMILAR TO in practice.',
      tags: ['strings', 'pattern-matching'],
    },
  },
  {
    id: 'pg-med-70',
    type: 'bool',
    prompt: '`ILIKE` performs a case-insensitive pattern match, while `LIKE` is case-sensitive.',
    answer: true,
    query: {
      title: 'ILIKE',
      syntax: "SELECT * FROM users WHERE email ILIKE '%@GMAIL.com';",
      explanation:
        '`ILIKE` is a Postgres extension to the standard `LIKE` operator that folds case before comparing, so `\'Gmail\'` and `\'GMAIL\'` match the same pattern. Standard SQL only defines the case-sensitive `LIKE`; other databases need a collation change or a wrapping `UPPER()`/`LOWER()` to get the same effect.',
      tags: ['strings', 'postgres-extension'],
    },
  },
  {
    id: 'pg-med-71',
    type: 'mc',
    prompt: 'What is the practical difference between `now()`, `CURRENT_TIMESTAMP`, and `clock_timestamp()`?',
    choices: [
      'They all return exactly the same value under every circumstance',
      'now() and CURRENT_TIMESTAMP are fixed at transaction start and stay constant for the whole transaction; clock_timestamp() advances on every call, even mid-transaction',
      'CURRENT_TIMESTAMP is deprecated and no longer works',
      'clock_timestamp() only returns the date, not the time',
    ],
    answerIndex: 1,
    query: {
      title: 'now() vs clock_timestamp()',
      syntax: 'SELECT now(), clock_timestamp();',
      explanation:
        '`now()` and the SQL-standard `CURRENT_TIMESTAMP` both return the timestamp of the current transaction\u2019s start and never change again within that transaction, which is why two calls to `now()` seconds apart in the same transaction return identical values. `clock_timestamp()` bypasses that freeze and returns the actual wall-clock time at the moment it is evaluated, useful for measuring elapsed time within a transaction.',
      tags: ['datetime'],
    },
  },
  {
    id: 'pg-med-72',
    type: 'mc',
    prompt: 'What does `interval \'1 month\' + timestamp \'2024-01-31\'` evaluate to?',
    choices: [
      'An error, because January has 31 days and February does not',
      '2024-02-29 (or the last valid day of the following month), because Postgres clamps month arithmetic to a valid calendar date',
      '2024-03-02, treating a month as exactly 30 days',
      '2024-02-31, an invalid date stored as-is',
    ],
    answerIndex: 1,
    query: {
      title: 'INTERVAL arithmetic',
      syntax: "SELECT timestamp '2024-01-31' + interval '1 month';",
      explanation:
        'Postgres interval math for months/years is calendar-aware rather than a fixed number of seconds: adding a month walks the calendar forward and clamps to the last valid day of the target month when the original day doesn\u2019t exist there (Jan 31 + 1 month lands on Feb 29 in a leap year), rather than raising an error or overflowing into March.',
      tags: ['datetime'],
    },
  },
  {
    id: 'pg-med-73',
    type: 'mc',
    prompt: 'What does `date_trunc(\'week\', timestamp_col)` do?',
    code: "SELECT date_trunc('week', '2024-06-13 15:42:00'::timestamp);",
    choices: [
      'Removes the timestamp entirely, returning NULL',
      'Rounds the timestamp down to the start of its containing week (Monday 00:00 by default)',
      'Returns just the ISO week number as an integer',
      'Deletes rows older than one week',
    ],
    answerIndex: 1,
    query: {
      title: 'date_trunc()',
      syntax: "date_trunc('field', timestamp) -- field: microseconds, second, minute, hour, day, week, month, quarter, year",
      explanation:
        '`date_trunc` zeroes out every field smaller than the one requested, so truncating to `week` snaps the timestamp back to midnight on the Monday that starts that ISO week. It is the standard building block for grouping timestamped rows into daily/weekly/monthly buckets in a `GROUP BY`.',
      tags: ['datetime'],
    },
  },
  {
    id: 'pg-med-74',
    type: 'bool',
    prompt: '`EXTRACT(dow FROM date_col)` returns the day of the week as a number, with Sunday represented as 0.',
    answer: true,
    query: {
      title: 'EXTRACT(dow ...)',
      syntax: "SELECT extract(dow FROM '2024-06-16'::date);  -- Sunday -> 0",
      explanation:
        '`EXTRACT(dow FROM ...)` returns 0 for Sunday through 6 for Saturday. This trips people up because it differs from `EXTRACT(isodow FROM ...)`, which follows the ISO 8601 convention of numbering Monday as 1 through Sunday as 7, so mixing the two up silently shifts every weekday calculation by one.',
      tags: ['datetime'],
    },
  },
  {
    id: 'pg-med-75',
    type: 'mc',
    prompt: 'What does `CREATE EXTENSION pg_trgm;` add to a database?',
    choices: [
      'A new authentication method',
      'Trigram-based text similarity functions and operators, enabling fast fuzzy/similarity search and typo-tolerant matching',
      'A backup and restore tool',
      'Support for storing binary large objects',
    ],
    answerIndex: 1,
    query: {
      title: 'pg_trgm extension',
      syntax: "CREATE EXTENSION pg_trgm;\nSELECT similarity('postgres', 'postgre');\nSELECT * FROM t WHERE name % 'postgre';",
      explanation:
        '`pg_trgm` breaks text into overlapping three-character sequences (trigrams) and compares how many two strings share, giving a `similarity()` score and the `%` "similar enough" operator. Paired with a GIN or GiST trigram index, it supports both fuzzy matching and fast `LIKE \'%substring%\'` queries that a plain B-tree cannot accelerate.',
      tags: ['extensions', 'full-text-search'],
    },
  },
  {
    id: 'pg-med-76',
    type: 'bool',
    prompt: 'Every non-core Postgres feature packaged as an extension, like `pg_trgm` or `uuid-ossp`, must be explicitly enabled per-database with `CREATE EXTENSION` before its functions are usable.',
    answer: true,
    query: {
      title: 'CREATE EXTENSION',
      syntax: 'CREATE EXTENSION IF NOT EXISTS extension_name;',
      explanation:
        'Extensions ship as installable modules (SQL definitions plus, often, a compiled shared library) that must be registered per-database with `CREATE EXTENSION` before their functions, operators, or types are visible to that database\u2019s queries, even if the extension\u2019s files are already present on the server\u2019s filesystem.',
      tags: ['extensions'],
    },
  },
  {
    id: 'pg-med-77',
    type: 'mc',
    prompt: 'What does `postgres_fdw` let you do?',
    choices: [
      'Compress a database to save disk space',
      'Query tables that live on a different, remote Postgres server as if they were local tables',
      'Convert a Postgres database to a different file format',
      'Automatically shard a table across nodes',
    ],
    answerIndex: 1,
    query: {
      title: 'postgres_fdw (Foreign Data Wrapper)',
      syntax: "CREATE SERVER remote_pg FOREIGN DATA WRAPPER postgres_fdw OPTIONS (host 'other-host', dbname 'app');\nCREATE FOREIGN TABLE local_view (...) SERVER remote_pg OPTIONS (table_name 'orders');",
      explanation:
        'A foreign data wrapper is Postgres\u2019s pluggable interface for treating an external data source as if it were a local table. `postgres_fdw` specifically targets other Postgres servers, pushing filters and joins down to the remote server where possible, which is a common way to query across databases without full replication.',
      tags: ['extensions', 'foreign-data'],
    },
  },
  {
    id: 'pg-med-78',
    type: 'mc',
    prompt: 'What is a materialized view, created with `CREATE MATERIALIZED VIEW`?',
    code: 'CREATE MATERIALIZED VIEW sales_summary AS\n  SELECT region, sum(total) FROM orders GROUP BY region;\nREFRESH MATERIALIZED VIEW sales_summary;',
    choices: [
      'A view whose query is re-run live on every SELECT, exactly like a normal view',
      'A view whose query result is computed once and physically stored, only updating when explicitly REFRESHed',
      'A temporary in-memory cache that disappears on server restart, unlike a table',
      'A synonym for a partitioned table',
    ],
    answerIndex: 1,
    query: {
      title: 'Materialized views',
      syntax: 'CREATE MATERIALIZED VIEW name AS query;\nREFRESH MATERIALIZED VIEW [CONCURRENTLY] name;',
      explanation:
        'A plain view is just a stored query, re-executed against live data every time it is selected from. A materialized view instead runs the query once and persists the result set like a table, which is fast to read repeatedly but goes stale until `REFRESH MATERIALIZED VIEW` recomputes it, optionally `CONCURRENTLY` to avoid locking out readers during the refresh.',
      tags: ['views'],
    },
  },
  {
    id: 'pg-med-79',
    type: 'bool',
    prompt: 'A plain (non-materialized) `VIEW` in Postgres stores no data of its own; querying it just runs the underlying stored query against the current table data.',
    answer: true,
    query: {
      title: 'Views vs materialized views',
      syntax: 'CREATE VIEW active_users AS SELECT * FROM users WHERE deleted_at IS NULL;',
      explanation:
        'A regular view is purely a saved query definition in the catalog; it holds no rows of its own, so it is always exactly as current as the tables it selects from, at the cost of re-running that query\u2019s full cost on every access, unlike a materialized view\u2019s pre-computed, potentially stale snapshot.',
      tags: ['views'],
    },
  },
  {
    id: 'pg-med-80',
    type: 'mc',
    prompt: 'What do `LISTEN` and `NOTIFY` provide?',
    code: "-- session A:\nLISTEN new_order;\n-- session B:\nNOTIFY new_order, '{\"id\": 42}';",
    choices: [
      'A way to log every query run against the database',
      'A lightweight publish/subscribe messaging channel between sessions, without polling a table',
      'A replacement for foreign key constraints',
      'A method for renaming database objects safely',
    ],
    answerIndex: 1,
    query: {
      title: 'LISTEN / NOTIFY',
      syntax: "LISTEN channel_name;\nNOTIFY channel_name, 'optional payload';",
      explanation:
        'A session that runs `LISTEN channel` subscribes to that named channel; any session (including a different one) that runs `NOTIFY channel, payload` broadcasts a message with an optional text payload to every currently listening session, all within the same database, without either side needing to poll a table for changes.',
      tags: ['pubsub'],
    },
  },
  {
    id: 'pg-med-81',
    type: 'mc',
    prompt: 'What does `GRANT SELECT, INSERT ON orders TO app_user;` do?',
    choices: [
      'Creates a new database called app_user',
      'Gives the role app_user permission to read from and insert into the orders table',
      'Deletes the orders table and gives ownership to app_user',
      'Makes app_user a superuser',
    ],
    answerIndex: 1,
    query: {
      title: 'GRANT privileges',
      syntax: 'GRANT privilege [, ...] ON object TO role;\nREVOKE privilege [, ...] ON object FROM role;',
      explanation:
        'GRANT hands a specific privilege (SELECT, INSERT, UPDATE, DELETE, and others) on a specific object (table, schema, sequence, etc.) to a role, following the principle of granting only what is needed. REVOKE is the inverse, removing a previously granted privilege without dropping the role or the object.',
      tags: ['privileges'],
    },
  },
  {
    id: 'pg-med-82',
    type: 'bool',
    prompt: 'Postgres unifies the concepts of "user" and "group" into a single object type called a ROLE.',
    answer: true,
    query: {
      title: 'Roles unify users and groups',
      syntax: 'CREATE ROLE app_user LOGIN PASSWORD \'...\';\nCREATE ROLE readonly_group;\nGRANT readonly_group TO app_user;',
      explanation:
        'Older Postgres versions distinguished USER (a role that can log in) from GROUP (a role that cannot), but modern Postgres implements both as a single ROLE type, with a `LOGIN` attribute simply toggling whether that role can be used to connect directly. Roles can also be granted membership in other roles, which is how "groups" are modeled today.',
      tags: ['roles'],
    },
  },
  {
    id: 'pg-med-83',
    type: 'mc',
    prompt: 'What does `search_path` control?',
    code: "SET search_path TO app, public;\nSELECT * FROM orders;  -- resolves to app.orders if it exists, else public.orders",
    choices: [
      'Which columns are indexed by default',
      'The ordered list of schemas Postgres checks, in order, when a query references an unqualified table name',
      'The list of allowed database connections',
      'The default sort order for all queries',
    ],
    answerIndex: 1,
    query: {
      title: 'search_path',
      syntax: 'SHOW search_path;\nSET search_path TO schema1, schema2;',
      explanation:
        'When a query references a table without a schema prefix, Postgres resolves it by checking each schema listed in `search_path`, in order, and using the first match. This is what makes multi-schema setups convenient (no need to fully qualify every table) but also a well-known source of surprises when two schemas both define a table with the same name.',
      tags: ['schemas'],
    },
  },
  {
    id: 'pg-med-84',
    type: 'mc',
    prompt: 'What does `TABLESAMPLE SYSTEM (10)` do in a `SELECT`?',
    code: 'SELECT * FROM large_table TABLESAMPLE SYSTEM (10);',
    choices: [
      'Returns exactly the first 10 rows',
      'Returns an approximate random sample of about 10% of the table\u2019s rows, sampled by physical block for speed',
      'Returns 10 random columns instead of rows',
      'Limits the query to 10 seconds of runtime',
    ],
    answerIndex: 1,
    query: {
      title: 'TABLESAMPLE',
      syntax: 'SELECT * FROM t TABLESAMPLE SYSTEM (percentage);\nSELECT * FROM t TABLESAMPLE BERNOULLI (percentage);',
      explanation:
        'TABLESAMPLE lets a query read a statistical sample instead of the whole table. The `SYSTEM` method samples whole disk blocks at random for speed (less precise, since rows in the same block are all-or-nothing), while `BERNOULLI` evaluates every row individually for a more accurate but slower sample, both useful for quick approximate analytics on huge tables.',
      tags: ['sampling'],
    },
  },
  {
    id: 'pg-med-85',
    type: 'bool',
    prompt: '`IS DISTINCT FROM` compares two values for inequality but, unlike `<>`, treats two NULLs as not distinct from each other (i.e. equal for this purpose).',
    answer: true,
    query: {
      title: 'IS DISTINCT FROM',
      syntax: 'a IS DISTINCT FROM b   -- like <> but NULL-safe\na IS NOT DISTINCT FROM b -- like = but NULL-safe',
      explanation:
        'Ordinary `<>` and `=` follow standard SQL null propagation: comparing anything to NULL yields NULL, not true or false, which makes `NULL <> NULL` evaluate to NULL rather than false. `IS DISTINCT FROM` sidesteps that by defining NULL as equal to NULL for its own purposes, always returning a real boolean, never NULL.',
      tags: ['null', 'operators'],
    },
  },
  {
    id: 'pg-med-86',
    type: 'mc',
    prompt: 'What does `generate_series(1, 10, 2)` produce?',
    choices: [
      'A single value, 10',
      'The set of rows: 1, 3, 5, 7, 9',
      'An array literal [1,3,5,7,9]',
      'An error, because the step argument is invalid',
    ],
    answerIndex: 1,
    query: {
      title: 'generate_series()',
      syntax: 'SELECT generate_series(start, stop, step);',
      explanation:
        '`generate_series` is a set-returning function that produces one row per value from start to stop (inclusive) advancing by step, and works for integers, bigints, numerics, and timestamps (with an interval step). It is commonly used in a `FROM` clause to fill in a calendar of dates or a sequence of buckets with no gaps, even when the underlying data has gaps.',
      tags: ['set-returning-functions'],
    },
  },
  {
    id: 'pg-med-87',
    type: 'mc',
    prompt: 'What does the row constructor `ROW(1, \'a\') = ROW(1, \'a\')` let you do that comparing individual columns cannot as concisely?',
    code: "SELECT * FROM t WHERE (a, b) = (1, 'a');",
    choices: [
      'It performs a JOIN between two tables',
      'It compares multiple column values as a single composite unit in one expression, useful for equality checks or ordered comparisons across several columns at once',
      'It creates a new row in the table',
      'It sorts the table by every column simultaneously',
    ],
    answerIndex: 1,
    query: {
      title: 'Row constructors',
      syntax: '(col1, col2) = (val1, val2)\n(col1, col2) > (val1, val2)  -- lexicographic comparison',
      explanation:
        'A row constructor `(a, b, ...)` packages several values into one composite value that can be compared as a unit, which is especially handy for keyset pagination: `(created_at, id) > ($1, $2)` expresses "strictly after this cursor" lexicographically in one clause instead of an awkward chain of ORs.',
      tags: ['operators'],
    },
  },
  {
    id: 'pg-med-88',
    type: 'bool',
    prompt: 'A set-returning function like `generate_series()` or `unnest()` can be placed directly in a `FROM` clause and joined against like a table.',
    answer: true,
    query: {
      title: 'Set-returning functions in FROM',
      syntax: "SELECT d.day, o.total\nFROM generate_series('2024-01-01'::date, '2024-01-07'::date, '1 day') AS d(day)\nLEFT JOIN orders o ON o.created_at::date = d.day;",
      explanation:
        'Any function that returns a set (`generate_series`, `unnest`, `json_each`, and others) can appear in `FROM` exactly like a table reference, producing one row per element it yields, and can be given a column alias and joined against other real tables, which is how you fill gaps in sparse time-series data with a generated calendar.',
      tags: ['set-returning-functions'],
    },
  },
  {
    id: 'pg-med-89',
    type: 'mc',
    prompt: 'What does `format(\'Hello, %s! You have %s items.\', name, count)` do?',
    choices: [
      'Executes name and count as dynamic SQL',
      'Safely substitutes the arguments into the template string, with %I and %L variants for safely quoting identifiers and literals',
      'Converts the string to uppercase',
      'Only works inside PL/pgSQL, never in a plain SELECT',
    ],
    answerIndex: 1,
    query: {
      title: 'format()',
      syntax: "format('%s', value)   -- plain substitution\nformat('%I', ident)   -- quotes as identifier\nformat('%L', literal) -- quotes as literal",
      explanation:
        '`format` works like a printf-style template, but with two placeholders built specifically for safe SQL construction: `%I` quotes its argument as a double-quoted identifier and `%L` quotes it as an escaped string literal, which is the standard way to build dynamic SQL text (in `EXECUTE`, for example) without hand-rolling escaping and risking SQL injection.',
      tags: ['strings'],
    },
  },
  {
    id: 'pg-med-90',
    type: 'mc',
    prompt: 'What is the purpose of `CLUSTER orders USING idx_orders_created_at;`?',
    choices: [
      'It sets up multi-server replication for the table',
      'It physically reorders the table\u2019s rows on disk to match the order of the given index, one-time, which can speed up range scans that follow that order',
      'It creates the index if it does not already exist',
      'It partitions the table across multiple clusters',
    ],
    answerIndex: 1,
    query: {
      title: 'CLUSTER',
      syntax: 'CLUSTER table_name USING index_name;',
      explanation:
        'CLUSTER rewrites the table\u2019s heap so its physical row order matches the specified index\u2019s order, which can make range scans that follow that same order read mostly-sequential disk pages instead of scattered ones. It is a one-time operation, not maintained automatically: new rows inserted afterward are not kept in clustered order, so the benefit erodes over time until CLUSTER is run again.',
      tags: ['storage', 'maintenance'],
    },
  },
  {
    id: 'pg-med-91',
    type: 'bool',
    prompt: 'Adding a new column with `ALTER TABLE t ADD COLUMN c int DEFAULT 5;` on a large existing table in modern Postgres (11+) does not require rewriting every existing row immediately.',
    answer: true,
    query: {
      title: 'Fast column defaults',
      syntax: 'ALTER TABLE big_table ADD COLUMN status int DEFAULT 1;',
      explanation:
        'Before PG11, adding a column with a non-null default rewrote the entire table immediately, taking a long exclusive lock proportional to table size. Since PG11, a constant default is instead stored as metadata and applied lazily: existing rows report the default value virtually until they are next physically touched, making the ALTER TABLE itself nearly instant regardless of table size.',
      tags: ['ddl', 'performance'],
    },
  },
  {
    id: 'pg-med-92',
    type: 'mc',
    prompt: 'What does `DROP TABLE parent CASCADE;` do that a plain `DROP TABLE parent;` would refuse to do?',
    choices: [
      'Nothing different; CASCADE is ignored on DROP TABLE',
      'It also drops dependent objects, like views or foreign keys referencing that table, instead of erroring out because they still depend on it',
      'It cascades the drop to every table in the database',
      'It only drops the table\u2019s indexes, not the table itself',
    ],
    answerIndex: 1,
    query: {
      title: 'DROP ... CASCADE',
      syntax: 'DROP TABLE parent CASCADE;\nDROP TABLE parent RESTRICT;  -- the default: error if dependents exist',
      explanation:
        'By default (RESTRICT, implicit), Postgres refuses to drop an object that something else still depends on, like a view selecting from it or a foreign key referencing it, to avoid silently breaking other objects. `CASCADE` explicitly opts into dropping those dependents too, in the correct order, rather than requiring them to be dropped by hand first.',
      tags: ['ddl'],
    },
  },
  {
    id: 'pg-med-93',
    type: 'mc',
    prompt: 'What does `TRUNCATE orders RESTART IDENTITY;` do differently from a plain `TRUNCATE orders;`?',
    choices: [
      'Nothing, RESTART IDENTITY is not valid syntax',
      'It also resets any identity/serial sequence backing the table\u2019s columns back to its starting value, in addition to removing all rows',
      'It restarts the whole Postgres server',
      'It re-creates the table from scratch with new column definitions',
    ],
    answerIndex: 1,
    query: {
      title: 'TRUNCATE RESTART IDENTITY',
      syntax: 'TRUNCATE orders RESTART IDENTITY;\nTRUNCATE orders CONTINUE IDENTITY;  -- default: leaves sequence alone',
      explanation:
        'By default, TRUNCATE empties the table but leaves any backing identity/serial sequence wherever it was, so the next inserted row continues numbering from where it left off. `RESTART IDENTITY` additionally resets those sequences to their start value, useful for a full reset in tests or seed scripts where you want ids to begin at 1 again.',
      tags: ['ddl', 'sequences'],
    },
  },
  {
    id: 'pg-med-94',
    type: 'mc',
    prompt: 'What is `pg_locks` used for?',
    choices: [
      'Listing every password hash stored in the database',
      'Showing currently held and awaited locks across the server, including which backend holds or waits on each one',
      'Locking the entire database against all connections',
      'Storing a history of every lock ever taken, indefinitely',
    ],
    answerIndex: 1,
    query: {
      title: 'pg_locks',
      syntax: 'SELECT locktype, relation::regclass, mode, granted, pid FROM pg_locks;',
      explanation:
        '`pg_locks` is a real-time system view listing every lock currently held or being waited on in the cluster, tagged with the backend process id, lock mode, and target object. Joined against `pg_stat_activity` on `pid`, it is the standard way to diagnose a blocked query by finding out exactly what it is waiting on and who is holding it.',
      tags: ['monitoring', 'locking'],
    },
  },
  {
    id: 'pg-med-95',
    type: 'bool',
    prompt: 'Every transaction, even a read-only SELECT, is assigned a transaction ID visible via `txid_current()`.',
    answer: false,
    query: {
      title: 'txid_current() and virtual vs real transaction IDs',
      syntax: 'SELECT txid_current();',
      explanation:
        'Postgres avoids handing out a real transaction ID (which consumes a limited, wraparound-prone counter) until a transaction actually performs a write or explicitly calls a function like `txid_current()` that forces one to be assigned. A plain read-only SELECT that never calls such a function typically runs under a lightweight "virtual" transaction ID instead, never consuming a real one.',
      tags: ['transactions'],
    },
  },
  {
    id: 'pg-med-96',
    type: 'mc',
    prompt: 'What is the main difference between `current_database()` and `current_user`?',
    choices: [
      'They both return the same value, the connected role name',
      'current_database() returns the name of the database this connection is attached to; current_user returns the role name the current session is running as',
      'current_database() is deprecated in favor of current_user',
      'current_user returns the operating system username, not a database role',
    ],
    answerIndex: 1,
    query: {
      title: 'current_database() vs current_user',
      syntax: 'SELECT current_database(), current_user;',
      explanation:
        'These answer two different questions: `current_database()` tells you which of possibly several databases in the cluster the current connection is bound to (a session can\u2019t switch databases without reconnecting), while `current_user` tells you which role\u2019s privileges the session is currently evaluating under, which can change within a session via `SET ROLE`.',
      tags: ['session-management'],
    },
  },
  {
    id: 'pg-med-97',
    type: 'bool',
    prompt: 'A table name can be qualified with its schema, like `app.orders`, to bypass whatever `search_path` would otherwise resolve an unqualified `orders` to.',
    answer: true,
    query: {
      title: 'Schema-qualified table names',
      syntax: 'SELECT * FROM app.orders;  -- explicit, ignores search_path\nSELECT * FROM orders;      -- resolved via search_path',
      explanation:
        'Prefixing a table reference with its schema (`schema.table`) always names that exact relation directly, sidestepping the schema resolution order search_path would otherwise apply to a bare `orders`. This is the reliable way to reference a specific table when multiple schemas define one with the same name.',
      tags: ['schemas'],
    },
  },
  {
    id: 'pg-med-98',
    type: 'mc',
    prompt: 'What is the difference between `pg_dump` and `pg_dumpall`?',
    choices: [
      'They produce identical output for a single database',
      'pg_dump exports the contents of one database; pg_dumpall additionally captures cluster-wide objects like roles and tablespaces that live outside any single database',
      'pg_dumpall only works on the postgres superuser database',
      'pg_dump is for backups, pg_dumpall is for restoring backups',
    ],
    answerIndex: 1,
    query: {
      title: 'pg_dump vs pg_dumpall',
      syntax: 'pg_dump -Fc mydb > mydb.dump\npg_dumpall --globals-only > globals.sql',
      explanation:
        '`pg_dump` targets a single named database and its objects. Roles, tablespaces, and other cluster-level objects are not owned by any one database, so a `pg_dump` of one database omits them; `pg_dumpall` (or its `--globals-only` mode) is what actually captures those cluster-wide definitions, which is why restoring a full cluster typically needs both tools together.',
      tags: ['backup'],
    },
  },
  {
    id: 'pg-med-99',
    type: 'mc',
    prompt: 'What is the effect of `pg_restore -j 4` when restoring a custom-format dump?',
    choices: [
      'It limits the restore to only 4 tables',
      'It restores independent items (like separate tables and indexes) using 4 parallel worker jobs instead of one sequential stream',
      'It repeats the restore process 4 times for redundancy',
      'It sets the connection timeout to 4 seconds',
    ],
    answerIndex: 1,
    query: {
      title: 'pg_restore parallel jobs',
      syntax: 'pg_restore -d mydb -j 4 mydb.dump',
      explanation:
        'The custom (`-Fc`) and directory dump formats store enough structure for `pg_restore` to figure out which items have no dependency on each other, and `-j` tells it how many of those independent items (loading a table\u2019s data, building an index, etc.) to work on concurrently, which can substantially cut restore time on a machine with spare CPU and I/O headroom. Plain SQL-format dumps cannot be parallelized this way.',
      tags: ['backup'],
    },
  },
  {
    id: 'pg-med-100',
    type: 'bool',
    prompt: 'The `COMMENT ON TABLE orders IS \'...\';` statement stores documentation text in the system catalog, retrievable later with `\\d+` in psql or from `pg_description`.',
    answer: true,
    query: {
      title: 'COMMENT ON',
      syntax: "COMMENT ON TABLE orders IS 'Customer purchase records.';\nCOMMENT ON COLUMN orders.total IS 'Amount in cents.';",
      explanation:
        'COMMENT ON attaches a text description to a database object (table, column, function, index, and more) directly in the catalog via `pg_description`, rather than living only in an external wiki or migration file. `\\d+ tablename` in psql surfaces these comments alongside the schema, keeping documentation next to the thing it describes.',
      tags: ['ddl', 'documentation'],
    },
  },
];
