// Turns a question snippet into Prism HTML for the track that owns it.
// CodeBlock inserts that HTML, so the encoding lives here where a test
// can feed it an injection string without rendering React.

import Prism from 'prismjs';
import 'prismjs/components/prism-python.js';
import 'prismjs/components/prism-sql.js';
import 'prismjs/components/prism-javascript.js';

const PRISM_GRAMMAR = {
  python: 'python',
  postgres: 'sql',
  javascript: 'javascript',
};

export function highlightQuestionCode(code, language) {
  const grammarName = PRISM_GRAMMAR[language] ?? 'python';
  const html = Prism.highlight(code, Prism.languages[grammarName], grammarName);
  return { grammarName, html };
}
