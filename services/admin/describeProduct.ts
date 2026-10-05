// The "<language label> <difficulty label>" name of a paid bank product id, read from the
// manifest; an id the manifest does not know keeps its own text.
import { DIFFICULTIES, type Manifest } from '@syntactical/content-schema';

const PRODUCT_ID = /^syntactical\.([^.]+)\.([^.]+)$/;

export function describeProduct(productId: string, manifest: Manifest): string {
  const match = PRODUCT_ID.exec(productId);
  if (match === null) return productId;
  const language = manifest.languages.find(({ id }) => id === match[1]);
  const difficulty = DIFFICULTIES.find(({ id }) => id === match[2]);
  return language === undefined || difficulty === undefined ? productId : `${language.label} ${difficulty.label}`;
}
