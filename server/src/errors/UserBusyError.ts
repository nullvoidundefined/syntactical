// Thrown when the user's row is held by another transaction (FOR UPDATE NOWAIT refused it), so
// the surrounding transaction rolls back; the service that began it catches this and answers busy.
class UserBusyError extends Error {
  constructor() {
    super('user row is locked by another transaction');
    this.name = 'UserBusyError';
  }
}

export { UserBusyError };
