import * as tf from '@tensorflow/tfjs';
import * as blazeface from '@tensorflow-models/blazeface';

// Store the model globally to load it only once
let faceDetectionModel: blazeface.BlazeFaceModel | null = null;

/**
 * Loads the BlazeFace model for face detection
 */
export async function loadFaceDetectionModel(): Promise<void> {
  if (!faceDetectionModel) {
    try {
      // Make sure TensorFlow.js is ready
      await tf.ready();
      
      // Load the BlazeFace model
      faceDetectionModel = await blazeface.load();
      
      console.log('Face detection model loaded successfully');
    } catch (error) {
      console.error('Error loading face detection model:', error);
      throw new Error('Failed to load face detection model');
    }
  }
}

/**
 * Detects faces in a video stream
 * @param videoElement The video element to analyze
 * @returns Array of detected faces
 */
export async function detectFaces(videoElement: HTMLVideoElement): Promise<blazeface.NormalizedFace[]> {
  if (!faceDetectionModel) {
    throw new Error('Face detection model not loaded');
  }

  if (!videoElement || videoElement.readyState < 2) {
    return [];
  }

  try {
    // Detect faces in the video frame
    const predictions = await faceDetectionModel.estimateFaces(videoElement, false);
    return predictions;
  } catch (error) {
    console.error('Error during face detection:', error);
    return [];
  }
}

/**
 * Checks if a face is visible in the video
 * @param videoElement The video element to analyze
 * @returns Boolean indicating if a face is detected
 */
export async function isFaceVisible(videoElement: HTMLVideoElement): Promise<boolean> {
  const faces = await detectFaces(videoElement);
  return faces.length > 0;
}
