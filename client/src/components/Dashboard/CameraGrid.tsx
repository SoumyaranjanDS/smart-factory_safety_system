import React, { useEffect, useState } from "react";
import CameraCard from "./CameraCard";
import type { StreamStatus } from "../../hooks/useZegoRoom";
import { LuVideoOff } from "react-icons/lu";

interface CameraGridProps {
    streams: Record<string, MediaStream>;
    streamStates: Record<string, StreamStatus>;
}

export default function CameraGrid({ streams, streamStates }: CameraGridProps) {
    const activeStreams = Object.entries(streams);
    
    // Track which cameras currently have an active alert
    const [alertingCameras, setAlertingCameras] = useState<Record<string, boolean>>({});

    useEffect(() => {
        // Connect to the Node.js SSE endpoint
        const eventSource = new EventSource("/api/alerts/stream");

        eventSource.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data.cameraId && data.alerts && data.alerts.length > 0) {
                    // Activate alert for this camera
                    setAlertingCameras(prev => ({ ...prev, [data.cameraId]: true }));
                    
                    // Clear the alert automatically after 3 seconds if no new alerts arrive
                    setTimeout(() => {
                        setAlertingCameras(prev => ({ ...prev, [data.cameraId]: false }));
                    }, 3000);
                }
            } catch (err) {
                console.error("Failed to parse SSE alert:", err);
            }
        };

        return () => {
            eventSource.close();
        };
    }, []);

    if (activeStreams.length === 0) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-zinc-500">
                <LuVideoOff className="text-6xl mb-4 opacity-50" />
                <h3 className="text-xl font-medium text-white mb-2">No Active Cameras</h3>
                <p>Register a camera node on another device to see live feeds here.</p>
            </div>
        );
    }

    // Dynamic grid sizing based on camera count
    const gridClass = activeStreams.length === 1 
        ? "grid-cols-1 max-w-5xl mx-auto w-full" 
        : activeStreams.length === 2 
        ? "grid-cols-1 lg:grid-cols-2" 
        : "grid-cols-1 md:grid-cols-2 lg:grid-cols-3";

    return (
        <div className={`grid ${gridClass} gap-6 p-6 flex-1 overflow-y-auto min-h-0 content-start`}>
            {activeStreams.map(([streamId, stream]) => {
                // streamId is like "Warehouse_Cam_452"
                const parts = streamId.split('_');
                // Remove the last part (the random number) if there's more than one part
                const nameParts = parts.length > 1 ? parts.slice(0, -1) : parts;
                const cleanName = nameParts.join(' ');
                
                return (
                    <CameraCard 
                        key={streamId}
                        title={cleanName}
                        cameraId={streamId}
                        location="Remote Factory Zone"
                        status={streamStates[streamId] || 'ONLINE'}
                        stream={stream}
                        isAlertActive={!!alertingCameras[streamId]}
                    />
                );
            })}
        </div>
    );
}