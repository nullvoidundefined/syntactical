// Reads `--content-root <path>` or `--content-root=<path>` from argv. Absent: undefined.
// Present with no value: throws, so a typo never silently falls back to the default.
const FLAG = '--content-root';

export function readContentRootFlag(argv: string[]): string | undefined {
    const index = argv.findIndex((arg) => arg === FLAG || arg.startsWith(`${FLAG}=`));
    if (index === -1) {
        return undefined;
    }
    const arg = argv[index] as string;
    const value = arg === FLAG ? argv[index + 1] : arg.slice(FLAG.length + 1);
    if (!value || value.startsWith('--')) {
        throw new Error(`${FLAG} needs a path`);
    }
    return value;
}
