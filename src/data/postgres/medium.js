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
];
