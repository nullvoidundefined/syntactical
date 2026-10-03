// Maps a pipeline report's counts to the CLI exit code: any failed question fails the run.
export function exitCodeFor(counts: Record<string, number>): number {
    return (counts['failed'] ?? 0) > 0 ? 1 : 0;
}
