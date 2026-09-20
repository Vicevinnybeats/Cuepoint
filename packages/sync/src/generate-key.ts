/** A sync key stands in for an account: a random string generated on one
 * device and copied to another links them. No email/password/OAuth. */
export function generateSyncKey(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
