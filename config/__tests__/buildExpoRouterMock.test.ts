// The shared expo-router stand-in: the real module plus an inert router whose
// navigation methods a suite captures through record or a named method, and
// search-param hooks that read readParams only when it is given.
import { buildExpoRouterMock } from '../buildExpoRouterMock';

const actual = jest.requireActual<Record<string, unknown>>('expo-router');

describe('buildExpoRouterMock', () => {
  it('keeps the real module exports and adds an inert router that useRouter returns', () => {
    const mock = buildExpoRouterMock();
    expect(mock.Link).toBe(actual.Link);
    expect(mock.useRouter()).toBe(mock.router);
    expect(() => {
      mock.router.back();
      mock.router.dismissTo();
      mock.router.navigate();
      mock.router.push();
      mock.router.replace();
    }).not.toThrow();
  });

  it('record captures dismissTo, navigate, push, and replace, and leaves back inert', () => {
    const calls: unknown[] = [];
    const { router } = buildExpoRouterMock({ record: (href: unknown) => calls.push(href) });
    router.push('/a');
    router.replace('/b');
    router.navigate('/c');
    router.dismissTo('/d');
    router.back();
    expect(calls).toEqual(['/a', '/b', '/c', '/d']);
  });

  it('a named method takes precedence over record', () => {
    const recorded: unknown[] = [];
    const replaced: unknown[] = [];
    const { router } = buildExpoRouterMock({
      record: (href: unknown) => recorded.push(href),
      replace: (href: unknown) => replaced.push(href),
    });
    router.replace('/x');
    router.push('/y');
    expect(replaced).toEqual(['/x']);
    expect(recorded).toEqual(['/y']);
  });

  it('readParams backs both search-param hooks, and without it the real hooks stay', () => {
    const params = { current: { language: 'python' } };
    const withParams = buildExpoRouterMock({ readParams: () => params.current });
    expect(withParams.useLocalSearchParams()).toBe(params.current);
    expect(withParams.useGlobalSearchParams()).toBe(params.current);

    const withoutParams = buildExpoRouterMock();
    expect(withoutParams.useLocalSearchParams).toBe(actual.useLocalSearchParams);
    expect(withoutParams.useGlobalSearchParams).toBe(actual.useGlobalSearchParams);
  });
});
