// The error thrown by fetchContentText, carrying a machine-readable reason
// for why a remote content request was refused or failed.
type ContentFetchReason = 'network' | 'timeout' | 'redirect' | 'status' | 'too-large';

export class ContentFetchError extends Error {
  readonly reason: ContentFetchReason;

  constructor(reason: ContentFetchReason, message: string) {
    super(message);
    this.name = 'ContentFetchError';
    this.reason = reason;
  }
}
