// Slide-over panel explaining the syntax/method/context behind the
// current card's example. Purely presentational: open state and the
// query content itself live in the parent.

import { CodeBlock } from '../quiz/CodeBlock.jsx';

export function QueryDrawer({ isOpen, query, language, onClose }) {
  return (
    <>
      <div
        className={`fixed inset-0 bg-black/60 transition-opacity duration-200 z-40
                    ${isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        className={`fixed top-0 right-0 h-dvh w-full sm:w-[420px] bg-surface border-l border-line
                    z-50 transform transition-transform duration-250 ease-out overflow-y-auto
                    ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}
        aria-hidden={!isOpen}
        inert={isOpen ? undefined : true}
      >
        {query && (
          <div className="p-5 sm:p-6">
            <div className="flex items-center justify-between mb-6">
              <span className="font-mono text-xs tracking-widest text-signal uppercase">Query</span>
              <button
                type="button"
                onClick={onClose}
                className="font-mono text-xs text-muted hover:text-ink transition-colors"
              >
                close <span className="hidden sm:inline">(Q / Esc)</span>
              </button>
            </div>

            <h2 className="font-mono text-lg text-ink mb-4">{query.title}</h2>

            {query.syntax && <CodeBlock code={query.syntax} language={language} className="mb-4" />}

            <p className="text-sm text-ink/90 leading-relaxed whitespace-pre-line">
              {query.explanation}
            </p>

            {query.tags?.length > 0 && (
              <div className="mt-6 flex flex-wrap gap-2">
                {query.tags.map((tag) => (
                  <span
                    key={tag}
                    className="font-mono text-[10px] tracking-widest uppercase text-muted border border-line rounded px-2 py-1"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </aside>
    </>
  );
}
