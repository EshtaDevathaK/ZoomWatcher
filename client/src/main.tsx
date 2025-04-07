import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";

// Global audio context initialization for all browsers
// This ensures audio is activated as soon as the app loads
// and prevents "user gesture required for audio" errors
let globalAudioContext: AudioContext | null = null;

function initializeGlobalAudio() {
  try {
    // Create global audio context with best browser compatibility
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!globalAudioContext && AudioContextClass) {
      globalAudioContext = new AudioContextClass();
      
      // Create a silent audio source to activate the audio context
      const silentOscillator = globalAudioContext.createOscillator();
      const gainNode = globalAudioContext.createGain();
      gainNode.gain.value = 0; // Silent
      silentOscillator.connect(gainNode);
      gainNode.connect(globalAudioContext.destination);
      silentOscillator.start();
      silentOscillator.stop(globalAudioContext.currentTime + 0.001);
      
      console.log('Global audio context initialized successfully');
    }
  } catch (err) {
    console.error('Failed to initialize global audio context:', err);
  }
}

// Initialize audio on page load
initializeGlobalAudio();

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
