// Serializes the Docker test files. Each one checks "no runner container left"
// with `docker ps --filter ancestor=<image>`, which sees every file's
// containers; Vitest runs files in parallel, so without this lock one file's
// live container fails another file's check, and one file's cleanup kills
// another file's run. A directory is the lock because mkdir is atomic.
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { runnerImageTag } from '../../clients/runnerImageTag.js';
import type { OracleLanguage } from '../../types/OracleLanguage.js';

const LOCK_DIR = join(tmpdir(), 'syntactical-docker-tests.lock');
const POLL_MS = 200;
const STALE_MS = 10 * 60 * 1000;

export const DOCKER_LOCK_WAIT_MS = 600_000;

function isStale(): boolean {
    try {
        return Date.now() - statSync(LOCK_DIR).mtimeMs > STALE_MS;
    } catch {
        return false;
    }
}

export async function acquireDockerTestLock(): Promise<void> {
    for (;;) {
        try {
            mkdirSync(LOCK_DIR);
            return;
        } catch {
            if (isStale()) {
                rmSync(LOCK_DIR, { recursive: true, force: true });
                continue;
            }
            await new Promise((resolve) => setTimeout(resolve, POLL_MS));
        }
    }
}

export function releaseDockerTestLock(): void {
    rmSync(LOCK_DIR, { recursive: true, force: true });
}

export function runningRunnerContainers(language: OracleLanguage): string {
    return execFileSync(
        'docker',
        ['ps', '-q', '--filter', `ancestor=${runnerImageTag(language)}`],
        { encoding: 'utf8' },
    ).trim();
}

// Removes runner containers a failing hard-kill case left behind, so they
// cannot leak into the next case's container check. Safe only while the lock
// is held.
export function killLeftoverRunnerContainers(): void {
    for (const language of ['python', 'node', 'postgres', 'ruby', 'rails'] as const) {
        const ids = runningRunnerContainers(language).split('\n').filter(Boolean);
        if (ids.length > 0) {
            try {
                execFileSync('docker', ['kill', ...ids], { stdio: 'ignore' });
            } catch {
                // The container exited between the listing and the kill.
            }
        }
    }
}
