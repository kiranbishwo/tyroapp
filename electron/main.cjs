const { app, BrowserWindow, ipcMain, desktopCapturer, nativeImage, globalShortcut, Tray, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);
const isDev = process.env.NODE_ENV === 'development';

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
    width: 400,
    height: 800,
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
    minWidth: 350,
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

// Screenshot capture handler (no screen share needed)
ipcMain.handle('capture-screenshot', async () => {
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

// Helper function to extract URL from window title (for browsers)
// Improved version that extracts URLs more aggressively
const extractUrlFromTitle = (title, appName) => {
  if (!title || !appName) return null;
  
  const lowerTitle = title.toLowerCase();
  const lowerApp = appName.toLowerCase();
  
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
ipcMain.handle('start-activity-monitoring', async () => {
  if (activityMonitoringInterval) {
    clearInterval(activityMonitoringInterval);
  }

  // Reset counters
  keystrokeCount = 0;
  mouseClickCount = 0;
  lastActivityTimestamp = Date.now(); // Initialize last activity timestamp
  isTrackingActive = true;
  
  // Reset per-window tracking
  perWindowStats.clear();
  currentWindowKey = null;

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
        
        // Check if window changed - if so, reset counters for new window
        if (windowKey !== currentWindowKey) {
          if (isDev && currentWindowKey) {
            const oldStats = perWindowStats.get(currentWindowKey);
            console.log('[WINDOW-SWITCH] Switched from', currentWindowKey, 'to', windowKey);
            console.log('[WINDOW-SWITCH] Previous window stats:', oldStats ? { keystrokes: oldStats.keystrokes, clicks: oldStats.clicks } : 'none');
          } else if (isDev && !currentWindowKey) {
            console.log('[WINDOW-INIT] Initializing tracking for window:', windowKey);
          }
          currentWindowKey = windowKey;
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
        
        const currentWindow = {
          title: win.title || 'Unknown',
          owner: ownerName,
          url: url,
          app: ownerName,
          keystrokes: windowStats.keystrokes, // Per-window keystrokes
          mouseClicks: windowStats.clicks, // Per-window clicks
          // Also include global counters for backward compatibility
          globalKeystrokes: keystrokeCount,
          globalClicks: mouseClickCount
        };

        // Always send update (don't check if changed, to ensure real-time tracking)
        lastActiveWindow = currentWindow;
        mainWindow.webContents.send('activity-update', currentWindow);
        
        console.log('[ACTIVITY] App:', currentWindow.app, '| Title:', currentWindow.title.substring(0, 50), '| URL:', currentWindow.url || 'N/A', '| Keys:', windowStats.keystrokes, '| Clicks:', windowStats.clicks);
      } else {
        // Fallback to Windows PowerShell method if active-win didn't work
        if (!win && process.platform === 'win32') {
          const windowInfo = await getActiveWindowWindows();
          if (windowInfo && mainWindow) {
            // Extract URL from title if not available
            const url = windowInfo.url || extractUrlFromTitle(windowInfo.title, windowInfo.app);
            
            // Create window key for per-window tracking
            const windowKey = getWindowKey(windowInfo.app, windowInfo.title);
            
            // Check if window changed
            if (windowKey !== currentWindowKey) {
              if (isDev && currentWindowKey) {
                const oldStats = perWindowStats.get(currentWindowKey);
                console.log('[WINDOW-SWITCH] Switched from', currentWindowKey, 'to', windowKey);
                console.log('[WINDOW-SWITCH] Previous window stats:', oldStats ? { keystrokes: oldStats.keystrokes, clicks: oldStats.clicks } : 'none');
              } else if (isDev && !currentWindowKey) {
                console.log('[WINDOW-INIT] Initializing tracking for window:', windowKey);
              }
              currentWindowKey = windowKey;
              getWindowStats(windowKey, windowInfo.title, url);
            }
            
            // Get per-window statistics (update title and URL)
            const windowStats = getWindowStats(windowKey, windowInfo.title, url);
            
            const currentWindow = {
              title: windowInfo.title || 'Unknown',
              owner: windowInfo.owner || 'Unknown',
              url: url,
              app: windowInfo.owner || windowInfo.title || 'Unknown',
              keystrokes: windowStats.keystrokes, // Per-window keystrokes
              mouseClicks: windowStats.clicks, // Per-window clicks
              // Also include global counters for backward compatibility
              globalKeystrokes: keystrokeCount,
              globalClicks: mouseClickCount
            };
            lastActiveWindow = currentWindow;
            mainWindow.webContents.send('activity-update', currentWindow);
            
            console.log('[ACTIVITY-PS] App:', currentWindow.app, '| Title:', currentWindow.title.substring(0, 50), '| URL:', currentWindow.url || 'N/A', '| Keys:', windowStats.keystrokes, '| Clicks:', windowStats.clicks);
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

// Stop activity monitoring
ipcMain.handle('stop-activity-monitoring', () => {
  if (activityMonitoringInterval) {
    clearInterval(activityMonitoringInterval);
    activityMonitoringInterval = null;
  }
  
  if (allWindowsUpdateInterval) {
    clearInterval(allWindowsUpdateInterval);
    allWindowsUpdateInterval = null;
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
  // Pre-initialize store to avoid delays in IPC handlers
  await initStore();
  createWindow();
  createTray();

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

// Cleanup on quit
app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  if (activityMonitoringInterval) {
    clearInterval(activityMonitoringInterval);
  }
  
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

