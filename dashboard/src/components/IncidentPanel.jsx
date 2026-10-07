import React from 'react';

export default function IncidentPanel({ state, engineOnline }) {
  const { workers = {}, incidents = [] } = state;
  const workerEntries = Object.entries(workers);

  const criticals = incidents.filter(i => i.type === 'CRITICAL');
  const warnings  = incidents.filter(i => i.type === 'WARNING');

  return (
    <div className="flex flex-col h-full bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      {/* Panel header */}
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        <h2 className="font-semibold text-gray-700 text-sm">Safety Status</h2>
        <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${engineOnline ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
          {engineOnline ? 'Live' : 'Offline'}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-5">

        {/* Active Alerts */}
        <section>
          <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Active Alerts</h3>
          {incidents.length === 0 ? (
            <div className="flex items-center gap-2 bg-green-50 border border-green-100 rounded-lg px-3 py-2.5">
              <svg className="w-4 h-4 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" /></svg>
              <span className="text-xs text-green-700 font-medium">All clear — no incidents</span>
            </div>
          ) : (
            <div className="space-y-2">
              {criticals.map((inc, i) => (
                <div key={`c-${i}`} className="flex items-start gap-2.5 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5">
                  <svg className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5 animate-pulse" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
                  <div>
                    <p className="text-xs font-bold text-red-700">CRITICAL</p>
                    <p className="text-xs text-red-600">{inc.message}</p>
                  </div>
                </div>
              ))}
              {warnings.map((inc, i) => (
                <div key={`w-${i}`} className="flex items-start gap-2.5 bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2.5">
                  <svg className="w-4 h-4 text-yellow-500 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
                  <div>
                    <p className="text-xs font-bold text-yellow-700">WARNING</p>
                    <p className="text-xs text-yellow-700">{inc.message}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Worker PPE Status */}
        <section>
          <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
            Workers Detected ({workerEntries.length})
          </h3>
          {workerEntries.length === 0 ? (
            <p className="text-xs text-gray-400 italic">No workers in frame</p>
          ) : (
            <div className="space-y-2">
              {workerEntries.map(([id, worker]) => {
                return (
                  <div key={id} className="bg-gray-50 border border-gray-100 rounded-lg p-3">
                    <p className="text-xs font-semibold text-gray-600 mb-2">{id}</p>
                    <div className="grid grid-cols-2 gap-1.5">
                      {[
                        { key: 'helmet', label: 'Helmet' },
                        { key: 'vest',   label: 'Vest'   },
                        { key: 'gloves', label: 'Gloves' },
                        { key: 'boots',  label: 'Boots'  },
                      ].map(({ key, label }) => {
                        const ok = worker[key] === 'COMPLIANT';
                        return (
                          <div key={key} className={`flex items-center gap-1.5 px-2 py-1.5 rounded text-xs font-medium ${ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
                            <span>{ok ? '✓' : '✗'}</span>
                            <span>{label}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

      </div>
    </div>
  );
}
