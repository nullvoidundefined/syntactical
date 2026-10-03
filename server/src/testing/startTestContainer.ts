// Starts a throwaway postgres:17 container on a loopback port and returns its
// id and admin URL. `docker` runs one docker command and returns its stdout.
const POSTGRES_IMAGE = 'postgres:17';
const CONTAINER_PORT = '5432/tcp';
const POSTGRES_USER = 'postgres';
const PASSPHRASE_ENV = 'POSTGRES_PASSWORD';

export function startTestContainer(
    docker: (args: string[], env?: NodeJS.ProcessEnv) => string,
    passphrase: string,
): { containerId: string; databaseUrl: string } {
    // The passphrase reaches docker through the environment, never the argument list.
    const containerId = docker(
        ['run', '-d', '--rm', '-e', PASSPHRASE_ENV, '-p', `127.0.0.1::${CONTAINER_PORT}`, POSTGRES_IMAGE],
        { ...process.env, [PASSPHRASE_ENV]: passphrase },
    );
    const [binding = ''] = docker(['port', containerId, CONTAINER_PORT]).split('\n');
    const port = binding.slice(binding.lastIndexOf(':') + 1);
    return {
        containerId,
        databaseUrl: `postgres://${POSTGRES_USER}:${passphrase}@127.0.0.1:${port}/${POSTGRES_USER}`,
    };
}
