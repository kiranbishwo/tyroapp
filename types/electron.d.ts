import { Settings } from '../types';

// Shared Electron API type definition
declare global {
    interface Window {
        electronAPI?: {
            // Window controls
            windowMinimize: () => Promise<void>;
            windowMaximize: () => Promise<void>;
            windowClose: () => Promise<void>;
            windowIsMaximized: () => Promise<boolean>;
            
            // Screenshot & capture
            captureScreenshot: (isBlurred?: boolean) => Promise<string | null>;
            
            // Activity monitoring
            getActiveWindow: () => Promise<{ title: string; owner: string; url: string | null; app: string }>;
            startActivityMonitoring: (projectId?: string, taskId?: string, taskName?: string, projectName?: string) => Promise<boolean>;
            stopActivityMonitoring: () => Promise<boolean>;
            updateTaskTracking: (projectId?: string, taskId?: string, taskName?: string, projectName?: string) => Promise<boolean>;
            
            // Task tracking data management
            getCurrentTaskTracking: () => Promise<any | null>;
            addActivityLogToTask: (activityLog: any) => Promise<boolean>;
            addWebcamPhotoToTask: (photoDataUrl: string) => Promise<boolean>;
            deleteTrackingImage: (imageId: number) => Promise<{ success: boolean; error?: string; message?: string }>;
            saveTaskTrackingData: (projectId?: string, taskId?: string, taskName?: string, projectName?: string) => Promise<boolean>;
            loadTaskTrackingData: (projectId: string, taskId: string, dateFilter?: 'today' | 'all') => Promise<any | null>;
            getProjectTasksTracking: (projectId: string) => Promise<any[]>;
            getAllTasks: () => Promise<Array<{
                projectId: string;
                taskId: string;
                taskName: string;
                projectName: string;
                createdAt: string;
                lastUpdated: string;
                totalTime: number;
                keystrokes: number;
                mouseClicks: number;
                activityLogCount: number;
                screenshotCount: number;
                webcamPhotoCount: number;
                summary?: any;
            }>>;
            getTodayTasks: (workspaceId?: string | null) => Promise<Array<{
                projectId: string;
                taskId: string;
                taskName: string;
                projectName: string;
                createdAt: string;
                lastUpdated: string;
                totalTime: number;
                keystrokes: number;
                mouseClicks: number;
                activityLogCount: number;
                screenshotCount: number;
                webcamPhotoCount: number;
                summary?: any;
            }>>;
            getTrackingDataPath: () => Promise<{ projectRoot: string; trackingDataPath: string; exists: boolean }>;
            verifyTrackingData: (projectId?: string) => Promise<any>;
            
            // Active task state management (for restoration on app restart - only uses task JSON files)
            getLastActiveTaskState: () => Promise<{
                projectId: string;
                taskId: string;
                isTimerRunning: boolean;
                startTime: number | null;
                elapsedSeconds: number;
                taskData?: any;
            } | null>;
            
            // Combined insights
            getCombinedInsights: (dateFilter?: 'today' | 'all') => Promise<any>;
            subscribeCombinedInsights: (dateFilter?: 'today' | 'all') => Promise<void>;
            unsubscribeCombinedInsights: () => Promise<void>;
            onCombinedInsightsUpdate: (callback: (data: any) => void) => void;
            removeCombinedInsightsListener: () => void;
            onActivityUpdate: (callback: (data: any) => void) => void;
            removeActivityListener: () => void;
            onAllWindowsUpdate: (callback: (data: any) => void) => void;
            removeAllWindowsListener: () => void;
            onKeystrokeUpdate?: (callback: (count: number) => void) => void;
            onMouseClickUpdate?: (callback: (count: number) => void) => void;
            processActivity: (input: any) => Promise<any>;
            getActivityInsights: (timeWindow?: any) => Promise<any>;
            getLastActivityTimestamp: () => Promise<number | null>;
            
            // User consent
            getUserConsent: () => Promise<{ consent: boolean | null; remembered: boolean }>;
            setUserConsent: (consent: boolean, remember: boolean) => Promise<boolean>;
            revokeConsent: () => Promise<boolean>;
            
            // Settings
            getSettings: () => Promise<Settings>;
            setSettings: (settings: Settings) => Promise<boolean>;
            
            // Data management
            exportData: (data: any) => Promise<{ success: boolean; path?: string; canceled?: boolean; error?: string }>;
            deleteAllData: () => Promise<boolean>;
            
            // API Sync
            syncTaskTracking: (projectId: string, taskId: string) => Promise<{ success: boolean; error?: string }>;
            syncAllTasks: () => Promise<{ success: boolean; synced: number; errors: number; error?: string }>;
            testApiConnection: () => Promise<{ success: boolean; error?: string }>;
            
            // OAuth Authentication
            oauthAuthenticate: () => Promise<{ success: boolean; error?: string; message?: string; user?: any; workspaces?: any[]; currentWorkspace?: any; token?: string; expires_at?: number }>;
            oauthCheckStatus: () => Promise<{ authenticated: boolean; user?: any; workspaces?: any[]; currentWorkspace?: any; expires_at?: number; error?: string }>;
            oauthLogout: () => Promise<{ success: boolean; error?: string }>;
            oauthDeviceLogout: (token?: string) => Promise<{ success: boolean; message?: string; error?: string }>;
            oauthGetAccessToken: () => Promise<{ token: string | null; expired?: boolean; error?: string }>;
            oauthGetLoginToken: () => Promise<{ token: string | null; expired?: boolean; error?: string }>;
            oauthSetWorkspace: (workspaceId: string | number) => Promise<{ success: boolean; error?: string }>;
            // OAuth event listeners
            onOAuthDeviceCode: (callback: (data: { device_code?: string; user_code: string; verification_url: string; browser_opened: boolean; expires_in?: number; interval?: number }) => void) => void;
            onOAuthSuccess: (callback: (data: { user: any; workspaces?: any[]; currentWorkspace?: any; token?: string; login_token?: string; expires_at?: number; message: string; fullResponse?: any }) => void) => void;
            onLoginToken: (callback: (token: string) => void) => void;
            onFullResponse: (callback: (data: any) => void) => void;
            removeOAuthListeners: () => void;
        };
    }
}

export {};
