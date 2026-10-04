import type { Profile } from './Profile.js';

type UpdateProfileResult = { kind: 'missing' } | { kind: 'updated'; profile: Profile };

export type { UpdateProfileResult };
