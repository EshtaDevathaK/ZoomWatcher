import { useEffect, useRef, useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { ToastAction } from '@/components/ui/toast';

export type AVStatus = 'checking' | 'ok' | 'warning' | 'error';

interface AVIssue {
  type: 'audio' | 'video' | 'connection';
  severity: 'warning' | 'error';
  message: string;
  autoRecoverable: boolean;
}

interface AVIntegrityMonitorProps {
  stream: MediaStream | null;
  remoteStreams: Map<string, MediaStream>;
  isHost: boolean;
  onIssueDetected: (issue: string) => void;
  onStatusChange: (status: AVStatus) => void;
}

export function AVIntegrityMonitor({
  stream,
  remoteStreams,
  isHost,
  onIssueDetected,
  onStatusChange
}: AVIntegrityMonitorProps) {
  const { toast } = useToast();
  const [status, setStatus] = useState<AVStatus>('checking');
  const [issues, setIssues] = useState<AVIssue[]>([]);
  const recoveryAttemptsRef = useRef<Map<string, number>>(new Map());
  const checkIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Update issue creation
  const createIssue = (
    type: AVIssue['type'],
    severity: AVIssue['severity'],
    message: string,
    autoRecoverable: boolean
  ): AVIssue => ({
    type,
    severity,
    message,
    autoRecoverable
  });

  // Check local stream integrity
  const checkLocalStream = () => {
    if (!stream) {
      return [{
        type: 'connection',
        severity: 'error',
        message: 'No local stream available',
        autoRecoverable: true
      }];
    }

    const newIssues: AVIssue[] = [];

    // Check video tracks
    const videoTracks = stream.getVideoTracks();
    if (videoTracks.length === 0) {
      newIssues.push({
        type: 'video',
        severity: 'error',
        message: 'No video track available',
        autoRecoverable: true
      });
    } else {
      const videoTrack = videoTracks[0];
      if (!videoTrack.enabled) {
        newIssues.push({
          type: 'video',
          severity: 'warning',
          message: 'Video track is disabled',
          autoRecoverable: true
        });
      }
      if (videoTrack.muted) {
        newIssues.push({
          type: 'video',
          severity: 'warning',
          message: 'Video track is muted',
          autoRecoverable: true
        });
      }
    }

    // Check audio tracks
    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0) {
      newIssues.push({
        type: 'audio',
        severity: 'error',
        message: 'No audio track available',
        autoRecoverable: true
      });
    } else {
      const audioTrack = audioTracks[0];
      if (!audioTrack.enabled) {
        newIssues.push({
          type: 'audio',
          severity: 'warning',
          message: 'Audio track is disabled',
          autoRecoverable: true
        });
      }
      if (audioTrack.muted) {
        newIssues.push({
          type: 'audio',
          severity: 'warning',
          message: 'Audio track is muted',
          autoRecoverable: true
        });
      }
    }

    return newIssues;
  };

  // Check remote streams integrity
  const checkRemoteStreams = () => {
    const newIssues: AVIssue[] = [];

    if (remoteStreams.size === 0 && isHost) {
      newIssues.push({
        type: 'connection',
        severity: 'warning',
        message: 'No participants connected',
        autoRecoverable: false
      });
      return newIssues;
    }

    remoteStreams.forEach((remoteStream, participantId) => {
      // Check video tracks
      const videoTracks = remoteStream.getVideoTracks();
      if (videoTracks.length === 0) {
        newIssues.push({
          type: 'video',
          severity: 'warning',
          message: `Participant ${participantId} has no video`,
          autoRecoverable: false
        });
      }

      // Check audio tracks
      const audioTracks = remoteStream.getAudioTracks();
      if (audioTracks.length === 0) {
        newIssues.push({
          type: 'audio',
          severity: 'warning',
          message: `Participant ${participantId} has no audio`,
          autoRecoverable: false
        });
      }
    });

    return newIssues;
  };

  // Auto-recovery attempts for issues
  const attemptRecovery = async (issue: AVIssue) => {
    const issueKey = `${issue.type}-${issue.message}`;
    const attempts = recoveryAttemptsRef.current.get(issueKey) || 0;

    if (attempts >= 3) {
      onIssueDetected(`Critical: Manual check needed - ${issue.message}`);
      return false;
    }

    recoveryAttemptsRef.current.set(issueKey, attempts + 1);

    try {
      switch (issue.type) {
        case 'video':
          if (stream) {
            const videoTrack = stream.getVideoTracks()[0];
            if (videoTrack) {
              videoTrack.enabled = true;
              await navigator.mediaDevices.getUserMedia({ video: true });
              return true;
            }
          }
          break;

        case 'audio':
          if (stream) {
            const audioTrack = stream.getAudioTracks()[0];
            if (audioTrack) {
              audioTrack.enabled = true;
              await navigator.mediaDevices.getUserMedia({ audio: true });
              return true;
            }
          }
          break;

        case 'connection':
          // Trigger reconnection logic
          onIssueDetected('Attempting to reconnect...');
          // The actual reconnection should be handled by the parent component
          break;
      }
    } catch (error) {
      console.error('Recovery attempt failed:', error);
    }

    return false;
  };

  // Main integrity check loop
  useEffect(() => {
    const checkIntegrity = async () => {
      const localIssues = checkLocalStream();
      const remoteIssues = checkRemoteStreams();
      const allIssues = [...localIssues, ...remoteIssues];

      // Update status based on issues
      let newStatus: AVStatus = 'ok';
      if (allIssues.some(issue => issue.severity === 'error')) {
        newStatus = 'error';
      } else if (allIssues.some(issue => issue.severity === 'warning')) {
        newStatus = 'warning';
      }

      // Attempt recovery for auto-recoverable issues
      for (const issue of allIssues) {
        if (issue.autoRecoverable) {
          const recovered = await attemptRecovery(issue);
          if (recovered) {
            onIssueDetected(`Recovered from: ${issue.message}`);
            continue;
          }
        }
        onIssueDetected(issue.message);
      }

      setIssues(allIssues);
      setStatus(newStatus);
      onStatusChange(newStatus);

      // Show toast for critical issues
      const criticalIssues = allIssues.filter(issue => issue.severity === 'error');
      if (criticalIssues.length > 0) {
        toast({
          title: "Connection Issues Detected",
          description: criticalIssues[0].message,
          variant: "destructive",
          action: (
            <ToastAction altText="Retry">Retry</ToastAction>
          ),
        });
      }
    };

    // Start periodic checks
    checkIntervalRef.current = setInterval(checkIntegrity, 5000);

    // Initial check
    checkIntegrity();

    return () => {
      if (checkIntervalRef.current) {
        clearInterval(checkIntervalRef.current);
      }
    };
  }, [stream, remoteStreams, isHost, onIssueDetected, onStatusChange]);

  // Use the issues and status in the component
  useEffect(() => {
    if (issues.length > 0) {
      const criticalIssues = issues.filter(issue => issue.severity === 'error');
      if (criticalIssues.length > 0) {
        onStatusChange('error');
      }
    }
  }, [issues, onStatusChange]);

  // This component doesn't render anything visible
  return null;
} 