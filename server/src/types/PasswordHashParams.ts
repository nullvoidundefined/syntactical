// The scrypt cost and size parameters a password hash is made with and records in its stored string.
interface PasswordHashParams {
  keyBytes: number;
  logN: number;
  p: number;
  r: number;
  saltBytes: number;
}

export type { PasswordHashParams };
