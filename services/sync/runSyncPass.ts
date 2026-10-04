// One sync pass: upload the user's unsynced events in batches, then page the
// server's events down. Never rejects and never logs event contents.
import { isRecord } from '@syntactical/content-schema';
import type { AnswerEvent } from '@syntactical/progress';

import type { apiFetch } from '../../clients/apiClient';
import { logWarning } from '../../clients/logClient';
import {
  HTTP_STATUS_BAD_REQUEST,
  HTTP_STATUS_MULTIPLE_CHOICES,
  HTTP_STATUS_OK,
  HTTP_STATUS_PAYLOAD_TOO_LARGE,
  HTTP_STATUS_UNPROCESSABLE,
  SYNC_MAX_PAGES_PER_PASS,
  SYNC_PAST_BOUND_MS,
} from '../../constants/appConfig';
import { isAnswerEvent } from '../stats/isAnswerEvent';
import type { HeldReason, LoggedAnswerEvent } from '../stats/types/LoggedAnswerEvent';

import { buildUploadBatches } from './buildUploadBatches';
import { releaseHeldEvents } from './releaseHeldEvents';

type SyncPassInput = {
  userId: string;
  eventLog: LoggedAnswerEvent[];
  syncCursor: string | null;
  now?: () => Date;
  // A capped user's probe: post one batch, whole, with no halving.
  isCapProbe?: boolean;
  request: typeof apiFetch;
  isCurrent(): boolean;
  markSynced(ids: string[]): void | Promise<void>;
  markHeld(ids: string[], reason: HeldReason): void | Promise<void>;
  markReleased?(ids: string[]): void | Promise<void>;
  mergeDownloaded(events: AnswerEvent[], cursor: string | null): void | Promise<void>;
};

const HALVES = 2;

type UploadOutcome = 'cap' | 'failed' | 'ok' | 'stop';

type DownloadPage = { events: AnswerEvent[]; nextCursor: string | null };

function isSuccess(status: number): boolean {
  return status >= HTTP_STATUS_OK && status < HTTP_STATUS_MULTIPLE_CHOICES;
}

function isStoredBody(body: unknown): boolean {
  return isRecord(body) && isRecord(body.data);
}

function readErrorCode(body: unknown): string | null {
  if (!isRecord(body) || !isRecord(body.error)) return null;
  return typeof body.error.code === 'string' ? body.error.code : null;
}

function readRejectedIds(body: unknown): string[] {
  if (!isRecord(body) || !isRecord(body.error) || !Array.isArray(body.error.eventIds)) return [];
  return body.error.eventIds.filter((id): id is string => typeof id === 'string');
}

function readDownloadPage(body: unknown): DownloadPage | null {
  if (!isRecord(body) || !isRecord(body.data)) return null;
  const { events, nextCursor } = body.data;
  if (!Array.isArray(events) || !events.every(isAnswerEvent)) return null;
  if (nextCursor !== null && typeof nextCursor !== 'string') return null;
  const seen = new Set<string>();
  const unique = events.filter(({ eventId }) => !seen.has(eventId) && seen.add(eventId));
  return { events: unique, nextCursor };
}

// Why an event the server refused for its timestamp is held: answered more
// than 365 days before the device clock is past; every other named event is
// future, so the release check uploads it once it is within 5 minutes.
function readTimestampReason(event: AnswerEvent, nowMs: number): HeldReason {
  return Date.parse(event.answeredAt) < nowMs - SYNC_PAST_BOUND_MS ? 'timestamp-past' : 'timestamp-future';
}

// Holds the events a 422 names and returns the rest, or null when it names none of this batch.
async function holdNamed(input: SyncPassInput, pending: AnswerEvent[], body: unknown, code: string): Promise<AnswerEvent[] | null> {
  const named = new Set(readRejectedIds(body));
  const held = pending.filter(({ eventId }) => named.has(eventId));
  if (held.length === 0) return null;
  if (code === 'SYNC_INVALID_EVENTS') {
    await input.markHeld(held.map(({ eventId }) => eventId), 'invalid-events');
  } else {
    const nowMs = (input.now ?? (() => new Date()))().getTime();
    const byReason = new Map<HeldReason, string[]>();
    for (const event of held) {
      const reason = readTimestampReason(event, nowMs);
      byReason.set(reason, [...(byReason.get(reason) ?? []), event.eventId]);
    }
    for (const [reason, ids] of byReason) await input.markHeld(ids, reason);
  }
  return pending.filter(({ eventId }) => !named.has(eventId));
}

// Posts one batch. 'stop' ends the pass at once; 'failed' (a rejected upload)
// and 'cap' (the stored-event cap, confirmed by a refused 1-event batch, or by
// any refused batch on a probe) still let the download run.
async function uploadBatch(input: SyncPassInput, batch: AnswerEvent[]): Promise<UploadOutcome> {
  let pending = batch;
  while (pending.length > 0) {
    if (!input.isCurrent()) return 'stop';
    const { body, status } = await input.request('answer-events', {
      body: { events: pending },
      method: 'POST',
    });
    if (!input.isCurrent()) return 'stop';
    if (isSuccess(status)) {
      if (!isStoredBody(body)) return 'stop';
      await input.markSynced(pending.map(({ eventId }) => eventId));
      return 'ok';
    }
    const code = readErrorCode(body);
    if (status === HTTP_STATUS_UNPROCESSABLE && code === 'SYNC_EVENT_CAP_REACHED') {
      if (pending.length === 1 || input.isCapProbe) return 'cap';
      return uploadHalves(input, pending);
    }
    if (
      (status === HTTP_STATUS_BAD_REQUEST && code === 'INPUT_INVALID_BODY') ||
      (status === HTTP_STATUS_PAYLOAD_TOO_LARGE && code === 'INPUT_PAYLOAD_TOO_LARGE')
    ) {
      await input.markHeld(pending.map(({ eventId }) => eventId), 'invalid-batch');
      return 'ok';
    }
    if (status !== HTTP_STATUS_UNPROCESSABLE || (code !== 'SYNC_INVALID_EVENTS' && code !== 'SYNC_TIMESTAMP_OUT_OF_RANGE')) {
      return 'failed';
    }
    const rest = await holdNamed(input, pending, body, code);
    // A 422 naming nothing in this batch is not understood: hold nothing and stop.
    if (rest === null) return 'failed';
    pending = rest;
  }
  return 'ok';
}

// Retries a batch the cap refused in two halves; each half that is refused is
// split again. The first refused 1-event batch ends the upload.
async function uploadHalves(input: SyncPassInput, pending: AnswerEvent[]): Promise<UploadOutcome> {
  const middle = Math.ceil(pending.length / HALVES);
  for (const half of [pending.slice(0, middle), pending.slice(middle)]) {
    const outcome = await uploadBatch(input, half);
    if (outcome !== 'ok') return outcome;
  }
  return 'ok';
}

async function downloadAll(input: SyncPassInput): Promise<boolean> {
  let cursor = input.syncCursor;
  const seenCursors = new Set<string>();
  if (cursor !== null) seenCursors.add(cursor);
  for (let pages = 0; pages < SYNC_MAX_PAGES_PER_PASS; pages += 1) {
    if (!input.isCurrent()) return false;
    const path = cursor === null ? 'answer-events' : `answer-events?after=${encodeURIComponent(cursor)}`;
    const { body, status } = await input.request(path);
    if (!input.isCurrent()) return false;
    if (!isSuccess(status)) return false;
    const page = readDownloadPage(body);
    if (page === null) return false;
    const { events, nextCursor } = page;
    // A cursor seen before in this pass would loop forever.
    if (nextCursor !== null && seenCursors.has(nextCursor)) return false;
    cursor = nextCursor ?? cursor;
    if (nextCursor !== null) seenCursors.add(nextCursor);
    await input.mergeDownloaded(events, cursor);
    if (nextCursor === null) return true;
  }
  // The page limit ends the pass; the next one resumes from the stored cursor.
  return true;
}

export async function runSyncPass(input: SyncPassInput): Promise<{ isOk: boolean; isUploadCapReached?: true }> {
  const { eventLog: log, isCapProbe, now = () => new Date(), userId } = input;
  try {
    const { eventLog, releasedIds } = releaseHeldEvents(log, userId, now());
    if (releasedIds.length > 0) await input.markReleased?.(releasedIds);
    const batches = buildUploadBatches(eventLog, userId);
    for (const batch of isCapProbe ? batches.slice(0, 1) : batches) {
      const outcome = await uploadBatch(input, batch);
      if (outcome === 'ok') continue;
      // A rejected upload does not starve the download.
      if (outcome !== 'stop' && input.isCurrent()) await downloadAll(input);
      return outcome === 'cap' ? { isOk: false, isUploadCapReached: true } : { isOk: false };
    }
    return { isOk: await downloadAll(input) };
  } catch (error) {
    logWarning({ errorName: error instanceof Error ? error.name : 'UnknownError' }, 'sync pass failed');
    return { isOk: false };
  }
}
