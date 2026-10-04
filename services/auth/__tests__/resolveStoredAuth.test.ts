// resolveStoredAuth: the stored identity is accepted only as an object with a
// string-or-null userId and an array of string ids; anything else is null so
// the provider starts signed out.
import { randomUUID } from 'node:crypto';

import { resolveStoredAuth } from '../resolveStoredAuth';

describe('resolveStoredAuth', () => {
  it.each([
    ['null', null],
    ['undefined', undefined],
    ['a string', 'signed-in'],
    ['a number', 42],
    ['a boolean', true],
    ['an array', [randomUUID()]],
  ])('returns null for a non-object value (%s)', (_label, value) => {
    expect(resolveStoredAuth(value)).toBeNull();
  });

  it.each([
    ['a number', 7],
    ['an object', { id: 'x' }],
    ['a boolean', false],
    ['undefined (missing)', undefined],
  ])('returns null when userId is %s', (_label, userId) => {
    expect(resolveStoredAuth({ userId, knownUserIds: [] })).toBeNull();
  });

  it.each([
    ['a string', 'abc'],
    ['an object', { 0: 'abc' }],
    ['null', null],
    ['missing', undefined],
  ])('returns null when knownUserIds is %s', (_label, knownUserIds) => {
    expect(resolveStoredAuth({ userId: null, knownUserIds })).toBeNull();
  });

  it.each([
    ['a number', 3],
    ['null', null],
    ['an object', { id: 'x' }],
  ])('returns null when a known id is %s', (_label, badId) => {
    expect(resolveStoredAuth({ userId: null, knownUserIds: [randomUUID(), badId] })).toBeNull();
  });

  it('returns the userId and known ids for a valid signed-in value', () => {
    const userId = randomUUID();
    const otherId = randomUUID();

    const resolved = resolveStoredAuth({ userId, knownUserIds: [userId, otherId] });

    expect(resolved).toMatchObject({ userId, knownUserIds: [userId, otherId] });
  });

  it('returns a null userId and the known ids for a valid signed-out value', () => {
    const knownId = randomUUID();

    const resolved = resolveStoredAuth({ userId: null, knownUserIds: [knownId] });

    expect(resolved).toMatchObject({ userId: null, knownUserIds: [knownId] });
  });
});
