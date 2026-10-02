import { existsSync, readFileSync } from 'node:fs';

const { dependencies = {}, devDependencies = {}, scripts } = JSON.parse(readFileSync('package.json', 'utf8'));
const deployWorkflow = readFileSync('.github/workflows/deploy.yml', 'utf8');

describe('cutover to the Expo web build', () => {
  it('runs the Expo equivalents for dev, build, test, and lint', () => {
    const { build, dev, lint, test } = scripts;
    expect(dev).toBe('expo start');
    expect(build).toBe(
      'npm run content:build && expo export --platform web --output-dir dist && cp -R content dist/content && node scripts/copySpaFallback.mjs dist',
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
