import React, { useMemo, useState, useEffect, useRef } from 'react';
import { ActivityLog, Project, AppUsage } from '../types';

interface InsightsDashboardProps {
    logs: ActivityLog[];
    projects: Project[];
    onClose: () => void;
}

// Electron API types are defined in types/electron.d.ts

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
    
    // All windows state (all opened windows with their stats)
    const [allWindows, setAllWindows] = useState<Array<{
        app: string;
        title: string;
        url: string | null;
        urlHistory?: Array<{ url: string | null; title: string; timestamp: number }>;
        keystrokes: number;
        mouseClicks: number;
        startTime: number;
        lastSeen: number;
        isActive: boolean;
    }>>([]);
    
    // Total stats across all windows
    const [totalStats, setTotalStats] = useState<{
        totalKeystrokes: number;
        totalClicks: number;
    }>({ totalKeystrokes: 0, totalClicks: 0 });
    
    const sessionStartTimeRef = useRef<number | null>(null);
    const keystrokesRef = useRef(0);
    const clicksRef = useRef(0);
    const currentAppRef = useRef<string>('');
    
    // Listen to real-time activity updates
    useEffect(() => {
        if (!window.electronAPI) return;
        
        const handleActivityUpdate = (data: any) => {
            const now = Date.now();
            
            // If app changed, reset session counters
            if (data.app !== currentAppRef.current) {
                currentAppRef.current = data.app;
                sessionStartTimeRef.current = now;
                // Reset to per-window counts from the new window
                keystrokesRef.current = data.keystrokes || 0;
                clicksRef.current = data.mouseClicks || 0;
            } else {
                // Same app - update with per-window counts
                keystrokesRef.current = data.keystrokes || keystrokesRef.current;
                clicksRef.current = data.mouseClicks || clicksRef.current;
            }
            
            // Update current activity with per-window statistics
            setCurrentActivity({
                app: data.app || 'Unknown',
                title: data.title || 'Unknown',
                url: data.url || undefined,
                keystrokes: data.keystrokes || keystrokesRef.current, // Per-window keystrokes
                clicks: data.mouseClicks || clicksRef.current, // Per-window clicks
                timestamp: now
            });
        };
        
        window.electronAPI.onActivityUpdate(handleActivityUpdate);
        
        // Listen for all windows updates
        const handleAllWindowsUpdate = (data: any) => {
            if (data.allWindows) {
                setAllWindows(data.allWindows);
            }
            if (data.totalKeystrokes !== undefined && data.totalClicks !== undefined) {
                setTotalStats({
                    totalKeystrokes: data.totalKeystrokes,
                    totalClicks: data.totalClicks
                });
            }
        };
        
        if (window.electronAPI.onAllWindowsUpdate) {
            window.electronAPI.onAllWindowsUpdate(handleAllWindowsUpdate);
        }
        
        return () => {
            if (window.electronAPI) {
                window.electronAPI.removeActivityListener();
                if (window.electronAPI.removeAllWindowsListener) {
                    window.electronAPI.removeAllWindowsListener();
                }
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
    
    // Calculate aggregate stats (including real-time data from all windows)
    const stats = useMemo(() => {
        const totalProd = logs.reduce((acc, log) => acc + (log.compositeScore || log.productivityScore || 0), 0);
        
        // Use totalStats from all windows if available, otherwise calculate from logs
        const totalKeys = totalStats.totalKeystrokes > 0 
            ? totalStats.totalKeystrokes 
            : logs.reduce((acc, log) => acc + log.keyboardEvents, 0) + (currentActivity?.keystrokes || 0);
        const totalClicks = totalStats.totalClicks > 0
            ? totalStats.totalClicks
            : logs.reduce((acc, log) => acc + log.mouseEvents, 0) + (currentActivity?.clicks || 0);
        const avgProd = logs.length > 0 ? Math.round(totalProd / logs.length) : 0;
        
        // TyroDesk metrics
        const logsWithComposite = logs.filter(log => log.compositeScore !== undefined);
        const avgCompositeScore = logsWithComposite.length > 0 
            ? Math.round(logsWithComposite.reduce((acc, log) => acc + (log.compositeScore || 0), 0) / logsWithComposite.length)
            : avgProd;
        
        // Category breakdown
        const categoryBreakdown = logs.reduce((acc, log) => {
            const category = log.urlCategory || log.appCategory || 'neutral';
            acc[category] = (acc[category] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);
        
        // Focus metrics
        const focusScores = logs.filter(log => log.focusScore !== undefined).map(log => log.focusScore!);
        const avgFocusScore = focusScores.length > 0 
            ? Math.round(focusScores.reduce((a, b) => a + b, 0) / focusScores.length)
            : 0;
        
        const totalContextSwitches = logs.reduce((acc, log) => acc + (log.contextSwitches || 0), 0);
        
        // Score breakdown averages
        const breakdowns = logs.filter(log => log.scoreBreakdown).map(log => log.scoreBreakdown!);
        const avgBreakdown = breakdowns.length > 0 ? {
            activity: Math.round(breakdowns.reduce((acc, b) => acc + b.activity, 0) / breakdowns.length),
            app: Math.round(breakdowns.reduce((acc, b) => acc + b.app, 0) / breakdowns.length),
            url: Math.round(breakdowns.reduce((acc, b) => acc + b.url, 0) / breakdowns.length),
            focus: Math.round(breakdowns.reduce((acc, b) => acc + b.focus, 0) / breakdowns.length)
        } : null;
        
        return {
            avgProd,
            totalKeys,
            totalClicks,
            avgCompositeScore,
            categoryBreakdown,
            avgFocusScore,
            totalContextSwitches,
            avgBreakdown
        };
    }, [logs, currentActivity, totalStats]);

    // Calculate App Usage with detailed stats (including all windows data)
    const appUsage = useMemo(() => {
        const appStats: Record<string, {
            count: number;
            keystrokes: number;
            clicks: number;
            timeSpent: number; // in seconds (estimated from log count + real-time)
            urls: Array<{ url: string | null; title?: string; timestamp: Date; count: number }>; // Track URLs/titles visited
            isActive: boolean; // Is this the currently active app?
            title: string; // Window title
        }> = {};
        
        // First, add all windows from real-time tracking (this includes ALL opened windows)
        allWindows.forEach(window => {
            const appName = window.app;
            if (!appStats[appName]) {
                appStats[appName] = {
                    count: 0,
                    keystrokes: 0,
                    clicks: 0,
                    timeSpent: 0,
                    urls: [],
                    isActive: window.isActive,
                    title: window.title
                };
            }
            // Use per-window stats from real-time tracking
            appStats[appName].keystrokes = window.keystrokes;
            appStats[appName].clicks = window.mouseClicks;
            appStats[appName].isActive = window.isActive;
            appStats[appName].title = window.title;
            
            // Calculate time spent based on startTime and lastSeen (real-time tracking)
            // This gives accurate time for currently open windows
            const timeSpent = Math.floor((window.lastSeen - window.startTime) / 1000);
            // Real-time tracking takes priority (more accurate for active windows)
            appStats[appName].timeSpent = timeSpent;
            
            // Normalize URL helper function
            const normalizeUrl = (url: string | null): string | null => {
                if (!url) return null;
                try {
                    let normalized = url.trim();
                    if (!normalized.match(/^https?:\/\//i)) {
                        normalized = `https://${normalized}`;
                    }
                    const urlObj = new URL(normalized);
                    let hostname = urlObj.hostname.toLowerCase();
                    if (hostname.startsWith('www.')) {
                        hostname = hostname.substring(4);
                    }
                    const pathname = urlObj.pathname;
                    const search = urlObj.search || '';
                    return `https://${hostname}${pathname}${search}`;
                } catch {
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
            
            // Add URLs/titles from history if available (this includes all visited URLs and titles)
            if (window.urlHistory && window.urlHistory.length > 0) {
                // Use URL history to get all visited URLs and titles
                window.urlHistory.forEach(urlEntry => {
                    // If URL exists, use it (normalized)
                    if (urlEntry.url) {
                        const normalizedUrl = normalizeUrl(urlEntry.url);
                        if (!normalizedUrl) return;
                        
                        // Find existing URL by normalized comparison
                        const existingUrl = appStats[appName].urls.find(u => u.url && normalizeUrl(u.url) === normalizedUrl);
                        if (existingUrl) {
                            existingUrl.count += 1;
                            // Update timestamp to most recent visit
                            if (urlEntry.timestamp > existingUrl.timestamp.getTime()) {
                                existingUrl.timestamp = new Date(urlEntry.timestamp);
                            }
                        } else {
                            appStats[appName].urls.push({
                                url: normalizedUrl, // Store normalized URL
                                title: urlEntry.title, // Also store title for display
                                timestamp: new Date(urlEntry.timestamp),
                                count: 1
                            });
                        }
                    } 
                    // If URL is unknown, use title instead
                    else if (urlEntry.title) {
                        // Find existing entry by title (for unknown URLs)
                        const existingTitle = appStats[appName].urls.find(u => !u.url && u.title === urlEntry.title);
                        if (existingTitle) {
                            existingTitle.count += 1;
                            // Update timestamp to most recent visit
                            if (urlEntry.timestamp > existingTitle.timestamp.getTime()) {
                                existingTitle.timestamp = new Date(urlEntry.timestamp);
                            }
                        } else {
                            appStats[appName].urls.push({
                                url: null, // No URL, use title instead
                                title: urlEntry.title, // Store title
                                timestamp: new Date(urlEntry.timestamp),
                                count: 1
                            });
                        }
                    }
                });
            } else if (window.url) {
                // Fallback to current URL if no history
                const normalizedUrl = normalizeUrl(window.url);
                if (normalizedUrl) {
                    const existingUrl = appStats[appName].urls.find(u => u.url && normalizeUrl(u.url) === normalizedUrl);
                    if (existingUrl) {
                        existingUrl.count += 1;
                        existingUrl.timestamp = new Date(window.lastSeen);
                    } else {
                        appStats[appName].urls.push({
                            url: normalizedUrl, // Store normalized URL
                            title: window.title, // Also store title
                            timestamp: new Date(window.lastSeen),
                            count: 1
                        });
                    }
                }
            } else if (window.title) {
                // If no URL but we have title, add title entry
                const existingTitle = appStats[appName].urls.find(u => !u.url && u.title === window.title);
                if (existingTitle) {
                    existingTitle.count += 1;
                    existingTitle.timestamp = new Date(window.lastSeen);
                } else {
                    appStats[appName].urls.push({
                        url: null, // No URL
                        title: window.title, // Use title
                        timestamp: new Date(window.lastSeen),
                        count: 1
                    });
                }
            }
        });
        
        // Process historical logs to calculate accurate time spent per app
        // Sort logs by timestamp (oldest first) to calculate duration between consecutive logs
        const sortedLogs = [...logs].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
        
        // Detect interval duration (1 min in dev, 10 min in prod)
        let intervalDuration = 600; // Default 10 minutes in seconds
        if (sortedLogs.length > 1) {
            const timeDiff = (sortedLogs[1].timestamp.getTime() - sortedLogs[0].timestamp.getTime()) / 1000;
            // If logs are less than 2 minutes apart, it's dev mode (1-minute intervals)
            if (timeDiff < 120 && timeDiff > 0) {
                intervalDuration = 60; // 1 minute in dev mode
                console.log('🔧 Detected dev mode intervals (1 minute) for time calculation');
            }
        }
        
        sortedLogs.forEach((log, index) => {
            const appName = log.activeWindow;
            if (!appStats[appName]) {
                appStats[appName] = {
                    count: 0,
                    keystrokes: 0,
                    clicks: 0,
                    timeSpent: 0,
                    urls: [],
                    isActive: false,
                    title: appName
                };
            }
            appStats[appName].count += 1;
            
            // Only add to stats if not already set from allWindows (allWindows takes priority for real-time data)
            if (!allWindows.find(w => w.app === appName)) {
                const keystrokes = typeof log.keyboardEvents === 'number' ? log.keyboardEvents : 0;
                const clicks = typeof log.mouseEvents === 'number' ? log.mouseEvents : 0;
                appStats[appName].keystrokes += keystrokes;
                appStats[appName].clicks += clicks;
            }
            
            // Calculate actual time spent from log timestamps
            // Each log represents one interval (10 min in prod, 1 min in dev)
            // Only add time if app is NOT in allWindows (to avoid double counting with real-time tracking)
            if (!allWindows.find(w => w.app === appName)) {
                // Calculate time for this log entry
                let timeForThisLog = intervalDuration;
                
                // If this is the last log, check if we should add partial time
                if (index === sortedLogs.length - 1) {
                    // Check if there's a next log to calculate duration
                    const nextLog = sortedLogs[index + 1];
                    if (nextLog) {
                        // Calculate duration until next log
                        const duration = Math.floor((nextLog.timestamp.getTime() - log.timestamp.getTime()) / 1000);
                        timeForThisLog = Math.min(intervalDuration, duration);
                    } else {
                        // Last log - check if app is still active (add time since log creation)
                        const isCurrentlyActive = allWindows.some(w => w.app === appName && w.isActive);
                        if (isCurrentlyActive) {
                            const timeSinceLog = Math.floor((Date.now() - log.timestamp.getTime()) / 1000);
                            // Cap at interval duration to avoid overcounting
                            timeForThisLog = Math.min(intervalDuration, timeSinceLog);
                        }
                    }
                } else {
                    // Not the last log - calculate duration until next log
                    const nextLog = sortedLogs[index + 1];
                    if (nextLog) {
                        const duration = Math.floor((nextLog.timestamp.getTime() - log.timestamp.getTime()) / 1000);
                        timeForThisLog = Math.min(intervalDuration, duration);
                    }
                }
                
                // Add time spent for this app (only if not in real-time tracking)
                appStats[appName].timeSpent += timeForThisLog;
            }
            
            // Track URLs if available (normalize to prevent duplicates)
            if (log.activeUrl) {
                // Normalize URL helper (same as above)
                const normalizeUrl = (url: string | null): string | null => {
                    if (!url) return null;
                    try {
                        let normalized = url.trim();
                        if (!normalized.match(/^https?:\/\//i)) {
                            normalized = `https://${normalized}`;
                        }
                        const urlObj = new URL(normalized);
                        let hostname = urlObj.hostname.toLowerCase();
                        if (hostname.startsWith('www.')) {
                            hostname = hostname.substring(4);
                        }
                        const pathname = urlObj.pathname;
                        const search = urlObj.search || '';
                        return `https://${hostname}${pathname}${search}`;
                    } catch {
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
                
                const normalizedUrl = normalizeUrl(log.activeUrl);
                if (normalizedUrl) {
                    const existingUrl = appStats[appName].urls.find(u => u.url && normalizeUrl(u.url) === normalizedUrl);
                    if (existingUrl) {
                        existingUrl.count += 1;
                        // Update timestamp to most recent
                        if (log.timestamp > existingUrl.timestamp) {
                            existingUrl.timestamp = log.timestamp;
                        }
                    } else {
                        appStats[appName].urls.push({
                            url: normalizedUrl, // Store normalized URL
                            title: undefined, // Title not available from logs
                            timestamp: log.timestamp,
                            count: 1
                        });
                    }
                } else {
                    // No URL but we might have window title from logs - check if we can use it
                    // Note: logs don't store titles separately, so we skip title tracking from logs
                }
            }
        });
        
        // Sort URLs by count (most visited first)
        Object.values(appStats).forEach(stats => {
            stats.urls.sort((a, b) => b.count - a.count);
        });
        
        const total = Math.max(logs.length, allWindows.length) || 1;
        const appUsageArray = Object.entries(appStats).map(([name, stats]) => ({
            appName: name,
            title: stats.title || name,
            percentage: Math.round((stats.count / total) * 100),
            icon: 'fa-window-maximize',
            color: '#60A5FA',
            keystrokes: stats.keystrokes,
            clicks: stats.clicks,
            timeSpent: stats.timeSpent,
            urls: stats.urls,
            isActive: stats.isActive
        })).sort((a, b) => {
            // Sort active app first, then by time spent (most time)
            if (a.isActive && !b.isActive) return -1;
            if (!a.isActive && b.isActive) return 1;
            return (b.timeSpent || 0) - (a.timeSpent || 0);
        });
        
        return appUsageArray;
    }, [logs, currentActivity, allWindows]);

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

    // Format time in min:sec format (e.g., 5:30 for 5 minutes 30 seconds)
    const formatTime = (seconds: number): string => {
        const totalSeconds = Math.floor(seconds);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const secs = totalSeconds % 60;
        
        if (hours > 0) {
            // For hours: show as "1h 5:30" format
            return `${hours}h ${minutes}:${secs.toString().padStart(2, '0')}`;
        }
        // For minutes: show as "5:30" format
        return `${minutes}:${secs.toString().padStart(2, '0')}`;
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
                
                {/* Summary Section - Total Stats Across All Windows */}
                <div className="bg-gradient-to-br from-blue-900/30 to-purple-900/30 rounded-xl p-4 border border-blue-500/30">
                    <div className="flex items-center gap-2 mb-3">
                        <i className="fas fa-chart-pie text-blue-400"></i>
                        <h3 className="text-sm font-bold text-gray-200">Total Activity Summary</h3>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                        <div className="bg-gray-900/50 p-3 rounded-lg border border-gray-700 text-center">
                            <div className="text-2xl font-bold text-green-400">
                                {stats.avgCompositeScore > 0 ? stats.avgCompositeScore : stats.avgProd}%
                            </div>
                            <div className="text-[10px] uppercase text-gray-400 font-bold mt-1">
                                {stats.avgCompositeScore > 0 ? 'Composite Score' : 'Productivity'}
                            </div>
                            {stats.avgCompositeScore > 0 && (
                                <div className="text-[9px] text-gray-500 mt-0.5">TyroDesk Algorithm</div>
                            )}
                        </div>
                        <div className="bg-gray-900/50 p-3 rounded-lg border border-gray-700 text-center">
                            <div className="text-2xl font-bold text-blue-400">{stats.totalKeys.toLocaleString()}</div>
                            <div className="text-[10px] uppercase text-gray-400 font-bold mt-1">Total Keystrokes</div>
                            <div className="text-[9px] text-gray-500 mt-0.5">Across all windows</div>
                        </div>
                        <div className="bg-gray-900/50 p-3 rounded-lg border border-gray-700 text-center">
                            <div className="text-2xl font-bold text-purple-400">{stats.totalClicks.toLocaleString()}</div>
                            <div className="text-[10px] uppercase text-gray-400 font-bold mt-1">Total Clicks</div>
                            <div className="text-[9px] text-gray-500 mt-0.5">Across all windows</div>
                        </div>
                    </div>
                    {allWindows.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-gray-700/50">
                            <div className="text-xs text-gray-400">
                                <i className="fas fa-window-restore mr-1"></i>
                                Tracking <span className="font-bold text-blue-400">{allWindows.length}</span> {allWindows.length === 1 ? 'window' : 'windows'}
                            </div>
                        </div>
                    )}
                </div>

                {/* TyroDesk Algorithm Metrics Section */}
                {(() => {
                    const hasTyroDeskData = logs.some(log => log.compositeScore !== undefined || log.appCategory || log.focusScore !== undefined);
                    console.log('🔍 DEBUG - TyroDesk section check:', {
                        hasTyroDeskData,
                        logsCount: logs.length,
                        logsWithComposite: logs.filter(l => l.compositeScore !== undefined).length,
                        logsWithAppCategory: logs.filter(l => l.appCategory).length,
                        logsWithFocusScore: logs.filter(l => l.focusScore !== undefined).length,
                        sampleLog: logs[0] ? {
                            hasCompositeScore: !!logs[0].compositeScore,
                            hasAppCategory: !!logs[0].appCategory,
                            hasFocusScore: logs[0].focusScore !== undefined
                        } : null
                    });
                    return hasTyroDeskData;
                })() && (
                    <div className="bg-gradient-to-br from-purple-900/30 to-pink-900/30 rounded-xl p-4 border border-purple-500/30">
                        <div className="flex items-center gap-2 mb-4">
                            <i className="fas fa-brain text-purple-400"></i>
                            <h3 className="text-sm font-bold text-gray-200">TyroDesk Productivity Analysis</h3>
                        </div>
                        
                        {/* Composite Score with Breakdown */}
                        {stats.avgCompositeScore > 0 && stats.avgBreakdown && (
                            <div className="mb-4">
                                <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs font-bold text-gray-400 uppercase">Composite Score Breakdown</span>
                                        <span 
                                            className="text-[8px] text-gray-500 cursor-help" 
                                            title="Weighted combination: Activity (25%) + App (25%) + URL (20%) + Focus (30%)"
                                        >
                                            <i className="fas fa-info-circle"></i>
                                        </span>
                                    </div>
                                    <span className="text-lg font-bold" style={{ color: logs.find(l => l.compositeScore)?.scoreClassification?.color || '#eab308' }}>
                                        {stats.avgCompositeScore}%
                                    </span>
                                </div>
                                <div className="grid grid-cols-4 gap-2">
                                    <div 
                                        className="bg-gray-900/50 p-2 rounded border border-gray-700 text-center hover:border-blue-500 transition-colors cursor-help" 
                                        title="Activity Score (25% weight): Based on keystrokes + mouse clicks. Higher = more active computer use."
                                    >
                                        <div className="text-sm font-bold text-blue-400">{stats.avgBreakdown.activity}</div>
                                        <div className="text-[9px] text-gray-500 mt-0.5">Activity</div>
                                        <div className="text-[8px] text-gray-600 mt-0.5">25% weight</div>
                                    </div>
                                    <div 
                                        className="bg-gray-900/50 p-2 rounded border border-gray-700 text-center hover:border-green-500 transition-colors cursor-help"
                                        title="App Score (25% weight): Productivity of apps used. VS Code=100%, Chrome=50%, Spotify=0%"
                                    >
                                        <div className="text-sm font-bold text-green-400">{stats.avgBreakdown.app}</div>
                                        <div className="text-[9px] text-gray-500 mt-0.5">App</div>
                                        <div className="text-[8px] text-gray-600 mt-0.5">25% weight</div>
                                    </div>
                                    <div 
                                        className="bg-gray-900/50 p-2 rounded border border-gray-700 text-center hover:border-yellow-500 transition-colors cursor-help"
                                        title="URL Score (20% weight): Productivity of websites visited. GitHub=100%, Google=50%, Facebook=0%"
                                    >
                                        <div className="text-sm font-bold text-yellow-400">{stats.avgBreakdown.url}</div>
                                        <div className="text-[9px] text-gray-500 mt-0.5">URL</div>
                                        <div className="text-[8px] text-gray-600 mt-0.5">20% weight</div>
                                    </div>
                                    <div 
                                        className="bg-gray-900/50 p-2 rounded border border-gray-700 text-center hover:border-purple-500 transition-colors cursor-help"
                                        title="Focus Score (30% weight): How focused you were. Fewer app switches = higher score. 100% = excellent focus!"
                                    >
                                        <div className="text-sm font-bold text-purple-400">{stats.avgBreakdown.focus}</div>
                                        <div className="text-[9px] text-gray-500 mt-0.5">Focus</div>
                                        <div className="text-[8px] text-gray-600 mt-0.5">30% weight</div>
                                    </div>
                                </div>
                            </div>
                        )}
                        
                        {/* Category Breakdown */}
                        {Object.keys(stats.categoryBreakdown).length > 0 && (
                            <div className="mb-4">
                                <div className="flex items-center gap-2 mb-2">
                                    <div className="text-xs font-bold text-gray-400 uppercase">App/URL Category Distribution</div>
                                    <span 
                                        className="text-[8px] text-gray-500 cursor-help" 
                                        title="Shows how your time was split: Productive (VS Code, Office), Neutral (Browsers, Communication), Unproductive (Entertainment)"
                                    >
                                        <i className="fas fa-info-circle"></i>
                                    </span>
                                </div>
                                <div className="flex gap-2">
                                    {stats.categoryBreakdown.productive && (
                                        <div 
                                            className="flex-1 bg-green-900/30 p-2 rounded border border-green-500/30 text-center hover:border-green-400 transition-colors cursor-help"
                                            title="Productive: VS Code, Office apps, Design tools, GitHub, Stack Overflow"
                                        >
                                            <div className="text-sm font-bold text-green-400">{stats.categoryBreakdown.productive}</div>
                                            <div className="text-[9px] text-gray-400 mt-0.5">Productive</div>
                                        </div>
                                    )}
                                    {stats.categoryBreakdown.neutral && (
                                        <div 
                                            className="flex-1 bg-yellow-900/30 p-2 rounded border border-yellow-500/30 text-center hover:border-yellow-400 transition-colors cursor-help"
                                            title="Neutral: Browsers, Communication apps (Slack, Teams), Search engines"
                                        >
                                            <div className="text-sm font-bold text-yellow-400">{stats.categoryBreakdown.neutral}</div>
                                            <div className="text-[9px] text-gray-400 mt-0.5">Neutral</div>
                                        </div>
                                    )}
                                    {stats.categoryBreakdown.unproductive && (
                                        <div 
                                            className="flex-1 bg-red-900/30 p-2 rounded border border-red-500/30 text-center hover:border-red-400 transition-colors cursor-help"
                                            title="Unproductive: Entertainment (Spotify, Netflix), Social media (Facebook, Twitter)"
                                        >
                                            <div className="text-sm font-bold text-red-400">{stats.categoryBreakdown.unproductive}</div>
                                            <div className="text-[9px] text-gray-400 mt-0.5">Unproductive</div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                        
                        {/* Focus Metrics */}
                        {stats.avgFocusScore > 0 && (
                            <div className="grid grid-cols-2 gap-3">
                                <div 
                                    className="bg-gray-900/50 p-3 rounded border border-gray-700 text-center hover:border-purple-500 transition-colors cursor-help"
                                    title="Focus Score: Measures how focused you were. 100% = excellent focus (minimal app switching). Higher = better productivity."
                                >
                                    <div className="text-xl font-bold text-purple-400">{stats.avgFocusScore}%</div>
                                    <div className="text-[10px] uppercase text-gray-400 font-bold mt-1">Avg Focus Score</div>
                                    <div className="text-[8px] text-gray-600 mt-1">
                                        {stats.avgFocusScore >= 80 ? '⭐ Excellent!' : 
                                         stats.avgFocusScore >= 60 ? '✅ Good' : 
                                         stats.avgFocusScore >= 40 ? '⚠️ Moderate' : '❌ Low'}
                                    </div>
                                </div>
                                <div 
                                    className="bg-gray-900/50 p-3 rounded border border-gray-700 text-center hover:border-orange-500 transition-colors cursor-help"
                                    title="Context Switches: Number of times you switched between different apps. Lower = better. Each switch costs ~23 min to regain focus."
                                >
                                    <div className="text-xl font-bold text-orange-400">{stats.totalContextSwitches}</div>
                                    <div className="text-[10px] uppercase text-gray-400 font-bold mt-1">Context Switches</div>
                                    <div className="text-[8px] text-gray-600 mt-1">
                                        {stats.totalContextSwitches === 0 ? '⭐ Perfect!' : 
                                         stats.totalContextSwitches <= 3 ? '✅ Good' : 
                                         stats.totalContextSwitches <= 6 ? '⚠️ Moderate' : '❌ High'}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}

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
                                                height: `${(log.compositeScore || log.productivityScore || 0)}%`, 
                                                backgroundColor: log.scoreClassification?.color || project?.color || '#555' 
                                            }}
                                        ></div>
                                        {/* Tooltip */}
                                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block w-48 bg-black text-xs p-2 rounded border border-gray-700 z-50 pointer-events-none">
                                            <div className="font-bold mb-1">{log.timestamp.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div>
                                            <div>App: {log.activeWindow}</div>
                                            {log.compositeScore !== undefined ? (
                                                <>
                                                    <div className="font-semibold mt-1" style={{ color: log.scoreClassification?.color }}>
                                                        Score: {log.compositeScore}% ({log.scoreClassification?.label})
                                                    </div>
                                                    {log.appCategory && (
                                                        <div className="text-[10px] mt-0.5">
                                                            Category: <span className={`font-semibold ${
                                                                log.appCategory === 'productive' ? 'text-green-400' :
                                                                log.appCategory === 'unproductive' ? 'text-red-400' :
                                                                'text-yellow-400'
                                                            }`}>{log.appCategory}</span>
                                                        </div>
                                                    )}
                                                    {log.focusScore !== undefined && (
                                                        <div className="text-[10px] mt-0.5">Focus: {log.focusScore}%</div>
                                                    )}
                                                </>
                                            ) : (
                                                <div>Prod: {log.productivityScore}%</div>
                                            )}
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
                            {(() => {
                                // Count all individual images (screenshots + webcam photos)
                                let count = 0;
                                logs.forEach(log => {
                                    if (log.screenshotUrls && log.screenshotUrls.length > 0) {
                                        count += log.screenshotUrls.length;
                                    } else if (log.screenshotUrl) {
                                        count += 1;
                                    }
                                    if (log.webcamUrl) {
                                        count += 1;
                                    }
                                });
                                return count;
                            })()} images
                        </span>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        {(() => {
                            // Flatten logs to create individual evidence items for each screenshot and webcam photo
                            const evidenceItems: Array<{
                                id: string;
                                imageUrl: string;
                                type: 'screenshot' | 'webcam';
                                log: ActivityLog;
                                index?: number;
                            }> = [];
                            
                            logs.forEach(log => {
                                // Add all screenshots as separate items
                                if (log.screenshotUrls && log.screenshotUrls.length > 0) {
                                    log.screenshotUrls.forEach((url, idx) => {
                                        evidenceItems.push({
                                            id: `${log.id}-screenshot-${idx}`,
                                            imageUrl: url,
                                            type: 'screenshot',
                                            log: log,
                                            index: idx
                                        });
                                    });
                                } else if (log.screenshotUrl) {
                                    evidenceItems.push({
                                        id: `${log.id}-screenshot-0`,
                                        imageUrl: log.screenshotUrl,
                                        type: 'screenshot',
                                        log: log,
                                        index: 0
                                    });
                                }
                                
                                // Add webcam photo as separate item
                                if (log.webcamUrl) {
                                    evidenceItems.push({
                                        id: `${log.id}-webcam`,
                                        imageUrl: log.webcamUrl,
                                        type: 'webcam',
                                        log: log
                                    });
                                }
                            });
                            
                            // Sort by timestamp (newest first) and take latest 20
                            evidenceItems.sort((a, b) => 
                                b.log.timestamp.getTime() - a.log.timestamp.getTime()
                            );
                            
                            return evidenceItems.length > 0 ? (
                                <>
                                    {evidenceItems.slice(0, 20).map((item) => (
                                        <div key={item.id} className="bg-gray-800 rounded-lg overflow-hidden border border-gray-700 group relative hover:border-blue-500 transition-colors">
                                            <div className="aspect-video relative bg-black">
                                                <img 
                                                    src={item.imageUrl} 
                                                    alt={item.type === 'screenshot' ? `Screen Capture ${(item.index || 0) + 1}` : 'Camera Photo'} 
                                                    className="w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-opacity" 
                                                    onError={(e) => {
                                                        console.error(`Failed to load ${item.type}:`, item.id);
                                                        (e.target as HTMLImageElement).style.display = 'none';
                                                    }}
                                                />
                                                {/* Type badge */}
                                                <div className={`absolute top-1 left-1 px-1.5 py-0.5 rounded text-[8px] font-bold ${
                                                    item.type === 'screenshot' 
                                                        ? 'bg-blue-500/80 text-white' 
                                                        : 'bg-green-500/80 text-white'
                                                }`}>
                                                    {item.type === 'screenshot' ? '📷 Screenshot' : '📸 Camera'}
                                                </div>
                                                {/* Hover overlay with details */}
                                                <div className="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-xs p-2">
                                                    <div className="text-white font-bold mb-1">
                                                        {item.log.timestamp.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                                    </div>
                                                    <div className="text-gray-300 text-[10px] text-center">
                                                        {item.log.activeWindow}
                                                    </div>
                                                    {item.log.activeUrl && (
                                                        <div className="text-blue-400 text-[9px] mt-1 text-center max-w-full truncate" title={item.log.activeUrl}>
                                                            {item.log.activeUrl}
                                                        </div>
                                                    )}
                                                    <div className="text-gray-400 text-[10px] mt-1">
                                                        Prod: {item.log.productivityScore}%
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="p-2 flex flex-col gap-1 bg-gray-850">
                                                <div className="flex justify-between items-center">
                                                    <span className="text-[10px] text-gray-400">
                                                        {item.log.timestamp.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                                    </span>
                                                    <div className="flex items-center gap-1">
                                                        {item.type === 'screenshot' && (
                                                            <span className="text-[8px] px-1 py-0.5 rounded bg-blue-500/20 text-blue-400" title="Screenshot">
                                                                📷
                                                            </span>
                                                        )}
                                                        {item.type === 'webcam' && (
                                                            <span className="text-[8px] px-1 py-0.5 rounded bg-green-500/20 text-green-400" title="Camera Photo">
                                                                📸
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="flex items-center justify-between">
                                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-700 text-gray-300 truncate max-w-[120px]" title={item.log.activeWindow}>
                                                        {item.log.activeWindow}
                                                    </span>
                                                    {item.log.activeUrl && (
                                                        <span className="text-[9px] text-blue-400 truncate max-w-[150px]" title={item.log.activeUrl}>
                                                            🔗 {item.log.activeUrl.replace(/^https?:\/\//, '').split('/')[0]}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                    {evidenceItems.length > 20 && (
                                        <div className="col-span-2 text-center mt-3 text-xs text-gray-500">
                                            Showing latest 20 of {evidenceItems.length} images
                                        </div>
                                    )}
                                </>
                            ) : (
                                <div className="col-span-2 text-center py-8 text-gray-600 bg-gray-900/50 rounded-lg border border-gray-800 border-dashed">
                                    <i className="fas fa-camera text-2xl mb-2 block opacity-50"></i>
                                    <p className="text-xs mb-1">No screenshots or photos captured yet</p>
                                    <p className="text-[10px] text-gray-500">Start the timer to begin capturing</p>
                                </div>
                            );
                        })()}
                    </div>
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
                                                <i className={`fas ${app.appName.includes('Code') || app.appName.includes('Cursor') ? 'fa-code' : app.appName.includes('Chrome') ? 'fa-globe' : app.appName.includes('Brave') ? 'fa-shield-alt' : app.appName.includes('WhatsApp') ? 'fa-whatsapp' : 'fa-desktop'}`}></i>
                                            </div>
                                            <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-medium text-gray-300 truncate">{app.appName}</span>
                                                    {app.isActive && (
                                                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 animate-pulse flex-shrink-0">
                                                            Active
                                                        </span>
                                                    )}
                                                </div>
                                                {app.title && app.title !== app.appName && (
                                                    <span className="text-[10px] text-gray-500 truncate" title={app.title}>
                                                        {app.title}
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
                                            
                                            {/* URL/Title Details - Show for browsers */}
                                            {app.urls && app.urls.length > 0 && (
                                                <div className="mt-3 pt-3 border-t border-gray-700/50">
                                                    <div className="text-xs font-bold text-gray-400 uppercase mb-2 flex items-center gap-2">
                                                        <i className="fas fa-link text-blue-400"></i>
                                                        {app.urls.some(u => u.url) ? 'URLs' : 'Pages'} Visited ({app.urls.length})
                                                    </div>
                                                    <div className="space-y-1.5 max-h-48 overflow-y-auto custom-scrollbar">
                                                        {app.urls.map((urlData, urlIdx) => (
                                                            <div 
                                                                key={urlIdx} 
                                                                className="bg-gray-800/50 rounded p-2 border border-gray-700/50 hover:border-blue-500/50 transition-colors"
                                                            >
                                                                <div className="flex items-start justify-between gap-2">
                                                                    <div className="flex-1 min-w-0">
                                                                        {urlData.url ? (
                                                                            // Show URL if available
                                                                            <>
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
                                                                            </>
                                                                        ) : (
                                                                            // Show title if URL is unknown
                                                                            <>
                                                                                <div className="text-xs text-gray-300 font-medium truncate block" title={urlData.title || 'Unknown Page'}>
                                                                                    {urlData.title || 'Unknown Page'}
                                                                                </div>
                                                                                <div className="text-[10px] text-gray-500 mt-0.5 italic">
                                                                                    (URL unknown)
                                                                                </div>
                                                                            </>
                                                                        )}
                                                                    </div>
                                                                    <div className="flex flex-col items-end gap-1">
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
                                            
                                            {/* Show message if no URLs/titles but it's a browser */}
                                            {(!app.urls || app.urls.length === 0) && 
                                             (app.appName.toLowerCase().includes('chrome') || 
                                              app.appName.toLowerCase().includes('brave') || 
                                              app.appName.toLowerCase().includes('firefox') || 
                                              app.appName.toLowerCase().includes('edge') || 
                                              app.appName.toLowerCase().includes('safari')) && (
                                                <div className="mt-3 pt-3 border-t border-gray-700/50">
                                                    <div className="text-xs text-gray-500 italic text-center py-2">
                                                        No URLs or pages tracked for this browser session
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