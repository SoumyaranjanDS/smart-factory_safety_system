import React from "react";
import Sidebar from "../components/Dashboard/Sidebar";
import CameraGrid from "../components/Dashboard/CameraGrid";
import AiStreamViewer from "../components/Dashboard/AiStreamViewer";
import { LuCircleUser, LuSignal, LuVideo } from "react-icons/lu";
import { useZegoRoom } from "../hooks/useZegoRoom";

const appID = Number(import.meta.env.VITE_ZEGO_APP_ID);
const serverURL = import.meta.env.VITE_ZEGO_SERVER_URL || '';
const roomID = import.meta.env.VITE_ZEGO_ROOM_ID || 'factory_monitoring';
const token = import.meta.env.VITE_ZEGO_TEST_TOKEN || '';

export default function Dashboard() {
    const { roomStatus, streams, streamStates, isPublishing, togglePublish } = useZegoRoom(appID, serverURL, roomID, token);

    // Track which cameras currently have an active alert
    const [alertingCameras, setAlertingCameras] = React.useState<Record<string, { critical: boolean, warning: boolean }>>({});
    
    // Store recent incidents with frames
    const [incidents, setIncidents] = React.useState<{ id: string, frame: string, alerts: any[], cameraId: string, timestamp: Date }[]>([]);

    const handleIncident = React.useCallback((snapshot: { frame: string, alerts: any[], cameraId: string, timestamp: Date }) => {
        setIncidents(prev => {
            // Find the most recent incident for THIS camera
            const lastCamIncident = prev.find(i => i.cameraId === snapshot.cameraId);
            if (lastCamIncident) {
                const timeDiff = snapshot.timestamp.getTime() - lastCamIncident.timestamp.getTime();
                
                // If it's been less than 60 seconds since the last alert for this camera
                if (timeDiff < 60000) {
                    // Check if the exact same violations are being triggered
                    const oldClasses = Array.from(new Set(lastCamIncident.alerts.map(a => a.class))).sort().join(",");
                    const newClasses = Array.from(new Set(snapshot.alerts.map((a: any) => a.class))).sort().join(",");
                    
                    // If the alerts are identical, suppress this duplicate snapshot
                    if (oldClasses === newClasses) {
                        return prev;
                    }
                }
            }
            return [{ id: Math.random().toString(36).substring(7), ...snapshot }, ...prev].slice(0, 50); // keep last 50
        });
    }, []);

    React.useEffect(() => {
        const eventSource = new EventSource("/api/alerts/stream");

        eventSource.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data.cameraId && data.alerts && data.alerts.length > 0) {
                    const hasCritical = data.alerts.some((a: any) => a.type === "FIRE_HAZARD");
                    const hasWarning = data.alerts.some((a: any) => a.type === "PPE_VIOLATION");
                    
                    setAlertingCameras(prev => ({
                        ...prev,
                        [data.cameraId]: { critical: hasCritical, warning: hasWarning }
                    }));
                    
                    // Clear after 3s if no new alerts
                    setTimeout(() => {
                        setAlertingCameras(prev => {
                            const current = prev[data.cameraId];
                            if (!current) return prev;
                            return { ...prev, [data.cameraId]: { critical: false, warning: false } };
                        });
                    }, 3000);
                }
            } catch (err) {}
        };

        return () => eventSource.close();
    }, []);

    const activeCritical = Object.values(alertingCameras).filter(c => c.critical).length;
    const activeWarnings = Object.values(alertingCameras).filter(c => c.warning).length;
    
    // Overall system health calculation based on active issues
    const totalCameras = Math.max(1, Object.keys(streams).length);
    const healthDrop = ((activeCritical * 20) + (activeWarnings * 5)) / totalCameras;
    const systemHealth = Math.max(0, 100 - Math.round(healthDrop));

    return (
        <div className="flex h-screen bg-zinc-950 text-zinc-200 overflow-hidden font-sans">
            <Sidebar />
            
            <main className="flex-1 flex flex-col h-screen overflow-hidden bg-zinc-950">
                {/* Header */}
                <header className="h-16 flex items-center justify-between px-8 border-b border-zinc-800 bg-zinc-900/50 backdrop-blur shrink-0">
                    <div>
                        <h1 className="text-xl font-semibold text-white">Live Monitoring</h1>
                        <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-xs text-zinc-400 flex items-center gap-1">
                                <LuSignal className={roomStatus === 'CONNECTED' ? 'text-emerald-500' : 'text-zinc-500'} />
                                {roomStatus === 'CONNECTED' ? 'Room Connected' : roomStatus}
                            </span>
                            <span className="text-xs text-zinc-500 font-mono">| {roomID}</span>
                        </div>
                    </div>
                    
                    <div className="flex items-center gap-6">
                        {/* Test Mode Toggle */}
                        <button 
                            onClick={() => togglePublish('camera_01')}
                            disabled={roomStatus !== 'CONNECTED'}
                            className={`px-4 py-1.5 rounded text-sm font-medium transition-colors border flex items-center gap-2 ${
                                roomStatus !== 'CONNECTED' 
                                ? 'opacity-50 cursor-not-allowed bg-zinc-800 border-zinc-700 text-zinc-500' 
                                : isPublishing 
                                ? 'bg-red-500/10 text-red-400 border-red-500/50 hover:bg-red-500/20' 
                                : 'bg-blue-600/10 hover:bg-blue-600/20 text-blue-400 border-blue-500/50'
                            }`}
                        >
                            <LuVideo />
                            {isPublishing ? 'Stop Test Camera' : 'Start Test Camera'}
                        </button>

                        <div className="flex items-center gap-3 border-l border-zinc-800 pl-6">
                            <div className="text-right hidden sm:block">
                                <p className="text-sm font-medium text-white">Admin User</p>
                                <p className="text-xs text-zinc-400">Safety Officer</p>
                            </div>
                            <LuCircleUser className="text-3xl text-zinc-400" />
                        </div>
                    </div>
                </header>

                {/* Main Content Area */}
                <div className="flex-1 overflow-hidden flex flex-row">
                    
                    <div className="flex-1 overflow-hidden flex flex-col">
                        {/* Status Overview Cards - Kept for Dashboard Context */}
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-6 pb-2 shrink-0">
                            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex items-center gap-4">
                                <div className="w-12 h-12 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-500">
                                    <span className="text-xl font-bold">{Object.keys(streams).length}</span>
                                </div>
                                <div>
                                    <p className="text-zinc-400 text-sm">Active Cameras</p>
                                    <p className="text-white font-semibold">Online</p>
                                </div>
                            </div>
                            <div className={`bg-zinc-900 border ${activeCritical > 0 ? 'border-red-500/50 shadow-[0_0_15px_rgba(239,68,68,0.2)]' : 'border-zinc-800'} rounded-xl p-4 flex items-center gap-4 transition-all`}>
                                <div className={`w-12 h-12 rounded-full flex items-center justify-center ${activeCritical > 0 ? 'bg-red-500/20 text-red-500 animate-pulse' : 'bg-emerald-500/10 text-emerald-500'}`}>
                                    <span className="text-xl font-bold">{activeCritical}</span>
                                </div>
                                <div>
                                    <p className="text-zinc-400 text-sm">Active Critical</p>
                                    <p className={`${activeCritical > 0 ? 'text-red-400' : 'text-white'} font-semibold`}>Fire / Hazards</p>
                                </div>
                            </div>
                            <div className={`bg-zinc-900 border ${activeWarnings > 0 ? 'border-amber-500/50 shadow-[0_0_15px_rgba(245,158,11,0.2)]' : 'border-zinc-800'} rounded-xl p-4 flex items-center gap-4 transition-all`}>
                                <div className={`w-12 h-12 rounded-full flex items-center justify-center ${activeWarnings > 0 ? 'bg-amber-500/20 text-amber-500 animate-pulse' : 'bg-amber-500/10 text-amber-500'}`}>
                                    <span className="text-xl font-bold">{activeWarnings}</span>
                                </div>
                                <div>
                                    <p className="text-zinc-400 text-sm">Active Warnings</p>
                                    <p className={`${activeWarnings > 0 ? 'text-amber-400' : 'text-white'} font-semibold`}>Missing PPE</p>
                                </div>
                            </div>
                            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex items-center gap-4">
                                <div className={`w-12 h-12 rounded-full flex items-center justify-center ${systemHealth < 80 ? 'bg-red-500/10 text-red-500' : systemHealth < 95 ? 'bg-amber-500/10 text-amber-500' : 'bg-purple-500/10 text-purple-500'}`}>
                                    <span className="text-xl font-bold">{systemHealth}%</span>
                                </div>
                                <div>
                                    <p className="text-zinc-400 text-sm">System Health</p>
                                    <p className={`${systemHealth < 80 ? 'text-red-400' : systemHealth < 95 ? 'text-amber-400' : 'text-white'} font-semibold`}>{systemHealth < 80 ? 'Critical' : systemHealth < 95 ? 'Degraded' : 'Optimal'}</p>
                                </div>
                            </div>
                        </div>

                        <CameraGrid streams={streams} streamStates={streamStates} alertingCameras={alertingCameras} onIncident={handleIncident} />
                    </div>

                    {/* NEW INCIDENT FEED PANEL */}
                    <div className="w-80 bg-zinc-900/40 border-l border-zinc-800 flex flex-col shrink-0 hidden lg:flex">
                        <div className="p-4 border-b border-zinc-800 bg-zinc-900/60 sticky top-0 z-10 backdrop-blur">
                            <h2 className="text-sm font-semibold text-white uppercase tracking-wider flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
                                Incident & AI Feed
                            </h2>
                            <p className="text-xs text-zinc-500 mt-1">Live AI processing & alerts</p>
                        </div>
                        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-6">
                            {/* Live AI Streams for all active cameras */}
                            <div className="flex flex-col gap-4">
                                {Object.keys(streams).map((cameraId) => {
                                    const cleanName = cameraId.split('_').slice(0, -1).join(' ') || cameraId;
                                    return (
                                        <AiStreamViewer key={`ai-${cameraId}`} cameraId={cameraId} title={cleanName} />
                                    );
                                })}
                            </div>

                            <hr className="border-zinc-800" />
                            
                            <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Recent Snapshots</h3>
                            
                            <div className="flex flex-col gap-4">
                                {incidents.length === 0 ? (
                                    <div className="text-center text-zinc-600 text-sm py-4">
                                        No violations detected yet.
                                    </div>
                                ) : (
                                    incidents.map((incident) => {
                                        const cleanName = incident.cameraId.split('_').slice(0, -1).join(' ') || incident.cameraId;
                                        return (
                                        <div key={incident.id} className="bg-zinc-950 border border-zinc-800 rounded-lg overflow-hidden shadow-lg animate-in fade-in slide-in-from-right-4">
                                            <div className="relative aspect-video border-b border-zinc-800">
                                                <img src={incident.frame} alt="Incident Snapshot" className="w-full h-full object-cover" />
                                                <div className="absolute top-2 right-2 bg-black/60 backdrop-blur-sm px-2 py-1 rounded text-[9px] font-mono text-zinc-300 flex items-center gap-1.5">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse"></span>
                                                    DETECTED
                                                </div>
                                            </div>
                                            <div className="p-3 bg-zinc-900/50">
                                                <div className="flex items-start justify-between mb-3">
                                                    <div>
                                                        <h4 className="text-xs font-bold text-white uppercase tracking-wider">{cleanName}</h4>
                                                        <p className="text-[10px] text-zinc-400 font-mono mt-0.5">ID: {incident.cameraId}</p>
                                                    </div>
                                                    <div className="text-right">
                                                        <span className="text-[10px] font-bold text-zinc-300 block">{incident.timestamp.toLocaleDateString()}</span>
                                                        <span className="text-xs font-mono text-zinc-500 block">{incident.timestamp.toLocaleTimeString()}</span>
                                                    </div>
                                                </div>
                                                
                                                <div className="space-y-2">
                                                    <p className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest border-b border-zinc-800 pb-1">Violations Triggered</p>
                                                    <div className="flex flex-col gap-1.5">
                                                        {incident.alerts.map((alert: any, i: number) => (
                                                            <div key={i} className={`flex items-center justify-between px-2 py-1.5 rounded text-xs border ${
                                                                alert.type === 'FIRE_HAZARD' 
                                                                ? 'bg-red-500/10 border-red-500/30 text-red-400' 
                                                                : 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                                                            }`}>
                                                                <span className="font-bold uppercase tracking-wider flex items-center gap-2">
                                                                    {alert.type === 'FIRE_HAZARD' ? '🔥' : '⚠️'}
                                                                    {alert.class.replace("NO-", "Missing ")}
                                                                </span>
                                                                <span className="font-mono text-[10px] opacity-70">
                                                                    {(alert.confidence * 100).toFixed(0)}% CONF
                                                                </span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    )})
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
}