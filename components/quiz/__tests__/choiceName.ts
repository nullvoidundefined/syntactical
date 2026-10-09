// The accessible name of a multiple-choice button: its visible letter and text, then ", correct" or
// ", incorrect" (visually hidden text) once answered. The joins differ by renderer (none in the DOM,
// a space in the native tree), so the match allows whitespace. `letter` is a regular expression
// source, so a shuffled round can pass '[A-D]'.
export function choiceName(letter: string, text: string, state?: 'correct' | 'incorrect'): RegExp {
  const escapedText = text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const stateTail = state ? `\\s*,\\s*${state}` : '';
  return new RegExp(`^${letter}\\s*${escapedText}${stateTail}$`);
}
