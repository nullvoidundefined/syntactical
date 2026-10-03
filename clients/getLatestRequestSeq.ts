// The number of the most recently started API request.
import { apiRequestState } from './apiRequestState';

export function getLatestRequestSeq(): number {
  return apiRequestState.latestRequestSeq;
}
