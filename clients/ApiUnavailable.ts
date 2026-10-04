// The error thrown by apiFetch when the API cannot be reached: the configured
// base URL is invalid, the path would leave the base, or the network failed.
export class ApiUnavailable extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'ApiUnavailable';
  }
}
