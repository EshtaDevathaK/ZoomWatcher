import React, { useEffect, useRef, useState } from 'react';
import { toast } from 'react-hot-toast';

interface AVStatus {
  hostVideoPreview: boolean;
  participantSeesHost: boolean;
  hostAudioTransmitting: boolean;
  participantAudioReceived: boolean;
}

interface AVIntegrityMonitorProps {
  localStream: MediaStream | null;
  remoteStreams: Record<string, MediaStream>;
  isHost: boolean;
  onIssueDetected: (issue: string) => void;
  onStatusChange: (status: AVStatus) => void;
}

export const AVIntegrityMonitor: React.FC<AVIntegrityMonitorProps> = ({
  localStream,
  remoteStreams,
  isHost,
  onIssueDetected,
  onStatusChange,
}) => {
  const [avStatus, setAVStatus] = useState<AVStatus>({
    hostVideoPreview: false,
    participantSeesHost: false,
    hostAudioTransmitting: false,
    participantAudioReceived: false,
  });

  const audioContextRef = useRef<AudioContext | null>(null);
  const retryAttemptsRef = useRef<Record<string, number>>({});

  // Initialize audio context for analysis
  useEffect(() => {
    audioContextRef.current = new AudioContext();
    return () => {
      audioContextRef.current?.close();
    };
  }, []);

  // Check host video preview
  const checkHostVideoPreview = async () => {
    if (!localStream) {
      handleIssue('host-video', 'Local video stream not available');
      return false;
    }

    const videoTracks = localStream.getVideoTracks();
    if (videoTracks.length === 0) {
      handleIssue('host-video', 'No video track found');
      return false;
    }

    const track = videoTracks[0];
    if (!track.enabled) {
      await autoCorrect('host-video');
      return track.enabled;
    }

    return true;
  };

  // Check if participants can see host
  const checkParticipantSeesHost = () => {
    if (!localStream) return false;
    const videoTrack = localStream.getVideoTracks()[0];
    
    if (!videoTrack || !videoTrack.enabled) {
      handleIssue('participant-video', 'Host video not broadcasting');
      return false;
    }

    // Check if video is actually streaming (readyState)
    if (videoTrack.readyState !== 'live') {
      handleIssue('participant-video', 'Video stream not active');
      return false;
    }

    return true;
  };

  // Monitor audio levels
  const checkAudioLevels = (stream: MediaStream, type: 'host' | 'participant') => {
    if (!audioContextRef.current) return false;

    const audioContext = audioContextRef.current;
    const source = audioContext.createMediaStreamSource(stream);
    const analyzer = audioContext.createAnalyser();
    source.connect(analyzer);

    const dataArray = new Uint8Array(analyzer.frequencyBinCount);
    analyzer.getByteFrequencyData(dataArray);

    const audioLevel = dataArray.reduce((acc, val) => acc + val, 0) / dataArray.length;
    
    if (audioLevel < 10) {
      handleIssue(
        type === 'host' ? 'host-audio' : 'participant-audio',
        `${type === 'host' ? 'Microphone' : 'Participant audio'} level too low`
      );
      return false;
    }

    return true;
  };

  // Auto-correction attempts
  const autoCorrect = async (issueType: string) => {
    retryAttemptsRef.current[issueType] = (retryAttemptsRef.current[issueType] || 0) + 1;

    if (retryAttemptsRef.current[issueType] > 3) {
      toast.error(`Critical: Manual check needed for ${issueType}`);
      return false;
    }

    switch (issueType) {
      case 'host-video':
        try {
          await navigator.mediaDevices.getUserMedia({ video: true });
          if (localStream) {
            const videoTrack = localStream.getVideoTracks()[0];
            if (videoTrack) videoTrack.enabled = true;
          }
        } catch (error) {
          console.error('Failed to auto-correct video:', error);
          return false;
        }
        break;

      case 'host-audio':
        try {
          await navigator.mediaDevices.getUserMedia({ audio: true });
          if (localStream) {
            const audioTrack = localStream.getAudioTracks()[0];
            if (audioTrack) audioTrack.enabled = true;
          }
        } catch (error) {
          console.error('Failed to auto-correct audio:', error);
          return false;
        }
        break;
    }

    return true;
  };

  // Handle issues
  const handleIssue = (type: string, message: string) => {
    onIssueDetected(message);
    toast.error(message);
  };

  // Main monitoring loop
  useEffect(() => {
    const monitorAV = async () => {
      const newStatus = {
        hostVideoPreview: await checkHostVideoPreview(),
        participantSeesHost: checkParticipantSeesHost(),
        hostAudioTransmitting: localStream ? checkAudioLevels(localStream, 'host') : false,
        participantAudioReceived: Object.values(remoteStreams).some(
          stream => checkAudioLevels(stream, 'participant')
        ),
      };

      setAVStatus(newStatus);
      onStatusChange(newStatus);

      // Show success message if all checks pass
      if (Object.values(newStatus).every(status => status)) {
        toast.success('All AV systems operational');
      }
    };

    const intervalId = setInterval(monitorAV, 5000); // Check every 5 seconds
    return () => clearInterval(intervalId);
  }, [localStream, remoteStreams]);

  return (
    <div className="av-integrity-monitor">
      <div className={`status-indicator ${avStatus.hostVideoPreview ? 'success' : 'error'}`}>
        🎥 Host Video Preview: {avStatus.hostVideoPreview ? 'Active' : 'Issue Detected'}
      </div>
      <div className={`status-indicator ${avStatus.participantSeesHost ? 'success' : 'error'}`}>
        👥 Participant Video: {avStatus.participantSeesHost ? 'Connected' : 'Not Visible'}
      </div>
      <div className={`status-indicator ${avStatus.hostAudioTransmitting ? 'success' : 'error'}`}>
        🎤 Host Audio: {avStatus.hostAudioTransmitting ? 'Transmitting' : 'Issue Detected'}
      </div>
      <div className={`status-indicator ${avStatus.participantAudioReceived ? 'success' : 'error'}`}>
        🔊 Participant Audio: {avStatus.participantAudioReceived ? 'Receiving' : 'Not Detected'}
      </div>
    </div>
  );
}; 