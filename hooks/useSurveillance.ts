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
        };
    }
}

export const useSurveillance = ({ isTimerRunning, currentProjectId }: UseSurveillanceProps) => {
    const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
    const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
    
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

    // Hidden canvas for capturing frames
    const canvasRef = useRef<HTMLCanvasElement | null>(null);

    // Initialize Canvas
    useEffect(() => {
        const canvas = document.createElement('canvas');
        canvasRef.current = canvas;
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
            
            // Listen for activity updates
            window.electronAPI.onActivityUpdate((data) => {
                console.log('Activity update received:', data.app, data.title);
                currentActivityRef.current = data;
                keystrokesRef.current = data.keystrokes || 0;
            });
        }

        // Always return cleanup, even if condition is false
        return () => {
            if (window.electronAPI) {
                window.electronAPI.stopActivityMonitoring();
                window.electronAPI.removeActivityListener();
            }
        };
    }, [isTimerRunning]);

    // Global Listeners for Activity Tracking (within Electron window)
    useEffect(() => {
        const handleKey = () => { keystrokesRef.current++; };
        const handleClick = () => { mouseClicksRef.current++; };

        window.addEventListener('keydown', handleKey);
        window.addEventListener('click', handleClick);

        return () => {
            window.removeEventListener('keydown', handleKey);
            window.removeEventListener('click', handleClick);
        };
    }, []);

    const startCamera = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true });
            setCameraStream(stream);
            return stream;
        } catch (e) {
            console.error("Camera denied", e);
            return null;
        }
    };

    const stopCamera = () => {
        if (cameraStream) {
            cameraStream.getTracks().forEach(t => t.stop());
            setCameraStream(null);
        }
    };


    // The Interval Logic with Random Capture Times - REAL TRACKING
    useEffect(() => {
        if (isTimerRunning) {
            // Random interval between 20-60 seconds for more natural capturing
            const getRandomInterval = () => {
                return 20000 + Math.random() * 40000; // 20-60 seconds
            };

            let isActive = true; // Track if effect is still active

            const scheduleNextCapture = async () => {
                if (!isActive) return; // Don't schedule if effect is cleaned up
                
                const nextInterval = getRandomInterval();
                
                intervalRef.current = setTimeout(async () => {
                    if (!isActive) return; // Check again before executing
                    
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
                    
                    console.log('Creating log with activity:', {
                        app: appName,
                        title: windowTitle,
                        url: finalUrl,
                        originalUrl: activity.url || realWindowData.url,
                        hasCurrentActivity: !!currentActivityRef.current,
                        hasRealWindowData: !!realWindowData.app,
                        keystrokes: keystrokesRef.current,
                        clicks: mouseClicksRef.current
                    });
                    
                    // Get keystrokes - use ref value (tracked in Electron window) or activity data
                    const realKeystrokes = keystrokesRef.current > 0 ? keystrokesRef.current : (activity.keystrokes || 0);
                    const realClicks = mouseClicksRef.current > 0 ? mouseClicksRef.current : 0;
                    
                    // Calculate productivity score based on real activity
                    const activityScore = Math.min(100, Math.floor(((realKeystrokes + realClicks) / 5) * 10) + 40);
                    const baseScore = realKeystrokes > 0 || realClicks > 0 ? 50 : 20;
                    const score = Math.min(100, baseScore + activityScore);

                    const newLog: ActivityLog = {
                        id: Date.now().toString(),
                        timestamp: new Date(),
                        projectId: currentProjectId,
                        keyboardEvents: realKeystrokes,
                        mouseEvents: realClicks,
                        productivityScore: score,
                        activeWindow: appName,
                        activeUrl: finalUrl || undefined,
                        // Screenshots and webcam photos will be attached by the main App component
                    };
                    
                    console.log('New log created with app:', newLog.activeWindow, 'URL:', newLog.activeUrl);

                    setActivityLogs(prev => [newLog, ...prev]);

                    // Reset counters
                    keystrokesRef.current = 0;
                    mouseClicksRef.current = 0;

                    // Schedule next capture if still active
                    if (isActive) {
                        scheduleNextCapture();
                    }
                }, nextInterval);
            };

            // Start first capture
            scheduleNextCapture();

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

    return {
        cameraStream,
        activityLogs,
        setActivityLogs,
        startCamera,
        stopCamera
    };
};