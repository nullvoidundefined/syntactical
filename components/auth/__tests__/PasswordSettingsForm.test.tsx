// PasswordSettingsForm on native (Task 7.9; B-88, B-89, B-90). The real AuthProvider and the real
// apiFetch run against a routed fetch stand-in for a signed-in user, so each assertion is on the
// HTTP contract of PUT me/password and on what the form shows:
// - hasPassword false: the heading "Add a password" and one new-password field; hasPassword true:
//   "Change password", a current-password field, and a new-password field;
// - saving sends PUT me/password (currentPassword only when typed); 200 announces
//   "Password saved. Other devices were signed out." and clears both fields;
// - 403 AUTH_REAUTH_REQUIRED, and "Use a code instead", open the code steps for the signed-in
//   email with no email field; after the code sign-in the form returns with the new password
//   still entered, and saving without a current password succeeds;
// - 400 AUTH_INVALID_CREDENTIALS is tied to the current-password field; the three policy refusals
//   to the new-password field; other refusals are announced without echoing a password;
// - negative input: a 129-code-point new password is refused on device, and a lone surrogate or an
//   oversized value in either field never saves.
// Every value is built at run time.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import { NavigationContext } from 'expo-router/build/react-navigation/core';

import { createQueryClient } from '../../../config/queryClient';
import {
  AUTH_STORAGE_KEY,
  SESSION_TOKEN_KEY,
  buildIdentity,
  holdReply,
  installRoutedFetch,
  type RoutedRequest,
  type SignInIdentity,
} from '../../../state/__tests__/authTestSupport';
import { AuthProvider } from '../../../state/AuthProvider';
import { PasswordSettingsForm } from '../PasswordSettingsForm';

import {
  ADD_HEADING,
  BREACHED_MESSAGE,
  BUSY_MESSAGE,
  CHANGE_HEADING,
  CODES_ROUTE,
  CODE_LABEL,
  CURRENT_LABEL,
  EMAIL_LABEL,
  NEW_LABEL,
  PASSWORD_ROUTE,
  RATE_LIMITED_MESSAGE,
  SAVED_MESSAGE,
  SAVE_BUTTON,
  SEND_CODE_BUTTON,
  SESSIONS_ROUTE,
  TOO_LONG_MESSAGE,
  TOO_SHORT_MESSAGE,
  UNAVAILABLE_MESSAGE,
  USE_CODE_BUTTON,
  VERIFY_BUTTON,
  WRONG_CURRENT_MESSAGE,
  buildInjectionPassword,
  buildLoneSurrogatePassword,
  buildPassword,
  buildPasswordOfLength,
  codeSentReply,
  errorReply,
  escapeForRegExp,
  savedReply,
  sessionReply,
} from './passwordSettingsTestSupport';

jest.mock('expo-constants', () => ({
  expoConfig: { extra: { apiBaseUrl: 'https://api.syntactical.dev/v1/' } },
}));

jest.mock('expo-secure-store', () => {
  const values = new Map<string, string>();
  return {
    mockValues: values,
    getItemAsync: jest.fn((key: string) => Promise.resolve(values.get(key) ?? null)),
    setItemAsync: jest.fn((key: string, value: string) => {
      values.set(key, value);
      return Promise.resolve();
    }),
    deleteItemAsync: jest.fn((key: string) => {
      values.delete(key);
      return Promise.resolve();
    }),
  };
});

jest.mock('../../../clients/purchasesIdentity', () => ({
  identifyPurchaser: () => Promise.resolve(),
  resetPurchaser: () => Promise.resolve(),
}));

jest.mock('expo-router', () => {
  const router = { back: () => undefined, navigate: () => undefined, push: () => undefined, replace: () => undefined };
  return {
    ...jest.requireActual('expo-router'),
    router,
    useGlobalSearchParams: () => ({}),
    useLocalSearchParams: () => ({}),
    useRouter: () => router,
  };
});

const secureStore = jest.requireMock('expo-secure-store') as { mockValues: Map<string, string> };

type Node = ReturnType<typeof screen.getByText>;

function listPasswordRequests(requests: RoutedRequest[]): RoutedRequest[] {
  return requests.filter((request) => request.method === 'PUT' && request.path === 'me/password');
}

function readDescribedByIds(element: Node): string[] {
  const raw = element.props['aria-describedby'] ?? element.props.accessibilityDescribedBy ?? '';
  return String(raw)
    .split(/\s+/)
    .filter((id) => id !== '');
}

// The id of the element that carries the alert: the alert region itself or the nearest ancestor with an id.
function readAlertId(alert: Node): string {
  let node: Node | null = alert;
  while (node !== null) {
    const id = node.props?.nativeID ?? node.props?.id;
    if (typeof id === 'string' && id !== '') return id;
    node = node.parent as Node | null;
  }
  throw new Error('the alert region has no id');
}

// True when the node or an ancestor is a live region (role status or alert, or aria-live).
function isAnnounced(node: Node): boolean {
  let current: Node | null = node;
  while (current !== null) {
    const { props } = current;
    if (props?.role === 'status' || props?.role === 'alert') return true;
    if (props?.['aria-live'] === 'polite' || props?.['aria-live'] === 'assertive') return true;
    if (props?.accessibilityLiveRegion === 'polite' || props?.accessibilityLiveRegion === 'assertive') return true;
    current = current.parent as Node | null;
  }
  return false;
}

function expectAlertOmits(alert: Node, values: string[]): void {
  for (const value of values) {
    expect(within(alert).queryByText(new RegExp(escapeForRegExp(value)))).toBeNull();
  }
}

function listHeadingTexts(): string[] {
  return screen.getAllByRole('heading').map((heading) => String(heading.props.children));
}

function listInputValues(): string[] {
  return screen.container
    .queryAll((node) => typeof node.props?.value === 'string')
    .map((node) => node.props.value as string);
}

async function signIn(identity: SignInIdentity): Promise<void> {
  await AsyncStorage.setItem(
    AUTH_STORAGE_KEY,
    JSON.stringify({ knownUserIds: [identity.userId], userId: identity.userId }),
  );
  secureStore.mockValues.set(SESSION_TOKEN_KEY, identity.sessionValue);
}

async function renderForm(
  identity: SignInIdentity,
  hasPassword: boolean,
  options: { navigation?: unknown; onPasswordSaved?: (hasPassword: boolean) => void } = {},
) {
  await signIn(identity);
  const form = (
    <PasswordSettingsForm email={identity.email} hasPassword={hasPassword} onPasswordSaved={options.onPasswordSaved} />
  );
  const rendered = await render(
    <QueryClientProvider client={createQueryClient()}>
      <AuthProvider>
        {options.navigation === undefined ? (
          form
        ) : (
          <NavigationContext.Provider value={options.navigation as never}>{form}</NavigationContext.Provider>
        )}
      </AuthProvider>
    </QueryClientProvider>,
  );
  await screen.findByLabelText(NEW_LABEL);
  return rendered;
}

async function typeNew(password: string): Promise<void> {
  await fireEvent.changeText(screen.getByLabelText(NEW_LABEL), password);
}

async function typeCurrent(password: string): Promise<void> {
  await fireEvent.changeText(screen.getByLabelText(CURRENT_LABEL), password);
}

async function pressSave(): Promise<void> {
  await fireEvent.press(screen.getByRole('button', { name: SAVE_BUTTON }));
}

// The code steps send the code to the signed-in email either as they open or on "Send code";
// both readings reach the code field here.
async function reachCodeField(): Promise<void> {
  await waitFor(() =>
    expect(
      screen.queryByLabelText(CODE_LABEL) ?? screen.queryByRole('button', { name: SEND_CODE_BUTTON }),
    ).toBeTruthy(),
  );
  const sendButton = screen.queryByRole('button', { name: SEND_CODE_BUTTON });
  if (sendButton !== null) await fireEvent.press(sendButton);
  await screen.findByLabelText(CODE_LABEL);
}

async function submitCode(code: string): Promise<void> {
  await fireEvent.changeText(screen.getByLabelText(CODE_LABEL), code);
  await fireEvent.press(screen.getByRole('button', { name: VERIFY_BUTTON }));
}

beforeEach(async () => {
  await AsyncStorage.clear();
  secureStore.mockValues.clear();
});

describe('PasswordSettingsForm, the fields', () => {
  it('for hasPassword false shows the heading "Add a password" and one hidden new-password field', async () => {
    installRoutedFetch({});
    await renderForm(buildIdentity(), false);
    expect(listHeadingTexts()).toContain(ADD_HEADING);
    expect(listHeadingTexts()).not.toContain(CHANGE_HEADING);
    const input = screen.getByLabelText(NEW_LABEL);
    expect(input.props.autoComplete).toBe('new-password');
    expect(input.props.textContentType).toBe('newPassword');
    expect(input.props.secureTextEntry).toBe(true);
    expect(screen.queryByLabelText(CURRENT_LABEL)).toBeNull();
    expect(screen.getByRole('button', { name: SAVE_BUTTON })).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('for hasPassword true shows "Change password" with a current-password and a new-password field', async () => {
    installRoutedFetch({});
    await renderForm(buildIdentity(), true);
    expect(listHeadingTexts()).toContain(CHANGE_HEADING);
    expect(listHeadingTexts()).not.toContain(ADD_HEADING);
    const current = screen.getByLabelText(CURRENT_LABEL);
    expect(current.props.autoComplete).toBe('current-password');
    expect(current.props.textContentType).toBe('password');
    expect(current.props.secureTextEntry).toBe(true);
    expect(screen.getByLabelText(NEW_LABEL).props.autoComplete).toBe('new-password');
    expect(screen.getByRole('button', { name: USE_CODE_BUTTON })).toBeTruthy();
  });

  it('gives each password field its own "Show password" toggle', async () => {
    installRoutedFetch({});
    await renderForm(buildIdentity(), true);
    expect(screen.getAllByRole('button', { name: 'Show password' })).toHaveLength(2);
  });
});

describe('PasswordSettingsForm, saving', () => {
  it('sends the current and new password to PUT me/password with the session, announces the save, and clears both fields', async () => {
    const identity = buildIdentity();
    const current = buildPassword();
    const next = buildPassword();
    const { requests } = installRoutedFetch({ [PASSWORD_ROUTE]: savedReply() });
    await renderForm(identity, true);
    await typeCurrent(current);
    await typeNew(next);
    await pressSave();
    const saved = await screen.findByText(SAVED_MESSAGE);
    expect(isAnnounced(saved)).toBe(true);
    const sent = listPasswordRequests(requests);
    expect(sent).toHaveLength(1);
    expect(sent[0].body).toEqual({ currentPassword: current, newPassword: next });
    expect(sent[0].headers.authorization).toBe(`Bearer ${identity.sessionValue}`);
    expect(screen.getByLabelText(CURRENT_LABEL).props.value).toBe('');
    expect(screen.getByLabelText(NEW_LABEL).props.value).toBe('');
    expect(listInputValues()).not.toContain(current);
    expect(listInputValues()).not.toContain(next);
  });

  it('adding a password sends only newPassword, with no currentPassword key', async () => {
    const next = buildPassword();
    const { requests } = installRoutedFetch({ [PASSWORD_ROUTE]: savedReply() });
    await renderForm(buildIdentity(), false);
    await typeNew(next);
    await pressSave();
    await screen.findByText(SAVED_MESSAGE);
    const sent = listPasswordRequests(requests);
    expect(sent).toHaveLength(1);
    expect(sent[0].body).toEqual({ newPassword: next });
    expect(listInputValues()).not.toContain(next);
  });

  it('changing with the current password left empty sends no currentPassword (the forgot-password return) and saves', async () => {
    const next = buildPassword();
    const { requests } = installRoutedFetch({ [PASSWORD_ROUTE]: savedReply() });
    await renderForm(buildIdentity(), true);
    await typeNew(next);
    await pressSave();
    await screen.findByText(SAVED_MESSAGE);
    const sent = listPasswordRequests(requests);
    expect(sent).toHaveLength(1);
    expect(sent[0].body).toEqual({ newPassword: next });
  });

  it('sends one request when "Save password" is pressed again while the first is in flight', async () => {
    const held = holdReply();
    const { requests } = installRoutedFetch({ [PASSWORD_ROUTE]: held });
    await renderForm(buildIdentity(), false);
    await typeNew(buildPassword());
    await pressSave();
    await waitFor(() => expect(listPasswordRequests(requests)).toHaveLength(1));
    await pressSave();
    held.release({ status: 200, body: { data: { hasPassword: true } } });
    await screen.findByText(SAVED_MESSAGE);
    expect(listPasswordRequests(requests)).toHaveLength(1);
  });

  it('sends a password with markup, quotes, and SQL-shaped text unchanged and never renders it as text', async () => {
    const next = buildInjectionPassword();
    const { requests } = installRoutedFetch({ [PASSWORD_ROUTE]: savedReply() });
    await renderForm(buildIdentity(), false);
    await typeNew(next);
    await pressSave();
    await screen.findByText(SAVED_MESSAGE);
    expect(listPasswordRequests(requests)[0].body).toEqual({ newPassword: next });
    expect(screen.queryByText(new RegExp(escapeForRegExp(next)))).toBeNull();
  });
});

describe('PasswordSettingsForm, refusals tied to their field', () => {
  it('400 AUTH_INVALID_CREDENTIALS shows "That current password is not right." tied to the current-password field only', async () => {
    const current = buildPassword();
    const next = buildPassword();
    installRoutedFetch({ [PASSWORD_ROUTE]: errorReply(400, 'AUTH_INVALID_CREDENTIALS') });
    await renderForm(buildIdentity(), true);
    await typeCurrent(current);
    await typeNew(next);
    await pressSave();
    const alerts = await screen.findAllByRole('alert');
    expect(alerts).toHaveLength(1);
    expect(within(alerts[0]).getByText(WRONG_CURRENT_MESSAGE)).toBeTruthy();
    expectAlertOmits(alerts[0], [current, next]);
    const alertId = readAlertId(alerts[0]);
    expect(readDescribedByIds(screen.getByLabelText(CURRENT_LABEL))).toContain(alertId);
    expect(readDescribedByIds(screen.getByLabelText(NEW_LABEL))).not.toContain(alertId);
    expect(screen.queryByText(SAVED_MESSAGE)).toBeNull();
  });

  it.each([
    ['AUTH_PASSWORD_TOO_SHORT', TOO_SHORT_MESSAGE],
    ['AUTH_PASSWORD_TOO_LONG', TOO_LONG_MESSAGE],
    ['AUTH_PASSWORD_BREACHED', BREACHED_MESSAGE],
  ])('400 %s is announced in one alert tied to the new-password field only', async (code, message) => {
    const current = buildPassword();
    const next = buildPassword();
    installRoutedFetch({ [PASSWORD_ROUTE]: errorReply(400, code) });
    await renderForm(buildIdentity(), true);
    await typeCurrent(current);
    await typeNew(next);
    await pressSave();
    const alerts = await screen.findAllByRole('alert');
    expect(alerts).toHaveLength(1);
    expect(within(alerts[0]).getByText(message)).toBeTruthy();
    expectAlertOmits(alerts[0], [current, next]);
    const alertId = readAlertId(alerts[0]);
    expect(readDescribedByIds(screen.getByLabelText(NEW_LABEL))).toContain(alertId);
    expect(readDescribedByIds(screen.getByLabelText(CURRENT_LABEL))).not.toContain(alertId);
    expect(screen.queryByText(SAVED_MESSAGE)).toBeNull();
  });

  it.each([
    ['429 RATE_LIMIT_EXCEEDED', errorReply(429, 'RATE_LIMIT_EXCEEDED'), RATE_LIMITED_MESSAGE],
    ['503 SERVER_BUSY', errorReply(503, 'SERVER_BUSY'), BUSY_MESSAGE],
    ['a network failure', 'reject' as const, UNAVAILABLE_MESSAGE],
  ])('%s is announced in one alert that echoes no password, and nothing is saved', async (_label, reply, message) => {
    const current = buildPassword();
    const next = buildPassword();
    installRoutedFetch({ [PASSWORD_ROUTE]: reply });
    await renderForm(buildIdentity(), true);
    await typeCurrent(current);
    await typeNew(next);
    await pressSave();
    const alerts = await screen.findAllByRole('alert');
    expect(alerts).toHaveLength(1);
    expect(within(alerts[0]).getByText(message)).toBeTruthy();
    expectAlertOmits(alerts[0], [current, next]);
    expect(screen.queryByText(SAVED_MESSAGE)).toBeNull();
    expect(screen.getByRole('button', { name: SAVE_BUTTON })).toBeEnabled();
  });
});

describe('PasswordSettingsForm, negative input', () => {
  it('refuses a 129-code-point new password on device: the too-long alert on the new field and no request', async () => {
    const next = buildPasswordOfLength(129);
    const { requests } = installRoutedFetch({ [PASSWORD_ROUTE]: savedReply() });
    await renderForm(buildIdentity(), false);
    await typeNew(next);
    await pressSave();
    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText(TOO_LONG_MESSAGE)).toBeTruthy();
    expectAlertOmits(alert, [next.slice(0, 20)]);
    expect(readDescribedByIds(screen.getByLabelText(NEW_LABEL))).toContain(readAlertId(alert));
    expect(listPasswordRequests(requests)).toEqual([]);
    expect(screen.queryByText(SAVED_MESSAGE)).toBeNull();
  });

  it('never saves a new password holding a lone surrogate: one alert on the new field (refused on device or by the server)', async () => {
    const next = buildLoneSurrogatePassword();
    installRoutedFetch({ [PASSWORD_ROUTE]: errorReply(400, 'INPUT_INVALID_BODY') });
    await renderForm(buildIdentity(), false);
    await typeNew(next);
    await pressSave();
    const alerts = await screen.findAllByRole('alert');
    expect(alerts).toHaveLength(1);
    expect(readDescribedByIds(screen.getByLabelText(NEW_LABEL))).toContain(readAlertId(alerts[0]));
    expect(screen.queryByText(SAVED_MESSAGE)).toBeNull();
  });

  it.each([
    ['a lone surrogate', buildLoneSurrogatePassword],
    ['600 code points', () => buildPasswordOfLength(600)],
  ])(
    'never saves a current password holding %s: one alert on the current field that echoes no password',
    async (_label, build) => {
      const current = build();
      const next = buildPassword();
      installRoutedFetch({ [PASSWORD_ROUTE]: errorReply(400, 'INPUT_INVALID_BODY') });
      await renderForm(buildIdentity(), true);
      await typeCurrent(current);
      await typeNew(next);
      await pressSave();
      const alerts = await screen.findAllByRole('alert');
      expect(alerts).toHaveLength(1);
      expectAlertOmits(alerts[0], [current.slice(0, 6), next]);
      expect(readDescribedByIds(screen.getByLabelText(CURRENT_LABEL))).toContain(readAlertId(alerts[0]));
      expect(screen.queryByText(SAVED_MESSAGE)).toBeNull();
    },
  );
});

describe('PasswordSettingsForm, the inline code steps', () => {
  it('403 AUTH_REAUTH_REQUIRED opens the code steps for the signed-in email, returns with the new password kept, and saving then succeeds', async () => {
    const identity = buildIdentity();
    const next = buildPassword();
    const { requests } = installRoutedFetch({
      [CODES_ROUTE]: codeSentReply(),
      [PASSWORD_ROUTE]: [errorReply(403, 'AUTH_REAUTH_REQUIRED'), savedReply()],
      [SESSIONS_ROUTE]: sessionReply(identity),
    });
    await renderForm(identity, false);
    await typeNew(next);
    await pressSave();
    await reachCodeField();
    expect(screen.queryByLabelText(EMAIL_LABEL)).toBeNull();
    expect(requests.find((request) => request.path === 'auth/codes')?.body).toEqual({ email: identity.email });

    await submitCode(identity.code);
    await waitFor(() => expect(screen.getByLabelText(NEW_LABEL).props.value).toBe(next));
    expect(screen.queryByLabelText(CODE_LABEL)).toBeNull();
    expect(requests.find((request) => request.path === 'auth/sessions')?.body).toMatchObject({
      code: identity.code,
      email: identity.email,
    });

    await pressSave();
    await screen.findByText(SAVED_MESSAGE);
    const sent = listPasswordRequests(requests);
    expect(sent).toHaveLength(2);
    expect(sent[1].body).toEqual({ newPassword: next });
    expect(listInputValues()).not.toContain(next);
  });

  it('"Use a code instead" opens the same code steps with no save attempt, and saving after the code sign-in sends no currentPassword', async () => {
    const identity = buildIdentity();
    const next = buildPassword();
    const { requests } = installRoutedFetch({
      [CODES_ROUTE]: codeSentReply(),
      [PASSWORD_ROUTE]: savedReply(),
      [SESSIONS_ROUTE]: sessionReply(identity),
    });
    await renderForm(identity, true);
    await typeNew(next);
    await fireEvent.press(screen.getByRole('button', { name: USE_CODE_BUTTON }));
    await reachCodeField();
    expect(screen.queryByLabelText(EMAIL_LABEL)).toBeNull();
    expect(listPasswordRequests(requests)).toEqual([]);
    expect(requests.find((request) => request.path === 'auth/codes')?.body).toEqual({ email: identity.email });

    await submitCode(identity.code);
    await waitFor(() => expect(screen.getByLabelText(NEW_LABEL).props.value).toBe(next));
    expect(listPasswordRequests(requests)).toEqual([]);

    await pressSave();
    await screen.findByText(SAVED_MESSAGE);
    const sent = listPasswordRequests(requests);
    expect(sent).toHaveLength(1);
    expect(sent[0].body).toEqual({ newPassword: next });
  });

  it('a wrong code keeps the code steps open with an alert and sends no password request', async () => {
    const identity = buildIdentity();
    const next = buildPassword();
    const { requests } = installRoutedFetch({
      [CODES_ROUTE]: codeSentReply(),
      [PASSWORD_ROUTE]: errorReply(403, 'AUTH_REAUTH_REQUIRED'),
      [SESSIONS_ROUTE]: errorReply(400, 'AUTH_INVALID_CODE'),
    });
    await renderForm(identity, false);
    await typeNew(next);
    await pressSave();
    await reachCodeField();
    await submitCode(identity.code);
    await waitFor(() => expect(screen.getAllByRole('alert').length).toBeGreaterThan(0));
    for (const alert of screen.getAllByRole('alert')) expectAlertOmits(alert, [next, identity.email]);
    expect(screen.getByLabelText(CODE_LABEL)).toBeTruthy();
    expect(listPasswordRequests(requests)).toHaveLength(1);
  });
});

const BACK_BUTTON = 'Back to password';

describe('PasswordSettingsForm, follow-ups', () => {
  it('"Back to password" leaves the code steps for the password fields with the typed values kept', async () => {
    const identity = buildIdentity();
    const current = buildPassword();
    const next = buildPassword();
    const { requests } = installRoutedFetch({ [CODES_ROUTE]: codeSentReply() });
    await renderForm(identity, true);
    await typeCurrent(current);
    await typeNew(next);
    await fireEvent.press(screen.getByRole('button', { name: USE_CODE_BUTTON }));
    await reachCodeField();
    await fireEvent.press(screen.getByRole('button', { name: BACK_BUTTON }));
    await waitFor(() => expect(screen.getByLabelText(NEW_LABEL).props.value).toBe(next));
    expect(screen.getByLabelText(CURRENT_LABEL).props.value).toBe(current);
    expect(screen.queryByLabelText(CODE_LABEL)).toBeNull();
    expect(listPasswordRequests(requests)).toEqual([]);
  });

  it('clears a refusal left on the password fields when "Use a code instead" is pressed', async () => {
    const identity = buildIdentity();
    installRoutedFetch({
      [CODES_ROUTE]: codeSentReply(),
      [PASSWORD_ROUTE]: errorReply(400, 'AUTH_INVALID_CREDENTIALS'),
    });
    await renderForm(identity, true);
    await typeCurrent(buildPassword());
    await typeNew(buildPassword());
    await pressSave();
    await screen.findByText(WRONG_CURRENT_MESSAGE);
    await fireEvent.press(screen.getByRole('button', { name: USE_CODE_BUTTON }));
    await reachCodeField();
    expect(screen.queryByText(WRONG_CURRENT_MESSAGE)).toBeNull();
    expect(screen.queryAllByRole('alert')).toHaveLength(0);
  });

  it('treats an inherited property name as an unknown error code, not a policy refusal', async () => {
    installRoutedFetch({ [PASSWORD_ROUTE]: errorReply(400, 'constructor') });
    await renderForm(buildIdentity(), false);
    await typeNew(buildPassword());
    await pressSave();
    const alerts = await screen.findAllByRole('alert');
    expect(alerts).toHaveLength(1);
    expect(within(alerts[0]).getByText(UNAVAILABLE_MESSAGE)).toBeTruthy();
    expect(readDescribedByIds(screen.getByLabelText(NEW_LABEL))).not.toContain(readAlertId(alerts[0]));
  });

  it('reports the password as set on a 200 whose body does not say so', async () => {
    const onPasswordSaved = jest.fn();
    installRoutedFetch({ [PASSWORD_ROUTE]: { status: 200, body: { data: {} } } });
    await renderForm(buildIdentity(), false, { onPasswordSaved });
    await typeNew(buildPassword());
    await pressSave();
    await screen.findByText(SAVED_MESSAGE);
    expect(onPasswordSaved).toHaveBeenCalledWith(true);
  });

  it('clears both password fields when the screen loses focus (blur)', async () => {
    const listeners = new Map<string, () => void>();
    const navigation = {
      addListener: (event: string, listener: () => void) => {
        listeners.set(event, listener);
        return () => listeners.delete(event);
      },
    };
    await renderForm(buildIdentity(), true, { navigation });
    await typeCurrent(buildPassword());
    await typeNew(buildPassword());
    expect(screen.getByLabelText(NEW_LABEL).props.value).not.toBe('');
    const blur = listeners.get('blur');
    expect(blur).toBeDefined();
    await act(async () => blur?.());
    expect(screen.getByLabelText(CURRENT_LABEL).props.value).toBe('');
    expect(screen.getByLabelText(NEW_LABEL).props.value).toBe('');
  });
});
