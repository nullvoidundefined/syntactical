// What the latest validate report says about one question; `none` when it is not listed.
export interface PublishVerdict {
    runtimeVersion?: string;
    status: 'failed' | 'none' | 'not-executable' | 'passed';
}
