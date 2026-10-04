// Reads the durable pending-purge list (AsyncStorage, a JSON array of the user
// ids of deleted accounts whose local data is still on the device). Null when
// storage could not be read, so a caller never rewrites a list it did not see.
import { readStoredJson } from '../../clients/readStoredJson';
import { PENDING_PURGE_STORAGE_KEY } from '../../constants/appConfig';

export async function readPendingPurgeIds(): Promise<string[] | null> {
  const { isReadFailed, value } = await readStoredJson(PENDING_PURGE_STORAGE_KEY);
  if (isReadFailed) return null;
  return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : [];
}
