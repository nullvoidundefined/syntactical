// Thin wrapper around the browser's localStorage API. No business logic
// lives here, only safe read/write access with JSON (de)serialization and
// defensive handling of unavailable or corrupt storage.

/**
 * Read and JSON-parse a value from localStorage.
 * @param {string} key
 * @param {*} fallback - returned when the key is missing or unparsable
 */
export function readJson(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

/**
 * JSON-serialize and write a value to localStorage.
 * @param {string} key
 * @param {*} value
 */
export function writeJson(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage unavailable (private mode, quota exceeded) - fail silently,
    // stats simply won't persist for this session.
  }
}
