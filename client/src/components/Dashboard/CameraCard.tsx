import React, { useEffect, useRef, useState } from "react";
import { LuVideo, LuMaximize, LuVolume2, LuVolumeX, LuCamera } from "react-icons/lu";
import type { StreamStatus } from "../../hooks/useZegoRoom";

interface CameraCardProps {
    title: string;
    location: string;
    cameraId: string;
    status: StreamStatus;
    stream: MediaStream | null;
}

export default function CameraCard({ title, location, cameraId, status, stream }: CameraCardProps) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [isMuted, setIsMuted] = useState(true);

    useEffect(() => {
        if (stream && videoRef.current) {
            videoRef.current.srcObject = stream;
        }
    }, [stream]);

    const toggleFullscreen = () => {
        if (!containerRef.current) return;
        if (document.fullscreenElement) {
            document.exitFullscreen();
        } else {
            containerRef.current.requestFullscreen();
        }
    };

    const toggleMute = () => {
        if (videoRef.current) {
            videoRef.current.muted = !videoRef.current.muted;
            setIsMuted(videoRef.current.muted);
        }
    };

    const takeSnapshot = () => {
        if (videoRef.current) {
            const canvas = document.createElement("canvas");
            canvas.width = videoRef.current.videoWidth;
            canvas.height = videoRef.current.videoHeight;
            const ctx = canvas.getContext("2d");
            if (ctx) {
                ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
                const dataURL = canvas.toDataURL("image/jpeg");
                const link = document.createElement("a");
                link.href = dataURL;
                link.download = `snapshot_${cameraId}_${Date.now()}.jpg`;
                link.click();
            }
        }
    };

    const statusBadge = {
        ONLINE: <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded text-xs font-bold flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div>ONLINE</span>,
        CONNECTING: <span className="bg-amber-500/10 text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded text-xs font-bold flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></div>CONNECTING</span>,
        OFFLINE: <span className="bg-red-500/10 text-red-400 border border-red-500/30 px-2 py-0.5 rounded text-xs font-bold flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-red-500"></div>OFFLINE</span>,
    }[status || 'OFFLINE'];

    return (
        <div ref={containerRef} className="bg-zinc-900 rounded-xl overflow-hidden border border-zinc-800 flex flex-col transition-all duration-300">
            {/* Header */}
            <div className="flex justify-between items-center px-4 py-2 bg-zinc-900 border-b border-zinc-800 z-10 shrink-0">
                <div>
                    <h3 className="text-white font-medium flex items-center gap-2">
                        {title}
                        <span className="text-zinc-500 text-xs px-1.5 py-0.5 bg-zinc-800 rounded">{cameraId}</span>
                    </h3>
                    <p className="text-zinc-400 text-xs mt-0.5">{location}</p>
                </div>
                <div>
                    {statusBadge}
                </div>
            </div>

            {/* Video Viewport (16:9 Aspect Ratio) */}
            <div className="relative w-full aspect-video bg-zinc-950 flex items-center justify-center overflow-hidden">
                {status === 'ONLINE' && stream ? (
                    <video 
                        ref={videoRef} 
                        autoPlay 
                        playsInline 
                        muted={isMuted}
                        className="w-full h-full object-contain bg-black"
                    />
                ) : (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-950 text-zinc-600">
                        {/* Crosshair Pattern */}
                        <div className="absolute inset-0 opacity-20 bg-[linear-gradient(rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.05)_1px,transparent_1px)] bg-[size:20px_20px]"></div>
                        <LuVideo className="text-4xl mb-3 opacity-50 z-10" />
                        <p className="text-sm font-medium tracking-wide uppercase z-10 text-center px-4">
                            {status === 'CONNECTING' ? 'Establishing Connection...' : 'Stream Offline — Awaiting Source Signal'}
                        </p>
                    </div>
                )}
            </div>
            
            {/* Action Toolbar */}
            <div className="flex justify-between items-center bg-zinc-900 border-t border-zinc-800 px-4 py-2 shrink-0">
                <div className="flex items-center gap-4 text-xs text-zinc-500 font-mono">
                    <span>{status === 'ONLINE' ? 'LIVE' : 'STANDBY'}</span>
                </div>
                <div className="flex items-center gap-3">
                    <button onClick={takeSnapshot} disabled={status !== 'ONLINE'} className="text-zinc-400 hover:text-white disabled:opacity-30 transition-colors" title="Snapshot">
                        <LuCamera className="text-lg" />
                    </button>
                    <button onClick={toggleMute} disabled={status !== 'ONLINE'} className="text-zinc-400 hover:text-white disabled:opacity-30 transition-colors" title="Toggle Audio">
                        {isMuted ? <LuVolumeX className="text-lg" /> : <LuVolume2 className="text-lg" />}
                    </button>
                    <button onClick={toggleFullscreen} className="text-zinc-400 hover:text-white transition-colors" title="Fullscreen">
                        <LuMaximize className="text-lg" />
                    </button>
                </div>
            </div>
        </div>
    );
}