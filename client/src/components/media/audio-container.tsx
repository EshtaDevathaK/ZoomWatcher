import { useEffect, useRef } from 'react';
import { getGlobalAudioContext } from '../../main';

interface AudioContainerProps {
  stream: MediaStream | null;
  userId: number;
  muted?: boolean;
}

/**
 * A specialized component that handles audio playback from remote participants.
 * It creates both a standard HTML audio element and uses the Web Audio API
 * for maximum browser compatibility.
 */
export function AudioContainer({ stream, userId, muted = false }: AudioContainerProps) {
  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  const audioContextSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  
  // Connect to global audio context and set up audio processing
  useEffect(() => {
    if (!stream) return;
    
    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0) {
      console.log(`No audio tracks found for participant ${userId}`);
      return;
    }
    
    console.log(`Setting up audio for participant ${userId} with ${audioTracks.length} audio tracks`);
    
    // Always ensure audio tracks are enabled
    audioTracks.forEach(track => {
      if (!track.enabled) {
        console.log(`Enabling audio track for participant ${userId}`);
        track.enabled = true;
      }
    });
    
    // Set up HTML audio element
    if (audioElementRef.current) {
      audioElementRef.current.srcObject = stream;
      audioElementRef.current.muted = muted;
      
      // Attempt to play audio immediately
      const playPromise = audioElementRef.current.play();
      if (playPromise !== undefined) {
        playPromise.catch(err => {
          console.warn(`Play failed for audio element of participant ${userId}:`, err);
          
          // Auto-play might be blocked, try again on user interaction
          const handleUserInteraction = () => {
            if (audioElementRef.current) {
              audioElementRef.current.play().catch(e => {
                console.error(`Still failed to play audio after user interaction:`, e);
              });
            }
          };
          
          // Add one-time event listeners for user interaction
          ['click', 'touchstart', 'keydown'].forEach(event => {
            document.addEventListener(event, handleUserInteraction, { once: true });
          });
        });
      }
    }
    
    // Set up Web Audio API connection (alternative to HTML audio element)
    try {
      const audioContext = getGlobalAudioContext();
      if (audioContext) {
        // Clean up previous audio processing if it exists
        if (audioContextSourceRef.current) {
          try {
            audioContextSourceRef.current.disconnect();
          } catch (e) {
            console.warn('Error disconnecting previous audio source:', e);
          }
        }
        
        // Create new audio processing chain
        const source = audioContext.createMediaStreamSource(stream);
        const gainNode = audioContext.createGain();
        
        // Set volume based on muted state
        gainNode.gain.value = muted ? 0 : 1;
        
        // Connect audio processing chain
        source.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        // Store references for cleanup
        audioContextSourceRef.current = source;
        gainNodeRef.current = gainNode;
        
        console.log(`Successfully set up Web Audio API for participant ${userId}`);
      } else {
        console.warn(`Global audio context not available for participant ${userId}`);
      }
    } catch (err) {
      console.error(`Failed to set up Web Audio API for participant ${userId}:`, err);
    }
    
    return () => {
      // Clean up Web Audio API connections
      if (audioContextSourceRef.current) {
        try {
          audioContextSourceRef.current.disconnect();
          audioContextSourceRef.current = null;
        } catch (e) {
          console.warn('Error disconnecting audio source during cleanup:', e);
        }
      }
      
      if (gainNodeRef.current) {
        try {
          gainNodeRef.current.disconnect();
          gainNodeRef.current = null;
        } catch (e) {
          console.warn('Error disconnecting gain node during cleanup:', e);
        }
      }
      
      // Clean up any event listeners if needed
      console.log(`Audio cleanup complete for participant ${userId}`);
    };
  }, [stream, userId, muted]);
  
  // Update muted state
  useEffect(() => {
    if (audioElementRef.current) {
      audioElementRef.current.muted = muted;
    }
    
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = muted ? 0 : 1;
    }
  }, [muted]);
  
  return (
    <audio 
      ref={audioElementRef}
      autoPlay 
      playsInline 
      muted={muted}
      style={{ display: 'none' }} // Hide the element
      id={`audio-${userId}`}
    />
  );
}