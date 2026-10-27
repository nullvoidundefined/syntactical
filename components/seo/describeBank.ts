// The meta description of a bank page, kept apart from BankTitles so that file exports only its component.
// Search engines show about this many characters of a meta description.
const MAX_DESCRIPTION_LENGTH = 155;
const ELLIPSIS = '\u2026';

// Names as many whole titles, in bank order, as fit in MAX_DESCRIPTION_LENGTH, ending with an ellipsis only when a
// title was left out.
export function describeBank(bankLabel: string, titles: readonly string[]): string {
  const intro = `${bankLabel} quiz on Syntactical.`;
  let named = '';
  for (const [index, title] of titles.entries()) {
    const joined = index === 0 ? title : `${named}; ${title}`;
    const end = index === titles.length - 1 ? '.' : ELLIPSIS;
    if (`${intro} Covers ${joined}${end}`.length > MAX_DESCRIPTION_LENGTH) break;
    named = joined;
    if (index === titles.length - 1) return `${intro} Covers ${named}.`;
  }
  return named === '' ? intro : `${intro} Covers ${named}${ELLIPSIS}`;
}
