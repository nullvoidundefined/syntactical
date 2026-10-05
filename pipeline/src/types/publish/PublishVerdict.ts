// What the latest validate report says about one question; `none` when it is not listed.
import type { Evidence } from '@syntactical/content-schema';
export interface PublishVerdict {
    evidence?: Evidence;
    method?: 'executed' | 'judged';
    runtimeVersion?: string;
    status: 'failed' | 'none' | 'not-executable' | 'passed';
}
