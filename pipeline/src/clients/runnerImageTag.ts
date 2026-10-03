import { fileURLToPath } from 'node:url';

import type { OracleLanguage } from '../types/OracleLanguage.js';

import { hashRunnerContext } from './hashRunnerContext.js';

const TAG_HASH_LENGTH = 12;
const tags = new Map<OracleLanguage, string>();

/** The image tag carries a hash of the build context, so an edited harness never reuses an old image. */
export function runnerImageTag(language: OracleLanguage): string {
    let tag = tags.get(language);
    if (!tag) {
        const context = fileURLToPath(new URL(`../../runners/${language}`, import.meta.url));
        tag = `syntactical-runner-${language}:${hashRunnerContext(context).slice(0, TAG_HASH_LENGTH)}`;
        tags.set(language, tag);
    }
    return tag;
}
