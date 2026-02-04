/**
 * Baseline Selector Component
 * Optional tuning layer for anomaly thresholds by group/engine size/application
 * v2.0: Added engine variant selection and auto-detection support
 */

import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { useThresholds } from '../contexts/ThresholdContext';

/**
 * Map baseline selection to a profile ID
 * Enhanced to support engine variants (turbo, CAC, fuel systems, etc.)
 */
function mapSelectionToProfile(group, size, application, variants = []) {
  if (!group) {
    return 'global-defaults';
  }

  const groupLower = group.toLowerCase();
  const sizeLower = (size || '').toLowerCase();
  const variantSet = new Set(variants.map(v => v.toLowerCase()));

  // PSI HD engines
  if (groupLower.includes('psi hd') || groupLower.includes('psi-hd')) {
    // 40L/53L with MFG fuel system get special profile
    if (sizeLower.includes('40l') || sizeLower.includes('53l') || sizeLower.includes('mfg')) {
      return 'psi-hd-40l-53l-mfg';
    }
    // Other PSI HD sizes use HD base profile
    return 'psi-hd-base';
  }

  // PSI Industrial engines with variant support
  if (groupLower.includes('industrial')) {
    // 5.7L with variant-specific profiles
    if (sizeLower.includes('5.7l')) {
      if (variantSet.has('turbo') && variantSet.has('cac')) {
        return 'psi-industrial-5.7l-turbo-cac';
      }
      if (variantSet.has('turbo')) {
        return 'psi-industrial-5.7l-turbo';
      }
      if (variantSet.has('na')) {
        return 'psi-industrial-5.7l-na';
      }
      // Default to turbo-cac for 5.7L if no variant specified
      return 'psi-industrial-5.7l-turbo-cac';
    }
    return 'psi-industrial-base';
  }

  // Default fallback
  return 'global-defaults';
}

export default function BaselineSelector({ onAutoDetect, dataForDetection }) {
  const {
    baselineSelection,
    setBaselineSelection,
    selectProfile,
    selectedProfileId,
    baselineAlertsEnabled,
    setBaselineAlertsEnabled
  } = useThresholds();
  const [baselineData, setBaselineData] = useState(null);
  const [baselineIndex, setBaselineIndex] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [actionError, setActionError] = useState(null);

  // v2.0: Engine variant support
  const [selectedVariants, setSelectedVariants] = useState([]);
  const [engineConfig, setEngineConfig] = useState(null);
  const [variantsLoading, setVariantsLoading] = useState(false);
  const [autoDetectionResult, setAutoDetectionResult] = useState(null);
  const [isAutoDetecting, setIsAutoDetecting] = useState(false);

  const isAdmin = typeof window !== 'undefined' && Boolean(localStorage.getItem('adminToken'));

  // Trigger profile change when baseline selection changes (including variants)
  useEffect(() => {
    const targetProfile = mapSelectionToProfile(
      baselineSelection.group,
      baselineSelection.size,
      baselineSelection.application,
      selectedVariants
    );
    if (targetProfile !== selectedProfileId) {
      selectProfile(targetProfile);
    }
  }, [baselineSelection, selectedVariants, selectedProfileId, selectProfile]);

  // Load engine config when size changes
  useEffect(() => {
    if (!baselineSelection.size) {
      setEngineConfig(null);
      setSelectedVariants([]);
      return;
    }

    const loadEngineConfig = async () => {
      setVariantsLoading(true);
      try {
        const response = await fetch(`/api/thresholds/engine-config/${encodeURIComponent(baselineSelection.size)}`);
        if (response.ok) {
          const data = await response.json();
          if (data.success) {
            setEngineConfig(data);
            // Set default variants if available
            if (data.engineSize?.defaultVariants) {
              setSelectedVariants(data.engineSize.defaultVariants);
            }
          }
        }
      } catch (err) {
        console.error('Failed to load engine config:', err);
      } finally {
        setVariantsLoading(false);
      }
    };

    loadEngineConfig();
  }, [baselineSelection.size]);

  // Auto-detection function
  const handleAutoDetect = useCallback(async () => {
    if (!dataForDetection || dataForDetection.length === 0) {
      setActionError('No data available for auto-detection');
      return;
    }

    setIsAutoDetecting(true);
    setAutoDetectionResult(null);
    try {
      const response = await fetch('/api/thresholds/auto-detect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data: dataForDetection.slice(0, 1000), // Send up to 1000 rows
          sampleSize: 1000
        })
      });

      const result = await response.json();
      if (result.success) {
        setAutoDetectionResult(result.detection);

        // Apply detected settings if confident enough
        if (result.detection.confidence >= 0.6) {
          // Set detected variants
          const detectedVariants = Object.entries(result.detection.detectedVariants || {})
            .filter(([_, v]) => v.detected)
            .map(([id]) => id);
          setSelectedVariants(detectedVariants);

          // Notify parent if callback provided
          if (onAutoDetect) {
            onAutoDetect(result.detection);
          }
        }
      } else {
        setActionError(result.error || 'Auto-detection failed');
      }
    } catch (err) {
      console.error('Auto-detection error:', err);
      setActionError(err.message);
    } finally {
      setIsAutoDetecting(false);
    }
  }, [dataForDetection, onAutoDetect]);

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

  const canEnableBaselineAlerts = Boolean(
    baselineSelection.group && baselineSelection.size && baselineSelection.application
  );

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
    setSelectedVariants([]); // Reset variants when size changes
    setEngineConfig(null);
    setBaselineSelection(prev => ({ ...prev, size, application: '' }));
  };

  // Handle variant checkbox changes
  const handleVariantChange = (variantId, checked) => {
    setSelectedVariants(prev => {
      if (checked) {
        return [...prev, variantId];
      } else {
        return prev.filter(v => v !== variantId);
      }
    });
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

        {/* Auto-detect button */}
        {dataForDetection && dataForDetection.length > 0 && (
          <div className="mb-6 flex items-center gap-4">
            <button
              type="button"
              onClick={handleAutoDetect}
              disabled={isAutoDetecting}
              className="flex items-center gap-2 px-4 py-2 bg-[#00FF88]/10 border border-[#00FF88]/30 rounded-lg text-[#00FF88] text-xs uppercase tracking-wider hover:bg-[#00FF88]/20 transition-colors disabled:opacity-50"
            >
              <span className="material-symbols-outlined text-base">
                {isAutoDetecting ? 'sync' : 'auto_fix_high'}
              </span>
              {isAutoDetecting ? 'Detecting...' : 'Auto-Detect Profile'}
            </button>
            {autoDetectionResult && (
              <div className="flex items-center gap-2 text-xs">
                <span className={`px-2 py-1 rounded ${autoDetectionResult.confidence >= 0.7 ? 'bg-green-500/20 text-green-400' : autoDetectionResult.confidence >= 0.5 ? 'bg-amber-500/20 text-amber-400' : 'bg-red-500/20 text-red-400'}`}>
                  {Math.round(autoDetectionResult.confidence * 100)}% confidence
                </span>
                {autoDetectionResult.suggestedProfile && (
                  <span className="text-slate-400">
                    Suggested: <span className="text-slate-300">{autoDetectionResult.suggestedProfile.profileId}</span>
                  </span>
                )}
              </div>
            )}
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

        {/* Engine Variant Selection - v2.0 */}
        {engineConfig && engineConfig.engineSize?.supportedVariants?.length > 0 && (
          <div className="mt-6 p-4 bg-[#0a0a0a] border border-[#1a1a1a] rounded-lg">
            <div className="flex items-center gap-2 mb-4">
              <span className="material-symbols-outlined text-[#00FF88] text-base">settings_suggest</span>
              <label className="text-[10px] uppercase tracking-[0.2em] font-bold text-slate-500">
                Engine Configuration
              </label>
              {variantsLoading && (
                <span className="material-symbols-outlined text-slate-500 text-sm animate-spin">sync</span>
              )}
            </div>
            <div className="flex flex-wrap gap-4">
              {engineConfig.engineSize.supportedVariants.map(variantId => {
                const variantDef = engineConfig.variants?.[variantId];
                const isSelected = selectedVariants.includes(variantId);
                const isAutoDetected = autoDetectionResult?.detectedVariants?.[variantId]?.detected;
                // Check if variant requires another variant
                const requiresVariant = variantDef?.requiresVariant;
                const isDisabled = requiresVariant && !selectedVariants.includes(requiresVariant);

                return (
                  <label
                    key={variantId}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-all ${
                      isSelected
                        ? 'bg-[#00FF88]/10 border-[#00FF88]/50 text-[#00FF88]'
                        : 'bg-[#050505] border-[#262626] text-slate-400 hover:border-[#363636]'
                    } ${isDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={(e) => handleVariantChange(variantId, e.target.checked)}
                      disabled={isDisabled}
                      className="hidden"
                    />
                    {variantDef?.icon && (
                      <span className="material-symbols-outlined text-sm">{variantDef.icon}</span>
                    )}
                    <span className="text-xs font-medium">{variantDef?.name || variantId}</span>
                    {isAutoDetected && (
                      <span className="px-1.5 py-0.5 bg-blue-500/20 text-blue-400 text-[9px] rounded uppercase">
                        Detected
                      </span>
                    )}
                  </label>
                );
              })}
            </div>
            {engineConfig.engineSize.variantConfigs && selectedVariants.length > 0 && (
              <div className="mt-3 text-[10px] text-slate-500">
                {(() => {
                  const variantKey = selectedVariants.sort().join('-');
                  const config = engineConfig.variantConfigs[variantKey];
                  if (config) {
                    return (
                      <span>
                        Profile: <span className="text-slate-400">{config.profileId}</span>
                        {config.description && <span className="text-slate-600"> - {config.description}</span>}
                      </span>
                    );
                  }
                  return null;
                })()}
              </div>
            )}
          </div>
        )}

        {/* Auto-detection results detail */}
        {autoDetectionResult && autoDetectionResult.detectedVariants && (
          <div className="mt-4 p-4 bg-[#0a0a0a] border border-[#1a1a1a] rounded-lg">
            <div className="flex items-center gap-2 mb-3">
              <span className="material-symbols-outlined text-blue-400 text-base">analytics</span>
              <span className="text-[10px] uppercase tracking-[0.2em] font-bold text-slate-500">
                Detection Results
              </span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
              {Object.entries(autoDetectionResult.detectedVariants).map(([id, data]) => (
                <div
                  key={id}
                  className={`p-2 rounded border ${
                    data.detected
                      ? 'bg-green-500/10 border-green-500/30 text-green-400'
                      : 'bg-[#050505] border-[#262626] text-slate-500'
                  }`}
                >
                  <div className="font-medium">{data.name}</div>
                  <div className="text-[10px] opacity-70">
                    {Math.round(data.confidence * 100)}% confidence
                  </div>
                </div>
              ))}
            </div>
            {autoDetectionResult.summary && (
              <div className="mt-3 text-[10px] text-slate-400 border-t border-[#262626] pt-3">
                {autoDetectionResult.summary}
              </div>
            )}
          </div>
        )}

        <div className="mt-6 flex items-center gap-3">
          <input
            id="baseline-alerts-enabled"
            type="checkbox"
            checked={baselineAlertsEnabled}
            onChange={(e) => setBaselineAlertsEnabled(e.target.checked)}
            disabled={!canEnableBaselineAlerts}
            className="h-4 w-4 rounded border border-[#262626] bg-[#050505] text-[#00FF88] focus:ring-[#00FF88] disabled:opacity-50 disabled:cursor-not-allowed"
          />
          <label
            htmlFor="baseline-alerts-enabled"
            className={`text-xs uppercase tracking-[0.2em] font-bold ${canEnableBaselineAlerts ? 'text-slate-400' : 'text-slate-600'}`}
          >
            Baseline Info Alerts
          </label>
          <span className="text-[10px] text-slate-500">
            Notify when signals drift outside baseline bounds.
          </span>
        </div>
      </div>
    </div>
  );
}
