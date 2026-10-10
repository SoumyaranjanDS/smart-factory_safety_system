import React, { useEffect, useState } from "react";
import CameraCard from "./CameraCard";
import EntryCameraCard from "./EntryCameraCard";
import type { StreamStatus } from "../../hooks/useZegoRoom";
import { LuVideoOff } from "react-icons/lu";

interface CameraGridProps {
    streams: Record<string, MediaStream>;
    streamStates: Record<string, StreamStatus>;
    alertingCameras: Record<string, { critical: boolean, warning: boolean }>;
    onIncident?: (snapshot: { frame: string, alerts: any[], cameraId: string, timestamp: Date }) => void;
}

export default function CameraGrid({ streams, streamStates, alertingCameras, onIncident }: CameraGridProps) {
    const activeStreams = Object.entries(streams);

    if (activeStreams.length === 0) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-zinc-500">
                <LuVideoOff className="text-6xl mb-4 opacity-50" />
                <h3 className="text-xl font-medium text-white mb-2">No Active Cameras</h3>
                <p>Register a camera node on another device to see live feeds here.</p>
            </div>
        );
    }

    // Separate entry cameras from regular factory cameras
    const entryStreams = activeStreams.filter(([id]) => id.includes('_ENTRY'));
    const regularStreams = activeStreams.filter(([id]) => !id.includes('_ENTRY'));

    const gridClass = regularStreams.length === 1 
        ? "grid-cols-1 max-w-5xl mx-auto w-full" 
        : regularStreams.length === 2 
        ? "grid-cols-1 lg:grid-cols-2" 
        : "grid-cols-1 md:grid-cols-2 lg:grid-cols-3";

    return (
        <div className={`p-6 flex-1 overflow-y-auto min-h-0 flex flex-col gap-6`}>
            
            {/* Featured Entry Cameras (FaceID Style Scanner) */}
            {entryStreams.length > 0 && (
                <div className="w-full">
                    {entryStreams.map(([streamId, stream]) => (
                        <EntryCameraCard 
                            key={streamId} 
                            streamId={streamId} 
                            stream={stream} 
                        />
                    ))}
                </div>
            )}

            {/* Regular Live Feed Grid */}
            {regularStreams.length > 0 && (
                <div className={`grid ${gridClass} gap-6 content-start`}>
                    {regularStreams.map(([streamId, stream]) => {
                        // streamId is like "Warehouse_Cam_452"
                        const parts = streamId.split('_');
                        const nameParts = parts.length > 1 ? parts.slice(0, -1) : parts;
                        const cleanName = nameParts.join(' ');
                        
                        return (
                            <CameraCard 
                                key={streamId}
                                title={cleanName}
                                cameraId={streamId}
                                location="Factory Zone"
                                status={streamStates[streamId] || 'ONLINE'}
                                stream={stream}
                                isAlertActive={alertingCameras[streamId]?.critical || alertingCameras[streamId]?.warning || false}
                                onIncident={onIncident}
                            />
                        );
                    })}
                </div>
            )}
        </div>
    );
}