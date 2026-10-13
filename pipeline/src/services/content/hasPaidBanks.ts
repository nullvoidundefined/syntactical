// Whether any bank in the manifest is paid, which means a command will read from or write
// under the private content root and must check it first.
import type { Manifest } from '@syntactical/content-schema';

export function hasPaidBanks({ languages }: Manifest): boolean {
    return languages.some(({ banks }) => Object.values(banks).some(({ access }) => access !== 'free'));
}
