import type { LockedUser } from './LockedUser.js';

type UserLockResult = { kind: 'busy' } | { kind: 'locked'; user: LockedUser } | { kind: 'missing' };

export type { UserLockResult };
