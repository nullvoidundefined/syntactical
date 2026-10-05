import type { BankEntry } from '@syntactical/content-schema';

export function resolveBankOutputRoot(
    pipelineDir: string,
    contentRoot: string,
    { access }: Pick<BankEntry, 'access'>,
): string {
    return access === 'free' ? pipelineDir : contentRoot;
}
