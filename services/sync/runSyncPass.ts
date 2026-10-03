// One sync pass: upload the user's unsynced events in batches, then page the
// server's events down. Never rejects and never logs event contents.
import { isRecord } from '@syntactical/content-schema';
import type { AnswerEvent } from '@syntactical/progress';

import type { apiFetch } from '../../clients/apiClient';
import { logWarning } from '../../clients/logClient';
import {
  HTTP_STATUS_MULTIPLE_CHOICES,
  HTTP_STATUS_OK,
  HTTP_STATUS_UNPROCESSABLE,
  SYNC_MAX_PAGES_PER_PASS,
} from '../../constants/appConfig';
import { isAnswerEvent } from '../stats/isAnswerEvent';
import type { LoggedAnswerEvent } from '../stats/types/LoggedAnswerEvent';

import { buildUploadBatches } from './buildUploadBatches';

type SyncPassInput = {
  userId: string;
  eventLog: LoggedAnswerEvent[];
  syncCursor: string | null;
  request: typeof apiFetch;
  isCurrent(): boolean;
  markSynced(ids: string[]): void | Promise<void>;
  markHeld(ids: string[]): void | Promise<void>;
  mergeDownloaded(events: AnswerEvent[], cursor: string | null): void | Promise<void>;
};

type DownloadPage = { events: AnswerEvent[]; nextCursor: string | null };

function isSuccess(status: number): boolean {
  return status >= HTTP_STATUS_OK && status < HTTP_STATUS_MULTIPLE_CHOICES;
}

function readInserted(body: unknown): boolean {
  return isRecord(body) && isRecord(body.data) && typeof body.data.inserted === 'number';
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

// Posts one batch. 'stop' ends the pass at once; 'failed' (a rejected upload)
// still lets the download run.
async function uploadBatch(input: SyncPassInput, batch: AnswerEvent[]): Promise<'failed' | 'ok' | 'stop'> {
  let pending = batch;
  while (pending.length > 0) {
    if (!input.isCurrent()) return 'stop';
    const { body, status } = await input.request('answer-events', {
      body: { events: pending },
      method: 'POST',
    });
    if (!input.isCurrent()) return 'stop';
    if (isSuccess(status)) {
      if (!readInserted(body)) return 'stop';
      await input.markSynced(pending.map(({ eventId }) => eventId));
      return 'ok';
    }
    if (status !== HTTP_STATUS_UNPROCESSABLE) return 'failed';
    const named = new Set(readRejectedIds(body));
    const held = pending.filter(({ eventId }) => named.has(eventId));
    // A 422 naming nothing in this batch is not understood: hold nothing and stop.
    if (held.length === 0) return 'failed';
    await input.markHeld(held.map(({ eventId }) => eventId));
    pending = pending.filter(({ eventId }) => !named.has(eventId));
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

export async function runSyncPass(input: SyncPassInput): Promise<{ isOk: boolean }> {
  const { eventLog, userId } = input;
  try {
    for (const batch of buildUploadBatches(eventLog, userId)) {
      const outcome = await uploadBatch(input, batch);
      if (outcome === 'ok') continue;
      // A rejected upload does not starve the download.
      if (outcome === 'failed' && input.isCurrent()) await downloadAll(input);
      return { isOk: false };
    }
    return { isOk: await downloadAll(input) };
  } catch (error) {
    logWarning({ errorName: error instanceof Error ? error.name : 'UnknownError' }, 'sync pass failed');
    return { isOk: false };
  }
}
