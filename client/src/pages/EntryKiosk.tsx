import { useEffect, useRef, useState } from "react";
import { useZegoRoom } from "../hooks/useZegoRoom";
import {
  FaShieldAlt,
  FaQrcode,
  FaUnlock,
  FaLock,
  FaCheckCircle,
  FaTimesCircle,
} from "react-icons/fa";

const appID = Number(import.meta.env.VITE_ZEGO_APP_ID);
const serverURL = import.meta.env.VITE_ZEGO_SERVER_URL || "";
const roomID = import.meta.env.VITE_ZEGO_ROOM_ID || "factory_monitoring";
const token = import.meta.env.VITE_ZEGO_TEST_TOKEN || "";

export default function EntryKiosk() {
  const { roomStatus, streams } = useZegoRoom(appID, serverURL, roomID, token);
  const videoRef = useRef<HTMLVideoElement>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const [boxes, setBoxes] = useState<any[]>([]);
  const [complianceScore, setComplianceScore] = useState<number | null>(null);
  const [kioskMessage, setKioskMessage] = useState<string | null>(null);
  const [videoDims, setVideoDims] = useState({ w: 1920, h: 1080 });

  // Find the first entry camera stream
  const entryStreamId = Object.keys(streams).find((id) =>
    id.includes("_ENTRY"),
  );
  const stream = entryStreamId ? streams[entryStreamId] : null;

  useEffect(() => {
    if (stream && videoRef.current) {
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch((e) => console.warn(e));
    }
  }, [stream]);

  useEffect(() => {
    if (!entryStreamId || !stream || !videoRef.current) {
      if (wsRef.current) wsRef.current.close();
      return;
    }

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(
      `${protocol}//${window.location.host}/ws/stream/${entryStreamId}`,
    );
    wsRef.current = ws;

    let lastMessageTime = Date.now();

    const sendFrame = () => {
      if (!videoRef.current || ws.readyState !== WebSocket.OPEN) return;
      const video = videoRef.current;
      if (video.videoWidth === 0) {
        setTimeout(() => {
          if (ws.readyState === WebSocket.OPEN) sendFrame();
        }, 100);
        return;
      }

      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      setVideoDims({ w: canvas.width, h: canvas.height });

      ctx.drawImage(video, 0, 0);
      ws.send(canvas.toDataURL("image/jpeg", 0.7));
    };

    ws.onopen = () => {
        sendFrame();
    };

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
          setBoxes(payload.boxes || []);
          setKioskMessage(payload.kioskMessage || null);
          if (payload.complianceScore !== undefined) {
            setComplianceScore(
              payload.complianceScore === -1 ? null : payload.complianceScore,
            );
          }
        }
      } catch (err) {}

      setTimeout(() => {
        if (ws.readyState === WebSocket.OPEN) sendFrame();
      }, 30);
    };

    return () => {
      clearInterval(watchdog);
      if (ws.readyState === WebSocket.OPEN) ws.close();
    };
  }, [entryStreamId, stream]);

  // Derive intelligent checklist from the current AI boxes
  const hasHardhat = boxes.some(
    (b) =>
      (b.label.toLowerCase().includes("hardhat") || b.label.toLowerCase().includes("helmet")) &&
      !b.label.toLowerCase().includes("no-"),
  );
  const hasVest = boxes.some(
    (b) =>
      b.label.toLowerCase().includes("vest") &&
      !b.label.toLowerCase().includes("no-"),
  );
  const hasBoots = boxes.some(
    (b) =>
      (b.label.toLowerCase().includes("boot") || b.label.toLowerCase().includes("shoe")) &&
      !b.label.toLowerCase().includes("no-"),
  );
  const isScanning = complianceScore !== null;
  const isGranted = complianceScore !== null && complianceScore >= 100;

  return (
    <div className="flex h-screen bg-zinc-950 text-white overflow-hidden font-sans">
      {/* Left Side: Video Feed */}
      <div className="flex-1 relative bg-black border-r border-zinc-800">
        {roomStatus !== "CONNECTED" || !stream ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <FaQrcode className="text-6xl text-zinc-700 animate-pulse mb-4" />
            <h2 className="text-zinc-500 font-mono text-xl tracking-widest uppercase">
              Waiting for Entry Camera...
            </h2>
            <p className="mt-4 text-sm text-zinc-600">
              Register a camera on the /camera page and check "Set as Entry
              Camera"
            </p>
          </div>
        ) : (
          <>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="absolute inset-0 w-full h-full object-contain"
            />
            <svg
              viewBox={`0 0 ${videoDims.w} ${videoDims.h}`}
              preserveAspectRatio="xMidYMid meet"
              className="absolute inset-0 w-full h-full pointer-events-none z-10"
            >
              {boxes.map((box, idx) => {
                const rx = (box.x / 100) * videoDims.w;
                const ry = (box.y / 100) * videoDims.h;
                const rw = (box.w / 100) * videoDims.w;
                const rh = (box.h / 100) * videoDims.h;
                return (
                  <g key={idx}>
                    <rect
                      x={rx}
                      y={ry}
                      width={rw}
                      height={rh}
                      fill={box.color}
                      fillOpacity="0.2"
                      stroke={box.color}
                      strokeWidth="3"
                      rx="4"
                    />
                    <rect
                      x={rx}
                      y={ry - 30}
                      width={box.label.length * 12 + 20}
                      height="30"
                      fill={box.color}
                      rx="4"
                    />
                    <text
                      x={rx + 10}
                      y={ry - 10}
                      fill="#fff"
                      fontSize="18"
                      fontWeight="bold"
                      fontFamily="monospace"
                    >
                      {box.label}
                    </text>
                  </g>
                );
              })}
            </svg>

            {/* Scanning Overlay Effect */}
            {isScanning && !kioskMessage && (
              <div className="absolute inset-0 pointer-events-none z-20 overflow-hidden">
                <div className="w-full h-2 bg-blue-500/50 shadow-[0_0_20px_rgba(59,130,246,0.8)] animate-[scan_2s_ease-in-out_infinite]" />
              </div>
            )}
            
            {/* Intelligent Positioning Assistant overlay */}
            {kioskMessage && (
                <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                    <div className="bg-red-500/20 border-2 border-red-500 p-8 rounded-2xl flex flex-col items-center">
                        <FaShieldAlt className="text-red-500 text-6xl mb-4 animate-bounce" />
                        <h1 className="text-5xl font-black text-white tracking-widest text-center uppercase drop-shadow-[0_0_10px_rgba(239,68,68,0.8)]">
                            {kioskMessage}
                        </h1>
                        <p className="text-zinc-300 font-mono mt-4 text-xl">Adjust your position to continue scanning.</p>
                    </div>
                </div>
            )}
          </>
        )}
      </div>

      {/* Right Side: Decision Engine Panel */}
      <div className="w-[450px] bg-zinc-900 p-8 flex flex-col items-center justify-center relative shadow-[-10px_0_30px_rgba(0,0,0,0.5)] z-30">
        <div className="absolute top-8 left-8 right-8 flex justify-between items-center">
          <h1 className="text-2xl font-bold tracking-wider flex items-center gap-3">
            <FaShieldAlt className="text-blue-500 text-3xl" />
            GATEKEEPER AI
          </h1>
          <div className="animate-pulse bg-red-500 text-xs font-bold px-2 py-1 rounded text-white">
            LIVE
          </div>
        </div>

        <div className="w-full mt-16 flex flex-col items-center">
          <h2 className="text-zinc-400 font-mono uppercase tracking-widest text-sm mb-8 text-center">
            Intelligent Decision
            <br />
            Engine
          </h2>

          {/* Circular Score Display */}
          <div
            className={`relative w-56 h-56 rounded-full border-8 flex items-center justify-center mb-12 shadow-2xl transition-all duration-500
                        ${
                          !isScanning
                            ? "border-zinc-800 bg-zinc-950"
                            : kioskMessage
                              ? "border-yellow-500 bg-yellow-500/10 shadow-[0_0_50px_rgba(234,179,8,0.3)]"
                              : isGranted
                                ? "border-emerald-500 bg-emerald-500/10 shadow-[0_0_50px_rgba(16,185,129,0.3)]"
                                : "border-red-500 bg-red-500/10 shadow-[0_0_50px_rgba(239,68,68,0.3)]"
                        }`}
          >
            {!isScanning ? (
              <span className="text-zinc-600 font-mono text-xl uppercase text-center leading-tight tracking-widest">
                Awaiting
                <br />
                Subject
              </span>
            ) : kioskMessage ? (
              <span className="text-yellow-500 font-mono text-xl uppercase text-center leading-tight tracking-widest font-bold">
                ADJUST
                <br />
                POSITION
              </span>
            ) : (
              <div className="flex flex-col items-center">
                <span
                  className={`text-7xl font-black ${isGranted ? "text-emerald-400" : "text-red-400"}`}
                >
                  {complianceScore}%
                </span>
                <span className="text-zinc-400 text-xs font-mono uppercase mt-2 tracking-widest">
                  Compliance
                </span>
              </div>
            )}
          </div>

          {/* Dynamic Checklist */}
          <div className="w-full space-y-3 mb-12">
            <div
              className={`flex items-center justify-between p-3 rounded-lg border transition-colors duration-300 ${hasHardhat ? "bg-emerald-500/10 border-emerald-500/50" : "bg-zinc-950 border-zinc-800"}`}
            >
              <span className="font-mono text-base font-bold text-zinc-300 tracking-wider">
                HARDHAT
              </span>
              {hasHardhat ? (
                <FaCheckCircle className="text-2xl text-emerald-500" />
              ) : (
                <FaTimesCircle className="text-2xl text-zinc-600" />
              )}
            </div>
            <div
              className={`flex items-center justify-between p-3 rounded-lg border transition-colors duration-300 ${hasVest ? "bg-emerald-500/10 border-emerald-500/50" : "bg-zinc-950 border-zinc-800"}`}
            >
              <span className="font-mono text-base font-bold text-zinc-300 tracking-wider">
                SAFETY VEST
              </span>
              {hasVest ? (
                <FaCheckCircle className="text-2xl text-emerald-500" />
              ) : (
                <FaTimesCircle className="text-2xl text-zinc-600" />
              )}
            </div>
            <div
              className={`flex items-center justify-between p-3 rounded-lg border transition-colors duration-300 ${hasBoots ? "bg-emerald-500/10 border-emerald-500/50" : "bg-zinc-950 border-zinc-800"}`}
            >
              <span className="font-mono text-base font-bold text-zinc-300 tracking-wider">
                BOOTS
              </span>
              {hasBoots ? (
                <FaCheckCircle className="text-2xl text-emerald-500" />
              ) : (
                <FaTimesCircle className="text-2xl text-zinc-600" />
              )}
            </div>
          </div>

          {/* Massive Decision Output */}
          <div
            className={`w-full py-6 rounded-xl text-center border-2 flex items-center justify-center gap-4 transition-all duration-500 shadow-xl
                        ${
                          !isScanning
                            ? "border-zinc-800 bg-zinc-950 opacity-50"
                            : isGranted
                              ? "border-emerald-500 bg-emerald-500 text-white shadow-[0_0_30px_rgba(16,185,129,0.5)]"
                              : "border-red-500 bg-red-600 text-white shadow-[0_0_30px_rgba(239,68,68,0.5)] animate-pulse"
                        }`}
          >
            {!isScanning ? (
              <FaLock className="text-4xl opacity-50" />
            ) : isGranted ? (
              <FaUnlock className="text-4xl" />
            ) : (
              <FaLock className="text-4xl" />
            )}
            <span className="text-3xl font-black tracking-widest uppercase">
              {!isScanning
                ? "SYSTEM LOCKED"
                : isGranted
                  ? "ACCESS GRANTED"
                  : "ACCESS DENIED"}
            </span>
          </div>
        </div>
      </div>

      <style>{`
                @keyframes scan {
                    0% { transform: translateY(-100%); }
                    50% { transform: translateY(1080px); }
                    100% { transform: translateY(-100%); }
                }
            `}</style>
    </div>
  );
}
