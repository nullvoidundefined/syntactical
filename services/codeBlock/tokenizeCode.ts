// Splits source code into flat, typed text runs using Prism's tokenizer.
// Returns plain data only, never markup, so callers render it as text.
import Prism from 'prismjs';
import type { Token } from 'prismjs';
import 'prismjs/components/prism-bash';
import 'prismjs/components/prism-go';
import 'prismjs/components/prism-python';
import 'prismjs/components/prism-ruby';
import 'prismjs/components/prism-rust';
import 'prismjs/components/prism-sql';
import 'prismjs/components/prism-typescript';

import type { Grammar } from '../../constants/appConfig';

import type { CodeToken } from './types/CodeToken';

type PrismPiece = Token | string;

function flattenPiece(piece: PrismPiece, outerTypes: string[]): CodeToken[] {
  if (typeof piece === 'string') return [{ text: piece, types: outerTypes }];
  const { content, type } = piece;
  const types = [...outerTypes, type];
  if (typeof content === 'string') return [{ text: content, types }];
  const children = Array.isArray(content) ? content : [content];
  return children.flatMap((child) => flattenPiece(child, types));
}

export function tokenizeCode(code: string, grammar: Grammar): CodeToken[] {
  const languageGrammar = Object.hasOwn(Prism.languages, grammar)
    ? Prism.languages[grammar]
    : undefined;
  if (grammar === 'plain' || !languageGrammar) return [{ text: code, types: [] }];
  return Prism.tokenize(code, languageGrammar).flatMap((piece) => flattenPiece(piece, []));
}
