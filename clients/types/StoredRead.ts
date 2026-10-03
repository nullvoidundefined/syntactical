// The outcome of reading one storage key: whether the read itself failed,
// and the parsed value (null when the key is absent or the read failed).
export type StoredRead = { isReadFailed: boolean; value: unknown };
