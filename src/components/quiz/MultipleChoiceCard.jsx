// Renders a multiple-choice question: prompt, optional code snippet, and
// four labeled choices that color themselves once an answer is submitted.

import { CodeBlock } from './CodeBlock.jsx';

const CHOICE_LABELS = ['A', 'B', 'C', 'D'];

export function MultipleChoiceCard({ question, language, submittedAnswer, isAnswered, onSelect }) {
  return (
    <div>
      <p className="text-lg text-ink leading-relaxed">{question.prompt}</p>

      {question.code && <CodeBlock code={question.code} language={language} className="mt-4" />}

      <div className="mt-6 grid gap-2">
        {question.choices.map((choice, index) => {
          const isSelected = submittedAnswer === index;
          const isCorrectChoice = index === question.answerIndex;

          let tone = 'border-line hover:border-signal/60 hover:bg-surface-raised';
          if (isAnswered && isCorrectChoice) tone = 'border-signal bg-signal/10 text-signal';
          if (isAnswered && isSelected && !isCorrectChoice) tone = 'border-danger bg-danger/10 text-danger';

          return (
            <button
              key={choice}
              type="button"
              disabled={isAnswered}
              onClick={() => onSelect(index)}
              className={`flex items-center gap-3 text-left border rounded-md px-4 py-3 transition-colors duration-150
                          disabled:cursor-default ${tone}`}
            >
              <span className="font-mono text-xs text-muted border border-line rounded px-1.5 py-0.5 shrink-0">
                {CHOICE_LABELS[index]}
              </span>
              <span className="text-sm">{choice}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
