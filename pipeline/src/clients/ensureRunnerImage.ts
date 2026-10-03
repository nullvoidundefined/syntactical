import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import type { OracleLanguage } from '../types/OracleLanguage.js';

import { runnerImageTag } from './runnerImageTag.js';

const KIBIBYTE = 1024;
const DOCKER_MAX_BUFFER_MEBIBYTES = 16;
const DOCKER_MAX_BUFFER_BYTES = DOCKER_MAX_BUFFER_MEBIBYTES * KIBIBYTE * KIBIBYTE;
const builds = new Map<OracleLanguage, Promise<void>>();

function docker(args: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
        execFile('docker', args, { maxBuffer: DOCKER_MAX_BUFFER_BYTES }, (error, _stdout, stderr) => {
            if (error) {
                reject(new Error(`docker ${args[0]} failed: ${stderr || error.message}`));
                return;
            }
            resolve();
        });
    });
}

async function buildIfMissing(language: OracleLanguage): Promise<void> {
    const tag = runnerImageTag(language);
    try {
        await docker(['image', 'inspect', tag]);
        return;
    } catch (err) {
        // `docker image inspect` failing means the image is not built yet; build it below.
        console.warn(`runner image ${tag} not found, building`, err);
    }
    const context = fileURLToPath(new URL(`../../runners/${language}`, import.meta.url));
    await docker(['build', '--quiet', '-t', tag, context]);
}

export function ensureRunnerImage(language: OracleLanguage): Promise<void> {
    let build = builds.get(language);
    if (!build) {
        build = buildIfMissing(language);
        builds.set(language, build);
        build.catch((err: unknown) => {
            console.warn(`runner image build for ${language} failed`, err);
            builds.delete(language);
        });
    }
    return build;
}
