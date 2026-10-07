import React, { useEffect, useRef, useState } from "react";
import { LuVideo, LuMaximize, LuMinimize, LuVolume2, LuVolumeX, LuCamera, LuSignal } from "react-icons/lu";
import type { StreamStatus } from "../../hooks/useZegoRoom";

interface CameraCardProps {
    title: string;
    location: string;
    cameraId: string;
    status: StreamStatus;
    stream: MediaStream | null;
    isAlertActive?: boolean;
}

export default function CameraCard({ title, location, cameraId, status, stream, isAlertActive = false }: CameraCardProps) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [isMuted, setIsMuted] = useState(true);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [now, setNow] = useState(new Date());
    const [rotation, setRotation] = useState(0);
    const [boxes, setBoxes] = useState<any[]>([]);
    const [videoDims, setVideoDims] = useState({ w: 1920, h: 1080 });

    useEffect(() => {
        if (stream && videoRef.current) {
            videoRef.current.srcObject = stream;
            videoRef.current.play().catch(err => {
                console.warn("Autoplay blocked, user interaction might be needed:", err);
            });
        }
    }, [stream]);

    useEffect(() => {
        const onFsChange = () => setIsFullscreen(!!document.fullscreenElement);
        document.addEventListener("fullscreenchange", onFsChange);
        return () => document.removeEventListener("fullscreenchange", onFsChange);
    }, []);

    // Live clock for the CCTV feel
    useEffect(() => {
        if (status !== "ONLINE") return;
        const timer = setInterval(() => setNow(new Date()), 1000);
        return () => clearInterval(timer);
    }, [status]);

    const wsRef = useRef<WebSocket | null>(null);

    // AI Engine Frame Extraction Loop
    useEffect(() => {
        if (status !== "ONLINE" || !videoRef.current) {
            if (wsRef.current) {
                wsRef.current.close();
                wsRef.current = null;
            }
            setBoxes([]);
            return;
        }

        // Connect to the Python AI Engine
        const ws = new WebSocket(`ws://localhost:8000/ws/stream/${cameraId}`);
        wsRef.current = ws;

        let interval: NodeJS.Timeout;

        ws.onopen = () => {
            console.log(`Connected to AI Engine for ${cameraId}`);
            
            // Start capturing at 3 FPS
            interval = setInterval(() => {
                const video = videoRef.current;
                if (!video || ws.readyState !== WebSocket.OPEN || video.videoWidth === 0) return;

                const canvas = document.createElement("canvas");
                const ctx = canvas.getContext("2d");
                if (!ctx) return;

                // Apply the manual rotation to the AI frame so it analyzes an upright image
                let cw, ch;
                if (rotation % 180 !== 0) {
                    cw = video.videoHeight;
                    ch = video.videoWidth;
                } else {
                    cw = video.videoWidth;
                    ch = video.videoHeight;
                }
                canvas.width = cw;
                canvas.height = ch;
                setVideoDims({ w: cw, h: ch });

                ctx.translate(canvas.width / 2, canvas.height / 2);
                ctx.rotate((rotation * Math.PI) / 180);
                ctx.drawImage(video, -video.videoWidth / 2, -video.videoHeight / 2);

                // Compress heavily to save bandwidth
                const frameData = canvas.toDataURL("image/webp", 0.5);
                ws.send(frameData);
            }, 333); // ~3 FPS
        };

        ws.onmessage = (event) => {
            try {
                const payload = JSON.parse(event.data);
                if (payload.type === "BOUNDING_BOXES" && payload.boxes) {
                    setBoxes(payload.boxes);
                }
            } catch (err) {
                console.error("Failed to parse WS message:", err);
            }
        };

        ws.onerror = (e) => console.error(`AI Engine WS Error [${cameraId}]:`, e);

        return () => {
            clearInterval(interval);
            if (ws.readyState === WebSocket.OPEN) ws.close();
        };
    }, [status, stream, cameraId, rotation]);

    const toggleFullscreen = () => {
        if (!containerRef.current) return;
        document.fullscreenElement ? document.exitFullscreen() : containerRef.current.requestFullscreen();
    };

    const toggleMute = () => {
        if (videoRef.current) {
            videoRef.current.muted = !videoRef.current.muted;
            setIsMuted(videoRef.current.muted);
        }
    };

    const takeSnapshot = () => {
        if (!videoRef.current) return;
        const canvas = document.createElement("canvas");
        canvas.width = videoRef.current.videoWidth;
        canvas.height = videoRef.current.videoHeight;
        const ctx = canvas.getContext("2d");
        if (ctx) {
            ctx.drawImage(videoRef.current, 0, 0);
            const link = document.createElement("a");
            link.href = canvas.toDataURL("image/jpeg");
            link.download = `snapshot_${cameraId}_${Date.now()}.jpg`;
            link.click();
        }
    };

    return (
        <div
            ref={containerRef}
            className={`relative w-full aspect-video bg-black rounded-lg overflow-hidden border-2 transition-all duration-300 group ${
                isAlertActive ? "border-red-600 shadow-[0_0_20px_rgba(220,38,38,0.5)]"
                : status === "ONLINE" ? "border-zinc-700/50 hover:border-zinc-500" 
                : "border-zinc-900"
            }`}
        >
            {/* ALERT OVERLAY */}
            {isAlertActive && (
                <div className="absolute inset-0 bg-red-600/10 animate-pulse pointer-events-none z-10" />
            )}

            {/* VIDEO AND SVG OVERLAY CONTAINER */}
            {status === "ONLINE" && stream ? (
                <>
                    {/* VIDEO CONTAINER (Rotated & Scaled) */}
                    <div 
                        className="absolute inset-0 w-full h-full transition-transform duration-300"
                        style={{
                            transform: `rotate(${rotation}deg) scale(${rotation % 180 !== 0 ? 1.7778 : 1})`,
                        }}
                    >
                        <video
                            ref={videoRef}
                            autoPlay
                            playsInline
                            muted={isMuted}
                            className="absolute inset-0 w-full h-full"
                            style={{ objectFit: "contain", background: "#000" }}
                        />
                    </div>
                    
                    {/* SVG BOUNDING BOXES OVERLAY (Upright, maps to original canvas) */}
                    <svg 
                        viewBox={`0 0 ${videoDims.w} ${videoDims.h}`} 
                        preserveAspectRatio="xMidYMid meet"
                        className="absolute inset-0 w-full h-full pointer-events-none z-10"
                    >
                        {boxes.map((box, idx) => {
                            // Convert percentages to absolute viewBox coordinates for precise SVG rendering
                            const rx = (box.x / 100) * videoDims.w;
                            const ry = (box.y / 100) * videoDims.h;
                            const rw = (box.w / 100) * videoDims.w;
                            const rh = (box.h / 100) * videoDims.h;
                            const strokeW = Math.max(2, videoDims.w * 0.003); // Responsive stroke width
                            const fontS = Math.max(12, videoDims.w * 0.015);  // Responsive font size
                            const labelH = fontS * 1.5;
                            
                            return (
                                <g key={idx}>
                                    {/* Box Border */}
                                    <rect 
                                        x={rx} 
                                        y={ry} 
                                        width={rw} 
                                        height={rh} 
                                        fill="none" 
                                        stroke={box.color} 
                                        strokeWidth={strokeW} 
                                        className="transition-all duration-75"
                                    />
                                    {/* Label Background */}
                                    <rect
                                        x={rx}
                                        y={ry - labelH}
                                        width={rw}
                                        height={labelH}
                                        fill={box.color}
                                        className="transition-all duration-75"
                                    />
                                    {/* Label Text */}
                                    <text 
                                        x={rx + strokeW * 2} 
                                        y={ry - strokeW * 2} 
                                        fill="white" 
                                        fontSize={fontS} 
                                        fontWeight="bold"
                                        className="transition-all duration-75"
                                    >
                                        {box.label}
                                    </text>
                                </g>
                            );
                        })}
                    </svg>
                </>
            ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-950 text-zinc-600">
                    <LuVideo className="text-4xl mb-2 opacity-30" />
                    <p className="text-[10px] font-medium tracking-widest uppercase opacity-50">
                        {status === "CONNECTING" ? "Connecting…" : "Offline"}
                    </p>
                </div>
            )}

            {/* MINIMAL TOP BAR */}
            <div className="absolute top-0 inset-x-0 p-3 bg-gradient-to-b from-black/80 to-transparent flex justify-between items-start pointer-events-none">
                <div className="flex items-center gap-2">
                    {/* Tiny pulsing dot */}
                    <div className="relative flex h-2 w-2">
                        {status === "ONLINE" && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />}
                        <span className="relative inline-flex rounded-full h-2 w-2" style={{ background: status === "ONLINE" ? "#ef4444" : "#52525b" }} />
                    </div>
                    <div>
                        <h3 className="text-white text-xs font-semibold drop-shadow-md truncate max-w-[150px]">{title}</h3>
                    </div>
                </div>
                
                <div className="flex flex-col items-end gap-1">
                    <span className="text-white/90 font-mono text-[10px] tracking-wider drop-shadow-md bg-black/30 px-1.5 py-0.5 rounded">
                        {status === "ONLINE" ? now.toLocaleTimeString('en-US', { hour12: false }) : '--:--:--'}
                    </span>
                    <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${
                        status === "ONLINE" ? "bg-emerald-500/20 text-emerald-400"
                        : status === "CONNECTING" ? "bg-amber-500/20 text-amber-400"
                        : "bg-red-500/20 text-red-400"
                    }`}>
                        {status}
                    </span>
                </div>
            </div>

            {/* MINIMAL BOTTOM BAR */}
            <div className="absolute bottom-0 inset-x-0 p-3 bg-gradient-to-t from-black/80 to-transparent flex items-end justify-between transition-opacity duration-300 opacity-0 group-hover:opacity-100">
                <div className="flex flex-col">
                    <span className="text-zinc-400 text-[9px] uppercase tracking-wider font-semibold">{location}</span>
                    <span className="text-zinc-500 font-mono text-[8px] truncate max-w-[120px]">
                        {cameraId}
                    </span>
                </div>
                
                {/* Controls */}
                <div className="flex items-center gap-1.5 opacity-60 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => setRotation(r => (r + 90) % 360)} disabled={status !== "ONLINE"} title="Rotate Camera"
                        className="bg-black/40 hover:bg-white/20 text-white px-2 py-1.5 rounded border border-white/10 transition-colors disabled:opacity-30 backdrop-blur-sm text-[9px] font-bold uppercase tracking-wider">
                        Rotate
                    </button>
                    <button onClick={takeSnapshot} disabled={status !== "ONLINE"}
                        className="bg-black/40 hover:bg-white/20 text-white p-1.5 rounded border border-white/10 transition-colors disabled:opacity-30 backdrop-blur-sm">
                        <LuCamera className="text-xs" />
                    </button>
                    <button onClick={toggleMute} disabled={status !== "ONLINE"}
                        className="bg-black/40 hover:bg-white/20 text-white p-1.5 rounded border border-white/10 transition-colors disabled:opacity-30 backdrop-blur-sm">
                        {isMuted ? <LuVolumeX className="text-xs" /> : <LuVolume2 className="text-xs" />}
                    </button>
                    <button onClick={toggleFullscreen}
                        className="bg-black/40 hover:bg-white/20 text-white p-1.5 rounded border border-white/10 transition-colors backdrop-blur-sm">
                        {isFullscreen ? <LuMinimize className="text-xs" /> : <LuMaximize className="text-xs" />}
                    </button>
                </div>
            </div>
        </div>
    );
}
