import { useEffect, useRef, useState } from 'react';
import { detectFaces, loadFaceDetectionModel } from '@/lib/tensorflow-utils';
import { vibrate } from '@/lib/vibration-utils';
import { useToast } from '@/hooks/use-toast';
import { ToastAction } from '@/components/ui/toast';
import { Loader2 } from 'lucide-react';

interface FaceDetectorProps {
  inactivityThreshold: number; // in milliseconds
  cameraOff: boolean;
  enabled: boolean;
  alertsEnabled: boolean;
  vibrationEnabled: boolean;
  onAutoVideoOff?: () => void;
}

export function FaceDetector({
  inactivityThreshold,
  cameraOff,
  enabled,
  alertsEnabled,
  vibrationEnabled,
  onAutoVideoOff
}: FaceDetectorProps) {
  const { toast } = useToast();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const inactivityTimerRef = useRef<NodeJS.Timeout | null>(null);
  const warningTimerRef = useRef<NodeJS.Timeout | null>(null);
  const countdownRef = useRef<number>(3);
  const [modelLoaded, setModelLoaded] = useState(false);
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [faceDetected, setFaceDetected] = useState(false);
  const [showCountdown, setShowCountdown] = useState(false);

  // Load the face detection model
  useEffect(() => {
    const loadModel = async () => {
      try {
        await loadFaceDetectionModel();
        setModelLoaded(true);
      } catch (error) {
        console.error('Error loading face detection model:', error);
      }
    };

    loadModel();
  }, []);

  // Start video monitoring
  useEffect(() => {
    const startVideoMonitoring = async () => {
      if (cameraOff || !enabled || !modelLoaded) {
        stopVideoMonitoring();
        return;
      }

      try {
        // Create a hidden video element for face detection
        if (!videoRef.current) {
          const video = document.createElement('video');
          video.style.display = 'none';
          document.body.appendChild(video);
          videoRef.current = video;
        }

        // Get camera access
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        streamRef.current = stream;

        // Connect stream to video element
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
        }

        setIsMonitoring(true);
      } catch (error) {
        console.error('Error starting video monitoring:', error);
      }
    };

    const stopVideoMonitoring = () => {
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
        inactivityTimerRef.current = null;
      }

      if (warningTimerRef.current) {
        clearTimeout(warningTimerRef.current);
        warningTimerRef.current = null;
      }

      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }

      if (videoRef.current) {
        videoRef.current.pause();
        videoRef.current.srcObject = null;
        videoRef.current.remove();
        videoRef.current = null;
      }

      setIsMonitoring(false);
      setFaceDetected(false);
      setShowCountdown(false);
      countdownRef.current = 3;
    };

    if (enabled && !cameraOff && modelLoaded) {
      startVideoMonitoring();
    } else {
      stopVideoMonitoring();
    }

    return () => {
      stopVideoMonitoring();
    };
  }, [enabled, cameraOff, modelLoaded]);

  // Monitor for faces
  useEffect(() => {
    let faceCheckInterval: NodeJS.Timeout | null = null;

    const checkForFaces = async () => {
      if (!isMonitoring || !videoRef.current) return;

      try {
        const faces = await detectFaces(videoRef.current);
        const isFacePresent = faces.length > 0;
        
        if (isFacePresent) {
          // Face detected, reset timers
          setFaceDetected(true);
          
          if (inactivityTimerRef.current) {
            clearTimeout(inactivityTimerRef.current);
            inactivityTimerRef.current = null;
          }
          
          if (warningTimerRef.current) {
            clearTimeout(warningTimerRef.current);
            warningTimerRef.current = null;
            setShowCountdown(false);
            countdownRef.current = 3;
          }
        } else if (!isFacePresent && faceDetected) {
          // Face no longer detected
          setFaceDetected(false);
          
          // Start inactivity timer if not already started
          if (!inactivityTimerRef.current) {
            inactivityTimerRef.current = setTimeout(() => {
              // Show warning with countdown
              setShowCountdown(true);
              
              // Start countdown
              warningTimerRef.current = setInterval(() => {
                countdownRef.current--;
                
                if (countdownRef.current <= 0) {
                  // Clear interval and turn off camera
                  if (warningTimerRef.current) {
                    clearInterval(warningTimerRef.current);
                    warningTimerRef.current = null;
                  }
                  
                  setShowCountdown(false);
                  countdownRef.current = 3;
                  
                  // Auto-turn off camera
                  if (onAutoVideoOff) {
                    onAutoVideoOff();
                  }
                  
                  // Show notification
                  if (alertsEnabled) {
                    toast({
                      title: "Camera turned OFF due to inactivity",
                      description: "Your camera was automatically turned off because no face was detected.",
                      action: <ToastAction altText="Turn On">Turn On</ToastAction>,
                    });
                  }
                  
                  // Vibrate device
                  if (vibrationEnabled) {
                    vibrate(200); // Long vibration (200ms)
                  }
                }
              }, 1000);
              
              // Show warning toast
              if (alertsEnabled) {
                toast({
                  title: "No face detected",
                  description: "Camera will turn off in 3 seconds if no face is detected.",
                });
              }
              
              inactivityTimerRef.current = null;
            }, inactivityThreshold);
          }
        }
      } catch (error) {
        console.error('Error during face detection:', error);
      }
    };
    
    if (isMonitoring) {
      faceCheckInterval = setInterval(checkForFaces, 1000); // Check every second
    }
    
    return () => {
      if (faceCheckInterval) {
        clearInterval(faceCheckInterval);
      }
    };
  }, [isMonitoring, faceDetected, inactivityThreshold, alertsEnabled, vibrationEnabled, onAutoVideoOff]);

  // This component doesn't render anything visible
  return (
    <>
      {showCountdown && (
        <div className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-50 bg-black bg-opacity-70 text-white rounded-full w-16 h-16 flex items-center justify-center">
          <span className="text-3xl font-bold">{countdownRef.current}</span>
        </div>
      )}
      
      {enabled && !modelLoaded && (
        <div className="fixed bottom-4 right-4 text-xs text-gray-500 flex items-center">
          <Loader2 className="animate-spin mr-1 h-3 w-3" />
          Loading face detection...
        </div>
      )}
    </>
  );
}
