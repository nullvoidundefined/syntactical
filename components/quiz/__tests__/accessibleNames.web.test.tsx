import { render, screen } from '@testing-library/react';
import { Text } from 'react-native';

import { QueryDrawer } from '../../query/QueryDrawer';
import { CodeBlock } from '../CodeBlock';
import { ProgressBar } from '../ProgressBar';
import { QuestionCardFrame } from '../QuestionCardFrame';
import { ResultsScreen } from '../ResultsScreen';

jest.mock('react-native-reanimated', () => ({ useReducedMotion: () => true }));

const query = { explanation: 'Counts from start.', syntax: 'enumerate(iterable, start=0)', tags: ['builtins'], title: 'enumerate(iterable, start=0)' };

describe('quiz screens on the web expose accessible names and headings', () => {
  it('names the round progress bar with the current question and total', () => {
    render(<ProgressBar current={4} total={100} />);
    expect(screen.getByRole('progressbar', { name: 'Question 5 of 100' })).toBeTruthy();
  });

  it('keeps the progress bar name on the last question once every answer is in', () => {
    render(<ProgressBar current={100} total={100} />);
    expect(screen.getByRole('progressbar', { name: 'Question 100 of 100' })).toBeTruthy();
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
      <QuestionCardFrame languageLabel="Python" difficultyLabel="Easy" type="mc" onOpenQuery={jest.fn()}>
        <Text>body</Text>
      </QuestionCardFrame>,
    );
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Python / Easy / Multiple choice');
  });

  it('gives the results screen a level-one heading', () => {
    render(
      <ResultsScreen accuracy={50} correctCount={1} totalQuestions={2} languageLabel="Python" difficultyLabel="Easy" onMenu={jest.fn()} onRetry={jest.fn()} />,
    );
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Python / Easy / Complete');
  });
});
