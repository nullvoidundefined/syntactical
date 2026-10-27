// components/seo/__tests__/TrackSummary.web.test.tsx
// The track summary holds the crawlable text of a track page: the label under a level-two heading, the tagline, the
// topic labels as a list, and each bank's question count. It also sets the page's title, description, and canonical
// URL. A track with no topics has no topic list, and a track the bundled manifest does not list renders nothing.
import { render, screen, within } from '@testing-library/react';

import { BANK_QUESTION_COUNTS } from '../../../services/content/bankTitles.generated';
import { BUNDLED_MANIFEST } from '../../../services/content/bundledManifest.generated';
import { TrackSummary } from '../TrackSummary';

const GO = BUNDLED_MANIFEST.languages.find(({ id }) => id === 'go')!;
const mockHeads: unknown[] = [];

// Head needs the provider Expo Router's root mounts; this suite checks the props PageHead receives, and Task 7.2
// Step 4 checks the built page's head.
jest.mock('../PageHead', () => ({
  PageHead: (props: unknown) => {
    mockHeads.push(props);
    return null;
  },
}));

describe('TrackSummary on the web', () => {
  beforeEach(() => {
    mockHeads.length = 0;
  });

  it('names the track under a level-two heading and shows its tagline', () => {
    render(<TrackSummary language="go" />);
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('About Go');
    expect(screen.getByText(GO.tagline)).toBeTruthy();
  });

  it('lists every topic label in manifest order', () => {
    render(<TrackSummary language="go" />);
    const items = within(screen.getByRole('list', { name: 'Topics' })).getAllByRole('listitem');
    expect(GO.topics.length).toBeGreaterThan(0);
    expect(items.map((item) => item.textContent)).toEqual(GO.topics.map(({ label }) => label));
  });

  it('lists the three banks with their question counts', () => {
    render(<TrackSummary language="go" />);
    const items = within(screen.getByRole('list', { name: 'Banks' })).getAllByRole('listitem');
    expect(items.map((item) => item.textContent)).toEqual([
      `Easy: ${BANK_QUESTION_COUNTS['go/easy']} questions`,
      `Medium: ${BANK_QUESTION_COUNTS['go/medium']} questions`,
      `Hard: ${BANK_QUESTION_COUNTS['go/hard']} questions`,
    ]);
  });

  it('sets the page title, description, and canonical URL', () => {
    render(<TrackSummary language="go" />);
    expect(mockHeads).toEqual([
      {
        canonicalPath: '/go/',
        description: `Go quiz on Syntactical: ${GO.tagline}`,
        title: 'Go quiz: Easy, Medium, Hard | Syntactical',
      },
    ]);
  });

  it('renders no topic list for a track without topics (python lists none in the manifest)', () => {
    render(<TrackSummary language="python" />);
    expect(screen.queryByRole('list', { name: 'Topics' })).toBeNull();
    expect(screen.getByRole('list', { name: 'Banks' })).toBeTruthy();
  });

  it('renders nothing, and sets no page head, for a track the bundled manifest does not list', () => {
    const { container } = render(<TrackSummary language="cobol" />);
    expect(container.innerHTML).toBe('');
    expect(mockHeads).toEqual([]);
  });
});
