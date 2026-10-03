// Raised when a model's output still fails JSON parsing or the schema after
// every attempt. It carries the prompt version and a short issue summary, never
// the raw model output beyond a truncated excerpt.
const MAX_ISSUE_LENGTH = 200;

export class ModelOutputInvalid extends Error {
    readonly issue: string;
    readonly promptVersion: string;

    constructor(promptVersion: string, issue: string) {
        const shortIssue = issue.length > MAX_ISSUE_LENGTH ? `${issue.slice(0, MAX_ISSUE_LENGTH)}...` : issue;
        super(`Model output invalid for prompt ${promptVersion}: ${shortIssue}`);
        this.name = 'ModelOutputInvalid';
        this.issue = shortIssue;
        this.promptVersion = promptVersion;
    }
}
