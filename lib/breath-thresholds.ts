/** Shared breath pressure bands (cmH₂O) for UI labels and session metrics. */
export const BREATH_PRESSURE_GOOD_MIN = 15;
export const BREATH_PRESSURE_GOOD_MAX = 25;
export const BREATH_PRESSURE_OK_MIN = 10;
export const BREATH_PRESSURE_OK_MAX = 30;

export function isGoodBreathPressure(pressureCmH2O: number): boolean {
  return pressureCmH2O >= BREATH_PRESSURE_GOOD_MIN && pressureCmH2O <= BREATH_PRESSURE_GOOD_MAX;
}
