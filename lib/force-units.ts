/** Standard gravity: Newtons per kilogram-force. */
export const NEWTONS_PER_KGF = 9.80665;

/** Convert force in Newtons to kgf for UI display only. */
export function newtonsToKgf(forceNewtons: number): number {
  return forceNewtons / NEWTONS_PER_KGF;
}

/** Format Newtons as a kg display string (e.g. 98.0665 → "10.0"). */
export function formatForceKgf(forceNewtons: number, digits = 1): string {
  return newtonsToKgf(forceNewtons).toFixed(digits);
}
