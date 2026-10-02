// One place the app writes diagnostic warnings: a context object first,
// a fixed message second, values never interpolated into the message.
// Error values keep their name and message, which JSON.stringify drops.
function serializeContextValue(value: unknown): unknown {
  if (!(value instanceof Error)) return value;
  const { message, name } = value;
  return { message, name };
}

export function logWarning(context: Record<string, unknown>, message: string): void {
  const entries = Object.entries(context).map(([key, value]) => [key, serializeContextValue(value)]);
  console.warn(JSON.stringify({ level: 'warn', message, ...Object.fromEntries(entries) }));
}
