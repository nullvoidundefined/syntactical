// What publishing one bank did: whether the file was written, which questions were refused,
// and the publish-validator problems that refused the whole bank (ids and rule names only).
import type { RefusedQuestion } from './RefusedQuestion.js';

export interface PublishBankResult {
    isWritten: boolean;
    problems: { id: string; rule: string }[];
    refused: RefusedQuestion[];
    written: number;
}
