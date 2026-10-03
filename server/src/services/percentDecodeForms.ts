// The percent-decoded forms of a string (B-59.1e, B-59.1f): each contiguous run of `%XX` escapes is
// decoded as UTF-8 sequence by sequence (a byte that cannot start or complete a valid character stays
// as its `%XX` text), and the result is decoded again until it stops changing, capped at 5 rounds.
// Decoding never throws. The raw string is not part of the result.
const ESCAPE_RUN = /(?:%[0-9a-fA-F]{2})+/g;
const MAX_DECODE_ROUNDS = 5;

// UTF-8 lead byte ranges and the sequence length each announces (RFC 3629): C0, C1, and F5 to FF
// never start a character.
const LEAD_BYTE_RANGES = [
  { first: 0x00, last: 0x7f, length: 1 },
  { first: 0xc2, last: 0xdf, length: 2 },
  { first: 0xe0, last: 0xef, length: 3 },
  { first: 0xf0, last: 0xf4, length: 4 },
];
const NOT_A_LEAD_BYTE = 0;
// Non-fatal decoding marks invalid bytes with U+FFFD; a group is valid exactly when its decoded text
// encodes back to the same bytes. One shared instance each, reused for every group.
const DECODER = new TextDecoder('utf-8', { ignoreBOM: true });
const ENCODER = new TextEncoder();

// The number of bytes a UTF-8 lead byte announces; 0 for a byte that cannot start a character.
function sequenceLength(lead: number): number {
  const range = LEAD_BYTE_RANGES.find(({ first, last }) => lead >= first && lead <= last);
  return range ? range.length : NOT_A_LEAD_BYTE;
}

// The group's text when the bytes are exactly one well-formed UTF-8 sequence, otherwise undefined.
function decodeGroup(bytes: number[]): string | undefined {
  const text = DECODER.decode(Uint8Array.from(bytes));
  const roundTrip = ENCODER.encode(text);
  const isWellFormed = roundTrip.length === bytes.length && roundTrip.every((byte, index) => byte === bytes[index]);
  return isWellFormed ? text : undefined;
}

// Decodes each valid byte sequence in the run; a byte that cannot start or complete a character stays as `%XX`.
function decodeRun(run: string): string {
  const originals = run.match(/%[0-9a-fA-F]{2}/g) ?? [];
  const bytes = originals.map((escape) => Number.parseInt(escape.slice(1), 16));
  let result = '';
  let index = 0;
  while (index < bytes.length) {
    const length = sequenceLength(bytes[index]);
    const decoded = length !== NOT_A_LEAD_BYTE ? decodeGroup(bytes.slice(index, index + length)) : undefined;
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
