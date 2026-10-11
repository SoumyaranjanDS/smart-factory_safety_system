import React, { useEffect, useRef } from "react";

export default function AiStreamViewer({
  cameraId,
  title,
}: {
  cameraId: string;
  title: string;
}) {
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const handleFrame = (e: any) => {
      if (imgRef.current) {
        imgRef.current.src = e.detail;
      }
    };
    window.addEventListener(`ai-frame-${cameraId}`, handleFrame);
    return () =>
      window.removeEventListener(`ai-frame-${cameraId}`, handleFrame);
  }, [cameraId]);

  return (
    <div className="bg-zinc-950 border border-zinc-800 rounded-lg overflow-hidden shadow-lg animate-in fade-in">
      <div className="bg-zinc-900 px-3 py-1.5 border-b border-zinc-800 flex justify-between items-center">
        <span className="text-[10px] font-semibold text-zinc-300 uppercase tracking-wider">
          {title}
        </span>
        <span className="flex h-1.5 w-1.5">
          <span className="animate-ping absolute inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
        </span>
      </div>
      <div className="relative aspect-video bg-black flex items-center justify-center">
        <img
          ref={imgRef}
          className="w-full h-full object-contain"
          alt={`AI Vision ${title}`}
        />
      </div>
    </div>
  );
}
