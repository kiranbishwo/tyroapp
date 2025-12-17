import React, { useState, useEffect } from 'react';
import { Settings as SettingsType, ActivityLog, TimeEntry } from '../types';
import { apiService } from '../services/apiService';
import packageJson from '../package.json';

interface SettingsProps {
    activityLogs: ActivityLog[];
    timeEntries: TimeEntry[];
    onClose: () => void;
    onDataDeleted: () => void;
    onNavigateToCalculationDetails?: () => void;
}

// Electron API types are defined in types/electron.d.ts

export const Settings: React.FC<SettingsProps> = ({ activityLogs, timeEntries, onClose, onDataDeleted, onNavigateToCalculationDetails }) => {
    const [settings, setSettings] = useState<SettingsType>({
        enableScreenshots: true,
        enableUrlTracking: true,
        enableScreenshotBlur: false,
        idleTimeThreshold: 5,
        screenshotCaptureInterval: 2, // Default 2 minutes
        cameraPhotoInterval: 2, // Default 2 minutes
        autoSyncInterval: 2 // Default 2 minutes
    });
    const [loading, setLoading] = useState(true);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [exportStatus, setExportStatus] = useState<string>('');
    const [apiStatus, setApiStatus] = useState<string>('');
    const [testingConnection, setTestingConnection] = useState(false);
    const [oauthStatus, setOauthStatus] = useState<{ authenticated: boolean; user?: any } | null>(null);
    const [authenticating, setAuthenticating] = useState(false);
    const [deviceCode, setDeviceCode] = useState<{ user_code: string; verification_url: string; browser_opened: boolean } | null>(null);

    useEffect(() => {
        const loadSettings = async () => {
            if (window.electronAPI) {
                try {
                    const savedSettings = await window.electronAPI.getSettings();
                    
                    // Check for environment variables first
                    const envApiBaseUrl = import.meta.env.VITE_API_BASE_URL;
                    const envApiKey = import.meta.env.VITE_API_KEY;
                    const envApiEnabled = import.meta.env.VITE_API_ENABLED === 'true';
                    
                    // Merge settings: env vars take precedence, then saved settings, then defaults
                    const mergedSettings: SettingsType = {
                        enableScreenshots: savedSettings?.enableScreenshots ?? true,
                        enableUrlTracking: savedSettings?.enableUrlTracking ?? true,
                        enableScreenshotBlur: savedSettings?.enableScreenshotBlur ?? false,
                        idleTimeThreshold: savedSettings?.idleTimeThreshold ?? 5,
                        screenshotCaptureInterval: savedSettings?.screenshotCaptureInterval ?? 2,
                        cameraPhotoInterval: savedSettings?.cameraPhotoInterval ?? 2,
                        autoSyncInterval: savedSettings?.autoSyncInterval ?? 2,
                        // Use env vars if available, otherwise use saved settings
                        apiBaseUrl: envApiBaseUrl || savedSettings?.apiBaseUrl || '',
                        apiKey: envApiKey || savedSettings?.apiKey || '',
                        apiEnabled: envApiEnabled !== undefined ? envApiEnabled : (savedSettings?.apiEnabled || false),
                    };
                    
                    setSettings(mergedSettings);
                    
                    // If we have env vars but settings weren't saved, save them
                    if (envApiBaseUrl && (!savedSettings?.apiBaseUrl || savedSettings.apiBaseUrl !== envApiBaseUrl)) {
                        await window.electronAPI.setSettings(mergedSettings);
                    }
                    
                    // Check OAuth status
                    const oauthStatus = await window.electronAPI.oauthCheckStatus();
                    setOauthStatus(oauthStatus);
                } catch (error) {
                    console.error('Error loading settings:', error);
                }
            }
            setLoading(false);
        };
        loadSettings();
        
        // Cleanup: Remove OAuth listeners on unmount
        return () => {
            if (window.electronAPI?.removeOAuthListeners) {
                window.electronAPI.removeOAuthListeners();
            }
        };
    }, []);

    const handleSettingChange = async (key: keyof SettingsType, value: boolean | number | string) => {
        const newSettings = { ...settings, [key]: value };
        setSettings(newSettings);
        
        // Update API service config if API settings changed
        if (key === 'apiBaseUrl' || key === 'apiKey' || key === 'apiEnabled') {
            apiService.updateConfig({
                baseUrl: newSettings.apiBaseUrl || '',
                apiKey: newSettings.apiKey || '',
                enabled: newSettings.apiEnabled || false,
            });
        }
        
        if (window.electronAPI) {
            try {
                await window.electronAPI.setSettings(newSettings);
            } catch (error) {
                console.error('Error saving settings:', error);
            }
        }
    };

    const handleTestConnection = async () => {
        if (!settings.apiBaseUrl) {
            setApiStatus('Please enter API base URL');
            return;
        }

        setTestingConnection(true);
        setApiStatus('Testing connection...');
        
        try {
            apiService.updateConfig({
                baseUrl: settings.apiBaseUrl || '',
                apiKey: settings.apiKey || '',
                enabled: true,
            });
            
            const result = await apiService.healthCheck();
            if (result.success) {
                setApiStatus('✓ Connection successful!');
            } else {
                setApiStatus(`✗ Connection failed: ${result.error}`);
            }
        } catch (error: any) {
            setApiStatus(`✗ Connection failed: ${error.message}`);
        } finally {
            setTestingConnection(false);
            setTimeout(() => setApiStatus(''), 5000);
        }
    };

    const handleOAuthAuthenticate = async () => {
        if (!window.electronAPI) {
            return;
        }

        if (!settings.apiBaseUrl) {
            setApiStatus('Please enter API base URL first');
            setTimeout(() => setApiStatus(''), 5000);
            return;
        }

        setAuthenticating(true);
        setDeviceCode(null);
        setApiStatus('Starting OAuth authentication...');
        
        // Set up event listeners
        if (window.electronAPI.onOAuthDeviceCode) {
            window.electronAPI.onOAuthDeviceCode((data) => {
                setDeviceCode(data);
                if (data.browser_opened) {
                    setApiStatus(`Browser opened! Enter code: ${data.user_code}`);
                } else {
                    setApiStatus(`Please open this URL: ${data.verification_url}\nEnter code: ${data.user_code}`);
                }
            });
        }
        
        if (window.electronAPI.onOAuthSuccess) {
            window.electronAPI.onOAuthSuccess(async (data) => {
                setApiStatus(`✓ ${data.message || 'Authentication successful!'}`);
                setAuthenticating(false);
                setDeviceCode(null);
                
                // Refresh OAuth status
                const oauthStatus = await window.electronAPI.oauthCheckStatus();
                setOauthStatus(oauthStatus);
                
                // Clean up listeners
                if (window.electronAPI.removeOAuthListeners) {
                    window.electronAPI.removeOAuthListeners();
                }
            });
        }
        
        try {
            const result = await window.electronAPI.oauthAuthenticate();
            
            // If authentication completed immediately (shouldn't happen with Device Flow)
            if (result.success) {
                setApiStatus(`✓ ${result.message || 'Authentication successful!'}`);
                setAuthenticating(false);
                setDeviceCode(null);
                
                // Refresh OAuth status
                const oauthStatus = await window.electronAPI.oauthCheckStatus();
                setOauthStatus(oauthStatus);
            } else if (result.error && !deviceCode) {
                // Only show error if we didn't get device code
                setApiStatus(`✗ Authentication failed: ${result.error}`);
                setAuthenticating(false);
            }
            // If we have device code, keep authenticating state and wait for success event
        } catch (error: any) {
            setApiStatus(`✗ Authentication failed: ${error.message}`);
            setAuthenticating(false);
            setDeviceCode(null);
            
            // Clean up listeners
            if (window.electronAPI.removeOAuthListeners) {
                window.electronAPI.removeOAuthListeners();
            }
        }
    };

    const handleOAuthLogout = async () => {
        if (!window.electronAPI) {
            return;
        }

        try {
            const result = await window.electronAPI.oauthLogout();
            
            if (result.success) {
                setOauthStatus({ authenticated: false });
                setApiStatus('✓ Logged out successfully');
            } else {
                setApiStatus(`✗ Logout failed: ${result.error}`);
            }
        } catch (error: any) {
            setApiStatus(`✗ Logout failed: ${error.message}`);
        } finally {
            setTimeout(() => setApiStatus(''), 5000);
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
            <div className="w-full max-w-6xl bg-gray-900 shadow-2xl flex flex-col overflow-hidden border-x border-gray-800 mx-auto h-screen">
                {/* Header */}
                <header className="bg-gray-800 p-3 sm:p-4 flex items-center justify-between shadow-md">
                    <h2 className="text-lg sm:text-xl font-bold text-white">Settings</h2>
                    <button
                        onClick={onClose}
                        className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-gray-700 hover:bg-gray-600 text-white flex items-center justify-center transition-colors"
                    >
                        <i className="fas fa-times text-xs sm:text-sm"></i>
                    </button>
                </header>

                {/* Content */}
                <main className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-6 custom-scrollbar space-y-4 sm:space-y-6">
                    {/* Help & Documentation */}
                    <section>
                        <h3 className="text-white font-semibold text-sm mb-3">Help & Documentation</h3>
                        <div className="space-y-3">
                            {onNavigateToCalculationDetails && (
                                <button
                                    onClick={onNavigateToCalculationDetails}
                                    className="w-full bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white font-semibold py-3 rounded-lg transition-colors flex items-center justify-center gap-2"
                                >
                                    <i className="fas fa-info-circle"></i>
                                    View Metrics Explanation
                                </button>
                            )}
                        </div>
                    </section>

                    {/* Tracking Settings */}
                    <section className="bg-gray-800 rounded-lg p-4">
                        <h3 className="text-white font-semibold text-sm mb-4">Tracking Settings</h3>
                        <div className="space-y-4">
                            {/* Enable Screenshots */}
                            <div className="flex items-center justify-between">
                                <div className="flex-1">
                                    <label className="text-xs text-gray-300 font-medium">
                                        Enable Screenshots
                                    </label>
                                    <p className="text-xs text-gray-400 mt-1">
                                        Capture screenshots periodically for activity tracking
                                    </p>
                                </div>
                                <label className="relative inline-flex items-center cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={settings.enableScreenshots}
                                        onChange={(e) => handleSettingChange('enableScreenshots', e.target.checked)}
                                        className="sr-only peer"
                                    />
                                    <div className="w-11 h-6 bg-gray-600 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                                </label>
                            </div>

                            {/* Enable URL Tracking */}
                            <div className="flex items-center justify-between">
                                <div className="flex-1">
                                    <label className="text-xs text-gray-300 font-medium">
                                        Enable URL Tracking
                                    </label>
                                    <p className="text-xs text-gray-400 mt-1">
                                        Track website URLs when browsing
                                    </p>
                                </div>
                                <label className="relative inline-flex items-center cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={settings.enableUrlTracking}
                                        onChange={(e) => handleSettingChange('enableUrlTracking', e.target.checked)}
                                        className="sr-only peer"
                                    />
                                    <div className="w-11 h-6 bg-gray-600 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                                </label>
                            </div>

                            {/* Enable Screenshot Blur */}
                            <div className="flex items-center justify-between">
                                <div className="flex-1">
                                    <label className="text-xs text-gray-300 font-medium">
                                        Blur Screenshots
                                    </label>
                                    <p className="text-xs text-gray-400 mt-1">
                                        Apply blur effect to screenshots for privacy
                                    </p>
                                </div>
                                <label className="relative inline-flex items-center cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={settings.enableScreenshotBlur}
                                        onChange={(e) => handleSettingChange('enableScreenshotBlur', e.target.checked)}
                                        className="sr-only peer"
                                    />
                                    <div className="w-11 h-6 bg-gray-600 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                                </label>
                            </div>

                            {/* Idle Time Threshold */}
                            <div>
                                <label className="block text-xs text-gray-300 mb-2 font-medium">
                                    Idle Time Threshold (minutes)
                                </label>
                                <input
                                    type="number"
                                    min="1"
                                    max="60"
                                    value={settings.idleTimeThreshold || 5}
                                    onChange={(e) => handleSettingChange('idleTimeThreshold', parseInt(e.target.value) || 5)}
                                    className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none"
                                />
                                <p className="text-xs text-gray-400 mt-1">
                                    Time without activity before being marked as idle (default: 5 minutes)
                                </p>
                            </div>
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
                                <span>We do NOT collect: keystroke content, passwords, files, microphone, or webcam recordings. Photos can be taken randomly (like screenshots) for verification purposes.</span>
                            </div>
                        </div>
                        <p className="text-xs text-gray-400 mt-3">
                            <i className="fas fa-info-circle mr-1"></i>
                            All data is stored locally on your device. No data is sent to external servers.
                        </p>
                    </section>

                    {/* Capture & Sync Settings */}
                    <section className="bg-gray-800 rounded-lg p-4">
                        <h3 className="text-white font-semibold text-sm mb-4">Capture & Sync Intervals</h3>
                        <div className="space-y-4">
                            {/* Screenshot Capture Interval */}
                            <div>
                                <label className="block text-xs text-gray-300 mb-2">
                                    Screenshot Capture Interval (minutes)
                                </label>
                                <input
                                    type="number"
                                    min="1"
                                    max="60"
                                    value={settings.screenshotCaptureInterval || 2}
                                    onChange={(e) => handleSettingChange('screenshotCaptureInterval', parseInt(e.target.value) || 2)}
                                    className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none"
                                />
                                <p className="text-xs text-gray-400 mt-1">
                                    How often screenshots are captured (default: 2 minutes)
                                </p>
                            </div>

                            {/* Camera Photo Interval */}
                            <div>
                                <label className="block text-xs text-gray-300 mb-2">
                                    Camera Photo Interval (minutes)
                                </label>
                                <input
                                    type="number"
                                    min="1"
                                    max="60"
                                    value={settings.cameraPhotoInterval || 2}
                                    onChange={(e) => handleSettingChange('cameraPhotoInterval', parseInt(e.target.value) || 2)}
                                    className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none"
                                />
                                <p className="text-xs text-gray-400 mt-1">
                                    How often camera photos are captured (default: 2 minutes)
                                </p>
                            </div>

                            {/* Auto Sync Interval */}
                            <div>
                                <label className="block text-xs text-gray-300 mb-2">
                                    Auto Sync Interval (minutes)
                                </label>
                                <input
                                    type="number"
                                    min="1"
                                    max="60"
                                    value={settings.autoSyncInterval || 2}
                                    onChange={(e) => handleSettingChange('autoSyncInterval', parseInt(e.target.value) || 2)}
                                    className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none"
                                />
                                <p className="text-xs text-gray-400 mt-1">
                                    How often data is automatically synced to server (default: 2 minutes)
                                </p>
                            </div>
                        </div>
                    </section>

                    {/* App Version */}
                    <section className="mt-6 pt-6 border-t border-gray-700">
                        <div className="text-center">
                            <p className="text-gray-400 text-xs">
                                App Version: <span className="text-white font-mono font-semibold">{packageJson.version}</span>
                            </p>
                        </div>
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
