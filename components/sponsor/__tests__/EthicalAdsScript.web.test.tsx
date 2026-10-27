// components/sponsor/__tests__/EthicalAdsScript.web.test.tsx
// The EthicalAds client script is in the page only when a publisher id is configured, and deferred so it
// never blocks the first render.
import { render } from '@testing-library/react';

import { setExpoExtra } from '../../../config/expoConstantsMock';
import { EthicalAdsScript } from '../EthicalAdsScript';

const SCRIPT_SELECTOR = 'script[src="https://media.ethicalads.io/media/client/ethicalads.min.js"]';

describe('EthicalAdsScript', () => {
  afterEach(() => setExpoExtra({ contentBaseUrl: 'https://example.test/content/' }));

  it('renders a deferred script tag when a publisher id is configured', () => {
    setExpoExtra({ contentBaseUrl: 'https://example.test/content/', ethicalAdsPublisher: 'syntactical' });
    const { container } = render(<EthicalAdsScript />);
    const script = container.querySelector(SCRIPT_SELECTOR);
    expect(script).not.toBeNull();
    expect(script?.hasAttribute('defer')).toBe(true);
  });

  it('renders nothing without a publisher id', () => {
    const { container } = render(<EthicalAdsScript />);
    expect(container.querySelector('script')).toBeNull();
  });
});
