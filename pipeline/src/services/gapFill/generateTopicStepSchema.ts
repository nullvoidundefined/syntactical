// What the model may answer on each turn of topic-track generation: run code (`execute`), a
// finished executed draft (`question`), or a draft no runner can settle (`notExecutable`), with
// cited sources. Exactly one. Strict objects, so no docker flag, image, or limit can ride along.
// `language` is a plain string here: a runner outside the track is dropped by the caller, not
// sent back for a revision.
import { GRAMMARS } from '@syntactical/content-schema';
import { z } from 'zod';

const MAX_SOURCES = 3;

const executeSchema = z.strictObject({
    code: z.string().min(1),
    language: z.string(),
    setupSql: z.string().optional(),
});

const choiceSchema = z.strictObject({ rationale: z.string().optional(), text: z.string() });

const querySchema = z.strictObject({
    explanation: z.string(),
    syntax: z.string().optional(),
    tags: z.array(z.string()).optional(),
    title: z.string(),
});

const draftFields = {
    answer: z.boolean().optional(),
    answerIndex: z.number().int().optional(),
    choices: z.array(choiceSchema).optional(),
    code: z.string().optional(),
    prompt: z.string(),
    query: querySchema,
    rationale: z.string().optional(),
    type: z.enum(['mc', 'bool']),
};

const oracleSchema = z.strictObject({
    choiceCode: z.array(z.string()).optional(),
    code: z.string().min(1),
    language: z.string(),
    setupSql: z.string().optional(),
});

const sourceSchema = z.strictObject({ quote: z.string(), title: z.string(), url: z.string() });

export const executedDraftSchema = z.strictObject({ ...draftFields, oracle: oracleSchema });

export const judgedDraftSchema = z.strictObject({
    ...draftFields,
    grammar: z.enum(GRAMMARS).optional(),
    sources: z.array(sourceSchema).min(1).max(MAX_SOURCES),
});

export const generateTopicStepSchema = z
    .strictObject({
        execute: executeSchema.optional(),
        notExecutable: z.strictObject({ question: judgedDraftSchema, reason: z.string().min(1) }).optional(),
        question: executedDraftSchema.optional(),
    })
    .refine(
        ({ execute, notExecutable, question }) =>
            [execute, notExecutable, question].filter((each) => each !== undefined).length === 1,
        {
            message: 'answer with exactly one of `execute`, `question`, or `notExecutable`',
        },
    );
