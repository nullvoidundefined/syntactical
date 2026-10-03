// The display label for a topic id in the manifest: `operators-and-types` becomes
// "Operators and types". `wtf` is an acronym and stays upper case.
const ACRONYMS = new Map([['wtf', 'WTF']]);

export function labelTopic(id: string): string {
    const known = ACRONYMS.get(id);
    if (known !== undefined) {
        return known;
    }
    const words = id.split('-').join(' ');
    return `${words.slice(0, 1).toUpperCase()}${words.slice(1)}`;
}
