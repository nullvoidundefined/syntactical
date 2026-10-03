// The manifest lists each language's topics; a language with none yet gets the closed list from
// `pipeline/topics.json`. Only `topics` is touched: the manifest build rewrites everything else.
import { readFile } from 'node:fs/promises';

import { writeJsonAtomic } from '../classify/writeJsonAtomic.js';

import { labelTopic } from './labelTopic.js';

export async function fillEmptyTopics(manifestPath: string, fallbackTopics: Record<string, string[]>): Promise<void> {
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as {
        languages: { id: string; topics: unknown[] }[];
    };
    for (const language of manifest.languages) {
        const { id, topics } = language;
        const ids = fallbackTopics[id] ?? [];
        if (topics.length === 0 && ids.length > 0) {
            language.topics = ids.map((topicId) => ({ id: topicId, label: labelTopic(topicId) }));
        }
    }
    await writeJsonAtomic(manifestPath, manifest);
}
