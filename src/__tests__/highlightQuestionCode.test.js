import assert from 'node:assert/strict';
import test from 'node:test';
import { highlightQuestionCode } from '../components/quiz/highlightQuestionCode.js';

function markupOutsideSpans(html) {
  return html.replace(/<\/?span[^>]*>/g, '');
}

test('javascript markup in a snippet is encoded before it is inserted', () => {
  const { html } = highlightQuestionCode('<img src=x onerror=alert(1)>', 'javascript');
  assert.equal(html.includes('<img'), false);
  assert.equal(html.includes('<script'), false);
  assert.equal(markupOutsideSpans(html).includes('<'), false);
  assert.match(html, /&lt;/);
});

test('a closing tag cannot break out of the code element', () => {
  const { html } = highlightQuestionCode('</code><script>1</script>', 'javascript');
  assert.equal(html.includes('<script'), false);
  assert.equal(html.includes('</code>'), false);
  assert.equal(markupOutsideSpans(html).includes('<'), false);
  assert.match(html, /&lt;/);
});

test('an unknown language falls back to the python grammar and still encodes', () => {
  const { grammarName, html } = highlightQuestionCode('<img src=x onerror=alert(1)>', '*');
  assert.equal(grammarName, 'python');
  assert.equal(html.includes('<img'), false);
});
