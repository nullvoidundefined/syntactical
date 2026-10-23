// What GET /v1/study-note needs from the caller of createApp. With no model provider (no
// ANTHROPIC_API_KEY) the route still reports how many answers are missing, and answers 503 once a
// note would be written. The clock defaults to the system clock in createApp.
import type { Database } from '../clients/database.js';
import type { ModelProvider } from '../clients/modelProvider.js';
import type { ContentLabels } from '../types/ContentLabels.js';
import type { QuestionIndex } from '../types/QuestionIndex.js';

interface StudyNoteDeps {
  database: Database;
  labels: ContentLabels;
  modelProvider?: ModelProvider;
  now?: () => Date;
  questions: QuestionIndex;
  rateLimitKeySecret: string;
}

type ResolvedStudyNoteDeps = Omit<Required<StudyNoteDeps>, 'modelProvider'> & Pick<StudyNoteDeps, 'modelProvider'>;

export type { ResolvedStudyNoteDeps, StudyNoteDeps };
