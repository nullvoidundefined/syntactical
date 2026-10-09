// Track categories in menu display order. Entries without a category appear last.
export const TRACK_CATEGORIES = ['frontend', 'backend', 'database'] as const;
export type TrackCategory = (typeof TRACK_CATEGORIES)[number];
