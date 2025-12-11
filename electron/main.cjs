const { app, BrowserWindow, ipcMain, desktopCapturer, nativeImage, globalShortcut, Tray, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);
const isDev = process.env.NODE_ENV === 'development';

// Generate UUID v4
const generateUUID = () => {
  return crypto.randomUUID ? crypto.randomUUID() : 
    'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
};

// Electron Store for persistent settings (ES module - needs dynamic import)
let store = null;
const initStore = async () => {
  if (!store) {
    const StoreModule = await import('electron-store');
    const Store = StoreModule.default;
    store = new Store({
      defaults: {
        userConsent: null, // null = not asked, true = consented, false = declined
        consentRemembered: false,
        settings: {
          enableScreenshots: true,
          enableUrlTracking: true,
          enableScreenshotBlur: false,
          idleTimeThreshold: 5, // minutes
        }
      }
    });
  }
  return store;
};

// System-wide tracking libraries
let uIOhook = null;
let UiohookKey = null;
let isUiohookInitialized = false;

// Helper function to get active-win (ES module, needs dynamic import)
let activeWinModule = null;
let useActiveWin = true; // Try active-win first, fallback to PowerShell if it fails

const getActiveWindow = async () => {
  if (useActiveWin) {
    try {
      if (!activeWinModule) {
        // active-win v9.0.0 uses named exports, not default export
        const module = await import('active-win');
        activeWinModule = module.activeWindow; // Named export: activeWindow
      }
      if (typeof activeWinModule !== 'function') {
        throw new Error('activeWindow is not a function');
      }
      const win = await activeWinModule();
      return win;
    } catch (error) {
      console.error('Failed to use active-win, falling back to PowerShell:', error.message);
      useActiveWin = false;
      activeWinModule = null;
      return null;
    }
  }
  return null;
};

// Windows-native PowerShell fallback to get active window
const getActiveWindowWindows = async () => {
  try {
    const tmpDir = os.tmpdir();
    const scriptPath = path.join(tmpDir, `get-active-window-${Date.now()}.ps1`);
    
    // Create a simpler PowerShell script that avoids here-string issues
    const psScript = `Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public class Win32 {
  [DllImport("user32.dll")]
  public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
  public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);
  [DllImport("user32.dll", SetLastError = true)]
  public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);
}
'@
$hwnd = [Win32]::GetForegroundWindow()
if ($hwnd -eq [IntPtr]::Zero) { exit 1 }
$title = New-Object System.Text.StringBuilder 256
[Win32]::GetWindowText($hwnd, $title, $title.Capacity) | Out-Null
$processId = 0
[Win32]::GetWindowThreadProcessId($hwnd, [ref]$processId) | Out-Null
$process = Get-Process -Id $processId -ErrorAction SilentlyContinue
$processName = if ($process) { $process.ProcessName } else { "Unknown" }
$result = @{
  Title = $title.ToString()
  ProcessName = $processName
} | ConvertTo-Json -Compress
Write-Output $result`;

    // Write script to temporary file
    fs.writeFileSync(scriptPath, psScript, 'utf8');

    try {
      // Execute the script file instead of encoded command
      const { stdout, stderr } = await execAsync(
        `powershell -NoProfile -ExecutionPolicy Bypass -File "${scriptPath}"`,
        { timeout: 3000, maxBuffer: 1024 * 1024, encoding: 'utf8' }
      );
      
      // Clean up script file
      try {
        fs.unlinkSync(scriptPath);
      } catch (cleanupError) {
        // Ignore cleanup errors
      }

      if (stderr && stderr.trim() && !stderr.includes('Warning')) {
        console.warn('PowerShell stderr:', stderr);
      }

      const output = stdout.trim();
      if (!output) {
        return null;
      }

      const result = JSON.parse(output);
      return {
        title: result.Title || 'Unknown',
        owner: result.ProcessName || 'Unknown',
        url: null, // PowerShell can't get URL, only window title
        app: result.ProcessName || 'Unknown'
      };
    } catch (execError) {
      // Clean up script file on error
      try {
        fs.unlinkSync(scriptPath);
      } catch (cleanupError) {
        // Ignore cleanup errors
      }
      throw execError;
    }
  } catch (error) {
    // Only log if it's not a silent failure
    if (error.code !== 'ENOENT' && !error.message.includes('Command failed')) {
      console.error('Error getting active window via PowerShell:', error.message);
    }
    return null;
  }
};

let mainWindow;
let tray = null;
let activityMonitoringInterval = null;
let allWindowsUpdateInterval = null; // Separate interval for sending all windows
let keystrokeCount = 0; // Global counter (for idle detection)
let mouseClickCount = 0; // Global counter (for idle detection)
let lastActiveWindow = null;
let isQuitting = false;
let isTrackingActive = false;
let lastActivityTimestamp = null; // Track last mouse/keyboard activity for idle detection

// Per-window tracking: store clicks and keystrokes for each window
let perWindowStats = new Map(); // Map<windowKey, { keystrokes: number, clicks: number, startTime: number, title: string, url: string | null, lastSeen: number, urlHistory: Array<{url: string | null, title: string, timestamp: number}> }>
let currentWindowKey = null; // Track current window identifier

// Enhanced per-task tracking: store all tracking data for each task
let perTaskTracking = new Map(); // Map<taskKey, TaskTrackingData>
let currentTaskId = null; // Track current task ID
let currentProjectId = null; // Track current project ID
let taskMetadata = new Map(); // Map<taskKey, { taskName: string, projectName: string }>
let taskFilePaths = new Map(); // Map<taskKey, filePath> - Track file path for each task

// Real-time save management: debounced saves to avoid too many file writes
let saveTimers = new Map(); // Map<taskKey, NodeJS.Timeout>
const SAVE_DEBOUNCE_MS = 2000; // Save 2 seconds after last change (real-time feel)

// TaskTrackingData structure
// {
//   taskId: string,
//   projectId: string,
//   startTime: number,  // Current session start time
//   keystrokes: number,  // Cumulative for current session (will be added to total)
//   mouseClicks: number,  // Cumulative for current session (will be added to total)
//   activeWindows: Map<windowKey, WindowStats>,  // Per-window stats within task
//   urlHistory: Array<{url: string, title: string, timestamp: number}>,
//   screenshots: Array<{id: string, timestamp: number, dataUrl: string, isBlurred: boolean}>,
//   webcamPhotos: Array<{id: string, timestamp: number, dataUrl: string}>,
//   activityLogs: Array<ActivityLog>
// }

// Helper to create a unique key for a task
const getTaskKey = (projectId, taskId) => {
  if (!taskId) return null; // No task key if no taskId
  return `${projectId || 'unknown'}:${taskId}`;
};

// Get or create enhanced tracking data for a task
// IMPORTANT: ONE FILE PER TASK - loads existing data and merges with new session
const getTaskTrackingData = (projectId, taskId, loadExisting = true) => {
  if (!taskId) return null; // No task tracking if no taskId
  
  const taskKey = getTaskKey(projectId, taskId);
  if (!taskKey) return null;
  
  // If task tracking doesn't exist in memory, try to load from file
  if (!perTaskTracking.has(taskKey) && loadExisting) {
    const existingData = loadTaskTrackingDataFromFile(projectId, taskId);
    
    if (existingData && existingData.trackingData) {
      // Load existing data and merge with new session
      const activeWindowsMap = new Map();
      if (existingData.trackingData.activeWindows) {
        existingData.trackingData.activeWindows.forEach(item => {
          const { windowKey, ...stats } = item;
          activeWindowsMap.set(windowKey, stats);
        });
      }
      
      // Merge existing window data properly
      const mergedWindowsMap = new Map();
      if (existingData.trackingData.activeWindows) {
        existingData.trackingData.activeWindows.forEach(item => {
          const { windowKey, ...stats } = item;
          mergedWindowsMap.set(windowKey, {
            ...stats,
            timeCapsules: stats.timeCapsules || [], // Load existing time capsules
            startTime: null, // Will be set when window becomes active (don't restore from saved)
            lastSeen: stats.lastSeen || Date.now(),
            urls: stats.urls || [],
            lastUrl: stats.lastUrl || null
          });
        });
      }
      
      // Track what was last saved for each window to prevent double-counting
      const lastSavedWindowData = new Map();
      if (existingData.trackingData.activeWindows) {
        existingData.trackingData.activeWindows.forEach(item => {
          const { windowKey, ...stats } = item;
          lastSavedWindowData.set(windowKey, {
            keystrokes: stats.keystrokes || 0,
            mouseClicks: stats.mouseClicks || 0
          });
        });
      }
      
      perTaskTracking.set(taskKey, {
        taskId: taskId,
        projectId: projectId || 'unknown',
        startTime: Date.now(), // New session start time
        keystrokes: 0, // Reset for new session (will accumulate)
        mouseClicks: 0, // Reset for new session (will accumulate)
        activeWindows: mergedWindowsMap, // Load existing window stats
        urlHistory: existingData.trackingData.urlHistory || [],
        screenshots: existingData.trackingData.screenshots || [],
        webcamPhotos: existingData.trackingData.webcamPhotos || [],
        activityLogs: existingData.trackingData.activityLogs || [],
        createdAt: existingData.metadata.createdAt, // Keep original creation date
        totalKeystrokes: existingData.trackingData.summary?.totalKeystrokes || 0, // Cumulative total
        totalMouseClicks: existingData.trackingData.summary?.totalMouseClicks || 0, // Cumulative total
        lastSavedWindowData: lastSavedWindowData, // Track what was last saved to prevent double-counting
        lastSavedKeystrokes: existingData.trackingData.summary?.currentSessionKeystrokes || 0, // Track last saved session data
        lastSavedMouseClicks: existingData.trackingData.summary?.currentSessionMouseClicks || 0
      });
      
      console.log(`[TASK-LOAD] ✅ Loaded existing data for task ${taskId}: ${existingData.trackingData.activityLogs?.length || 0} logs, ${existingData.trackingData.screenshots?.length || 0} screenshots`);
    } else {
      // No existing file, create fresh tracking data
      perTaskTracking.set(taskKey, {
        taskId: taskId,
        projectId: projectId || 'unknown',
        startTime: Date.now(),
        createdAt: new Date().toISOString(),
        keystrokes: 0,
        mouseClicks: 0,
        activeWindows: new Map(),
        urlHistory: [],
        screenshots: [],
        webcamPhotos: [],
        activityLogs: [],
        totalKeystrokes: 0,
        totalMouseClicks: 0,
        lastSavedWindowData: new Map(), // Track what was last saved to prevent double-counting
        lastSavedKeystrokes: 0,
        lastSavedMouseClicks: 0
      });
      
      console.log(`[TASK-NEW] ✅ Created new tracking data for task ${taskId}`);
    }
    
    // Store file path for this task
    taskFilePaths.set(taskKey, getTaskDataPath(projectId, taskId));
  } else if (!perTaskTracking.has(taskKey)) {
    // Create fresh if loadExisting is false
    perTaskTracking.set(taskKey, {
      taskId: taskId,
      projectId: projectId || 'unknown',
      startTime: Date.now(),
      createdAt: new Date().toISOString(),
      keystrokes: 0,
      mouseClicks: 0,
      activeWindows: new Map(),
      urlHistory: [],
      screenshots: [],
      webcamPhotos: [],
      activityLogs: [],
      totalKeystrokes: 0,
      totalMouseClicks: 0
    });
    
    taskFilePaths.set(taskKey, getTaskDataPath(projectId, taskId));
  }
  
  return perTaskTracking.get(taskKey);
};

// Legacy function for backward compatibility
const getTaskStats = (projectId, taskId) => {
  const taskData = getTaskTrackingData(projectId, taskId);
  if (!taskData) return null;
  
  return {
    keystrokes: taskData.keystrokes,
    clicks: taskData.mouseClicks,
    startTime: taskData.startTime,
    projectId: taskData.projectId,
    taskId: taskData.taskId
  };
};

// Helper to normalize URLs to prevent duplicates
// Normalizes: www, https/http, case, trailing slashes
const normalizeUrl = (url) => {
  if (!url) return null;
  
  try {
    // Remove whitespace
    let normalized = url.trim();
    
    // If it doesn't start with http:// or https://, add https://
    if (!normalized.match(/^https?:\/\//i)) {
      normalized = `https://${normalized}`;
    }
    
    // Parse URL to normalize properly
    const urlObj = new URL(normalized);
    
    // Normalize hostname: lowercase and remove www.
    let hostname = urlObj.hostname.toLowerCase();
    if (hostname.startsWith('www.')) {
      hostname = hostname.substring(4);
    }
    
    // Rebuild URL with normalized hostname
    // Keep pathname and search params as-is (they're part of the URL identity)
    const pathname = urlObj.pathname;
    const search = urlObj.search || '';
    
    // Reconstruct with normalized hostname
    // Only normalize the domain part, keep path and query as-is
    return `https://${hostname}${pathname}${search}`;
  } catch (error) {
    // If URL parsing fails, try simple normalization
    let normalized = url.trim().toLowerCase();
    if (normalized.startsWith('www.')) {
      normalized = normalized.substring(4);
    }
    if (!normalized.startsWith('http://') && !normalized.startsWith('https://')) {
      normalized = `https://${normalized}`;
    }
    return normalized;
  }
};

// ==================== JSON File Storage Functions ====================

// Get path for task tracking data file - ONE FILE PER TASK (not per session)
// Files are saved in project directory: {projectRoot}/tracking-data/{workspaceId}/{date}/{projectId}/{taskId}.json
const getTaskDataPath = (projectId, taskId, workspaceId = 'default') => {
  // Get project root directory (one level up from electron folder)
  const projectRoot = path.join(__dirname, '..');
  
  // Get today's date in YYYY-MM-DD format
  const today = new Date();
  const dateStr = today.toISOString().split('T')[0]; // YYYY-MM-DD
  
  // New structure: workspace_id/YYYY-MM-DD/project_id/taskid.json
  const dataDir = path.join(projectRoot, 'tracking-data', workspaceId, dateStr, projectId || 'unknown');
  
  // Create directory if it doesn't exist
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
    if (isDev) {
      console.log(`[TASK-PATH] Created tracking-data directory: ${dataDir}`);
    }
  }
  
  // ONE FILE PER TASK - use taskId as filename
  return path.join(dataDir, `${taskId}.json`);
};

// Helper function to recursively find all task JSON files in new structure
// Supports: workspace_id/date/project_id/taskid.json
// Also supports backward compatibility with old structure: project_id/taskid.json
const findAllTaskFiles = (trackingDataPath) => {
  const taskFiles = [];
  
  if (!fs.existsSync(trackingDataPath)) {
    return taskFiles;
  }
  
  try {
    // Get all items in tracking-data directory
    const items = fs.readdirSync(trackingDataPath);
    
    for (const item of items) {
      const itemPath = path.join(trackingDataPath, item);
      const stat = fs.statSync(itemPath);
      
      if (stat.isDirectory()) {
        // Check if this is old structure (project_id directly) or new structure (workspace_id)
        const subItems = fs.readdirSync(itemPath);
        let isOldStructure = false;
        
        // Check if any subitem is a JSON file (old structure: project_id/taskid.json)
        for (const subItem of subItems) {
          const subItemPath = path.join(itemPath, subItem);
          if (fs.statSync(subItemPath).isFile() && subItem.endsWith('.json')) {
            isOldStructure = true;
            taskFiles.push({
              filePath: subItemPath,
              projectId: item,
              taskId: subItem.replace('.json', ''),
              workspaceId: null,
              date: null
            });
          }
        }
        
        // If not old structure, it's new structure: workspace_id/date/project_id/taskid.json
        if (!isOldStructure) {
          for (const dateItem of subItems) {
            const datePath = path.join(itemPath, dateItem);
            if (fs.statSync(datePath).isDirectory()) {
              // This is a date directory
              const dateSubItems = fs.readdirSync(datePath);
              for (const projItem of dateSubItems) {
                const projPath = path.join(datePath, projItem);
                if (fs.statSync(projPath).isDirectory()) {
                  // This is a project directory
                  const projFiles = fs.readdirSync(projPath).filter(f => f.endsWith('.json'));
                  for (const taskFile of projFiles) {
                    taskFiles.push({
                      filePath: path.join(projPath, taskFile),
                      projectId: projItem,
                      taskId: taskFile.replace('.json', ''),
                      workspaceId: item,
                      date: dateItem
                    });
                  }
                }
              }
            }
          }
        }
      }
    }
  } catch (error) {
    console.error('[FIND-TASKS] Error finding task files:', error);
  }
  
  return taskFiles;
};

// Migration function to move files from old structure to new structure
// Old: tracking-data/project_id/taskid.json
// New: tracking-data/workspace_id/YYYY-MM-DD/project_id/taskid.json
const migrateTrackingDataStructure = (workspaceId = 'default') => {
  try {
    const projectRoot = path.join(__dirname, '..');
    const trackingDataPath = path.join(projectRoot, 'tracking-data');
    
    if (!fs.existsSync(trackingDataPath)) {
      console.log('[MIGRATION] No tracking-data directory found, nothing to migrate');
      return { success: true, migrated: 0, errors: 0 };
    }
    
    let migrated = 0;
    let errors = 0;
    
    // Get all items in tracking-data directory
    const items = fs.readdirSync(trackingDataPath);
    
    for (const item of items) {
      const itemPath = path.join(trackingDataPath, item);
      const stat = fs.statSync(itemPath);
      
      // Check if this is old structure (direct project_id directory with JSON files)
      if (stat.isDirectory()) {
        const subItems = fs.readdirSync(itemPath);
        const jsonFiles = subItems.filter(f => f.endsWith('.json') && fs.statSync(path.join(itemPath, f)).isFile());
        
        // If we find JSON files directly, this is old structure
        if (jsonFiles.length > 0) {
          const projectId = item;
          
          for (const jsonFile of jsonFiles) {
            const oldFilePath = path.join(itemPath, jsonFile);
            const taskId = jsonFile.replace('.json', '');
            
            try {
              // Read file to get metadata and extract date
              const fileContent = fs.readFileSync(oldFilePath, 'utf8');
              const data = JSON.parse(fileContent);
              
              // Extract date from metadata.createdAt or use today's date
              let dateStr;
              if (data.metadata && data.metadata.createdAt) {
                const createdDate = new Date(data.metadata.createdAt);
                dateStr = createdDate.toISOString().split('T')[0]; // YYYY-MM-DD
              } else {
                // Fallback to today's date
                dateStr = new Date().toISOString().split('T')[0];
              }
              
              // Create new path: workspace_id/YYYY-MM-DD/project_id/taskid.json
              const newDir = path.join(trackingDataPath, workspaceId, dateStr, projectId);
              const newFilePath = path.join(newDir, jsonFile);
              
              // Create directory if it doesn't exist
              if (!fs.existsSync(newDir)) {
                fs.mkdirSync(newDir, { recursive: true });
              }
              
              // Only move if new file doesn't exist (avoid overwriting)
              if (!fs.existsSync(newFilePath)) {
                fs.copyFileSync(oldFilePath, newFilePath);
                migrated++;
                console.log(`[MIGRATION] Migrated ${jsonFile} from ${projectId}/ to ${workspaceId}/${dateStr}/${projectId}/`);
              } else {
                console.log(`[MIGRATION] Skipped ${jsonFile} - already exists in new location`);
              }
            } catch (error) {
              console.error(`[MIGRATION] Error migrating ${jsonFile}:`, error.message);
              errors++;
            }
          }
        }
      }
    }
    
    console.log(`[MIGRATION] Migration complete: ${migrated} files migrated, ${errors} errors`);
    return { success: true, migrated, errors };
  } catch (error) {
    console.error('[MIGRATION] Migration error:', error);
    return { success: false, error: error.message, migrated: 0, errors: 0 };
  }
};

// Save task tracking data to JSON file (immediate save)
// ONE FILE PER TASK - updates the same file, merging session data with totals
const saveTaskTrackingDataToFile = (projectId, taskId, taskName = null, projectName = null, immediate = false) => {
  try {
    const taskKey = getTaskKey(projectId, taskId);
    if (!taskKey) return false;
    
    const taskData = perTaskTracking.get(taskKey);
    if (!taskData) return false;
    
    // ONE FILE PER TASK - use taskId as filename
    const filePath = getTaskDataPath(projectId, taskId);
    taskFilePaths.set(taskKey, filePath);
    
    // Get metadata
    const metadata = taskMetadata.get(taskKey) || {};
    const finalTaskName = taskName || metadata.taskName || 'Unknown Task';
    const finalProjectName = projectName || metadata.projectName || 'Unknown Project';
    
    // Convert Map to Array for JSON serialization
    // Update timeSpent for all windows before saving and merge with saved data
    const now = Date.now();
    
    // Load saved window data and summary from file to merge with current session
    const savedWindowsMap = new Map();
    let baseTotalKeystrokes = 0;
    let baseTotalMouseClicks = 0;
    let savedCurrentSessionKeys = 0;
    let savedCurrentSessionClicks = 0;
    
    try {
      if (fs.existsSync(filePath)) {
        const existingFile = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        
        // Load saved windows
        if (existingFile.trackingData?.activeWindows) {
          existingFile.trackingData.activeWindows.forEach(item => {
            const { windowKey, ...stats } = item;
            savedWindowsMap.set(windowKey, stats);
          });
        }
        
        // Load saved summary
        const savedSummary = existingFile.trackingData?.summary;
        if (savedSummary) {
          baseTotalKeystrokes = savedSummary.totalKeystrokes || 0;
          baseTotalMouseClicks = savedSummary.totalMouseClicks || 0;
          savedCurrentSessionKeys = savedSummary.currentSessionKeystrokes || 0;
          savedCurrentSessionClicks = savedSummary.currentSessionMouseClicks || 0;
        }
      }
    } catch (e) {
      // File doesn't exist or is invalid, start fresh
    }
    
    // Debug: Log active windows count
    if (isDev) {
      console.log(`[TASK-SAVE] Processing ${taskData.activeWindows.size} active windows for task ${taskId}`);
    }
    
    taskData.activeWindows.forEach((windowData, windowKey) => {
      const savedWindow = savedWindowsMap.get(windowKey);
      
      if (isDev) {
        console.log(`[TASK-SAVE] Processing window ${windowKey}, has startTime: ${!!windowData.startTime}, timeCapsules: ${windowData.timeCapsules?.length || 0}`);
      }
      
      // CRITICAL FIX: Calculate time from time capsules (exact start/end pairs)
      // Initialize timeCapsules if it doesn't exist
      if (!windowData.timeCapsules) {
        windowData.timeCapsules = [];
      }
      
      // Load saved time capsules from file
      const savedCapsules = savedWindow?.timeCapsules || [];
      
      // Get new capsules from current session (closed during this session, not yet saved)
      // IMPORTANT: windowData.timeCapsules contains ONLY NEW capsules that haven't been saved yet
      // We need to separate new capsules from already-saved ones
      const newSessionCapsules = windowData.timeCapsules || [];
      
      // Create a Set of saved capsule keys for fast lookup
      const savedCapsuleKeys = new Set(savedCapsules.map(c => `${c.startTime}-${c.endTime}`));
      
      // Filter out new capsules that are already in saved (prevent duplicates)
      const trulyNewCapsules = newSessionCapsules.filter(capsule => {
        const key = `${capsule.startTime}-${capsule.endTime}`;
        return !savedCapsuleKeys.has(key);
      });
      
      // Merge: saved capsules + only truly new capsules (deduplicated)
      const allClosedCapsules = [...savedCapsules, ...trulyNewCapsules];
      
      // Calculate total time from all closed capsules
      let totalTime = allClosedCapsules.reduce((sum, capsule) => {
        return sum + (capsule.duration || 0);
      }, 0);
      
      // If window is currently active, add time from active capsule (not yet closed)
      // This time is included in calculation but capsule is not saved until window closes
      if (windowData.startTime) {
        const activeDuration = Math.floor((now - windowData.startTime) / 1000);
        totalTime += activeDuration;
      }
      
      windowData.timeSpent = totalTime;
      
      // IMPORTANT: Store ALL capsules (saved + new) so they persist in memory
      // This ensures that when we check windowData.timeCapsules, we see all capsules
      // The deduplication logic above ensures we don't add duplicates
      windowData.timeCapsules = allClosedCapsules;
      windowData.lastSeen = now;
      
      // CRITICAL FIX: Only add NEW data since last save to prevent double-counting
      const savedKeystrokes = savedWindow?.keystrokes || 0;
      const savedClicks = savedWindow?.mouseClicks || 0;
      
      // Get what was last saved for this window (to calculate difference)
      const lastSavedWindow = taskData.lastSavedWindowData?.get(windowKey);
      const lastSavedWindowKeystrokes = lastSavedWindow?.keystrokes !== undefined ? lastSavedWindow.keystrokes : savedKeystrokes;
      const lastSavedWindowClicks = lastSavedWindow?.mouseClicks !== undefined ? lastSavedWindow.mouseClicks : savedClicks;
      
      // Current session data (cumulative since task start)
      const currentKeystrokes = windowData.keystrokes || 0;
      const currentClicks = windowData.mouseClicks || 0;
      
      // Calculate NEW data since last save (difference)
      const newKeystrokes = Math.max(0, currentKeystrokes - lastSavedWindowKeystrokes);
      const newClicks = Math.max(0, currentClicks - lastSavedWindowClicks);
      
      // Total = saved + NEW data only (not entire current session)
      windowData.keystrokes = savedKeystrokes + newKeystrokes;
      windowData.mouseClicks = savedClicks + newClicks;
      
      // Update last saved data for this window
      if (!taskData.lastSavedWindowData) {
        taskData.lastSavedWindowData = new Map();
      }
      const lastSavedData = {
        keystrokes: currentKeystrokes, // Save current session total
        mouseClicks: currentClicks,
        timeSpent: windowData.timeSpent // Save total time (calculated from capsules)
      };
      taskData.lastSavedWindowData.set(windowKey, lastSavedData);
      
      // Merge URLs from both windowData.urls and perWindowStats.urlHistory
      const savedUrls = savedWindow?.urls || [];
      const currentUrls = windowData.urls || [];
      const mergedUrls = [...savedUrls];
      
      // Helper function to find existing URL entry
      const findExistingUrl = (url, title) => {
        if (url) {
          const normalizedUrl = normalizeUrl(url);
          if (normalizedUrl) {
            return mergedUrls.find(u => {
              const uNormalized = normalizeUrl(u.url);
              return uNormalized && normalizedUrl === uNormalized;
            });
          }
        } else if (title) {
          // For null URLs, match by exact title
          return mergedUrls.find(u => !u.url && u.title === title);
        }
        return null;
      };
      
      // Add URLs from current windowData (deduplicate)
      currentUrls.forEach(newUrl => {
        const existing = findExistingUrl(newUrl.url, newUrl.title);
        if (existing) {
          // Just update timestamp and title, no visit count
          existing.timestamp = Math.max(existing.timestamp || 0, newUrl.timestamp || Date.now());
          // Update title if it changed
          if (newUrl.title && newUrl.title !== existing.title) {
            existing.title = newUrl.title;
          }
        } else {
          // Remove visitCount if present
          const { visitCount, ...urlWithoutCount } = newUrl;
          mergedUrls.push(urlWithoutCount);
        }
      });
      
      // Also add URLs from perWindowStats.urlHistory (this includes file paths from code editors)
      // IMPORTANT: Deduplicate urlHistory first to avoid processing the same entry multiple times
      const windowStats = perWindowStats.get(windowKey);
      if (windowStats && windowStats.urlHistory && windowStats.urlHistory.length > 0) {
        // Create a map to deduplicate urlHistory entries first
        const urlHistoryMap = new Map();
        windowStats.urlHistory.forEach(urlEntry => {
          const key = urlEntry.url ? normalizeUrl(urlEntry.url) || urlEntry.url : urlEntry.title;
          if (key) {
            if (!urlHistoryMap.has(key)) {
              urlHistoryMap.set(key, {
                url: urlEntry.url,
                title: urlEntry.title,
                timestamp: urlEntry.timestamp || Date.now(),
                count: 1
              });
            } else {
              const existing = urlHistoryMap.get(key);
              existing.count += 1;
              existing.timestamp = Math.max(existing.timestamp || 0, urlEntry.timestamp || Date.now());
              // Update title if it changed
              if (urlEntry.title && urlEntry.title !== existing.title) {
                existing.title = urlEntry.title;
              }
            }
          }
        });
        
        // Now process deduplicated urlHistory
        urlHistoryMap.forEach((urlEntry, key) => {
          // Only add if it has a URL (not just a title)
          if (urlEntry.url) {
            const normalizedUrl = normalizeUrl(urlEntry.url);
            if (normalizedUrl) {
              const existing = findExistingUrl(normalizedUrl, null);
              if (existing) {
                // Just update timestamp and title, no visit count
                existing.timestamp = Math.max(existing.timestamp || 0, urlEntry.timestamp || Date.now());
                if (urlEntry.title && urlEntry.title !== existing.title) {
                  existing.title = urlEntry.title;
                }
              } else {
                mergedUrls.push({
                  url: normalizedUrl,
                  title: urlEntry.title || windowData.title || 'Unknown',
                  timestamp: urlEntry.timestamp || Date.now()
                });
              }
            }
          } else if (urlEntry.title) {
            // For entries without URL (like file paths from code editors), create a file:// URL
            // Check if it looks like a file path (has extension)
            const fileExtensionPattern = /\.([a-zA-Z0-9]+)$/;
            if (fileExtensionPattern.test(urlEntry.title)) {
              // Extract file name from title (format: "filename.ext - project - Editor")
              const filePart = urlEntry.title.split(' - ')[0].trim();
              const fileUrl = `file://${filePart}`;
              const existing = findExistingUrl(fileUrl, null);
              if (existing) {
                // Just update timestamp and title, no visit count
                existing.timestamp = Math.max(existing.timestamp || 0, urlEntry.timestamp || Date.now());
                if (urlEntry.title && urlEntry.title !== existing.title) {
                  existing.title = urlEntry.title;
                }
              } else {
                mergedUrls.push({
                  url: fileUrl,
                  title: urlEntry.title,
                  timestamp: urlEntry.timestamp || Date.now()
                });
              }
            } else {
              // Not a file path, add as title-only entry
              const existing = findExistingUrl(null, urlEntry.title);
              if (existing) {
                // Just update timestamp, no visit count
                existing.timestamp = Math.max(existing.timestamp || 0, urlEntry.timestamp || Date.now());
              } else {
                mergedUrls.push({
                  url: null,
                  title: urlEntry.title,
                  timestamp: urlEntry.timestamp || Date.now()
                });
              }
            }
          }
        });
      }
      
      // Final deduplication pass to ensure no duplicates remain
      const finalUrls = [];
      const seenUrls = new Set();
      mergedUrls.forEach(urlEntry => {
        const key = urlEntry.url ? normalizeUrl(urlEntry.url) || urlEntry.url : `title:${urlEntry.title}`;
        if (!seenUrls.has(key)) {
          seenUrls.add(key);
          finalUrls.push(urlEntry);
        } else {
          // If duplicate found, merge with existing
          const existing = finalUrls.find(u => {
            if (urlEntry.url) {
              const uNormalized = normalizeUrl(u.url);
              const entryNormalized = normalizeUrl(urlEntry.url);
              return uNormalized && entryNormalized && uNormalized === entryNormalized;
            } else {
              return !u.url && u.title === urlEntry.title;
            }
          });
          if (existing) {
            // Just update timestamp, no visit count
            existing.timestamp = Math.max(existing.timestamp || 0, urlEntry.timestamp || Date.now());
          }
        }
      });
      
      windowData.urls = finalUrls;
    });
    
    // Also include windows that existed before but aren't active now
    savedWindowsMap.forEach((windowData, windowKey) => {
      if (!taskData.activeWindows.has(windowKey)) {
        // Window was used before but not in current session - keep it
        taskData.activeWindows.set(windowKey, {
          ...windowData,
          lastSeen: now
        });
      }
    });
    
    const activeWindowsArray = Array.from(taskData.activeWindows.entries()).map(([key, value]) => {
      const windowEntry = {
        windowKey: key,
        appName: key, // Window key is the app name
        title: value.title || key,
        keystrokes: value.keystrokes || 0,
        mouseClicks: value.mouseClicks || 0,
        timeSpent: value.timeSpent || 0, // Total seconds spent in this window (calculated from capsules)
        timeCapsules: value.timeCapsules || [], // Time capsules with start/end pairs
        startTime: value.startTime || null, // Current active session start (if window is active)
        lastSeen: value.lastSeen || now,
        urls: value.urls || []
      };
      
      if (isDev) {
        console.log(`[TASK-SAVE] Serializing window ${key}:`, {
          timeSpent: windowEntry.timeSpent,
          capsules: windowEntry.timeCapsules.length,
          keystrokes: windowEntry.keystrokes,
          clicks: windowEntry.mouseClicks
        });
      }
      
      return windowEntry;
    });
    
    if (isDev) {
      console.log(`[TASK-SAVE] Serialized ${activeWindowsArray.length} windows to save`);
    }
    
    // CRITICAL: Calculate cumulative totals properly
    // CRITICAL FIX: Only add NEW data since last save to prevent double-counting
    const currentSessionKeystrokes = taskData.keystrokes || 0;
    const currentSessionMouseClicks = taskData.mouseClicks || 0;
    
    // Get what was last saved (from in-memory or file)
    const lastSavedSessionKeys = taskData.lastSavedKeystrokes !== undefined 
      ? taskData.lastSavedKeystrokes 
      : savedCurrentSessionKeys;
    const lastSavedSessionClicks = taskData.lastSavedMouseClicks !== undefined 
      ? taskData.lastSavedMouseClicks 
      : savedCurrentSessionClicks;
    
    // Calculate NEW data since last save (difference)
    const newKeystrokes = Math.max(0, currentSessionKeystrokes - lastSavedSessionKeys);
    const newClicks = Math.max(0, currentSessionMouseClicks - lastSavedSessionClicks);
    
    // Add only NEW data to base totals
    const totalKeystrokes = baseTotalKeystrokes + newKeystrokes;
    const totalMouseClicks = baseTotalMouseClicks + newClicks;
    
    // Update in-memory totals and last saved values
    taskData.totalKeystrokes = totalKeystrokes;
    taskData.totalMouseClicks = totalMouseClicks;
    taskData.lastSavedKeystrokes = currentSessionKeystrokes; // Update what was last saved
    taskData.lastSavedMouseClicks = currentSessionMouseClicks;
    
    // activeWindowsArray already has all the data with timeSpent calculated above
    const activeWindowsWithTime = activeWindowsArray;
    
    // Calculate total time from all windows' timeSpent (sum of all time capsules)
    const totalTimeSpent = activeWindowsWithTime.reduce((sum, win) => {
      return sum + (win.timeSpent || 0);
    }, 0);

    const dataToSave = {
      version: '1.0.0',
      metadata: {
        createdAt: taskData.createdAt || new Date().toISOString(),
        lastUpdated: new Date().toISOString(),
        taskId: taskData.taskId,
        projectId: taskData.projectId,
        taskName: finalTaskName,
        projectName: finalProjectName,
        currentSessionStart: taskData.startTime ? new Date(taskData.startTime).toISOString() : null
      },
      trackingData: {
        activityLogs: taskData.activityLogs || [],
        screenshots: taskData.screenshots || [],
        webcamPhotos: taskData.webcamPhotos || [],
        urlHistory: taskData.urlHistory || [],
        activeWindows: activeWindowsWithTime,
        summary: {
          totalTime: totalTimeSpent, // Total time spent (sum of all windows' timeSpent from time capsules)
          totalKeystrokes: totalKeystrokes, // Cumulative total across all sessions
          totalMouseClicks: totalMouseClicks, // Cumulative total across all sessions
          currentSessionKeystrokes: taskData.keystrokes, // Current session only
          currentSessionMouseClicks: taskData.mouseClicks, // Current session only
          totalScreenshots: (taskData.screenshots || []).length,
          totalWebcamPhotos: (taskData.webcamPhotos || []).length,
          totalUrls: (taskData.urlHistory || []).length,
          totalActivityLogs: (taskData.activityLogs || []).length,
          firstActivity: taskData.createdAt || (taskData.startTime ? new Date(taskData.startTime).toISOString() : null),
          lastActivity: new Date().toISOString()
        }
      }
    };
    
    // CRITICAL: Write file synchronously to ensure data is saved before continuing
    fs.writeFileSync(filePath, JSON.stringify(dataToSave, null, 2), 'utf8');
    
    // CRITICAL: Verify file was actually created and has content
    if (!fs.existsSync(filePath)) {
      console.error(`[TASK-SAVE] ❌ CRITICAL ERROR: File was not created at ${filePath}`);
      return false;
    }
    
    const stats = fs.statSync(filePath);
    if (stats.size === 0) {
      console.error(`[TASK-SAVE] ❌ CRITICAL ERROR: File is empty at ${filePath}`);
      return false;
    }
    
    // Verify JSON is valid by reading it back
    try {
      const verifyData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      if (!verifyData.metadata || !verifyData.trackingData) {
        console.error(`[TASK-SAVE] ❌ CRITICAL ERROR: Saved file has invalid structure`);
        return false;
      }
    } catch (verifyError) {
      console.error(`[TASK-SAVE] ❌ CRITICAL ERROR: Saved file is not valid JSON:`, verifyError);
      return false;
    }
    
    // Always log file path (not just in dev mode) so user can see where files are saved
    if (immediate) {
      console.log(`[TASK-SAVE] ✅ Immediately saved tracking data for task ${taskId}`);
      console.log(`[TASK-SAVE] 📁 File location: ${filePath}`);
      console.log(`[TASK-SAVE] 📊 Current session: ${taskData.keystrokes} keystrokes, ${taskData.mouseClicks} clicks`);
      console.log(`[TASK-SAVE] 📊 Total cumulative: ${totalKeystrokes} keystrokes, ${totalMouseClicks} clicks`);
      console.log(`[TASK-SAVE] 📊 Data: ${taskData.activityLogs?.length || 0} logs, ${taskData.screenshots?.length || 0} screenshots, ${activeWindowsWithTime.length} windows`);
    } else {
      console.log(`[TASK-SAVE] ✅ Saved tracking data for task ${taskId}`);
      console.log(`[TASK-SAVE] 📁 File location: ${filePath}`);
    }
    
    console.log(`[TASK-SAVE] ✅ File verified: ${stats.size} bytes written, JSON valid`);
    
    // Trigger Combined Insights update after successful save (only for immediate saves to avoid too many updates)
    // Use setTimeout to ensure function is available (defined later in file)
    if (immediate && typeof triggerCombinedInsightsUpdate === 'function') {
      setTimeout(() => {
        if (typeof triggerCombinedInsightsUpdate === 'function') {
          triggerCombinedInsightsUpdate();
        }
      }, 0);
    }
    
    return true;
  } catch (error) {
    console.error(`[TASK-SAVE] Error saving task tracking data:`, error);
    return false;
  }
};

// Debounced save: schedules a save after a delay, cancels previous scheduled saves
const scheduleTaskSave = (projectId, taskId, taskName = null, projectName = null, immediate = false) => {
  const taskKey = getTaskKey(projectId, taskId);
  if (!taskKey) return;
  
  // If immediate save requested, save now and clear any pending saves
  if (immediate) {
    if (saveTimers.has(taskKey)) {
      clearTimeout(saveTimers.get(taskKey));
      saveTimers.delete(taskKey);
    }
    saveTaskTrackingDataToFile(projectId, taskId, taskName, projectName, true);
    return;
  }
  
  // Clear existing timer for this task
  if (saveTimers.has(taskKey)) {
    clearTimeout(saveTimers.get(taskKey));
  }
  
  // Schedule new save
  const timer = setTimeout(() => {
    saveTaskTrackingDataToFile(projectId, taskId, taskName, projectName, false);
    saveTimers.delete(taskKey);
  }, SAVE_DEBOUNCE_MS);
  
  saveTimers.set(taskKey, timer);
};

// Load task tracking data from JSON file - ONE FILE PER TASK
// Checks both new structure (workspace_id/date/project_id/taskid.json) and old structure (project_id/taskid.json) for backward compatibility
const loadTaskTrackingDataFromFile = (projectId, taskId) => {
  try {
    // Try new structure first
    const filePath = getTaskDataPath(projectId, taskId);
    
    if (fs.existsSync(filePath)) {
      const fileContent = fs.readFileSync(filePath, 'utf8');
      const savedData = JSON.parse(fileContent);
      
      console.log(`[TASK-LOAD] ✅ Loaded existing file for task ${taskId}: ${filePath}`);
      console.log(`[TASK-LOAD] 📊 Existing data: ${savedData.trackingData?.activityLogs?.length || 0} logs, ${savedData.trackingData?.screenshots?.length || 0} screenshots`);
      console.log(`[TASK-LOAD] 📊 Existing totals: ${savedData.trackingData?.summary?.totalKeystrokes || 0} keystrokes, ${savedData.trackingData?.summary?.totalMouseClicks || 0} clicks`);
      
      return savedData;
    }
    
    // Try old structure for backward compatibility
    const projectRoot = path.join(__dirname, '..');
    const oldFilePath = path.join(projectRoot, 'tracking-data', projectId || 'unknown', `${taskId}.json`);
    
    if (fs.existsSync(oldFilePath)) {
      const fileContent = fs.readFileSync(oldFilePath, 'utf8');
      const savedData = JSON.parse(fileContent);
      
      console.log(`[TASK-LOAD] ✅ Loaded existing file from old structure for task ${taskId}: ${oldFilePath}`);
      console.log(`[TASK-LOAD] 📊 Existing data: ${savedData.trackingData?.activityLogs?.length || 0} logs, ${savedData.trackingData?.screenshots?.length || 0} screenshots`);
      
      return savedData;
    }
    
    if (isDev) {
      console.log(`[TASK-LOAD] File not found for task ${taskId}, will create new: ${filePath}`);
    }
    return null;
  } catch (error) {
    console.error(`[TASK-LOAD] ❌ Error loading task tracking data:`, error);
    return null;
  }
};

// Initialize task tracking (save previous, initialize new with NEW UUID)
const initializeTaskTracking = async (projectId, taskId, taskName = null, projectName = null) => {
  // CRITICAL: Save previous task data if exists (IMMEDIATE save on task switch)
  // This ensures no data is lost when switching tasks
  if (currentTaskId && currentProjectId) {
    const prevTaskKey = getTaskKey(currentProjectId, currentTaskId);
    if (prevTaskKey && perTaskTracking.has(prevTaskKey)) {
      const prevTaskData = perTaskTracking.get(prevTaskKey);
      
      // Clear any pending saves for previous task
      if (saveTimers.has(prevTaskKey)) {
        clearTimeout(saveTimers.get(prevTaskKey));
        saveTimers.delete(prevTaskKey);
      }
      
      // CRITICAL: Save previous task data IMMEDIATELY before switching
      // Verify data exists before saving
      if (prevTaskData) {
        const saveSuccess = saveTaskTrackingDataToFile(currentProjectId, currentTaskId, null, null, true);
        
        if (saveSuccess) {
          console.log(`[TASK-SWITCH] ✅ Successfully saved previous task ${currentTaskId} data before switching`);
          console.log(`[TASK-SWITCH] 📊 Previous task stats: ${prevTaskData.keystrokes} keystrokes, ${prevTaskData.mouseClicks} clicks, ${prevTaskData.activityLogs?.length || 0} logs`);
        } else {
          console.error(`[TASK-SWITCH] ❌ FAILED to save previous task ${currentTaskId} data - DATA MAY BE LOST!`);
          // Retry save once
          setTimeout(() => {
            const retrySuccess = saveTaskTrackingDataToFile(currentProjectId, currentTaskId, null, null, true);
            if (retrySuccess) {
              console.log(`[TASK-SWITCH] ✅ Retry save successful for task ${currentTaskId}`);
            } else {
              console.error(`[TASK-SWITCH] ❌ Retry save also failed for task ${currentTaskId}`);
            }
          }, 100);
        }
      } else {
        console.warn(`[TASK-SWITCH] ⚠️  Previous task ${currentTaskId} has no tracking data to save`);
      }
      
      // IMPORTANT: Keep previous task data in memory until we're sure it's saved
      // Don't delete it - it will be overwritten when the same task is started again with new UUID
      // This ensures we can retry saving if needed
    }
  }
  
  // Set new task (only after previous task is saved)
  currentProjectId = projectId;
  currentTaskId = taskId;
  
  // Store metadata
  if (taskName || projectName) {
    const taskKey = getTaskKey(projectId, taskId);
    if (taskKey) {
      taskMetadata.set(taskKey, {
        taskName: taskName || 'Unknown Task',
        projectName: projectName || 'Unknown Project'
      });
    }
  }
  
  // IMPORTANT: Load existing task data or create new
  // ONE FILE PER TASK - loads existing data and merges with new session
  const taskData = getTaskTrackingData(projectId, taskId, true); // true = load existing if available
  
  if (taskData) {
    const filePath = getTaskDataPath(projectId, taskId);
    const projectRoot = path.join(__dirname, '..');
    const hasExistingData = taskData.activityLogs && taskData.activityLogs.length > 0;
    
    console.log(`[TASK-INIT] ✅ Initialized tracking for task ${taskId} in project ${projectId}`);
    console.log(`[TASK-INIT] 📁 JSON file: ${filePath}`);
    console.log(`[TASK-INIT] 📂 Project root: ${projectRoot}`);
    console.log(`[TASK-INIT] 📂 Tracking data folder: ${path.join(projectRoot, 'tracking-data')}`);
    
    if (hasExistingData) {
      console.log(`[TASK-INIT] 💾 Loaded existing data: ${taskData.activityLogs.length} logs, ${taskData.screenshots?.length || 0} screenshots`);
      console.log(`[TASK-INIT] 💾 Cumulative totals: ${taskData.totalKeystrokes || 0} keystrokes, ${taskData.totalMouseClicks || 0} clicks`);
      console.log(`[TASK-INIT] 🔄 New session started - data will be merged with existing`);
    } else {
      console.log(`[TASK-INIT] 🆕 New task - creating fresh tracking data`);
    }
    
    // Save immediately to create/update file
    const saveSuccess = saveTaskTrackingDataToFile(projectId, taskId, taskName, projectName, true);
    if (!saveSuccess) {
      console.error(`[TASK-INIT] ❌ CRITICAL: Failed to save initial file for task`);
      // Retry once
      setTimeout(() => {
        const retrySuccess = saveTaskTrackingDataToFile(projectId, taskId, taskName, projectName, true);
        if (retrySuccess) {
          console.log(`[TASK-INIT] ✅ Retry save successful`);
          // Trigger Combined Insights update after successful save
          // Use setTimeout to ensure function is available (defined later in file)
          setTimeout(() => {
            if (typeof triggerCombinedInsightsUpdate === 'function') {
              triggerCombinedInsightsUpdate();
            }
          }, 0);
        }
      }, 100);
    } else {
      // Trigger Combined Insights update after successful save
      // Use setTimeout to ensure function is available (defined later in file)
      setTimeout(() => {
        if (typeof triggerCombinedInsightsUpdate === 'function') {
          triggerCombinedInsightsUpdate();
        }
      }, 0);
    }
  }
  
  return taskData;
};

// ==================== End JSON File Storage Functions ====================

// Helper to create a unique key for a window (app + title combination)
const getWindowKey = (app, title) => {
  // Use app name as primary identifier, title as secondary
  // This groups windows from the same app together
  return `${app || 'Unknown'}`;
};

// Get or create stats for a window
const getWindowStats = (windowKey, title = null, url = null) => {
  // Normalize URL before storing
  const normalizedUrl = url ? normalizeUrl(url) : null;
  
  if (!perWindowStats.has(windowKey)) {
    perWindowStats.set(windowKey, {
      keystrokes: 0,
      clicks: 0,
      startTime: Date.now(),
      title: title || windowKey,
      url: normalizedUrl,
      lastSeen: Date.now(),
      urlHistory: normalizedUrl || title ? [{ url: normalizedUrl, title: title || 'Unknown', timestamp: Date.now() }] : []
    });
  } else {
    // Update title, URL, and last seen time
    const stats = perWindowStats.get(windowKey);
    const currentTitle = title || stats.title || 'Unknown';
    if (title) stats.title = currentTitle;
    
    // Track URL/title changes - add to history if URL or title changed
    if (!stats.urlHistory) {
      stats.urlHistory = [];
    }
    
    const lastEntry = stats.urlHistory[stats.urlHistory.length - 1];
    const urlChanged = normalizedUrl && normalizedUrl !== stats.url;
    const titleChanged = title && title !== (lastEntry?.title || stats.title);
    
    // If URL changed, add new entry
    if (urlChanged) {
      // Check if normalized URL already exists in history (prevent duplicates)
      const urlExists = stats.urlHistory.some(entry => entry.url && normalizeUrl(entry.url) === normalizedUrl);
      
      if (!urlExists) {
        stats.urlHistory.push({ url: normalizedUrl, title: currentTitle, timestamp: Date.now() });
        // Keep only last 100 entries to prevent memory issues
        if (stats.urlHistory.length > 100) {
          stats.urlHistory = stats.urlHistory.slice(-100);
        }
        if (isDev) {
          console.log('[URL-HISTORY] Added URL to', windowKey, ':', normalizedUrl, '| Total entries:', stats.urlHistory.length);
        }
      } else {
        // URL already exists, just update its timestamp and title
        const existingEntry = stats.urlHistory.find(entry => entry.url && normalizeUrl(entry.url) === normalizedUrl);
        if (existingEntry) {
          existingEntry.timestamp = Date.now();
          existingEntry.title = currentTitle;
        }
      }
      stats.url = normalizedUrl;
    } 
    // If URL is unknown but title changed, add title entry
    else if (!normalizedUrl && titleChanged) {
      // Check if this title already exists (prevent duplicate titles)
      const titleExists = stats.urlHistory.some(entry => !entry.url && entry.title === currentTitle);
      
      if (!titleExists) {
        stats.urlHistory.push({ url: null, title: currentTitle, timestamp: Date.now() });
        // Keep only last 100 entries
        if (stats.urlHistory.length > 100) {
          stats.urlHistory = stats.urlHistory.slice(-100);
        }
        if (isDev) {
          console.log('[TITLE-HISTORY] Added title to', windowKey, ':', currentTitle.substring(0, 50), '| Total entries:', stats.urlHistory.length);
        }
      } else {
        // Title already exists, update timestamp
        const existingEntry = stats.urlHistory.find(entry => !entry.url && entry.title === currentTitle);
        if (existingEntry) {
          existingEntry.timestamp = Date.now();
        }
      }
    }
    // If same URL/title, just update timestamp
    else if (normalizedUrl && normalizedUrl === stats.url) {
      if (stats.urlHistory.length > 0) {
        const lastEntry = stats.urlHistory[stats.urlHistory.length - 1];
        if (lastEntry.url && normalizeUrl(lastEntry.url) === normalizedUrl) {
          lastEntry.timestamp = Date.now();
          lastEntry.title = currentTitle; // Update title in case it changed
        }
      }
    }
    // If no URL and same title, update timestamp
    else if (!normalizedUrl && !titleChanged && lastEntry && !lastEntry.url) {
      lastEntry.timestamp = Date.now();
    }
    
    stats.lastSeen = Date.now();
  }
  return perWindowStats.get(windowKey);
};

// Get all window stats as array
const getAllWindowStats = () => {
  const allWindows = [];
  perWindowStats.forEach((stats, windowKey) => {
    allWindows.push({
      app: windowKey,
      title: stats.title,
      url: stats.url, // Current URL
      urlHistory: stats.urlHistory || [], // All URLs/titles visited in this window (includes both URLs and titles)
      keystrokes: stats.keystrokes,
      mouseClicks: stats.clicks,
      startTime: stats.startTime,
      lastSeen: stats.lastSeen,
      isActive: windowKey === currentWindowKey
    });
  });
  return allWindows;
};

function createWindow() {
  // Get the logo path for the app icon
  // Try multiple possible paths for dev and production
  const possiblePaths = [
    path.join(__dirname, '../public/logo.png'), // Dev mode
    path.join(__dirname, '../dist/logo.png'), // Production (Vite copies public to dist)
    path.join(process.cwd(), 'public/logo.png'), // Alternative dev path
    path.join(process.cwd(), 'dist/logo.png') // Alternative production path
  ];
  
  let iconPath = undefined;
  for (const logoPath of possiblePaths) {
    if (fs.existsSync(logoPath)) {
      iconPath = logoPath;
      break;
    }
  }

  mainWindow = new BrowserWindow({
    width: 1024,
    height: 768,
    frame: false, // Remove default title bar
    titleBarStyle: 'hidden',
    backgroundColor: '#000000',
    icon: iconPath, // Set app icon
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs'),
      webSecurity: true
    },
    resizable: true,
    minWidth: 768,
    minHeight: 600,
    show: false // Don't show until ready
  });

  // Load the app
  if (isDev) {
    // Development: Load from Vite dev server
    mainWindow.loadURL('http://localhost:3000');
  } else {
    // Production: Load from built files
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  // Show window immediately when ready (faster startup)
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.focus();
  });

  // Handle page load errors
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.error('Failed to load:', errorCode, errorDescription);
    if (isDev) {
      // In dev, wait a bit longer for Vite server to start
      setTimeout(() => {
        mainWindow.loadURL('http://localhost:3000');
      }, 2000);
    }
  });

  // Prevent window from closing - hide to tray instead
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
      
      // Show notification on Windows/Linux
      if (process.platform !== 'darwin' && tray) {
        // Get icon path for notification
        const possiblePaths = [
          path.join(__dirname, '../public/logo.png'),
          path.join(__dirname, '../dist/logo.png'),
          path.join(process.cwd(), 'public/logo.png'),
          path.join(process.cwd(), 'dist/logo.png')
        ];
        let notificationIcon = undefined;
        for (const logoPath of possiblePaths) {
          if (fs.existsSync(logoPath)) {
            notificationIcon = logoPath;
            break;
          }
        }
        
        tray.displayBalloon({
          title: 'Tyrodesk',
          content: 'App is still running in the system tray. Click the tray icon to show the window.',
          icon: notificationIcon
        });
      }
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Window control handlers
ipcMain.handle('window-minimize', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.handle('window-maximize', () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  }
});

ipcMain.handle('window-close', () => {
  if (mainWindow) {
    // Hide to tray instead of closing
    mainWindow.hide();
  }
});

ipcMain.handle('window-is-maximized', () => {
  return mainWindow ? mainWindow.isMaximized() : false;
});

// Consent management handlers
ipcMain.handle('get-user-consent', async () => {
  const s = await initStore();
  return {
    consent: s.get('userConsent'),
    remembered: s.get('consentRemembered')
  };
});

ipcMain.handle('set-user-consent', async (event, consent, remember) => {
  const s = await initStore();
  s.set('userConsent', consent);
  s.set('consentRemembered', remember);
  return true;
});

ipcMain.handle('revoke-consent', async () => {
  const s = await initStore();
  s.set('userConsent', false);
  s.set('consentRemembered', false);
  return true;
});

// Settings management handlers
ipcMain.handle('get-settings', async () => {
  const s = await initStore();
  return s.get('settings');
});

ipcMain.handle('set-settings', async (event, settings) => {
  const s = await initStore();
  s.set('settings', settings);
  return true;
});

// Data export handler
ipcMain.handle('export-data', async (event, data) => {
  const { dialog } = require('electron');
  try {
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Export Data',
      defaultPath: `tyrodesk-export-${new Date().toISOString().split('T')[0]}.json`,
      filters: [
        { name: 'JSON Files', extensions: ['json'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });
    
    if (!result.canceled && result.filePath) {
      fs.writeFileSync(result.filePath, JSON.stringify(data, null, 2), 'utf8');
      return { success: true, path: result.filePath };
    }
    return { success: false, canceled: true };
  } catch (error) {
    console.error('Export error:', error);
    return { success: false, error: error.message };
  }
});

// Data deletion handler
ipcMain.handle('delete-all-data', async () => {
  // Clear all stored data except consent (user must explicitly revoke)
  const s = await initStore();
  s.delete('settings');
  // Note: Activity logs and time entries are stored in renderer memory,
  // so they'll be cleared when app restarts. This is handled in the renderer.
  return true;
});

// ==================== API Sync IPC Handlers ====================

// Test API connection
ipcMain.handle('test-api-connection', async () => {
  try {
    const store = await initStore();
    const settings = store.get('settings', {});
    
    if (!settings.apiEnabled || !settings.apiBaseUrl) {
      return { success: false, error: 'API not enabled or base URL not set' };
    }

    // Dynamic import of axios (ES module)
    const axiosModule = await import('axios');
    const axios = axiosModule.default;
    
    // Try to get OAuth token first, fallback to API key
    let authHeader = {};
    try {
      const keytar = require('keytar');
      const accessToken = await keytar.getPassword('tyro-app', 'access_token');
      if (accessToken) {
        authHeader = { Authorization: `Bearer ${accessToken}` };
      } else if (settings.apiKey) {
        authHeader = { Authorization: `Bearer ${settings.apiKey}` };
      }
    } catch (e) {
      // Fallback to API key if keytar fails
      if (settings.apiKey) {
        authHeader = { Authorization: `Bearer ${settings.apiKey}` };
      }
    }
    
    const response = await axios.get(`${settings.apiBaseUrl}/health`, {
      timeout: 10000,
      headers: authHeader,
    });
    
    return { success: true };
  } catch (error) {
    return { 
      success: false, 
      error: error.message || 'Connection failed' 
    };
  }
});

// ==================== OAuth Device Flow IPC Handlers ====================

// Track ongoing OAuth authentication attempts to prevent multiple simultaneous flows
let ongoingOAuthAttempts = new Map();

// OAuth Device Flow Authentication
ipcMain.handle('oauth-authenticate', async (event) => {
  const requestId = `${event.sender.id}-${Date.now()}`;
  
  try {
    // Check if already authenticated
    const keytar = require('keytar');
    const existingToken = await keytar.getPassword('tyro-app', 'access_token');
    if (existingToken) {
      const status = await checkOAuthStatus();
      if (status.authenticated) {
        console.log('[OAUTH] Already authenticated, returning existing auth');
        return {
          success: true,
          message: 'Already authenticated',
          user: status.user,
          workspaces: status.workspaces || [],
          currentWorkspace: status.currentWorkspace || null,
        };
      }
    }
    
    // Cancel any ongoing authentication attempts from this renderer
    const senderId = event.sender.id.toString();
    for (const [id, cancelFn] of ongoingOAuthAttempts.entries()) {
      if (id.startsWith(senderId)) {
        console.log('[OAUTH] Cancelling previous authentication attempt:', id);
        cancelFn();
        ongoingOAuthAttempts.delete(id);
      }
    }
    
    const store = await initStore();
    const settings = store.get('settings', {});
    
    if (!settings.apiBaseUrl) {
      return { success: false, error: 'API base URL not set' };
    }

    // Use base URL as-is (it should include full path like /api/v11)
    // Remove trailing slash if present
    let baseUrl = settings.apiBaseUrl.replace(/\/$/, '');
    
    // OAuth routes are at /api/auth (not versioned), but base URL might be /api/v11
    // Remove /v11 or /vXX version prefix if present for OAuth endpoints
    // This allows base URL to be http://tyrodesk.test:8000/api/v11 for other endpoints
    // but OAuth will use http://tyrodesk.test:8000/api/auth/...
    if (baseUrl.match(/\/v\d+$/)) {
      // Remove version suffix (e.g., /v11) for OAuth endpoints
      baseUrl = baseUrl.replace(/\/v\d+$/, '');
      console.log('[OAUTH] Removed version prefix, using base URL:', baseUrl);
    } else {
      console.log('[OAUTH] Using base URL as-is:', baseUrl);
    }
    
    // Dynamic imports
    const axiosModule = await import('axios');
    const axios = axiosModule.default;
    const { shell } = require('electron');
    // keytar already declared above at line 1600
    
    const SERVICE_NAME = 'tyro-app';
    const ACCESS_TOKEN_KEY = 'access_token';
    const REFRESH_TOKEN_KEY = 'refresh_token';
    const USER_DATA_KEY = 'user_data';
    
    // Step 1: Start device flow
    let deviceCodeData;
    try {
      // Append endpoint to base URL (base URL already includes /api/v11)
      const startUrl = `${baseUrl}/auth/device/start`;
      console.log('[OAUTH] Full URL being called:', startUrl);
      console.log('[OAUTH] Base URL from settings:', settings.apiBaseUrl);
      
      const response = await axios.post(startUrl, {}, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 30000,
      });
      
      if (response.status === 200 && response.data?.result === true) {
        deviceCodeData = response.data.data;
      } else {
        throw new Error(response.data?.message || 'Failed to generate device code');
      }
    } catch (error) {
      const startUrl = `${baseUrl}/auth/device/start`;
      const errorMessage = error.response?.data?.message || error.message || 'Failed to start device flow';
      const statusCode = error.response?.status;
      const statusText = error.response?.statusText;
      
      console.error('[OAUTH] Error details:');
      console.error('  Full URL:', startUrl);
      console.error('  Status:', statusCode, statusText);
      console.error('  Error message:', errorMessage);
      console.error('  Response data:', error.response?.data);
      
      return {
        success: false,
        error: `Failed to call ${startUrl}: ${errorMessage}${statusCode ? ` (${statusCode} ${statusText})` : ''}`,
      };
    }
    
    // Step 2: Open browser
    let browserOpened = false;
    try {
      await shell.openExternal(deviceCodeData.verification_url);
      browserOpened = true;
      console.log(`[OAUTH] Browser opened: ${deviceCodeData.verification_url}`);
      console.log(`[OAUTH] User code: ${deviceCodeData.user_code}`);
    } catch (error) {
      console.warn('[OAUTH] Failed to open browser:', error);
      // Continue anyway - user can open manually
    }
    
    // Return device code info immediately so UI can display it
    // Polling will continue in background via separate handler
    event.sender.send('oauth-device-code', {
      user_code: deviceCodeData.user_code,
      verification_url: deviceCodeData.verification_url,
      browser_opened: browserOpened,
    });
    
    // Step 3: Poll for token
    const maxAttempts = 120; // 10 minutes at 5 second intervals
    const interval = deviceCodeData.interval || 5;
    const startTime = Date.now();
    const expirationTime = startTime + (deviceCodeData.expires_in || 600) * 1000;
    let attempt = 0;
    let cancelled = false;
    
    // Set up cancellation handler
    const cancelHandler = () => {
      cancelled = true;
      console.log('[OAUTH] Authentication cancelled by new request');
    };
    ongoingOAuthAttempts.set(requestId, cancelHandler);
    
    // Define poll URL once (used in try and catch blocks)
    const pollUrl = `${baseUrl}/auth/device/poll`;
    
    try {
      while (attempt < maxAttempts && !cancelled) {
      // Check if device code expired
      if (Date.now() >= expirationTime) {
        return {
          success: false,
          error: 'Device code has expired. Please try again.',
        };
      }
      
        // Check if cancelled before polling
        if (cancelled) {
          console.log('[OAUTH] Polling cancelled');
          return {
            success: false,
            error: 'Authentication cancelled. Please try again.',
          };
        }
        
        attempt++;
        
        // Log every poll attempt for debugging
        console.log(`[OAUTH] 🔄 Poll attempt ${attempt}/${maxAttempts} - Calling ${pollUrl}`);
        console.log(`[OAUTH] Device code: ${deviceCodeData.device_code.substring(0, 20)}...`);
        console.log(`[OAUTH] Interval: ${interval} seconds`);
        
        try {
          const response = await axios.post(
            pollUrl,
            { device_code: deviceCodeData.device_code },
            {
              headers: { 'Content-Type': 'application/json' },
              timeout: 30000,
            }
          );
        
        // Log response for debugging
        console.log(`[OAUTH] ✅ Poll attempt ${attempt} response: Status ${response.status}, Result: ${response.data?.result}, Error: ${response.data?.error || 'none'}`);
        if (response.data) {
          console.log(`[OAUTH] Response data:`, JSON.stringify(response.data, null, 2));
        }
        
        // Success - user authorized
        if (response.status === 200 && response.data?.result === true) {
          console.log('[OAUTH] ✅ Authentication successful!');
          console.log('[OAUTH] Response data:', JSON.stringify(response.data, null, 2));
          const data = response.data.data;
          
          // Extract tokens - prefer root level, fallback to data level
          const jwtLoginToken = response.data.login_token || data.login_token;
          const token = response.data.token || data.token; // Laravel token
          
          // Save full response data to localStorage via renderer
          // Send full response data to renderer to save in localStorage
          if (mainWindow) {
            // Send login_token separately (for backward compatibility)
            if (jwtLoginToken) {
              mainWindow.webContents.send('oauth-login-token', jwtLoginToken);
            }
            // Send full response data
            mainWindow.webContents.send('oauth-full-response', {
              result: response.data.result,
              message: response.data.message,
              data: response.data.data,
              token: response.data.token,
              login_token: response.data.login_token,
            });
          }
          
          // Parse expires_at from string or calculate from expires_in
          let expires_at = null;
          if (data.expires_at) {
            // Parse date string like "2025-12-14 20:28:43"
            const expiresDate = new Date(data.expires_at.replace(' ', 'T'));
            expires_at = expiresDate.getTime();
          } else {
            expires_at = Date.now() + (data.expires_in || 604800) * 1000;
          }
          
          // Extract user data (all fields from data object)
          const user = {
            id: data.id,
            company_id: data.company_id,
            department_id: data.department_id,
            department_name: data.department_name,
            is_admin: data.is_admin,
            is_hr: data.is_hr,
            is_face_registered: data.is_face_registered,
            name: data.name,
            email: data.email,
            phone: data.phone,
            avatar: data.avatar,
          };
          
          // Extract workspaces - check both data.workspaces and root level
          let workspaces = data.workspaces || [];
          
          // Log full workspace data structure for debugging
          console.log('[OAUTH] ========== WORKSPACE DATA DEBUG ==========');
          console.log('[OAUTH] Workspaces array length:', workspaces.length);
          console.log('[OAUTH] Workspaces from data.workspaces:', JSON.stringify(workspaces, null, 2));
          console.log('[OAUTH] Full data object structure:', JSON.stringify(data, null, 2));
          console.log('[OAUTH] ===========================================');
          
          if (workspaces.length > 0) {
            console.log('[OAUTH] ✅ Workspaces received:', workspaces.length);
            workspaces.forEach((ws, index) => {
              console.log(`[OAUTH] Workspace ${index + 1}:`, {
                id: ws.workspace_id,
                name: ws.workspace_name,
                company: ws.company_name,
                general: ws.workspace_is_general,
                role: ws.workspace_role,
                active: ws.workspace_is_active,
              });
            });
          } else {
            console.warn('[OAUTH] ⚠️ No workspaces in response!');
            console.log('[OAUTH] Checking if workspaces might be at root level...');
            console.log('[OAUTH] response.data.workspaces:', response.data.workspaces);
            console.log('[OAUTH] Full data object keys:', Object.keys(data));
            
            // Try to get workspaces from root level if not in data
            if (response.data.workspaces && Array.isArray(response.data.workspaces)) {
              workspaces = response.data.workspaces;
              console.log('[OAUTH] Found workspaces at root level:', workspaces.length);
            }
          }
          
          // Select default workspace (general workspace or first one)
          // Handle both boolean and number (1/0) for workspace_is_general
          let currentWorkspace = workspaces.find(w => 
            w.workspace_is_general === true || w.workspace_is_general === 1
          ) || null;
          if (!currentWorkspace && workspaces.length > 0) {
            currentWorkspace = workspaces[0];
          }
          
          if (currentWorkspace) {
            console.log('[OAUTH] Selected workspace:', currentWorkspace.workspace_name, '(ID:', currentWorkspace.workspace_id, ')');
          } else {
            console.warn('[OAUTH] ⚠️ No workspace selected!');
          }
          
          // Store metadata with user, workspaces, and current workspace
          const metadata = {
            token_type: data.token_type || 'Bearer',
            expires_at,
            user,
            workspaces,
            current_workspace_id: currentWorkspace ? currentWorkspace.workspace_id : null,
          };
          console.log('[OAUTH] Storing metadata with', workspaces.length, 'workspaces');
          await keytar.setPassword(SERVICE_NAME, USER_DATA_KEY, JSON.stringify(metadata));
          
          // Send success notification with full data (include login_token and full response)
          event.sender.send('oauth-authentication-success', {
            user,
            workspaces,
            currentWorkspace,
            token: token || jwtLoginToken, // Use token or fallback to login_token
            login_token: jwtLoginToken, // Include JWT login_token
            expires_at,
            message: `Authenticated as ${user.name} (${user.email})`,
            // Include full response data
            fullResponse: {
              result: response.data.result,
              message: response.data.message,
              data: response.data.data,
              token: response.data.token,
              login_token: response.data.login_token,
            },
          });
          
          // Clean up cancellation handler before returning
          ongoingOAuthAttempts.delete(requestId);
          
          return {
            success: true,
            message: `Authenticated as ${user.name} (${user.email})`,
            user,
            workspaces,
            currentWorkspace,
            token: token || jwtLoginToken, // Use token or fallback to login_token
            expires_at,
          };
        }
        
        // Check if we got 200 but result is false (shouldn't happen, but log it)
        if (response.status === 200 && response.data?.result === false) {
          console.warn('[OAUTH] ⚠️ Got 200 but result is false:', response.data);
          const errorMsg = response.data?.message || 'Authentication failed';
          return {
            success: false,
            error: errorMsg,
          };
        }
        
        // Authorization pending - continue polling
        if (response.status === 202 || response.data?.error === 'authorization_pending') {
          console.log(`[OAUTH] ⏳ Still waiting for authorization (attempt ${attempt}/${maxAttempts})...`);
          console.log(`[OAUTH] ⏳ Waiting ${interval} seconds before next poll...`);
          await new Promise(resolve => setTimeout(resolve, interval * 1000));
          console.log(`[OAUTH] ⏳ Wait complete, continuing to next poll...`);
          continue;
        }
        
        // Other errors
        const errorMsg = response.data?.message || 'Authentication failed';
        console.error('[OAUTH] Poll error:', errorMsg);
        console.error('[OAUTH] Poll URL:', pollUrl);
        console.error('[OAUTH] Response status:', response.status);
        console.error('[OAUTH] Response data:', response.data);
        
        return {
          success: false,
          error: `Failed at ${pollUrl}: ${errorMsg} (${response.status})`,
        };
      } catch (error) {
        // Use pollUrl defined above
        
        if (error.response) {
          const status = error.response.status;
          const data = error.response.data;
          
          if (status === 410 || data?.error === 'expired_token') {
            console.error('[OAUTH] Device code expired');
            return {
              success: false,
              error: 'Device code has expired. Please try again.',
            };
          }
          
          if (status === 400 || data?.error === 'code_already_used') {
            console.error('[OAUTH] Device code already used');
            console.error('[OAUTH] This usually means the device code was verified but polling missed it, or a new auth attempt started');
            // Don't return immediately - this might be from a previous attempt
            // Instead, suggest the user might already be authenticated or should try again
            return {
              success: false,
              error: 'Device code has already been used. This may mean you\'re already authenticated, or you need to start a fresh authentication flow. Please check if you\'re logged in, or try again.',
              code_already_used: true,
            };
          }
          
          if (status === 404) {
            const errorMsg = data?.message || 'Route not found';
            console.error('[OAUTH] 404 Error at:', pollUrl);
            console.error('[OAUTH] Error message:', errorMsg);
            console.error('[OAUTH] Response data:', data);
            return {
              success: false,
              error: `Route not found: ${pollUrl} - ${errorMsg}`,
            };
          }
          
          if (status === 202 || data?.error === 'authorization_pending') {
            console.log(`[OAUTH] ⏳ Still waiting for authorization (attempt ${attempt}/${maxAttempts})...`);
            console.log(`[OAUTH] ⏳ Waiting ${interval} seconds before next poll...`);
            await new Promise(resolve => setTimeout(resolve, interval * 1000));
            console.log(`[OAUTH] ⏳ Wait complete, continuing to next poll...`);
            continue;
          }
          
          // Other HTTP errors
          const errorMsg = data?.message || error.message || 'Unknown error';
          console.error('[OAUTH] HTTP Error:', status, errorMsg);
          console.error('[OAUTH] URL:', pollUrl);
          console.error('[OAUTH] Response:', data);
        } else {
          // Network error
          console.error('[OAUTH] Network error:', error.message);
          console.error('[OAUTH] URL:', pollUrl);
        }
        
        // Network error - retry after interval (only if not cancelled)
        if (!cancelled) {
          console.log(`[OAUTH] ⚠️ Network error, will retry in ${interval} seconds...`);
          await new Promise(resolve => setTimeout(resolve, interval * 1000));
          console.log(`[OAUTH] ⚠️ Retry wait complete, continuing...`);
        }
      }
    }
      
      // Clean up cancellation handler
      ongoingOAuthAttempts.delete(requestId);
      
      // Timeout
      if (!cancelled) {
        return {
          success: false,
          error: 'Authentication timeout. Please try again.',
        };
      } else {
        return {
          success: false,
          error: 'Authentication cancelled. Please try again.',
        };
      }
    } catch (error) {
      // Clean up cancellation handler on error
      ongoingOAuthAttempts.delete(requestId);
      throw error;
    }
  } catch (error) {
    // Clean up cancellation handler
    ongoingOAuthAttempts.delete(requestId);
    return {
      success: false,
      error: error.message || 'Authentication failed',
    };
  }
});

// Helper function to check OAuth status (extracted from oauth-check-status handler)
async function checkOAuthStatus() {
  try {
    const keytar = require('keytar');
    const accessToken = await keytar.getPassword('tyro-app', 'access_token');
    const userDataStr = await keytar.getPassword('tyro-app', 'user_data');
    
    if (!accessToken) {
      return { authenticated: false };
    }
    
    let user = null;
    let workspaces = [];
    let currentWorkspace = null;
    let expires_at = null;
    
    if (userDataStr) {
      try {
        const metadata = JSON.parse(userDataStr);
        user = metadata.user;
        workspaces = metadata.workspaces || [];
        expires_at = metadata.expires_at;
        
        console.log('[OAUTH] Loaded', workspaces.length, 'workspaces from storage');
        if (workspaces.length > 0) {
          console.log('[OAUTH] Workspace names:', workspaces.map(w => w.workspace_name || w.name || 'Unknown').join(', '));
        }
        
        // Get current workspace
        if (metadata.current_workspace_id) {
          currentWorkspace = workspaces.find(w => w.workspace_id === metadata.current_workspace_id) || null;
          if (currentWorkspace) {
            console.log('[OAUTH] Found current workspace by ID:', currentWorkspace.workspace_name);
          }
        }
        
        // Fallback to general workspace or first one
        if (!currentWorkspace) {
          currentWorkspace = workspaces.find(w => w.workspace_is_general) || null;
          if (currentWorkspace) {
            console.log('[OAUTH] Using general workspace:', currentWorkspace.workspace_name);
          }
        }
        if (!currentWorkspace && workspaces.length > 0) {
          currentWorkspace = workspaces[0];
          console.log('[OAUTH] Using first workspace:', currentWorkspace.workspace_name);
        }
      } catch (e) {
        console.error('[OAUTH] Error parsing user data:', e);
        console.error('[OAUTH] User data string:', userDataStr.substring(0, 200));
      }
    }
    
    // Check if token is expired
    const isExpired = expires_at && Date.now() >= expires_at;
    
    return {
      authenticated: !isExpired,
      user,
      workspaces,
      currentWorkspace,
      expires_at,
    };
  } catch (error) {
    return { authenticated: false, error: error.message };
  }
}

// Check OAuth authentication status
ipcMain.handle('oauth-check-status', async () => {
  try {
    const keytar = require('keytar');
    const accessToken = await keytar.getPassword('tyro-app', 'access_token');
    const userDataStr = await keytar.getPassword('tyro-app', 'user_data');
    
    if (!accessToken) {
      return { authenticated: false };
    }
    
    let user = null;
    let workspaces = [];
    let currentWorkspace = null;
    let expires_at = null;
    
    if (userDataStr) {
      try {
        const metadata = JSON.parse(userDataStr);
        user = metadata.user;
        workspaces = metadata.workspaces || [];
        expires_at = metadata.expires_at;
        
        // Get current workspace
        if (metadata.current_workspace_id) {
          currentWorkspace = workspaces.find(w => w.workspace_id === metadata.current_workspace_id) || null;
        }
        
        // Fallback to general workspace or first one
        if (!currentWorkspace) {
          currentWorkspace = workspaces.find(w => w.workspace_is_general) || null;
        }
        if (!currentWorkspace && workspaces.length > 0) {
          currentWorkspace = workspaces[0];
        }
      } catch (e) {
        console.error('[OAUTH] Error parsing user data:', e);
        // Ignore parse errors
      }
    }
    
    // Check if token is expired
    const isExpired = expires_at && Date.now() >= expires_at;
    
    return {
      authenticated: !isExpired,
      user,
      workspaces,
      currentWorkspace,
      expires_at,
    };
  } catch (error) {
    return { authenticated: false, error: error.message };
  }
});

// OAuth Logout
ipcMain.handle('oauth-logout', async () => {
  try {
    const keytar = require('keytar');
    await keytar.deletePassword('tyro-app', 'access_token');
    await keytar.deletePassword('tyro-app', 'refresh_token');
    await keytar.deletePassword('tyro-app', 'user_data');
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Set current workspace
ipcMain.handle('oauth-set-workspace', async (event, workspaceId) => {
  try {
    const keytar = require('keytar');
    const userDataStr = await keytar.getPassword('tyro-app', 'user_data');
    
    if (!userDataStr) {
      return { success: false, error: 'No user data found' };
    }
    
    try {
      const metadata = JSON.parse(userDataStr);
      const workspaces = metadata.workspaces || [];
      
      // Verify workspace exists (handle both string and number IDs)
      const workspace = workspaces.find(w => 
        String(w.workspace_id) === String(workspaceId)
      );
      if (!workspace) {
        return { success: false, error: `Workspace ${workspaceId} not found` };
      }
      
      // Update current workspace
      metadata.current_workspace_id = workspaceId;
      await keytar.setPassword('tyro-app', 'user_data', JSON.stringify(metadata));
      
      return { success: true };
    } catch (e) {
      return { success: false, error: 'Failed to parse user data' };
    }
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Device logout API call
ipcMain.handle('oauth-device-logout', async (event) => {
  try {
    const keytar = require('keytar');
    const store = await initStore();
    const settings = store.get('settings', {});
    
    if (!settings.apiBaseUrl) {
      return { success: false, error: 'API base URL not set' };
    }
    
    // Get login_token from storage
    const userDataStr = await keytar.getPassword('tyro-app', 'user_data');
    let loginToken = null;
    
    if (userDataStr) {
      try {
        const metadata = JSON.parse(userDataStr);
        // Try to get login_token from stored data
        // It might be in the token field or we need to get it from access_token
        loginToken = await keytar.getPassword('tyro-app', 'access_token');
      } catch (e) {
        console.error('[OAUTH] Error parsing user data for logout:', e);
      }
    }
    
    if (!loginToken) {
      return { success: false, error: 'No authentication token found' };
    }
    
    // Use base URL as-is (it should include full path like /api/v11)
    let baseUrl = settings.apiBaseUrl.replace(/\/$/, '');
    
    // Remove version suffix for OAuth endpoints
    if (baseUrl.match(/\/v\d+$/)) {
      baseUrl = baseUrl.replace(/\/v\d+$/, '');
    }
    
    const logoutUrl = `${baseUrl}/auth/device/logout`;
    console.log('[OAUTH] Calling logout API:', logoutUrl);
    
    const axiosModule = await import('axios');
    const axios = axiosModule.default;
    
    const response = await axios.post(
      logoutUrl,
      {},
      {
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Authorization': `Bearer ${loginToken}`,
        },
        timeout: 30000,
      }
    );
    
    if (response.status === 200 && response.data?.result === true) {
      console.log('[OAUTH] ✅ Device logout successful:', response.data.message);
      return {
        success: true,
        message: response.data.message || 'Logged out and device unlinked successfully',
      };
    } else {
      console.warn('[OAUTH] ⚠️ Logout API returned unexpected response:', response.data);
      return {
        success: false,
        error: response.data?.message || 'Logout failed',
      };
    }
  } catch (error) {
    console.error('[OAUTH] Error calling logout API:', error);
    
    if (error.response) {
      const status = error.response.status;
      const data = error.response.data;
      
      if (status === 401) {
        return {
          success: false,
          error: 'Unauthorized - token may be expired',
        };
      }
      
      return {
        success: false,
        error: data?.message || `Logout failed (${status})`,
      };
    }
    
    return {
      success: false,
      error: error.message || 'Failed to call logout API',
    };
  }
});

// Get OAuth access token (for API service in renderer)
ipcMain.handle('oauth-get-access-token', async () => {
  try {
    const keytar = require('keytar');
    const accessToken = await keytar.getPassword('tyro-app', 'access_token');
    const userDataStr = await keytar.getPassword('tyro-app', 'user_data');
    
    if (!accessToken) {
      return { token: null };
    }
    
    // Check if expired
    let isExpired = false;
    if (userDataStr) {
      try {
        const metadata = JSON.parse(userDataStr);
        if (metadata.expires_at && Date.now() >= metadata.expires_at) {
          isExpired = true;
        }
      } catch (e) {
        // Ignore parse errors
      }
    }
    
    return {
      token: isExpired ? null : accessToken,
      expired: isExpired,
    };
  } catch (error) {
    return { token: null, error: error.message };
  }
});

// Get OAuth login token (JWT token with workspace info, for workspace-specific APIs)
ipcMain.handle('oauth-get-login-token', async () => {
  try {
    const keytar = require('keytar');
    // login_token (JWT) is stored as refresh_token
    const loginToken = await keytar.getPassword('tyro-app', 'refresh_token');
    const userDataStr = await keytar.getPassword('tyro-app', 'user_data');
    
    // Validate that we have a JWT token (starts with 'eyJ' and has 3 segments)
    let validJWT = false;
    if (loginToken) {
      const parts = loginToken.split('.');
      validJWT = loginToken.startsWith('eyJ') && parts.length === 3;
      if (!validJWT) {
        console.warn('[OAUTH] refresh_token is not a valid JWT, checking access_token');
      }
    }
    
    // If refresh_token is not a valid JWT, try access_token
    let tokenToUse = loginToken;
    if (!validJWT) {
      const accessToken = await keytar.getPassword('tyro-app', 'access_token');
      if (accessToken) {
        const parts = accessToken.split('.');
        const isJWT = accessToken.startsWith('eyJ') && parts.length === 3;
        if (isJWT) {
          tokenToUse = accessToken;
          console.log('[OAUTH] Using access_token as JWT login_token');
        } else {
          console.warn('[OAUTH] Neither token is a valid JWT. access_token:', accessToken?.substring(0, 20) + '...');
        }
      }
    } else {
      console.log('[OAUTH] Using refresh_token as JWT login_token');
    }
    
    if (!tokenToUse) {
      return { token: null, error: 'No token found' };
    }
    
    // Check if expired
    let isExpired = false;
    if (userDataStr) {
      try {
        const metadata = JSON.parse(userDataStr);
        if (metadata.expires_at && Date.now() >= metadata.expires_at) {
          isExpired = true;
        }
      } catch (e) {
        // Ignore parse errors
      }
    }
    
    return {
      token: isExpired ? null : tokenToUse,
      expired: isExpired,
    };
  } catch (error) {
    return { token: null, error: error.message };
  }
});

// Sync single task tracking data to API
ipcMain.handle('sync-task-tracking', async (event, projectId, taskId) => {
  try {
    const store = await initStore();
    const settings = store.get('settings', {});
    
    if (!settings.apiEnabled || !settings.apiBaseUrl) {
      return { success: false, error: 'API not enabled' };
    }

    // Load task tracking data
    const taskData = loadTaskTrackingDataFromFile(projectId, taskId);
    if (!taskData) {
      return { success: false, error: 'Task data not found' };
    }

    // Dynamic import of axios
    const axiosModule = await import('axios');
    const axios = axiosModule.default;
    
    // Prepare data for API
    const apiData = {
      taskId: taskData.metadata.taskId,
      projectId: taskData.metadata.projectId,
      taskName: taskData.metadata.taskName,
      projectName: taskData.metadata.projectName,
      metadata: taskData.metadata,
      trackingData: taskData.trackingData,
    };

    // Get OAuth token or fallback to API key
    let authHeader = {};
    try {
      const keytar = require('keytar');
      const accessToken = await keytar.getPassword('tyro-app', 'access_token');
      if (accessToken) {
        // Check if expired
        const userDataStr = await keytar.getPassword('tyro-app', 'user_data');
        let isExpired = false;
        if (userDataStr) {
          try {
            const metadata = JSON.parse(userDataStr);
            if (metadata.expires_at && Date.now() >= metadata.expires_at) {
              isExpired = true;
            }
          } catch (e) {
            // Ignore parse errors
          }
        }
        if (!isExpired) {
          authHeader = { Authorization: `Bearer ${accessToken}` };
        } else if (settings.apiKey) {
          authHeader = { Authorization: `Bearer ${settings.apiKey}` };
        }
      } else if (settings.apiKey) {
        authHeader = { Authorization: `Bearer ${settings.apiKey}` };
      }
    } catch (e) {
      // Fallback to API key if keytar fails
      if (settings.apiKey) {
        authHeader = { Authorization: `Bearer ${settings.apiKey}` };
      }
    }
    
    // Send to API
    const response = await axios.post(
      `${settings.apiBaseUrl}/tracking/tasks/${projectId}/${taskId}`,
      apiData,
      {
        timeout: 30000,
        headers: {
          'Content-Type': 'application/json',
          ...authHeader,
        },
      }
    );

    return { success: true };
  } catch (error) {
    console.error('[API-SYNC] Error syncing task:', error);
    return { 
      success: false, 
      error: error.response?.data?.message || error.message || 'Sync failed' 
    };
  }
});

// Sync all tasks to API
ipcMain.handle('sync-all-tasks', async () => {
  try {
    const store = await initStore();
    const settings = store.get('settings', {});
    
    if (!settings.apiEnabled || !settings.apiBaseUrl) {
      return { success: false, error: 'API not enabled', synced: 0, errors: 0 };
    }

    // Get all today's tasks - need to call the function directly
    const projectRoot = path.join(__dirname, '..');
    const trackingDataPath = path.join(projectRoot, 'tracking-data');
    
    if (!fs.existsSync(trackingDataPath)) {
      return { success: true, synced: 0, errors: 0 };
    }

    // Find all task files
    const taskFiles = findAllTaskFiles(trackingDataPath);
    
    if (taskFiles.length === 0) {
      return { success: true, synced: 0, errors: 0 };
    }

    // Dynamic import of axios
    const axiosModule = await import('axios');
    const axios = axiosModule.default;

    let synced = 0;
    let errors = 0;

    // Sync each task
    for (const taskFile of taskFiles) {
      try {
        const taskData = loadTaskTrackingDataFromFile(taskFile.projectId, taskFile.taskId);
        if (!taskData) {
          errors++;
          continue;
        }

        const apiData = {
          taskId: taskData.metadata.taskId,
          projectId: taskData.metadata.projectId,
          taskName: taskData.metadata.taskName,
          projectName: taskData.metadata.projectName,
          metadata: taskData.metadata,
          trackingData: taskData.trackingData,
        };

        // Get OAuth token or fallback to API key
        let authHeader = {};
        try {
          const keytar = require('keytar');
          const accessToken = await keytar.getPassword('tyro-app', 'access_token');
          if (accessToken) {
            // Check if expired
            const userDataStr = await keytar.getPassword('tyro-app', 'user_data');
            let isExpired = false;
            if (userDataStr) {
              try {
                const metadata = JSON.parse(userDataStr);
                if (metadata.expires_at && Date.now() >= metadata.expires_at) {
                  isExpired = true;
                }
              } catch (e) {
                // Ignore parse errors
              }
            }
            if (!isExpired) {
              authHeader = { Authorization: `Bearer ${accessToken}` };
            } else if (settings.apiKey) {
              authHeader = { Authorization: `Bearer ${settings.apiKey}` };
            }
          } else if (settings.apiKey) {
            authHeader = { Authorization: `Bearer ${settings.apiKey}` };
          }
        } catch (e) {
          // Fallback to API key if keytar fails
          if (settings.apiKey) {
            authHeader = { Authorization: `Bearer ${settings.apiKey}` };
          }
        }
        
        await axios.post(
          `${settings.apiBaseUrl}/tracking/tasks/${taskFile.projectId}/${taskFile.taskId}`,
          apiData,
          {
            timeout: 30000,
            headers: {
              'Content-Type': 'application/json',
              ...authHeader,
            },
          }
        );

        synced++;
      } catch (error) {
        console.error(`[API-SYNC] Error syncing task ${taskFile.taskId}:`, error);
        errors++;
      }
    }

    return { success: true, synced, errors };
  } catch (error) {
    console.error('[API-SYNC] Error syncing all tasks:', error);
    return { 
      success: false, 
      error: error.message || 'Sync failed',
      synced: 0,
      errors: 0
    };
  }
});

// Screenshot capture handler (no screen share needed)
ipcMain.handle('capture-screenshot', async (event, isBlurred = false) => {
  try {
    console.log('Starting screenshot capture...');
    
    // Request screen sources with proper permissions
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 1920, height: 1080 }
    });

    console.log('Screenshot sources found:', sources.length, sources.map(s => s.name));

    if (sources.length > 0) {
      // Try to find the main screen
      let primarySource = sources.find(s => 
        s.name.toLowerCase().includes('entire screen') || 
        s.name.toLowerCase().includes('screen 1') ||
        s.name.toLowerCase().includes('display 1')
      );
      
      // Fallback to first source if not found
      if (!primarySource) {
        primarySource = sources[0];
      }
      
      console.log('Using source:', primarySource.name);
      const thumbnail = primarySource.thumbnail;
      
      if (thumbnail) {
        const size = thumbnail.getSize();
        console.log('Thumbnail size:', size.width, 'x', size.height);
        
        if (size.width > 0 && size.height > 0) {
          // Convert to data URL with better quality
          const pngBuffer = thumbnail.toPNG();
          const image = nativeImage.createFromBuffer(pngBuffer);
          const dataUrl = image.toDataURL();
          console.log('Screenshot captured successfully, data URL length:', dataUrl.length);
          
          // Tag screenshot with current task
          if (currentTaskId && currentProjectId) {
            const taskData = getTaskTrackingData(currentProjectId, currentTaskId);
            if (taskData) {
              const screenshotId = `ss_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
              taskData.screenshots.push({
                id: screenshotId,
                timestamp: Date.now(),
                dataUrl: dataUrl,
                isBlurred: isBlurred,
                taskId: currentTaskId,
                projectId: currentProjectId
              });
              
              // Schedule real-time save (debounced) - saves 2 seconds after screenshot
              scheduleTaskSave(currentProjectId, currentTaskId);
              
              if (isDev) {
                console.log(`[TASK-SCREENSHOT] Tagged screenshot with task ${currentTaskId}, scheduled save`);
              }
            }
          }
          
          return dataUrl;
        } else {
          console.warn('Thumbnail has invalid dimensions');
          return null;
        }
      } else {
        console.warn('Thumbnail is null');
        return null;
      }
    } else {
      console.warn('No screen sources available - may need screen recording permissions');
      return null;
    }
  } catch (error) {
    console.error('Screenshot capture error:', error);
    return null;
  }
});

// Helper function to extract file path from code editor window title
// Pattern: "filename.ext - project - Editor" or "filename.ext - Editor"
const extractFilePathFromTitle = (title, appName) => {
  if (!title || !appName) return null;
  
  // Ensure appName is a string
  const appNameStr = typeof appName === 'string' ? appName : String(appName || '');
  const lowerApp = appNameStr.toLowerCase();
  
  // Check if it's a code editor
  const isCodeEditor = lowerApp.includes('cursor') || 
                       lowerApp.includes('code') || 
                       lowerApp.includes('vscode') ||
                       lowerApp.includes('sublime') ||
                       lowerApp.includes('atom') ||
                       lowerApp.includes('webstorm') ||
                       lowerApp.includes('intellij') ||
                       lowerApp.includes('phpstorm') ||
                       lowerApp.includes('pycharm') ||
                       lowerApp.includes('rider') ||
                       lowerApp.includes('clion') ||
                       lowerApp.includes('goland') ||
                       lowerApp.includes('rubymine') ||
                       lowerApp.includes('android studio') ||
                       lowerApp.includes('xcode');
  
  if (!isCodeEditor) return null;
  
  // Pattern: "filename.ext - project - Editor" or "filename.ext - Editor"
  // Extract the file path part (before the first " - ")
  const parts = title.split(' - ');
  if (parts.length > 0) {
    const filePart = parts[0].trim();
    // Check if it looks like a file path (has extension)
    const fileExtensionPattern = /\.([a-zA-Z0-9]+)$/;
    if (fileExtensionPattern.test(filePart)) {
      // Format as file:// URL or just return the file path
      // For now, return as file path (can be converted to file:// URL if needed)
      return `file://${filePart}`;
    }
  }
  
  return null;
};

// Helper function to extract URL from window title (for browsers)
// Improved version that extracts URLs more aggressively
const extractUrlFromTitle = (title, appName) => {
  if (!title || !appName) return null;
  
  // Ensure appName is a string
  const appNameStr = typeof appName === 'string' ? appName : String(appName || '');
  const titleStr = typeof title === 'string' ? title : String(title || '');
  
  const lowerTitle = titleStr.toLowerCase();
  const lowerApp = appNameStr.toLowerCase();
  
  // First, try to extract file path from code editors
  const filePath = extractFilePathFromTitle(title, appName);
  if (filePath) return filePath;
  
  // Check if it's a browser
  const isBrowser = lowerApp.includes('chrome') || 
                    lowerApp.includes('brave') || 
                    lowerApp.includes('firefox') || 
                    lowerApp.includes('edge') || 
                    lowerApp.includes('safari') ||
                    lowerApp.includes('opera') ||
                    lowerApp.includes('vivaldi');
  
  if (!isBrowser) return null;
  
  // Try to extract full URL patterns from title first (most accurate)
  const urlPattern = /(https?:\/\/[^\s\)]+)/i;
  const urlMatch = title.match(urlPattern);
  if (urlMatch) {
    let url = urlMatch[1];
    // Clean up URL (remove trailing punctuation)
    url = url.replace(/[.,;:!?\)]+$/, '');
    return url;
  }
  
  // Try to extract domain from title more aggressively
  // Look for patterns like "Page Title - domain.com" or "domain.com - Page Title"
  // Also handle cases like "domain.com/something"
  const domainPatterns = [
    // Pattern: "something - domain.com" or "domain.com - something"
    /(?:^|\s)([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}(?:\/[^\s\)]*)?(?:\s|$|\))/i,
    // Pattern: domain.com/path
    /([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}(?:\/[^\s\)]*)?/i,
  ];
  
  for (const pattern of domainPatterns) {
    const domainMatch = title.match(pattern);
    if (domainMatch) {
      let domain = domainMatch[0].trim();
      // Remove trailing punctuation
      domain = domain.replace(/[.,;:!?\)]+$/, '');
      
      // Exclude common false positives and browser names
      const excluded = ['localhost', 'chrome', 'brave', 'firefox', 'edge', 'safari', 'opera', 'vivaldi', 
                        'google', 'microsoft', 'mozilla', 'windows', 'macos'];
      const isExcluded = excluded.some(ex => domain.toLowerCase().includes(ex));
      
      if (!isExcluded && 
          !domain.includes(' ') && 
          domain.length > 4 && 
          domain.length < 200) {
        // If it doesn't start with http, add it
        if (!domain.startsWith('http://') && !domain.startsWith('https://')) {
          return `https://${domain}`;
        }
        return domain;
      }
    }
  }
  
  // Check for common sites in title (improved matching with more sites)
  // Expanded list with AI tools, development tools, and common services
  const sitePatterns = [
    { pattern: /youtube|youtu\.be/i, url: (t) => {
      const videoIdMatch = t.match(/watch\?v=([a-zA-Z0-9_-]+)/i);
      return videoIdMatch ? `https://www.youtube.com/watch?v=${videoIdMatch[1]}` : 'https://www.youtube.com';
    }},
    { pattern: /github/i, url: () => 'https://github.com' },
    { pattern: /stackoverflow|stack overflow/i, url: () => 'https://stackoverflow.com' },
    { pattern: /reddit/i, url: () => 'https://www.reddit.com' },
    { pattern: /twitter|x\.com/i, url: () => 'https://twitter.com' },
    { pattern: /facebook/i, url: () => 'https://www.facebook.com' },
    { pattern: /instagram/i, url: () => 'https://www.instagram.com' },
    { pattern: /linkedin/i, url: () => 'https://www.linkedin.com' },
    { pattern: /netflix/i, url: () => 'https://www.netflix.com' },
    { pattern: /discord/i, url: () => 'https://discord.com' },
    { pattern: /slack/i, url: () => 'https://slack.com' },
    { pattern: /gmail|google mail/i, url: () => 'https://mail.google.com' },
    { pattern: /outlook|microsoft mail/i, url: () => 'https://outlook.com' },
    { pattern: /notion/i, url: () => 'https://notion.so' },
    { pattern: /figma/i, url: () => 'https://figma.com' },
    { pattern: /zoom/i, url: () => 'https://zoom.us' },
    { pattern: /teams/i, url: () => 'https://teams.microsoft.com' },
    { pattern: /amazon/i, url: () => 'https://www.amazon.com' },
    { pattern: /ebay/i, url: () => 'https://www.ebay.com' },
    { pattern: /wikipedia/i, url: () => 'https://www.wikipedia.org' },
    { pattern: /medium/i, url: () => 'https://medium.com' },
    { pattern: /pinterest/i, url: () => 'https://www.pinterest.com' },
    { pattern: /tumblr/i, url: () => 'https://www.tumblr.com' },
    { pattern: /spotify/i, url: () => 'https://open.spotify.com' },
    { pattern: /soundcloud/i, url: () => 'https://soundcloud.com' },
    // AI Tools
    { pattern: /\bclaude\b/i, url: () => 'https://claude.ai' },
    { pattern: /\bchatgpt|openai\b/i, url: () => 'https://chat.openai.com' },
    { pattern: /\bperplexity\b/i, url: () => 'https://www.perplexity.ai' },
    { pattern: /\bcopilot\b/i, url: () => 'https://copilot.microsoft.com' },
    { pattern: /\bgemini\b/i, url: () => 'https://gemini.google.com' },
    // Development Tools
    { pattern: /\bvercel\b/i, url: () => 'https://vercel.com' },
    { pattern: /\bnetlify\b/i, url: () => 'https://www.netlify.com' },
    { pattern: /\bheroku\b/i, url: () => 'https://www.heroku.com' },
    { pattern: /\baws\b/i, url: () => 'https://aws.amazon.com' },
    { pattern: /\bazure\b/i, url: () => 'https://azure.microsoft.com' },
    { pattern: /\bcloudflare\b/i, url: () => 'https://www.cloudflare.com' },
    { pattern: /\bdocker\b/i, url: () => 'https://www.docker.com' },
    { pattern: /\bkubernetes\b/i, url: () => 'https://kubernetes.io' },
    // Code Platforms
    { pattern: /\bgitlab\b/i, url: () => 'https://gitlab.com' },
    { pattern: /\bbitbucket\b/i, url: () => 'https://bitbucket.org' },
    { pattern: /\bcode\.sandbox|sandbox\b/i, url: () => 'https://codesandbox.io' },
    { pattern: /\bstackblitz\b/i, url: () => 'https://stackblitz.com' },
    { pattern: /\breplit\b/i, url: () => 'https://replit.com' },
    // Design Tools
    { pattern: /\bcanva\b/i, url: () => 'https://www.canva.com' },
    { pattern: /\badobe\b/i, url: () => 'https://www.adobe.com' },
    { pattern: /\bsketch\b/i, url: () => 'https://www.sketch.com' },
    // Productivity
    { pattern: /\btrello\b/i, url: () => 'https://trello.com' },
    { pattern: /\basana\b/i, url: () => 'https://asana.com' },
    { pattern: /\bjira\b/i, url: () => 'https://www.atlassian.com/software/jira' },
    { pattern: /\blinear\b/i, url: () => 'https://linear.app' },
    { pattern: /\bclickup\b/i, url: () => 'https://clickup.com' },
    // Communication
    { pattern: /\bwhatsapp\b/i, url: () => 'https://web.whatsapp.com' },
    { pattern: /\btelegram\b/i, url: () => 'https://web.telegram.org' },
    { pattern: /\bsignal\b/i, url: () => 'https://signal.org' },
    // Documentation
    { pattern: /\bconfluence\b/i, url: () => 'https://www.atlassian.com/software/confluence' },
    { pattern: /\bwikimedia\b/i, url: () => 'https://www.wikimedia.org' },
  ];
  
  for (const site of sitePatterns) {
    if (site.pattern.test(title)) {
      return typeof site.url === 'function' ? site.url(title) : site.url;
    }
  }
  
  // Last resort: try to find any domain-like pattern in the title
  // This is more aggressive and might catch more URLs
  const anyDomainPattern = /([a-zA-Z0-9][a-zA-Z0-9-]*[a-zA-Z0-9]*\.)+[a-zA-Z]{2,}/i;
  const anyDomainMatch = title.match(anyDomainPattern);
  if (anyDomainMatch) {
    const domain = anyDomainMatch[0];
    // Only return if it looks like a real domain (not too short, not browser-related)
    if (domain.length > 5 && 
        domain.length < 100 &&
        !domain.toLowerCase().includes('chrome') &&
        !domain.toLowerCase().includes('brave') &&
        !domain.toLowerCase().includes('firefox') &&
        !domain.toLowerCase().includes('edge')) {
      return `https://${domain}`;
    }
  }
  
  // Additional fallback: Try to extract site name from common patterns
  // Pattern: "Page Title - SiteName - Browser" or "SiteName - Page Title"
  // This helps when site name is mentioned but not as a domain
  const siteNamePatterns = [
    // Look for standalone site names (word boundaries to avoid partial matches)
    { name: 'claude', domain: 'claude.ai' },
    { name: 'chatgpt', domain: 'chat.openai.com' },
    { name: 'openai', domain: 'openai.com' },
    { name: 'perplexity', domain: 'www.perplexity.ai' },
    { name: 'gemini', domain: 'gemini.google.com' },
    { name: 'copilot', domain: 'copilot.microsoft.com' },
  ];
  
  for (const site of siteNamePatterns) {
    // Use word boundary to match whole words only
    const siteRegex = new RegExp(`\\b${site.name}\\b`, 'i');
    if (siteRegex.test(title)) {
      return `https://${site.domain}`;
    }
  }
  
  return null;
};

// Get active window info
ipcMain.handle('get-active-window', async () => {
  try {
    // Try active-win first
    const win = await getActiveWindow();
    if (win) {
      const url = win.url || extractUrlFromTitle(win.title, win.owner);
      return {
        title: win.title || 'Unknown',
        owner: win.owner || 'Unknown',
        url: url,
        app: win.owner || win.title || 'Unknown'
      };
    }
    
    // Fallback to Windows PowerShell method
    if (process.platform === 'win32') {
      const windowInfo = await getActiveWindowWindows();
      if (windowInfo) {
        // Try to extract URL from title for browsers
        const extractedUrl = extractUrlFromTitle(windowInfo.title, windowInfo.app);
        return {
          ...windowInfo,
          url: extractedUrl || windowInfo.url
        };
      }
    }
    
    return { title: 'Unknown', owner: 'Unknown', url: null, app: 'Unknown' };
  } catch (error) {
    console.error('Error getting active window:', error);
    return { title: 'Unknown', owner: 'Unknown', url: null, app: 'Unknown' };
  }
});

// Process activity and get categorized response
// Note: Processing happens in renderer process for better compatibility
// This handler just passes through - actual processing is done in renderer
ipcMain.handle('process-activity', async (event, input) => {
  // The actual processing will be done in the renderer process
  // This is just a pass-through for consistency
  // The renderer should use the activityProcessor service directly
  return null; // Renderer should handle processing
});

// Get activity insights
// Note: Insights are calculated in renderer process
ipcMain.handle('get-activity-insights', async (event, timeWindow) => {
  // The actual processing will be done in the renderer process
  return null; // Renderer should handle processing
});

// Helper function to safely execute PowerShell commands with better error handling
const execPowerShell = async (command, options = {}) => {
  try {
    const result = await execAsync(command, {
      timeout: options.timeout || 2000,
      maxBuffer: options.maxBuffer || 1024,
      encoding: 'utf8',
      ...options
    });
    return result;
  } catch (error) {
    // Extract error details from exec error object
    const errorDetails = {
      message: error.message,
      code: error.code,
      signal: error.signal,
      stderr: error.stderr || '',
      stdout: error.stdout || ''
    };
    // Create a new error with all details
    const enhancedError = new Error(errorDetails.message);
    Object.assign(enhancedError, errorDetails);
    throw enhancedError;
  }
};

// Windows API-based keyboard tracking fallback (Polling method with transition detection)
let keyboardTrackingInterval = null;
let lastKeyStates = new Map(); // Map<keyCode, wasPressed>

const initKeyboardTrackingWindows = async () => {
  if (process.platform !== 'win32') return;
  
  // Check if PowerShell is available
  try {
    await execAsync('powershell -Command "exit 0"', { timeout: 1000 });
  } catch (error) {
    console.error('[KEY-WIN] PowerShell is not available:', error.message);
    return;
  }
  
  try {
    const tmpDir = os.tmpdir();
    const scriptPath = path.join(tmpDir, 'keyboard-tracker.ps1');
    
    // Create reusable script that outputs key states
    // Uses GetAsyncKeyState - bit 15 (0x8000) = key is currently down
    // Bit 0 (0x0001) = key was pressed since last call (transition bit)
    const psScript = `Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public class KeyChecker {
  [DllImport("user32.dll")]
  public static extern short GetAsyncKeyState(int vKey);
  
  public static bool IsKeyPressed(int vKey) {
    short state = GetAsyncKeyState(vKey);
    // Check if key is currently down (bit 15) OR was just pressed (bit 0)
    return (state & 0x8000) != 0 || (state & 0x0001) != 0;
  }
}
'@
$keys = @()
# Check A-Z (65-90), 0-9 (48-57), Space (32), Enter (13), Tab (9), Backspace (8)
for ($i = 65; $i -le 90; $i++) { if ([KeyChecker]::IsKeyPressed($i)) { $keys += $i } }
for ($i = 48; $i -le 57; $i++) { if ([KeyChecker]::IsKeyPressed($i)) { $keys += $i } }
if ([KeyChecker]::IsKeyPressed(32)) { $keys += 32 }  # Space
if ([KeyChecker]::IsKeyPressed(13)) { $keys += 13 }  # Enter
if ([KeyChecker]::IsKeyPressed(9)) { $keys += 9 }    # Tab
if ([KeyChecker]::IsKeyPressed(8)) { $keys += 8 }    # Backspace
$keys -join ','`;

    // Write script with UTF-8 encoding (PowerShell prefers UTF-8)
    fs.writeFileSync(scriptPath, psScript, { encoding: 'utf8' });
    
    // Verify script file was created
    if (!fs.existsSync(scriptPath)) {
      throw new Error(`Failed to create keyboard tracking script at ${scriptPath}`);
    }
    
    // Test script execution once before starting polling
    try {
      // Escape path for PowerShell (handle spaces and special characters)
      const escapedPath = scriptPath.replace(/"/g, '""').replace(/'/g, "''");
      const testResult = await execPowerShell(
        `powershell -NoProfile -ExecutionPolicy Bypass -File "${escapedPath}"`,
        { timeout: 2000, maxBuffer: 1024 }
      );
      if (isDev) {
        console.log('[KEY-WIN] Script test successful');
      }
    } catch (testError) {
      console.error('[KEY-WIN] Script test failed:', testError.message);
      if (testError.stderr) {
        console.error('[KEY-WIN] PowerShell stderr:', testError.stderr);
      }
      if (testError.stdout) {
        console.error('[KEY-WIN] PowerShell stdout:', testError.stdout);
      }
      throw new Error(`Keyboard tracking script validation failed: ${testError.message}`);
    }
    
    // Use polling method to detect keyboard activity
    // This checks keyboard state every 50ms for better responsiveness
    keyboardTrackingInterval = setInterval(async () => {
      try {
        // Verify script still exists before executing
        if (!fs.existsSync(scriptPath)) {
          if (isDev) {
            console.warn('[KEY-WIN] Script file missing, recreating...');
          }
          fs.writeFileSync(scriptPath, psScript, { encoding: 'utf8' });
        }
        
        // Escape path for PowerShell (handle spaces and special characters)
        const escapedPath = scriptPath.replace(/"/g, '""').replace(/'/g, "''");
        const { stdout, stderr } = await execPowerShell(
          `powershell -NoProfile -ExecutionPolicy Bypass -File "${escapedPath}"`,
          { timeout: 1000, maxBuffer: 1024 }
        );
        
        if (stderr && stderr.trim() && isDev) {
          console.warn('[KEY-WIN] PowerShell stderr:', stderr.trim());
        }
        
        const result = stdout.trim();
        const currentKeys = new Set();
        
        if (result) {
          result.split(',').forEach(k => {
            const keyCode = parseInt(k);
            if (!isNaN(keyCode)) {
              currentKeys.add(keyCode);
            }
          });
        }
        
        // Detect new key presses (keys that are pressed now but weren't before)
        currentKeys.forEach(keyCode => {
          const wasPressed = lastKeyStates.get(keyCode) || false;
          if (!wasPressed) {
            // New key press detected!
            keystrokeCount++; // Global counter for idle detection
            lastActivityTimestamp = Date.now();
            
            // Increment per-window counter if we have a current window
            if (currentWindowKey) {
              const stats = getWindowStats(currentWindowKey);
              stats.keystrokes++;
            }
            
            // Increment per-task counter if we have a current task
            if (currentTaskId && currentProjectId) {
              const taskStats = getTaskStats(currentProjectId, currentTaskId);
              if (taskStats) {
                taskStats.keystrokes++;
              }
            }
            
            if (isTrackingActive && mainWindow) {
              mainWindow.webContents.send('keystroke-update', keystrokeCount);
            }
            if (isDev) {
              console.log('[KEY-WIN] Keystroke detected (keyCode:', keyCode, ') | Total:', keystrokeCount);
            }
          }
          // Update state: key is now pressed
          lastKeyStates.set(keyCode, true);
        });
        
        // Mark keys that are no longer pressed
        lastKeyStates.forEach((wasPressed, keyCode) => {
          if (!currentKeys.has(keyCode)) {
            lastKeyStates.set(keyCode, false);
          }
        });
        
      } catch (error) {
        // Only log errors occasionally to avoid spam (every 50th error)
        if (isDev && (!keyboardTrackingInterval._errorCount || keyboardTrackingInterval._errorCount % 50 === 0)) {
          console.error('[KEY-WIN] Polling error:', error.message);
          if (error.stderr) {
            console.error('[KEY-WIN] PowerShell stderr:', error.stderr);
          }
          if (error.stdout) {
            console.error('[KEY-WIN] PowerShell stdout:', error.stdout);
          }
        }
        if (!keyboardTrackingInterval._errorCount) {
          keyboardTrackingInterval._errorCount = 0;
        }
        keyboardTrackingInterval._errorCount++;
      }
    }, 200); // Check every 200ms (reduced from 50ms to prevent resource exhaustion)
    
    console.log('✅ Windows API keyboard tracking initialized (polling method)');
    if (isDev) {
      console.log('   Script path:', scriptPath);
    }
  } catch (error) {
    console.error('Failed to initialize Windows keyboard tracking:', error.message);
    if (isDev) {
      console.error('Full error:', error);
      if (error.stderr) {
        console.error('PowerShell stderr:', error.stderr);
      }
    }
  }
};

// Initialize system-wide tracking using uiohook-napi (unified keyboard and mouse)
const initSystemTracking = () => {
  try {
    if (!uIOhook) {
      const uiohookModule = require('uiohook-napi');
      uIOhook = uiohookModule.uIOhook || uiohookModule;
      UiohookKey = uiohookModule.UiohookKey;
    }
    
    // Keyboard Listener
    uIOhook.on('keydown', (e) => {
      keystrokeCount++; // Global counter for idle detection
      lastActivityTimestamp = Date.now();
      
      // Increment per-window counter if we have a current window
      if (currentWindowKey) {
        const stats = getWindowStats(currentWindowKey);
        stats.keystrokes++;
      }
      
      // Increment per-task counter if we have a current task
      if (currentTaskId && currentProjectId) {
        const taskData = getTaskTrackingData(currentProjectId, currentTaskId);
        if (taskData) {
          taskData.keystrokes++;
          
          // Also track per-window within task
          if (currentWindowKey) {
            if (!taskData.activeWindows.has(currentWindowKey)) {
              taskData.activeWindows.set(currentWindowKey, {
                keystrokes: 0,
                mouseClicks: 0,
                timeSpent: 0,
                startTime: Date.now(),
                lastSeen: Date.now(),
                urls: []
              });
            }
            const windowData = taskData.activeWindows.get(currentWindowKey);
            // Increment keystrokes (this is current session only, will be merged on save)
            windowData.keystrokes = (windowData.keystrokes || 0) + 1;
            windowData.lastSeen = Date.now();
          }
          
          // Schedule real-time save (debounced)
          scheduleTaskSave(currentProjectId, currentTaskId);
        }
      }
      
      if (isTrackingActive && mainWindow) {
        mainWindow.webContents.send('keystroke-update', keystrokeCount);
      }
      if (isDev) {
        console.log('[KEY] Pressed keycode:', e.keycode, '| Total keystrokes:', keystrokeCount);
      }
    });

    // Mouse Listener
    uIOhook.on('mousedown', (e) => {
      // e.button: 1 = left, 2 = right, 3 = middle
      if (e.button === 1) { 
        mouseClickCount++; // Global counter for idle detection
        lastActivityTimestamp = Date.now();
        
        // Increment per-window counter if we have a current window
        if (currentWindowKey) {
          const stats = getWindowStats(currentWindowKey);
          stats.clicks++;
        }
        
        // Increment per-task counter if we have a current task
        if (currentTaskId && currentProjectId) {
          const taskData = getTaskTrackingData(currentProjectId, currentTaskId);
          if (taskData) {
            taskData.mouseClicks++;
            
            // Also track per-window within task
            if (currentWindowKey) {
              if (!taskData.activeWindows.has(currentWindowKey)) {
                taskData.activeWindows.set(currentWindowKey, {
                  keystrokes: 0,
                  mouseClicks: 0,
                  timeSpent: 0,
                  startTime: Date.now(),
                  lastSeen: Date.now(),
                  urls: []
                });
              }
              const windowData = taskData.activeWindows.get(currentWindowKey);
              // Increment mouse clicks (this is current session only, will be merged on save)
              windowData.mouseClicks = (windowData.mouseClicks || 0) + 1;
              windowData.lastSeen = Date.now();
            }
            
            // Schedule real-time save (debounced)
            scheduleTaskSave(currentProjectId, currentTaskId);
          }
        }
        
        if (isTrackingActive && mainWindow) {
          mainWindow.webContents.send('mouseclick-update', mouseClickCount);
        }
        if (isDev) {
          console.log('[MOUSE] Left click detected | Total clicks:', mouseClickCount);
        }
      }
    });

    uIOhook.start();
    isUiohookInitialized = true;
    console.log('✅ System-wide tracking initialized (uiohook-napi)');
    return true;
  } catch (error) {
    console.error('Failed to initialize uiohook-napi:', error.message);
    if (isDev) {
      console.error('Full error:', error);
    }
    isUiohookInitialized = false;
    return false;
  }
};

// Windows API-based mouse tracking fallback (Polling method)
let mouseTrackingInterval = null;
let lastMouseState = false;

const initMouseTrackingWindows = async () => {
  if (process.platform !== 'win32') return;
  
  // Check if PowerShell is available
  try {
    await execAsync('powershell -Command "exit 0"', { timeout: 1000 });
  } catch (error) {
    console.error('[MOUSE-WIN] PowerShell is not available:', error.message);
    return;
  }
  
  try {
    const tmpDir = os.tmpdir();
    const scriptPath = path.join(tmpDir, 'mouse-tracker.ps1');
    
    // Create reusable script that checks mouse button state
    // VK_LBUTTON = 0x01, VK_RBUTTON = 0x02, VK_MBUTTON = 0x04
    const psScript = `Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public class MouseChecker {
  [DllImport("user32.dll")]
  public static extern short GetAsyncKeyState(int vKey);
  
  public static bool IsLeftMousePressed() {
    short state = GetAsyncKeyState(0x01); // VK_LBUTTON
    // Check if button is currently down (bit 15) OR was just pressed (bit 0)
    return (state & 0x8000) != 0 || (state & 0x0001) != 0;
  }
}
'@
if ([MouseChecker]::IsLeftMousePressed()) { Write-Output "1" } else { Write-Output "0" }`;

    // Write script with UTF-8 encoding (PowerShell prefers UTF-8)
    fs.writeFileSync(scriptPath, psScript, { encoding: 'utf8' });
    
    // Verify script file was created
    if (!fs.existsSync(scriptPath)) {
      throw new Error(`Failed to create mouse tracking script at ${scriptPath}`);
    }
    
    // Test script execution once before starting polling
    try {
      // Escape path for PowerShell (handle spaces and special characters)
      const escapedPath = scriptPath.replace(/"/g, '""').replace(/'/g, "''");
      const testResult = await execPowerShell(
        `powershell -NoProfile -ExecutionPolicy Bypass -File "${escapedPath}"`,
        { timeout: 2000, maxBuffer: 1024 }
      );
      if (isDev) {
        console.log('[MOUSE-WIN] Script test successful');
      }
    } catch (testError) {
      console.error('[MOUSE-WIN] Script test failed:', testError.message);
      if (testError.stderr) {
        console.error('[MOUSE-WIN] PowerShell stderr:', testError.stderr);
      }
      if (testError.stdout) {
        console.error('[MOUSE-WIN] PowerShell stdout:', testError.stdout);
      }
      throw new Error(`Mouse tracking script validation failed: ${testError.message}`);
    }
    
    // Use polling method to detect mouse clicks
    // This checks mouse button state every 30ms for very responsive click detection
    mouseTrackingInterval = setInterval(async () => {
      try {
        // Verify script still exists before executing
        if (!fs.existsSync(scriptPath)) {
          if (isDev) {
            console.warn('[MOUSE-WIN] Script file missing, recreating...');
          }
          fs.writeFileSync(scriptPath, psScript, { encoding: 'utf8' });
        }
        
        // Escape path for PowerShell (handle spaces and special characters)
        const escapedPath = scriptPath.replace(/"/g, '""').replace(/'/g, "''");
        const { stdout, stderr } = await execPowerShell(
          `powershell -NoProfile -ExecutionPolicy Bypass -File "${escapedPath}"`,
          { timeout: 1000, maxBuffer: 1024 }
        );
        
        if (stderr && stderr.trim() && isDev) {
          console.warn('[MOUSE-WIN] PowerShell stderr:', stderr.trim());
        }
        
        const result = stdout.trim();
        const isPressed = result === '1';
        
        // Detect click (transition from not pressed to pressed)
        if (isPressed && !lastMouseState) {
          mouseClickCount++; // Global counter for idle detection
          lastActivityTimestamp = Date.now();
          
          // Increment per-window counter if we have a current window
          if (currentWindowKey) {
            const stats = getWindowStats(currentWindowKey);
            stats.clicks++;
          }
          
          // Increment per-task counter if we have a current task
          if (currentTaskId && currentProjectId) {
            const taskStats = getTaskStats(currentProjectId, currentTaskId);
            if (taskStats) {
              taskStats.clicks++;
            }
          }
          
          if (isTrackingActive && mainWindow) {
            mainWindow.webContents.send('mouseclick-update', mouseClickCount);
          }
          if (isDev) {
            console.log('[MOUSE-WIN] Left click detected | Total:', mouseClickCount);
          }
        }
        lastMouseState = isPressed;
      } catch (error) {
        // Only log errors occasionally to avoid spam (every 50th error)
        if (isDev && (!mouseTrackingInterval._errorCount || mouseTrackingInterval._errorCount % 50 === 0)) {
          console.error('[MOUSE-WIN] Polling error:', error.message);
          if (error.stderr) {
            console.error('[MOUSE-WIN] PowerShell stderr:', error.stderr);
          }
          if (error.stdout) {
            console.error('[MOUSE-WIN] PowerShell stdout:', error.stdout);
          }
        }
        if (!mouseTrackingInterval._errorCount) {
          mouseTrackingInterval._errorCount = 0;
        }
        mouseTrackingInterval._errorCount++;
      }
    }, 200); // Check every 200ms (reduced from 30ms to prevent resource exhaustion)
    
    console.log('✅ Windows API mouse tracking initialized (polling method)');
    if (isDev) {
      console.log('   Script path:', scriptPath);
    }
  } catch (error) {
    console.error('Failed to initialize Windows mouse tracking:', error.message);
    if (isDev) {
      console.error('Full error:', error);
      if (error.stderr) {
        console.error('PowerShell stderr:', error.stderr);
      }
    }
  }
};

// Legacy function names for compatibility (now handled by initSystemTracking)
const initKeyboardTracking = async () => {
  // uiohook-napi handles both keyboard and mouse in initSystemTracking
  // This function is kept for compatibility but does nothing
  return;
};

const initMouseTracking = async () => {
  // uiohook-napi handles both keyboard and mouse in initSystemTracking
  // This function is kept for compatibility but does nothing
  return;
};

// Start activity monitoring
ipcMain.handle('start-activity-monitoring', async (event, projectId, taskId, taskName = null, projectName = null) => {
  if (activityMonitoringInterval) {
    clearInterval(activityMonitoringInterval);
  }

  // Reset global counters (for idle detection only)
  keystrokeCount = 0;
  mouseClickCount = 0;
  lastActivityTimestamp = Date.now(); // Initialize last activity timestamp
  isTrackingActive = true;
  
  // Reset per-window tracking (for display purposes)
  perWindowStats.clear();
  currentWindowKey = null;
  
  // Initialize task tracking (saves previous task, loads/creates new task)
  if (taskId && projectId) {
    await initializeTaskTracking(projectId, taskId, taskName, projectName);
  } else {
    currentProjectId = null;
    currentTaskId = null;
    if (isDev) {
      console.log('[TASK-TRACKING] No task specified - per-task tracking disabled');
    }
  }

  // Initialize system-wide tracking using uiohook-napi
  const trackingInitialized = initSystemTracking();
  
  // If uiohook-napi failed, fall back to PowerShell method (but with slower polling)
  if (!trackingInitialized && process.platform === 'win32') {
    console.warn('⚠️  uiohook-napi not initialized - falling back to Windows API method (slower polling)');
    console.warn('   This will use PowerShell polling at 200ms intervals (reduced from 30-50ms)');
    // Use Windows API fallback with slower polling to prevent resource exhaustion
    await initKeyboardTrackingWindows();
    await initMouseTrackingWindows();
  }

  // Send all windows stats every 3 seconds (separate interval)
  allWindowsUpdateInterval = setInterval(() => {
    if (mainWindow && isTrackingActive) {
      const allWindows = getAllWindowStats();
      const totalStats = {
        totalKeystrokes: Array.from(perWindowStats.values()).reduce((sum, stats) => sum + stats.keystrokes, 0),
        totalClicks: Array.from(perWindowStats.values()).reduce((sum, stats) => sum + stats.clicks, 0),
        allWindows: allWindows
      };
      mainWindow.webContents.send('all-windows-update', totalStats);
      if (isDev) {
        console.log('[ALL-WINDOWS] Sent stats for', allWindows.length, 'windows');
      }
    }
  }, 3000); // Every 3 seconds

  // Monitor active window every 1 second for better tracking
  activityMonitoringInterval = setInterval(async () => {
    try {
      // Use active-win directly (simpler pattern)
      const win = await getActiveWindow();
      
      if (win && mainWindow) {
        // Extract URL from title if not available
        // active-win returns owner as object: { name, path, processId }
        const ownerName = win.owner?.name || win.owner || 'Unknown';
        const url = win.url || extractUrlFromTitle(win.title, ownerName);
        
        // Create window key for per-window tracking
        const windowKey = getWindowKey(ownerName, win.title);
        
        // Check if window changed - if so, update time tracking for previous window
        if (windowKey !== currentWindowKey) {
          // CRITICAL FIX: Close time capsule for the previous window when switching
          if (currentWindowKey && currentTaskId && currentProjectId) {
            const taskData = getTaskTrackingData(currentProjectId, currentTaskId);
            if (taskData && taskData.activeWindows.has(currentWindowKey)) {
              const previousWindowData = taskData.activeWindows.get(currentWindowKey);
              if (previousWindowData.startTime) {
                // Initialize timeCapsules array if it doesn't exist
                if (!previousWindowData.timeCapsules) {
                  previousWindowData.timeCapsules = [];
                }
                
                // Close the current time capsule
                const endTime = Date.now();
                const startTime = previousWindowData.startTime; // Save before clearing
                const duration = Math.floor((endTime - startTime) / 1000);
                
                // Check if this capsule already exists (prevent duplicates)
                const capsuleKey = `${startTime}-${endTime}`;
                const existingCapsule = previousWindowData.timeCapsules.find(c => 
                  `${c.startTime}-${c.endTime}` === capsuleKey
                );
                
                if (!existingCapsule) {
                  // Only add if it doesn't already exist
                  previousWindowData.timeCapsules.push({
                    startTime: startTime,
                    endTime: endTime,
                    duration: duration
                  });
                  
                  if (isDev) {
                    console.log(`[WINDOW-PAUSE] Closed NEW time capsule for ${currentWindowKey}, duration: ${duration}s (total capsules: ${previousWindowData.timeCapsules.length})`);
                  }
                } else {
                  if (isDev) {
                    console.log(`[WINDOW-PAUSE] Skipped duplicate capsule for ${currentWindowKey} (already exists)`);
                  }
                }
                
                // Clear startTime to indicate window is inactive
                previousWindowData.startTime = null;
                previousWindowData.lastSeen = endTime;
              }
            }
          }
          
          if (isDev && currentWindowKey) {
            const oldStats = perWindowStats.get(currentWindowKey);
            console.log('[WINDOW-SWITCH] Switched from', currentWindowKey, 'to', windowKey);
            console.log('[WINDOW-SWITCH] Previous window stats:', oldStats ? { keystrokes: oldStats.keystrokes, clicks: oldStats.clicks } : 'none');
          } else if (isDev && !currentWindowKey) {
            console.log('[WINDOW-INIT] Initializing tracking for window:', windowKey);
          }
          
          const oldWindowKey = currentWindowKey;
          currentWindowKey = windowKey;
          
          // Initialize new window in task tracking
          if (currentTaskId && currentProjectId) {
            const taskData = getTaskTrackingData(currentProjectId, currentTaskId);
            if (taskData && !taskData.activeWindows.has(windowKey)) {
              // New window - initialize with empty time capsules array
              const startTime = Date.now();
              taskData.activeWindows.set(windowKey, {
                keystrokes: 0,
                mouseClicks: 0,
                timeSpent: 0,
                timeCapsules: [], // Array of {startTime, endTime, duration} objects
                startTime: startTime, // Current active session start time
                lastSeen: startTime,
                title: win.title || windowKey,
                urls: [],
                lastUrl: null // Track last URL to detect actual visits (not just checks)
              });
            } else if (taskData && taskData.activeWindows.has(windowKey)) {
              // Window already exists - start new time capsule if it was paused
              const windowData = taskData.activeWindows.get(windowKey);
              
              // CRITICAL: Ensure timeCapsules array exists and preserve existing capsules
              if (!windowData.timeCapsules) {
                windowData.timeCapsules = [];
              }
              
              if (!windowData.startTime) {
                // Start new time capsule - window is becoming active again
                // NOTE: We don't create a capsule here, just set startTime
                // The capsule will be created when the window closes
                windowData.startTime = Date.now();
                windowData.lastSeen = Date.now();
                
                if (isDev) {
                  console.log(`[WINDOW-RESUME] Started new time capsule for ${windowKey} (existing capsules: ${windowData.timeCapsules.length})`);
                }
              } else {
                // Window is already active - just update lastSeen
                windowData.lastSeen = Date.now();
              }
            }
          }
          
          // Get stats for new window (will create if doesn't exist)
          getWindowStats(windowKey, win.title, url);
        }
        
        // Get per-window statistics (update title and URL)
        // Always update URL even if window hasn't changed (to track URL changes)
        const windowStats = getWindowStats(windowKey, win.title, url);
        
        // If URL changed, log it for debugging
        if (url && windowStats.url !== url && isDev) {
          console.log('[URL-CHANGE]', windowKey, 'URL changed from', windowStats.url, 'to', url);
        }
        
        // Get per-task stats if we have a current task
        let taskKeystrokes = 0;
        let taskClicks = 0;
        if (currentTaskId && currentProjectId) {
          const taskData = getTaskTrackingData(currentProjectId, currentTaskId);
          if (taskData) {
            taskKeystrokes = taskData.keystrokes;
            taskClicks = taskData.mouseClicks;
            
            // CRITICAL: Update active window tracking with time spent
            if (currentWindowKey) {
              if (!taskData.activeWindows.has(currentWindowKey)) {
                const startTime = Date.now();
                taskData.activeWindows.set(currentWindowKey, {
                  keystrokes: 0,
                  mouseClicks: 0,
                  timeSpent: 0, // in seconds (will be calculated from capsules on save)
                  timeCapsules: [], // Array of {startTime, endTime, duration} objects
                  startTime: startTime, // Current active session start time
                  lastSeen: startTime,
                  title: win.title || currentWindowKey,
                  urls: [],
                  lastUrl: null // Track last URL to detect actual visits (not just checks)
                });
              }
              
              const windowData = taskData.activeWindows.get(currentWindowKey);
              
              // Initialize timeCapsules if not exists
              if (!windowData.timeCapsules) {
                windowData.timeCapsules = [];
              }
              
              // Ensure startTime is set if window is active (start new capsule if paused)
              if (!windowData.startTime) {
                windowData.startTime = Date.now();
                if (isDev) {
                  console.log(`[WINDOW-RESUME] Started new time capsule for ${currentWindowKey} in real-time update`);
                }
              }
              
              // Don't update timeSpent here - it will be calculated on save
              // Just update lastSeen
              windowData.lastSeen = Date.now();
              
              // Update window title if changed
              if (win.title && win.title !== windowData.title) {
                windowData.title = win.title;
              }
              
              // Note: Keystrokes and clicks are tracked directly in event handlers
              // perWindowStats is used for reference, but windowData.keystrokes/clicks
              // are incremented directly in uIOhook event handlers
              // On save, we'll merge with saved data properly
            }
            
            // Track URL in task's URL history
            // Always try to extract URL even if previous extraction failed (retry extraction)
            let currentUrl = url;
            if (!currentUrl) {
              currentUrl = extractUrlFromTitle(win.title, ownerName);
            }
            
            // Check if it's a browser for debug logging
            const lowerApp = (ownerName || '').toLowerCase();
            const isBrowser = lowerApp.includes('chrome') || 
                              lowerApp.includes('brave') || 
                              lowerApp.includes('firefox') || 
                              lowerApp.includes('edge') || 
                              lowerApp.includes('safari') ||
                              lowerApp.includes('opera') ||
                              lowerApp.includes('vivaldi');
            
            if (isDev && !currentUrl && isBrowser) {
              console.log(`[URL-DEBUG] Failed to extract URL from title: "${win.title}" (app: ${ownerName})`);
            }
            
            if (currentUrl) {
              const normalizedUrl = normalizeUrl(currentUrl);
              if (normalizedUrl) {
                // Check if URL already exists in history
                const urlExists = taskData.urlHistory.some(entry => 
                  normalizeUrl(entry.url) === normalizedUrl
                );
                
                if (!urlExists) {
                  taskData.urlHistory.push({
                    url: normalizedUrl,
                    title: win.title || 'Unknown',
                    timestamp: Date.now()
                  });
                  
                  // Keep only last 100 URLs
                  if (taskData.urlHistory.length > 100) {
                    taskData.urlHistory = taskData.urlHistory.slice(-100);
                  }
                  
                  if (isDev) {
                    console.log(`[TASK-URL] Added URL to task ${currentTaskId}:`, normalizedUrl, 'from title:', win.title);
                  }
                  
                  // Schedule real-time save when URL is added
                  scheduleTaskSave(currentProjectId, currentTaskId);
                }
                
                // Also track URL in active window within task
                // CRITICAL FIX: Only increment visit count when URL actually changes, not on every check
                if (currentWindowKey && taskData.activeWindows.has(currentWindowKey)) {
                  const windowData = taskData.activeWindows.get(currentWindowKey);
                  if (!windowData.urls) {
                    windowData.urls = [];
                  }
                  const urlInWindow = windowData.urls.find(u => {
                    const uNormalized = normalizeUrl(u.url);
                    return uNormalized && normalizedUrl && uNormalized === normalizedUrl;
                  });
                  if (!urlInWindow) {
                    // New URL - add it (no visit count tracking)
                    windowData.urls.push({
                      url: normalizedUrl,
                      title: win.title || 'Unknown',
                      timestamp: Date.now()
                    });
                    
                    // Track this as the current URL
                    windowData.lastUrl = normalizedUrl;
                    
                    if (isDev) {
                      console.log(`[WINDOW-URL] Added new URL to window ${currentWindowKey}:`, normalizedUrl);
                    }
                    
                    // Schedule save when new URL is added
                    scheduleTaskSave(currentProjectId, currentTaskId);
                  } else {
                    // URL already exists - just update timestamp if URL changed
                    const urlChanged = windowData.lastUrl !== normalizedUrl;
                    if (urlChanged) {
                      // URL changed - update timestamp
                      urlInWindow.timestamp = Date.now();
                      windowData.lastUrl = normalizedUrl; // Track current URL
                      
                      if (isDev) {
                        console.log(`[WINDOW-URL] URL changed in window ${currentWindowKey}:`, normalizedUrl);
                      }
                      
                      // Schedule save when URL changes
                      scheduleTaskSave(currentProjectId, currentTaskId);
                    } else {
                      // Same URL - just update timestamp
                      urlInWindow.timestamp = Date.now();
                    }
                  }
                }
              } else if (isDev) {
                console.log(`[URL-DEBUG] Failed to normalize URL:`, currentUrl);
              }
            } else {
              // No URL extracted, but check if it's a code editor with file path in title
              const lowerApp = (ownerName || '').toLowerCase();
              const isCodeEditor = lowerApp.includes('cursor') || 
                                  lowerApp.includes('code') || 
                                  lowerApp.includes('vscode') ||
                                  lowerApp.includes('sublime') ||
                                  lowerApp.includes('atom') ||
                                  lowerApp.includes('webstorm') ||
                                  lowerApp.includes('intellij');
              
              if (isCodeEditor && win.title) {
                // Extract file path from code editor title
                const filePath = extractFilePathFromTitle(win.title, ownerName);
                if (filePath) {
                  const normalizedFilePath = normalizeUrl(filePath);
                  if (normalizedFilePath && currentWindowKey && taskData.activeWindows.has(currentWindowKey)) {
                    const windowData = taskData.activeWindows.get(currentWindowKey);
                    if (!windowData.urls) {
                      windowData.urls = [];
                    }
                    const fileInWindow = windowData.urls.find(u => {
                      const uNormalized = normalizeUrl(u.url);
                      return uNormalized && normalizedFilePath && uNormalized === normalizedFilePath;
                    });
                    if (!fileInWindow) {
                      // New file path - add it (no visit count tracking)
                      windowData.urls.push({
                        url: normalizedFilePath,
                        title: win.title,
                        timestamp: Date.now()
                      });
                      
                      // Track this as the current file path
                      windowData.lastUrl = normalizedFilePath;
                      
                      if (isDev) {
                        console.log(`[WINDOW-FILE] Added new file path to window ${currentWindowKey}:`, normalizedFilePath);
                      }
                      
                      // Schedule save when new file path is added
                      scheduleTaskSave(currentProjectId, currentTaskId);
                    } else {
                      // File path already exists - just update timestamp and title if file changed
                      const fileChanged = windowData.lastUrl !== normalizedFilePath;
                      if (fileChanged) {
                        // File changed - update timestamp and title
                        fileInWindow.timestamp = Date.now();
                        fileInWindow.title = win.title; // Update title in case it changed
                        windowData.lastUrl = normalizedFilePath; // Track current file path
                        
                        if (isDev) {
                          console.log(`[WINDOW-FILE] File path changed in window ${currentWindowKey}:`, normalizedFilePath);
                        }
                        
                        // Schedule save when file path changes
                        scheduleTaskSave(currentProjectId, currentTaskId);
                      } else {
                        // Same file - just update timestamp and title
                        fileInWindow.timestamp = Date.now();
                        fileInWindow.title = win.title; // Update title in case it changed
                      }
                    }
                  }
                }
              } else if (isDev && isBrowser) {
                // Log when URL extraction fails for browsers
                console.log(`[URL-DEBUG] No URL extracted for browser window: "${win.title}" (app: ${ownerName})`);
              }
            }
          }
        }
        
        const currentWindow = {
          title: win.title || 'Unknown',
          owner: ownerName,
          url: url,
          app: ownerName,
          keystrokes: windowStats.keystrokes, // Per-window keystrokes
          mouseClicks: windowStats.clicks, // Per-window clicks
          // Per-task stats (cumulative across all windows for this task)
          taskKeystrokes: taskKeystrokes,
          taskClicks: taskClicks,
          // Also include global counters for backward compatibility
          globalKeystrokes: keystrokeCount,
          globalClicks: mouseClickCount
        };

        // Always send update (don't check if changed, to ensure real-time tracking)
        lastActiveWindow = currentWindow;
        mainWindow.webContents.send('activity-update', currentWindow);
        
        console.log('[ACTIVITY] App:', currentWindow.app, '| Title:', currentWindow.title.substring(0, 50), '| URL:', currentWindow.url || 'N/A', '| Window Keys:', windowStats.keystrokes, '| Window Clicks:', windowStats.clicks, '| Task Keys:', taskKeystrokes, '| Task Clicks:', taskClicks);
      } else {
        // Fallback to Windows PowerShell method if active-win didn't work
        if (!win && process.platform === 'win32') {
          const windowInfo = await getActiveWindowWindows();
          if (windowInfo && mainWindow) {
            // Extract URL from title if not available
            const url = windowInfo.url || extractUrlFromTitle(windowInfo.title, windowInfo.app);
            
            // Create window key for per-window tracking
            const windowKey = getWindowKey(windowInfo.app, windowInfo.title);
            
            // Check if window changed - if so, update time tracking for previous window
            if (windowKey !== currentWindowKey) {
              // CRITICAL FIX: Close time capsule for the previous window when switching (PowerShell path)
              if (currentWindowKey && currentTaskId && currentProjectId) {
                const taskData = getTaskTrackingData(currentProjectId, currentTaskId);
                if (taskData && taskData.activeWindows.has(currentWindowKey)) {
                  const previousWindowData = taskData.activeWindows.get(currentWindowKey);
                  if (previousWindowData.startTime) {
                    // Initialize timeCapsules array if it doesn't exist
                    if (!previousWindowData.timeCapsules) {
                      previousWindowData.timeCapsules = [];
                    }
                    
                    // Close the current time capsule
                    const endTime = Date.now();
                    const startTime = previousWindowData.startTime; // Save before clearing
                    const duration = Math.floor((endTime - startTime) / 1000);
                    
                    // Check if this capsule already exists (prevent duplicates)
                    const capsuleKey = `${startTime}-${endTime}`;
                    const existingCapsule = previousWindowData.timeCapsules.find(c => 
                      `${c.startTime}-${c.endTime}` === capsuleKey
                    );
                    
                    if (!existingCapsule) {
                      // Only add if it doesn't already exist
                      previousWindowData.timeCapsules.push({
                        startTime: startTime,
                        endTime: endTime,
                        duration: duration
                      });
                      
                      if (isDev) {
                        console.log(`[WINDOW-PAUSE] Closed NEW time capsule for ${currentWindowKey} (PowerShell), duration: ${duration}s (total capsules: ${previousWindowData.timeCapsules.length})`);
                      }
                    } else {
                      if (isDev) {
                        console.log(`[WINDOW-PAUSE] Skipped duplicate capsule for ${currentWindowKey} (PowerShell) (already exists)`);
                      }
                    }
                    
                    // Clear startTime to indicate window is inactive
                    previousWindowData.startTime = null;
                    previousWindowData.lastSeen = endTime;
                  }
                }
              }
              
              if (isDev && currentWindowKey) {
                const oldStats = perWindowStats.get(currentWindowKey);
                console.log('[WINDOW-SWITCH] Switched from', currentWindowKey, 'to', windowKey, '(PowerShell)');
                console.log('[WINDOW-SWITCH] Previous window stats:', oldStats ? { keystrokes: oldStats.keystrokes, clicks: oldStats.clicks } : 'none');
              } else if (isDev && !currentWindowKey) {
                console.log('[WINDOW-INIT] Initializing tracking for window:', windowKey, '(PowerShell)');
              }
              
              const oldWindowKey = currentWindowKey;
              currentWindowKey = windowKey;
              
              // Initialize new window in task tracking
              if (currentTaskId && currentProjectId) {
                const taskData = getTaskTrackingData(currentProjectId, currentTaskId);
                if (taskData && !taskData.activeWindows.has(windowKey)) {
                  // New window - initialize with empty time capsules array
                  const startTime = Date.now();
                  taskData.activeWindows.set(windowKey, {
                    keystrokes: 0,
                    mouseClicks: 0,
                    timeSpent: 0,
                    timeCapsules: [], // Array of {startTime, endTime, duration} objects
                    startTime: startTime, // Current active session start time
                    lastSeen: startTime,
                    title: windowInfo.title || windowKey,
                    urls: [],
                    lastUrl: null // Track last URL to detect actual visits (not just checks)
                  });
                } else if (taskData && taskData.activeWindows.has(windowKey)) {
                    // Window already exists - start new time capsule if it was paused
                    const windowData = taskData.activeWindows.get(windowKey);
                    
                    // CRITICAL: Ensure timeCapsules array exists and preserve existing capsules
                    if (!windowData.timeCapsules) {
                      windowData.timeCapsules = [];
                    }
                    
                    if (!windowData.startTime) {
                      // Start new time capsule - window is becoming active again
                      // NOTE: We don't create a capsule here, just set startTime
                      // The capsule will be created when the window closes
                      windowData.startTime = Date.now();
                      windowData.lastSeen = Date.now();
                      
                      if (isDev) {
                        console.log(`[WINDOW-RESUME] Started new time capsule for ${windowKey} (PowerShell) (existing capsules: ${windowData.timeCapsules.length})`);
                      }
                    } else {
                      // Window is already active - just update lastSeen
                      windowData.lastSeen = Date.now();
                    }
                }
              }
              
              getWindowStats(windowKey, windowInfo.title, url);
            }
            
            // Get per-window statistics (update title and URL)
            const windowStats = getWindowStats(windowKey, windowInfo.title, url);
            
            // Get per-task stats if we have a current task
            let taskKeystrokes = 0;
            let taskClicks = 0;
            if (currentTaskId && currentProjectId) {
              const taskData = getTaskTrackingData(currentProjectId, currentTaskId);
              if (taskData) {
                taskKeystrokes = taskData.keystrokes;
                taskClicks = taskData.mouseClicks;
                
                // CRITICAL: Update active window tracking with time spent
                if (currentWindowKey) {
                  if (!taskData.activeWindows.has(currentWindowKey)) {
                    const startTime = Date.now();
                    taskData.activeWindows.set(currentWindowKey, {
                      keystrokes: 0,
                      mouseClicks: 0,
                      timeSpent: 0, // in seconds (will be calculated from capsules on save)
                      timeCapsules: [], // Array of {startTime, endTime, duration} objects
                      startTime: startTime, // Current active session start time
                      lastSeen: startTime,
                      title: windowInfo.title || currentWindowKey,
                      urls: [],
                      lastUrl: null // Track last URL to detect actual visits (not just checks)
                    });
                  }
                  
                  const windowData = taskData.activeWindows.get(currentWindowKey);
                  
                  // Initialize timeCapsules if not exists
                  if (!windowData.timeCapsules) {
                    windowData.timeCapsules = [];
                  }
                  
                  // Ensure startTime is set if window is active (start new capsule if paused)
                  if (!windowData.startTime) {
                    windowData.startTime = Date.now();
                    if (isDev) {
                      console.log(`[WINDOW-RESUME] Started new time capsule for ${currentWindowKey} in real-time update (PowerShell)`);
                    }
                  }
                  
                  // Don't update timeSpent here - it will be calculated on save
                  // Just update lastSeen
                  windowData.lastSeen = Date.now();
                  
                  // Update window title if changed
                  if (windowInfo.title && windowInfo.title !== windowData.title) {
                    windowData.title = windowInfo.title;
                  }
                  
                  // Update keystrokes and clicks from per-window stats (current session)
                  const windowStats = perWindowStats.get(currentWindowKey);
                  if (windowStats) {
                    // Store current session counts (will be merged with saved on save)
                    if (windowData.currentSessionKeystrokes === undefined) {
                  windowData.currentSessionKeystrokes = 0;
                }
                if (windowData.currentSessionMouseClicks === undefined) {
                  windowData.currentSessionMouseClicks = 0;
                }
                // Update from perWindowStats (these are current session totals)
                windowData.currentSessionKeystrokes = windowStats.keystrokes || 0;
                windowData.currentSessionMouseClicks = windowStats.clicks || 0;
                  }
                }
                
                // Track URL in task's URL history
                // Always try to extract URL even if previous extraction failed (retry extraction)
                let currentUrl = url;
                if (!currentUrl) {
                  currentUrl = extractUrlFromTitle(windowInfo.title, windowInfo.app);
                }
                
                // Check if it's a browser for debug logging
                const lowerAppName = (windowInfo.app || '').toLowerCase();
                const isBrowserApp = lowerAppName.includes('chrome') || 
                                    lowerAppName.includes('brave') || 
                                    lowerAppName.includes('firefox') || 
                                    lowerAppName.includes('edge') || 
                                    lowerAppName.includes('safari') ||
                                    lowerAppName.includes('opera') ||
                                    lowerAppName.includes('vivaldi');
                
                if (isDev && !currentUrl && isBrowserApp) {
                  console.log(`[URL-DEBUG] Failed to extract URL from title (PowerShell): "${windowInfo.title}" (app: ${windowInfo.app})`);
                }
                
                if (currentUrl) {
                  const normalizedUrl = normalizeUrl(currentUrl);
                  if (normalizedUrl) {
                    // Check if URL already exists in history
                    const urlExists = taskData.urlHistory.some(entry => 
                      normalizeUrl(entry.url) === normalizedUrl
                    );
                    
                    if (!urlExists) {
                      taskData.urlHistory.push({
                        url: normalizedUrl,
                        title: windowInfo.title || 'Unknown',
                        timestamp: Date.now()
                      });
                      
                      // Keep only last 100 URLs
                      if (taskData.urlHistory.length > 100) {
                        taskData.urlHistory = taskData.urlHistory.slice(-100);
                      }
                      
                      if (isDev) {
                        console.log(`[TASK-URL] Added URL to task ${currentTaskId} (PowerShell):`, normalizedUrl, 'from title:', windowInfo.title);
                      }
                      
                      // Schedule real-time save when URL is added
                      scheduleTaskSave(currentProjectId, currentTaskId);
                    }
                    
                    // Also track URL in active window within task
                    if (currentWindowKey && taskData.activeWindows.has(currentWindowKey)) {
                      const windowData = taskData.activeWindows.get(currentWindowKey);
                      if (!windowData.urls) {
                        windowData.urls = [];
                      }
                      const urlInWindow = windowData.urls.find(u => {
                        const uNormalized = normalizeUrl(u.url);
                        return uNormalized && normalizedUrl && uNormalized === normalizedUrl;
                      });
                      if (!urlInWindow) {
                        // New URL - add it (no visit count tracking)
                        windowData.urls.push({
                          url: normalizedUrl,
                          title: windowInfo.title || 'Unknown',
                          timestamp: Date.now()
                        });
                        
                        // Track this as the current URL
                        windowData.lastUrl = normalizedUrl;
                        
                        if (isDev) {
                          console.log(`[WINDOW-URL] Added new URL to window ${currentWindowKey} (PowerShell):`, normalizedUrl);
                        }
                        
                        // Schedule save when new URL is added
                        scheduleTaskSave(currentProjectId, currentTaskId);
                      } else {
                        // URL already exists - just update timestamp if URL changed
                        const urlChanged = windowData.lastUrl !== normalizedUrl;
                        if (urlChanged) {
                          // URL changed - update timestamp
                          urlInWindow.timestamp = Date.now();
                          windowData.lastUrl = normalizedUrl; // Track current URL
                          
                          if (isDev) {
                            console.log(`[WINDOW-URL] URL changed in window ${currentWindowKey} (PowerShell):`, normalizedUrl);
                          }
                          
                          // Schedule save when URL changes
                          scheduleTaskSave(currentProjectId, currentTaskId);
                        } else {
                          // Same URL - just update timestamp
                          urlInWindow.timestamp = Date.now();
                        }
                      }
                    }
                  } else if (isDev) {
                    console.log(`[URL-DEBUG] Failed to normalize URL (PowerShell):`, currentUrl);
                  }
                } else {
                  // No URL extracted, but check if it's a code editor with file path in title
                  const lowerAppName = (windowInfo.app || '').toLowerCase();
                  const isCodeEditor = lowerAppName.includes('cursor') || 
                                      lowerAppName.includes('code') || 
                                      lowerAppName.includes('vscode') ||
                                      lowerAppName.includes('sublime') ||
                                      lowerAppName.includes('atom') ||
                                      lowerAppName.includes('webstorm') ||
                                      lowerAppName.includes('intellij');
                  
                  if (isCodeEditor && windowInfo.title) {
                    // Extract file path from code editor title
                    const filePath = extractFilePathFromTitle(windowInfo.title, windowInfo.app);
                    if (filePath) {
                      const normalizedFilePath = normalizeUrl(filePath);
                      if (normalizedFilePath && currentWindowKey && taskData.activeWindows.has(currentWindowKey)) {
                        const windowData = taskData.activeWindows.get(currentWindowKey);
                        if (!windowData.urls) {
                          windowData.urls = [];
                        }
                        const fileInWindow = windowData.urls.find(u => {
                          const uNormalized = normalizeUrl(u.url);
                          return uNormalized && normalizedFilePath && uNormalized === normalizedFilePath;
                        });
                        if (!fileInWindow) {
                          // New file path - add it (no visit count tracking)
                          windowData.urls.push({
                            url: normalizedFilePath,
                            title: windowInfo.title,
                            timestamp: Date.now()
                          });
                          
                          // Track this as the current file path
                          windowData.lastUrl = normalizedFilePath;
                          
                          if (isDev) {
                            console.log(`[WINDOW-FILE] Added new file path to window ${currentWindowKey} (PowerShell):`, normalizedFilePath);
                          }
                          
                          // Schedule save when new file path is added
                          scheduleTaskSave(currentProjectId, currentTaskId);
                        } else {
                          // File path already exists - just update timestamp and title if file changed
                          const fileChanged = windowData.lastUrl !== normalizedFilePath;
                          if (fileChanged) {
                            // File changed - update timestamp and title
                            fileInWindow.timestamp = Date.now();
                            fileInWindow.title = windowInfo.title; // Update title in case it changed
                            windowData.lastUrl = normalizedFilePath; // Track current file path
                            
                            if (isDev) {
                              console.log(`[WINDOW-FILE] File path changed in window ${currentWindowKey} (PowerShell):`, normalizedFilePath);
                            }
                            
                            // Schedule save when file path changes
                            scheduleTaskSave(currentProjectId, currentTaskId);
                          } else {
                            // Same file - just update timestamp and title
                            fileInWindow.timestamp = Date.now();
                            fileInWindow.title = windowInfo.title; // Update title in case it changed
                          }
                        }
                      }
                    }
                  } else if (isDev && isBrowserApp) {
                    // Log when URL extraction fails for browsers
                    console.log(`[URL-DEBUG] No URL extracted for browser window (PowerShell): "${windowInfo.title}" (app: ${windowInfo.app})`);
                  }
                }
              }
            }
            
            const currentWindow = {
              title: windowInfo.title || 'Unknown',
              owner: windowInfo.owner || 'Unknown',
              url: url,
              app: windowInfo.owner || windowInfo.title || 'Unknown',
              keystrokes: windowStats.keystrokes, // Per-window keystrokes
              mouseClicks: windowStats.clicks, // Per-window clicks
              // Per-task stats (cumulative across all windows for this task)
              taskKeystrokes: taskKeystrokes,
              taskClicks: taskClicks,
              // Also include global counters for backward compatibility
              globalKeystrokes: keystrokeCount,
              globalClicks: mouseClickCount
            };
            lastActiveWindow = currentWindow;
            mainWindow.webContents.send('activity-update', currentWindow);
            
            console.log('[ACTIVITY-PS] App:', currentWindow.app, '| Title:', currentWindow.title.substring(0, 50), '| URL:', currentWindow.url || 'N/A', '| Window Keys:', windowStats.keystrokes, '| Window Clicks:', windowStats.clicks, '| Task Keys:', taskKeystrokes, '| Task Clicks:', taskClicks);
          }
        }
        
        if (!win && !mainWindow) {
          console.warn('Could not get window info and mainWindow not available');
        }
      }
    } catch (error) {
      console.error('Activity monitoring error:', error);
    }
  }, 1000); // Check every 1 second for better tracking

  return true;
});

// Update task tracking (called when task changes)
ipcMain.handle('update-task-tracking', async (event, projectId, taskId, taskName = null, projectName = null) => {
  const oldTaskId = currentTaskId;
  const oldProjectId = currentProjectId;
  
  if (isDev) {
    if (oldTaskId !== taskId || oldProjectId !== projectId) {
      console.log('[TASK-TRACKING] Task changed from', oldTaskId, 'to', taskId, 'in project', projectId);
    }
  }
  
  // Initialize task tracking (saves previous task, loads/creates new task)
  if (taskId && projectId) {
    await initializeTaskTracking(projectId, taskId, taskName, projectName);
  } else {
    // Save current task before clearing
    if (oldTaskId && oldProjectId) {
      saveTaskTrackingDataToFile(oldProjectId, oldTaskId);
    }
    currentProjectId = null;
    currentTaskId = null;
  }
  
  return true;
});

// Stop activity monitoring
ipcMain.handle('stop-activity-monitoring', () => {
  // Close all active time capsules before stopping
  if (currentTaskId && currentProjectId) {
    const taskKey = getTaskKey(currentProjectId, currentTaskId);
    if (taskKey && perTaskTracking.has(taskKey)) {
      const taskData = perTaskTracking.get(taskKey);
      if (taskData && taskData.activeWindows) {
        taskData.activeWindows.forEach((windowData, windowKey) => {
          if (windowData.startTime) {
            // Initialize timeCapsules array if it doesn't exist
            if (!windowData.timeCapsules) {
              windowData.timeCapsules = [];
            }
            
            // Close the active time capsule
            const endTime = Date.now();
            const startTime = windowData.startTime;
            const duration = Math.floor((endTime - startTime) / 1000);
            
            // Check if this capsule already exists (prevent duplicates)
            const capsuleKey = `${startTime}-${endTime}`;
            const existingCapsule = windowData.timeCapsules.find(c => 
              `${c.startTime}-${c.endTime}` === capsuleKey
            );
            
            if (!existingCapsule) {
              // Only add if it doesn't already exist
              windowData.timeCapsules.push({
                startTime: startTime,
                endTime: endTime,
                duration: duration
              });
              
              if (isDev) {
                console.log(`[STOP-TRACKING] Closed NEW time capsule for ${windowKey}, duration: ${duration}s`);
              }
            } else {
              if (isDev) {
                console.log(`[STOP-TRACKING] Skipped duplicate capsule for ${windowKey} (already exists)`);
              }
            }
            
            // Clear startTime
            windowData.startTime = null;
            windowData.lastSeen = endTime;
          }
        });
      }
    }
  }
  
  if (activityMonitoringInterval) {
    clearInterval(activityMonitoringInterval);
    activityMonitoringInterval = null;
  }
  
  if (allWindowsUpdateInterval) {
    clearInterval(allWindowsUpdateInterval);
    allWindowsUpdateInterval = null;
  }
  
  // Save current task data before stopping (IMMEDIATE save)
  if (currentTaskId && currentProjectId) {
    const taskKey = getTaskKey(currentProjectId, currentTaskId);
    // Clear any pending saves
    if (taskKey && saveTimers.has(taskKey)) {
      clearTimeout(saveTimers.get(taskKey));
      saveTimers.delete(taskKey);
    }
    // Immediate save
    saveTaskTrackingDataToFile(currentProjectId, currentTaskId, null, null, true);
    if (isDev) {
      console.log(`[TASK-STOP] Immediately saved task ${currentTaskId} data before stopping`);
    }
  }
  
  isTrackingActive = false;
  
  // Stop uiohook-napi (handles both keyboard and mouse)
  try {
    if (uIOhook && isUiohookInitialized) {
      uIOhook.stop();
      uIOhook.removeAllListeners();
      isUiohookInitialized = false;
      console.log('System-wide tracking stopped (uiohook-napi)');
    }
  } catch (error) {
    console.error('Error stopping uiohook-napi:', error);
  }
  
  // Stop Windows API fallback intervals
  try {
    if (keyboardTrackingInterval) {
      clearInterval(keyboardTrackingInterval);
      keyboardTrackingInterval = null;
    }
    if (mouseTrackingInterval) {
      clearInterval(mouseTrackingInterval);
      mouseTrackingInterval = null;
    }
    // Clean up script files
    const tmpDir = os.tmpdir();
    const keyboardScript = path.join(tmpDir, 'keyboard-tracker.ps1');
    const mouseScript = path.join(tmpDir, 'mouse-tracker.ps1');
    if (fs.existsSync(keyboardScript)) {
      fs.unlinkSync(keyboardScript);
    }
    if (fs.existsSync(mouseScript)) {
      fs.unlinkSync(mouseScript);
    }
  } catch (error) {
    // Ignore cleanup errors
  }
  
  globalShortcut.unregisterAll();
  keystrokeCount = 0;
  mouseClickCount = 0;
  lastActivityTimestamp = null;
  lastActiveWindow = null;
  
  // Clear per-window tracking
  perWindowStats.clear();
  currentWindowKey = null;
  
  // Clear per-task tracking
  perTaskTracking.clear();
  currentTaskId = null;
  currentProjectId = null;
  
  return true;
});

// Get last activity timestamp for idle detection
ipcMain.handle('get-last-activity-timestamp', () => {
  return lastActivityTimestamp;
});

// Create system tray
function createTray() {
  // Get the logo path for the tray icon
  const possiblePaths = [
    path.join(__dirname, '../public/logo.png'), // Dev mode
    path.join(__dirname, '../dist/logo.png'), // Production
    path.join(process.cwd(), 'public/logo.png'), // Alternative dev path
    path.join(process.cwd(), 'dist/logo.png') // Alternative production path
  ];
  
  let iconPath = undefined;
  for (const logoPath of possiblePaths) {
    if (fs.existsSync(logoPath)) {
      iconPath = logoPath;
      break;
    }
  }

  if (!iconPath) {
    console.warn('Logo not found for tray icon');
    return;
  }

  // Create tray icon (resize to 16x16 for better tray display)
  const trayIcon = nativeImage.createFromPath(iconPath);
  const resizedIcon = trayIcon.resize({ width: 16, height: 16 });
  
  tray = new Tray(resizedIcon);
  
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show Tyrodesk',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        } else {
          createWindow();
        }
      }
    },
    {
      label: 'Hide',
      click: () => {
        if (mainWindow) {
          mainWindow.hide();
        }
      },
      visible: false // Will be shown when window is visible
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ]);
  
  tray.setToolTip('Tyrodesk - Workforce Management');
  tray.setContextMenu(contextMenu);
  
  // Double-click to show/hide window
  tray.on('double-click', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.hide();
      } else {
        mainWindow.show();
        mainWindow.focus();
      }
    } else {
      createWindow();
    }
  });
  
  // Function to rebuild menu with correct visibility
  const rebuildTrayMenu = () => {
    const isWindowVisible = mainWindow && mainWindow.isVisible();
    const newMenu = Menu.buildFromTemplate([
      {
        label: isWindowVisible ? 'Hide' : 'Show Tyrodesk',
        click: () => {
          if (mainWindow) {
            if (isWindowVisible) {
              mainWindow.hide();
            } else {
              mainWindow.show();
              mainWindow.focus();
            }
          } else {
            createWindow();
          }
        }
      },
      { type: 'separator' },
      {
        label: 'Quit',
        click: () => {
          isQuitting = true;
          app.quit();
        }
      }
    ]);
    tray.setContextMenu(newMenu);
  };
  
  // Update menu when window visibility changes (attach after window is created)
  setTimeout(() => {
    if (mainWindow) {
      mainWindow.on('show', rebuildTrayMenu);
      mainWindow.on('hide', rebuildTrayMenu);
    }
  }, 100);
}

// This method will be called when Electron has finished initialization
app.whenReady().then(async () => {
  // Migrate existing files to new folder structure on startup
  if (isDev) {
    console.log('[APP] Running migration to new folder structure...');
  }
  migrateTrackingDataStructure('default');
  
  // Pre-initialize store to avoid delays in IPC handlers
  await initStore();
  createWindow();
  createTray();
  // Migrate existing files to new folder structure on startup
  migrateTrackingDataStructure('default');
  // Start tracking data watcher for combined insights
  startTrackingDataWatcher();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    } else if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });
});

// Prevent app from quitting when all windows are closed (keep running in tray)
app.on('window-all-closed', (event) => {
  // Don't quit - keep running in tray
  // Only quit if explicitly requested via tray menu
  if (isQuitting) {
    app.quit();
  }
});

// ==================== Task Tracking IPC Handlers ====================

// Get current task tracking data
ipcMain.handle('get-current-task-tracking', async () => {
  if (!currentTaskId || !currentProjectId) {
    return null;
  }
  
  const taskData = getTaskTrackingData(currentProjectId, currentTaskId);
  if (!taskData) {
    return null;
  }
  
  // Return a serializable version (convert Map to Array)
  const activeWindowsArray = Array.from(taskData.activeWindows.entries()).map(([key, value]) => ({
    windowKey: key,
    ...value
  }));
  
  return {
    taskId: taskData.taskId,
    projectId: taskData.projectId,
    keystrokes: taskData.keystrokes,
    mouseClicks: taskData.mouseClicks,
    startTime: taskData.startTime,
    activeWindows: activeWindowsArray,
    urlHistory: taskData.urlHistory,
    screenshots: taskData.screenshots,
    webcamPhotos: taskData.webcamPhotos,
    activityLogs: taskData.activityLogs
  };
});

// Add activity log to current task
ipcMain.handle('add-activity-log-to-task', async (event, activityLog) => {
  if (!currentTaskId || !currentProjectId) {
    return false;
  }
  
  const taskData = getTaskTrackingData(currentProjectId, currentTaskId);
  if (!taskData) {
    return false;
  }
  
  // Add activity log
  if (!taskData.activityLogs) {
    taskData.activityLogs = [];
  }
  
  taskData.activityLogs.push({
    ...activityLog,
    taskId: currentTaskId,
    projectId: currentProjectId
  });
  
  // Schedule real-time save (debounced) - saves 2 seconds after activity log
  scheduleTaskSave(currentProjectId, currentTaskId);
  
  if (isDev) {
    console.log(`[TASK-LOG] Added activity log to task ${currentTaskId}, scheduled save`);
  }
  
  return true;
});

// Add webcam photo to current task
ipcMain.handle('add-webcam-photo-to-task', async (event, photoDataUrl) => {
  if (!currentTaskId || !currentProjectId) {
    return false;
  }
  
  const taskData = getTaskTrackingData(currentProjectId, currentTaskId);
  if (!taskData) {
    return false;
  }
  
  const photoId = `wc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  taskData.webcamPhotos.push({
    id: photoId,
    timestamp: Date.now(),
    dataUrl: photoDataUrl,
    taskId: currentTaskId,
    projectId: currentProjectId
  });
  
  // Schedule real-time save (debounced) - saves 2 seconds after webcam photo
  scheduleTaskSave(currentProjectId, currentTaskId);
  
  if (isDev) {
    console.log(`[TASK-WEBCAM] Tagged webcam photo with task ${currentTaskId}, scheduled save`);
  }
  
  return true;
});

// Save current task data manually
ipcMain.handle('save-task-tracking-data', async (event, projectId, taskId, taskName, projectName) => {
  const taskKey = projectId && taskId ? getTaskKey(projectId, taskId) : getTaskKey(currentProjectId, currentTaskId);
  if (!taskKey) {
    return false;
  }
  
  const saveProjectId = projectId || currentProjectId;
  const saveTaskId = taskId || currentTaskId;
  
  return saveTaskTrackingDataToFile(saveProjectId, saveTaskId, taskName, projectName);
});

// Load task tracking data from file - ONE FILE PER TASK
// dateFilter: 'today' | 'all' - filters data by date (default: 'today')
ipcMain.handle('load-task-tracking-data', async (event, projectId, taskId, dateFilter = 'today') => {
  if (!projectId || !taskId) {
    return null;
  }
  
  // Load the task's file (one file per task)
  const loadedData = loadTaskTrackingDataFromFile(projectId, taskId);
  if (!loadedData) {
    return null;
  }
  
  // Filter by today if requested
  if (dateFilter === 'today' && loadedData.trackingData) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStart = today.getTime();
    const todayEnd = todayStart + (24 * 60 * 60 * 1000) - 1;
    
    // Filter activity logs
    if (loadedData.trackingData.activityLogs && Array.isArray(loadedData.trackingData.activityLogs)) {
      loadedData.trackingData.activityLogs = loadedData.trackingData.activityLogs.filter(log => {
        const logTime = log.timestamp ? new Date(log.timestamp).getTime() : 
                       (log.createdAt ? new Date(log.createdAt).getTime() : 0);
        return logTime >= todayStart && logTime <= todayEnd;
      });
    }
    
    // Filter screenshots
    if (loadedData.trackingData.screenshots && Array.isArray(loadedData.trackingData.screenshots)) {
      loadedData.trackingData.screenshots = loadedData.trackingData.screenshots.filter(screenshot => {
        const screenshotTime = screenshot.timestamp ? new Date(screenshot.timestamp).getTime() :
                             (screenshot.createdAt ? new Date(screenshot.createdAt).getTime() : 0);
        return screenshotTime >= todayStart && screenshotTime <= todayEnd;
      });
    }
    
    // Filter webcam photos
    if (loadedData.trackingData.webcamPhotos && Array.isArray(loadedData.trackingData.webcamPhotos)) {
      loadedData.trackingData.webcamPhotos = loadedData.trackingData.webcamPhotos.filter(photo => {
        const photoTime = photo.timestamp ? new Date(photo.timestamp).getTime() :
                        (photo.createdAt ? new Date(photo.createdAt).getTime() : 0);
        return photoTime >= todayStart && photoTime <= todayEnd;
      });
    }
    
    // Filter activeWindows by lastSeen
    if (loadedData.trackingData.activeWindows && Array.isArray(loadedData.trackingData.activeWindows)) {
      loadedData.trackingData.activeWindows = loadedData.trackingData.activeWindows.filter(win => {
        const lastSeen = win.lastSeen || win.timestamp || 0;
        return lastSeen >= todayStart && lastSeen <= todayEnd;
      }).map(win => {
        // Also filter URLs within windows
        if (win.urls && Array.isArray(win.urls)) {
          win.urls = win.urls.filter(urlEntry => {
            const urlTime = urlEntry.timestamp || 0;
            return urlTime >= todayStart && urlTime <= todayEnd;
          });
        }
        return win;
      });
    }
    
    // Filter urlHistory
    if (loadedData.trackingData.urlHistory && Array.isArray(loadedData.trackingData.urlHistory)) {
      loadedData.trackingData.urlHistory = loadedData.trackingData.urlHistory.filter(urlEntry => {
        const urlTime = urlEntry.timestamp || 0;
        return urlTime >= todayStart && urlTime <= todayEnd;
      });
    }
    
    // Recalculate summary from filtered logs and activeWindows
    // Always recalculate to ensure accuracy after filtering
    const filteredLogs = loadedData.trackingData.activityLogs || [];
    let totalKeystrokes = filteredLogs.reduce((sum, log) => sum + (log.keyboardEvents || log.keystrokes || 0), 0);
    let totalMouseClicks = filteredLogs.reduce((sum, log) => sum + (log.mouseEvents || log.clicks || 0), 0);
    
    // Also sum from activeWindows (they contain cumulative keystrokes/clicks per window)
    const filteredWindows = loadedData.trackingData.activeWindows || [];
    const windowsKeystrokes = filteredWindows.reduce((sum, win) => sum + (win.keystrokes || 0), 0);
    const windowsClicks = filteredWindows.reduce((sum, win) => sum + (win.mouseClicks || 0), 0);
    
    // Use the maximum of logs or windows (windows might have more accurate cumulative data)
    // If both are 0, keep 0; otherwise use the maximum
    totalKeystrokes = Math.max(totalKeystrokes, windowsKeystrokes);
    totalMouseClicks = Math.max(totalMouseClicks, windowsClicks);
    
    // Initialize or update summary - always ensure it exists
    if (!loadedData.trackingData.summary) {
      loadedData.trackingData.summary = {
        totalKeystrokes: 0,
        totalMouseClicks: 0,
        totalTime: 0,
        averageProductivityScore: 0
      };
    }
    
    // Always update summary values (even if 0, to ensure they're set)
    loadedData.trackingData.summary.totalKeystrokes = totalKeystrokes;
    loadedData.trackingData.summary.totalMouseClicks = totalMouseClicks;
    
    // Log for debugging (only in dev mode)
    if (isDev) {
      console.log(`[LOAD-TASK-DATA] Recalculated summary for task ${taskId}: ${totalKeystrokes} keystrokes, ${totalMouseClicks} clicks (from ${filteredLogs.length} logs, ${filteredWindows.length} windows)`);
    }
    
    // Calculate total time from filtered logs
    if (filteredLogs.length > 0) {
      const sortedLogs = filteredLogs.sort((a, b) => {
        const aTime = a.timestamp ? new Date(a.timestamp).getTime() : 
                     (a.createdAt ? new Date(a.createdAt).getTime() : 0);
        const bTime = b.timestamp ? new Date(b.timestamp).getTime() : 
                     (b.createdAt ? new Date(b.createdAt).getTime() : 0);
        return aTime - bTime;
      });
      const firstLog = sortedLogs[0];
      const lastLog = sortedLogs[sortedLogs.length - 1];
      const startTime = firstLog.timestamp ? new Date(firstLog.timestamp).getTime() : 
                       (firstLog.createdAt ? new Date(firstLog.createdAt).getTime() : 0);
      const endTime = lastLog.timestamp ? new Date(lastLog.timestamp).getTime() : 
                     (lastLog.createdAt ? new Date(lastLog.createdAt).getTime() : 0);
      loadedData.trackingData.summary.totalTime = Math.floor((endTime - startTime) / 1000);
    } else {
      // No logs - calculate from activeWindows time capsules if available
      let totalTimeFromWindows = 0;
      filteredWindows.forEach(win => {
        if (win.timeCapsules && Array.isArray(win.timeCapsules)) {
          const windowTime = win.timeCapsules.reduce((sum, capsule) => sum + (capsule.duration || 0), 0);
          totalTimeFromWindows += windowTime;
        } else if (win.timeSpent) {
          totalTimeFromWindows += win.timeSpent;
        }
      });
      loadedData.trackingData.summary.totalTime = totalTimeFromWindows;
    }
  }
  
  // Return the full data structure (filtered if dateFilter is 'today')
  return {
    metadata: loadedData.metadata,
    trackingData: loadedData.trackingData
  };
});

// Get last active task state for restoration - only uses task JSON files
ipcMain.handle('get-last-active-task-state', async () => {
  // Find last active task from JSON files only
  const lastTask = findLastActiveTaskFromFiles();
  if (lastTask) {
    const taskData = loadTaskTrackingDataFromFile(lastTask.projectId, lastTask.taskId);
    if (taskData) {
      // Calculate elapsed time from activity logs if available
      let elapsedSeconds = 0;
      const activityLogs = taskData.trackingData?.activityLogs || [];
      if (activityLogs.length > 0) {
        // Calculate time from first to last log
        const firstLog = activityLogs[0];
        const lastLog = activityLogs[activityLogs.length - 1];
        const firstTime = new Date(firstLog.timestamp || firstLog.createdAt).getTime();
        const lastTime = new Date(lastLog.timestamp || lastLog.createdAt).getTime();
        elapsedSeconds = Math.floor((lastTime - firstTime) / 1000);
      } else if (taskData.trackingData?.summary?.totalTime) {
        // Use summary totalTime if available
        elapsedSeconds = taskData.trackingData.summary.totalTime;
      }
      
      return {
        projectId: lastTask.projectId,
        taskId: lastTask.taskId,
        isTimerRunning: false, // Can't determine from file alone - user needs to manually start timer
        startTime: null,
        elapsedSeconds: elapsedSeconds,
        taskData: {
          metadata: taskData.metadata,
          trackingData: taskData.trackingData
        }
      };
    }
  }
  
  return null;
});

// Get the file path where JSON files are saved
ipcMain.handle('get-tracking-data-path', async () => {
  const projectRoot = path.join(__dirname, '..');
  const trackingDataPath = path.join(projectRoot, 'tracking-data');
  return {
    projectRoot: projectRoot,
    trackingDataPath: trackingDataPath,
    exists: fs.existsSync(trackingDataPath)
  };
});

// Verify all task data files and their integrity
ipcMain.handle('verify-tracking-data', async (event, projectId = null) => {
  try {
    const projectRoot = path.join(__dirname, '..');
    const trackingDataPath = path.join(projectRoot, 'tracking-data');
    
    if (!fs.existsSync(trackingDataPath)) {
      return {
        success: false,
        message: 'Tracking data directory does not exist',
        files: []
      };
    }
    
    const results = {
      success: true,
      totalFiles: 0,
      validFiles: 0,
      invalidFiles: 0,
      totalSize: 0,
      projects: {}
    };
    
    // Find all task files using new structure (supports both old and new)
    const taskFiles = findAllTaskFiles(trackingDataPath);
    
    // Filter by projectId if specified
    const filteredTaskFiles = projectId 
      ? taskFiles.filter(tf => tf.projectId === projectId)
      : taskFiles;
    
    // Group files by project
    for (const taskFile of filteredTaskFiles) {
      const { filePath, projectId: projId, taskId } = taskFile;
      const fileName = path.basename(filePath);
      
      if (!results.projects[projId]) {
        results.projects[projId] = {
          projectId: projId,
          files: [],
          totalFiles: 0,
          totalSize: 0
        };
      }
      
      results.totalFiles++;
      results.projects[projId].totalFiles++;
      
      try {
        const stats = fs.statSync(filePath);
        const fileContent = fs.readFileSync(filePath, 'utf8');
        const data = JSON.parse(fileContent);
        
        // Verify structure
        const isValid = data.metadata && 
                       data.trackingData && 
                       data.metadata.sessionUUID &&
                       data.metadata.taskId;
        
        if (isValid) {
          results.validFiles++;
          results.totalSize += stats.size;
          results.projects[projId].totalSize += stats.size;
          
          results.projects[projId].files.push({
            filename: fileName,
            uuid: data.metadata.sessionUUID,
            taskId: data.metadata.taskId,
            taskName: data.metadata.taskName,
            createdAt: data.metadata.createdAt,
            lastUpdated: data.metadata.lastUpdated,
            size: stats.size,
            keystrokes: data.trackingData.summary?.totalKeystrokes || 0,
            mouseClicks: data.trackingData.summary?.totalMouseClicks || 0,
            activityLogs: data.trackingData.activityLogs?.length || 0,
            screenshots: data.trackingData.screenshots?.length || 0,
            webcamPhotos: data.trackingData.webcamPhotos?.length || 0,
            valid: true
          });
        } else {
          results.invalidFiles++;
          results.projects[projId].files.push({
            filename: fileName,
            valid: false,
            error: 'Invalid structure'
          });
        }
      } catch (error) {
        results.invalidFiles++;
        results.projects[projId].files.push({
          filename: fileName,
          valid: false,
          error: error.message
        });
      }
    }
    
    console.log(`[DATA-VERIFY] Verified ${results.totalFiles} files: ${results.validFiles} valid, ${results.invalidFiles} invalid`);
    console.log(`[DATA-VERIFY] Total size: ${(results.totalSize / 1024).toFixed(2)} KB`);
    
    return results;
  } catch (error) {
    console.error('[DATA-VERIFY] Error verifying tracking data:', error);
    return {
      success: false,
      error: error.message,
      files: []
    };
  }
});

// Get all tasks from today (for restoration and continuation)
ipcMain.handle('get-today-tasks', async () => {
  try {
    const projectRoot = path.join(__dirname, '..');
    const trackingDataPath = path.join(projectRoot, 'tracking-data');
    
    if (!fs.existsSync(trackingDataPath)) {
      return [];
    }
    
    // Get today's date in YYYY-MM-DD format
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    
    // Find all task files using new structure (supports both old and new)
    const taskFiles = findAllTaskFiles(trackingDataPath);
    const todayTasks = [];
    
    for (const taskFile of taskFiles) {
      try {
        const fileContent = fs.readFileSync(taskFile.filePath, 'utf8');
        const data = JSON.parse(fileContent);
        
        if (!data.metadata) continue;
        
        // Check if task was created or updated today
        const createdAt = data.metadata.createdAt ? new Date(data.metadata.createdAt).toISOString().split('T')[0] : null;
        const lastUpdated = data.metadata.lastUpdated ? new Date(data.metadata.lastUpdated).toISOString().split('T')[0] : null;
        
        // Include if created today OR last updated today
        if (createdAt === todayStr || lastUpdated === todayStr) {
          // Calculate total time from activeWindows (most accurate - uses time capsules)
          // Filter windows by today's date first
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const todayStart = today.getTime();
          const todayEnd = todayStart + (24 * 60 * 60 * 1000) - 1;
          
          const activeWindows = data.trackingData?.activeWindows || [];
          let totalTime = 0;
          
          // Calculate total time from time capsules filtered by today (most accurate)
          // Sum timeSpent from all windows that were active today
          const todayWindows = activeWindows.filter(win => {
            const lastSeen = win.lastSeen || win.timestamp || 0;
            return lastSeen >= todayStart && lastSeen <= todayEnd;
          });
          
          // Calculate total time from time capsules (most accurate)
          todayWindows.forEach(win => {
            if (win.timeCapsules && Array.isArray(win.timeCapsules)) {
              // Sum durations from all time capsules that fall within today
              win.timeCapsules.forEach(capsule => {
                const capsuleStart = capsule.startTime || 0;
                const capsuleEnd = capsule.endTime || 0;
                // Only count capsules that overlap with today
                if (capsuleStart <= todayEnd && capsuleEnd >= todayStart) {
                  // Calculate overlap with today
                  const overlapStart = Math.max(capsuleStart, todayStart);
                  const overlapEnd = Math.min(capsuleEnd, todayEnd);
                  const overlapDuration = Math.max(0, Math.floor((overlapEnd - overlapStart) / 1000));
                  totalTime += overlapDuration;
                }
              });
            } else if (win.timeSpent) {
              // Fallback to timeSpent if no capsules (for backward compatibility)
              // But only count if window was active today
              const lastSeen = win.lastSeen || win.timestamp || 0;
              if (lastSeen >= todayStart && lastSeen <= todayEnd) {
                totalTime += win.timeSpent;
              }
            }
          });
          
          // Last fallback: calculate from activity logs (less accurate)
          if (totalTime === 0) {
            const activityLogs = data.trackingData?.activityLogs || [];
            if (activityLogs.length > 0) {
              // Filter logs by today
              const todayLogs = activityLogs.filter(log => {
                const logTime = log.timestamp ? new Date(log.timestamp).getTime() : 
                               (log.createdAt ? new Date(log.createdAt).getTime() : 0);
                return logTime >= todayStart && logTime <= todayEnd;
              });
              
              if (todayLogs.length > 0) {
                const firstLog = todayLogs[0];
                const lastLog = todayLogs[todayLogs.length - 1];
                const firstTime = firstLog.timestamp ? new Date(firstLog.timestamp).getTime() : 
                                 (firstLog.createdAt ? new Date(firstLog.createdAt).getTime() : 0);
                const lastTime = lastLog.timestamp ? new Date(lastLog.timestamp).getTime() : 
                               (lastLog.createdAt ? new Date(lastLog.createdAt).getTime() : 0);
                totalTime = Math.floor((lastTime - firstTime) / 1000);
              }
            }
          }
          
          // Filter activity logs, screenshots, and webcam photos by today
          const activityLogs = data.trackingData?.activityLogs || [];
          const todayLogs = activityLogs.filter(log => {
            const logTime = log.timestamp ? new Date(log.timestamp).getTime() : 
                           (log.createdAt ? new Date(log.createdAt).getTime() : 0);
            return logTime >= todayStart && logTime <= todayEnd;
          });
          
          const screenshots = data.trackingData?.screenshots || [];
          const todayScreenshots = screenshots.filter(screenshot => {
            const screenshotTime = screenshot.timestamp ? new Date(screenshot.timestamp).getTime() :
                                 (screenshot.createdAt ? new Date(screenshot.createdAt).getTime() : 0);
            return screenshotTime >= todayStart && screenshotTime <= todayEnd;
          });
          
          const webcamPhotos = data.trackingData?.webcamPhotos || [];
          const todayWebcamPhotos = webcamPhotos.filter(photo => {
            const photoTime = photo.timestamp ? new Date(photo.timestamp).getTime() :
                            (photo.createdAt ? new Date(photo.createdAt).getTime() : 0);
            return photoTime >= todayStart && photoTime <= todayEnd;
          });
          
          // Only include task if it has today's activity
          if (totalTime > 0 || todayLogs.length > 0 || todayScreenshots.length > 0 || todayWebcamPhotos.length > 0) {
            if (isDev) {
              console.log(`[GET-TODAY-TASKS] Task ${taskFile.taskId}: totalTime=${totalTime}s (${Math.floor(totalTime/60)}m), logs=${todayLogs.length}, windows=${todayWindows.length}`);
            }
            todayTasks.push({
              projectId: taskFile.projectId,
              taskId: taskFile.taskId,
              taskName: data.metadata.taskName || 'Unknown Task',
              projectName: data.metadata.projectName || 'Unknown Project',
              createdAt: data.metadata.createdAt,
              lastUpdated: data.metadata.lastUpdated,
              totalTime: totalTime,
              keystrokes: data.trackingData?.summary?.totalKeystrokes || 0,
              mouseClicks: data.trackingData?.summary?.totalMouseClicks || 0,
              activityLogCount: todayLogs.length, // Use filtered count
              screenshotCount: todayScreenshots.length, // Use filtered count
              webcamPhotoCount: todayWebcamPhotos.length, // Use filtered count
              summary: data.trackingData?.summary
            });
          }
        }
      } catch (error) {
        console.error(`[GET-TODAY-TASKS] Error reading file ${taskFile.filePath}:`, error);
      }
    }
    
    // Sort by lastUpdated (most recent first)
    todayTasks.sort((a, b) => {
      const aTime = a.lastUpdated ? new Date(a.lastUpdated).getTime() : 0;
      const bTime = b.lastUpdated ? new Date(b.lastUpdated).getTime() : 0;
      return bTime - aTime;
    });
    
    return todayTasks;
  } catch (error) {
    console.error('[GET-TODAY-TASKS] Error getting today\'s tasks:', error);
    return [];
  }
});

// Get all tasks for a project - ONE FILE PER TASK (taskId-based)
ipcMain.handle('get-project-tasks-tracking', async (event, projectId) => {
  try {
    const projectRoot = path.join(__dirname, '..');
    const trackingDataPath = path.join(projectRoot, 'tracking-data');
    
    if (!fs.existsSync(trackingDataPath)) {
      return [];
    }
    
    // Find all task files using new structure (supports both old and new)
    const taskFiles = findAllTaskFiles(trackingDataPath);
    
    // Filter by projectId if specified
    const filteredTaskFiles = projectId 
      ? taskFiles.filter(tf => tf.projectId === projectId)
      : taskFiles;
    
    const tasks = [];
    
    for (const taskFile of filteredTaskFiles) {
      const { filePath, taskId } = taskFile;
      
      try {
        const fileContent = fs.readFileSync(filePath, 'utf8');
        const data = JSON.parse(fileContent);
        
        tasks.push({
          taskId: taskId,
          projectId: taskFile.projectId,
          taskName: data.metadata?.taskName || 'Unknown Task',
          projectName: data.metadata?.projectName || 'Unknown Project',
          createdAt: data.metadata?.createdAt,
          lastUpdated: data.metadata?.lastUpdated,
          summary: data.trackingData?.summary,
          filePath: filePath
        });
      } catch (error) {
        console.error(`Error loading task file ${filePath}:`, error);
      }
    }
    
    return tasks;
  } catch (error) {
    console.error('Error getting project tasks:', error);
    return [];
  }
});

// ==================== Combined Insights IPC Handlers ====================

// File watchers for tracking data directory
let trackingDataWatchers = new Map();
let combinedInsightsListeners = new Set();

// Function to combine all tracking JSON files
// dateFilter: 'today' | 'all' - filters data by date (default: 'today')
const combineAllTrackingData = (dateFilter = 'today') => {
  try {
    const projectRoot = path.join(__dirname, '..');
    const trackingDataPath = path.join(projectRoot, 'tracking-data');
    
    if (!fs.existsSync(trackingDataPath)) {
      return {
        success: true,
        totalTasks: 0,
        totalProjects: 0,
        combinedData: {
          activityLogs: [],
          screenshots: [],
          webcamPhotos: [],
          activeWindows: [],
          urlHistory: [],
          summary: {
            totalKeystrokes: 0,
            totalMouseClicks: 0,
            totalTime: 0,
            averageProductivityScore: 0
          }
        },
        tasks: [],
        projects: {}
      };
    }
    
    // Calculate today's date range (start of today to end of today)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStart = today.getTime();
    const todayEnd = todayStart + (24 * 60 * 60 * 1000) - 1; // End of today
    
    const combined = {
      activityLogs: [],
      screenshots: [],
      webcamPhotos: [],
      activeWindows: [], // Will be combined from all tasks
      urlHistory: [], // Will be combined from all tasks
      summary: {
        totalKeystrokes: 0,
        totalMouseClicks: 0,
        totalTime: 0,
        averageProductivityScore: 0
      }
    };
    
    // Map to combine activeWindows by windowKey (app + title combination)
    const combinedWindowsMap = new Map();
    const combinedUrlHistory = [];
    
    const tasks = [];
    const projects = {};
    let totalProductivityScores = 0;
    let totalProductivityCount = 0;
    
    // Find all task files using new structure (supports both old and new)
    const taskFiles = findAllTaskFiles(trackingDataPath);
    
    for (const taskFile of taskFiles) {
      const { filePath, projectId: projId, taskId } = taskFile;
      
      if (!fs.existsSync(filePath)) continue;
      
      if (!projects[projId]) {
        projects[projId] = {
          projectId: projId,
          projectName: null,
          taskCount: 0,
          totalKeystrokes: 0,
          totalMouseClicks: 0
        };
      }
      
      try {
        const fileContent = fs.readFileSync(filePath, 'utf8');
        const data = JSON.parse(fileContent);
        
        if (!data.metadata || !data.trackingData) continue;
        
        // Filter by date: only include tasks that were created or updated today
        if (dateFilter === 'today') {
          const createdAt = data.metadata.createdAt ? new Date(data.metadata.createdAt).getTime() : 0;
          const lastUpdated = data.metadata.lastUpdated ? new Date(data.metadata.lastUpdated).getTime() : 0;
          
          // Skip if task was neither created nor updated today
          if ((createdAt < todayStart || createdAt > todayEnd) && 
              (lastUpdated < todayStart || lastUpdated > todayEnd)) {
            continue; // Skip this task file entirely
          }
        }
        
        // Get project name from first task
        if (!projects[projId].projectName && data.metadata.projectName) {
          projects[projId].projectName = data.metadata.projectName;
        }
          
          // Combine activity logs - filter by today if needed
          if (data.trackingData.activityLogs && Array.isArray(data.trackingData.activityLogs)) {
            const filteredLogs = dateFilter === 'today' 
              ? data.trackingData.activityLogs.filter(log => {
                  const logTime = log.timestamp ? new Date(log.timestamp).getTime() : 
                                 (log.createdAt ? new Date(log.createdAt).getTime() : 0);
                  return logTime >= todayStart && logTime <= todayEnd;
                })
              : data.trackingData.activityLogs;
            combined.activityLogs.push(...filteredLogs);
          }
          
          // Combine screenshots - filter by today if needed
          if (data.trackingData.screenshots && Array.isArray(data.trackingData.screenshots)) {
            const filteredScreenshots = dateFilter === 'today'
              ? data.trackingData.screenshots.filter(screenshot => {
                  const screenshotTime = screenshot.timestamp ? new Date(screenshot.timestamp).getTime() :
                                       (screenshot.createdAt ? new Date(screenshot.createdAt).getTime() : 0);
                  return screenshotTime >= todayStart && screenshotTime <= todayEnd;
                })
              : data.trackingData.screenshots;
            combined.screenshots.push(...filteredScreenshots);
          }
          
          // Combine webcam photos - filter by today if needed
          if (data.trackingData.webcamPhotos && Array.isArray(data.trackingData.webcamPhotos)) {
            const filteredWebcamPhotos = dateFilter === 'today'
              ? data.trackingData.webcamPhotos.filter(photo => {
                  const photoTime = photo.timestamp ? new Date(photo.timestamp).getTime() :
                                  (photo.createdAt ? new Date(photo.createdAt).getTime() : 0);
                  return photoTime >= todayStart && photoTime <= todayEnd;
                })
              : data.trackingData.webcamPhotos;
            combined.webcamPhotos.push(...filteredWebcamPhotos);
          }
          
          // Combine activeWindows - merge windows with same windowKey, filter by today if needed
          if (data.trackingData.activeWindows && Array.isArray(data.trackingData.activeWindows)) {
            const filteredWindows = dateFilter === 'today'
              ? data.trackingData.activeWindows.filter(win => {
                  // Check if window was active today (lastSeen is today)
                  const lastSeen = win.lastSeen || win.timestamp || 0;
                  return lastSeen >= todayStart && lastSeen <= todayEnd;
                })
              : data.trackingData.activeWindows;
            
            filteredWindows.forEach((win) => {
              const windowKey = win.windowKey || win.appName || 'Unknown';
              
              if (combinedWindowsMap.has(windowKey)) {
                // Merge with existing window
                const existing = combinedWindowsMap.get(windowKey);
                existing.keystrokes = (existing.keystrokes || 0) + (win.keystrokes || 0);
                existing.mouseClicks = (existing.mouseClicks || 0) + (win.mouseClicks || 0);
                existing.timeSpent = (existing.timeSpent || 0) + (win.timeSpent || 0);
                existing.lastSeen = Math.max(existing.lastSeen || 0, win.lastSeen || 0);
                
                // Merge URLs if available - filter by today if needed
                if (win.urls && Array.isArray(win.urls)) {
                  if (!existing.urls) existing.urls = [];
                  const filteredUrls = dateFilter === 'today'
                    ? win.urls.filter(urlEntry => {
                        const urlTime = urlEntry.timestamp || 0;
                        return urlTime >= todayStart && urlTime <= todayEnd;
                      })
                    : win.urls;
                  
                  filteredUrls.forEach((urlEntry) => {
                    const existingUrl = existing.urls.find((u) => {
                      if (urlEntry.url && u.url) {
                        return u.url === urlEntry.url;
                      } else if (urlEntry.title && u.title) {
                        return u.title === urlEntry.title;
                      }
                      return false;
                    });
                    
                    if (existingUrl) {
                      existingUrl.count = (existingUrl.count || 1) + (urlEntry.count || 1);
                      existingUrl.timestamp = Math.max(existingUrl.timestamp || 0, urlEntry.timestamp || 0);
                    } else {
                      existing.urls.push({
                        url: urlEntry.url || null,
                        title: urlEntry.title || null,
                        timestamp: urlEntry.timestamp || Date.now(),
                        count: urlEntry.count || 1
                      });
                    }
                  });
                }
              } else {
                // New window - add to map
                // Filter URLs by today if needed
                const filteredUrls = win.urls && dateFilter === 'today'
                  ? win.urls.filter(urlEntry => {
                      const urlTime = urlEntry.timestamp || 0;
                      return urlTime >= todayStart && urlTime <= todayEnd;
                    })
                  : (win.urls || []);
                
                combinedWindowsMap.set(windowKey, {
                  windowKey: windowKey,
                  appName: win.appName || win.windowKey || 'Unknown',
                  title: win.title || win.appName || 'Unknown',
                  keystrokes: win.keystrokes || 0,
                  mouseClicks: win.mouseClicks || 0,
                  timeSpent: win.timeSpent || 0,
                  lastSeen: win.lastSeen || Date.now(),
                  urls: filteredUrls.map((u) => ({
                    url: u.url || null,
                    title: u.title || null,
                    timestamp: u.timestamp || Date.now(),
                    count: u.count || 1
                  }))
                });
              }
            });
          }
          
          // Combine urlHistory - deduplicate by URL, filter by today if needed
          if (data.trackingData.urlHistory && Array.isArray(data.trackingData.urlHistory)) {
            const filteredUrlHistory = dateFilter === 'today'
              ? data.trackingData.urlHistory.filter(urlEntry => {
                  const urlTime = urlEntry.timestamp || 0;
                  return urlTime >= todayStart && urlTime <= todayEnd;
                })
              : data.trackingData.urlHistory;
            
            filteredUrlHistory.forEach((urlEntry) => {
              const urlKey = urlEntry.url || urlEntry.title || '';
              const existing = combinedUrlHistory.find((u) => {
                if (urlEntry.url && u.url) {
                  return u.url === urlEntry.url;
                } else if (urlEntry.title && u.title) {
                  return u.title === urlEntry.title;
                }
                return false;
              });
              
              if (!existing) {
                combinedUrlHistory.push({
                  url: urlEntry.url || null,
                  title: urlEntry.title || 'Unknown',
                  timestamp: urlEntry.timestamp || Date.now()
                });
              }
            });
          }
          
          // Aggregate summary - use summary totals or calculate from activeWindows
          if (data.trackingData.summary) {
            // For today filter: Since tasks are already filtered to today, use summary totals
            // OR calculate from activeWindows (which have accurate per-window totals)
            if (dateFilter === 'today') {
              // Calculate from activeWindows (most accurate - sums keystrokes/clicks from all windows)
              // This ensures we get the actual cumulative totals, not per-log values
              let taskKeystrokes = 0;
              let taskClicks = 0;
              
              if (data.trackingData.activeWindows && Array.isArray(data.trackingData.activeWindows)) {
                // Sum keystrokes and clicks from all windows that were active today
                const filteredWindows = data.trackingData.activeWindows.filter(win => {
                  const lastSeen = win.lastSeen || win.timestamp || 0;
                  return lastSeen >= todayStart && lastSeen <= todayEnd;
                });
                
                taskKeystrokes = filteredWindows.reduce((sum, win) => sum + (win.keystrokes || 0), 0);
                taskClicks = filteredWindows.reduce((sum, win) => sum + (win.mouseClicks || 0), 0);
              }
              
              // Fallback to summary totals if activeWindows calculation gives 0
              // (This handles cases where windows data might not be available)
              if (taskKeystrokes === 0 && taskClicks === 0) {
                taskKeystrokes = data.trackingData.summary.totalKeystrokes || 0;
                taskClicks = data.trackingData.summary.totalMouseClicks || 0;
              }
              
              combined.summary.totalKeystrokes += taskKeystrokes;
              combined.summary.totalMouseClicks += taskClicks;
              
              // Calculate average productivity score from today's logs
              const filteredLogs = data.trackingData.activityLogs 
                ? data.trackingData.activityLogs.filter(log => {
                    const logTime = log.timestamp ? new Date(log.timestamp).getTime() : 
                                   (log.createdAt ? new Date(log.createdAt).getTime() : 0);
                    return logTime >= todayStart && logTime <= todayEnd;
                  })
                : [];
              
              if (filteredLogs.length > 0) {
                const taskScores = filteredLogs
                  .map(log => log.productivityScore || log.compositeScore || 0)
                  .filter(score => score > 0);
                
                if (taskScores.length > 0) {
                  const taskAvg = taskScores.reduce((sum, s) => sum + s, 0) / taskScores.length;
                  totalProductivityScores += taskAvg;
                  totalProductivityCount++;
                }
              }
            } else {
              // For 'all', use summary as-is
              combined.summary.totalKeystrokes += data.trackingData.summary.totalKeystrokes || 0;
              combined.summary.totalMouseClicks += data.trackingData.summary.totalMouseClicks || 0;
              
              // Calculate average productivity score
              if (data.trackingData.activityLogs && data.trackingData.activityLogs.length > 0) {
                const taskScores = data.trackingData.activityLogs
                  .map(log => log.productivityScore || log.compositeScore || 0)
                  .filter(score => score > 0);
                
                if (taskScores.length > 0) {
                  const taskAvg = taskScores.reduce((sum, s) => sum + s, 0) / taskScores.length;
                  totalProductivityScores += taskAvg;
                  totalProductivityCount++;
                }
              }
            }
          }
          
          // Add to projects summary - use same calculation as combined summary
          if (dateFilter === 'today') {
            // Calculate from activeWindows (same logic as combined summary)
            let taskKeystrokes = 0;
            let taskClicks = 0;
            
            if (data.trackingData.activeWindows && Array.isArray(data.trackingData.activeWindows)) {
              const filteredWindows = data.trackingData.activeWindows.filter(win => {
                const lastSeen = win.lastSeen || win.timestamp || 0;
                return lastSeen >= todayStart && lastSeen <= todayEnd;
              });
              
              taskKeystrokes = filteredWindows.reduce((sum, win) => sum + (win.keystrokes || 0), 0);
              taskClicks = filteredWindows.reduce((sum, win) => sum + (win.mouseClicks || 0), 0);
            }
            
            // Fallback to summary totals if activeWindows calculation gives 0
            if (taskKeystrokes === 0 && taskClicks === 0) {
              taskKeystrokes = data.trackingData.summary?.totalKeystrokes || 0;
              taskClicks = data.trackingData.summary?.totalMouseClicks || 0;
            }
            
            // Only count if task has today's activity
            const filteredLogs = data.trackingData.activityLogs 
              ? data.trackingData.activityLogs.filter(log => {
                  const logTime = log.timestamp ? new Date(log.timestamp).getTime() : 
                                 (log.createdAt ? new Date(log.createdAt).getTime() : 0);
                  return logTime >= todayStart && logTime <= todayEnd;
                })
              : [];
            
            if (filteredLogs.length > 0 || taskKeystrokes > 0 || taskClicks > 0) {
              projects[projId].taskCount++;
              projects[projId].totalKeystrokes += taskKeystrokes;
              projects[projId].totalMouseClicks += taskClicks;
            }
          } else {
            projects[projId].taskCount++;
            projects[projId].totalKeystrokes += data.trackingData.summary?.totalKeystrokes || 0;
            projects[projId].totalMouseClicks += data.trackingData.summary?.totalMouseClicks || 0;
          }
          
          // Add task info - only include if has today's activity when filtering
          if (dateFilter === 'today') {
            const filteredLogs = data.trackingData.activityLogs 
              ? data.trackingData.activityLogs.filter(log => {
                  const logTime = log.timestamp ? new Date(log.timestamp).getTime() : 
                                 (log.createdAt ? new Date(log.createdAt).getTime() : 0);
                  return logTime >= todayStart && logTime <= todayEnd;
                })
              : [];
            const filteredScreenshots = data.trackingData.screenshots
              ? data.trackingData.screenshots.filter(screenshot => {
                  const screenshotTime = screenshot.timestamp ? new Date(screenshot.timestamp).getTime() :
                                       (screenshot.createdAt ? new Date(screenshot.createdAt).getTime() : 0);
                  return screenshotTime >= todayStart && screenshotTime <= todayEnd;
                })
              : [];
            const filteredWebcamPhotos = data.trackingData.webcamPhotos
              ? data.trackingData.webcamPhotos.filter(photo => {
                  const photoTime = photo.timestamp ? new Date(photo.timestamp).getTime() :
                                  (photo.createdAt ? new Date(photo.createdAt).getTime() : 0);
                  return photoTime >= todayStart && photoTime <= todayEnd;
                })
              : [];
            
            // Only add task if it has today's activity
            if (filteredLogs.length > 0 || filteredScreenshots.length > 0 || filteredWebcamPhotos.length > 0) {
              tasks.push({
                taskId: taskId,
                projectId: projId,
                taskName: data.metadata.taskName || 'Unknown Task',
                projectName: data.metadata.projectName || 'Unknown Project',
                createdAt: data.metadata.createdAt,
                lastUpdated: data.metadata.lastUpdated,
                summary: data.trackingData.summary,
                activityLogCount: filteredLogs.length,
                screenshotCount: filteredScreenshots.length,
                webcamPhotoCount: filteredWebcamPhotos.length
              });
            }
          } else {
            tasks.push({
              taskId: taskId,
              projectId: projId,
              taskName: data.metadata.taskName || 'Unknown Task',
              projectName: data.metadata.projectName || 'Unknown Project',
              createdAt: data.metadata.createdAt,
              lastUpdated: data.metadata.lastUpdated,
              summary: data.trackingData.summary,
              activityLogCount: data.trackingData.activityLogs?.length || 0,
              screenshotCount: data.trackingData.screenshots?.length || 0,
              webcamPhotoCount: data.trackingData.webcamPhotos?.length || 0
            });
          }
        } catch (error) {
          console.error(`[COMBINED-INSIGHTS] Error reading file ${filePath}:`, error.message);
        }
    }
    
    // Calculate average productivity score
    if (totalProductivityCount > 0) {
      combined.summary.averageProductivityScore = Math.round(totalProductivityScores / totalProductivityCount);
    }
    
    // Calculate total time from activity logs (already filtered by date if needed)
    if (combined.activityLogs.length > 0) {
      const sortedLogs = combined.activityLogs.sort((a, b) => {
        const aTime = a.timestamp ? new Date(a.timestamp).getTime() : 
                     (a.createdAt ? new Date(a.createdAt).getTime() : 0);
        const bTime = b.timestamp ? new Date(b.timestamp).getTime() : 
                     (b.createdAt ? new Date(b.createdAt).getTime() : 0);
        return aTime - bTime;
      });
      const firstLog = sortedLogs[0];
      const lastLog = sortedLogs[sortedLogs.length - 1];
      const startTime = firstLog.timestamp ? new Date(firstLog.timestamp).getTime() : 
                       (firstLog.createdAt ? new Date(firstLog.createdAt).getTime() : 0);
      const endTime = lastLog.timestamp ? new Date(lastLog.timestamp).getTime() : 
                     (lastLog.createdAt ? new Date(lastLog.createdAt).getTime() : 0);
      combined.summary.totalTime = Math.floor((endTime - startTime) / 1000); // in seconds
    }
    
    // Convert combinedWindowsMap to array and sort by timeSpent
    combined.activeWindows = Array.from(combinedWindowsMap.values())
      .sort((a, b) => (b.timeSpent || 0) - (a.timeSpent || 0));
    
    // Sort urlHistory by timestamp (newest first)
    combined.urlHistory = combinedUrlHistory.sort((a, b) => 
      (b.timestamp || 0) - (a.timestamp || 0)
    );
    
    // Sort tasks by lastUpdated (newest first)
    tasks.sort((a, b) => {
      const aTime = a.lastUpdated ? new Date(a.lastUpdated).getTime() : 0;
      const bTime = b.lastUpdated ? new Date(b.lastUpdated).getTime() : 0;
      return bTime - aTime;
    });
    
    return {
      success: true,
      totalTasks: tasks.length,
      totalProjects: Object.keys(projects).length,
      combinedData: combined,
      tasks: tasks,
      projects: projects,
      lastUpdated: new Date().toISOString()
    };
  } catch (error) {
    console.error('[COMBINED-INSIGHTS] Error combining tracking data:', error);
    return {
      success: false,
      error: error.message,
      totalTasks: 0,
      totalProjects: 0,
      combinedData: {
        activityLogs: [],
        screenshots: [],
        webcamPhotos: [],
        activeWindows: [],
        urlHistory: [],
        summary: {
          totalKeystrokes: 0,
          totalMouseClicks: 0,
          totalTime: 0,
          averageProductivityScore: 0
        }
      },
      tasks: [],
      projects: {}
    };
  }
};

// Helper function to manually trigger Combined Insights update
// This is called when tasks start tracking or data is saved
// NOTE: Must be defined after combineAllTrackingData and combinedInsightsListeners
const triggerCombinedInsightsUpdate = () => {
  if (combinedInsightsListeners && combinedInsightsListeners.size > 0) {
    const combinedData = combineAllTrackingData('today');
    
    // Notify all listeners immediately (no debounce for manual triggers)
    combinedInsightsListeners.forEach(listener => {
      if (listener && !listener.isDestroyed()) {
        listener.send('combined-insights-update', combinedData);
      }
    });
    
    if (isDev) {
      console.log(`[COMBINED-INSIGHTS] Manually triggered update for ${combinedInsightsListeners.size} listener(s)`);
    }
  }
};

// Get combined insights from all tracking files
// dateFilter: 'today' | 'all' - filters data by date (default: 'today')
ipcMain.handle('get-combined-insights', async (event, dateFilter = 'today') => {
  return combineAllTrackingData(dateFilter);
});

// Start watching tracking data directory for changes
const startTrackingDataWatcher = () => {
  try {
    const projectRoot = path.join(__dirname, '..');
    const trackingDataPath = path.join(projectRoot, 'tracking-data');
    
    if (!fs.existsSync(trackingDataPath)) {
      // Create directory if it doesn't exist
      fs.mkdirSync(trackingDataPath, { recursive: true });
    }
    
    // Watch the entire tracking-data directory recursively
    const watcher = fs.watch(trackingDataPath, { recursive: true }, (eventType, filename) => {
      if (filename && filename.endsWith('.json')) {
        if (isDev) {
          console.log(`[COMBINED-INSIGHTS] File ${eventType}: ${filename}`);
        }
        
        // Debounce updates (wait 500ms after last change)
        if (trackingDataWatchers.has('debounceTimer')) {
          clearTimeout(trackingDataWatchers.get('debounceTimer'));
        }
        
        const debounceTimer = setTimeout(() => {
          const combinedData = combineAllTrackingData('today'); // Always use today filter for real-time updates
          
          // Notify all listeners
          combinedInsightsListeners.forEach(listener => {
            if (listener && !listener.isDestroyed()) {
              listener.send('combined-insights-update', combinedData);
            }
          });
        }, 500);
        
        trackingDataWatchers.set('debounceTimer', debounceTimer);
      }
    });
    
    trackingDataWatchers.set('mainWatcher', watcher);
    
    if (isDev) {
      console.log('[COMBINED-INSIGHTS] Started watching tracking-data directory');
    }
  } catch (error) {
    console.error('[COMBINED-INSIGHTS] Error starting file watcher:', error);
  }
};

// Register listener for combined insights updates
ipcMain.handle('subscribe-combined-insights', (event, dateFilter = 'today') => {
  combinedInsightsListeners.add(event.sender);
  
  // Send initial data (default to today's data)
  const combinedData = combineAllTrackingData(dateFilter);
  event.sender.send('combined-insights-update', combinedData);
  
  // Start watcher if not already started
  if (!trackingDataWatchers.has('mainWatcher')) {
    startTrackingDataWatcher();
  }
  
  // Cleanup when renderer is destroyed
  event.sender.on('destroyed', () => {
    combinedInsightsListeners.delete(event.sender);
  });
});

// Unsubscribe from combined insights updates
ipcMain.handle('unsubscribe-combined-insights', (event) => {
  combinedInsightsListeners.delete(event.sender);
});

// ==================== End Combined Insights IPC Handlers ====================

// ==================== End Task Tracking IPC Handlers ====================

// Get last active task state - now only uses task JSON files (no .active-task-state.json)
const getLastActiveTaskState = () => {
  // Always use findLastActiveTaskFromFiles to get the most recently active task
  // This ensures we only rely on task tracking JSON files
  return findLastActiveTaskFromFiles();
};

// Find the most recently active task from JSON files
const findLastActiveTaskFromFiles = () => {
  try {
    const projectRoot = path.join(__dirname, '..');
    const trackingDataPath = path.join(projectRoot, 'tracking-data');
    
    if (!fs.existsSync(trackingDataPath)) {
      return null;
    }
    
    const taskFiles = findAllTaskFiles(trackingDataPath);
    let lastActiveTask = null;
    let lastUpdateTime = 0;
    
    for (const taskFile of taskFiles) {
      try {
        const fileContent = fs.readFileSync(taskFile.filePath, 'utf8');
        const data = JSON.parse(fileContent);
        
        if (data.metadata && data.metadata.lastUpdated) {
          const updateTime = new Date(data.metadata.lastUpdated).getTime();
          
          // Check if this task has recent activity (within last 24 hours)
          const hoursSinceUpdate = (Date.now() - updateTime) / (1000 * 60 * 60);
          
          if (hoursSinceUpdate <= 24 && updateTime > lastUpdateTime) {
            lastUpdateTime = updateTime;
            lastActiveTask = {
              projectId: taskFile.projectId,
              taskId: taskFile.taskId,
              taskName: data.metadata.taskName || null,
              projectName: data.metadata.projectName || null,
              lastUpdated: data.metadata.lastUpdated,
              hasActivity: (data.trackingData?.activityLogs?.length || 0) > 0
            };
          }
        }
      } catch (error) {
        // Skip invalid files
        continue;
      }
    }
    
    return lastActiveTask;
  } catch (error) {
    console.error('[FIND-LAST-TASK] Error finding last active task:', error);
    return null;
  }
};

// Cleanup on quit
app.on('will-quit', () => {
  // Close all active time capsules before app quits
  perTaskTracking.forEach((taskData, taskKey) => {
    if (taskData && taskData.activeWindows) {
      taskData.activeWindows.forEach((windowData, windowKey) => {
        if (windowData.startTime) {
          // Initialize timeCapsules array if it doesn't exist
          if (!windowData.timeCapsules) {
            windowData.timeCapsules = [];
          }
          
          // Close the active time capsule
          const endTime = Date.now();
          const startTime = windowData.startTime;
          const duration = Math.floor((endTime - startTime) / 1000);
          
          // Check if this capsule already exists (prevent duplicates)
          const capsuleKey = `${startTime}-${endTime}`;
          const existingCapsule = windowData.timeCapsules.find(c => 
            `${c.startTime}-${c.endTime}` === capsuleKey
          );
          
          if (!existingCapsule) {
            // Only add if it doesn't already exist
            windowData.timeCapsules.push({
              startTime: startTime,
              endTime: endTime,
              duration: duration
            });
          }
          
          // Clear startTime
          windowData.startTime = null;
          windowData.lastSeen = endTime;
        }
      });
      
      // Save task data immediately before quitting
      const [projectId, taskId] = taskKey.split(':');
      if (projectId && taskId) {
        saveTaskTrackingDataToFile(projectId, taskId, null, null, true);
      }
    }
  });
  
  globalShortcut.unregisterAll();
  if (activityMonitoringInterval) {
    clearInterval(activityMonitoringInterval);
  }
  
  // Save all active task data before quitting (IMMEDIATE save)
  if (currentTaskId && currentProjectId) {
    const taskKey = getTaskKey(currentProjectId, currentTaskId);
    // Clear any pending saves
    if (taskKey && saveTimers.has(taskKey)) {
      clearTimeout(saveTimers.get(taskKey));
      saveTimers.delete(taskKey);
    }
    // Immediate save
    saveTaskTrackingDataToFile(currentProjectId, currentTaskId, null, null, true);
    if (isDev) {
      console.log(`[APP-QUIT] Immediately saved task ${currentTaskId} data before quitting`);
    }
  }
  
  // No longer saving active task state - all data comes from task JSON files
  
  // Clear all pending save timers
  saveTimers.forEach(timer => clearTimeout(timer));
  saveTimers.clear();
  
  // Cleanup combined insights watchers
  if (trackingDataWatchers.has('debounceTimer')) {
    clearTimeout(trackingDataWatchers.get('debounceTimer'));
  }
  if (trackingDataWatchers.has('mainWatcher')) {
    trackingDataWatchers.get('mainWatcher').close();
  }
  trackingDataWatchers.clear();
  combinedInsightsListeners.clear();
  
  // Cleanup tracking
  try {
    if (uIOhook && isUiohookInitialized) {
      uIOhook.stop();
      uIOhook.removeAllListeners();
      isUiohookInitialized = false;
    }
  } catch (error) {
    // Ignore cleanup errors
  }
});

