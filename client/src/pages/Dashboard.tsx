import React from "react";
import Sidebar from "../components/Dashboard/Sidebar";
import CameraGrid from "../components/Dashboard/CameraGrid";
import { LuCircleUser, LuSignal, LuVideo } from "react-icons/lu";
import { useZegoRoom } from "../hooks/useZegoRoom";

const appID = Number(import.meta.env.VITE_ZEGO_APP_ID);
const serverURL = import.meta.env.VITE_ZEGO_SERVER_URL || '';
const roomID = import.meta.env.VITE_ZEGO_ROOM_ID || 'factory_monitoring';
const token = import.meta.env.VITE_ZEGO_TEST_TOKEN || '';

export default function Dashboard() {
    const { roomStatus, streams, streamStates, isPublishing, togglePublish } = useZegoRoom(appID, serverURL, roomID, token);

    return (
        <div className="flex h-screen bg-zinc-950 text-zinc-200 overflow-hidden font-sans">
            <Sidebar />
            
            <main className="flex-1 flex flex-col h-screen overflow-hidden bg-zinc-950">
                {/* Header */}
                <header className="h-16 flex items-center justify-between px-8 border-b border-zinc-800 bg-zinc-900/50 backdrop-blur shrink-0">
                    <div>
                        <h1 className="text-xl font-semibold text-white">Live Monitoring</h1>
                        <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-xs text-zinc-400 flex items-center gap-1">
                                <LuSignal className={roomStatus === 'CONNECTED' ? 'text-emerald-500' : 'text-zinc-500'} />
                                {roomStatus === 'CONNECTED' ? 'Room Connected' : roomStatus}
                            </span>
                            <span className="text-xs text-zinc-500 font-mono">| {roomID}</span>
                        </div>
                    </div>
                    
                    <div className="flex items-center gap-6">
                        {/* Test Mode Toggle */}
                        <button 
                            onClick={() => togglePublish('camera_01')}
                            disabled={roomStatus !== 'CONNECTED'}
                            className={`px-4 py-1.5 rounded text-sm font-medium transition-colors border flex items-center gap-2 ${
                                roomStatus !== 'CONNECTED' 
                                ? 'opacity-50 cursor-not-allowed bg-zinc-800 border-zinc-700 text-zinc-500' 
                                : isPublishing 
                                ? 'bg-red-500/10 text-red-400 border-red-500/50 hover:bg-red-500/20' 
                                : 'bg-blue-600/10 hover:bg-blue-600/20 text-blue-400 border-blue-500/50'
                            }`}
                        >
                            <LuVideo />
                            {isPublishing ? 'Stop Test Camera' : 'Start Test Camera'}
                        </button>

                        <div className="flex items-center gap-3 border-l border-zinc-800 pl-6">
                            <div className="text-right hidden sm:block">
                                <p className="text-sm font-medium text-white">Admin User</p>
                                <p className="text-xs text-zinc-400">Safety Officer</p>
                            </div>
                            <LuCircleUser className="text-3xl text-zinc-400" />
                        </div>
                    </div>
                </header>

                {/* Main Content Area */}
                <div className="flex-1 overflow-hidden flex flex-col">
                    {/* Status Overview Cards - Kept for Dashboard Context */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-6 pb-2 shrink-0">
                        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex items-center gap-4">
                            <div className="w-12 h-12 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-500">
                                <span className="text-xl font-bold">{Object.keys(streams).length}</span>
                            </div>
                            <div>
                                <p className="text-zinc-400 text-sm">Active Cameras</p>
                                <p className="text-white font-semibold">Online</p>
                            </div>
                        </div>
                        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex items-center gap-4">
                            <div className="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-500">
                                <span className="text-xl font-bold">0</span>
                            </div>
                            <div>
                                <p className="text-zinc-400 text-sm">Critical Incidents</p>
                                <p className="text-white font-semibold">Last 24h</p>
                            </div>
                        </div>
                        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex items-center gap-4">
                            <div className="w-12 h-12 rounded-full bg-amber-500/10 flex items-center justify-center text-amber-500">
                                <span className="text-xl font-bold">0</span>
                            </div>
                            <div>
                                <p className="text-zinc-400 text-sm">Warnings</p>
                                <p className="text-white font-semibold">Needs Review</p>
                            </div>
                        </div>
                        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex items-center gap-4">
                            <div className="w-12 h-12 rounded-full bg-purple-500/10 flex items-center justify-center text-purple-500">
                                <span className="text-xl font-bold">98%</span>
                            </div>
                            <div>
                                <p className="text-zinc-400 text-sm">System Health</p>
                                <p className="text-white font-semibold">Optimal</p>
                            </div>
                        </div>
                    </div>

                    <CameraGrid streams={streams} streamStates={streamStates} />
                </div>
            </main>
        </div>
    );
}