import { createHash } from 'crypto';

import { verifyBankHash } from '../verifyBankHash';

function hashUtf8Hex(text: string): string {
    return createHash('sha256').update(Buffer.from(text, 'utf8')).digest('hex');
}

async function hashTextWithNode(text: string): Promise<string> {
    return hashUtf8Hex(text);
}

async function hashTextWithNodeUppercase(text: string): Promise<string> {
    return hashUtf8Hex(text).toUpperCase();
}

const CURRENT_BANK_TEXT = JSON.stringify({
    schemaVersion: 2,
    questions: [{ id: 'q1', prompt: 'Which keyword declares a constant?', choices: [{ text: 'let' }, { text: 'const' }] }],
});

const STALE_BANK_TEXT = JSON.stringify({
    schemaVersion: 2,
    questions: [{ id: 'q1', prompt: 'Which keyword declares a variable?', choices: [{ text: 'let' }, { text: 'const' }] }],
});

const MULTIBYTE_BANK_TEXT = JSON.stringify({
    schemaVersion: 2,
    questions: [{ id: 'q1', prompt: 'Qué devuelve café.length en Python? ñ, ü, é', choices: [{ text: '4' }, { text: '5' }] }],
});

describe('verifyBankHash', () => {
    it('accepts a bank whose SHA-256 equals the manifest bank hash', async () => {
        const manifestHash = hashUtf8Hex(CURRENT_BANK_TEXT);

        await expect(verifyBankHash(CURRENT_BANK_TEXT, manifestHash, hashTextWithNode)).resolves.toBe(true);
    });

    it('rejects stale bytes served for a newer manifest bank hash', async () => {
        const newerManifestHash = hashUtf8Hex(CURRENT_BANK_TEXT);

        await expect(verifyBankHash(STALE_BANK_TEXT, newerManifestHash, hashTextWithNode)).resolves.toBe(false);
    });

    it('rejects a bank altered by a single character', async () => {
        const manifestHash = hashUtf8Hex(CURRENT_BANK_TEXT);
        const tamperedText = `${CURRENT_BANK_TEXT} `;

        await expect(verifyBankHash(tamperedText, manifestHash, hashTextWithNode)).resolves.toBe(false);
    });

    it('accepts an uppercase hasher result against a lowercase manifest bank hash', async () => {
        const manifestHash = hashUtf8Hex(CURRENT_BANK_TEXT);

        await expect(
            verifyBankHash(CURRENT_BANK_TEXT, manifestHash, hashTextWithNodeUppercase),
        ).resolves.toBe(true);
    });

    it('rejects stale bytes even when the hasher returns uppercase hex', async () => {
        const newerManifestHash = hashUtf8Hex(CURRENT_BANK_TEXT);

        await expect(
            verifyBankHash(STALE_BANK_TEXT, newerManifestHash, hashTextWithNodeUppercase),
        ).resolves.toBe(false);
    });

    it('hashes multi-byte text as UTF-8 bytes and accepts the matching manifest bank hash', async () => {
        const manifestHash = hashUtf8Hex(MULTIBYTE_BANK_TEXT);
        const utf16ManifestHash = createHash('sha256')
            .update(Buffer.from(MULTIBYTE_BANK_TEXT, 'utf16le'))
            .digest('hex');

        expect(manifestHash).not.toBe(utf16ManifestHash);
        await expect(verifyBankHash(MULTIBYTE_BANK_TEXT, manifestHash, hashTextWithNode)).resolves.toBe(true);
        await expect(verifyBankHash(MULTIBYTE_BANK_TEXT, utf16ManifestHash, hashTextWithNode)).resolves.toBe(
            false,
        );
    });

    it('rejects a truncated prefix of the correct hash', async () => {
        const manifestHash = hashUtf8Hex(CURRENT_BANK_TEXT);

        await expect(
            verifyBankHash(CURRENT_BANK_TEXT, manifestHash.slice(0, 32), hashTextWithNode),
        ).resolves.toBe(false);
    });

    it('rejects an empty manifest bank hash even when the hasher returns an empty string', async () => {
        async function hashTextToEmpty(): Promise<string> {
            return '';
        }

        await expect(verifyBankHash(CURRENT_BANK_TEXT, '', hashTextToEmpty)).resolves.toBe(false);
    });
});
