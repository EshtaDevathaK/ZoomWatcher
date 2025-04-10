import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Meeting, Participant, UserSettings } from "@shared/schema";
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
import { AudioContainer } from "@/components/media/audio-container";
import { requestPermissions, requestScreenCapture } from "@/lib/media-permissions";
import { AVStatusMonitor } from '../components/AVStatusMonitor';
import '../styles/av-status.css';
import { AVIntegrityMonitor } from '../components/AVIntegrityMonitor';
import '../styles/av-integrity.css';
import { AVStatus } from '../components/AVIntegrityMonitor';

// Initialize audio context to ensure audio works consistently across browsers
function initializeAudioContext() {
  try {
    // Create a new audio context
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    const audioCtx = new AudioContext();
    
    // If the context is suspended (happens in some browsers), resume it
    if (audioCtx.state === 'suspended') {
      console.log('Audio context is suspended, attempting to resume...');
      audioCtx.resume().then(() => {
        console.log('Audio context resumed successfully');
      }).catch(err => {
        console.error('Error resuming audio context:', err);
      });
    }
    
    // Create a temporary oscillator node to activate audio
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    
    // Set gain to 0 (silent) and connect nodes
    gainNode.gain.value = 0;
    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    
    // Start and stop quickly to "warm up" the audio system
    oscillator.start(0);
    setTimeout(() => oscillator.stop(), 100);
    
    console.log('Audio context initialized successfully');
    return audioCtx;
  } catch (err) {
    console.error('Error initializing audio context:', err);
    return null;
  }
}

interface WebRTCParticipant {
  stream: MediaStream;
  userId: string;
}

interface Participant {
  userId: string;
  username: string;
  displayName: string;
  stream?: MediaStream;
  mediaState?: {
    audio: boolean;
    video: boolean;
  };
}

interface User {
  id: string;
  username: string;
  displayName: string;
  token: string;
}

export default function MeetingRoom() {
  // Initialize audio context on component mount to ensure audio works
  useEffect(() => {
    // We need to initialize audio on user interaction due to browser restrictions
    const handleUserInteraction = () => {
      initializeAudioContext();
      // Clean up event listener after initialization
      document.removeEventListener('click', handleUserInteraction);
    };
    
    // Add the event listener
    document.addEventListener('click', handleUserInteraction);
    
    return () => {
      document.removeEventListener('click', handleUserInteraction);
    };
  }, []);
  const { user } = useAuth() as { user: User | null };
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
  const [participants, setParticipants] = useState<Record<string, Participant>>({});
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  
  // References
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const videoInitializationAttempted = useRef<boolean>(false);
  
  // Check camera and microphone permissions
  useEffect(() => {
    const checkPermissions = async () => {
      try {
        setCheckingPermissions(true);
        
        // Check permissions
        const result = await requestPermissions();
        setPermissionsGranted(result);
        
        if (result) {
          // Initialize camera and microphone with explicit constraints 
          console.log("Getting user media with explicit constraints");
          let mediaStream: MediaStream;
          
          try {
            // First try with ideal quality settings
            const highQualityStream = await navigator.mediaDevices.getUserMedia({
              video: {
                width: { ideal: 1280 },
                height: { ideal: 720 },
                facingMode: "user" // Use front camera specifically
              },
              audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
              }
            });
            
            console.log("Successfully got user media with high quality settings");
            
            // Check if video tracks were obtained
            const videoTracks = highQualityStream.getVideoTracks();
            if (videoTracks.length === 0) {
              console.error("No video tracks obtained even though permission was granted");
              throw new Error("No video tracks obtained");
            }
            
            console.log(`Video tracks obtained: ${videoTracks.length}`);
            console.log(`Video track 0 settings:`, videoTracks[0].getSettings());
            
            // Make sure audio tracks are properly enabled
            const audioTracks = highQualityStream.getAudioTracks();
            console.log(`Initial audio tracks: ${audioTracks.length}`);
            audioTracks.forEach((track, index) => {
              track.enabled = true;
              console.log(`Setup audio track ${index}: enabled=${track.enabled}, muted=${track.muted}, readyState=${track.readyState}`);
            });
            
            mediaStream = highQualityStream;
          } catch (highQualityError) {
            console.warn("Could not get high-quality stream, trying with basic settings", highQualityError);
            
            // If high quality fails, try with minimal constraints
            try {
              const basicStream = await navigator.mediaDevices.getUserMedia({
                video: true,
                audio: true
              });
              
              console.log("Successfully got user media with basic settings");
              
              // Check and log the video tracks
              const videoTracks = basicStream.getVideoTracks();
              console.log(`Basic video tracks obtained: ${videoTracks.length}`);
              if (videoTracks.length > 0) {
                console.log(`Basic video track 0 settings:`, videoTracks[0].getSettings());
              }
              
              // Make sure audio tracks are properly enabled
              const audioTracks = basicStream.getAudioTracks();
              console.log(`Basic audio tracks: ${audioTracks.length}`);
              audioTracks.forEach((track, index) => {
                track.enabled = true;
                console.log(`Setup basic audio track ${index}: enabled=${track.enabled}, readyState=${track.readyState}`);
              });
              
              mediaStream = basicStream;
            } catch (basicError) {
              console.error("Failed to get even basic media stream", basicError);
              throw basicError;
            }
          }
          
          console.log("Media stream obtained:", mediaStream);
          console.log("Video tracks:", mediaStream.getVideoTracks().length);
          console.log("Audio tracks:", mediaStream.getAudioTracks().length);
          
          setLocalStream(mediaStream);
          
          if (localVideoRef.current) {
            console.log("Setting video element source to media stream");
            
            // Force visibility for video element
            localVideoRef.current.style.display = "block";
            
            // Explicitly set important video properties
            localVideoRef.current.autoplay = true;
            localVideoRef.current.playsInline = true;
            localVideoRef.current.muted = true;
            
            // Clear and reset any existing srcObject
            if (localVideoRef.current.srcObject) {
              localVideoRef.current.srcObject = null;
            }
            
            // Apply the stream to the video element
            localVideoRef.current.srcObject = mediaStream;
            
            // CRITICAL: Make sure video is actually shown by setting z-index and other properties 
            localVideoRef.current.style.zIndex = "5";
            localVideoRef.current.style.objectFit = "cover";
            localVideoRef.current.style.backgroundColor = "#000";
            
            console.log("Video properties set:", {
              display: localVideoRef.current.style.display,
              autoplay: localVideoRef.current.autoplay,
              srcObject: !!localVideoRef.current.srcObject,
              videoTracks: mediaStream.getVideoTracks().length
            });
            
            // Add a small delay before trying to play (helps in some browser environments)
            setTimeout(async () => {
              try {
                if (localVideoRef.current) {
                  await localVideoRef.current.play();
                  console.log("Video is now playing after timeout");
                }
              } catch (delayedPlayError) {
                console.error("Error playing video after timeout:", delayedPlayError);
              }
            }, 100);
            
            // Immediate attempt to play
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
                    title: "Camera Access",
                    description: "Please click on the video area to enable your camera feed.",
                  });
                  
                  // Add a visible indicator that user needs to click
                  const container = document.getElementById('local-video-container');
                  if (container) {
                    const clickPrompt = document.createElement('div');
                    clickPrompt.innerText = "Click to enable camera";
                    clickPrompt.style.position = "absolute";
                    clickPrompt.style.top = "50%";
                    clickPrompt.style.left = "50%";
                    clickPrompt.style.transform = "translate(-50%, -50%)";
                    clickPrompt.style.color = "white";
                    clickPrompt.style.backgroundColor = "rgba(0,0,0,0.7)";
                    clickPrompt.style.padding = "8px 12px";
                    clickPrompt.style.borderRadius = "4px";
                    clickPrompt.style.zIndex = "10";
                    container.appendChild(clickPrompt);
                    
                    // Remove the prompt after click
                    container.onclick = () => {
                      if (clickPrompt.parentNode) {
                        clickPrompt.parentNode.removeChild(clickPrompt);
                      }
                    };
                  }
                });
              }
            }
          } else {
            console.error("No local video element found!");
          }
          
          // Ensure video tracks are enabled based on state
          mediaStream.getVideoTracks().forEach((track: MediaStreamTrack) => {
            console.log(`Setting video track enabled to ${cameraEnabled}`);
            track.enabled = cameraEnabled;
          });
          
          // Ensure audio tracks are enabled based on state
          mediaStream.getAudioTracks().forEach((track: MediaStreamTrack) => {
            console.log(`Setting audio track enabled to ${micEnabled}`);
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
      if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
      }
    };
  }, [toast, cameraEnabled, micEnabled]);

  // Extra video initialization to ensure video element is properly configured
  useEffect(() => {
    if (localVideoRef.current && localStream && !videoInitializationAttempted.current) {
      videoInitializationAttempted.current = true;
      console.log("Running additional video initialization for local video element");
      
      // Force direct styling for better compatibility
      const videoElement = localVideoRef.current;
      videoElement.style.display = "block";
      videoElement.style.visibility = "visible";
      videoElement.style.width = "100%";
      videoElement.style.height = "100%";
      videoElement.style.objectFit = "cover";
      videoElement.style.borderRadius = "8px";
      videoElement.style.backgroundColor = "#000000";
      videoElement.style.zIndex = "5";
      
      // Reset source object with a delay
      videoElement.srcObject = null;
      setTimeout(() => {
        if (videoElement && localStream) {
          videoElement.srcObject = localStream;
          videoElement.play()
            .then(() => console.log("Video playing after additional initialization"))
            .catch(err => {
              console.error("Failed to play after additional initialization:", err);
              // Try one more time with additional user interaction prompt
              toast({
                title: "Camera Feed",
                description: "Please click on your video area to enable camera feed",
              });
            });
        }
      }, 500);
    }
  }, [localVideoRef.current, localStream, toast]);

  // Fetch meeting data
  const { data: meeting, isLoading: isLoadingMeeting } = useQuery<Meeting>({
    queryKey: [`/api/meetings/${meetingId}`],
    enabled: !isNaN(meetingId),
    refetchInterval: 10000, // Poll every 10 seconds to check if meeting is still active
  });

  // Fetch participants
  const { data: participantsData, isLoading: isLoadingParticipants } = useQuery<Participant[]>({
    queryKey: [`/api/meetings/${meetingId}/participants`],
    enabled: !isNaN(meetingId) && !!meeting,
    refetchInterval: 5000, // Poll every 5 seconds to update participants
  });

  // Fetch user settings
  const { data: settings } = useQuery<UserSettings>({
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
    if (localStream) {
      const audioTracks = localStream.getAudioTracks();
      console.log(`Audio tracks found: ${audioTracks.length}`);
      
      if (audioTracks.length === 0) {
        console.log("No audio tracks found, attempting to get audio again");
        
        // Try to get audio tracks if none exist
        navigator.mediaDevices.getUserMedia({ audio: true })
          .then(audioStream => {
            const newAudioTrack = audioStream.getAudioTracks()[0];
            if (newAudioTrack) {
              console.log("New audio track obtained, adding to stream");
              localStream.addTrack(newAudioTrack);
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
        // Toggle ONLY audio tracks - Don't touch video
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
    if (localStream) {
      const videoTracks = localStream.getVideoTracks();
      console.log(`Video tracks found: ${videoTracks.length}`);
      
      if (videoTracks.length === 0) {
        console.log("No video tracks found, attempting to get video again");
        
        // Try to get video tracks if none exist
        navigator.mediaDevices.getUserMedia({ video: true })
          .then(videoStream => {
            const newVideoTrack = videoStream.getVideoTracks()[0];
            if (newVideoTrack) {
              console.log("New video track obtained, adding to stream");
              localStream.addTrack(newVideoTrack);
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
        // Toggle ONLY video tracks - Don't touch audio
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
        if (localStream) {
          const videoTracks = localStream.getVideoTracks();
          videoTracks.forEach(track => track.stop());
          
          // Get user video again
          const stream = await navigator.mediaDevices.getUserMedia({ video: true });
          const videoTrack = stream.getVideoTracks()[0];
          
          if (localStream) {
            localStream.removeTrack(localStream.getVideoTracks()[0]);
            localStream.addTrack(videoTrack);
            
            if (localVideoRef.current) {
              localVideoRef.current.srcObject = localStream;
            }
          }
        }
      } else {
        // Start screen sharing
        const displayStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        const screenTrack = displayStream.getVideoTracks()[0];
        
        if (localStream) {
          localStream.removeTrack(localStream.getVideoTracks()[0]);
          localStream.addTrack(screenTrack);
          
          if (localVideoRef.current) {
            localVideoRef.current.srcObject = localStream;
          }
          
          // Listen for the end of screen sharing
          screenTrack.onended = async () => {
            setScreenShareEnabled(false);
            
            // Get user video again
            const stream = await navigator.mediaDevices.getUserMedia({ video: true });
            const videoTrack = stream.getVideoTracks()[0];
            
            if (localStream) {
              localStream.removeTrack(screenTrack);
              localStream.addTrack(videoTrack);
              
              if (localVideoRef.current) {
                localVideoRef.current.srcObject = localStream;
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
      const meetingData = meeting as Meeting;
      const info = `Meeting: ${meetingData.name}\nMeeting Code: ${meetingData.meetingCode}\nLink: ${window.location.origin}/join/${meetingData.meetingCode}`;
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
      const meetingData = meeting as Meeting;
      const subject = encodeURIComponent(`Join my ZoomWatcher meeting: ${meetingData.name}`);
      const body = encodeURIComponent(`Join my ZoomWatcher meeting.\n\nMeeting name: ${meetingData.name}\nMeeting code: ${meetingData.meetingCode}\nLink: ${window.location.origin}/join/${meetingData.meetingCode}`);
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
  const participantCount = participantsData ? participantsData.length : 0;

  // If we can't find the meeting or it's not active, show an error
  useEffect(() => {
    if (!isLoadingMeeting && meeting) {
      const meetingData = meeting as Meeting;
      if (!meetingData.isActive) {
        toast({
          title: "Meeting Ended",
          description: "This meeting has ended.",
          variant: "destructive",
        });
        navigate("/meetings");
      }
    }
  }, [meeting, isLoadingMeeting, navigate, toast]);
  
  // Effect to ensure remote videos play properly when streams are added
  useEffect(() => {
    // Loop through all participants with streams and make sure they play
    Object.values(participants).forEach(participant => {
      if (participant.stream) {
        const videoElement = document.getElementById(`video-${participant.userId}`);
        if (videoElement && videoElement.paused) {
          console.log(`Found paused video for participant ${participant.userId}, attempting to play`);
          
          // Force direct styling for better compatibility
          videoElement.style.display = "block";
          videoElement.style.visibility = "visible";
          videoElement.style.width = "100%";
          videoElement.style.height = "100%";
          videoElement.style.objectFit = "cover";
          videoElement.style.borderRadius = "8px";
          videoElement.style.backgroundColor = "#000000";
          videoElement.style.zIndex = "5";
          
          // Try to play
          videoElement.play()
            .then(() => console.log(`Successfully started playback for participant ${participant.userId}`))
            .catch(err => console.error(`Failed to play video for participant ${participant.userId}:`, err));
        }
      }
    });
  }, [participants]); // Re-run when participants list changes

  // Handle remote participant streams with WebRTC
  const handleParticipantJoined = useCallback((participant: any) => {
    console.log(`Participant joined: ${participant.displayName} (${participant.userId})`);
    setParticipants(prev => ({
      ...prev,
      [participant.userId]: participant
    }));
  }, []);
  
  const handleParticipantLeft = useCallback((userId: string) => {
    console.log(`Participant left: ${userId}`);
    setWebrtcParticipants(prev => {
      const newParticipants = { ...prev };
      delete newParticipants[userId];
      return newParticipants;
    });
    setRemoteStreams(prev => {
      const newStreams = new Map(prev);
      newStreams.delete(userId);
      return newStreams;
    });
  }, []);
  
  const handleParticipantStreamAdded = useCallback((stream: MediaStream, userId: string) => {
    console.log(`Setting up stream for participant ${userId}`, {
      videoTracks: stream.getVideoTracks().length,
      audioTracks: stream.getAudioTracks().length
    });

    // Create or get video container
    let videoContainer = document.getElementById('video-container');
    if (!videoContainer) {
      videoContainer = document.createElement('div');
      videoContainer.id = 'video-container';
      document.body.appendChild(videoContainer);
    }

    // Create or get video element for this participant
    let videoElement = document.getElementById(`video-${userId}`) as HTMLVideoElement;
    if (!videoElement) {
      videoElement = document.createElement('video');
      videoElement.id = `video-${userId}`;
      videoElement.autoplay = true;
      videoElement.playsInline = true;
      videoElement.muted = userId === user?.id?.toString(); // Mute only local video
      
      // Set video styles
      videoElement.style.width = '320px';
      videoElement.style.height = '240px';
      videoElement.style.objectFit = 'cover';
      videoElement.style.margin = '5px';
      videoElement.style.backgroundColor = '#000';
      
      videoContainer.appendChild(videoElement);
    }

    // Create separate audio element for this participant (if not local)
    if (userId !== user?.id?.toString()) {
      let audioElement = document.getElementById(`audio-${userId}`) as HTMLAudioElement;
      if (!audioElement) {
        audioElement = document.createElement('audio');
        audioElement.id = `audio-${userId}`;
        audioElement.autoplay = true;
        audioElement.style.display = 'none';
        document.body.appendChild(audioElement);
      }
      audioElement.srcObject = stream;
    }

    // Set stream to video element
    videoElement.srcObject = stream;

    // Attempt to play the video
    videoElement.play().catch(error => {
      console.error(`Error playing video for participant ${userId}:`, error);
      // Try playing again after a short delay
      setTimeout(() => {
        videoElement.play().catch(e => 
          console.error(`Second attempt to play video for participant ${userId} failed:`, e)
        );
      }, 1000);
    });

    // Update participant media state
    setWebrtcParticipants(prev => ({
      ...prev,
      [userId]: {
        ...prev[userId],
        stream,
        mediaState: {
          audio: stream.getAudioTracks().some(track => track.enabled),
          video: stream.getVideoTracks().some(track => track.enabled)
        }
      }
    }));

    // Log success
    console.log(`Successfully set up media for participant ${userId}`);
  }, [user?.id]);
  
  const handleMeetingEnded = useCallback(() => {
    toast({
      title: "Meeting Ended",
      description: "The meeting has been ended by the host.",
    });
    navigate("/meetings");
  }, [navigate, toast]);
  
  // Handle media state changes from remote participants
  const handleMediaStateChanged = useCallback((userId: string, mediaType: 'audio' | 'video', enabled: boolean) => {
    console.log(`Media state changed for participant ${userId}: ${mediaType} ${enabled ? 'enabled' : 'disabled'}`);
    
    // Update participant's media state in our state
    setWebrtcParticipants(prev => ({
      ...prev,
      [userId]: {
        ...prev[userId],
        mediaState: {
          ...prev[userId].mediaState,
          [mediaType]: enabled
        }
      }
    }));
    
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

  const handleParticipantDisconnected = (userId: string) => {
    console.log(`Cleaning up for disconnected participant ${userId}`);
    
    // Remove video element
    const videoElement = document.getElementById(`video-${userId}`);
    if (videoElement) {
      const stream = (videoElement as HTMLVideoElement).srcObject as MediaStream;
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
      videoElement.remove();
    }

    // Update participant state
    setWebrtcParticipants(prev => {
      const newState = { ...prev };
      delete newState[userId];
      return newState;
    });
  };

  useEffect(() => {
    // Cleanup on unmount
    return () => {
      const videoContainer = document.getElementById('video-container');
      if (videoContainer) {
        // Stop all streams and remove video elements
        Array.from(videoContainer.children).forEach(child => {
          if (child instanceof HTMLVideoElement) {
            const stream = child.srcObject as MediaStream;
            if (stream) {
              stream.getTracks().forEach(track => track.stop());
            }
            child.remove();
          }
        });
      }
    };
  }, []);

  const [avIssues, setAvIssues] = useState<string[]>([]);

  const handleAVIssueDetected = (issue: string) => {
    setAvIssues(prev => [...prev, issue]);
  };

  const handleAVStatusChange = (status: AVStatus) => {
    // You can use this to update UI elements or trigger other actions
    console.log('AV Status Updated:', status);
  };

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
                      {user && (meeting as Meeting).hostId === user.id 
                        ? user.displayName?.charAt(0) || user.username.charAt(0)
                        : (participants as any[])
                            ?.find((p: any) => p.user && p.user.id === (meeting as Meeting).hostId)
                            ?.user?.displayName?.charAt(0) || 'H'}
                    </div>
                    <span className="ml-2 text-white">
                      {user && (meeting as Meeting).hostId === user.id 
                        ? 'You (Host)'
                        : (participants as any[])
                            ?.find((p: any) => p.user && p.user.id === (meeting as Meeting).hostId)
                            ?.user?.displayName || 'Host'}
                    </span>
                  </div>
                </div>
                
                {/* Other participants */}
                <div>
                  <h4 className="text-white text-sm font-medium mb-2">Participants</h4>
                  
                  {participants && participants.length > 0 ? (
                    participants
                      .filter((p: any) => p.user && p.user.id !== (meeting as Meeting).hostId)
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
                <h1 className="text-white text-xl font-bold">{(meeting as Meeting).name}</h1>
                <div className="flex items-center text-gray-300 mt-1">
                  <span className="text-sm">Meeting Code: {(meeting as Meeting).meetingCode}</span>
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
                  onClick={(meeting as Meeting).hostId === user?.id ? endMeeting : leaveMeeting}
                  title={(meeting as Meeting).hostId === user?.id ? "End meeting" : "Leave meeting"}
                >
                  <LogOut className="w-4 h-4 mr-1" />
                  <span className="hidden sm:inline">{(meeting as Meeting).hostId === user?.id ? "End" : "Leave"}</span>
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
                    className={`${isMiniView ? 'fixed bottom-20 right-4 w-64 z-50' : 'bg-gray-800 rounded-lg overflow-hidden aspect-video'} relative min-h-[240px]`}
                    style={{ position: 'relative' }}
                  >
                    {/* Fallback avatar - only shown when video isn't visible */}
                    <div className="absolute inset-0 flex items-center justify-center z-0">
                      <div className="w-20 h-20 bg-blue-600 rounded-full flex items-center justify-center text-white text-xl font-medium">
                        {user?.displayName?.charAt(0) || user?.username?.charAt(0) || '?'}
                      </div>
                    </div>
                    
                    {/* Actual video element with higher z-index to overlay the avatar when active */}
                    <video
                      id="local-video-element"
                      ref={localVideoRef}
                      autoPlay
                      playsInline
                      muted
                      className="w-full h-full object-cover rounded-lg"
                      style={{ 
                        position: 'relative', 
                        zIndex: 5,
                        backgroundColor: '#000000',
                        display: 'block',
                        visibility: 'visible'
                      }}
                      onClick={() => {
                        // Force play on click for browsers that require interaction
                        if (localVideoRef.current) {
                          console.log("Video clicked, forcing play");
                          localVideoRef.current.style.display = 'block';
                          localVideoRef.current.style.visibility = 'visible';
                          
                          // Reset video source as a fallback approach
                          if (localStreamRef.current) {
                            localVideoRef.current.srcObject = null;
                            setTimeout(() => {
                              if (localVideoRef.current && localStreamRef.current) {
                                localVideoRef.current.srcObject = localStreamRef.current;
                              }
                            }, 100);
                          }
                          
                          localVideoRef.current.play()
                            .then(() => console.log("Video playing after click"))
                            .catch(err => console.error("Play error after click:", err));
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
                        const webrtcParticipant = webrtcParticipants[participant.user.id];
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
                            {/* Avatar placeholder - always visible unless video is rendering properly */}
                            <div className="w-full h-full flex items-center justify-center absolute inset-0 z-0">
                              <div className="bg-gray-700 rounded-full h-24 w-24 flex items-center justify-center text-3xl text-white">
                                {participant.user.displayName.charAt(0)}
                              </div>
                            </div>
                            
                            {/* Audio container for this participant's audio */}
                            {hasStream && remoteStreams.has(participant.user.id) && (
                              <AudioContainer 
                                stream={remoteStreams.get(participant.user.id) || null}
                                userId={participant.user.id}
                                muted={webrtcParticipant?.mediaState?.audio === false}
                              />
                            )}
                            
                            {hasStream && (
                              // Show remote video stream with z-index to go on top of avatar
                              <video
                                ref={videoRef}
                                autoPlay
                                playsInline
                                className="w-full h-full object-cover"
                                id={`remote-video-${participant.user.id}`}
                                style={{ 
                                  position: 'relative',
                                  zIndex: 5,
                                  backgroundColor: '#000000',
                                  display: 'block',
                                  visibility: 'visible',
                                  width: '100%',
                                  height: '100%',
                                  borderRadius: '8px'
                                }}
                                // Always mute the video element as audio is handled by AudioContainer
                                muted={true}
                                onClick={(e) => {
                                  // Force play on click for browsers that require interaction
                                  console.log(`Video clicked for participant ${participant.user.id}, forcing play`);
                                  if (e.currentTarget) {
                                    // Make sure the video is visible
                                    e.currentTarget.style.display = 'block';
                                    e.currentTarget.style.visibility = 'visible';
                                    
                                    // Reset video source as a fallback approach
                                    const stream = e.currentTarget.srcObject;
                                    if (stream) {
                                      e.currentTarget.srcObject = null;
                                      setTimeout(() => {
                                        if (e.currentTarget) {
                                          e.currentTarget.srcObject = stream;
                                          e.currentTarget.play()
                                            .then(() => console.log(`Remote video for ${participant.user.id} playing after click`))
                                            .catch(err => console.error(`Error playing video for ${participant.user.id} after click:`, err));
                                        }
                                      }, 100);
                                    } else {
                                      // Try to play anyway
                                      e.currentTarget.play()
                                        .then(() => console.log(`Remote video for ${participant.user.id} playing after click`))
                                        .catch(err => console.error(`Error playing video for ${participant.user.id}:`, err));
                                    }
                                  }
                                }}
                              />
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
                  onClick={(meeting as Meeting).hostId === user?.id ? endMeeting : leaveMeeting}
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

      <AVStatusMonitor 
        localStream={localStreamRef.current}
        remoteStreams={webrtcParticipants}
        onAVIssueDetected={handleAVIssueDetected}
      />

      <AVIntegrityMonitor
        localStream={localStreamRef.current}
        remoteStreams={webrtcParticipants}
        isHost={true}
        onIssueDetected={handleAVIssueDetected}
        onStatusChange={handleAVStatusChange}
      />
    </div>
  );
}