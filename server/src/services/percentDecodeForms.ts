// The percent-decoded forms of a string (B-59.1e): each contiguous run of `%XX` escapes is decoded as UTF-8
// (a byte that cannot start or complete a valid character stays as its `%XX` text), and the result is decoded again until it stops changing,
// capped at a few rounds. The raw string is not part of the result.
const ESCAPE_RUN = /(?:%[0-9a-fA-F]{2})+/g;
const MAX_DECODE_ROUNDS = 5;

// The number of bytes a UTF-8 lead byte announces; 0 for a byte that cannot start a character.
function sequenceLength(lead: number): number {
  if (lead < 0x80) {
    return 1;
  }
  if (lead >= 0xc2 && lead <= 0xdf) {
    return 2;
  }
  if (lead >= 0xe0 && lead <= 0xef) {
    return 3;
  }
  if (lead >= 0xf0 && lead <= 0xf4) {
    return 4;
  }
  return 0;
}

function decodeGroup(bytes: number[]): string | undefined {
  try {
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(Uint8Array.from(bytes));
  } catch {
    return undefined;
  }
}

// Decodes each valid byte sequence in the run; a byte that cannot start or complete a character stays as `%XX`.
function decodeRun(run: string): string {
  const originals = run.match(/%[0-9a-fA-F]{2}/g) ?? [];
  const bytes = originals.map((escape) => Number.parseInt(escape.slice(1), 16));
  let result = '';
  let index = 0;
  while (index < bytes.length) {
    const length = sequenceLength(bytes[index]);
    const decoded = length > 0 ? decodeGroup(bytes.slice(index, index + length)) : undefined;
    if (decoded !== undefined) {
      result += decoded;
      index += length;
    } else {
      result += originals[index];
      index += 1;
    }
  }
  return result;
}

function percentDecodeForms(text: string): string[] {
  const forms: string[] = [];
  let current = text;
  for (let round = 0; round < MAX_DECODE_ROUNDS; round += 1) {
    const decoded = current.replace(ESCAPE_RUN, decodeRun);
    if (decoded === current) {
      break;
    }
    forms.push(decoded);
    current = decoded;
  }
  return forms;
}

export { percentDecodeForms };
