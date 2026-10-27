// components/seo/__tests__/BankTitles.web.test.tsx
// The bank page's crawlable text: "What this bank covers" and the bank's distinct query titles as a plain list in
// bank order, plus the page's title, description, and canonical URL. No choice, rationale, or explanation text
// reaches the page. Medium and Hard banks are not bundled, so their titles come from the build-time index all the same.
import { render, screen, within } from '@testing-library/react';

import { BANK_TITLES } from '../../../services/content/bankTitles.generated';
import { BankTitles } from '../BankTitles';
import { describeBank } from '../describeBank';

type BankQuestion = {
  choices?: { rationale?: string; text: string }[];
  query: { explanation: string; title: string };
};

const PYTHON_EASY = require('../../../content/python/easy.json') as { questions: BankQuestion[] };
// Short choice texts such as "-3" can occur inside an ordinary title; longer ones cannot by chance.
const MIN_CHOICE_LENGTH = 8;
const mockHeads: unknown[] = [];

// Head needs the provider Expo Router's root mounts; this suite checks the props PageHead receives.
jest.mock('../PageHead', () => ({
  PageHead: (props: unknown) => {
    mockHeads.push(props);
    return null;
  },
}));

function listItemTexts(): string[] {
  return within(screen.getByRole('list', { name: 'Bank titles' }))
    .getAllByRole('listitem')
    .map((item) => item.textContent ?? '');
}

describe('BankTitles on the web', () => {
  beforeEach(() => {
    mockHeads.length = 0;
  });

  it('heads the list "What this bank covers" at level two', () => {
    render(<BankTitles language="python" difficulty="easy" />);
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('What this bank covers');
  });

  it('lists the distinct titles of content/python/easy.json in document order', () => {
    render(<BankTitles language="python" difficulty="easy" />);
    expect(listItemTexts()).toEqual([...new Set(PYTHON_EASY.questions.map(({ query }) => query.title))]);
  });

  it('shows no choice, rationale, or explanation text', () => {
    const { container } = render(<BankTitles language="python" difficulty="easy" />);
    const text = container.textContent ?? '';
    for (const { choices = [], query } of PYTHON_EASY.questions) {
      expect(text).not.toContain(query.explanation);
      for (const choice of choices) {
        if (choice.text.length >= MIN_CHOICE_LENGTH) expect(text).not.toContain(choice.text);
        if (choice.rationale) expect(text).not.toContain(choice.rationale);
      }
    }
  });

  it('lists a Medium bank, which the app does not bundle', () => {
    render(<BankTitles language="python" difficulty="medium" />);
    expect(BANK_TITLES['python/medium'].length).toBeGreaterThan(0);
    expect(listItemTexts()).toEqual(BANK_TITLES['python/medium']);
  });

  it('sets the page title, description, and canonical URL', () => {
    render(<BankTitles language="python" difficulty="medium" />);
    expect(mockHeads).toEqual([
      {
        canonicalPath: '/python/medium/',
        description: describeBank('Python Medium', BANK_TITLES['python/medium']),
        title: 'Python Medium quiz | Syntactical',
      },
    ]);
  });

  it('caps a long bank\'s description at 155 characters, on whole titles joined by "; ", with an ellipsis', () => {
    const titles = BANK_TITLES['go/hard'];
    const prefix = 'Go Hard quiz on Syntactical. Covers ';
    const description = describeBank('Go Hard', titles);
    expect(description.length).toBeLessThanOrEqual(155);
    expect(description.startsWith(prefix)).toBe(true);
    expect(description.endsWith('\u2026')).toBe(true);
    const named = description.slice(prefix.length, -1).split('; ');
    expect(named.length).toBeGreaterThan(0);
    expect(named).toEqual(titles.slice(0, named.length));
    expect(`${prefix}${titles.slice(0, named.length + 1).join('; ')}\u2026`.length).toBeGreaterThan(155);
  });

  it('names every title, with no ellipsis, when they all fit', () => {
    expect(describeBank('Python Easy', ['Slicing, step by step', 'Dict ordering'])).toBe(
      'Python Easy quiz on Syntactical. Covers Slicing, step by step; Dict ordering.',
    );
  });

  it.each([
    ['cobol', 'easy'],
    ['python', 'insane'],
    ['constructor', 'easy'],
  ])('renders nothing for %s/%s', (language, difficulty) => {
    const { container } = render(<BankTitles language={language} difficulty={difficulty} />);
    expect(container.innerHTML).toBe('');
    expect(mockHeads).toEqual([]);
  });
});
