// Wraps untrusted text in a code fence longer than any backtick run inside it, so the
// text can never close the fence early or forge a heading or checkbox line.
const MIN_FENCE = 3;

export function fenceText(text: string): string {
    const longestRun = Math.max(0, ...(text.match(/`+/g) ?? []).map((run) => run.length));
    const fence = '`'.repeat(Math.max(MIN_FENCE, longestRun + 1));
    return `${fence}text\n${text}\n${fence}`;
}
