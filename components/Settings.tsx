import React, { useState, useEffect } from 'react';
import { Settings as SettingsType, ActivityLog, TimeEntry } from '../types';

interface SettingsProps {
    activityLogs: ActivityLog[];
    timeEntries: TimeEntry[];
    onClose: () => void;
    onDataDeleted: () => void;
}

// Extend Window interface for Electron API
declare global {
    interface Window {
        electronAPI?: {
            getSettings: () => Promise<SettingsType>;
            setSettings: (settings: SettingsType) => Promise<boolean>;
            exportData: (data: any) => Promise<{ success: boolean; path?: string; canceled?: boolean; error?: string }>;
            deleteAllData: () => Promise<boolean>;
            revokeConsent: () => Promise<boolean>;
            getUserConsent: () => Promise<{ consent: boolean | null; remembered: boolean }>;
        };
    }
}

export const Settings: React.FC<SettingsProps> = ({ activityLogs, timeEntries, onClose, onDataDeleted }) => {
    const [settings, setSettings] = useState<SettingsType>({
        enableScreenshots: true,
        enableUrlTracking: true,
        enableScreenshotBlur: false,
        idleTimeThreshold: 5
    });
    const [loading, setLoading] = useState(true);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [exportStatus, setExportStatus] = useState<string>('');

    useEffect(() => {
        const loadSettings = async () => {
            if (window.electronAPI) {
                try {
                    const savedSettings = await window.electronAPI.getSettings();
                    if (savedSettings) {
                        setSettings(savedSettings);
                    }
                } catch (error) {
                    console.error('Error loading settings:', error);
                }
            }
            setLoading(false);
        };
        loadSettings();
    }, []);

    const handleSettingChange = async (key: keyof SettingsType, value: boolean | number) => {
        const newSettings = { ...settings, [key]: value };
        setSettings(newSettings);
        
        if (window.electronAPI) {
            try {
                await window.electronAPI.setSettings(newSettings);
            } catch (error) {
                console.error('Error saving settings:', error);
            }
        }
    };

    const handleExportData = async () => {
        if (!window.electronAPI) {
            setExportStatus('Export not available');
            return;
        }

        setExportStatus('Exporting...');
        try {
            const exportData = {
                exportDate: new Date().toISOString(),
                activityLogs: activityLogs.map(log => ({
                    ...log,
                    timestamp: log.timestamp.toISOString()
                })),
                timeEntries: timeEntries.map(entry => ({
                    ...entry,
                    startTime: entry.startTime.toISOString(),
                    endTime: entry.endTime?.toISOString()
                })),
                settings: settings
            };

            const result = await window.electronAPI.exportData(exportData);
            if (result.success) {
                setExportStatus(`Exported to: ${result.path}`);
                setTimeout(() => setExportStatus(''), 3000);
            } else if (result.canceled) {
                setExportStatus('Export canceled');
                setTimeout(() => setExportStatus(''), 2000);
            } else {
                setExportStatus(`Export failed: ${result.error || 'Unknown error'}`);
                setTimeout(() => setExportStatus(''), 3000);
            }
        } catch (error) {
            console.error('Export error:', error);
            setExportStatus('Export failed');
            setTimeout(() => setExportStatus(''), 3000);
        }
    };

    const handleDeleteData = async () => {
        if (!window.electronAPI) return;

        try {
            await window.electronAPI.deleteAllData();
            setShowDeleteConfirm(false);
            onDataDeleted();
            alert('All data has been deleted. The app will refresh.');
            window.location.reload();
        } catch (error) {
            console.error('Delete error:', error);
            alert('Error deleting data');
        }
    };

    const handleRevokeConsent = async () => {
        if (!window.electronAPI) return;

        const confirmed = window.confirm(
            'Are you sure you want to revoke consent? This will stop all tracking and you will need to consent again to use the app.'
        );

        if (confirmed) {
            try {
                await window.electronAPI.revokeConsent();
                alert('Consent revoked. The app will refresh.');
                window.location.reload();
            } catch (error) {
                console.error('Revoke consent error:', error);
                alert('Error revoking consent');
            }
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-950 flex items-center justify-center">
                <div className="text-white">Loading settings...</div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-950 flex flex-col font-sans">
            <div className="w-full max-w-[400px] bg-gray-900 shadow-2xl flex flex-col overflow-hidden border-x border-gray-800 mx-auto h-screen">
                {/* Header */}
                <header className="bg-gray-800 p-4 flex items-center justify-between shadow-md">
                    <h2 className="text-xl font-bold text-white">Settings</h2>
                    <button
                        onClick={onClose}
                        className="w-8 h-8 rounded-full bg-gray-700 hover:bg-gray-600 text-white flex items-center justify-center transition-colors"
                    >
                        <i className="fas fa-times text-sm"></i>
                    </button>
                </header>

                {/* Content */}
                <main className="flex-1 overflow-y-auto p-4 custom-scrollbar space-y-6">
                    {/* Tracking Settings */}
                    <section>
                        <h3 className="text-white font-semibold text-sm mb-3">Tracking Settings</h3>
                        <div className="space-y-3">
                            {/* Enable Screenshots */}
                            <div className="bg-gray-800 rounded-lg p-3 flex items-center justify-between">
                                <div className="flex-1">
                                    <label className="text-white text-sm font-medium">Enable Screenshots</label>
                                    <p className="text-gray-400 text-xs mt-1">Capture screenshots during activity tracking</p>
                                </div>
                                <label className="relative inline-flex items-center cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={settings.enableScreenshots}
                                        onChange={(e) => handleSettingChange('enableScreenshots', e.target.checked)}
                                        className="sr-only peer"
                                    />
                                    <div className="w-11 h-6 bg-gray-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                                </label>
                            </div>

                            {/* Enable URL Tracking */}
                            <div className="bg-gray-800 rounded-lg p-3 flex items-center justify-between">
                                <div className="flex-1">
                                    <label className="text-white text-sm font-medium">Enable URL Tracking</label>
                                    <p className="text-gray-400 text-xs mt-1">Track website URLs when browsing</p>
                                </div>
                                <label className="relative inline-flex items-center cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={settings.enableUrlTracking}
                                        onChange={(e) => handleSettingChange('enableUrlTracking', e.target.checked)}
                                        className="sr-only peer"
                                    />
                                    <div className="w-11 h-6 bg-gray-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                                </label>
                            </div>

                            {/* Enable Screenshot Blur */}
                            <div className="bg-gray-800 rounded-lg p-3 flex items-center justify-between">
                                <div className="flex-1">
                                    <label className="text-white text-sm font-medium">Blur Screenshots</label>
                                    <p className="text-gray-400 text-xs mt-1">Apply blur to screenshots for privacy</p>
                                </div>
                                <label className="relative inline-flex items-center cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={settings.enableScreenshotBlur}
                                        onChange={(e) => handleSettingChange('enableScreenshotBlur', e.target.checked)}
                                        className="sr-only peer"
                                    />
                                    <div className="w-11 h-6 bg-gray-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                                </label>
                            </div>

                            {/* Idle Time Threshold */}
                            <div className="bg-gray-800 rounded-lg p-3">
                                <div className="flex items-center justify-between mb-2">
                                    <label className="text-white text-sm font-medium">Idle Time Threshold</label>
                                    <span className="text-blue-400 text-sm font-mono">{settings.idleTimeThreshold} min</span>
                                </div>
                                <p className="text-gray-400 text-xs mb-3">Mark time as idle after no activity</p>
                                <input
                                    type="range"
                                    min="1"
                                    max="15"
                                    value={settings.idleTimeThreshold}
                                    onChange={(e) => handleSettingChange('idleTimeThreshold', parseInt(e.target.value))}
                                    className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-600"
                                />
                                <div className="flex justify-between text-xs text-gray-500 mt-1">
                                    <span>1 min</span>
                                    <span>15 min</span>
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* Data Management */}
                    <section>
                        <h3 className="text-white font-semibold text-sm mb-3">Data Management</h3>
                        <div className="space-y-3">
                            {/* Export Data */}
                            <button
                                onClick={handleExportData}
                                className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold py-3 rounded-lg transition-colors flex items-center justify-center gap-2"
                            >
                                <i className="fas fa-download"></i>
                                Export All Data
                            </button>
                            {exportStatus && (
                                <p className={`text-xs text-center ${exportStatus.includes('failed') || exportStatus.includes('canceled') ? 'text-red-400' : 'text-green-400'}`}>
                                    {exportStatus}
                                </p>
                            )}

                            {/* Delete Data */}
                            <button
                                onClick={() => setShowDeleteConfirm(true)}
                                className="w-full bg-red-600 hover:bg-red-500 text-white font-semibold py-3 rounded-lg transition-colors flex items-center justify-center gap-2"
                            >
                                <i className="fas fa-trash"></i>
                                Delete All Data
                            </button>
                        </div>
                    </section>

                    {/* Privacy & Consent */}
                    <section>
                        <h3 className="text-white font-semibold text-sm mb-3">Privacy & Consent</h3>
                        <div className="space-y-3">
                            <button
                                onClick={handleRevokeConsent}
                                className="w-full bg-yellow-600 hover:bg-yellow-500 text-white font-semibold py-3 rounded-lg transition-colors flex items-center justify-center gap-2"
                            >
                                <i className="fas fa-ban"></i>
                                Revoke Consent
                            </button>
                        </div>
                    </section>

                    {/* What We Collect */}
                    <section className="bg-gray-800 rounded-lg p-4">
                        <h3 className="text-white font-semibold text-sm mb-3">What We Collect</h3>
                        <div className="space-y-2 text-xs text-gray-300">
                            <div className="flex items-start gap-2">
                                <i className="fas fa-check-circle text-green-400 mt-0.5"></i>
                                <span>Active applications and window titles</span>
                            </div>
                            <div className="flex items-start gap-2">
                                <i className="fas fa-check-circle text-green-400 mt-0.5"></i>
                                <span>Mouse click and keyboard event counts (not content)</span>
                            </div>
                            <div className="flex items-start gap-2">
                                <i className="fas fa-check-circle text-green-400 mt-0.5"></i>
                                <span>Website URLs (when available)</span>
                            </div>
                            <div className="flex items-start gap-2">
                                <i className="fas fa-check-circle text-green-400 mt-0.5"></i>
                                <span>Screenshots (optional, can be disabled)</span>
                            </div>
                            <div className="flex items-start gap-2 mt-3">
                                <i className="fas fa-times-circle text-red-400 mt-0.5"></i>
                                <span>We do NOT collect: keystroke content, passwords, files, microphone, or webcam (except for check-in/out)</span>
                            </div>
                        </div>
                        <p className="text-xs text-gray-400 mt-3">
                            <i className="fas fa-info-circle mr-1"></i>
                            All data is stored locally on your device. No data is sent to external servers.
                        </p>
                    </section>
                </main>
            </div>

            {/* Delete Confirmation Dialog */}
            {showDeleteConfirm && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-gray-900 rounded-2xl shadow-2xl border border-gray-800 max-w-md w-full p-6">
                        <h3 className="text-xl font-bold text-white mb-2">Delete All Data?</h3>
                        <p className="text-gray-400 text-sm mb-6">
                            This will permanently delete all activity logs, time entries, and settings. This action cannot be undone.
                        </p>
                        <div className="flex gap-3">
                            <button
                                onClick={() => setShowDeleteConfirm(false)}
                                className="flex-1 py-3 px-4 bg-gray-800 hover:bg-gray-700 text-white rounded-lg font-semibold transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleDeleteData}
                                className="flex-1 py-3 px-4 bg-red-600 hover:bg-red-500 text-white rounded-lg font-semibold transition-colors"
                            >
                                Delete All
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
