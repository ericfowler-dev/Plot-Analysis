/**
 * Baseline Selector Component
 * Optional tuning layer for anomaly thresholds by group/engine size/application
 */

import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Sliders } from 'lucide-react';
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
      className="mt-6 bg-slate-900/40 border border-slate-700 rounded-lg p-4"
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-center gap-2 text-sm font-semibold text-slate-300 mb-3">
        <Sliders className="w-4 h-4 text-green-400" />
        Baseline Tuning (optional)
      </div>
      <div className="text-xs text-slate-500 mb-4">
        Use a baseline group to fine-tune anomaly thresholds. Only sizes with baseline data are shown. Leave blank to use defaults.
      </div>

      {loadError && (
        <div className="mb-3 flex items-center gap-2 text-amber-400 text-xs">
          <AlertCircle className="w-4 h-4" />
          Baseline data unavailable
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <select
          value={baselineSelection.group}
          onChange={handleGroupChange}
          disabled={loading || loadError}
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-green-500"
        >
          <option value="">Group: Global Defaults</option>
          {groups.map(group => (
            <option key={group} value={group}>{group}</option>
          ))}
        </select>

        <select
          value={baselineSelection.size}
          onChange={handleSizeChange}
          disabled={!baselineSelection.group || loading || loadError}
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-green-500"
        >
          <option value="">Engine Size (available)</option>
          {sizes.map(size => (
            <option key={size} value={size}>{size}</option>
          ))}
        </select>

        <select
          value={baselineSelection.application}
          onChange={handleAppChange}
          disabled={!baselineSelection.size || loading || loadError}
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-green-500"
        >
          <option value="">Application</option>
          {applications.map(app => (
            <option key={app} value={app}>{app}</option>
          ))}
        </select>
      </div>
    </div>
  );
}
