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
  // First check if we already have senders for these tracks
  const senders = peerConnection.getSenders();
  const currentTracks = senders.map(sender => sender.track?.id);
  
  // Add each track from the stream if not already added
  stream.getTracks().forEach(track => {
    // Check if this track is already in the peer connection
    if (!currentTracks.includes(track.id)) {
      console.log(`Adding track to peer connection: ${track.kind}, ID: ${track.id}, enabled: ${track.enabled}`);
      peerConnection.addTrack(track, stream);
    }
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