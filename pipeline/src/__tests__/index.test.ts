import { expect, it } from 'vitest';

import { PACKAGE_NAME } from '../index.js';

it('identifies the package', () => {
  expect(PACKAGE_NAME).toBe('@syntactical/pipeline');
});
