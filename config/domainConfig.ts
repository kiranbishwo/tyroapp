/**
 * Central Base URL Configuration
 * 
 * Automatically uses production URL when built for production.
 * Development: 'http://tyrodesk.test:8000'
 * Production: 'https://tyrodesk.com'
 */

// Production mode - set to false for production, true for development
const isDev = false;

export const BASE_URL = isDev ? 'http://tyrodesk.test:8000' : 'https://tyrodesk.com';
