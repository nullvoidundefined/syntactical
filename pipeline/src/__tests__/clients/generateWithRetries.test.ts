// The shared model retry loop parses the answer as JSON. Models often wrap that JSON in one
// Markdown code fence; on 2026-10-05 that made 40 of about 50 Ruby enrich calls fail as
// malformed JSON after three attempts each. A single surrounding fence is unwrapped; anything
// else that is not JSON still fails as before.
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { generateWithRetries } from '../../clients/generateWithRetries.js';
import { ModelOutputInvalid } from '../../types/ModelOutputInvalid.js';

const REQUEST = {
    prompt: 'p',
    promptVersion: 'test-v1',
    schema: z.object({ answerIndex: z.number().int() }),
    system: 's',
};

function answering(...texts: string[]) {
    let call = 0;
    const asked: number[] = [];
    async function ask() {
        asked.push(call);
        const text = texts[Math.min(call, texts.length - 1)] as string;
        call += 1;
        return { model: 'fake', text };
    }
    return { ask, asked };
}

describe('generateWithRetries', () => {
    it.each([
        ['a json fence', '```json\n{"answerIndex": 2}\n```'],
        ['a bare fence', '```\n{"answerIndex": 2}\n```'],
        ['a fence with surrounding whitespace', '\n  ```json\n{"answerIndex": 2}\n```  \n'],
        ['an uppercase language tag', '```JSON\n{"answerIndex": 2}\n```'],
        ['CRLF line endings', '```json\r\n{"answerIndex": 2}\r\n```'],
    ])('reads JSON wrapped in %s on the first attempt', async (_name, text) => {
        const { ask, asked } = answering(text);
        expect(await generateWithRetries(REQUEST, ask)).toEqual({ model: 'fake', value: { answerIndex: 2 } });
        expect(asked).toHaveLength(1);
    });

    it('still reads plain JSON', async () => {
        const { ask } = answering('{"answerIndex": 1}');
        expect((await generateWithRetries(REQUEST, ask)).value).toEqual({ answerIndex: 1 });
    });

    it.each([
        ['prose around a fence', 'Here you go:\n```json\n{"answerIndex": 2}\n```'],
        ['two fenced blocks', '```json\n{"answerIndex": 1}\n```\n```json\n{"answerIndex": 2}\n```'],
        ['an unclosed fence', '```json\n{"answerIndex": 2}'],
    ])('does not guess at %s and fails after three attempts', async (_name, text) => {
        const { ask, asked } = answering(text);
        await expect(generateWithRetries(REQUEST, ask)).rejects.toBeInstanceOf(ModelOutputInvalid);
        expect(asked).toHaveLength(3);
    });

    it('still applies the schema to fenced JSON', async () => {
        const { ask } = answering('```json\n{"answerIndex": "two"}\n```');
        const error = await generateWithRetries(REQUEST, ask).catch((caught: unknown) => caught);
        expect(error).toBeInstanceOf(ModelOutputInvalid);
        expect((error as Error).message).not.toContain('malformed JSON');
        expect((error as Error).message).toContain('answerIndex');
    });

    it('makes one attempt when a request asks for one', async () => {
        const { ask, asked } = answering('not json');
        await expect(generateWithRetries({ ...REQUEST, maxAttempts: 1 }, ask)).rejects.toBeInstanceOf(
            ModelOutputInvalid,
        );
        expect(asked).toHaveLength(1);
    });

    it('still makes three attempts by default', async () => {
        const { ask, asked } = answering('not json');
        await expect(generateWithRetries(REQUEST, ask)).rejects.toBeInstanceOf(ModelOutputInvalid);
        expect(asked).toHaveLength(3);
    });

    describe('lenient JSON for batch answers', () => {
        // Real batch answers on 2026-10-05 wrapped the JSON in prose and ```bash blocks the model
        // wrote as if it could run the code; about 75% of Ruby and Go batches failed to parse.
        const LENIENT = { ...REQUEST, lenientJson: true };

        it.each([
            ['prose before one json fence', 'Here are the cards:\n```json\n{"answerIndex": 2}\n```'],
            [
                'a bash block, then a json fence',
                '```bash\ncd /tmp && ruby -e "p 1"\n```\n```json\n{"answerIndex": 2}\n```',
            ],
            ['CRLF line endings around a json fence', 'Cards:\r\n```json\r\n{"answerIndex": 2}\r\n```\r\n'],
            ['a bash block, then bare JSON', '```bash\ncd /tmp\n```\nResult:\n{"answerIndex": 2}\nDone.'],
        ])('reads the answer from %s', async (_name, text) => {
            const { ask, asked } = answering(text);
            expect((await generateWithRetries(LENIENT, ask)).value).toEqual({ answerIndex: 2 });
            expect(asked).toHaveLength(1);
        });

        it('does not guess between two json fences', async () => {
            const { ask } = answering('```json\n{"answerIndex": 1}\n```\n```json\n{"answerIndex": 2}\n```');
            await expect(generateWithRetries(LENIENT, ask)).rejects.toBeInstanceOf(ModelOutputInvalid);
        });

        it('keeps strict parsing for requests that do not ask for leniency', async () => {
            const { ask } = answering('Here are the cards:\n```json\n{"answerIndex": 2}\n```');
            await expect(generateWithRetries(REQUEST, ask)).rejects.toBeInstanceOf(ModelOutputInvalid);
        });
    });
});
