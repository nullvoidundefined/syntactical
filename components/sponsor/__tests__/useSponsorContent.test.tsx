// components/sponsor/__tests__/useSponsorContent.test.tsx
// The content one mounted card shows and its two reports: the house card, ad_shown once per mount with
// placement and source (and the host told once), ad_clicked on every press.
import { act, renderHook } from '@testing-library/react-native';

import { HOUSE_CARD } from '../../../constants/sponsor';
import { useSponsorContent } from '../useSponsorContent';

const mockTrackEvent = jest.fn();

jest.mock('../../../clients/analyticsClient', () => ({
  trackEvent: (...args: unknown[]) => mockTrackEvent(...args),
}));

describe('useSponsorContent', () => {
  it('shows the house card', async () => {
    const { result } = await renderHook(() => useSponsorContent('results'));
    expect(result.current.content).toEqual(HOUSE_CARD);
  });

  it('reports ad_shown once per mount with placement and source, and tells the host once', async () => {
    const onHostShown = jest.fn();
    const { result } = await renderHook(() => useSponsorContent('tracks', onHostShown));
    await act(async () => {
      result.current.onShown();
      result.current.onShown('direct');
    });
    expect(mockTrackEvent.mock.calls).toEqual([['ad_shown', { placement: 'tracks', source: 'house' }]]);
    expect(onHostShown).toHaveBeenCalledTimes(1);
  });

  it('reports ad_clicked on every call, with the source given or the content source', async () => {
    const { result } = await renderHook(() => useSponsorContent('results'));
    await act(async () => {
      result.current.onClicked();
      result.current.onClicked('admob');
    });
    expect(mockTrackEvent.mock.calls).toEqual([
      ['ad_clicked', { placement: 'results', source: 'house' }],
      ['ad_clicked', { placement: 'results', source: 'admob' }],
    ]);
  });
});
