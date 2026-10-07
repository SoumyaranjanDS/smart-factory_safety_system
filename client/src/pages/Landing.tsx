import React from 'react';
import { useNavigate } from 'react-router-dom';
import { LuCamera, LuShield } from 'react-icons/lu';

export default function Landing() {
    const navigate = useNavigate();

    return (
        <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-4">
            <div className="text-center mb-12">
                <h1 className="text-4xl font-bold text-white mb-4 tracking-tight">Factory Safety Tracking System</h1>
                <p className="text-zinc-400 max-w-lg mx-auto">
                    Select your operating mode. You can log in to the central NVR dashboard to monitor the factory, or register this device as a CCTV camera node.
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-4xl">
                {/* Admin Dashboard Option */}
                <button 
                    onClick={() => navigate('/login')}
                    className="flex flex-col items-center justify-center p-12 bg-zinc-900 border border-zinc-800 rounded-2xl hover:border-blue-500/50 hover:bg-zinc-800/80 transition-all group text-left"
                >
                    <div className="w-20 h-20 bg-blue-500/10 rounded-full flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                        <LuShield className="text-4xl text-blue-500" />
                    </div>
                    <h2 className="text-2xl font-semibold text-white mb-2">Admin Dashboard</h2>
                    <p className="text-zinc-400 text-center">
                        Login as a safety supervisor to view live camera feeds and AI incident alerts.
                    </p>
                </button>

                {/* Camera Node Option */}
                <button 
                    onClick={() => navigate('/camera')}
                    className="flex flex-col items-center justify-center p-12 bg-zinc-900 border border-zinc-800 rounded-2xl hover:border-emerald-500/50 hover:bg-zinc-800/80 transition-all group text-left"
                >
                    <div className="w-20 h-20 bg-emerald-500/10 rounded-full flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                        <LuCamera className="text-4xl text-emerald-500" />
                    </div>
                    <h2 className="text-2xl font-semibold text-white mb-2">Register Camera</h2>
                    <p className="text-zinc-400 text-center">
                        Turn this device into a live CCTV node. Streams video and AI analysis to the dashboard.
                    </p>
                </button>
            </div>
        </div>
    );
}
