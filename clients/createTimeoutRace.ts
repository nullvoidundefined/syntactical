// A deadline for a fetch or an SDK call: the promise rejects with the built
// error when ms passes, aborting the controller first when one is given. The
// caller races it against the work and calls clear once the work settles, so
// the timer never outlives the call.
export function createTimeoutRace(
  ms: number,
  buildError: () => Error,
  controller?: AbortController,
): { promise: Promise<never>; clear: () => void } {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const promise = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      controller?.abort();
      reject(buildError());
    }, ms);
  });
  return { clear: () => clearTimeout(timer), promise };
}
