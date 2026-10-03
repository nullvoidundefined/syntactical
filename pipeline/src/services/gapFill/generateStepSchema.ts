// What the model may answer on each turn of generation: a request to run code
// (`execute`) or a finished draft (`question`), exactly one of them. Strict objects, so a
// request carrying a docker flag, an image, or a limit fails the schema and never runs.
import { z } from 'zod';

const executeSchema = z.strictObject({
    code: z.string().min(1),
    language: z.string(),
    setupSql: z.string().optional(),
});

const oracleSchema = z.strictObject({
    choiceCode: z.array(z.string()).optional(),
    code: z.string().min(1),
    setupSql: z.string().optional(),
});

const querySchema = z.strictObject({
    explanation: z.string(),
    syntax: z.string().optional(),
    tags: z.array(z.string()).optional(),
    title: z.string(),
});

const questionSchema = z.strictObject({
    answer: z.boolean().optional(),
    answerIndex: z.number().int().optional(),
    choices: z.array(z.strictObject({ text: z.string() })).optional(),
    code: z.string().optional(),
    oracle: oracleSchema,
    prompt: z.string(),
    query: querySchema,
    type: z.enum(['mc', 'bool']),
});

export const generateStepSchema = z
    .strictObject({
        execute: executeSchema.optional(),
        question: questionSchema.optional(),
    })
    .refine(({ execute, question }) => (execute === undefined) !== (question === undefined), {
        message: 'answer with exactly one of `execute` or `question`',
    });
