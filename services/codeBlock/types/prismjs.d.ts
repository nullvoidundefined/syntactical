// Minimal typings for the slice of prismjs the code block tokenizer uses,
// declared locally so no @types dependency is needed.
declare module 'prismjs' {
  export type Grammar = Record<string, unknown>;
  export type Token = { content: Array<Token | string> | Token | string; type: string };
  const Prism: {
    languages: Record<string, Grammar | undefined>;
    tokenize: (code: string, grammar: Grammar) => Array<Token | string>;
  };
  export default Prism;
}
