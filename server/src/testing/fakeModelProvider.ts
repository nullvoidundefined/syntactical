// A model provider for tests: answers with canned text (or declines, or fails) and records each
// prompt it is given, so a test can check what reached the model without the network.
import type { AskPrompt, ModelProvider } from '../clients/modelProvider.js';

interface FakeOptions {
  answer?: string;
  failure?: 'decline' | 'reject';
}

interface FakeModelProvider extends ModelProvider {
  prompts: AskPrompt[];
}

function createFakeModelProvider({ answer = 'A short answer.', failure }: FakeOptions = {}): FakeModelProvider {
  const prompts: AskPrompt[] = [];
  return {
    answer(prompt) {
      prompts.push(prompt);
      switch (failure) {
        case 'decline':
          return Promise.resolve(null);
        case 'reject':
          return Promise.reject(new Error('Model request failed'));
        default:
          return Promise.resolve(answer);
      }
    },
    prompts,
  };
}

export { createFakeModelProvider };
export type { FakeModelProvider };
