/**
 * Request microphone and camera permissions
 * @returns Promise resolving to true if permissions are granted, false otherwise
 */
export async function requestPermissions(): Promise<boolean> {
  try {
    // Request both audio and video permissions
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: true
    });

    // Stop all tracks to release the devices after permissions are granted
    stream.getTracks().forEach(track => track.stop());

    return true;
  } catch (error) {
    console.error('Error requesting media permissions:', error);
    return false;
  }
}

/**
 * Check if camera permission is granted
 * @returns Promise resolving to true if camera permission is granted, false otherwise
 */
export async function checkCameraPermission(): Promise<boolean> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    stream.getTracks().forEach(track => track.stop());
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Check if microphone permission is granted
 * @returns Promise resolving to true if microphone permission is granted, false otherwise
 */
export async function checkMicrophonePermission(): Promise<boolean> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach(track => track.stop());
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Request permission for screen sharing
 * @returns Promise resolving to the screen capture media stream
 */
export async function requestScreenCapture(): Promise<MediaStream> {
  try {
    return await navigator.mediaDevices.getDisplayMedia({ video: true });
  } catch (error) {
    console.error('Error requesting screen capture permission:', error);
    throw new Error('Failed to get screen sharing permission');
  }
}
