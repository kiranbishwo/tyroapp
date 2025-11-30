import { useState, useRef, useEffect, useCallback } from 'react';
import { ActivityLog, Project } from '../types';

// Mock apps for simulation
const MOCK_APPS = ['VS Code', 'Google Chrome', 'Slack', 'Figma', 'Terminal', 'Zoom'];

interface UseSurveillanceProps {
    isTimerRunning: boolean;
    currentProjectId: string;
}

export const useSurveillance = ({ isTimerRunning, currentProjectId }: UseSurveillanceProps) => {
    const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
    const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
    const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
    
    // Activity counters (reset every interval)
    const keystrokesRef = useRef(0);
    const mouseClicksRef = useRef(0);
    const intervalRef = useRef<number | null>(null);

    // Hidden canvas for capturing frames
    const canvasRef = useRef<HTMLCanvasElement | null>(null);

    // Initialize Canvas
    useEffect(() => {
        const canvas = document.createElement('canvas');
        canvasRef.current = canvas;
    }, []);

    // Global Listeners for Activity Tracking (Simulation)
    useEffect(() => {
        const handleKey = () => { keystrokesRef.current++; };
        const handleClick = () => { mouseClicksRef.current++; };

        window.addEventListener('keydown', handleKey);
        window.addEventListener('click', handleClick);
        window.addEventListener('mousemove', () => { /* heavily throttled in real app */ });

        return () => {
            window.removeEventListener('keydown', handleKey);
            window.removeEventListener('click', handleClick);
        };
    }, []);

    const startCamera = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true });
            setCameraStream(stream);
            return stream;
        } catch (e) {
            console.error("Camera denied", e);
            return null;
        }
    };

    const stopCamera = () => {
        if (cameraStream) {
            cameraStream.getTracks().forEach(t => t.stop());
            setCameraStream(null);
        }
    };

    const startScreenShare = async () => {
        try {
            const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
            setScreenStream(stream);
            
            // Handle user stopping share via browser UI
            stream.getVideoTracks()[0].onended = () => {
                setScreenStream(null);
            };
            return stream;
        } catch (e) {
            console.error("Screen share denied", e);
            return null;
        }
    };

    const stopScreenShare = () => {
        if (screenStream) {
            screenStream.getTracks().forEach(t => t.stop());
            setScreenStream(null);
        }
    };

    const captureFrame = (stream: MediaStream | null): string | undefined => {
        if (!stream || !canvasRef.current) return undefined;
        const videoTrack = stream.getVideoTracks()[0];
        if (!videoTrack || videoTrack.readyState !== 'live') return undefined;

        // Create a temporary video element to grab the frame
        const video = document.createElement('video');
        video.srcObject = stream;
        video.play(); // essential to get data

        // We need to wait a tick for video to have dimensions, 
        // but for sync code in interval, we rely on the stream being active.
        // A robust implementation uses an ImageCapture API or keeps a hidden video element in DOM.
        // For this prototype, we'll assume a hidden video element approach or ImageCapture if available.
        
        // Simplified Sync Capture (assuming pre-warmed stream):
        // In a real React hook, we'd likely keep a ref to a hidden <video> element in the DOM 
        // that is constantly playing the stream to allow instant canvas draws.
        
        return undefined; // Handled by App.tsx's hidden video refs for stability
    };

    // The Interval Logic
    useEffect(() => {
        // Environment Variable for Interval (default 30s)
        const envInterval = process.env.CAPTURE_INTERVAL;
        const CAPTURE_INTERVAL = envInterval ? parseInt(envInterval) : 30000; 

        if (isTimerRunning) {
            intervalRef.current = window.setInterval(async () => {
                // Generate Mock Data for Prototype purposes
                // (Since we can't capture outside browser window events easily)
                const mockKeystrokes = keystrokesRef.current + Math.floor(Math.random() * 50); 
                const mockClicks = mouseClicksRef.current + Math.floor(Math.random() * 20);
                const mockApp = MOCK_APPS[Math.floor(Math.random() * MOCK_APPS.length)];
                const score = Math.min(100, Math.floor(((mockKeystrokes + mockClicks) / 5) * 10) + 40);

                const newLog: ActivityLog = {
                    id: Date.now().toString(),
                    timestamp: new Date(),
                    projectId: currentProjectId,
                    keyboardEvents: mockKeystrokes,
                    mouseEvents: mockClicks,
                    productivityScore: score,
                    activeWindow: mockApp,
                    // Screenshots will be attached by the main App component 
                    // because it holds the Video Refs required for drawing to canvas
                };

                setActivityLogs(prev => [newLog, ...prev]);

                // Reset counters
                keystrokesRef.current = 0;
                mouseClicksRef.current = 0;

            }, CAPTURE_INTERVAL);
        } else {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
            }
        }

        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current);
        };
    }, [isTimerRunning, currentProjectId]);

    return {
        cameraStream,
        screenStream,
        activityLogs,
        setActivityLogs,
        startCamera,
        stopCamera,
        startScreenShare,
        stopScreenShare
    };
};