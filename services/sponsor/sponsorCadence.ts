// The results screen's sponsored card cadence, kept on the device beside the stats: rounds completed, and
// rounds completed since the last card. A card is due once SPONSOR.ROUNDS_BETWEEN rounds have passed since
// the last card (or since the first launch), so with 3 the first card lands on the third round's results
// and then every third round. A stored value that is not a cadence counts from zero; a read that fails
// changes nothing and shows no card, so a storage fault never shows extra cards. Every read and change runs
// through one queue, so two rounds recorded together never lose a count and a round that starts right
// after another reads that round's write.
import { readStoredJson } from '../../clients/readStoredJson';
import { writeJson } from '../../clients/writeJson';
import { SPONSOR, SPONSOR_CADENCE_STORAGE_KEY } from '../../constants/appConfig';

export type SponsorCadence = { completedRounds: number; roundsSinceLastCard: number };

const EMPTY: SponsorCadence = { completedRounds: 0, roundsSinceLastCard: 0 };

let queue: Promise<unknown> = Promise.resolve();

function isCount(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 0;
}

function toCadence(value: unknown): SponsorCadence {
  const { completedRounds, roundsSinceLastCard } = (value ?? {}) as Partial<Record<keyof SponsorCadence, unknown>>;
  if (Array.isArray(value) || !isCount(completedRounds) || !isCount(roundsSinceLastCard)) return EMPTY;
  return { completedRounds, roundsSinceLastCard };
}

function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task);
  queue = run.catch(() => undefined);
  return run;
}

function readCurrent(): Promise<SponsorCadence | null> {
  return readStoredJson(SPONSOR_CADENCE_STORAGE_KEY).then((read) => (read.isReadFailed ? null : toCadence(read.value)));
}

// Reads, folds, and writes one change; null (and no write) when the read failed.
function changeCadence(fold: (current: SponsorCadence) => SponsorCadence): Promise<SponsorCadence | null> {
  return enqueue(async () => {
    const current = await readCurrent();
    if (current === null) return null;
    const next = fold(current);
    await writeJson(SPONSOR_CADENCE_STORAGE_KEY, next);
    return next;
  });
}

export function shouldShowResultsCard({ roundsSinceLastCard }: SponsorCadence): boolean {
  return roundsSinceLastCard >= SPONSOR.ROUNDS_BETWEEN;
}

export function countRound({ completedRounds, roundsSinceLastCard }: SponsorCadence): SponsorCadence {
  return { completedRounds: completedRounds + 1, roundsSinceLastCard: roundsSinceLastCard + 1 };
}

// The cadence as stored now, read when a round starts; null when the read failed.
export function readSponsorCadence(): Promise<SponsorCadence | null> {
  return enqueue(readCurrent);
}

export function recordRoundCompleted(): Promise<SponsorCadence | null> {
  return changeCadence(countRound);
}

export async function recordCardShown(): Promise<void> {
  await changeCadence((current) => ({ ...current, roundsSinceLastCard: 0 }));
}
