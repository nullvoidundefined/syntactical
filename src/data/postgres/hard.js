// Postgres / Hard question bank.
// Concurrency control, planner internals, and storage mechanics: the
// layer below "writing queries" that shows up in real incident reviews.

export const postgresHard = [
  {
    id: 'pg-hard-01',
    type: 'mc',
    prompt: 'What transaction isolation level does Postgres use by default?',
    choices: ['READ UNCOMMITTED', 'READ COMMITTED', 'REPEATABLE READ', 'SERIALIZABLE'],
    answerIndex: 1,
    query: {
      title: 'Default isolation level',
      syntax: "SHOW default_transaction_isolation;\nSET TRANSACTION ISOLATION LEVEL ...;",
      explanation:
        'Postgres defaults to READ COMMITTED, where each statement in a transaction sees a fresh snapshot taken at that statement\u2019s start. Note Postgres has no true READ UNCOMMITTED, it is silently treated as READ COMMITTED. This differs from MySQL\u2019s InnoDB, which defaults to REPEATABLE READ.',
      tags: ['transactions', 'isolation'],
    },
  },
  {
    id: 'pg-hard-02',
    type: 'bool',
    prompt: 'REPEATABLE READ in Postgres can still allow certain serialization anomalies that SERIALIZABLE prevents.',
    answer: true,
    query: {
      title: 'REPEATABLE READ vs SERIALIZABLE',
      syntax: 'SET TRANSACTION ISOLATION LEVEL SERIALIZABLE;',
      explanation:
        "Postgres's REPEATABLE READ gives each transaction one consistent snapshot for its whole duration, which prevents non-repeatable reads and most phantoms, but not write-skew anomalies between concurrent transactions. SERIALIZABLE adds runtime dependency tracking (SSI) to detect and abort transactions that would produce a non-serializable outcome.",
      tags: ['isolation', 'anomalies'],
    },
  },
  {
    id: 'pg-hard-03',
    type: 'mc',
    prompt: 'What mechanism lets Postgres readers avoid blocking writers (and vice versa) for the same rows?',
    choices: [
      'Row-level locking exclusively',
      'MVCC (multiversion concurrency control)',
      'Strict two-phase locking',
      'A global read/write mutex per table',
    ],
    answerIndex: 1,
    query: {
      title: 'MVCC',
      syntax: '-- every row carries xmin/xmax system columns',
      explanation:
        'Rather than locking rows for reads, Postgres gives every transaction a consistent snapshot and keeps multiple versions of a row (tagged with the `xmin`/`xmax` transaction IDs that created/deleted them) around simultaneously. A reader sees the version valid for its snapshot while a writer creates a new version, so plain reads and writes rarely block each other.',
      tags: ['mvcc', 'concurrency'],
    },
  },
  {
    id: 'pg-hard-04',
    type: 'mc',
    prompt: 'What does marking a CTE `WITH x AS MATERIALIZED (...)` guarantee (Postgres 12+)?',
    code: 'WITH x AS MATERIALIZED (\n  SELECT * FROM big_table WHERE flag = true\n)\nSELECT * FROM x JOIN other ON ...;',
    choices: [
      'The CTE is computed once as its own step and not inlined/folded into the outer query',
      'The query always runs faster',
      'The CTE becomes a permanent table in the schema',
      'The results are cached across separate sessions',
    ],
    answerIndex: 0,
    query: {
      title: 'CTE materialization fence',
      syntax: 'WITH name AS [MATERIALIZED | NOT MATERIALIZED] (subquery)',
      explanation:
        "Before PG12, CTEs were always an optimization fence, computed in isolation. Since PG12 the planner may inline a CTE into the outer query like a subquery unless you force the old behavior with MATERIALIZED. This matters when a CTE with a `WHERE` filter or a volatile function needs to run exactly once rather than being pushed down.",
      tags: ['cte', 'planner'],
    },
  },
  {
    id: 'pg-hard-05',
    type: 'bool',
    prompt: 'A Postgres advisory lock is tied to a specific table row and released automatically when that row is updated.',
    answer: false,
    query: {
      title: 'Advisory locks',
      syntax: 'SELECT pg_advisory_lock(12345);\nSELECT pg_advisory_unlock(12345);',
      explanation:
        'Advisory locks are entirely application-defined: you pick an arbitrary bigint (or two ints) as the lock key, and Postgres tracks it independent of any table or row. They are commonly used to serialize application-level operations, like a single cron job across replicas, that have no natural row to lock.',
      tags: ['locking'],
    },
  },
  {
    id: 'pg-hard-06',
    type: 'mc',
    prompt: 'What does an `EXCLUDE` constraint using `gist` let you enforce that a `UNIQUE` constraint cannot?',
    code: 'ALTER TABLE bookings ADD EXCLUDE USING gist (room_id WITH =, during WITH &&);',
    choices: [
      'Simple column-value uniqueness',
      'No two rows may have overlapping ranges/values for a given column, using a custom operator',
      'Cascading foreign key deletes',
      'Case-insensitive text uniqueness',
    ],
    answerIndex: 1,
    query: {
      title: 'EXCLUDE constraints',
      syntax: 'EXCLUDE USING gist (col1 WITH =, col2 WITH &&)',
      explanation:
        'UNIQUE only understands equality. EXCLUDE generalizes that to any operator with a GiST or SP-GiST opclass, most commonly `&&` (overlaps) on range types, which is how you enforce "no two bookings for the same room may overlap in time" directly at the schema level instead of in application code.',
      tags: ['constraints', 'ranges'],
    },
  },
  {
    id: 'pg-hard-07',
    type: 'mc',
    prompt: 'Which statistics does the query planner primarily use to estimate row counts for a plan?',
    choices: [
      'pg_stat_activity',
      'pg_class.reltuples and the histograms/MCVs in pg_statistic',
      'pg_locks',
      'pg_settings',
    ],
    answerIndex: 1,
    query: {
      title: 'Planner statistics',
      syntax: 'ANALYZE table_name;\nSELECT * FROM pg_stats WHERE tablename = \'table_name\';',
      explanation:
        '`ANALYZE` (run standalone or as part of autovacuum) samples the table and populates `pg_statistic` (exposed readably via the `pg_stats` view) with histograms, most-common-value lists, and null fractions per column, plus `pg_class.reltuples`/`relpages` for overall size. Stale statistics after a bulk load are a classic cause of a suddenly terrible plan.',
      tags: ['planner', 'statistics'],
    },
  },
  {
    id: 'pg-hard-08',
    type: 'bool',
    prompt: 'A partial index only includes rows that satisfy the `WHERE` predicate specified at index-creation time.',
    answer: true,
    query: {
      title: 'Partial indexes',
      syntax: 'CREATE INDEX idx_active ON users (id) WHERE deleted_at IS NULL;',
      explanation:
        'A partial index carries a `WHERE` clause baked into its definition, so rows that do not match are simply never entered into the index. This keeps the index small and fast for a common filtered access pattern (like "only active rows"), and Postgres will only use the index for queries whose `WHERE` clause the planner can prove implies the index predicate.',
      tags: ['indexes'],
    },
  },
  {
    id: 'pg-hard-09',
    type: 'mc',
    prompt: 'What happens to a column value once it exceeds roughly the TOAST threshold (~2KB)?',
    choices: [
      'Postgres raises an error and rejects the write',
      'It is stored out-of-line in a separate TOAST table, compressed and/or chunked',
      'The value is silently truncated to fit',
      'It is stored inline as base64 text',
    ],
    answerIndex: 1,
    query: {
      title: 'TOAST (The Oversized-Attribute Storage Technique)',
      syntax: 'SELECT pg_relation_size(reltoastrelid) FROM pg_class WHERE relname = \'t\';',
      explanation:
        'Postgres pages are fixed-size (8KB by default) and a row must fit on a page, so a large value (long text, a big jsonb blob) is moved out-of-line into a hidden companion TOAST table, split into chunks, and optionally compressed first. The main table keeps only a small pointer, which is why selecting a wide column can be far slower than selecting a narrow one on the same row.',
      tags: ['storage', 'toast'],
    },
  },
  {
    id: 'pg-hard-10',
    type: 'mc',
    prompt: 'What does `SELECT ... FOR UPDATE SKIP LOCKED` do?',
    code: 'SELECT id FROM jobs WHERE status = \'pending\'\nORDER BY id LIMIT 1\nFOR UPDATE SKIP LOCKED;',
    choices: [
      'Waits for any locked rows, then locks and updates them',
      'Skips over rows currently locked by another transaction instead of blocking on them',
      'Locks every row in the table, skipping none',
      'Disables row locking for the statement entirely',
    ],
    answerIndex: 1,
    query: {
      title: 'SKIP LOCKED',
      syntax: 'SELECT ... FOR UPDATE [SKIP LOCKED | NOWAIT]',
      explanation:
        'Without SKIP LOCKED, a `FOR UPDATE` reader blocks until a conflicting lock is released. SKIP LOCKED instead silently excludes those rows from the result set, which is the standard building block for a job-queue pattern: several workers can each grab a different "next" row without waiting on each other.',
      tags: ['locking', 'queues'],
    },
  },
];
