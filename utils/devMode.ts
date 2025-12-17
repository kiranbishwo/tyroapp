/**
 * Development Mode Detection and Conditional Logging
 * 
 * Provides utilities to detect development mode and conditionally log messages
 * to reduce console noise in production builds.
 */

// Detect development mode from environment variables
// Priority: VITE_APP_ENV > import.meta.env.DEV > import.meta.env.MODE
export const isDevMode = (() => {
  // Check VITE_APP_ENV first (set in package.json scripts)
  if (import.meta.env.VITE_APP_ENV === 'production') return false;
  if (import.meta.env.VITE_APP_ENV === 'development') return true;
  
  // Fallback to Vite's built-in env detection
  if (import.meta.env.PROD) return false;
  if (import.meta.env.DEV) return true;
  
  // Final fallback: check MODE
  return import.meta.env.MODE === 'development';
})();

/**
 * Conditional console.log - only logs in development mode
 */
export const devLog = (...args: any[]): void => {
  if (isDevMode) {
    console.log(...args);
  }
};

/**
 * Conditional console.warn - only warns in development mode
 */
export const devWarn = (...args: any[]): void => {
  if (isDevMode) {
    console.warn(...args);
  }
};

/**
 * Conditional console.error - always logs errors, but with less detail in production
 */
export const devError = (message: string, error?: any): void => {
  if (isDevMode) {
    console.error(message, error);
  } else {
    // In production, only log the message without full error details
    console.error(message);
  }
};

