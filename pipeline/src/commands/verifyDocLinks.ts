// `pipeline verify-doc-links`: checks every documentation link in the staged references (see
// verifyDocLink) and records each URL's result in `<pipelineDir>/references/doc-links.json`.
// It needs no model, only network access to the documentation hosts. A URL that already passed
// is not fetched again unless `recheck` is set; a failed one is always retried.
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

import type { SourceFetcher } from '../clients/sourceFetcher.js';
import { writeJsonAtomic } from '../services/classify/writeJsonAtomic.js';
import { DOC_HOSTS } from '../services/references/DOC_HOSTS.js';
import { readDocLinkChecks } from '../services/references/readDocLinkChecks.js';
import { readReferences } from '../services/references/readReferences.js';
import { verifyDocLink } from '../services/references/verifyDocLink.js';
import { sanitizeLogText } from '../services/sanitizeLogText.js';

export interface VerifyDocLinksOptions {
    // Builds a fetcher limited to one track's documentation hosts.
    createFetcher: (allowedHosts: readonly string[]) => SourceFetcher;
    log: (line: string) => void;
    now: () => string;
    pipelineDir: string;
    recheck?: boolean;
}

async function listDirectories(directory: string): Promise<string[]> {
    try {
        return (await readdir(directory, { withFileTypes: true }))
            .filter((entry) => entry.isDirectory())
            .map(({ name }) => name);
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
        throw error;
    }
}

export async function verifyDocLinks(options: VerifyDocLinksOptions): Promise<{ failed: number; passed: number }> {
    const { createFetcher, now, pipelineDir } = options;
    const log = (line: string): void => options.log(sanitizeLogText(line));
    const referencesDir = join(pipelineDir, 'references');
    const checksFile = join(referencesDir, 'doc-links.json');
    const checks = await readDocLinkChecks(checksFile);
    const tally = { failed: 0, passed: 0 };
    for (const languageId of await listDirectories(referencesDir)) {
        const hosts = DOC_HOSTS[languageId];
        if (hosts === undefined) continue;
        const fetchSource = createFetcher(hosts);
        const files = (await readdir(join(referencesDir, languageId))).filter((name) => name.endsWith('.json'));
        for (const name of files) {
            for (const { docs } of (await readReferences(join(referencesDir, languageId, name))).values()) {
                for (const { url } of docs) {
                    if (checks.get(url)?.ok === true && options.recheck !== true) continue;
                    const result = await verifyDocLink(url, fetchSource);
                    checks.set(url, { checkedAt: now(), ...result });
                    await writeJsonAtomic(checksFile, Object.fromEntries(checks));
                    if (result.ok) {
                        tally.passed += 1;
                    } else {
                        tally.failed += 1;
                        log(`${url}: failed (${result.reason})`);
                    }
                }
            }
        }
    }
    log(`doc links: ${tally.passed} passed, ${tally.failed} failed`);
    return tally;
}
