/** A short buzz to confirm an action (Android). Silently does nothing elsewhere. */
export function haptic(ms = 12): void {
  try {
    navigator.vibrate?.(ms)
  } catch {
    /* not supported */
  }
}
