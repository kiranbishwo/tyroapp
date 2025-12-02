/**
 * useActivityTracker Hook
 * Tracks active windows, categorizes activities, and provides insights
 * Works entirely offline using JavaScript
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { processActivity, getInsights, getTimeUsage, getSummaries, ActivityInput } from '../services/activityProcessor';
import { ActivityCategory } from '../services/activityCategorizer';

// Extend Window interface for Electron API
declare global {
    interface Window {
        electronAPI?: {
            windowMinimize: () => Promise<void>;
            windowMaximize: () => Promise<void>;
            windowClose: () => Promise<void>;
            windowIsMaximized: () => Promise<boolean>;
            captureScreenshot: () => Promise<string | null>;
            getActiveWindow: () => Promise<{ title: string; owner: string; url: string | null; app: string }>;
            startActivityMonitoring: () => Promise<boolean>;
            stopActivityMonitoring: () => Promise<boolean>;
            onActivityUpdate: (callback: (data: any) => void) => void;
            removeActivityListener: () => void;
            processActivity: (input: ActivityInput) => Promise<{
                category: string;
                description: string;
                suggestion: string;
            }>;
            getActivityInsights: (timeWindow?: { start: number; end: number }) => Promise<any>;
            getUserConsent: () => Promise<{ consent: boolean | null; remembered: boolean }>;
            setUserConsent: (consent: boolean, remember: boolean) => Promise<boolean>;
            revokeConsent: () => Promise<boolean>;
            getSettings: () => Promise<any>;
            setSettings: (settings: any) => Promise<boolean>;
            exportData: (data: any) => Promise<{ success: boolean; path?: string; canceled?: boolean; error?: string }>;
            deleteAllData: () => Promise<boolean>;
            getLastActivityTimestamp: () => Promise<number | null>;
        };
    }
}

export interface ActivityResponse {
    category: string;
    description: string;
    suggestion: string;
}

export interface UseActivityTrackerOptions {
    enabled?: boolean;
    interval?: number; // milliseconds between checks
    onActivityChange?: (response: ActivityResponse) => void;
}

export const useActivityTracker = (options: UseActivityTrackerOptions = {}) => {
    const { enabled = true, interval = 2000, onActivityChange } = options;
    
    const [currentActivity, setCurrentActivity] = useState<ActivityResponse | null>(null);
    const [lastWindow, setLastWindow] = useState<string | null>(null);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const isProcessingRef = useRef(false);

    /**
     * Process a single activity input (can be called manually with JSON)
     */
    const processActivityInput = useCallback(async (input: ActivityInput): Promise<ActivityResponse> => {
        // Try Electron API first (if available)
        if (window.electronAPI?.processActivity) {
            try {
                const result = await window.electronAPI.processActivity(input);
                return result;
            } catch (error) {
                console.warn('Electron API failed, using local processor:', error);
            }
        }
        
        // Fallback to local processor (works in browser too)
        return processActivity(input);
    }, []);

    /**
     * Get current active window and process it
     */
    const checkActiveWindow = useCallback(async () => {
        if (isProcessingRef.current) return;
        isProcessingRef.current = true;

        try {
            let windowData: { title: string; app: string; url?: string } | null = null;

            // Try to get active window from Electron
            if (window.electronAPI?.getActiveWindow) {
                try {
                    const data = await window.electronAPI.getActiveWindow();
                    windowData = {
                        title: data.title,
                        app: data.app,
                        url: data.url || undefined
                    };
                } catch (error) {
                    console.warn('Failed to get active window from Electron:', error);
                }
            }

            // If we have window data, process it
            if (windowData) {
                const windowKey = `${windowData.app}:${windowData.title}`;
                
                // Only process if window changed
                if (windowKey !== lastWindow) {
                    const input: ActivityInput = {
                        title: windowData.title,
                        app: windowData.app,
                        url: windowData.url,
                        timestamp: Date.now()
                    };

                    const response = await processActivityInput(input);
                    setCurrentActivity(response);
                    setLastWindow(windowKey);
                    
                    if (onActivityChange) {
                        onActivityChange(response);
                    }
                }
            }
        } catch (error) {
            console.error('Error checking active window:', error);
        } finally {
            isProcessingRef.current = false;
        }
    }, [lastWindow, processActivityInput, onActivityChange]);

    /**
     * Start tracking
     */
    useEffect(() => {
        if (!enabled) {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
            }
            return;
        }

        // Initial check
        checkActiveWindow();

        // Set up interval
        intervalRef.current = setInterval(() => {
            checkActiveWindow();
        }, interval);

        return () => {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
            }
        };
    }, [enabled, interval, checkActiveWindow]);

    /**
     * Get insights
     */
    const getActivityInsights = useCallback(async (timeWindow?: { start: number; end: number }) => {
        if (window.electronAPI?.getActivityInsights) {
            try {
                return await window.electronAPI.getActivityInsights(timeWindow);
            } catch (error) {
                console.warn('Electron API failed, using local insights:', error);
            }
        }
        return getInsights(timeWindow);
    }, []);

    /**
     * Get time usage summary
     */
    const getTimeUsageSummary = useCallback(() => {
        return getTimeUsage();
    }, []);

    /**
     * Get human-readable summaries
     */
    const getActivitySummaries = useCallback(() => {
        return getSummaries();
    }, []);

    return {
        currentActivity,
        processActivityInput, // Can be called manually with JSON input
        getActivityInsights,
        getTimeUsageSummary,
        getActivitySummaries,
        checkActiveWindow // Manual trigger
    };
};
