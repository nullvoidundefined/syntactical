// The Prism grammars the app can highlight; any other grammar renders as plain text.
export const GRAMMARS = [
  'python',
  'sql',
  'javascript',
  'typescript',
  'go',
  'rust',
  'ruby',
  'bash',
  'plain',
] as const;
export type Grammar = (typeof GRAMMARS)[number];
