// Shared retry loop: ask the model, unwrap a single surrounding Markdown code
// fence if present, parse the text as JSON, and check it against the schema.
// A parse or schema failure is one failed attempt; after MAX_ATTEMPTS
// the last issue is raised as ModelOutputInvalid. A transport error from `ask`
// is not a failed attempt and propagates untouched.
import { ModelOutputInvalid } from '../types/ModelOutputInvalid.js';
import type { ModelRequest } from '../types/ModelProvider.js';

const MAX_ATTEMPTS = 3;

export interface RawModelAnswer {
    model: string;
    text: string;
}

export type AskModel = () => Promise<RawModelAnswer>;

function describeFailure(error: unknown): string {
    return error instanceof Error ? error.message : 'unreadable model output';
}

export async function generateWithRetries<T>(
    request: ModelRequest<T>,
    ask: AskModel,
): Promise<{ model: string; value: T }> {
    const { promptVersion, schema } = request;
    let lastIssue = 'no attempt made';
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
        const { model, text } = await ask();
        let json: unknown;
        try {
            const fence = /^```[^\s`]*\r?\n([\s\S]*)\r?\n```$/.exec(text.trim());
            const body = fence?.[1];
            json = JSON.parse(body !== undefined && !/^[ \t]*```/m.test(body) ? body : text);
        } catch (error) {
            lastIssue = `malformed JSON: ${describeFailure(error)}`;
            continue;
        }
        const parsed = schema.safeParse(json);
        if (parsed.success) {
            return { model, value: parsed.data };
        }
        lastIssue = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ');
    }
    throw new ModelOutputInvalid(promptVersion, lastIssue);
}
