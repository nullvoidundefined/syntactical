import type { Oracle } from '../types/Oracle.js';

const POSTGRES_DATA_TMPFS = '/pgdata:rw,noexec,nosuid,size=96m,mode=1777';

// The argument vector for `docker run`. Nothing here comes from the oracle
// content; the oracle reaches the container only on stdin. The language is a
// closed union, and it alone selects the extra mount a Postgres server needs.
export function buildDockerArgs(oracle: Oracle, image: string): string[] {
    const args = [
        'run',
        '--rm',
        '-i',
        '--network',
        'none',
        '--cpus',
        '1',
        '--memory',
        '256m',
        '--memory-swap',
        '256m',
        '--pids-limit',
        '64',
        '--read-only',
        '--tmpfs',
        '/tmp:rw,noexec,nosuid,size=64m',
        '--user',
        '10001:10001',
        '--cap-drop',
        'ALL',
        '--security-opt',
        'no-new-privileges',
    ];
    if (oracle.language === 'postgres') {
        args.push('--tmpfs', POSTGRES_DATA_TMPFS);
    }
    args.push(image);
    return args;
}
