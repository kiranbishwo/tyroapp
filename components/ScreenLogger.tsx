import React, { useRef, useEffect, useState } from 'react';
import { ScreenShot } from '../types';

interface ScreenLoggerProps {
    onClose: () => void;
    onCapture: (screenshot: ScreenShot) => void;
}

export const ScreenLogger: React.FC<ScreenLoggerProps> = ({ onClose, onCapture }) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [stream, setStream] = useState<MediaStream | null>(null);
    const [captures, setCaptures] = useState<ScreenShot[]>([]);

    useEffect(() => {
        const startCapture = async () => {
            try {
                const displayStream = await navigator.mediaDevices.getDisplayMedia({ 
                    video: true,
                    audio: false 
                });
                setStream(displayStream);
                if (videoRef.current) {
                    videoRef.current.srcObject = displayStream;
                }
                
                displayStream.getVideoTracks()[0].onended = () => {
                    stopCapture();
                };

            } catch (err) {
                console.error("Error sharing screen", err);
                onClose();
            }
        };

        startCapture();

        return () => {
            // Cleanup on unmount
            if (stream) {
                stream.getTracks().forEach(track => track.stop());
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const stopCapture = () => {
        if (stream) {
            stream.getTracks().forEach(track => track.stop());
            setStream(null);
        }
    };

    const takeSnapshot = () => {
        if (!videoRef.current || !canvasRef.current) return;
        
        const context = canvasRef.current.getContext('2d');
        if (context) {
            canvasRef.current.width = videoRef.current.videoWidth;
            canvasRef.current.height = videoRef.current.videoHeight;
            context.drawImage(videoRef.current, 0, 0);
            
            const data = canvasRef.current.toDataURL('image/jpeg', 0.8);
            const newShot: ScreenShot = {
                id: Date.now().toString(),
                timestamp: new Date(),
                dataUrl: data,
                type: 'SCREEN'
            };
            
            setCaptures(prev => [newShot, ...prev]);
            onCapture(newShot);
        }
    };

    return (
        <div className="flex flex-col h-full bg-gray-900 text-white">
            <div className="p-4 border-b border-gray-800 flex justify-between items-center">
                <h2 className="font-semibold text-lg flex items-center">
                    <span className="w-2 h-2 bg-red-500 rounded-full mr-2 animate-pulse"></span>
                    Screen Logger
                </h2>
                <button onClick={onClose} className="text-gray-400 hover:text-white">
                    <i className="fas fa-times"></i>
                </button>
            </div>

            <div className="flex-1 bg-black relative overflow-hidden flex items-center justify-center">
                {!stream ? (
                     <div className="text-center text-gray-500">
                        <i className="fas fa-desktop text-4xl mb-2"></i>
                        <p>Waiting for source...</p>
                     </div>
                ) : (
                    <video 
                        ref={videoRef} 
                        autoPlay 
                        playsInline 
                        muted 
                        className="max-w-full max-h-full object-contain"
                    />
                )}
                
                {/* Overlay controls */}
                <div className="absolute bottom-6 flex gap-4">
                     <button 
                        onClick={takeSnapshot}
                        disabled={!stream}
                        className="bg-white text-black hover:bg-gray-200 font-bold py-2 px-6 rounded-full shadow-lg transform active:scale-95 transition-all"
                     >
                        <i className="fas fa-camera mr-2"></i> Snap Evidence
                     </button>
                </div>
            </div>

            <canvas ref={canvasRef} className="hidden" />

            <div className="h-32 bg-gray-800 p-3 overflow-x-auto whitespace-nowrap border-t border-gray-700">
                {captures.length === 0 ? (
                    <p className="text-xs text-gray-500 mt-10 text-center">No screenshots taken yet.</p>
                ) : (
                    captures.map(shot => (
                        <div key={shot.id} className="inline-block relative h-full aspect-video mr-3 rounded border border-gray-600 overflow-hidden group">
                            <img src={shot.dataUrl} alt="Screen capture" className="h-full w-full object-cover" />
                            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-xs">
                                {shot.timestamp.toLocaleTimeString()}
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};