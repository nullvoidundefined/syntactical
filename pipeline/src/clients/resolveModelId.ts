// The one model id every provider uses: PIPELINE_MODEL from the environment, else the
// default. The CLI path passes it as `--model`, the API path as `model`, so provenance
// records the same model whichever path a command runs through.
const DEFAULT_MODEL = 'claude-opus-5-5';

export function resolveModelId(env: NodeJS.ProcessEnv = process.env): string {
    return env.PIPELINE_MODEL || DEFAULT_MODEL;
}
