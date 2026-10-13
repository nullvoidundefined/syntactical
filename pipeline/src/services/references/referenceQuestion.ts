// Writes one question's reference and keeps it only when it gives nothing away: links off the
// track's hosts are dropped, and judges on two different models must both find that what the
// learner sees before answering does not reveal the answer. When either judge finds the question
// asks what a feature does, the syntax waits until after an answer (`isSyntaxAfterAnswer`), so only
// the title and doc titles are judged. A rejected reference is rewritten up to MAX_ATTEMPTS times.
import type { Question } from '@syntactical/content-schema';

import { checkSourceUrl } from '../../clients/checkSourceUrl.js';
import type { ModelProvider } from '../../types/ModelProvider.js';
import type { StagedReference } from '../../types/StagedReference.js';

import { checkReferenceLeak } from './checkReferenceLeak.js';
import type { ReferenceTrack } from './writeReference.js';
import { writeReference } from './writeReference.js';

const MAX_ATTEMPTS = 2;

export type ReferenceOutcome =
    | { reference: StagedReference; status: 'accepted' }
    | { reasons: string[]; status: 'reveals-answer' };

export async function referenceQuestion(
    question: Question,
    track: ReferenceTrack,
    providers: { provider: ModelProvider; secondProvider: ModelProvider },
): Promise<ReferenceOutcome> {
    const { provider, secondProvider } = providers;
    const reasons: string[] = [];
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
        const written = await writeReference(question, track, provider);
        const docs = written.docs.filter(({ url }) => checkSourceUrl(url, track.hosts).ok);
        const reference = { ...written, docs };
        const verdicts = [
            await checkReferenceLeak(question, reference, provider),
            await checkReferenceLeak(question, reference, secondProvider),
        ];
        const isSyntaxAfterAnswer = verdicts.some(({ asksForDefinition }) => asksForDefinition);
        const leaks = verdicts.filter((verdict) =>
            isSyntaxAfterAnswer ? verdict.titleRevealsAnswer : verdict.revealsAnswer,
        );
        if (leaks.length === 0) {
            return {
                reference: { ...reference, ...(isSyntaxAfterAnswer ? { isSyntaxAfterAnswer } : {}) },
                status: 'accepted',
            };
        }
        reasons.push(...leaks.map(({ reason }) => reason));
    }
    return { reasons, status: 'reveals-answer' };
}
