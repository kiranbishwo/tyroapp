/**
 * ActivityTracker Component
 * Demonstrates the activity tracking system
 * Accepts JSON input and displays categorized responses
 */

import React, { useState, useEffect } from 'react';
import { useActivityTracker, ActivityResponse } from '../hooks/useActivityTracker';
import { processActivity, ActivityInput } from '../services/activityProcessor';

interface ActivityTrackerProps {
    onActivityChange?: (response: ActivityResponse) => void;
}

export const ActivityTracker: React.FC<ActivityTrackerProps> = ({ onActivityChange }) => {
    const [jsonInput, setJsonInput] = useState<string>('');
    const [lastResponse, setLastResponse] = useState<ActivityResponse | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [autoTracking, setAutoTracking] = useState(true);

    // Use the activity tracker hook
    const {
        currentActivity,
        processActivityInput,
        getActivitySummaries,
        getTimeUsageSummary
    } = useActivityTracker({
        enabled: autoTracking,
        interval: 2000,
        onActivityChange: (response) => {
            setLastResponse(response);
            if (onActivityChange) {
                onActivityChange(response);
            }
        }
    });

    // Process JSON input manually
    const handleProcessJson = async () => {
        try {
            setError(null);
            const input: ActivityInput = JSON.parse(jsonInput);
            
            // Validate input
            if (!input.title || !input.app) {
                throw new Error('Input must have "title" and "app" fields');
            }

            const response = await processActivityInput(input);
            setLastResponse(response);
            
            if (onActivityChange) {
                onActivityChange(response);
            }
        } catch (err: any) {
            setError(err.message || 'Invalid JSON input');
        }
    };

    // Example JSON input
    const loadExample = () => {
        const example = {
            title: "YouTube - Chrome",
            app: "Google Chrome",
            url: "https://youtube.com",
            timestamp: Math.floor(Date.now() / 1000)
        };
        setJsonInput(JSON.stringify(example, null, 2));
    };

    const summaries = getActivitySummaries();
    const timeUsage = getTimeUsageSummary();

    return (
        <div className="p-4 space-y-4">
            <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
                <h3 className="text-white font-bold mb-3">Activity Tracker</h3>
                
                {/* Auto-tracking toggle */}
                <div className="mb-4 flex items-center justify-between">
                    <label className="text-gray-300 text-sm">Auto-tracking</label>
                    <button
                        onClick={() => setAutoTracking(!autoTracking)}
                        className={`px-3 py-1 rounded text-xs font-bold transition-colors ${
                            autoTracking
                                ? 'bg-green-600 text-white'
                                : 'bg-gray-700 text-gray-300'
                        }`}
                    >
                        {autoTracking ? 'ON' : 'OFF'}
                    </button>
                </div>

                {/* Current Activity Display */}
                {currentActivity && (
                    <div className="mb-4 p-3 bg-gray-900 rounded border-l-4 border-blue-500">
                        <div className="text-xs text-gray-400 mb-1">Current Activity</div>
                        <div className="text-white font-semibold">{currentActivity.description}</div>
                        <div className="text-xs text-gray-500 mt-1">
                            <span className="px-2 py-0.5 bg-gray-800 rounded">{currentActivity.category}</span>
                        </div>
                        <div className="text-xs text-gray-400 mt-2">{currentActivity.suggestion}</div>
                    </div>
                )}

                {/* JSON Input Section */}
                <div className="mb-4">
                    <div className="flex items-center justify-between mb-2">
                        <label className="text-gray-300 text-sm">JSON Input</label>
                        <button
                            onClick={loadExample}
                            className="text-xs text-blue-400 hover:text-blue-300"
                        >
                            Load Example
                        </button>
                    </div>
                    <textarea
                        value={jsonInput}
                        onChange={(e) => setJsonInput(e.target.value)}
                        placeholder='{"title": "YouTube - Chrome", "app": "Google Chrome", "url": "https://youtube.com", "timestamp": 1732989234}'
                        className="w-full bg-gray-900 text-white text-xs p-2 rounded border border-gray-700 focus:border-blue-500 focus:outline-none font-mono"
                        rows={4}
                    />
                    {error && (
                        <div className="text-red-400 text-xs mt-1">{error}</div>
                    )}
                    <button
                        onClick={handleProcessJson}
                        disabled={!jsonInput.trim()}
                        className="mt-2 w-full bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white text-xs font-bold py-2 rounded transition-colors"
                    >
                        Process JSON
                    </button>
                </div>

                {/* Response Display */}
                {lastResponse && (
                    <div className="mb-4 p-3 bg-gray-900 rounded border border-gray-700">
                        <div className="text-xs text-gray-400 mb-2">Response</div>
                        <pre className="text-xs text-green-400 font-mono overflow-x-auto">
                            {JSON.stringify(lastResponse, null, 2)}
                        </pre>
                    </div>
                )}

                {/* Time Usage Summary */}
                {summaries.length > 0 && (
                    <div className="mb-4 p-3 bg-gray-900 rounded border border-gray-700">
                        <div className="text-xs text-gray-400 mb-2">Time Summary</div>
                        <div className="space-y-1">
                            {summaries.map((summary, idx) => (
                                <div key={idx} className="text-xs text-gray-300">{summary}</div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Top Apps */}
                {timeUsage.byApp.length > 0 && (
                    <div className="p-3 bg-gray-900 rounded border border-gray-700">
                        <div className="text-xs text-gray-400 mb-2">Top Apps</div>
                        <div className="space-y-1">
                            {timeUsage.byApp.slice(0, 5).map((app, idx) => (
                                <div key={idx} className="flex justify-between text-xs">
                                    <span className="text-gray-300">{app.app}</span>
                                    <span className="text-gray-500">{app.time} ({app.percentage}%)</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
