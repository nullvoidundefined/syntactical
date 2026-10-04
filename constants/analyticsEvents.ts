// The fixed registry of analytics events (B-45). trackEvent accepts only these
// names; a name outside the registry is a type error and throws in development.
export const ANALYTICS_EVENTS = [
    'round_started',
    'round_completed',
    'signup_prompt_shown',
    'signup_prompt_accepted',
    'paywall_viewed',
    'purchase_completed',
    'review_round_completed',
    'bank_exhausted',
] as const;

export type AnalyticsEventName = (typeof ANALYTICS_EVENTS)[number];

// Property names that would carry personal data or a secret; no event may have one.
export const FORBIDDEN_ANALYTICS_PROPERTIES = ['code', 'email', 'token'] as const;
