import { PACKAGE_NAME as contentSchemaName } from '@syntactical/content-schema';
import { PACKAGE_NAME as progressName } from '@syntactical/progress';

describe('shared workspace packages in the app toolchain', () => {
  it('resolve from the app, including their .js-suffixed relative imports', () => {
    expect(contentSchemaName).toBe('@syntactical/content-schema');
    expect(progressName).toBe('@syntactical/progress');
  });
});
