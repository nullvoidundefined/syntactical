// Two Jest projects: native components and logic under the iOS preset,
// and DOM assertions for the web build in files ending .web.test.tsx.
const shared = {
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  clearMocks: true,
  moduleNameMapper: {
    '\\.css$': '<rootDir>/config/jestStyleStub.js',
    // The shared workspace packages are consumed as TypeScript source, as Metro does.
    '^@syntactical/(content-schema|progress)$': '<rootDir>/packages/$1/src/index.ts',
    // NodeNext source in those packages imports siblings with a .js suffix.
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  // Node build scripts are ES modules (.mjs); Babel transpiles them for Jest.
  transform: { '^.+\\.mjs$': 'babel-jest' },
  // Workspace packages (packages/, pipeline/, server/) run their own vitest suites.
  testPathIgnorePatterns: ['/node_modules/', '/dist', '<rootDir>/packages/', '<rootDir>/pipeline/', '<rootDir>/server/'],
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|expo-router|nativewind|react-native-css-interop|@tanstack/.*|standard-navigation|@react-navigation/.*|react-navigation))',
  ],
};

module.exports = {
  projects: [
    {
      ...shared,
      displayName: 'native',
      preset: 'jest-expo/ios',
      testMatch: ['**/__tests__/**/*.test.ts?(x)'],
      moduleFileExtensions: ['ios.ts', 'ios.tsx', 'ios.js', 'native.ts', 'native.tsx', 'native.js', 'ts', 'tsx', 'js', 'jsx', 'mjs', 'json'],
      testPathIgnorePatterns: [...shared.testPathIgnorePatterns, '\\.web\\.test\\.tsx?$'],
    },
    {
      ...shared,
      displayName: 'web',
      preset: 'jest-expo/web',
      testMatch: ['**/__tests__/**/*.web.test.ts?(x)'],
    },
  ],
};
