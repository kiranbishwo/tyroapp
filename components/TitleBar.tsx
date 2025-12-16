import React, { useState, useEffect } from 'react';

// Electron API types are defined in types/electron.d.ts

export const TitleBar: React.FC = () => {
  const [isMaximized, setIsMaximized] = useState(false);
  const [isElectron, setIsElectron] = useState(false);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;
    let retryTimeout: ReturnType<typeof setTimeout> | null = null;
    let retryCount = 0;
    const maxRetries = 50; // Max 5 seconds of retrying

    // Check if running in Electron (check after a small delay to ensure preload script has loaded)
    const checkElectron = () => {
      if (window.electronAPI) {
        setIsElectron(true);
        // Check initial maximized state
        window.electronAPI.windowIsMaximized().then(setIsMaximized);

        // Listen for maximize/unmaximize events
        const checkMaximized = () => {
          window.electronAPI?.windowIsMaximized().then(setIsMaximized);
        };
        
        // Check periodically
        interval = setInterval(checkMaximized, 500);
      } else if (retryCount < maxRetries) {
        // Retry after a short delay if not available yet
        retryCount++;
        retryTimeout = setTimeout(checkElectron, 100);
      }
    };
    
    checkElectron();

    return () => {
      if (interval) clearInterval(interval);
      if (retryTimeout) clearTimeout(retryTimeout);
    };
  }, []);

  const handleMinimize = () => {
    if (window.electronAPI) {
      window.electronAPI.windowMinimize();
    }
  };

  const handleMaximize = () => {
    if (window.electronAPI) {
      window.electronAPI.windowMaximize();
      // Update state after a short delay
      setTimeout(() => {
        window.electronAPI?.windowIsMaximized().then(setIsMaximized);
      }, 100);
    }
  };

  const handleClose = () => {
    if (window.electronAPI) {
      window.electronAPI.windowClose();
    }
  };

  // Always show title bar (will show even if Electron API not ready yet)
  // In web browser, it will just be a static bar without functionality

  return (
    <div 
      className="h-8 bg-gray-800 flex items-center justify-between px-2 select-none border-b border-gray-700 z-50 sticky top-0"
      style={isElectron ? ({ WebkitAppRegion: 'drag' } as React.CSSProperties) : {}}
    >
      {/* Brand Name */}
      <div className="flex items-center gap-2 px-2" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <img 
          src="./logo.png" 
          alt="Tyrodesk Logo" 
          className="h-5 w-5 object-contain"
          onError={(e) => {
            // Fallback if logo doesn't load - try absolute path as fallback
            const img = e.target as HTMLImageElement;
            if (img.src && !img.src.includes('logo.png')) {
              img.src = '/logo.png';
            } else {
              img.style.display = 'none';
            }
          }}
        />
        <span className="text-xs font-bold text-gray-200">Tyrodesk</span>
      </div>

      {/* Window Controls */}
      <div className="flex items-center" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <button
          onClick={handleMinimize}
          className="w-8 h-8 flex items-center justify-center text-gray-400 hover:bg-gray-700 hover:text-white transition-colors"
          title="Minimize"
        >
          <i className="fas fa-minus text-[10px]"></i>
        </button>
        <button
          onClick={handleMaximize}
          className="w-8 h-8 flex items-center justify-center text-gray-400 hover:bg-gray-700 hover:text-white transition-colors"
          title={isMaximized ? "Restore" : "Maximize"}
        >
          <i className={`fas ${isMaximized ? 'fa-window-restore' : 'fa-square'} text-[10px]`}></i>
        </button>
        <button
          onClick={handleClose}
          className="w-8 h-8 flex items-center justify-center text-gray-400 hover:bg-red-600 hover:text-white transition-colors"
          title="Close"
        >
          <i className="fas fa-times text-[10px]"></i>
        </button>
      </div>
    </div>
  );
};

