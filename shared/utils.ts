/**
 * Generates a random 6-digit code for meetings
 * @returns A 6-character alphanumeric string
 */
export function generateMeetingCode(): string {
  // Characters to use (excluding similar looking characters like 0, O, 1, I, etc.)
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  
  // Generate a 6-character code
  for (let i = 0; i < 6; i++) {
    const randomIndex = Math.floor(Math.random() * chars.length);
    code += chars[randomIndex];
  }
  
  return code;
}

/**
 * Formats a date to a readable string format
 * @param date Date to format
 * @returns Formatted date string
 */
export function formatDate(date: Date | string): string {
  if (typeof date === 'string') {
    date = new Date(date);
  }
  
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  }).format(date);
}

/**
 * Formats a duration in milliseconds to a readable string
 * @param ms Duration in milliseconds
 * @returns Formatted duration string (e.g., "1h 30m")
 */
export function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  
  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  } else {
    return `${minutes}m`;
  }
}

/**
 * Validates if a string is a valid meeting code
 * @param code The code to validate
 * @returns Boolean indicating if the code is valid
 */
export function isValidMeetingCode(code: string): boolean {
  // Meeting code should be 6 characters long and alphanumeric
  return /^[A-Z0-9]{6}$/.test(code);
}
