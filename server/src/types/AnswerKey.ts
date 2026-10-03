// The server's answer key: bank key (`language/difficulty`) to question id to its answer.
import type { AnswerKeyEntry } from './AnswerKeyEntry.js';

type AnswerKey = ReadonlyMap<string, ReadonlyMap<string, AnswerKeyEntry>>;

export type { AnswerKey };
