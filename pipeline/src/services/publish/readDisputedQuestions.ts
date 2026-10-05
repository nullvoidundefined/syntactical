// Makes staged disputes available to publish, where an owner decision is required.
import { join } from 'node:path';
import type { Question } from '@syntactical/content-schema';
import { readDisputedCards } from '../judge/readDisputedCards.js';
export async function readDisputedQuestions(
    outRoot: string,
    languageId: string,
    difficulty: string,
): Promise<Question[]> {
    return (await readDisputedCards(join(outRoot, 'disputed', languageId, `${difficulty}.json`))).map(
        ({ question }) => question,
    );
}
