// Two Jest projects: native components and logic under the iOS preset,
// and DOM assertions for the web build in files ending .web.test.tsx.
const shared = {
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  moduleNameMapper: { '\\.css$': '<rootDir>/config/jestStyleStub.js' },
  testPathIgnorePatterns: ['/node_modules/', '/src/', '/dist'],
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
