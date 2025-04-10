import React, { useEffect, useState } from 'react';
import { toast } from 'react-hot-toast';

interface AVStatus {
  localVideoWorking: boolean;
  remoteVideoVisible: boolean;
  localAudioWorking: boolean;
  remoteAudioWorking: boolean;
}

interface Props {
  localStream: MediaStream | null;
  remoteStreams: { [key: string]: MediaStream };
  onAVIssueDetected: (issue: string) => void;
}

export const AVStatusMonitor: React.FC<Props> = ({
  localStream,
  remoteStreams,
  onAVIssueDetected
}) => {
  const [avStatus, setAVStatus] = useState<AVStatus>({
    localVideoWorking: false,
    remoteVideoVisible: false,
    localAudioWorking: false,
    remoteAudioWorking: false
  });

  // Check local video stream
  const checkLocalVideo = async () => {
    if (!localStream) {
      onAVIssueDetected('Local video stream not available');
      return false;
    }
    const videoTracks = localStream.getVideoTracks();
    const isVideoEnabled = videoTracks.length > 0 && videoTracks[0].enabled;
    if (!isVideoEnabled) {
      onAVIssueDetected('Your camera appears to be disabled');
    }
    return isVideoEnabled;
  };

  // Check local audio stream
  const checkLocalAudio = async () => {
    if (!localStream) {
      onAVIssueDetected('Local audio stream not available');
      return false;
    }
    const audioTracks = localStream.getAudioTracks();
    const isAudioEnabled = audioTracks.length > 0 && audioTracks[0].enabled;
    if (!isAudioEnabled) {
      onAVIssueDetected('Your microphone appears to be muted');
    }
    return isAudioEnabled;
  };

  // Monitor audio levels
  const startAudioMonitoring = () => {
    if (!localStream) return;

    const audioContext = new AudioContext();
    const source = audioContext.createMediaStreamSource(localStream);
    const analyzer = audioContext.createAnalyser();
    source.connect(analyzer);

    const dataArray = new Uint8Array(analyzer.frequencyBinCount);
    
    const checkAudioLevel = () => {
      analyzer.getByteFrequencyData(dataArray);
      const audioLevel = dataArray.reduce((acc, val) => acc + val, 0) / dataArray.length;
      
      if (audioLevel < 10) { // Threshold for silence
        console.log('Low audio level detected');
      }
    };

    const intervalId = setInterval(checkAudioLevel, 1000);
    return () => clearInterval(intervalId);
  };

  // Check remote streams
  const checkRemoteStreams = () => {
    const hasRemoteVideo = Object.values(remoteStreams).some(
      stream => stream.getVideoTracks().length > 0
    );
    const hasRemoteAudio = Object.values(remoteStreams).some(
      stream => stream.getAudioTracks().length > 0
    );

    if (!hasRemoteVideo) {
      onAVIssueDetected('Cannot see other participants');
    }
    if (!hasRemoteAudio) {
      onAVIssueDetected('Cannot hear other participants');
    }

    return { hasRemoteVideo, hasRemoteAudio };
  };

  useEffect(() => {
    const runAVChecks = async () => {
      const localVideo = await checkLocalVideo();
      const localAudio = await checkLocalAudio();
      const { hasRemoteVideo, hasRemoteAudio } = checkRemoteStreams();

      setAVStatus({
        localVideoWorking: localVideo,
        remoteVideoVisible: hasRemoteVideo,
        localAudioWorking: localAudio,
        remoteAudioWorking: hasRemoteAudio
      });

      // Show overall status
      if (localVideo && localAudio && hasRemoteVideo && hasRemoteAudio) {
        toast.success('AV Connection Status: All systems working');
      }
    };

    const intervalId = setInterval(runAVChecks, 5000); // Check every 5 seconds
    const audioMonitorCleanup = startAudioMonitoring();

    return () => {
      clearInterval(intervalId);
      if (audioMonitorCleanup) audioMonitorCleanup();
    };
  }, [localStream, remoteStreams]);

  return (
    <div className="av-status-monitor">
      <div className={`status-indicator ${avStatus.localVideoWorking ? 'active' : 'inactive'}`}>
        🎥 Camera: {avStatus.localVideoWorking ? 'Working' : 'Issue Detected'}
      </div>
      <div className={`status-indicator ${avStatus.localAudioWorking ? 'active' : 'inactive'}`}>
        🎤 Microphone: {avStatus.localAudioWorking ? 'Working' : 'Issue Detected'}
      </div>
      <div className={`status-indicator ${avStatus.remoteVideoVisible ? 'active' : 'inactive'}`}>
        👥 Remote Video: {avStatus.remoteVideoVisible ? 'Connected' : 'Not Visible'}
      </div>
      <div className={`status-indicator ${avStatus.remoteAudioWorking ? 'active' : 'inactive'}`}>
        🔊 Remote Audio: {avStatus.remoteAudioWorking ? 'Connected' : 'Not Audible'}
      </div>
    </div>
  );
}; 