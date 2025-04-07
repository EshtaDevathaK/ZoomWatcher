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
  const [permissionsGranted, setPermissionsGranted] = useState(false);
  const [checkingPermissions, setCheckingPermissions] = useState(true);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [isMiniView, setIsMiniView] = useState(false);
  const [showParticipantsList, setShowParticipantsList] = useState(false);
  const [remoteStreams, setRemoteStreams] = useState<Map<number, MediaStream>>(new Map());
  const [webrtcParticipants, setWebrtcParticipants] = useState<Array<{
    userId: number, 
    displayName: string, 
    stream?: MediaStream,
    mediaState?: {
      audio: boolean,
      video: boolean
    }
  }>>([]);
  
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteVideoRefs = useRef<Map<number, HTMLVideoElement | null>>(new Map());

  // Check for media permissions on load
  useEffect(() => {
    const checkPermissions = async () => {
      try {
        setCheckingPermissions(true);
        const result = await requestPermissions();
        setPermissionsGranted(result);
        
        if (result) {
          // Initialize camera and microphone
          const stream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: true
          });
          
          localStreamRef.current = stream;
          
          if (localVideoRef.current) {
            localVideoRef.current.srcObject = stream;
            // Ensure the video plays
            try {
              await localVideoRef.current.play();
              console.log("Video is now playing");
            } catch (playError) {
              console.error("Error playing video:", playError);
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
    if (localStreamRef.current) {
      const audioTracks = localStreamRef.current.getAudioTracks();
      audioTracks.forEach(track => {
        track.enabled = !micEnabled;
      });
      setMicEnabled(!micEnabled);
    }
  };

  // Toggle camera
  const toggleCamera = () => {
    if (localStreamRef.current) {
      const videoTracks = localStreamRef.current.getVideoTracks();
      videoTracks.forEach(track => {
        track.enabled = !cameraEnabled;
      });
      setCameraEnabled(!cameraEnabled);
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
      videoElement.srcObject = stream;
      videoElement.play().catch(error => {
        console.error(`Error playing remote video for user ${userId}:`, error);
      });
    }
  }, []);
  
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
  }, []);
  
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
              <h3 className="text-white font-semibold flex items-center">
                <Users className="w-4 h-4 mr-2" />
                Participants ({participantCount})
              </h3>
            </div>
            
            <div className="flex-1 overflow-y-auto">
              {isLoadingParticipants ? (
                <div className="flex justify-center p-4">
                  <Loader2 className="h-6 w-6 animate-spin text-white" />
                </div>
              ) : (
                <div>
                  {/* Host Section */}
                  <div className="px-4 py-2 border-b border-gray-700">
                    <h4 className="text-gray-400 text-xs uppercase tracking-wide mb-2">Host</h4>
                    <div className="flex items-center justify-between py-2">
                      <div className="flex items-center">
                        <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white mr-2">
                          {user?.displayName?.charAt(0)}
                        </div>
                        <span className="text-white text-sm">{user?.displayName} (You)</span>
                      </div>
                      <div className="flex space-x-1">
                        <span className="w-5 h-5 bg-gray-700 rounded-full flex items-center justify-center">
                          {micEnabled ? <Mic className="w-3 h-3 text-green-500" /> : <MicOff className="w-3 h-3 text-red-500" />}
                        </span>
                        <span className="w-5 h-5 bg-gray-700 rounded-full flex items-center justify-center">
                          {cameraEnabled ? <Video className="w-3 h-3 text-green-500" /> : <VideoOff className="w-3 h-3 text-red-500" />}
                        </span>
                      </div>
                    </div>
                  </div>
                  
                  {/* Participants Section */}
                  <div className="px-4 py-2">
                    <h4 className="text-gray-400 text-xs uppercase tracking-wide mb-2">Participants</h4>
                    {participants && participants.length > 0 ? (
                      participants
                        .filter((p: any) => p.user && p.user.id !== user?.id)
                        .map((participant: any) => (
                          <div key={participant.id} className="flex items-center justify-between py-2">
                            <div className="flex items-center">
                              <div className="w-8 h-8 bg-gray-600 rounded-full flex items-center justify-center text-white mr-2">
                                {participant.user.displayName.charAt(0)}
                              </div>
                              <span className="text-white text-sm">{participant.user.displayName}</span>
                            </div>
                            <div className="flex space-x-1">
                              <span className="w-5 h-5 bg-gray-700 rounded-full flex items-center justify-center">
                                <Mic className="w-3 h-3 text-green-500" />
                              </span>
                              <span className="w-5 h-5 bg-gray-700 rounded-full flex items-center justify-center">
                                <Video className="w-3 h-3 text-green-500" />
                              </span>
                            </div>
                          </div>
                        ))
                    ) : (
                      <div className="text-gray-400 text-sm py-2">No other participants</div>
                    )}
                  </div>
                </div>
              )}
            </div>
            
            {/* Host Controls */}
            {meeting.hostId === user?.id && (
              <div className="p-4 border-t border-gray-700">
                <h4 className="text-gray-400 text-xs uppercase tracking-wide mb-2">Host Controls</h4>
                <Button
                  variant="destructive"
                  size="sm"
                  className="w-full mb-2"
                  onClick={() => {
                    // Implement mute all functionality
                    toast({
                      title: "Mute All",
                      description: "All participants have been muted",
                    });
                  }}
                >
                  Mute All
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full text-white"
                  onClick={endMeeting}
                >
                  End Meeting
                </Button>
              </div>
            )}
          </div>
        )}
        {/* Meeting Header */}
        <div className="bg-gray-800 p-4">
          <div className="container mx-auto flex flex-col md:flex-row md:justify-between md:items-center">
            <div className="flex items-center mb-3 md:mb-0">
              <h1 className="text-white text-xl font-bold">Meeting: {meeting.name}</h1>
              <span className="ml-4 px-2 py-1 bg-green-500 text-white rounded-full text-xs">Live</span>
              
              {/* Participant Count */}
              <div className="ml-4 flex items-center bg-gray-700 rounded-md px-2 py-1">
                <Users className="text-white w-4 h-4 mr-1" />
                <span className="text-white text-xs">{participantCount} participants</span>
              </div>
            </div>
            
            {/* Meeting Code Display */}
            <div className="flex items-center mb-3 md:mb-0 bg-gray-700 rounded-md p-2">
              <div className="flex items-center mr-2">
                <span className="text-white text-sm mr-2">Meeting Code:</span>
                <span className="text-white font-bold">{meeting.meetingCode}</span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="text-white hover:text-gray-300 p-1 h-auto"
                onClick={() => {
                  navigator.clipboard.writeText(meeting.meetingCode);
                  toast({
                    title: "Code copied",
                    description: "Meeting code has been copied to clipboard.",
                  });
                }}
              >
                <Copy className="w-4 h-4" />
              </Button>
            </div>
            
            <div className="flex items-center space-x-4">
              <Button
                variant="ghost"
                size="sm"
                className="text-white hover:text-gray-300"
                onClick={copyMeetingInfo}
                title="Copy meeting info"
              >
                <Copy className="w-5 h-5" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-white hover:text-gray-300"
                onClick={inviteParticipants}
                title="Invite participants"
              >
                <UserPlus className="w-5 h-5" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className={`text-white hover:text-gray-300 ${showParticipantsList ? 'bg-gray-700' : ''}`}
                onClick={toggleParticipantsList}
                title="Participants list"
              >
                <Users className="w-5 h-5" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-white hover:text-red-500"
                onClick={leaveMeeting}
                disabled={leaveMeetingMutation.isPending}
                title="Leave meeting"
              >
                <LogOut className="w-5 h-5" />
              </Button>
            </div>
          </div>
        </div>
        
        {/* Video Grid */}
        <div className="flex-1 p-4 bg-gray-900 overflow-y-auto">
          <div className="container mx-auto">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* Local Video */}
              <div className={`${isMiniView ? 'fixed bottom-20 right-4 w-64 z-50' : 'bg-gray-800 rounded-lg overflow-hidden aspect-video'} relative`}>
                <video
                  ref={localVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover rounded-lg"
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
                          />
                        ) : (
                          // Show avatar placeholder
                          <div className="w-full h-full flex items-center justify-center">
                            <div className="bg-gray-700 rounded-full h-24 w-24 flex items-center justify-center text-3xl text-white">
                              {participant.user.displayName.charAt(0)}
                            </div>
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
