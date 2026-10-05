// The sign-up route on the web (Task 7.8; B-57, B-64, B-87, B-89, B-90). The
// real AuthProvider and apiFetch run against a routed fetch stand-in.
// - One h1 "Create an account", a labeled email input, and an
//   <input type="password" autocomplete="new-password"> whose
//   aria-describedby names the hint and, after a refusal, the role="alert"
//   region.
// - The email and password inputs sit in one real <form method="post"> with
//   no action, so browsers offer to save the new password; "Create account"
//   is its only submit button; every submit is default-prevented; Enter in
//   either field fires exactly one submit and sends one POST auth/signups.
// - Quiz key bindings stay inert while the password input has focus.
// - Every control is reachable by Tab with no positive tabindex, and the
//   "Sign in" link (and "Create an account" on sign-in) is a real link that
//   Enter follows, carrying a safe returnTo and dropping an unsafe one.
// - The password reaches no localStorage or sessionStorage, and a 201 with
//   the cookie signs in.
// Values are built at run time.
import { randomBytes, randomInt } from 'node:crypto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

import {
  buildIdentity,
  holdReply,
  installRoutedFetch,
  readAllStoredValues,
  type FakeReply,
  type RoutedRequest,
} from '../../state/__tests__/authTestSupport';
import { AuthProvider, useAuth } from '../../state/AuthProvider';
import { useKeyboardNav } from '../../state/useKeyboardNav';
import SignInScreen from '../sign-in';
import SignUpScreen from '../sign-up';

jest.mock('expo-constants', () => ({
  expoConfig: { extra: { apiBaseUrl: 'https://api.syntactical.dev/v1/' } },
}));

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(() => Promise.resolve(null)),
  setItemAsync: jest.fn(() => Promise.resolve()),
  deleteItemAsync: jest.fn(() => Promise.resolve()),
}));

const mockParams: { current: Record<string, string | string[] | undefined> } = { current: {} };
const mockNavigations: unknown[] = [];
jest.mock('expo-router', () => {
  function record(href: unknown) {
    mockNavigations.push(href);
  }
  const router = { back: () => undefined, dismissTo: record, navigate: record, push: record, replace: record };
  return {
    ...jest.requireActual('expo-router'),
    router,
    useGlobalSearchParams: () => mockParams.current,
    useLocalSearchParams: () => mockParams.current,
    useRouter: () => router,
  };
});
jest.mock('react-native-reanimated', () => ({
  ...jest.requireActual('react-native-reanimated'),
  useReducedMotion: () => true,
}));

const SIGNUPS_ROUTE = 'POST auth/signups';
const VERIFY_ROUTE = 'POST auth/signups/verify';
const EMAIL_LABEL = 'Email address';
const PASSWORD_LABEL = 'Password';
const SHOW = 'Show password';
const CREATE_ACCOUNT_BUTTON = 'Create account';
const CREATE_ACCOUNT_LINK = 'Create an account';
const SIGN_IN_LINK_NAME = /sign in/i;
const HINT = 'At least 12 characters. Spaces are fine.';
const BREACHED_MESSAGE = /data breach/i;
const TOO_SHORT_MESSAGE = /at least 12 characters/i;
const SAFE_RETURN_TO = '/python?paywall=medium';
const UNSAFE_RETURN_TOS = ['//evil.example', 'https://evil.example', 'javascript:alert(1)'];

function buildPassword(): string {
  return [randomBytes(6).toString('hex'), randomBytes(6).toString('base64url')].join(' ');
}

function buildShortPassword(): string {
  return randomBytes(4)
    .toString('hex')
    .slice(0, 5 + randomInt(0, 6));
}

function codeSentReply(): FakeReply {
  return { status: 202, body: { data: { status: 'code-sent' } } };
}

function errorReply(status: number, code: string): FakeReply {
  return { status, body: { error: { code, message: 'refused', requestId: 'r1' } } };
}

function parseHref(href: unknown): { pathname: string; params: Record<string, string> } {
  if (typeof href === 'string') {
    const url = new URL(href, 'https://app.test');
    return { pathname: url.pathname, params: Object.fromEntries(url.searchParams.entries()) };
  }
  const { params = {}, pathname } = href as { params?: Record<string, string>; pathname: string };
  return { pathname, params: { ...params } };
}

function SignedInProbe() {
  const { user } = useAuth();
  return <output data-testid="signed-in-user">{user?.id ?? 'guest'}</output>;
}

async function renderSignUp() {
  const rendered = render(
    <AuthProvider>
      <SignUpScreen />
      <SignedInProbe />
    </AuthProvider>,
  );
  await screen.findByRole('textbox', { name: EMAIL_LABEL });
  return rendered;
}

function getEmailInput(): HTMLInputElement {
  return screen.getByRole('textbox', { name: EMAIL_LABEL }) as HTMLInputElement;
}

function getPasswordInput(): HTMLInputElement {
  return screen.getByLabelText(PASSWORD_LABEL, { selector: 'input' }) as HTMLInputElement;
}

function getButton(name: string): HTMLButtonElement {
  return screen.getByRole('button', { name }) as HTMLButtonElement;
}

function getOnlyForm(): HTMLFormElement {
  const forms = document.querySelectorAll('form');
  expect(forms).toHaveLength(1);
  return forms[0];
}

function typeInto(input: HTMLElement, value: string) {
  fireEvent.change(input, { target: { value } });
}

function fillFields(password = buildPassword()): { email: string; password: string } {
  const email = buildIdentity().email;
  typeInto(getEmailInput(), email);
  typeInto(getPasswordInput(), password);
  return { email, password };
}

function readDescribedByIds(element: HTMLElement): string[] {
  return (element.getAttribute('aria-describedby') ?? '').split(/\s+/).filter((id) => id !== '');
}

function readDescription(element: HTMLElement): string {
  return readDescribedByIds(element)
    .map((id) => document.getElementById(id)?.textContent ?? '')
    .join(' ');
}

function listSignUpRequests(requests: RoutedRequest[]): RoutedRequest[] {
  return requests.filter((request) => request.path === 'auth/signups');
}

// What a browser does for Enter on a focused control: keydown and keyup reach
// it, and on a native <button> or <a> the browser also dispatches a click.
async function pressEnterOn(element: HTMLElement): Promise<void> {
  act(() => element.focus());
  expect(document.activeElement).toBe(element);
  await act(async () => {
    fireEvent.keyDown(element, { key: 'Enter', code: 'Enter' });
    fireEvent.keyUp(element, { key: 'Enter', code: 'Enter' });
    if (element.tagName === 'BUTTON' || element.tagName === 'A') fireEvent.click(element);
  });
}

// A browser's implicit submission: Enter in a text field submits its form
// unless the keydown's default is prevented. jsdom does not, so it is sent here.
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

const keyHandlers = {
  onAdvance: jest.fn(),
  onEscape: jest.fn(),
  onSelectBool: jest.fn(),
  onSelectChoice: jest.fn(),
  onToggleQuery: jest.fn(),
};

function QuizKeysHarness() {
  useKeyboardNav(keyHandlers);
  return null;
}

let submits: boolean[] = [];
function recordSubmit(event: Event) {
  submits.push(event.defaultPrevented);
}

beforeEach(async () => {
  await AsyncStorage.clear();
  window.localStorage.clear();
  window.sessionStorage.clear();
  mockParams.current = {};
  mockNavigations.length = 0;
  submits = [];
  document.addEventListener('submit', recordSubmit);
});

afterEach(() => {
  document.removeEventListener('submit', recordSubmit);
});

describe('sign-up route on the web', () => {
  it('renders one h1 "Create an account", a labeled email input, and a password input with autocomplete new-password', async () => {
    installRoutedFetch({});
    await renderSignUp();
    const headings = document.querySelectorAll('h1');
    expect(headings).toHaveLength(1);
    expect(headings[0].textContent).toBe('Create an account');
    expect(getEmailInput().tagName).toBe('INPUT');
    const passwordInput = getPasswordInput();
    expect(passwordInput.getAttribute('type')).toBe('password');
    expect(passwordInput.getAttribute('autocomplete')).toBe('new-password');
    expect(screen.getByText(PASSWORD_LABEL)).toBeTruthy();
  });

  it('ties the hint to the password input by aria-describedby', async () => {
    installRoutedFetch({});
    await renderSignUp();
    expect(readDescription(getPasswordInput())).toContain(HINT);
  });

  it('ties a breached refusal to the password input by aria-describedby, beside the hint', async () => {
    installRoutedFetch({ [SIGNUPS_ROUTE]: errorReply(400, 'AUTH_PASSWORD_BREACHED') });
    await renderSignUp();
    fillFields();
    await act(async () => {
      fireEvent.click(getButton(CREATE_ACCOUNT_BUTTON));
    });
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(BREACHED_MESSAGE);
    expect(alert.id).not.toBe('');
    expect(readDescribedByIds(getPasswordInput())).toContain(alert.id);
    expect(readDescription(getPasswordInput())).toContain(HINT);
    expect(readDescription(getPasswordInput())).toMatch(BREACHED_MESSAGE);
  });

  it('refuses a short password on device with an alert tied to the password input, sending nothing', async () => {
    const { requests } = installRoutedFetch({ [SIGNUPS_ROUTE]: codeSentReply() });
    await renderSignUp();
    fillFields(buildShortPassword());
    await act(async () => {
      fireEvent.click(getButton(CREATE_ACCOUNT_BUTTON));
    });
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(TOO_SHORT_MESSAGE);
    expect(readDescribedByIds(getPasswordInput())).toContain(alert.id);
    expect(listSignUpRequests(requests)).toEqual([]);
    expect(submits.every((isPrevented) => isPrevented)).toBe(true);
  });

  it('signs in with the cookie after the code, writing the password to no web storage', async () => {
    const identity = buildIdentity();
    const { requests } = installRoutedFetch({
      [SIGNUPS_ROUTE]: codeSentReply(),
      [VERIFY_ROUTE]: { status: 201, body: { data: { isPasswordApplied: true, userId: identity.userId } } },
    });
    await renderSignUp();
    const { email, password } = fillFields();
    await act(async () => {
      fireEvent.click(getButton(CREATE_ACCOUNT_BUTTON));
    });
    const codeInput = await screen.findByLabelText('Sign-in code', { selector: 'input' });
    typeInto(codeInput, identity.code);
    await act(async () => {
      fireEvent.click(getButton('Verify code'));
    });
    await waitFor(() => expect(screen.getByTestId('signed-in-user').textContent).toBe(identity.userId));
    const [verify] = requests.filter((request) => request.path === 'auth/signups/verify');
    expect(verify.credentials).toBe('include');
    expect(verify.body).toMatchObject({ code: identity.code, email, password });
    await waitFor(() => expect(mockNavigations).toHaveLength(1));
    for (const storage of [window.localStorage, window.sessionStorage]) {
      const stored = Object.keys(storage)
        .map((key) => `${key}=${storage.getItem(key) ?? ''}`)
        .join('\n');
      expect(stored).not.toContain(password);
    }
    expect((await readAllStoredValues()).join('\n')).not.toContain(password);
  });

  describe('quiz key bindings (B-57)', () => {
    it.each(['a', 't', 'f', 'q', '1', 'Escape', 'Enter'])(
      'pressing %p in the password field fires none',
      async (key) => {
        installRoutedFetch({ [SIGNUPS_ROUTE]: errorReply(400, 'AUTH_PASSWORD_BREACHED') });
        render(
          <AuthProvider>
            <SignUpScreen />
            <QuizKeysHarness />
          </AuthProvider>,
        );
        const passwordInput = await screen.findByLabelText(PASSWORD_LABEL, { selector: 'input' });
        act(() => (passwordInput as HTMLInputElement).focus());
        act(() => {
          passwordInput.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key }));
        });
        await act(async () => undefined);
        for (const handler of Object.values(keyHandlers)) expect(handler).not.toHaveBeenCalled();
      },
    );
  });
});

// The real <form> (the Task 7.7 pattern): browsers offer to save a new
// password only on a real submit of a form holding it.
describe('sign-up route on the web, inside a real form', () => {
  it('puts both inputs in one <form> whose only submit button is "Create account"', async () => {
    installRoutedFetch({});
    await renderSignUp();
    const form = getOnlyForm();
    expect(form.contains(getEmailInput())).toBe(true);
    expect(form.contains(getPasswordInput())).toBe(true);
    const createAccount = getButton(CREATE_ACCOUNT_BUTTON);
    expect(createAccount.type).toBe('submit');
    expect(form.contains(createAccount)).toBe(true);
    const submitButtons = Array.from(form.querySelectorAll('button')).filter((button) => button.type === 'submit');
    expect(submitButtons).toEqual([createAccount]);
    expect(form.querySelectorAll('input[type="submit"]')).toHaveLength(0);
  });

  // An absent method attribute means GET to the browser, so the method must be set to POST.
  it('gives the form no action and method POST', async () => {
    installRoutedFetch({});
    await renderSignUp();
    const form = getOnlyForm();
    expect(form.hasAttribute('action')).toBe(false);
    expect(form.method).toBe('post');
  });

  it('sends one POST auth/signups with the typed email and password when the form is submitted, with the default prevented', async () => {
    const { requests } = installRoutedFetch({ [SIGNUPS_ROUTE]: codeSentReply() });
    await renderSignUp();
    const { email, password } = fillFields();
    await act(async () => {
      fireEvent.submit(getOnlyForm());
    });
    await waitFor(() => expect(listSignUpRequests(requests)).toHaveLength(1));
    expect(listSignUpRequests(requests)[0].body).toEqual({ email, password });
    expect(submits).toEqual([true]);
  });

  it('sends one request and fires one prevented submit when "Create account" is clicked', async () => {
    const { requests } = installRoutedFetch({ [SIGNUPS_ROUTE]: codeSentReply() });
    await renderSignUp();
    const { email, password } = fillFields();
    await act(async () => {
      fireEvent.click(getButton(CREATE_ACCOUNT_BUTTON));
    });
    await waitFor(() => expect(listSignUpRequests(requests)).toHaveLength(1));
    expect(listSignUpRequests(requests)[0].body).toEqual({ email, password });
    expect(submits).toEqual([true]);
  });

  it.each([
    ['email', getEmailInput],
    ['password', getPasswordInput],
  ] as const)(
    'submits the form exactly once for Enter in the %s field: one prevented submit and one request',
    async (_label, getInput) => {
      const { requests } = installRoutedFetch({ [SIGNUPS_ROUTE]: codeSentReply() });
      await renderSignUp();
      const { email, password } = fillFields();
      expect(getOnlyForm().contains(getInput())).toBe(true);
      await pressEnterInField(getInput());
      await waitFor(() => expect(listSignUpRequests(requests)).toHaveLength(1));
      expect(submits).toEqual([true]);
      expect(listSignUpRequests(requests)[0].body).toEqual({ email, password });
    },
  );

  it('sends nothing more for a second submit while the first request is in flight, with every submit prevented', async () => {
    const held = holdReply();
    const { requests } = installRoutedFetch({ [SIGNUPS_ROUTE]: held });
    await renderSignUp();
    fillFields();
    await act(async () => {
      fireEvent.click(getButton(CREATE_ACCOUNT_BUTTON));
    });
    await act(async () => {
      fireEvent.submit(getOnlyForm());
    });
    await pressEnterInField(getPasswordInput());
    expect(listSignUpRequests(requests)).toHaveLength(1);
    expect(submits.length).toBeGreaterThanOrEqual(2);
    expect(submits.every((isPrevented) => isPrevented)).toBe(true);
    await act(async () => held.release(codeSentReply()));
  });

  it('toggles "Show password" inside the form without sending a request or submitting', async () => {
    const { requests } = installRoutedFetch({ [SIGNUPS_ROUTE]: codeSentReply() });
    await renderSignUp();
    const { password } = fillFields();
    await act(async () => {
      fireEvent.click(getButton(SHOW));
    });
    expect(getButton('Hide password').getAttribute('aria-pressed')).toBe('true');
    expect(getPasswordInput().value).toBe(password);
    expect(listSignUpRequests(requests)).toEqual([]);
    expect(submits).toEqual([]);
  });
});

describe('keyboard operation (B-64)', () => {
  it('puts the email, password, Show password, and Create account in the Tab order in that order, the "Sign in" link reachable, and no positive tabindex', async () => {
    installRoutedFetch({});
    const { container } = await renderSignUp();
    const controls: HTMLElement[] = [
      getEmailInput(),
      getPasswordInput(),
      getButton(SHOW),
      getButton(CREATE_ACCOUNT_BUTTON),
    ];
    const tabbable = listTabbable(container);
    expect(tabbable.filter((element) => controls.includes(element))).toEqual(controls);
    expect(tabbable).toContain(screen.getByRole('link', { name: SIGN_IN_LINK_NAME }));
    expect(
      Array.from(container.querySelectorAll('[tabindex]')).filter(
        (element) => Number(element.getAttribute('tabindex')) > 0,
      ),
    ).toEqual([]);
  });

  it('opens /sign-in with Enter on the "Sign in" link, keeping a safe returnTo, and the link href carries it', async () => {
    mockParams.current = { returnTo: SAFE_RETURN_TO };
    installRoutedFetch({});
    await renderSignUp();
    const link = screen.getByRole('link', { name: SIGN_IN_LINK_NAME });
    expect(link.tagName).toBe('A');
    expect(parseHref(link.getAttribute('href'))).toEqual({
      pathname: '/sign-in',
      params: { returnTo: SAFE_RETURN_TO },
    });
    await pressEnterOn(link);
    expect(mockNavigations).toHaveLength(1);
    expect(parseHref(mockNavigations[0])).toEqual({ pathname: '/sign-in', params: { returnTo: SAFE_RETURN_TO } });
  });

  it('opens /sign-up with Enter on "Create an account" on sign-in, forwarding a safe returnTo, and the link href carries it', async () => {
    mockParams.current = { returnTo: SAFE_RETURN_TO };
    installRoutedFetch({});
    render(
      <AuthProvider>
        <SignInScreen />
      </AuthProvider>,
    );
    const link = await screen.findByRole('link', { name: CREATE_ACCOUNT_LINK });
    expect(parseHref(link.getAttribute('href'))).toEqual({
      pathname: '/sign-up',
      params: { returnTo: SAFE_RETURN_TO },
    });
    await pressEnterOn(link);
    expect(mockNavigations).toHaveLength(1);
    expect(parseHref(mockNavigations[0])).toEqual({ pathname: '/sign-up', params: { returnTo: SAFE_RETURN_TO } });
  });

  it.each(UNSAFE_RETURN_TOS)('drops the unsafe returnTo %p from both links and their hrefs', async (returnTo) => {
    mockParams.current = { returnTo };
    installRoutedFetch({});
    const signIn = render(
      <AuthProvider>
        <SignInScreen />
      </AuthProvider>,
    );
    const createLink = await screen.findByRole('link', { name: CREATE_ACCOUNT_LINK });
    expect(parseHref(createLink.getAttribute('href'))).toEqual({ pathname: '/sign-up', params: {} });
    await pressEnterOn(createLink);
    signIn.unmount();

    await renderSignUp();
    const signInLink = screen.getByRole('link', { name: SIGN_IN_LINK_NAME });
    expect(parseHref(signInLink.getAttribute('href'))).toEqual({ pathname: '/sign-in', params: {} });
    await pressEnterOn(signInLink);

    expect(mockNavigations.map(parseHref)).toEqual([
      { pathname: '/sign-up', params: {} },
      { pathname: '/sign-in', params: {} },
    ]);
  });
});
