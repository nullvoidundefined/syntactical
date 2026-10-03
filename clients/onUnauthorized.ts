// Registers a handler run when a request comes back 401; returns its remover.
import { apiRequestState } from './apiRequestState';

export function onUnauthorized(handler: (info: { requestSeq: number }) => void): () => void {
  apiRequestState.unauthorizedHandlers.add(handler);
  return () => {
    apiRequestState.unauthorizedHandlers.delete(handler);
  };
}
