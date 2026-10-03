// The seam between the pipeline and a language model. Both the `claude -p`
// path and the Anthropic API path return schema-checked structured output.
import type { z } from 'zod';

export interface ModelRequest<T> {
    prompt: string;
    promptVersion: string;
    schema: z.ZodType<T>;
    system: string;
}

export interface ModelProvider {
    generate<T>(request: ModelRequest<T>): Promise<{ model: string; value: T }>;
}
