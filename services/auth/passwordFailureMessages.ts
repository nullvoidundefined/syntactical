// The announcements for a refused password and for the shared failures around it, used by the
// sign-up route and the Settings password form. Reasons only: no password or email is echoed.
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '../../constants/appConfig';

export const PASSWORD_BREACHED_MESSAGE = 'That password appeared in a data breach. Choose another password.';
export const PASSWORD_TOO_LONG_MESSAGE = `That password is too long. Use at most ${PASSWORD_MAX_LENGTH} characters.`;
export const PASSWORD_TOO_SHORT_MESSAGE = `That password is too short. Use at least ${PASSWORD_MIN_LENGTH} characters.`;
export const RATE_LIMITED_MESSAGE = 'Too many attempts. Wait a few minutes, then try again.';
export const SERVER_BUSY_MESSAGE = 'The server is busy. Try again in a moment.';
