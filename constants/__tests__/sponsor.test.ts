// constants/__tests__/sponsor.test.ts
// The house card copy, the results-card cadence, and the reserved slot height, read through
// constants/appConfig.ts as the app reads them, and the two analytics events every sponsored card sends.
import { ANALYTICS_EVENTS } from '../analyticsEvents';
import { SPONSOR, SPONSOR_CADENCE_STORAGE_KEY } from '../appConfig';
import { HOUSE_CARD, SPONSOR_LABEL_MIN_HEIGHT, SPONSOR_SLOT_HEIGHT } from '../sponsor';

describe('sponsor constants', () => {
  it('describes the house card as the spec words it', () => {
    expect(HOUSE_CARD).toEqual({
      body: 'No sponsored cards. 20 asks a day.',
      callToAction: 'See Pro',
      headline: 'Syntactical Pro',
      source: 'house',
    });
  });

  it('shows a results card every third round, the first on the third', () => {
    expect(SPONSOR).toEqual({ ROUNDS_BETWEEN: 3 });
  });

  it('stores the cadence under its own versioned key, apart from the stats', () => {
    expect(SPONSOR_CADENCE_STORAGE_KEY).toBe('syntactical.sponsor.v1');
  });

  it('keeps the Sponsored label at least 15 points high', () => {
    expect(SPONSOR_LABEL_MIN_HEIGHT).toBeGreaterThanOrEqual(15);
  });

  it('reserves a 160 point slot, so a card that fills late moves nothing', () => {
    expect(SPONSOR_SLOT_HEIGHT).toBe(160);
  });

  it('registers ad_shown and ad_clicked', () => {
    expect(ANALYTICS_EVENTS).toEqual(expect.arrayContaining(['ad_shown', 'ad_clicked']));
  });
});
