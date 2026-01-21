/**
 * Baseline Selector Component
 * Optional tuning layer for anomaly thresholds by group/engine size/application
 */

import React, { useEffect, useMemo, useState } from 'react';
import { useThresholds } from '../contexts/ThresholdContext';

/**
 * Map baseline selection to a profile ID
 * This determines which threshold profile to use based on group/size/application
 */
function mapSelectionToProfile(group, size, application) {
  if (!group) {
    return 'global-defaults';
  }

  const groupLower = group.toLowerCase();
  const sizeLower = (size || '').toLowerCase();

  // PSI HD engines
  if (groupLower.includes('psi hd') || groupLower.includes('psi-hd')) {
    // 40L/53L with MFG fuel system get special profile
    if (sizeLower.includes('40l') || sizeLower.includes('53l') || sizeLower.includes('mfg')) {
      return 'psi-hd-40l-53l-mfg';
    }
    // Other PSI HD sizes use HD base profile
    return 'psi-hd-base';
  }

  // PSI Industrial engines
  if (groupLower.includes('industrial')) {
    return 'psi-industrial-base';
  }

  // Default fallback
  return 'global-defaults';
}

export default function BaselineSelector() {
  const { baselineSelection, setBaselineSelection, selectProfile, selectedProfileId } = useThresholds();
  const [baselineData, setBaselineData] = useState(null);
  const [baselineIndex, setBaselineIndex] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [actionError, setActionError] = useState(null);

  const isAdmin = typeof window !== 'undefined' && Boolean(localStorage.getItem('adminToken'));

  // Trigger profile change when baseline selection changes
  useEffect(() => {
    const targetProfile = mapSelectionToProfile(
      baselineSelection.group,
      baselineSelection.size,
      baselineSelection.application
    );
    if (targetProfile !== selectedProfileId) {
      selectProfile(targetProfile);
    }
  }, [baselineSelection, selectedProfileId, selectProfile]);

  const getAdminHeaders = () => {
    if (typeof window === 'undefined') return {};
    const token = localStorage.getItem('adminToken');
    const actor = localStorage.getItem('adminUser') || localStorage.getItem('adminActor');
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['x-admin-token'] = token;
    if (actor) headers['x-admin-user'] = actor;
    return headers;
  };

  useEffect(() => {
    let isMounted = true;
    const loadBaselines = async () => {
      try {
        setLoading(true);
        setLoadError(null);
        const response = await fetch('/api/baselines');
        if (!response.ok) throw new Error('Failed to load baseline data');
        const payload = await response.json();
        if (!isMounted) return;
        if (payload?.data && payload?.index) {
          setBaselineData(payload.data);
          setBaselineIndex(payload.index);
        } else {
          setBaselineData(payload);
          setBaselineIndex(null);
        }
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
    if (!baselineIndex?.groups) {
      return baselineData?.groups ? Object.keys(baselineData.groups).map(name => ({ name })) : [];
    }
    return baselineIndex.groups;
  }, [baselineData, baselineIndex]);

  const sizes = useMemo(() => {
    if (!baselineSelection.group) return [];
    if (!baselineIndex?.sizes) {
      return baselineData?.groups
        ? Object.keys(baselineData.groups[baselineSelection.group] || {}).map(name => ({ name }))
        : [];
    }
    return baselineIndex.sizes.filter(item => item.group === baselineSelection.group);
  }, [baselineData, baselineIndex, baselineSelection.group]);

  const applications = useMemo(() => {
    if (!baselineSelection.group || !baselineSelection.size) return [];
    if (!baselineIndex?.applications) {
      return baselineData?.groups
        ? Object.keys((baselineData.groups[baselineSelection.group] || {})[baselineSelection.size] || {})
          .map(name => ({ name }))
        : [];
    }
    return baselineIndex.applications.filter(item =>
      item.group === baselineSelection.group && item.size === baselineSelection.size
    );
  }, [baselineData, baselineIndex, baselineSelection.group, baselineSelection.size]);

  const filteredGroups = useMemo(() => {
    return groups.filter(group => !group.archived || group.name === baselineSelection.group);
  }, [groups, baselineSelection.group]);

  const filteredSizes = useMemo(() => {
    return sizes.filter(size => !size.archived || size.name === baselineSelection.size);
  }, [sizes, baselineSelection.size]);

  const filteredApplications = useMemo(() => {
    return applications.filter(app => !app.archived || app.name === baselineSelection.application);
  }, [applications, baselineSelection.application]);

  const handleGroupChange = (e) => {
    const group = e.target.value;
    if (group === '__add__') {
      return handleAddGroup();
    }
    if (!group) {
      setBaselineSelection({ group: '', size: '', application: '' });
      return;
    }
    setBaselineSelection({ group, size: '', application: '' });
  };

  const handleSizeChange = (e) => {
    const size = e.target.value;
    if (size === '__add__') {
      return handleAddSize();
    }
    setBaselineSelection(prev => ({ ...prev, size, application: '' }));
  };

  const handleAppChange = (e) => {
    const application = e.target.value;
    if (application === '__add__') {
      return handleAddApplication();
    }
    setBaselineSelection(prev => ({ ...prev, application }));
  };

  const handleAddGroup = async () => {
    if (!isAdmin) return;
    const name = prompt('New baseline group name:');
    if (!name) return;
    try {
      setActionError(null);
      const response = await fetch('/api/baselines/groups', {
        method: 'POST',
        headers: getAdminHeaders(),
        body: JSON.stringify({ name })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Failed to create group');
      setBaselineIndex(payload.index);
      setBaselineSelection({ group: name, size: '', application: '' });
    } catch (err) {
      setActionError(err.message);
    }
  };

  const handleAddSize = async () => {
    if (!isAdmin || !baselineSelection.group) return;
    const name = prompt('New engine size name:');
    if (!name) return;
    try {
      setActionError(null);
      const response = await fetch('/api/baselines/sizes', {
        method: 'POST',
        headers: getAdminHeaders(),
        body: JSON.stringify({ group: baselineSelection.group, name })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Failed to create size');
      setBaselineIndex(payload.index);
      setBaselineSelection(prev => ({ ...prev, size: name, application: '' }));
    } catch (err) {
      setActionError(err.message);
    }
  };

  const handleAddApplication = async () => {
    if (!isAdmin || !baselineSelection.group || !baselineSelection.size) return;
    const name = prompt('New application name:');
    if (!name) return;
    try {
      setActionError(null);
      const response = await fetch('/api/baselines/applications', {
        method: 'POST',
        headers: getAdminHeaders(),
        body: JSON.stringify({
          group: baselineSelection.group,
          size: baselineSelection.size,
          name
        })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Failed to create application');
      setBaselineIndex(payload.index);
      setBaselineSelection(prev => ({ ...prev, application: name }));
    } catch (err) {
      setActionError(err.message);
    }
  };

  const handleArchiveGroup = async () => {
    if (!isAdmin || !baselineSelection.group) return;
    if (!confirm(`Archive baseline group "${baselineSelection.group}"?`)) return;
    try {
      setActionError(null);
      const response = await fetch(`/api/baselines/groups/${encodeURIComponent(baselineSelection.group)}`, {
        method: 'PATCH',
        headers: getAdminHeaders(),
        body: JSON.stringify({ archived: true })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Failed to archive group');
      setBaselineIndex(payload.index);
    } catch (err) {
      setActionError(err.message);
    }
  };

  const handleArchiveSize = async () => {
    if (!isAdmin || !baselineSelection.group || !baselineSelection.size) return;
    if (!confirm(`Archive engine size "${baselineSelection.size}"?`)) return;
    try {
      setActionError(null);
      const response = await fetch(
        `/api/baselines/sizes/${encodeURIComponent(baselineSelection.group)}/${encodeURIComponent(baselineSelection.size)}`,
        {
          method: 'PATCH',
          headers: getAdminHeaders(),
          body: JSON.stringify({ archived: true })
        }
      );
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Failed to archive size');
      setBaselineIndex(payload.index);
    } catch (err) {
      setActionError(err.message);
    }
  };

  const handleArchiveApplication = async () => {
    if (!isAdmin || !baselineSelection.group || !baselineSelection.size || !baselineSelection.application) return;
    if (!confirm(`Archive application "${baselineSelection.application}"?`)) return;
    try {
      setActionError(null);
      const response = await fetch(
        `/api/baselines/applications/${encodeURIComponent(baselineSelection.group)}/${encodeURIComponent(baselineSelection.size)}/${encodeURIComponent(baselineSelection.application)}`,
        {
          method: 'PATCH',
          headers: getAdminHeaders(),
          body: JSON.stringify({ archived: true })
        }
      );
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Failed to archive application');
      setBaselineIndex(payload.index);
    } catch (err) {
      setActionError(err.message);
    }
  };

  return (
    <div
      className="baseline-card bg-[#121212] border border-[#262626] rounded-xl overflow-hidden shadow-2xl"
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="baseline-card-header bg-white/5 px-6 py-4 border-b border-[#262626] flex items-center gap-3">
        <span className="material-symbols-outlined text-[#00FF88] text-xl">tune</span>
        <h3 className="font-bold text-sm tracking-widest text-slate-200 uppercase">Baseline Tuning (optional)</h3>
      </div>

      {/* Content */}
      <div className="baseline-card-body p-8">
        <p className="baseline-description text-xs text-slate-500 mb-8 leading-relaxed">
          Use a baseline group to fine-tune anomaly thresholds. Only sizes with baseline data are shown. Leave blank to use defaults.
        </p>

        {loadError && (
          <div className="mb-6 flex items-center gap-2 text-amber-400 text-xs">
            <span className="material-symbols-outlined text-base">warning</span>
            Baseline data unavailable - using defaults
          </div>
        )}
        {actionError && (
          <div className="mb-6 flex items-center gap-2 text-red-400 text-xs">
            <span className="material-symbols-outlined text-base">error</span>
            {actionError}
          </div>
        )}

        <div className="baseline-grid grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="baseline-field space-y-3">
            <label className="baseline-label block text-[10px] uppercase tracking-[0.2em] font-bold text-slate-500">Baseline Group</label>
            <select
              value={baselineSelection.group}
              onChange={handleGroupChange}
              disabled={loading || loadError}
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              className="baseline-select w-full bg-[#050505] border border-[#262626] rounded-lg px-4 py-3 text-sm text-slate-300 focus:ring-1 focus:ring-[#00FF88] focus:border-[#00FF88] outline-none transition-all appearance-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <option value="">Group: Global Defaults</option>
              {filteredGroups.map(group => (
                <option key={group.name} value={group.name}>
                  {group.name}{group.archived ? ' (archived)' : ''}
                </option>
              ))}
              {isAdmin && <option value="__add__">+ Add New Group...</option>}
            </select>
            {isAdmin && baselineSelection.group && (
              <button
                type="button"
                onClick={handleArchiveGroup}
                className="text-[10px] text-amber-400 hover:text-amber-300 uppercase tracking-wider"
              >
                Archive Group
              </button>
            )}
          </div>

          <div className="baseline-field space-y-3">
            <label className="baseline-label block text-[10px] uppercase tracking-[0.2em] font-bold text-slate-500">Engine Profile</label>
            <select
              value={baselineSelection.size}
              onChange={handleSizeChange}
              disabled={!baselineSelection.group || loading || loadError}
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              className="baseline-select w-full bg-[#050505] border border-[#262626] rounded-lg px-4 py-3 text-sm text-slate-300 focus:ring-1 focus:ring-[#00FF88] focus:border-[#00FF88] outline-none transition-all appearance-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <option value="">Engine Size (available)</option>
              {filteredSizes.map(size => (
                <option key={size.name} value={size.name}>
                  {size.name}{size.archived ? ' (archived)' : ''}
                </option>
              ))}
              {isAdmin && baselineSelection.group && <option value="__add__">+ Add New Size...</option>}
            </select>
            {isAdmin && baselineSelection.size && (
              <button
                type="button"
                onClick={handleArchiveSize}
                className="text-[10px] text-amber-400 hover:text-amber-300 uppercase tracking-wider"
              >
                Archive Size
              </button>
            )}
          </div>

          <div className="baseline-field space-y-3">
            <label className="baseline-label block text-[10px] uppercase tracking-[0.2em] font-bold text-slate-500">Application Type</label>
            <select
              value={baselineSelection.application}
              onChange={handleAppChange}
              disabled={!baselineSelection.size || loading || loadError}
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              className="baseline-select w-full bg-[#050505] border border-[#262626] rounded-lg px-4 py-3 text-sm text-slate-300 focus:ring-1 focus:ring-[#00FF88] focus:border-[#00FF88] outline-none transition-all appearance-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <option value="">Application</option>
              {filteredApplications.map(app => (
                <option key={app.name} value={app.name}>
                  {app.name}{app.archived ? ' (archived)' : ''}
                </option>
              ))}
              {isAdmin && baselineSelection.size && <option value="__add__">+ Add New App...</option>}
            </select>
            {isAdmin && baselineSelection.application && (
              <button
                type="button"
                onClick={handleArchiveApplication}
                className="text-[10px] text-amber-400 hover:text-amber-300 uppercase tracking-wider"
              >
                Archive Application
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
