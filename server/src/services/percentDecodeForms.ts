// The percent-decoded forms of a string (B-59.1e): each contiguous run of `%XX` escapes is decoded as UTF-8
// (a run that is not valid UTF-8 stays as it is), and the result is decoded again until it stops changing,
// capped at a few rounds. The raw string is not part of the result.
const ESCAPE_RUN = /(?:%[0-9a-fA-F]{2})+/g;
const MAX_DECODE_ROUNDS = 5;

function decodeRun(run: string): string {
  try {
    return decodeURIComponent(run);
  } catch {
    return run;
  }
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
