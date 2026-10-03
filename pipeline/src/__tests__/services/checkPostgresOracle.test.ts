// The Postgres pre-filter normalizes comments before its keyword rules. It is defense in
// depth in front of the Docker runner sandbox, which is the enforced control.
import { describe, expect, it } from 'vitest';

import { checkPostgresOracle } from '../../services/checkPostgresOracle.js';

const REFUSED: string[] = [
    // Spelled another way
    'SELECT U&"\\0070g_read_file"(\'/etc/passwd\');',
    "SELECT u&'\\0041';",
    "SELECT E'\\x41';",
    'SELECT 1 \\! id',
    '\\! id',
    'SELECT 1;\n\\i /etc/passwd',
    '   \\o /tmp/out\nSELECT 1;',
    'DO/**/$$ BEGIN PERFORM 1; END $$;',
    'DO $tag$ BEGIN PERFORM 1; END $tag$;',
    'SELECT $$text$$;',
    'SELECT $a1$x$a1$;',
    'SELECT $_1$x$_1$;',
    'SELECT $1x$x$1x$;',
    "DO 'BEGIN PERFORM 1; END';",
    "DO E'BEGIN PERFORM 1; END';",
    "DO U&'BEGIN PERFORM 1; END';",
    'DO /* x */ LANGUAGE plpgsql $$ BEGIN END $$;',
    'INSERT INTO t VALUES (1) ON CONFLICT DO NOTHING;',
    // GUC writes and SQL-string execution
    "SELECT set_config('role', 'postgres', false);",
    "SELECT set_config('session_authorization', 'postgres', false);",
    "SELECT SET_CONFIG/**/('role', 'postgres', false);",
    "SELECT query_to_xml('SEL' || 'ECT 1', true, false, '');",
    "SELECT query_to_xml_and_xmlschema('select 1', true, false, '');",
    "SELECT query_to_xmlschema('select 1', true, false, '');",
    "SELECT cursor_to_xml('c'::refcursor, 1, true, false, '');",
    "SELECT table_to_xml('t'::regclass, true, false, '');",
    "SELECT xpath_table('k', 'x', 't', '//a', 'true');",
    "EXECUTE stmt;",
    'SELECT pg_terminate_backend(1);',
    'SELECT pg_reload_conf();',
    // Keywords split by comments
    'SET/**/ROLE postgres;',
    'SET /* a */ /* b */ ROLE postgres;',
    'SET\n-- hide\nROLE postgres;',
    'SET /* a /* nested */ b */ SESSION AUTHORIZATION postgres;',
    "COPY t FROM /* x */ PROGRAM 'id';",
    'ALTER/**/SYSTEM SET x = 1;',
    'CREATE/**/EXTENSION file_fdw;',
    // Hidden behind a string that contains a comment marker
    "SELECT '--'; COPY t FROM PROGRAM 'id';",
    "SELECT '--';\nSET ROLE postgres;",
    // Unbalanced comment openers
    'SELECT 1 /* open',
    'SELECT 1 */',
    // Keywords and functions
    "COPY t FROM PROGRAM 'id';",
    'SELECT 1; -- program',
    'COPY t TO STDOUT;',
    "SELECT lo_import('/etc/passwd');",
    "SELECT lo_export(1, '/tmp/x');",
    "SELECT pg_read_file('/etc/passwd');",
    "SELECT pg_read_binary_file('/etc/passwd');",
    "SELECT pg_ls_dir('/');",
    "SELECT pg_stat_file('/etc/passwd');",
    "SELECT pg_file_write('/tmp/x', 'data', false);",
    "SELECT pg_file_unlink('/tmp/x');",
    'SELECT pg_logdir_ls();',
    'SELECT pg_current_logfile();',
    "SELECT pg_relation_filepath('t'::regclass);",
    "SELECT dblink('host=x', 'select 1');",
    'CREATE EXTENSION file_fdw;',
    'CREATE SERVER s FOREIGN DATA WRAPPER postgres_fdw;',
    'SET ROLE postgres;',
    'SET SESSION AUTHORIZATION postgres;',
    "ALTER SYSTEM SET archive_command = 'id';",
    'DO $$ BEGIN PERFORM 1; END $$;',
    'CREATE FUNCTION f() RETURNS int AS $$ SELECT 1 $$ LANGUAGE sql;',
    "CREATE OR REPLACE FUNCTION f() RETURNS int AS 'select 1' LANGUAGE sql;",
    'CREATE LANGUAGE plpython3u;',
    "LOAD 'libx';",
];

const ACCEPTED: string[] = [
    'SELECT 1 + 1',
    "SELECT 'abc' ~ '^a' AS starts, 'programming' AS word",
    'SELECT a, count(*) FROM t GROUP BY a ORDER BY a',
    'CREATE TABLE t (a int); INSERT INTO t VALUES (1), (2); SELECT sum(a) FROM t;',
    'SELECT 1 /* a plain comment */ + 2 -- another\n;',
    'SELECT $1::int, $2::text',
    "SELECT 'it''s' || ' ok', now() IS NOT NULL",
    'WITH x AS (SELECT 1 AS n) SELECT n FROM x',
];

describe('checkPostgresOracle (defense in depth; the runner sandbox is the enforced control)', () => {
    it.each(REFUSED)('refuses %j', (sql) => {
        expect(checkPostgresOracle(sql)).not.toBeNull();
    });

    it.each(ACCEPTED)('accepts %j', (sql) => {
        expect(checkPostgresOracle(sql)).toBeNull();
    });

    it('names what it refused after the comments are normalized', () => {
        expect(checkPostgresOracle('SET/**/ROLE postgres;')).toBe('set role');
        expect(checkPostgresOracle('SELECT U&"x"')).toBe('unicode escape');
        expect(checkPostgresOracle('SELECT 1 /* open')).toBe('unbalanced comment');
    });
});
