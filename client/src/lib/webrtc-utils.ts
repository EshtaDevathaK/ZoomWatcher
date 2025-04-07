/**
 * WebRTC utilities for peer-to-peer connections in meetings
 */

// Configuration for WebRTC peer connections
const iceServers = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ],
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
  
  // First ensure all tracks are enabled by default
  stream.getTracks().forEach(track => {
    // The enabled property controls whether the track is active
    if (!track.enabled) {
      console.log(`Enabling initially disabled ${track.kind} track before adding to peer connection`);
      track.enabled = true;
    }
  });
  
  // Log audio tracks to help with debugging
  const audioTracks = stream.getAudioTracks();
  console.log(`Number of audio tracks to add: ${audioTracks.length}`);
  audioTracks.forEach((track, index) => {
    console.log(`Audio track ${index}: enabled=${track.enabled}, muted=${track.muted}, readyState=${track.readyState}`);
  });
  
  // Debug and fix video tracks
  const videoTracks = stream.getVideoTracks();
  console.log(`Number of video tracks to add: ${videoTracks.length}`);
  videoTracks.forEach((track, index) => {
    const settings = track.getSettings();
    console.log(`Video track ${index} settings:`, settings);
    
    // Ensure video track is properly initialized
    if (!track.enabled) {
      console.log(`Enabling video track that was disabled`);
      track.enabled = true;
    }
    
    // Force constraints if needed in Replit environment
    if (!settings.width || !settings.height || settings.width < 100 || settings.height < 100) {
      console.log(`Detected problematic video track dimensions, attempting to fix...`);
      track.applyConstraints({
        width: { ideal: 640 },
        height: { ideal: 480 },
        frameRate: { ideal: 30 }
      }).catch(err => console.error("Could not apply video constraints:", err));
    }
  });
  
  // Now add all tracks from the stream
  stream.getTracks().forEach(track => {
    console.log(`Adding track to peer connection: ${track.kind}, ID: ${track.id}, enabled: ${track.enabled}`);
    peerConnection.addTrack(track, stream);
  });
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