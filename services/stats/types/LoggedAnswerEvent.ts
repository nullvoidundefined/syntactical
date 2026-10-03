// One entry of the on-device answer event log: the answer event plus who
// owned the device when it was answered (null for a guest), whether the
// server has acknowledged it, and whether it is held back from upload.
import type { AnswerEvent } from '@syntactical/progress';

export type LoggedAnswerEvent = AnswerEvent & { isHeld: boolean; isSynced: boolean; ownerUserId: string | null };
