/**
 * WebRTC utilities for peer-to-peer connections in meetings
 */

// Configuration for WebRTC peer connections
const config: RTCConfiguration = {
  iceServers: [
    {
      urls: [
        'stun:stun1.l.google.com:19302',
        'stun:stun2.l.google.com:19302'
      ]
    },
    {
      urls: [
        'turn:openrelay.metered.ca:80',
        'turn:openrelay.metered.ca:443',
        'turn:openrelay.metered.ca:443?transport=tcp'
      ],
      username: 'openrelayproject',
      credential: 'openrelayproject'
    }
  ],
  iceCandidatePoolSize: 10,
  bundlePolicy: 'max-bundle',
  rtcpMuxPolicy: 'require',
  iceTransportPolicy: 'all'
};

/**
 * Create a new RTCPeerConnection with enhanced configuration 
 * for reliable audio/video streaming
 * @returns RTCPeerConnection with optimized settings
 */
export function createPeerConnection(): RTCPeerConnection {
  const pc = new RTCPeerConnection(config);
  
  // Log connection state changes
  pc.onconnectionstatechange = () => {
    console.log('Connection state change:', pc.connectionState);
    if (pc.connectionState === 'connected') {
      console.log('Connection established successfully');
    }
  };

  pc.oniceconnectionstatechange = () => {
    console.log('ICE connection state change:', pc.iceConnectionState);
    if (pc.iceConnectionState === 'connected') {
      console.log('ICE Connection established successfully');
    }
  };

  pc.onicegatheringstatechange = () => {
    console.log('ICE gathering state change:', pc.iceGatheringState);
  };

  pc.onsignalingstatechange = () => {
    console.log('Signaling state change:', pc.signalingState);
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
export async function createWebSocketConnection(token?: string): Promise<WebSocket> {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = window.location.hostname;
  const port = '5000';
  const wsUrl = `${protocol}//${host}:${port}/ws${token ? `?token=${token}` : ''}`;

  console.log('Creating WebSocket connection to:', wsUrl);

  return new Promise((resolve, reject) => {
    try {
      const socket = new WebSocket(wsUrl);

      socket.onopen = () => {
        console.log('WebSocket connection established successfully');
        resolve(socket);
      };

      socket.onerror = (error) => {
        console.error('WebSocket connection error:', error);
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
  try {
    const offer = await peerConnection.createOffer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: true
    });

    await peerConnection.setLocalDescription(offer);
    return offer;
  } catch (error) {
    console.error('Error creating offer:', error);
    throw error;
  }
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
  try {
    await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    return answer;
  } catch (error) {
    console.error('Error creating answer:', error);
    throw error;
  }
}

/**
 * Add a media stream to a peer connection for transmission
 * @param peerConnection The RTCPeerConnection to add tracks to
 * @param stream The MediaStream to add
 */
export function addMediaStreamToPeerConnection(
  peerConnection: RTCPeerConnection,
  stream: MediaStream
): void {
  if (!stream) {
    console.error('No stream provided to addMediaStreamToPeerConnection');
    return;
  }

  // Remove existing senders
  const senders = peerConnection.getSenders();
  senders.forEach(sender => {
    peerConnection.removeTrack(sender);
  });

  // Add all tracks from the stream
  stream.getTracks().forEach(track => {
    console.log(`Adding track to peer connection: ${track.kind}`, {
      enabled: track.enabled,
      muted: track.muted,
      readyState: track.readyState
    });

    // Ensure track is enabled
    track.enabled = true;

    // Set content hint for video tracks to maintain quality
    if (track.kind === 'video') {
      track.contentHint = 'detail';
    }

    peerConnection.addTrack(track, stream);
  });

  // Log the current state of tracks in the peer connection
  console.log('Current peer connection senders:', peerConnection.getSenders().length);
  console.log('Audio tracks:', stream.getAudioTracks().length);
  console.log('Video tracks:', stream.getVideoTracks().length);
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
  from: {
    userId: string;
    username: string;
    displayName: string;
  },
  data: any
) {
  return {
    type,
    meetingId,
    from,
    data,
    timestamp: Date.now()
  };
}