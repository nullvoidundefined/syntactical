// React Native's index exposes Modal through a lazy getter, so the module
// tree behind it loads the first time a render reads it. On a cold Jest
// transform cache (every CI run starts with one) that first load takes over a
// second on a fast machine and over 5 s on CI's shared runners, which landed
// inside the first test's timeout. A native suite that renders SignOutDialog
// imports this file first, so the load happens at module scope, which Jest
// does not time.
import { Modal } from 'react-native';

export const preloadedModal: typeof Modal = Modal;
