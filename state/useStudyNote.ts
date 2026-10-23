// This week's study note for the signed-in user, keyed by user id. Refetched each time the home
// screen mounts, so answers synced since the last visit can complete a gathering note; the server
// stores a written note, so a repeat fetch costs no model call. A guest makes no request.
import { useQuery } from '@tanstack/react-query';

import { fetchStudyNote } from '../services/studyNote/fetchStudyNote';
import type { StudyNoteState } from '../services/studyNote/types/StudyNoteState';

import { useSignedInUserId } from './AuthProvider';

export function useStudyNote(): StudyNoteState {
  const userId = useSignedInUserId();
  const { data } = useQuery({
    enabled: userId !== null,
    queryFn: fetchStudyNote,
    queryKey: ['study-note', userId],
    refetchOnMount: 'always',
    retry: false,
  });
  if (userId === null || data === undefined) return { status: 'hidden' };
  return data;
}
