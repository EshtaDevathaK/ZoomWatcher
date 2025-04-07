import { useState, useEffect, useRef, useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';
import {
  createPeerConnection,
  createWebSocketConnection,
  createOffer,
  createAnswer,
  addMediaStreamToPeerConnection,
  formatWebRTCMessage
} from '@/lib/webrtc-utils';

interface Participant {
  userId: number;
  username: string;
  displayName: string;
  stream?: MediaStream;
  peerConnection?: RTCPeerConnection;
  mediaState?: {
    audio: boolean;
    video: boolean;
  };
}

interface UseWebRTCProps {
  user: {
    id: number;
    username: string;
    displayName: string;
  } | null;
  meetingId: number;
  localStream: MediaStream | null;
  onParticipantJoined?: (participant: Participant) => void;
  onParticipantLeft?: (userId: number) => void;
  onParticipantStreamAdded?: (userId: number, stream: MediaStream) => void;
  onMediaStateChanged?: (userId: number, mediaType: 'audio' | 'video', enabled: boolean) => void;
  onMeetingEnded?: () => void;
}

export function useWebRTC({
  user,
  meetingId,
  localStream,
  onParticipantJoined,
  onParticipantLeft,
  onParticipantStreamAdded,
  onMediaStateChanged,
  onMeetingEnded
}: UseWebRTCProps) {
  const [isConnected, setIsConnected] = useState(false);
  const [participants, setParticipants] = useState<Map<number, Participant>>(new Map());
  const socketRef = useRef<WebSocket | null>(null);
  const peerConnectionsRef = useRef<Map<number, RTCPeerConnection>>(new Map());
  const { toast } = useToast();

  // Initialize WebSocket connection
  useEffect(() => {
    if (!user || !meetingId) return;

    let isMounted = true;

    const connectWebSocket = async () => {
      try {
        const socket = await createWebSocketConnection();
        if (!isMounted) {
          socket.close();
          return;
        }

        socketRef.current = socket;
        setIsConnected(true);

        // Join the meeting room
        socket.send(
          JSON.stringify(
            formatWebRTCMessage(
              'join-meeting',
              meetingId,
              {
                userId: user.id,
                username: user.username,
                displayName: user.displayName
              },
              {}
            )
          )
        );

        // Handle WebSocket messages
        socket.onmessage = (event) => {
          handleWebSocketMessage(event.data);
        };

        socket.onclose = () => {
          if (isMounted) {
            setIsConnected(false);
            toast({
              title: 'Connection lost',
              description: 'WebSocket connection to the meeting server was closed.',
              variant: 'destructive'
            });
          }
        };

        socket.onerror = () => {
          if (isMounted) {
            setIsConnected(false);
            toast({
              title: 'Connection error',
              description: 'Failed to establish WebSocket connection.',
              variant: 'destructive'
            });
          }
        };
      } catch (error) {
        if (isMounted) {
          console.error('WebSocket connection error:', error);
          toast({
            title: 'Connection failed',
            description: 'Could not connect to the meeting server.',
            variant: 'destructive'
          });
        }
      }
    };

    connectWebSocket();

    return () => {
      isMounted = false;
      if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
        socketRef.current.close();
      }
      
      // Clean up peer connections
      peerConnectionsRef.current.forEach(pc => {
        pc.close();
      });
      peerConnectionsRef.current.clear();
    };
  }, [user, meetingId, toast]);

  // Handle incoming WebSocket messages
  const handleWebSocketMessage = useCallback(
    (data: string) => {
      try {
        const message = JSON.parse(data);

        switch (message.type) {
          case 'participants-list':
            // Handle list of existing participants when joining a meeting
            const newParticipants = message.data.participants as Array<{
              userId: number;
              username: string;
              displayName: string;
            }>;

            for (const participant of newParticipants) {
              addParticipant(participant);
              
              // Create peer connection and send offer to new participant
              if (user && localStream) {
                initiatePeerConnection(participant.userId);
              }
            }
            break;

          case 'user-joined':
            // Handle when a new participant joins the meeting
            const newParticipant = {
              userId: message.from.userId,
              username: message.from.username,
              displayName: message.from.displayName
            };
            
            addParticipant(newParticipant);
            
            // Initiate peer connection if needed
            if (user && localStream) {
              initiatePeerConnection(message.from.userId);
            }
            break;

          case 'user-left':
            // Handle when a participant leaves the meeting
            const leftUserId = message.from.userId;
            removeParticipant(leftUserId);
            break;

          case 'meeting-ended':
            // Handle when the meeting is ended by the host
            if (onMeetingEnded) {
              onMeetingEnded();
            }
            
            // Clean up connections
            peerConnectionsRef.current.forEach(pc => {
              pc.close();
            });
            peerConnectionsRef.current.clear();
            
            if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
              socketRef.current.close();
            }
            
            toast({
              title: 'Meeting ended',
              description: 'The meeting has been ended by the host.'
            });
            break;

          case 'offer':
            // Handle WebRTC offer from another participant
            handleOffer(message);
            break;

          case 'answer':
            // Handle WebRTC answer from another participant
            handleAnswer(message);
            break;

          case 'ice-candidate':
            // Handle ICE candidate from another participant
            handleIceCandidate(message);
            break;

          case 'media-state-change':
            // Handle media state changes
            const fromUserId = message.from.userId;
            const mediaType = message.data.mediaType as 'audio' | 'video';
            const enabled = message.data.enabled as boolean;
            
            console.log(`Received media state change: User ${fromUserId}, ${mediaType}=${enabled}`);
            
            // Update participant's media state
            setParticipants(prev => {
              const newMap = new Map(prev);
              const participant = newMap.get(fromUserId);
              
              if (participant) {
                // Initialize mediaState if it doesn't exist
                const mediaState = participant.mediaState || { audio: true, video: true };
                const updatedMediaState = {
                  ...mediaState,
                  [mediaType]: enabled
                };
                
                console.log(`Updating participant ${fromUserId} media state:`, updatedMediaState);
                
                const updatedParticipant = {
                  ...participant,
                  mediaState: updatedMediaState
                };
                
                newMap.set(fromUserId, updatedParticipant);
                
                // Call the callback if provided
                if (onMediaStateChanged) {
                  onMediaStateChanged(fromUserId, mediaType, enabled);
                }
              }
              
              return newMap;
            });
            break;
        }
      } catch (error) {
        console.error('Error handling WebSocket message:', error);
      }
    },
    [user, localStream, toast, onMeetingEnded, onMediaStateChanged]
  );

  // Add a new participant to the meeting
  const addParticipant = useCallback(
    (participant: { userId: number; username: string; displayName: string }) => {
      setParticipants(prev => {
        const newMap = new Map(prev);
        
        if (!newMap.has(participant.userId)) {
          const newParticipant: Participant = {
            userId: participant.userId,
            username: participant.username,
            displayName: participant.displayName,
            mediaState: {
              audio: true,
              video: true
            }
          };
          
          newMap.set(participant.userId, newParticipant);
          
          if (onParticipantJoined) {
            onParticipantJoined(newParticipant);
          }
        }
        
        return newMap;
      });
    },
    [onParticipantJoined]
  );

  // Remove a participant from the meeting
  const removeParticipant = useCallback(
    (userId: number) => {
      // Close peer connection
      const peerConnection = peerConnectionsRef.current.get(userId);
      if (peerConnection) {
        peerConnection.close();
        peerConnectionsRef.current.delete(userId);
      }
      
      setParticipants(prev => {
        const newMap = new Map(prev);
        
        if (newMap.has(userId)) {
          newMap.delete(userId);
          
          if (onParticipantLeft) {
            onParticipantLeft(userId);
          }
        }
        
        return newMap;
      });
    },
    [onParticipantLeft]
  );

  // Initiate a peer connection with a participant
  const initiatePeerConnection = useCallback(
    async (targetUserId: number) => {
      if (!user || !localStream || !socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
        return;
      }
      
      try {
        // Create a new peer connection
        const peerConnection = createPeerConnection();
        
        // Store the peer connection
        peerConnectionsRef.current.set(targetUserId, peerConnection);
        
        // Add local stream to the peer connection
        addMediaStreamToPeerConnection(peerConnection, localStream);
        
        // Handle ICE candidates
        peerConnection.onicecandidate = (event) => {
          if (event.candidate && socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
            socketRef.current.send(
              JSON.stringify(
                formatWebRTCMessage(
                  'ice-candidate',
                  meetingId,
                  {
                    userId: user.id,
                    username: user.username,
                    displayName: user.displayName
                  },
                  {
                    targetUserId,
                    candidate: event.candidate
                  }
                )
              )
            );
          }
        };
        
        // Handle remote tracks
        peerConnection.ontrack = (event) => {
          console.log(`Received track from participant ${targetUserId}:`, event.track.kind, event.track.enabled);
          
          // Create a new MediaStream from the received tracks
          // First check if we already have a stream for this participant
          const existingParticipant = participants.get(targetUserId);
          const remoteStream = existingParticipant?.stream || new MediaStream();
          
          // Add the new track to the stream
          if (!remoteStream.getTracks().some(t => t.id === event.track.id)) {
            console.log(`Adding ${event.track.kind} track to remote stream for participant ${targetUserId}`);
            remoteStream.addTrack(event.track);
          }
          
          // For audio tracks, make sure they're enabled for playback
          if (event.track.kind === 'audio') {
            console.log(`Setting remote audio track to enabled for participant ${targetUserId}`);
            event.track.enabled = true;
          }
          
          setParticipants(prev => {
            const newMap = new Map(prev);
            const participant = newMap.get(targetUserId);
            
            if (participant) {
              console.log(`Updating participant ${targetUserId} with new stream`);
              
              // Get participant's media state or set defaults
              const mediaState = participant.mediaState || { audio: true, video: true };
              
              // Make sure the track's enabled state matches the participant's media state
              if (event.track.kind === 'audio') {
                event.track.enabled = mediaState.audio;
              } else if (event.track.kind === 'video') {
                event.track.enabled = mediaState.video;
              }
              
              const updatedParticipant = {
                ...participant,
                stream: remoteStream
              };
              
              newMap.set(targetUserId, updatedParticipant);
              
              if (onParticipantStreamAdded) {
                onParticipantStreamAdded(targetUserId, remoteStream);
              }
            } else {
              console.warn(`Received track for unknown participant ${targetUserId}`);
            }
            
            return newMap;
          });
        };
        
        // Create and send offer
        const offer = await createOffer(peerConnection);
        
        if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
          socketRef.current.send(
            JSON.stringify(
              formatWebRTCMessage(
                'offer',
                meetingId,
                {
                  userId: user.id,
                  username: user.username,
                  displayName: user.displayName
                },
                {
                  targetUserId,
                  offer
                }
              )
            )
          );
        }
      } catch (error) {
        console.error('Error initiating peer connection:', error);
      }
    },
    [user, localStream, meetingId, onParticipantStreamAdded, onMediaStateChanged]
  );

  // Handle an offer from another participant
  const handleOffer = useCallback(
    async (message: any) => {
      if (!user || !localStream || !socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
        return;
      }
      
      try {
        const fromUserId = message.from.userId;
        const offer = message.data.offer;
        
        // Create a new peer connection
        const peerConnection = createPeerConnection();
        
        // Store the peer connection
        peerConnectionsRef.current.set(fromUserId, peerConnection);
        
        // Add local stream to the peer connection
        addMediaStreamToPeerConnection(peerConnection, localStream);
        
        // Handle ICE candidates
        peerConnection.onicecandidate = (event) => {
          if (event.candidate && socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
            socketRef.current.send(
              JSON.stringify(
                formatWebRTCMessage(
                  'ice-candidate',
                  meetingId,
                  {
                    userId: user.id,
                    username: user.username,
                    displayName: user.displayName
                  },
                  {
                    targetUserId: fromUserId,
                    candidate: event.candidate
                  }
                )
              )
            );
          }
        };
        
        // Handle remote tracks
        peerConnection.ontrack = (event) => {
          console.log(`Received track from participant ${fromUserId}:`, event.track.kind, event.track.enabled);
          
          // Create a new MediaStream from the received tracks
          // First check if we already have a stream for this participant
          const existingParticipant = participants.get(fromUserId);
          const remoteStream = existingParticipant?.stream || new MediaStream();
          
          // Add the new track to the stream
          if (!remoteStream.getTracks().some(t => t.id === event.track.id)) {
            console.log(`Adding ${event.track.kind} track to remote stream for participant ${fromUserId}`);
            remoteStream.addTrack(event.track);
          }
          
          // For audio tracks, make sure they're enabled for playback
          if (event.track.kind === 'audio') {
            console.log(`Setting remote audio track to enabled for participant ${fromUserId}`);
            event.track.enabled = true;
          }
          
          setParticipants(prev => {
            const newMap = new Map(prev);
            const participant = newMap.get(fromUserId);
            
            if (participant) {
              console.log(`Updating participant ${fromUserId} with new stream`);
              
              // Get participant's media state or set defaults
              const mediaState = participant.mediaState || { audio: true, video: true };
              
              // Make sure the track's enabled state matches the participant's media state
              if (event.track.kind === 'audio') {
                event.track.enabled = mediaState.audio;
              } else if (event.track.kind === 'video') {
                event.track.enabled = mediaState.video;
              }
              
              const updatedParticipant = {
                ...participant,
                stream: remoteStream
              };
              
              newMap.set(fromUserId, updatedParticipant);
              
              if (onParticipantStreamAdded) {
                onParticipantStreamAdded(fromUserId, remoteStream);
              }
            } else {
              console.warn(`Received track for unknown participant ${fromUserId}`);
            }
            
            return newMap;
          });
        };
        
        // Create and send answer
        const answer = await createAnswer(peerConnection, offer);
        
        if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
          socketRef.current.send(
            JSON.stringify(
              formatWebRTCMessage(
                'answer',
                meetingId,
                {
                  userId: user.id,
                  username: user.username,
                  displayName: user.displayName
                },
                {
                  targetUserId: fromUserId,
                  answer
                }
              )
            )
          );
        }
      } catch (error) {
        console.error('Error handling offer:', error);
      }
    },
    [user, localStream, meetingId, onParticipantStreamAdded, onMediaStateChanged]
  );

  // Handle an answer from another participant
  const handleAnswer = useCallback(
    async (message: any) => {
      try {
        const fromUserId = message.from.userId;
        const answer = message.data.answer;
        
        const peerConnection = peerConnectionsRef.current.get(fromUserId);
        
        if (peerConnection) {
          await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
        }
      } catch (error) {
        console.error('Error handling answer:', error);
      }
    },
    []
  );

  // Handle an ICE candidate from another participant
  const handleIceCandidate = useCallback(
    async (message: any) => {
      try {
        const fromUserId = message.from.userId;
        const candidate = message.data.candidate;
        
        const peerConnection = peerConnectionsRef.current.get(fromUserId);
        
        if (peerConnection) {
          await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        }
      } catch (error) {
        console.error('Error handling ICE candidate:', error);
      }
    },
    []
  );

  // Send media state changes to other participants
  const sendMediaStateChange = useCallback(
    (mediaType: 'audio' | 'video', enabled: boolean) => {
      if (!user || !socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
        console.log(`Cannot send media state change - user or socket not available`);
        return;
      }
      
      console.log(`Sending media state change: ${mediaType}=${enabled}`);
      
      // For audio tracks, make sure the actual tracks match the state we're sending
      if (mediaType === 'audio' && localStream) {
        const audioTracks = localStream.getAudioTracks();
        console.log(`Ensuring ${audioTracks.length} audio tracks match state: ${enabled}`);
        
        audioTracks.forEach((track, index) => {
          if (track.enabled !== enabled) {
            console.log(`Fixing audio track ${index} state from ${track.enabled} to ${enabled}`);
            track.enabled = enabled;
          }
        });
      }
      
      // For video tracks, make sure the actual tracks match the state we're sending
      if (mediaType === 'video' && localStream) {
        const videoTracks = localStream.getVideoTracks();
        console.log(`Ensuring ${videoTracks.length} video tracks match state: ${enabled}`);
        
        videoTracks.forEach((track, index) => {
          if (track.enabled !== enabled) {
            console.log(`Fixing video track ${index} state from ${track.enabled} to ${enabled}`);
            track.enabled = enabled;
          }
        });
      }
      
      // Update local participant's media state in participants list
      // This is important to maintain the local user's state
      setParticipants(prev => {
        const newMap = new Map(prev);
        
        // Look for local user in the participants list
        const localParticipant = Array.from(newMap.values()).find(p => p.userId === user.id);
        
        if (localParticipant) {
          const mediaState = localParticipant.mediaState || { audio: true, video: true };
          const updatedMediaState = {
            ...mediaState,
            [mediaType]: enabled
          };
          
          const updatedParticipant = {
            ...localParticipant,
            mediaState: updatedMediaState
          };
          
          newMap.set(user.id, updatedParticipant);
        } else {
          console.log(`Local participant not found in participants list`);
        }
        
        return newMap;
      });
      
      // Send media state change to other participants
      try {
        socketRef.current.send(
          JSON.stringify(
            formatWebRTCMessage(
              'media-state-change',
              meetingId,
              {
                userId: user.id,
                username: user.username,
                displayName: user.displayName
              },
              {
                mediaType,
                enabled
              }
            )
          )
        );
        console.log(`Media state change sent successfully`);
      } catch (error) {
        console.error(`Error sending media state change:`, error);
      }
    },
    [user, meetingId, localStream]
  );

  return {
    isConnected,
    participants: Array.from(participants.values()),
    sendMediaStateChange
  };
}