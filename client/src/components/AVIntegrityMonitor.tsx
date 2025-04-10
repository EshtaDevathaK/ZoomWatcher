import React, { useEffect, useRef } from 'react';
import { toast } from 'sonner';

export type AVStatus = {
  audio: boolean;
  video: boolean;
};

interface AVIntegrityMonitorProps {
  stream: MediaStream | null;
  userId?: string;
  onStatusChange?: (status: AVStatus) => void;
}

export const AVIntegrityMonitor: React.FC<AVIntegrityMonitorProps> = ({ 
  stream, 
  userId,
  onStatusChange 
}) => {
  const lastWarningTime = useRef<Record<string, number>>({});
  const currentStatus = useRef<AVStatus>({ audio: true, video: true });

  useEffect(() => {
    if (!stream) return;

    const checkTrackStates = () => {
      const audioTracks = stream.getAudioTracks();
      const videoTracks = stream.getVideoTracks();
      
      const newStatus: AVStatus = {
        audio: audioTracks.some(track => track.enabled && track.readyState === 'live'),
        video: videoTracks.some(track => track.enabled && track.readyState === 'live')
      };

      // Check if status changed
      if (newStatus.audio !== currentStatus.current.audio || 
          newStatus.video !== currentStatus.current.video) {
        currentStatus.current = newStatus;
        onStatusChange?.(newStatus);
      }

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
  }, [stream, userId, onStatusChange]);

  return null;
}; 