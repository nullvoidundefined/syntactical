// What the home screen knows about this week's study note: none for a guest, while loading, or
// when it is unavailable; how many synced answers it still needs; or the note itself, with the ids
// of the misconceptions its week named, most missed first (empty when it named none).
export type StudyNoteState =
  | { status: 'hidden' }
  | { remaining: number; status: 'gathering' }
  | { misconceptionIds: string[]; note: string; status: 'ready' };
