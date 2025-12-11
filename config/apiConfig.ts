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
    // Tasks
    TASKS: {
        LIST: '/tasks',
        CREATE: '/tasks',
        GET: (taskId: string) => `/tasks/${taskId}`,
        UPDATE: (taskId: string) => `/tasks/${taskId}`,
        DELETE: (taskId: string) => `/tasks/${taskId}`,
        SYNC: '/tasks/sync',
    },
    // Projects
    PROJECTS: {
        LIST: '/projects',
        CREATE: '/projects',
        GET: (projectId: string) => `/projects/${projectId}`,
        UPDATE: (projectId: string) => `/projects/${projectId}`,
        DELETE: (projectId: string) => `/projects/${projectId}`,
    },
    // Activity Logs
    ACTIVITY: {
        LOGS: '/activity/logs',
        SYNC: '/activity/sync',
        BATCH: '/activity/batch',
    },
    // Tracking Data
    TRACKING: {
        SYNC: '/tracking/sync',
        TASK: (projectId: string, taskId: string) => `/tracking/tasks/${projectId}/${taskId}`,
        PROJECT: (projectId: string) => `/tracking/projects/${projectId}`,
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
} as const;
