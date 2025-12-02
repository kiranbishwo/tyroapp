import React, { useState, useEffect, useRef } from 'react';
import { User, AppView, Project, TimeEntry, Settings, ActivityLog } from './types';
import { FaceAttendance } from './components/FaceAttendance';
import { ScreenLogger } from './components/ScreenLogger';
import { InsightsDashboard } from './components/InsightsDashboard';
import { TitleBar } from './components/TitleBar';
import { ConsentDialog } from './components/ConsentDialog';
import { Settings as SettingsComponent } from './components/Settings';
import { IdleDialog } from './components/IdleDialog';
import { useSurveillance } from './hooks/useSurveillance';
import { applyBlurWithIntensity } from './utils/imageBlur';

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
            onAllWindowsUpdate: (callback: (data: any) => void) => void;
            removeAllWindowsListener: () => void;
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

// Mock Data
const MOCK_PROJECTS: Project[] = [
    { id: '1', name: 'Web Development', color: '#60A5FA' },
    { id: '2', name: 'Internal Audit', color: '#F472B6' },
    { id: '3', name: 'UI/UX Design', color: '#34D399' },
    { id: '4', name: 'Meeting', color: '#FBBF24' },
];

const INITIAL_USER: User = {
    id: 'u1',
    name: 'Alex Developer',
    avatar: 'https://picsum.photos/100/100',
    isCheckedIn: false
};

const App: React.FC = () => {
    // State
    const [user, setUser] = useState<User | null>(null);
    const [view, setView] = useState<AppView>(AppView.LOGIN);
    const [projects] = useState<Project[]>(MOCK_PROJECTS);
    const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([]);
    
    // Consent State
    const [showConsentDialog, setShowConsentDialog] = useState(false);
    const [userConsent, setUserConsent] = useState<boolean | null>(null);
    const [consentChecked, setConsentChecked] = useState(false);
    
    // Timer State
    const [isTimerRunning, setIsTimerRunning] = useState(false);
    const [startTime, setStartTime] = useState<number | null>(null);
    const [elapsedSeconds, setElapsedSeconds] = useState(0);
    const [description, setDescription] = useState('');
    const [selectedProjectId, setSelectedProjectId] = useState<string>('');
    
    // Settings state for screenshot blur
    const [settings, setSettings] = useState<Settings | null>(null);

    // Surveillance Hook - Only active if user has consented
    const { 
        cameraStream, 
        activityLogs, 
        setActivityLogs,
        startCamera, 
        stopCamera,
        idleInfo,
        onIdleDecision
    } = useSurveillance({ 
        isTimerRunning: isTimerRunning && userConsent === true, // Block tracking without consent
        currentProjectId: selectedProjectId 
    });

    const timerIntervalRef = useRef<number | null>(null);

    // Hidden Refs for Background Capture
    // Note: We use opacity: 0 instead of display: none to ensure the browser processes video frames
    const hiddenCamVideoRef = useRef<HTMLVideoElement>(null);
    const hiddenCanvasRef = useRef<HTMLCanvasElement>(null);

    // Check user consent on mount
    useEffect(() => {
        const checkConsent = async () => {
            if (window.electronAPI) {
                try {
                    const consentData = await window.electronAPI.getUserConsent();
                    if (consentData.consent === null) {
                        // No consent given yet - show dialog
                        setShowConsentDialog(true);
                    } else {
                        // Consent already given or declined
                        setUserConsent(consentData.consent);
                        if (!consentData.consent) {
                            console.warn('User has not consented to tracking');
                        }
                    }
                    setConsentChecked(true);
                } catch (error) {
                    console.error('Error checking consent:', error);
                    // If error, show dialog to be safe
                    setShowConsentDialog(true);
                    setConsentChecked(true);
                }
            } else {
                // Electron API not available (web mode?)
                setConsentChecked(true);
            }
        };
        checkConsent();
    }, []);

    // Load settings on mount
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

    // Handle consent dialog response
    const handleConsent = async (consent: boolean, remember: boolean) => {
        if (window.electronAPI) {
            try {
                await window.electronAPI.setUserConsent(consent, remember);
                setUserConsent(consent);
                setShowConsentDialog(false);
                
                if (!consent) {
                    // If user declined, stop any active tracking
                    setIsTimerRunning(false);
                    if (window.electronAPI.stopActivityMonitoring) {
                        await window.electronAPI.stopActivityMonitoring();
                    }
                }
            } catch (error) {
                console.error('Error saving consent:', error);
            }
        } else {
            setUserConsent(consent);
            setShowConsentDialog(false);
        }
    };

    // Initial Login Simulation
    const handleLogin = (email: string) => {
        // Only allow login if consent is checked
        if (!consentChecked) return;
        
        // If user hasn't consented, don't allow login
        if (userConsent === false) {
            alert('You must consent to tracking to use this application.');
            return;
        }
        
        setUser({ ...INITIAL_USER, name: email.split('@')[0] });
        setView(AppView.CHECK_IN_OUT); 
    };

    // Attach streams to hidden video elements for capture
    useEffect(() => {
        if (hiddenCamVideoRef.current && cameraStream) {
            const video = hiddenCamVideoRef.current;
            // Only set srcObject if it's different to avoid interrupting play()
            if (video.srcObject !== cameraStream) {
                video.srcObject = cameraStream;
                // Ensure video plays to capture frames
                video.play().catch(err => {
                    // Ignore AbortError as it's usually just an interruption
                    if (err.name !== 'AbortError') {
                        console.warn('Failed to play hidden video:', err);
                    }
                });
            }
        } else if (hiddenCamVideoRef.current && !cameraStream) {
            // Clear srcObject when stream is removed
            hiddenCamVideoRef.current.srcObject = null;
        }
    }, [cameraStream]);


    // Timer Logic
    useEffect(() => {
        if (isTimerRunning && startTime) {
            timerIntervalRef.current = window.setInterval(() => {
                const now = Date.now();
                setElapsedSeconds(Math.floor((now - startTime) / 1000));
            }, 1000);
        } else {
            if (timerIntervalRef.current) {
                clearInterval(timerIntervalRef.current);
                timerIntervalRef.current = null;
            }
        }
        return () => {
            if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
        };
    }, [isTimerRunning, startTime]);

    // Check if we're in dev mode (check for localhost or development indicators)
    const isDevMode = window.location.hostname === 'localhost' || 
                      window.location.hostname === '127.0.0.1' ||
                      window.location.port === '3000' ||
                      (window as any).__DEV__ === true;
    
    // Background Capture Logic (Sync with Activity Log creation)
    // We observe the activity logs array. When a new log is added (by useSurveillance),
    // we capture 1-3 screenshots and webcam photo per 10-minute interval (or 20 seconds in dev mode).
    const lastProcessedLogIdRef = useRef<string | null>(null);
    const devCaptureIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    
    const immediateCaptureRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    
    // Dev mode: Periodic capture every 1 minute (60 seconds)
    useEffect(() => {
        if (isDevMode && isTimerRunning) {
            console.log('Dev mode: Starting periodic capture every 1 minute');
            
            // Create initial log if none exists (for immediate capture)
            if (activityLogs.length === 0) {
                const initialLog: ActivityLog = {
                    id: Date.now().toString(),
                    timestamp: new Date(),
                    projectId: selectedProjectId || '1',
                    keyboardEvents: 0,
                    mouseEvents: 0,
                    productivityScore: 50,
                    activeWindow: 'Dev Mode Test'
                };
                setActivityLogs([initialLog]);
                lastProcessedLogIdRef.current = null; // Reset to allow immediate capture
                console.log('Dev mode: Created initial log for testing');
            }
            
            // Immediate first capture after 2 seconds
            immediateCaptureRef.current = setTimeout(() => {
                setActivityLogs(prev => {
                    if (prev.length > 0) {
                        const newLogs = [...prev];
                        newLogs[0] = {
                            ...newLogs[0],
                            screenshotUrl: undefined,
                            screenshotUrls: undefined, // Clear array too
                            webcamUrl: undefined
                        };
                        lastProcessedLogIdRef.current = null;
                        console.log('Dev mode: Triggering immediate capture');
                        return newLogs;
                    }
                    return prev;
                });
            }, 2000);
            
            devCaptureIntervalRef.current = setInterval(() => {
                // Ensure we have a log to work with
                setActivityLogs(prev => {
                    if (prev.length === 0) {
                        // Create a new log if none exists
                        const newLog: ActivityLog = {
                            id: Date.now().toString(),
                            timestamp: new Date(),
                            projectId: selectedProjectId || '1',
                            keyboardEvents: 0,
                            mouseEvents: 0,
                            productivityScore: 50,
                            activeWindow: 'Dev Mode Test'
                        };
                        console.log('Dev mode: Created new log for capture');
                        lastProcessedLogIdRef.current = null;
                        return [newLog];
                    } else {
                        // Clear media URLs to force re-capture
                        const newLogs = [...prev];
                        if (newLogs.length > 0) {
                            newLogs[0] = {
                                ...newLogs[0],
                                screenshotUrl: undefined,
                                screenshotUrls: undefined, // Clear array too
                                webcamUrl: undefined
                            };
                            lastProcessedLogIdRef.current = null;
                            console.log('Dev mode: Cleared media URLs, forcing capture');
                        }
                        return newLogs;
                    }
                });
            }, 60000); // 60 seconds (1 minute) - gives camera time to close and reopen
            
            return () => {
                if (immediateCaptureRef.current) {
                    clearTimeout(immediateCaptureRef.current);
                    immediateCaptureRef.current = null;
                }
                if (devCaptureIntervalRef.current) {
                    clearInterval(devCaptureIntervalRef.current);
                    devCaptureIntervalRef.current = null;
                }
            };
        } else {
            if (immediateCaptureRef.current) {
                clearTimeout(immediateCaptureRef.current);
                immediateCaptureRef.current = null;
            }
            if (devCaptureIntervalRef.current) {
                clearInterval(devCaptureIntervalRef.current);
                devCaptureIntervalRef.current = null;
            }
        }
    }, [isDevMode, isTimerRunning, activityLogs.length, selectedProjectId]);
    
    // Track if capture is in progress to prevent duplicate captures
    const captureInProgressRef = useRef<boolean>(false);
    
    useEffect(() => {
        if (activityLogs.length > 0 && isTimerRunning) {
            const latestLog = activityLogs[0];
            
            // Skip if we already processed this log
            if (latestLog.id === lastProcessedLogIdRef.current) {
                return;
            }
            
            // Skip if capture is already in progress for this log
            if (captureInProgressRef.current) {
                console.log('Capture already in progress, skipping duplicate...');
                return;
            }
            
            // Increased time window to 5 minutes to allow for async operations and retries
            const isFresh = (new Date().getTime() - latestLog.timestamp.getTime()) < 300000; // 5 minutes
            
            // Capture screenshots and webcam if enabled and log doesn't have them yet
            const needsScreenshot = !latestLog.screenshotUrl && settings?.enableScreenshots !== false;
            const needsWebcam = !latestLog.webcamUrl;
            
            console.log('Capture check:', {
                logId: latestLog.id,
                isFresh,
                needsScreenshot,
                needsWebcam,
                hasScreenshot: !!latestLog.screenshotUrl,
                hasWebcam: !!latestLog.webcamUrl,
                hasCameraStream: !!cameraStream,
                enableScreenshots: settings?.enableScreenshots,
                isDevMode
            });
            
            // In dev mode, always capture regardless of freshness
            const shouldCapture = isDevMode ? (needsScreenshot || needsWebcam) : (isFresh && (needsScreenshot || needsWebcam));
            
            if (shouldCapture) {
                // Mark capture as in progress
                captureInProgressRef.current = true;
                console.log('Starting media capture for log:', latestLog.id, isDevMode ? '(DEV MODE)' : '');
                const captureMedia = async () => {
                    const screenshots: string[] = [];
                    let webcamPhoto: string | null = null;
                    let tempCameraStream: MediaStream | null = null;
                    
                    try {
                        // Start camera first if we need webcam capture (before capturing screenshots)
                    // Check if cameraStream exists AND has active tracks, not just if it exists
                    const hasActiveCamera = cameraStream && cameraStream.getTracks().some(track => track.readyState === 'live');
                    if (needsWebcam && !hasActiveCamera) {
                        console.log('Starting camera for webcam capture...');
                        try {
                            tempCameraStream = await startCamera();
                            if (tempCameraStream && hiddenCamVideoRef.current) {
                                const video = hiddenCamVideoRef.current;
                                
                                // Reset video element completely if it was previously used
                                if (video.srcObject) {
                                    console.log('Clearing previous video stream...');
                                    video.pause();
                                    video.srcObject = null;
                                    video.load(); // Reset video element
                                    await new Promise(resolve => setTimeout(resolve, 300)); // Give it time to reset
                                }
                                
                                // Set new stream
                                console.log('Setting new video stream...');
                                video.srcObject = tempCameraStream;
                                
                                // Wait for stream to attach and video to initialize
                                await new Promise(resolve => setTimeout(resolve, 500));
                                
                                // Play video and wait for it to be ready
                                try {
                                    await video.play();
                                    console.log('Video play() successful');
                                } catch (playError: any) {
                                    console.warn('Play error:', playError.name, playError.message);
                                    // Continue anyway, video might still work
                                }
                                
                                // Wait for video to have valid dimensions (readyState >= 2 means HAVE_CURRENT_DATA)
                                // IMPORTANT: Wait for proper dimensions (not 2x2), at least 100x100
                                let attempts = 0;
                                const maxAttempts = 20; // Wait up to 4 seconds
                                while (attempts < maxAttempts && (video.readyState < 2 || video.videoWidth < 100 || video.videoHeight < 100)) {
                                    await new Promise(resolve => setTimeout(resolve, 200));
                                    attempts++;
                                    if (attempts % 5 === 0) {
                                        console.log(`Waiting for video to be ready... (attempt ${attempts}/${maxAttempts}, readyState: ${video.readyState}, dimensions: ${video.videoWidth}x${video.videoHeight})`);
                                    }
                                }
                                
                                if (video.videoWidth >= 100 && video.videoHeight >= 100) {
                                    console.log(`Video ready: ${video.videoWidth}x${video.videoHeight}, readyState: ${video.readyState}`);
                                } else {
                                    console.warn(`Video still not ready after waiting: ${video.videoWidth}x${video.videoHeight}, readyState: ${video.readyState}`);
                                    // Try one more time to reset and reattach
                                    console.log('Attempting to reset video element and reattach stream...');
                                    video.pause();
                                    video.srcObject = null;
                                    video.load();
                                    await new Promise(resolve => setTimeout(resolve, 300));
                                    video.srcObject = tempCameraStream;
                                    await video.play().catch(() => {});
                                    await new Promise(resolve => setTimeout(resolve, 1000));
                                    
                                    if (video.videoWidth >= 100 && video.videoHeight >= 100) {
                                        console.log(`Video ready after reset: ${video.videoWidth}x${video.videoHeight}`);
                                    } else {
                                        console.error(`Video failed to initialize: ${video.videoWidth}x${video.videoHeight}`);
                                    }
                                }
                            }
                        } catch (error) {
                            console.error('Failed to start camera for capture:', error);
                        }
                    }
                    
                    // IMPORTANT: Ensure camera is ready BEFORE starting any captures
                    // Both screenshot and photo must be captured together - no screenshot without photo
                    let activeCameraStream: MediaStream | null = null;
                    
                    // Determine which stream to use for webcam capture
                    if (tempCameraStream) {
                        // Use the stream we just started
                        activeCameraStream = tempCameraStream;
                        console.log('Using tempCameraStream for webcam capture');
                    } else if (cameraStream) {
                        // Use existing stream if available
                        activeCameraStream = cameraStream;
                        console.log('Using existing cameraStream for webcam capture');
                    }
                    
                    // Verify camera is actually ready
                    // EXPLANATION: To capture a webcam photo in browsers, we MUST use a video element:
                    // 1. Camera stream (MediaStream) can only be displayed in a <video> element
                    // 2. We draw a frame from that video to a <canvas>
                    // 3. Then convert canvas to image (data URL)
                    // The video element is hidden but required for the capture process
                    let cameraReady = false;
                    if (needsWebcam && activeCameraStream && hiddenCamVideoRef.current) {
                        // First check: Are the stream tracks actually live?
                        const videoTracks = activeCameraStream.getVideoTracks();
                        const hasLiveTracks = videoTracks.length > 0 && videoTracks.some(track => track.readyState === 'live');
                        
                        if (!hasLiveTracks) {
                            console.error('Camera stream tracks are not live:', {
                                trackCount: videoTracks.length,
                                trackStates: videoTracks.map(t => ({ label: t.label, readyState: t.readyState, enabled: t.enabled }))
                            });
                        } else {
                            // Second check: Is the video element receiving the stream and has valid dimensions?
                            const video = hiddenCamVideoRef.current;
                            
                            // Wait for video to have valid dimensions (stream is flowing)
                            let attempts = 0;
                            const maxAttempts = 15; // Wait up to 3 seconds
                            while (attempts < maxAttempts && (video.videoWidth < 100 || video.videoHeight < 100 || video.readyState < 2)) {
                                await new Promise(resolve => setTimeout(resolve, 200));
                                attempts++;
                                if (attempts % 5 === 0) {
                                    console.log(`Waiting for video element to receive stream... (attempt ${attempts}/${maxAttempts}, dimensions: ${video.videoWidth}x${video.videoHeight}, readyState: ${video.readyState})`);
                                }
                            }
                            
                            // Video element must have valid dimensions to capture from it
                            if (video.videoWidth >= 100 && video.videoHeight >= 100 && video.readyState >= 2) {
                                cameraReady = true;
                                console.log(`Camera ready: stream tracks live, video element ${video.videoWidth}x${video.videoHeight}, readyState: ${video.readyState}`);
                            } else {
                                console.error('Video element not ready after waiting (needed to capture photo):', {
                                    videoWidth: video.videoWidth,
                                    videoHeight: video.videoHeight,
                                    readyState: video.readyState,
                                    srcObject: !!video.srcObject,
                                    hasLiveTracks: hasLiveTracks,
                                    attempts: attempts
                                });
                            }
                        }
                    } else if (needsWebcam) {
                        console.error('Camera stream or video element missing (both required for photo capture):', {
                            hasActiveStream: !!activeCameraStream,
                            hasVideoRef: !!hiddenCamVideoRef.current,
                            needsWebcam
                        });
                    }
                    
                    // CRITICAL: If webcam is needed but not ready, skip ALL captures (including screenshots)
                    if (needsWebcam && !cameraReady) {
                        console.error('Webcam is required but not ready - skipping ALL captures (screenshot and photo)');
                        captureInProgressRef.current = false;
                        return; // Exit early - don't capture anything
                    }
                    
                    // Capture Screenshots and Webcam Photo SIMULTANEOUSLY
                    const screenshotCount = isDevMode ? 1 : (1 + Math.floor(Math.random() * 3)); // 1 in dev, 1-3 in prod
                    console.log(`Capturing ${screenshotCount} screenshot(s) and webcam photo simultaneously for log ${latestLog.id}...`);
                    
                    // Prepare all capture promises
                    const capturePromises: Promise<void>[] = [];
                    
                    // Screenshot captures (only if webcam is also ready or not needed)
                    if (needsScreenshot && window.electronAPI?.captureScreenshot && (!needsWebcam || cameraReady)) {
                        for (let i = 0; i < screenshotCount; i++) {
                            capturePromises.push(
                                (async () => {
                                    try {
                                        console.log(`Attempting to capture screenshot ${i + 1}/${screenshotCount}...`);
                                        let rawScreenshot = await window.electronAPI.captureScreenshot();
                                        
                                        if (rawScreenshot && rawScreenshot.length > 100) {
                                            // Apply blur if enabled in settings
                                            let screenUrl = rawScreenshot;
                                            if (settings?.enableScreenshotBlur) {
                                                try {
                                                    screenUrl = await applyBlurWithIntensity(rawScreenshot, 'medium');
                                                    console.log(`Screenshot ${i + 1} blurred successfully`);
                                                } catch (blurError) {
                                                    console.error('Blur failed, using original:', blurError);
                                                    screenUrl = rawScreenshot; // Fallback to original
                                                }
                                            }
                                            
                                            if (screenUrl) {
                                                screenshots.push(screenUrl);
                                                console.log(`Screenshot ${i + 1} captured successfully, size: ${screenUrl.length} bytes`);
                                            } else {
                                                console.warn(`Screenshot ${i + 1} is empty`);
                                            }
                                        } else {
                                            console.warn(`Screenshot ${i + 1} capture returned invalid data (length: ${rawScreenshot?.length || 0})`);
                                        }
                                    } catch (error) {
                                        console.error(`Screenshot ${i + 1} capture failed:`, error);
                                    }
                                })()
                            );
                        }
                    }
                    
                    // Webcam capture (simultaneous with screenshots) - ONLY if camera is ready
                    if (needsWebcam && hiddenCamVideoRef.current && hiddenCanvasRef.current && activeCameraStream && cameraReady) {
                        capturePromises.push(
                            (async () => {
                                try {
                                    console.log('Capturing webcam photo...');
                                    const video = hiddenCamVideoRef.current!;
                                    const canvas = hiddenCanvasRef.current!;
                                    
                                    // Wait for video to be ready with retries
                                    let attempts = 0;
                                    const maxAttempts = 15;
                                    while (attempts < maxAttempts && (video.readyState < 2 || video.videoWidth === 0 || video.videoHeight === 0)) {
                                        await new Promise(resolve => setTimeout(resolve, 200));
                                        attempts++;
                                        if (attempts % 3 === 0) {
                                            console.log(`Waiting for video to be ready... (attempt ${attempts}/${maxAttempts}, readyState: ${video.readyState}, dimensions: ${video.videoWidth}x${video.videoHeight})`);
                                        }
                                    }
                                    
                                    if (video.videoWidth > 0 && video.videoHeight > 0) {
                                        const context = canvas.getContext('2d');
                                        if (context) {
                                            canvas.width = video.videoWidth;
                                            canvas.height = video.videoHeight;
                                            context.drawImage(video, 0, 0);
                                            
                                            webcamPhoto = canvas.toDataURL('image/jpeg', 0.8);
                                            console.log(`Webcam photo captured successfully: ${video.videoWidth}x${video.videoHeight}, size: ${webcamPhoto.length} bytes`);
                                        } else {
                                            console.warn('Canvas context not available for webcam capture');
                                        }
                                    } else {
                                        console.warn(`Video dimensions are invalid after ${maxAttempts} attempts: ${video.videoWidth}x${video.videoHeight}, readyState: ${video.readyState}`);
                                        console.warn('Video element state:', {
                                            srcObject: !!video.srcObject,
                                            paused: video.paused,
                                            currentTime: video.currentTime,
                                            networkState: video.networkState,
                                            readyState: video.readyState
                                        });
                                    }
                                } catch (error) {
                                    console.error('Webcam capture failed:', error);
                                }
                            })()
                        );
                    } else if (needsWebcam) {
                        console.warn('Webcam capture skipped - missing refs:', {
                            hasVideoRef: !!hiddenCamVideoRef.current,
                            hasCanvasRef: !!hiddenCanvasRef.current,
                            hasCameraStream: !!activeCameraStream
                        });
                    }
                    
                    // Execute all captures simultaneously
                    await Promise.all(capturePromises);
                    console.log(`All captures completed: ${screenshots.length} screenshot(s), ${webcamPhoto ? '1' : '0'} webcam photo(s)`);
                    
                    // Stop temporary camera stream after capture
                    if (tempCameraStream) {
                        console.log('Stopping temporary camera stream...');
                        try {
                            // Stop all tracks
                            tempCameraStream.getTracks().forEach(track => {
                                track.stop();
                                console.log('Stopped track:', track.kind, track.label);
                            });
                            
                            // Clean up video element
                            if (hiddenCamVideoRef.current) {
                                const video = hiddenCamVideoRef.current;
                                // Pause video first
                                video.pause();
                                // Clear srcObject
                                video.srcObject = null;
                                // Reset video element
                                video.load();
                                console.log('Video element cleaned up');
                            }
                            
                            // IMPORTANT: Clear cameraStream state so camera can be restarted next time
                            // Since startCamera() sets the state, we need to clear it after stopping
                            if (cameraStream === tempCameraStream) {
                                console.log('Clearing cameraStream state to allow restart...');
                                stopCamera(); // This will clear the state
                            }
                            
                            // Small delay to allow browser to release camera
                            await new Promise(resolve => setTimeout(resolve, 300));
                            console.log('Camera stream fully stopped and released');
                        } catch (error) {
                            console.error('Error stopping camera stream:', error);
                            // Still try to clear state even if stopping fails
                            if (cameraStream === tempCameraStream) {
                                stopCamera();
                            }
                        }
                    }
                    
                    // Update the log with captured media (APPEND screenshots, don't replace)
                    if (screenshots.length > 0 || webcamPhoto) {
                        setActivityLogs(prev => {
                            const newLogs = [...prev];
                            const logIndex = newLogs.findIndex(log => log.id === latestLog.id);
                            if (logIndex !== -1) {
                                const existingLog = newLogs[logIndex];
                                const updates: Partial<ActivityLog> = {};
                                
                                if (screenshots.length > 0) {
                                    // APPEND new screenshots to existing ones (don't replace)
                                    const existingScreenshots = existingLog.screenshotUrls || (existingLog.screenshotUrl ? [existingLog.screenshotUrl] : []);
                                    
                                    // IMPORTANT: Only append if this screenshot is not already in the array (prevent duplicates)
                                    const newScreenshots = screenshots.filter(newScreenshot => {
                                        // Check if this screenshot URL already exists
                                        return !existingScreenshots.some(existing => existing === newScreenshot);
                                    });
                                    
                                    if (newScreenshots.length > 0) {
                                        const allScreenshots = [...existingScreenshots, ...newScreenshots];
                                        
                                        // Store all screenshots in array, and first one for backward compatibility
                                        updates.screenshotUrls = allScreenshots; // Append to existing
                                        updates.screenshotUrl = allScreenshots[0]; // Keep first for backward compatibility
                                        console.log(`Appending ${newScreenshots.length} new screenshot(s) to existing ${existingScreenshots.length}. Total: ${allScreenshots.length} (${screenshots.length - newScreenshots.length} duplicates skipped)`);
                                    } else {
                                        console.log(`All ${screenshots.length} screenshot(s) already exist in log, skipping append`);
                                    }
                                }
                                
                                // Webcam photo replaces the old one (only one webcam photo per log)
                                // IMPORTANT: Only update if it's actually different (prevent duplicates)
                                if (webcamPhoto) {
                                    if (existingLog.webcamUrl !== webcamPhoto) {
                                        updates.webcamUrl = webcamPhoto;
                                        console.log('Storing new webcam photo in log');
                                    } else {
                                        console.log('Webcam photo already exists in log, skipping update');
                                    }
                                }
                                
                                // Only update if there are actual changes
                                if (Object.keys(updates).length > 0) {
                                    // Update timestamp to reflect when new media was captured
                                    updates.timestamp = new Date();
                                    
                                    newLogs[logIndex] = { 
                                        ...existingLog, 
                                        ...updates
                                    };
                                    console.log('Log updated with media:', {
                                        logId: latestLog.id,
                                        oldTimestamp: existingLog.timestamp.toLocaleTimeString(),
                                        newTimestamp: newLogs[logIndex].timestamp.toLocaleTimeString(),
                                        hasScreenshot: !!newLogs[logIndex].screenshotUrl,
                                        screenshotCount: newLogs[logIndex].screenshotUrls?.length || 0,
                                        totalScreenshots: newLogs[logIndex].screenshotUrls?.length || 0,
                                        hasWebcam: !!newLogs[logIndex].webcamUrl
                                    });
                                } else {
                                    console.log('No new media to add to log (all duplicates)');
                                }
                                
                                // Mark this log as processed
                                lastProcessedLogIdRef.current = latestLog.id;
                            } else {
                                console.warn('Log not found for update:', latestLog.id);
                            }
                            return newLogs;
                        });
                    } else {
                        console.warn('No media captured for log:', latestLog.id, {
                            screenshotAttempted: needsScreenshot,
                            webcamAttempted: needsWebcam,
                            hasCameraStream: !!cameraStream
                        });
                        // Still mark as processed to avoid retrying
                        lastProcessedLogIdRef.current = latestLog.id;
                    }
                    } finally {
                        // Always clear the in-progress flag
                        captureInProgressRef.current = false;
                    }
                };

                // Add small delay to ensure log is fully created and DOM is ready
                setTimeout(() => {
                    captureMedia();
                }, 1000); // Increased delay to ensure everything is ready
            } else {
                console.log('Media capture skipped:', {
                    isFresh,
                    needsScreenshot,
                    needsWebcam,
                    hasScreenshot: !!latestLog.screenshotUrl,
                    hasWebcam: !!latestLog.webcamUrl
                });
                // Mark as processed even if skipped to avoid retrying
                if (!isFresh || (!needsScreenshot && !needsWebcam)) {
                    lastProcessedLogIdRef.current = latestLog.id;
                }
            }
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activityLogs, isTimerRunning, settings?.enableScreenshotBlur, settings?.enableScreenshots, cameraStream]); // Use activityLogs directly to detect new logs

    const formatTime = (totalSeconds: number) => {
        const h = Math.floor(totalSeconds / 3600);
        const m = Math.floor((totalSeconds % 3600) / 60);
        const s = totalSeconds % 60;
        return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    };

    const toggleTimer = async () => {
        // Block timer start if user hasn't consented
        if (userConsent !== true) {
            alert('You must consent to tracking to use the timer. Please check your settings.');
            return;
        }
        
        if (isTimerRunning) {
            // Stop Timer
            const endTime = new Date();
            const start = startTime ? new Date(startTime) : new Date();
            
            const newEntry: TimeEntry = {
                id: Date.now().toString(),
                description: description || '(No description)',
                projectId: selectedProjectId || '4', 
                startTime: start,
                endTime: endTime,
                duration: elapsedSeconds
            };

            setTimeEntries([newEntry, ...timeEntries]);
            setIsTimerRunning(false);
            setStartTime(null);
            setElapsedSeconds(0);
            setDescription('');
        } else {
            // Start Timer
            setStartTime(Date.now());
            setIsTimerRunning(true);
            // Camera will be started only when needed for capture, not always
        }
    };

    const handleFaceConfirmed = (photoData: string) => {
        if (!user) return;
        
        if (user.isCheckedIn) {
            // Check Out
            setUser({ ...user, isCheckedIn: false, checkInTime: undefined });
            stopCamera(); // Turn off camera
            setView(AppView.LOGIN);
        } else {
            // Check In
            setUser({ ...user, isCheckedIn: true, checkInTime: new Date() });
            // Don't keep camera running - we'll open it only when needed for captures
            stopCamera();
            setView(AppView.DASHBOARD);
        }
    };


    // --- Render ---

    // Hidden elements for processing (opacity 0 instead of display none to allow capture)
    const hiddenElements = (
        <div style={{ position: 'fixed', top: 0, left: 0, opacity: 0, pointerEvents: 'none', zIndex: -1 }}>
            <video ref={hiddenCamVideoRef} autoPlay playsInline muted width="320" height="240" />
            <canvas ref={hiddenCanvasRef} />
        </div>
    );

    // Show consent dialog if needed
    if (showConsentDialog) {
        return (
            <div className="min-h-screen flex flex-col bg-gray-950 font-sans">
                <ConsentDialog onConsent={handleConsent} />
            </div>
        );
    }

    // Show idle dialog if needed
    if (idleInfo && idleInfo.isIdle) {
        return (
            <div className="min-h-screen flex flex-col bg-gray-950 font-sans">
                <IdleDialog 
                    idleDuration={idleInfo.duration}
                    onKeep={() => onIdleDecision(false)}
                    onRemove={() => onIdleDecision(true)}
                />
            </div>
        );
    }

    if (view === AppView.LOGIN) {
        return (
            <div className="min-h-screen flex flex-col bg-gray-950 font-sans">
                <TitleBar />
                <div className="flex-1 flex items-center justify-center p-4">
                    {hiddenElements}
                    <div className="w-full max-w-[400px] bg-gray-900 rounded-2xl shadow-2xl p-8 border border-gray-800">
                    <div className="text-center mb-8">
                        <div className="w-16 h-16 bg-blue-600 rounded-xl mx-auto flex items-center justify-center mb-4 shadow-lg shadow-blue-500/30">
                            <i className="fas fa-bolt text-2xl text-white"></i>
                        </div>
                        <h1 className="text-2xl font-bold text-white tracking-tight">Tyrodesk</h1>
                        <p className="text-gray-400 text-sm">Workforce Management</p>
                    </div>
                    <form onSubmit={(e) => { e.preventDefault(); handleLogin((e.target as any).email.value); }}>
                        <div className="mb-4">
                            <label className="block text-xs uppercase text-gray-500 font-bold mb-2">Work Email</label>
                            <input 
                                name="email"
                                type="email" 
                                defaultValue="alex@company.com"
                                className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-4 py-3 focus:outline-none focus:border-blue-500 transition-colors"
                            />
                        </div>
                        <div className="mb-6">
                            <label className="block text-xs uppercase text-gray-500 font-bold mb-2">Password</label>
                            <input 
                                type="password" 
                                defaultValue="password"
                                className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-4 py-3 focus:outline-none focus:border-blue-500 transition-colors"
                            />
                        </div>
                        <button type="submit" className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-lg shadow-lg transition-all">
                            Log In
                        </button>
                    </form>
                    </div>
                </div>
            </div>
        );
    }

    if (view === AppView.CHECK_IN_OUT) {
        return (
            <div className="min-h-screen bg-gray-950 flex flex-col font-sans">
                <TitleBar />
                <div className="flex-1 flex justify-center">
                    {hiddenElements}
                    <div className="w-full max-w-[400px] bg-gray-900 shadow-2xl overflow-hidden relative border-x border-gray-800">
                    <FaceAttendance 
                        mode={user?.isCheckedIn ? 'CHECK_OUT' : 'CHECK_IN'}
                        existingStream={cameraStream}
                        onConfirm={handleFaceConfirmed}
                        onStreamRequest={async () => { await startCamera(); }}
                        onCancel={() => user?.isCheckedIn ? setView(AppView.DASHBOARD) : setView(AppView.LOGIN)}
                    />
                    </div>
                </div>
            </div>
        );
    }

    if (view === AppView.INSIGHTS) {
        return (
            <div className="min-h-screen bg-gray-950 flex flex-col font-sans">
                <TitleBar />
                <div className="flex-1 flex justify-center">
                    {hiddenElements}
                    <div className="w-full max-w-[400px] bg-gray-900 shadow-2xl overflow-hidden flex flex-col border-x border-gray-800">
                    <InsightsDashboard 
                        logs={activityLogs}
                        projects={projects}
                        onClose={() => setView(AppView.DASHBOARD)}
                    />
                    </div>
                </div>
            </div>
        );
    }

    if (view === AppView.SCREENCAST) {
        return (
            <div className="min-h-screen bg-gray-950 flex flex-col font-sans">
                <TitleBar />
                <div className="flex-1 flex justify-center">
                    {hiddenElements}
                    <div className="w-full max-w-[400px] bg-gray-900 shadow-2xl overflow-hidden flex flex-col border-x border-gray-800">
                    <ScreenLogger 
                        onClose={() => setView(AppView.DASHBOARD)}
                        onCapture={(shot) => console.log(shot)}
                    />
                    </div>
                </div>
            </div>
        );
    }

    if (view === AppView.SETTINGS) {
        return (
            <div className="min-h-screen bg-gray-950 flex flex-col font-sans">
                <TitleBar />
                <div className="flex-1 flex justify-center">
                    {hiddenElements}
                    <SettingsComponent
                        activityLogs={activityLogs}
                        timeEntries={timeEntries}
                        onClose={() => setView(AppView.DASHBOARD)}
                        onDataDeleted={() => {
                            setActivityLogs([]);
                            setTimeEntries([]);
                        }}
                    />
                </div>
            </div>
        );
    }

    // DASHBOARD VIEW
    return (
        <div className="min-h-screen bg-gray-950 flex flex-col font-sans">
            <TitleBar />
            <div className="flex-1 flex justify-center">
                {hiddenElements}
                <div className="w-full max-w-[400px] bg-gray-900 shadow-2xl flex flex-col overflow-hidden border-x border-gray-800 relative">
                
                {/* Header */}
                <header className="bg-gray-800 p-4 flex justify-between items-center shadow-md z-10">
                    <div className="flex items-center gap-3">
                        <div className="relative">
                            <img src={user?.avatar} alt="User" className="w-8 h-8 rounded-full border border-gray-600" />
                            <div className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-gray-800 ${isTimerRunning ? 'bg-green-500 animate-pulse' : 'bg-yellow-500'}`}></div>
                        </div>
                        <div className="flex flex-col">
                            <span className="text-sm font-semibold text-gray-200 leading-tight">{user?.name}</span>
                            <span className="text-[10px] text-gray-500 uppercase font-bold">{isTimerRunning ? 'Tracking' : 'Idle'}</span>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <button 
                            onClick={() => setView(AppView.SETTINGS)}
                            className="w-8 h-8 rounded-full bg-gray-700 hover:bg-gray-600 text-gray-300 flex items-center justify-center transition-colors"
                            title="Settings"
                        >
                            <i className="fas fa-cog text-xs"></i>
                        </button>
                        <button 
                            onClick={() => setView(AppView.INSIGHTS)}
                            className="w-8 h-8 rounded-full bg-blue-900/30 hover:bg-blue-900/50 text-blue-400 flex items-center justify-center transition-colors relative"
                            title="Productivity Insights"
                        >
                             <i className="fas fa-chart-bar text-xs"></i>
                             {activityLogs.length > 0 && <span className="absolute top-0 right-0 w-2 h-2 bg-red-500 rounded-full"></span>}
                        </button>
                        <button 
                            onClick={() => setView(AppView.CHECK_IN_OUT)}
                            className="w-8 h-8 rounded-full bg-red-900/30 hover:bg-red-900/50 text-red-400 flex items-center justify-center transition-colors"
                            title="Check Out"
                        >
                            <i className="fas fa-power-off text-xs"></i>
                        </button>
                    </div>
                </header>

                {/* Main Content */}
                <main className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                    
                    {/* Timer Widget */}
                    <div className="bg-gradient-to-br from-gray-800 to-gray-850 rounded-xl p-4 shadow-lg mb-6 border border-gray-700/50 relative overflow-hidden">
                        {/* Glow effect when running */}
                        {isTimerRunning && <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 via-purple-500 to-blue-500 animate-gradient"></div>}
                        
                        <input 
                            type="text" 
                            placeholder="What are you working on?" 
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            className="w-full bg-transparent text-white placeholder-gray-500 text-sm mb-4 focus:outline-none"
                        />
                        <div className="flex justify-between items-center mb-4">
                            <select 
                                value={selectedProjectId}
                                onChange={(e) => setSelectedProjectId(e.target.value)}
                                className="bg-gray-900 text-blue-400 text-xs py-1 px-2 rounded border border-gray-700 focus:outline-none max-w-[120px]"
                            >
                                <option value="" disabled>Project</option>
                                {projects.map(p => (
                                    <option key={p.id} value={p.id}>{p.name}</option>
                                ))}
                            </select>
                            <div className="text-3xl font-mono text-white tracking-widest font-light">
                                {formatTime(elapsedSeconds)}
                            </div>
                        </div>
                        <button 
                            onClick={toggleTimer}
                            className={`w-full py-3 rounded-lg font-bold text-white shadow-lg transition-all active:scale-95 flex justify-center items-center gap-2 ${
                                isTimerRunning 
                                ? 'bg-red-500 hover:bg-red-600 shadow-red-500/20' 
                                : 'bg-blue-600 hover:bg-blue-500 shadow-blue-500/20'
                            }`}
                        >
                            {isTimerRunning ? <><i className="fas fa-stop"></i> STOP</> : <><i className="fas fa-play"></i> START</>}
                        </button>
                    </div>

                    {/* Time Entries List */}
                    <div>
                        <h3 className="text-gray-400 text-xs font-bold uppercase tracking-wider mb-3">Today</h3>
                        <div className="space-y-3 pb-4">
                            {timeEntries.length === 0 && (
                                <div className="text-center py-8 text-gray-600 bg-gray-900/50 rounded-lg border border-gray-800 border-dashed">
                                    <i className="far fa-clock text-2xl mb-2 block opacity-50"></i>
                                    <span className="text-xs">No entries yet. Start tracking!</span>
                                </div>
                            )}
                            {timeEntries.map(entry => {
                                const project = projects.find(p => p.id === entry.projectId);
                                return (
                                    <div key={entry.id} className="bg-gray-800 rounded-lg p-3 border-l-4 border-gray-700 flex justify-between items-center group hover:bg-gray-750 transition-colors cursor-pointer" style={{ borderLeftColor: project?.color }}>
                                        <div className="overflow-hidden mr-2">
                                            <p className="text-white text-sm font-medium truncate">{entry.description}</p>
                                            <p className="text-gray-500 text-xs flex items-center gap-1">
                                                <span className="w-1.5 h-1.5 rounded-full" style={{ background: project?.color }}></span>
                                                {project?.name}
                                            </p>
                                        </div>
                                        <div className="text-right whitespace-nowrap">
                                            <div className="text-white font-mono text-sm">{formatTime(entry.duration)}</div>
                                            <div className="text-gray-600 text-[10px]">{entry.startTime.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} - {entry.endTime?.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                </main>
                </div>
            </div>
        </div>
    );
};

export default App;