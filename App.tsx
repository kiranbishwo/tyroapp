import React, { useState, useEffect, useRef, useCallback } from 'react';
import { User, AppView, Project, TimeEntry, Settings, ActivityLog, Task, AuthenticatedUser, Workspace } from './types';
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
import { authState } from './services/authState';
import { UserAvatar } from './components/UserAvatar';
import { apiService } from './services/apiService';

// Electron API types are defined in types/electron.d.ts

// Mock data removed - now using dynamic API data

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
    const [projects, setProjects] = useState<Project[]>([]);
    const [tasks, setTasks] = useState<Task[]>([]);
    const [projectsLoading, setProjectsLoading] = useState(false);
    const [tasksLoading, setTasksLoading] = useState(false);
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
    
    // Status State
    type UserStatus = 'idle' | 'working' | 'break' | 'meeting' | 'away';
    const [userStatus, setUserStatus] = useState<UserStatus>('idle');
    const [showStatusMenu, setShowStatusMenu] = useState(false);
    
    // OAuth state for login screen
    const [loginDeviceCode, setLoginDeviceCode] = useState<{ user_code: string; verification_url: string; browser_opened: boolean } | null>(null);
    const [loginAuthenticating, setLoginAuthenticating] = useState(false);
    const [loginOAuthStatus, setLoginOAuthStatus] = useState<string>('');
    
    // Auth State
    const [authStateData, setAuthStateData] = useState(authState.getState());
    const [authenticatedUser, setAuthenticatedUser] = useState<AuthenticatedUser | null>(null);
    const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
    const [currentWorkspace, setCurrentWorkspace] = useState<Workspace | null>(null);
    const [showUserMenu, setShowUserMenu] = useState(false);
    const [workspacesLoading, setWorkspacesLoading] = useState(false);
    
    // Sync State
    const [isSyncing, setIsSyncing] = useState(false);
    const [syncStatus, setSyncStatus] = useState<'idle' | 'success' | 'error'>('idle');
    const [syncMessage, setSyncMessage] = useState<string>('');
    const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
    
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
    const currentTask = tasks.find(t => t.id === selectedTaskId && t.projectId === selectedProjectId);
    const currentTaskName = currentTask?.name;
    const currentProjectName = currentProject?.name;

    // Fetch projects from API
    const fetchProjects = async (workspaceId?: string) => {
        // Check authentication directly from authState (more reliable than authStateData)
        const isAuthenticated = authState.isAuthenticated();
        if (!isAuthenticated) {
            console.log('[PROJECTS] Not authenticated, skipping fetch');
            return;
        }

        setProjectsLoading(true);
        try {
            const params: { workspace_id?: string; search?: string } = {};
            if (workspaceId) {
                params.workspace_id = workspaceId;
            } else if (currentWorkspace?.workspace_id) {
                params.workspace_id = currentWorkspace.workspace_id.toString();
            } else {
                // Try to get workspace from authState directly
                const workspace = authState.getCurrentWorkspace();
                if (workspace?.workspace_id) {
                    params.workspace_id = workspace.workspace_id.toString();
                }
            }

            if (!params.workspace_id) {
                console.warn('[PROJECTS] No workspace ID available, fetching without workspace filter');
            }

            console.log('[PROJECTS] Fetching projects with params:', params);
            const response = await apiService.getProjects(params);

            if (response.success && response.data) {
                // Transform API response to Project format
                const transformedProjects: Project[] = response.data.map((p: any) => ({
                    id: p.id.toString(),
                    name: p.name,
                    color: getProjectColor(p.id), // Generate color based on ID
                    description: p.description,
                    status: p.status,
                    priority: p.priority_status,
                    progress: p.progress,
                }));

                setProjects(transformedProjects);
                console.log('[PROJECTS] ✅ Loaded', transformedProjects.length, 'projects');
            } else {
                console.error('[PROJECTS] Failed to fetch:', response.error);
                // Fallback to empty array
                setProjects([]);
            }
        } catch (error) {
            console.error('[PROJECTS] Error fetching projects:', error);
            setProjects([]);
        } finally {
            setProjectsLoading(false);
        }
    };

    // Fetch tasks from API
    const fetchTasks = async (projectId?: string, workspaceId?: string) => {
        // Check authentication directly from authState (more reliable than authStateData)
        const isAuthenticated = authState.isAuthenticated();
        if (!isAuthenticated) {
            console.log('[TASKS] Not authenticated, skipping fetch');
            return;
        }

        setTasksLoading(true);
        try {
            const params: { project_id?: string; workspace_id?: string; search?: string } = {};
            if (projectId) {
                params.project_id = projectId;
            }
            if (workspaceId) {
                params.workspace_id = workspaceId;
            } else if (currentWorkspace?.workspace_id) {
                params.workspace_id = currentWorkspace.workspace_id.toString();
            } else {
                // Try to get workspace from authState directly
                const workspace = authState.getCurrentWorkspace();
                if (workspace?.workspace_id) {
                    params.workspace_id = workspace.workspace_id.toString();
                }
            }

            if (!params.workspace_id) {
                console.warn('[TASKS] No workspace ID available, fetching without workspace filter');
            }

            console.log('[TASKS] Fetching tasks with params:', params);
            const response = await apiService.getTasks(params);

            if (response.success && response.data) {
                // Transform API response to Task format
                const transformedTasks: Task[] = response.data.map((t: any) => ({
                    id: t.id.toString(),
                    name: t.name,
                    projectId: t.project_id.toString(),
                    completed: t.status_id === 27 || t.status === 'Completed', // Adjust based on your status mapping
                    description: t.description,
                }));

                setTasks(transformedTasks);
                console.log('[TASKS] ✅ Loaded', transformedTasks.length, 'tasks');
            } else {
                console.error('[TASKS] Failed to fetch:', response.error);
                // Fallback to empty array
                setTasks([]);
            }
        } catch (error) {
            console.error('[TASKS] Error fetching tasks:', error);
            setTasks([]);
        } finally {
            setTasksLoading(false);
        }
    };

    // Helper function to generate consistent colors for projects
    const getProjectColor = (projectId: string | number): string => {
        const colors = ['#60A5FA', '#F472B6', '#34D399', '#FBBF24', '#A78BFA', '#FB7185', '#4ADE80', '#FCD34D'];
        const id = typeof projectId === 'string' ? parseInt(projectId) || 0 : projectId;
        return colors[id % colors.length];
    };

    // Update projects with their tasks when tasks are loaded
    useEffect(() => {
        if (tasks.length > 0 && projects.length > 0) {
            setProjects(prevProjects => 
                prevProjects.map(project => ({
                    ...project,
                    tasks: tasks.filter(task => task.projectId === project.id)
                }))
            );
        }
    }, [tasks]);

    // Fetch projects and tasks when authenticated and workspace is available
    useEffect(() => {
        if (authStateData.isAuthenticated && currentWorkspace) {
            const workspaceId = currentWorkspace.workspace_id.toString();
            console.log('[APP] Fetching projects and tasks for workspace:', workspaceId);
            fetchProjects(workspaceId);
            fetchTasks(undefined, workspaceId);
        } else if (!authStateData.isAuthenticated) {
            // Clear projects and tasks when logged out
            setProjects([]);
            setTasks([]);
        }
    }, [authStateData.isAuthenticated, currentWorkspace?.workspace_id]);

    // Upload tracking file for a task
    const uploadTrackingFileForTask = async (projectId: string, taskId: string) => {
        console.log(`[UPLOAD-TASK] ========================================`);
        console.log(`[UPLOAD-TASK] 🚀 Starting upload for task ${taskId} (project: ${projectId})`);
        console.log(`[UPLOAD-TASK] 📋 Parameters:`, { projectId, taskId, timestamp: new Date().toISOString() });
        
        // Check authentication using multiple methods (more reliable)
        const isAuthFromState = authState.isAuthenticated();
        const hasLoginToken = !!localStorage.getItem('login_token');
        const isUserCheckedIn = user?.isCheckedIn || false;
        const isAuthenticated = isAuthFromState || hasLoginToken || isUserCheckedIn;
        
        console.log(`[UPLOAD-TASK] 🔐 Authentication check:`, {
            isAuthFromState,
            hasLoginToken,
            isUserCheckedIn,
            isAuthenticated,
            hasElectronAPI: !!window.electronAPI,
            hasLoadTaskTrackingData: !!window.electronAPI?.loadTaskTrackingData,
        });
        
        if (!isAuthenticated || !window.electronAPI?.loadTaskTrackingData) {
            const error = 'Not authenticated or API not available';
            console.error(`[UPLOAD-TASK] ❌ ${error}`);
            return { success: false, error };
        }

        try {
            // Verify login token is available
            const loginToken = localStorage.getItem('login_token');
            if (!loginToken) {
                const error = 'No authentication token found. Please check in again.';
                console.error(`[UPLOAD-TASK] ❌ ${error}`);
                return { success: false, error };
            }
            console.log(`[UPLOAD-TASK] ✅ login_token found (length: ${loginToken.length})`);

            // Load tracking data from file (load today's data)
            console.log(`[UPLOAD-TASK] 📋 Step 1: Loading tracking data from file...`);
            const taskData = await window.electronAPI.loadTaskTrackingData(projectId, taskId, 'today');
            if (!taskData) {
                const error = 'No tracking data found';
                console.log(`[UPLOAD-TASK] ⚠️ ${error} for task ${taskId}`);
                return { success: false, error };
            }
            console.log(`[UPLOAD-TASK] ✅ Tracking data loaded successfully`);

            // Log raw data from file
            console.log('[UPLOAD] 📦 Raw data loaded from file:', {
                version: taskData.version,
                metadata: taskData.metadata,
                trackingDataKeys: Object.keys(taskData.trackingData || {}),
                activityLogsCount: taskData.trackingData?.activityLogs?.length || 0,
                activeWindowsCount: taskData.trackingData?.activeWindows?.length || 0,
                screenshotsCount: taskData.trackingData?.screenshots?.length || 0,
                webcamPhotosCount: taskData.trackingData?.webcamPhotos?.length || 0,
                urlHistoryCount: taskData.trackingData?.urlHistory?.length || 0,
                summary: taskData.trackingData?.summary,
            });

            // Ensure the data matches the expected format from the API documentation
            const formattedData = {
                version: taskData.version || '1.0.0',
                metadata: {
                    createdAt: taskData.metadata?.createdAt || new Date().toISOString(),
                    lastUpdated: taskData.metadata?.lastUpdated || new Date().toISOString(),
                    taskId: taskData.metadata?.taskId || taskId,
                    projectId: taskData.metadata?.projectId || projectId,
                    taskName: taskData.metadata?.taskName || 'Unknown Task',
                    projectName: taskData.metadata?.projectName || 'Unknown Project',
                    currentSessionStart: taskData.metadata?.currentSessionStart || null,
                },
                trackingData: {
                    activityLogs: taskData.trackingData?.activityLogs || [],
                    windowTracking: taskData.trackingData?.activeWindows || [],
                    screenshots: taskData.trackingData?.screenshots || [],
                    webcamPhotos: taskData.trackingData?.webcamPhotos || [],
                    urlHistory: taskData.trackingData?.urlHistory || [],
                    summary: taskData.trackingData?.summary || {
                        totalTime: 0,
                        totalKeystrokes: 0,
                        totalMouseClicks: 0,
                        totalScreenshots: 0,
                        totalWebcamPhotos: 0,
                        totalUrls: 0,
                        totalActivityLogs: 0,
                        firstActivity: null,
                        lastActivity: new Date().toISOString(),
                    },
                },
            };

            // Log formatted data structure
            console.log('[UPLOAD] 📋 Formatted data structure:', {
                version: formattedData.version,
                metadata: formattedData.metadata,
                trackingData: {
                    activityLogsCount: formattedData.trackingData.activityLogs.length,
                    windowTrackingCount: formattedData.trackingData.windowTracking.length,
                    screenshotsCount: formattedData.trackingData.screenshots.length,
                    webcamPhotosCount: formattedData.trackingData.webcamPhotos.length,
                    urlHistoryCount: formattedData.trackingData.urlHistory.length,
                    summary: formattedData.trackingData.summary,
                },
            });

            // Log sample activity log entry (first one)
            if (formattedData.trackingData.activityLogs.length > 0) {
                console.log('[UPLOAD] 📝 Sample activity log entry (first):', formattedData.trackingData.activityLogs[0]);
            }

            // Log sample window tracking entry (first one)
            if (formattedData.trackingData.windowTracking.length > 0) {
                console.log('[UPLOAD] 🪟 Sample window tracking entry (first):', formattedData.trackingData.windowTracking[0]);
            }

            // Log sample screenshot entry (first one)
            if (formattedData.trackingData.screenshots.length > 0) {
                const firstScreenshot = formattedData.trackingData.screenshots[0];
                console.log('[UPLOAD] 📸 Sample screenshot entry (first):', {
                    id: firstScreenshot.id,
                    timestamp: firstScreenshot.timestamp,
                    isBlurred: firstScreenshot.isBlurred,
                    dataUrlLength: firstScreenshot.dataUrl?.length || 0,
                    dataUrlPreview: firstScreenshot.dataUrl?.substring(0, 100) || 'N/A',
                });
            }

            // Log sample webcam photo entry (first one)
            if (formattedData.trackingData.webcamPhotos.length > 0) {
                const firstWebcam = formattedData.trackingData.webcamPhotos[0];
                console.log('[UPLOAD] 📷 Sample webcam photo entry (first):', {
                    id: firstWebcam.id,
                    timestamp: firstWebcam.timestamp,
                    dataUrlLength: firstWebcam.dataUrl?.length || 0,
                    dataUrlPreview: firstWebcam.dataUrl?.substring(0, 100) || 'N/A',
                });
            }

            // Convert to JSON string (minified, no pretty printing to reduce size)
            console.log('[UPLOAD-TASK] 📋 Step 2: Converting data to JSON string...');
            const jsonString = JSON.stringify(formattedData);
            const originalSize = new Blob([jsonString]).size;
            console.log('[UPLOAD-TASK] 📄 Original JSON size:', originalSize, 'bytes (', (originalSize / 1024 / 1024).toFixed(2), 'MB)');

            // Compress the JSON using gzip if CompressionStream is available
            let file: File;
            let finalSize = originalSize;
            
            console.log('[UPLOAD-TASK] 📋 Step 3: Creating file (with compression if available)...');
            console.log('[UPLOAD-TASK] 📋 CompressionStream available:', typeof CompressionStream !== 'undefined');
            
            // For small files (< 1MB), skip compression to avoid hanging
            const shouldCompress = typeof CompressionStream !== 'undefined' && originalSize > 1024 * 1024; // Only compress if > 1MB
            console.log('[UPLOAD-TASK] 📋 Should compress:', shouldCompress, '(file size:', originalSize, 'bytes)');
            
            try {
                if (shouldCompress) {
                    console.log('[UPLOAD-TASK] 🔄 Starting compression...');
                    // Use CompressionStream API (available in modern browsers)
                    const stream = new CompressionStream('gzip');
                    const writer = stream.writable.getWriter();
                    const reader = stream.readable.getReader();
                    
                    // Write JSON string to compression stream
                    console.log('[UPLOAD-TASK] 📤 Writing to compression stream...');
                    const encoder = new TextEncoder();
                    const jsonBytes = encoder.encode(jsonString);
                    await writer.write(jsonBytes);
                    await writer.close();
                    console.log('[UPLOAD-TASK] ✅ Finished writing to compression stream');
                    
                    // Read compressed data
                    console.log('[UPLOAD-TASK] 📥 Reading compressed data...');
                    const chunks: Uint8Array[] = [];
                    let done = false;
                    let chunkCount = 0;
                    while (!done) {
                        const { value, done: streamDone } = await reader.read();
                        done = streamDone;
                        if (value) {
                            chunks.push(value);
                            chunkCount++;
                        }
                    }
                    console.log('[UPLOAD-TASK] ✅ Read', chunkCount, 'chunks from compression stream');
                    
                    // Combine chunks
                    console.log('[UPLOAD-TASK] 🔄 Combining chunks...');
                    const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
                    const compressed = new Uint8Array(totalLength);
                    let offset = 0;
                    for (const chunk of chunks) {
                        compressed.set(chunk, offset);
                        offset += chunk.length;
                    }
                    
                    finalSize = compressed.length;
                    const compressionRatio = ((1 - finalSize / originalSize) * 100).toFixed(1);
                    console.log('[UPLOAD-TASK] ✅ Compressed size:', finalSize, 'bytes (', (finalSize / 1024 / 1024).toFixed(2), 'MB)');
                    console.log('[UPLOAD-TASK] 📊 Compression ratio:', compressionRatio + '% reduction');
                    
                    // Create compressed file
                    console.log('[UPLOAD-TASK] 📦 Creating compressed file...');
                    const compressedBlob = new Blob([compressed], { type: 'application/gzip' });
                    file = new File([compressedBlob], `${taskId}.json.gz`, { type: 'application/gzip' });
                    console.log('[UPLOAD-TASK] ✅ Compressed file created:', file.name, file.size, 'bytes');
                } else {
                    // Fallback: use minified JSON without compression
                    console.log('[UPLOAD-TASK] ⚠️ Skipping compression (file too small or CompressionStream unavailable), sending uncompressed JSON');
                    const blob = new Blob([jsonString], { type: 'application/json' });
                    file = new File([blob], `${taskId}.json`, { type: 'application/json' });
                    console.log('[UPLOAD-TASK] ✅ Uncompressed file created:', file.name, file.size, 'bytes');
                }
            } catch (compressionError: any) {
                console.error('[UPLOAD-TASK] ❌ Compression failed, using uncompressed:', compressionError);
                console.error('[UPLOAD-TASK] 📋 Compression error details:', {
                    name: compressionError.name,
                    message: compressionError.message,
                    stack: compressionError.stack,
                });
                // Fallback to uncompressed
                const blob = new Blob([jsonString], { type: 'application/json' });
                file = new File([blob], `${taskId}.json`, { type: 'application/json' });
                console.log('[UPLOAD-TASK] ✅ Fallback uncompressed file created:', file.name, file.size, 'bytes');
            }
            
            console.log('[UPLOAD-TASK] 📋 Final file details:', {
                name: file.name,
                type: file.type,
                size: file.size,
                sizeMB: (file.size / 1024 / 1024).toFixed(2),
            });

            // Check if file is still too large (PHP limit is typically 40MB)
            const MAX_FILE_SIZE = 35 * 1024 * 1024; // 35MB (safety margin below 40MB PHP limit)
            if (file.size > MAX_FILE_SIZE) {
                console.warn('[UPLOAD] ⚠️ File still too large after compression:', file.size, 'bytes');
                console.log('[UPLOAD] 📸 Removing screenshots and webcam photos to reduce size...');
                
                // Create a version without screenshots/webcam photos
                const dataWithoutMedia = {
                    ...formattedData,
                    trackingData: {
                        ...formattedData.trackingData,
                        screenshots: [], // Remove screenshots
                        webcamPhotos: [], // Remove webcam photos
                        summary: {
                            ...formattedData.trackingData.summary,
                            // Keep counts for reference
                            totalScreenshots: formattedData.trackingData.screenshots.length,
                            totalWebcamPhotos: formattedData.trackingData.webcamPhotos.length,
                        }
                    }
                };
                
                const jsonStringNoMedia = JSON.stringify(dataWithoutMedia);
                const sizeNoMedia = new Blob([jsonStringNoMedia]).size;
                console.log('[UPLOAD] 📄 Size without media:', sizeNoMedia, 'bytes (', (sizeNoMedia / 1024 / 1024).toFixed(2), 'MB)');
                
                // Try compressing the version without media
                try {
                    if (typeof CompressionStream !== 'undefined') {
                        const stream = new CompressionStream('gzip');
                        const writer = stream.writable.getWriter();
                        const reader = stream.readable.getReader();
                        
                        const encoder = new TextEncoder();
                        const jsonBytes = encoder.encode(jsonStringNoMedia);
                        await writer.write(jsonBytes);
                        await writer.close();
                        
                        const chunks: Uint8Array[] = [];
                        let done = false;
                        while (!done) {
                            const { value, done: streamDone } = await reader.read();
                            done = streamDone;
                            if (value) {
                                chunks.push(value);
                            }
                        }
                        
                        const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
                        const compressed = new Uint8Array(totalLength);
                        let offset = 0;
                        for (const chunk of chunks) {
                            compressed.set(chunk, offset);
                            offset += chunk.length;
                        }
                        
                        const compressedBlob = new Blob([compressed], { type: 'application/gzip' });
                        file = new File([compressedBlob], `${taskId}.json.gz`, { type: 'application/gzip' });
                        console.log('[UPLOAD] ✅ Compressed size without media:', file.size, 'bytes (', (file.size / 1024 / 1024).toFixed(2), 'MB)');
                    } else {
                        const blob = new Blob([jsonStringNoMedia], { type: 'application/json' });
                        file = new File([blob], `${taskId}.json`, { type: 'application/json' });
                    }
                } catch (error) {
                    console.error('[UPLOAD] ❌ Failed to compress without media, using uncompressed:', error);
                    const blob = new Blob([jsonStringNoMedia], { type: 'application/json' });
                    file = new File([blob], `${taskId}.json`, { type: 'application/json' });
                }
                
                if (file.size > MAX_FILE_SIZE) {
                    console.error('[UPLOAD] ❌ File still too large even without media:', file.size, 'bytes');
                    return { 
                        success: false, 
                        error: `File too large (${(file.size / 1024 / 1024).toFixed(2)}MB). Maximum allowed: ${(MAX_FILE_SIZE / 1024 / 1024).toFixed(2)}MB` 
                    };
                }
            }

            // Get workspace ID
            console.log('[UPLOAD-TASK] 📋 Step 4: Preparing upload parameters...');
            const workspaceId = currentWorkspace?.workspace_id?.toString();
            console.log('[UPLOAD-TASK] 📋 Upload parameters:', { 
                projectId, 
                taskId, 
                workspaceId: workspaceId || 'not provided', 
                fileSize: file.size,
                fileSizeMB: (file.size / 1024 / 1024).toFixed(2),
                originalSize: originalSize,
                originalSizeMB: (originalSize / 1024 / 1024).toFixed(2),
                compressionRatio: originalSize > 0 ? ((1 - file.size / originalSize) * 100).toFixed(1) + '%' : 'N/A',
                fileName: file.name,
                fileType: file.type,
            });

            // Upload using API
            console.log(`[UPLOAD-TASK] 📋 Step 5: Calling apiService.uploadTrackingFile...`);
            console.log(`[UPLOAD-TASK] 📋 Upload parameters:`, {
                projectId,
                taskId,
                workspaceId: workspaceId || 'not provided',
                fileSize: file.size,
                fileName: file instanceof File ? file.name : 'blob',
                fileType: file.type,
            });
            
            const response = await apiService.uploadTrackingFile(projectId, taskId, file, workspaceId);
            
            console.log(`[UPLOAD-TASK] 📋 API Response received:`, JSON.stringify(response, null, 2));
            
            if (response.success) {
                const message = response.message || response.data?.message || 'Tracking data queued for processing';
                console.log(`[UPLOAD-TASK] ✅ Successfully uploaded tracking file for task ${taskId}`);
                console.log(`[UPLOAD-TASK] 📋 Response message: ${message}`);
                console.log(`[UPLOAD-TASK] 📋 Response data:`, JSON.stringify(response.data, null, 2));
                console.log(`[UPLOAD-TASK] ℹ️  Note: File is queued for background processing. Processing typically takes 5-30 seconds.`);
                console.log(`[UPLOAD-TASK] ========================================`);
                return { success: true, data: response.data, message };
            } else {
                console.error(`[UPLOAD-TASK] ❌ Failed to upload tracking file for task ${taskId}`);
                console.error(`[UPLOAD-TASK] 📋 Error: ${response.error}`);
                console.error(`[UPLOAD-TASK] 📋 Full response:`, JSON.stringify(response, null, 2));
                console.log(`[UPLOAD-TASK] ========================================`);
                return { success: false, error: response.error };
            }
        } catch (error: any) {
            console.error(`[UPLOAD-TASK] ❌ Exception occurred while uploading task ${taskId}`);
            console.error(`[UPLOAD-TASK] 📋 Error name:`, error.name);
            console.error(`[UPLOAD-TASK] 📋 Error message:`, error.message);
            console.error(`[UPLOAD-TASK] 📋 Error stack:`, error.stack);
            console.error(`[UPLOAD-TASK] 📋 Full error details:`, {
                name: error.name,
                message: error.message,
                response: error.response?.data,
                status: error.response?.status,
                statusText: error.response?.statusText,
                headers: error.response?.headers,
                config: {
                    url: error.config?.url,
                    method: error.config?.method,
                    baseURL: error.config?.baseURL,
                },
            });
            console.log(`[UPLOAD-TASK] ========================================`);
            return { success: false, error: error.message || 'Upload failed' };
        }
    };

    // Upload all today's tracking files (memoized with useCallback to prevent useEffect re-runs)
    const uploadAllTrackingFiles = useCallback(async (showStatus: boolean = false) => {
        // CRITICAL: Log immediately to verify function is called
        console.log('[UPLOAD] ========================================');
        console.log('[UPLOAD] 🔄 uploadAllTrackingFiles STARTED - FUNCTION CALLED!');
        console.log('[UPLOAD] 📋 Parameters:', { showStatus, timestamp: new Date().toISOString() });
        console.log('[UPLOAD] 📋 Function context:', {
            hasWindow: typeof window !== 'undefined',
            hasLocalStorage: typeof localStorage !== 'undefined',
            hasElectronAPI: !!window?.electronAPI,
        });
        console.log('[UPLOAD] ========================================');
        
        // Check authentication using multiple methods (more reliable)
        const isAuthFromState = authState.isAuthenticated();
        const hasLoginToken = !!localStorage.getItem('login_token');
        const isUserCheckedIn = user?.isCheckedIn || false;
        
        console.log('[UPLOAD] 🔐 Authentication checks:', {
            isAuthFromState,
            hasLoginToken,
            isUserCheckedIn,
            authStateDataIsAuth: authStateData.isAuthenticated,
            hasElectronAPI: !!window.electronAPI,
            hasGetAllTasks: !!window.electronAPI?.getAllTasks,
            currentWorkspace: currentWorkspace?.workspace_id || 'none',
        });

        // Allow upload if user is checked in OR authenticated OR has login token
        const isAuthenticated = isAuthFromState || hasLoginToken || isUserCheckedIn;
        
        if (!isAuthenticated || !window.electronAPI?.getAllTasks) {
            const errorMsg = 'Not authenticated or API not available';
            console.error('[UPLOAD] ❌', errorMsg, {
                isAuthFromState,
                hasLoginToken,
                isUserCheckedIn,
                authStateDataIsAuth: authStateData.isAuthenticated,
                hasElectronAPI: !!window.electronAPI,
                hasGetAllTasks: !!window.electronAPI?.getAllTasks,
            });
            if (showStatus) {
                setSyncStatus('error');
                setSyncMessage(errorMsg);
                setIsSyncing(false);
            }
            return;
        }

        if (showStatus) {
            setIsSyncing(true);
            setSyncStatus('idle');
            setSyncMessage('Starting sync...');
        }

        try {
            // Verify login token before starting
            const loginToken = localStorage.getItem('login_token');
            console.log('[UPLOAD] Token check:', {
                hasToken: !!loginToken,
                tokenLength: loginToken?.length || 0,
            });
            if (!loginToken) {
                const errorMsg = 'No authentication token found. Please check in again.';
                console.error('[UPLOAD] ❌', errorMsg);
                if (showStatus) {
                    setSyncStatus('error');
                    setSyncMessage(errorMsg);
                    setIsSyncing(false);
                }
                return;
            }

            // Get current workspace ID for filtering
            const workspaceId = currentWorkspace?.workspace_id?.toString() || null;
            console.log('[UPLOAD] 📋 Step 1: Getting today\'s tasks from Electron (workspace:', workspaceId || 'all', ')...');
            
            // Get only today's tasks for current workspace
            const allTasks = await window.electronAPI.getTodayTasks(workspaceId);
            console.log('[UPLOAD] 📋 Today\'s tasks received:', JSON.stringify(allTasks, null, 2));
            console.log('[UPLOAD] 📊 Task count:', allTasks.length);
            console.log('[UPLOAD] 📋 Filtered by workspace:', workspaceId || 'all workspaces');
            
            if (allTasks.length === 0) {
                const msg = 'No tasks to upload';
                console.log('[UPLOAD] ⚠️', msg);
                if (showStatus) {
                    setSyncStatus('success');
                    setSyncMessage('No tasks to sync');
                    setIsSyncing(false);
                    setLastSyncTime(new Date());
                }
                return;
            }

            console.log(`[UPLOAD] 📋 Step 2: Starting upload of ${allTasks.length} tracking file(s) one by one...`);
            if (showStatus) {
                setSyncMessage(`Syncing ${allTasks.length} task(s)...`);
            }

            let successCount = 0;
            let errorCount = 0;
            const errors: string[] = [];

            // Upload files one by one sequentially
            for (let i = 0; i < allTasks.length; i++) {
                const task = allTasks[i];
                console.log(`[UPLOAD] ========================================`);
                console.log(`[UPLOAD] 📤 Task ${i + 1}/${todayTasks.length}: ${task.taskId} (project: ${task.projectId})`);
                console.log(`[UPLOAD] 📋 Task details:`, JSON.stringify(task, null, 2));
                
                try {
                    console.log(`[UPLOAD] 🔄 Calling uploadTrackingFileForTask...`);
                    const result = await uploadTrackingFileForTask(task.projectId, task.taskId);
                    console.log(`[UPLOAD] 📋 Task ${task.taskId} upload result:`, JSON.stringify(result, null, 2));
                    
                    if (result.success) {
                        successCount++;
                        console.log(`[UPLOAD] ✅ Task ${task.taskId} uploaded successfully!`);
                        console.log(`[UPLOAD] 📋 Response message: ${result.message || 'No message'}`);
                    } else {
                        errorCount++;
                        const errorMsg = `Task ${task.taskId}: ${result.error || 'Unknown error'}`;
                        errors.push(errorMsg);
                        console.error(`[UPLOAD] ❌ Task ${task.taskId} failed:`, errorMsg);
                        console.error(`[UPLOAD] 📋 Full error details:`, result);
                    }
                } catch (taskError: any) {
                    errorCount++;
                    const errorMsg = `Task ${task.taskId}: ${taskError.message || 'Exception occurred'}`;
                    errors.push(errorMsg);
                    console.error(`[UPLOAD] ❌ Task ${task.taskId} exception:`, taskError);
                    console.error(`[UPLOAD] 📋 Exception stack:`, taskError.stack);
                    console.error(`[UPLOAD] 📋 Exception details:`, {
                        name: taskError.name,
                        message: taskError.message,
                        response: taskError.response?.data,
                        status: taskError.response?.status,
                    });
                }
                console.log(`[UPLOAD] ========================================`);
            }

            const summary = `${successCount} succeeded, ${errorCount} failed`;
            console.log(`[UPLOAD] ========================================`);
            console.log(`[UPLOAD] ✅ Upload complete: ${summary}`);
            console.log(`[UPLOAD] 📊 Success count: ${successCount}`);
            console.log(`[UPLOAD] 📊 Error count: ${errorCount}`);
            if (errors.length > 0) {
                console.log(`[UPLOAD] 📋 Errors:`, errors);
            }
            console.log(`[UPLOAD] ========================================`);

            if (showStatus) {
                if (errorCount === 0) {
                    setSyncStatus('success');
                    setSyncMessage(`Successfully synced ${successCount} task(s)`);
                } else if (successCount > 0) {
                    setSyncStatus('error');
                    setSyncMessage(`${successCount} succeeded, ${errorCount} failed`);
                } else {
                    setSyncStatus('error');
                    setSyncMessage(`All uploads failed: ${errors[0] || 'Unknown error'}`);
                }
                setIsSyncing(false);
                setLastSyncTime(new Date());
                
                // Clear status message after 3 seconds
                setTimeout(() => {
                    setSyncStatus('idle');
                    setSyncMessage('');
                }, 3000);
            }
        } catch (error: any) {
            const errorMsg = error.message || 'Upload failed';
            console.error('[UPLOAD] Error uploading tracking files:', error);
            if (showStatus) {
                setSyncStatus('error');
                setSyncMessage(errorMsg);
                setIsSyncing(false);
            }
        }
    }, [authStateData.isAuthenticated, currentWorkspace?.workspace_id]); // Removed user?.isCheckedIn - checked inside function

    // Store upload function in ref to prevent useEffect re-runs
    const uploadAllTrackingFilesRef = useRef(uploadAllTrackingFiles);
    uploadAllTrackingFilesRef.current = uploadAllTrackingFiles;

    // Periodic upload of tracking files (every 1 minute)
    useEffect(() => {
        console.log('[AUTO-SYNC] 🔍 useEffect triggered - checking conditions...');
        console.log('[AUTO-SYNC] 📋 Auth state:', {
            isAuthenticated: authStateData.isAuthenticated,
            workspaceId: currentWorkspace?.workspace_id || 'none',
            hasUploadFunction: typeof uploadAllTrackingFilesRef.current === 'function',
            timestamp: new Date().toISOString()
        });

        if (!authStateData.isAuthenticated) {
            console.log('[AUTO-SYNC] ⏸️ Auto-sync disabled: Not authenticated');
            return;
        }

        console.log('[AUTO-SYNC] ✅ Auto-sync ENABLED - setting up intervals');
        console.log('[AUTO-SYNC] ⏱️ Initial sync: 30 seconds');
        console.log('[AUTO-SYNC] ⏱️ Periodic sync: Every 60 seconds (1 minute)');

        let initialTimeout: NodeJS.Timeout | null = null;
        let interval: NodeJS.Timeout | null = null;

        // Initial upload after 30 seconds (to allow some data to accumulate)
        initialTimeout = setTimeout(() => {
            console.log('[AUTO-SYNC] 🚀 Initial sync triggered (30 seconds after auth)');
            console.log('[AUTO-SYNC] 📞 Calling uploadAllTrackingFiles(false)...');
            uploadAllTrackingFilesRef.current(false).catch(err => {
                console.error('[AUTO-SYNC] ❌ Initial sync failed:', err);
            });
        }, 30000); // 30 seconds
        console.log('[AUTO-SYNC] ✅ Initial timeout set:', initialTimeout);

        // Then upload every 1 minute
        interval = setInterval(() => {
            console.log('[AUTO-SYNC] ========================================');
            console.log('[AUTO-SYNC] 🔄 Periodic sync triggered (every 1 minute)');
            console.log('[AUTO-SYNC] ⏰ Current time:', new Date().toISOString());
            console.log('[AUTO-SYNC] 📞 Calling uploadAllTrackingFiles(false)...');
            uploadAllTrackingFilesRef.current(false).catch(err => {
                console.error('[AUTO-SYNC] ❌ Periodic sync failed:', err);
            });
        }, 60000); // 1 minute
        console.log('[AUTO-SYNC] ✅ Periodic interval set:', interval);
        console.log('[AUTO-SYNC] ✅ Interval ID:', interval);

        // Verify interval is actually set
        console.log('[AUTO-SYNC] 🔍 Verification:', {
            hasInitialTimeout: !!initialTimeout,
            hasInterval: !!interval,
            intervalType: typeof interval,
            nextSyncIn: '60 seconds'
        });

        return () => {
            console.log('[AUTO-SYNC] 🛑 Auto-sync stopped (cleanup)');
            console.log('[AUTO-SYNC] 🛑 Clearing timeout:', initialTimeout);
            console.log('[AUTO-SYNC] 🛑 Clearing interval:', interval);
            if (initialTimeout) {
                clearTimeout(initialTimeout);
            }
            if (interval) {
                clearInterval(interval);
            }
        };
    }, [authStateData.isAuthenticated, currentWorkspace?.workspace_id]); // Removed uploadAllTrackingFiles from deps - using ref instead

    // Fetch current status on mount and when authenticated
    useEffect(() => {
        if (authStateData.isAuthenticated) {
            const loadCurrentStatus = async () => {
                try {
                    const response = await apiService.getCurrentStatus();
                    if (response.success && response.data) {
                        const status = response.data.status;
                        if (status && ['idle', 'working', 'break', 'meeting', 'away'].includes(status)) {
                            setUserStatus(status as UserStatus);
                            console.log('[STATUS] Loaded current status:', status);
                        }
                    }
                } catch (error) {
                    console.error('[STATUS] Error loading current status:', error);
                }
            };
            loadCurrentStatus();
        }
    }, [authStateData.isAuthenticated]);

    // Update status on API when user status changes
    useEffect(() => {
        if (authStateData.isAuthenticated && userStatus) {
            const updateStatus = async () => {
                try {
                    const workspaceId = currentWorkspace?.workspace_id?.toString();
                    await apiService.updateStatus({
                        status: userStatus,
                        workspace_id: workspaceId,
                        metadata: {
                            task_id: selectedTaskId || undefined,
                            project_id: selectedProjectId || undefined,
                        },
                    });
                    console.log('[STATUS] Updated status to:', userStatus);
                } catch (error) {
                    console.error('[STATUS] Error updating status:', error);
                }
            };
            
            // Debounce status updates to avoid too many API calls
            const timeoutId = setTimeout(updateStatus, 500);
            return () => clearTimeout(timeoutId);
        }
    }, [userStatus, selectedTaskId, selectedProjectId, currentWorkspace?.workspace_id]);

    // Surveillance Hook - Only active if user has consented AND status is working
    const { 
        cameraStream, 
        activityLogs, 
        setActivityLogs,
        startCamera, 
        stopCamera,
        idleInfo,
        onIdleDecision
    } = useSurveillance({ 
        isTimerRunning: isTimerRunning && userConsent === true && userStatus === 'working', // Block tracking without consent or if status is not working
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

    // Initialize auth state on mount - check authentication BEFORE showing login page
    useEffect(() => {
        const initAuth = async () => {
            setWorkspacesLoading(true);
            
            // FIRST: Check localStorage for authentication data (fastest check)
            const loginToken = localStorage.getItem('login_token');
            const authFullResponse = localStorage.getItem('auth_full_response');
            
            if (loginToken || authFullResponse) {
                console.log('[APP] Found authentication data in localStorage');
                
                try {
                    let userData = null;
                    let workspaces = [];
                    let currentWorkspace = null;
                    
                    if (authFullResponse) {
                        try {
                            const fullResponse = JSON.parse(authFullResponse);
                            
                            // Handle different response structures
                            // Structure 1: { result: true, data: { ... } }
                            // Structure 2: { data: { ... } }
                            // Structure 3: Direct data object
                            if (fullResponse.data) {
                                userData = fullResponse.data;
                                workspaces = fullResponse.data.workspaces || [];
                            } else if (fullResponse.workspaces) {
                                // Direct workspaces array
                                userData = fullResponse;
                                workspaces = fullResponse.workspaces || [];
                            } else {
                                // Try root level
                                userData = fullResponse;
                                workspaces = [];
                            }
                            
                            // Find current workspace - prefer general workspace
                            if (workspaces.length > 0) {
                                currentWorkspace = workspaces.find((w: any) => 
                                    w.workspace_is_general === true || w.workspace_is_general === 1
                                ) || workspaces[0];
                                
                                console.log('[APP] Found workspace from localStorage:', {
                                    workspaceName: currentWorkspace.workspace_name,
                                    domain: currentWorkspace.domain,
                                    isGeneral: currentWorkspace.workspace_is_general
                                });
                            } else {
                                console.warn('[APP] ⚠️ No workspaces found in localStorage auth_full_response');
                            }
                        } catch (parseError) {
                            console.error('[APP] Error parsing auth_full_response from localStorage:', parseError);
                            // Continue with other checks
                        }
                    }
                    
                    // If we have user data from localStorage, restore state immediately
                    if (userData && userData.id) {
                        console.log('[APP] ✅ Restoring authentication from localStorage');
                        
                        const authenticatedUser: AuthenticatedUser = {
                            id: userData.id,
                            name: userData.name,
                            email: userData.email,
                            avatar: userData.avatar,
                            company_id: userData.company_id,
                            department_id: userData.department_id,
                            department_name: userData.department_name,
                            is_admin: userData.is_admin,
                            is_hr: userData.is_hr,
                            is_face_registered: userData.is_face_registered,
                            phone: userData.phone,
                        };
                        
                        // Ensure we have a current workspace
                        if (!currentWorkspace && workspaces.length > 0) {
                            // Try to find general workspace or use first one
                            currentWorkspace = workspaces.find((w: any) => 
                                w.workspace_is_general === true || w.workspace_is_general === 1
                            ) || workspaces[0];
                            console.log('[APP] Selected workspace from localStorage:', {
                                name: currentWorkspace?.workspace_name,
                                domain: currentWorkspace?.domain,
                                id: currentWorkspace?.workspace_id
                            });
                        }
                        
                        // Validate workspace has domain
                        if (currentWorkspace && !currentWorkspace.domain) {
                            console.warn('[APP] ⚠️ Workspace found but no domain property');
                            // Try to get from workspaces_detailed if available in JWT token
                            if (userData.workspaces_detailed && userData.workspaces_detailed.length > 0) {
                                const detailedWorkspace = userData.workspaces_detailed.find((w: any) => 
                                    w.workspace_id === currentWorkspace.workspace_id || w.tenant_id === currentWorkspace.tenant_id
                                );
                                if (detailedWorkspace && detailedWorkspace.domain) {
                                    currentWorkspace.domain = detailedWorkspace.domain;
                                    console.log('[APP] ✅ Extracted domain from workspaces_detailed:', detailedWorkspace.domain);
                                }
                            }
                        }
                        
                        // Parse full response for authState
                        let fullResponseParsed = null;
                        try {
                            if (authFullResponse) {
                                fullResponseParsed = JSON.parse(authFullResponse);
                            }
                        } catch (error) {
                            console.error('[APP] Error parsing fullResponse for authState:', error);
                        }
                        
                        // Update auth state with workspace
                        authState.setAuthData(
                            authenticatedUser,
                            workspaces as Workspace[],
                            loginToken || '',
                            Date.now() + 604800000, // 7 days default
                            currentWorkspace?.workspace_id,
                            fullResponseParsed // Include full response
                        );
                        
                        // Update user state immediately
                        setAuthenticatedUser(authenticatedUser);
                        setWorkspaces(workspaces as Workspace[]);
                        if (currentWorkspace) {
                            setCurrentWorkspace(currentWorkspace as Workspace);
                            console.log('[APP] ✅ Current workspace set:', {
                                name: currentWorkspace.workspace_name,
                                domain: currentWorkspace.domain,
                                id: currentWorkspace.workspace_id
                            });
                            
                            // Verify domain is set
                            if (!currentWorkspace.domain) {
                                console.error('[APP] ❌ CRITICAL: Workspace domain is missing!');
                                console.error('[APP] Workspace object:', currentWorkspace);
                            }
                        } else {
                            console.warn('[APP] ⚠️ No workspace available after restoring from localStorage');
                        }
                        
                        // Set user data
                        setUser({
                            id: authenticatedUser.id.toString(),
                            name: authenticatedUser.name,
                            avatar: authenticatedUser.avatar || 'https://picsum.photos/100/100',
                            isCheckedIn: false,
                        });
                        
                        // Verify workspace domain is available
                        let workspaceDomain = authState.getWorkspaceDomain();
                        if (!workspaceDomain) {
                            console.warn('[APP] ⚠️ Workspace domain not available from authState, checking directly...');
                            
                            // Try to get domain directly from currentWorkspace
                            if (currentWorkspace && currentWorkspace.domain) {
                                workspaceDomain = currentWorkspace.domain;
                                console.log('[APP] ✅ Got workspace domain directly from currentWorkspace:', workspaceDomain);
                                
                                // Force update authState with workspace domain
                                if (authState.getState().isAuthenticated) {
                                    try {
                                        authState.setAuthData(
                                            authenticatedUser,
                                            workspaces as Workspace[],
                                            loginToken || '',
                                            Date.now() + 604800000,
                                            currentWorkspace.workspace_id,
                                            fullResponseParsed
                                        );
                                        console.log('[APP] ✅ Re-set authState with workspace domain');
                                    } catch (error) {
                                        console.error('[APP] Error re-setting authState:', error);
                                    }
                                }
                            } else {
                                console.error('[APP] ⚠️ Workspace domain not available after restore!');
                                console.error('[APP] Current workspace:', currentWorkspace);
                                console.error('[APP] Workspaces:', workspaces);
                                console.error('[APP] Full response structure:', fullResponseParsed);
                            }
                        } else {
                            console.log('[APP] ✅ Workspace domain available:', workspaceDomain);
                        }
                        
                        // Redirect to check-in page IMMEDIATELY - don't show login page
                        console.log('[APP] Redirecting to check-in page (restored from localStorage)');
                        setView(AppView.CHECK_IN_OUT);
                        setWorkspacesLoading(false);
                        return; // Don't continue with other checks
                    }
                } catch (error) {
                    console.error('[APP] Error parsing localStorage auth data:', error);
                    // Continue with other checks if localStorage parse fails
                }
            }
            
            // SECOND: Check authentication status from main process (keytar)
            if (window.electronAPI) {
                try {
                    const status = await window.electronAPI.oauthCheckStatus();
                    if (status.authenticated && status.user) {
                        console.log('[APP] ✅ User is already authenticated on app load (from keytar)');
                        // Update auth state immediately
                        if (status.user && status.workspaces) {
                            authState.setAuthData(
                                status.user as AuthenticatedUser,
                                status.workspaces as Workspace[],
                                '', // Token is stored in main process
                                status.expires_at || Date.now() + 604800000,
                                status.currentWorkspace?.workspace_id
                            );
                        }
                        
                        // Update user state immediately
                        setAuthenticatedUser(status.user as AuthenticatedUser);
                        setWorkspaces(status.workspaces as Workspace[] || []);
                        if (status.currentWorkspace) {
                            setCurrentWorkspace(status.currentWorkspace as Workspace);
                        }
                        
                        // Set user data
                        setUser({
                            id: status.user.id.toString(),
                            name: status.user.name,
                            avatar: status.user.avatar || 'https://picsum.photos/100/100',
                            isCheckedIn: false,
                        });
                        
                        // Redirect to check-in page IMMEDIATELY - don't show login page
                        console.log('[APP] Redirecting to check-in page (already authenticated)');
                        setView(AppView.CHECK_IN_OUT);
                        setWorkspacesLoading(false);
                        return; // Don't continue with authState.initialize() if already authenticated
                    } else {
                        console.log('[APP] User is not authenticated, showing login page');
                    }
                } catch (error) {
                    console.error('[APP] Error checking auth status on init:', error);
                }
            }
            
            // If not authenticated, initialize authState normally
            await authState.initialize();
            setWorkspacesLoading(false);
            
            const unsubscribe = authState.subscribe((state) => {
                console.log('[APP] Auth state updated:', {
                    isAuthenticated: state.isAuthenticated,
                    userName: state.user?.name,
                    workspacesCount: state.workspaces.length,
                    currentWorkspace: state.currentWorkspace?.workspace_name || 'None',
                });
                
                setAuthStateData(state);
                setAuthenticatedUser(state.user);
                setWorkspaces(state.workspaces);
                setCurrentWorkspace(state.currentWorkspace);
                setWorkspacesLoading(false);
                
                // Log workspace details for debugging
                if (state.workspaces.length > 0) {
                    console.log('[APP] ✅ Workspaces loaded successfully:', state.workspaces.map(w => ({
                        id: w.workspace_id,
                        name: w.workspace_name,
                        company: w.company_name,
                    })));
                } else if (state.isAuthenticated) {
                    console.warn('[APP] ⚠️ No workspaces in auth state but user is authenticated!');
                }
                
                // If authenticated and user data available, update local user state and navigate
                if (state.isAuthenticated && state.user) {
                    setUser({
                        id: state.user.id.toString(),
                        name: state.user.name,
                        avatar: state.user.avatar || 'https://picsum.photos/100/100',
                        isCheckedIn: false,
                    });
                    
                    // If on login view and authenticated, go to check-in view IMMEDIATELY
                    if (view === AppView.LOGIN) {
                        console.log('[APP] Redirecting from login to check-in (authenticated)');
                        setView(AppView.CHECK_IN_OUT);
                    }
                }
            });
            
            return () => {
                unsubscribe();
            };
        };
        
        initAuth();
    }, []);

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
        // After login, user must check in first before accessing dashboard
        setView(AppView.CHECK_IN_OUT); 
    };
    
    // Logout handler
    const handleLogout = async () => {
        try {
            console.log('[APP] Logging out...');
            
            // Stop camera if running
            if (cameraStream) {
                stopCamera();
            }
            
            // Stop timer if running
            if (isTimerRunning) {
                setIsTimerRunning(false);
                setStartTime(null);
                setElapsedSeconds(0);
            }
            
            // STEP 1: Call device logout API FIRST (unlinks device from server)
            // According to documentation: POST /api/V11/auth/device/logout
            // Uses JWT Token (login_token) from localStorage as Bearer token
            // Works from ANY domain (main or subdomain)
            // WAIT for success response before proceeding with local logout
            let deviceLogoutSuccess = false;
            
            // Get login_token (Bearer token) from localStorage
            // According to documentation, this is the Bearer token to use for logout API
            let bearerToken = localStorage.getItem('login_token');
            
            if (!bearerToken) {
                // Try to get from auth_full_response as fallback
                const authFullResponse = localStorage.getItem('auth_full_response');
                if (authFullResponse) {
                    try {
                        const parsed = JSON.parse(authFullResponse);
                        // Try multiple paths: login_token, data.login_token
                        bearerToken = parsed.login_token || parsed.data?.login_token || null;
                    } catch (e) {
                        console.error('[APP] Error parsing auth_full_response:', e);
                    }
                }
            }
            
            console.log('[APP] Using login_token (Bearer token) for logout:', bearerToken ? `${bearerToken.substring(0, 20)}...` : 'not found');
            
            if (window.electronAPI?.oauthDeviceLogout) {
                try {
                    console.log('[APP] Calling device logout API on main domain...');
                    // Pass the login_token (Bearer token) to the main process
                    const deviceLogoutResult = await window.electronAPI.oauthDeviceLogout(bearerToken);
                    
                    if (deviceLogoutResult.success) {
                        console.log('[APP] ✅ Device logout API success:', deviceLogoutResult.message);
                        deviceLogoutSuccess = true;
                    } else {
                        console.error('[APP] ❌ Device logout API failed:', deviceLogoutResult.error);
                        // Don't proceed with logout if API fails
                        alert(`Logout failed: ${deviceLogoutResult.error || 'Device logout API returned an error'}. Please try again.`);
                        return; // Exit - don't clear localStorage or logout
                    }
                } catch (error: any) {
                    console.error('[APP] ❌ Error calling device logout API:', error);
                    // Don't proceed with logout if API call throws error
                    const errorMessage = error?.message || error?.error || 'Failed to call device logout API';
                    alert(`Logout failed: ${errorMessage}. Please try again.`);
                    return; // Exit - don't clear localStorage or logout
                }
            } else {
                console.warn('[APP] ⚠️ oauthDeviceLogout API not available');
                // If API is not available, we can't proceed safely
                alert('Logout API is not available. Please try again.');
                return; // Exit - don't clear localStorage or logout
            }
            
            // STEP 2: Only proceed with local logout if device logout API was successful
            if (!deviceLogoutSuccess) {
                console.error('[APP] ❌ Device logout API did not succeed, aborting logout');
                return; // Don't proceed
            }
            
            console.log('[APP] Device logout API succeeded, proceeding with local logout...');
            
            // Clear tokens from local storage (keytar)
            if (window.electronAPI?.oauthLogout) {
                try {
                    const result = await window.electronAPI.oauthLogout();
                    if (result.success) {
                        console.log('[APP] ✅ Tokens cleared from keytar storage');
                    } else {
                        console.warn('[APP] ⚠️ Local logout failed:', result.error);
                    }
                } catch (error) {
                    console.error('[APP] Error clearing local tokens:', error);
                }
            }
            
            // Clear localStorage (login_token, device codes, etc.)
            localStorage.removeItem('login_token');
            localStorage.removeItem('device_token');
            localStorage.removeItem('device_code');
            localStorage.removeItem('user_code');
            localStorage.removeItem('device_code_data');
            localStorage.removeItem('auth_full_response');
            console.log('[APP] ✅ Cleared all auth data from localStorage');
            
            // Clear auth state
            authState.clearAuth();
            
            // Clear local user state
            setUser(null);
            setAuthenticatedUser(null);
            setWorkspaces([]);
            setCurrentWorkspace(null);
            
            // Navigate to login view
            setView(AppView.LOGIN);
            setShowUserMenu(false);
            
            console.log('[APP] ✅ Logout complete - ready for new login');
        } catch (error) {
            console.error('[APP] Error during logout:', error);
            // Don't navigate to login if logout process failed
            alert('An error occurred during logout. Please try again.');
        }
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
            // When leaving CHECK_IN_OUT view, stop camera if timer is not running and status is not working
            if (view !== AppView.CHECK_IN_OUT && !isTimerRunning && userStatus !== 'working') {
                if (cameraStream) {
                    console.log('Stopping camera - leaving check-in/out view and timer not running');
                    stopCamera();
                }
            }
        }
    }, [view, startCamera, stopCamera, isTimerRunning, userStatus, cameraStream]);

    // Stop camera when timer stops or status changes to non-working (unless in CHECK_IN_OUT view)
    useEffect(() => {
        // Only stop camera if:
        // 1. Not in CHECK_IN_OUT view (camera is needed there)
        // 2. Timer is not running OR status is not working
        // 3. Camera stream exists
        if (view !== AppView.CHECK_IN_OUT && cameraStream && (!isTimerRunning || userStatus !== 'working')) {
            console.log('Stopping camera - timer stopped or status changed to non-working');
            stopCamera();
        }
    }, [isTimerRunning, userStatus, view, cameraStream, stopCamera]);

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
        if (isDevMode && isTimerRunning && userStatus === 'working') {
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
    }, [isDevMode, isTimerRunning, userStatus, activityLogs.length, selectedProjectId]);
    
    // Track if capture is in progress to prevent duplicate captures
    const captureInProgressRef = useRef<boolean>(false);
    
    useEffect(() => {
        if (activityLogs.length > 0 && isTimerRunning && selectedTaskId && userStatus === 'working') {
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
                // Double-check conditions before starting capture
                if (!isTimerRunning || userStatus !== 'working') {
                    console.log('Capture skipped - timer not running or status not working');
                    return;
                }
                
                // Mark capture as in progress
                captureInProgressRef.current = true;
                console.log('Starting media capture for log:', latestLog.id, isDevMode ? '(DEV MODE)' : '');
                const captureMedia = async () => {
                    const screenshots: string[] = [];
                    let webcamPhoto: string | null = null;
                    let tempCameraStream: MediaStream | null = null;
                    
                    try {
                        // CRITICAL: Check if timer is still running and status is still working before starting camera
                        // This prevents camera from starting if conditions changed during async operations
                        if (!isTimerRunning || userStatus !== 'working') {
                            console.log('Timer stopped or status changed - aborting camera start and capture');
                            captureInProgressRef.current = false;
                            return;
                        }
                        
                        // Start camera first if we need webcam capture (before capturing screenshots)
                    // Check if cameraStream exists AND has active tracks, not just if it exists
                    const hasActiveCamera = cameraStream && cameraStream.getTracks().some(track => track.readyState === 'live');
                    if (needsWebcam && !hasActiveCamera) {
                        // Double-check conditions before starting camera
                        if (!isTimerRunning || userStatus !== 'working') {
                            console.log('Conditions changed - aborting camera start');
                            captureInProgressRef.current = false;
                            return;
                        }
                        
                        console.log('Starting camera for webcam capture...');
                        try {
                            tempCameraStream = await startCamera();
                            
                            // Verify conditions again after camera starts (async operation)
                            if (!isTimerRunning || userStatus !== 'working') {
                                console.log('Conditions changed after camera start - stopping camera');
                                if (tempCameraStream) {
                                    tempCameraStream.getTracks().forEach(track => track.stop());
                                }
                                captureInProgressRef.current = false;
                                return;
                            }
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
                            
                            // Ensure video is playing (required for metadata to load)
                            if (video.paused) {
                                console.log('Video is paused, attempting to play...');
                                try {
                                    await video.play();
                                    console.log('Video play() called successfully');
                                } catch (playError) {
                                    console.warn('Video play() failed (may be autoplay blocked):', playError);
                                }
                            }
                            
                            // Wait for metadata to load using event listener (more reliable than polling)
                            const waitForMetadata = new Promise<void>((resolve) => {
                                if (video.readyState >= 2 && video.videoWidth >= 100 && video.videoHeight >= 100) {
                                    resolve();
                                    return;
                                }
                                
                                const onLoadedMetadata = () => {
                                    if (video.videoWidth >= 100 && video.videoHeight >= 100) {
                                        video.removeEventListener('loadedmetadata', onLoadedMetadata);
                                        resolve();
                                    }
                                };
                                
                                video.addEventListener('loadedmetadata', onLoadedMetadata);
                                
                                // Fallback timeout after 5 seconds
                                setTimeout(() => {
                                    video.removeEventListener('loadedmetadata', onLoadedMetadata);
                                    resolve();
                                }, 5000);
                            });
                            
                            await waitForMetadata;
                            
                            // Additional polling wait for dimensions (in case event didn't fire)
                            let attempts = 0;
                            const maxAttempts = 25; // Wait up to 5 seconds total
                            while (attempts < maxAttempts && (video.videoWidth < 100 || video.videoHeight < 100 || video.readyState < 2)) {
                                await new Promise(resolve => setTimeout(resolve, 200));
                                attempts++;
                                if (attempts % 5 === 0) {
                                    console.log(`Waiting for video element to receive stream... (attempt ${attempts}/${maxAttempts}, dimensions: ${video.videoWidth}x${video.videoHeight}, readyState: ${video.readyState}, paused: ${video.paused})`);
                                }
                            }
                            
                            // Video element must have valid dimensions to capture from it
                            if (video.videoWidth >= 100 && video.videoHeight >= 100 && video.readyState >= 2) {
                                cameraReady = true;
                                console.log(`Camera ready: stream tracks live, video element ${video.videoWidth}x${video.videoHeight}, readyState: ${video.readyState}`);
                            } else {
                                // Last attempt: try to force play and reload
                                console.warn('Video still not ready, attempting final recovery...');
                                try {
                                    video.pause();
                                    video.srcObject = null;
                                    await new Promise(resolve => setTimeout(resolve, 100));
                                    video.srcObject = activeCameraStream;
                                    await video.play();
                                    await new Promise(resolve => setTimeout(resolve, 1000));
                                    
                                    if (video.videoWidth >= 100 && video.videoHeight >= 100 && video.readyState >= 2) {
                                        cameraReady = true;
                                        console.log(`Camera ready after recovery: ${video.videoWidth}x${video.videoHeight}, readyState: ${video.readyState}`);
                                    } else {
                                        console.error('Video element not ready after waiting and recovery attempt:', {
                                            videoWidth: video.videoWidth,
                                            videoHeight: video.videoHeight,
                                            readyState: video.readyState,
                                            srcObject: !!video.srcObject,
                                            hasLiveTracks: hasLiveTracks,
                                            paused: video.paused,
                                            attempts: attempts
                                        });
                                    }
                                } catch (recoveryError) {
                                    console.error('Recovery attempt failed:', recoveryError);
                                }
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
                    // Final check before executing capture - conditions might have changed during delay
                    if (!isTimerRunning || userStatus !== 'working') {
                        console.log('Conditions changed during delay - aborting capture');
                        captureInProgressRef.current = false;
                        return;
                    }
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
    }, [activityLogs, isTimerRunning, userStatus, selectedTaskId, selectedProjectId, settings?.enableScreenshotBlur, settings?.enableScreenshots, cameraStream]); // Use activityLogs directly to detect new logs

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
            
            const selectedTask = tasks.find(t => t.id === selectedTaskId);
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
            
            // Set status to 'idle' when timer stops
            setUserStatus('idle');
            
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
                    const selectedTask = tasks.find(t => t.id === selectedTaskId);
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
            // Set status to 'working' when task starts
            setUserStatus('working');
            // Camera will be started only when needed for capture, not always
            
            // No longer saving active task state - all data comes from task JSON files
        }
    };

    // Watch userStatus changes - pause timer if status changes to non-working
    const previousStatusRef = useRef<UserStatus>(userStatus);
    useEffect(() => {
        // Only pause if timer is running, status changed from 'working' to non-working (break/meeting/away)
        // Don't pause if status is 'idle' (that's set automatically when timer stops)
        if (isTimerRunning && previousStatusRef.current === 'working' && userStatus !== 'working' && userStatus !== 'idle') {
            // Status changed from working to non-working while timer is running - pause the task
            console.log(`Status changed from ${previousStatusRef.current} to ${userStatus} - pausing task`);
            toggleTimer();
        }
        // Update previous status
        previousStatusRef.current = userStatus;
    }, [userStatus]); // Only watch userStatus changes

    const handleFaceConfirmed = async (photoData: string) => {
        if (!user) {
            throw new Error('User not found');
        }
        
        if (user.isCheckedIn) {
            // Check Out - This is now handled by onCheckOut callback in FaceAttendance
            // This onConfirm is kept for backward compatibility but shouldn't be called
            // when onFaceValidated and onCheckOut are provided
            throw new Error('Please use onCheckOut callback for check-out');
        } else {
            // Check In - verify face with API first, then check-in
            // Step 1: Call Face Check API to verify the face
            const faceCheckResult = await apiService.checkFace(photoData);
            
            if (faceCheckResult.success && faceCheckResult.data) {
                // Face matched successfully (similarity ≥ 75%)
                const similarity = faceCheckResult.data.similarity;
                console.log(`Face verification successful: ${similarity}% similarity`);
                
                // Step 2: Call Check-In API
                const now = new Date();
                const checkInTime = now.toTimeString().slice(0, 5); // HH:mm format
                const checkInDate = now.toISOString().split('T')[0]; // YYYY-MM-DD format
                
                const checkInData = {
                    check_in: checkInTime,
                    date: checkInDate,
                    attendance_from: 'web',
                    check_in_location: 'Device',
                };
                
                console.log('[CHECK-IN] Calling check-in API with data:', checkInData);
                const checkInResult = await apiService.checkIn(checkInData);
                
                if (checkInResult.success) {
                    console.log('[CHECK-IN] Check-in successful:', checkInResult.data);
                    
                    // Update user state
                    setUser({ 
                        ...user, 
                        isCheckedIn: true, 
                        checkInTime: now 
                    });
                    
                    // Stop camera
                    stopCamera();
                    
                    // Fetch projects and tasks after successful check-in
                    // Get workspace from authState directly (more reliable)
                    const workspace = authState.getCurrentWorkspace();
                    const workspaceId = workspace?.workspace_id?.toString() || currentWorkspace?.workspace_id?.toString();
                    
                    // Navigate to dashboard first (so user sees loading state)
                    setView(AppView.DASHBOARD);
                    
                    if (workspaceId) {
                        console.log('[CHECK-IN] Fetching projects and tasks after check-in...', { workspaceId });
                        // Use Promise.all to fetch both in parallel
                        await Promise.all([
                            fetchProjects(workspaceId),
                            fetchTasks(undefined, workspaceId)
                        ]);
                        console.log('[CHECK-IN] ✅ Projects and tasks fetched successfully');
                    } else {
                        console.warn('[CHECK-IN] ⚠️ No workspace ID available, cannot fetch projects/tasks');
                    }
                } else {
                    // Check-in API failed
                    const errorMessage = checkInResult.error || checkInResult.message || 'Check-in failed';
                    console.error('[CHECK-IN] Check-in failed:', errorMessage);
                    throw new Error(errorMessage);
                }
            } else {
                // Face verification failed - throw error so FaceAttendance can catch it
                const errorMessage = faceCheckResult.error || faceCheckResult.message || 'Face verification failed';
                console.error('Face verification failed:', errorMessage);
                
                // Throw error with user-friendly message
                throw new Error(errorMessage);
            }
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

    // OAuth login handler
    const handleOAuthLogin = async () => {
        // CRITICAL: Don't start OAuth if already authenticated
        if (authenticatedUser) {
            console.log('[APP] ⚠️ handleOAuthLogin called but user is already authenticated, redirecting...');
            setView(AppView.CHECK_IN_OUT);
            return;
        }
        
        if (!window.electronAPI) {
            setLoginOAuthStatus('Electron API not available');
            return;
        }

        // Check for API URL from environment variables first, then settings
        const envApiBaseUrl = import.meta.env.VITE_API_BASE_URL;
        const settings = await window.electronAPI.getSettings();
        const apiBaseUrl = envApiBaseUrl || settings?.apiBaseUrl;
        
        if (!apiBaseUrl) {
            setLoginOAuthStatus('Please configure API Base URL in Settings or .env.local file');
            return;
        }
        
        // If we have env var but not in settings, update settings
        if (envApiBaseUrl && (!settings?.apiBaseUrl || settings.apiBaseUrl !== envApiBaseUrl)) {
            await window.electronAPI.setSettings({
                ...settings,
                apiBaseUrl: envApiBaseUrl,
                apiEnabled: import.meta.env.VITE_API_ENABLED === 'true' || settings?.apiEnabled || false,
            });
        }

        // Check if user is already authenticated BEFORE starting new OAuth flow
        // This prevents "code_already_used" error
        try {
            console.log('[APP] Checking authentication status before starting OAuth...');
            const status = await window.electronAPI.oauthCheckStatus();
            console.log('[APP] Auth check result:', {
                authenticated: status.authenticated,
                hasUser: !!status.user,
                hasWorkspaces: !!status.workspaces,
                workspacesCount: status.workspaces?.length || 0
            });
            
            if (status.authenticated && status.user) {
                console.log('[APP] ✅ User is already authenticated, skipping OAuth flow completely');
                // Update auth state
                if (status.user && status.workspaces) {
                    authState.setAuthData(
                        status.user as AuthenticatedUser,
                        status.workspaces as Workspace[],
                        '', // Token is stored in main process
                        status.expires_at || Date.now() + 604800000,
                        status.currentWorkspace?.workspace_id
                    );
                }
                
                // Update user state
                setAuthenticatedUser(status.user as AuthenticatedUser);
                setWorkspaces(status.workspaces as Workspace[] || []);
                if (status.currentWorkspace) {
                    setCurrentWorkspace(status.currentWorkspace as Workspace);
                }
                
                // Set user data
                setUser({
                    id: status.user.id.toString(),
                    name: status.user.name,
                    avatar: status.user.avatar || 'https://picsum.photos/100/100',
                    isCheckedIn: false,
                });
                
                // Clear status and redirect IMMEDIATELY
                setLoginOAuthStatus('');
                setLoginAuthenticating(false);
                
                // Redirect IMMEDIATELY - no setTimeout delay
                if (user?.isCheckedIn) {
                    console.log('[APP] Already authenticated and checked in, redirecting to dashboard');
                    setView(AppView.DASHBOARD);
                } else {
                    console.log('[APP] Already authenticated but not checked in, redirecting to check-in page');
                    setView(AppView.CHECK_IN_OUT);
                }
                return; // CRITICAL: Don't start new OAuth flow - exit function immediately
            } else {
                console.log('[APP] User is NOT authenticated, proceeding with OAuth flow');
            }
        } catch (error) {
            console.error('[APP] Error checking auth status:', error);
            // If check fails, we can't be sure if authenticated, so proceed with OAuth
            // But log the error for debugging
        }

        setLoginAuthenticating(true);
        setLoginDeviceCode(null);
        setLoginOAuthStatus('Starting authentication...');

        // Set up event listeners
        if (window.electronAPI.onOAuthDeviceCode) {
            window.electronAPI.onOAuthDeviceCode((data) => {
                setLoginDeviceCode(data);
                
                // Store device_code and user_code in localStorage
                if (data.device_code) {
                    localStorage.setItem('device_code', data.device_code);
                    console.log('[APP] Saved device_code to localStorage');
                }
                if (data.user_code) {
                    localStorage.setItem('user_code', data.user_code);
                    console.log('[APP] Saved user_code to localStorage');
                }
                
                // Store device code data with expiration
                if (data.device_code && data.expires_in) {
                    const deviceCodeData = {
                        device_code: data.device_code,
                        user_code: data.user_code,
                        verification_url: data.verification_url,
                        expires_in: data.expires_in,
                        interval: data.interval || 5,
                        generated_at: Date.now(),
                        expires_at: Date.now() + (data.expires_in * 1000), // Convert to milliseconds
                    };
                    localStorage.setItem('device_code_data', JSON.stringify(deviceCodeData));
                    console.log('[APP] Saved device_code_data to localStorage with expiration');
                }
                
                if (data.browser_opened) {
                    setLoginOAuthStatus(`Browser opened! Enter code: ${data.user_code}`);
                } else {
                    setLoginOAuthStatus(`Please open: ${data.verification_url}\nEnter code: ${data.user_code}`);
                }
            });
        }

        // Generate and store device ID if not exists
        let deviceId = localStorage.getItem('device_id');
        if (!deviceId) {
            // Generate a unique device ID
            deviceId = `device_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
            localStorage.setItem('device_id', deviceId);
            console.log('[APP] Generated new device ID:', deviceId);
        } else {
            console.log('[APP] Using existing device ID:', deviceId);
        }

        // Listen for login_token from main process and save to localStorage
        if (window.electronAPI && window.electronAPI.onLoginToken) {
            window.electronAPI.onLoginToken((token: string) => {
                if (token) {
                    localStorage.setItem('login_token', token);
                    localStorage.setItem('device_token', token); // Store as device_token too
                    console.log('[APP] Saved login_token and device_token to localStorage');
                }
            });
        }

        // Listen for full response data from main process and save to localStorage
        if (window.electronAPI && window.electronAPI.onFullResponse) {
            window.electronAPI.onFullResponse((fullResponse: any) => {
                if (fullResponse) {
                    localStorage.setItem('auth_full_response', JSON.stringify(fullResponse));
                    console.log('[APP] Saved full auth response to localStorage');
                    
                    // Also save login_token separately for backward compatibility
                    if (fullResponse.login_token) {
                        localStorage.setItem('login_token', fullResponse.login_token);
                        localStorage.setItem('device_token', fullResponse.login_token); // Store as device_token too
                    }
                    
                    // Store device ID with auth data
                    if (deviceId) {
                        const authData = {
                            ...fullResponse,
                            device_id: deviceId
                        };
                        localStorage.setItem('auth_full_response', JSON.stringify(authData));
                    }
                }
            });
        }

        if (window.electronAPI.onOAuthSuccess) {
            window.electronAPI.onOAuthSuccess(async (data) => {
                // Don't show status message - redirect immediately instead
                setLoginAuthenticating(false);
                setLoginDeviceCode(null);
                setLoginOAuthStatus(''); // Clear any existing status
                
                // Generate and store device ID if not exists
                let deviceId = localStorage.getItem('device_id');
                if (!deviceId) {
                    deviceId = `device_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
                    localStorage.setItem('device_id', deviceId);
                    console.log('[APP] Generated new device ID:', deviceId);
                }
                
                // Save full response data to localStorage with device ID
                if (data.fullResponse) {
                    const authData = {
                        ...data.fullResponse,
                        device_id: deviceId
                    };
                    localStorage.setItem('auth_full_response', JSON.stringify(authData));
                    console.log('[APP] Saved full auth response to localStorage from OAuth success (with device_id)');
                }
                
                // Save login_token to localStorage if available (for backward compatibility)
                if (data.login_token) {
                    localStorage.setItem('login_token', data.login_token);
                    localStorage.setItem('device_token', data.login_token); // Store as device_token too
                    console.log('[APP] Saved login_token and device_token to localStorage from OAuth success');
                }
                
                // Update auth state with full data
                console.log('[APP] ========== OAUTH SUCCESS EVENT ==========');
                console.log('[APP] Full event data:', JSON.stringify(data, null, 2));
                console.log('[APP] OAuth success event received:', {
                    hasUser: !!data.user,
                    hasWorkspaces: !!data.workspaces,
                    workspacesCount: data.workspaces?.length || 0,
                    hasToken: !!data.token,
                    hasExpiresAt: !!data.expires_at,
                    hasCurrentWorkspace: !!data.currentWorkspace,
                });
                
                if (data.workspaces && Array.isArray(data.workspaces)) {
                    console.log('[APP] ✅ Workspaces in success event:', data.workspaces.map((w: any) => ({
                        id: w.workspace_id,
                        name: w.workspace_name,
                        company: w.company_name,
                    })));
                } else {
                    console.warn('[APP] ⚠️ Workspaces not found or not an array in success event');
                    console.log('[APP] Data keys:', Object.keys(data));
                }
                
                if (data.user && data.workspaces && data.token && data.expires_at) {
                    console.log('[APP] Setting auth data with', data.workspaces.length, 'workspaces');
                    authState.setAuthData(
                        data.user as AuthenticatedUser,
                        data.workspaces as Workspace[],
                        data.token,
                        data.expires_at,
                        data.currentWorkspace?.workspace_id,
                        data.fullResponse // Include full response
                    );
                } else {
                    console.warn('[APP] ⚠️ Missing data in OAuth success event:', {
                        user: !!data.user,
                        workspaces: !!data.workspaces,
                        token: !!data.token,
                        expires_at: !!data.expires_at,
                    });
                    
                    // Try to reload from storage if workspaces are missing
                    if (data.user && !data.workspaces) {
                        console.log('[APP] Attempting to reload workspaces from storage...');
                        try {
                            const status = await window.electronAPI.oauthCheckStatus();
                            if (status.workspaces && status.workspaces.length > 0) {
                                console.log('[APP] Found workspaces in storage:', status.workspaces.length);
                                authState.setAuthData(
                                    data.user as AuthenticatedUser,
                                    status.workspaces as Workspace[],
                                    data.token || '',
                                    data.expires_at || Date.now() + 604800000,
                                    status.currentWorkspace?.workspace_id
                                );
                            }
                        } catch (error) {
                            console.error('[APP] Error reloading workspaces:', error);
                        }
                    }
                }
                console.log('[APP] ===========================================');
                
                // Update user state immediately
                setAuthenticatedUser(data.user as AuthenticatedUser);
                setWorkspaces(data.workspaces as Workspace[] || []);
                if (data.currentWorkspace) {
                    setCurrentWorkspace(data.currentWorkspace as Workspace);
                }
                
                // After OAuth success, go to check-in screen first
                // User must check in before accessing dashboard
                // Clear the status message and redirect IMMEDIATELY
                setLoginOAuthStatus(''); // Clear status message
                setLoginAuthenticating(false);
                
                // Redirect IMMEDIATELY - no setTimeout delay
                if (user?.isCheckedIn) {
                    console.log('[APP] User already checked in, redirecting to dashboard');
                    setView(AppView.DASHBOARD);
                } else {
                    console.log('[APP] User not checked in, redirecting to check-in page');
                    setView(AppView.CHECK_IN_OUT);
                }
                
                // Clean up listeners
                if (window.electronAPI.removeOAuthListeners) {
                    window.electronAPI.removeOAuthListeners();
                }
            });
        }

        try {
            const result = await window.electronAPI.oauthAuthenticate();
            
            if (result.success && !loginDeviceCode) {
                setLoginOAuthStatus(`✓ ${result.message || 'Authentication successful!'}`);
                setLoginAuthenticating(false);
                
                // Update auth state with full data
                if (result.user && result.workspaces && result.token && result.expires_at) {
                    authState.setAuthData(
                        result.user as AuthenticatedUser,
                        result.workspaces as Workspace[],
                        result.token,
                        result.expires_at,
                        result.currentWorkspace?.workspace_id
                    );
                }
                
                // After OAuth success, go to check-in screen first
                // User must check in before accessing dashboard
                // Redirect IMMEDIATELY - no setTimeout delay
                if (user?.isCheckedIn) {
                    console.log('[APP] User already checked in, redirecting to dashboard');
                    setView(AppView.DASHBOARD);
                } else {
                    console.log('[APP] User not checked in, redirecting to check-in page');
                    setView(AppView.CHECK_IN_OUT);
                }
            } else if (result.error && !loginDeviceCode) {
                // Handle "code_already_used" - check if already authenticated
                if ((result as any).code_already_used) {
                    console.log('[APP] Device code already used, checking if user is already authenticated...');
                    // Check current auth status
                    try {
                        const status = await window.electronAPI.oauthCheckStatus();
                        if (status.authenticated && status.user) {
                            console.log('[APP] ✅ User is already authenticated, redirecting...');
                            // Update auth state first
                            if (status.user && status.workspaces) {
                                authState.setAuthData(
                                    status.user as AuthenticatedUser,
                                    status.workspaces as Workspace[],
                                    '', // Token is stored in main process
                                    status.expires_at || Date.now() + 604800000,
                                    status.currentWorkspace?.workspace_id
                                );
                            }
                            
                            // Update user state
                            setAuthenticatedUser(status.user as AuthenticatedUser);
                            setWorkspaces(status.workspaces as Workspace[] || []);
                            if (status.currentWorkspace) {
                                setCurrentWorkspace(status.currentWorkspace as Workspace);
                            }
                            
                            // Clear status message and redirect immediately
                            setLoginOAuthStatus(''); // Clear status message
                            setLoginAuthenticating(false);
                            
                            // Go to check-in screen first
                            // User must check in before accessing dashboard
                            // Redirect IMMEDIATELY - no setTimeout delay
                            if (user?.isCheckedIn) {
                                console.log('[APP] Already authenticated and checked in, redirecting to dashboard');
                                setView(AppView.DASHBOARD);
                            } else {
                                console.log('[APP] Already authenticated but not checked in, redirecting to check-in page');
                                setView(AppView.CHECK_IN_OUT);
                            }
                            return; // Don't show error message
                        } else {
                            // Not authenticated, show error and allow retry
                            console.log('[APP] ⚠️ Device code already used but user is not authenticated');
                            setLoginOAuthStatus(`✗ Device code already used. Please try again.`);
                            setLoginAuthenticating(false);
                        }
                    } catch (checkError) {
                        console.error('[APP] Error checking auth status:', checkError);
                        // Show error but allow retry
                        setLoginOAuthStatus(`✗ ${result.error}. Please try again.`);
                        setLoginAuthenticating(false);
                    }
                } else {
                    // Other errors
                    setLoginOAuthStatus(`✗ ${result.error}`);
                    setLoginAuthenticating(false);
                }
            }
        } catch (error: any) {
            setLoginOAuthStatus(`✗ Authentication failed: ${error.message}`);
            setLoginAuthenticating(false);
            setLoginDeviceCode(null);
            
            if (window.electronAPI.removeOAuthListeners) {
                window.electronAPI.removeOAuthListeners();
            }
        }
    };

    // Protect login view - if user is already authenticated, redirect immediately
    // Don't show login page if already authenticated
    // Also check localStorage as fallback
    const loginToken = localStorage.getItem('login_token');
    const authFullResponse = localStorage.getItem('auth_full_response');
    const isAuthenticatedFromStorage = !!(loginToken || authFullResponse);
    
    if (view === AppView.LOGIN && (authenticatedUser || isAuthenticatedFromStorage)) {
        console.log('[APP] User is authenticated (from state or localStorage), redirecting from login page');
        // Redirect based on check-in status
        if (user?.isCheckedIn) {
            setView(AppView.DASHBOARD);
        } else {
            setView(AppView.CHECK_IN_OUT);
        }
        return null; // Don't render login page
    }
    
    if (view === AppView.LOGIN) {
        return (
            <div className="min-h-screen flex flex-col bg-gray-950 font-sans">
                <TitleBar />
                <div className="flex-1 flex items-center justify-center p-4">
                    {hiddenElements}
                    <div className="w-full max-w-md bg-gray-900 rounded-2xl shadow-2xl p-8 border border-gray-800 mx-auto">
                    <div className="text-center mb-8">
                        <div className="w-16 h-16 bg-blue-600 rounded-xl mx-auto flex items-center justify-center mb-4 shadow-lg shadow-blue-500/30">
                            <i className="fas fa-bolt text-2xl text-white"></i>
                        </div>
                        <h1 className="text-2xl font-bold text-white tracking-tight">Tyrodesk</h1>
                        <p className="text-gray-400 text-sm">Workforce Management</p>
                    </div>
                    
                    {/* OAuth Browser Login Button */}
                    <button
                        onClick={handleOAuthLogin}
                        disabled={loginAuthenticating || !!authenticatedUser}
                        className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-lg shadow-md transition-all flex items-center justify-center gap-3 mb-4"
                    >
                        {loginAuthenticating ? (
                            <>
                                <i className="fas fa-spinner fa-spin"></i>
                                <span>{loginDeviceCode ? 'Waiting for authorization...' : 'Opening browser...'}</span>
                            </>
                        ) : authenticatedUser ? (
                            <>
                                <i className="fas fa-check-circle"></i>
                                <span>Already Authenticated</span>
                            </>
                        ) : (
                            <>
                                <i className="fas fa-sign-in-alt"></i>
                                <span>Login with Browser</span>
                            </>
                        )}
                    </button>

                    {/* Device Code Display */}
                    {loginDeviceCode && (
                        <div className="bg-blue-900/30 border border-blue-700 rounded-lg p-4 mb-4 space-y-3">
                            <div className="flex items-center gap-2">
                                <i className="fas fa-info-circle text-blue-400"></i>
                                <p className="text-white text-xs font-medium">Enter this code in your browser:</p>
                            </div>
                            <div className="bg-gray-900 rounded-lg p-4 text-center">
                                <p className="text-3xl font-mono font-bold text-blue-400 tracking-wider">
                                    {loginDeviceCode.user_code}
                                </p>
                            </div>
                            {!loginDeviceCode.browser_opened && (
                                <div className="mt-2">
                                    <p className="text-yellow-400 text-xs mb-1">Browser didn't open automatically. Please open:</p>
                                    <a 
                                        href={loginDeviceCode.verification_url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-blue-400 hover:text-blue-300 text-xs break-all underline"
                                    >
                                        {loginDeviceCode.verification_url}
                                    </a>
                                </div>
                            )}
                            <p className="text-gray-400 text-xs text-center">
                                <i className="fas fa-clock mr-1"></i>
                                Waiting for authorization...
                            </p>
                        </div>
                    )}

                    {/* OAuth Status Message */}
                    {loginOAuthStatus && (
                        <div className={`mb-4 p-3 rounded-lg text-sm text-center ${
                            loginOAuthStatus.includes('✓') 
                                ? 'bg-green-900/30 text-green-400 border border-green-700' 
                                : loginOAuthStatus.includes('✗')
                                ? 'bg-red-900/30 text-red-400 border border-red-700'
                                : 'bg-blue-900/30 text-blue-400 border border-blue-700'
                        }`}>
                            {loginOAuthStatus}
                        </div>
                    )}
                    
                    <div className="flex items-center my-6">
                        <div className="flex-1 border-t border-gray-700"></div>
                        <span className="px-4 text-xs text-gray-500 uppercase font-bold">Or</span>
                        <div className="flex-1 border-t border-gray-700"></div>
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

    // Don't show CHECK_IN_OUT view if user just checked in and we're loading data
    // This prevents showing checkout page immediately after check-in
    const shouldShowCheckInOut = view === AppView.CHECK_IN_OUT && !(user?.isCheckedIn && (projectsLoading || tasksLoading));
    
    if (shouldShowCheckInOut) {
        return (
            <div className="min-h-screen bg-gray-950 flex flex-col font-sans">
                <TitleBar />
                <div className="flex-1 flex justify-center p-2 sm:p-4">
                    {hiddenElements}
                    <div className="w-full max-w-7xl bg-gray-900 shadow-2xl overflow-hidden relative border-x border-gray-800 mx-auto">
                    {/* Logout Button - Top Right (only show on check-in, not check-out) */}
                    {!user?.isCheckedIn && (
                        <button
                            onClick={handleLogout}
                            className="absolute top-3 sm:top-4 right-3 sm:right-4 z-20 bg-red-600 hover:bg-red-500 text-white px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-medium transition-colors flex items-center gap-2 shadow-lg"
                            title="Logout and login again to get fresh token"
                        >
                            <i className="fas fa-sign-out-alt"></i>
                            <span className="hidden sm:inline">Logout</span>
                        </button>
                    )}
                    <FaceAttendance 
                        mode={user?.isCheckedIn ? 'CHECK_OUT' : 'CHECK_IN'}
                        existingStream={cameraStream}
                        onConfirm={handleFaceConfirmed}
                        onFaceValidated={async (photoData: string) => {
                            // Only validate face, don't check in yet
                            const faceCheckResult = await apiService.checkFace(photoData);
                            
                            if (faceCheckResult.success && faceCheckResult.data) {
                                const similarity = faceCheckResult.data.similarity;
                                console.log(`Face verification successful: ${similarity}% similarity`);
                                return true; // Face validated
                            } else {
                                const errorMessage = faceCheckResult.error || faceCheckResult.message || 'Face verification failed';
                                console.error('Face verification failed:', errorMessage);
                                throw new Error(errorMessage);
                            }
                        }}
                        onCheckIn={async (photoData: string) => {
                            // Call Check-In API
                            const now = new Date();
                            const checkInTime = now.toTimeString().slice(0, 5); // HH:mm format
                            const checkInDate = now.toISOString().split('T')[0]; // YYYY-MM-DD format
                            
                            const checkInData = {
                                check_in: checkInTime,
                                date: checkInDate,
                                attendance_from: 'web',
                                check_in_location: 'Device',
                            };
                            
                            console.log('[CHECK-IN] Calling check-in API with data:', checkInData);
                            const checkInResult = await apiService.checkIn(checkInData);
                            
                            if (checkInResult.success) {
                                console.log('[CHECK-IN] Check-in successful:', checkInResult.data);
                                
                                // Update user state
                                setUser({ 
                                    ...user, 
                                    isCheckedIn: true, 
                                    checkInTime: now 
                                });
                                
                                // Stop camera
                                stopCamera();
                                
                                // Get workspace ID
                                const workspace = authState.getCurrentWorkspace();
                                const workspaceId = workspace?.workspace_id?.toString() || currentWorkspace?.workspace_id?.toString();
                                
                                // Navigate to dashboard FIRST (so user sees loading state)
                                setView(AppView.DASHBOARD);
                                
                                // Fetch projects and tasks after successful check-in
                                if (workspaceId) {
                                    console.log('[CHECK-IN] Fetching projects and tasks after check-in...', { workspaceId });
                                    // Use Promise.all to fetch both in parallel
                                    await Promise.all([
                                        fetchProjects(workspaceId),
                                        fetchTasks(undefined, workspaceId)
                                    ]);
                                    console.log('[CHECK-IN] ✅ Projects and tasks fetched successfully');
                                } else {
                                    console.warn('[CHECK-IN] ⚠️ No workspace ID available, cannot fetch projects/tasks');
                                }
                            } else {
                                const errorMessage = checkInResult.error || checkInResult.message || 'Check-in failed';
                                console.error('[CHECK-IN] Check-in failed:', errorMessage);
                                throw new Error(errorMessage);
                            }
                        }}
                        onCheckOut={async (photoData: string) => {
                            // Step 1: Stop task if running
                            if (isTimerRunning) {
                                await toggleTimer();
                                // Wait a moment for the task to stop and save
                                await new Promise(resolve => setTimeout(resolve, 500));
                            }
                            
                            // Step 2: Call Check-Out API
                            const now = new Date();
                            const checkOutTime = now.toTimeString().slice(0, 5); // HH:mm format
                            const checkOutDate = now.toISOString().split('T')[0]; // YYYY-MM-DD format
                            
                            const checkOutData = {
                                check_out: checkOutTime,
                                date: checkOutDate,
                                attendance_from: 'web',
                                // attendance_id is optional - API will auto-find if not provided
                            };
                            
                            console.log('[CHECK-OUT] Calling check-out API with data:', checkOutData);
                            const checkOutResult = await apiService.checkOut(checkOutData);
                            
                            if (checkOutResult.success) {
                                console.log('[CHECK-OUT] Check-out successful:', checkOutResult.data);
                                
                                // Update user state
                                setUser({ 
                                    ...user, 
                                    isCheckedIn: false, 
                                    checkInTime: undefined 
                                });
                                
                                // Stop tracking and set status to idle
                                stopCamera();
                                setUserStatus('idle');
                                
                                // Wait a moment for state to update
                                await new Promise(resolve => setTimeout(resolve, 300));
                                
                                // Navigate to check-in page (not logout)
                                // This will trigger mode change from CHECK_OUT to CHECK_IN
                                setView(AppView.CHECK_IN_OUT);
                                
                                // Start camera for fresh check-in page after a short delay
                                setTimeout(async () => {
                                    try {
                                        console.log('[CHECK-OUT] Starting camera for fresh check-in page...');
                                        const stream = await startCamera();
                                        if (stream) {
                                            console.log('[CHECK-OUT] Camera started successfully for check-in');
                                        }
                                    } catch (error) {
                                        console.error('[CHECK-OUT] Failed to start camera for check-in:', error);
                                    }
                                }, 500);
                            } else {
                                const errorMessage = checkOutResult.error || checkOutResult.message || 'Check-out failed';
                                console.error('[CHECK-OUT] Check-out failed:', errorMessage);
                                throw new Error(errorMessage);
                            }
                        }}
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
                        onCancel={() => {
                            // If user is checked in, go to dashboard
                            // If not checked in but authenticated, stay on check-in (don't go to login)
                            if (user?.isCheckedIn) {
                                setView(AppView.DASHBOARD);
                            } else if (authenticatedUser || user) {
                                // User is authenticated but not checked in - stay on check-in screen
                                // Don't go back to login
                                setView(AppView.CHECK_IN_OUT);
                            } else {
                                // Not authenticated, go to login
                                setView(AppView.LOGIN);
                            }
                        }}
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
                    <div className="w-full max-w-7xl bg-gray-900 shadow-2xl overflow-hidden flex flex-col border-x border-gray-800 mx-auto">
                    <InsightsDashboard 
                        logs={activityLogs}
                        projects={projects}
                        tasks={tasks}
                        onClose={() => {
                            setView(AppView.DASHBOARD);
                            setInsightsTaskFilter(undefined);
                        }}
                        filterTaskId={insightsTaskFilter}
                        filterProjectId={insightsProjectFilter || (insightsTaskFilter ? (() => {
                            const task = tasks.find(t => t.id === insightsTaskFilter);
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
                    <div className="w-full max-w-7xl bg-gray-900 shadow-2xl overflow-hidden flex flex-col border-x border-gray-800 mx-auto">
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
    // Protect dashboard - user must be checked in to access
    if (!user?.isCheckedIn) {
        // User not checked in, redirect to check-in
        return (
            <div className="min-h-screen bg-gray-950 flex flex-col font-sans">
                <TitleBar />
                <div className="flex-1 flex justify-center items-center">
                    <div className="text-center">
                        <p className="text-gray-400 mb-4">Please check in first to access the dashboard</p>
                        <button
                            onClick={() => setView(AppView.CHECK_IN_OUT)}
                            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                        >
                            Go to Check In
                        </button>
                    </div>
                </div>
            </div>
        );
    }
    
    return (
        <div className="min-h-screen bg-gray-950 flex flex-col font-sans">
            <TitleBar />
            <div className="flex-1 flex justify-center">
                {hiddenElements}
                <div className="w-full max-w-7xl bg-gray-900 shadow-2xl flex flex-col overflow-hidden border-x border-gray-800 relative mx-auto">
                
                {/* Header */}
                <header className="bg-gray-800 px-3 sm:px-4 md:px-6 py-3 md:py-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-0 shadow-md z-10">
                    <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto">
                        <div className="relative flex-shrink-0">
                            <button
                                onClick={() => setShowUserMenu(!showUserMenu)}
                                className="relative focus:outline-none focus:ring-2 focus:ring-blue-500 rounded-full"
                            >
                                <UserAvatar 
                                    src={user?.avatar} 
                                    alt="User" 
                                    size="sm"
                                    className="hover:border-gray-500 transition-colors cursor-pointer"
                                />
                                <div className={`absolute bottom-0 right-0 w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full border-2 border-gray-800 ${isTimerRunning ? 'bg-green-500 animate-pulse' : 'bg-yellow-500'}`}></div>
                            </button>
                            
                            {/* User Dropdown Menu */}
                            {showUserMenu && (
                                <>
                                    <div 
                                        className="fixed inset-0 z-40" 
                                        onClick={() => setShowUserMenu(false)}
                                    ></div>
                                    <div className="absolute left-0 top-full mt-2 w-72 bg-gray-800 rounded-lg shadow-xl border border-gray-700 z-50 overflow-hidden">
                                        {/* User Info Section */}
                                        <div className="p-4 border-b border-gray-700">
                                            <div className="flex items-center gap-3 mb-3">
                                                <UserAvatar 
                                                    src={authenticatedUser?.avatar || user?.avatar} 
                                                    alt="User" 
                                                    size="md"
                                                />
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-semibold text-white truncate">{authenticatedUser?.name || user?.name}</p>
                                                    <p className="text-xs text-gray-400 truncate">{authenticatedUser?.email || user?.id}</p>
                                                </div>
                                            </div>
                                            
                                            {/* Workspace Details */}
                                            <div className="mt-3 pt-3 border-t border-gray-700">
                                                <div className="flex items-center justify-between mb-2">
                                                    <span className="text-xs text-gray-500 uppercase font-bold">Workspace</span>
                                                    {workspaces.length > 0 && (
                                                        <span className="text-[10px] text-gray-500">({workspaces.length} available)</span>
                                                    )}
                                                </div>
                                                <div className="flex items-center justify-between">
                                                    <div className="flex-1 min-w-0">
                                                        {currentWorkspace ? (
                                                            <>
                                                                <p className="text-sm font-medium text-white truncate">{currentWorkspace.workspace_name}</p>
                                                                <div className="flex items-center gap-2 mt-1">
                                                                    {currentWorkspace.workspace_is_general && (
                                                                        <span className="text-[10px] text-blue-400 bg-blue-500/20 px-1.5 py-0.5 rounded">General</span>
                                                                    )}
                                                                    {currentWorkspace.company_name && (
                                                                        <span className="text-xs text-gray-400 truncate">{currentWorkspace.company_name}</span>
                                                                    )}
                                                                    {currentWorkspace.workspace_role && (
                                                                        <span className="text-[10px] text-gray-500 capitalize">({currentWorkspace.workspace_role})</span>
                                                                    )}
                                                                </div>
                                                            </>
                                                        ) : workspaces.length > 0 ? (
                                                            <p className="text-sm font-medium text-yellow-400">Select a workspace</p>
                                                        ) : (
                                                            <p className="text-sm font-medium text-gray-500">No Workspace</p>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                        
                                        {/* Change Workspace Section */}
                                        <div className="p-2">
                                            <div className="mb-2 px-2">
                                                <span className="text-xs text-gray-500 uppercase font-bold">Switch Workspace</span>
                                            </div>
                                            <div className="space-y-1 max-h-48 overflow-y-auto custom-scrollbar">
                                                {workspacesLoading ? (
                                                    <div className="px-3 py-2 text-xs text-gray-400 flex items-center gap-2">
                                                        <i className="fas fa-spinner fa-spin"></i>
                                                        <span>Loading workspaces...</span>
                                                    </div>
                                                ) : workspaces.length === 0 ? (
                                                    <div className="px-3 py-2 text-xs text-gray-400">
                                                        {authStateData.isAuthenticated ? (
                                                            <div>
                                                                <p>No workspaces available</p>
                                                                <p className="text-[10px] text-gray-500 mt-1">Check console logs for workspace data</p>
                                                            </div>
                                                        ) : (
                                                            <p>Please authenticate to see workspaces</p>
                                                        )}
                                                    </div>
                                                ) : (
                                                    workspaces.map((workspace) => (
                                                        <button
                                                            key={workspace.workspace_id}
                                                            onClick={async () => {
                                                                const success = await authState.setCurrentWorkspace(workspace.workspace_id);
                                                                if (success) {
                                                                    setShowUserMenu(false);
                                                                }
                                                            }}
                                                            className={`w-full px-3 py-2.5 rounded-md text-xs font-medium transition-all flex items-center justify-between text-left ${
                                                                String(currentWorkspace?.workspace_id) === String(workspace.workspace_id)
                                                                    ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                                                                    : 'text-gray-300 hover:bg-gray-700'
                                                            }`}
                                                        >
                                                            <div className="flex-1 min-w-0">
                                                                <div className="flex items-center gap-2">
                                                                    <p className="text-sm font-medium truncate">{workspace.workspace_name}</p>
                                                                    {(workspace.workspace_is_general === true || workspace.workspace_is_general === 1) && (
                                                                        <span className="text-[9px] text-blue-400 bg-blue-500/20 px-1 py-0.5 rounded flex-shrink-0">General</span>
                                                                    )}
                                                                </div>
                                                                <div className="flex items-center gap-2 mt-0.5">
                                                                    {workspace.company_name && (
                                                                        <span className="text-[10px] text-gray-500 truncate">{workspace.company_name}</span>
                                                                    )}
                                                                    {workspace.workspace_role && (
                                                                        <span className="text-[10px] text-gray-600 capitalize">• {workspace.workspace_role}</span>
                                                                    )}
                                                                    {(workspace.workspace_is_active === false || workspace.workspace_is_active === 0) && (
                                                                        <span className="text-[10px] text-red-400">• Inactive</span>
                                                                    )}
                                                                </div>
                                                            </div>
                                                            {String(currentWorkspace?.workspace_id) === String(workspace.workspace_id) && (
                                                                <i className="fas fa-check text-[10px] text-blue-400 ml-2 flex-shrink-0"></i>
                                                            )}
                                                        </button>
                                                    ))
                                                )}
                                            </div>
                                        </div>
                                        
                                        {/* Logout Section */}
                                        <div className="p-2 border-t border-gray-700">
                                            <button
                                                onClick={handleLogout}
                                                className="w-full px-3 py-2.5 rounded-md text-xs font-medium transition-all flex items-center gap-2 text-left text-red-400 hover:bg-red-900/20 hover:text-red-300"
                                            >
                                                <i className="fas fa-sign-out-alt text-[10px]"></i>
                                                <span>Logout</span>
                                            </button>
                                            <p className="text-[10px] text-gray-500 mt-2 px-3">
                                                Logout to switch accounts or unlink this device
                                            </p>
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                        <div className="flex flex-col min-w-0 flex-1 sm:flex-initial">
                            <span className="text-xs sm:text-sm font-semibold text-gray-200 leading-tight truncate">{user?.name}</span>
                            <div className="flex items-center gap-1 sm:gap-1.5 flex-wrap">
                                <span className="text-[9px] sm:text-[10px] text-gray-500 uppercase font-bold">{isTimerRunning ? 'Tracking' : 'Idle'}</span>
                                <span className="text-[7px] sm:text-[8px] text-gray-600">•</span>
                                <span className={`text-[9px] sm:text-[10px] uppercase font-bold ${
                                    userStatus === 'working' ? 'text-green-400' :
                                    userStatus === 'break' ? 'text-yellow-400' :
                                    userStatus === 'meeting' ? 'text-blue-400' :
                                    userStatus === 'away' ? 'text-purple-400' :
                                    'text-gray-400'
                                }`}>
                                    {userStatus}
                                </span>
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center gap-1.5 sm:gap-2 w-full sm:w-auto justify-end">
                        {/* Status Button - First */}
                        <div className="relative">
                            <button
                                onClick={() => setShowStatusMenu(!showStatusMenu)}
                                className={`px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg text-[10px] sm:text-xs font-medium transition-all flex items-center gap-1 sm:gap-2 ${
                                    userStatus === 'working' ? 'bg-green-500/20 hover:bg-green-500/30 text-green-400 border border-green-500/30' :
                                    userStatus === 'break' ? 'bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-400 border border-yellow-500/30' :
                                    userStatus === 'meeting' ? 'bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 border border-blue-500/30' :
                                    userStatus === 'away' ? 'bg-purple-500/20 hover:bg-purple-500/30 text-purple-400 border border-purple-500/30' :
                                    'bg-gray-500/20 hover:bg-gray-500/30 text-gray-400 border border-gray-500/30'
                                }`}
                                title={`Status: ${userStatus.charAt(0).toUpperCase() + userStatus.slice(1)}`}
                            >
                                <i className={`fas ${
                                    userStatus === 'working' ? 'fa-briefcase' :
                                    userStatus === 'break' ? 'fa-coffee' :
                                    userStatus === 'meeting' ? 'fa-users' :
                                    userStatus === 'away' ? 'fa-moon' :
                                    'fa-pause-circle'
                                } text-[9px] sm:text-[10px]`}></i>
                                <span className="capitalize hidden sm:inline">{userStatus}</span>
                                <i className="fas fa-chevron-down text-[7px] sm:text-[8px]"></i>
                            </button>
                            
                            {/* Status Dropdown Menu */}
                            {showStatusMenu && (
                                <>
                                    <div 
                                        className="fixed inset-0 z-40" 
                                        onClick={() => setShowStatusMenu(false)}
                                    ></div>
                                    <div className="absolute right-0 top-full mt-2 w-48 bg-gray-800 rounded-lg shadow-xl border border-gray-700 z-50 overflow-hidden">
                                        <div className="p-1">
                                            {/* Idle status - disabled, shown for reference */}
                                            <div className="w-full px-3 py-2 rounded-md text-xs font-medium flex items-center gap-2 text-left opacity-50 cursor-not-allowed bg-gray-500/10 text-gray-500 border border-gray-700/50">
                                                <i className="fas fa-pause-circle text-[10px] w-4"></i>
                                                <span className="capitalize">Idle</span>
                                                {userStatus === 'idle' && (
                                                    <i className="fas fa-check text-[8px] ml-auto"></i>
                                                )}
                                                <span className="text-[8px] text-gray-600 ml-auto">(Auto)</span>
                                            </div>
                                            
                                            {/* Working status - disabled, only active when timer is running */}
                                            <div className={`w-full px-3 py-2 rounded-md text-xs font-medium flex items-center gap-2 text-left ${
                                                isTimerRunning && userStatus === 'working'
                                                    ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                                                    : 'opacity-50 cursor-not-allowed bg-gray-500/10 text-gray-500 border border-gray-700/50'
                                            }`}>
                                                <i className="fas fa-briefcase text-[10px] w-4"></i>
                                                <span className="capitalize">Working</span>
                                                {isTimerRunning && userStatus === 'working' && (
                                                    <i className="fas fa-check text-[8px] ml-auto"></i>
                                                )}
                                                <span className="text-[8px] text-gray-600 ml-auto">(Auto)</span>
                                            </div>
                                            
                                            {/* Selectable statuses - only break, meeting, away */}
                                            {(['break', 'meeting', 'away'] as UserStatus[]).map((status) => (
                                                <button
                                                    key={status}
                                                    onClick={async () => {
                                                        // If changing to non-working status and timer is running, pause it first
                                                        if (isTimerRunning) {
                                                            await toggleTimer();
                                                            // Wait a moment for the task to stop and save
                                                            await new Promise(resolve => setTimeout(resolve, 300));
                                                        }
                                                        setUserStatus(status);
                                                        setShowStatusMenu(false);
                                                    }}
                                                    className={`w-full px-3 py-2 rounded-md text-xs font-medium transition-all flex items-center gap-2 text-left ${
                                                        userStatus === status
                                                            ? status === 'break' ? 'bg-yellow-500/20 text-yellow-400' :
                                                              status === 'meeting' ? 'bg-blue-500/20 text-blue-400' :
                                                              'bg-purple-500/20 text-purple-400'
                                                            : 'text-gray-300 hover:bg-gray-700'
                                                    }`}
                                                >
                                                    <i className={`fas ${
                                                        status === 'break' ? 'fa-coffee' :
                                                        status === 'meeting' ? 'fa-users' :
                                                        'fa-moon'
                                                    } text-[10px] w-4`}></i>
                                                    <span className="capitalize">{status}</span>
                                                    {userStatus === status && (
                                                        <i className="fas fa-check text-[8px] ml-auto"></i>
                                                    )}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                        
                        {/* Combined Insights Button - Second */}
                        <button 
                            onClick={() => setShowCombinedInsights(true)}
                            className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-blue-900/30 hover:bg-blue-900/50 text-blue-400 flex items-center justify-center transition-colors"
                            title="Combined Insights"
                        >
                            <i className="fas fa-chart-pie text-[10px] sm:text-xs"></i>
                        </button>
                        
                        {/* Productivity Insights Button - Third */}
                        <button 
                            onClick={() => {
                                setInsightsTaskFilter(undefined); // Clear filter to show all
                                setInsightsProjectFilter(undefined);
                                setView(AppView.INSIGHTS);
                            }}
                            className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-blue-900/30 hover:bg-blue-900/50 text-blue-400 flex items-center justify-center transition-colors relative"
                            title="Productivity Insights"
                        >
                             <i className="fas fa-chart-bar text-[10px] sm:text-xs"></i>
                             {activityLogs.length > 0 && <span className="absolute top-0 right-0 w-1.5 h-1.5 sm:w-2 sm:h-2 bg-red-500 rounded-full"></span>}
                        </button>
                        
                        {/* Settings Button - Fourth */}
                        <button 
                            onClick={() => setView(AppView.SETTINGS)}
                            className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-gray-700 hover:bg-gray-600 text-gray-300 flex items-center justify-center transition-colors"
                            title="Settings"
                        >
                            <i className="fas fa-cog text-[10px] sm:text-xs"></i>
                        </button>
                        
                        {/* Sync Button */}
                        {user?.isCheckedIn && (
                            <button 
                                onClick={async () => {
                                    console.log('[SYNC BUTTON] 🔵 Sync button clicked!');
                                    console.log('[SYNC BUTTON] 📋 uploadAllTrackingFiles function exists:', typeof uploadAllTrackingFiles);
                                    try {
                                        console.log('[SYNC BUTTON] 🚀 Calling uploadAllTrackingFiles(true)...');
                                        await uploadAllTrackingFiles(true);
                                        console.log('[SYNC BUTTON] ✅ uploadAllTrackingFiles completed');
                                    } catch (error: any) {
                                        console.error('[SYNC BUTTON] ❌ Error calling uploadAllTrackingFiles:', error);
                                        console.error('[SYNC BUTTON] 📋 Error details:', {
                                            message: error.message,
                                            stack: error.stack,
                                            name: error.name,
                                        });
                                        setSyncStatus('error');
                                        setSyncMessage(error.message || 'Sync failed');
                                        setIsSyncing(false);
                                    }
                                }}
                                disabled={isSyncing}
                                className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center transition-colors relative ${
                                    isSyncing 
                                        ? 'bg-blue-900/50 text-blue-400 cursor-not-allowed' 
                                        : syncStatus === 'success'
                                        ? 'bg-green-900/30 hover:bg-green-900/50 text-green-400'
                                        : syncStatus === 'error'
                                        ? 'bg-red-900/30 hover:bg-red-900/50 text-red-400'
                                        : 'bg-blue-900/30 hover:bg-blue-900/50 text-blue-400'
                                }`}
                                title={
                                    isSyncing 
                                        ? 'Syncing...' 
                                        : syncStatus === 'success' && lastSyncTime
                                        ? `Last synced: ${lastSyncTime.toLocaleTimeString()}`
                                        : syncStatus === 'error'
                                        ? syncMessage || 'Sync failed'
                                        : 'Sync tracking data to server'
                                }
                            >
                                {isSyncing ? (
                                    <i className="fas fa-spinner fa-spin text-[10px] sm:text-xs"></i>
                                ) : (
                                    <i className="fas fa-sync-alt text-[10px] sm:text-xs"></i>
                                )}
                                {syncStatus === 'success' && !isSyncing && (
                                    <div className="absolute -top-1 -right-1 w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                                )}
                            </button>
                        )}
                        
                        {/* Check In/Out Button */}
                        {user?.isCheckedIn ? (
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
                                className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-red-900/30 hover:bg-red-900/50 text-red-400 flex items-center justify-center transition-colors"
                                title="Check Out"
                            >
                                <i className="fas fa-power-off text-[10px] sm:text-xs"></i>
                            </button>
                        ) : (
                            <button 
                                onClick={() => {
                                    setView(AppView.CHECK_IN_OUT);
                                }}
                                className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-green-900/30 hover:bg-green-900/50 text-green-400 flex items-center justify-center transition-colors"
                                title="Check In"
                            >
                                <i className="fas fa-sign-in-alt text-[10px] sm:text-xs"></i>
                            </button>
                        )}
                    </div>
                </header>

                {/* Main Content */}
                <main className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-6 custom-scrollbar">
                    
                    {/* Timer Widget */}
                    <div className="bg-gradient-to-br from-gray-800 to-gray-850 rounded-xl p-4 sm:p-5 md:p-6 shadow-lg mb-4 sm:mb-6 border border-gray-700/50 relative overflow-hidden max-w-6xl mx-auto">
                        {/* Glow effect when running */}
                        {isTimerRunning && <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 via-purple-500 to-blue-500 animate-gradient"></div>}
                        
                        {/* Show loading state while fetching projects/tasks after check-in */}
                        {(projectsLoading || tasksLoading) && !isTimerRunning && !selectedProjectId ? (
                            <div className="max-w-5xl mx-auto w-full py-12">
                                <div className="text-center">
                                    <i className="fas fa-spinner fa-spin text-4xl text-blue-400 mb-4 block"></i>
                                    <p className="text-gray-300 text-sm sm:text-base">Loading projects and tasks...</p>
                                    <p className="text-gray-500 text-xs mt-2">Please wait while we fetch your data</p>
                                </div>
                            </div>
                        ) : !isTimerRunning && !selectedProjectId && (
                            /* Step 1: Project Selection with Resume Option */
                            <div className="max-w-5xl mx-auto w-full">
                                {/* Resume Last Task Section */}
                                {(() => {
                                    // Get the most recent time entry with a task
                                    const lastEntry = timeEntries.find(e => e.taskId);
                                    const lastTask = lastEntry?.taskId ? tasks.find(t => t.id === lastEntry.taskId) : null;
                                    const lastProject = lastEntry ? projects.find(p => p.id === lastEntry.projectId) : null;
                                    
                                    // Get unique recent tasks from today's entries
                                    const today = new Date();
                                    today.setHours(0, 0, 0, 0);
                                    const recentEntries = timeEntries
                                        .filter(e => e.startTime >= today && e.taskId)
                                        .slice(0, 3); // Last 3 unique tasks
                                    
                                    const recentTasks = recentEntries
                                        .map(e => {
                                            const task = tasks.find(t => t.id === e.taskId);
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
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[400px] overflow-y-auto custom-scrollbar">
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
                                                        className="p-4 rounded-lg border border-gray-700 hover:border-gray-600 bg-gray-900/50 hover:bg-gray-900 transition-all text-left group"
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
                                    <h3 className="text-white text-xs sm:text-sm font-semibold mb-2 sm:mb-3">Select Project</h3>
                                    {projectsLoading ? (
                                        <div className="text-center py-8 text-gray-400">
                                            <i className="fas fa-spinner fa-spin text-2xl mb-2 block"></i>
                                            <span className="text-xs">Loading projects...</span>
                                        </div>
                                    ) : projects.length === 0 ? (
                                        <div className="text-center py-8 text-gray-400">
                                            <i className="fas fa-folder-open text-2xl mb-2 block opacity-50"></i>
                                            <span className="text-xs">No projects available</span>
                                            <button
                                                onClick={() => {
                                                    const workspaceId = currentWorkspace?.workspace_id?.toString() || authState.getCurrentWorkspace()?.workspace_id?.toString();
                                                    if (workspaceId) {
                                                        fetchProjects(workspaceId);
                                                        fetchTasks(undefined, workspaceId);
                                                    }
                                                }}
                                                className="mt-3 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded-lg transition-colors"
                                            >
                                                <i className="fas fa-sync-alt mr-2"></i>
                                                Refresh Projects
                                            </button>
                                        </div>
                                    ) : (
                                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2 sm:gap-3">
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
                                    )}
                                </div>
                            </div>
                        )}

                        {!isTimerRunning && selectedProjectId && showTaskSelection && (
                            /* Step 2: Task Selection */
                            <div className="max-w-5xl mx-auto w-full">
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
                            <div className="max-w-4xl mx-auto w-full">
                                <div className="mb-3 sm:mb-4">
                                    <div className="flex items-center gap-2 mb-2">
                                        <span 
                                            className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full flex-shrink-0" 
                                            style={{ background: projects.find(p => p.id === selectedProjectId)?.color || '#60A5FA' }}
                                        ></span>
                                        <span className="text-gray-400 text-[10px] sm:text-xs truncate">
                                            {projects.find(p => p.id === selectedProjectId)?.name}
                                        </span>
                                    </div>
                                    <p className="text-white text-sm sm:text-base font-medium mb-1 truncate">
                                        {(() => {
                                            const task = tasks.find(t => t.id === selectedTaskId);
                                            return task?.name || description || 'No task selected';
                                        })()}
                                    </p>
                                    {(() => {
                                        const task = tasks.find(t => t.id === selectedTaskId);
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
                                
                                <div className="flex justify-between items-center mb-3 sm:mb-4 gap-2">
                                    <button
                                        onClick={() => {
                                            if (!isTimerRunning) {
                                                setSelectedProjectId('');
                                                setSelectedTaskId('');
                                                setDescription('');
                                                setShowTaskSelection(false);
                                            }
                                        }}
                                        className="text-gray-400 hover:text-white text-[10px] sm:text-xs transition-colors flex-shrink-0"
                                        disabled={isTimerRunning}
                                    >
                                        {!isTimerRunning && <><i className="fas fa-arrow-left mr-1"></i> <span className="hidden sm:inline">Change</span></>}
                                    </button>
                                    <div className="text-2xl sm:text-3xl md:text-4xl font-mono text-white tracking-widest font-light text-center flex-1">
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
                                    className={`w-full py-2.5 sm:py-3 rounded-lg font-bold text-white shadow-lg transition-all active:scale-95 flex justify-center items-center gap-2 text-sm sm:text-base ${
                                        isTimerRunning 
                                        ? 'bg-red-500 hover:bg-red-600 shadow-red-500/20' 
                                        : 'bg-blue-600 hover:bg-blue-500 shadow-blue-500/20'
                                    }`}
                                >
                                    {isTimerRunning ? (
                                        <><i className="fas fa-stop text-xs sm:text-sm"></i> <span>STOP</span></>
                                    ) : (
                                        <><i className="fas fa-play text-xs sm:text-sm"></i> <span>{(() => {
                                            if (!selectedTaskId) return 'START';
                                            const accumulated = taskAccumulatedTime[selectedTaskId] || 0;
                                            return accumulated > 0 ? 'RESUME' : 'START';
                                        })()}</span></>
                                    )}
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Time Entries List */}
                    <div>
                        <h3 className="text-gray-400 text-[10px] sm:text-xs font-bold uppercase tracking-wider mb-3 sm:mb-4">Today</h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4 pb-4">
                            {timeEntries.length === 0 && (
                                <div className="col-span-full text-center py-12 text-gray-600 bg-gray-900/50 rounded-lg border border-gray-800 border-dashed">
                                    <i className="far fa-clock text-3xl mb-3 block opacity-50"></i>
                                    <span className="text-sm">No entries yet. Start tracking!</span>
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
                                    const task = group.taskId ? tasks.find(t => t.id === group.taskId) : null;
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
                                            className={`bg-gray-800 rounded-lg p-3 sm:p-4 border-l-4 border-gray-700 group hover:bg-gray-750 transition-colors ${
                                                isCurrentlyRunning ? 'ring-2 ring-blue-500/50' : ''
                                            }`}
                                            style={{ borderLeftColor: project?.color }}
                                        >
                                            <div className="flex flex-col sm:flex-row justify-between items-start gap-2 sm:gap-3">
                                                <div className="flex-1 overflow-hidden min-w-0 w-full sm:w-auto">
                                                    <div className="flex items-center gap-2">
                                                        <p className="text-white text-xs sm:text-sm font-medium truncate">
                                                            {task?.name || group.description}
                                                        </p>
                                                        {isCurrentlyRunning && (
                                                            <span className="flex-shrink-0 w-1.5 h-1.5 sm:w-2 sm:h-2 bg-green-500 rounded-full animate-pulse" title="Running"></span>
                                                        )}
                                                    </div>
                                                    <p className="text-gray-500 text-[10px] sm:text-xs flex items-center gap-1 mt-1 flex-wrap">
                                                        <span className="w-1 h-1 sm:w-1.5 sm:h-1.5 rounded-full flex-shrink-0" style={{ background: project?.color }}></span>
                                                        <span className="truncate">{project?.name}</span>
                                                        {task && task.name !== group.description && (
                                                            <span className="text-gray-600 hidden sm:inline">• {task.name}</span>
                                                        )}
                                                        {group.entries.length > 1 && (
                                                            <span className="text-gray-600">• {group.entries.length} sessions</span>
                                                        )}
                                                    </p>
                                                </div>
                                                <div className="flex flex-row sm:flex-col items-center sm:items-end gap-2 sm:gap-2 w-full sm:w-auto justify-between sm:justify-end">
                                                    <div className="text-left sm:text-right whitespace-nowrap">
                                                        <div className={`font-mono text-xs sm:text-sm ${isCurrentlyRunning ? 'text-green-400' : 'text-white'}`}>
                                                            {formatTime(displayTime)}
                                                        </div>
                                                        {group.lastEndTime && !isCurrentlyRunning && (
                                                            <div className="text-gray-600 text-[9px] sm:text-[10px]">
                                                                {group.lastStartTime.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} - {group.lastEndTime.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                                            </div>
                                                        )}
                                                        {!group.lastEndTime && !isCurrentlyRunning && (
                                                            <div className="text-gray-600 text-[9px] sm:text-[10px]">
                                                                Started {group.lastStartTime.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                                            </div>
                                                        )}
                                                        {isCurrentlyRunning && (
                                                            <div className="text-green-400 text-[9px] sm:text-[10px] flex items-center gap-1">
                                                                <i className="fas fa-circle text-[5px] sm:text-[6px]"></i>
                                                                <span>Started {group.lastStartTime.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                                                            </div>
                                                        )}
                                                    </div>
                                                    {group.taskId && (
                                                        <div className="flex gap-1.5 sm:gap-2">
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
                                                                className="px-2 sm:px-2.5 py-1 sm:py-1.5 rounded-lg text-[10px] sm:text-xs font-medium transition-all flex items-center gap-1 sm:gap-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300"
                                                                title="View Report"
                                                            >
                                                                <i className="fas fa-chart-line text-[9px] sm:text-[10px]"></i>
                                                                <span className="hidden sm:inline">Report</span>
                                                            </button>
                                                            <button
                                                                onClick={async () => {
                                                                    if (!isTimerRunning) {
                                                                        setSelectedProjectId(group.projectId);
                                                                        setSelectedTaskId(group.taskId!);
                                                                        setDescription(task?.name || group.description);
                                                                        setShowTaskSelection(false);
                                                                        // Auto-start timer
                                                                        if (userConsent === true) {
                                                                            // Set status to working when starting task
                                                                            setUserStatus('working');
                                                                            // Load accumulated time
                                                                            const accumulated = taskAccumulatedTime[group.taskId] || 0;
                                                                            setElapsedSeconds(accumulated);
                                                                            setStartTime(Date.now());
                                                                            setIsTimerRunning(true);
                                                                        }
                                                                    }
                                                                }}
                                                                disabled={isTimerRunning}
                                                                className={`px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg text-[10px] sm:text-xs font-medium transition-all flex items-center gap-1 sm:gap-1.5 ${
                                                                    isCurrentlySelected
                                                                        ? 'bg-blue-600 hover:bg-blue-500 text-white'
                                                                        : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                                                                } ${isTimerRunning ? 'opacity-50 cursor-not-allowed' : ''}`}
                                                            >
                                                                <i className={`fas ${displayTime > 0 ? 'fa-redo' : 'fa-play'} text-[9px] sm:text-[10px]`}></i>
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

    // Expose API test function to browser console for testing
    useEffect(() => {
        if (typeof window !== 'undefined') {
            (window as any).testAPIs = async () => {
                console.log('🧪 Testing All APIs...');
                console.log('='.repeat(60));
                
                // Test Projects API
                console.log('\n📋 Testing Projects API...');
                try {
                    const workspaceId = currentWorkspace?.workspace_id?.toString();
                    const projectsResponse = await apiService.getProjects({ workspace_id: workspaceId });
                    if (projectsResponse.success) {
                        console.log(`✅ GET /api/vue/backend/v1/projects - Success (${projectsResponse.data?.length || 0} projects)`);
                    } else {
                        console.log(`❌ GET /api/vue/backend/v1/projects - Failed: ${projectsResponse.error}`);
                    }
                } catch (error: any) {
                    console.log(`❌ GET /api/vue/backend/v1/projects - Error: ${error.message}`);
                }
                
                // Test Tasks API
                console.log('\n📝 Testing Tasks API...');
                try {
                    const workspaceId = currentWorkspace?.workspace_id?.toString();
                    const tasksResponse = await apiService.getTasks({ workspace_id: workspaceId });
                    if (tasksResponse.success) {
                        console.log(`✅ GET /api/vue/backend/v1/tasks - Success (${tasksResponse.data?.length || 0} tasks)`);
                    } else {
                        console.log(`❌ GET /api/vue/backend/v1/tasks - Failed: ${tasksResponse.error}`);
                    }
                } catch (error: any) {
                    console.log(`❌ GET /api/vue/backend/v1/tasks - Error: ${error.message}`);
                }
                
                // Test Status Management API
                console.log('\n🔄 Testing Status Management API...');
                try {
                    const currentStatusResponse = await apiService.getCurrentStatus();
                    if (currentStatusResponse.success) {
                        const status = currentStatusResponse.data?.status || 'No active status';
                        console.log(`✅ GET /api/vue/backend/v1/status/current - Success (Status: ${status})`);
                    } else {
                        console.log(`❌ GET /api/vue/backend/v1/status/current - Failed: ${currentStatusResponse.error}`);
                    }
                } catch (error: any) {
                    console.log(`❌ GET /api/vue/backend/v1/status/current - Error: ${error.message}`);
                }
                
                try {
                    const statusHistoryResponse = await apiService.getStatusHistory({
                        start_date: '2025-01-01',
                        end_date: new Date().toISOString().split('T')[0],
                    });
                    if (statusHistoryResponse.success) {
                        console.log(`✅ GET /api/vue/backend/v1/status/history - Success (${statusHistoryResponse.data?.length || 0} records)`);
                    } else {
                        console.log(`❌ GET /api/vue/backend/v1/status/history - Failed: ${statusHistoryResponse.error}`);
                    }
                } catch (error: any) {
                    console.log(`❌ GET /api/vue/backend/v1/status/history - Error: ${error.message}`);
                }
                
                // Test Tracking Data API
                console.log('\n📊 Testing Tracking Data API...');
                if (tasks.length > 0 && projects.length > 0) {
                    const testProject = projects[0];
                    const testTask = tasks.find(t => t.projectId === testProject.id) || tasks[0];
                    
                    if (testTask) {
                        try {
                            const trackingListResponse = await apiService.listTrackingData({
                                project_id: testTask.projectId,
                                task_id: testTask.id,
                            });
                            if (trackingListResponse.success) {
                                console.log(`✅ GET /api/vue/backend/v1/tracking-data - Success (${trackingListResponse.data?.length || 0} records)`);
                            } else {
                                console.log(`⚠️  GET /api/vue/backend/v1/tracking-data - Failed: ${trackingListResponse.error} (may need valid data)`);
                            }
                        } catch (error: any) {
                            console.log(`❌ GET /api/vue/backend/v1/tracking-data - Error: ${error.message}`);
                        }
                    }
                } else {
                    console.log('⚠️  Skipping tracking data tests - no projects/tasks loaded');
                }
                
                console.log('\n' + '='.repeat(60));
                console.log('✅ API Testing Complete!');
                console.log('💡 Check the results above for each API endpoint.');
            };
            
            console.log('💡 To test all APIs, run: testAPIs()');
        }
    }, [currentWorkspace, projects, tasks]);
};

export default App;