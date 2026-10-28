// The privacy page describes optional passwords truthfully (B-91): the scrypt hash, the breach check
// by 5-character SHA-1 prefix, and the password hash in the deletion list.
import { render } from '@testing-library/react-native';

import PrivacyScreen from '../privacy';

describe('privacy page password wording', () => {
  it('no longer claims there is no password, and names the hash and the breach check', async () => {
    const screen = await render(<PrivacyScreen />);

    expect(screen.queryByText(/There is no password/)).toBeNull();
    expect(screen.getByText(/scrypt/)).toBeTruthy();
    expect(screen.getByText(/Have I Been Pwned/)).toBeTruthy();
    expect(screen.getByText(/first 5 characters/)).toBeTruthy();
  });

  it('lists the password hash among what deleting an account removes', async () => {
    const screen = await render(<PrivacyScreen />);

    expect(screen.getByText(/Deleting your account removes your email, your password hash,/)).toBeTruthy();
  });

  it('keeps one page title heading', async () => {
    const screen = await render(<PrivacyScreen />);

    expect(screen.getAllByRole('heading', { name: 'Privacy policy' })).toHaveLength(1);
  });
});

describe('privacy page model processors', () => {
  it('lists Anthropic as the primary model and OpenAI as the fallback among the processors', async () => {
    const screen = await render(<PrivacyScreen />);

    expect(screen.getByText(/^Anthropic: /)).toBeTruthy();
    expect(screen.getByText(/^OpenAI: .*when Anthropic cannot answer/)).toBeTruthy();
  });
});

describe('privacy page facts checked against the code', () => {
  it('denies collecting precise location only, since AdMob infers an approximate one from the IP address', async () => {
    const screen = await render(<PrivacyScreen />);

    expect(screen.getByText(/contacts, photos, or precise location\./)).toBeTruthy();
    expect(screen.queryByText(/contacts, photos, or location\./)).toBeNull();
  });

  it('describes purchase history as Pro, annual or lifetime, and until when, not owned banks', async () => {
    const screen = await render(<PrivacyScreen />);

    expect(
      screen.getByText(
        /^Purchase history: whether your account has Pro, on the annual or lifetime plan, and until when/,
      ),
    ).toBeTruthy();
    expect(screen.getByText('To give you Pro, and to restore it on a new install or another device.')).toBeTruthy();
    expect(screen.queryByText(/question banks you (own|bought)/)).toBeNull();
  });

  it('lists the questions asked in Ask, the choice sent with Explain my mistake, and the weekly study note among what is collected', async () => {
    const screen = await render(<PrivacyScreen />);

    expect(
      screen.getByText(
        /the questions you type about a card in Ask, your choice on a card you got wrong when you use Explain my mistake, and your weekly study note\. A question or that choice is sent with the card to Anthropic/,
      ),
    ).toBeTruthy();
    expect(
      screen.getByText(
        'To answer the questions you ask about a card, to explain a mistake you ask about, and to write your weekly study note.',
      ),
    ).toBeTruthy();
    expect(
      screen.getByText(
        /^Anthropic: answers a question you ask about a card, explains your choice on a card you got wrong when you use Explain my mistake, and writes your weekly study note\./,
      ),
    ).toBeTruthy();
    expect(
      screen.getByText(/Your study note is stored with your account until a newer note replaces it\./),
    ).toBeTruthy();
  });

  it('names RevenueCat Web Billing for purchases on the website', async () => {
    const screen = await render(<PrivacyScreen />);

    expect(screen.getByText(/on the website, purchases go through RevenueCat Web Billing/)).toBeTruthy();
    expect(screen.getByText(/^RevenueCat Web Billing: handles purchases on the website/)).toBeTruthy();
  });

  it('removes study notes on deletion and lists the Anthropic and OpenAI copies among what vendors keep', async () => {
    const screen = await render(<PrivacyScreen />);

    expect(screen.getByText(/goal changes, study notes, and unused sign-in codes/)).toBeTruthy();
    expect(
      screen.getByText(
        /the questions you asked about a card, the choices you sent with Explain my mistake, and the weekly summaries behind your study notes, kept by Anthropic, and by OpenAI when a request was sent to it, under their API data-retention terms/,
      ),
    ).toBeTruthy();
  });
});
