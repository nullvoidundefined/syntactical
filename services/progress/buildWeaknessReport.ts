// The weekly weakness report from the on-device answer event log. Synced
// events stay in the log, so they count like any other. Below 20 answers
// in the last 7 days it reports how many more are needed; otherwise it
// ranks misconceptions by miss rate: an attempt is any answer to a question
// that can reveal the misconception, a miss is a wrong answer whose choice
// reveals it. A misconception needs at least 3 attempts and 1 miss to rank,
// and the top 3 are kept, ties broken by more misses, then by id.
import type { AnswerEvent } from '@syntactical/progress';

import { listQuestionMisconceptions } from '../review/listQuestionMisconceptions';
import { readMisconception } from '../review/readMisconception';
import type { ReviewQuestion } from '../review/types/ReviewQuestion';

import type { WeaknessReport, WeakSpot } from './types/WeaknessReport';

const DAY_MS = 86_400_000;
const WINDOW_DAYS = 7;
const WINDOW_MS = WINDOW_DAYS * DAY_MS;
const MIN_WINDOW_ANSWERS = 20;
const MIN_ATTEMPTS = 3;
const TOP_COUNT = 3;

type Tally = { attempts: number; misses: number };

function compareSpots(left: WeakSpot, right: WeakSpot): number {
  const { misconceptionId: leftId, misses: leftMisses, missRate: leftRate } = left;
  const { misconceptionId: rightId, misses: rightMisses, missRate: rightRate } = right;
  if (leftRate !== rightRate) return rightRate - leftRate;
  if (leftMisses !== rightMisses) return rightMisses - leftMisses;
  return leftId < rightId ? -1 : 1;
}

function tallyEvents(events: readonly AnswerEvent[], questionIndex: ReadonlyMap<string, ReviewQuestion>): Map<string, Tally> {
  const tallies = new Map<string, Tally>();
  for (const { choiceIndex, isCorrect, questionId } of events) {
    const entry = questionIndex.get(questionId);
    if (!entry) continue;
    const missed = isCorrect ? undefined : readMisconception(questionIndex, questionId, choiceIndex);
    for (const misconceptionId of listQuestionMisconceptions(entry.question)) {
      const tally = tallies.get(misconceptionId) ?? { attempts: 0, misses: 0 };
      tally.attempts += 1;
      if (missed === misconceptionId) tally.misses += 1;
      tallies.set(misconceptionId, tally);
    }
  }
  return tallies;
}

export function buildWeaknessReport(
  events: readonly AnswerEvent[],
  questionIndex: ReadonlyMap<string, ReviewQuestion>,
  descriptions: ReadonlyMap<string, string>,
  now: Date,
): WeaknessReport {
  const windowStart = now.getTime() - WINDOW_MS;
  const seenEventIds = new Set<string>();
  const recent = events.filter(({ answeredAt, eventId }) => {
    const isFresh = Date.parse(answeredAt) >= windowStart && !seenEventIds.has(eventId);
    seenEventIds.add(eventId);
    return isFresh;
  });
  if (recent.length < MIN_WINDOW_ANSWERS) return { remaining: MIN_WINDOW_ANSWERS - recent.length, spots: [], status: 'gathering' };
  const spots = [...tallyEvents(recent, questionIndex)]
    .filter(([, { attempts, misses }]) => attempts >= MIN_ATTEMPTS && misses > 0)
    .map(([misconceptionId, { attempts, misses }]) => ({
      attempts,
      description: descriptions.get(misconceptionId) ?? misconceptionId,
      misconceptionId,
      missRate: misses / attempts,
      misses,
    }));
  return { remaining: 0, spots: spots.sort(compareSpots).slice(0, TOP_COUNT), status: 'ready' };
}
