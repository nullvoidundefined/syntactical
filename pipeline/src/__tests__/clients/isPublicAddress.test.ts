// pipeline/src/__tests__/clients/isPublicAddress.test.ts
import { describe, expect, it } from 'vitest';

import { isPublicAddress } from '../../clients/isPublicAddress.js';

describe('isPublicAddress', () => {
    it.each([
        '127.0.0.1',
        '127.255.255.254',
        '10.0.0.1',
        '172.16.0.1',
        '172.31.255.255',
        '192.168.1.1',
        '169.254.169.254',
        '0.0.0.0',
        '100.64.0.1',
        '224.0.0.1',
        '255.255.255.255',
        '::',
        '::1',
        'fe80::1',
        'fc00::1',
        'fd12:3456::1',
        'ff02::1',
        '::ffff:127.0.0.1',
        '::ffff:10.0.0.1',
        '::ffff:7f00:1',
        '192.0.0.1',
        '198.18.0.1',
        '198.19.255.254',
        '240.0.0.1',
        '64:ff9b::5db8:d822',
        '2001:db8::1',
        '::ffff:93.184.216.34',
        '::ffff:5db8:d822',
        'not-an-ip',
        '',
    ])('treats %j as not public', (address) => {
        expect(isPublicAddress(address)).toBe(false);
    });

    it.each(['93.184.216.34', '172.32.0.1', '104.16.0.1', '2606:4700::6810:84e5'])('treats %s as public', (address) => {
        expect(isPublicAddress(address)).toBe(true);
    });
});
