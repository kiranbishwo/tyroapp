import React, { useMemo } from 'react';
import { ActivityLog, Project, AppUsage } from '../types';

interface InsightsDashboardProps {
    logs: ActivityLog[];
    projects: Project[];
    onClose: () => void;
}

export const InsightsDashboard: React.FC<InsightsDashboardProps> = ({ logs, projects, onClose }) => {
    
    // Calculate aggregate stats
    const stats = useMemo(() => {
        if (logs.length === 0) return { avgProd: 0, totalKeys: 0, totalClicks: 0 };
        const totalProd = logs.reduce((acc, log) => acc + log.productivityScore, 0);
        const totalKeys = logs.reduce((acc, log) => acc + log.keyboardEvents, 0);
        const totalClicks = logs.reduce((acc, log) => acc + log.mouseEvents, 0);
        return {
            avgProd: Math.round(totalProd / logs.length),
            totalKeys,
            totalClicks
        };
    }, [logs]);

    // Calculate App Usage Mock Stats
    const appUsage: AppUsage[] = useMemo(() => {
        const counts: Record<string, number> = {};
        logs.forEach(log => {
            counts[log.activeWindow] = (counts[log.activeWindow] || 0) + 1;
        });
        const total = logs.length || 1;
        return Object.entries(counts).map(([name, count]) => ({
            appName: name,
            percentage: Math.round((count / total) * 100),
            icon: 'fa-window-maximize', // generic
            color: '#60A5FA'
        })).sort((a, b) => b.percentage - a.percentage);
    }, [logs]);

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
                    <h3 className="text-xs font-bold text-gray-400 uppercase mb-3">Evidence Log</h3>
                    <div className="grid grid-cols-2 gap-3">
                        {logs.filter(l => l.screenshotUrl || l.webcamUrl).map((log) => (
                            <div key={log.id} className="bg-gray-800 rounded-lg overflow-hidden border border-gray-700 group relative">
                                <div className="aspect-video relative bg-black">
                                    {log.screenshotUrl && (
                                        <img src={log.screenshotUrl} alt="Screen" className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" />
                                    )}
                                    {/* Picture in Picture WebCam */}
                                    {log.webcamUrl && (
                                        <div className="absolute bottom-1 right-1 w-1/3 aspect-square rounded-full border border-white/50 overflow-hidden shadow-lg bg-gray-900">
                                            <img src={log.webcamUrl} alt="Cam" className="w-full h-full object-cover" />
                                        </div>
                                    )}
                                </div>
                                <div className="p-2 flex justify-between items-center bg-gray-850">
                                    <span className="text-[10px] text-gray-400">{log.timestamp.toLocaleTimeString()}</span>
                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-700 text-gray-300">{log.activeWindow}</span>
                                </div>
                            </div>
                        ))}
                         {logs.filter(l => l.screenshotUrl || l.webcamUrl).length === 0 && (
                            <div className="col-span-2 text-center py-6 text-gray-600 text-xs">
                                No screenshots captured. Ensure monitoring is active.
                            </div>
                         )}
                    </div>
                </div>

                {/* App Usage List */}
                <div>
                    <h3 className="text-xs font-bold text-gray-400 uppercase mb-3">Top Applications</h3>
                    <div className="space-y-2">
                        {appUsage.map((app, idx) => (
                            <div key={idx} className="flex items-center justify-between text-sm bg-gray-800/50 p-2 rounded border border-gray-800">
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded bg-gray-700 flex items-center justify-center text-gray-400">
                                        <i className={`fas ${app.appName.includes('Code') ? 'fa-code' : app.appName.includes('Chrome') ? 'fa-globe' : 'fa-desktop'}`}></i>
                                    </div>
                                    <span className="font-medium text-gray-300">{app.appName}</span>
                                </div>
                                <div className="flex items-center gap-3">
                                    <div className="w-24 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                                        <div className="h-full bg-blue-500" style={{ width: `${app.percentage}%` }}></div>
                                    </div>
                                    <span className="text-xs font-mono w-8 text-right text-gray-400">{app.percentage}%</span>
                                </div>
                            </div>
                        ))}
                        {appUsage.length === 0 && <div className="text-xs text-gray-600 italic">No app usage data.</div>}
                    </div>
                </div>
            </div>
        </div>
    );
};