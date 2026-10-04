// Raised by a model provider for a failure that may pass on the next call: the model
// command timed out or exited non-zero. Gap-fill drops the one draft and moves on. A
// binary that cannot start, an auth failure the provider reports as such, or output
// past the size cap stays a plain Error and stops the run. `stdout` holds what a
// non-zero exit printed, so the provider can spot an error the CLI reported itself; it
// never goes into the message.
export type ProviderTransientReason = 'model-error' | 'model-timeout';

export class ProviderTransientError extends Error {
    readonly reason: ProviderTransientReason;
    readonly stdout: string;

    constructor(reason: ProviderTransientReason, message: string, stdout = '') {
        super(message);
        this.name = 'ProviderTransientError';
        this.reason = reason;
        this.stdout = stdout;
    }
}
