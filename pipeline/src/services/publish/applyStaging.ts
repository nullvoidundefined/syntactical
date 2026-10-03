// Merges a question's staged results into it: the classified topic and the per-choice
// rationales and misconception tags. A `bool` question's single wrong value is choice index 0,
// and its rationale sits on the question itself. Nothing staged leaves the question as it was.
import type { Choice, Question } from '@syntactical/content-schema';

import type { EnrichedRationale } from '../../types/EnrichedRationale.js';

const BOOL_WRONG_VALUE_INDEX = 0;

function withRationale(choice: Choice, entry: EnrichedRationale | undefined): Choice {
    if (entry === undefined) {
        return choice;
    }
    const { misconceptionId, rationale } = entry;
    return { ...choice, misconceptionId, rationale };
}

export function applyStaging(
    question: Question,
    topic: string | undefined,
    enriched: EnrichedRationale[] | undefined,
): Question {
    const withTopic = topic === undefined ? question : { ...question, topic };
    if (enriched === undefined) {
        return withTopic;
    }
    if (withTopic.type === 'bool') {
        const entry = enriched.find(({ choiceIndex }) => choiceIndex === BOOL_WRONG_VALUE_INDEX);
        if (entry === undefined) {
            return withTopic;
        }
        const { misconceptionId, rationale } = entry;
        return { ...withTopic, misconceptionId, rationale };
    }
    const choices = withTopic.choices.map((choice, index) =>
        withRationale(
            choice,
            enriched.find(({ choiceIndex }) => choiceIndex === index),
        ),
    );
    return { ...withTopic, choices } as Question;
}
