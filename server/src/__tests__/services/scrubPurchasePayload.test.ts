// B-59.1: scrubPurchasePayload walks a stored purchase payload at every depth and replaces every
// trace of a deleted user's email or id with `[deleted]`, clears RevenueCat PII attributes
// unconditionally, leaves everything else untouched, and never mutates its input.
import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { scrubPurchasePayload } from '../../services/scrubPurchasePayload.js';

const DELETED = '[deleted]';

// Alternates letter case so the copy differs from the stored lowercase form.
function mixCase(text: string): string {
  return Array.from(text)
    .map((char, index) => (index % 2 === 0 ? char.toUpperCase() : char.toLowerCase()))
    .join('');
}

// Maps printable ASCII to its fullwidth compatibility form, which NFKC folds back.
function toFullwidth(text: string): string {
  return Array.from(text)
    .map((char) => {
      const code = char.charCodeAt(0);
      return code >= 0x21 && code <= 0x7e ? String.fromCharCode(code + 0xfee0) : char;
    })
    .join('');
}

function buildIdentity(): { email: string; userId: string } {
  const localPart = `deleted-${randomUUID().slice(0, 8)}`;
  return { email: `${localPart}@example.test`, userId: randomUUID() };
}

function buildOtherIdentity(): { email: string; userId: string } {
  const localPart = `bystander-${randomUUID().slice(0, 8)}`;
  return { email: `${localPart}@example.test`, userId: randomUUID() };
}

// A RevenueCat-shaped webhook body carrying the deleted user's identity in many places.
function buildWebhookFixture(
  identity: { email: string; userId: string },
  other: { email: string; userId: string },
): Record<string, unknown> {
  const { email, userId } = identity;
  return {
    api_version: '1.0',
    event: {
      id: 'evt-0001',
      type: 'INITIAL_PURCHASE',
      app_id: 'app-syntactical',
      app_user_id: userId,
      original_app_user_id: userId.toUpperCase(),
      aliases: [userId, `  ${mixCase(userId)} `, '$RCAnonymousID:abc123', other.userId],
      product_id: 'syntactical_premium_monthly',
      entitlement_ids: ['premium'],
      period_type: 'NORMAL',
      purchased_at_ms: 1759363200000,
      expiration_at_ms: 1762041600000,
      environment: 'PRODUCTION',
      store: 'APP_STORE',
      price: 4.99,
      price_in_purchased_currency: 4.99,
      currency: 'USD',
      is_family_share: false,
      country_code: 'US',
      takehome_percentage: 0.85,
      offer_code: null,
      transaction_id: 'txn-000111222',
      original_transaction_id: 'txn-000111000',
      subscriber_attributes: {
        $email: { value: mixCase(email), updated_at_ms: 1759363200001 },
        $displayName: { value: 'Pat Example', updated_at_ms: 1759363200002 },
        $phoneNumber: { value: '555-0100', updated_at_ms: 1759363200003 },
        $mediaSource: { value: 'organic', updated_at_ms: 1759363200004 },
        contact_hint: { value: `mailto:${email}`, updated_at_ms: 1759363200005 },
      },
      receipt_note: `  ${email.toUpperCase()}\n`,
      support_ticket: `Refund requested by ${mixCase(email)} via store`,
      compat_copy: toFullwidth(email),
      [`user:${userId.toUpperCase()}`]: { last_seen: userId, plan: 'monthly' },
      linked_accounts: [
        { [mixCase(email)]: { role: 'owner', note: `owner ${email}` }, source: 'ios' },
        { [other.email]: { role: 'viewer', note: 'unchanged' }, source: 'web' },
        [
          { $displayName: 'Nested Name', $email: 'unrelated@example.test', tier: 3 },
          { $phoneNumber: '555-0199', ok: true, missing: null },
          ['plain', other.email, 42, `id=${userId}`],
        ],
      ],
    },
  };
}

function buildExpectedOutput(other: { email: string; userId: string }): Record<string, unknown> {
  return {
    api_version: '1.0',
    event: {
      id: 'evt-0001',
      type: 'INITIAL_PURCHASE',
      app_id: 'app-syntactical',
      app_user_id: DELETED,
      original_app_user_id: DELETED,
      aliases: [DELETED, DELETED, '$RCAnonymousID:abc123', other.userId],
      product_id: 'syntactical_premium_monthly',
      entitlement_ids: ['premium'],
      period_type: 'NORMAL',
      purchased_at_ms: 1759363200000,
      expiration_at_ms: 1762041600000,
      environment: 'PRODUCTION',
      store: 'APP_STORE',
      price: 4.99,
      price_in_purchased_currency: 4.99,
      currency: 'USD',
      is_family_share: false,
      country_code: 'US',
      takehome_percentage: 0.85,
      offer_code: null,
      transaction_id: 'txn-000111222',
      original_transaction_id: 'txn-000111000',
      subscriber_attributes: {
        $email: { value: DELETED, updated_at_ms: 1759363200001 },
        $displayName: { value: DELETED, updated_at_ms: 1759363200002 },
        $phoneNumber: { value: DELETED, updated_at_ms: 1759363200003 },
        $mediaSource: { value: 'organic', updated_at_ms: 1759363200004 },
        contact_hint: { value: DELETED, updated_at_ms: 1759363200005 },
      },
      receipt_note: DELETED,
      support_ticket: DELETED,
      compat_copy: DELETED,
      [DELETED]: { last_seen: DELETED, plan: 'monthly' },
      linked_accounts: [
        { [DELETED]: { role: 'owner', note: DELETED }, source: 'ios' },
        { [other.email]: { role: 'viewer', note: 'unchanged' }, source: 'web' },
        [
          { $displayName: DELETED, $email: DELETED, tier: 3 },
          { $phoneNumber: DELETED, ok: true, missing: null },
          ['plain', other.email, 42, DELETED],
        ],
      ],
    },
  };
}

describe('scrubPurchasePayload', () => {
  it('scrubs every trace of the identity in a RevenueCat webhook and leaves the rest byte-identical', () => {
    const identity = buildIdentity();
    const other = buildOtherIdentity();
    const payload = buildWebhookFixture(identity, other);

    const scrubbed = scrubPurchasePayload(payload, identity);

    expect(scrubbed).toStrictEqual(buildExpectedOutput(other));
    expect(JSON.stringify(scrubbed)).not.toContain(identity.userId);
    expect(JSON.stringify(scrubbed).toLowerCase()).not.toContain(identity.email);
  });

  it('does not mutate the input payload', () => {
    const identity = buildIdentity();
    const other = buildOtherIdentity();
    const payload = buildWebhookFixture(identity, other);
    const snapshot = structuredClone(payload);

    scrubPurchasePayload(payload, identity);

    expect(payload).toStrictEqual(snapshot);
  });

  it('normalizes the identity argument too (trim, NFKC, lowercase) before matching', () => {
    const identity = buildIdentity();
    const shoutedIdentity = {
      email: `  ${toFullwidth(identity.email.toUpperCase())} `,
      userId: ` ${identity.userId.toUpperCase()}\t`,
    };

    const scrubbed = scrubPurchasePayload(
      { a: identity.email, b: identity.userId, c: 'kept' },
      shoutedIdentity,
    );

    expect(scrubbed).toStrictEqual({ a: DELETED, b: DELETED, c: 'kept' });
  });

  it('replaces a matching top-level string and walks a top-level array', () => {
    const identity = buildIdentity();

    expect(scrubPurchasePayload(`mailto:${mixCase(identity.email)}`, identity)).toBe(DELETED);
    expect(
      scrubPurchasePayload(
        [identity.userId, 'other', [{ nested: identity.email.toUpperCase() }]],
        identity,
      ),
    ).toStrictEqual([DELETED, 'other', [{ nested: DELETED }]]);
  });

  it('returns unrelated strings, numbers, booleans, and null unchanged', () => {
    const identity = buildIdentity();
    const other = buildOtherIdentity();

    expect(scrubPurchasePayload('syntactical_premium_monthly', identity)).toBe(
      'syntactical_premium_monthly',
    );
    expect(scrubPurchasePayload(other.email, identity)).toBe(other.email);
    expect(scrubPurchasePayload(other.userId, identity)).toBe(other.userId);
    expect(scrubPurchasePayload(4.99, identity)).toBe(4.99);
    expect(scrubPurchasePayload(false, identity)).toBe(false);
    expect(scrubPurchasePayload(null, identity)).toBeNull();
  });
});
