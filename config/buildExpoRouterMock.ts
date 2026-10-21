// One expo-router stand-in for suites that render a screen outside a navigator:
// the real module with an inert router whose methods a suite can capture (record
// covers every navigation method; a named method overrides it; back is inert
// unless given), and, when readParams is given, search-param hooks that read it.
// Used from a jest.mock factory:
//   jest.mock('expo-router', () => require('../../config/buildExpoRouterMock').buildExpoRouterMock({ ... }));
type RouterMethod = (...args: never[]) => void;
type RouteParams = Record<string, string | string[] | undefined>;

type ExpoRouterMockOptions = {
  back?: RouterMethod;
  dismissTo?: RouterMethod;
  navigate?: RouterMethod;
  push?: RouterMethod;
  replace?: RouterMethod;
  // Applies to dismissTo, navigate, push, and replace unless one is given above.
  record?: RouterMethod;
  readParams?: () => RouteParams;
};

function doNothing(): void {}

export function buildExpoRouterMock(options: ExpoRouterMockOptions = {}) {
  const { readParams, record = doNothing } = options;
  const router = {
    back: options.back ?? doNothing,
    dismissTo: options.dismissTo ?? record,
    navigate: options.navigate ?? record,
    push: options.push ?? record,
    replace: options.replace ?? record,
  };
  return {
    ...jest.requireActual('expo-router'),
    router,
    useRouter: () => router,
    ...(readParams ? { useGlobalSearchParams: readParams, useLocalSearchParams: readParams } : {}),
  };
}
