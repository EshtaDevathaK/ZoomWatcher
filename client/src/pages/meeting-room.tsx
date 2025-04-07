import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useWebRTC } from "@/hooks/use-webrtc";
import { Button } from "@/components/ui/button";
import { 
  Loader2, Mic, MicOff, Video, VideoOff, ScreenShare, X, Copy, 
  UserPlus, LogOut, Maximize, Minimize, Users 
} from "lucide-react";
import { MicMonitor } from "@/components/media/mic-monitor";
import { FaceDetector } from "@/components/media/face-detector";
import { requestPermissions, requestScreenCapture } from "@/lib/media-permissions";

export default function MeetingRoom() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const params = useParams<{ id: string }>();
  const meetingId = parseInt(params.id);
  
  const [micEnabled, setMicEnabled] = useState(true);
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [screenShareEnabled, setScreenShareEnabled] = useState(false);
  const [checkingPermissions, setCheckingPermissions] = useState(true);
  const [permissionsGranted, setPermissionsGranted] = useState(false);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [isMiniView, setIsMiniView] = useState(false);
  const [showParticipantsList, setShowParticipantsList] = useState(false);
  
  // WebRTC state
  const [webrtcParticipants, setWebrtcParticipants] = useState<any[]>([]);
  const [remoteStreams, setRemoteStreams] = useState<Map<number, MediaStream>>(new Map());
  
  // References
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteVideoRefs = useRef<Map<number, HTMLVideoElement>>(new Map());
  
  // Check camera and microphone permissions
  useEffect(() => {
    const checkPermissions = async () => {
      try {
        setCheckingPermissions(true);
        
        // Check permissions
        const result = await requestPermissions();
        setPermissionsGranted(result);
        
        if (result) {
          // Initialize camera and microphone
          // Request camera and microphone access with specific constraints
          const stream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true
            }
          });
          
          // Make sure audio is not accidentally muted
          const audioTracks = stream.getAudioTracks();
          console.log(`Initial audio tracks: ${audioTracks.length}`);
          audioTracks.forEach((track, index) => {
            track.enabled = true;
            console.log(`Setup audio track ${index}: enabled=${track.enabled}, muted=${track.muted}, readyState=${track.readyState}`);
          });
          
          console.log("Media stream obtained:", stream);
          console.log("Video tracks:", stream.getVideoTracks().length);
          console.log("Audio tracks:", stream.getAudioTracks().length);
          
          localStreamRef.current = stream;
          
          if (localVideoRef.current) {
            localVideoRef.current.srcObject = stream;
            
            // Force visibility and ensure stream is attached
            localVideoRef.current.style.display = "block";
            
            // Ensure the video plays
            try {
              await localVideoRef.current.play();
              console.log("Video is now playing");
            } catch (playError) {
              console.error("Error playing video:", playError);
              // Try autoplay with user interaction 
              const playPromise = localVideoRef.current.play();
              if (playPromise) {
                playPromise.catch(() => {
                  // Show a message to the user that they need to interact
                  toast({
                    title: "Video Playback",
                    description: "Please click on the video area to enable your camera feed.",
                  });
                });
              }
            }
          }
          
          // Ensure video tracks are enabled based on state
          stream.getVideoTracks().forEach(track => {
            track.enabled = cameraEnabled;
          });
          
          // Ensure audio tracks are enabled based on state
          stream.getAudioTracks().forEach(track => {
            track.enabled = micEnabled;
          });
        }
      } catch (error) {
        console.error("Error checking permissions:", error);
        setPermissionsGranted(false);
        toast({
          title: "Permission Error",
          description: "Failed to access camera and microphone. Please check your browser settings.",
          variant: "destructive",
        });
      } finally {
        setCheckingPermissions(false);
      }
    };

    checkPermissions();
    
    // Cleanup function
    return () => {
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, [toast, cameraEnabled, micEnabled]);

  // Fetch meeting data
  const { data: meeting, isLoading: isLoadingMeeting } = useQuery({
    queryKey: [`/api/meetings/${meetingId}`],
    enabled: !isNaN(meetingId),
    refetchInterval: 10000, // Poll every 10 seconds to check if meeting is still active
  });

  // Fetch participants
  const { data: participants, isLoading: isLoadingParticipants } = useQuery({
    queryKey: [`/api/meetings/${meetingId}/participants`],
    enabled: !isNaN(meetingId) && !!meeting,
    refetchInterval: 5000, // Poll every 5 seconds to update participants
  });

  // Fetch user settings
  const { data: settings } = useQuery({
    queryKey: ["/api/settings"],
    enabled: !!user && permissionsGranted,
  });

  // Leave meeting mutation
  const leaveMeetingMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/meetings/${meetingId}/leave`, {});
      return res.json();
    },
    onSuccess: () => {
      navigate("/meetings");
      toast({
        title: "Meeting left",
        description: "You have left the meeting.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to leave meeting",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // End meeting mutation (for host)
  const endMeetingMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/meetings/${meetingId}/end`, {});
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/meetings/${meetingId}`] });
      navigate("/meetings");
      toast({
        title: "Meeting ended",
        description: "The meeting has been ended successfully.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to end meeting",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Toggle microphone
  const toggleMicrophone = () => {
    console.log("Toggling microphone...");
    if (localStreamRef.current) {
      const audioTracks = localStreamRef.current.getAudioTracks();
      console.log(`Audio tracks found: ${audioTracks.length}`);
      
      if (audioTracks.length === 0) {
        console.log("No audio tracks found, attempting to get audio again");
        
        // Try to get audio tracks if none exist
        navigator.mediaDevices.getUserMedia({ audio: true })
          .then(audioStream => {
            const newAudioTrack = audioStream.getAudioTracks()[0];
            if (newAudioTrack) {
              console.log("New audio track obtained, adding to stream");
              localStreamRef.current?.addTrack(newAudioTrack);
              newAudioTrack.enabled = !micEnabled;
              setMicEnabled(!micEnabled);
            }
          })
          .catch(err => {
            console.error("Failed to get audio track:", err);
            toast({
              title: "Microphone Error",
              description: "Could not access your microphone. Please check permissions.",
              variant: "destructive"
            });
          });
      } else {
        // Toggle existing audio tracks
        audioTracks.forEach((track, index) => {
          console.log(`Toggling audio track ${index} from ${track.enabled} to ${!micEnabled}`);
          track.enabled = !micEnabled;
        });
        setMicEnabled(!micEnabled);
        
        // Notify other participants about the state change
        if (isConnected && sendMediaStateChange) {
          console.log(`Sending audio state change to peers: ${!micEnabled}`);
          sendMediaStateChange('audio', !micEnabled);
        }
      }
    } else {
      console.error("No local stream available");
      toast({
        title: "Microphone Error",
        description: "Could not find local stream. Try refreshing the page.",
        variant: "destructive"
      });
    }
  };

  // Toggle camera
  const toggleCamera = () => {
    console.log("Toggling camera...");
    if (localStreamRef.current) {
      const videoTracks = localStreamRef.current.getVideoTracks();
      console.log(`Video tracks found: ${videoTracks.length}`);
      
      if (videoTracks.length === 0) {
        console.log("No video tracks found, attempting to get video again");
        
        // Try to get video tracks if none exist
        navigator.mediaDevices.getUserMedia({ video: true })
          .then(videoStream => {
            const newVideoTrack = videoStream.getVideoTracks()[0];
            if (newVideoTrack) {
              console.log("New video track obtained, adding to stream");
              localStreamRef.current?.addTrack(newVideoTrack);
              newVideoTrack.enabled = !cameraEnabled;
              setCameraEnabled(!cameraEnabled);
            }
          })
          .catch(err => {
            console.error("Failed to get video track:", err);
            toast({
              title: "Camera Error",
              description: "Could not access your camera. Please check permissions.",
              variant: "destructive"
            });
          });
      } else {
        // Toggle existing video tracks
        videoTracks.forEach((track, index) => {
          console.log(`Toggling video track ${index} from ${track.enabled} to ${!cameraEnabled}`);
          track.enabled = !cameraEnabled;
        });
        setCameraEnabled(!cameraEnabled);
        
        // Notify other participants about the state change
        if (isConnected && sendMediaStateChange) {
          console.log(`Sending video state change to peers: ${!cameraEnabled}`);
          sendMediaStateChange('video', !cameraEnabled);
        }
      }
    } else {
      console.error("No local stream available");
      toast({
        title: "Camera Error",
        description: "Could not find local stream. Try refreshing the page.",
        variant: "destructive"
      });
    }
  };

  // Toggle screen share
  const toggleScreenShare = async () => {
    try {
      if (screenShareEnabled) {
        // Stop screen sharing
        if (localStreamRef.current) {
          const videoTracks = localStreamRef.current.getVideoTracks();
          videoTracks.forEach(track => track.stop());
          
          // Get user video again
          const stream = await navigator.mediaDevices.getUserMedia({ video: true });
          const videoTrack = stream.getVideoTracks()[0];
          
          if (localStreamRef.current) {
            const audioTracks = localStreamRef.current.getAudioTracks();
            localStreamRef.current.removeTrack(localStreamRef.current.getVideoTracks()[0]);
            localStreamRef.current.addTrack(videoTrack);
            
            if (localVideoRef.current) {
              localVideoRef.current.srcObject = localStreamRef.current;
            }
          }
        }
      } else {
        // Start screen sharing
        const displayStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        const screenTrack = displayStream.getVideoTracks()[0];
        
        if (localStreamRef.current) {
          const audioTracks = localStreamRef.current.getAudioTracks();
          localStreamRef.current.removeTrack(localStreamRef.current.getVideoTracks()[0]);
          localStreamRef.current.addTrack(screenTrack);
          
          if (localVideoRef.current) {
            localVideoRef.current.srcObject = localStreamRef.current;
          }
          
          // Listen for the end of screen sharing
          screenTrack.onended = async () => {
            setScreenShareEnabled(false);
            
            // Get user video again
            const stream = await navigator.mediaDevices.getUserMedia({ video: true });
            const videoTrack = stream.getVideoTracks()[0];
            
            if (localStreamRef.current) {
              localStreamRef.current.removeTrack(screenTrack);
              localStreamRef.current.addTrack(videoTrack);
              
              if (localVideoRef.current) {
                localVideoRef.current.srcObject = localStreamRef.current;
              }
            }
          };
        }
      }
      
      setScreenShareEnabled(!screenShareEnabled);
    } catch (error) {
      console.error("Error sharing screen:", error);
      toast({
        title: "Screen Sharing Error",
        description: "Failed to share your screen. Please try again.",
        variant: "destructive",
      });
    }
  };

  // Copy meeting info to clipboard
  const copyMeetingInfo = () => {
    if (meeting) {
      const info = `Meeting: ${meeting.name}\nMeeting Code: ${meeting.meetingCode}\nLink: ${window.location.origin}/join/${meeting.meetingCode}`;
      navigator.clipboard.writeText(info);
      toast({
        title: "Meeting info copied",
        description: "Meeting information has been copied to clipboard.",
      });
    }
  };

  // Invite participants
  const inviteParticipants = () => {
    if (meeting) {
      const subject = encodeURIComponent(`Join my ZoomWatcher meeting: ${meeting.name}`);
      const body = encodeURIComponent(`Join my ZoomWatcher meeting.\n\nMeeting name: ${meeting.name}\nMeeting code: ${meeting.meetingCode}\nLink: ${window.location.origin}/join/${meeting.meetingCode}`);
      window.open(`mailto:?subject=${subject}&body=${body}`);
    }
  };

  // Leave meeting
  const leaveMeeting = () => {
    if (confirm("Are you sure you want to leave this meeting?")) {
      leaveMeetingMutation.mutate();
    }
  };

  // End meeting (for host)
  const endMeeting = () => {
    if (confirm("Are you sure you want to end this meeting for all participants?")) {
      endMeetingMutation.mutate();
    }
  };

  // Toggle fullscreen mode for local video
  const toggleFullScreen = () => {
    if (!localVideoRef.current) return;
    
    if (!isFullScreen) {
      if (localVideoRef.current.requestFullscreen) {
        localVideoRef.current.requestFullscreen();
      } else if ((localVideoRef.current as any).webkitRequestFullscreen) {
        (localVideoRef.current as any).webkitRequestFullscreen();
      } else if ((localVideoRef.current as any).msRequestFullscreen) {
        (localVideoRef.current as any).msRequestFullscreen();
      }
      setIsFullScreen(true);
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      } else if ((document as any).webkitExitFullscreen) {
        (document as any).webkitExitFullscreen();
      } else if ((document as any).msExitFullscreen) {
        (document as any).msExitFullscreen();
      }
      setIsFullScreen(false);
    }
  };

  // Toggle mini view mode
  const toggleMiniView = () => {
    setIsMiniView(!isMiniView);
  };
  
  // Toggle participants list sidebar
  const toggleParticipantsList = () => {
    setShowParticipantsList(!showParticipantsList);
  };
  
  // Get the participant count
  const participantCount = participants ? participants.length : 0;

  // If we can't find the meeting or it's not active, show an error
  useEffect(() => {
    if (!isLoadingMeeting && meeting && !meeting.isActive) {
      toast({
        title: "Meeting Ended",
        description: "This meeting has ended.",
        variant: "destructive",
      });
      navigate("/meetings");
    }
  }, [meeting, isLoadingMeeting, navigate, toast]);
  
  // Handle remote participant streams with WebRTC
  const handleParticipantJoined = useCallback((participant: any) => {
    console.log(`Participant joined: ${participant.displayName} (${participant.userId})`);
    setWebrtcParticipants(prev => [...prev, {
      userId: participant.userId,
      displayName: participant.displayName,
      mediaState: {
        audio: true,
        video: true
      }
    }]);
  }, []);
  
  const handleParticipantLeft = useCallback((userId: number) => {
    console.log(`Participant left: ${userId}`);
    setWebrtcParticipants(prev => prev.filter(p => p.userId !== userId));
    setRemoteStreams(prev => {
      const newStreams = new Map(prev);
      newStreams.delete(userId);
      return newStreams;
    });
  }, []);
  
  const handleParticipantStreamAdded = useCallback((userId: number, stream: MediaStream) => {
    console.log(`Stream added for participant: ${userId}`);
    console.log(`Stream has ${stream.getAudioTracks().length} audio tracks and ${stream.getVideoTracks().length} video tracks`);
    
    // For all audio tracks, ensure they're enabled by default
    stream.getAudioTracks().forEach((track, index) => {
      console.log(`Remote audio track ${index}: enabled=${track.enabled}, muted=${track.muted}, readyState=${track.readyState}`);
      track.enabled = true;
    });
    
    setRemoteStreams(prev => {
      const newStreams = new Map(prev);
      newStreams.set(userId, stream);
      return newStreams;
    });
    
    setWebrtcParticipants(prev => 
      prev.map(p => p.userId === userId ? { ...p, stream } : p)
    );
    
    // Attach stream to video element
    const videoElement = remoteVideoRefs.current.get(userId);
    if (videoElement) {
      console.log(`Attaching stream to video element for participant ${userId}`);
      videoElement.srcObject = stream;
      
      // Force autoplay to ensure audio plays without interaction
      videoElement.muted = false;
      videoElement.autoplay = true;
      
      // Ensure video is visible
      videoElement.style.display = "block";
      
      // Try to play and handle potential autoplay restrictions
      videoElement.play()
        .then(() => console.log(`Successfully playing remote stream for participant ${userId}`))
        .catch(error => {
          console.error(`Error playing remote video for user ${userId}:`, error);
          
          // Show a toast to prompt user interaction
          toast({
            title: "Media Playback",
            description: "Please click on participant videos to hear and see them.",
          });
          
          // Add a click handler to play on user interaction
          videoElement.onclick = () => {
            videoElement.play()
              .then(() => console.log(`Successfully playing remote stream after click for participant ${userId}`))
              .catch(err => console.error(`Still failed to play after click:`, err));
          };
        });
    } else {
      console.warn(`No video element found for participant ${userId}`);
    }
  }, [toast]);
  
  const handleMeetingEnded = useCallback(() => {
    toast({
      title: "Meeting Ended",
      description: "The meeting has been ended by the host.",
    });
    navigate("/meetings");
  }, [navigate, toast]);
  
  // Handle media state changes from remote participants
  const handleMediaStateChanged = useCallback((userId: number, mediaType: 'audio' | 'video', enabled: boolean) => {
    console.log(`Media state changed for participant ${userId}: ${mediaType} ${enabled ? 'enabled' : 'disabled'}`);
    
    // Update participant's media state in our state
    setWebrtcParticipants(prev => 
      prev.map(p => {
        if (p.userId === userId) {
          const mediaState = p.mediaState || { audio: true, video: true };
          return {
            ...p,
            mediaState: {
              ...mediaState,
              [mediaType]: enabled
            }
          };
        }
        return p;
      })
    );
    
    // Also update the actual media tracks if we have a stream for this participant
    const stream = remoteStreams.get(userId);
    if (stream) {
      console.log(`Updating ${mediaType} tracks for participant ${userId} to ${enabled}`);
      
      if (mediaType === 'audio') {
        stream.getAudioTracks().forEach((track, index) => {
          if (track.enabled !== enabled) {
            console.log(`Setting remote audio track ${index} for participant ${userId} from ${track.enabled} to ${enabled}`);
            track.enabled = enabled;
          }
        });
      } else if (mediaType === 'video') {
        stream.getVideoTracks().forEach((track, index) => {
          if (track.enabled !== enabled) {
            console.log(`Setting remote video track ${index} for participant ${userId} from ${track.enabled} to ${enabled}`);
            track.enabled = enabled;
          }
        });
      }
      
      // Update the video element if needed
      const videoElement = remoteVideoRefs.current.get(userId);
      if (videoElement && mediaType === 'audio') {
        // For audio tracks, we can't use the muted property since that mutes local playback
        // Instead, we handle it through the track's enabled state above
        console.log(`Remote video element for participant ${userId} is now ${enabled ? 'unmuted' : 'muted'}`);
      }
    } else {
      console.log(`No stream found for participant ${userId} to update ${mediaType} state`);
    }
  }, [remoteStreams]);
  
  // Initialize WebRTC when meeting is loaded and local stream is ready
  const { isConnected, participants: webrtcConnectedParticipants, sendMediaStateChange } = useWebRTC({
    user: user ? {
      id: user.id,
      username: user.username,
      displayName: user.displayName || user.username
    } : null,
    meetingId,
    localStream: localStreamRef.current,
    onParticipantJoined: handleParticipantJoined,
    onParticipantLeft: handleParticipantLeft,
    onParticipantStreamAdded: handleParticipantStreamAdded,
    onMediaStateChanged: handleMediaStateChanged,
    onMeetingEnded: handleMeetingEnded
  });
  
  // Send media state changes to other participants
  useEffect(() => {
    if (isConnected) {
      sendMediaStateChange('audio', micEnabled);
    }
  }, [micEnabled, isConnected, sendMediaStateChange]);
  
  useEffect(() => {
    if (isConnected) {
      sendMediaStateChange('video', cameraEnabled);
    }
  }, [cameraEnabled, isConnected, sendMediaStateChange]);

  if (isLoadingMeeting) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-900">
        <div className="text-center text-white">
          <Loader2 className="h-10 w-10 animate-spin mx-auto mb-4" />
          <h2 className="text-xl font-semibold">Loading meeting...</h2>
        </div>
      </div>
    );
  }

  if (!meeting) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-900">
        <div className="text-center text-white">
          <h2 className="text-xl font-semibold">Meeting not found</h2>
          <p className="mt-2">The meeting you're looking for does not exist.</p>
          <Button
            className="mt-4"
            onClick={() => navigate("/meetings")}
          >
            Back to Meetings
          </Button>
        </div>
      </div>
    );
  }

  // Permission request component
  if (checkingPermissions) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-900">
        <div className="text-center text-white">
          <Loader2 className="h-10 w-10 animate-spin mx-auto mb-4" />
          <h2 className="text-xl font-semibold">Checking permissions...</h2>
        </div>
      </div>
    );
  }

  if (!permissionsGranted) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-900">
        <div className="bg-white rounded-lg max-w-md mx-4 p-6">
          <div className="text-center mb-4">
            <h3 className="mt-2 text-xl font-medium text-gray-900">Permission Required</h3>
          </div>
          <p className="text-gray-600 mb-6">
            ZoomWatcher needs access to your camera and microphone to join the meeting. 
            Please allow these permissions to continue.
          </p>
          <div className="flex justify-between">
            <Button
              variant="outline"
              onClick={() => navigate("/meetings")}
            >
              Cancel
            </Button>
            <Button
              onClick={async () => {
                const result = await requestPermissions();
                setPermissionsGranted(result);
              }}
            >
              Allow Permissions
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-900 min-h-screen">
      <div className={`flex ${showParticipantsList ? 'flex-row' : 'flex-col'} h-screen`}>
        
        {/* Participants List Sidebar */}
        {showParticipantsList && (
          <div className="w-64 bg-gray-800 overflow-y-auto flex flex-col border-r border-gray-700">
            <div className="p-4 border-b border-gray-700">
              <h3 className="text-white text-lg font-medium">Participants</h3>
              <p className="text-gray-400 text-sm">{participantCount} people</p>
            </div>
            
            <div className="flex-1 overflow-y-auto">
              <div className="p-4">
                {/* Host (if viewing as participant) or You (if host) */}
                <div className="mb-4">
                  <h4 className="text-white text-sm font-medium mb-2">Host</h4>
                  <div className="flex items-center p-2 rounded hover:bg-gray-700">
                    <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white font-medium">
                      {user && meeting.hostId === user.id 
                        ? user.displayName?.charAt(0) || user.username.charAt(0)
                        : participants
                            ?.find((p: any) => p.user && p.user.id === meeting.hostId)
                            ?.user?.displayName?.charAt(0) || 'H'}
                    </div>
                    <span className="ml-2 text-white">
                      {user && meeting.hostId === user.id 
                        ? 'You (Host)'
                        : participants
                            ?.find((p: any) => p.user && p.user.id === meeting.hostId)
                            ?.user?.displayName || 'Host'}
                    </span>
                  </div>
                </div>
                
                {/* Other participants */}
                <div>
                  <h4 className="text-white text-sm font-medium mb-2">Participants</h4>
                  
                  {participants && participants.length > 0 ? (
                    participants
                      .filter((p: any) => p.user && p.user.id !== meeting.hostId)
                      .map((participant: any) => (
                        <div key={participant.id} className="flex items-center p-2 rounded hover:bg-gray-700">
                          <div className="w-8 h-8 bg-gray-600 rounded-full flex items-center justify-center text-white font-medium">
                            {participant.user.displayName.charAt(0)}
                          </div>
                          <span className="ml-2 text-white">
                            {participant.user.id === user?.id 
                              ? `${participant.user.displayName} (You)`
                              : participant.user.displayName}
                          </span>
                        </div>
                      ))
                  ) : (
                      <div className="text-gray-400 text-sm py-2">No other participants</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
        
        <div className="flex-1 flex flex-col">
          {/* Meeting Header */}
          <div className="bg-gray-800 p-4 border-b border-gray-700">
            <div className="container mx-auto flex justify-between items-center">
              <div>
                <h1 className="text-white text-xl font-bold">{meeting.name}</h1>
                <div className="flex items-center text-gray-300 mt-1">
                  <span className="text-sm">Meeting Code: {meeting.meetingCode}</span>
                  <button 
                    className="ml-2 text-gray-400 hover:text-white"
                    onClick={copyMeetingInfo}
                    title="Copy meeting info"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                </div>
              </div>
              
              <div className="flex items-center">
                <button
                  className="flex items-center bg-gray-700 hover:bg-gray-600 text-white px-3 py-2 rounded-lg mr-2"
                  onClick={inviteParticipants}
                  title="Invite participants"
                >
                  <UserPlus className="w-4 h-4 mr-1" />
                  <span className="hidden sm:inline">Invite</span>
                </button>
                
                <button 
                  className="flex items-center bg-gray-700 hover:bg-gray-600 text-white px-3 py-2 rounded-lg mr-2"
                  onClick={toggleParticipantsList}
                  title="Participants"
                >
                  <Users className="w-4 h-4 mr-1" />
                  <span className="hidden sm:inline">Participants</span>
                  <span className="ml-1 bg-gray-600 text-xs px-1.5 py-0.5 rounded-full">{participantCount}</span>
                </button>
                
                <button 
                  className="flex items-center bg-red-700 hover:bg-red-600 text-white px-3 py-2 rounded-lg"
                  onClick={meeting.hostId === user?.id ? endMeeting : leaveMeeting}
                  title={meeting.hostId === user?.id ? "End meeting" : "Leave meeting"}
                >
                  <LogOut className="w-4 h-4 mr-1" />
                  <span className="hidden sm:inline">{meeting.hostId === user?.id ? "End" : "Leave"}</span>
                </button>
              </div>
            </div>
          </div>
          
          {/* Video Grid */}
          <div className="flex-1 p-4 bg-gray-900 overflow-y-auto">
            <div className="container mx-auto">
              <div className="flex flex-col space-y-4">
                <div className="flex items-center space-x-4 mb-2">
                  <button 
                    onClick={() => {
                      const localVideo = document.getElementById('local-video-container');
                      if (localVideo) {
                        // Make local video full width
                        localVideo.style.width = '100%';
                        localVideo.style.maxWidth = '800px';
                        localVideo.style.height = '480px';
                        localVideo.style.margin = '0 auto';
                      }
                    }}
                    className="bg-gray-700 px-3 py-1 rounded text-white text-sm hover:bg-gray-600"
                  >
                    Large View
                  </button>
                  <button 
                    onClick={() => {
                      const localVideo = document.getElementById('local-video-container');
                      if (localVideo) {
                        // Return to normal sizing
                        localVideo.style.width = '';
                        localVideo.style.maxWidth = '';
                        localVideo.style.height = '';
                        localVideo.style.margin = '';
                      }
                    }}
                    className="bg-gray-700 px-3 py-1 rounded text-white text-sm hover:bg-gray-600"
                  >
                    Normal Size
                  </button>
                  <button 
                    onClick={toggleMiniView}
                    className="bg-gray-700 px-3 py-1 rounded text-white text-sm hover:bg-gray-600"
                  >
                    {isMiniView ? "Dock Video" : "Float Video"}
                  </button>
                </div>
                
                <div className="videos-grid grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {/* Local Video */}
                  <div 
                    id="local-video-container"
                    className={`${isMiniView ? 'fixed bottom-20 right-4 w-64 z-50' : 'bg-gray-800 rounded-lg overflow-hidden aspect-video'} relative min-h-[240px]`}>
                    <video
                      ref={localVideoRef}
                      autoPlay
                      playsInline
                      muted
                      className="w-full h-full object-cover rounded-lg"
                      onClick={() => {
                        if (localVideoRef.current) {
                          localVideoRef.current.play().catch(err => console.error("Play error:", err));
                        }
                      }}
                    />
                    
                    {/* Video Controls Overlay */}
                    <div className="absolute top-2 right-2 flex space-x-2">
                      <button 
                        onClick={toggleFullScreen}
                        className="bg-black bg-opacity-50 rounded-full p-1 hover:bg-opacity-70 transition-all"
                        title={isFullScreen ? "Exit fullscreen" : "Fullscreen"}
                      >
                        {isFullScreen ? (
                          <Minimize className="w-4 h-4 text-white" />
                        ) : (
                          <Maximize className="w-4 h-4 text-white" />
                        )}
                      </button>
                      
                      <button 
                        onClick={toggleMiniView}
                        className="bg-black bg-opacity-50 rounded-full p-1 hover:bg-opacity-70 transition-all"
                        title={isMiniView ? "Exit mini view" : "Mini view"}
                      >
                        {isMiniView ? (
                          <Maximize className="w-4 h-4 text-white" />
                        ) : (
                          <Minimize className="w-4 h-4 text-white" />
                        )}
                      </button>
                    </div>
                    
                    {/* User Info Overlay */}
                    <div className="absolute bottom-0 left-0 right-0 bg-black bg-opacity-50 p-2">
                      <div className="flex justify-between items-center">
                        <span className="text-white text-sm">{user?.displayName || "You"}</span>
                        <div className="flex space-x-1">
                          <span className="w-6 h-6 bg-gray-700 rounded-full flex items-center justify-center">
                            {cameraEnabled ? (
                              <Video className="w-4 h-4 text-green-500" />
                            ) : (
                              <VideoOff className="w-4 h-4 text-red-500" />
                            )}
                          </span>
                          <span className="w-6 h-6 bg-gray-700 rounded-full flex items-center justify-center">
                            {micEnabled ? (
                              <Mic className="w-4 h-4 text-green-500" />
                            ) : (
                              <MicOff className="w-4 h-4 text-red-500" />
                            )}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  {/* Other Participants (with WebRTC support) */}
                  {isLoadingParticipants ? (
                    <div className="bg-gray-800 rounded-lg overflow-hidden aspect-video flex items-center justify-center">
                      <Loader2 className="h-8 w-8 animate-spin text-white" />
                    </div>
                  ) : participants && participants.length > 0 ? (
                    participants
                      .filter((p: any) => p.user && p.user.id !== user?.id)
                      .map((participant: any) => {
                        // Find matching WebRTC participant if available
                        const webrtcParticipant = webrtcParticipants.find(wp => wp.userId === participant.user.id);
                        const hasStream = webrtcParticipant?.stream != null;
                        
                        // Set up ref callback for this participant's video
                        const videoRef = (element: HTMLVideoElement | null) => {
                          if (element) {
                            remoteVideoRefs.current.set(participant.user.id, element);
                            // Attach stream if already available
                            if (webrtcParticipant?.stream) {
                              element.srcObject = webrtcParticipant.stream;
                              element.play().catch(err => console.error("Error playing remote video:", err));
                            }
                          }
                        };
                        
                        return (
                          <div key={participant.id} className="bg-gray-800 rounded-lg overflow-hidden aspect-video relative">
                            {hasStream ? (
                              // Show remote video stream
                              <video
                                ref={videoRef}
                                autoPlay
                                playsInline
                                className="w-full h-full object-cover"
                                id={`remote-video-${participant.user.id}`}
                              />
                            ) : (
                              // Show avatar placeholder
                              <div className="w-full h-full flex items-center justify-center">
                                <div className="bg-gray-700 rounded-full h-24 w-24 flex items-center justify-center text-3xl text-white">
                                  {participant.user.displayName.charAt(0)}
                                </div>
                              </div>
                            )}
                            
                            {/* Remote video controls */}
                            {hasStream && (
                              <div className="absolute top-2 right-2 flex space-x-2">
                                <button 
                                  onClick={() => {
                                    const videoElement = document.getElementById(`remote-video-${participant.user.id}`);
                                    if (videoElement && videoElement instanceof HTMLVideoElement) {
                                      if (document.fullscreenElement) {
                                        document.exitFullscreen();
                                      } else {
                                        videoElement.requestFullscreen();
                                      }
                                    }
                                  }}
                                  className="bg-black bg-opacity-50 rounded-full p-1 hover:bg-opacity-70 transition-all"
                                  title="Fullscreen"
                                >
                                  <Maximize className="w-4 h-4 text-white" />
                                </button>
                              </div>
                            )}
                            
                            <div className="absolute bottom-0 left-0 right-0 bg-black bg-opacity-50 p-2">
                              <div className="flex justify-between items-center">
                                <span className="text-white text-sm">{participant.user.displayName}</span>
                                <div className="flex space-x-1">
                                  <span className="w-6 h-6 bg-gray-700 rounded-full flex items-center justify-center">
                                    {webrtcParticipant?.mediaState?.video ? (
                                      <Video className="w-4 h-4 text-green-500" />
                                    ) : (
                                      <VideoOff className="w-4 h-4 text-red-500" />
                                    )}
                                  </span>
                                  <span className="w-6 h-6 bg-gray-700 rounded-full flex items-center justify-center">
                                    {webrtcParticipant?.mediaState?.audio ? (
                                      <Mic className="w-4 h-4 text-green-500" />
                                    ) : (
                                      <MicOff className="w-4 h-4 text-red-500" />
                                    )}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })
                  ) : (
                    <div className="bg-gray-800 rounded-lg overflow-hidden aspect-video flex items-center justify-center text-white">
                      <p>No other participants yet</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
          
          {/* Meeting Controls */}
          <div className="bg-gray-800 p-4">
            <div className="container mx-auto flex justify-center">
              <div className="flex space-x-4">
                <Button
                  variant={micEnabled ? "default" : "destructive"}
                  size="icon"
                  className="rounded-full w-12 h-12"
                  onClick={toggleMicrophone}
                >
                  {micEnabled ? <Mic className="w-6 h-6" /> : <MicOff className="w-6 h-6" />}
                </Button>
                
                <Button
                  variant={cameraEnabled ? "default" : "destructive"}
                  size="icon"
                  className="rounded-full w-12 h-12"
                  onClick={toggleCamera}
                >
                  {cameraEnabled ? <Video className="w-6 h-6" /> : <VideoOff className="w-6 h-6" />}
                </Button>
                
                <Button
                  variant={screenShareEnabled ? "destructive" : "default"}
                  size="icon"
                  className="rounded-full w-12 h-12"
                  onClick={toggleScreenShare}
                >
                  <ScreenShare className="w-6 h-6" />
                </Button>
                
                <Button
                  variant="destructive"
                  size="icon"
                  className="rounded-full w-12 h-12"
                  onClick={meeting.hostId === user?.id ? endMeeting : leaveMeeting}
                  disabled={leaveMeetingMutation.isPending || endMeetingMutation.isPending}
                >
                  {(leaveMeetingMutation.isPending || endMeetingMutation.isPending) ? (
                    <Loader2 className="w-6 h-6 animate-spin" />
                  ) : (
                    <X className="w-6 h-6" />
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      {/* AI Monitoring Components */}
      {settings && micEnabled && !settings.alwaysOnModeEnabled && settings.autoMuteEnabled && (
        <MicMonitor 
          inactivityThreshold={120000} // 2 minutes
          muted={false}
          enabled={true}
          alertsEnabled={settings.autoMuteAlertsEnabled && !settings.allNotificationsDisabled}
          vibrationEnabled={settings.vibrationFeedbackEnabled && !settings.allNotificationsDisabled}
          onAutoMute={toggleMicrophone}
        />
      )}
      
      {settings && cameraEnabled && !settings.alwaysOnModeEnabled && settings.autoVideoOffEnabled && (
        <FaceDetector 
          inactivityThreshold={15000} // 15 seconds
          cameraOff={false}
          enabled={true}
          alertsEnabled={settings.autoVideoAlertsEnabled && !settings.allNotificationsDisabled}
          vibrationEnabled={settings.vibrationFeedbackEnabled && !settings.allNotificationsDisabled}
          onAutoVideoOff={toggleCamera}
        />
      )}
    </div>
  );
}