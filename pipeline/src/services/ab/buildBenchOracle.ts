// Wraps one option's code in a timing program for its language. The option travels as
// base64, so no quoting in the option can break out of the wrapper. The program prints one
// JSON line, `{"samples": [...]}`, of per-iteration milliseconds. Python and Node time the
// code in process; Postgres sums `EXPLAIN (ANALYZE, FORMAT JSON)` execution times from a
// helper function created next to the card's fixture SQL.
import type { Oracle } from '../../types/Oracle.js';
import type { AbSource } from '../../types/ab/AbSource.js';

import { AB_BENCH } from './AB_BENCH.js';

const { iterations, warmup } = AB_BENCH;
const TOTAL_RUNS_PER_OPTION = warmup + iterations;
const TRAILING_SEMICOLONS = /;+\s*$/;

function toBase64(text: string): string {
    return Buffer.from(text, 'utf8').toString('base64');
}

function buildPython(snippet: string): string {
    return [
        'import base64, contextlib, io, json, time',
        `source = compile(base64.b64decode("${toBase64(snippet)}").decode("utf-8"), "<option>", "exec")`,
        'samples = []',
        `for index in range(${TOTAL_RUNS_PER_OPTION}):`,
        '    started = time.perf_counter()',
        '    with contextlib.redirect_stdout(io.StringIO()):',
        '        exec(source, {"__name__": "__main__"})',
        '    elapsed = (time.perf_counter() - started) * 1000',
        `    if index >= ${warmup}:`,
        '        samples.append(elapsed)',
        'print(json.dumps({"samples": samples}))',
    ].join('\n');
}

function buildNode(snippet: string): string {
    return [
        `const source = Buffer.from("${toBase64(snippet)}", "base64").toString("utf8");`,
        'const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;',
        'const option = new AsyncFunction(source);',
        'const write = process.stdout.write.bind(process.stdout);',
        'console.log = () => {};',
        'console.info = () => {};',
        'console.debug = () => {};',
        'const samples = [];',
        `for (let index = 0; index < ${TOTAL_RUNS_PER_OPTION}; index += 1) {`,
        '    const started = performance.now();',
        '    await option();',
        '    const elapsed = performance.now() - started;',
        `    if (index >= ${warmup}) { samples.push(elapsed); }`,
        '}',
        'write(JSON.stringify({ samples }) + "\\n");',
    ].join('\n');
}

function buildPostgresSetup(snippet: string, fixtureSql: string): string {
    const statement = snippet.trim().replace(TRAILING_SEMICOLONS, '');
    return [
        fixtureSql,
        'CREATE FUNCTION bench_samples() RETURNS text LANGUAGE plpgsql AS $bench$',
        'DECLARE',
        `    statement text := convert_from(decode('${toBase64(statement)}', 'base64'), 'UTF8');`,
        '    plan json;',
        '    samples float8[] := ARRAY[]::float8[];',
        'BEGIN',
        `    FOR index IN 1..${TOTAL_RUNS_PER_OPTION} LOOP`,
        "        EXECUTE 'EXPLAIN (ANALYZE, FORMAT JSON) ' || statement INTO plan;",
        `        IF index > ${warmup} THEN`,
        "            samples := samples || (plan->0->>'Execution Time')::float8;",
        '        END IF;',
        '    END LOOP;',
        "    RETURN json_build_object('samples', samples)::text;",
        'END',
        '$bench$;',
    ].join('\n');
}

export function buildBenchOracle(snippet: string, source: AbSource): Oracle {
    const { language, setupSql = '' } = source;
    if (language === 'postgres') {
        return { code: 'SELECT bench_samples()', language, setupSql: buildPostgresSetup(snippet, setupSql) };
    }
    return { code: language === 'python' ? buildPython(snippet) : buildNode(snippet), language };
}
