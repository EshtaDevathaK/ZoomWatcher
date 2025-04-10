import React, { useEffect, useRef } from 'react';
import { toast } from 'react-hot-toast';

interface VoiceAutoMuteProps {
  stream: MediaStream | null;
  onAutoMute: () => void;
  disabled?: boolean;
  inactivityThreshold?: number;
  silenceThreshold?: number;
}

export const VoiceAutoMute: React.FC<VoiceAutoMuteProps> = ({
  stream,
  onAutoMute,
  disabled = false,
  inactivityThreshold = 120000, // 2 minutes
  silenceThreshold = 10 // Minimum audio level
}) => {
  const audioContextRef = useRef<AudioContext | null>(null);
  const silenceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastAudioActivityRef = useRef<number>(Date.now());
  const isProcessingRef = useRef<boolean>(false);

  useEffect(() => {
    if (!stream || disabled) return;

    const initializeAudioContext = async () => {
      try {
        audioContextRef.current = new AudioContext();
        const source = audioContextRef.current.createMediaStreamSource(stream);
        const analyzer = audioContextRef.current.createAnalyser();
        analyzer.fftSize = 2048;
        source.connect(analyzer);

        const bufferLength = analyzer.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);

        const checkAudioLevel = () => {
          if (!isProcessingRef.current && audioContextRef.current && !disabled) {
            isProcessingRef.current = true;
            analyzer.getByteFrequencyData(dataArray);
            
            // Calculate average audio level
            const average = dataArray.reduce((acc, value) => acc + value, 0) / bufferLength;

            // If audio level is above threshold, update last activity
            if (average > silenceThreshold) {
              lastAudioActivityRef.current = Date.now();
              if (silenceTimeoutRef.current) {
                clearTimeout(silenceTimeoutRef.current);
                silenceTimeoutRef.current = null;
              }
            } else {
              // Check if we've been silent for too long
              const timeSinceLastActivity = Date.now() - lastAudioActivityRef.current;
              if (timeSinceLastActivity >= inactivityThreshold && !silenceTimeoutRef.current) {
                // Show warning 10 seconds before auto-mute
                toast.warning('No audio detected. Auto-muting in 10 seconds...', {
                  duration: 10000,
                });

                silenceTimeoutRef.current = setTimeout(() => {
                  // Trigger vibration
                  if (navigator.vibrate) {
                    navigator.vibrate(100);
                  }

                  onAutoMute();
                  toast.success('Microphone auto-muted due to inactivity');
                }, 10000);
              }
            }
            isProcessingRef.current = false;
          }
        };

        // Check audio level every 1 second
        const intervalId = setInterval(checkAudioLevel, 1000);

        return () => {
          clearInterval(intervalId);
          if (silenceTimeoutRef.current) {
            clearTimeout(silenceTimeoutRef.current);
          }
          audioContextRef.current?.close();
        };
      } catch (error) {
        console.error('Error initializing audio monitoring:', error);
        toast.error('Failed to initialize audio monitoring');
      }
    };

    initializeAudioContext();
  }, [stream, disabled, inactivityThreshold, silenceThreshold, onAutoMute]);

  return null; // This is a utility component with no UI
}; 