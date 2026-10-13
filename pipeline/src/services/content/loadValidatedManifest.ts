// Reads `<contentDir>/manifest.json` and validates it before any caller touches it. The
// manifest is untrusted: language ids, difficulty keys, and bank paths are joined into file
// paths by every command, so a rejected manifest stops the command here with the rule
// text kept to one clean log line.
import { join } from 'node:path';

import { type Manifest, validateManifest } from '@syntactical/content-schema';

import { readJsonFile } from '../json/readJsonFile.js';
import { sanitizeLogText } from '../sanitizeLogText.js';

export async function loadValidatedManifest(contentDir: string): Promise<Manifest> {
    const checked = validateManifest(await readJsonFile(join(contentDir, 'manifest.json')));
    if ('rule' in checked) {
        throw new Error(`Manifest rejected: ${sanitizeLogText(checked.rule)}`);
    }
    return checked.manifest;
}
