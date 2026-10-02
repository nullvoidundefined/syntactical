// Renders source code as nested Text runs colored per Prism token type,
// inside a horizontal ScrollView so long lines scroll instead of wrapping.
import { ScrollView, Text } from 'react-native';

import type { Grammar } from '../../constants/appConfig';
import { tokenizeCode } from '../../services/codeBlock/tokenizeCode';
import type { CodeToken } from '../../services/codeBlock/types/CodeToken';

const TOKEN_COLORS: Record<string, string> = {
  boolean: '#b98ee8',
  'class-name': '#5fb8e0',
  comment: '#7c828c',
  function: '#5fb8e0',
  keyword: '#b98ee8',
  number: '#e0a458',
  operator: '#e6e8eb',
  string: '#39e88f',
  variable: '#e6e8eb',
};
const DEFAULT_COLOR = '#e6e8eb';

type ColoredRun = { color: string; text: string };

type CodeBlockProps = { className?: string; code: string; grammar: Grammar };

function pickTokenColor(types: string[]): string {
  const matchingType = [...types].reverse().find((tokenType) => tokenType in TOKEN_COLORS);
  return matchingType ? TOKEN_COLORS[matchingType] : DEFAULT_COLOR;
}

function mergeRuns(tokens: CodeToken[]): ColoredRun[] {
  const runs: ColoredRun[] = [];
  for (const { text, types } of tokens) {
    const color = pickTokenColor(types);
    const lastRun = runs[runs.length - 1];
    if (lastRun?.color === color) lastRun.text += text;
    else runs.push({ color, text });
  }
  return runs;
}

export function CodeBlock({ className, code, grammar }: CodeBlockProps) {
  const runs = mergeRuns(tokenizeCode(code, grammar));
  return (
    <ScrollView horizontal className={className}>
      <Text testID="code-block" className="font-mono text-sm text-ink">
        {runs.map(({ color, text }, index) => (
          <Text key={`${index}-${text}`} style={{ color }}>
            {text}
          </Text>
        ))}
      </Text>
    </ScrollView>
  );
}
