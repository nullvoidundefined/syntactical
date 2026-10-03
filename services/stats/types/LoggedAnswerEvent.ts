// One entry of the on-device answer event log: the answer event plus who
// owned the device when it was answered (null for a guest), whether the
// server has acknowledged it, whether it is held back from upload, and why
// (absent on entries held before reasons were recorded).
import type { AnswerEvent } from '@syntactical/progress';

export const HELD_REASONS = ['invalid-batch', 'invalid-events', 'timestamp-future', 'timestamp-past'] as const;

export type HeldReason = (typeof HELD_REASONS)[number];

export type LoggedAnswerEvent = AnswerEvent & {
  heldReason?: HeldReason;
  isHeld: boolean;
  isSynced: boolean;
  ownerUserId: string | null;
};
