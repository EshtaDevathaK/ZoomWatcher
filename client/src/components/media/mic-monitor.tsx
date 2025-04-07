import { useEffect, useRef, useState } from 'react';
import { detectSilence, createAudioAnalyser } from '@/lib/audio-utils';
import { vibrate } from '@/lib/vibration-utils';
import { useToast } from '@/hooks/use-toast';
import { ToastAction } from '@/components/ui/toast';

interface MicMonitorProps {
  inactivityThreshold: number; // in milliseconds
  muted: boolean;
  enabled: boolean;
  alertsEnabled: boolean;
  vibrationEnabled: boolean;
  onAutoMute?: () => void;
}

export function MicMonitor({
  inactivityThreshold,
  muted,
  enabled,
  alertsEnabled,
  vibrationEnabled,
  onAutoMute
}: MicMonitorProps) {
  const { toast } = useToast();
  const inactivityTimerRef = useRef<NodeJS.Timeout | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [silenceDetected, setSilenceDetected] = useState(false);
  const [isMonitoring, setIsMonitoring] = useState(false);

  // Start audio monitoring
  useEffect(() => {
    const startAudioMonitoring = async () => {
      if (muted || !enabled) {
        stopAudioMonitoring();
        return;
      }

      try {
        // Get microphone access
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        streamRef.current = stream;

        // Setup audio analyzer
        const { audioContext, analyser } = await createAudioAnalyser(stream);
        audioContextRef.current = audioContext;
        analyserRef.current = analyser;

        setIsMonitoring(true);
      } catch (error) {
        console.error('Error starting audio monitoring:', error);
      }
    };

    const stopAudioMonitoring = () => {
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
        inactivityTimerRef.current = null;
      }

      if (audioContextRef.current) {
        audioContextRef.current.close();
        audioContextRef.current = null;
      }

      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }

      analyserRef.current = null;
      setIsMonitoring(false);
      setSilenceDetected(false);
    };

    if (enabled && !muted) {
      startAudioMonitoring();
    } else {
      stopAudioMonitoring();
    }

    return () => {
      stopAudioMonitoring();
    };
  }, [enabled, muted]);

  // Monitor for silence
  useEffect(() => {
    let silenceCheckInterval: NodeJS.Timeout | null = null;

    const checkForSilence = async () => {
      if (!isMonitoring || !analyserRef.current || !audioContextRef.current) return;

      const isSilent = await detectSilence(analyserRef.current);
      
      if (isSilent && !silenceDetected) {
        // Start inactivity timer when silence is first detected
        if (!inactivityTimerRef.current) {
          inactivityTimerRef.current = setTimeout(() => {
            // Auto-mute after inactivity threshold
            if (onAutoMute) {
              onAutoMute();
            }

            // Show notification
            if (alertsEnabled) {
              toast({
                title: "Mic muted due to inactivity",
                description: "Your microphone was automatically turned off after 2 minutes of silence.",
                action: <ToastAction altText="Unmute">Unmute</ToastAction>,
              });
            }

            // Vibrate device
            if (vibrationEnabled) {
              vibrate(100); // Short vibration (100ms)
            }

            inactivityTimerRef.current = null;
          }, inactivityThreshold);
        }
        setSilenceDetected(true);
      } else if (!isSilent && silenceDetected) {
        // Reset inactivity timer if sound is detected again
        if (inactivityTimerRef.current) {
          clearTimeout(inactivityTimerRef.current);
          inactivityTimerRef.current = null;
        }
        setSilenceDetected(false);
      }
    };

    if (isMonitoring) {
      silenceCheckInterval = setInterval(checkForSilence, 1000); // Check every second
    }

    return () => {
      if (silenceCheckInterval) {
        clearInterval(silenceCheckInterval);
      }
    };
  }, [isMonitoring, silenceDetected, inactivityThreshold, alertsEnabled, vibrationEnabled, onAutoMute]);

  // This component doesn't render anything
  return null;
}
