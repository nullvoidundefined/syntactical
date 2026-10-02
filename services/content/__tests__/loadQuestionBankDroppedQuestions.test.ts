import AsyncStorage from '@react-native-async-storage/async-storage';

import { loadQuestionBank } from '../loadQuestionBank';
import {
  CONTENT_BASE_URL,
  EMPTY_BANK_CONTEXT,
  buildBankEntry,
  buildBoolQuestion,
  hashTextWithNode,
  hashUtf8Hex,
  readWarningPayloads,
  stubFetchRoutes,
} from './fixtures/contentFixtures';

const BANK_PATH = 'python/easy.json';
const BANK_URL = `${CONTENT_BASE_URL}${BANK_PATH}`;

describe('loadQuestionBank dropped questions', () => {
  beforeEach(() => AsyncStorage.clear());

  it('logs one warning naming the bank and the dropped question ids, and keeps the valid questions', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const broken = { ...buildBoolQuestion('q-broken'), prompt: '' };
    const bankText = JSON.stringify({ questions: [buildBoolQuestion('q-good'), broken], schemaVersion: 2 });
    stubFetchRoutes({ [BANK_URL]: () => Promise.resolve(bankText) });
    const bank = await loadQuestionBank({
      context: EMPTY_BANK_CONTEXT,
      contentBaseUrl: CONTENT_BASE_URL,
      difficulty: 'easy',
      entry: buildBankEntry(BANK_PATH, hashUtf8Hex(bankText)),
      hashText: hashTextWithNode,
      isHashCurrent: () => true,
      language: 'python',
    });
    expect(bank.questions.map(({ id }) => id)).toEqual(['q-good']);
    const payloads = readWarningPayloads(warnSpy);
    expect(payloads).toHaveLength(1);
    expect(payloads[0]).toMatchObject({ document: BANK_PATH, droppedQuestionIds: ['q-broken'] });
  });

  it('drops a question whose topic is not in the context built from the language manifest entry', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    const onTopic = { ...buildBoolQuestion('q-on-topic'), topic: 'goroutines' };
    const offTopic = { ...buildBoolQuestion('q-off-topic'), topic: 'not-in-manifest' };
    const bankText = JSON.stringify({ questions: [onTopic, offTopic], schemaVersion: 2 });
    stubFetchRoutes({ [BANK_URL]: () => Promise.resolve(bankText) });
    const bank = await loadQuestionBank({
      context: { misconceptionIds: [], topicIds: ['goroutines'] },
      contentBaseUrl: CONTENT_BASE_URL,
      difficulty: 'easy',
      entry: buildBankEntry(BANK_PATH, hashUtf8Hex(bankText)),
      hashText: hashTextWithNode,
      isHashCurrent: () => true,
      language: 'python',
    });
    expect(bank.questions.map(({ id }) => id)).toEqual(['q-on-topic']);
  });
});
