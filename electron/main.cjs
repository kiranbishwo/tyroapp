const { app, BrowserWindow, ipcMain, desktopCapturer, nativeImage, globalShortcut } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);
const isDev = process.env.NODE_ENV === 'development';

// Helper function to get active-win (ES module, needs dynamic import)
let activeWinModule = null;
let useActiveWin = true; // Try active-win first, fallback to PowerShell if it fails

const getActiveWindow = async () => {
  if (useActiveWin) {
    try {
      if (!activeWinModule) {
        activeWinModule = (await import('active-win')).default;
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
let activityMonitoringInterval = null;
let keystrokeCount = 0;
let lastActiveWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 400,
    height: 800,
    frame: false, // Remove default title bar
    titleBarStyle: 'hidden',
    backgroundColor: '#000000',
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
  if (mainWindow) mainWindow.close();
});

ipcMain.handle('window-is-maximized', () => {
  return mainWindow ? mainWindow.isMaximized() : false;
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
                    lowerApp.includes('opera');
  
  if (!isBrowser) return null;
  
  // Try to extract URL patterns from title
  // Common patterns:
  // - "Page Title - Browser Name"
  // - "YouTube - Browser Name" (we can infer youtube.com)
  // - URLs sometimes appear in titles
  
  // Check for common sites in title
  if (lowerTitle.includes('youtube')) {
    // Try to extract video ID or construct URL
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

// Start activity monitoring
ipcMain.handle('start-activity-monitoring', () => {
  if (activityMonitoringInterval) {
    clearInterval(activityMonitoringInterval);
  }

  // Reset keystroke counter
  keystrokeCount = 0;

  // Track keystrokes using global shortcuts (limited - only when app has focus)
  // Note: For true system-wide tracking, you'd need a native module like node-keylogger
  // For now, we'll track activity through the active window monitoring
  // Keystrokes are tracked in the renderer process (useSurveillance hook)

  // Monitor active window every 1 second for better tracking
  activityMonitoringInterval = setInterval(async () => {
    try {
      // Use active-win directly (simpler pattern)
      const win = await getActiveWindow();
      
      if (win && mainWindow) {
        // Extract URL from title if not available
        const url = win.url || extractUrlFromTitle(win.title, win.owner);
        const currentWindow = {
          title: win.title || 'Unknown',
          owner: win.owner || 'Unknown',
          url: url,
          app: win.owner || win.title || 'Unknown',
          keystrokes: keystrokeCount
        };

        // Always send update (don't check if changed, to ensure real-time tracking)
        lastActiveWindow = currentWindow;
        mainWindow.webContents.send('activity-update', currentWindow);
        console.log('Activity update sent:', currentWindow.app, currentWindow.title, 'URL:', currentWindow.url);
      } else {
        // Fallback to Windows PowerShell method if active-win didn't work
        if (!win && process.platform === 'win32') {
          const windowInfo = await getActiveWindowWindows();
          if (windowInfo && mainWindow) {
            // Extract URL from title if not available
            const url = windowInfo.url || extractUrlFromTitle(windowInfo.title, windowInfo.app);
            const currentWindow = {
              title: windowInfo.title || 'Unknown',
              owner: windowInfo.owner || 'Unknown',
              url: url,
              app: windowInfo.owner || windowInfo.title || 'Unknown',
              keystrokes: keystrokeCount
            };
            lastActiveWindow = currentWindow;
            mainWindow.webContents.send('activity-update', currentWindow);
            console.log('Activity update sent (PowerShell):', currentWindow.app, currentWindow.title, 'URL:', currentWindow.url);
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
  globalShortcut.unregisterAll();
  keystrokeCount = 0;
  lastActiveWindow = null;
  return true;
});

// This method will be called when Electron has finished initialization
app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Quit when all windows are closed
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Cleanup on quit
app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  if (activityMonitoringInterval) {
    clearInterval(activityMonitoringInterval);
  }
});

