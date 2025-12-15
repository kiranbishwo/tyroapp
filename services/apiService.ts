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
        screenshots: Array<{ 
            id: string; 
            timestamp: number; 
            fileUrl?: string; // Server URL (preferred)
            dataUrl?: string; // Base64 (fallback/legacy)
            isBlurred: boolean;
            taskId?: string;
            projectId?: string;
        }>;
        webcamPhotos: Array<{ 
            id: string; 
            timestamp: number; 
            fileUrl?: string; // Server URL (preferred)
            dataUrl?: string; // Base64 (fallback/legacy)
            taskId?: string;
            projectId?: string;
        }>;
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
                // Priority: login_token (from localStorage) > OAuth token > API key
                // This matches how check-in/check-out APIs work
                let accessToken: string | null = null;
                
                // First, try to get login_token from localStorage (same as check-in/check-out)
                if (typeof window !== 'undefined') {
                    const loginToken = localStorage.getItem('login_token');
                    if (loginToken) {
                        accessToken = loginToken;
                        console.log('[API] Using login_token from localStorage (length:', loginToken.length, ')');
                    } else {
                        console.log('[API] No login_token found in localStorage');
                    }
                }
                
                // Fallback to OAuth token if login_token not available
                if (!accessToken) {
                    if (typeof window !== 'undefined' && window.electronAPI) {
                        try {
                            const tokenResult = await window.electronAPI.oauthGetAccessToken();
                            accessToken = tokenResult.token;
                            if (accessToken) {
                                console.log('[API] Using OAuth token from IPC');
                            }
                        } catch (error) {
                            console.warn('Failed to get OAuth token via IPC:', error);
                        }
                    } else {
                        // Non-Electron environment
                        accessToken = await getAccessToken();
                        if (accessToken) {
                            console.log('[API] Using token from tokenStorage');
                        }
                    }
                }
                
                // Set Authorization header
                if (accessToken) {
                    config.headers.Authorization = `Bearer ${accessToken}`;
                } else if (this.config.apiKey) {
                    config.headers.Authorization = `Bearer ${this.config.apiKey}`;
                    console.log('[API] Using API key as fallback');
                } else {
                    console.warn('[API] No authentication token available');
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
     * Projects API (v1)
     */
    async getProjects(params?: { workspace_id?: string; search?: string }): Promise<ApiResponse<any[]>> {
        try {
            const url = API_ENDPOINTS.PROJECTS.LIST;
            const fullUrl = `${this.axiosInstance.defaults.baseURL}${url}`;
            console.log('[PROJECTS API] Request URL:', fullUrl);
            console.log('[PROJECTS API] Params:', params);
            console.log('[PROJECTS API] Base URL:', this.axiosInstance.defaults.baseURL);
            
            const response = await this.axiosInstance.get(url, {
                params,
            });
            
            console.log('[PROJECTS API] Response status:', response.status);
            console.log('[PROJECTS API] Response data:', response.data);
            
            // Handle API response format: { result: true, message: "...", data: [...] }
            if (response.data?.result === true && Array.isArray(response.data.data)) {
                return {
                    success: true,
                    data: response.data.data,
                    message: response.data.message,
                };
            }
            
            // Fallback for different response format
            return {
                success: true,
                data: Array.isArray(response.data) ? response.data : response.data?.data || [],
            };
        } catch (error: any) {
            console.error('[PROJECTS API] Error:', error);
            console.error('[PROJECTS API] Error response:', error.response?.data);
            console.error('[PROJECTS API] Error status:', error.response?.status);
            return {
                success: false,
                error: error.response?.data?.message || error.message || 'Failed to get projects',
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
     * Tasks API (v1)
     */
    async getTasks(params?: { project_id?: string; workspace_id?: string; search?: string }): Promise<ApiResponse<any[]>> {
        try {
            const response = await this.axiosInstance.get(API_ENDPOINTS.TASKS.LIST, {
                params,
            });
            
            // Handle API response format: { result: true, message: "...", data: [...] }
            if (response.data?.result === true && Array.isArray(response.data.data)) {
                return {
                    success: true,
                    data: response.data.data,
                    message: response.data.message,
                };
            }
            
            // Fallback for different response format
            return {
                success: true,
                data: Array.isArray(response.data) ? response.data : response.data?.data || [],
            };
        } catch (error: any) {
            return {
                success: false,
                error: error.response?.data?.message || error.message || 'Failed to get tasks',
            };
        }
    }

    /**
     * Tracking Data API (v1)
     */
    async uploadTrackingFile(
        projectId: string,
        taskId: string,
        file: File | Blob,
        workspaceId?: string
    ): Promise<ApiResponse> {
        try {
            // Verify token before making request
            const loginToken = typeof window !== 'undefined' ? localStorage.getItem('login_token') : null;
            console.log('[UPLOAD API] Token check:', {
                hasLoginToken: !!loginToken,
                tokenLength: loginToken?.length || 0,
                tokenPreview: loginToken ? `${loginToken.substring(0, 20)}...` : 'none',
            });

            const formData = new FormData();
            formData.append('project_id', projectId);
            formData.append('task_id', taskId);
            formData.append('file', file);
            // Add compression flag if file is gzipped
            const isGzipped = (file instanceof File && file.name.endsWith('.gz')) || 
                             (file.type === 'application/gzip');
            if (isGzipped) {
                formData.append('compressed', 'true');
            }
            if (workspaceId) {
                formData.append('workspace_id', workspaceId);
            }

            // Log FormData contents
            console.log('[UPLOAD API] 📦 FormData contents:', {
                project_id: projectId,
                task_id: taskId,
                workspace_id: workspaceId || 'not provided',
                file: {
                    name: file instanceof File ? file.name : 'blob',
                    type: file.type,
                    size: file.size,
                },
            });

            // Read and log file contents (for verification) - CLONE the file first to avoid consuming the original
            if (file instanceof File || file instanceof Blob) {
                try {
                    // Clone the file to read it without consuming the original
                    const fileClone = file instanceof File 
                        ? new File([file], file.name, { type: file.type })
                        : new Blob([file], { type: file.type });
                    
                    const fileText = await fileClone.text();
                    console.log('[UPLOAD API] 📄 File contents (first 500 chars):', fileText.substring(0, 500));
                    console.log('[UPLOAD API] 📄 File contents (full length):', fileText.length, 'characters');
                    
                    // Parse and log JSON structure
                    try {
                        const fileData = JSON.parse(fileText);
                        console.log('[UPLOAD API] 📋 Parsed JSON structure:', {
                            version: fileData.version,
                            metadata: fileData.metadata,
                            trackingDataKeys: Object.keys(fileData.trackingData || {}),
                            activityLogsCount: fileData.trackingData?.activityLogs?.length || 0,
                            windowTrackingCount: fileData.trackingData?.windowTracking?.length || 0,
                            screenshotsCount: fileData.trackingData?.screenshots?.length || 0,
                            webcamPhotosCount: fileData.trackingData?.webcamPhotos?.length || 0,
                            urlHistoryCount: fileData.trackingData?.urlHistory?.length || 0,
                            summary: fileData.trackingData?.summary,
                        });
                    } catch (parseError) {
                        console.error('[UPLOAD API] ❌ Failed to parse file as JSON:', parseError);
                    }
                } catch (readError) {
                    console.warn('[UPLOAD API] ⚠️ Could not read file for logging (non-critical):', readError);
                }
            }

            const url = API_ENDPOINTS.TRACKING.UPLOAD_FILE;
            let baseUrl = this.axiosInstance.defaults.baseURL || '';
            const originalBaseUrl = baseUrl;
            
            // Remove version prefix (e.g., /v11, /v12) if present
            // Documentation says: /api/vue/backend/v1 (NOT /api/v11/vue/backend/v1)
            if (baseUrl.match(/\/v\d+$/)) {
                baseUrl = baseUrl.replace(/\/v\d+$/, '');
                console.log('[UPLOAD API] ⚠️  Removed version prefix from baseURL');
            }
            // Also handle version in middle of path
            baseUrl = baseUrl.replace(/\/v\d+\//g, '/');
            
            const fullUrl = `${baseUrl}${url}`;
            
            // Verify route matches documentation (should be /api/vue/backend/v1/tracking-files/upload)
            const expectedRoute = '/api/vue/backend/v1/tracking-files/upload';
            const actualRoute = fullUrl.replace(/^https?:\/\/[^\/]+/, '');
            
            console.log('[UPLOAD API] 📋 Configuration:', {
                originalBaseURL: originalBaseUrl,
                cleanedBaseURL: baseUrl,
                endpoint: url,
                fullURL: fullUrl,
                expectedRoute: expectedRoute,
                actualRoute: actualRoute,
                routeMatch: actualRoute === expectedRoute,
            });
            
            if (actualRoute !== expectedRoute) {
                console.error('[UPLOAD API] ⚠️  ROUTE MISMATCH!');
                console.error('[UPLOAD API] Expected:', expectedRoute);
                console.error('[UPLOAD API] Actual:', actualRoute);
                console.error('[UPLOAD API] Full URL:', fullUrl);
                throw new Error(`Route mismatch! Expected ${expectedRoute}, got ${actualRoute}`);
            }
            
            console.log('[UPLOAD API] 🚀 Making POST request to:', fullUrl);
            console.log('[UPLOAD API] Request params:', { projectId, taskId, workspaceId, fileSize: file.size });
            console.log('[UPLOAD API] FormData entries:', {
                hasProjectId: formData.has('project_id'),
                hasTaskId: formData.has('task_id'),
                hasFile: formData.has('file'),
                hasWorkspaceId: formData.has('workspace_id'),
            });

            console.log('[UPLOAD API] ⏳ Sending HTTP POST request...');
            console.log('[UPLOAD API] 📋 Request configuration:', {
                method: 'POST',
                url: url,
                baseURL: baseUrl,
                fullURL: fullUrl,
                hasFormData: true,
                headers: {
                    'Content-Type': 'multipart/form-data',
                    'Authorization': 'Bearer [REDACTED]',
                },
            });
            
            // Temporarily override baseURL to use cleaned version, then restore
            const originalBaseURL = this.axiosInstance.defaults.baseURL;
            let response;
            const requestStartTime = Date.now();
            
            try {
                this.axiosInstance.defaults.baseURL = baseUrl;
                console.log('[UPLOAD API] 📤 Request sent at:', new Date().toISOString());
                response = await this.axiosInstance.post(
                    url,
                    formData,
                    {
                        headers: {
                            'Content-Type': 'multipart/form-data',
                        },
                    }
                );
                const requestDuration = Date.now() - requestStartTime;
                console.log('[UPLOAD API] ✅ Request completed!');
                console.log('[UPLOAD API] ⏱️  Request duration:', requestDuration, 'ms');
            } catch (requestError: any) {
                const requestDuration = Date.now() - requestStartTime;
                console.error('[UPLOAD API] ❌ Request failed after', requestDuration, 'ms');
                throw requestError;
            } finally {
                // Restore original baseURL
                this.axiosInstance.defaults.baseURL = originalBaseURL;
            }

            console.log('[UPLOAD API] Response status:', response.status);
            console.log('[UPLOAD API] Response data:', response.data);

            // Handle 202 Accepted response (file queued) - per documentation
            // 202 Accepted means file was queued for background processing
            if (response.status === 202 || response.data?.result === true) {
                const message = response.data?.message || 'Tracking data queued for processing';
                console.log('[UPLOAD API] ✅ File queued successfully (202 Accepted)');
                console.log('[UPLOAD API] ℹ️  Processing happens in background. Typical processing time: 5-30 seconds');
                return {
                    success: true,
                    data: response.data,
                    message: message,
                };
            }

            // Handle other success responses (200 OK)
            if (response.status === 200) {
                console.log('[UPLOAD API] ✅ Upload successful (200 OK)');
                return {
                    success: true,
                    data: response.data,
                    message: response.data?.message || 'Tracking data uploaded successfully',
                };
            }

            // Unexpected status code
            console.warn('[UPLOAD API] ⚠️  Unexpected response status:', response.status);
            return {
                success: true,
                data: response.data,
                message: response.data?.message || 'Upload completed',
            };
        } catch (error: any) {
            console.error('[UPLOAD API] Error details:', {
                message: error.message,
                status: error.response?.status,
                statusText: error.response?.statusText,
                data: error.response?.data,
                headers: error.response?.headers,
                config: {
                    url: error.config?.url,
                    method: error.config?.method,
                    baseURL: error.config?.baseURL,
                    hasAuth: !!error.config?.headers?.Authorization,
                },
            });

            const errorMessage = error.response?.data?.message || error.message || 'Failed to upload tracking file';
            return {
                success: false,
                error: errorMessage,
            };
        }
    }

    async listTrackingData(params: {
        project_id: string;
        task_id: string;
        start_date?: string;
        end_date?: string;
    }): Promise<ApiResponse<any[]>> {
        try {
            const response = await this.axiosInstance.get(API_ENDPOINTS.TRACKING.LIST, {
                params,
            });

            // Handle API response format
            if (response.data?.result === true && Array.isArray(response.data.data)) {
                return {
                    success: true,
                    data: response.data.data,
                    message: response.data.message,
                };
            }

            return {
                success: true,
                data: Array.isArray(response.data) ? response.data : response.data?.data || [],
            };
        } catch (error: any) {
            return {
                success: false,
                error: error.response?.data?.message || error.message || 'Failed to list tracking data',
            };
        }
    }

    async getTrackingDataById(id: number): Promise<ApiResponse<any>> {
        try {
            const response = await this.axiosInstance.get(API_ENDPOINTS.TRACKING.GET_BY_ID(id));

            // Handle API response format
            if (response.data?.result === true && response.data.data) {
                return {
                    success: true,
                    data: response.data.data,
                    message: response.data.message,
                };
            }

            return {
                success: true,
                data: response.data,
            };
        } catch (error: any) {
            if (error.response?.status === 404) {
                return {
                    success: false,
                    error: 'Tracking data not found',
                };
            }
            return {
                success: false,
                error: error.response?.data?.message || error.message || 'Failed to get tracking data',
            };
        }
    }

    /**
     * Status Management API (v1)
     */
    async updateStatus(data: {
        status: 'idle' | 'working' | 'break' | 'meeting' | 'away' | 'checked_in' | 'checked_out';
        previous_status?: string;
        workspace_id?: string;
        metadata?: {
            task_id?: string;
            project_id?: string;
            [key: string]: any;
        };
    }): Promise<ApiResponse<any>> {
        try {
            const response = await this.axiosInstance.post(API_ENDPOINTS.STATUS.UPDATE, data);

            // Handle API response format
            if (response.data?.result === true) {
                return {
                    success: true,
                    data: response.data.data,
                    message: response.data.message || 'Status updated successfully',
                };
            }

            return {
                success: true,
                data: response.data,
            };
        } catch (error: any) {
            return {
                success: false,
                error: error.response?.data?.message || error.message || 'Failed to update status',
            };
        }
    }

    async getCurrentStatus(): Promise<ApiResponse<any | null>> {
        try {
            const response = await this.axiosInstance.get(API_ENDPOINTS.STATUS.CURRENT);

            // Handle API response format
            if (response.data?.result === true) {
                return {
                    success: true,
                    data: response.data.data || null,
                    message: response.data.message || 'Current status retrieved successfully',
                };
            }

            return {
                success: true,
                data: response.data || null,
            };
        } catch (error: any) {
            return {
                success: false,
                error: error.response?.data?.message || error.message || 'Failed to get current status',
            };
        }
    }

    async getStatusHistory(params?: {
        start_date?: string;
        end_date?: string;
        status?: 'idle' | 'working' | 'break' | 'meeting' | 'away' | 'checked_in' | 'checked_out';
    }): Promise<ApiResponse<any[]>> {
        try {
            const response = await this.axiosInstance.get(API_ENDPOINTS.STATUS.HISTORY, {
                params,
            });

            // Handle API response format
            if (response.data?.result === true && Array.isArray(response.data.data)) {
                return {
                    success: true,
                    data: response.data.data,
                    message: response.data.message,
                };
            }

            return {
                success: true,
                data: Array.isArray(response.data) ? response.data : response.data?.data || [],
            };
        } catch (error: any) {
            return {
                success: false,
                error: error.response?.data?.message || error.message || 'Failed to get status history',
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
            let workspaceDomain = authState.getWorkspaceDomain();
            
            // Fallback: Try to get from full response if available
            if (!workspaceDomain) {
                const fullResponse = authState.getFullResponse();
                if (fullResponse?.data?.workspaces && fullResponse.data.workspaces.length > 0) {
                    const workspace = fullResponse.data.workspaces.find((w: any) => w.workspace_is_general) || fullResponse.data.workspaces[0];
                    workspaceDomain = workspace?.domain;
                    console.log('[FACE CHECK] Got workspace domain from full response:', workspaceDomain);
                }
            }
            
            // Fallback: Try to get from localStorage
            if (!workspaceDomain) {
                try {
                    const authFullResponse = localStorage.getItem('auth_full_response');
                    if (authFullResponse) {
                        const fullResponse = JSON.parse(authFullResponse);
                        
                        // Try multiple structures
                        let workspaces = null;
                        if (fullResponse?.data?.workspaces) {
                            workspaces = fullResponse.data.workspaces;
                        } else if (fullResponse?.data?.data?.workspaces) {
                            workspaces = fullResponse.data.data.workspaces;
                        } else if (fullResponse?.workspaces) {
                            workspaces = fullResponse.workspaces;
                        }
                        
                        if (workspaces && workspaces.length > 0) {
                            // Find general workspace or use first one
                            const workspace = workspaces.find((w: any) => 
                                w.workspace_is_general === true || w.workspace_is_general === 1
                            ) || workspaces[0];
                            
                            workspaceDomain = workspace?.domain;
                            console.log('[FACE CHECK] Got workspace domain from localStorage:', workspaceDomain);
                            console.log('[FACE CHECK] Workspace details:', {
                                name: workspace?.workspace_name,
                                domain: workspace?.domain,
                                id: workspace?.workspace_id
                            });
                            
                            // Update authState with this workspace if authenticated
                            if (workspace && workspaceDomain && authState.getState().isAuthenticated) {
                                try {
                                    authState.setAuthData(
                                        authState.getUser()!,
                                        workspaces,
                                        localStorage.getItem('login_token') || '',
                                        Date.now() + 604800000,
                                        workspace.workspace_id,
                                        fullResponse
                                    );
                                    console.log('[FACE CHECK] ✅ Updated authState with workspace from localStorage');
                                } catch (authError) {
                                    console.error('[FACE CHECK] Error updating authState:', authError);
                                }
                            }
                        } else {
                            console.warn('[FACE CHECK] No workspaces found in localStorage auth_full_response');
                        }
                    }
                } catch (error) {
                    console.error('[FACE CHECK] Error getting workspace from localStorage:', error);
                }
            }
            
            if (!workspaceDomain) {
                console.error('[FACE CHECK] ❌ No workspace domain available after all fallbacks');
                console.error('[FACE CHECK] Auth state:', {
                    isAuthenticated: authState.isAuthenticated(),
                    hasUser: !!authState.getUser(),
                    hasWorkspace: !!authState.getCurrentWorkspace(),
                    workspaceDomain: authState.getWorkspaceDomain(),
                });
                
                // Last resort: Try to get from currentWorkspace state directly
                const currentWorkspace = authState.getCurrentWorkspace();
                if (currentWorkspace && currentWorkspace.domain) {
                    workspaceDomain = currentWorkspace.domain;
                    console.log('[FACE CHECK] ✅ Got workspace domain from currentWorkspace state:', workspaceDomain);
                } else {
                    // Log detailed error for debugging
                    console.error('[FACE CHECK] Detailed error info:');
                    console.error('  - Current workspace:', currentWorkspace);
                    console.error('  - Workspaces count:', authState.getWorkspaces().length);
                    console.error('  - Full response:', authState.getFullResponse());
                    
                    try {
                        const localStorageData = localStorage.getItem('auth_full_response');
                        if (localStorageData) {
                            const parsed = JSON.parse(localStorageData);
                            console.error('  - localStorage structure:', {
                                hasData: !!parsed.data,
                                hasWorkspaces: !!parsed.data?.workspaces,
                                workspacesCount: parsed.data?.workspaces?.length || 0,
                                firstWorkspaceDomain: parsed.data?.workspaces?.[0]?.domain
                            });
                        }
                    } catch (e) {
                        console.error('  - Error reading localStorage:', e);
                    }
                    
                    return {
                        success: false,
                        error: 'No workspace domain available. Please ensure you are logged in and have selected a workspace.',
                        message: 'Workspace domain not found',
                    };
                }
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

    /**
     * Tracking Images API (v1)
     * Upload, retrieve, and manage images (screenshots, webcam photos, etc.)
     */

    /**
     * Upload Multiple Images
     * Upload one or more images and receive their full URLs immediately
     */
    async uploadTrackingImages(data: {
        images: (File | Blob)[];
        project_id?: string;
        task_id?: string;
        workspace_id?: string;
        type?: 'image' | 'screenshot' | 'webcam_photo';
        metadata?: Record<string, any>;
    }): Promise<ApiResponse<{
        batch_id: string;
        uploaded_count: number;
        error_count: number;
        images: Array<{
            id: number;
            index: number;
            file_url: string;
            original_name: string;
            type: string;
            file_size: number;
            batch_id: string;
            status: string;
        }>;
        errors: any[];
    }>> {
        try {
            const formData = new FormData();
            
            // Add images as array
            data.images.forEach((image) => {
                // If it's a File, it will have a name. If it's a Blob, we'll generate a name
                if (image instanceof File) {
                    formData.append('images[]', image);
                } else {
                    // For Blob, create a File-like object with a generated name
                    // Type guard: if it has a type property, it's likely a Blob
                    const hasType = 'type' in image && typeof (image as any).type === 'string';
                    const imageType = hasType ? (image as any).type : 'image/png';
                    const extension = imageType.includes('jpeg') || imageType.includes('jpg') ? 'jpg' : 'png';
                    const filename = `image_${Date.now()}.${extension}`;
                    formData.append('images[]', image as Blob, filename);
                }
            });
            
            if (data.project_id) {
                formData.append('project_id', data.project_id);
            }
            if (data.task_id) {
                formData.append('task_id', data.task_id);
            }
            if (data.workspace_id) {
                formData.append('workspace_id', data.workspace_id);
            }
            if (data.type) {
                formData.append('type', data.type);
            }
            if (data.metadata) {
                formData.append('metadata', JSON.stringify(data.metadata));
            }

            const response = await this.axiosInstance.post(
                API_ENDPOINTS.TRACKING_IMAGES.UPLOAD,
                formData,
                {
                    headers: {
                        'Content-Type': 'multipart/form-data',
                    },
                }
            );

            // Handle API response format
            if (response.data?.result === true) {
                return {
                    success: true,
                    data: response.data,
                    message: response.data.message || 'Images uploaded successfully',
                };
            }

            return {
                success: true,
                data: response.data,
            };
        } catch (error: any) {
            console.error('[TRACKING IMAGES] Upload error:', error);
            return {
                success: false,
                error: error.response?.data?.message || error.message || 'Failed to upload images',
            };
        }
    }

    /**
     * Get Images by Batch ID
     * Retrieve all images that were uploaded together in a single batch
     */
    async getTrackingImagesByBatch(batchId: string): Promise<ApiResponse<{
        batch_id: string;
        count: number;
        images: Array<{
            id: number;
            file_url: string;
            original_name: string;
            type: string;
            file_size: number;
            uploaded_at: string;
        }>;
    }>> {
        try {
            const response = await this.axiosInstance.get(
                API_ENDPOINTS.TRACKING_IMAGES.GET_BY_BATCH(batchId)
            );

            // Handle API response format
            if (response.data?.result === true) {
                return {
                    success: true,
                    data: response.data,
                    message: response.data.message || 'Images retrieved successfully',
                };
            }

            return {
                success: true,
                data: response.data,
            };
        } catch (error: any) {
            if (error.response?.status === 404) {
                return {
                    success: false,
                    error: 'No images found for the specified batch ID',
                };
            }
            return {
                success: false,
                error: error.response?.data?.message || error.message || 'Failed to get images',
            };
        }
    }

    /**
     * List Images by Project and Task
     * Retrieve all images associated with a specific project and task
     */
    async listTrackingImages(params: {
        project_id: string;
        task_id: string;
        type?: 'image' | 'screenshot' | 'webcam_photo';
        start_date?: string;
        end_date?: string;
    }): Promise<ApiResponse<{
        count: number;
        images: Array<{
            id: number;
            file_url: string;
            original_name: string;
            type: string;
            file_size: number;
            uploaded_at: string;
            created_at: string;
        }>;
    }>> {
        try {
            const response = await this.axiosInstance.get(
                API_ENDPOINTS.TRACKING_IMAGES.LIST,
                { params }
            );

            // Handle API response format
            if (response.data?.result === true) {
                return {
                    success: true,
                    data: response.data,
                    message: response.data.message || 'Images retrieved successfully',
                };
            }

            return {
                success: true,
                data: response.data,
            };
        } catch (error: any) {
            return {
                success: false,
                error: error.response?.data?.message || error.message || 'Failed to list images',
            };
        }
    }

    /**
     * Delete Image
     * Delete a specific tracking image by ID
     */
    async deleteTrackingImage(id: number): Promise<ApiResponse> {
        try {
            const response = await this.axiosInstance.delete(
                API_ENDPOINTS.TRACKING_IMAGES.DELETE(id)
            );

            // Handle API response format
            if (response.data?.result === true) {
                return {
                    success: true,
                    data: response.data,
                    message: response.data.message || 'Image deleted successfully',
                };
            }

            return {
                success: true,
                data: response.data,
            };
        } catch (error: any) {
            if (error.response?.status === 404) {
                return {
                    success: false,
                    error: 'Image not found',
                };
            }
            return {
                success: false,
                error: error.response?.data?.message || error.message || 'Failed to delete image',
            };
        }
    }
}

// Export singleton instance
export const apiService = new ApiService();
export default apiService;
