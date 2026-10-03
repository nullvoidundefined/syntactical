// Runs the server's migrate:up or migrate:down script against one database,
// the same command a deploy runs, and returns its exit status and output
// instead of throwing, so a test asserts on the result.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const REPOSITORY_ROOT = fileURLToPath(new URL('../../../../', import.meta.url));

export function runMigrations(
    databaseUrl: string,
    direction: 'down' | 'up',
    extraArgs: string[] = [],
): { output: string; status: number | null } {
    const npmArgs = ['run', '--silent', `migrate:${direction}`, '--workspace', 'server'];
    const { status, stderr, stdout } = spawnSync(
        'npm',
        extraArgs.length > 0 ? [...npmArgs, '--', ...extraArgs] : npmArgs,
        { cwd: REPOSITORY_ROOT, encoding: 'utf8', env: { ...process.env, DATABASE_URL: databaseUrl } },
    );
    return { output: `${stdout}${stderr}`, status };
}
