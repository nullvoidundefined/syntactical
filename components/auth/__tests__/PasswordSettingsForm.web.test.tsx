// PasswordSettingsForm on the web (Task 7.9; B-64, B-88, B-89, B-90). The real AuthProvider and
// apiFetch run against a routed fetch stand-in for a cookie-signed-in user.
// - The fields sit in one real <form method="post"> with no action (the AuthForm pattern), so
//   browsers offer to save the new password; "Save password" is its only type="submit" button;
//   every submit is default-prevented; Enter in a field fires exactly one submit and one PUT.
// - The current-password input is <input type="password" autocomplete="current-password">, the new
//   one autocomplete="new-password"; each refusal is a role="alert" region whose id is in the
//   right input's aria-describedby.
// - PUT me/password carries the CSRF header (X-Requested-With: XMLHttpRequest) and the cookie.
// - Every control is reachable by Tab with no positive tabindex; "Use a code instead" works by
//   Enter and the code steps return to the form with the new password kept.
// - Neither password reaches localStorage or sessionStorage.
// Values are built at run time.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

import { createQueryClient } from '../../../config/queryClient';
import {
  AUTH_STORAGE_KEY,
  buildIdentity,
  holdReply,
  installRoutedFetch,
  readAllStoredValues,
  type RoutedRequest,
  type SignInIdentity,
} from '../../../state/__tests__/authTestSupport';
import { AuthProvider } from '../../../state/AuthProvider';
import { PasswordSettingsForm } from '../PasswordSettingsForm';

import {
  BREACHED_MESSAGE,
  CODES_ROUTE,
  CODE_LABEL,
  CURRENT_LABEL,
  NEW_LABEL,
  PASSWORD_ROUTE,
  SAVED_MESSAGE,
  SAVE_BUTTON,
  SEND_CODE_BUTTON,
  SESSIONS_ROUTE,
  USE_CODE_BUTTON,
  VERIFY_BUTTON,
  WRONG_CURRENT_MESSAGE,
  buildPassword,
  codeSentReply,
  errorReply,
  savedReply,
} from './passwordSettingsTestSupport';

jest.mock('expo-constants', () => ({
  expoConfig: { extra: { apiBaseUrl: 'https://api.syntactical.dev/v1/' } },
}));

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(() => Promise.resolve(null)),
  setItemAsync: jest.fn(() => Promise.resolve()),
  deleteItemAsync: jest.fn(() => Promise.resolve()),
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
jest.mock('react-native-reanimated', () => ({
  ...jest.requireActual('react-native-reanimated'),
  useReducedMotion: () => true,
}));

function listPasswordRequests(requests: RoutedRequest[]): RoutedRequest[] {
  return requests.filter((request) => request.method === 'PUT' && request.path === 'me/password');
}

function getCurrentInput(): HTMLInputElement {
  return screen.getByLabelText(CURRENT_LABEL, { selector: 'input' }) as HTMLInputElement;
}

function getNewInput(): HTMLInputElement {
  return screen.getByLabelText(NEW_LABEL, { selector: 'input' }) as HTMLInputElement;
}

function getButton(name: string): HTMLElement {
  return screen.getByRole('button', { name });
}

function getOnlyForm(): HTMLFormElement {
  const forms = document.querySelectorAll('form');
  expect(forms).toHaveLength(1);
  return forms[0];
}

function typeInto(input: HTMLElement, value: string) {
  fireEvent.change(input, { target: { value } });
}

function readDescribedByIds(element: HTMLElement): string[] {
  return (element.getAttribute('aria-describedby') ?? '').split(/\s+/).filter((id) => id !== '');
}

// What a browser does for Enter on a focused control: keydown and keyup reach it, and on a native
// <button> or <a> the browser also dispatches a click.
async function pressEnterOn(element: HTMLElement): Promise<void> {
  act(() => element.focus());
  expect(document.activeElement).toBe(element);
  await act(async () => {
    fireEvent.keyDown(element, { key: 'Enter', code: 'Enter' });
    fireEvent.keyUp(element, { key: 'Enter', code: 'Enter' });
    if (element.tagName === 'BUTTON' || element.tagName === 'A') fireEvent.click(element);
  });
}

// A browser's implicit submission: Enter in a text field submits its form unless the keydown's
// default is prevented. jsdom does not, so it is sent here.
async function pressEnterInField(input: HTMLInputElement): Promise<void> {
  act(() => input.focus());
  await act(async () => {
    const isNotPrevented = fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
    if (isNotPrevented && input.form !== null) fireEvent.submit(input.form);
  });
}

function listTabbable(container: HTMLElement): HTMLElement[] {
  const candidates = container.querySelectorAll<HTMLElement>('input, button, a[href], select, textarea, [tabindex]');
  return Array.from(candidates).filter(
    (element) =>
      element.tabIndex >= 0 && !element.hasAttribute('disabled') && element.closest('[aria-hidden="true"]') === null,
  );
}

function readWebStorage(): string {
  return [window.localStorage, window.sessionStorage]
    .map((storage) =>
      Object.keys(storage)
        .map((key) => `${key}=${storage.getItem(key) ?? ''}`)
        .join('\n'),
    )
    .join('\n');
}

async function renderForm(identity: SignInIdentity, hasPassword: boolean) {
  await AsyncStorage.setItem(
    AUTH_STORAGE_KEY,
    JSON.stringify({ knownUserIds: [identity.userId], userId: identity.userId }),
  );
  const rendered = render(
    <QueryClientProvider client={createQueryClient()}>
      <AuthProvider>
        <PasswordSettingsForm email={identity.email} hasPassword={hasPassword} />
      </AuthProvider>
    </QueryClientProvider>,
  );
  await screen.findByLabelText(NEW_LABEL, { selector: 'input' });
  return rendered;
}

// The code steps send the code to the signed-in email either as they open or on "Send code".
async function reachCodeInput(): Promise<HTMLInputElement> {
  await waitFor(() =>
    expect(
      screen.queryByLabelText(CODE_LABEL, { selector: 'input' }) ??
        screen.queryByRole('button', { name: SEND_CODE_BUTTON }),
    ).toBeTruthy(),
  );
  const sendButton = screen.queryByRole('button', { name: SEND_CODE_BUTTON });
  if (sendButton !== null) {
    await act(async () => {
      fireEvent.click(sendButton);
    });
  }
  return (await screen.findByLabelText(CODE_LABEL, { selector: 'input' })) as HTMLInputElement;
}

let submits: boolean[] = [];
function recordSubmit(event: Event) {
  submits.push(event.defaultPrevented);
}

beforeEach(async () => {
  await AsyncStorage.clear();
  window.localStorage.clear();
  window.sessionStorage.clear();
  submits = [];
  document.addEventListener('submit', recordSubmit);
});

afterEach(() => {
  document.removeEventListener('submit', recordSubmit);
});

describe('PasswordSettingsForm on the web, the inputs', () => {
  it('renders the current-password input with autocomplete current-password and the new one with new-password', async () => {
    installRoutedFetch({});
    await renderForm(buildIdentity(), true);
    expect(getCurrentInput().getAttribute('type')).toBe('password');
    expect(getCurrentInput().getAttribute('autocomplete')).toBe('current-password');
    expect(getNewInput().getAttribute('type')).toBe('password');
    expect(getNewInput().getAttribute('autocomplete')).toBe('new-password');
    expect(screen.getByText(CURRENT_LABEL)).toBeTruthy();
    expect(screen.getByText(NEW_LABEL)).toBeTruthy();
  });

  it('renders no heading at level 1', async () => {
    installRoutedFetch({});
    await renderForm(buildIdentity(), true);
    expect(document.querySelectorAll('h1, [role="heading"][aria-level="1"]')).toHaveLength(0);
  });
});

describe('PasswordSettingsForm on the web, inside a real form', () => {
  it('puts both inputs in one <form method="post"> with no action whose only submit button is "Save password"', async () => {
    installRoutedFetch({});
    await renderForm(buildIdentity(), true);
    const form = getOnlyForm();
    expect(form.hasAttribute('action')).toBe(false);
    expect(form.method).toBe('post');
    expect(form.contains(getCurrentInput())).toBe(true);
    expect(form.contains(getNewInput())).toBe(true);
    const save = getButton(SAVE_BUTTON) as HTMLButtonElement;
    expect(save.tagName).toBe('BUTTON');
    expect(save.type).toBe('submit');
    expect(form.contains(save)).toBe(true);
    const submitButtons = Array.from(document.querySelectorAll('button')).filter((button) => button.type === 'submit');
    expect(submitButtons).toEqual([save]);
    expect(document.querySelectorAll('input[type="submit"]')).toHaveLength(0);
  });

  it('sends one PUT me/password with the CSRF header and the cookie when "Save password" is clicked, with one prevented submit', async () => {
    const current = buildPassword();
    const next = buildPassword();
    const { requests } = installRoutedFetch({ [PASSWORD_ROUTE]: savedReply() });
    await renderForm(buildIdentity(), true);
    typeInto(getCurrentInput(), current);
    typeInto(getNewInput(), next);
    await act(async () => {
      fireEvent.click(getButton(SAVE_BUTTON));
    });
    await screen.findByText(SAVED_MESSAGE);
    const sent = listPasswordRequests(requests);
    expect(sent).toHaveLength(1);
    expect(sent[0].headers['x-requested-with']).toBe('XMLHttpRequest');
    expect(sent[0].credentials).toBe('include');
    expect(sent[0].body).toEqual({ currentPassword: current, newPassword: next });
    expect(submits).toEqual([true]);
    expect(getCurrentInput().value).toBe('');
    expect(getNewInput().value).toBe('');
  });

  it.each([
    ['current', getCurrentInput],
    ['new', getNewInput],
  ] as const)(
    'submits exactly once for Enter in the %s password field: one prevented submit and one request',
    async (_label, getInput) => {
      const { requests } = installRoutedFetch({ [PASSWORD_ROUTE]: savedReply() });
      await renderForm(buildIdentity(), true);
      typeInto(getCurrentInput(), buildPassword());
      typeInto(getNewInput(), buildPassword());
      await pressEnterInField(getInput());
      await waitFor(() => expect(listPasswordRequests(requests)).toHaveLength(1));
      expect(submits).toEqual([true]);
    },
  );

  it('sends nothing more for a second submit while the first request is in flight, with every submit prevented', async () => {
    const held = holdReply();
    const { requests } = installRoutedFetch({ [PASSWORD_ROUTE]: held });
    await renderForm(buildIdentity(), false);
    typeInto(getNewInput(), buildPassword());
    await act(async () => {
      fireEvent.click(getButton(SAVE_BUTTON));
    });
    await act(async () => {
      fireEvent.submit(getOnlyForm());
    });
    expect(listPasswordRequests(requests)).toHaveLength(1);
    expect(submits.length).toBeGreaterThanOrEqual(2);
    expect(submits.every((isPrevented) => isPrevented)).toBe(true);
    await act(async () => held.release(savedReply()));
  });

  it('toggles "Show password" without submitting or sending a request, keeping the typed value', async () => {
    const { requests } = installRoutedFetch({ [PASSWORD_ROUTE]: savedReply() });
    await renderForm(buildIdentity(), false);
    const next = buildPassword();
    typeInto(getNewInput(), next);
    await act(async () => {
      fireEvent.click(getButton('Show password'));
    });
    expect(submits).toEqual([]);
    expect(listPasswordRequests(requests)).toEqual([]);
    expect(getNewInput().value).toBe(next);
  });
});

describe('PasswordSettingsForm on the web, refusals tied by aria-describedby', () => {
  it('ties "That current password is not right." to the current-password input and not the new one', async () => {
    installRoutedFetch({ [PASSWORD_ROUTE]: errorReply(400, 'AUTH_INVALID_CREDENTIALS') });
    await renderForm(buildIdentity(), true);
    typeInto(getCurrentInput(), buildPassword());
    typeInto(getNewInput(), buildPassword());
    await act(async () => {
      fireEvent.click(getButton(SAVE_BUTTON));
    });
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain(WRONG_CURRENT_MESSAGE);
    expect(alert.id).not.toBe('');
    expect(readDescribedByIds(getCurrentInput())).toContain(alert.id);
    expect(readDescribedByIds(getNewInput())).not.toContain(alert.id);
  });

  it('ties a breached refusal to the new-password input and not the current one', async () => {
    installRoutedFetch({ [PASSWORD_ROUTE]: errorReply(400, 'AUTH_PASSWORD_BREACHED') });
    await renderForm(buildIdentity(), true);
    typeInto(getCurrentInput(), buildPassword());
    typeInto(getNewInput(), buildPassword());
    await act(async () => {
      fireEvent.click(getButton(SAVE_BUTTON));
    });
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(BREACHED_MESSAGE);
    expect(alert.id).not.toBe('');
    expect(readDescribedByIds(getNewInput())).toContain(alert.id);
    expect(readDescribedByIds(getCurrentInput())).not.toContain(alert.id);
  });
});

describe('PasswordSettingsForm on the web, keyboard', () => {
  it('makes the inputs, both toggles, "Use a code instead", and "Save password" reachable by Tab with no positive tabindex', async () => {
    installRoutedFetch({});
    const { container } = await renderForm(buildIdentity(), true);
    const tabbable = listTabbable(container);
    expect(tabbable).toContain(getCurrentInput());
    expect(tabbable).toContain(getNewInput());
    for (const toggle of screen.getAllByRole('button', { name: 'Show password' })) expect(tabbable).toContain(toggle);
    expect(tabbable).toContain(getButton(USE_CODE_BUTTON));
    expect(tabbable).toContain(getButton(SAVE_BUTTON));
    expect(container.querySelectorAll('[tabindex]:not([tabindex="0"]):not([tabindex="-1"])')).toHaveLength(0);
  });

  it('runs "Use a code instead" by Enter with no save, then returns to the form with the new password kept after the code sign-in', async () => {
    const identity = buildIdentity();
    const next = buildPassword();
    const { requests } = installRoutedFetch({
      [CODES_ROUTE]: codeSentReply(),
      [PASSWORD_ROUTE]: savedReply(),
      [SESSIONS_ROUTE]: { status: 201, body: { data: { userId: identity.userId } } },
    });
    await renderForm(identity, true);
    typeInto(getNewInput(), next);
    await pressEnterOn(getButton(USE_CODE_BUTTON));
    const codeInput = await reachCodeInput();
    expect(listPasswordRequests(requests)).toEqual([]);
    typeInto(codeInput, identity.code);
    await pressEnterOn(getButton(VERIFY_BUTTON));
    await waitFor(() => expect(getNewInput().value).toBe(next));
    const [session] = requests.filter((request) => request.path === 'auth/sessions');
    expect(session.headers['x-requested-with']).toBe('XMLHttpRequest');
    expect(session.body).toMatchObject({ code: identity.code, email: identity.email });

    await pressEnterOn(getButton(SAVE_BUTTON));
    await screen.findByText(SAVED_MESSAGE);
    const sent = listPasswordRequests(requests);
    expect(sent).toHaveLength(1);
    expect(sent[0].body).toEqual({ newPassword: next });
  });
});

describe('PasswordSettingsForm on the web, storage', () => {
  it('writes neither password to localStorage, sessionStorage, or AsyncStorage across a refusal and a save', async () => {
    const current = buildPassword();
    const next = buildPassword();
    installRoutedFetch({ [PASSWORD_ROUTE]: [errorReply(400, 'AUTH_INVALID_CREDENTIALS'), savedReply()] });
    await renderForm(buildIdentity(), true);
    typeInto(getCurrentInput(), current);
    typeInto(getNewInput(), next);
    await act(async () => {
      fireEvent.click(getButton(SAVE_BUTTON));
    });
    await screen.findByRole('alert');
    await act(async () => {
      fireEvent.click(getButton(SAVE_BUTTON));
    });
    await screen.findByText(SAVED_MESSAGE);
    for (const value of [current, next]) {
      expect(readWebStorage()).not.toContain(value);
      expect((await readAllStoredValues()).join('\n')).not.toContain(value);
    }
  });
});
