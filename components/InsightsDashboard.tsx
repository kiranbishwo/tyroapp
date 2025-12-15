import React, { useMemo, useState, useEffect, useRef } from 'react';
import { ActivityLog, Project, AppUsage, Task } from '../types';

interface InsightsDashboardProps {
    logs: ActivityLog[];
    projects: Project[];
    onClose: () => void;
    filterTaskId?: string; // Optional: filter logs by taskId
    filterProjectId?: string; // Optional: filter logs by projectId (for task filtering)
    filterTimeEntries?: Array<{ startTime: Date; endTime?: Date }>; // Optional: filter logs by time range
    tasks?: Task[]; // Optional: tasks list to get task name
}

// Electron API types are defined in types/electron.d.ts

export const InsightsDashboard: React.FC<InsightsDashboardProps> = ({ logs, projects, onClose, filterTaskId, filterProjectId, filterTimeEntries, tasks }) => {
    // State for JSON tracking data
    const [jsonTrackingData, setJsonTrackingData] = useState<any | null>(null);
    const [isLoadingJsonData, setIsLoadingJsonData] = useState(false);
    const [isTaskActive, setIsTaskActive] = useState(false);
    const [isCombinedView, setIsCombinedView] = useState(false);
    
    // Fetch JSON tracking data - either single task or combined from all tasks
    useEffect(() => {
        if (!window.electronAPI) {
            setJsonTrackingData(null);
            setIsTaskActive(false);
            setIsCombinedView(false);
            return;
        }

        // If task filter is provided, fetch single task data
        if (filterTaskId && filterProjectId) {
            setIsCombinedView(false);
            setIsLoadingJsonData(true);
            const fetchJsonData = async () => {
                try {
                    // Load only today's data for the task
                    const data = await window.electronAPI!.loadTaskTrackingData(filterProjectId, filterTaskId, 'today');
                    if (data) {
                        setJsonTrackingData(data);
                        console.log('✅ Loaded today\'s JSON tracking data for task:', {
                            taskId: filterTaskId,
                            projectId: filterProjectId,
                            summary: data.trackingData?.summary,
                            keystrokes: data.trackingData?.summary?.totalKeystrokes || 0,
                            clicks: data.trackingData?.summary?.totalMouseClicks || 0,
                            logsCount: data.trackingData?.activityLogs?.length || 0,
                            windowsCount: data.trackingData?.activeWindows?.length || 0
                        });
                    } else {
                        console.log('⚠️ No JSON data found for task');
                        setJsonTrackingData(null);
                    }
                } catch (error) {
                    console.error('❌ Error loading JSON tracking data:', error);
                    setJsonTrackingData(null);
                } finally {
                    setIsLoadingJsonData(false);
                }
            };
            fetchJsonData();
            
            // Check if task is currently active
            const checkActiveTask = async () => {
                try {
                    const currentTracking = await window.electronAPI!.getCurrentTaskTracking();
                    if (currentTracking && currentTracking.taskId === filterTaskId && currentTracking.projectId === filterProjectId) {
                        setIsTaskActive(true);
                    } else {
                        setIsTaskActive(false);
                    }
                } catch (error) {
                    console.error('Error checking active task:', error);
                }
            };
            checkActiveTask();
        } else {
            // No task filter - fetch combined data from all tasks
            setIsCombinedView(true);
            setIsLoadingJsonData(true);
            const fetchCombinedData = async () => {
                try {
                    // Fetch only today's data
                    const combinedData = await window.electronAPI!.getCombinedInsights('today');
                    if (combinedData && combinedData.success) {
                        // Transform combined data to match the format expected by the component
                        const transformedData = {
                            metadata: {
                                taskId: 'all',
                                projectId: 'all',
                                taskName: 'All Tasks',
                                projectName: 'Combined',
                                createdAt: combinedData.tasks.length > 0 ? combinedData.tasks[0].createdAt : new Date().toISOString(),
                                lastUpdated: combinedData.lastUpdated || new Date().toISOString()
                            },
                            trackingData: {
                                summary: combinedData.combinedData.summary,
                                activityLogs: combinedData.combinedData.activityLogs || [],
                                screenshots: combinedData.combinedData.screenshots || [],
                                webcamPhotos: combinedData.combinedData.webcamPhotos || [],
                                activeWindows: combinedData.combinedData.activeWindows || [], // Combined from all tasks
                                urlHistory: combinedData.combinedData.urlHistory || [] // Combined from all tasks
                            }
                        };
                        setJsonTrackingData(transformedData);
                        console.log('✅ Loaded combined tracking data from all tasks');
                    } else {
                        setJsonTrackingData(null);
                    }
                } catch (error) {
                    console.error('❌ Error loading combined tracking data:', error);
                    setJsonTrackingData(null);
                } finally {
                    setIsLoadingJsonData(false);
                }
            };
            fetchCombinedData();
            setIsTaskActive(false);
        }
    }, [filterTaskId, filterProjectId]);
    
    // Live updates - refresh JSON data periodically
    useEffect(() => {
        if (!window.electronAPI) return;
        
        // Subscribe to combined insights updates for real-time updates (today's data only)
        if (isCombinedView) {
            window.electronAPI.subscribeCombinedInsights('today');
            
            const handleCombinedUpdate = (updatedData: any) => {
                if (updatedData && updatedData.success) {
                    const transformedData = {
                        metadata: {
                            taskId: 'all',
                            projectId: 'all',
                            taskName: 'All Tasks',
                            projectName: 'Combined',
                            createdAt: updatedData.tasks.length > 0 ? updatedData.tasks[0].createdAt : new Date().toISOString(),
                            lastUpdated: updatedData.lastUpdated || new Date().toISOString()
                        },
                        trackingData: {
                            summary: updatedData.combinedData.summary,
                            activityLogs: updatedData.combinedData.activityLogs || [],
                            screenshots: updatedData.combinedData.screenshots || [],
                            webcamPhotos: updatedData.combinedData.webcamPhotos || [],
                            activeWindows: updatedData.combinedData.activeWindows || [], // Combined from all tasks
                            urlHistory: updatedData.combinedData.urlHistory || [] // Combined from all tasks
                        }
                    };
                    setJsonTrackingData(transformedData);
                }
            };
            
            window.electronAPI.onCombinedInsightsUpdate(handleCombinedUpdate);
            
            return () => {
                window.electronAPI?.unsubscribeCombinedInsights();
                window.electronAPI?.removeCombinedInsightsListener();
            };
        } else if (isTaskActive && filterTaskId && filterProjectId) {
            // Refresh single task data every 3 seconds when active (today's data only)
            const refreshInterval = setInterval(async () => {
                try {
                    const data = await window.electronAPI!.loadTaskTrackingData(filterProjectId, filterTaskId, 'today');
                    if (data) {
                        setJsonTrackingData(data);
                    }
                } catch (error) {
                    console.error('Error refreshing JSON data:', error);
                }
            }, 3000);
            
            return () => clearInterval(refreshInterval);
        }
    }, [isTaskActive, filterTaskId, filterProjectId, isCombinedView]);
    
    // Filter logs by task if provided - STRICT filtering by taskId and time ranges
    // Also filter by today's date to ensure only today's data is shown
    const filteredLogs = useMemo(() => {
        // Calculate today's date range
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayStart = today.getTime();
        const todayEnd = todayStart + (24 * 60 * 60 * 1000) - 1;
        
        // First filter by date (today only)
        const todayLogs = logs.filter(log => {
            if (!log || !log.timestamp) return false;
            const logTime = log.timestamp.getTime();
            return logTime >= todayStart && logTime <= todayEnd;
        });
        
        if (filterTaskId && filterProjectId && filterTimeEntries && filterTimeEntries.length > 0) {
            // Create a sorted list of time ranges for efficient checking
            const timeRanges = filterTimeEntries
                .map(entry => ({
                    start: entry.startTime.getTime(),
                    end: entry.endTime ? entry.endTime.getTime() : Date.now()
                }))
                .sort((a, b) => a.start - b.start);
            
            const filtered = todayLogs.filter(log => {
                // PRIMARY CHECK: If log has taskId, it MUST match (strict)
                if (log.taskId) {
                    // Log has taskId - only include if it matches
                    if (log.taskId !== filterTaskId) {
                        return false; // Log belongs to a different task
                    }
                    // If taskId matches, include it (don't need time range check for logs with taskId)
                    return true;
                }
                
                // FALLBACK: If log doesn't have taskId, use projectId + time range
                // This handles old logs created before taskId was added
                if (log.projectId !== filterProjectId) {
                    return false;
                }
                
                // SECONDARY CHECK: Log timestamp must fall within one of the task's time entry ranges
                const logTime = log.timestamp.getTime();
                
                // Use a buffer to account for interval timing precision
                const buffer = 60000; // 1 minute buffer for interval timing
                
                const isInTimeRange = timeRanges.some(range => {
                    const rangeStart = range.start - buffer;
                    const rangeEnd = range.end + buffer;
                    return logTime >= rangeStart && logTime <= rangeEnd;
                });
                
                // Only include if in time range
                return isInTimeRange;
            });
            
            // Debug logging
            if (filterTaskId) {
                const logsWithTaskId = filtered.filter(l => l.taskId === filterTaskId).length;
                const logsWithoutTaskId = filtered.filter(l => !l.taskId).length;
                const totalKeystrokes = filtered.reduce((sum, l) => sum + (l.keyboardEvents || 0), 0);
                const totalMouseClicks = filtered.reduce((sum, l) => sum + (l.mouseEvents || 0), 0);
                const totalScreenshots = filtered.reduce((sum, l) => {
                    if (l.screenshotUrls && l.screenshotUrls.length > 0) return sum + l.screenshotUrls.length;
                    if (l.screenshotUrl) return sum + 1;
                    return sum;
                }, 0);
                const totalWebcam = filtered.filter(l => l.webcamUrl).length;
                
                // Removed excessive debug logging to prevent performance issues
                // Uncomment below for debugging if needed:
                // console.log('Task Report Filtering:', { taskId: filterTaskId, filteredLogs: filtered.length });
            }
            
            return filtered;
        } else if (filterTaskId && filterProjectId) {
            // If filtering by taskId only (no time entries), filter by taskId or projectId
            // This is a fallback - prefer taskId but allow projectId if taskId not set
            return todayLogs.filter(log => {
                if (log && log.taskId) {
                    return log.taskId === filterTaskId;
                }
                // Fallback: if no taskId, match by projectId
                return log && log.projectId === filterProjectId;
            });
        }
        // No task filter - return today's logs only
        return todayLogs;
    }, [logs, filterTaskId, filterProjectId, filterTimeEntries]);
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
            
            // Use per-task stats if available (cumulative across all windows), otherwise use per-window stats
            const taskKeystrokes = data.taskKeystrokes !== undefined ? data.taskKeystrokes : (data.keystrokes || 0);
            const taskClicks = data.taskClicks !== undefined ? data.taskClicks : (data.mouseClicks || 0);
            
            // If app changed, reset session counters
            if (data.app !== currentAppRef.current) {
                currentAppRef.current = data.app;
                sessionStartTimeRef.current = now;
                // Reset to per-task counts (preferred) or per-window counts (fallback)
                keystrokesRef.current = taskKeystrokes;
                clicksRef.current = taskClicks;
            } else {
                // Same app - update with per-task counts (preferred) or per-window counts (fallback)
                keystrokesRef.current = taskKeystrokes;
                clicksRef.current = taskClicks;
            }
            
            // Update current activity with per-task statistics (preferred) or per-window statistics (fallback)
            setCurrentActivity({
                app: data.app || 'Unknown',
                title: data.title || 'Unknown',
                url: data.url || undefined,
                keystrokes: taskKeystrokes, // Per-task keystrokes (cumulative) or per-window keystrokes (fallback)
                clicks: taskClicks, // Per-task clicks (cumulative) or per-window clicks (fallback)
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
    
    // Force re-render every second to update time spent (only if activity is active)
    useEffect(() => {
        if (!currentActivity) return;
        
        const interval = setInterval(() => {
            // Only update timestamp, don't recreate the whole object to prevent unnecessary re-renders
            setCurrentActivity(prev => {
                if (!prev) return null;
                // Only update if timestamp changed significantly (every second)
                const now = Date.now();
                if (now - prev.timestamp >= 1000) {
                    return { ...prev, timestamp: now };
                }
                return prev; // Return same object if less than 1 second passed
            });
        }, 1000);
        
        return () => clearInterval(interval);
    }, [currentActivity?.app]); // Only depend on app name, not the whole object
    
    // Calculate aggregate stats (including real-time data from all windows)
    const stats = useMemo(() => {
        const totalProd = filteredLogs.reduce((acc, log) => acc + (log.compositeScore || log.productivityScore || 0), 0);
        
        // Use JSON data if available (preferred), otherwise use totalStats from all windows, otherwise calculate from logs
        const totalKeys = jsonTrackingData?.trackingData?.summary?.totalKeystrokes !== undefined
            ? jsonTrackingData.trackingData.summary.totalKeystrokes
            : (totalStats.totalKeystrokes > 0 
                ? totalStats.totalKeystrokes 
                : filteredLogs.reduce((acc, log) => acc + log.keyboardEvents, 0) + (currentActivity?.keystrokes || 0));
        const totalClicks = jsonTrackingData?.trackingData?.summary?.totalMouseClicks !== undefined
            ? jsonTrackingData.trackingData.summary.totalMouseClicks
            : (totalStats.totalClicks > 0
                ? totalStats.totalClicks
                : filteredLogs.reduce((acc, log) => acc + log.mouseEvents, 0) + (currentActivity?.clicks || 0));
        const avgProd = filteredLogs.length > 0 ? Math.round(totalProd / filteredLogs.length) : 0;
        
        // TyroDesk metrics
        const logsWithComposite = filteredLogs.filter(log => log.compositeScore !== undefined);
        const avgCompositeScore = logsWithComposite.length > 0 
            ? Math.round(logsWithComposite.reduce((acc, log) => acc + (log.compositeScore || 0), 0) / logsWithComposite.length)
            : avgProd;
        
        // Category breakdown
        const categoryBreakdown = filteredLogs.reduce((acc, log) => {
            const category = log.urlCategory || log.appCategory || 'neutral';
            acc[category] = (acc[category] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);
        
        // Focus metrics
        const focusScores = filteredLogs.filter(log => log.focusScore !== undefined).map(log => log.focusScore!);
        const avgFocusScore = focusScores.length > 0 
            ? Math.round(focusScores.reduce((a, b) => a + b, 0) / focusScores.length)
            : 0;
        
        const totalContextSwitches = filteredLogs.reduce((acc, log) => acc + (log.contextSwitches || 0), 0);
        
        // Score breakdown averages
        const breakdowns = filteredLogs.filter(log => log.scoreBreakdown).map(log => log.scoreBreakdown!);
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
    }, [
        filteredLogs.length, // Use length instead of full array
        currentActivity?.keystrokes, 
        currentActivity?.clicks, 
        totalStats.totalKeystrokes, 
        totalStats.totalClicks, 
        jsonTrackingData?.trackingData?.summary?.totalKeystrokes, 
        jsonTrackingData?.trackingData?.summary?.totalMouseClicks
    ]);

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
        
        // Filter allWindows by task if filtering is active
        // Only include windows that were active during the task's time entries
        const filteredWindows = filterTaskId && filterTimeEntries && filterTimeEntries.length > 0
            ? allWindows.filter(window => {
                // Check if window was active during any of the task's time entries
                const windowTime = window.startTime;
                return filterTimeEntries.some(entry => {
                    const entryStart = entry.startTime.getTime();
                    const entryEnd = entry.endTime ? entry.endTime.getTime() : Date.now();
                    return windowTime >= entryStart && windowTime <= entryEnd;
                });
            })
            : filterTaskId
            ? [] // If filtering by task but no time entries, don't use allWindows (use only logs)
            : allWindows; // No filtering, use all windows
        
        // First, add filtered windows from real-time tracking
        // Skip Electron app itself
        filteredWindows.forEach(window => {
            const appName = window.app;
            
            // Skip Electron app itself - we don't want to track the tracking app
            if (appName.toLowerCase().includes('electron') || appName.toLowerCase().includes('tyro')) {
                return; // Skip this window
            }
            
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
            // These will be merged with log data below
            appStats[appName].keystrokes = Math.max(appStats[appName].keystrokes || 0, window.keystrokes || 0);
            appStats[appName].clicks = Math.max(appStats[appName].clicks || 0, window.mouseClicks || 0);
            appStats[appName].isActive = window.isActive;
            appStats[appName].title = window.title || appStats[appName].title || appName;
            
            // Calculate time spent based on startTime and lastSeen (real-time tracking)
            // This gives accurate time for currently open windows
            const timeSpent = Math.floor((window.lastSeen - window.startTime) / 1000);
            // Use the maximum of real-time time or log time (whichever is higher)
            appStats[appName].timeSpent = Math.max(appStats[appName].timeSpent || 0, timeSpent);
            
            // Normalize URL helper function (local to this scope)
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
        // IMPORTANT: Use filteredLogs, not logs, to only count time for the current task
        // Sort logs by timestamp (oldest first) to calculate duration between consecutive logs
        const sortedLogs = [...filteredLogs].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
        
        // Detect interval duration (1 min in dev, 10 min in prod)
        let intervalDuration = 600; // Default 10 minutes in seconds
        if (sortedLogs.length > 1) {
            const timeDiff = (sortedLogs[1].timestamp.getTime() - sortedLogs[0].timestamp.getTime()) / 1000;
            // If logs are less than 2 minutes apart, it's dev mode (1-minute intervals)
            if (timeDiff < 120 && timeDiff > 0) {
                intervalDuration = 60; // 1 minute in dev mode
                // Removed console.log to prevent excessive logging
            }
        }
        
        sortedLogs.forEach((log, index) => {
            const appName = log.activeWindow;
            
            // Skip Electron app itself - we don't want to track the tracking app
            if (appName.toLowerCase().includes('electron') || appName.toLowerCase().includes('tyro')) {
                return; // Skip this log entry
            }
            
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
            
            // ALWAYS add keystrokes and clicks from logs (they're task-specific)
            // If app is also in filteredWindows, we'll merge the data
            const keystrokes = typeof log.keyboardEvents === 'number' ? log.keyboardEvents : 0;
            const clicks = typeof log.mouseEvents === 'number' ? log.mouseEvents : 0;
            
            // If app is in filteredWindows, use the higher value (real-time might be more accurate)
            // Otherwise, add from logs
            const existingWindow = filteredWindows.find(w => w.app === appName);
            if (existingWindow) {
                // App is in real-time tracking - use real-time data (already set above)
                // But also add log data if it's higher (in case real-time missed some)
                appStats[appName].keystrokes = Math.max(appStats[appName].keystrokes, keystrokes);
                appStats[appName].clicks = Math.max(appStats[appName].clicks, clicks);
            } else {
                // App not in real-time tracking - add from logs
                appStats[appName].keystrokes += keystrokes;
                appStats[appName].clicks += clicks;
            }
            
            
            // Calculate actual time spent from log timestamps
            // Each log represents one interval (10 min in prod, 1 min in dev)
            // Always calculate time from logs for accuracy (logs are task-specific)
            // If app is also in filteredWindows, logs take priority for time calculation
            {
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
                        const isCurrentlyActive = filteredWindows.some(w => w.app === appName && w.isActive);
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
        
        // Calculate total time spent across all apps for percentage calculation
        // Percentage should be based on time, not count, to avoid >100% issues
        const totalTimeSpent = Object.values(appStats).reduce((sum, stats) => sum + stats.timeSpent, 0);
        const appUsageArray = Object.entries(appStats).map(([name, stats]) => ({
            appName: name,
            title: stats.title || name,
            percentage: totalTimeSpent > 0 ? Math.round((stats.timeSpent / totalTimeSpent) * 100) : 0,
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
        
        // Debug logging for app usage (only in dev mode and only log once per change)
        // Removed excessive logging to prevent performance issues
        
        return appUsageArray;
    }, [
        filteredLogs.length, // Use length to prevent re-calculation on every log change
        allWindows.length,
        filterTaskId, 
        filterTimeEntries?.length,
        currentActivity?.app
    ]);

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
            <div className="p-3 sm:p-4 bg-gray-900 border-b border-gray-800 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 sm:gap-0 shadow-lg z-10">
                <div className="flex-1 min-w-0">
                    <h2 className="text-sm sm:text-base md:text-lg font-bold flex items-center gap-2 flex-wrap">
                        <i className="fas fa-chart-line text-blue-500 text-sm sm:text-base"></i>
                        {filterTaskId && tasks ? (
                            <>
                                <span>Task Report</span>
                                {(() => {
                                    const task = tasks.find(t => t.id === filterTaskId);
                                    const project = filterProjectId ? projects.find(p => p.id === filterProjectId) : null;
                                    return task && (
                                        <span className="text-xs sm:text-sm font-normal text-gray-400 truncate">
                                            • {project?.name} / {task.name}
                                        </span>
                                    );
                                })()}
                            </>
                        ) : isCombinedView ? (
                            <>
                                <span>Combined Insights</span>
                                <span className="text-xs sm:text-sm font-normal text-gray-400">
                                    • All Tasks
                                </span>
                            </>
                        ) : (
                            'Insights'
                        )}
                    </h2>
                    <p className="text-[10px] sm:text-xs text-gray-500 mt-1">
                        {filterTaskId ? 'Task-specific activity & productivity report (today\'s data)' : 
                         isCombinedView ? 'Combined activity & productivity report from today\'s tasks' :
                         'Activity & Productivity Log (today\'s data)'}
                    </p>
                </div>
                <button onClick={onClose} className="text-gray-400 hover:text-white bg-gray-800 p-2 rounded-lg transition-colors flex-shrink-0">
                    <i className="fas fa-times text-sm sm:text-base"></i>
                </button>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar p-3 sm:p-4 md:p-6 space-y-4 sm:space-y-6">
                
                {/* JSON Tracking Data Section - Calculated from JSON file, same format as Insights */}
                {jsonTrackingData && (() => {
                    // Calculate metrics from JSON data
                    const jsonSummary = jsonTrackingData.trackingData?.summary || {};
                    const jsonWindows = jsonTrackingData.trackingData?.activeWindows || [];
                    const jsonUrls = jsonTrackingData.trackingData?.urlHistory || [];
                    
                    // Calculate activity score (0-100) based on keystrokes and clicks
                    const totalKeys = jsonSummary.totalKeystrokes || 0;
                    const totalClicks = jsonSummary.totalMouseClicks || 0;
                    const activityLogs = jsonTrackingData.trackingData?.activityLogs || [];
                    
                    // Check if there's any actual data for today
                    const hasData = totalKeys > 0 || totalClicks > 0 || jsonWindows.length > 0 || activityLogs.length > 0;
                    
                    // If no data, all scores should be 0
                    if (!hasData) {
                        return (
                            <>
                                {/* Summary Section - No Data */}
                                <div className="bg-gradient-to-br from-blue-900/30 to-purple-900/30 rounded-xl p-4 border border-blue-500/30">
                                    <div className="flex items-center gap-2 mb-3">
                                        <i className="fas fa-chart-pie text-blue-400"></i>
                                        <h3 className="text-sm font-bold text-gray-200">Total Activity Summary</h3>
                                    </div>
                                    <div className="text-center py-8 text-gray-500">
                                        <i className="fas fa-inbox text-4xl mb-3 opacity-50"></i>
                                        <p className="text-sm">No activity recorded for today</p>
                                        <p className="text-xs mt-1">Start the timer to begin tracking</p>
                                    </div>
                                </div>
                            </>
                        );
                    }
                    
                    const activityScore = Math.min(100, Math.round((totalKeys + totalClicks * 10) / 100)); // Normalize
                    
                    // Calculate app score from active windows or activity logs
                    const appScores: number[] = [];
                    
                    if (jsonWindows.length > 0) {
                        // Use active windows if available
                        jsonWindows.forEach((win: any) => {
                            const appName = win.appName || win.windowKey || '';
                            // Simple categorization
                            if (appName.toLowerCase().includes('code') || appName.toLowerCase().includes('studio')) {
                                appScores.push(100); // VS Code, etc.
                            } else if (appName.toLowerCase().includes('chrome') || appName.toLowerCase().includes('edge') || appName.toLowerCase().includes('firefox')) {
                                appScores.push(50); // Browsers
                            } else {
                                appScores.push(30); // Other
                            }
                        });
                    } else if (activityLogs.length > 0) {
                        // Extract from activity logs for combined data
                        const uniqueApps = new Set<string>();
                        activityLogs.forEach((log: any) => {
                            const appName = (log.activeWindow || '').toLowerCase();
                            if (appName && !uniqueApps.has(appName)) {
                                uniqueApps.add(appName);
                                if (appName.includes('code') || appName.includes('studio')) {
                                    appScores.push(100);
                                } else if (appName.includes('chrome') || appName.includes('edge') || appName.includes('firefox')) {
                                    appScores.push(50);
                                } else {
                                    appScores.push(30);
                                }
                            }
                        });
                    }
                    const avgAppScore = appScores.length > 0 ? Math.round(appScores.reduce((a, b) => a + b, 0) / appScores.length) : 0;
                    
                    // Calculate URL score from URL history or activity logs
                    const urlScores: number[] = [];
                    if (jsonUrls.length > 0) {
                        jsonUrls.forEach((urlEntry: any) => {
                            const url = urlEntry.url || '';
                            if (url.includes('github.com') || url.includes('stackoverflow.com')) {
                                urlScores.push(100);
                            } else if (url.includes('google.com') || url.includes('youtube.com')) {
                                urlScores.push(50);
                            } else if (url.includes('facebook.com') || url.includes('twitter.com')) {
                                urlScores.push(0);
                            } else {
                                urlScores.push(50);
                            }
                        });
                    } else if (activityLogs.length > 0) {
                        // Extract from activity logs for combined data
                        const uniqueUrls = new Set<string>();
                        activityLogs.forEach((log: any) => {
                            const url = log.url || '';
                            if (url && !uniqueUrls.has(url)) {
                                uniqueUrls.add(url);
                                if (url.includes('github.com') || url.includes('stackoverflow.com')) {
                                    urlScores.push(100);
                                } else if (url.includes('google.com') || url.includes('youtube.com')) {
                                    urlScores.push(50);
                                } else if (url.includes('facebook.com') || url.includes('twitter.com')) {
                                    urlScores.push(0);
                                } else {
                                    urlScores.push(50);
                                }
                            }
                        });
                    }
                    const avgUrlScore = urlScores.length > 0 ? Math.round(urlScores.reduce((a, b) => a + b, 0) / urlScores.length) : 0;
                    
                    // Calculate focus score (based on number of windows or unique apps - fewer = better focus)
                    let windowCount = jsonWindows.length;
                    if (windowCount === 0 && activityLogs.length > 0) {
                        // Count unique apps from activity logs
                        const uniqueApps = new Set<string>();
                        activityLogs.forEach((log: any) => {
                            if (log.activeWindow) uniqueApps.add(log.activeWindow);
                        });
                        windowCount = uniqueApps.size;
                    }
                    // Only calculate focus score if there are windows/apps
                    const focusScore = windowCount === 0 ? 0 : (windowCount <= 2 ? 100 : windowCount <= 4 ? 80 : windowCount <= 6 ? 60 : 40);
                    
                    // Calculate composite score (only if we have data)
                    const compositeScore = Math.round(
                        (activityScore * 0.25) +
                        (avgAppScore * 0.25) +
                        (avgUrlScore * 0.20) +
                        (focusScore * 0.30)
                    );
                    
                    // Calculate category breakdown
                    const categoryBreakdown: Record<string, number> = { productive: 0, neutral: 0, unproductive: 0 };
                    if (jsonWindows.length > 0) {
                        jsonWindows.forEach((win: any) => {
                            const appName = (win.appName || win.windowKey || '').toLowerCase();
                            if (appName.includes('code') || appName.includes('studio')) {
                                categoryBreakdown.productive++;
                            } else if (appName.includes('chrome') || appName.includes('edge')) {
                                categoryBreakdown.neutral++;
                            } else {
                                categoryBreakdown.neutral++;
                            }
                        });
                    } else if (activityLogs.length > 0) {
                        // Extract from activity logs
                        const uniqueApps = new Set<string>();
                        activityLogs.forEach((log: any) => {
                            const appName = (log.activeWindow || '').toLowerCase();
                            if (appName && !uniqueApps.has(appName)) {
                                uniqueApps.add(appName);
                                if (appName.includes('code') || appName.includes('studio')) {
                                    categoryBreakdown.productive++;
                                } else if (appName.includes('chrome') || appName.includes('edge')) {
                                    categoryBreakdown.neutral++;
                                } else {
                                    categoryBreakdown.neutral++;
                                }
                            }
                        });
                    }
                    
                    // Count context switches (window changes)
                    const contextSwitches = Math.max(0, windowCount - 1);
                    
                    // Extract active windows and URLs - use combined data if available, otherwise extract from logs
                    let combinedWindows: any[] = [];
                    
                    // First, try to use activeWindows from combined data
                    if (isCombinedView && jsonTrackingData.trackingData?.activeWindows && 
                        Array.isArray(jsonTrackingData.trackingData.activeWindows) && 
                        jsonTrackingData.trackingData.activeWindows.length > 0) {
                        // Use the combined activeWindows directly
                        combinedWindows = jsonTrackingData.trackingData.activeWindows.map((win: any) => ({
                            appName: win.appName || win.windowKey || 'Unknown',
                            windowKey: win.windowKey || win.appName || 'Unknown',
                            title: win.title || win.appName || 'Unknown',
                            keystrokes: win.keystrokes || 0,
                            mouseClicks: win.mouseClicks || 0,
                            timeSpent: win.timeSpent || 0,
                            lastSeen: win.lastSeen || Date.now(),
                            urls: win.urls || []
                        }));
                    } else if (isCombinedView && activityLogs.length > 0) {
                        // Group activity logs by app/window
                        const windowMap = new Map<string, {
                            appName: string;
                            title: string;
                            keystrokes: number;
                            mouseClicks: number;
                            timeSpent: number;
                            urls: Array<{ url: string | null; title?: string; timestamp: number; count: number }>;
                            lastSeen: number;
                        }>();
                        
                        activityLogs.forEach((log: any) => {
                            const appName = log.activeWindow || 'Unknown';
                            const url = log.url || log.activeUrl || null;
                            const title = log.title || log.windowTitle || '';
                            const timestamp = new Date(log.timestamp).getTime();
                            
                            if (!windowMap.has(appName)) {
                                windowMap.set(appName, {
                                    appName,
                                    title: title || appName,
                                    keystrokes: 0,
                                    mouseClicks: 0,
                                    timeSpent: 0,
                                    urls: [],
                                    lastSeen: timestamp
                                });
                            }
                            
                            const window = windowMap.get(appName)!;
                            window.keystrokes += log.keyboardEvents || log.keystrokes || 0;
                            window.mouseClicks += log.mouseEvents || log.clicks || 0;
                            window.lastSeen = Math.max(window.lastSeen, timestamp);
                            
                            // Add URL if available
                            if (url) {
                                const normalizedUrl = url.replace(/^https?:\/\//, '').split('/')[0];
                                const existingUrl = window.urls.find(u => u.url && u.url.includes(normalizedUrl));
                                if (existingUrl) {
                                    existingUrl.count += 1;
                                    existingUrl.timestamp = Math.max(existingUrl.timestamp, timestamp);
                                } else {
                                    window.urls.push({
                                        url: url,
                                        title: title,
                                        timestamp: timestamp,
                                        count: 1
                                    });
                                }
                            } else if (title && title !== appName) {
                                // Use title if no URL
                                const existingTitle = window.urls.find(u => !u.url && u.title === title);
                                if (existingTitle) {
                                    existingTitle.count += 1;
                                    existingTitle.timestamp = Math.max(existingTitle.timestamp, timestamp);
                                } else {
                                    window.urls.push({
                                        url: null,
                                        title: title,
                                        timestamp: timestamp,
                                        count: 1
                                    });
                                }
                            }
                        });
                        
                        // Calculate time spent (approximate based on log frequency)
                        // Sort logs by timestamp and calculate intervals
                        const sortedLogs = [...activityLogs].sort((a, b) => 
                            new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
                        );
                        
                        sortedLogs.forEach((log: any, idx: number) => {
                            const appName = log.activeWindow || 'Unknown';
                            const window = windowMap.get(appName);
                            if (window && idx < sortedLogs.length - 1) {
                                const currentTime = new Date(log.timestamp).getTime();
                                const nextTime = new Date(sortedLogs[idx + 1].timestamp).getTime();
                                const interval = Math.min((nextTime - currentTime) / 1000, 60); // Cap at 60 seconds
                                window.timeSpent += interval;
                            }
                        });
                        
                        // Convert to array and sort by time spent
                        combinedWindows = Array.from(windowMap.values())
                            .map(win => ({
                                appName: win.appName,
                                windowKey: win.appName,
                                title: win.title,
                                keystrokes: win.keystrokes,
                                mouseClicks: win.mouseClicks,
                                timeSpent: win.timeSpent,
                                urls: win.urls.sort((a, b) => b.count - a.count),
                                lastSeen: win.lastSeen
                            }))
                            .sort((a, b) => b.timeSpent - a.timeSpent);
                    }
                    
                    // Use combined windows if available, otherwise use jsonWindows
                    // For combined view, prefer combinedWindows extracted from combined data
                    // For single task view, use jsonWindows
                    const displayWindows = isCombinedView 
                        ? (combinedWindows.length > 0 ? combinedWindows : jsonWindows)
                        : jsonWindows;
                    
                    return (
                        <>
                            {/* Summary Section - Total Stats Across All Windows */}
                            <div className="bg-gradient-to-br from-blue-900/30 to-purple-900/30 rounded-xl p-3 sm:p-4 border border-blue-500/30">
                                <div className="flex items-center gap-2 mb-2 sm:mb-3 flex-wrap">
                                    <i className="fas fa-chart-pie text-blue-400 text-sm sm:text-base"></i>
                                    <h3 className="text-xs sm:text-sm font-bold text-gray-200">Total Activity Summary</h3>
                                    {(isTaskActive || isCombinedView) && (
                                        <span className="px-2 py-0.5 bg-green-500/20 text-green-400 text-[9px] sm:text-[10px] rounded-full flex items-center gap-1 flex-shrink-0">
                                            <i className="fas fa-circle text-[5px] sm:text-[6px] animate-pulse"></i>
                                            <span className="hidden sm:inline">{isCombinedView ? 'Live (All Tasks)' : 'Live'}</span>
                                            <span className="sm:hidden">{isCombinedView ? 'All' : 'Live'}</span>
                                        </span>
                                    )}
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3">
                                    <div className="bg-gray-900/50 p-2 sm:p-3 rounded-lg border border-gray-700 text-center">
                                        <div className="text-xl sm:text-2xl font-bold text-green-400">
                                            {compositeScore}%
                                        </div>
                                        <div className="text-[9px] sm:text-[10px] uppercase text-gray-400 font-bold mt-1">
                                            Composite Score
                                        </div>
                                        <div className="text-[8px] sm:text-[9px] text-gray-500 mt-0.5">TyroDesk Algorithm</div>
                                    </div>
                                    <div className="bg-gray-900/50 p-2 sm:p-3 rounded-lg border border-gray-700 text-center">
                                        <div className="text-xl sm:text-2xl font-bold text-blue-400">{totalKeys.toLocaleString()}</div>
                                        <div className="text-[9px] sm:text-[10px] uppercase text-gray-400 font-bold mt-1">Total Keystrokes</div>
                                        <div className="text-[8px] sm:text-[9px] text-gray-500 mt-0.5">Across all windows</div>
                                    </div>
                                    <div className="bg-gray-900/50 p-2 sm:p-3 rounded-lg border border-gray-700 text-center">
                                        <div className="text-xl sm:text-2xl font-bold text-purple-400">{totalClicks.toLocaleString()}</div>
                                        <div className="text-[9px] sm:text-[10px] uppercase text-gray-400 font-bold mt-1">Total Clicks</div>
                                        <div className="text-[8px] sm:text-[9px] text-gray-500 mt-0.5">Across all windows</div>
                                    </div>
                                </div>
                                {displayWindows.length > 0 && (
                                    <div className="mt-3 pt-3 border-t border-gray-700/50">
                                        <div className="text-xs text-gray-400">
                                            <i className="fas fa-window-restore mr-1"></i>
                                            Tracking <span className="font-bold text-blue-400">{displayWindows.length}</span> {displayWindows.length === 1 ? 'window' : 'windows'}
                                            {isCombinedView && <span className="ml-1 text-gray-500">(across all tasks)</span>}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* TyroDesk Algorithm Metrics Section */}
                            <div className="bg-gradient-to-br from-purple-900/30 to-pink-900/30 rounded-xl p-3 sm:p-4 border border-purple-500/30">
                                <div className="flex items-center gap-2 mb-3 sm:mb-4">
                                    <i className="fas fa-brain text-purple-400 text-sm sm:text-base"></i>
                                    <h3 className="text-xs sm:text-sm font-bold text-gray-200">TyroDesk Productivity Analysis</h3>
                                </div>
                                
                                {/* Composite Score with Breakdown */}
                                <div className="mb-3 sm:mb-4">
                                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-0 mb-2">
                                        <div className="flex items-center gap-2">
                                            <span className="text-[10px] sm:text-xs font-bold text-gray-400 uppercase">Composite Score Breakdown</span>
                                            <span 
                                                className="text-[7px] sm:text-[8px] text-gray-500 cursor-help" 
                                                title="Weighted combination: Activity (25%) + App (25%) + URL (20%) + Focus (30%)"
                                            >
                                                <i className="fas fa-info-circle"></i>
                                            </span>
                                        </div>
                                        <span className="text-base sm:text-lg font-bold text-green-400">
                                            {compositeScore}%
                                        </span>
                                    </div>
                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                        <div 
                                            className="bg-gray-900/50 p-2 rounded border border-gray-700 text-center hover:border-blue-500 transition-colors cursor-help" 
                                            title="Activity Score (25% weight): Based on keystrokes + mouse clicks. Higher = more active computer use."
                                        >
                                            <div className="text-sm font-bold text-blue-400">{activityScore}</div>
                                            <div className="text-[9px] text-gray-500 mt-0.5">Activity</div>
                                            <div className="text-[8px] text-gray-600 mt-0.5">25% weight</div>
                                        </div>
                                        <div 
                                            className="bg-gray-900/50 p-2 rounded border border-gray-700 text-center hover:border-green-500 transition-colors cursor-help"
                                            title="App Score (25% weight): Productivity of apps used. VS Code=100%, Chrome=50%, Spotify=0%"
                                        >
                                            <div className="text-sm font-bold text-green-400">{avgAppScore}</div>
                                            <div className="text-[9px] text-gray-500 mt-0.5">App</div>
                                            <div className="text-[8px] text-gray-600 mt-0.5">25% weight</div>
                                        </div>
                                        <div 
                                            className="bg-gray-900/50 p-2 rounded border border-gray-700 text-center hover:border-yellow-500 transition-colors cursor-help"
                                            title="URL Score (20% weight): Productivity of websites visited. GitHub=100%, Google=50%, Facebook=0%"
                                        >
                                            <div className="text-sm font-bold text-yellow-400">{avgUrlScore}</div>
                                            <div className="text-[9px] text-gray-500 mt-0.5">URL</div>
                                            <div className="text-[8px] text-gray-600 mt-0.5">20% weight</div>
                                        </div>
                                        <div 
                                            className="bg-gray-900/50 p-2 rounded border border-gray-700 text-center hover:border-purple-500 transition-colors cursor-help"
                                            title="Focus Score (30% weight): How focused you were. Fewer app switches = higher score. 100% = excellent focus!"
                                        >
                                            <div className="text-sm font-bold text-purple-400">{focusScore}</div>
                                            <div className="text-[9px] text-gray-500 mt-0.5">Focus</div>
                                            <div className="text-[8px] text-gray-600 mt-0.5">30% weight</div>
                                        </div>
                                    </div>
                                </div>
                                
                                {/* Category Breakdown */}
                                {Object.keys(categoryBreakdown).length > 0 && (
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
                                            {categoryBreakdown.productive > 0 && (
                                                <div 
                                                    className="flex-1 bg-green-900/30 p-2 rounded border border-green-500/30 text-center hover:border-green-400 transition-colors cursor-help"
                                                    title="Productive: VS Code, Office apps, Design tools, GitHub, Stack Overflow"
                                                >
                                                    <div className="text-sm font-bold text-green-400">{categoryBreakdown.productive}</div>
                                                    <div className="text-[9px] text-gray-400 mt-0.5">Productive</div>
                                                </div>
                                            )}
                                            {categoryBreakdown.neutral > 0 && (
                                                <div 
                                                    className="flex-1 bg-yellow-900/30 p-2 rounded border border-yellow-500/30 text-center hover:border-yellow-400 transition-colors cursor-help"
                                                    title="Neutral: Browsers, Communication apps (Slack, Teams), Search engines"
                                                >
                                                    <div className="text-sm font-bold text-yellow-400">{categoryBreakdown.neutral}</div>
                                                    <div className="text-[9px] text-gray-400 mt-0.5">Neutral</div>
                                                </div>
                                            )}
                                            {categoryBreakdown.unproductive > 0 && (
                                                <div 
                                                    className="flex-1 bg-red-900/30 p-2 rounded border border-red-500/30 text-center hover:border-red-400 transition-colors cursor-help"
                                                    title="Unproductive: Entertainment (Spotify, Netflix), Social media (Facebook, Twitter)"
                                                >
                                                    <div className="text-sm font-bold text-red-400">{categoryBreakdown.unproductive}</div>
                                                    <div className="text-[9px] text-gray-400 mt-0.5">Unproductive</div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                                
                                {/* Focus Metrics */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
                                    <div 
                                        className="bg-gray-900/50 p-2 sm:p-3 rounded border border-gray-700 text-center hover:border-purple-500 transition-colors cursor-help"
                                        title="Focus Score: Measures how focused you were. 100% = excellent focus (minimal app switching). Higher = better productivity."
                                    >
                                        <div className="text-lg sm:text-xl font-bold text-purple-400">{focusScore}%</div>
                                        <div className="text-[9px] sm:text-[10px] uppercase text-gray-400 font-bold mt-1">Avg Focus Score</div>
                                        <div className="text-[7px] sm:text-[8px] text-gray-600 mt-1">
                                            {focusScore >= 80 ? '⭐ Excellent!' : 
                                             focusScore >= 60 ? '✅ Good' : 
                                             focusScore >= 40 ? '⚠️ Moderate' : '❌ Low'}
                                        </div>
                                    </div>
                                    <div 
                                        className="bg-gray-900/50 p-2 sm:p-3 rounded border border-gray-700 text-center hover:border-orange-500 transition-colors cursor-help"
                                        title="Context Switches: Number of times you switched between different apps. Lower = better. Each switch costs ~23 min to regain focus."
                                    >
                                        <div className="text-lg sm:text-xl font-bold text-orange-400">{contextSwitches}</div>
                                        <div className="text-[9px] sm:text-[10px] uppercase text-gray-400 font-bold mt-1">Context Switches</div>
                                        <div className="text-[7px] sm:text-[8px] text-gray-600 mt-1">
                                            {contextSwitches === 0 ? '⭐ Perfect!' : 
                                             contextSwitches <= 3 ? '✅ Good' : 
                                             contextSwitches <= 6 ? '⚠️ Moderate' : '❌ High'}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Active Windows with URL Details - Expandable format like App Usage */}
                            {displayWindows.length > 0 && (
                                <div>
                                    <div className="flex items-center justify-between mb-3">
                                        <h3 className="text-xs font-bold text-gray-400 uppercase">Active Windows & URLs</h3>
                                        {(isTaskActive || isCombinedView) && (
                                            <span className="text-[10px] text-green-400 flex items-center gap-1">
                                                <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse"></span>
                                                {isCombinedView ? 'Live (All Tasks)' : 'Live'}
                                            </span>
                                        )}
                                    </div>
                                    <div className="space-y-2">
                                        {displayWindows.map((win: any, idx: number) => {
                                            const appName = win.appName || win.windowKey || 'Unknown';
                                            const isExpanded = expandedApps.has(appName);
                                            const totalTime = displayWindows.reduce((sum: number, w: any) => sum + (w.timeSpent || 0), 0);
                                            const percentage = totalTime > 0 ? Math.round((win.timeSpent || 0) / totalTime * 100) : 0;
                                            
                                            return (
                                                <div key={idx} className="bg-gray-800/50 rounded border border-gray-800 overflow-hidden">
                                                    {/* Main Item - Clickable */}
                                                    <div 
                                                        className={`flex items-center justify-between text-sm p-2 cursor-pointer hover:bg-gray-800/70 transition-colors ${(isTaskActive || isCombinedView) && idx === 0 ? 'bg-blue-500/10 border-l-2 border-blue-500' : ''}`}
                                                        onClick={() => toggleExpand(appName)}
                                                    >
                                                        <div className="flex items-center gap-3">
                                                            <div className={`w-8 h-8 rounded flex items-center justify-center ${(isTaskActive || isCombinedView) && idx === 0 ? 'bg-blue-500/20 text-blue-400' : 'bg-gray-700 text-gray-400'}`}>
                                                                <i className={`fas ${appName.toLowerCase().includes('code') || appName.toLowerCase().includes('cursor') ? 'fa-code' : appName.toLowerCase().includes('chrome') ? 'fa-globe' : appName.toLowerCase().includes('brave') ? 'fa-shield-alt' : appName.toLowerCase().includes('edge') ? 'fa-edge' : appName.toLowerCase().includes('firefox') ? 'fa-firefox' : 'fa-desktop'}`}></i>
                                                            </div>
                                                            <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                                                                <div className="flex items-center gap-2">
                                                                    <span className="font-medium text-gray-300 truncate">{appName}</span>
                                                                    {(isTaskActive || isCombinedView) && idx === 0 && (
                                                                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 animate-pulse flex-shrink-0">
                                                                            {isCombinedView ? 'Most Used' : 'Active'}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                                {win.title && win.title !== appName && (
                                                                    <span className="text-[10px] text-gray-500 truncate" title={win.title}>
                                                                        {win.title}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center gap-3">
                                                            <div className="w-24 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                                                                <div className="h-full bg-blue-500" style={{ width: `${percentage}%` }}></div>
                                                            </div>
                                                            <span className="text-xs font-mono w-8 text-right text-gray-400">{percentage}%</span>
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
                                                                    <div className="text-lg font-bold text-blue-400">{(win.keystrokes || 0).toLocaleString()}</div>
                                                                    <div className="text-[10px] text-gray-500 uppercase font-bold mt-0.5">Keystrokes</div>
                                                                </div>
                                                                <div className="text-center">
                                                                    <div className="text-lg font-bold text-purple-400">{(win.mouseClicks || 0).toLocaleString()}</div>
                                                                    <div className="text-[10px] text-gray-500 uppercase font-bold mt-0.5">Mouse Clicks</div>
                                                                </div>
                                                                <div className="text-center">
                                                                    <div className="text-lg font-bold text-green-400">{formatTime(win.timeSpent || 0)}</div>
                                                                    <div className="text-[10px] text-gray-500 uppercase font-bold mt-0.5">Time Spent</div>
                                                                </div>
                                                            </div>
                                                            
                                                            {/* URL/Title Details */}
                                                            {win.urls && win.urls.length > 0 && (
                                                                <div className="mt-3 pt-3 border-t border-gray-700/50">
                                                                    <div className="text-xs font-bold text-gray-400 uppercase mb-2 flex items-center gap-2">
                                                                        <i className="fas fa-link text-blue-400"></i>
                                                                        URLs Visited ({win.urls.length})
                                                                    </div>
                                                                    <div className="space-y-1.5 max-h-48 overflow-y-auto custom-scrollbar">
                                                                        {win.urls.map((urlEntry: any, urlIdx: number) => (
                                                                            <div 
                                                                                key={urlIdx} 
                                                                                className="bg-gray-800/50 rounded p-2 border border-gray-700/50 hover:border-blue-500/50 transition-colors"
                                                                            >
                                                                                <div className="flex items-start justify-between gap-2">
                                                                                    <div className="flex-1 min-w-0">
                                                                                        {urlEntry.url ? (
                                                                                            <>
                                                                                                <a 
                                                                                                    href={urlEntry.url} 
                                                                                                    target="_blank" 
                                                                                                    rel="noopener noreferrer"
                                                                                                    className="text-xs text-blue-400 hover:text-blue-300 truncate block"
                                                                                                    title={urlEntry.url}
                                                                                                >
                                                                                                    {urlEntry.url.replace(/^https?:\/\//, '').split('/')[0]}
                                                                                                </a>
                                                                                                <div className="text-[10px] text-gray-500 mt-0.5">
                                                                                                    {urlEntry.url.length > 50 ? urlEntry.url.substring(0, 50) + '...' : urlEntry.url}
                                                                                                </div>
                                                                                            </>
                                                                                        ) : (
                                                                                            <>
                                                                                                <div className="text-xs text-gray-300 font-medium truncate block" title={urlEntry.title || 'Unknown Page'}>
                                                                                                    {urlEntry.title || 'Unknown Page'}
                                                                                                </div>
                                                                                                <div className="text-[10px] text-gray-500 mt-0.5 italic">
                                                                                                    (URL unknown)
                                                                                                </div>
                                                                                            </>
                                                                                        )}
                                                                                    </div>
                                                                                    <div className="flex flex-col items-end gap-1">
                                                                                        {urlEntry.count > 1 && (
                                                                                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 font-bold">
                                                                                                {urlEntry.count}x
                                                                                            </span>
                                                                                        )}
                                                                                        <span className="text-[9px] text-gray-600">
                                                                                            {urlEntry.timestamp ? new Date(urlEntry.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : ''}
                                                                                        </span>
                                                                                    </div>
                                                                                </div>
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                </div>
                                                            )}
                                                            
                                                            {/* Show message if no URLs but it's a browser */}
                                                            {(!win.urls || win.urls.length === 0) && 
                                                             (appName.toLowerCase().includes('chrome') || 
                                                              appName.toLowerCase().includes('brave') || 
                                                              appName.toLowerCase().includes('firefox') || 
                                                              appName.toLowerCase().includes('edge') || 
                                                              appName.toLowerCase().includes('safari')) && (
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
                                    </div>
                                </div>
                            )}
                        </>
                    );
                })()}
                
                {/* Summary Section - Only show if no JSON data (fallback to logs) */}
                {!jsonTrackingData && (
                    <div className="bg-gradient-to-br from-blue-900/30 to-purple-900/30 rounded-xl p-3 sm:p-4 border border-blue-500/30">
                        <div className="flex items-center gap-2 mb-2 sm:mb-3">
                            <i className="fas fa-chart-pie text-blue-400 text-sm sm:text-base"></i>
                            <h3 className="text-xs sm:text-sm font-bold text-gray-200">Total Activity Summary</h3>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3">
                            <div className="bg-gray-900/50 p-2 sm:p-3 rounded-lg border border-gray-700 text-center">
                                <div className="text-xl sm:text-2xl font-bold text-green-400">
                                    {stats.avgCompositeScore > 0 ? stats.avgCompositeScore : stats.avgProd}%
                                </div>
                                <div className="text-[9px] sm:text-[10px] uppercase text-gray-400 font-bold mt-1">
                                    {stats.avgCompositeScore > 0 ? 'Composite Score' : 'Productivity'}
                                </div>
                                {stats.avgCompositeScore > 0 && (
                                    <div className="text-[8px] sm:text-[9px] text-gray-500 mt-0.5">TyroDesk Algorithm</div>
                                )}
                            </div>
                            <div className="bg-gray-900/50 p-2 sm:p-3 rounded-lg border border-gray-700 text-center">
                                <div className="text-xl sm:text-2xl font-bold text-blue-400">{stats.totalKeys.toLocaleString()}</div>
                                <div className="text-[9px] sm:text-[10px] uppercase text-gray-400 font-bold mt-1">Total Keystrokes</div>
                                <div className="text-[8px] sm:text-[9px] text-gray-500 mt-0.5">Across all windows</div>
                            </div>
                            <div className="bg-gray-900/50 p-2 sm:p-3 rounded-lg border border-gray-700 text-center">
                                <div className="text-xl sm:text-2xl font-bold text-purple-400">{stats.totalClicks.toLocaleString()}</div>
                                <div className="text-[9px] sm:text-[10px] uppercase text-gray-400 font-bold mt-1">Total Clicks</div>
                                <div className="text-[8px] sm:text-[9px] text-gray-500 mt-0.5">Across all windows</div>
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
                )}

                {/* TyroDesk Algorithm Metrics Section - Only show if no JSON data (fallback to logs) */}
                {!jsonTrackingData && (() => {
                    const hasTyroDeskData = logs.some(log => log.compositeScore !== undefined || log.appCategory || log.focusScore !== undefined);
                    return hasTyroDeskData;
                })() && (
                    <div className="bg-gradient-to-br from-purple-900/30 to-pink-900/30 rounded-xl p-3 sm:p-4 border border-purple-500/30">
                        <div className="flex items-center gap-2 mb-3 sm:mb-4">
                            <i className="fas fa-brain text-purple-400 text-sm sm:text-base"></i>
                            <h3 className="text-xs sm:text-sm font-bold text-gray-200">TyroDesk Productivity Analysis</h3>
                        </div>
                        
                        {/* Composite Score with Breakdown */}
                        {stats.avgCompositeScore > 0 && stats.avgBreakdown && (
                            <div className="mb-3 sm:mb-4">
                                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-0 mb-2">
                                    <div className="flex items-center gap-2">
                                        <span className="text-[10px] sm:text-xs font-bold text-gray-400 uppercase">Composite Score Breakdown</span>
                                        <span 
                                            className="text-[7px] sm:text-[8px] text-gray-500 cursor-help" 
                                            title="Weighted combination: Activity (25%) + App (25%) + URL (20%) + Focus (30%)"
                                        >
                                            <i className="fas fa-info-circle"></i>
                                        </span>
                                    </div>
                                    <span className="text-base sm:text-lg font-bold" style={{ color: filteredLogs.find(l => l.compositeScore)?.scoreClassification?.color || '#eab308' }}>
                                        {stats.avgCompositeScore}%
                                    </span>
                                </div>
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
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
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
                                <div 
                                    className="bg-gray-900/50 p-2 sm:p-3 rounded border border-gray-700 text-center hover:border-purple-500 transition-colors cursor-help"
                                    title="Focus Score: Measures how focused you were. 100% = excellent focus (minimal app switching). Higher = better productivity."
                                >
                                    <div className="text-lg sm:text-xl font-bold text-purple-400">{stats.avgFocusScore}%</div>
                                    <div className="text-[9px] sm:text-[10px] uppercase text-gray-400 font-bold mt-1">Avg Focus Score</div>
                                    <div className="text-[7px] sm:text-[8px] text-gray-600 mt-1">
                                        {stats.avgFocusScore >= 80 ? '⭐ Excellent!' : 
                                         stats.avgFocusScore >= 60 ? '✅ Good' : 
                                         stats.avgFocusScore >= 40 ? '⚠️ Moderate' : '❌ Low'}
                                    </div>
                                </div>
                                <div 
                                    className="bg-gray-900/50 p-2 sm:p-3 rounded border border-gray-700 text-center hover:border-orange-500 transition-colors cursor-help"
                                    title="Context Switches: Number of times you switched between different apps. Lower = better. Each switch costs ~23 min to regain focus."
                                >
                                    <div className="text-lg sm:text-xl font-bold text-orange-400">{stats.totalContextSwitches}</div>
                                    <div className="text-[9px] sm:text-[10px] uppercase text-gray-400 font-bold mt-1">Context Switches</div>
                                    <div className="text-[7px] sm:text-[8px] text-gray-600 mt-1">
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
                <div className="bg-gray-900 rounded-lg p-3 sm:p-4 border border-gray-800">
                    <h3 className="text-[10px] sm:text-xs font-bold text-gray-400 uppercase mb-3 sm:mb-4">Activity Timeline</h3>
                    <div className="h-20 sm:h-24 flex items-end gap-1 overflow-x-auto pb-2 custom-scrollbar">
                        {(() => {
                            // Combine logs from filteredLogs and JSON tracking data
                            const allLogs: Array<{
                                id: string;
                                timestamp: Date;
                                activeWindow: string;
                                compositeScore?: number;
                                productivityScore?: number;
                                scoreClassification?: { color: string; label: string };
                                appCategory?: string;
                                focusScore?: number;
                                projectId?: string;
                            }> = [];
                            
                            // Add logs from filteredLogs
                            filteredLogs.forEach(log => {
                                allLogs.push({
                                    id: log.id,
                                    timestamp: log.timestamp,
                                    activeWindow: log.activeWindow,
                                    compositeScore: log.compositeScore,
                                    productivityScore: log.productivityScore,
                                    scoreClassification: log.scoreClassification,
                                    appCategory: log.appCategory,
                                    focusScore: log.focusScore,
                                    projectId: log.projectId
                                });
                            });
                            
                            // Add activity logs from JSON tracking data if available
                            if (jsonTrackingData?.trackingData?.activityLogs) {
                                const jsonActivityLogs = jsonTrackingData.trackingData.activityLogs;
                                jsonActivityLogs.forEach((log: any, idx: number) => {
                                    const timestamp = log.timestamp 
                                        ? new Date(log.timestamp) 
                                        : (log.createdAt ? new Date(log.createdAt) : new Date());
                                    
                                    // Calculate productivity score if not present
                                    const productivityScore = log.productivityScore || log.compositeScore || 0;
                                    
                                    allLogs.push({
                                        id: `json-log-${idx}-${timestamp.getTime()}`,
                                        timestamp: timestamp,
                                        activeWindow: log.activeWindow || log.windowTitle || 'Unknown',
                                        compositeScore: log.compositeScore,
                                        productivityScore: productivityScore,
                                        scoreClassification: log.scoreClassification,
                                        appCategory: log.appCategory,
                                        focusScore: log.focusScore,
                                        projectId: log.projectId || jsonTrackingData.metadata?.projectId
                                    });
                                });
                            }
                            
                            // Sort by timestamp
                            allLogs.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
                            
                            if (allLogs.length === 0) {
                                return (
                                    <div className="w-full h-full flex items-center justify-center text-gray-600 text-xs italic">
                                        No activity recorded yet.
                                    </div>
                                );
                            }
                            
                            return allLogs.map((log) => {
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
                            });
                        })()}
                    </div>
                </div>

                {/* Recent Screenshots / Cam Snaps Grid */}
                <div>
                    <div className="flex items-center justify-between mb-2 sm:mb-3">
                        <h3 className="text-[10px] sm:text-xs font-bold text-gray-400 uppercase">Evidence Log</h3>
                        <span className="text-[9px] sm:text-[10px] text-gray-500">
                            {(() => {
                                // Count all individual images (screenshots + webcam photos)
                                let count = 0;
                                
                                // Count from filteredLogs
                                filteredLogs.forEach(log => {
                                    if (log.screenshotUrls && log.screenshotUrls.length > 0) {
                                        count += log.screenshotUrls.length;
                                    } else if (log.screenshotUrl) {
                                        count += 1;
                                    }
                                    if (log.webcamUrl) {
                                        count += 1;
                                    }
                                });
                                
                                // Count from JSON tracking data if available
                                if (jsonTrackingData?.trackingData) {
                                    const jsonScreenshots = jsonTrackingData.trackingData.screenshots || [];
                                    const jsonWebcamPhotos = jsonTrackingData.trackingData.webcamPhotos || [];
                                    count += jsonScreenshots.length;
                                    count += jsonWebcamPhotos.length;
                                }
                                
                                return count;
                            })()} images
                        </span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2 sm:gap-3">
                        {(() => {
                            // Flatten filteredLogs to create individual evidence items for each screenshot and webcam photo
                            // IMPORTANT: Use filteredLogs, not logs, to ensure only task-specific evidence is shown
                            const evidenceItems: Array<{
                                id: string;
                                imageUrl: string;
                                type: 'screenshot' | 'webcam';
                                timestamp: Date;
                                activeWindow?: string;
                                activeUrl?: string;
                                productivityScore?: number;
                                index?: number;
                            }> = [];
                            
                            // Add evidence from filteredLogs
                            filteredLogs.forEach(log => {
                                // Add all screenshots as separate items
                                if (log.screenshotUrls && log.screenshotUrls.length > 0) {
                                    log.screenshotUrls.forEach((url, idx) => {
                                        evidenceItems.push({
                                            id: `${log.id}-screenshot-${idx}`,
                                            imageUrl: url,
                                            type: 'screenshot',
                                            timestamp: log.timestamp,
                                            activeWindow: log.activeWindow,
                                            activeUrl: log.activeUrl,
                                            productivityScore: log.productivityScore,
                                            index: idx
                                        });
                                    });
                                } else if (log.screenshotUrl) {
                                    evidenceItems.push({
                                        id: `${log.id}-screenshot-0`,
                                        imageUrl: log.screenshotUrl,
                                        type: 'screenshot',
                                        timestamp: log.timestamp,
                                        activeWindow: log.activeWindow,
                                        activeUrl: log.activeUrl,
                                        productivityScore: log.productivityScore,
                                        index: 0
                                    });
                                }
                                
                                // Add webcam photo as separate item
                                if (log.webcamUrl) {
                                    evidenceItems.push({
                                        id: `${log.id}-webcam`,
                                        imageUrl: log.webcamUrl,
                                        type: 'webcam',
                                        timestamp: log.timestamp,
                                        activeWindow: log.activeWindow,
                                        activeUrl: log.activeUrl,
                                        productivityScore: log.productivityScore
                                    });
                                }
                            });
                            
                            // Add evidence from JSON tracking data if available
                            if (jsonTrackingData?.trackingData) {
                                const jsonScreenshots = jsonTrackingData.trackingData.screenshots || [];
                                const jsonWebcamPhotos = jsonTrackingData.trackingData.webcamPhotos || [];
                                
                                // Add screenshots from JSON data
                                jsonScreenshots.forEach((screenshot: any, idx: number) => {
                                    const timestamp = screenshot.timestamp 
                                        ? new Date(screenshot.timestamp) 
                                        : (screenshot.createdAt ? new Date(screenshot.createdAt) : new Date());
                                    // Prefer fileUrl (server URL) over dataUrl (base64) for better performance
                                    const imageUrl = screenshot.fileUrl || screenshot.dataUrl || screenshot.path || screenshot.url || screenshot.filePath;
                                    if (imageUrl) { // Only add if imageUrl exists
                                        evidenceItems.push({
                                            id: `json-screenshot-${idx}-${timestamp.getTime()}`,
                                            imageUrl: imageUrl,
                                            type: 'screenshot',
                                            timestamp: timestamp,
                                            activeWindow: screenshot.activeWindow || screenshot.windowTitle || 'Unknown',
                                            activeUrl: screenshot.url || screenshot.activeUrl,
                                            productivityScore: screenshot.productivityScore,
                                            index: idx
                                        });
                                    }
                                });
                                
                                // Add webcam photos from JSON data
                                jsonWebcamPhotos.forEach((photo: any, idx: number) => {
                                    const timestamp = photo.timestamp 
                                        ? new Date(photo.timestamp) 
                                        : (photo.createdAt ? new Date(photo.createdAt) : new Date());
                                    // Prefer fileUrl (server URL) over dataUrl (base64) for better performance
                                    const photoUrl = photo.fileUrl || photo.dataUrl || photo.path || photo.url || photo.filePath;
                                    if (photoUrl) { // Only add if photoUrl exists
                                        evidenceItems.push({
                                            id: `json-webcam-${idx}-${timestamp.getTime()}`,
                                            imageUrl: photoUrl,
                                            type: 'webcam',
                                            timestamp: timestamp,
                                            activeWindow: photo.activeWindow || photo.windowTitle || 'Unknown',
                                            activeUrl: photo.url || photo.activeUrl,
                                            productivityScore: photo.productivityScore
                                        });
                                    }
                                });
                            }
                            
                            // Sort by timestamp (newest first) and take latest 20
                            evidenceItems.sort((a, b) => 
                                b.timestamp.getTime() - a.timestamp.getTime()
                            );
                            
                            return evidenceItems.length > 0 ? (
                                <>
                                    {evidenceItems.slice(0, 20).map((item) => (
                                        <div key={item.id} className="bg-gray-800 rounded-lg overflow-hidden border border-gray-700 group relative hover:border-blue-500 transition-colors">
                                            <div className="aspect-video relative bg-black">
                                                {item.imageUrl ? (
                                                    <img 
                                                        src={item.imageUrl} 
                                                        alt={item.type === 'screenshot' ? `Screen Capture ${(item.index || 0) + 1}` : 'Camera Photo'} 
                                                        className="w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-opacity" 
                                                        onError={(e) => {
                                                            console.error(`Failed to load ${item.type}:`, item.id);
                                                            (e.target as HTMLImageElement).style.display = 'none';
                                                        }}
                                                    />
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center text-gray-600 text-xs">
                                                        No image available
                                                    </div>
                                                )}
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
                                                        {item.timestamp.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                                    </div>
                                                    <div className="text-gray-300 text-[10px] text-center">
                                                        {item.activeWindow || 'Unknown'}
                                                    </div>
                                                    {item.activeUrl && (
                                                        <div className="text-blue-400 text-[9px] mt-1 text-center max-w-full truncate" title={item.activeUrl}>
                                                            {item.activeUrl}
                                                        </div>
                                                    )}
                                                    {item.productivityScore !== undefined && (
                                                        <div className="text-gray-400 text-[10px] mt-1">
                                                            Prod: {item.productivityScore}%
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="p-2 flex flex-col gap-1 bg-gray-850">
                                                <div className="flex justify-between items-center">
                                                    <span className="text-[10px] text-gray-400">
                                                        {item.timestamp.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
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
                                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-700 text-gray-300 truncate max-w-[120px]" title={item.activeWindow || 'Unknown'}>
                                                        {item.activeWindow || 'Unknown'}
                                                    </span>
                                                    {item.activeUrl && (
                                                        <span className="text-[9px] text-blue-400 truncate max-w-[150px]" title={item.activeUrl}>
                                                            🔗 {item.activeUrl.replace(/^https?:\/\//, '').split('/')[0]}
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

                {/* App Usage List - Only show if no JSON data (fallback to logs) */}
                {!jsonTrackingData && (
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
                )}
            </div>
        </div>
    );
};