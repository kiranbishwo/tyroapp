import React, { useRef, useEffect, useState } from 'react';

interface FaceAttendanceProps {
    mode: 'CHECK_IN' | 'CHECK_OUT';
    existingStream: MediaStream | null; // Passed from parent
    onConfirm: (photoData: string) => void;
    onCancel: () => void;
    onStreamRequest: () => Promise<void>; // Request parent to start stream
}

export const FaceAttendance: React.FC<FaceAttendanceProps> = ({ 
    mode, 
    existingStream, 
    onConfirm, 
    onCancel,
    onStreamRequest 
}) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [captured, setCaptured] = useState<string | null>(null);
    const [analyzing, setAnalyzing] = useState(false);

    useEffect(() => {
        const init = async () => {
            if (!existingStream) {
                await onStreamRequest();
            }
        };
        init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (videoRef.current && existingStream) {
            videoRef.current.srcObject = existingStream;
        }
    }, [existingStream]);

    const takePhoto = () => {
        if (!videoRef.current || !canvasRef.current) return;

        const context = canvasRef.current.getContext('2d');
        if (context) {
            canvasRef.current.width = videoRef.current.videoWidth;
            canvasRef.current.height = videoRef.current.videoHeight;
            context.drawImage(videoRef.current, 0, 0);
            
            const data = canvasRef.current.toDataURL('image/png');
            setCaptured(data);
            setAnalyzing(true);

            // Simulate Face Analysis Delay
            setTimeout(() => {
                setAnalyzing(false);
            }, 1500);
        }
    };

    const confirmAction = () => {
        if (captured) {
            onConfirm(captured);
        }
    };

    const retake = () => {
        setCaptured(null);
        setAnalyzing(false);
    };

    return (
        <div className="flex flex-col items-center justify-center h-full p-6 bg-gray-900 text-white animate-fade-in relative">
            <button onClick={onCancel} className="absolute top-4 left-4 text-gray-500 hover:text-white">
                <i className="fas fa-arrow-left"></i> Back
            </button>

            <h2 className="text-xl font-bold mb-2">
                {mode === 'CHECK_IN' ? 'Good Morning!' : 'See you later!'}
            </h2>
            <p className="text-gray-400 text-sm mb-6 text-center">
                Please verify your identity to {mode === 'CHECK_IN' ? 'start' : 'end'} your shift.
            </p>

            <div className="relative w-64 h-64 bg-gray-800 rounded-full overflow-hidden border-4 border-blue-500 shadow-lg shadow-blue-500/20 mb-8">
                {!captured ? (
                    <video 
                        ref={videoRef} 
                        autoPlay 
                        playsInline 
                        muted 
                        className="w-full h-full object-cover transform scale-x-[-1]"
                    />
                ) : (
                    <img src={captured} alt="Captured face" className="w-full h-full object-cover" />
                )}
                
                {/* Face Scanning Overlay */}
                {!captured && (
                    <div className="absolute inset-0 flex items-center justify-center">
                         <div className="w-48 h-48 border-2 border-white/30 rounded-full animate-pulse"></div>
                    </div>
                )}
            </div>

            <canvas ref={canvasRef} className="hidden" />

            <div className="flex flex-col gap-3 w-full max-w-xs">
                {!captured ? (
                     <button 
                        onClick={takePhoto}
                        className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold py-3 px-6 rounded-lg transition-all"
                     >
                        <i className="fas fa-camera mr-2"></i> Capture Face
                     </button>
                ) : analyzing ? (
                     <button disabled className="w-full bg-gray-700 text-gray-300 font-semibold py-3 px-6 rounded-lg cursor-wait">
                        <i className="fas fa-circle-notch fa-spin mr-2"></i> Verifying...
                     </button>
                ) : (
                    <div className="flex gap-3">
                        <button 
                            onClick={retake}
                            className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-3 rounded-lg"
                        >
                            Retake
                        </button>
                        <button 
                            onClick={confirmAction}
                            className="flex-1 bg-green-600 hover:bg-green-500 text-white font-semibold py-3 rounded-lg"
                        >
                            Confirm {mode === 'CHECK_IN' ? 'In' : 'Out'}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};