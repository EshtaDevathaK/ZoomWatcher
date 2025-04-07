import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";

// Global audio context initialization for all browsers
// This ensures audio is activated as soon as the app loads
// and prevents "user gesture required for audio" errors
let globalAudioContext: AudioContext | null = null;
let audioInitialized = false;

function initializeGlobalAudio() {
  // Skip if already initialized
  if (audioInitialized) return;
  
  try {
    // Create global audio context with best browser compatibility
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!globalAudioContext && AudioContextClass) {
      globalAudioContext = new AudioContextClass();
      
      // Check context state and resume if needed
      if (globalAudioContext.state === 'suspended') {
        globalAudioContext.resume().catch(err => {
          console.warn('Could not resume audio context:', err);
        });
      }
      
      // Create a silent audio source to activate the audio context
      const silentOscillator = globalAudioContext.createOscillator();
      const gainNode = globalAudioContext.createGain();
      gainNode.gain.value = 0; // Silent
      silentOscillator.connect(gainNode);
      gainNode.connect(globalAudioContext.destination);
      silentOscillator.start();
      silentOscillator.stop(globalAudioContext.currentTime + 0.001);
      
      console.log('Global audio context initialized successfully');
      audioInitialized = true;
      
      // Set up an unlocked event for iOS devices
      unlockAudioForIOS();
    }
  } catch (err) {
    console.error('Failed to initialize global audio context:', err);
  }
}

// Special function to unlock audio on iOS devices
function unlockAudioForIOS() {
  // Create and play a silent audio element
  const silentSound = new Audio();
  silentSound.autoplay = true;
  
  // A data URI representing a silent MP3 file
  silentSound.src = 'data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4LjMyLjEwNAAAAAAAAAAAAAAA//tQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAABQABgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGD//////////////////////////////////////////////////////////////////8AAAAATGF2YzU4LjU0AAAAAAAAAAAAAAAAJAM=';
  
  // Try to play it (will be silent)
  silentSound.play().catch(() => {
    // Expected to fail on iOS without user interaction
    console.log('Silent sound playback failed - requires user interaction');
  });
}

// Initialize audio on page load
initializeGlobalAudio();

// Try to activate audio on each window focus
window.addEventListener('focus', () => {
  if (globalAudioContext && globalAudioContext.state === 'suspended') {
    globalAudioContext.resume().catch(err => {
      console.warn('Could not resume audio context on window focus:', err);
    });
  }
});

// Also try to initialize audio on first user interaction
const userInteractionEvents = ['click', 'touchstart', 'keydown'];
userInteractionEvents.forEach(eventType => {
  document.addEventListener(eventType, () => {
    // Try to resume the audio context if it's suspended
    if (globalAudioContext && globalAudioContext.state === 'suspended') {
      globalAudioContext.resume().then(() => {
        console.log('Audio context resumed after user interaction');
      }).catch(err => {
        console.error('Failed to resume audio context:', err);
      });
    }
    
    // Initialize if not already done
    if (!globalAudioContext) {
      initializeGlobalAudio();
    }
  }, { once: true }); // Only need to do this once per event type
});

// Export for use in other components
export function getGlobalAudioContext(): AudioContext | null {
  return globalAudioContext;
}

createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={queryClient}>
    <App />
  </QueryClientProvider>
);
