// trackEvent (B-45): only registry names, no email/code/token properties, a
// no-op without a configured key, PostHog built with memory persistence, and
// identify/reset passed through. PostHog is replaced by a recording fake.
import { ANALYTICS_EVENTS } from '../../constants/analyticsEvents';

const mockCapture = jest.fn();
const mockIdentify = jest.fn();
const mockReset = jest.fn();
const mockConstruct = jest.fn();
const mockExtra: { posthogHost?: string; posthogKey?: string } = {};

jest.mock('posthog-react-native', () => ({
    __esModule: true,
    default: class FakePostHog {
        capture = mockCapture;
        identify = mockIdentify;
        reset = mockReset;
        constructor(...args: unknown[]) {
            mockConstruct(...args);
        }
    },
}));
jest.mock('expo-constants', () => ({ expoConfig: { extra: mockExtra } }));

type AnalyticsModule = typeof import('../analyticsClient');

function loadClient(): AnalyticsModule {
    let loaded: AnalyticsModule | undefined;
    jest.isolateModules(() => {
        loaded = require('../analyticsClient');
    });
    if (!loaded) throw new Error('analyticsClient did not load');
    return loaded;
}

// Built at run time so no credential-shaped literal sits in source.
function buildKey(): string {
    return `phc_${require('node:crypto').randomBytes(12).toString('hex')}`;
}

beforeEach(() => {
    delete mockExtra.posthogKey;
    delete mockExtra.posthogHost;
});

describe('trackEvent', () => {
    it('accepts every registered event name and forwards name and properties', () => {
        mockExtra.posthogKey = buildKey();
        const { trackEvent } = loadClient();
        for (const name of ANALYTICS_EVENTS)
            trackEvent(name, { language: 'python', totalQuestions: 3, isGuest: true });
        expect(mockCapture).toHaveBeenCalledTimes(ANALYTICS_EVENTS.length);
        expect(mockCapture).toHaveBeenCalledWith('round_started', {
            language: 'python',
            totalQuestions: 3,
            isGuest: true,
        });
    });

    it('rejects a name outside the registry at type level and throws at run time', () => {
        mockExtra.posthogKey = buildKey();
        const { trackEvent } = loadClient();
        // @ts-expect-error not a registered event
        expect(() => trackEvent('page_viewed')).toThrow('not in the registry');
        expect(mockCapture).not.toHaveBeenCalled();
    });

    it.each(['email', 'code', 'token', 'Email', 'TOKEN'])(
        'throws on a property named %s and sends nothing',
        (property) => {
            mockExtra.posthogKey = buildKey();
            const { trackEvent } = loadClient();
            expect(() => trackEvent('round_started', { [property]: 'x' })).toThrow(
                'forbidden property',
            );
            expect(mockCapture).not.toHaveBeenCalled();
        },
    );

    it('validates before the no-op, so a bad call throws even with no key', () => {
        const { trackEvent } = loadClient();
        expect(() => trackEvent('round_started', { email: 'x' })).toThrow('forbidden property');
    });

    it('is a no-op with no key: PostHog is never constructed', () => {
        const { identifyAnalyticsUser, resetAnalyticsUser, trackEvent } = loadClient();
        trackEvent('round_started');
        identifyAnalyticsUser('user-1');
        resetAnalyticsUser();
        expect(mockConstruct).not.toHaveBeenCalled();
        expect(mockCapture).not.toHaveBeenCalled();
    });

    // Memory persistence is how PostHog stays cookieless and writes no AsyncStorage
    // key for a guest; the SDK's own storage paths are not reachable under Jest.
    it('builds PostHog once with the key, memory persistence, and no custom storage', () => {
        const key = buildKey();
        mockExtra.posthogKey = key;
        const { trackEvent } = loadClient();
        trackEvent('round_started');
        trackEvent('round_completed');
        expect(mockConstruct).toHaveBeenCalledTimes(1);
        const [calledKey, options] = mockConstruct.mock.calls[0];
        expect(calledKey).toBe(key);
        expect(options).toEqual(
            expect.objectContaining({ persistence: 'memory', captureAppLifecycleEvents: false }),
        );
        expect(options).not.toHaveProperty('customStorage');
    });

    it('passes a configured host to PostHog', () => {
        mockExtra.posthogKey = buildKey();
        mockExtra.posthogHost = 'https://eu.i.posthog.com';
        const { trackEvent } = loadClient();
        trackEvent('round_started');
        expect(mockConstruct).toHaveBeenCalledWith(
            expect.any(String),
            expect.objectContaining({ host: 'https://eu.i.posthog.com' }),
        );
    });

    it('drops a bad event in production instead of throwing', () => {
        mockExtra.posthogKey = buildKey();
        const { trackEvent } = loadClient();
        const globals = globalThis as { __DEV__?: boolean };
        const dev = globals.__DEV__;
        globals.__DEV__ = false;
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
        try {
            expect(() => trackEvent('round_started', { email: 'x' })).not.toThrow();
            expect(mockCapture).not.toHaveBeenCalled();
            expect(warn).toHaveBeenCalledTimes(1);
        } finally {
            globals.__DEV__ = dev;
            warn.mockRestore();
        }
    });
});

describe('identity', () => {
    it('identifies with the user id and resets on sign-out', () => {
        mockExtra.posthogKey = buildKey();
        const { identifyAnalyticsUser, resetAnalyticsUser } = loadClient();
        identifyAnalyticsUser('user-1');
        expect(mockIdentify).toHaveBeenCalledWith('user-1');
        resetAnalyticsUser();
        expect(mockReset).toHaveBeenCalledTimes(1);
    });
});
