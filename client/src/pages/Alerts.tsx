import React, { useEffect, useState } from "react";
import Sidebar from "../components/Dashboard/Sidebar";

export default function Alerts() {
    const [incidents, setIncidents] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch("http://localhost:4000/api/incidents")
            .then(res => res.json())
            .then(data => {
                setIncidents(data);
                setLoading(false);
            })
            .catch(err => {
                console.error("Failed to fetch incidents:", err);
                setLoading(false);
            });
    }, []);

    return (
        <div className="flex h-screen bg-black text-white font-sans overflow-hidden">
            <Sidebar />
            <div className="flex-1 overflow-y-auto p-8 bg-zinc-950/50">
                <div className="max-w-6xl mx-auto">
                    <div className="mb-8 border-b border-zinc-800 pb-6">
                        <h1 className="text-3xl font-bold tracking-tight mb-2">Active Incident Logs</h1>
                        <p className="text-zinc-400">Comprehensive audit trail of all safety violations detected by the AI Engine.</p>
                    </div>

                    {loading ? (
                        <div className="flex items-center justify-center h-64">
                            <div className="animate-spin w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full"></div>
                        </div>
                    ) : incidents.length === 0 ? (
                        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-12 text-center text-zinc-500">
                            <h3 className="text-lg font-bold text-zinc-400 mb-2">No Incidents Recorded</h3>
                            <p>The safety monitoring system has not detected any violations recently.</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                            {incidents.map((incident) => {
                                const cleanName = incident.camera_id.split('_').slice(0, -1).join(' ') || incident.camera_id;
                                const date = new Date(incident.created_at);
                                return (
                                    <div key={incident.id} className="bg-zinc-950 border border-zinc-800 rounded-lg overflow-hidden shadow-xl hover:border-zinc-700 transition-colors">
                                        <div className="relative aspect-video border-b border-zinc-800 bg-black flex items-center justify-center">
                                            {incident.frame_data ? (
                                                <img src={incident.frame_data} alt="Incident" className="w-full h-full object-contain" />
                                            ) : (
                                                <div className="text-zinc-600 text-xs font-mono">No Image</div>
                                            )}
                                            <div className="absolute top-2 right-2 bg-black/80 backdrop-blur-sm px-2 py-1 rounded text-[10px] font-mono text-zinc-300 flex items-center gap-1.5 border border-zinc-800">
                                                <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse"></span>
                                                DETECTED
                                            </div>
                                        </div>
                                        <div className="p-4 bg-zinc-900/30">
                                            <div className="flex items-start justify-between mb-4 border-b border-zinc-800 pb-3">
                                                <div>
                                                    <h4 className="text-sm font-bold text-white uppercase tracking-wider">{cleanName}</h4>
                                                    <p className="text-[10px] text-zinc-500 font-mono mt-0.5">ID: {incident.camera_id}</p>
                                                </div>
                                                <div className="text-right">
                                                    <span className="text-[11px] font-bold text-zinc-300 block">{date.toLocaleDateString()}</span>
                                                    <span className="text-xs font-mono text-zinc-500 block">{date.toLocaleTimeString()}</span>
                                                </div>
                                            </div>
                                            
                                            <div className="space-y-2">
                                                <div className="flex flex-col gap-2">
                                                    {incident.alerts.map((alert: any, i: number) => (
                                                        <div key={i} className={`flex items-center justify-between px-2 py-2 rounded text-xs border ${
                                                            alert.type === 'FIRE_HAZARD' 
                                                            ? 'bg-red-500/10 border-red-500/30 text-red-400' 
                                                            : 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                                                        }`}>
                                                            <span className="font-bold uppercase tracking-wider flex items-center gap-2">
                                                                {alert.type === 'FIRE_HAZARD' ? '🔥' : '⚠️'}
                                                                {alert.class.replace("NO-", "Missing ")}
                                                            </span>
                                                            <span className="font-mono text-[10px] opacity-70 bg-black/40 px-1.5 py-0.5 rounded">
                                                                {(alert.confidence * 100).toFixed(0)}% CONF
                                                            </span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}