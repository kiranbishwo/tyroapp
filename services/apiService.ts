/**
 * API Service
 * Centralized HTTP client for all API calls
 */

import axios, { AxiosInstance, AxiosError, AxiosRequestConfig } from 'axios';
import { getApiConfig, updateApiConfig, ApiConfig, API_ENDPOINTS } from '../config/apiConfig';
import { ActivityLog, Settings } from '../types';
import { getAccessToken } from './tokenStorage';
import { authState } from './authState';

export interface ApiResponse<T = any> {
    success: boolean;
    data?: T;
    error?: string;
    message?: string;
}

export interface TaskTrackingData {
    taskId: string;
    projectId: string;
    taskName: string;
    projectName: string;
    metadata: {
        createdAt: string;
        lastUpdated: string;
        currentSessionStart?: string;
    };
    trackingData: {
        activityLogs: ActivityLog[];
        screenshots: Array<{ id: string; timestamp: number; dataUrl: string; isBlurred: boolean }>;
        webcamPhotos: Array<{ id: string; timestamp: number; dataUrl: string }>;
        urlHistory: Array<{ url: string; title: string; timestamp: number }>;
        activeWindows: any[];
        summary: {
            totalTime: number;
            totalKeystrokes: number;
            totalMouseClicks: number;
            currentSessionKeystrokes: number;
            currentSessionMouseClicks: number;
            totalScreenshots: number;
            totalWebcamPhotos: number;
            totalUrls: number;
            totalActivityLogs: number;
            firstActivity: string | null;
            lastActivity: string;
        };
    };
}

class ApiService {
    private axiosInstance: AxiosInstance;
    private config: ApiConfig;

    constructor() {
        this.config = getApiConfig();
        // Use workspace domain for base URL if available
        const baseUrl = authState.getApiBaseUrl();
        this.axiosInstance = axios.create({
            baseURL: baseUrl || this.config.baseUrl,
            timeout: this.config.timeout,
            headers: {
                'Content-Type': 'application/json',
            },
        });
        
        // Update base URL when workspace changes
        authState.subscribe((state) => {
            if (state.isAuthenticated && state.currentWorkspace) {
                const newBaseUrl = authState.getApiBaseUrl();
                if (newBaseUrl && this.axiosInstance.defaults.baseURL !== newBaseUrl) {
                    this.axiosInstance.defaults.baseURL = newBaseUrl;
                    console.log('[API SERVICE] Updated base URL to:', newBaseUrl);
                }
            }
        });

        // Request interceptor for adding auth token
        this.axiosInstance.interceptors.request.use(
            async (config) => {
                // Priority: OAuth token > API key
                // In Electron, get token via IPC
                let accessToken: string | null = null;
                
                if (typeof window !== 'undefined' && window.electronAPI) {
                    try {
                        const tokenResult = await window.electronAPI.oauthGetAccessToken();
                        accessToken = tokenResult.token;
                    } catch (error) {
                        console.warn('Failed to get OAuth token via IPC:', error);
                    }
                } else {
                    // Non-Electron environment
                    accessToken = await getAccessToken();
                }
                
                if (accessToken) {
                    config.headers.Authorization = `Bearer ${accessToken}`;
                } else if (this.config.apiKey) {
                    config.headers.Authorization = `Bearer ${this.config.apiKey}`;
                }
                return config;
            },
            (error) => {
                return Promise.reject(error);
            }
        );

        // Response interceptor for error handling
        this.axiosInstance.interceptors.response.use(
            (response) => response,
            async (error: AxiosError) => {
                if (error.response) {
                    // Server responded with error status
                    const status = error.response.status;
                    
                    // Handle 401 Unauthorized - token expired or invalid
                    if (status === 401) {
                        console.warn('API Error: Unauthorized - token may be expired');
                        // Could trigger token refresh here if refresh endpoint exists
                    } else {
                        console.error('API Error:', status, error.response.data);
                    }
                } else if (error.request) {
                    // Request made but no response
                    console.error('API Network Error:', error.request);
                } else {
                    // Something else happened
                    console.error('API Error:', error.message);
                }
                return Promise.reject(error);
            }
        );
    }

    /**
     * Update API configuration
     */
    updateConfig(config: Partial<ApiConfig>): void {
        this.config = updateApiConfig(config);
        this.axiosInstance.defaults.baseURL = this.config.baseUrl;
        // Note: OAuth tokens are handled in the request interceptor
        // API key is only used as fallback if no OAuth token exists
    }

    /**
     * Check if API is enabled
     */
    isEnabled(): boolean {
        return this.config.enabled;
    }

    /**
     * Health check
     */
    async healthCheck(): Promise<ApiResponse> {
        try {
            const response = await this.axiosInstance.get(API_ENDPOINTS.HEALTH);
            return {
                success: true,
                data: response.data,
            };
        } catch (error: any) {
            return {
                success: false,
                error: error.message || 'Health check failed',
            };
        }
    }

    /**
     * Authentication
     */
    async login(email: string, password: string): Promise<ApiResponse<{ token: string; user: any }>> {
        try {
            const response = await this.axiosInstance.post(API_ENDPOINTS.AUTH.LOGIN, {
                email,
                password,
            });
            return {
                success: true,
                data: response.data,
            };
        } catch (error: any) {
            return {
                success: false,
                error: error.response?.data?.message || error.message || 'Login failed',
            };
        }
    }

    async logout(): Promise<ApiResponse> {
        try {
            await this.axiosInstance.post(API_ENDPOINTS.AUTH.LOGOUT);
            return { success: true };
        } catch (error: any) {
            return {
                success: false,
                error: error.message || 'Logout failed',
            };
        }
    }

    async getCurrentUser(): Promise<ApiResponse<any>> {
        try {
            const response = await this.axiosInstance.get(API_ENDPOINTS.AUTH.ME);
            return {
                success: true,
                data: response.data,
            };
        } catch (error: any) {
            return {
                success: false,
                error: error.message || 'Failed to get user',
            };
        }
    }

    /**
     * Tasks
     */
    async syncTaskTracking(taskData: TaskTrackingData): Promise<ApiResponse> {
        try {
            const response = await this.axiosInstance.post(
                API_ENDPOINTS.TRACKING.TASK(taskData.projectId, taskData.taskId),
                taskData
            );
            return {
                success: true,
                data: response.data,
            };
        } catch (error: any) {
            return {
                success: false,
                error: error.response?.data?.message || error.message || 'Failed to sync task tracking',
            };
        }
    }

    async syncTaskTrackingBatch(tasks: TaskTrackingData[]): Promise<ApiResponse> {
        try {
            const response = await this.axiosInstance.post(API_ENDPOINTS.TRACKING.SYNC, {
                tasks,
            });
            return {
                success: true,
                data: response.data,
            };
        } catch (error: any) {
            return {
                success: false,
                error: error.response?.data?.message || error.message || 'Failed to sync tasks',
            };
        }
    }

    /**
     * Activity Logs
     */
    async syncActivityLogs(logs: ActivityLog[]): Promise<ApiResponse> {
        try {
            const response = await this.axiosInstance.post(API_ENDPOINTS.ACTIVITY.BATCH, {
                logs,
            });
            return {
                success: true,
                data: response.data,
            };
        } catch (error: any) {
            return {
                success: false,
                error: error.response?.data?.message || error.message || 'Failed to sync activity logs',
            };
        }
    }

    /**
     * Screenshots
     */
    async uploadScreenshot(
        screenshot: { id: string; timestamp: number; dataUrl: string; isBlurred: boolean; taskId?: string; projectId?: string }
    ): Promise<ApiResponse> {
        try {
            const response = await this.axiosInstance.post(API_ENDPOINTS.SCREENSHOTS.UPLOAD, screenshot);
            return {
                success: true,
                data: response.data,
            };
        } catch (error: any) {
            return {
                success: false,
                error: error.response?.data?.message || error.message || 'Failed to upload screenshot',
            };
        }
    }

    async uploadScreenshotsBatch(
        screenshots: Array<{ id: string; timestamp: number; dataUrl: string; isBlurred: boolean; taskId?: string; projectId?: string }>
    ): Promise<ApiResponse> {
        try {
            const response = await this.axiosInstance.post(API_ENDPOINTS.SCREENSHOTS.BATCH, {
                screenshots,
            });
            return {
                success: true,
                data: response.data,
            };
        } catch (error: any) {
            return {
                success: false,
                error: error.response?.data?.message || error.message || 'Failed to upload screenshots',
            };
        }
    }

    /**
     * Webcam Photos
     */
    async uploadWebcamPhoto(
        photo: { id: string; timestamp: number; dataUrl: string; taskId?: string; projectId?: string }
    ): Promise<ApiResponse> {
        try {
            const response = await this.axiosInstance.post(API_ENDPOINTS.WEBCAM.UPLOAD, photo);
            return {
                success: true,
                data: response.data,
            };
        } catch (error: any) {
            return {
                success: false,
                error: error.response?.data?.message || error.message || 'Failed to upload webcam photo',
            };
        }
    }

    async uploadWebcamPhotosBatch(
        photos: Array<{ id: string; timestamp: number; dataUrl: string; taskId?: string; projectId?: string }>
    ): Promise<ApiResponse> {
        try {
            const response = await this.axiosInstance.post(API_ENDPOINTS.WEBCAM.BATCH, {
                photos,
            });
            return {
                success: true,
                data: response.data,
            };
        } catch (error: any) {
            return {
                success: false,
                error: error.response?.data?.message || error.message || 'Failed to upload webcam photos',
            };
        }
    }

    /**
     * Projects
     */
    async getProjects(): Promise<ApiResponse<any[]>> {
        try {
            const response = await this.axiosInstance.get(API_ENDPOINTS.PROJECTS.LIST);
            return {
                success: true,
                data: response.data,
            };
        } catch (error: any) {
            return {
                success: false,
                error: error.message || 'Failed to get projects',
            };
        }
    }

    async createProject(project: any): Promise<ApiResponse> {
        try {
            const response = await this.axiosInstance.post(API_ENDPOINTS.PROJECTS.CREATE, project);
            return {
                success: true,
                data: response.data,
            };
        } catch (error: any) {
            return {
                success: false,
                error: error.response?.data?.message || error.message || 'Failed to create project',
            };
        }
    }

    /**
     * Face Check API
     * Verifies if a user's face matches their registered face data
     * Uses the workspace domain from the current authenticated workspace
     */
    async checkFace(faceData: string): Promise<ApiResponse<{ similarity: number; message: string }>> {
        try {
            // Get login_token directly from localStorage
            const loginToken = localStorage.getItem('login_token');

            if (!loginToken) {
                return {
                    success: false,
                    error: 'Authentication token not found. Please log in again.',
                    message: 'Unauthorized',
                };
            }

            // Get workspace domain (dynamic from authState based on current workspace)
            // Format: http://{workspace_domain}:8000/api/vue/backend/attendance/face/check
            const workspaceDomain = authState.getWorkspaceDomain();
            if (!workspaceDomain) {
                return {
                    success: false,
                    error: 'No workspace domain available. Please ensure you are logged in and have selected a workspace.',
                    message: 'Workspace domain not found',
                };
            }

            // Clean domain (remove protocol and port)
            let cleanDomain = workspaceDomain.replace(/^https?:\/\//, '').split(':')[0];
            
            // Construct the full API URL
            const apiUrl = `http://${cleanDomain}:8000/api/vue/backend/attendance/face/check`;

            console.log('[FACE CHECK] Using workspace domain:', workspaceDomain);
            console.log('[FACE CHECK] API URL:', apiUrl);

            // Remove data URL prefix if present (data:image/png;base64, or data:image/jpeg;base64, etc.)
            let cleanFaceData = faceData;
            if (typeof faceData === 'string' && faceData.includes(',')) {
                // Check if it's a data URL format
                const dataUrlMatch = faceData.match(/^data:image\/[^;]+;base64,(.+)$/);
                if (dataUrlMatch) {
                    cleanFaceData = dataUrlMatch[1]; // Extract only the base64 string
                    console.log('[FACE CHECK] Removed data URL prefix from face_data');
                }
            }

            // Make request directly with axios (not using axiosInstance to use workspace domain)
            const response = await axios.post(apiUrl, {
                face_data: cleanFaceData,
            }, {
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'Authorization': `Bearer ${loginToken}`,
                },
                timeout: this.config.timeout,
            });
            
            // Handle API response format
            if (response.data?.result === true) {
                return {
                    success: true,
                    data: {
                        similarity: response.data.data || 0,
                        message: response.data.message || 'Face matched successfully',
                    },
                };
            } else {
                // Face not matched or other error
                return {
                    success: false,
                    error: response.data?.message || 'Face verification failed',
                    message: response.data?.message || 'Face verification failed',
                };
            }
        } catch (error: any) {
            const errorMessage = error.response?.data?.message || error.message || 'Face check failed';
            console.error('[FACE CHECK] Error:', errorMessage, error);
            return {
                success: false,
                error: errorMessage,
                message: errorMessage,
            };
        }
    }

    /**
     * Generic request method
     */
    async request<T = any>(config: AxiosRequestConfig): Promise<ApiResponse<T>> {
        try {
            const response = await this.axiosInstance.request<T>(config);
            return {
                success: true,
                data: response.data,
            };
        } catch (error: any) {
            return {
                success: false,
                error: error.response?.data?.message || error.message || 'Request failed',
            };
        }
    }

    /**
     * Check-In API
     * Records employee check-in for attendance tracking
     */
    async checkIn(checkInData: {
        check_in: string; // H:i format (e.g., "09:00")
        date: string; // Y-m-d format (e.g., "2025-01-15")
        latitude?: number;
        longitude?: number;
        city?: string;
        country?: string;
        country_code?: string;
        reason?: string;
        remote_mode?: number;
        attendance_from?: string;
        check_in_location?: string;
    }): Promise<ApiResponse<any>> {
        try {
            // Get workspace domain for dynamic URL
            const workspaceDomain = authState.getWorkspaceDomain();
            if (!workspaceDomain) {
                return {
                    success: false,
                    error: 'No workspace domain available. Please ensure you are logged in and have selected a workspace.',
                    message: 'Workspace domain not found',
                };
            }

            // Get login_token from localStorage
            const loginToken = localStorage.getItem('login_token');
            if (!loginToken) {
                return {
                    success: false,
                    error: 'Authentication token not found. Please log in again.',
                    message: 'Unauthorized',
                };
            }

            // Clean domain (remove protocol and port)
            let cleanDomain = workspaceDomain.replace(/^https?:\/\//, '').split(':')[0];
            
            // Construct the full API URL
            const apiUrl = `http://${cleanDomain}:8000/api/vue/backend/attendance/check-in`;

            console.log('[CHECK-IN] Using workspace domain:', workspaceDomain);
            console.log('[CHECK-IN] API URL:', apiUrl);
            console.log('[CHECK-IN] Request data:', checkInData);

            // Make request
            const response = await axios.post(apiUrl, checkInData, {
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'Authorization': `Bearer ${loginToken}`,
                },
                timeout: this.config.timeout,
            });

            // Handle API response
            if (response.data?.result === true) {
                return {
                    success: true,
                    data: response.data.data,
                    message: response.data.message || 'Check-in successful',
                };
            } else {
                return {
                    success: false,
                    error: response.data?.message || 'Check-in failed',
                    message: response.data?.message || 'Check-in failed',
                };
            }
        } catch (error: any) {
            console.error('[CHECK-IN] Error:', error);
            return {
                success: false,
                error: error.response?.data?.message || error.message || 'Check-in failed',
                message: error.response?.data?.message || error.message || 'Check-in failed',
            };
        }
    }

    /**
     * Check-Out API
     * Records employee check-out for attendance tracking
     */
    async checkOut(checkOutData: {
        check_out: string; // H:i format (e.g., "18:00")
        date: string; // Y-m-d format (e.g., "2025-01-15")
        attendance_id?: number; // Optional attendance ID
        latitude?: number;
        longitude?: number;
        city?: string;
        country?: string;
        country_code?: string;
        reason?: string;
        remote_mode?: number;
        attendance_from?: string;
    }): Promise<ApiResponse<any>> {
        try {
            // Get workspace domain for dynamic URL
            const workspaceDomain = authState.getWorkspaceDomain();
            if (!workspaceDomain) {
                return {
                    success: false,
                    error: 'No workspace domain available. Please ensure you are logged in and have selected a workspace.',
                    message: 'Workspace domain not found',
                };
            }

            // Get login_token from localStorage
            const loginToken = localStorage.getItem('login_token');
            if (!loginToken) {
                return {
                    success: false,
                    error: 'Authentication token not found. Please log in again.',
                    message: 'Unauthorized',
                };
            }

            // Clean domain (remove protocol and port)
            let cleanDomain = workspaceDomain.replace(/^https?:\/\//, '').split(':')[0];
            
            // Construct the full API URL (with or without attendance_id)
            const endpoint = API_ENDPOINTS.ATTENDANCE.CHECK_OUT(checkOutData.attendance_id);
            const apiUrl = `http://${cleanDomain}:8000/api${endpoint}`;

            // Remove attendance_id from request body (it's in URL)
            const { attendance_id, ...requestBody } = checkOutData;

            console.log('[CHECK-OUT] Using workspace domain:', workspaceDomain);
            console.log('[CHECK-OUT] API URL:', apiUrl);
            console.log('[CHECK-OUT] Request data:', requestBody);

            // Make request
            const response = await axios.post(apiUrl, requestBody, {
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'Authorization': `Bearer ${loginToken}`,
                },
                timeout: this.config.timeout,
            });

            // Handle API response
            if (response.data?.result === true) {
                return {
                    success: true,
                    data: response.data.data,
                    message: response.data.message || 'Check-out successful',
                };
            } else {
                return {
                    success: false,
                    error: response.data?.message || 'Check-out failed',
                    message: response.data?.message || 'Check-out failed',
                };
            }
        } catch (error: any) {
            console.error('[CHECK-OUT] Error:', error);
            return {
                success: false,
                error: error.response?.data?.message || error.message || 'Check-out failed',
                message: error.response?.data?.message || error.message || 'Check-out failed',
            };
        }
    }
}

// Export singleton instance
export const apiService = new ApiService();
export default apiService;
