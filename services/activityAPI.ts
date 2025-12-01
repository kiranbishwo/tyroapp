/**
 * Activity API Service
 * Standalone API for processing activity JSON input
 * This is the main entry point for the activity tracking system
 * 
 * Usage:
 *   import { processActivityJSON } from './services/activityAPI';
 *   const response = processActivityJSON(input);
 */

import { processActivity, ActivityInput } from './activityProcessor';

/**
 * Process activity from JSON input
 * This is the main function that matches the user's requirements
 * 
 * @param input - JSON object with title, app, url (optional), timestamp (optional)
 * @returns JSON response with category, description, and suggestion
 * 
 * @example
 * const input = {
 *   "title": "YouTube - Chrome",
 *   "app": "Google Chrome",
 *   "url": "https://youtube.com",
 *   "timestamp": 1732989234
 * };
 * 
 * const response = processActivityJSON(input);
 * // Returns:
 * // {
 * //   "category": "Entertainment",
 * //   "description": "You're watching YouTube",
 * //   "suggestion": "Take a short break after 15 minutes"
 * // }
 */
export function processActivityJSON(input: {
    title: string;
    app: string;
    url?: string;
    timestamp?: number;
}): {
    category: string;
    description: string;
    suggestion: string;
} {
    // Validate input
    if (!input || typeof input !== 'object') {
        throw new Error('Input must be an object');
    }
    
    if (!input.title || typeof input.title !== 'string') {
        throw new Error('Input must have a "title" field (string)');
    }
    
    if (!input.app || typeof input.app !== 'string') {
        throw new Error('Input must have an "app" field (string)');
    }

    // Process the activity
    return processActivity(input);
}

/**
 * Process activity from JSON string
 * Convenience function for processing JSON strings
 * 
 * @param jsonString - JSON string with activity data
 * @returns JSON response with category, description, and suggestion
 */
export function processActivityJSONString(jsonString: string): {
    category: string;
    description: string;
    suggestion: string;
} {
    try {
        const input = JSON.parse(jsonString);
        return processActivityJSON(input);
    } catch (error: any) {
        throw new Error(`Invalid JSON: ${error.message}`);
    }
}

// Export for use as a module or API endpoint
export default {
    processActivityJSON,
    processActivityJSONString
};
