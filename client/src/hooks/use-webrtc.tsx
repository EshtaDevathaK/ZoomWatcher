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
  // Store pending ICE candidates when remote description isn't set yet
  const pendingIceCandidates = new Map<number, RTCIceCandidateInit[]>();
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
        console.error(`Cannot initiate peer connection: missing requirements`, {
          hasUser: !!user,
          hasLocalStream: !!localStream,
          hasSocketRef: !!socketRef.current,
          socketOpen: socketRef.current?.readyState === WebSocket.OPEN
        });
        return;
      }
      
      // If we already have an existing connection to this participant, close it first
      const existingConnection = peerConnectionsRef.current.get(targetUserId);
      if (existingConnection) {
        console.log(`Closing existing peer connection to participant ${targetUserId}`);
        existingConnection.close();
        peerConnectionsRef.current.delete(targetUserId);
      }
      
      try {
        console.log(`Initiating new peer connection to participant ${targetUserId}`);
        
        // Create a new peer connection with enhanced configuration
        const peerConnection = createPeerConnection();
        
        // Store the peer connection in our reference
        peerConnectionsRef.current.set(targetUserId, peerConnection);
        
        // Set up connection state monitoring
        peerConnection.oniceconnectionstatechange = () => {
          console.log(`ICE connection state change for participant ${targetUserId}: ${peerConnection.iceConnectionState}`);
          
          if (peerConnection.iceConnectionState === 'failed' || peerConnection.iceConnectionState === 'disconnected') {
            console.warn(`ICE connection to participant ${targetUserId} failed or disconnected, attempting to restart`);
            
            // Try to restart ICE connection if it fails
            try {
              peerConnection.restartIce();
              
              // If that fails, we might need to recreate the connection
              setTimeout(() => {
                if (peerConnection.iceConnectionState === 'failed' || peerConnection.iceConnectionState === 'disconnected') {
                  console.warn(`ICE restart failed for participant ${targetUserId}, will try to recreate connection`);
                  
                  // Close and remove the old connection
                  peerConnection.close();
                  peerConnectionsRef.current.delete(targetUserId);
                  
                  // Try to initiate a new connection after a short delay
                  setTimeout(() => {
                    initiatePeerConnection(targetUserId);
                  }, 2000);
                }
              }, 5000);
            } catch (err) {
              console.error(`Error trying to restart ICE for participant ${targetUserId}:`, err);
            }
          } else if (peerConnection.iceConnectionState === 'connected') {
            console.log(`ICE connection established with participant ${targetUserId}`);
            
            // Update connection status in participants list to show connected status
            setParticipants(prev => {
              const newMap = new Map(prev);
              const participant = newMap.get(targetUserId);
              
              if (participant) {
                // Only update if needed
                if (!participant.peerConnection || participant.peerConnection !== peerConnection) {
                  const updatedParticipant = {
                    ...participant,
                    peerConnection,
                    connectionStatus: 'connected'
                  };
                  
                  newMap.set(targetUserId, updatedParticipant);
                }
              }
              
              return newMap;
            });
          }
        };
        
        // Set up signaling state monitoring
        peerConnection.onsignalingstatechange = () => {
          console.log(`Signaling state change for participant ${targetUserId}: ${peerConnection.signalingState}`);
          
          // If connection is closed, we should clean up
          if (peerConnection.signalingState === 'closed') {
            console.log(`Peer connection to participant ${targetUserId} is closed, cleaning up`);
            peerConnectionsRef.current.delete(targetUserId);
          }
        };
        
        // Set up connection state monitoring
        peerConnection.onconnectionstatechange = () => {
          console.log(`Connection state change for participant ${targetUserId}: ${peerConnection.connectionState}`);
          
          // If connection fails, try to reconnect
          if (peerConnection.connectionState === 'failed' || peerConnection.connectionState === 'disconnected') {
            console.warn(`Connection to participant ${targetUserId} failed or disconnected`);
            
            // Try to restart the connection after a delay
            setTimeout(() => {
              if (peerConnectionsRef.current.get(targetUserId) === peerConnection) {
                console.log(`Attempting to recreate connection with participant ${targetUserId} after connection failure`);
                peerConnection.close();
                peerConnectionsRef.current.delete(targetUserId);
                
                // Wait a bit more before trying to recreate
                setTimeout(() => {
                  initiatePeerConnection(targetUserId);
                }, 2000);
              }
            }, 1000);
          }
        };
        
        // Add local stream to the peer connection
        addMediaStreamToPeerConnection(peerConnection, localStream);
        
        // Handle ICE candidates
        peerConnection.onicecandidate = (event) => {
          if (event.candidate && socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
            console.log(`Sending ICE candidate to participant ${targetUserId}`);
            
            // Log the candidate info for debugging
            if (event.candidate) {
              try {
                const candidateFields = {
                  sdpMid: event.candidate.sdpMid,
                  sdpMLineIndex: event.candidate.sdpMLineIndex,
                  candidateType: event.candidate.candidate.split(' ')[7], // Extract type from candidate string
                  protocol: event.candidate.candidate.split(' ')[2],      // Extract protocol
                  foundation: event.candidate.candidate.split(' ')[0].replace('candidate:', '')
                };
                console.log(`Sending ICE candidate for participant ${targetUserId}:`, candidateFields);
              } catch (err) {
                console.error(`Error parsing ICE candidate details:`, err);
              }
            }
            
            try {
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
            } catch (err) {
              console.error(`Error sending ICE candidate to participant ${targetUserId}:`, err);
            }
          } else if (!event.candidate) {
            console.log(`End of ICE candidates for participant ${targetUserId}`);
          }
        };
        
        // Handle remote tracks
        peerConnection.ontrack = (event) => {
          console.log(`Received track from participant ${targetUserId}:`, event.track.kind, event.track.enabled);
          
          // Create a new MediaStream from the received tracks
          // First check if we already have a stream for this participant
          const existingParticipant = participants.get(targetUserId);
          const remoteStream = existingParticipant?.stream || new MediaStream();
          
          // Add the new track to the stream if it's not already there
          if (!remoteStream.getTracks().some(t => t.id === event.track.id)) {
            console.log(`Adding ${event.track.kind} track to remote stream for participant ${targetUserId}`);
            try {
              remoteStream.addTrack(event.track);
            } catch (err) {
              console.error(`Error adding track to remote stream:`, err);
            }
          }
          
          // For audio tracks, make sure they're enabled for playback
          if (event.track.kind === 'audio') {
            console.log(`Setting remote audio track to enabled for participant ${targetUserId}`);
            event.track.enabled = true;
          }
          
          // Log track details for debugging
          console.log(`Remote ${event.track.kind} track details for participant ${targetUserId}:`, {
            id: event.track.id,
            enabled: event.track.enabled,
            muted: event.track.muted,
            readyState: event.track.readyState
          });
          
          // Update participant stream in our state
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
                stream: remoteStream,
                peerConnection // Store reference to peer connection
              };
              
              newMap.set(targetUserId, updatedParticipant);
              
              // Notify via callback that we've got a stream
              if (onParticipantStreamAdded) {
                setTimeout(() => {
                  onParticipantStreamAdded(targetUserId, remoteStream);
                }, 100); // Small delay to ensure stream is properly set up
              }
            } else {
              console.warn(`Received track for unknown participant ${targetUserId}`);
            }
            
            return newMap;
          });
        };
        
        // Create and send offer
        console.log(`Creating offer for participant ${targetUserId}`);
        const offer = await createOffer(peerConnection);
        
        if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
          console.log(`Sending offer to participant ${targetUserId}`);
          
          try {
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
          } catch (err) {
            console.error(`Error sending offer to participant ${targetUserId}:`, err);
          }
        } else {
          console.error(`Cannot send offer: websocket not open`);
        }
      } catch (error) {
        console.error(`Error initiating peer connection to participant ${targetUserId}:`, error);
        
        // Clean up this connection attempt on error
        peerConnectionsRef.current.delete(targetUserId);
        
        toast({
          title: "Connection Error",
          description: "Failed to connect to a participant. Please try refreshing the page.",
          variant: "destructive"
        });
      }
    },
    [user, localStream, meetingId, participants, onParticipantStreamAdded, toast]
  );

  // Handle an offer from another participant
  const handleOffer = useCallback(
    async (message: any) => {
      if (!user || !localStream || !socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
        console.warn('Cannot handle offer: user, localStream, or socket not available');
        return;
      }
      
      try {
        const fromUserId = message.from.userId;
        const offer = message.data.offer;
        
        console.log(`Received offer from participant ${fromUserId}`);
        
        // Check if we already have a connection for this user
        const existingConnection = peerConnectionsRef.current.get(fromUserId);
        if (existingConnection) {
          console.log(`Closing existing peer connection for participant ${fromUserId} before creating new one`);
          existingConnection.close();
          peerConnectionsRef.current.delete(fromUserId);
        }
        
        // Create a new peer connection with enhanced configuration
        console.log(`Creating new peer connection for participant ${fromUserId} in response to offer`);
        const peerConnection = createPeerConnection();
        
        // Store the peer connection
        peerConnectionsRef.current.set(fromUserId, peerConnection);
        
        // Set up connection state monitoring
        peerConnection.oniceconnectionstatechange = () => {
          console.log(`ICE connection state change for participant ${fromUserId}: ${peerConnection.iceConnectionState}`);
          
          if (peerConnection.iceConnectionState === 'failed' || peerConnection.iceConnectionState === 'disconnected') {
            console.warn(`ICE connection to participant ${fromUserId} failed or disconnected, attempting to restart`);
            
            // Try to restart ICE connection if it fails
            try {
              peerConnection.restartIce();
            } catch (err) {
              console.error(`Error trying to restart ICE for participant ${fromUserId}:`, err);
            }
          }
        };
        
        // Set up signaling state monitoring
        peerConnection.onsignalingstatechange = () => {
          console.log(`Signaling state change for participant ${fromUserId}: ${peerConnection.signalingState}`);
          
          // If connection is closed, we should clean up
          if (peerConnection.signalingState === 'closed') {
            console.log(`Peer connection to participant ${fromUserId} is closed, cleaning up`);
            peerConnectionsRef.current.delete(fromUserId);
          }
        };
        
        // Set up connection state monitoring
        peerConnection.onconnectionstatechange = () => {
          console.log(`Connection state change for participant ${fromUserId}: ${peerConnection.connectionState}`);
          
          // If connection fails, try to reconnect
          if (peerConnection.connectionState === 'failed' || peerConnection.connectionState === 'disconnected') {
            console.warn(`Connection to participant ${fromUserId} failed or disconnected`);
            
            // Try to restart the connection after a delay
            setTimeout(() => {
              if (peerConnectionsRef.current.get(fromUserId) === peerConnection) {
                console.log(`Attempting to recreate connection with participant ${fromUserId} after connection failure`);
                peerConnection.close();
                peerConnectionsRef.current.delete(fromUserId);
              }
            }, 1000);
          }
        };
        
        // Add local stream to the peer connection
        addMediaStreamToPeerConnection(peerConnection, localStream);
        
        // Handle ICE candidates
        peerConnection.onicecandidate = (event) => {
          if (event.candidate && socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
            console.log(`Sending ICE candidate to participant ${fromUserId} (in response to offer)`);
            
            // Log the candidate info for debugging
            if (event.candidate) {
              try {
                const candidateFields = {
                  sdpMid: event.candidate.sdpMid,
                  sdpMLineIndex: event.candidate.sdpMLineIndex,
                  candidateType: event.candidate.candidate.split(' ')[7], // Extract type from candidate string
                  protocol: event.candidate.candidate.split(' ')[2],      // Extract protocol
                  foundation: event.candidate.candidate.split(' ')[0].replace('candidate:', '')
                };
                console.log(`Sending ICE candidate for participant ${fromUserId}:`, candidateFields);
              } catch (err) {
                console.error(`Error parsing ICE candidate details:`, err);
              }
            }
            
            try {
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
            } catch (err) {
              console.error(`Error sending ICE candidate to participant ${fromUserId}:`, err);
            }
          } else if (!event.candidate) {
            console.log(`End of ICE candidates for participant ${fromUserId} (in response to offer)`);
          }
        };
        
        // Handle remote tracks
        peerConnection.ontrack = (event) => {
          console.log(`Received track from participant ${fromUserId}:`, event.track.kind, event.track.enabled);
          
          // Create a new MediaStream from the received tracks
          // First check if we already have a stream for this participant
          const existingParticipant = participants.get(fromUserId);
          const remoteStream = existingParticipant?.stream || new MediaStream();
          
          // Add the new track to the stream if not already present
          if (!remoteStream.getTracks().some(t => t.id === event.track.id)) {
            console.log(`Adding ${event.track.kind} track to remote stream for participant ${fromUserId}`);
            try {
              remoteStream.addTrack(event.track);
            } catch (err) {
              console.error(`Error adding track to remote stream:`, err);
            }
          }
          
          // For audio tracks, make sure they're enabled for playback
          if (event.track.kind === 'audio') {
            console.log(`Setting remote audio track to enabled for participant ${fromUserId}`);
            event.track.enabled = true;
          }
          
          // Log track details for debugging
          console.log(`Remote ${event.track.kind} track details for participant ${fromUserId}:`, {
            id: event.track.id,
            enabled: event.track.enabled,
            muted: event.track.muted,
            readyState: event.track.readyState
          });
          
          // Update participant stream in our state
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
                stream: remoteStream,
                peerConnection // Store reference to peer connection
              };
              
              newMap.set(fromUserId, updatedParticipant);
              
              // Notify via callback that we've got a stream
              if (onParticipantStreamAdded) {
                setTimeout(() => {
                  onParticipantStreamAdded(fromUserId, remoteStream);
                }, 100); // Small delay to ensure stream is properly set up
              }
            } else {
              console.warn(`Received track for unknown participant ${fromUserId}`);
            }
            
            return newMap;
          });
        };
        
        // Create and send answer
        console.log(`Creating answer for participant ${fromUserId}`);
        try {
          const answer = await createAnswer(peerConnection, offer);
          
          // Now that we have set local and remote descriptions, we can add any pending ICE candidates
          const pendingCandidates = pendingIceCandidates.get(fromUserId) || [];
          if (pendingCandidates.length > 0) {
            console.log(`Adding ${pendingCandidates.length} pending ICE candidates for participant ${fromUserId}`);
            
            for (const candidate of pendingCandidates) {
              try {
                await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
                console.log(`Successfully added pending ICE candidate for participant ${fromUserId}`);
              } catch (err) {
                console.error(`Failed to add pending ICE candidate for participant ${fromUserId}:`, err);
              }
            }
            
            // Clear the pending candidates
            pendingIceCandidates.delete(fromUserId);
          }
          
          // Send our answer back to the offerer
          if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
            console.log(`Sending answer to participant ${fromUserId}`);
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
          } else {
            console.error(`Cannot send answer: WebSocket not open`);
          }
        } catch (err) {
          console.error(`Error creating or sending answer to participant ${fromUserId}:`, err);
          toast({
            title: "Connection Error",
            description: "Failed to establish connection with a participant.",
            variant: "destructive"
          });
        }
      } catch (error) {
        console.error('Error handling offer:', error);
        toast({
          title: "Connection Error",
          description: "Failed to process connection offer from a participant.",
          variant: "destructive"
        });
      }
    },
    [user, localStream, meetingId, participants, onParticipantStreamAdded, toast]
  );

  // Handle an answer from another participant
  const handleAnswer = useCallback(
    async (message: any) => {
      try {
        const fromUserId = message.from.userId;
        const answer = message.data.answer;
        
        console.log(`Received answer from participant ${fromUserId}`);
        
        const peerConnection = peerConnectionsRef.current.get(fromUserId);
        
        if (peerConnection) {
          console.log(`Setting remote description for answer from participant ${fromUserId}`);
          
          // Check signaling state to make sure we can set the remote description
          if (peerConnection.signalingState !== 'have-local-offer') {
            console.warn(`Peer connection for participant ${fromUserId} is in unexpected signaling state: ${peerConnection.signalingState}`);
            
            // If we're in closed state, we need to recreate the connection
            if (peerConnection.signalingState === 'closed') {
              console.log(`Connection to participant ${fromUserId} is closed, will try to recreate it`);
              peerConnection.close();
              peerConnectionsRef.current.delete(fromUserId);
              
              // Wait a bit and then try to create a new connection
              setTimeout(() => {
                initiatePeerConnection(fromUserId);
              }, 1000);
              return;
            }
          }
          
          try {
            // Apply the remote description (answer)
            await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
            console.log(`Successfully set remote description for participant ${fromUserId}`);
            
            // Now that remote description is set, we can add any pending ICE candidates
            const pendingCandidates = pendingIceCandidates.get(fromUserId) || [];
            if (pendingCandidates.length > 0) {
              console.log(`Adding ${pendingCandidates.length} pending ICE candidates for participant ${fromUserId}`);
              
              for (const candidate of pendingCandidates) {
                try {
                  await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
                  console.log(`Successfully added pending ICE candidate for participant ${fromUserId}`);
                } catch (err) {
                  console.error(`Failed to add pending ICE candidate for participant ${fromUserId}:`, err);
                }
              }
              
              // Clear the pending candidates
              pendingIceCandidates.delete(fromUserId);
            }
            
            // Update connection status in participants list
            setParticipants(prev => {
              const newMap = new Map(prev);
              const participant = newMap.get(fromUserId);
              
              if (participant) {
                const updatedParticipant = {
                  ...participant,
                  peerConnection,
                };
                
                newMap.set(fromUserId, updatedParticipant);
              }
              
              return newMap;
            });
          } catch (err) {
            console.error(`Error setting remote description for participant ${fromUserId}:`, err);
            
            // Try to recover from this error
            setTimeout(() => {
              const currentPeerConnection = peerConnectionsRef.current.get(fromUserId);
              if (currentPeerConnection) {
                console.log(`Attempting to recreate connection with participant ${fromUserId} after error`);
                currentPeerConnection.close();
                peerConnectionsRef.current.delete(fromUserId);
                initiatePeerConnection(fromUserId);
              }
            }, 2000);
          }
        } else {
          console.warn(`No peer connection found for participant ${fromUserId} when handling answer`);
        }
      } catch (error) {
        console.error('Error handling answer:', error);
      }
    },
    [initiatePeerConnection]
  );

  // Handle an ICE candidate from another participant
  const handleIceCandidate = useCallback(
    async (message: any) => {
      try {
        const fromUserId = message.from.userId;
        const candidate = message.data.candidate;
        
        if (!candidate) {
          console.error(`Received empty ICE candidate from participant ${fromUserId}`);
          return;
        }
        
        console.log(`Received ICE candidate from participant ${fromUserId}`);
        
        const peerConnection = peerConnectionsRef.current.get(fromUserId);
        
        if (peerConnection) {
          // Check if the connection is in a state where it can accept ICE candidates
          if (peerConnection.remoteDescription === null) {
            console.warn(`Cannot add ICE candidate for participant ${fromUserId}: no remote description set`);
            
            // Queue this candidate to be added later once remote description is set
            const pendingCandidates = pendingIceCandidates.get(fromUserId) || [];
            pendingCandidates.push(candidate);
            pendingIceCandidates.set(fromUserId, pendingCandidates);
            
            console.log(`Queued ICE candidate for participant ${fromUserId}, now have ${pendingCandidates.length} pending candidates`);
            return;
          }
          
          try {
            // Log the candidate info for debugging
            const candidateFields = {
              sdpMid: candidate.sdpMid,
              sdpMLineIndex: candidate.sdpMLineIndex,
              candidateType: candidate.candidate.split(' ')[7], // Extract type from candidate string
              protocol: candidate.candidate.split(' ')[2],      // Extract protocol
              foundation: candidate.candidate.split(' ')[0].replace('candidate:', '')
            };
            console.log(`Adding ICE candidate for participant ${fromUserId}:`, candidateFields);
            
            await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
            console.log(`Successfully added ICE candidate for participant ${fromUserId}`);
          } catch (err) {
            console.error(`Failed to add ICE candidate for participant ${fromUserId}:`, err);
            
            // If we can't add the candidate, it might be due to a signaling state issue
            console.warn(`Peer connection signaling state: ${peerConnection.signalingState}`);
            console.warn(`Peer connection ICE connection state: ${peerConnection.iceConnectionState}`);
            console.warn(`Peer connection ICE gathering state: ${peerConnection.iceGatheringState}`);
            
            // Queue this candidate for retry later
            const pendingCandidates = pendingIceCandidates.get(fromUserId) || [];
            pendingCandidates.push(candidate);
            pendingIceCandidates.set(fromUserId, pendingCandidates);
            
            console.log(`Queued failed ICE candidate for participant ${fromUserId}, now have ${pendingCandidates.length} pending candidates`);
          }
        } else {
          console.warn(`No peer connection found for participant ${fromUserId} when handling ICE candidate`);
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