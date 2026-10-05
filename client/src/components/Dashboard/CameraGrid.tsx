import React from "react";
import CameraCard from "./CameraCard";
import { cameras } from "../../config/cameras";
import type { StreamStatus } from "../../hooks/useZegoRoom";

interface CameraGridProps {
    streams: Record<string, MediaStream>;
    streamStates: Record<string, StreamStatus>;
}

export default function CameraGrid({ streams, streamStates }: CameraGridProps) {
    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 p-4 flex-1 overflow-y-auto min-h-0">
            {cameras.map((cam) => (
                <CameraCard 
                    key={cam.id}
                    title={cam.name}
                    cameraId={cam.id}
                    location={cam.location}
                    status={streamStates[cam.streamId] || 'OFFLINE'}
                    stream={streams[cam.streamId] || null}
                />
            ))}
        </div>
    );
}