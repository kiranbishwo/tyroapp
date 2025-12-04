import React from 'react';

interface IdleDialogProps {
    idleDuration: number; // in seconds
    onKeep: () => void;
    onRemove: () => void;
}

export const IdleDialog: React.FC<IdleDialogProps> = ({ idleDuration, onKeep, onRemove }) => {
    const formatDuration = (seconds: number) => {
        const minutes = Math.floor(seconds / 60);
        const secs = seconds % 60;
        if (minutes > 0) {
            return `${minutes} minute${minutes > 1 ? 's' : ''}${secs > 0 ? ` and ${secs} second${secs > 1 ? 's' : ''}` : ''}`;
        }
        return `${secs} second${secs > 1 ? 's' : ''}`;
    };

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4">
            <div className="bg-gray-900 rounded-2xl shadow-2xl border border-gray-800 max-w-md w-full p-4 sm:p-6 space-y-3 sm:space-y-4">
                <div className="text-center">
                    <div className="w-16 h-16 bg-yellow-600 rounded-xl mx-auto flex items-center justify-center mb-4 shadow-lg shadow-yellow-500/30">
                        <i className="fas fa-clock text-2xl text-white"></i>
                    </div>
                    <h3 className="text-xl font-bold text-white mb-2">Idle Time Detected</h3>
                    <p className="text-gray-400 text-sm">
                        You were idle for <strong className="text-white">{formatDuration(idleDuration)}</strong>
                    </p>
                </div>

                <div className="bg-gray-800/50 rounded-lg p-3">
                    <p className="text-xs text-gray-300">
                        Would you like to remove this idle time from your activity log?
                    </p>
                </div>

                <div className="flex gap-3 pt-2">
                    <button
                        onClick={onKeep}
                        className="flex-1 py-3 px-4 bg-gray-800 hover:bg-gray-700 text-white rounded-lg font-semibold transition-colors"
                    >
                        Keep in Log
                    </button>
                    <button
                        onClick={onRemove}
                        className="flex-1 py-3 px-4 bg-yellow-600 hover:bg-yellow-500 text-white rounded-lg font-semibold transition-colors"
                    >
                        Remove from Log
                    </button>
                </div>
            </div>
        </div>
    );
};
