// A study note as study_notes keeps it: the note, and the ids of the misconceptions its summary
// named, most missed first (empty for a note stored before ids were kept).
type StoredStudyNote = { misconceptionIds: string[]; note: string };

export type { StoredStudyNote };
