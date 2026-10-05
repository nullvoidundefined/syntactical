// Checks one finished draft: duplicate, content schema, then execution
// through the sandboxed runner. Returns the kept question, a drop, or the feedback that
// goes into the next revision.
// Topic generation supplies its card so grammar, provenance and rationales survive the same checks.
import { createHash } from 'node:crypto';

import { type Question, SUPPORTED_SCHEMA_VERSION, validateQuestionBank } from '@syntactical/content-schema';
import type { z } from 'zod';

import { runOracle } from '../../clients/dockerRunner.js';
import type { DraftEvaluation } from '../../types/DraftEvaluation.js';
import type { GenerateQuestionArgs } from '../../types/GenerateQuestionArgs.js';
import type { Oracle } from '../../types/Oracle.js';
import { validateQuestion } from '../validateQuestion.js';

import { GENERATE_PROMPT_VERSION } from './GENERATE_PROMPT_VERSION.js';
import { generateStepSchema } from './generateStepSchema.js';
import { findMissingRationale } from './findMissingRationale.js';
import { normalizePrompt } from './normalizePrompt.js';
import { runSandboxed } from './runSandboxed.js';

type Draft = NonNullable<z.infer<typeof generateStepSchema>['question']>;

const ID_HASH_LENGTH = 8;

function buildQuestion(draft: Draft, args: GenerateQuestionArgs, model: string): Question {
    const { difficulty, languageId, topic } = args;
    const { answer, answerIndex, choices, code, prompt, query, type } = draft;
    const hash = createHash('sha256').update(normalizePrompt(prompt)).digest('hex').slice(0, ID_HASH_LENGTH);
    const base = {
        id: `gen-${languageId}-${difficulty}-${hash}`,
        prompt,
        provenance: {
            isHumanReviewed: false,
            model,
            promptVersion: GENERATE_PROMPT_VERSION,
            source: 'generated',
            validation: { method: 'executed', status: 'pending' },
        },
        query,
        topic,
        ...(code === undefined ? {} : { code }),
    };
    return (type === 'mc' ? { ...base, answerIndex, choices, type } : { ...base, answer, type }) as Question;
}

function buildOracle(draft: Draft, args: GenerateQuestionArgs): Oracle {
    const { choiceCode, code, setupSql } = draft.oracle;
    return {
        code,
        language: args.language,
        ...(setupSql === undefined ? {} : { setupSql }),
        ...(choiceCode === undefined ? {} : { choiceCode }),
    };
}

export async function evaluateDraft(
    draft: Draft,
    args: GenerateQuestionArgs,
    model: string,
    topicQuestion?: Question,
): Promise<DraftEvaluation> {
    const { existingPrompts, run = runOracle, topic } = args;
    if (existingPrompts.has(normalizePrompt(draft.prompt))) {
        return { reason: 'duplicate', status: 'dropped' };
    }
    const question = topicQuestion ?? buildQuestion(draft, args, model);
    const checked = validateQuestionBank(
        { questions: [question], schemaVersion: SUPPORTED_SCHEMA_VERSION },
        { misconceptionIds: [], topicIds: [topic] },
    );
    if (!checked.isValid) {
        return { feedback: 'the draft breaks the question schema (shape, lengths, or answer index)', status: 'revise' };
    }
    if (topicQuestion) {
        const missing = findMissingRationale(question);
        if (missing) {
            return { feedback: missing, status: 'revise' };
        }
    }
    const oracle = buildOracle(draft, args);
    const result = await validateQuestion(question, oracle, (each) => runSandboxed(run, each));
    const { reason, runtimeVersion, status } = result;
    if (status !== 'passed') {
        return {
            feedback: `validation ${reason ?? status}: the oracle output did not match your answer`,
            status: 'revise',
        };
    }
    return {
        question: {
            ...question,
            provenance: {
                ...question.provenance,
                validation: { method: 'executed', status: 'passed' },
                ...(runtimeVersion === undefined ? {} : { runtimeVersion }),
            },
        },
        status: 'kept',
    };
}
