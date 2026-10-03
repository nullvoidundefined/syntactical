// Classifies one question with two independent model calls and says whether they agree
// and whether the result is trusted enough to accept (agreeing and at or above the
// confidence threshold). Output the schema rejects is reported, not thrown.
import type { Question } from '@syntactical/content-schema';

import { ModelOutputInvalid } from '../../types/ModelOutputInvalid.js';
import type { ModelProvider } from '../../types/ModelProvider.js';
import type { TwiceOutcome } from '../../types/TwiceOutcome.js';
import { classifyQuestion } from '../classifyQuestion.js';

import { CLASSIFY_CONFIDENCE_MIN } from './CLASSIFY_CONFIDENCE_MIN.js';

export async function classifyTwice(
    question: Question,
    topics: string[],
    provider: ModelProvider,
): Promise<TwiceOutcome> {
    try {
        const { confidence: firstConfidence, topic } = await classifyQuestion(question, topics, provider);
        const { confidence: secondConfidence, topic: secondTopic } = await classifyQuestion(question, topics, provider);
        const confidence = Math.min(firstConfidence, secondConfidence);
        if (topic !== secondTopic) {
            return { confidence, isAgreed: false, reason: 'disagreement', topic };
        }
        return confidence < CLASSIFY_CONFIDENCE_MIN
            ? { confidence, isAgreed: true, reason: 'low-confidence', topic }
            : { confidence, isAgreed: true, topic };
    } catch (error) {
        if (!(error instanceof ModelOutputInvalid)) {
            throw error;
        }
        return { reason: 'model-output-invalid' };
    }
}
