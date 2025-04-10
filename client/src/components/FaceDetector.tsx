import React, { useEffect, useRef } from 'react';
import { toast } from 'react-hot-toast';
import * as faceapi from 'face-api.js';

interface FaceDetectorProps {
  stream: MediaStream | null;
  onAutoVideoOff: () => void;
  disabled?: boolean;
  inactivityThreshold?: number;
  confirmationDelay?: number;
}

export const FaceDetector: React.FC<FaceDetectorProps> = ({
  stream,
  onAutoVideoOff,
  disabled = false,
  inactivityThreshold = 15000, // 15 seconds
  confirmationDelay = 3000 // 3 seconds confirmation delay
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const noFaceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const confirmationTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const modelLoadedRef = useRef<boolean>(false);
  const isProcessingRef = useRef<boolean>(false);

  useEffect(() => {
    const loadModels = async () => {
      try {
        await faceapi.nets.tinyFaceDetector.loadFromUri('/models');
        await faceapi.nets.faceLandmark68Net.loadFromUri('/models');
        modelLoadedRef.current = true;
      } catch (error) {
        console.error('Error loading face detection models:', error);
        toast.error('Failed to initialize face detection');
      }
    };

    if (!modelLoadedRef.current) {
      loadModels();
    }
  }, []);

  useEffect(() => {
    if (!stream || disabled || !modelLoadedRef.current) return;

    const video = document.createElement('video');
    videoRef.current = video;
    video.srcObject = stream;
    video.play();

    const canvas = document.createElement('canvas');
    canvasRef.current = canvas;

    const detectFace = async () => {
      if (!isProcessingRef.current && videoRef.current && canvasRef.current) {
        isProcessingRef.current = true;
        try {
          const detections = await faceapi.detectAllFaces(
            videoRef.current,
            new faceapi.TinyFaceDetectorOptions()
          );

          if (detections.length === 0) {
            // No face detected
            if (!noFaceTimeoutRef.current) {
              noFaceTimeoutRef.current = setTimeout(() => {
                // Show warning after inactivity threshold
                toast.warning('No face detected. Camera will turn off in 3 seconds...', {
                  duration: confirmationDelay,
                });

                // Set confirmation timeout
                confirmationTimeoutRef.current = setTimeout(() => {
                  // Trigger vibration
                  if (navigator.vibrate) {
                    navigator.vibrate(200);
                  }

                  onAutoVideoOff();
                  toast.success('Camera turned off due to inactivity');
                }, confirmationDelay);
              }, inactivityThreshold);
            }
          } else {
            // Face detected, clear timeouts
            if (noFaceTimeoutRef.current) {
              clearTimeout(noFaceTimeoutRef.current);
              noFaceTimeoutRef.current = null;
            }
            if (confirmationTimeoutRef.current) {
              clearTimeout(confirmationTimeoutRef.current);
              confirmationTimeoutRef.current = null;
            }
          }
        } catch (error) {
          console.error('Error during face detection:', error);
        }
        isProcessingRef.current = false;
      }
    };

    // Run face detection every 1 second
    const intervalId = setInterval(detectFace, 1000);

    return () => {
      clearInterval(intervalId);
      if (noFaceTimeoutRef.current) {
        clearTimeout(noFaceTimeoutRef.current);
      }
      if (confirmationTimeoutRef.current) {
        clearTimeout(confirmationTimeoutRef.current);
      }
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    };
  }, [stream, disabled, inactivityThreshold, confirmationDelay, onAutoVideoOff]);

  return null; // This is a utility component with no UI
}; 