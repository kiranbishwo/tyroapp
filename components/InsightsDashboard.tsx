import React, { useMemo, useState, useEffect, useRef } from 'react';
import { ActivityLog, Project, AppUsage } from '../types';

interface InsightsDashboardProps {
    logs: ActivityLog[];
    projects: Project[];
    onClose: () => void;
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

export const InsightsDashboard: React.FC<InsightsDashboardProps> = ({ logs, projects, onClose }) => {
    // Real-time activity state
    const [currentActivity, setCurrentActivity] = useState<{
        app: string;
        title: string;
        url?: string;
        keystrokes: number;
        clicks: number;
        timestamp: number;
    } | null>(null);
    
    const sessionStartTimeRef = useRef<number | null>(null);
    const keystrokesRef = useRef(0);
    const clicksRef = useRef(0);
    const currentAppRef = useRef<string>('');
    
    // Listen to real-time activity updates
    useEffect(() => {
        if (!window.electronAPI) return;
        
        const handleActivityUpdate = (data: any) => {
            const now = Date.now();
            
            // If app changed, reset session
            if (data.app !== currentAppRef.current) {
                currentAppRef.current = data.app;
                sessionStartTimeRef.current = now;
                keystrokesRef.current = 0;
                clicksRef.current = 0;
            }
            
            // Update current activity
            setCurrentActivity({
                app: data.app || 'Unknown',
                title: data.title || 'Unknown',
                url: data.url || undefined,
                keystrokes: data.keystrokes || keystrokesRef.current,
                clicks: clicksRef.current,
                timestamp: now
            });
            
            // Track keystrokes and clicks
            if (data.keystrokes) {
                keystrokesRef.current = data.keystrokes;
            }
        };
        
        window.electronAPI.onActivityUpdate(handleActivityUpdate);
        
        return () => {
            if (window.electronAPI) {
                window.electronAPI.removeActivityListener();
            }
        };
    }, []);
    
    // Track clicks and keystrokes in real-time (within Electron window)
    useEffect(() => {
        const handleClick = () => {
            clicksRef.current++;
            if (currentActivity) {
                setCurrentActivity(prev => prev ? {
                    ...prev,
                    clicks: clicksRef.current
                } : null);
            }
        };
        
        const handleKeyDown = () => {
            keystrokesRef.current++;
            if (currentActivity) {
                setCurrentActivity(prev => prev ? {
                    ...prev,
                    keystrokes: keystrokesRef.current
                } : null);
            }
        };
        
        window.addEventListener('click', handleClick);
        window.addEventListener('keydown', handleKeyDown);
        return () => {
            window.removeEventListener('click', handleClick);
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [currentActivity]);
    
    // Force re-render every second to update time spent
    useEffect(() => {
        if (!currentActivity) return;
        
        const interval = setInterval(() => {
            // Trigger re-render to update time spent
            setCurrentActivity(prev => prev ? { ...prev, timestamp: Date.now() } : null);
        }, 1000);
        
        return () => clearInterval(interval);
    }, [currentActivity]);
    
    // Calculate aggregate stats (including real-time data)
    const stats = useMemo(() => {
        const totalProd = logs.reduce((acc, log) => acc + log.productivityScore, 0);
        const totalKeys = logs.reduce((acc, log) => acc + log.keyboardEvents, 0) + (currentActivity?.keystrokes || 0);
        const totalClicks = logs.reduce((acc, log) => acc + log.mouseEvents, 0) + (currentActivity?.clicks || 0);
        const avgProd = logs.length > 0 ? Math.round(totalProd / logs.length) : 0;
        
        return {
            avgProd,
            totalKeys,
            totalClicks
        };
    }, [logs, currentActivity]);

    // Calculate App Usage with detailed stats (including real-time data)
    const appUsage = useMemo(() => {
        const appStats: Record<string, {
            count: number;
            keystrokes: number;
            clicks: number;
            timeSpent: number; // in seconds (estimated from log count + real-time)
            urls: Array<{ url: string; timestamp: Date; count: number }>; // Track URLs visited
            isActive: boolean; // Is this the currently active app?
        }> = {};
        
        // Process historical logs
        logs.forEach(log => {
            const appName = log.activeWindow;
            if (!appStats[appName]) {
                appStats[appName] = {
                    count: 0,
                    keystrokes: 0,
                    clicks: 0,
                    timeSpent: 0,
                    urls: [],
                    isActive: false
                };
            }
            appStats[appName].count += 1;
            // Ensure we're using the actual number values, not undefined
            const keystrokes = typeof log.keyboardEvents === 'number' ? log.keyboardEvents : 0;
            const clicks = typeof log.mouseEvents === 'number' ? log.mouseEvents : 0;
            appStats[appName].keystrokes += keystrokes;
            appStats[appName].clicks += clicks;
            // Estimate time: each log represents ~30-60 seconds of activity
            appStats[appName].timeSpent += 45; // Average 45 seconds per log entry
            
            // Track URLs if available
            if (log.activeUrl) {
                const existingUrl = appStats[appName].urls.find(u => u.url === log.activeUrl);
                if (existingUrl) {
                    existingUrl.count += 1;
                    // Update timestamp to most recent
                    if (log.timestamp > existingUrl.timestamp) {
                        existingUrl.timestamp = log.timestamp;
                    }
                } else {
                    appStats[appName].urls.push({
                        url: log.activeUrl,
                        timestamp: log.timestamp,
                        count: 1
                    });
                }
            }
        });
        
        // Add real-time current activity data
        if (currentActivity) {
            const appName = currentActivity.app;
            if (!appStats[appName]) {
                appStats[appName] = {
                    count: 0,
                    keystrokes: 0,
                    clicks: 0,
                    timeSpent: 0,
                    urls: [],
                    isActive: true
                };
            }
            
            // Add real-time keystrokes and clicks
            appStats[appName].keystrokes += currentActivity.keystrokes;
            appStats[appName].clicks += currentActivity.clicks;
            appStats[appName].isActive = true;
            
            // Add real-time session time
            if (sessionStartTimeRef.current) {
                const sessionDuration = Math.floor((Date.now() - sessionStartTimeRef.current) / 1000);
                appStats[appName].timeSpent += sessionDuration;
            }
            
            // Add current URL if available
            if (currentActivity.url) {
                const existingUrl = appStats[appName].urls.find(u => u.url === currentActivity.url);
                if (existingUrl) {
                    existingUrl.count += 1;
                    existingUrl.timestamp = new Date();
                } else {
                    appStats[appName].urls.push({
                        url: currentActivity.url,
                        timestamp: new Date(),
                        count: 1
                    });
                }
            }
        }
        
        // Sort URLs by count (most visited first)
        Object.values(appStats).forEach(stats => {
            stats.urls.sort((a, b) => b.count - a.count);
        });
        
        const total = logs.length + (currentActivity ? 1 : 0) || 1;
        return Object.entries(appStats).map(([name, stats]) => ({
            appName: name,
            percentage: Math.round((stats.count / total) * 100),
            icon: 'fa-window-maximize',
            color: '#60A5FA',
            keystrokes: stats.keystrokes,
            clicks: stats.clicks,
            timeSpent: stats.timeSpent,
            urls: stats.urls,
            isActive: stats.isActive
        })).sort((a, b) => {
            // Sort active app first, then by percentage
            if (a.isActive && !b.isActive) return -1;
            if (!a.isActive && b.isActive) return 1;
            return b.percentage - a.percentage;
        });
    }, [logs, currentActivity]);

    // Expandable state
    const [expandedApps, setExpandedApps] = useState<Set<string>>(new Set());

    const toggleExpand = (appName: string) => {
        setExpandedApps(prev => {
            const next = new Set(prev);
            if (next.has(appName)) {
                next.delete(appName);
            } else {
                next.add(appName);
            }
            return next;
        });
    };

    const formatTime = (seconds: number): string => {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        if (hours > 0) {
            return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
        }
        return `${minutes}m`;
    };

    return (
        <div className="flex flex-col h-full bg-gray-950 text-white animate-fade-in overflow-hidden">
            {/* Header */}
            <div className="p-4 bg-gray-900 border-b border-gray-800 flex justify-between items-center shadow-lg z-10">
                <div>
                    <h2 className="text-lg font-bold flex items-center">
                        <i className="fas fa-chart-line text-blue-500 mr-2"></i>
                        Insights
                    </h2>
                    <p className="text-xs text-gray-500">Activity & Productivity Log</p>
                </div>
                <button onClick={onClose} className="text-gray-400 hover:text-white bg-gray-800 p-2 rounded-lg transition-colors">
                    <i className="fas fa-times"></i>
                </button>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-6">
                
                {/* Stats Cards */}
                <div className="grid grid-cols-3 gap-3">
                    <div className="bg-gray-900 p-3 rounded-lg border border-gray-800 text-center">
                        <div className="text-2xl font-bold text-green-400">{stats.avgProd}%</div>
                        <div className="text-[10px] uppercase text-gray-500 font-bold mt-1">Productivity</div>
                    </div>
                    <div className="bg-gray-900 p-3 rounded-lg border border-gray-800 text-center">
                        <div className="text-xl font-bold text-blue-400">{stats.totalKeys}</div>
                        <div className="text-[10px] uppercase text-gray-500 font-bold mt-1">Keystrokes</div>
                    </div>
                    <div className="bg-gray-900 p-3 rounded-lg border border-gray-800 text-center">
                        <div className="text-xl font-bold text-purple-400">{stats.totalClicks}</div>
                        <div className="text-[10px] uppercase text-gray-500 font-bold mt-1">Clicks</div>
                    </div>
                </div>

                {/* Activity Timeline Bar Chart */}
                <div className="bg-gray-900 rounded-lg p-4 border border-gray-800">
                    <h3 className="text-xs font-bold text-gray-400 uppercase mb-4">Activity Timeline</h3>
                    <div className="h-24 flex items-end gap-1 overflow-x-auto pb-2 custom-scrollbar">
                        {logs.length === 0 ? (
                            <div className="w-full h-full flex items-center justify-center text-gray-600 text-xs italic">
                                No activity recorded yet.
                            </div>
                        ) : (
                            logs.map((log) => {
                                const project = projects.find(p => p.id === log.projectId);
                                return (
                                    <div key={log.id} className="group relative flex-shrink-0 w-3 bg-gray-800 rounded-sm hover:bg-gray-700 transition-all cursor-pointer" style={{ height: '100%' }}>
                                        {/* Activity Bar */}
                                        <div 
                                            className="absolute bottom-0 w-full rounded-sm transition-all"
                                            style={{ 
                                                height: `${log.productivityScore}%`, 
                                                backgroundColor: project?.color || '#555' 
                                            }}
                                        ></div>
                                        {/* Tooltip */}
                                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block w-32 bg-black text-xs p-2 rounded border border-gray-700 z-50 pointer-events-none">
                                            <div className="font-bold mb-1">{log.timestamp.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div>
                                            <div>Win: {log.activeWindow}</div>
                                            <div>Prod: {log.productivityScore}%</div>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>

                {/* Recent Screenshots / Cam Snaps Grid */}
                <div>
                    <div className="flex items-center justify-between mb-3">
                        <h3 className="text-xs font-bold text-gray-400 uppercase">Evidence Log</h3>
                        <span className="text-[10px] text-gray-500">
                            {logs.filter(l => l.screenshotUrl || l.webcamUrl).length} captured
                        </span>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        {logs.filter(l => l.screenshotUrl || l.webcamUrl).length > 0 ? (
                            logs
                                .filter(l => l.screenshotUrl || l.webcamUrl)
                                .slice(0, 10) // Show latest 10
                                .map((log) => (
                                <div key={log.id} className="bg-gray-800 rounded-lg overflow-hidden border border-gray-700 group relative hover:border-blue-500 transition-colors">
                                    <div className="aspect-video relative bg-black">
                                        {log.screenshotUrl ? (
                                            <img 
                                                src={log.screenshotUrl} 
                                                alt="Screen Capture" 
                                                className="w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-opacity" 
                                                onError={(e) => {
                                                    console.error('Failed to load screenshot:', log.id);
                                                    (e.target as HTMLImageElement).style.display = 'none';
                                                }}
                                            />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center text-gray-600 text-xs">
                                                No screenshot
                                            </div>
                                        )}
                                        {/* Picture in Picture WebCam */}
                                        {log.webcamUrl && (
                                            <div className="absolute bottom-1 right-1 w-1/3 aspect-square rounded-full border-2 border-white/70 overflow-hidden shadow-lg bg-gray-900">
                                                <img 
                                                    src={log.webcamUrl} 
                                                    alt="Camera Photo" 
                                                    className="w-full h-full object-cover" 
                                                    onError={(e) => {
                                                        console.error('Failed to load webcam photo:', log.id);
                                                        (e.target as HTMLImageElement).style.display = 'none';
                                                    }}
                                                />
                                            </div>
                                        )}
                                        {/* Hover overlay with details */}
                                        <div className="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-xs p-2">
                                            <div className="text-white font-bold mb-1">
                                                {log.timestamp.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                            </div>
                                            <div className="text-gray-300 text-[10px] text-center">
                                                {log.activeWindow}
                                            </div>
                                            {log.activeUrl && (
                                                <div className="text-blue-400 text-[9px] mt-1 text-center max-w-full truncate" title={log.activeUrl}>
                                                    {log.activeUrl}
                                                </div>
                                            )}
                                            <div className="text-gray-400 text-[10px] mt-1">
                                                Prod: {log.productivityScore}%
                                            </div>
                                        </div>
                                    </div>
                                    <div className="p-2 flex flex-col gap-1 bg-gray-850">
                                        <div className="flex justify-between items-center">
                                            <span className="text-[10px] text-gray-400">
                                                {log.timestamp.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                            </span>
                                            <div className="flex items-center gap-1">
                                                {log.screenshotUrl && (
                                                    <span className="text-[8px] px-1 py-0.5 rounded bg-blue-500/20 text-blue-400" title="Screenshot">
                                                        📷
                                                    </span>
                                                )}
                                                {log.webcamUrl && (
                                                    <span className="text-[8px] px-1 py-0.5 rounded bg-green-500/20 text-green-400" title="Camera Photo">
                                                        📸
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-700 text-gray-300 truncate max-w-[120px]" title={log.activeWindow}>
                                                {log.activeWindow}
                                            </span>
                                            {log.activeUrl && (
                                                <span className="text-[9px] text-blue-400 truncate max-w-[150px]" title={log.activeUrl}>
                                                    🔗 {log.activeUrl.replace(/^https?:\/\//, '').split('/')[0]}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))
                        ) : (
                            <div className="col-span-2 text-center py-8 text-gray-600 bg-gray-900/50 rounded-lg border border-gray-800 border-dashed">
                                <i className="fas fa-camera text-2xl mb-2 block opacity-50"></i>
                                <p className="text-xs mb-1">No screenshots or photos captured yet</p>
                                <p className="text-[10px] text-gray-500">Start the timer to begin capturing</p>
                            </div>
                        )}
                    </div>
                    {logs.filter(l => l.screenshotUrl || l.webcamUrl).length > 10 && (
                        <div className="text-center mt-3 text-xs text-gray-500">
                            Showing latest 10 of {logs.filter(l => l.screenshotUrl || l.webcamUrl).length} captures
                        </div>
                    )}
                </div>

                {/* App Usage List */}
                <div>
                    <div className="flex items-center justify-between mb-3">
                        <h3 className="text-xs font-bold text-gray-400 uppercase">Top Applications</h3>
                        {currentActivity && (
                            <span className="text-[10px] text-green-400 flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse"></span>
                                Live
                            </span>
                        )}
                    </div>
                    <div className="space-y-2">
                        {appUsage.map((app, idx) => {
                            const isExpanded = expandedApps.has(app.appName);
                            return (
                                <div key={idx} className="bg-gray-800/50 rounded border border-gray-800 overflow-hidden">
                                    {/* Main Item - Clickable */}
                                    <div 
                                        className={`flex items-center justify-between text-sm p-2 cursor-pointer hover:bg-gray-800/70 transition-colors ${app.isActive ? 'bg-blue-500/10 border-l-2 border-blue-500' : ''}`}
                                        onClick={() => toggleExpand(app.appName)}
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className={`w-8 h-8 rounded flex items-center justify-center ${app.isActive ? 'bg-blue-500/20 text-blue-400' : 'bg-gray-700 text-gray-400'}`}>
                                                <i className={`fas ${app.appName.includes('Code') ? 'fa-code' : app.appName.includes('Chrome') ? 'fa-globe' : app.appName.includes('Brave') ? 'fa-shield-alt' : app.appName.includes('WhatsApp') ? 'fa-whatsapp' : 'fa-desktop'}`}></i>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className="font-medium text-gray-300">{app.appName}</span>
                                                {app.isActive && (
                                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 animate-pulse">
                                                        Active
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <div className="w-24 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                                                <div className="h-full bg-blue-500" style={{ width: `${app.percentage}%` }}></div>
                                            </div>
                                            <span className="text-xs font-mono w-8 text-right text-gray-400">{app.percentage}%</span>
                                            <button className="text-gray-500 hover:text-gray-300 transition-colors">
                                                <i className={`fas ${isExpanded ? 'fa-chevron-up' : 'fa-chevron-down'} text-xs`}></i>
                                            </button>
                                        </div>
                                    </div>
                                    
                                    {/* Expanded Content */}
                                    {isExpanded && (
                                        <div className="px-2 pb-2 pt-1 border-t border-gray-700/50 bg-gray-900/30">
                                            {/* Stats Grid */}
                                            <div className="grid grid-cols-3 gap-3 mt-2 mb-3">
                                                <div className="text-center">
                                                    <div className="text-lg font-bold text-blue-400">{(app.keystrokes || 0).toLocaleString()}</div>
                                                    <div className="text-[10px] text-gray-500 uppercase font-bold mt-0.5">Keystrokes</div>
                                                </div>
                                                <div className="text-center">
                                                    <div className="text-lg font-bold text-purple-400">{(app.clicks || 0).toLocaleString()}</div>
                                                    <div className="text-[10px] text-gray-500 uppercase font-bold mt-0.5">Mouse Clicks</div>
                                                </div>
                                                <div className="text-center">
                                                    <div className="text-lg font-bold text-green-400">{formatTime(app.timeSpent || 0)}</div>
                                                    <div className="text-[10px] text-gray-500 uppercase font-bold mt-0.5">Time Spent</div>
                                                </div>
                                            </div>
                                            
                                            {/* URL Details - Show for browsers */}
                                            {app.urls && app.urls.length > 0 && (
                                                <div className="mt-3 pt-3 border-t border-gray-700/50">
                                                    <div className="text-xs font-bold text-gray-400 uppercase mb-2 flex items-center gap-2">
                                                        <i className="fas fa-link text-blue-400"></i>
                                                        URLs Visited ({app.urls.length})
                                                    </div>
                                                    <div className="space-y-1.5 max-h-48 overflow-y-auto custom-scrollbar">
                                                        {app.urls.map((urlData, urlIdx) => (
                                                            <div 
                                                                key={urlIdx} 
                                                                className="bg-gray-800/50 rounded p-2 border border-gray-700/50 hover:border-blue-500/50 transition-colors"
                                                            >
                                                                <div className="flex items-start justify-between gap-2">
                                                                    <div className="flex-1 min-w-0">
                                                                        <a 
                                                                            href={urlData.url} 
                                                                            target="_blank" 
                                                                            rel="noopener noreferrer"
                                                                            className="text-xs text-blue-400 hover:text-blue-300 truncate block"
                                                                            title={urlData.url}
                                                                        >
                                                                            {urlData.url.replace(/^https?:\/\//, '').split('/')[0]}
                                                                        </a>
                                                                        <div className="text-[10px] text-gray-500 mt-0.5">
                                                                            {urlData.url.length > 50 ? urlData.url.substring(0, 50) + '...' : urlData.url}
                                                                        </div>
                                                                    </div>
                                                                    <div className="flex flex-col items-end gap-1">
                                                                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 font-mono">
                                                                            {urlData.count}x
                                                                        </span>
                                                                        <span className="text-[9px] text-gray-600">
                                                                            {urlData.timestamp.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                                                        </span>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                            
                                            {/* Show message if no URLs but it's a browser */}
                                            {(!app.urls || app.urls.length === 0) && 
                                             (app.appName.toLowerCase().includes('chrome') || 
                                              app.appName.toLowerCase().includes('brave') || 
                                              app.appName.toLowerCase().includes('firefox') || 
                                              app.appName.toLowerCase().includes('edge') || 
                                              app.appName.toLowerCase().includes('safari')) && (
                                                <div className="mt-3 pt-3 border-t border-gray-700/50">
                                                    <div className="text-xs text-gray-500 italic text-center py-2">
                                                        No URLs tracked for this browser session
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                        {appUsage.length === 0 && <div className="text-xs text-gray-600 italic">No app usage data.</div>}
                    </div>
                </div>
            </div>
        </div>
    );
};