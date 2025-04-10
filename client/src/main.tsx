import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'
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
      globalAudioContext = new AudioContextClass({ latencyHint: 'interactive' });
      
      // Don't try to resume immediately - wait for user interaction
      console.log('Audio context created, waiting for user interaction');
      audioInitialized = true;
    }
  } catch (err) {
    console.error('Failed to initialize global audio context:', err);
  }
}

// Initialize audio context but don't resume until user interaction
document.addEventListener('DOMContentLoaded', initializeGlobalAudio);

// Handle user interaction to resume audio context
const userInteractionEvents = ['click', 'touchstart', 'keydown', 'mousedown'];
userInteractionEvents.forEach(eventType => {
  document.addEventListener(eventType, () => {
    if (globalAudioContext && globalAudioContext.state === 'suspended') {
      globalAudioContext.resume().then(() => {
        console.log('Audio context resumed after user interaction');
      }).catch(err => {
        console.warn('Could not resume audio context:', err);
      });
    }
  }, { once: false }); // Keep listening for interactions
});

// Get the root element
const container = document.getElementById('root');

if (!container) {
  throw new Error('Root element not found');
}

// Create root only once
let root;
if (!(container as any)._reactRoot) {
  root = createRoot(container);
  (container as any)._reactRoot = root;
} else {
  root = (container as any)._reactRoot;
}

root.render(
  <QueryClientProvider client={queryClient}>
    <React.StrictMode>
      <App />
    </React.StrictMode>
  </QueryClientProvider>
);

// Export for use in other components
export function getGlobalAudioContext(): AudioContext | null {
  return globalAudioContext;
}
