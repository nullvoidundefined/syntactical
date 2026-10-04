// The suite's `test`: every spec fails on an uncaught page error, so a crash that a spec's own
// assertions do not look at still surfaces. Console errors are collected per page for the failure
// message of specs that choose to read them.
import { test as base, expect } from '@playwright/test';

const test = base.extend<{ pageErrors: string[] }>({
  pageErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await use(errors);
      expect(errors, 'uncaught errors in the page').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect, test };
