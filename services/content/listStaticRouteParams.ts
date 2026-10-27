// The concrete params of the dynamic routes for the static web export, from the bundled manifest: every track, and
// every track and difficulty pair it lists a bank for. The export runs this in Node at build time.
import { BUNDLED_MANIFEST } from './bundledManifest.generated';

export type LanguageParams = { language: string };
export type BankParams = { difficulty: string; language: string };

export function listLanguageParams(): LanguageParams[] {
  return BUNDLED_MANIFEST.languages.map(({ id }) => ({ language: id }));
}

export function listBankParams(): BankParams[] {
  return BUNDLED_MANIFEST.languages.flatMap(({ banks, id }) =>
    Object.keys(banks).map((difficulty) => ({ difficulty, language: id })),
  );
}
