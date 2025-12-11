/**
 * Secure Token Storage Service
 * Uses keytar for OS-native secure credential storage
 * In Electron, tokens are stored in the main process via keytar
 * This service is for renderer process - it uses IPC to communicate with main process
 */

const SERVICE_NAME = 'tyro-app';
const ACCESS_TOKEN_KEY = 'access_token';
const REFRESH_TOKEN_KEY = 'refresh_token';
const USER_DATA_KEY = 'user_data';

// Check if we're in Electron renderer process
const isElectron = typeof window !== 'undefined' && window.electronAPI;

export interface StoredTokens {
    access_token: string;
    refresh_token: string;
    token_type?: string;
    expires_in?: number;
    expires_at?: number; // Unix timestamp
    user?: {
        id: number;
        name: string;
        email: string;
        company_id?: number;
    };
}

/**
 * Save tokens securely using OS keychain
 * In Electron, this should be called from main process only
 * This function is not used in renderer process - tokens are saved via IPC
 */
export async function saveTokens(tokens: StoredTokens): Promise<boolean> {
    try {
        // In Electron renderer, tokens are saved via IPC in main process
        // This function should not be called from renderer
        if (isElectron) {
            console.warn('saveTokens should be called from main process in Electron');
            return false;
        }

        // This would only work in Node.js environment (not Electron renderer)
        // For Electron, use IPC handlers in main process
        throw new Error('saveTokens must be called from main process in Electron');
    } catch (error) {
        console.error('Error saving tokens:', error);
        return false;
    }
}

/**
 * Load tokens from secure storage
 * In Electron renderer, uses IPC to get tokens from main process
 */
export async function loadTokens(): Promise<StoredTokens | null> {
    try {
        // In Electron renderer, get tokens via IPC
        if (isElectron && window.electronAPI) {
            const status = await window.electronAPI.oauthCheckStatus();
            if (status.authenticated) {
                // Return token info (actual token is retrieved via IPC in API service)
                return {
                    access_token: '', // Will be retrieved via IPC when needed
                    refresh_token: '',
                    user: status.user,
                    expires_at: status.expires_at,
                };
            }
            return null;
        }

        // This would only work in Node.js environment (not Electron renderer)
        // For Electron, use IPC handlers in main process
        return null;
    } catch (error) {
        console.error('Error loading tokens:', error);
        return null;
    }
}

/**
 * Check if tokens exist
 * In Electron, uses IPC to check with main process
 */
export async function hasTokens(): Promise<boolean> {
    try {
        if (isElectron && window.electronAPI) {
            const status = await window.electronAPI.oauthCheckStatus();
            return status.authenticated;
        }
        return false;
    } catch (error) {
        console.error('Error checking tokens:', error);
        return false;
    }
}

/**
 * Check if access token is expired
 * In Electron, uses IPC to check with main process
 */
export async function isTokenExpired(): Promise<boolean> {
    try {
        if (isElectron && window.electronAPI) {
            const status = await window.electronAPI.oauthCheckStatus();
            if (!status.authenticated) {
                return true; // Not authenticated = expired
            }
            if (status.expires_at) {
                return Date.now() >= status.expires_at;
            }
            return false; // Can't determine, assume not expired
        }
        return true; // Assume expired if not in Electron
    } catch (error) {
        console.error('Error checking token expiration:', error);
        return true; // Assume expired on error
    }
}

/**
 * Delete all stored tokens (logout)
 * In Electron, uses IPC to delete tokens in main process
 */
export async function deleteTokens(): Promise<boolean> {
    try {
        if (isElectron && window.electronAPI) {
            const result = await window.electronAPI.oauthLogout();
            return result.success;
        }
        return false;
    } catch (error) {
        console.error('Error deleting tokens:', error);
        return false;
    }
}

/**
 * Get access token (for API calls)
 * In Electron, this needs to be handled via IPC or main process
 */
export async function getAccessToken(): Promise<string | null> {
    try {
        // In Electron, we need to get token from main process
        // For now, we'll need to add an IPC handler for this
        // Or handle it in the main process API calls
        if (isElectron) {
            // Tokens are stored in main process, API calls should be made from there
            // Or we need an IPC handler to get the token
            // For now, return null and let the API service handle it
            return null;
        }

        const tokens = await loadTokens();
        return tokens?.access_token || null;
    } catch (error) {
        console.error('Error getting access token:', error);
        return null;
    }
}

