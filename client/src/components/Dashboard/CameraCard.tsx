import React, { useEffect, useRef, useState } from "react";
import {
  LuVideo,
  LuMaximize,
  LuMinimize,
  LuVolume2,
  LuVolumeX,
  LuCamera,
  LuSignal,
} from "react-icons/lu";
import type { StreamStatus } from "../../hooks/useZegoRoom";

interface CameraCardProps {
  title: string;
  location: string;
  cameraId: string;
  status: StreamStatus;
  stream: MediaStream | null;
  isAlertActive?: boolean;
  onIncident?: (snapshot: {
    frame: string;
    alerts: any[];
    cameraId: string;
    timestamp: Date;
  }) => void;
}

export default function CameraCard({
  title,
  location,
  cameraId,
  status,
  stream,
  isAlertActive = false,
  onIncident,
}: CameraCardProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isMuted, setIsMuted] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [now, setNow] = useState(new Date());
  const [rotation, setRotation] = useState(0);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [complianceScore, setComplianceScore] = useState<number | null>(null);
  const [annotatedFrame, setAnnotatedFrame] = useState<string | null>(null);

  useEffect(() => {
    if (stream && videoRef.current) {
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch((err) => {
        console.warn(
          "Autoplay blocked, user interaction might be needed:",
          err,
        );
      });
    }
  }, [stream, status]);

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
      return;
    }

    // Connect to the Python AI Engine through the Vite Proxy to avoid Mixed Content (https -> ws) blocks
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(
      `${protocol}//${window.location.host}/ws/stream/${cameraId}`,
    );
    wsRef.current = ws;

    const sendFrame = () => {
      if (!videoRef.current || ws.readyState !== WebSocket.OPEN) return;
      const video = videoRef.current;
      if (video.videoWidth === 0) return;

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

      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate((rotation * Math.PI) / 180);

      const scaledVideoWidth = video.videoWidth * scale;
      const scaledVideoHeight = video.videoHeight * scale;
      ctx.drawImage(
        video,
        -scaledVideoWidth / 2,
        -scaledVideoHeight / 2,
        scaledVideoWidth,
        scaledVideoHeight,
      );
      const frameData = canvas.toDataURL("image/jpeg", 0.65);
      ws.send(frameData);
    };

    ws.onopen = () => {
      console.log(`Connected to AI Engine for ${cameraId}`);
    };

    // Send frames fast for the pipeline stream
    const frameInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        sendFrame();
      }
    }, 100); // 10 FPS stream to backend

    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.type === "ALERTS_UPDATE") {
          if (payload.alerts) setAlerts(payload.alerts);
          if (payload.incident_frame) {
            console.log(`Received AI frame for ${cameraId}, length:`, payload.incident_frame.length);
            const event = new CustomEvent(`ai-frame-${cameraId}`, { detail: payload.incident_frame });
            window.dispatchEvent(event);
            if (onIncident && payload.alerts && payload.alerts.length > 0) {
              onIncident({
                frame: payload.incident_frame,
                alerts: payload.alerts,
                cameraId: cameraId,
                timestamp: new Date(),
              });
            }
          }
          if (
            payload.complianceScore !== undefined &&
            payload.complianceScore !== -1
          ) {
            setComplianceScore(payload.complianceScore);
          } else if (payload.complianceScore === -1) {
            setComplianceScore(null);
          }
        }
      } catch (err) {
        console.error("Failed to parse WS message:", err);
      }
    };

    ws.onerror = (e) => console.error(`AI Engine WS Error [${cameraId}]:`, e);

    return () => {
      clearInterval(frameInterval);
      if (ws.readyState === WebSocket.OPEN) ws.close();
    };
  }, [status, stream, cameraId, rotation]);

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    document.fullscreenElement
      ? document.exitFullscreen()
      : containerRef.current.requestFullscreen();
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
        isAlertActive
          ? "border-red-600 shadow-[0_0_20px_rgba(220,38,38,0.5)]"
          : status === "ONLINE"
            ? "border-zinc-700/50 hover:border-zinc-500"
            : "border-zinc-900"
      }`}
    >
      {/* ALERT OVERLAY */}
      {isAlertActive && (
        <div className="absolute inset-0 bg-red-600/10 animate-pulse pointer-events-none z-10" />
      )}

      {/* ACTIVE ALERTS LIST */}
      {alerts.length > 0 && (
        <div className="absolute top-14 left-4 z-30 flex flex-col gap-2 pointer-events-none">
          {alerts.map((alert, idx) => (
            <div
              key={idx}
              className="bg-red-500/90 backdrop-blur text-white px-3 py-1.5 rounded border border-red-400 shadow-lg flex items-center gap-2"
            >
              <span className="text-xl">
                {alert.type === "FIRE_HAZARD" ? "🔥" : "⚠️"}
              </span>
              <div className="flex flex-col">
                <span className="text-[9px] uppercase font-bold tracking-wider opacity-80 leading-none">
                  {alert.type.replace("_", " ")}
                </span>
                <span className="text-sm font-semibold capitalize leading-none mt-1">
                  {alert.class.replace("NO-", "Missing ")}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* COMPLIANCE SCORE OVERLAY */}
      {complianceScore !== null && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-30 bg-zinc-900/90 border border-zinc-700 backdrop-blur-md px-6 py-3 rounded-full flex items-center gap-4 shadow-2xl transition-all duration-300">
          <div className="flex flex-col items-end leading-none">
            <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest">
              Compliance
            </span>
            <span className="text-xs text-zinc-200 font-medium">PPE Scan</span>
          </div>
          <div
            className={`text-3xl font-bold ${
              complianceScore >= 100
                ? "text-emerald-400"
                : complianceScore >= 70
                  ? "text-amber-400"
                  : "text-red-500"
            }`}
          >
            {complianceScore}%
          </div>
        </div>
      )}

      {/* VIDEO AND SVG OVERLAY CONTAINER */}
      {status === "ONLINE" && stream ? (
        <>
          {/* VISIBLE LIVE VIDEO */}
          <div
            className="absolute inset-0 w-full h-full pointer-events-none"
            style={{
              transform: `rotate(${rotation}deg)`,
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
            {status === "ONLINE" && (
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
            )}
            <span
              className="relative inline-flex rounded-full h-2 w-2"
              style={{
                background: status === "ONLINE" ? "#ef4444" : "#52525b",
              }}
            />
          </div>
          <div>
            <h3 className="text-white text-xs font-semibold drop-shadow-md truncate max-w-[150px]">
              {title}
            </h3>
          </div>
        </div>

        <div className="flex flex-col items-end gap-1">
          <span className="text-white/90 font-mono text-[10px] tracking-wider drop-shadow-md bg-black/30 px-1.5 py-0.5 rounded">
            {status === "ONLINE"
              ? now.toLocaleTimeString("en-US", { hour12: false })
              : "--:--:--"}
          </span>
          <span
            className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${
              status === "ONLINE"
                ? "bg-emerald-500/20 text-emerald-400"
                : status === "CONNECTING"
                  ? "bg-amber-500/20 text-amber-400"
                  : "bg-red-500/20 text-red-400"
            }`}
          >
            {status}
          </span>
        </div>
      </div>

      {/* MINIMAL BOTTOM BAR */}
      <div className="absolute bottom-0 inset-x-0 p-3 bg-gradient-to-t from-black/80 to-transparent flex items-end justify-between transition-opacity duration-300 opacity-0 group-hover:opacity-100">
        <div className="flex flex-col">
          <span className="text-zinc-400 text-[9px] uppercase tracking-wider font-semibold">
            {location}
          </span>
          <span className="text-zinc-500 font-mono text-[8px] truncate max-w-[120px]">
            {cameraId}
          </span>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-1.5 opacity-60 group-hover:opacity-100 transition-opacity">
          <button
            onClick={() => setRotation((r) => (r + 90) % 360)}
            disabled={status !== "ONLINE"}
            title="Rotate Camera"
            className="bg-black/40 hover:bg-white/20 text-white px-2 py-1.5 rounded border border-white/10 transition-colors disabled:opacity-30 backdrop-blur-sm text-[9px] font-bold uppercase tracking-wider"
          >
            Rotate
          </button>
          <button
            onClick={takeSnapshot}
            disabled={status !== "ONLINE"}
            className="bg-black/40 hover:bg-white/20 text-white p-1.5 rounded border border-white/10 transition-colors disabled:opacity-30 backdrop-blur-sm"
          >
            <LuCamera className="text-xs" />
          </button>
          <button
            onClick={toggleMute}
            disabled={status !== "ONLINE"}
            className="bg-black/40 hover:bg-white/20 text-white p-1.5 rounded border border-white/10 transition-colors disabled:opacity-30 backdrop-blur-sm"
          >
            {isMuted ? (
              <LuVolumeX className="text-xs" />
            ) : (
              <LuVolume2 className="text-xs" />
            )}
          </button>
          <button
            onClick={toggleFullscreen}
            className="bg-black/40 hover:bg-white/20 text-white p-1.5 rounded border border-white/10 transition-colors backdrop-blur-sm"
          >
            {isFullscreen ? (
              <LuMinimize className="text-xs" />
            ) : (
              <LuMaximize className="text-xs" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
