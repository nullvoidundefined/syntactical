// Thrown from inside fillBank when the run's streak of dropped batches reaches the cap. It
// carries the bank's tallies so far, because the bank never returns normally and the
// partial report must still count what it generated and dropped before the stop.
import type { FillBankResult } from './FillBankResult.js';

export class ProviderFailureStop extends Error {
    readonly partial: FillBankResult;

    constructor(bankKey: string, topic: string, streak: number, partial: FillBankResult) {
        super(`${bankKey} ${topic}: stopping after ${streak} consecutive dropped batches`);
        this.name = 'ProviderFailureStop';
        this.partial = partial;
    }
}
