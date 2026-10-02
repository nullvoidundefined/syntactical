// One place the app writes diagnostic warnings: a context object first,
// a fixed message second, values never interpolated into the message.
export function logWarning(context: Record<string, unknown>, message: string): void {
  console.warn(JSON.stringify({ level: 'warn', message, ...context }));
}
