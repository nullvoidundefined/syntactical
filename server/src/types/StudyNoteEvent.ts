// One stored answer event as the study note reads it.
type StudyNoteEvent = {
  bankKey: string;
  choiceIndex: number;
  isCorrect: boolean;
  questionId: string;
  roundKind: 'bank' | 'review' | 'topic';
};

export type { StudyNoteEvent };
