// Starts a throwaway postgres:17 container on a loopback port and returns its
// id and admin URL. `docker` runs one docker command and returns its stdout.
// The container is labeled with the id of the process that started it. Before
// starting, labeled containers whose starting process is gone (left behind by
// a killed run) are removed; a container without the label, or one a live
// run still uses, is never touched.
const POSTGRES_IMAGE = 'postgres:17';
const CONTAINER_PORT = '5432/tcp';
const POSTGRES_USER = 'postgres';
const PASSPHRASE_ENV = 'POSTGRES_PASSWORD';
const OWNER_LABEL = 'syntactical-test-db';

function isProcessAlive(pid: number): boolean {
    try {
        process.kill(pid, 0);
        return true;
    } catch (error) {
        // EPERM means the process exists but belongs to another user.
        return (error as NodeJS.ErrnoException).code === 'EPERM';
    }
}

function orphanedContainers(listing: string): string[] {
    return listing
        .split('\n')
        .map((line) => line.trim().split(/\s+/))
        .filter(([id, owner]) => {
            const pid = Number(owner);
            return Boolean(id) && Number.isInteger(pid) && pid > 0 && !isProcessAlive(pid);
        })
        .map(([id = '']) => id);
}

export function startTestContainer(
    docker: (args: string[], env?: NodeJS.ProcessEnv) => string,
    passphrase: string,
): { containerId: string; databaseUrl: string } {
    const { env, pid } = process;
    const listing = docker([
        'ps',
        '-a',
        '--filter',
        `label=${OWNER_LABEL}`,
        '--format',
        `{{.ID}} {{.Label "${OWNER_LABEL}"}}`,
    ]);
    for (const orphan of orphanedContainers(listing)) {
        docker(['rm', '-f', orphan]);
    }
    // The passphrase reaches docker through the environment, never the argument list.
    const containerId = docker(
        [
            'run',
            '-d',
            '--rm',
            '--label',
            `${OWNER_LABEL}=${pid}`,
            '-e',
            PASSPHRASE_ENV,
            '-p',
            `127.0.0.1::${CONTAINER_PORT}`,
            POSTGRES_IMAGE,
        ],
        { ...env, [PASSPHRASE_ENV]: passphrase },
    );
    const [binding = ''] = docker(['port', containerId, CONTAINER_PORT]).split('\n');
    const port = binding.slice(binding.lastIndexOf(':') + 1);
    return {
        containerId,
        databaseUrl: `postgres://${POSTGRES_USER}:${passphrase}@127.0.0.1:${port}/${POSTGRES_USER}`,
    };
}
