/**
 * API Configuration
 * Manages API settings and environment variables
 */

export interface ApiConfig {
    baseUrl: string;
    apiKey?: string;
    timeout: number;
    enabled: boolean;
    autoSync: boolean;
    syncInterval: number; // seconds
}

// Default API configuration
const DEFAULT_CONFIG: ApiConfig = {
    baseUrl: import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api',
    apiKey: import.meta.env.VITE_API_KEY || '',
    timeout: 30000, // 30 seconds
    enabled: import.meta.env.VITE_API_ENABLED === 'true' || false,
    autoSync: true,
    syncInterval: 60, // 60 seconds
};

/**
 * Get API configuration from environment variables or defaults
 */
export function getApiConfig(): ApiConfig {
    return {
        ...DEFAULT_CONFIG,
        baseUrl: import.meta.env.VITE_API_BASE_URL || DEFAULT_CONFIG.baseUrl,
        apiKey: import.meta.env.VITE_API_KEY || DEFAULT_CONFIG.apiKey,
        enabled: import.meta.env.VITE_API_ENABLED === 'true' || DEFAULT_CONFIG.enabled,
    };
}

/**
 * Update API configuration
 */
export function updateApiConfig(config: Partial<ApiConfig>): ApiConfig {
    const current = getApiConfig();
    return {
        ...current,
        ...config,
    };
}

/**
 * API Endpoints
 * Base path: /api/vue/backend/v1
 */
export const API_ENDPOINTS = {
    // Authentication
    AUTH: {
        LOGIN: '/auth/login',
        LOGOUT: '/auth/logout',
        REFRESH: '/auth/refresh',
        ME: '/auth/me',
        // OAuth Device Flow
        DEVICE_START: '/auth/device/start',
        DEVICE_POLL: '/auth/device/poll',
    },
    // Projects API (v1)
    PROJECTS: {
        LIST: '/vue/backend/v1/projects',
        CREATE: '/vue/backend/v1/projects',
        GET: (projectId: string) => `/vue/backend/v1/projects/${projectId}`,
        UPDATE: (projectId: string) => `/vue/backend/v1/projects/${projectId}`,
        DELETE: (projectId: string) => `/vue/backend/v1/projects/${projectId}`,
    },
    // Tasks API (v1)
    TASKS: {
        LIST: '/vue/backend/v1/tasks',
        CREATE: '/vue/backend/v1/tasks',
        GET: (taskId: string) => `/vue/backend/v1/tasks/${taskId}`,
        UPDATE: (taskId: string) => `/vue/backend/v1/tasks/${taskId}`,
        DELETE: (taskId: string) => `/vue/backend/v1/tasks/${taskId}`,
        SYNC: '/tasks/sync',
    },
    // Tracking Data API (v1)
    TRACKING: {
        SYNC: '/tracking/sync',
        TASK: (projectId: string, taskId: string) => `/tracking/tasks/${projectId}/${taskId}`,
        PROJECT: (projectId: string) => `/tracking/projects/${projectId}`,
        // New v1 endpoints
        UPLOAD_FILE: '/vue/backend/v1/tracking-files/upload',
        LIST: '/vue/backend/v1/tracking-data',
        GET_BY_ID: (id: number) => `/vue/backend/v1/tracking-data/${id}`,
    },
    // Status Management API (v1)
    STATUS: {
        UPDATE: '/vue/backend/v1/status/update',
        CURRENT: '/vue/backend/v1/status/current',
        HISTORY: '/vue/backend/v1/status/history',
    },
    // Activity Logs
    ACTIVITY: {
        LOGS: '/activity/logs',
        SYNC: '/activity/sync',
        BATCH: '/activity/batch',
    },
    // Screenshots
    SCREENSHOTS: {
        UPLOAD: '/screenshots/upload',
        BATCH: '/screenshots/batch',
    },
    // Webcam Photos
    WEBCAM: {
        UPLOAD: '/webcam/upload',
        BATCH: '/webcam/batch',
    },
    // Health Check
    HEALTH: '/health',
    // Face Attendance
    FACE: {
        CHECK: '/vue/backend/attendance/face/check',
        REGISTER: '/vue/backend/attendance/face/register',
        STORE_DATA: '/vue/backend/attendance/face/store-data',
        ATTENDANCE: '/vue/backend/attendance/face/attendance',
    },
    // Attendance
    ATTENDANCE: {
        CHECK_IN: '/vue/backend/attendance/check-in',
        CHECK_OUT: (attendanceId?: number) => attendanceId 
            ? `/vue/backend/attendance/check-out/${attendanceId}` 
            : '/vue/backend/attendance/check-out',
        STATUS: '/vue/backend/attendance/status',
    },
    // Tracking Images API (v1)
    TRACKING_IMAGES: {
        UPLOAD: '/vue/backend/v1/tracking-images/upload',
        LIST: '/vue/backend/v1/tracking-images',
        GET_BY_BATCH: (batchId: string) => `/vue/backend/v1/tracking-images/batch/${batchId}`,
        DELETE: (id: number) => `/vue/backend/v1/tracking-images/${id}`,
    },
} as const;
