/**
 * Request microphone and camera permissions
 * @returns Promise resolving to true if permissions are granted, false otherwise
 */
export async function requestPermissions(): Promise<boolean> {
  try {
    console.log("Requesting camera and microphone permissions");
    
    // Try with optimized constraints first
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        },
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: "user" // Front camera
        }
      });
      
      // Log what we got
      console.log("Got high-quality permission with tracks:", {
        video: stream.getVideoTracks().length,
        audio: stream.getAudioTracks().length
      });
      
      // Stop all tracks to release the devices after permissions are granted
      stream.getTracks().forEach(track => track.stop());
      
      return true;
    } catch (highQualityError) {
      console.warn("Failed with high quality constraints, trying basic constraints", highQualityError);
      
      // Try with basic constraints
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: true
        });
        
        console.log("Got basic permission with tracks:", {
          video: stream.getVideoTracks().length,
          audio: stream.getAudioTracks().length
        });
        
        // Stop all tracks to release the devices after permissions are granted
        stream.getTracks().forEach(track => track.stop());
        
        return true;
      } catch (basicError) {
        console.error("Failed even with basic constraints, trying audio and video separately", basicError);
        
        // Try audio and video separately as a last resort
        let audioGranted = false;
        let videoGranted = false;
        
        try {
          const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
          audioStream.getTracks().forEach(track => track.stop());
          audioGranted = true;
          console.log("Audio permission granted separately");
        } catch (audioError) {
          console.error("Failed to get audio permission:", audioError);
        }
        
        try {
          const videoStream = await navigator.mediaDevices.getUserMedia({ video: true });
          videoStream.getTracks().forEach(track => track.stop());
          videoGranted = true;
          console.log("Video permission granted separately");
        } catch (videoError) {
          console.error("Failed to get video permission:", videoError);
        }
        
        return audioGranted || videoGranted;
      }
    }
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
