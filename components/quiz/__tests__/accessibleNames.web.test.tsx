import { render, screen } from '@testing-library/react';
import { Text } from 'react-native';

import { TEST_PROVENANCE } from '../../../services/content/__tests__/fixtures/contentFixtures';
import { QueryDrawer } from '../../query/QueryDrawer';
import { BooleanCard } from '../BooleanCard';
import { CodeBlock } from '../CodeBlock';
import { MultipleChoiceCard } from '../MultipleChoiceCard';
import { ProgressBar } from '../ProgressBar';
import { QuestionCardFrame } from '../QuestionCardFrame';
import { ResultsScreen } from '../ResultsScreen';
import { choiceName } from './choiceName';

jest.mock('react-native-reanimated', () => ({ useReducedMotion: () => true }));

const query = {
  explanation: 'Counts from start.',
  syntax: 'enumerate(iterable, start=0)',
  tags: ['builtins'],
  title: 'enumerate(iterable, start=0)',
};

// The sign-up prompt reads auth and stats; SignUpPrompt.test.tsx covers it.
jest.mock('../../auth/SignUpPrompt', () => ({ SignUpPrompt: () => null }));

describe('quiz screens on the web expose accessible names and headings', () => {
  it('names the round progress bar with the current question and total', () => {
    render(<ProgressBar current={4} total={100} />);
    expect(screen.getByRole('progressbar', { name: 'Question 5 of 100' })).toBeTruthy();
  });

  it('keeps the progress bar name on the last question once every answer is in', () => {
    render(<ProgressBar current={100} total={100} />);
    expect(screen.getByRole('progressbar', { name: 'Question 100 of 100' })).toBeTruthy();
  });

  it('starts each answer choice name with its visible letter (WCAG 2.5.3)', () => {
    const question = {
      answerIndex: 0,
      choices: [{ text: 'users[1].name' }, { text: 'plain' }],
      id: 'q',
      prompt: 'p',
      query,
      provenance: TEST_PROVENANCE,
      type: 'mc',
    } as never;
    render(
      <MultipleChoiceCard
        question={question}
        grammar="javascript"
        submittedAnswer={null}
        isAnswered={false}
        onSelect={jest.fn()}
      />,
    );
    const button = screen.getByRole('button', { name: choiceName('A', 'users[1].name') });
    expect(button.textContent).toMatch(/^Ausers\[1\]\.name$/);
    // The name comes from the visible content, so no aria-label can disagree with it (Lighthouse
    // label-content-name-mismatch).
    expect(button.getAttribute('aria-label')).toBeNull();
    expect(screen.getByRole('button', { name: choiceName('B', 'plain') })).toBeTruthy();
  });

  it('names each True/False button from its visible key hint and word, plus the hidden state', () => {
    const question = { answer: true, id: 'q', prompt: 'p', query, provenance: TEST_PROVENANCE, type: 'bool' } as never;
    const { rerender } = render(
      <BooleanCard
        question={question}
        grammar="python"
        submittedAnswer={null}
        isAnswered={false}
        onSelect={jest.fn()}
      />,
    );
    const trueButton = screen.getByRole('button', { name: choiceName('T', 'True') });
    // The name comes from the visible content, so no aria-label can disagree with it (Lighthouse
    // label-content-name-mismatch flagged aria-label "True" against visible "T True").
    expect(trueButton.getAttribute('aria-label')).toBeNull();
    expect(screen.getByRole('button', { name: choiceName('F', 'False') }).getAttribute('aria-label')).toBeNull();
    rerender(
      <BooleanCard question={question} grammar="python" submittedAnswer={false} isAnswered onSelect={jest.fn()} />,
    );
    expect(screen.getByRole('button', { name: choiceName('T', 'True', 'correct') })).toBeTruthy();
    expect(screen.getByRole('button', { name: choiceName('F', 'False', 'incorrect') })).toBeTruthy();
  });

  it('names the query dialog after the query title', () => {
    render(<QueryDrawer isOpen query={query} grammar="python" onClose={jest.fn()} />);
    expect(screen.getByRole('dialog', { name: 'enumerate(iterable, start=0)' })).toBeTruthy();
  });

  it('puts the horizontal code scroller in the tab order', () => {
    render(<CodeBlock code="x = 1" grammar="python" />);
    const scroller = screen.getByTestId('code-block').closest('[tabindex]');
    expect(scroller?.getAttribute('tabindex')).toBe('0');
  });

  it('gives a question card a level-one heading naming the language, difficulty, and type', () => {
    render(
      <QuestionCardFrame
        languageLabel="Python"
        difficultyLabel="Easy"
        type="mc"
        onOpenQuery={jest.fn()}
        provenance={TEST_PROVENANCE}
      >
        <Text>body</Text>
      </QuestionCardFrame>,
    );
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Python / Easy / Multiple choice');
  });

  it('keeps one level-one heading when the verified badge is shown', () => {
    const verified = {
      ...TEST_PROVENANCE,
      runtimeVersion: 'Python 3.13.2',
      validation: { method: 'executed', status: 'passed' },
    } as const;
    render(
      <QuestionCardFrame
        languageLabel="Python"
        difficultyLabel="Easy"
        type="mc"
        onOpenQuery={jest.fn()}
        provenance={verified}
      >
        <Text>body</Text>
      </QuestionCardFrame>,
    );
    expect(screen.getByText('Output verified on Python 3.13.2')).toBeTruthy();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });

  it('gives the results screen a level-one heading', () => {
    render(
      <ResultsScreen
        accuracy={50}
        correctCount={1}
        totalQuestions={2}
        languageLabel="Python"
        difficultyLabel="Easy"
        onMenu={jest.fn()}
        onRetry={jest.fn()}
      />,
    );
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Python / Easy / Complete');
  });
});
