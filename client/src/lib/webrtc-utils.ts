/**
 * WebRTC utilities for peer-to-peer connections in meetings
 */

// Configuration for WebRTC peer connections with enhanced server list
const iceServers = {
  iceServers: [
    {
      urls: [
        'stun:stun1.l.google.com:19302',
        'stun:stun2.l.google.com:19302',
        'stun:stun3.l.google.com:19302',
        'stun:stun4.l.google.com:19302',
        'stun:stun.stunprotocol.org:3478',
        'stun:stun.ekiga.net:3478',
        'stun:stun.ideasip.com:3478',
        'stun:stun.schlund.de:3478'
      ]
    },
    // Free TURN servers (for testing only - replace with your own TURN server in production)
    {
      urls: [
        'turn:openrelay.metered.ca:80',
        'turn:openrelay.metered.ca:443',
        'turn:openrelay.metered.ca:443?transport=tcp'
      ],
      username: 'openrelayproject',
      credential: 'openrelayproject'
    },
    {
      urls: [
        'turn:numb.viagenie.ca',
        'turn:numb.viagenie.ca:443?transport=tcp'
      ],
      username: 'webrtc@live.com',
      credential: 'muazkh'
    }
  ],
  iceCandidatePoolSize: 10,
  bundlePolicy: 'max-bundle',
  rtcpMuxPolicy: 'require',
  iceTransportPolicy: 'all',
  sdpSemantics: 'unified-plan'
};

/**
 * Create a new RTCPeerConnection with enhanced configuration 
 * for reliable audio/video streaming
 * @returns RTCPeerConnection with optimized settings
 */
export function createPeerConnection(): RTCPeerConnection {
  const pc = new RTCPeerConnection(iceServers);
  
  // Log connection state changes
  pc.onconnectionstatechange = () => {
    console.log('Connection state:', pc.connectionState);
    if (pc.connectionState === 'connected') {
      console.log('Connection established successfully');
    }
  };

  pc.oniceconnectionstatechange = () => {
    console.log('ICE Connection state:', pc.iceConnectionState);
    if (pc.iceConnectionState === 'connected') {
      console.log('ICE Connection established successfully');
    }
  };

  pc.onicegatheringstatechange = () => {
    console.log('ICE Gathering state:', pc.iceGatheringState);
  };

  pc.onsignalingstatechange = () => {
    console.log('Signaling state:', pc.signalingState);
  };

  // Handle incoming tracks
  pc.ontrack = (event) => {
    console.log('Received track:', {
      kind: event.track.kind,
      id: event.track.id,
      enabled: event.track.enabled,
      streamId: event.streams[0]?.id,
      settings: event.track.getSettings()
    });

    // Ensure track is enabled and not muted
    event.track.enabled = true;

    // Monitor track state
    event.track.onended = () => {
      console.log(`Incoming track ${event.track.id} ended`);
    };

    event.track.onmute = () => {
      console.log(`Incoming track ${event.track.id} muted`);
      event.track.enabled = true; // Keep track enabled even when muted
    };

    event.track.onunmute = () => {
      console.log(`Incoming track ${event.track.id} unmuted`);
      event.track.enabled = true;
    };

    // Log track capabilities
    const capabilities = event.track.getCapabilities();
    console.log(`Track ${event.track.id} capabilities:`, capabilities);
  };
  
  // Add event listeners for connection monitoring
  pc.addEventListener('iceconnectionstatechange', () => {
    console.log(`ICE connection state changed: ${pc.iceConnectionState}`);
    
    // Handle failed connections more gracefully
    if (pc.iceConnectionState === 'failed') {
      console.warn('ICE connection failed, attempting to restart...');
      try {
        pc.restartIce();
      } catch (err) {
        console.error('Failed to restart ICE connection:', err);
      }
    } else if (pc.iceConnectionState === 'disconnected') {
      console.warn('ICE connection disconnected, waiting for reconnection...');
      // Give some time for natural recovery before forcing a restart
      setTimeout(() => {
        if (pc.iceConnectionState === 'disconnected') {
          console.warn('Connection still disconnected, forcing ICE restart...');
          try {
            pc.restartIce();
          } catch (err) {
            console.error('Failed to restart ICE connection:', err);
          }
        }
      }, 5000);
    }
  });
  
  pc.addEventListener('connectionstatechange', () => {
    console.log(`Connection state changed: ${pc.connectionState}`);
    
    // Handle failed connections
    if (pc.connectionState === 'failed') {
      console.warn('Connection failed, attempting to restart connection...');
      try {
        pc.restartIce();
      } catch (err) {
        console.error('Failed to restart connection:', err);
        pc.close();
      }
    }
  });
  
  pc.addEventListener('icecandidateerror', (event) => {
    console.warn('ICE candidate error:', event);
  });
  
  let negotiationInProgress = false;
  pc.addEventListener('negotiationneeded', async () => {
    console.log('Negotiation needed event triggered');
    
    // Prevent concurrent negotiations
    if (negotiationInProgress) {
      console.log('Negotiation already in progress, skipping...');
      return;
    }
    
    try {
      negotiationInProgress = true;
      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true
      });
      await pc.setLocalDescription(offer);
      console.log('Local description set after negotiationneeded event');
    } catch (err) {
      console.error('Error during negotiation:', err);
    } finally {
      negotiationInProgress = false;
    }
  });
  
  return pc;
}

/**
 * Create a WebSocket connection for signaling
 * @returns Promise that resolves to the WebSocket connection
 */
export function createWebSocketConnection(token?: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    try {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.hostname;
      const port = '5000'; // Explicitly set port to 5000
      const wsUrl = `${protocol}//${host}:${port}/ws${token ? `?token=${token}` : ''}`;
      
      console.log('Creating WebSocket connection to:', wsUrl);
      const socket = new WebSocket(wsUrl);
      
      let connectionTimeout: NodeJS.Timeout;

      // Set a connection timeout
      connectionTimeout = setTimeout(() => {
        console.error('WebSocket connection timeout');
        socket.close();
        reject(new Error('WebSocket connection timeout'));
      }, 5000);
      
      socket.onopen = () => {
        console.log('WebSocket connection established successfully');
        clearTimeout(connectionTimeout);
        
        // Add heartbeat to keep connection alive
        const heartbeat = setInterval(() => {
          if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type: 'ping' }));
          } else {
            clearInterval(heartbeat);
          }
        }, 30000);

        // Clean up heartbeat on close
        socket.onclose = () => {
          clearInterval(heartbeat);
          console.log('WebSocket connection closed');
        };

        resolve(socket);
      };
      
      socket.onerror = (error) => {
        console.error('WebSocket connection error:', error);
        clearTimeout(connectionTimeout);
        reject(error);
      };
    } catch (error) {
      console.error('Error creating WebSocket connection:', error);
      reject(error);
    }
  });
}

/**
 * Create an SDP offer to establish a peer connection
 * @param peerConnection The RTCPeerConnection to create an offer for
 * @returns Promise resolving to the created SDP offer
 */
export async function createOffer(peerConnection: RTCPeerConnection): Promise<RTCSessionDescriptionInit> {
  const offer = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(offer);
  return offer;
}

/**
 * Create an SDP answer in response to an offer
 * @param peerConnection The RTCPeerConnection to create an answer for
 * @param offer The remote SDP offer
 * @returns Promise resolving to the created SDP answer
 */
export async function createAnswer(
  peerConnection: RTCPeerConnection,
  offer: RTCSessionDescriptionInit
): Promise<RTCSessionDescriptionInit> {
  await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
  const answer = await peerConnection.createAnswer();
  await peerConnection.setLocalDescription(answer);
  return answer;
}

/**
 * Add a media stream to a peer connection for transmission
 * @param peerConnection The RTCPeerConnection to add tracks to
 * @param stream The MediaStream to add
 */
export async function addMediaStreamToPeerConnection(pc: RTCPeerConnection, stream: MediaStream | null) {
  if (!stream) {
    console.error('No media stream provided');
    return;
  }

  // Remove all existing senders first
  const senders = pc.getSenders();
  for (const sender of senders) {
    pc.removeTrack(sender);
  }

  // Log stream details
  console.log('Adding media stream with tracks:', stream.getTracks().length);
  console.log('Audio tracks:', stream.getAudioTracks().length);
  console.log('Video tracks:', stream.getVideoTracks().length);

  // Add each track from the stream
  for (const track of stream.getTracks()) {
    console.log(`Adding track: ${track.kind}, ID: ${track.id}`);
    console.log(`Track state - enabled: ${track.enabled}, muted: ${track.muted}, readyState: ${track.readyState}`);
    
    // Ensure track is enabled
    track.enabled = true;

    // Set specific parameters for video tracks
    if (track.kind === 'video') {
      track.contentHint = 'detail';  // Optimize for quality
    }

    try {
      const sender = pc.addTrack(track, stream);
      console.log(`Track added successfully, sender created: ${sender.track?.kind}`);

      // Set encoding parameters for video tracks
      if (track.kind === 'video' && sender) {
        const params = sender.getParameters();
        if (!params.encodings) {
          params.encodings = [{}];
        }
        params.encodings[0].maxBitrate = 2500000; // 2.5 Mbps
        params.encodings[0].maxFramerate = 30;
        await sender.setParameters(params);
      }
    } catch (error) {
      console.error(`Error adding track to peer connection:`, error);
    }
  }

  // Log final state
  console.log('Current peer connection state:', pc.connectionState);
  console.log('Current ICE connection state:', pc.iceConnectionState);
  console.log('Number of senders after adding tracks:', pc.getSenders().length);
}

/**
 * Format a WebRTC message for sending through the WebSocket
 * @param type Message type
 * @param meetingId Meeting ID
 * @param from User information
 * @param data Additional data
 * @returns Formatted message object
 */
export function formatWebRTCMessage(
  type: string,
  meetingId: number,
  from: { userId: number; username: string; displayName: string },
  data: any
): any {
  return {
    type,
    meetingId,
    from,
    data,
  };
}