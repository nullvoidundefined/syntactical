// Account deletion route (web and native), the page Google Play asks for. DRAFT: the owner must fill in
// [CONTACT EMAIL] before the store listings point at it. The facts match docs/store/privacy-labels.md.
import { LegalList, LegalPage, LegalParagraph, LegalSection } from '../components/legal/LegalPage';

export default function DeleteAccountScreen() {
  return (
    <LegalPage title="Delete your account">
      <LegalSection title="Delete it in the app">
        <LegalList
          items={[
            'Sign in to Syntactical.',
            'Open Settings, then Account.',
            'Choose Delete account.',
            'Type DELETE and confirm.',
          ]}
        />
        <LegalParagraph>The deletion happens right away and cannot be undone.</LegalParagraph>
      </LegalSection>

      <LegalSection title="Ask us to delete it">
        <LegalParagraph>
          If you cannot use the app, email [CONTACT EMAIL] from the address you signed in with, and say you want your
          account deleted. We will confirm by reply once it is done.
        </LegalParagraph>
      </LegalSection>

      <LegalSection title="What is deleted">
        <LegalList
          items={[
            'Your email address and your account.',
            'Your sign-in sessions.',
            'Your answers, daily progress, and daily goal changes.',
            'Any unused sign-in codes sent to your email.',
          ]}
        />
      </LegalSection>

      <LegalSection title="What is kept">
        <LegalList
          items={[
            'Purchase records, kept for accounting. Your account link is removed, and they hold no email or name.',
            'PostHog usage events tied to your random user ID, never your email, kept by PostHog.',
            'The RevenueCat customer record, kept by RevenueCat.',
            "Resend's record of the sign-in emails it sent, kept by Resend.",
            'Purchase transactions kept by Apple and Google.',
          ]}
        />
        <LegalParagraph>
          Deleting in the app does not reach these vendors. To ask for their copies to be removed, email [CONTACT
          EMAIL]. Signing in again with the same email creates a new, empty account.
        </LegalParagraph>
      </LegalSection>
    </LegalPage>
  );
}
