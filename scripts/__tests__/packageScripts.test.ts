import { existsSync, readFileSync } from 'node:fs';

const { dependencies = {}, devDependencies = {}, scripts } = JSON.parse(readFileSync('package.json', 'utf8'));
const deployWorkflow = readFileSync('.github/workflows/deploy.yml', 'utf8');

describe('cutover to the Expo web build', () => {
  it('runs the Expo equivalents for dev, build, test, and lint', () => {
    const { build, dev, lint, test } = scripts;
    expect(dev).toBe('expo start');
    expect(build).toBe(
      'npm run content:build && npm run build -w @syntactical/progress && expo export --platform web --output-dir dist && cp -R content dist/content && node scripts/copySpaFallback.mjs dist',
    );
    expect(test).toBe('jest');
    expect(lint).toBe('oxlint');
  });

  it('no longer contains Vite, its dependencies, or the old source tree', () => {
    const dependencyNames = Object.keys({ ...dependencies, ...devDependencies });
    expect(dependencyNames.filter((name) => name.includes('vite') || name === 'gh-pages' || name === 'tailwindcss-v4')).toEqual([]);
    expect(existsSync('vite.config.js')).toBe(false);
    expect(existsSync('index.html')).toBe(false);
    expect(existsSync('src')).toBe(false);
  });

  it('deploys the Expo export at the site root without a separate preview build', () => {
    expect(deployWorkflow).toContain('run: npm run build');
    expect(deployWorkflow).not.toContain('expo:export:preview');
    expect(deployWorkflow).not.toContain('dist/preview');
  });
});

describe('workspaces', () => {
  const workspacePackages = ['packages/content-schema', 'packages/progress', 'pipeline', 'server'];

  it('declares the workspace packages', () => {
    const { workspaces } = JSON.parse(readFileSync('package.json', 'utf8'));
    expect(workspaces).toEqual(['packages/*', 'pipeline', 'server']);
  });

  it('gives each workspace an ESM package with vitest and a type check', () => {
    for (const directory of workspacePackages) {
      const workspace = JSON.parse(readFileSync(`${directory}/package.json`, 'utf8'));
      expect(workspace.name).toMatch(/^@syntactical\//);
      expect(workspace.type).toBe('module');
      expect(workspace.scripts).toEqual(expect.objectContaining({ test: 'vitest run', typecheck: 'tsc --noEmit' }));
    }
  });

  it('exposes TypeScript source to Metro and built output to Node for the shared packages', () => {
    for (const directory of ['packages/content-schema', 'packages/progress']) {
      const shared = JSON.parse(readFileSync(`${directory}/package.json`, 'utf8'));
      expect(shared['react-native']).toBe('./src/index.ts');
      expect(shared.main).toBe('./dist/index.js');
      expect(shared.exports['.']).toEqual({ types: './src/index.ts', 'react-native': './src/index.ts', default: './dist/index.js' });
      expect(shared.scripts.build).toBe('tsc -p tsconfig.build.json');
    }
  });

  it('keeps workspace code out of the root Jest projects and root type check', () => {
    const jestConfig = require('../../jest.config.js');
    for (const project of jestConfig.projects) {
      expect(project.testPathIgnorePatterns).toEqual(expect.arrayContaining(['<rootDir>/packages/', '<rootDir>/pipeline/', '<rootDir>/server/']));
    }
    const rootTsconfig = JSON.parse(readFileSync('tsconfig.json', 'utf8'));
    expect(rootTsconfig.exclude).toEqual(expect.arrayContaining(['packages', 'pipeline', 'server']));
  });
});
