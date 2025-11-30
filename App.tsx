import React, { useState, useEffect, useRef } from 'react';
import { User, AppView, Project, TimeEntry } from './types';
import { FaceAttendance } from './components/FaceAttendance';
import { ScreenLogger } from './components/ScreenLogger';
import { InsightsDashboard } from './components/InsightsDashboard';
import { useSurveillance } from './hooks/useSurveillance';

// Mock Data
const MOCK_PROJECTS: Project[] = [
    { id: '1', name: 'Web Development', color: '#60A5FA' },
    { id: '2', name: 'Internal Audit', color: '#F472B6' },
    { id: '3', name: 'UI/UX Design', color: '#34D399' },
    { id: '4', name: 'Meeting', color: '#FBBF24' },
];

const INITIAL_USER: User = {
    id: 'u1',
    name: 'Alex Developer',
    avatar: 'https://picsum.photos/100/100',
    isCheckedIn: false
};

const App: React.FC = () => {
    // State
    const [user, setUser] = useState<User | null>(null);
    const [view, setView] = useState<AppView>(AppView.LOGIN);
    const [projects] = useState<Project[]>(MOCK_PROJECTS);
    const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([]);
    
    // Timer State
    const [isTimerRunning, setIsTimerRunning] = useState(false);
    const [startTime, setStartTime] = useState<number | null>(null);
    const [elapsedSeconds, setElapsedSeconds] = useState(0);
    const [description, setDescription] = useState('');
    const [selectedProjectId, setSelectedProjectId] = useState<string>('');
    

    // Surveillance Hook
    const { 
        cameraStream, 
        screenStream, 
        activityLogs, 
        setActivityLogs,
        startCamera, 
        stopCamera,
        startScreenShare, 
        stopScreenShare 
    } = useSurveillance({ 
        isTimerRunning, 
        currentProjectId: selectedProjectId 
    });

    const timerIntervalRef = useRef<number | null>(null);

    // Hidden Refs for Background Capture
    // Note: We use opacity: 0 instead of display: none to ensure the browser processes video frames
    const hiddenCamVideoRef = useRef<HTMLVideoElement>(null);
    const hiddenScreenVideoRef = useRef<HTMLVideoElement>(null);
    const hiddenCanvasRef = useRef<HTMLCanvasElement>(null);

    // Initial Login Simulation
    const handleLogin = (email: string) => {
        setUser({ ...INITIAL_USER, name: email.split('@')[0] });
        setView(AppView.CHECK_IN_OUT); 
    };

    // Attach streams to hidden video elements for capture
    useEffect(() => {
        if (hiddenCamVideoRef.current && cameraStream) {
            hiddenCamVideoRef.current.srcObject = cameraStream;
        }
    }, [cameraStream]);

    useEffect(() => {
        if (hiddenScreenVideoRef.current && screenStream) {
            hiddenScreenVideoRef.current.srcObject = screenStream;
        }
    }, [screenStream]);

    // Timer Logic
    useEffect(() => {
        if (isTimerRunning && startTime) {
            timerIntervalRef.current = window.setInterval(() => {
                const now = Date.now();
                setElapsedSeconds(Math.floor((now - startTime) / 1000));
            }, 1000);
        } else {
            if (timerIntervalRef.current) {
                clearInterval(timerIntervalRef.current);
                timerIntervalRef.current = null;
            }
        }
        return () => {
            if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
        };
    }, [isTimerRunning, startTime]);

    // Background Capture Logic (Sync with Activity Log creation)
    // We observe the activity logs array. When a new log is added (by useSurveillance),
    // we try to append screenshots to it using the hidden video refs.
    useEffect(() => {
        if (activityLogs.length > 0) {
            const latestLog = activityLogs[0];
            // Only update if it doesn't have images yet and happened just now (<1s)
            const isFresh = (new Date().getTime() - latestLog.timestamp.getTime()) < 1500;
            
            if (isFresh && !latestLog.screenshotUrl && !latestLog.webcamUrl) {
                const canvas = hiddenCanvasRef.current;
                
                let camUrl = undefined;
                let screenUrl = undefined;

                if (canvas) {
                    // Capture Cam
                    if (hiddenCamVideoRef.current && cameraStream && cameraStream.active) {
                         const v = hiddenCamVideoRef.current;
                         // Check if video is playing/ready
                         if (v.readyState === 4) {
                            canvas.width = 320; // Thumbnail size
                            canvas.height = 240;
                            const ctx = canvas.getContext('2d');
                            if (ctx) {
                                ctx.drawImage(v, 0, 0, 320, 240);
                                camUrl = canvas.toDataURL('image/jpeg', 0.5);
                            }
                         }
                    }

                    // Capture Screen
                    if (hiddenScreenVideoRef.current && screenStream && screenStream.active) {
                        const v = hiddenScreenVideoRef.current;
                        if (v.readyState === 4) {
                            canvas.width = 480; // Thumbnail size
                            canvas.height = 270;
                            const ctx = canvas.getContext('2d');
                            if (ctx) {
                                ctx.drawImage(v, 0, 0, 480, 270);
                                screenUrl = canvas.toDataURL('image/jpeg', 0.5);
                            }
                        }
                    }
                }

                if (camUrl || screenUrl) {
                    // Update the log entry with images
                    setActivityLogs(prev => {
                        const newLogs = [...prev];
                        // Ensure we are updating the correct log (the first one)
                        if (newLogs[0].id === latestLog.id) {
                             newLogs[0] = { ...newLogs[0], webcamUrl: camUrl, screenshotUrl: screenUrl };
                        }
                        return newLogs;
                    });
                }
            }
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activityLogs.length]); // Triggers when useSurveillance adds a new log

    const formatTime = (totalSeconds: number) => {
        const h = Math.floor(totalSeconds / 3600);
        const m = Math.floor((totalSeconds % 3600) / 60);
        const s = totalSeconds % 60;
        return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    };

    const toggleTimer = async () => {
        if (isTimerRunning) {
            // Stop Timer
            const endTime = new Date();
            const start = startTime ? new Date(startTime) : new Date();
            
            const newEntry: TimeEntry = {
                id: Date.now().toString(),
                description: description || '(No description)',
                projectId: selectedProjectId || '4', 
                startTime: start,
                endTime: endTime,
                duration: elapsedSeconds
            };

            setTimeEntries([newEntry, ...timeEntries]);
            setIsTimerRunning(false);
            setStartTime(null);
            setElapsedSeconds(0);
            setDescription('');
            
            // Stop screen share when timer stops to respect privacy
            stopScreenShare();
        } else {
            // Start Timer
            // Ask for screen share permission for monitoring
            if (!screenStream) {
                const stream = await startScreenShare();
                if (!stream) {
                    alert("Screen monitoring is required to start the timer.");
                    return;
                }
            }
            setStartTime(Date.now());
            setIsTimerRunning(true);
        }
    };

    const handleFaceConfirmed = (photoData: string) => {
        if (!user) return;
        
        if (user.isCheckedIn) {
            // Check Out
            setUser({ ...user, isCheckedIn: false, checkInTime: undefined });
            stopCamera(); // Turn off camera
            stopScreenShare();
            setView(AppView.LOGIN);
        } else {
            // Check In
            setUser({ ...user, isCheckedIn: true, checkInTime: new Date() });
            // Keep camera running for background snaps
            setView(AppView.DASHBOARD);
        }
    };


    // --- Render ---

    // Hidden elements for processing (opacity 0 instead of display none to allow capture)
    const hiddenElements = (
        <div style={{ position: 'fixed', top: 0, left: 0, opacity: 0, pointerEvents: 'none', zIndex: -1 }}>
            <video ref={hiddenCamVideoRef} autoPlay playsInline muted width="320" height="240" />
            <video ref={hiddenScreenVideoRef} autoPlay playsInline muted width="480" height="270" />
            <canvas ref={hiddenCanvasRef} />
        </div>
    );

    if (view === AppView.LOGIN) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-950 p-4 font-sans">
                {hiddenElements}
                <div className="w-full max-w-[400px] bg-gray-900 rounded-2xl shadow-2xl p-8 border border-gray-800">
                    <div className="text-center mb-8">
                        <div className="w-16 h-16 bg-blue-600 rounded-xl mx-auto flex items-center justify-center mb-4 shadow-lg shadow-blue-500/30">
                            <i className="fas fa-bolt text-2xl text-white"></i>
                        </div>
                        <h1 className="text-2xl font-bold text-white tracking-tight">Tempo</h1>
                        <p className="text-gray-400 text-sm">Workforce Management</p>
                    </div>
                    <form onSubmit={(e) => { e.preventDefault(); handleLogin((e.target as any).email.value); }}>
                        <div className="mb-4">
                            <label className="block text-xs uppercase text-gray-500 font-bold mb-2">Work Email</label>
                            <input 
                                name="email"
                                type="email" 
                                defaultValue="alex@company.com"
                                className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-4 py-3 focus:outline-none focus:border-blue-500 transition-colors"
                            />
                        </div>
                        <div className="mb-6">
                            <label className="block text-xs uppercase text-gray-500 font-bold mb-2">Password</label>
                            <input 
                                type="password" 
                                defaultValue="password"
                                className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-4 py-3 focus:outline-none focus:border-blue-500 transition-colors"
                            />
                        </div>
                        <button type="submit" className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-lg shadow-lg transition-all">
                            Log In
                        </button>
                    </form>
                </div>
            </div>
        );
    }

    if (view === AppView.CHECK_IN_OUT) {
        return (
            <div className="min-h-screen bg-gray-950 flex justify-center font-sans">
                {hiddenElements}
                <div className="w-full max-w-[400px] bg-gray-900 shadow-2xl overflow-hidden relative border-x border-gray-800">
                    <FaceAttendance 
                        mode={user?.isCheckedIn ? 'CHECK_OUT' : 'CHECK_IN'}
                        existingStream={cameraStream}
                        onConfirm={handleFaceConfirmed}
                        onStreamRequest={async () => { await startCamera(); }}
                        onCancel={() => user?.isCheckedIn ? setView(AppView.DASHBOARD) : setView(AppView.LOGIN)}
                    />
                </div>
            </div>
        );
    }

    if (view === AppView.INSIGHTS) {
        return (
            <div className="min-h-screen bg-gray-950 flex justify-center font-sans">
                {hiddenElements}
                <div className="w-full max-w-[400px] bg-gray-900 shadow-2xl overflow-hidden flex flex-col h-screen border-x border-gray-800">
                    <InsightsDashboard 
                        logs={activityLogs}
                        projects={projects}
                        onClose={() => setView(AppView.DASHBOARD)}
                    />
                </div>
            </div>
        );
    }

    if (view === AppView.SCREENCAST) {
        return (
            <div className="min-h-screen bg-gray-950 flex justify-center font-sans">
                {hiddenElements}
                <div className="w-full max-w-[400px] bg-gray-900 shadow-2xl overflow-hidden flex flex-col h-screen border-x border-gray-800">
                    <ScreenLogger 
                        onClose={() => setView(AppView.DASHBOARD)}
                        onCapture={(shot) => console.log(shot)}
                    />
                </div>
            </div>
        );
    }

    // DASHBOARD VIEW
    return (
        <div className="min-h-screen bg-gray-950 flex justify-center font-sans">
            {hiddenElements}
            <div className="w-full max-w-[400px] bg-gray-900 shadow-2xl flex flex-col h-screen overflow-hidden border-x border-gray-800 relative">
                
                {/* Header */}
                <header className="bg-gray-800 p-4 flex justify-between items-center shadow-md z-10">
                    <div className="flex items-center gap-3">
                        <div className="relative">
                            <img src={user?.avatar} alt="User" className="w-8 h-8 rounded-full border border-gray-600" />
                            <div className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-gray-800 ${isTimerRunning ? 'bg-green-500 animate-pulse' : 'bg-yellow-500'}`}></div>
                        </div>
                        <div className="flex flex-col">
                            <span className="text-sm font-semibold text-gray-200 leading-tight">{user?.name}</span>
                            <span className="text-[10px] text-gray-500 uppercase font-bold">{isTimerRunning ? 'Tracking' : 'Idle'}</span>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <button 
                            onClick={() => setView(AppView.INSIGHTS)}
                            className="w-8 h-8 rounded-full bg-blue-900/30 hover:bg-blue-900/50 text-blue-400 flex items-center justify-center transition-colors relative"
                            title="Productivity Insights"
                        >
                             <i className="fas fa-chart-bar text-xs"></i>
                             {activityLogs.length > 0 && <span className="absolute top-0 right-0 w-2 h-2 bg-red-500 rounded-full"></span>}
                        </button>
                        <button 
                            onClick={() => setView(AppView.CHECK_IN_OUT)}
                            className="w-8 h-8 rounded-full bg-red-900/30 hover:bg-red-900/50 text-red-400 flex items-center justify-center transition-colors"
                            title="Check Out"
                        >
                            <i className="fas fa-power-off text-xs"></i>
                        </button>
                    </div>
                </header>

                {/* Main Content */}
                <main className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                    
                    {/* Timer Widget */}
                    <div className="bg-gradient-to-br from-gray-800 to-gray-850 rounded-xl p-4 shadow-lg mb-6 border border-gray-700/50 relative overflow-hidden">
                        {/* Glow effect when running */}
                        {isTimerRunning && <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 via-purple-500 to-blue-500 animate-gradient"></div>}
                        
                        <input 
                            type="text" 
                            placeholder="What are you working on?" 
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            className="w-full bg-transparent text-white placeholder-gray-500 text-sm mb-4 focus:outline-none"
                        />
                        <div className="flex justify-between items-center mb-4">
                            <select 
                                value={selectedProjectId}
                                onChange={(e) => setSelectedProjectId(e.target.value)}
                                className="bg-gray-900 text-blue-400 text-xs py-1 px-2 rounded border border-gray-700 focus:outline-none max-w-[120px]"
                            >
                                <option value="" disabled>Project</option>
                                {projects.map(p => (
                                    <option key={p.id} value={p.id}>{p.name}</option>
                                ))}
                            </select>
                            <div className="text-3xl font-mono text-white tracking-widest font-light">
                                {formatTime(elapsedSeconds)}
                            </div>
                        </div>
                        <button 
                            onClick={toggleTimer}
                            className={`w-full py-3 rounded-lg font-bold text-white shadow-lg transition-all active:scale-95 flex justify-center items-center gap-2 ${
                                isTimerRunning 
                                ? 'bg-red-500 hover:bg-red-600 shadow-red-500/20' 
                                : 'bg-blue-600 hover:bg-blue-500 shadow-blue-500/20'
                            }`}
                        >
                            {isTimerRunning ? <><i className="fas fa-stop"></i> STOP</> : <><i className="fas fa-play"></i> START</>}
                        </button>
                    </div>

                    {/* Time Entries List */}
                    <div>
                        <h3 className="text-gray-400 text-xs font-bold uppercase tracking-wider mb-3">Today</h3>
                        <div className="space-y-3 pb-4">
                            {timeEntries.length === 0 && (
                                <div className="text-center py-8 text-gray-600 bg-gray-900/50 rounded-lg border border-gray-800 border-dashed">
                                    <i className="far fa-clock text-2xl mb-2 block opacity-50"></i>
                                    <span className="text-xs">No entries yet. Start tracking!</span>
                                </div>
                            )}
                            {timeEntries.map(entry => {
                                const project = projects.find(p => p.id === entry.projectId);
                                return (
                                    <div key={entry.id} className="bg-gray-800 rounded-lg p-3 border-l-4 border-gray-700 flex justify-between items-center group hover:bg-gray-750 transition-colors cursor-pointer" style={{ borderLeftColor: project?.color }}>
                                        <div className="overflow-hidden mr-2">
                                            <p className="text-white text-sm font-medium truncate">{entry.description}</p>
                                            <p className="text-gray-500 text-xs flex items-center gap-1">
                                                <span className="w-1.5 h-1.5 rounded-full" style={{ background: project?.color }}></span>
                                                {project?.name}
                                            </p>
                                        </div>
                                        <div className="text-right whitespace-nowrap">
                                            <div className="text-white font-mono text-sm">{formatTime(entry.duration)}</div>
                                            <div className="text-gray-600 text-[10px]">{entry.startTime.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} - {entry.endTime?.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                </main>
            </div>
        </div>
    );
};

export default App;