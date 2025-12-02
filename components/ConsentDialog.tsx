import React, { useState } from 'react';

interface ConsentDialogProps {
    onConsent: (consent: boolean, remember: boolean) => void;
}

export const ConsentDialog: React.FC<ConsentDialogProps> = ({ onConsent }) => {
    const [remember, setRemember] = useState(true);

    const handleConsent = (consent: boolean) => {
        onConsent(consent, remember);
    };

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-gray-900 rounded-2xl shadow-2xl border border-gray-800 max-w-md w-full p-6 space-y-6">
                {/* Header */}
                <div className="text-center">
                    <div className="w-16 h-16 bg-blue-600 rounded-xl mx-auto flex items-center justify-center mb-4 shadow-lg shadow-blue-500/30">
                        <i className="fas fa-shield-alt text-2xl text-white"></i>
                    </div>
                    <h2 className="text-2xl font-bold text-white mb-2">Privacy & Tracking Consent</h2>
                    <p className="text-gray-400 text-sm">
                        We need your consent to track your activity for time management
                    </p>
                </div>

                {/* What We Track */}
                <div className="bg-gray-800/50 rounded-lg p-4 space-y-3">
                    <h3 className="text-white font-semibold text-sm mb-2">What We Track:</h3>
                    <div className="space-y-2 text-sm">
                        <div className="flex items-start gap-2 text-gray-300">
                            <i className="fas fa-check-circle text-green-400 mt-0.5"></i>
                            <span><strong>Active Applications:</strong> Which apps you're using (e.g., Chrome, VS Code)</span>
                        </div>
                        <div className="flex items-start gap-2 text-gray-300">
                            <i className="fas fa-check-circle text-green-400 mt-0.5"></i>
                            <span><strong>Activity Counts:</strong> Number of mouse clicks and keyboard events (not what you type)</span>
                        </div>
                        <div className="flex items-start gap-2 text-gray-300">
                            <i className="fas fa-check-circle text-green-400 mt-0.5"></i>
                            <span><strong>Website URLs:</strong> URLs of websites you visit (when available)</span>
                        </div>
                        <div className="flex items-start gap-2 text-gray-300">
                            <i className="fas fa-check-circle text-green-400 mt-0.5"></i>
                            <span><strong>Screenshots:</strong> Optional screenshots of your screen (can be disabled)</span>
                        </div>
                    </div>
                </div>

                {/* What We DON'T Track */}
                <div className="bg-red-900/20 border border-red-800/50 rounded-lg p-4 space-y-2">
                    <h3 className="text-red-400 font-semibold text-sm mb-2">What We DON'T Track:</h3>
                    <div className="space-y-1 text-xs text-gray-300">
                        <div className="flex items-center gap-2">
                            <i className="fas fa-times-circle text-red-400"></i>
                            <span>Keystroke content (passwords, messages, etc.)</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <i className="fas fa-times-circle text-red-400"></i>
                            <span>Microphone or webcam recordings (photos can be taken randomly, like screenshots, for verification purposes)</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <i className="fas fa-times-circle text-red-400"></i>
                            <span>Your files or documents</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <i className="fas fa-times-circle text-red-400"></i>
                            <span>Background applications</span>
                        </div>
                    </div>
                </div>

                {/* Privacy Notice */}
                <div className="bg-blue-900/20 border border-blue-800/50 rounded-lg p-3">
                    <p className="text-xs text-blue-300">
                        <i className="fas fa-info-circle mr-1"></i>
                        <strong>Privacy:</strong> All data is stored locally on your device. No data is sent to external servers. 
                        You can export or delete your data at any time in Settings.
                    </p>
                </div>

                {/* Remember Choice */}
                <label className="flex items-center gap-2 cursor-pointer">
                    <input
                        type="checkbox"
                        checked={remember}
                        onChange={(e) => setRemember(e.target.checked)}
                        className="w-4 h-4 rounded border-gray-600 bg-gray-800 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-400">Remember my choice</span>
                </label>

                {/* Buttons */}
                <div className="flex gap-3 pt-2">
                    <button
                        onClick={() => handleConsent(false)}
                        className="flex-1 py-3 px-4 bg-gray-800 hover:bg-gray-700 text-white rounded-lg font-semibold transition-colors border border-gray-700"
                    >
                        I Do Not Consent
                    </button>
                    <button
                        onClick={() => handleConsent(true)}
                        className="flex-1 py-3 px-4 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-semibold transition-colors shadow-lg shadow-blue-500/20"
                    >
                        I Consent
                    </button>
                </div>

                {/* Legal Note */}
                <p className="text-xs text-center text-gray-500 pt-2">
                    By clicking "I Consent", you agree to our tracking practices. 
                    You can revoke consent anytime in Settings.
                </p>
            </div>
        </div>
    );
};
