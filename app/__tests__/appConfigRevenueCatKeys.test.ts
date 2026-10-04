// Only public RevenueCat keys can reach the bundle: app.config.ts copies
// REVENUECAT_WEB_BILLING_KEY, REVENUECAT_APPLE_KEY, and REVENUECAT_GOOGLE_KEY
// into extra when each carries its public prefix (rcb_, appl_, goog_), leaves
// an unset one undefined, and refuses to load for any other value without
// echoing it. Every key is built at run time so no credential-shaped literal
// sits in source.
import { randomBytes } from 'node:crypto';

import type { ExpoConfig } from 'expo/config';

type KeySlot = {
  envName: 'REVENUECAT_WEB_BILLING_KEY' | 'REVENUECAT_APPLE_KEY' | 'REVENUECAT_GOOGLE_KEY';
  extraName: 'revenueCatWebBillingKey' | 'revenueCatAppleKey' | 'revenueCatGoogleKey';
  prefix: string;
};

const WEB_SLOT: KeySlot = { envName: 'REVENUECAT_WEB_BILLING_KEY', extraName: 'revenueCatWebBillingKey', prefix: 'rcb' };
const APPLE_SLOT: KeySlot = { envName: 'REVENUECAT_APPLE_KEY', extraName: 'revenueCatAppleKey', prefix: 'appl' };
const GOOGLE_SLOT: KeySlot = { envName: 'REVENUECAT_GOOGLE_KEY', extraName: 'revenueCatGoogleKey', prefix: 'goog' };
const SLOTS = [WEB_SLOT, APPLE_SLOT, GOOGLE_SLOT];

const originalEnv = Object.fromEntries(SLOTS.map((slot) => [slot.envName, process.env[slot.envName]]));

function buildKey(prefix: string): string {
  return `${prefix}_${randomBytes(12).toString('hex')}`;
}

// A RevenueCat secret key and the two Stripe key shapes, each joined at run time.
function secretPrefix(): string {
  return ['s', 'k'].join('');
}

function stripePublishablePrefix(): string {
  return [['p', 'k'].join(''), 'live'].join('_');
}

function stripeSecretPrefix(): string {
  return [secretPrefix(), 'live'].join('_');
}

function setKeys(values: Partial<Record<KeySlot['envName'], string>>): void {
  for (const slot of SLOTS) {
    const value = values[slot.envName];
    if (value === undefined) {
      delete process.env[slot.envName];
    } else {
      process.env[slot.envName] = value;
    }
  }
}

function loadAppConfig(): ExpoConfig {
  let loadedConfig: ExpoConfig | undefined;
  jest.isolateModules(() => {
    loadedConfig = require('../../app.config').default as ExpoConfig;
  });
  return loadedConfig as ExpoConfig;
}

function readExtra(config: ExpoConfig): Record<string, unknown> {
  return (config.extra ?? {}) as Record<string, unknown>;
}

function captureLoadError(): unknown {
  try {
    loadAppConfig();
  } catch (error) {
    return error;
  }
  return null;
}

describe('app.config RevenueCat public keys', () => {
  afterEach(() => {
    for (const slot of SLOTS) {
      const original = originalEnv[slot.envName];
      if (original === undefined) {
        delete process.env[slot.envName];
      } else {
        process.env[slot.envName] = original;
      }
    }
  });

  it('carries all three public-prefixed keys in extra under their names', () => {
    const webKey = buildKey('rcb');
    const appleKey = buildKey('appl');
    const googleKey = buildKey('goog');
    setKeys({ REVENUECAT_WEB_BILLING_KEY: webKey, REVENUECAT_APPLE_KEY: appleKey, REVENUECAT_GOOGLE_KEY: googleKey });

    const extra = readExtra(loadAppConfig());

    expect(extra.revenueCatWebBillingKey).toBe(webKey);
    expect(extra.revenueCatAppleKey).toBe(appleKey);
    expect(extra.revenueCatGoogleKey).toBe(googleKey);
  });

  it.each(SLOTS)('carries $envName alone and leaves the other two keys undefined', (slot) => {
    const key = buildKey(slot.prefix);
    setKeys({ [slot.envName]: key });

    const extra = readExtra(loadAppConfig());

    for (const other of SLOTS) {
      expect(extra[other.extraName]).toBe(other === slot ? key : undefined);
    }
  });

  type RejectedCase = { label: string; slot: KeySlot; buildValue: () => string };

  const REJECTED: RejectedCase[] = [
    ...SLOTS.map((slot) => ({
      label: `a RevenueCat secret key in ${slot.envName}`,
      slot,
      buildValue: () => buildKey(secretPrefix()),
    })),
    ...SLOTS.map((slot) => ({
      label: `a Stripe publishable key in ${slot.envName}`,
      slot,
      buildValue: () => buildKey(stripePublishablePrefix()),
    })),
    ...SLOTS.map((slot) => ({
      label: `a Stripe secret key in ${slot.envName}`,
      slot,
      buildValue: () => buildKey(stripeSecretPrefix()),
    })),
    { label: 'an Apple key in the web slot', slot: WEB_SLOT, buildValue: () => buildKey('appl') },
    { label: 'a Google key in the web slot', slot: WEB_SLOT, buildValue: () => buildKey('goog') },
    { label: 'a Web Billing key in the Apple slot', slot: APPLE_SLOT, buildValue: () => buildKey('rcb') },
    { label: 'a Web Billing key in the Google slot', slot: GOOGLE_SLOT, buildValue: () => buildKey('rcb') },
    ...SLOTS.map((slot) => ({
      label: `a bare prefix with nothing after it in ${slot.envName}`,
      slot,
      buildValue: () => `${slot.prefix}_`,
    })),
    ...SLOTS.map((slot) => ({
      label: `a prefixed value carrying a character outside [A-Za-z0-9_.-] in ${slot.envName}`,
      slot,
      buildValue: () => `${buildKey(slot.prefix)}/${randomBytes(4).toString('hex')}`,
    })),
  ];

  it.each(REJECTED)('refuses to load for $label, and the error never contains the value', ({ slot, buildValue }) => {
    const value = buildValue();
    setKeys({ [slot.envName]: value });

    const error = captureLoadError();

    expect(error).toBeInstanceOf(Error);
    const { message, stack } = error as Error;
    expect(message).not.toContain(value);
    expect(stack ?? '').not.toContain(value);
  });
});
