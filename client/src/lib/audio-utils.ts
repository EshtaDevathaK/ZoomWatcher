/**
 * Creates an audio analyser for a given media stream
 * @param stream The media stream to analyze
 * @returns AudioContext and AnalyserNode for the stream
 */
export async function createAudioAnalyser(stream: MediaStream): Promise<{ 
  audioContext: AudioContext;
  analyser: AnalyserNode;
}> {
  // Create audio context
  const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  
  // Create analyser node
  const analyser = audioContext.createAnalyser();
  analyser.fftSize = 2048;
  analyser.smoothingTimeConstant = 0.8;
  
  // Connect the stream to the analyser
  const source = audioContext.createMediaStreamSource(stream);
  source.connect(analyser);
  
  return { audioContext, analyser };
}

/**
 * Detects if there is silence in the audio
 * @param analyser The audio analyser node
 * @param threshold Volume threshold to consider silence (0-255)
 * @returns Boolean indicating if silence is detected
 */
export async function detectSilence(
  analyser: AnalyserNode, 
  threshold: number = 20
): Promise<boolean> {
  // Create a typed array to receive the frequency data
  const dataArray = new Uint8Array(analyser.frequencyBinCount);
  
  // Get the frequency data
  analyser.getByteFrequencyData(dataArray);
  
  // Calculate the average volume
  const average = dataArray.reduce((sum, value) => sum + value, 0) / dataArray.length;
  
  // Return true if average is below threshold (silence)
  return average < threshold;
}

/**
 * Gets the current volume level from an analyser node
 * @param analyser The audio analyser node
 * @returns Volume level between 0-1
 */
export function getVolumeLevel(analyser: AnalyserNode): number {
  const dataArray = new Uint8Array(analyser.frequencyBinCount);
  analyser.getByteFrequencyData(dataArray);
  
  // Calculate the average volume and normalize to 0-1
  const average = dataArray.reduce((sum, value) => sum + value, 0) / dataArray.length;
  return average / 255;
}
