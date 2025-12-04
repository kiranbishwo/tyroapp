import React, { useState, useEffect } from 'react';

interface CombinedInsightsProps {
    onClose: () => void;
}

interface CombinedData {
    success: boolean;
    totalTasks: number;
    totalProjects: number;
    combinedData: {
        activityLogs: any[];
        screenshots: any[];
        webcamPhotos: any[];
        summary: {
            totalKeystrokes: number;
            totalMouseClicks: number;
            totalTime: number;
            averageProductivityScore: number;
        };
    };
    tasks: Array<{
        taskId: string;
        projectId: string;
        taskName: string;
        projectName: string;
        createdAt: string;
        lastUpdated: string;
        summary: any;
        activityLogCount: number;
        screenshotCount: number;
        webcamPhotoCount: number;
    }>;
    projects: Record<string, {
        projectId: string;
        projectName: string | null;
        taskCount: number;
        totalKeystrokes: number;
        totalMouseClicks: number;
    }>;
    lastUpdated?: string;
}

const formatTime = (seconds: number): string => {
    if (seconds < 60) {
        return `${seconds}s`;
    }
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
        return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
    }
    return `${minutes}m`;
};

const formatDate = (dateString: string): string => {
    try {
        const date = new Date(dateString);
        return date.toLocaleString();
    } catch {
        return dateString;
    }
};

export const CombinedInsights: React.FC<CombinedInsightsProps> = ({ onClose }) => {
    const [data, setData] = useState<CombinedData | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Fetch initial data and subscribe to updates
    useEffect(() => {
        if (!window.electronAPI) {
            setError('Electron API not available');
            setIsLoading(false);
            return;
        }

        const fetchData = async () => {
            try {
                setIsLoading(true);
                // Fetch only today's data
                const combinedData = await window.electronAPI.getCombinedInsights('today');
                setData(combinedData);
                setError(null);
            } catch (err: any) {
                console.error('Error fetching combined insights:', err);
                setError(err.message || 'Failed to load combined insights');
            } finally {
                setIsLoading(false);
            }
        };

        // Subscribe to real-time updates (today's data only)
        // This will also send initial data immediately
        window.electronAPI.subscribeCombinedInsights('today');
        
        // Listen for updates
        window.electronAPI.onCombinedInsightsUpdate((updatedData: CombinedData) => {
            if (updatedData && updatedData.success) {
                setData(updatedData);
                setError(null);
            }
        });

        // Also fetch initial data as backup (in case subscription doesn't send it immediately)
        fetchData();

        // Cleanup
        return () => {
            if (window.electronAPI) {
                window.electronAPI.unsubscribeCombinedInsights();
                window.electronAPI.removeCombinedInsightsListener();
            }
        };
    }, []);

    if (isLoading) {
        return (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                <div className="bg-gray-900 rounded-lg p-8">
                    <div className="flex items-center gap-3">
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500"></div>
                        <span className="text-white">Loading combined insights...</span>
                    </div>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                <div className="bg-gray-900 rounded-lg p-8 max-w-md">
                    <div className="text-red-500 mb-4">
                        <i className="fas fa-exclamation-circle mr-2"></i>
                        Error: {error}
                    </div>
                    <button
                        onClick={onClose}
                        className="px-4 py-2 bg-gray-700 text-white rounded hover:bg-gray-600"
                    >
                        Close
                    </button>
                </div>
            </div>
        );
    }

    if (!data || !data.success) {
        return (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                <div className="bg-gray-900 rounded-lg p-8 max-w-md">
                    <div className="text-yellow-500 mb-4">
                        <i className="fas fa-info-circle mr-2"></i>
                        No tracking data available
                    </div>
                    <button
                        onClick={onClose}
                        className="px-4 py-2 bg-gray-700 text-white rounded hover:bg-gray-600"
                    >
                        Close
                    </button>
                </div>
            </div>
        );
    }

    const { combinedData, tasks, projects, totalTasks, totalProjects, lastUpdated } = data;
    const { summary } = combinedData;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 overflow-y-auto p-2 sm:p-4">
            <div className="bg-gray-950 text-white w-full max-w-6xl max-h-[90vh] m-2 sm:m-4 rounded-lg shadow-2xl flex flex-col animate-fade-in">
                {/* Header */}
                <div className="p-3 sm:p-4 bg-gray-900 border-b border-gray-800 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 sm:gap-0 sticky top-0 z-10">
                    <div className="flex-1 min-w-0">
                        <h2 className="text-base sm:text-lg font-bold flex items-center gap-2">
                            <i className="fas fa-chart-pie text-blue-500 text-sm sm:text-base"></i>
                            <span className="truncate">Today's Combined Insights Report</span>
                        </h2>
                        <p className="text-[10px] sm:text-xs text-gray-500 mt-1">
                            Real-time aggregated data from today's tasks and projects
                            {lastUpdated ? (
                                <span className="ml-1 sm:ml-2 block sm:inline">• Last updated: {formatDate(lastUpdated)}</span>
                            ) : (
                                <span className="ml-1 sm:ml-2 block sm:inline">• Last updated: {formatDate(new Date().toISOString())}</span>
                            )}
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-white bg-gray-800 p-2 rounded-lg transition-colors flex-shrink-0"
                        title="Close"
                    >
                        <i className="fas fa-times text-sm sm:text-base"></i>
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto custom-scrollbar p-3 sm:p-4 md:p-6 space-y-4 sm:space-y-6">
                    {/* Summary Cards */}
                    <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3 md:gap-4">
                        <div className="bg-gray-900 rounded-lg p-3 sm:p-4 border border-gray-800">
                            <div className="text-[10px] sm:text-xs text-gray-500 mb-1">Total Tasks</div>
                            <div className="text-xl sm:text-2xl font-bold text-blue-400">{totalTasks}</div>
                        </div>
                        <div className="bg-gray-900 rounded-lg p-3 sm:p-4 border border-gray-800">
                            <div className="text-[10px] sm:text-xs text-gray-500 mb-1">Total Projects</div>
                            <div className="text-xl sm:text-2xl font-bold text-green-400">{totalProjects}</div>
                        </div>
                        <div className="bg-gray-900 rounded-lg p-3 sm:p-4 border border-gray-800">
                            <div className="text-[10px] sm:text-xs text-gray-500 mb-1">Total Keystrokes</div>
                            <div className="text-xl sm:text-2xl font-bold text-yellow-400">
                                {summary.totalKeystrokes.toLocaleString()}
                            </div>
                        </div>
                        <div className="bg-gray-900 rounded-lg p-3 sm:p-4 border border-gray-800">
                            <div className="text-[10px] sm:text-xs text-gray-500 mb-1">Total Mouse Clicks</div>
                            <div className="text-xl sm:text-2xl font-bold text-purple-400">
                                {summary.totalMouseClicks.toLocaleString()}
                            </div>
                        </div>
                    </div>

                    {/* Activity Summary */}
                    <div className="bg-gray-900 rounded-lg p-3 sm:p-4 border border-gray-800">
                        <h3 className="text-sm sm:text-md font-semibold mb-2 sm:mb-3 flex items-center gap-2">
                            <i className="fas fa-clock text-blue-500 text-sm sm:text-base"></i>
                            <span>Activity Summary</span>
                        </h3>
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 sm:gap-4">
                            <div>
                                <div className="text-xs text-gray-500 mb-1">Total Time</div>
                                <div className="text-lg font-bold">{formatTime(summary.totalTime)}</div>
                            </div>
                            <div>
                                <div className="text-xs text-gray-500 mb-1">Avg Productivity Score</div>
                                <div className="text-lg font-bold text-green-400">
                                    {summary.averageProductivityScore}%
                                </div>
                            </div>
                            <div>
                                <div className="text-xs text-gray-500 mb-1">Activity Logs</div>
                                <div className="text-lg font-bold">
                                    {combinedData.activityLogs.length.toLocaleString()}
                                </div>
                            </div>
                            <div>
                                <div className="text-xs text-gray-500 mb-1">Screenshots</div>
                                <div className="text-lg font-bold">
                                    {combinedData.screenshots.length.toLocaleString()}
                                </div>
                            </div>
                            <div>
                                <div className="text-xs text-gray-500 mb-1">Webcam Photos</div>
                                <div className="text-lg font-bold">
                                    {combinedData.webcamPhotos.length.toLocaleString()}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Projects Breakdown */}
                    {Object.keys(projects).length > 0 && (
                        <div className="bg-gray-900 rounded-lg p-3 sm:p-4 border border-gray-800">
                            <h3 className="text-sm sm:text-md font-semibold mb-2 sm:mb-3 flex items-center gap-2">
                                <i className="fas fa-folder text-green-500 text-sm sm:text-base"></i>
                                <span>Projects Breakdown</span>
                            </h3>
                            <div className="space-y-2">
                                {Object.values(projects).map((project) => (
                                    <div
                                        key={project.projectId}
                                        className="bg-gray-800 rounded p-2 sm:p-3 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 sm:gap-0"
                                    >
                                        <div className="flex-1 min-w-0">
                                            <div className="font-semibold text-sm sm:text-base truncate">
                                                {project.projectName || `Project ${project.projectId}`}
                                            </div>
                                            <div className="text-[10px] sm:text-xs text-gray-500">
                                                {project.taskCount} task{project.taskCount !== 1 ? 's' : ''}
                                            </div>
                                        </div>
                                        <div className="text-left sm:text-right flex-shrink-0">
                                            <div className="text-xs sm:text-sm text-gray-400">
                                                {project.totalKeystrokes.toLocaleString()} keystrokes
                                            </div>
                                            <div className="text-xs sm:text-sm text-gray-400">
                                                {project.totalMouseClicks.toLocaleString()} clicks
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Recent Tasks */}
                    {tasks.length > 0 && (
                        <div className="bg-gray-900 rounded-lg p-3 sm:p-4 border border-gray-800">
                            <h3 className="text-sm sm:text-md font-semibold mb-2 sm:mb-3 flex items-center gap-2">
                                <i className="fas fa-tasks text-yellow-500 text-sm sm:text-base"></i>
                                <span>All Tasks ({tasks.length})</span>
                            </h3>
                            <div className="space-y-2 max-h-96 overflow-y-auto custom-scrollbar">
                                {tasks.map((task) => (
                                    <div
                                        key={`${task.projectId}-${task.taskId}`}
                                        className="bg-gray-800 rounded p-2 sm:p-3"
                                    >
                                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-start gap-2 sm:gap-0 mb-2">
                                            <div className="flex-1 min-w-0">
                                                <div className="font-semibold text-xs sm:text-sm truncate">{task.taskName}</div>
                                                <div className="text-[10px] sm:text-xs text-gray-500 truncate">
                                                    {task.projectName} • {task.taskId}
                                                </div>
                                            </div>
                                            <div className="text-left sm:text-right text-[9px] sm:text-xs text-gray-500 flex-shrink-0">
                                                {task.lastUpdated && formatDate(task.lastUpdated)}
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-2 mt-2 text-[10px] sm:text-xs">
                                            <div>
                                                <div className="text-gray-500">Logs</div>
                                                <div className="font-semibold">{task.activityLogCount}</div>
                                            </div>
                                            <div>
                                                <div className="text-gray-500">Screenshots</div>
                                                <div className="font-semibold">{task.screenshotCount}</div>
                                            </div>
                                            <div>
                                                <div className="text-gray-500">Webcam</div>
                                                <div className="font-semibold">{task.webcamPhotoCount}</div>
                                            </div>
                                            <div>
                                                <div className="text-gray-500">Keystrokes</div>
                                                <div className="font-semibold">
                                                    {(task.summary?.totalKeystrokes || 0).toLocaleString()}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Empty State */}
                    {totalTasks === 0 && (
                        <div className="text-center py-8 text-gray-500">
                            <i className="fas fa-inbox text-4xl mb-4"></i>
                            <p>No tracking data available yet.</p>
                            <p className="text-sm mt-2">Start tracking tasks to see insights here.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
