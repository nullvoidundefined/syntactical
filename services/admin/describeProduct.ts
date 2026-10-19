// The "<language label> <difficulty label>" name of a paid bank product id, read from the
// manifest; an id the manifest does not know keeps its own text.
import type { Manifest } from '@syntactical/content-schema';

import { findDifficulty } from '../content/findDifficulty';
import { findLanguageEntry } from '../content/findLanguageEntry';

const PRODUCT_ID = /^syntactical\.([^.]+)\.([^.]+)$/;

export function describeProduct(productId: string, manifest: Manifest): string {
  const match = PRODUCT_ID.exec(productId);
  if (match === null) return productId;
  const language = findLanguageEntry(manifest.languages, match[1]);
  const difficulty = findDifficulty(match[2]);
  return language === undefined || difficulty === undefined ? productId : `${language.label} ${difficulty.label}`;
}
