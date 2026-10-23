// What the home screen knows about this week's study note: none for a guest, while loading, or
// when it is unavailable; how many synced answers it still needs; or the note itself.
export type StudyNoteState =
  | { status: 'hidden' }
  | { remaining: number; status: 'gathering' }
  | { note: string; status: 'ready' };
