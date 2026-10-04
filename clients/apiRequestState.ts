// The shared request state: the handlers told of a 401.
export const apiRequestState = {
  unauthorizedHandlers: new Set<() => void>(),
};
