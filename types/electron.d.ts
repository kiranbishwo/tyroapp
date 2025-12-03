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
            saveTaskTrackingData: (projectId?: string, taskId?: string, taskName?: string, projectName?: string) => Promise<boolean>;
            loadTaskTrackingData: (projectId: string, taskId: string) => Promise<any | null>;
            getProjectTasksTracking: (projectId: string) => Promise<any[]>;
            getTrackingDataPath: () => Promise<{ projectRoot: string; trackingDataPath: string; exists: boolean }>;
            verifyTrackingData: (projectId?: string) => Promise<any>;
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
        };
    }
}

export {};
