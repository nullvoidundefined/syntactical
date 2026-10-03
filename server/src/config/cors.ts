import type { CorsOptions } from 'cors';

const WILDCARD_ORIGIN = '*';
const NULL_ORIGIN = 'null';

// Fails closed: only an exact listed origin is granted; `*` and `null` are never granted, listed or not.
function createCorsOptions(allowedOrigins: string[]): CorsOptions {
  const allowed = new Set(allowedOrigins.filter((origin) => origin !== WILDCARD_ORIGIN && origin !== NULL_ORIGIN));
  return {
    credentials: true,
    origin(origin, callback) {
      callback(null, origin !== undefined && allowed.has(origin));
    },
  };
}

export { createCorsOptions };
