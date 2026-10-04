// Thrown by the purchase scrub when the candidate set is over the row or byte cap (B-59.13). The deletion's
// transaction rolls back on it, and DELETE /v1/me answers 503 SERVER_BUSY. It carries no account identity.
class DeletionTooLargeError extends Error {
  constructor() {
    super('account deletion scrub is over its row or byte cap');
    this.name = 'DeletionTooLargeError';
  }
}

export { DeletionTooLargeError };
