import { useState, useRef, useEffect, useCallback } from 'react';
import { ActivityLog, Project } from '../types';

// Helper function to extract URL from window title (for browsers)
const extractUrlFromTitle = (title: string, appName: string): string | null => {
    if (!title || !appName) return null;
    
    const lowerTitle = title.toLowerCase();
    const lowerApp = appName.toLowerCase();
    
    // Check if it's a browser
    const isBrowser = lowerApp.includes('chrome') || 
                      lowerApp.includes('brave') || 
                      lowerApp.includes('firefox') || 
                      lowerApp.includes('edge') || 
                      lowerApp.includes('safari') ||
                      lowerApp.includes('opera');
    
    if (!isBrowser) return null;
    
    // Check for common sites in title
    if (lowerTitle.includes('youtube')) {
        // Try to extract video ID
        const videoIdMatch = title.match(/watch\?v=([a-zA-Z0-9_-]+)/i);
        if (videoIdMatch) {
            return `https://www.youtube.com/watch?v=${videoIdMatch[1]}`;
        }
        return 'https://www.youtube.com';
    }
    
    if (lowerTitle.includes('github')) {
        return 'https://github.com';
    }
    
    if (lowerTitle.includes('stackoverflow') || lowerTitle.includes('stack overflow')) {
        return 'https://stackoverflow.com';
    }
    
    if (lowerTitle.includes('reddit')) {
        return 'https://www.reddit.com';
    }
    
    if (lowerTitle.includes('twitter') || lowerTitle.includes('x.com')) {
        return 'https://twitter.com';
    }
    
    if (lowerTitle.includes('facebook')) {
        return 'https://www.facebook.com';
    }
    
    if (lowerTitle.includes('instagram')) {
        return 'https://www.instagram.com';
    }
    
    if (lowerTitle.includes('linkedin')) {
        return 'https://www.linkedin.com';
    }
    
    if (lowerTitle.includes('netflix')) {
        return 'https://www.netflix.com';
    }
    
    // Try to find URL pattern in title
    const urlPattern = /(https?:\/\/[^\s]+)/i;
    const urlMatch = title.match(urlPattern);
    if (urlMatch) {
        return urlMatch[1];
    }
    
    // Try to find domain pattern
    const domainPattern = /([a-zA-Z0-9-]+\.[a-zA-Z]{2,})/;
    const domainMatch = title.match(domainPattern);
    if (domainMatch && !domainMatch[0].includes(' ')) {
        return `https://${domainMatch[0]}`;
    }
    
    return null;
};

interface UseSurveillanceProps {
    isTimerRunning: boolean;
    currentProjectId: string;
}

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
            processActivity: (input: any) => Promise<any>;
            getActivityInsights: (timeWindow?: any) => Promise<any>;
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

interface UseSurveillanceReturn {
    cameraStream: MediaStream | null;
    activityLogs: ActivityLog[];
    setActivityLogs: React.Dispatch<React.SetStateAction<ActivityLog[]>>;
    startCamera: () => Promise<MediaStream | null>;
    stopCamera: () => void;
    idleInfo: { isIdle: boolean; duration: number } | null;
    onIdleDecision: (remove: boolean) => void;
}

export const useSurveillance = ({ isTimerRunning, currentProjectId }: UseSurveillanceProps): UseSurveillanceReturn => {
    const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
    const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
    const [idleInfo, setIdleInfo] = useState<{ isIdle: boolean; duration: number } | null>(null);
    const [settings, setSettings] = useState<any>(null);
    
    // Real activity tracking
    const currentActivityRef = useRef<{
        title: string;
        owner: string;
        url: string | null;
        app: string;
        keystrokes: number;
    } | null>(null);
    
    // Activity counters (reset every interval)
    const keystrokesRef = useRef(0);
    const mouseClicksRef = useRef(0);
    const intervalRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const pendingIdleLogRef = useRef<ActivityLog | null>(null);

    // Hidden canvas for capturing frames
    const canvasRef = useRef<HTMLCanvasElement | null>(null);

    // Initialize Canvas
    useEffect(() => {
        const canvas = document.createElement('canvas');
        canvasRef.current = canvas;
    }, []);

    // Load settings for idle threshold
    useEffect(() => {
        const loadSettings = async () => {
            if (window.electronAPI?.getSettings) {
                try {
                    const savedSettings = await window.electronAPI.getSettings();
                    setSettings(savedSettings);
                } catch (error) {
                    console.error('Error loading settings:', error);
                }
            }
        };
        loadSettings();
    }, []);

    // Real Activity Tracking from Electron
    useEffect(() => {
        if (isTimerRunning && window.electronAPI) {
            // Start Electron activity monitoring
            window.electronAPI.startActivityMonitoring().then(() => {
                console.log('Activity monitoring started successfully');
            }).catch(err => {
                console.error('Failed to start activity monitoring:', err);
            });
            
            // Listen for activity updates (now includes per-window keystrokes and mouse clicks)
            window.electronAPI.onActivityUpdate((data) => {
                console.log('Activity update received:', data.app, data.title, 'Keys:', data.keystrokes, 'Clicks:', data.mouseClicks);
                currentActivityRef.current = data;
                // Use per-window tracking data from main process (data.keystrokes and data.mouseClicks are now per-window)
                keystrokesRef.current = data.keystrokes || 0;
                mouseClicksRef.current = data.mouseClicks || 0;
            });
            
            // Listen for real-time keystroke updates
            if (window.electronAPI.onKeystrokeUpdate) {
                window.electronAPI.onKeystrokeUpdate((count) => {
                    keystrokesRef.current = count;
                });
            }
            
            // Listen for real-time mouse click updates
            if (window.electronAPI.onMouseClickUpdate) {
                window.electronAPI.onMouseClickUpdate((count) => {
                    mouseClicksRef.current = count;
                });
            }
        }

        // Always return cleanup, even if condition is false
        return () => {
            if (window.electronAPI) {
                window.electronAPI.stopActivityMonitoring();
                window.electronAPI.removeActivityListener();
            }
        };
    }, [isTimerRunning]);

    // Note: System-wide tracking is now handled in the main process
    // These local listeners are kept as fallback but won't be used if system-wide tracking works
    // The main process sends real-time updates via IPC

    const startCamera = async () => {
        try {
            // Check if camera is already in use AND tracks are actually live
            if (cameraStream) {
                const videoTracks = cameraStream.getVideoTracks();
                const hasLiveTracks = videoTracks.length > 0 && videoTracks.some(track => track.readyState === 'live');
                
                if (hasLiveTracks) {
                    console.log('Camera already active with live tracks, reusing existing stream');
                    return cameraStream;
                } else {
                    console.warn('Camera stream exists but tracks are not live, will start new stream');
                    // Clear the dead stream
                    cameraStream.getTracks().forEach(track => track.stop());
                    setCameraStream(null);
                }
            }
            
            // Request camera access with retry logic
            let stream: MediaStream | null = null;
            let lastError: any = null;
            
            // Try up to 3 times with delays
            for (let attempt = 1; attempt <= 3; attempt++) {
                try {
                    console.log(`Attempting to start camera (attempt ${attempt}/3)...`);
                    stream = await navigator.mediaDevices.getUserMedia({ video: true });
                    console.log('Camera access granted');
                    break;
                } catch (e: any) {
                    lastError = e;
                    console.warn(`Camera access attempt ${attempt} failed:`, e.name, e.message);
                    
                    // If it's a permission error, don't retry
                    if (e.name === 'NotAllowedError' || e.name === 'PermissionDeniedError') {
                        console.error('Camera permission denied');
                        break;
                    }
                    
                    // For other errors, wait before retrying
                    if (attempt < 3) {
                        await new Promise(resolve => setTimeout(resolve, 500 * attempt));
                    }
                }
            }
            
            if (stream) {
                setCameraStream(stream);
                return stream;
            } else {
                console.error("Camera denied after retries:", lastError);
                return null;
            }
        } catch (e) {
            console.error("Camera error:", e);
            return null;
        }
    };

    const stopCamera = () => {
        if (cameraStream) {
            console.log('Stopping camera stream...');
            try {
                cameraStream.getTracks().forEach(track => {
                    track.stop();
                    console.log('Stopped track:', track.kind, track.label);
                });
                setCameraStream(null);
                console.log('Camera stream stopped and state cleared');
            } catch (error) {
                console.error('Error stopping camera:', error);
                // Still clear the state even if stopping tracks fails
                setCameraStream(null);
            }
        }
    };


    // The Interval Logic - Fixed 10-minute intervals (Industry Standard)
    useEffect(() => {
        if (isTimerRunning) {
            const INTERVAL_DURATION = 10 * 60 * 1000; // 10 minutes in milliseconds

            let isActive = true; // Track if effect is still active
            let intervalStartTime = Date.now(); // Track when current interval started

            // Calculate time until next 10-minute boundary
            const getTimeToNextInterval = () => {
                const now = Date.now();
                const currentMinute = Math.floor(now / 60000); // Current minute since epoch
                const current10MinBlock = Math.floor(currentMinute / 10); // Current 10-minute block
                const next10MinBlock = current10MinBlock + 1; // Next 10-minute block
                const nextIntervalTime = next10MinBlock * 10 * 60000; // Time of next interval boundary
                return nextIntervalTime - now; // Time until next boundary
            };

            // Capture activity at interval boundary
            const captureAtInterval = async () => {
                if (!isActive) return;
                
                // Reset for new interval
                intervalStartTime = Date.now();
                    
                // Get REAL active window data from Electron
                let realWindowData = {
                    title: 'Unknown',
                    owner: 'Unknown',
                    url: null as string | null,
                    app: 'Unknown'
                };

                if (window.electronAPI) {
                    try {
                        realWindowData = await window.electronAPI.getActiveWindow();
                        console.log('Active window retrieved:', realWindowData);
                    } catch (error) {
                        console.error('Error getting active window:', error);
                    }
                }

                // Use current activity (from monitoring) or fallback to real window data
                // Prefer currentActivityRef as it's updated in real-time
                const activity = currentActivityRef.current || realWindowData;
                
                // Ensure we have valid app name - prioritize app name from activity
                const appName = activity.app || activity.owner || realWindowData.app || realWindowData.owner || 'Unknown';
                const windowTitle = activity.title || realWindowData.title || 'Unknown';
                
                // Extract URL from title if not available (for browsers)
                let finalUrl = activity.url || realWindowData.url;
                if (!finalUrl && windowTitle) {
                    finalUrl = extractUrlFromTitle(windowTitle, appName);
                }
                
                console.log('Creating log at 10-minute interval:', {
                    app: appName,
                    title: windowTitle,
                    url: finalUrl,
                    intervalStart: new Date(intervalStartTime).toISOString()
                });
                
                // Get keystrokes and mouse clicks from per-window tracking
                // activity.keystrokes and activity.mouseClicks are now per-window counts
                const realKeystrokes = activity.keystrokes || keystrokesRef.current || 0;
                const realClicks = activity.mouseClicks || mouseClicksRef.current || 0;
                
                console.log('Creating log with per-window stats:', {
                    app: appName,
                    perWindowKeystrokes: realKeystrokes,
                    perWindowClicks: realClicks
                });
                
                // Check for idle time
                let isIdle = false;
                let idleDuration = 0;
                const idleThreshold = (settings?.idleTimeThreshold || 5) * 60 * 1000; // Convert minutes to milliseconds
                
                if (window.electronAPI?.getLastActivityTimestamp) {
                    try {
                        const lastActivity = await window.electronAPI.getLastActivityTimestamp();
                        if (lastActivity) {
                            const timeSinceActivity = Date.now() - lastActivity;
                            if (timeSinceActivity >= idleThreshold) {
                                isIdle = true;
                                idleDuration = Math.floor(timeSinceActivity / 1000); // Convert to seconds
                            }
                        }
                    } catch (error) {
                        console.error('Error checking idle time:', error);
                    }
                }
                
                // Calculate activity percentage for this 10-minute interval
                const intervalDuration = INTERVAL_DURATION / 1000; // Convert to seconds
                const activitySeconds = intervalDuration - (isIdle ? idleDuration : 0);
                const activityPercentage = Math.round((activitySeconds / intervalDuration) * 100);
                
                // Calculate productivity score based on real activity
                const activityScore = Math.min(100, Math.floor(((realKeystrokes + realClicks) / 5) * 10) + 40);
                const baseScore = realKeystrokes > 0 || realClicks > 0 ? 50 : 20;
                const score = isIdle ? Math.max(0, baseScore - 30) : Math.min(100, baseScore + activityScore);

                const newLog: ActivityLog = {
                    id: Date.now().toString(),
                    timestamp: new Date(intervalStartTime), // Use interval start time
                    projectId: currentProjectId,
                    keyboardEvents: realKeystrokes,
                    mouseEvents: realClicks,
                    productivityScore: score,
                    activeWindow: appName,
                    activeUrl: finalUrl || undefined,
                    isIdle: isIdle || undefined,
                    idleDuration: isIdle ? idleDuration : undefined,
                    // Screenshots will be attached by the main App component (1-3 per interval)
                };
                
                console.log('New 10-minute interval log created:', {
                    app: newLog.activeWindow,
                    URL: newLog.activeUrl,
                    Idle: isIdle,
                    ActivityPercent: activityPercentage
                });

                // If idle, show dialog and store log temporarily
                if (isIdle && idleDuration > 0) {
                    pendingIdleLogRef.current = newLog;
                    setIdleInfo({ isIdle: true, duration: idleDuration });
                } else {
                    // Not idle, add log immediately
                    setActivityLogs(prev => [newLog, ...prev]);
                }

                // Reset counters for next interval
                keystrokesRef.current = 0;
                mouseClicksRef.current = 0;

                // Schedule next interval boundary
                if (isActive) {
                    const timeToNext = getTimeToNextInterval();
                    intervalRef.current = setTimeout(() => {
                        captureAtInterval();
                    }, timeToNext);
                }
            };

            // Start first interval
            const initialDelay = getTimeToNextInterval();
            intervalRef.current = setTimeout(() => {
                captureAtInterval();
            }, initialDelay);

            return () => {
                isActive = false; // Mark as inactive
                if (intervalRef.current) {
                    clearTimeout(intervalRef.current);
                    intervalRef.current = null;
                }
            };
        } else {
            if (intervalRef.current) {
                clearTimeout(intervalRef.current);
                intervalRef.current = null;
            }
        }
    }, [isTimerRunning, currentProjectId]);

    // Handle idle decision
    const onIdleDecision = (remove: boolean) => {
        if (pendingIdleLogRef.current) {
            if (!remove) {
                // Keep in log - add it
                setActivityLogs(prev => [pendingIdleLogRef.current!, ...prev]);
            }
            // If remove is true, just discard the log
            pendingIdleLogRef.current = null;
        }
        setIdleInfo(null);
    };

    return {
        cameraStream,
        activityLogs,
        setActivityLogs,
        startCamera,
        stopCamera,
        idleInfo,
        onIdleDecision
    };
};