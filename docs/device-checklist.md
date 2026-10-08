# Device checklist

Run this checklist on an EAS internal build before any release. For each run, record the date, the build ID, the device, and the OS version.

## Making the builds

These commands need the owner's Expo account. An iOS internal build also needs the device registered with `npx eas-cli@latest device:create`, which requires an Apple Developer account. Without one, mark the iOS column "blocked: no Apple Developer account" and run Android only.

```bash
npx eas-cli@latest login
npx eas-cli@latest build --profile preview --platform android
npx eas-cli@latest build --profile preview --platform ios
```

The preview profile points at the staging API (`API_BASE_URL` in `eas.json`) and, like production, the live content (nothing publishes separate preview content). It depends on the staging API getting the hostname `staging-api.syntactical.dev`; if the owner uses another host, change `API_BASE_URL` in the preview profile. Store sandbox purchases need the RevenueCat keys in the EAS `preview` environment and the products set up as in `docs/store/in-app-purchases.md`. Before a release, run the same checks on a `production` build (`--profile production`) installed through TestFlight and a Play internal test track, and note in the Runs table which profile the build used.

## Checks

| Check                                                                                                                                                                                                                                        | iOS | Android |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- | ------- |
| The app launches offline and shows the three languages from the bundled content                                                                                                                                                              |     |         |
| A full round completes, and the results show the correct count, the total, and the percentage                                                                                                                                                |     |         |
| The streak in the header updates after each answer and survives an app restart                                                                                                                                                               |     |         |
| The query drawer opens from Query and from Explain, and closes by its control, the backdrop, and the back gesture                                                                                                                            |     |         |
| On a notched device the header sits below the notch, and no control sits under the home indicator                                                                                                                                            |     |         |
| After a changed bank is pushed, the download line appears once, and the next round uses the new questions                                                                                                                                    |     |         |
| A bank downloaded on the device is accepted, which shows that the device's SHA-256 (`expo-crypto`) matches the build-time hash in the manifest                                                                                               |     |         |
| With Reduce Motion on, the download line is static and the drawer appears without sliding                                                                                                                                                    |     |         |
| Sign-in: request a code for your email, enter it, and the header shows the signed-in state; a wrong code is refused                                                                                                                          |     |         |
| Sign-out with unsynced events: play offline, sign in, sign out; the dialog offers Sync now and Discard; after either, a different account on the same device sees none of the first account's events                                         |     |         |
| Purchase: on a signed-in account, a locked Medium bank opens the paywall, Buy shows the store's price, a sandbox purchase unlocks the bank, and it plays                                                                                     |     |         |
| Restore on a fresh install: delete the app, reinstall, sign in as the buyer, Settings, Restore purchases; the bank is unlocked again                                                                                                         |     |         |
| Review round offline: with airplane mode on, the review round starts from the on-device queue and completes                                                                                                                                  |     |         |
| Paid bank offline: after a purchase and one online launch, a paid bank plays with airplane mode on                                                                                                                                           |     |         |
| Account deletion: Settings, Delete account, type DELETE, confirm; the app returns to the signed-out state, and signing in again with the same email shows an empty account                                                                   |     |         |
| Reduced motion on the paywall and goal ring: with Reduce Motion on, the paywall appears without sliding and the daily goal ring does not animate, and both still read correctly                                                              |     |         |
| Guest analytics (PR #50): as a guest with a production-keyed build, no PostHog cookie or local storage key is written (web: browser dev tools, Application tab; native: no PostHog entry in app storage), and events still appear in PostHog |     |         |
| VoiceOver and TalkBack reach Buy inside the paywall (PR #52): focus lands in the sheet, Buy is announced with its price, and Not now closes it                                                                                               |     |         |
| Sandbox purchase on native (PR #52): the store sandbox account buys a bank, and `/v1/me` shows the entitlement                                                                                                                               |     |         |

## Web checks

Run these in a desktop browser against the deployed web build once its RevenueCat Web Billing key is set.

| Check                                                                                                                                    | Result |
| ---------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| Sandbox purchase on web (PR #52): Buy opens Web Billing checkout in its sandbox, completing it returns to the app with the bank unlocked |        |
| VoiceOver (Safari) reaches Buy inside the paywall, Tab stays inside the sheet, and Escape closes it                                      |        |
| A guest's session writes no PostHog cookie or local storage key                                                                          |        |

## Runs

| Date       | Profile | Build ID                             | Device                                    | OS version | Result                                                                                                                                                                                                                                                                                                                                                                                                           |
| ---------- | ------- | ------------------------------------ | ----------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-10-06 | preview | 30afaaa2-2f3e-4ac4-872b-6eaabfe5b4dc | Android emulator (Medium Phone, API 36.1) | Android 16 | Android only (iOS blocked: no Apple Developer account). Pass: offline launch, full round, review round offline, drawer opens from Query and Explain and closes by its control and back. Fail: drawer drew under the status bar (fixed in #130). On a phone the drawer fills the screen, so there is no backdrop to tap. Blocked: sign-in, purchases, restore, deletion, analytics, TalkBack, bank push and hash. |
| 2026-10-08 | preview | 31de421f-281f-441a-8dc1-a50a3f7d9bfa | Android emulator (Medium Phone, API 36.1) | Android 16 | Recheck after #130. Pass: drawer header below the status bar, streak moves to Day 1 at 20 XP and survives a restart. Reduce motion inconclusive: no mid-slide frame captured, but the first frame came before the drawer rendered.                                                                                                                                                                               |
