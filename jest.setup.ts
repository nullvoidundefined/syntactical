// Jest setup: AsyncStorage's in-memory mock, a fetch that never resolves
// unless a test replaces it (so no test reaches the network), and an
// expo-constants stand-in that supplies the content base URL, and the
// worklets mock reanimated 4 needs under Jest.
import mockAsyncStorage from '@react-native-async-storage/async-storage/jest/async-storage-mock';

jest.mock('@react-native-async-storage/async-storage', () => mockAsyncStorage);

beforeEach(() => {
  global.fetch = jest.fn(() => new Promise(() => {})) as unknown as typeof fetch;
});

jest.mock('expo-constants', () => ({
  expoConfig: { extra: { contentBaseUrl: 'https://example.test/content/' } },
}));

jest.mock('react-native-worklets', () => require('react-native-worklets/src/mock'));
