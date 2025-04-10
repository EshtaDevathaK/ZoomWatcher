import React, { useEffect, useRef } from 'react';
import { toast } from 'sonner';

interface AVIntegrityMonitorProps {
  stream: MediaStream | null;
  userId?: string;
}

export const AVIntegrityMonitor: React.FC<AVIntegrityMonitorProps> = ({ stream, userId }) => {
  const lastWarningTime = useRef<Record<string, number>>({});

  useEffect(() => {
    if (!stream) return;

    const checkTrackStates = () => {
      stream.getTracks().forEach(track => {
        const trackId = `${track.kind}-${userId || 'local'}`;
        const now = Date.now();
        const lastWarning = lastWarningTime.current[trackId] || 0;

        // Only show warning every 30 seconds for the same track
        if (now - lastWarning < 30000) return;

        if (!track.enabled) {
          toast.warning(
            `${track.kind === 'audio' ? 'Microphone' : 'Camera'} is disabled. ` +
            `Please check your device settings.`
          );
          lastWarningTime.current[trackId] = now;
        } else if (track.readyState !== 'live') {
          toast.warning(
            `${track.kind === 'audio' ? 'Audio' : 'Video'} track is not active. ` +
            `Current state: ${track.readyState}. Please check your device connection.`
          );
          lastWarningTime.current[trackId] = now;
        } else if (track.muted) {
          toast.warning(
            `${track.kind === 'audio' ? 'Microphone' : 'Camera'} is muted. ` +
            `Please check your device permissions.`
          );
          lastWarningTime.current[trackId] = now;
        }

        // Log track stats for debugging
        console.log(`Track status for ${userId || 'local'} ${track.kind}:`, {
          enabled: track.enabled,
          muted: track.muted,
          readyState: track.readyState,
          settings: track.getSettings()
        });
      });
    };

    // Initial check
    checkTrackStates();

    // Periodic checks
    const interval = setInterval(checkTrackStates, 5000);

    // Cleanup
    return () => {
      clearInterval(interval);
      lastWarningTime.current = {};
    };
  }, [stream, userId]);

  return null;
}; 