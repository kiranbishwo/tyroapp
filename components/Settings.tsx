import React, { useState, useEffect } from 'react';
import { Settings as SettingsType, ActivityLog, TimeEntry } from '../types';
import { apiService } from '../services/apiService';

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
        idleTimeThreshold: 5
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
                        ...savedSettings,
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
                    {/* Tracking Settings */}
                    <section>
                        <h3 className="text-white font-semibold text-xs sm:text-sm mb-2 sm:mb-3">Tracking Settings</h3>
                        <div className="space-y-2 sm:space-y-3">
                            {/* Enable Screenshots */}
                            <div className="bg-gray-800 rounded-lg p-2.5 sm:p-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-0">
                                <div className="flex-1 min-w-0">
                                    <label className="text-white text-xs sm:text-sm font-medium">Enable Screenshots</label>
                                    <p className="text-gray-400 text-[10px] sm:text-xs mt-1">Capture screenshots during activity tracking</p>
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
                            <div className="bg-gray-800 rounded-lg p-2.5 sm:p-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-0">
                                <div className="flex-1 min-w-0">
                                    <label className="text-white text-xs sm:text-sm font-medium">Enable URL Tracking</label>
                                    <p className="text-gray-400 text-[10px] sm:text-xs mt-1">Track website URLs when browsing</p>
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
                            <div className="bg-gray-800 rounded-lg p-2.5 sm:p-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-0">
                                <div className="flex-1 min-w-0">
                                    <label className="text-white text-xs sm:text-sm font-medium">Blur Screenshots</label>
                                    <p className="text-gray-400 text-[10px] sm:text-xs mt-1">Apply blur to screenshots for privacy</p>
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

                    {/* API Configuration */}
                    <section>
                        <h3 className="text-white font-semibold text-xs sm:text-sm mb-2 sm:mb-3">API Integration</h3>
                        <div className="space-y-2 sm:space-y-3">
                            {/* Enable API */}
                            <div className="bg-gray-800 rounded-lg p-2.5 sm:p-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-0">
                                <div className="flex-1 min-w-0">
                                    <label className="text-white text-xs sm:text-sm font-medium">Enable API Sync</label>
                                    <p className="text-gray-400 text-[10px] sm:text-xs mt-1">Sync data with remote API server</p>
                                </div>
                                <label className="relative inline-flex items-center cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={settings.apiEnabled || false}
                                        onChange={(e) => handleSettingChange('apiEnabled', e.target.checked)}
                                        className="sr-only peer"
                                    />
                                    <div className="w-11 h-6 bg-gray-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                                </label>
                            </div>

                            {/* API Base URL */}
                            {settings.apiEnabled && (
                                <>
                                    <div className="bg-gray-800 rounded-lg p-3">
                                        <div className="flex items-center justify-between mb-2">
                                            <label className="text-white text-xs sm:text-sm font-medium block">API Base URL</label>
                                            {import.meta.env.VITE_API_BASE_URL && (
                                                <span className="text-xs text-green-400 flex items-center gap-1">
                                                    <i className="fas fa-check-circle"></i>
                                                    From .env.local
                                                </span>
                                            )}
                                        </div>
                                        <input
                                            type="text"
                                            value={settings.apiBaseUrl || ''}
                                            onChange={(e) => handleSettingChange('apiBaseUrl', e.target.value)}
                                            placeholder="https://api.example.com"
                                            disabled={!!import.meta.env.VITE_API_BASE_URL}
                                            className="w-full bg-gray-700 text-white text-sm px-3 py-2 rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                                        />
                                        <p className="text-gray-400 text-[10px] sm:text-xs mt-1">
                                            {import.meta.env.VITE_API_BASE_URL 
                                                ? 'Using value from .env.local file' 
                                                : 'Base URL for API endpoints'}
                                        </p>
                                    </div>

                                    {/* OAuth Authentication */}
                                    <div className="bg-gray-800 rounded-lg p-3 space-y-3">
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <label className="text-white text-xs sm:text-sm font-medium block">OAuth Authentication</label>
                                                <p className="text-gray-400 text-[10px] sm:text-xs mt-1">
                                                    {oauthStatus?.authenticated 
                                                        ? `Authenticated as ${oauthStatus.user?.name || oauthStatus.user?.email || 'User'}`
                                                        : 'Authenticate using browser-based OAuth'}
                                                </p>
                                            </div>
                                            {oauthStatus?.authenticated && (
                                                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-900 text-green-300">
                                                    <i className="fas fa-check-circle mr-1"></i>
                                                    Authenticated
                                                </span>
                                            )}
                                        </div>
                                        
                                        {/* Device Code Display */}
                                        {deviceCode && (
                                            <div className="bg-blue-900/30 border border-blue-700 rounded-lg p-3 space-y-2">
                                                <div className="flex items-center gap-2">
                                                    <i className="fas fa-info-circle text-blue-400"></i>
                                                    <p className="text-white text-xs font-medium">Enter this code in your browser:</p>
                                                </div>
                                                <div className="bg-gray-900 rounded-lg p-3 text-center">
                                                    <p className="text-2xl font-mono font-bold text-blue-400 tracking-wider">
                                                        {deviceCode.user_code}
                                                    </p>
                                                </div>
                                                {!deviceCode.browser_opened && (
                                                    <div className="mt-2">
                                                        <p className="text-yellow-400 text-xs mb-1">Browser didn't open automatically. Please open:</p>
                                                        <a 
                                                            href={deviceCode.verification_url}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="text-blue-400 hover:text-blue-300 text-xs break-all underline"
                                                        >
                                                            {deviceCode.verification_url}
                                                        </a>
                                                    </div>
                                                )}
                                                <p className="text-gray-400 text-xs">
                                                    <i className="fas fa-clock mr-1"></i>
                                                    Waiting for authorization... (This window will close automatically)
                                                </p>
                                            </div>
                                        )}
                                        
                                        {!oauthStatus?.authenticated ? (
                                            <button
                                                onClick={handleOAuthAuthenticate}
                                                disabled={authenticating}
                                                className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-semibold py-2 rounded-lg transition-colors flex items-center justify-center gap-2"
                                            >
                                                {authenticating ? (
                                                    <>
                                                        <i className="fas fa-spinner fa-spin"></i>
                                                        {deviceCode ? 'Waiting for authorization...' : 'Opening browser...'}
                                                    </>
                                                ) : (
                                                    <>
                                                        <i className="fas fa-sign-in-alt"></i>
                                                        Login with Browser
                                                    </>
                                                )}
                                            </button>
                                        ) : (
                                            <button
                                                onClick={handleOAuthLogout}
                                                className="w-full bg-red-600 hover:bg-red-500 text-white font-semibold py-2 rounded-lg transition-colors flex items-center justify-center gap-2"
                                            >
                                                <i className="fas fa-sign-out-alt"></i>
                                                Logout
                                            </button>
                                        )}
                                        
                                        {oauthStatus?.user && (
                                            <div className="text-xs text-gray-400 pt-2 border-t border-gray-700">
                                                <p><strong>Email:</strong> {oauthStatus.user.email}</p>
                                                {oauthStatus.user.company_id && (
                                                    <p><strong>Company ID:</strong> {oauthStatus.user.company_id}</p>
                                                )}
                                            </div>
                                        )}
                                    </div>

                                    {/* API Key (Fallback) */}
                                    <div className="bg-gray-800 rounded-lg p-3">
                                        <div className="flex items-center justify-between mb-2">
                                            <label className="text-white text-xs sm:text-sm font-medium block">API Key (Optional - Fallback)</label>
                                            {import.meta.env.VITE_API_KEY && (
                                                <span className="text-xs text-green-400 flex items-center gap-1">
                                                    <i className="fas fa-check-circle"></i>
                                                    From .env.local
                                                </span>
                                            )}
                                        </div>
                                        <input
                                            type="password"
                                            value={settings.apiKey || ''}
                                            onChange={(e) => handleSettingChange('apiKey', e.target.value)}
                                            placeholder="Enter API key or token (used if OAuth not available)"
                                            disabled={!!import.meta.env.VITE_API_KEY}
                                            className="w-full bg-gray-700 text-white text-sm px-3 py-2 rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                                        />
                                        <p className="text-gray-400 text-[10px] sm:text-xs mt-1">
                                            {import.meta.env.VITE_API_KEY 
                                                ? 'Using value from .env.local file (OAuth preferred)' 
                                                : 'Fallback authentication token (OAuth preferred)'}
                                        </p>
                                    </div>

                                    {/* Auto Sync */}
                                    <div className="bg-gray-800 rounded-lg p-2.5 sm:p-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-0">
                                        <div className="flex-1 min-w-0">
                                            <label className="text-white text-xs sm:text-sm font-medium">Auto Sync</label>
                                            <p className="text-gray-400 text-[10px] sm:text-xs mt-1">Automatically sync data at intervals</p>
                                        </div>
                                        <label className="relative inline-flex items-center cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={settings.autoSync !== false}
                                                onChange={(e) => handleSettingChange('autoSync', e.target.checked)}
                                                className="sr-only peer"
                                            />
                                            <div className="w-11 h-6 bg-gray-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                                        </label>
                                    </div>

                                    {/* Sync Interval */}
                                    {settings.autoSync !== false && (
                                        <div className="bg-gray-800 rounded-lg p-3">
                                            <div className="flex items-center justify-between mb-2">
                                                <label className="text-white text-sm font-medium">Sync Interval</label>
                                                <span className="text-blue-400 text-sm font-mono">{settings.apiSyncInterval || 60} sec</span>
                                            </div>
                                            <p className="text-gray-400 text-xs mb-3">How often to sync data automatically</p>
                                            <input
                                                type="range"
                                                min="10"
                                                max="300"
                                                step="10"
                                                value={settings.apiSyncInterval || 60}
                                                onChange={(e) => handleSettingChange('apiSyncInterval', parseInt(e.target.value))}
                                                className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-600"
                                            />
                                            <div className="flex justify-between text-xs text-gray-500 mt-1">
                                                <span>10 sec</span>
                                                <span>300 sec</span>
                                            </div>
                                        </div>
                                    )}

                                    {/* Test Connection */}
                                    <button
                                        onClick={handleTestConnection}
                                        disabled={testingConnection || !settings.apiBaseUrl}
                                        className="w-full bg-green-600 hover:bg-green-500 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-lg transition-colors flex items-center justify-center gap-2"
                                    >
                                        <i className="fas fa-plug"></i>
                                        {testingConnection ? 'Testing...' : 'Test Connection'}
                                    </button>
                                    {apiStatus && (
                                        <p className={`text-xs text-center ${apiStatus.includes('✓') ? 'text-green-400' : apiStatus.includes('✗') ? 'text-red-400' : 'text-yellow-400'}`}>
                                            {apiStatus}
                                        </p>
                                    )}
                                </>
                            )}
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
