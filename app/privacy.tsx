// Privacy policy route (web and native). DRAFT: the owner must review it and fill in the three
// bracketed placeholders before the store listings point at it. Every statement is read from the
// code and docs/store/privacy-labels.md; it promises nothing the code does not do.
// The "no location" statements hold only once the owner turns on PostHog "Discard client IP data"
// (PostHog still receives the request IP otherwise). Verify that before publishing.
// Sponsored card statements follow docs/store/privacy-labels.md and Google's Mobile Ads SDK disclosure; re-check them
// when a feed is added or the SDK version changes.
import { LegalList, LegalPage, LegalParagraph, LegalSection } from '../components/legal/LegalPage';

export default function PrivacyScreen() {
  return (
    <LegalPage title="Privacy policy">
      <LegalParagraph>Effective date: [EFFECTIVE DATE]</LegalParagraph>

      <LegalSection title="Who runs Syntactical">
        <LegalParagraph>
          Syntactical is run by [OWNER NAME]. Questions about this policy or your data: [CONTACT EMAIL].
        </LegalParagraph>
      </LegalSection>

      <LegalSection title="What we collect">
        <LegalList
          items={[
            "Your email address, only if you sign in. It is used to send you one-time sign-in codes and to identify your account. You can also set a password. We store only a salted scrypt hash of it, never the password itself. When you choose a password, our server checks it against the Have I Been Pwned list of breached passwords by sending only the first 5 characters of the password's SHA-1 hash, so neither the password nor its full hash leaves our server.",
            'If you are signed in: your answers (which question, your choice, whether it was correct, and how long it took), your daily progress and daily goal, and your timezone (a name such as America/Chicago, used to decide when your day starts). This is not your location.',
            'A random user ID that we create for your account.',
            'Purchase history: which question banks you own, and the purchase events the app stores and RevenueCat send us. We never see your card number; Apple or Google handles payment.',
            'Usage events, such as starting or finishing a round, seeing the Pro sheet, completing a purchase, or seeing or pressing a sponsored card, with details like language, difficulty, and where the card was. These go to PostHog. Location lookup is turned off. When you are signed in, events carry your random user ID, never your email. When you are not signed in, events are anonymous, and analytics writes nothing to your device.',
          ]}
        />
        <LegalParagraph>
          We do not collect your name, phone number, address, contacts, photos, or location. Free users see sponsored
          cards: a card for Syntactical Pro, a sponsor we name in the card, on iPhone and Android a card from Google
          AdMob, and on the website a text card from EthicalAds, which sets no cookies. AdMob cards are always
          non-personalised. Google AdMob receives your IP address, from which it may infer an approximate location, and
          device information, to serve and count sponsored cards. The app never asks to track you and does not use an
          advertising identifier to track you. A named sponsor&apos;s card comes from our own site, so the sponsor
          learns nothing unless you open its link. Pro removes them. The app does not track you across other
          companies&apos; apps or websites. No crash reporting service is installed.
        </LegalParagraph>
      </LegalSection>

      <LegalSection title="What stays on your device">
        <LegalParagraph>
          If you do not sign in, your progress and daily goal are stored only on your device. If you sign in, the app
          also keeps your sign-in session there: in the device keychain or keystore on iPhone and Android, and in a
          cookie in the browser. We store only a hash of the session token on our server.
        </LegalParagraph>
      </LegalSection>

      <LegalSection title="Why we use it">
        <LegalList
          items={[
            'To sign you in and run your account.',
            'To sync your progress, streak, and XP across devices.',
            'To unlock the question banks you bought, and to restore purchases.',
            'To understand how the app is used so we can improve it.',
            'To show sponsored cards to free users and count how often they are seen and pressed.',
          ]}
        />
      </LegalSection>

      <LegalSection title="Who processes it for us">
        <LegalList
          items={[
            'Neon: hosts the database that holds accounts, answers, progress, and purchase records.',
            'Railway: hosts the server.',
            'GitHub Pages: hosts the website.',
            'Resend: delivers the one-time sign-in email.',
            'RevenueCat: manages purchases and entitlements, together with Apple and Google.',
            'PostHog: product usage analytics.',
            'Google AdMob: serves the non-personalised sponsored cards on iPhone and Android, and asks for consent where the law requires it.',
            'EthicalAds: serves the text sponsored cards on the website, without cookies. Your browser fetches each card from EthicalAds, which sees its IP address.',
            'Apple and Google: process payments and keep their own purchase records.',
          ]}
        />
        <LegalParagraph>We do not sell your data and we do not share it with data brokers.</LegalParagraph>
      </LegalSection>

      <LegalSection title="How long we keep it">
        <LegalParagraph>
          We keep your account data until you delete your account. A sign-in session expires after 14 days without use
          and after 30 days in all. You can delete your account at any time; see the account deletion page.
        </LegalParagraph>
      </LegalSection>

      <LegalSection title="What deleting your account removes">
        <LegalParagraph>
          Deleting your account removes your email, your password hash, sessions, answers, progress, goal changes, and
          unused sign-in codes from our database. Records of purchases stay for accounting, with your account link
          removed; they hold no email or name. Signing in again with the same email starts a new, empty account.
        </LegalParagraph>
        <LegalParagraph>
          Deleting in the app does not reach our vendors. These remain with them under their own policies: PostHog usage
          events tied to your random user ID, the RevenueCat customer record, Resend&apos;s record of the emails it
          sent, Google AdMob&apos;s records of the sponsored cards it served to your device (not tied to your account),
          and the purchase records of Apple and Google. To ask a vendor to remove its copy, write to [CONTACT EMAIL].
        </LegalParagraph>
      </LegalSection>

      <LegalSection title="Children">
        <LegalParagraph>
          Syntactical is not directed at children under 13, and we do not knowingly collect their data. If you believe a
          child has given us data, write to [CONTACT EMAIL] and we will delete it.
        </LegalParagraph>
      </LegalSection>

      <LegalSection title="Changes and contact">
        <LegalParagraph>
          If this policy changes, we will update the effective date above. Contact: [OWNER NAME], [CONTACT EMAIL].
        </LegalParagraph>
      </LegalSection>
    </LegalPage>
  );
}
