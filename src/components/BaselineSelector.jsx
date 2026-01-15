/**
 * Baseline Selector Component
 * Optional tuning layer for anomaly thresholds by group/engine size/application
 */

import React, { useEffect, useMemo, useState } from 'react';
import { useThresholds } from '../contexts/ThresholdContext';

export default function BaselineSelector() {
  const { baselineSelection, setBaselineSelection } = useThresholds();
  const [baselineData, setBaselineData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  useEffect(() => {
    let isMounted = true;
    const loadBaselines = async () => {
      try {
        setLoading(true);
        setLoadError(null);
        const response = await fetch('/api/baselines');
        if (!response.ok) throw new Error('Failed to load baseline data');
        const data = await response.json();
        if (isMounted) setBaselineData(data);
      } catch (err) {
        console.error('Failed to load baseline data:', err);
        if (isMounted) setLoadError(err.message);
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    loadBaselines();
    return () => { isMounted = false; };
  }, []);

  const groups = useMemo(() => {
    return baselineData?.groups ? Object.keys(baselineData.groups) : [];
  }, [baselineData]);

  const sizes = useMemo(() => {
    if (!baselineSelection.group || !baselineData?.groups) return [];
    return Object.keys(baselineData.groups[baselineSelection.group] || {});
  }, [baselineSelection.group, baselineData]);

  const applications = useMemo(() => ['Power Systems', 'Mobile'], []);

  const handleGroupChange = (e) => {
    const group = e.target.value;
    if (!group) {
      setBaselineSelection({ group: '', size: '', application: '' });
      return;
    }
    setBaselineSelection({ group, size: '', application: '' });
  };

  const handleSizeChange = (e) => {
    const size = e.target.value;
    setBaselineSelection(prev => ({ ...prev, size, application: '' }));
  };

  const handleAppChange = (e) => {
    const application = e.target.value;
    setBaselineSelection(prev => ({ ...prev, application }));
  };

  return (
    <div
      className="bg-[#121212] border border-[#262626] rounded-xl overflow-hidden shadow-2xl"
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="bg-white/5 px-6 py-4 border-b border-[#262626] flex items-center gap-3">
        <span className="material-symbols-outlined text-[#00FF88] text-xl">tune</span>
        <h3 className="font-bold text-sm tracking-widest text-slate-200 uppercase">Baseline Tuning (optional)</h3>
      </div>

      {/* Content */}
      <div className="p-8">
        <p className="text-xs text-slate-500 mb-8 leading-relaxed">
          Use a baseline group to fine-tune anomaly thresholds. Only sizes with baseline data are shown. Leave blank to use defaults.
        </p>

        {loadError && (
          <div className="mb-6 flex items-center gap-2 text-amber-400 text-xs">
            <span className="material-symbols-outlined text-base">warning</span>
            Baseline data unavailable - using defaults
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="space-y-3">
            <label className="block text-[10px] uppercase tracking-[0.2em] font-bold text-slate-500">Baseline Group</label>
            <select
              value={baselineSelection.group}
              onChange={handleGroupChange}
              disabled={loading || loadError}
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              className="w-full bg-[#050505] border border-[#262626] rounded-lg px-4 py-3 text-sm text-slate-300 focus:ring-1 focus:ring-[#00FF88] focus:border-[#00FF88] outline-none transition-all appearance-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <option value="">Group: Global Defaults</option>
              {groups.map(group => (
                <option key={group} value={group}>{group}</option>
              ))}
            </select>
          </div>

          <div className="space-y-3">
            <label className="block text-[10px] uppercase tracking-[0.2em] font-bold text-slate-500">Engine Profile</label>
            <select
              value={baselineSelection.size}
              onChange={handleSizeChange}
              disabled={!baselineSelection.group || loading || loadError}
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              className="w-full bg-[#050505] border border-[#262626] rounded-lg px-4 py-3 text-sm text-slate-300 focus:ring-1 focus:ring-[#00FF88] focus:border-[#00FF88] outline-none transition-all appearance-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <option value="">Engine Size (available)</option>
              {sizes.map(size => (
                <option key={size} value={size}>{size}</option>
              ))}
            </select>
          </div>

          <div className="space-y-3">
            <label className="block text-[10px] uppercase tracking-[0.2em] font-bold text-slate-500">Application Type</label>
            <select
              value={baselineSelection.application}
              onChange={handleAppChange}
              disabled={!baselineSelection.size || loading || loadError}
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              className="w-full bg-[#050505] border border-[#262626] rounded-lg px-4 py-3 text-sm text-slate-300 focus:ring-1 focus:ring-[#00FF88] focus:border-[#00FF88] outline-none transition-all appearance-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <option value="">Application</option>
              {applications.map(app => (
                <option key={app} value={app}>{app}</option>
              ))}
            </select>
          </div>
        </div>
      </div>
    </div>
  );
}
