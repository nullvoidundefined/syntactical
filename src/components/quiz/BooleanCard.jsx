// Renders a True/False statement card with two large boolean choices
// that color themselves once an answer is submitted.

export function BooleanCard({ question, submittedAnswer, isAnswered, onSelect }) {
  const options = [
    { value: true, label: 'True', keyHint: 'T' },
    { value: false, label: 'False', keyHint: 'F' },
  ];

  return (
    <div>
      <p className="text-lg text-ink leading-relaxed">{question.prompt}</p>

      {question.code && (
        <pre className="mt-4 rounded-md bg-obsidian border border-line px-4 py-3 overflow-x-auto">
          <code className="font-mono text-sm text-ink whitespace-pre">{question.code}</code>
        </pre>
      )}

      <div className="mt-6 grid grid-cols-2 gap-2">
        {options.map(({ value, label, keyHint }) => {
          const isSelected = submittedAnswer === value;
          const isCorrectChoice = value === question.answer;

          let tone = 'border-line hover:border-signal/60 hover:bg-surface-raised';
          if (isAnswered && isCorrectChoice) tone = 'border-signal bg-signal/10 text-signal';
          if (isAnswered && isSelected && !isCorrectChoice) tone = 'border-danger bg-danger/10 text-danger';

          return (
            <button
              key={label}
              type="button"
              disabled={isAnswered}
              onClick={() => onSelect(value)}
              className={`flex items-center justify-center gap-3 border rounded-md px-4 py-5 transition-colors duration-150
                          disabled:cursor-default ${tone}`}
            >
              <span className="font-mono text-xs text-muted border border-line rounded px-1.5 py-0.5">
                {keyHint}
              </span>
              <span className="font-mono text-base tracking-wide">{label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
