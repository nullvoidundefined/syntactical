// The email client's contract: what the sign-in routes call to deliver a one-time code.
interface EmailClient {
  sendSignInCode(email: string, code: string): Promise<void>;
}

export type { EmailClient };
