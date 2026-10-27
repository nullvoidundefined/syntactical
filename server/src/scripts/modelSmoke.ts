// The model smoke check, run before a model id changes and every day by the "Model smoke"
// workflow. By default it sends three real Ask prompts and one study-note prompt to each
// configured provider on its own (no failover) and prints one line per call; any call that fails
// or declines exits 1. With --models-only it asks each vendor's Models API whether the configured
// model still exists, and exits 1 only on a configuration failure (a 404 for a retired or
// misspelled model, a 401 or 403 for a refused key); a vendor outage prints its line and passes.
// --provider anthropic|openai narrows either mode to one provider. It never connects to a
// database, and never prints a key, a prompt, or an SDK error object.
//
//   npm run model:smoke -w server [-- [--models-only] [--provider anthropic]]
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';

import { buildAnthropicOptions } from '../clients/buildAnthropicOptions.js';
import { buildConfiguredProvider, listConfiguredModels } from '../clients/buildModelProvider.js';
import type { ConfiguredModel } from '../clients/buildModelProvider.js';
import { classifyModelFailure, ModelProviderError } from '../clients/ModelProviderError.js';
import type { ModelPrompt } from '../clients/modelProvider.js';
import { buildOpenAIOptions } from '../clients/openAIModelProvider.js';
import { loadEnv } from '../config/env.js';
import type { Env } from '../config/env.js';
import { buildAskPrompt } from '../services/buildAskPrompt.js';
import { buildStudyNotePrompt } from '../services/buildStudyNotePrompt.js';
import { readServerQuestions } from '../services/readServerQuestions.js';
import type { StudySummary } from '../types/StudySummary.js';

const DEFAULT_CONTENT_DIR = fileURLToPath(new URL('../../../content', import.meta.url));
// The banks the Ask prompts come from: one per difficulty, across three languages.
const ASK_BANKS = ['python/easy', 'postgres/medium', 'javascript/hard'];
const ASK_MESSAGE = 'Why is this the right answer, and what would change if the code were slightly different?';
const SNIPPET_LENGTH = 80;
const PROVIDERS = ['anthropic', 'openai'] as const;

// A fixed, synthetic week: counts, labels, and misconception descriptions only, as the route sends.
const STUDY_SUMMARY: StudySummary = {
  answers: 24,
  banks: [
    { answers: 14, correct: 10, label: 'Python · Easy' },
    { answers: 10, correct: 6, label: 'JavaScript · Hard' },
  ],
  correct: 16,
  missedMisconceptions: [
    { description: 'Thinks slicing a list copies the nested lists inside it too.', misses: 3 },
    { description: 'Expects await inside forEach to wait before the next item runs.', misses: 2 },
  ],
  reviewAnswers: 5,
};

// GitHub passes an unset secret or variable as an empty string, which the env schema refuses, so
// empty values are dropped. The server's other integrations are stubbed: the script uses none.
function readSmokeEnv(): Env {
  const source: NodeJS.ProcessEnv = Object.fromEntries(
    Object.entries(process.env).filter(([, value]) => value !== undefined && value !== ''),
  );
  source.ALLOW_STUBBED_INTEGRATIONS ??= 'true';
  source.DATABASE_URL ??= 'postgres://model-smoke.invalid/unused';
  return loadEnv(source);
}

function readOptions(): { isModelsOnly: boolean; provider: ConfiguredModel['id'] | undefined } {
  const { values } = parseArgs({
    options: { 'models-only': { type: 'boolean' }, provider: { type: 'string' } },
  });
  const { provider } = values;
  if (provider !== undefined && !PROVIDERS.some((id) => id === provider)) {
    throw new Error(`--provider must be one of ${PROVIDERS.join(', ')}`);
  }
  return { isModelsOnly: values['models-only'] === true, provider: provider as ConfiguredModel['id'] | undefined };
}

function statusOf(error: unknown): number | null {
  if (error instanceof ModelProviderError) return error.status;
  if (error instanceof Anthropic.APIError || error instanceof OpenAI.APIError) return error.status ?? null;
  return null;
}

function printLine(parts: Array<string | number>): void {
  console.log(parts.join('  '));
}

async function readPrompts(contentDir: string): Promise<Array<{ label: string; prompt: ModelPrompt }>> {
  const questions = await readServerQuestions(contentDir);
  const asks = ASK_BANKS.map((bankKey) => {
    const [question] = questions.get(bankKey)?.values() ?? [];
    if (question === undefined) throw new Error(`No questions in ${bankKey}`);
    return { label: `ask ${bankKey}`, prompt: buildAskPrompt({ message: ASK_MESSAGE, question }) };
  });
  return [...asks, { label: 'study note', prompt: buildStudyNotePrompt(STUDY_SUMMARY) }];
}

// Sends every prompt to each provider on its own. Returns whether every call answered.
async function smokePrompts(env: Env, configured: ConfiguredModel[]): Promise<boolean> {
  const prompts = await readPrompts(process.env.CONTENT_DIR?.trim() || DEFAULT_CONTENT_DIR);
  let isAllAnswered = true;
  for (const entry of configured) {
    const provider = buildConfiguredProvider(entry, env);
    for (const { label, prompt } of prompts) {
      const started = Date.now();
      try {
        const answer = await provider.answer(prompt);
        const latency = `${Date.now() - started}ms`;
        if (answer === null) {
          isAllAnswered = false;
          printLine([entry.id, entry.model, label, 'declined', latency]);
        } else {
          const snippet = answer.replace(/\s+/g, ' ').slice(0, SNIPPET_LENGTH);
          printLine([entry.id, entry.model, label, 'answered', latency, snippet]);
        }
      } catch (error) {
        isAllAnswered = false;
        const kind = error instanceof ModelProviderError ? error.kind : 'transient';
        const status = statusOf(error) ?? 'no status';
        printLine([entry.id, entry.model, label, kind, status, `${Date.now() - started}ms`]);
      }
    }
  }
  return isAllAnswered;
}

async function retrieveModel({ id, model }: ConfiguredModel, env: Env): Promise<void> {
  if (id === 'anthropic') {
    const options = buildAnthropicOptions({
      apiKey: env.ANTHROPIC_API_KEY ?? '',
      ...(env.ANTHROPIC_WORKSPACE_ID === undefined ? {} : { workspaceId: env.ANTHROPIC_WORKSPACE_ID }),
    });
    await new Anthropic(options).models.retrieve(model);
    return;
  }
  await new OpenAI(buildOpenAIOptions(env.OPENAI_API_KEY ?? '')).models.retrieve(model);
}

// Asks each vendor whether its configured model exists. Returns whether no result was config.
async function checkModels(env: Env, configured: ConfiguredModel[]): Promise<boolean> {
  let isConfigured = true;
  for (const entry of configured) {
    try {
      await retrieveModel(entry, env);
      printLine([entry.id, entry.model, 'available']);
    } catch (error) {
      const status = statusOf(error);
      const outcome = classifyModelFailure(status, null);
      if (outcome === 'config') isConfigured = false;
      printLine([entry.id, entry.model, status ?? 'no status', outcome]);
    }
  }
  return isConfigured;
}

async function main(): Promise<number> {
  const { isModelsOnly, provider } = readOptions();
  const env = readSmokeEnv();
  const configured = listConfiguredModels(env).filter(({ id }) => provider === undefined || id === provider);
  if (configured.length === 0) {
    console.log(isModelsOnly ? 'No model key is set; nothing to check' : 'No model key is set');
    return isModelsOnly ? 0 : 1;
  }
  const isPassing = isModelsOnly ? await checkModels(env, configured) : await smokePrompts(env, configured);
  return isPassing ? 0 : 1;
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    // Only the env check, the argument check, and the content read reach here; their messages
    // name variables and paths, never values.
    console.error(error instanceof Error ? error.message : 'model smoke failed');
    process.exitCode = 1;
  },
);
