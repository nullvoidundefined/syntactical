import type { Provenance } from '@syntactical/content-schema';

import { render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { TEST_PROVENANCE } from '../../../services/content/__tests__/fixtures/contentFixtures';
import { QuestionCardFrame } from '../QuestionCardFrame';
import { VerifiedBadge } from '../VerifiedBadge';

const RUNTIME = 'Python 3.13.2';
const VERIFIED: Provenance = { ...TEST_PROVENANCE, runtimeVersion: RUNTIME, validation: { method: 'executed', status: 'passed' } };

describe('VerifiedBadge', () => {
  it('shows the runtime when the output was executed and passed', async () => {
    await render(<VerifiedBadge provenance={VERIFIED} />);
    expect(screen.getByText('Output verified on Python 3.13.2')).toBeTruthy();
  });

  it.each([
    { method: 'judged', status: 'passed' },
    { method: 'executed', status: 'failed' },
    { method: 'executed', status: 'pending' },
  ] as const)('shows nothing for %p', async (validation) => {
    await render(<VerifiedBadge provenance={{ ...VERIFIED, validation }} />);
    expect(screen.queryByText(/Output verified/)).toBeNull();
  });

  it.each([undefined, ''])('shows nothing when runtimeVersion is %p', async (runtimeVersion) => {
    await render(<VerifiedBadge provenance={{ ...VERIFIED, runtimeVersion }} />);
    expect(screen.queryByText(/Output verified/)).toBeNull();
  });

  it('adds no heading or button of its own', async () => {
    await render(<VerifiedBadge provenance={VERIFIED} />);
    expect(screen.queryByRole('heading')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('QuestionCardFrame verified badge', () => {
  function renderFrame(provenance: Provenance) {
    return render(
      <QuestionCardFrame difficultyLabel="Easy" languageLabel="Python" onOpenQuery={jest.fn()} provenance={provenance} type="mc">
        <Text>body</Text>
      </QuestionCardFrame>,
    );
  }

  it('shows the badge in the header for an executed and passed question', async () => {
    await renderFrame(VERIFIED);
    expect(screen.getByText('Output verified on Python 3.13.2')).toBeTruthy();
  });

  it('shows no badge for a judged question', async () => {
    await renderFrame(TEST_PROVENANCE);
    expect(screen.queryByText(/Output verified/)).toBeNull();
  });
});
