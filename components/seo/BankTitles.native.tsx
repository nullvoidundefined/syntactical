// Native builds have no static export to crawl, so the bank titles render nothing there and the title index stays
// out of the native bundle.
export function BankTitles(_props: { difficulty: string; language: string }) {
  return null;
}
