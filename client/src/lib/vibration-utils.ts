/**
 * Vibrates the device (if supported)
 * @param duration Duration of vibration in milliseconds
 * @returns Boolean indicating if vibration is supported and executed
 */
export function vibrate(duration: number): boolean {
  // Check if the Vibration API is supported
  if (navigator.vibrate) {
    navigator.vibrate(duration);
    return true;
  }
  return false;
}

/**
 * Vibrates the device with a pattern (if supported)
 * @param pattern Array of alternating vibration and pause durations in milliseconds
 * @returns Boolean indicating if vibration is supported and executed
 */
export function vibratePattern(pattern: number[]): boolean {
  // Check if the Vibration API is supported
  if (navigator.vibrate) {
    navigator.vibrate(pattern);
    return true;
  }
  return false;
}

/**
 * Stops any ongoing vibration
 * @returns Boolean indicating if vibration is supported and stopped
 */
export function stopVibration(): boolean {
  // Check if the Vibration API is supported
  if (navigator.vibrate) {
    navigator.vibrate(0);
    return true;
  }
  return false;
}

/**
 * Checks if vibration is supported on the device
 * @returns Boolean indicating if vibration is supported
 */
export function isVibrationSupported(): boolean {
  return !!navigator.vibrate;
}
