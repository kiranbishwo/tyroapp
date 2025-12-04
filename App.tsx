import React, { useState, useEffect, useRef } from 'react';
import { User, AppView, Project, TimeEntry, Settings, ActivityLog, Task } from './types';
import { FaceAttendance } from './components/FaceAttendance';
import { ScreenLogger } from './components/ScreenLogger';
import { InsightsDashboard } from './components/InsightsDashboard';
import { TitleBar } from './components/TitleBar';
import { ConsentDialog } from './components/ConsentDialog';
import { Settings as SettingsComponent } from './components/Settings';
import { CalculationDetails } from './components/CalculationDetails';
import { IdleDialog } from './components/IdleDialog';
import { CombinedInsights } from './components/CombinedInsights';
import { useSurveillance } from './hooks/useSurveillance';
import { applyBlurWithIntensity } from './utils/imageBlur';

// Electron API types are defined in types/electron.d.ts

// Mock Data with Projects and Tasks
const MOCK_TASKS: Task[] = [
    // Web Development tasks
    { id: 't1', name: 'Fix login bug', projectId: '1', completed: false, description: 'Fix authentication issue on login page' },
    { id: 't2', name: 'Implement dark mode', projectId: '1', completed: false, description: 'Add dark theme toggle' },
    { id: 't3', name: 'Optimize database queries', projectId: '1', completed: false, description: 'Improve query performance' },
    { id: 't4', name: 'Write unit tests', projectId: '1', completed: true, description: 'Add test coverage' },
    
    // Internal Audit tasks
    { id: 't5', name: 'Review Q4 financials', projectId: '2', completed: false, description: 'Audit quarterly financial statements' },
    { id: 't6', name: 'Compliance check', projectId: '2', completed: false, description: 'Verify regulatory compliance' },
    { id: 't7', name: 'Risk assessment', projectId: '2', completed: false, description: 'Evaluate potential risks' },
    
    // UI/UX Design tasks
    { id: 't8', name: 'Design dashboard mockup', projectId: '3', completed: false, description: 'Create new dashboard design' },
    { id: 't9', name: 'User flow diagrams', projectId: '3', completed: false, description: 'Map user journey' },
    { id: 't10', name: 'Prototype mobile app', projectId: '3', completed: true, description: 'Mobile app wireframes' },
    
    // Meeting tasks
    { id: 't11', name: 'Team standup', projectId: '4', completed: false, description: 'Daily team sync' },
    { id: 't12', name: 'Client presentation', projectId: '4', completed: false, description: 'Present project progress' },
];

const MOCK_PROJECTS: Project[] = [
    { 
        id: '1', 
        name: 'Web Development', 
        color: '#60A5FA',
        tasks: MOCK_TASKS.filter(t => t.projectId === '1')
    },
    { 
        id: '2', 
        name: 'Internal Audit', 
        color: '#F472B6',
        tasks: MOCK_TASKS.filter(t => t.projectId === '2')
    },
    { 
        id: '3', 
        name: 'UI/UX Design', 
        color: '#34D399',
        tasks: MOCK_TASKS.filter(t => t.projectId === '3')
    },
    { 
        id: '4', 
        name: 'Meeting', 
        color: '#FBBF24',
        tasks: MOCK_TASKS.filter(t => t.projectId === '4')
    },
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
    const [insightsTaskFilter, setInsightsTaskFilter] = useState<string | undefined>(undefined);
    const [insightsProjectFilter, setInsightsProjectFilter] = useState<string | undefined>(undefined);
    const [showCombinedInsights, setShowCombinedInsights] = useState(false);
    
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
    const [selectedTaskId, setSelectedTaskId] = useState<string>('');
    const [showTaskSelection, setShowTaskSelection] = useState(false);
    // Track accumulated time per task (taskId -> total seconds)
    const [taskAccumulatedTime, setTaskAccumulatedTime] = useState<Record<string, number>>({});
    
    // Today's tasks (for restoration and continuation)
    const [todayTasks, setTodayTasks] = useState<Array<{
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
    }>>([]);
    
    // Settings state for screenshot blur
    const [settings, setSettings] = useState<Settings | null>(null);

    // Get current task and project names
    const currentProject = projects.find(p => p.id === selectedProjectId);
    const currentTask = currentProject?.tasks?.find(t => t.id === selectedTaskId);
    const currentTaskName = currentTask?.name;
    const currentProjectName = currentProject?.name;

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
        currentProjectId: selectedProjectId,
        currentTaskId: selectedTaskId || undefined,
        currentTaskName: currentTaskName,
        currentProjectName: currentProjectName
    });

    const timerIntervalRef = useRef<number | null>(null);

    // Hidden Refs for Background Capture
    // Note: We use opacity: 0 instead of display: none to ensure the browser processes video frames
    const hiddenCamVideoRef = useRef<HTMLVideoElement>(null);
    const hiddenCanvasRef = useRef<HTMLCanvasElement>(null);

    // Initialize accumulated time from existing time entries
    useEffect(() => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayEntries = timeEntries.filter(e => e.startTime >= today);
        
        const accumulated: Record<string, number> = {};
        todayEntries.forEach(entry => {
            if (entry.taskId) {
                if (!accumulated[entry.taskId]) {
                    accumulated[entry.taskId] = 0;
                }
                accumulated[entry.taskId] += entry.duration;
            }
        });
        
        setTaskAccumulatedTime(prev => {
            // Merge with existing, but don't overwrite if timer is running (to preserve current session)
            if (isTimerRunning && selectedTaskId) {
                return prev; // Keep current state when timer is running
            }
            return { ...prev, ...accumulated };
        });
    }, [timeEntries.length]); // Only recalculate when entries count changes, not on every render

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

    // Fetch today's tasks and restore last active task on app startup
    useEffect(() => {
        const fetchTodayTasksAndRestore = async () => {
            // Only restore if consent is checked and user has consented
            if (!consentChecked || userConsent !== true) {
                return;
            }

            try {
                // First, fetch all today's tasks
                if (window.electronAPI?.getTodayTasks) {
                    const tasks = await window.electronAPI.getTodayTasks();
                    setTodayTasks(tasks);
                    console.log('[RESTORE] Fetched', tasks.length, 'tasks from today');
                    
                    // Update accumulated time for all today's tasks
                    const accumulated: Record<string, number> = {};
                    tasks.forEach(task => {
                        if (task.totalTime > 0) {
                            accumulated[task.taskId] = task.totalTime;
                        }
                    });
                    setTaskAccumulatedTime(prev => ({ ...prev, ...accumulated }));
                }
                
                // Then try to restore the last active task
                if (window.electronAPI?.getLastActiveTaskState) {
                    const lastState = await window.electronAPI.getLastActiveTaskState();
                    
                    if (lastState && lastState.projectId && lastState.taskId) {
                        console.log('[RESTORE] Restoring last active task:', lastState.taskId, 'in project:', lastState.projectId);
                        
                        // Restore project and task selection
                        setSelectedProjectId(lastState.projectId);
                        setSelectedTaskId(lastState.taskId);
                        
                        // Restore elapsed time from task data (timer won't auto-start - user needs to manually start)
                        if (lastState.taskData) {
                            // Load accumulated time from task data
                            const elapsedSeconds = lastState.elapsedSeconds || 0;
                            if (elapsedSeconds > 0) {
                                setTaskAccumulatedTime(prev => ({
                                    ...prev,
                                    [lastState.taskId]: elapsedSeconds
                                }));
                                setElapsedSeconds(elapsedSeconds);
                            }
                            
                            console.log('[RESTORE] Task selection restored with', elapsedSeconds, 'seconds of accumulated time');
                        }
                    } else {
                        // No saved state, but we have today's tasks - user can select one to continue
                        console.log('[RESTORE] No saved state found, but', todayTasks.length, 'tasks available from today');
                    }
                }
            } catch (error) {
                console.error('[RESTORE] Error fetching tasks and restoring:', error);
            }
        };

        fetchTodayTasksAndRestore();
    }, [consentChecked, userConsent]);

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

    // Start camera when navigating to CHECK_IN_OUT view (for checkout/checkin)
    useEffect(() => {
        if (view === AppView.CHECK_IN_OUT) {
            // Proactively start camera when entering check-in/out view
            const initCamera = async () => {
                try {
                    // Check if stream exists and is live
                    if (cameraStream) {
                        const videoTracks = cameraStream.getVideoTracks();
                        const hasLiveTracks = videoTracks.length > 0 && videoTracks.some(track => track.readyState === 'live');
                        if (hasLiveTracks) {
                            console.log('Camera stream already active and live');
                            return;
                        } else {
                            console.log('Camera stream exists but not live, stopping and restarting...');
                            stopCamera();
                            await new Promise(resolve => setTimeout(resolve, 300));
                        }
                    }
                    
                    console.log('Starting camera for check-in/out...');
                    const stream = await startCamera();
                    if (stream) {
                        console.log('Camera started successfully for check-in/out');
                    } else {
                        console.error('Camera start returned null/undefined');
                    }
                } catch (err) {
                    console.error('Failed to start camera for check-in/out:', err);
                }
            };
            initCamera();
        } else {
            // When leaving CHECK_IN_OUT view, optionally stop camera (but keep it if timer is running)
            // Don't stop here - let the component handle it
        }
    }, [view, startCamera, stopCamera]);

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


    // Update elapsedSeconds when task is selected (when not running)
    useEffect(() => {
        if (!isTimerRunning && selectedTaskId) {
            const accumulated = taskAccumulatedTime[selectedTaskId] || 0;
            setElapsedSeconds(accumulated);
        } else if (!isTimerRunning && !selectedTaskId) {
            setElapsedSeconds(0);
        }
    }, [selectedTaskId, isTimerRunning, taskAccumulatedTime]);

    // Timer Logic - includes accumulated time
    useEffect(() => {
        if (isTimerRunning && startTime && selectedTaskId) {
            const accumulated = taskAccumulatedTime[selectedTaskId] || 0;
            let saveCounter = 0; // Save state every 30 seconds (30 intervals)
            
            timerIntervalRef.current = window.setInterval(() => {
                const now = Date.now();
                const currentSessionSeconds = Math.floor((now - startTime) / 1000);
                const totalElapsed = accumulated + currentSessionSeconds;
                setElapsedSeconds(totalElapsed);
                
                // No longer saving active task state - all data comes from task JSON files
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
    }, [isTimerRunning, startTime, selectedTaskId, selectedProjectId, taskAccumulatedTime]);

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
                    taskId: selectedTaskId || undefined,
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
                            taskId: selectedTaskId || undefined,
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
        if (activityLogs.length > 0 && isTimerRunning && selectedTaskId) {
            // Find the latest log that belongs to the CURRENT task
            // This ensures media is only attached to logs for the active task
            const latestLogForCurrentTask = activityLogs.find(log => 
                log && // Ensure log is not null/undefined
                log.taskId === selectedTaskId && 
                log.projectId === selectedProjectId
            );
            
            // If no log found for current task, skip (might be a new task just started)
            if (!latestLogForCurrentTask) {
                console.log('No log found for current task, skipping capture:', {
                    selectedTaskId,
                    selectedProjectId,
                    availableLogs: activityLogs.map(l => ({ id: l.id, taskId: l.taskId, projectId: l.projectId }))
                });
                return;
            }
            
            const latestLog = latestLogForCurrentTask;
            
            // Skip if we already processed this log
            if (latestLog.id === lastProcessedLogIdRef.current) {
                return;
            }
            
            // Skip if capture is already in progress for this log
            if (captureInProgressRef.current) {
                console.log('Capture already in progress, skipping duplicate...');
                return;
            }
            
            // Verify this log belongs to the current task
            if (latestLog.taskId !== selectedTaskId || latestLog.projectId !== selectedProjectId) {
                console.warn('Log does not belong to current task, skipping capture:', {
                    logTaskId: latestLog.taskId,
                    currentTaskId: selectedTaskId,
                    logProjectId: latestLog.projectId,
                    currentProjectId: selectedProjectId
                });
                return;
            }
            
            // Increased time window to 5 minutes to allow for async operations and retries
            const isFresh = (new Date().getTime() - latestLog.timestamp.getTime()) < 300000; // 5 minutes
            
            // Capture screenshots and webcam if enabled and log doesn't have them yet
            const needsScreenshot = !latestLog.screenshotUrl && settings?.enableScreenshots !== false;
            const needsWebcam = !latestLog.webcamUrl;
            
            console.log('Capture check:', {
                logId: latestLog.id,
                logTaskId: latestLog.taskId,
                currentTaskId: selectedTaskId,
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
                                        const shouldBlur = settings?.enableScreenshotBlur || false;
                                        let rawScreenshot = await window.electronAPI.captureScreenshot(shouldBlur);
                                        
                                        if (rawScreenshot && rawScreenshot.length > 100) {
                                            // Screenshot is already tagged with task in main process
                                            // Apply additional blur if needed (screenshot may already be blurred)
                                            let screenUrl = rawScreenshot;
                                            if (settings?.enableScreenshotBlur && !shouldBlur) {
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
                                            
                                            // Tag webcam photo with current task
                                            if (selectedTaskId && selectedProjectId && window.electronAPI && window.electronAPI.addWebcamPhotoToTask) {
                                                window.electronAPI.addWebcamPhotoToTask(webcamPhoto).then(() => {
                                                    console.log('Webcam photo tagged with task');
                                                }).catch(err => {
                                                    console.error('Failed to tag webcam photo with task:', err);
                                                });
                                            }
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
                    // IMPORTANT: Only update logs that belong to the current task
                    if (screenshots.length > 0 || webcamPhoto) {
                        setActivityLogs(prev => {
                            const newLogs = [...prev];
                            // Find log by ID AND verify it belongs to current task
                            const logIndex = newLogs.findIndex(log => 
                                log.id === latestLog.id && 
                                log.taskId === selectedTaskId &&
                                log.projectId === selectedProjectId
                            );
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
    }, [activityLogs, isTimerRunning, selectedTaskId, selectedProjectId, settings?.enableScreenshotBlur, settings?.enableScreenshots, cameraStream]); // Use activityLogs directly to detect new logs

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
            
            const selectedTask = MOCK_TASKS.find(t => t.id === selectedTaskId);
            const taskName = selectedTask?.name || description || '(No description)';
            
            // Calculate current session duration
            const currentSessionDuration = startTime ? Math.floor((Date.now() - startTime) / 1000) : 0;
            
            // Update accumulated time for this task
            if (selectedTaskId) {
                const currentAccumulated = taskAccumulatedTime[selectedTaskId] || 0;
                const newAccumulated = currentAccumulated + currentSessionDuration;
                setTaskAccumulatedTime(prev => ({
                    ...prev,
                    [selectedTaskId]: newAccumulated
                }));
            }
            
            // Check if there's an existing entry for this task today that was created when starting
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const existingEntryIndex = timeEntries.findIndex(e => 
                e.startTime >= today && 
                e.taskId === selectedTaskId && 
                !e.endTime // Entry created when starting (no endTime yet)
            );
            
            if (existingEntryIndex !== -1) {
                // Update existing entry
                const updatedEntries = [...timeEntries];
                updatedEntries[existingEntryIndex] = {
                    ...updatedEntries[existingEntryIndex],
                    id: Date.now().toString(), // Replace temp ID with real ID
                    startTime: start,
                    endTime: endTime,
                    duration: currentSessionDuration
                };
                setTimeEntries(updatedEntries);
            } else {
                // Create new entry (normal flow)
                const newEntry: TimeEntry = {
                    id: Date.now().toString(),
                    description: taskName,
                    projectId: selectedProjectId || '4',
                    taskId: selectedTaskId || undefined,
                    startTime: start,
                    endTime: endTime,
                    duration: currentSessionDuration
                };
                setTimeEntries([newEntry, ...timeEntries]);
            }
            
            setIsTimerRunning(false);
            setStartTime(null);
            // Keep elapsedSeconds showing the accumulated total (don't reset to 0)
            // It will be recalculated when timer restarts
            
            // No longer saving active task state - all data comes from task JSON files
        } else {
            // Validate task is selected before starting
            if (!selectedTaskId && !selectedProjectId) {
                alert('Please select a project and task first.');
                return;
            }
            
            // Check if this task is already in today's list
            if (selectedTaskId) {
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                const todayEntries = timeEntries.filter(e => e.startTime >= today);
                const taskAlreadyListed = todayEntries.some(e => e.taskId === selectedTaskId);
                
                // If task is not in today's list, add it now
                if (!taskAlreadyListed) {
                    const selectedTask = MOCK_TASKS.find(t => t.id === selectedTaskId);
                    const taskName = selectedTask?.name || description || '(No description)';
                    const now = new Date();
                    
                    const newEntry: TimeEntry = {
                        id: `temp-${Date.now()}`,
                        description: taskName,
                        projectId: selectedProjectId || '4',
                        taskId: selectedTaskId,
                        startTime: now,
                        endTime: undefined, // Will be set when timer stops
                        duration: 0 // Will be updated when timer stops
                    };
                    
                    setTimeEntries([newEntry, ...timeEntries]);
                }
            }
            
            // Start Timer - load accumulated time for this task
            if (selectedTaskId) {
                const accumulated = taskAccumulatedTime[selectedTaskId] || 0;
                setElapsedSeconds(accumulated); // Set to accumulated time
            } else {
                setElapsedSeconds(0);
            }
            
            const newStartTime = Date.now();
            setStartTime(newStartTime);
            setIsTimerRunning(true);
            // Camera will be started only when needed for capture, not always
            
            // No longer saving active task state - all data comes from task JSON files
        }
    };

    const handleFaceConfirmed = async (photoData: string) => {
        if (!user) return;
        
        if (user.isCheckedIn) {
            // Check Out - stop task if running
            if (isTimerRunning) {
                await toggleTimer();
                // Wait a moment for the task to stop and save
                await new Promise(resolve => setTimeout(resolve, 500));
            }
            
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
                        onStreamRequest={async () => { 
                            console.log('FaceAttendance: onStreamRequest called');
                            const stream = await startCamera();
                            if (!stream) {
                                throw new Error('Failed to start camera');
                            }
                            // Wait a bit for state to update
                            await new Promise(resolve => setTimeout(resolve, 300));
                            console.log('FaceAttendance: Camera stream should be available now');
                        }}
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
                        tasks={MOCK_TASKS}
                        onClose={() => {
                            setView(AppView.DASHBOARD);
                            setInsightsTaskFilter(undefined);
                        }}
                        filterTaskId={insightsTaskFilter}
                        filterProjectId={insightsProjectFilter || (insightsTaskFilter ? (() => {
                            const task = MOCK_TASKS.find(t => t.id === insightsTaskFilter);
                            return task ? task.projectId : undefined;
                        })() : undefined)}
                        filterTimeEntries={insightsTaskFilter ? timeEntries
                            .filter(e => e.taskId === insightsTaskFilter)
                            .sort((a, b) => a.startTime.getTime() - b.startTime.getTime())
                            .map(e => ({ 
                                startTime: e.startTime, 
                                endTime: e.endTime || new Date() // Use current time if still running
                            })) : undefined}
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
                        onNavigateToCalculationDetails={() => setView(AppView.CALCULATION_DETAILS)}
                    />
                </div>
            </div>
        );
    }

    if (view === AppView.CALCULATION_DETAILS) {
        return (
            <div className="min-h-screen bg-gray-950 flex flex-col font-sans">
                <TitleBar />
                <div className="flex-1 flex justify-center">
                    {hiddenElements}
                    <CalculationDetails
                        onClose={() => setView(AppView.SETTINGS)}
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
                            onClick={() => setShowCombinedInsights(true)}
                            className="w-8 h-8 rounded-full bg-blue-900/30 hover:bg-blue-900/50 text-blue-400 flex items-center justify-center transition-colors"
                            title="Combined Insights"
                        >
                            <i className="fas fa-chart-pie text-xs"></i>
                        </button>
                        <button 
                            onClick={() => setView(AppView.SETTINGS)}
                            className="w-8 h-8 rounded-full bg-gray-700 hover:bg-gray-600 text-gray-300 flex items-center justify-center transition-colors"
                            title="Settings"
                        >
                            <i className="fas fa-cog text-xs"></i>
                        </button>
                        <button 
                            onClick={() => {
                                setInsightsTaskFilter(undefined); // Clear filter to show all
                                setInsightsProjectFilter(undefined);
                                setView(AppView.INSIGHTS);
                            }}
                            className="w-8 h-8 rounded-full bg-blue-900/30 hover:bg-blue-900/50 text-blue-400 flex items-center justify-center transition-colors relative"
                            title="Productivity Insights"
                        >
                             <i className="fas fa-chart-bar text-xs"></i>
                             {activityLogs.length > 0 && <span className="absolute top-0 right-0 w-2 h-2 bg-red-500 rounded-full"></span>}
                        </button>
                        <button 
                            onClick={async () => {
                                // If timer is running, stop the task first
                                if (isTimerRunning) {
                                    await toggleTimer();
                                    // Wait a moment for the task to stop and save
                                    await new Promise(resolve => setTimeout(resolve, 500));
                                }
                                setView(AppView.CHECK_IN_OUT);
                            }}
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
                        
                        {!isTimerRunning && !selectedProjectId && (
                            /* Step 1: Project Selection with Resume Option */
                            <div>
                                {/* Resume Last Task Section */}
                                {(() => {
                                    // Get the most recent time entry with a task
                                    const lastEntry = timeEntries.find(e => e.taskId);
                                    const lastTask = lastEntry?.taskId ? MOCK_TASKS.find(t => t.id === lastEntry.taskId) : null;
                                    const lastProject = lastEntry ? projects.find(p => p.id === lastEntry.projectId) : null;
                                    
                                    // Get unique recent tasks from today's entries
                                    const today = new Date();
                                    today.setHours(0, 0, 0, 0);
                                    const recentEntries = timeEntries
                                        .filter(e => e.startTime >= today && e.taskId)
                                        .slice(0, 3); // Last 3 unique tasks
                                    
                                    const recentTasks = recentEntries
                                        .map(e => {
                                            const task = MOCK_TASKS.find(t => t.id === e.taskId);
                                            const project = projects.find(p => p.id === e.projectId);
                                            return task && project ? { task, project, entry: e } : null;
                                        })
                                        .filter((item): item is { task: Task; project: Project; entry: TimeEntry } => item !== null)
                                        .reduce((acc, item) => {
                                            // Remove duplicates, keep most recent
                                            if (!acc.find(i => i.task.id === item.task.id)) {
                                                acc.push(item);
                                            }
                                            return acc;
                                        }, [] as { task: Task; project: Project; entry: TimeEntry }[]);
                                    
                                    return (
                                        <>
                                            {lastTask && lastProject && (
                                                <div className="mb-4 pb-4 border-b border-gray-700">
                                                    <h3 className="text-gray-400 text-xs font-semibold mb-2 uppercase tracking-wider">Resume</h3>
                                                    <button
                                                        onClick={() => {
                                                            setSelectedProjectId(lastEntry!.projectId);
                                                            setSelectedTaskId(lastEntry!.taskId!);
                                                            setDescription(lastTask.name);
                                                            setShowTaskSelection(false);
                                                        }}
                                                        className="w-full p-3 rounded-lg border-2 border-gray-700 hover:border-gray-600 bg-gray-900/50 hover:bg-gray-900 transition-all text-left group"
                                                        style={{
                                                            borderColor: lastProject.color,
                                                            backgroundColor: `${lastProject.color}10`
                                                        }}
                                                    >
                                                        <div className="flex items-center gap-2 mb-1">
                                                            <span 
                                                                className="w-2 h-2 rounded-full" 
                                                                style={{ background: lastProject.color }}
                                                            ></span>
                                                            <span className="text-white text-xs font-medium">{lastProject.name}</span>
                                                            <span className="text-gray-500 text-xs">•</span>
                                                            <span className="text-gray-400 text-xs">Last worked</span>
                                                        </div>
                                                        <p className="text-white text-sm font-medium">{lastTask.name}</p>
                                                        {lastTask.description && (
                                                            <p className="text-gray-500 text-xs mt-1 line-clamp-1">{lastTask.description}</p>
                                                        )}
                                                        <div className="flex items-center gap-1 mt-2 text-blue-400 text-xs">
                                                            <i className="fas fa-redo"></i>
                                                            <span>Resume</span>
                                                        </div>
                                                    </button>
                                                </div>
                                            )}
                                            
                                            {recentTasks.length > 0 && (
                                                <div className="mb-4 pb-4 border-b border-gray-700">
                                                    <h3 className="text-gray-400 text-xs font-semibold mb-2 uppercase tracking-wider">Recent Tasks</h3>
                                                    <div className="space-y-2">
                                                        {recentTasks.map(({ task, project, entry }) => (
                                                            <button
                                                                key={task.id}
                                                                onClick={() => {
                                                                    setSelectedProjectId(project.id);
                                                                    setSelectedTaskId(task.id);
                                                                    setDescription(task.name);
                                                                    setShowTaskSelection(false);
                                                                }}
                                                                className="w-full p-2.5 rounded-lg border border-gray-700 hover:border-gray-600 bg-gray-900/30 hover:bg-gray-900/50 transition-all text-left group"
                                                                style={{
                                                                    borderColor: selectedTaskId === task.id ? project.color : undefined,
                                                                    backgroundColor: selectedTaskId === task.id ? `${project.color}10` : undefined
                                                                }}
                                                            >
                                                                <div className="flex items-center justify-between gap-2">
                                                                    <div className="flex items-center gap-2 flex-1 min-w-0">
                                                                        <span 
                                                                            className="w-1.5 h-1.5 rounded-full flex-shrink-0" 
                                                                            style={{ background: project.color }}
                                                                        ></span>
                                                                        <span className="text-gray-400 text-xs truncate">{project.name}</span>
                                                                        <span className="text-gray-600 text-xs">•</span>
                                                                        <span className="text-white text-xs font-medium truncate">{task.name}</span>
                                                                    </div>
                                                                    <i className="fas fa-chevron-right text-gray-600 text-xs group-hover:text-gray-400 flex-shrink-0"></i>
                                                                </div>
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </>
                                    );
                                })()}
                                
                                {/* Today's Tasks - Continue Previous Work */}
                                {todayTasks.length > 0 && !isTimerRunning && !selectedTaskId && !selectedProjectId && (
                                    <div className="mb-6">
                                        <div className="mb-3">
                                            <h3 className="text-white text-sm font-semibold mb-2 flex items-center gap-2">
                                                <i className="fas fa-history text-yellow-500"></i>
                                                Continue Today's Tasks ({todayTasks.length})
                                            </h3>
                                            <p className="text-gray-500 text-xs">Select a task to continue where you left off</p>
                                        </div>
                                        <div className="space-y-2 max-h-[300px] overflow-y-auto custom-scrollbar">
                                            {todayTasks.map((task) => {
                                                const project = projects.find(p => p.id === task.projectId);
                                                const hours = Math.floor(task.totalTime / 3600);
                                                const minutes = Math.floor((task.totalTime % 3600) / 60);
                                                const timeStr = hours > 0 
                                                    ? `${hours}h ${minutes}m` 
                                                    : `${minutes}m`;
                                                
                                                return (
                                                    <button
                                                        key={`${task.projectId}-${task.taskId}`}
                                                        onClick={async () => {
                                                            setSelectedProjectId(task.projectId);
                                                            setSelectedTaskId(task.taskId);
                                                            setDescription(task.taskName);
                                                            
                                                            // Load task data and set accumulated time
                                                            if (window.electronAPI?.loadTaskTrackingData) {
                                                                try {
                                                                    const taskData = await window.electronAPI.loadTaskTrackingData(
                                                                        task.projectId,
                                                                        task.taskId
                                                                    );
                                                                    if (taskData?.trackingData) {
                                                                        setTaskAccumulatedTime(prev => ({
                                                                            ...prev,
                                                                            [task.taskId]: task.totalTime
                                                                        }));
                                                                        setElapsedSeconds(task.totalTime);
                                                                    }
                                                                } catch (error) {
                                                                    console.error('Error loading task data:', error);
                                                                }
                                                            }
                                                        }}
                                                        className="w-full p-3 rounded-lg border border-gray-700 hover:border-gray-600 bg-gray-900/50 hover:bg-gray-900 transition-all text-left group"
                                                        style={{
                                                            borderColor: selectedTaskId === task.taskId ? (project?.color || '#60A5FA') : undefined,
                                                            backgroundColor: selectedTaskId === task.taskId ? `${project?.color || '#60A5FA'}15` : undefined
                                                        }}
                                                    >
                                                        <div className="flex items-start justify-between gap-2">
                                                            <div className="flex-1 min-w-0">
                                                                <div className="flex items-center gap-2 mb-1">
                                                                    <span 
                                                                        className="w-2 h-2 rounded-full flex-shrink-0" 
                                                                        style={{ background: project?.color || '#60A5FA' }}
                                                                    ></span>
                                                                    <p className="text-white text-sm font-medium truncate">{task.taskName}</p>
                                                                </div>
                                                                <p className="text-gray-500 text-xs mb-1">{task.projectName}</p>
                                                                <div className="flex items-center gap-3 text-xs text-gray-500">
                                                                    <span className="flex items-center gap-1">
                                                                        <i className="far fa-clock"></i>
                                                                        {timeStr}
                                                                    </span>
                                                                    {task.activityLogCount > 0 && (
                                                                        <span className="flex items-center gap-1">
                                                                            <i className="fas fa-chart-line"></i>
                                                                            {task.activityLogCount} logs
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </div>
                                                            <i className="fas fa-chevron-right text-gray-500 text-xs mt-1 group-hover:text-gray-400"></i>
                                                        </div>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                        <div className="mt-4 pt-4 border-t border-gray-700">
                                            <h3 className="text-white text-sm font-semibold mb-3">Or Start New Task</h3>
                                        </div>
                                    </div>
                                )}

                                <div className="mb-4">
                                    <h3 className="text-white text-sm font-semibold mb-3">Select Project</h3>
                                    <div className="grid grid-cols-2 gap-2">
                                        {projects.map(project => (
                                            <button
                                                key={project.id}
                                                onClick={() => {
                                                    setSelectedProjectId(project.id);
                                                    setShowTaskSelection(true);
                                                }}
                                                className="p-3 rounded-lg border-2 border-gray-700 hover:border-gray-600 transition-all text-left group hover:scale-[1.02] active:scale-[0.98]"
                                                style={{ 
                                                    borderColor: selectedProjectId === project.id ? project.color : undefined,
                                                    backgroundColor: selectedProjectId === project.id ? `${project.color}15` : undefined
                                                }}
                                            >
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span 
                                                        className="w-2 h-2 rounded-full" 
                                                        style={{ background: project.color }}
                                                    ></span>
                                                    <span className="text-white text-xs font-medium truncate">{project.name}</span>
                                                </div>
                                                <span className="text-gray-500 text-[10px]">
                                                    {project.tasks?.filter(t => !t.completed).length || 0} tasks
                                                </span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}

                        {!isTimerRunning && selectedProjectId && showTaskSelection && (
                            /* Step 2: Task Selection */
                            <div>
                                <div className="mb-4">
                                    <div className="flex items-center justify-between mb-3">
                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={() => {
                                                    setSelectedProjectId('');
                                                    setShowTaskSelection(false);
                                                    setSelectedTaskId('');
                                                }}
                                                className="w-6 h-6 rounded-full bg-gray-700 hover:bg-gray-600 flex items-center justify-center text-gray-400 hover:text-white transition-colors"
                                            >
                                                <i className="fas fa-arrow-left text-xs"></i>
                                            </button>
                                            <h3 className="text-white text-sm font-semibold">
                                                {projects.find(p => p.id === selectedProjectId)?.name}
                                            </h3>
                                        </div>
                                    </div>
                                    <div className="space-y-2 max-h-[200px] overflow-y-auto custom-scrollbar">
                                        {(() => {
                                            const selectedProject = projects.find(p => p.id === selectedProjectId);
                                            const uncompletedTasks = selectedProject?.tasks?.filter(t => !t.completed) || [];
                                            
                                            if (uncompletedTasks.length === 0) {
                                                return (
                                                    <div className="text-center py-6 text-gray-500 text-xs">
                                                        <i className="far fa-check-circle text-2xl mb-2 block opacity-50"></i>
                                                        <span>All tasks completed!</span>
                                                    </div>
                                                );
                                            }
                                            
                                            return uncompletedTasks.map(task => (
                                                <button
                                                    key={task.id}
                                                    onClick={() => {
                                                        setSelectedTaskId(task.id);
                                                        setDescription(task.name);
                                                        setShowTaskSelection(false);
                                                    }}
                                                    className="w-full p-3 rounded-lg border border-gray-700 hover:border-gray-600 bg-gray-900/50 hover:bg-gray-900 transition-all text-left group"
                                                    style={{
                                                        borderColor: selectedTaskId === task.id ? projects.find(p => p.id === selectedProjectId)?.color : undefined,
                                                        backgroundColor: selectedTaskId === task.id ? `${projects.find(p => p.id === selectedProjectId)?.color}15` : undefined
                                                    }}
                                                >
                                                    <div className="flex items-start justify-between gap-2">
                                                        <div className="flex-1 min-w-0">
                                                            <p className="text-white text-sm font-medium truncate">{task.name}</p>
                                                            {task.description && (
                                                                <p className="text-gray-500 text-xs mt-1 line-clamp-2">{task.description}</p>
                                                            )}
                                                        </div>
                                                        <i className="fas fa-chevron-right text-gray-500 text-xs mt-1 group-hover:text-gray-400"></i>
                                                    </div>
                                                </button>
                                            ));
                                        })()}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Timer Display (when task is selected or timer is running) */}
                        {(isTimerRunning || (selectedTaskId && !showTaskSelection)) && (
                            <div>
                                <div className="mb-4">
                                    <div className="flex items-center gap-2 mb-2">
                                        <span 
                                            className="w-2 h-2 rounded-full" 
                                            style={{ background: projects.find(p => p.id === selectedProjectId)?.color || '#60A5FA' }}
                                        ></span>
                                        <span className="text-gray-400 text-xs">
                                            {projects.find(p => p.id === selectedProjectId)?.name}
                                        </span>
                                    </div>
                                    <p className="text-white text-base font-medium mb-1">
                                        {(() => {
                                            const task = MOCK_TASKS.find(t => t.id === selectedTaskId);
                                            return task?.name || description || 'No task selected';
                                        })()}
                                    </p>
                                    {(() => {
                                        const task = MOCK_TASKS.find(t => t.id === selectedTaskId);
                                        // Calculate total time spent on this task today
                                        const today = new Date();
                                        today.setHours(0, 0, 0, 0);
                                        const taskTotalTime = timeEntries
                                            .filter(e => e.taskId === selectedTaskId && e.startTime >= today)
                                            .reduce((sum, e) => sum + e.duration, 0);
                                        
                                        return (
                                            <>
                                                {task?.description && (
                                                    <p className="text-gray-500 text-xs">{task.description}</p>
                                                )}
                                                {taskTotalTime > 0 && !isTimerRunning && (
                                                    <p className="text-gray-500 text-xs mt-1 flex items-center gap-1">
                                                        <i className="fas fa-history text-[10px]"></i>
                                                        <span>Total today: {formatTime(taskTotalTime)}</span>
                                                    </p>
                                                )}
                                            </>
                                        );
                                    })()}
                                </div>
                                
                                <div className="flex justify-between items-center mb-4">
                                    <button
                                        onClick={() => {
                                            if (!isTimerRunning) {
                                                setSelectedProjectId('');
                                                setSelectedTaskId('');
                                                setDescription('');
                                                setShowTaskSelection(false);
                                            }
                                        }}
                                        className="text-gray-400 hover:text-white text-xs transition-colors"
                                        disabled={isTimerRunning}
                                    >
                                        {!isTimerRunning && <><i className="fas fa-arrow-left mr-1"></i> Change</>}
                                    </button>
                                    <div className="text-3xl font-mono text-white tracking-widest font-light">
                                        {(() => {
                                            if (isTimerRunning) {
                                                // When running, show live timer (accumulated + current session)
                                                return formatTime(elapsedSeconds);
                                            } else if (selectedTaskId) {
                                                // When stopped, show accumulated time for this task
                                                const accumulated = taskAccumulatedTime[selectedTaskId] || 0;
                                                return formatTime(accumulated);
                                            } else {
                                                // No task selected
                                                return formatTime(0);
                                            }
                                        })()}
                                    </div>
                                </div>
                                
                                {!isTimerRunning && selectedTaskId && (() => {
                                    const accumulated = taskAccumulatedTime[selectedTaskId] || 0;
                                    return accumulated > 0;
                                })() && (
                                    <div className="mb-3 p-2.5 rounded-lg bg-blue-500/10 border border-blue-500/20">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <i className="fas fa-clock text-blue-400 text-xs"></i>
                                                <span className="text-blue-400 text-xs">Ready to resume</span>
                                            </div>
                                        </div>
                                    </div>
                                )}
                                
                                <button 
                                    onClick={toggleTimer}
                                    className={`w-full py-3 rounded-lg font-bold text-white shadow-lg transition-all active:scale-95 flex justify-center items-center gap-2 ${
                                        isTimerRunning 
                                        ? 'bg-red-500 hover:bg-red-600 shadow-red-500/20' 
                                        : 'bg-blue-600 hover:bg-blue-500 shadow-blue-500/20'
                                    }`}
                                >
                                    {isTimerRunning ? (
                                        <><i className="fas fa-stop"></i> STOP</>
                                    ) : (
                                        <><i className="fas fa-play"></i> {(() => {
                                            if (!selectedTaskId) return 'START';
                                            const accumulated = taskAccumulatedTime[selectedTaskId] || 0;
                                            return accumulated > 0 ? 'RESUME' : 'START';
                                        })()}</>
                                    )}
                                </button>
                            </div>
                        )}
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
                            {(() => {
                                // Group entries by taskId to avoid duplicates
                                const today = new Date();
                                today.setHours(0, 0, 0, 0);
                                const todayEntries = timeEntries.filter(e => e.startTime >= today);
                                
                                // Group by taskId (or description if no taskId)
                                type GroupedTask = {
                                    taskId?: string;
                                    description: string;
                                    projectId: string;
                                    entries: TimeEntry[];
                                    totalDuration: number;
                                    lastStartTime: Date;
                                    lastEndTime?: Date;
                                };
                                
                                const groupedEntries: Record<string, GroupedTask> = todayEntries.reduce((acc, entry) => {
                                    const key = entry.taskId || entry.description;
                                    if (!acc[key]) {
                                        acc[key] = {
                                            taskId: entry.taskId,
                                            description: entry.description,
                                            projectId: entry.projectId,
                                            entries: [],
                                            totalDuration: 0,
                                            lastStartTime: entry.startTime,
                                            lastEndTime: entry.endTime
                                        };
                                    }
                                    acc[key].entries.push(entry);
                                    acc[key].totalDuration += entry.duration;
                                    // Keep the most recent entry for time display
                                    if (entry.startTime > acc[key].lastStartTime) {
                                        acc[key].lastStartTime = entry.startTime;
                                        acc[key].lastEndTime = entry.endTime;
                                    }
                                    return acc;
                                }, {} as Record<string, GroupedTask>);
                                
                                const uniqueTasks: GroupedTask[] = Object.values(groupedEntries).sort((a, b) => 
                                    b.lastStartTime.getTime() - a.lastStartTime.getTime()
                                );
                                
                                return uniqueTasks.map((group, index) => {
                                    const project = projects.find(p => p.id === group.projectId);
                                    const task = group.taskId ? MOCK_TASKS.find(t => t.id === group.taskId) : null;
                                    const isCurrentlySelected = selectedTaskId === group.taskId && !isTimerRunning;
                                    const isCurrentlyRunning = selectedTaskId === group.taskId && isTimerRunning;
                                    
                                    // Calculate total time: accumulated from entries + current session if running
                                    let displayTime = group.totalDuration;
                                    if (isCurrentlyRunning && group.taskId) {
                                        // Show live timer: accumulated time + current session
                                        displayTime = elapsedSeconds;
                                    } else if (group.taskId) {
                                        // Show accumulated time from state (includes all sessions)
                                        const accumulated = taskAccumulatedTime[group.taskId] || 0;
                                        displayTime = accumulated > 0 ? accumulated : group.totalDuration;
                                    }
                                    
                                    return (
                                        <div 
                                            key={group.taskId || group.description || index} 
                                            className={`bg-gray-800 rounded-lg p-3 border-l-4 border-gray-700 group hover:bg-gray-750 transition-colors ${
                                                isCurrentlyRunning ? 'ring-2 ring-blue-500/50' : ''
                                            }`}
                                            style={{ borderLeftColor: project?.color }}
                                        >
                                            <div className="flex justify-between items-start gap-3">
                                                <div className="flex-1 overflow-hidden min-w-0">
                                                    <div className="flex items-center gap-2">
                                                        <p className="text-white text-sm font-medium truncate">
                                                            {task?.name || group.description}
                                                        </p>
                                                        {isCurrentlyRunning && (
                                                            <span className="flex-shrink-0 w-2 h-2 bg-green-500 rounded-full animate-pulse" title="Running"></span>
                                                        )}
                                                    </div>
                                                    <p className="text-gray-500 text-xs flex items-center gap-1 mt-1">
                                                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: project?.color }}></span>
                                                        {project?.name}
                                                        {task && task.name !== group.description && (
                                                            <span className="text-gray-600">• {task.name}</span>
                                                        )}
                                                        {group.entries.length > 1 && (
                                                            <span className="text-gray-600">• {group.entries.length} sessions</span>
                                                        )}
                                                    </p>
                                                </div>
                                                <div className="flex flex-col items-end gap-2">
                                                    <div className="text-right whitespace-nowrap">
                                                        <div className={`font-mono text-sm ${isCurrentlyRunning ? 'text-green-400' : 'text-white'}`}>
                                                            {formatTime(displayTime)}
                                                        </div>
                                                        {group.lastEndTime && !isCurrentlyRunning && (
                                                            <div className="text-gray-600 text-[10px]">
                                                                {group.lastStartTime.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} - {group.lastEndTime.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                                            </div>
                                                        )}
                                                        {!group.lastEndTime && !isCurrentlyRunning && (
                                                            <div className="text-gray-600 text-[10px]">
                                                                Started {group.lastStartTime.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                                            </div>
                                                        )}
                                                        {isCurrentlyRunning && (
                                                            <div className="text-green-400 text-[10px] flex items-center gap-1">
                                                                <i className="fas fa-circle text-[6px]"></i>
                                                                <span>Started {group.lastStartTime.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                                                            </div>
                                                        )}
                                                    </div>
                                                    {group.taskId && (
                                                        <div className="flex gap-2">
                                                            <button
                                                                onClick={() => {
                                                                    // Open insights with task filter
                                                                    const taskEntries = timeEntries.filter(e => e.taskId === group.taskId);
                                                                    console.log('Opening task report:', {
                                                                        taskId: group.taskId,
                                                                        projectId: group.projectId,
                                                                        taskName: task?.name,
                                                                        timeEntriesCount: taskEntries.length,
                                                                        timeEntries: taskEntries.map(e => ({
                                                                            start: e.startTime.toISOString(),
                                                                            end: e.endTime?.toISOString(),
                                                                            duration: e.duration
                                                                        })),
                                                                        availableLogs: activityLogs.filter(l => l.taskId === group.taskId || l.projectId === group.projectId).map(l => ({
                                                                            id: l.id,
                                                                            taskId: l.taskId,
                                                                            projectId: l.projectId,
                                                                            timestamp: l.timestamp.toISOString(),
                                                                            keystrokes: l.keyboardEvents,
                                                                            mouseClicks: l.mouseEvents,
                                                                            hasScreenshot: !!(l.screenshotUrl || l.screenshotUrls?.length),
                                                                            hasWebcam: !!l.webcamUrl
                                                                        }))
                                                                    });
                                                                    setInsightsTaskFilter(group.taskId);
                                                                    setInsightsProjectFilter(group.projectId);
                                                                    setView(AppView.INSIGHTS);
                                                                }}
                                                                className="px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300"
                                                                title="View Report"
                                                            >
                                                                <i className="fas fa-chart-line text-[10px]"></i>
                                                                <span>Report</span>
                                                            </button>
                                                            <button
                                                                onClick={() => {
                                                                    if (!isTimerRunning) {
                                                                        setSelectedProjectId(group.projectId);
                                                                        setSelectedTaskId(group.taskId!);
                                                                        setDescription(task?.name || group.description);
                                                                        setShowTaskSelection(false);
                                                                        // Auto-start timer
                                                                        if (userConsent === true) {
                                                                            // Load accumulated time
                                                                            const accumulated = taskAccumulatedTime[group.taskId] || 0;
                                                                            setElapsedSeconds(accumulated);
                                                                            setStartTime(Date.now());
                                                                            setIsTimerRunning(true);
                                                                        }
                                                                    }
                                                                }}
                                                                disabled={isTimerRunning}
                                                                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
                                                                    isCurrentlySelected
                                                                        ? 'bg-blue-600 hover:bg-blue-500 text-white'
                                                                        : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                                                                } ${isTimerRunning ? 'opacity-50 cursor-not-allowed' : ''}`}
                                                            >
                                                                <i className={`fas ${displayTime > 0 ? 'fa-redo' : 'fa-play'} text-[10px]`}></i>
                                                                <span>{displayTime > 0 ? 'Resume' : 'Start'}</span>
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                });
                            })()}
                        </div>
                    </div>

                </main>
                </div>
            </div>
            {showCombinedInsights && (
                <CombinedInsights onClose={() => setShowCombinedInsights(false)} />
            )}
        </div>
    );
};

export default App;