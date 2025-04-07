/**
 * WebRTC utilities for peer-to-peer connections in meetings
 */

// Configuration for WebRTC peer connections with enhanced server list
const iceServers: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
    { urls: 'stun:stun.ekiga.net' },
    { urls: 'stun:stun.ideasip.com' },
    { urls: 'stun:stun.schlund.de' },
  ],
  iceCandidatePoolSize: 10,
  bundlePolicy: 'max-bundle' as RTCBundlePolicy,
  rtcpMuxPolicy: 'require' as RTCRtcpMuxPolicy
};

/**
 * Create a new RTCPeerConnection with proper configuration
 * @returns RTCPeerConnection with ICE servers configured
 */
export function createPeerConnection(): RTCPeerConnection {
  return new RTCPeerConnection(iceServers);
}

/**
 * Create a WebSocket connection for signaling
 * @returns Promise that resolves to the WebSocket connection
 */
export function createWebSocketConnection(): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    
    const socket = new WebSocket(wsUrl);
    socket.onopen = () => resolve(socket);
    socket.onerror = (error) => reject(error);
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
export function addMediaStreamToPeerConnection(peerConnection: RTCPeerConnection, stream: MediaStream): void {
  // Remove all existing senders first to avoid stale tracks
  const senders = peerConnection.getSenders();
  senders.forEach(sender => {
    if (sender.track) {
      console.log(`Removing existing track: ${sender.track.kind}, ID: ${sender.track.id}`);
      peerConnection.removeTrack(sender);
    }
  });
  
  // First check if stream is valid and has tracks
  if (!stream) {
    console.error("Cannot add null stream to peer connection");
    return;
  }
  
  const allTracks = stream.getTracks();
  if (allTracks.length === 0) {
    console.error("Stream has no tracks to add to peer connection");
    return;
  }
  
  console.log(`Stream has ${allTracks.length} total tracks to process`);
  
  // First ensure all tracks are properly initialized and enabled by default
  // The actual muting/unmuting will be controlled via the 'enabled' property later
  stream.getTracks().forEach(track => {
    // Make sure the track is not stopped
    if (track.readyState === 'ended') {
      console.warn(`Track ${track.id} (${track.kind}) is in 'ended' state and may not work`);
    }
    
    // The enabled property controls whether the track is active
    if (!track.enabled) {
      console.log(`Enabling initially disabled ${track.kind} track before adding to peer connection`);
      track.enabled = true;
    }
  });
  
  // Process audio tracks specifically
  const audioTracks = stream.getAudioTracks();
  console.log(`Number of audio tracks to add: ${audioTracks.length}`);
  
  if (audioTracks.length === 0) {
    console.warn("No audio tracks found in the stream - participants may not hear audio");
  } else {
    audioTracks.forEach((track, index) => {
      console.log(`Audio track ${index}: enabled=${track.enabled}, muted=${track.muted}, readyState=${track.readyState}`);
      
      // Ensure audio track is enabled (not muted by default)
      // The UI controls will toggle this as needed
      track.enabled = true;
      
      // Apply audio constraints for better quality
      try {
        track.applyConstraints({
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }).catch(err => console.log("Could not apply audio constraints:", err));
      } catch (e) {
        console.log("Error applying audio constraints:", e);
      }
    });
  }
  
  // Process video tracks specifically
  const videoTracks = stream.getVideoTracks();
  console.log(`Number of video tracks to add: ${videoTracks.length}`);
  
  if (videoTracks.length === 0) {
    console.warn("No video tracks found in the stream - participants may not see video");
  } else {
    videoTracks.forEach((track, index) => {
      const settings = track.getSettings();
      console.log(`Video track ${index} settings:`, settings);
      
      // Ensure video track is properly initialized and enabled
      track.enabled = true;
      
      // Force constraints if needed for better video quality and compatibility
      try {
        // If dimensions are missing or very low, try to set reasonable defaults
        if (!settings.width || !settings.height || settings.width < 100 || settings.height < 100) {
          console.log(`Detected problematic video dimensions, attempting to fix...`);
          track.applyConstraints({
            width: { ideal: 640 },
            height: { ideal: 480 },
            frameRate: { ideal: 30 }
          }).catch(err => console.error("Could not apply video constraints:", err));
        }
        // If frame rate is too low or not set, try to improve it
        else if (!settings.frameRate || settings.frameRate < 15) {
          console.log(`Detected low frame rate (${settings.frameRate}), attempting to improve...`);
          track.applyConstraints({
            frameRate: { ideal: 30, min: 15 }
          }).catch(err => console.error("Could not apply frame rate constraint:", err));
        }
      } catch (e) {
        console.log("Error applying video constraints:", e);
      }
    });
  }
  
  // Now add all tracks from the stream to the peer connection
  stream.getTracks().forEach(track => {
    console.log(`Adding track to peer connection: ${track.kind}, ID: ${track.id}, enabled: ${track.enabled}, readyState: ${track.readyState}`);
    
    try {
      // This is where we actually add the track to the connection for transmission
      peerConnection.addTrack(track, stream);
    } catch (e) {
      console.error(`Failed to add ${track.kind} track to peer connection:`, e);
    }
  });
  
  // Set up quality parameters to help with performance
  try {
    const transceivers = peerConnection.getTransceivers();
    transceivers.forEach(transceiver => {
      if (transceiver.sender && transceiver.sender.track) {
        // Set different encoding parameters based on track type
        const trackType = transceiver.sender.track.kind;
        
        // Get current parameters (avoid mutation)
        const params = transceiver.sender.getParameters();
        
        if (trackType === 'audio') {
          // For audio, we just set degradation preference to maintain framerate
          if (params.degradationPreference !== 'maintain-framerate') {
            params.degradationPreference = 'maintain-framerate';
            try {
              transceiver.sender.setParameters(params);
            } catch (err) {
              console.log("Could not set audio parameters:", err);
            }
          }
        } else if (trackType === 'video') {
          // For video, we set degradation to balanced
          if (params.degradationPreference !== 'balanced') {
            params.degradationPreference = 'balanced';
            try {
              transceiver.sender.setParameters(params);
            } catch (err) {
              console.log("Could not set video parameters:", err);
            }
          }
        }
      }
    });
  } catch (e) {
    console.log("Error setting quality parameters:", e);
  }
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