// The shared request state: the handlers told of a 401 and the counter that
// numbers requests in the order they started, so a handler can tell a 401 for
// a request sent before some event (a sign-in) from a later one.
type UnauthorizedInfo = { requestSeq: number };

type UnauthorizedHandler = (info: UnauthorizedInfo) => void;

export const apiRequestState = {
  latestRequestSeq: 0,
  unauthorizedHandlers: new Set<UnauthorizedHandler>(),
};
