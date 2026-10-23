// A model provider for tests: answers with canned text (or declines, or fails) and records each
// prompt it is given, so a test can check what reached the model without the network.
import type { ModelPrompt, ModelProvider } from '../clients/modelProvider.js';

interface FakeOptions {
  answer?: string;
  failure?: 'decline' | 'reject';
}

interface FakeModelProvider extends ModelProvider {
  prompts: ModelPrompt[];
}

function createFakeModelProvider({ answer = 'A short answer.', failure }: FakeOptions = {}): FakeModelProvider {
  const prompts: ModelPrompt[] = [];
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
