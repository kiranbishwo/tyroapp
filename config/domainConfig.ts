/**
 * Central Base URL Configuration
 * 
 * Automatically uses production URL when built for production.
 * Development: 'http://tyrodesk.test:8000'
 * Production: 'https://tyrodesk.com'
 * 
 * Environment is controlled by package.json scripts:
 * - VITE_APP_ENV=development for dev mode
 * - VITE_APP_ENV=production for production mode
 */

// Detect development mode from environment variables (set in package.json scripts)
// Priority: VITE_APP_ENV > import.meta.env.DEV > import.meta.env.MODE
const isDev = (() => {
  // Check VITE_APP_ENV first (set in package.json scripts)
  if (import.meta.env.VITE_APP_ENV === 'production') return false;
  if (import.meta.env.VITE_APP_ENV === 'development') return true;
  
  // Fallback to Vite's built-in env detection
  if (import.meta.env.PROD) return false;
  if (import.meta.env.DEV) return true;
  
  // Final fallback: check MODE
  return import.meta.env.MODE === 'development';
})();

export const BASE_URL = isDev ? 'http://tyrodesk.test:8000' : 'https://tyrodesk.com';
