# Device checklist

Run this checklist on an EAS internal build before any release. For each run, record the date, the build ID, the device, and the OS version.

## Making the builds

These commands need the owner's Expo account. An iOS internal build also needs the device registered with `npx eas-cli@latest device:create`, which requires an Apple Developer account. Without one, mark the iOS column "blocked: no Apple Developer account" and run Android only.

```bash
npx eas-cli@latest login
npx eas-cli@latest build --profile preview --platform android
npx eas-cli@latest build --profile preview --platform ios
```

## Checks

| Check | iOS | Android |
|---|---|---|
| The app launches offline and shows the three languages from the bundled content | | |
| A full round completes, and the results show the correct count, the total, and the percentage | | |
| The streak in the header updates after each answer and survives an app restart | | |
| The query drawer opens from Query and from Explain, and closes by its control, the backdrop, and the back gesture | | |
| On a notched device the header sits below the notch, and no control sits under the home indicator | | |
| After a changed bank is pushed, the download line appears once, and the next round uses the new questions | | |
| A bank downloaded on the device is accepted, which shows that the device's SHA-256 (`expo-crypto`) matches the build-time hash in the manifest | | |
| With Reduce Motion on, the download line is static and the drawer appears without sliding | | |

## Runs

| Date | Build ID | Device | OS version | Result |
|---|---|---|---|---|
