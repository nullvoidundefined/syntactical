// Every bank of a validated manifest in manifest order, with the keys commands build from
// it: `bankKey` is `<language>/<difficulty>`, the shape used by reports and oracle files.
import type { BankEntry, LanguageEntry, Manifest } from '@syntactical/content-schema';

export interface ManifestBankEntry {
    bankKey: string;
    difficulty: string;
    entry: BankEntry;
    language: LanguageEntry;
    languageId: string;
}

export function listBankEntries({ languages }: Manifest): ManifestBankEntry[] {
    return languages.flatMap((language) =>
        Object.entries(language.banks).map(([difficulty, entry]) => ({
            bankKey: `${language.id}/${difficulty}`,
            difficulty,
            entry,
            language,
            languageId: language.id,
        })),
    );
}
