// Renders a fenced code snippet with Prism syntax highlighting, tokenized
// per its declared language so keywords, class names, and members read as
// distinct colors instead of flat white text. Shared by the question cards
// and the Query drawer so both use the same tokenizing and theme rules.

import Prism from 'prismjs';
import 'prismjs/components/prism-python.js';
import 'prismjs/components/prism-sql.js';

const PRISM_GRAMMAR = {
  python: 'python',
  postgres: 'sql',
};

export function CodeBlock({ code, language, className = '' }) {
  const grammarName = PRISM_GRAMMAR[language] ?? 'python';
  const highlightedHtml = Prism.highlight(code, Prism.languages[grammarName], grammarName);

  return (
    <pre className={`rounded-md bg-obsidian border border-line px-4 py-3 overflow-x-auto ${className}`}>
      <code
        className={`language-${grammarName} font-mono text-sm text-ink whitespace-pre`}
        dangerouslySetInnerHTML={{ __html: highlightedHtml }}
      />
    </pre>
  );
}
