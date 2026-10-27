// Whether the learner may ask about a question: the server answers anyone signed in, up to the
// day's limit for their tier, so the ask box shows for every signed-in user and never for a guest.
import { useSignedInUserId } from './AuthProvider';

export function useCanAsk(): boolean {
  return useSignedInUserId() !== null;
}
