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
    const [cameraLoading, setCameraLoading] = useState(true);
    const [cameraError, setCameraError] = useState<string | null>(null);
    const streamRequestedRef = useRef(false);

    // Initialize camera stream when component mounts or stream changes
    useEffect(() => {
        const init = async () => {
            // Check if stream exists and is live
            if (existingStream) {
                const videoTracks = existingStream.getVideoTracks();
                const hasLiveTracks = videoTracks.length > 0 && videoTracks.some(track => track.readyState === 'live');
                if (hasLiveTracks) {
                    console.log('FaceAttendance: Stream already exists and is live');
                    setCameraLoading(false);
                    setCameraError(null);
                    return;
                } else {
                    console.log('FaceAttendance: Stream exists but not live, will request new stream');
                }
            }
            
            // If no stream and not yet requested, request it
            if (!existingStream && !streamRequestedRef.current) {
                streamRequestedRef.current = true;
                setCameraLoading(true);
                setCameraError(null);
                try {
                    console.log('FaceAttendance: Requesting camera stream...');
                    await onStreamRequest();
                    // Give time for the stream to be set in parent state
                    await new Promise(resolve => setTimeout(resolve, 500));
                } catch (error) {
                    console.error('FaceAttendance: Failed to request camera stream:', error);
                    setCameraError('Failed to access camera. Please check permissions.');
                    setCameraLoading(false);
                    streamRequestedRef.current = false; // Allow retry
                }
            } else if (!existingStream) {
                // Stream was requested but not yet available
                setCameraLoading(true);
            }
        };
        init();
    }, [existingStream, onStreamRequest]);

    // Handle video stream and ensure it plays
    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;

        let isMounted = true;
        let playTimeout: ReturnType<typeof setTimeout> | null = null;

        const cleanup = () => {
            if (playTimeout) {
                clearTimeout(playTimeout);
                playTimeout = null;
            }
        };

        if (existingStream) {
            const videoTracks = existingStream.getVideoTracks();
            const hasLiveTracks = videoTracks.length > 0 && videoTracks.some(track => track.readyState === 'live');
            
            if (!hasLiveTracks) {
                console.warn('FaceAttendance: Stream tracks are not live');
                if (isMounted) {
                    setCameraError('Camera stream is not active. Please try again.');
                    setCameraLoading(false);
                }
                return cleanup;
            }
            
            // Only set srcObject if it's different to avoid unnecessary reloads
            if (video.srcObject !== existingStream) {
                console.log('FaceAttendance: Setting video srcObject');
                
                // Pause any existing playback to prevent AbortError
                if (video.srcObject) {
                    video.pause();
                }
                
                // Set new stream
                video.srcObject = existingStream;
                
                // Wait for video to be ready before playing
                const tryPlay = () => {
                    if (!isMounted || !video || video.srcObject !== existingStream) return;
                    
                    // Check if video is ready
                    if (video.readyState >= 2) {
                        const playPromise = video.play();
                        if (playPromise !== undefined) {
                            playPromise
                                .then(() => {
                                    if (isMounted) {
                                        console.log('FaceAttendance: Camera video is playing');
                                        setCameraLoading(false);
                                        setCameraError(null);
                                    }
                                })
                                .catch((error) => {
                                    // AbortError is harmless - it just means play() was interrupted
                                    // This is expected when srcObject changes rapidly
                                    if (error.name === 'AbortError') {
                                        console.log('FaceAttendance: Play aborted (normal when stream changes)');
                                        // Retry after a short delay
                                        if (isMounted && video && video.srcObject === existingStream) {
                                            playTimeout = setTimeout(() => {
                                                if (isMounted && video && video.srcObject === existingStream && video.readyState >= 2) {
                                                    video.play().catch(err => {
                                                        // Only log non-AbortError errors
                                                        if (err.name !== 'AbortError' && isMounted) {
                                                            console.error('FaceAttendance: Error playing video:', err);
                                                            setCameraError('Camera is not working. Please check your camera permissions.');
                                                            setCameraLoading(false);
                                                        }
                                                    });
                                                }
                                            }, 300);
                                        }
                                    } else {
                                        // Real error
                                        if (isMounted) {
                                            console.error('FaceAttendance: Error playing video:', error);
                                            setCameraError('Camera is not working. Please check your camera permissions.');
                                            setCameraLoading(false);
                                        }
                                    }
                                });
                        }
                    } else {
                        // Wait for video to be ready
                        const onCanPlay = () => {
                            if (isMounted && video && video.srcObject === existingStream) {
                                tryPlay();
                            }
                        };
                        video.addEventListener('canplay', onCanPlay, { once: true });
                    }
                };

                // Wait a bit for the stream to initialize
                playTimeout = setTimeout(tryPlay, 100);
            } else {
                // Stream already set, just ensure it's playing
                if (video.paused && video.readyState >= 2) {
                    video.play().catch(err => {
                        if (err.name !== 'AbortError' && isMounted) {
                            console.error('FaceAttendance: Error playing video:', err);
                        }
                    });
                }
                if (isMounted && !video.paused && video.readyState >= 2) {
                    setCameraLoading(false);
                    setCameraError(null);
                }
            }
        } else {
            // No stream available
            console.log('FaceAttendance: No stream available yet');
        }

        return cleanup;
    }, [existingStream]);

    // Check if stream tracks are live
    useEffect(() => {
        if (existingStream) {
            const videoTracks = existingStream.getVideoTracks();
            const hasLiveTracks = videoTracks.length > 0 && videoTracks.some(track => track.readyState === 'live');
            
            if (hasLiveTracks && videoRef.current && videoRef.current.readyState >= 2) {
                setCameraLoading(false);
                setCameraError(null);
            } else if (videoTracks.length === 0) {
                setCameraError('No camera found. Please connect a camera.');
                setCameraLoading(false);
            }
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
        <div className="flex flex-col items-center justify-center h-full p-4 sm:p-6 md:p-8 bg-gray-900 text-white animate-fade-in relative max-w-4xl mx-auto w-full">
            <button onClick={onCancel} className="absolute top-3 sm:top-4 left-3 sm:left-4 text-gray-500 hover:text-white text-xs sm:text-sm">
                <i className="fas fa-arrow-left"></i> <span className="hidden sm:inline">Back</span>
            </button>

            <h2 className="text-xl sm:text-2xl md:text-3xl font-bold mb-2 sm:mb-3 text-center">
                {mode === 'CHECK_IN' ? 'Good Morning!' : 'See you later!'}
            </h2>
            <p className="text-gray-400 text-sm sm:text-base mb-4 sm:mb-6 md:mb-8 text-center px-4 max-w-2xl">
                Please verify your identity to {mode === 'CHECK_IN' ? 'start' : 'end'} your shift.
            </p>

            <div className="relative w-56 h-56 sm:w-72 sm:h-72 md:w-80 md:h-80 bg-gray-800 rounded-full overflow-hidden border-4 border-blue-500 shadow-lg shadow-blue-500/20 mb-6 sm:mb-8 md:mb-10">
                {!captured ? (
                    <>
                        <video 
                            ref={videoRef} 
                            autoPlay 
                            playsInline 
                            muted 
                            className="w-full h-full object-cover transform scale-x-[-1]"
                        />
                        {/* Loading overlay */}
                        {cameraLoading && (
                            <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900/80">
                                <i className="fas fa-circle-notch fa-spin text-blue-400 text-2xl mb-2"></i>
                                <p className="text-xs text-gray-300">Initializing camera...</p>
                            </div>
                        )}
                        {/* Error overlay */}
                        {cameraError && !cameraLoading && (
                            <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900/90 p-4">
                                <i className="fas fa-exclamation-triangle text-red-400 text-2xl mb-2"></i>
                                <p className="text-xs text-red-300 text-center">{cameraError}</p>
                                <button
                                    onClick={async () => {
                                        setCameraLoading(true);
                                        setCameraError(null);
                                        streamRequestedRef.current = false;
                                        await onStreamRequest();
                                    }}
                                    className="mt-3 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs rounded-lg transition-colors"
                                >
                                    <i className="fas fa-redo mr-1"></i> Retry
                                </button>
                            </div>
                        )}
                    </>
                ) : (
                    <img src={captured} alt="Captured face" className="w-full h-full object-cover" />
                )}
                
                {/* Face Scanning Overlay */}
                {!captured && !cameraLoading && !cameraError && (
                    <div className="absolute inset-0 flex items-center justify-center">
                         <div className="w-48 h-48 border-2 border-white/30 rounded-full animate-pulse"></div>
                    </div>
                )}
            </div>

            <canvas ref={canvasRef} className="hidden" />

            <div className="flex flex-col gap-2 sm:gap-3 w-full max-w-md px-4 sm:px-0">
                {!captured ? (
                     <button 
                        onClick={takePhoto}
                        disabled={cameraLoading || !!cameraError || !existingStream}
                        className={`w-full font-semibold py-3 sm:py-4 px-6 sm:px-8 rounded-lg transition-all text-base sm:text-lg ${
                            cameraLoading || !!cameraError || !existingStream
                                ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                                : 'bg-blue-600 hover:bg-blue-500 text-white'
                        }`}
                     >
                        {cameraLoading ? (
                            <>
                                <i className="fas fa-circle-notch fa-spin mr-2"></i> <span>Loading Camera...</span>
                            </>
                        ) : cameraError ? (
                            <>
                                <i className="fas fa-exclamation-triangle mr-2"></i> <span>Camera Error</span>
                            </>
                        ) : (
                            <>
                                <i className="fas fa-camera mr-2"></i> <span>Capture Face</span>
                            </>
                        )}
                     </button>
                ) : analyzing ? (
                     <button disabled className="w-full bg-gray-700 text-gray-300 font-semibold py-3 sm:py-4 px-6 sm:px-8 rounded-lg cursor-wait text-base sm:text-lg">
                        <i className="fas fa-circle-notch fa-spin mr-2"></i> <span>Verifying...</span>
                     </button>
                ) : (
                    <div className="flex gap-2 sm:gap-3">
                        <button 
                            onClick={retake}
                            className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-3 sm:py-4 rounded-lg text-base sm:text-lg"
                        >
                            Retake
                        </button>
                        <button 
                            onClick={confirmAction}
                            className="flex-1 bg-green-600 hover:bg-green-500 text-white font-semibold py-3 sm:py-4 rounded-lg text-base sm:text-lg"
                        >
                            Confirm {mode === 'CHECK_IN' ? 'In' : 'Out'}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};