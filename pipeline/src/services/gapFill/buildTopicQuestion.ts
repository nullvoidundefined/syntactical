// Turns a topic-track draft into a Question: the shared id scheme, the card's grammar, the
// rationales the draft carries, and the given validation.
import { createHash } from 'node:crypto';

import type { Grammar, Provenance, Question } from '@syntactical/content-schema';
import type { z } from 'zod';

import type { GenerateTopicQuestionArgs } from '../../types/GenerateTopicQuestionArgs.js';

import { GENERATE_TOPIC_PROMPT_VERSION } from './GENERATE_TOPIC_PROMPT_VERSION.js';
import type { executedDraftSchema } from './generateTopicStepSchema.js';
import { normalizePrompt } from './normalizePrompt.js';

const ID_HASH_LENGTH = 8;

export type TopicDraftFields = Omit<z.infer<typeof executedDraftSchema>, 'oracle'>;

export function buildTopicQuestion(
    draft: TopicDraftFields,
    args: Pick<GenerateTopicQuestionArgs, 'difficulty' | 'languageId' | 'topic'>,
    model: string,
    validation: Provenance['validation'],
    grammar: Grammar | undefined,
): Question {
    const { difficulty, languageId, topic } = args;
    const { answer, answerIndex, choices, code, prompt, query, rationale, type } = draft;
    const hash = createHash('sha256').update(normalizePrompt(prompt)).digest('hex').slice(0, ID_HASH_LENGTH);
    const base = {
        id: `gen-${languageId}-${difficulty}-${hash}`,
        prompt,
        provenance: {
            isHumanReviewed: false,
            model,
            promptVersion: GENERATE_TOPIC_PROMPT_VERSION,
            source: 'generated',
            validation,
        },
        query,
        topic,
        ...(code === undefined ? {} : { code }),
        ...(grammar === undefined ? {} : { grammar }),
    };
    if (type === 'mc') return { ...base, answerIndex, choices, type } as Question;
    return { ...base, answer, type, ...(rationale === undefined ? {} : { rationale }) } as Question;
}
