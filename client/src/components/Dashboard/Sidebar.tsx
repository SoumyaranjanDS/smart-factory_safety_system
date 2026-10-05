import React from 'react';
import { NavLink } from 'react-router-dom';
import { LuLayoutDashboard, LuVideo, LuSettings, LuShieldCheck } from 'react-icons/lu';
import { RiAlertFill } from "react-icons/ri";

function Sidebar() {
  return (
    <aside className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col h-screen text-slate-300 shrink-0">
      <div className="h-16 flex items-center px-6 border-b border-slate-800">
        <LuShieldCheck className="text-blue-500 text-2xl mr-3" />
        <span className="text-white font-bold text-lg tracking-wider">SafeFactory</span>
      </div>
      
      <div className="flex-1 overflow-y-auto py-6">
        <nav className="space-y-1 px-4">
          <NavLink 
            to="/dashboard" 
            className={({ isActive }) => 
              `flex items-center px-4 py-3 rounded-lg transition-colors ${
                isActive ? 'bg-blue-600/20 text-blue-400 font-medium' : 'hover:bg-slate-800 hover:text-white'
              }`
            }
          >
            <LuLayoutDashboard className="mr-3 text-lg" />
            Dashboard
          </NavLink>
          
          <NavLink 
            to="/alerts" 
            className={({ isActive }) => 
              `flex items-center px-4 py-3 rounded-lg transition-colors ${
                isActive ? 'bg-red-600/20 text-red-400 font-medium' : 'hover:bg-slate-800 hover:text-white'
              }`
            }
          >
            <RiAlertFill className="mr-3 text-lg" />
            Active Alerts
            <span className="ml-auto bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">3</span>
          </NavLink>

          <NavLink 
            to="/cameras" 
            className={({ isActive }) => 
              `flex items-center px-4 py-3 rounded-lg transition-colors ${
                isActive ? 'bg-blue-600/20 text-blue-400 font-medium' : 'hover:bg-slate-800 hover:text-white'
              }`
            }
          >
            <LuVideo className="mr-3 text-lg" />
            Camera Feeds
          </NavLink>
        </nav>
      </div>

      <div className="p-4 border-t border-slate-800">
        <button className="flex items-center px-4 py-3 w-full rounded-lg hover:bg-slate-800 transition-colors">
          <LuSettings className="mr-3 text-lg" />
          Settings
        </button>
      </div>
    </aside>
  );
}

export default Sidebar;
