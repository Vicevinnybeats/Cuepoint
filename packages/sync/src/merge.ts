/**
 * Last-write-wins merge decision, shared by every synced collection.
 * A remote record replaces the local one only when strictly newer; ties
 * keep the local copy so a device never churns on its own echo.
 */
export function remoteWins(localUpdatedAt: number | undefined, remoteUpdatedAt: number): boolean {
  if (localUpdatedAt === undefined) return true;
  return remoteUpdatedAt > localUpdatedAt;
}
