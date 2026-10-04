# App Review notes

Paste the text below into App Store Connect (App Review Information, Notes) and the Play Console (App access). Sign-in uses an emailed one-time code, so a reviewer needs an inbox the app can reach. Give them a reviewer account the owner controls.

## Reviewer account (owner action)

Sign-in has no password, so there is nothing to store. Two options, pick one:

1. Create a reviewer mailbox (for example `review@<your domain>`), put its address in the notes below, and keep that inbox readable for the review. The reviewer requests a code in the app and reads it there.
2. Tell the reviewer in the notes to use any email address they control. This works as is, because accounts are created at first sign-in.

Option 2 needs no setup and is the recommended default. Do not put a password or a code in the notes.

## Notes text

```
Syntactical is a programming quiz app. Python, Postgres, and JavaScript each have three difficulties. Easy banks are free and need no account. Medium and Hard banks are paid, one non-consumable in-app purchase per bank (syntactical.<language>.<difficulty>).

How to reach the purchase:
1. Open the app and choose a language (for example Python).
2. On the difficulty step, tap Medium or Hard. These show as locked.
3. If you are not signed in, the app sends you to Sign in first. Enter your email, tap to receive a one-time code, and enter the code from the email. Sign-in is by emailed code only; there is no password. Any email address you control works, and an account is created the first time you sign in.
4. Back on the difficulty step, tap Medium or Hard again. A sheet opens titled Unlock <difficulty> with a Buy button showing the store price. Complete the purchase with your sandbox account.
5. The bank unlocks and plays. Settings, Restore purchases (signed in, on iOS and Android) restores purchases on a new install.

Account deletion: Settings, then Account, then Delete account. The app asks you to type DELETE to confirm. Deleting removes the account, synced answers, and progress. Settings is reachable from the header on every screen.

Sign-in is optional for the free Easy banks. A guest keeps progress on the device.

Data collection: email (sign-in), purchase history, and anonymous product analytics through PostHog (no location, no advertising identifier, no tracking). The privacy policy is at <PRIVACY POLICY URL>.

Purchases are processed by Apple and Google through RevenueCat. The app never handles card details.
```

Before pasting, replace `<PRIVACY POLICY URL>` with the hosted policy URL.

## Checked against the code

| Claim                                                                            | Source                                                           |
| -------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| A guest tapping a locked bank goes to sign-in first, then returns to the paywall | `app/[language]/index.tsx` (`?paywall=<difficulty>`)             |
| The paywall is titled "Unlock <difficulty>" and has Buy and "Not now"            | `components/purchase/PaywallSheet.tsx`                           |
| Restore purchases appears in Settings for a signed-in user on native only        | `app/settings.tsx` (`RestorePurchases`, `Platform.OS !== 'web'`) |
| Delete account is in Settings, behind a type-DELETE confirmation                 | `components/auth/DeleteAccountDialog.tsx`                        |
| Easy banks are free, Medium and Hard are paid                                    | `content/manifest.json`                                          |
