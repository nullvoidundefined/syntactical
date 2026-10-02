import path from 'node:path';

const { createWorkspaceResolver } = require('../resolveWorkspaceRequest');

const root = path.join(path.sep, 'repo');

function resolveFrom(originModulePath: string, moduleName: string): string {
  let requested = '';
  const context = {
    originModulePath,
    resolveRequest: (_context: unknown, name: string) => {
      requested = name;
      return { type: 'empty' };
    },
  };
  createWorkspaceResolver(root)(context, moduleName, 'web');
  return requested;
}

describe('createWorkspaceResolver', () => {
  it('strips .js from a relative import inside packages/', () => {
    expect(resolveFrom(path.join(root, 'packages', 'progress', 'src', 'index.ts'), './packageName.js')).toBe('./packageName');
  });

  it.each([
    ['a sibling directory that only shares the prefix', path.join(root, 'packages-evil', 'x.ts'), './a.js'],
    ['a file named like the directory', path.join(root, 'packagesfoo.ts'), './a.js'],
    ['app code outside packages/', path.join(root, 'components', 'quiz', 'Card.tsx'), './a.js'],
  ])('passes the specifier through unchanged from %s', (_label, origin, moduleName) => {
    expect(resolveFrom(origin, moduleName)).toBe(moduleName);
  });

  it.each(['.js', 'lodash.js', './a.ts'])('passes %p through unchanged even inside packages/', (moduleName) => {
    expect(resolveFrom(path.join(root, 'packages', 'progress', 'src', 'index.ts'), moduleName)).toBe(moduleName);
  });
});
