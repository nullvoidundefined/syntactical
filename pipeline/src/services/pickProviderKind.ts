// `--api` selects the Anthropic API provider; anything else uses the `claude -p` CLI.
export function pickProviderKind(argv: string[]): 'api' | 'cli' {
    return argv.includes('--api') ? 'api' : 'cli';
}
