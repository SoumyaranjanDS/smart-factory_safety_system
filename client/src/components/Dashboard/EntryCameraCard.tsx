import React, { useEffect, useRef, useState } from "react";
import { FaShieldAlt, FaCheckCircle, FaTimesCircle, FaIdCard, FaSpinner, FaQrcode } from "react-icons/fa";

interface EntryCameraCardProps {
    streamId: string;
    stream: MediaStream;
}

type KioskState = 'IDLE' | 'ALIGNING' | 'SCANNING' | 'LOCKED';

export default function EntryCameraCard({ streamId, stream }: EntryCameraCardProps) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const wsRef = useRef<WebSocket | null>(null);

    const [videoDims, setVideoDims] = useState({ w: 0, h: 0 });
    const [rawBoxes, setRawBoxes] = useState<any[]>([]);
    const [rawScore, setRawScore] = useState<number | null>(null);
    const [kioskMessage, setKioskMessage] = useState<string | null>(null);
    const [rotation, setRotation] = useState(0);

    // State Machine
    const [kioskState, setKioskState] = useState<KioskState>('IDLE');
    const [scanProgress, setScanProgress] = useState(0);
    const [presenceState, setPresenceState] = useState({ isPresent: false, isAligned: false });
    const [finalResult, setFinalResult] = useState<{ score: number | null, boxes: any[] } | null>(null);
    
    const rawDataRef = useRef({ score: null as number | null, boxes: [] as any[] });

    useEffect(() => {
        if (!stream || !streamId) return;

        if (videoRef.current) {
            videoRef.current.srcObject = stream;
            videoRef.current.play().catch(e => console.warn(e));
        }

        const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
        const ws = new WebSocket(`${protocol}//${window.location.host}/ws/stream/${streamId}`);
        wsRef.current = ws;

        let lastMessageTime = Date.now();

        const sendFrame = () => {
            if (!videoRef.current || ws.readyState !== WebSocket.OPEN) return;
            const video = videoRef.current;
            if (video.videoWidth === 0) {
                setTimeout(() => { if (ws.readyState === WebSocket.OPEN) sendFrame(); }, 100);
                return;
            }

            const MAX_WIDTH = 640;
            const scale = Math.min(1, MAX_WIDTH / video.videoWidth);
            
            const canvas = document.createElement("canvas");
            const ctx = canvas.getContext("2d", { alpha: false });
            if (!ctx) return;

            let cw = video.videoWidth * scale;
            let ch = video.videoHeight * scale;
            if (rotation % 180 !== 0) {
                cw = video.videoHeight * scale;
                ch = video.videoWidth * scale;
            }
            canvas.width = cw;
            canvas.height = ch;

            let actualW = video.videoWidth;
            let actualH = video.videoHeight;
            if (rotation % 180 !== 0) {
                actualW = video.videoHeight;
                actualH = video.videoWidth;
            }
            setVideoDims({ w: actualW, h: actualH });

            ctx.translate(canvas.width / 2, canvas.height / 2);
            ctx.rotate((rotation * Math.PI) / 180);
            
            const scaledVideoWidth = video.videoWidth * scale;
            const scaledVideoHeight = video.videoHeight * scale;
            ctx.drawImage(video, -scaledVideoWidth / 2, -scaledVideoHeight / 2, scaledVideoWidth, scaledVideoHeight);

            ws.send(canvas.toDataURL("image/jpeg", 0.5));
        };

        ws.onopen = () => sendFrame();

        const watchdog = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN && Date.now() - lastMessageTime > 500) {
                sendFrame();
            }
        }, 500);

        ws.onmessage = (event) => {
            lastMessageTime = Date.now();
            try {
                const payload = JSON.parse(event.data);
                if (payload.type === "BOUNDING_BOXES") {
                    const boxes = payload.boxes || [];
                    const score = payload.complianceScore === -1 ? null : payload.complianceScore;
                    
                    setRawBoxes(boxes);
                    setRawScore(score);
                    setKioskMessage(payload.kioskMessage || null);
                    
                    rawDataRef.current = { score, boxes };

                    const isPresent = score !== null;
                    const isAligned = isPresent && !payload.kioskMessage;
                    
                    setPresenceState(prev => 
                        (prev.isPresent === isPresent && prev.isAligned === isAligned) 
                        ? prev 
                        : { isPresent, isAligned }
                    );
                }
            } catch (err) {}
            setTimeout(() => { if (ws.readyState === WebSocket.OPEN) sendFrame(); }, 30);
        };

        return () => {
            clearInterval(watchdog);
            if (ws.readyState === WebSocket.OPEN) ws.close();
        };
    }, [stream, streamId, rotation]);

    // State Machine Effect
    useEffect(() => {
        let interval: any;
        let timeout: any;
        
        if (kioskState === 'IDLE') {
            if (presenceState.isPresent) {
                setKioskState(presenceState.isAligned ? 'SCANNING' : 'ALIGNING');
            }
        } 
        else if (kioskState === 'ALIGNING') {
            if (!presenceState.isPresent) {
                setKioskState('IDLE');
            } else if (presenceState.isAligned) {
                setKioskState('SCANNING');
            }
        }
        else if (kioskState === 'SCANNING') {
            if (!presenceState.isPresent) {
                setKioskState('IDLE');
                setScanProgress(0);
            } else if (!presenceState.isAligned) {
                setKioskState('ALIGNING');
                setScanProgress(0);
            } else {
                let progress = 0;
                interval = setInterval(() => {
                    progress += 4; // 4% every 100ms = 2.5 seconds to scan
                    setScanProgress(progress);
                    if (progress >= 100) {
                        clearInterval(interval);
                        setFinalResult({
                            score: rawDataRef.current.score,
                            boxes: rawDataRef.current.boxes
                        });
                        setKioskState('LOCKED');
                    }
                }, 100);
            }
        }
        else if (kioskState === 'LOCKED') {
            if (!presenceState.isPresent) {
                // Wait just 400ms to prevent 1-frame flickers, but reset quickly when they leave
                timeout = setTimeout(() => {
                    setKioskState('IDLE');
                    setScanProgress(0);
                    setFinalResult(null);
                }, 400);
            }
        }
        
        return () => {
            clearInterval(interval);
            clearTimeout(timeout);
        };
    }, [kioskState, presenceState]);

    const lastSpeechRef = useRef({ text: "", time: 0 });

    const speakText = (text: string, force: boolean = false) => {
        const now = Date.now();
        // Prevent spamming the exact same instruction within 4 seconds
        if (!force && lastSpeechRef.current.text === text && now - lastSpeechRef.current.time < 4000) {
            return;
        }
        
        lastSpeechRef.current = { text, time: now };
        
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        
        // PA System tuning: slightly slower, very clear articulation
        utterance.rate = 0.95; 
        utterance.pitch = 1.1; // Slightly higher pitch for clarity/friendliness
        
        const voices = window.speechSynthesis.getVoices();
        
        // Prioritize high-quality voices (Windows Neural, Chrome, or default Female)
        const preferredVoices = [
            "Microsoft Aria", // High-quality Edge Neural
            "Google UK English Female", // High-quality Chrome
            "Google US English", 
            "Microsoft Zira", // Standard Windows Female
            "Samantha" // macOS
        ];
        
        let selectedVoice = null;
        for (const pref of preferredVoices) {
            selectedVoice = voices.find(v => v.name.includes(pref));
            if (selectedVoice) break;
        }
        
        if (!selectedVoice) {
            selectedVoice = voices.find(v => (v.name.includes("Female") || v.name.includes("female")) && v.lang.startsWith("en")) || voices[0];
        }

        if (selectedVoice) utterance.voice = selectedVoice;

        window.speechSynthesis.speak(utterance);
    };

    const displayBoxes = kioskState === 'LOCKED' && finalResult ? finalResult.boxes : rawBoxes;
    const displayScore = kioskState === 'LOCKED' && finalResult ? finalResult.score : rawScore;

    const hasHardhat = displayBoxes.some(b => (b.label.toLowerCase().includes("hardhat") || b.label.toLowerCase().includes("helmet")) && !b.label.toLowerCase().includes("no-"));
    const hasVest = displayBoxes.some(b => b.label.toLowerCase().includes("vest") && !b.label.toLowerCase().includes("no-"));
    const hasBoots = displayBoxes.some(b => (b.label.toLowerCase().includes("boot") || b.label.toLowerCase().includes("shoe")) && !b.label.toLowerCase().includes("no-"));

    // Voice Announcement Effect (Final Result)
    useEffect(() => {
        if (kioskState === 'LOCKED' && finalResult) {
            const score = finalResult.score;
            const granted = score !== null && score >= 100;
            
            let message = "";
            if (granted) {
                message = "Access granted. Welcome! Please proceed inside.";
            } else {
                let missing = [];
                if (!hasHardhat) missing.push("hardhat");
                if (!hasVest) missing.push("safety vest");
                if (!hasBoots) missing.push("boots");
                
                if (missing.length > 0) {
                    message = `Access denied. You are missing your ${missing.join(" and ")}. Please equip them and try again.`;
                } else {
                    message = "Access denied. Please ensure all safety gear is clearly visible.";
                }
            }
            
            speakText(message, true);
        }
    }, [kioskState, finalResult]);

    // Voice Announcement Effect (Alignment / Adjustments)
    useEffect(() => {
        if (kioskState === 'ALIGNING' && kioskMessage) {
            // Convert "PLEASE STEP BACK" to "Please step back" for natural TTS
            speakText(kioskMessage.toLowerCase(), false);
        }
    }, [kioskState, kioskMessage]);

    const isGranted = displayScore !== null && displayScore >= 100;

    return (
        <div className="col-span-1 md:col-span-2 lg:col-span-3 bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden flex flex-col md:flex-row h-[450px]">
            {/* Camera Feed */}
            <div className="relative flex-1 bg-black overflow-hidden flex items-center justify-center">
                <div 
                    className="absolute inset-0 w-full h-full transition-transform duration-300"
                    style={{ transform: `rotate(${rotation}deg) scale(${rotation % 180 !== 0 ? 1.7778 : 1})` }}
                >
                    <video ref={videoRef} autoPlay playsInline muted className="absolute inset-0 w-full h-full object-contain opacity-60" />
                </div>
                
                {/* HUD Overlay */}
                <svg viewBox={`0 0 ${videoDims.w || 1920} ${videoDims.h || 1080}`} preserveAspectRatio="xMidYMid meet" className="absolute inset-0 w-full h-full pointer-events-none z-10 transition-all duration-300">
                    {displayBoxes.map((box, idx) => {
                        const rx = (box.x / 100) * (videoDims.w || 1920);
                        const ry = (box.y / 100) * (videoDims.h || 1080);
                        const rw = (box.w / 100) * (videoDims.w || 1920);
                        const rh = (box.h / 100) * (videoDims.h || 1080);
                        return (
                            <g key={idx}>
                                <rect x={rx} y={ry} width={rw} height={rh} fill="none" stroke={box.color} strokeWidth="2" rx="4" className="transition-all duration-300" />
                            </g>
                        );
                    })}
                </svg>

                {/* FaceID Style Center Crosshair */}
                <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
                    <div className={`relative w-64 h-80 border-2 rounded-3xl transition-all duration-500 flex items-center justify-center
                        ${kioskState === 'IDLE' ? 'border-zinc-500/30 border-dashed scale-95' : 
                          kioskState === 'ALIGNING' ? 'border-yellow-500/80 shadow-[0_0_20px_rgba(234,179,8,0.3)] scale-100' : 
                          kioskState === 'SCANNING' ? 'border-blue-500/80 shadow-[0_0_30px_rgba(59,130,246,0.4)] scale-105' :
                          isGranted ? 'border-emerald-500/80 shadow-[0_0_40px_rgba(16,185,129,0.5)] scale-100 bg-emerald-500/10' :
                          'border-red-500/80 shadow-[0_0_40px_rgba(239,68,68,0.5)] scale-100 bg-red-500/10'}`}
                    >
                        {kioskState === 'IDLE' && (
                            <div className="flex flex-col items-center opacity-50">
                                <FaQrcode className="text-4xl mb-2" />
                                <span className="text-xs font-mono uppercase tracking-widest text-center mt-2">Waiting for<br/>new person...</span>
                            </div>
                        )}
                        {kioskState === 'ALIGNING' && (
                            <div className="absolute -bottom-10 bg-yellow-500 text-zinc-950 px-4 py-1 rounded-full text-xs font-bold uppercase tracking-widest shadow-lg animate-pulse">
                                {kioskMessage || "ADJUST POSITION"}
                            </div>
                        )}
                        {kioskState === 'SCANNING' && (
                            <>
                                <div className="absolute top-0 left-0 right-0 h-1 bg-blue-400 shadow-[0_0_15px_#60a5fa] transition-all duration-100 ease-linear" style={{ top: `${scanProgress}%` }} />
                                <div className="absolute -bottom-10 bg-blue-500 text-white px-4 py-1 rounded-full text-xs font-bold uppercase tracking-widest shadow-lg">
                                    SCANNING {Math.round(scanProgress)}%
                                </div>
                            </>
                        )}
                        {kioskState === 'LOCKED' && (
                            <div className="absolute -bottom-16 flex flex-col items-center gap-2 w-max">
                                <div className={`px-5 py-2 rounded-full text-sm font-bold uppercase tracking-widest shadow-lg text-white
                                    ${isGranted ? 'bg-emerald-500 shadow-[0_0_20px_rgba(16,185,129,0.5)]' : 
                                      'bg-red-500 shadow-[0_0_20px_rgba(239,68,68,0.5)]'}`}>
                                    {isGranted ? 'ACCESS GRANTED' : 'ACCESS DENIED'}
                                </div>
                                <div className={`text-xs font-bold uppercase tracking-widest bg-zinc-950/80 px-4 py-1.5 rounded-full border border-zinc-800 backdrop-blur-md
                                    ${isGranted ? 'text-emerald-400' : 'text-red-400'}`}>
                                    {isGranted ? 'Welcome! Please proceed inside.' : 
                                     'Please equip missing gear and try again!'}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Smart Side Panel */}
            <div className="w-full md:w-80 bg-zinc-950 border-l border-zinc-800 p-6 flex flex-col justify-between shrink-0">
                <div>
                    <div className="flex items-center gap-2 mb-6 text-emerald-500">
                        <FaShieldAlt className="text-2xl" />
                        <h2 className="text-sm font-bold tracking-widest uppercase">Entry Control</h2>
                    </div>

                    <div className="space-y-3 mb-6">
                        <div className="flex items-center justify-between text-sm">
                            <span className="text-zinc-400 font-mono">Status</span>
                            <span className={`font-bold uppercase tracking-wider
                                ${kioskState === 'IDLE' ? 'text-zinc-500' : 
                                  kioskState === 'ALIGNING' ? 'text-yellow-500' : 
                                  kioskState === 'SCANNING' ? 'text-blue-400' : 
                                  isGranted ? 'text-emerald-400' : 'text-red-400'}`}>
                                {kioskState}
                            </span>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                            <span className="text-zinc-400 font-mono">Compliance</span>
                            <span className={`font-mono text-lg transition-colors
                                ${displayScore === null ? 'text-zinc-500' : 
                                  isGranted ? 'text-emerald-400' : 'text-red-400'}`}>
                                {displayScore !== null ? `${displayScore}%` : '--%'}
                            </span>
                        </div>
                    </div>

                    {/* Minimalist Checklist */}
                    <div className="space-y-2">
                        {[
                            { label: 'Hardhat', active: hasHardhat },
                            { label: 'Safety Vest', active: hasVest },
                            { label: 'Work Boots', active: hasBoots },
                        ].map(item => (
                            <div key={item.label} className={`flex items-center justify-between p-2 rounded border text-sm transition-all duration-300
                                ${kioskState === 'IDLE' ? 'bg-zinc-900 border-zinc-800 text-zinc-600' :
                                  item.active ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-red-500/5 border-red-500/20 text-red-400'}`}>
                                <span className="font-mono tracking-wide">{item.label}</span>
                                {kioskState === 'IDLE' ? <FaCheckCircle className="opacity-10" /> :
                                 item.active ? <FaCheckCircle /> : <FaTimesCircle className="opacity-50" />}
                            </div>
                        ))}
                    </div>
                </div>

                {/* Camera Controls */}
                <div className="mt-4 flex items-center justify-between text-sm bg-zinc-900 border border-zinc-800 rounded p-2">
                    <span className="text-zinc-400 font-mono text-xs">Camera Orientation</span>
                    <button 
                        onClick={() => setRotation(r => (r + 90) % 360)}
                        className="bg-zinc-800 hover:bg-zinc-700 text-xs px-3 py-1.5 rounded transition-colors uppercase font-bold tracking-wider flex items-center gap-2"
                    >
                        Rotate 90°
                    </button>
                </div>

                {/* Final Decision Button/Status */}
                <div className="mt-4 flex flex-col gap-2">
                    <div className={`p-4 rounded-lg flex items-center justify-center gap-3 transition-colors duration-500
                        ${kioskState !== 'LOCKED' ? 'bg-zinc-900 text-zinc-600' : 
                        isGranted ? 'bg-emerald-500 text-white shadow-[0_0_20px_rgba(16,185,129,0.3)]' : 
                        'bg-red-500 text-white shadow-[0_0_20px_rgba(239,68,68,0.3)]'}`}
                    >
                        {kioskState !== 'LOCKED' ? <FaSpinner className={`animate-spin ${kioskState === 'SCANNING' ? 'text-blue-500' : 'opacity-20'}`} /> : <FaIdCard className="text-xl" />}
                        <span className="font-bold tracking-widest text-sm uppercase">
                            {kioskState !== 'LOCKED' ? "Analyzing" : isGranted ? "GATE OPEN" : "GATE LOCKED"}
                        </span>
                    </div>

                    <div className={`text-xs text-center font-mono transition-opacity duration-500 ${kioskState === 'LOCKED' ? 'opacity-100 text-zinc-400' : 'opacity-0'}`}>
                        Please move away for the next scan.
                    </div>
                </div>
            </div>
        </div>
    );
}
