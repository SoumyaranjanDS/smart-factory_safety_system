import React, { useEffect, useRef, useState, useCallback } from 'react';
import { io } from 'socket.io-client';
import IncidentPanel from './components/IncidentPanel';

const FRAME_INTERVAL_MS = 100; // Send ~10 frames per second

// Socket connects to same origin — Vite proxies /socket.io → Node:4000
// This makes HTTPS work on mobile without mixed-content issues
const SOCKET_URL = window.location.origin;

function App() {
  const [engineOnline, setEngineOnline] = useState(false);
  const [safetyState, setSafetyState] = useState({ workers: {}, incidents: [] });
  const [cameraError, setCameraError] = useState(null);

  const socketRef = useRef(null);
  const hiddenVideoRef = useRef(null);
  const captureCanvasRef = useRef(null);
  const displayCanvasRef = useRef(null);
  const intervalRef = useRef(null);
  const streamRef = useRef(null);

  const startCapture = useCallback(async (socket) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } }, // back camera on mobile, webcam on desktop
        audio: false
      });
      streamRef.current = stream;

      const video = hiddenVideoRef.current;
      video.srcObject = stream;
      await video.play();

      setCameraError(null);

      intervalRef.current = setInterval(() => {
        const canvas = captureCanvasRef.current;
        const ctx = canvas.getContext('2d');
        canvas.width = video.videoWidth || 640;
        canvas.height = video.videoHeight || 480;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        canvas.toBlob((blob) => {
          if (!blob || !socket.connected) return;
          blob.arrayBuffer().then(buf => {
            socket.emit('frame', buf);
          });
        }, 'image/jpeg', 0.7);
      }, FRAME_INTERVAL_MS);

    } catch (err) {
      console.error('Camera error:', err);
      setCameraError('Cannot access webcam. Please allow camera permissions and refresh.');
    }
  }, []);

  useEffect(() => {
    const socket = io(SOCKET_URL);
    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('[React] Connected to Node server');
    });

    socket.on('engine_offline', () => {
      setEngineOnline(false);
    });

    // Draw annotated frame from Python onto the display canvas
    socket.on('processed_frame', ({ frame, workers, incidents }) => {
      setEngineOnline(true);
      setSafetyState({ workers: workers || {}, incidents: incidents || [] });

      const img = new Image();
      img.onload = () => {
        const canvas = displayCanvasRef.current;
        if (!canvas) return;
        canvas.width = img.width;
        canvas.height = img.height;
        canvas.getContext('2d').drawImage(img, 0, 0);
      };
      img.src = `data:image/jpeg;base64,${frame}`;
    });

    startCapture(socket);

    return () => {
      clearInterval(intervalRef.current);
      socket.disconnect();
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }
    };
  }, [startCapture]);

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-10">
        <div className="max-w-screen-xl mx-auto px-6">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-3">
              <svg className="w-7 h-7 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
              <span className="text-lg font-bold text-gray-800 tracking-tight">FSTS Safety Dashboard</span>
            </div>
            <div className="flex items-center gap-2">
              <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full ${engineOnline ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                <span className={`w-2 h-2 rounded-full ${engineOnline ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></span>
                {engineOnline ? 'AI Engine Live' : 'Engine Offline'}
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Main layout */}
      <main className="flex-1 max-w-screen-xl w-full mx-auto p-6 flex gap-5">
        {/* Video panel */}
        <div className="flex-1 min-w-0 flex flex-col bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <h2 className="font-semibold text-gray-700 text-sm">Live Camera Feed — AI Annotated</h2>
          </div>
          <div className="flex-1 relative bg-black flex items-center justify-center min-h-[400px]">
            {cameraError ? (
              <div className="text-center text-red-400 px-6">
                <svg className="w-12 h-12 mx-auto mb-3 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01M10.293 4.293a1 1 0 011.414 0l7 7a1 1 0 010 1.414l-7 7a1 1 0 01-1.414 0l-7-7a1 1 0 010-1.414l7-7z"/></svg>
                <p className="text-sm font-medium">{cameraError}</p>
              </div>
            ) : !engineOnline ? (
              <div className="text-center text-gray-400 px-6">
                <svg className="w-12 h-12 mx-auto mb-3 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                <p className="text-sm font-medium">Waiting for AI engine...</p>
                <p className="text-xs mt-1 opacity-60">Run <code className="bg-gray-700 text-gray-200 px-1.5 py-0.5 rounded">python incident_engine.py</code></p>
              </div>
            ) : null}
            {/* Always render the canvas — it just shows nothing until frames arrive */}
            <canvas
              ref={displayCanvasRef}
              className={`max-w-full max-h-full object-contain ${!engineOnline ? 'hidden' : 'block'}`}
            />
          </div>
        </div>

        {/* Side panel */}
        <div className="w-80 flex-shrink-0">
          <IncidentPanel state={safetyState} engineOnline={engineOnline} />
        </div>
      </main>

      {/* Hidden elements for frame capture */}
      <video ref={hiddenVideoRef} className="hidden" muted playsInline />
      <canvas ref={captureCanvasRef} className="hidden" />
    </div>
  );
}

export default App;
