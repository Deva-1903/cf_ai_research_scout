/** Generate a random URL-safe ID. Uses crypto.randomUUID when available. */
export function newId(): string {
  return crypto.randomUUID();
}
