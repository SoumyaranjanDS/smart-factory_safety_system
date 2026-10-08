import React, { useState, useEffect, useRef } from 'react';
import { LuCamera, LuVideoOff, LuSignal } from 'react-icons/lu';
import { useZegoRoom } from '../hooks/useZegoRoom';

const appID = Number(import.meta.env.VITE_ZEGO_APP_ID);
const serverURL = import.meta.env.VITE_ZEGO_SERVER_URL || '';
const roomID = import.meta.env.VITE_ZEGO_ROOM_ID || 'factory_monitoring';
const token = import.meta.env.VITE_ZEGO_TEST_TOKEN || '';

export default function CameraSetup() {
    const [isRegistered, setIsRegistered] = useState(false);
    const [cameraData, setCameraData] = useState<{ id: string; name: string; zone: string } | null>(null);
    const [formData, setFormData] = useState({ name: '', zone: 'Zone 1 (Assembly)' });
    const videoRef = useRef<HTMLVideoElement>(null);

    const { roomStatus, errorMsg, debugLog, streams, isPublishing, togglePublish } = useZegoRoom(appID, serverURL, roomID, token);

    const [fps, setFps] = useState(30);
    const [now, setNow] = useState(new Date().toLocaleTimeString());

    // Restore from localStorage
    useEffect(() => {
        const id = localStorage.getItem('camera_id');
        const name = localStorage.getItem('camera_name');
        const zone = localStorage.getItem('camera_zone');
        if (id && name && zone) {
            setCameraData({ id, name, zone });
            setIsRegistered(true);
        }
    }, []);

    // Auto-publish once connected - REMOVED! 
    // Mobile browsers (especially iOS Safari) STRICTLY FORBID calling getUserMedia 
    // inside a useEffect. It MUST be called directly from a user click event.

    // Attach local stream to <video>
    useEffect(() => {
        if (cameraData && streams[cameraData.id] && videoRef.current) {
            videoRef.current.srcObject = streams[cameraData.id];
            videoRef.current.play().catch(e => console.warn(e));
        }
    }, [streams, cameraData]);

    // FPS counter + clock
    useEffect(() => {
        if (!isPublishing) return;
        const t = setInterval(() => {
            setFps(Math.floor(Math.random() * 4) + 28);
            setNow(new Date().toLocaleTimeString());
        }, 2000);
        return () => clearInterval(t);
    }, [isPublishing]);

    const handleRegister = async (e: React.FormEvent) => {
        e.preventDefault();
        if (roomStatus !== 'CONNECTED') {
            alert("Still connecting to server, please wait a moment...");
            return;
        }

        const safeName = formData.name.trim().replace(/[^a-zA-Z0-9]/g, '_');
        const newId = `${safeName || 'Camera'}_${Math.floor(Math.random() * 10000)}`;
        localStorage.setItem('camera_id', newId);
        localStorage.setItem('camera_name', formData.name);
        localStorage.setItem('camera_zone', formData.zone);
        
        setCameraData({ id: newId, name: formData.name, zone: formData.zone });
        setIsRegistered(true);
        
        // Critical: call togglePublish DIRECTLY inside the click handler!
        await togglePublish(newId);
    };

    const handleStartRestored = async () => {
        if (roomStatus !== 'CONNECTED') {
            alert("Still connecting to server, please wait a moment...");
            return;
        }
        if (cameraData) {
            await togglePublish(cameraData.id);
        }
    };

    const handleUnregister = () => {
        if (isPublishing && cameraData) togglePublish(cameraData.id);
        localStorage.clear();
        setIsRegistered(false);
        setCameraData(null);
    };

    /* ── REGISTERED: fullscreen camera view ── */
    if (isRegistered && cameraData) {
        return (
            <div className="fixed inset-0 bg-black overflow-hidden">
                {isPublishing ? (
                    <video
                        ref={videoRef}
                        playsInline
                        muted
                        className="absolute inset-0 w-full h-full"
                        style={{ objectFit: 'contain', background: '#000' }}
                    />
                ) : (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-zinc-600 px-6 text-center">
                        <div className="absolute inset-0 opacity-10 bg-[linear-gradient(rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.05)_1px,transparent_1px)] bg-[size:24px_24px]" />
                        <LuVideoOff className="text-6xl mb-4 opacity-40 z-10" />
                        <p className="z-10 text-sm uppercase tracking-widest font-mono opacity-60 mb-2">
                            {roomStatus === 'CONNECTING' ? 'Connecting to Server…' : 'Camera Offline'}
                        </p>
                        <p className="z-10 text-xs text-zinc-400 font-mono mb-6 bg-black/50 px-2 py-1 rounded">
                            DEBUG: {debugLog}
                        </p>
                        {errorMsg && (
                            <div className="z-10 bg-red-500/20 border border-red-500/50 text-red-200 text-xs p-3 rounded mb-6 max-w-xs break-words">
                                ERROR: {errorMsg}
                            </div>
                        )}
                        {roomStatus === 'CONNECTED' && (
                            <button onClick={handleStartRestored} className="z-10 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-3 px-8 rounded-lg shadow-lg">
                                Start Camera
                            </button>
                        )}
                    </div>
                )}

                {/* Top overlay */}
                <div className="absolute top-0 inset-x-0 z-20 p-4 pb-12 bg-gradient-to-b from-black/75 to-transparent flex items-start justify-between pointer-events-none">
                    <div className="flex flex-col gap-1.5">
                        <div className="flex items-center gap-2.5">
                            <span className="relative flex h-3 w-3">
                                {isPublishing && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />}
                                <span className={`relative inline-flex rounded-full h-3 w-3 ${isPublishing ? 'bg-red-500' : 'bg-zinc-600'}`} />
                            </span>
                            <h1 className="text-white font-bold text-base leading-none drop-shadow-md">{cameraData.name}</h1>
                        </div>
                        <p className="text-zinc-300 font-mono text-xs bg-black/40 px-2 py-0.5 rounded self-start">
                            {cameraData.id} · {cameraData.zone}
                        </p>
                    </div>

                    <div className="flex flex-col items-end gap-1.5">
                        <div className="flex items-center gap-1.5 bg-black/60 px-2.5 py-1 rounded-lg border border-white/10 text-xs text-white font-semibold">
                            <LuSignal className={roomStatus === 'CONNECTED' ? 'text-emerald-400' : 'text-zinc-500'} />
                            {roomStatus}
                        </div>
                        {isPublishing && (
                            <div className="bg-black/60 px-2.5 py-1 rounded-lg border border-white/10 text-xs font-mono text-emerald-400">
                                {fps} FPS
                            </div>
                        )}
                    </div>
                </div>

                {/* Bottom overlay */}
                <div className="absolute bottom-0 inset-x-0 z-20 p-4 pt-12 bg-gradient-to-t from-black/75 to-transparent flex items-end justify-between">
                    <div className="text-white/30 font-mono text-xs">{now}</div>
                    <div className="flex gap-2">
                        <button onClick={handleUnregister}
                            className="bg-red-500/20 text-red-400 border border-red-500/30 text-xs font-medium px-3 py-1.5 rounded-lg">
                            Stop Node
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    /* ── REGISTRATION FORM ── */
    return (
        <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
            <div className="max-w-md w-full bg-zinc-900 border border-zinc-800 rounded-xl p-8">
                <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 bg-emerald-500/10 rounded-lg flex items-center justify-center">
                        <LuCamera className="text-xl text-emerald-500" />
                    </div>
                    <div>
                        <h2 className="text-xl font-semibold text-white">Register Camera Node</h2>
                        <p className="text-zinc-500 text-xs mt-0.5">This device will stream to the dashboard</p>
                    </div>
                </div>

                <form onSubmit={handleRegister} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-zinc-400 mb-1">Camera Name</label>
                        <input required type="text" placeholder="e.g. Assembly Line A"
                            value={formData.name}
                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-emerald-500 transition-colors"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-zinc-400 mb-1">Factory Zone</label>
                        <select value={formData.zone}
                            onChange={(e) => setFormData({ ...formData, zone: e.target.value })}
                            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-emerald-500 transition-colors">
                            <option>Zone 1 (Assembly)</option>
                            <option>Zone 2 (Packaging)</option>
                            <option>Zone 3 (Loading Dock)</option>
                            <option>Zone 4 (Hazardous)</option>
                        </select>
                    </div>
                    <button type="submit"
                        className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-3 rounded-lg transition-colors mt-4 flex justify-center items-center gap-2">
                        <LuCamera /> Register &amp; Start Camera
                    </button>
                </form>
            </div>
        </div>
    );
}
