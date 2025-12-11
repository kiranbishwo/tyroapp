/**
 * OAuth Device Flow Authentication Service
 * Implements the complete OAuth Device Flow as specified
 */

import axios, { AxiosError } from 'axios';
import { saveTokens, StoredTokens } from './tokenStorage';
import { getApiConfig } from '../config/apiConfig';

export interface DeviceCodeResponse {
    device_code: string;
    user_code: string;
    verification_url: string;
    expires_in: number; // seconds
    interval: number; // seconds
}

export interface AuthTokens {
    access_token: string;
    refresh_token: string;
    token_type: string;
    expires_in: number;
    user: {
        id: number;
        name: string;
        email: string;
        company_id?: number;
    };
}

export interface AuthResult {
    success: boolean;
    tokens?: AuthTokens;
    error?: string;
    message?: string;
}

export class DeviceAuthError extends Error {
    constructor(
        message: string,
        public code?: string,
        public statusCode?: number
    ) {
        super(message);
        this.name = 'DeviceAuthError';
    }
}

export class DeviceAuth {
    private baseUrl: string;
    private maxPollAttempts: number = 120; // 10 minutes at 5 second intervals
    private defaultPollInterval: number = 5; // seconds
    private currentPolling: { cancelled: boolean } | null = null;

    constructor(baseUrl?: string) {
        const config = getApiConfig();
        this.baseUrl = baseUrl || config.baseUrl.replace('/api', '') || 'https://your-domain.com';
    }

    /**
     * Start the device flow by requesting a device code
     */
    async startFlow(): Promise<DeviceCodeResponse> {
        const url = `${this.baseUrl}/api/auth/device/start`;
        
        let lastError: Error | null = null;
        const maxRetries = 3;
        
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                const response = await axios.post(url, {}, {
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    timeout: 30000, // 30 seconds
                });

                if (response.status === 200 && response.data?.result === true) {
                    return response.data.data;
                } else {
                    throw new DeviceAuthError(
                        response.data?.message || 'Failed to generate device code',
                        response.data?.error,
                        response.status
                    );
                }
            } catch (error: any) {
                lastError = error;
                
                if (error instanceof DeviceAuthError) {
                    throw error;
                }

                // Network error - retry with exponential backoff
                if (attempt < maxRetries) {
                    const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
                    console.log(`Network error, retrying in ${delay}ms... (attempt ${attempt}/${maxRetries})`);
                    await this.sleep(delay);
                }
            }
        }

        throw new DeviceAuthError(
            lastError?.message || 'Failed to start device flow after retries',
            'network_error'
        );
    }

    /**
     * Open the verification URL in the user's default browser
     * Note: This class is not used in renderer - OAuth is handled via IPC in main process
     */
    async openBrowser(verificationUrl: string, userCode: string): Promise<void> {
        try {
            // This should only be called from main process
            // In renderer, browser opening is handled via IPC
            if (typeof window !== 'undefined') {
                throw new Error('openBrowser should be called from main process');
            }
            
            // Dynamic require for Electron (main process only)
            const electron = require('electron');
            await electron.shell.openExternal(verificationUrl);
            console.log(`Opened browser: ${verificationUrl}`);
            console.log(`User code: ${userCode}`);
        } catch (error: any) {
            console.error('Failed to open browser:', error);
            // Fallback: show URL and code to user
            throw new DeviceAuthError(
                `Please open this URL in your browser: ${verificationUrl}\nEnter code: ${userCode}`,
                'browser_open_failed'
            );
        }
    }

    /**
     * Poll for authentication token
     */
    async pollForToken(
        deviceCode: string,
        interval: number = this.defaultPollInterval,
        expiresIn: number = 600,
        onProgress?: (attempt: number, maxAttempts: number) => void
    ): Promise<AuthTokens> {
        const url = `${this.baseUrl}/api/auth/device/poll`;
        const startTime = Date.now();
        const expirationTime = startTime + expiresIn * 1000;
        let attempt = 0;

        // Create cancellation token
        const polling = { cancelled: false };
        this.currentPolling = polling;

        try {
            while (attempt < this.maxPollAttempts) {
                // Check if cancelled
                if (polling.cancelled) {
                    throw new DeviceAuthError('Authentication cancelled by user', 'cancelled');
                }

                // Check if device code expired
                if (Date.now() >= expirationTime) {
                    throw new DeviceAuthError(
                        'Device code has expired. Please start a new authentication flow.',
                        'expired_token',
                        410
                    );
                }

                attempt++;
                if (onProgress) {
                    onProgress(attempt, this.maxPollAttempts);
                }

                try {
                    const response = await axios.post(
                        url,
                        { device_code: deviceCode },
                        {
                            headers: {
                                'Content-Type': 'application/json',
                            },
                            timeout: 30000,
                        }
                    );

                    // Success - user authorized
                    if (response.status === 200 && response.data?.result === true) {
                        const data = response.data.data;
                        return {
                            access_token: data.access_token,
                            refresh_token: data.refresh_token,
                            token_type: data.token_type || 'Bearer',
                            expires_in: data.expires_in || 604800,
                            user: data.user,
                        };
                    }

                    // Authorization pending - continue polling
                    if (response.status === 202 || response.data?.error === 'authorization_pending') {
                        // Wait for interval before next poll
                        await this.sleep(interval * 1000);
                        continue;
                    }

                    // Other errors
                    throw new DeviceAuthError(
                        response.data?.message || 'Authentication failed',
                        response.data?.error,
                        response.status
                    );
                } catch (error: any) {
                    if (error instanceof DeviceAuthError) {
                        throw error;
                    }

                    const axiosError = error as AxiosError;
                    if (axiosError.response) {
                        const status = axiosError.response.status;
                        const data = (axiosError.response.data as any);

                        // Handle specific error codes
                        if (status === 410 || data?.error === 'expired_token') {
                            throw new DeviceAuthError(
                                'Device code has expired. Please start a new authentication flow.',
                                'expired_token',
                                410
                            );
                        }

                        if (status === 400 || data?.error === 'code_already_used') {
                            throw new DeviceAuthError(
                                'Device code has already been used.',
                                'code_already_used',
                                400
                            );
                        }

                        if (status === 404) {
                            throw new DeviceAuthError(
                                'Invalid device code.',
                                'invalid_code',
                                404
                            );
                        }

                        if (status === 202 || data?.error === 'authorization_pending') {
                            // Continue polling
                            await this.sleep(interval * 1000);
                            continue;
                        }

                        throw new DeviceAuthError(
                            data?.message || 'Authentication failed',
                            data?.error,
                            status
                        );
                    }

                    // Network error - retry after interval
                    console.warn(`Network error during poll (attempt ${attempt}):`, error.message);
                    await this.sleep(interval * 1000);
                }
            }

            // Timeout - user didn't authorize in time
            throw new DeviceAuthError(
                'Authentication timeout. Please try again.',
                'timeout'
            );
        } finally {
            if (this.currentPolling === polling) {
                this.currentPolling = null;
            }
        }
    }

    /**
     * Complete authentication flow
     */
    async authenticate(
        onProgress?: (message: string, step?: number, totalSteps?: number) => void
    ): Promise<AuthResult> {
        try {
            // Step 1: Start device flow
            if (onProgress) {
                onProgress('Requesting device code...', 1, 4);
            }
            const deviceCodeData = await this.startFlow();

            if (onProgress) {
                onProgress(`Device code received: ${deviceCodeData.user_code}`, 2, 4);
            }

            // Step 2: Open browser
            if (onProgress) {
                onProgress('Opening browser for verification...', 2, 4);
            }
            try {
                await this.openBrowser(deviceCodeData.verification_url, deviceCodeData.user_code);
            } catch (error: any) {
                if (error.code === 'browser_open_failed') {
                    // Continue with polling even if browser failed to open
                    console.warn('Browser open failed, but continuing with polling');
                } else {
                    throw error;
                }
            }

            // Step 3: Poll for token
            if (onProgress) {
                onProgress('Waiting for authorization...', 3, 4);
            }
            const tokens = await this.pollForToken(
                deviceCodeData.device_code,
                deviceCodeData.interval || this.defaultPollInterval,
                deviceCodeData.expires_in || 600,
                (attempt, maxAttempts) => {
                    if (onProgress) {
                        onProgress(`Waiting for authorization... (attempt ${attempt}/${maxAttempts})`, 3, 4);
                    }
                }
            );

            // Step 4: Save tokens
            if (onProgress) {
                onProgress('Saving authentication tokens...', 4, 4);
            }
            const saved = await saveTokens({
                access_token: tokens.access_token,
                refresh_token: tokens.refresh_token,
                token_type: tokens.token_type,
                expires_in: tokens.expires_in,
                user: tokens.user,
            });

            if (!saved) {
                throw new DeviceAuthError('Failed to save authentication tokens');
            }

            if (onProgress) {
                onProgress('Authentication successful!', 4, 4);
            }

            return {
                success: true,
                tokens,
                message: `Authenticated as ${tokens.user.name} (${tokens.user.email})`,
            };
        } catch (error: any) {
            const message = error instanceof DeviceAuthError
                ? error.message
                : error.message || 'Authentication failed';

            return {
                success: false,
                error: message,
                message,
            };
        }
    }

    /**
     * Cancel ongoing authentication
     */
    cancel(): void {
        if (this.currentPolling) {
            this.currentPolling.cancelled = true;
        }
    }

    /**
     * Sleep utility
     */
    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Export singleton instance
export const deviceAuth = new DeviceAuth();

