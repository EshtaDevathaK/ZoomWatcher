import { useEffect, useRef, useState } from 'react';
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
  const streamRef = useRef<MediaStream | null>(null);
  const [audioActivated, setAudioActivated] = useState(false);
  
  // Handle direct stream updates when the stream prop changes
  useEffect(() => {
    // Store the stream in a ref to prevent it from being garbage collected
    streamRef.current = stream;
    
    if (!stream) {
      console.log(`No stream available for participant ${userId}`);
      return;
    }
    
    // Always check for and handle audio tracks right away
    const audioTracks = stream.getAudioTracks();
    console.log(`Participant ${userId} stream has ${audioTracks.length} audio tracks`);
    
    // Force all audio tracks to be enabled
    audioTracks.forEach(track => {
      // This is critical - make sure track is enabled for audio to work
      track.enabled = true;
      console.log(`Audio track ${track.id} for user ${userId} set to enabled=${track.enabled}`);
      
      // Add track event listeners to monitor state changes
      track.onended = () => console.log(`Audio track ended for participant ${userId}`);
      track.onmute = () => {
        console.log(`Audio track muted for participant ${userId}`);
        // Important: When the track is muted, we need to ensure it gets re-enabled
        track.enabled = true;
      };
      track.onunmute = () => console.log(`Audio track unmuted for participant ${userId}`);
    });
    
    // Ensure the audio element is updated with the new stream
    if (audioElementRef.current) {
      // Clean up any existing stream first
      if (audioElementRef.current.srcObject) {
        audioElementRef.current.pause();
        audioElementRef.current.srcObject = null;
      }
      
      // Set the new stream
      audioElementRef.current.srcObject = stream;
      audioElementRef.current.muted = muted;
      audioElementRef.current.volume = 1.0; // Ensure volume is at maximum
      
      // Attempt to play immediately
      playAudio();
    }
    
    // Also update WebAudio API processing if available
    setupWebAudioProcessing();
    
  }, [stream, userId]); // Note: muted is handled in a separate effect
  
  // Separate function to attempt audio playback with error handling and recovery
  const playAudio = () => {
    if (!audioElementRef.current || !streamRef.current) return;
    
    console.log(`Attempting to play audio for participant ${userId}`);
    
    // Make sure the audio element reflects the current stream
    if (audioElementRef.current.srcObject !== streamRef.current) {
      audioElementRef.current.srcObject = streamRef.current;
    }
    
    // Try to play the audio
    const playPromise = audioElementRef.current.play();
    if (playPromise !== undefined) {
      playPromise
        .then(() => {
          console.log(`Audio playback started successfully for participant ${userId}`);
          setAudioActivated(true);
        })
        .catch(err => {
          console.warn(`Play failed for audio element of participant ${userId}:`, err);
          
          // Auto-play might be blocked, try again on user interaction
          if (!audioActivated) {
            const handleUserInteraction = () => {
              if (audioElementRef.current && streamRef.current) {
                // Ensure stream is still current
                if (audioElementRef.current.srcObject !== streamRef.current) {
                  audioElementRef.current.srcObject = streamRef.current;
                }
                
                audioElementRef.current.play()
                  .then(() => {
                    console.log(`Audio playback started after user interaction for participant ${userId}`);
                    setAudioActivated(true);
                  })
                  .catch(e => {
                    console.error(`Still failed to play audio after user interaction for participant ${userId}:`, e);
                    
                    // Final fallback - try with WebAudio as a last resort
                    setupWebAudioProcessing();
                  });
              }
            };
            
            // Add one-time event listeners for user interaction
            ['click', 'touchstart', 'keydown'].forEach(event => {
              document.addEventListener(event, handleUserInteraction, { once: true });
            });
          }
        });
    }
  };
  
  // Set up WebAudio API processing as an alternative/backup
  const setupWebAudioProcessing = () => {
    if (!streamRef.current) return;
    
    try {
      const audioContext = getGlobalAudioContext();
      if (!audioContext) {
        console.warn(`Global audio context not available for participant ${userId}`);
        return;
      }
      
      // Resume audio context if it's suspended (browsers require user interaction)
      if (audioContext.state === 'suspended') {
        audioContext.resume().catch(err => {
          console.warn(`Could not resume audio context for user ${userId}:`, err);
        });
      }
      
      // Clean up previous audio processing if it exists
      if (audioContextSourceRef.current) {
        try {
          audioContextSourceRef.current.disconnect();
        } catch (e) {
          console.warn('Error disconnecting previous audio source:', e);
        }
      }
      
      if (gainNodeRef.current) {
        try {
          gainNodeRef.current.disconnect();
        } catch (e) {
          console.warn('Error disconnecting previous gain node:', e);
        }
      }
      
      // Create a new MediaStream containing only audio tracks if any exist
      const audioTracks = streamRef.current.getAudioTracks();
      if (audioTracks.length === 0) {
        console.log(`No audio tracks found to process for participant ${userId}`);
        return;
      }
      
      // Create a new stream with just the audio tracks to avoid video processing overhead
      const audioOnlyStream = new MediaStream(audioTracks);
      
      // Create new audio processing chain
      const source = audioContext.createMediaStreamSource(audioOnlyStream);
      const gainNode = audioContext.createGain();
      
      // Set volume based on muted state
      gainNode.gain.value = muted ? 0 : 1;
      
      // Connect audio processing chain
      source.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      // Store references for cleanup
      audioContextSourceRef.current = source;
      gainNodeRef.current = gainNode;
      
      console.log(`Successfully set up Web Audio API processing for participant ${userId}`);
    } catch (err) {
      console.error(`Failed to set up Web Audio API for participant ${userId}:`, err);
    }
  };
  
  // Update muted state
  useEffect(() => {
    // Handle mute changes in HTML element
    if (audioElementRef.current) {
      audioElementRef.current.muted = muted;
    }
    
    // Handle mute changes in Web Audio API
    if (gainNodeRef.current) {
      try {
        gainNodeRef.current.gain.value = muted ? 0 : 1;
        console.log(`Set gain to ${muted ? 0 : 1} for user ${userId}`);
      } catch (e) {
        console.warn('Error updating gain node:', e);
      }
    }
  }, [muted, userId]);
  
  // Cleanup function for all resources
  useEffect(() => {
    return () => {
      // Clean up WebAudio connections
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
      
      // Clear the stored stream
      streamRef.current = null;
      
      console.log(`Audio container cleanup complete for participant ${userId}`);
    };
  }, [userId]);
  
  // Force attempting audio playback every 2 seconds for the first 10 seconds
  // This helps recover from browsers that initially block autoplay
  useEffect(() => {
    if (!stream || audioActivated) return;
    
    let attempts = 0;
    const maxAttempts = 5; // Try 5 times (10 seconds)
    
    const attemptInterval = setInterval(() => {
      attempts++;
      
      if (attempts > maxAttempts || audioActivated) {
        clearInterval(attemptInterval);
        return;
      }
      
      console.log(`Retry attempt ${attempts}/${maxAttempts} for audio playback of user ${userId}`);
      playAudio();
      
      // Also ensure WebAudio fallback is working
      setupWebAudioProcessing();
    }, 2000);
    
    return () => clearInterval(attemptInterval);
  }, [stream, audioActivated, userId]);
  
  return (
    <audio 
      ref={audioElementRef}
      autoPlay 
      playsInline 
      controls={false}
      muted={muted}
      style={{ display: 'none' }} // Hide the element
      id={`audio-${userId}`}
    />
  );
}