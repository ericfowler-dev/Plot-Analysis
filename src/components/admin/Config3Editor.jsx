/**
 * Config3Editor - Config 3.1
 * Main threshold profile editor component
 * Combines ConfiguratorLayout with all section components
 *
 * v3.1 Changes:
 * - Fixed unsaved changes flag triggering on mount
 * - Added validation before save
 * - Fixed Raw JSON editor desync
 * - Added non-evaluated parameter warnings
 *
 * v3.1.2 Changes:
 * - Added engine size selection with engine-specific parameters
 * - Engine families and sizes now loaded from server index
 *
 * v3.1.3 Changes:
 * - MFG parameters now only visible for 40L/53L engines (MFG fuel system)
 * - Non-MFG PSI HD engines (22L) no longer show MFG-related parameters
 */

import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import ConfiguratorLayout from './ConfiguratorLayout';
import ParameterGrid, { CategoryParameterGrid } from './ParameterGrid';
import RuleBuilder from './RuleBuilder';
import ThresholdPreview from './ThresholdPreview';
import { PARAMETER_CATALOG, PARAMETER_CATEGORIES } from '../../lib/parameterCatalog';
import { getIndex, addEngineSize, updateEngineSize, setEngineSizeArchived } from '../../lib/thresholdService';

const EXCLUDED_THRESHOLD_CATEGORY_IDS = ['signals'];

const isNumber = (value) => typeof value === 'number' && !Number.isNaN(value);

const collectNumbers = (configs, getter) => {
  return configs.map(getter).filter(isNumber);
};

const aggregateMinThreshold = (values) => (values.length ? Math.max(...values) : undefined);
const aggregateMaxThreshold = (values) => (values.length ? Math.min(...values) : undefined);

const buildRangeFromConfigs = (configs, fallback) => {
  const warningMins = collectNumbers(configs, c => c?.warning?.min);
  const warningMaxs = collectNumbers(configs, c => c?.warning?.max);
  const criticalMins = collectNumbers(configs, c => c?.critical?.min);
  const criticalMaxs = collectNumbers(configs, c => c?.critical?.max);
  const hasAny = warningMins.length || warningMaxs.length || criticalMins.length || criticalMaxs.length;

  if (!hasAny) return fallback || null;

  const range = { warning: {}, critical: {} };
  const warningMin = aggregateMinThreshold(warningMins);
  const warningMax = aggregateMaxThreshold(warningMaxs);
  const criticalMin = aggregateMinThreshold(criticalMins);
  const criticalMax = aggregateMaxThreshold(criticalMaxs);

  if (warningMin !== undefined) range.warning.min = warningMin;
  if (warningMax !== undefined) range.warning.max = warningMax;
  if (criticalMin !== undefined) range.critical.min = criticalMin;
  if (criticalMax !== undefined) range.critical.max = criticalMax;

  if (Object.keys(range.warning).length === 0) delete range.warning;
  if (Object.keys(range.critical).length === 0) delete range.critical;

  return (range.warning || range.critical) ? range : (fallback || null);
};

const buildMaxOnlyFromConfigs = (configs, fallback) => {
  const warningMaxs = collectNumbers(configs, c => c?.warning?.max);
  const criticalMaxs = collectNumbers(configs, c => c?.critical?.max);
  const hasAny = warningMaxs.length || criticalMaxs.length;

  if (!hasAny) return fallback || null;

  const result = {};
  const warningMax = aggregateMaxThreshold(warningMaxs);
  const criticalMax = aggregateMaxThreshold(criticalMaxs);

  if (warningMax !== undefined) result.warning = warningMax;
  if (criticalMax !== undefined) result.critical = criticalMax;

  return Object.keys(result).length ? result : (fallback || null);
};

const resolveEnabled = (configs, fallbackEnabled) => {
  const present = configs.filter(Boolean);
  if (present.length === 0) return fallbackEnabled;
  return present.some(c => c.enabled !== false);
};

const buildFuelTrimMapping = (thresholds) => {
  const clBank1 = thresholds?.closedLoopTrimBank1;
  const clBank2 = thresholds?.closedLoopTrimBank2;
  const adaptiveBank1 = thresholds?.adaptiveTrimBank1;
  const adaptiveBank2 = thresholds?.adaptiveTrimBank2;
  const fallback = thresholds?.fuelTrim;

  const closedLoop = buildRangeFromConfigs([clBank1, clBank2], fallback?.closedLoop);
  const adaptive = buildRangeFromConfigs([adaptiveBank1, adaptiveBank2], fallback?.adaptive);

  if (!closedLoop && !adaptive) {
    return fallback || null;
  }

  const enabled = resolveEnabled([clBank1, clBank2, adaptiveBank1, adaptiveBank2], fallback?.enabled);
  const result = {};
  if (enabled !== undefined) result.enabled = enabled;
  if (closedLoop) result.closedLoop = closedLoop;
  if (adaptive) result.adaptive = adaptive;
  return result;
};

const buildKnockMapping = (thresholds) => {
  const knockRetard = thresholds?.knockRetard;
  const knockPercentage = thresholds?.knockPercentage;
  const fallback = thresholds?.knock;

  const maxRetard = buildMaxOnlyFromConfigs([knockRetard], fallback?.maxRetard);
  const percentageThreshold = buildMaxOnlyFromConfigs([knockPercentage], fallback?.percentageThreshold);

  if (!maxRetard && !percentageThreshold) {
    return fallback || null;
  }

  const enabled = resolveEnabled([knockRetard, knockPercentage], fallback?.enabled);
  const result = {};
  if (enabled !== undefined) result.enabled = enabled;
  if (maxRetard) result.maxRetard = maxRetard;
  if (percentageThreshold) result.percentageThreshold = percentageThreshold;
  return result;
};

const mapThresholdsToExistingSchema = (thresholds, signalQuality) => {
  const mapped = {
    ...thresholds,
    signalQuality
  };

  const fuelTrim = buildFuelTrimMapping(thresholds);
  if (fuelTrim) {
    mapped.fuelTrim = fuelTrim;
  }

  const knock = buildKnockMapping(thresholds);
  if (knock) {
    mapped.knock = knock;
  }

  return mapped;
};

/**
 * Profile Overview section
 * v3.1.2: Added engine size selection with engine-specific parameters
 */
function ProfileOverview({
  profile,
  thresholds,
  anomalyRules,
  signalQuality,
  onChange,
  indexData,
  onOpenEngineSizeModal
}) {
  const isAdmin = typeof window !== 'undefined' && Boolean(localStorage.getItem('adminToken'));

  const engineFamilyEntry = useMemo(() => {
    if (!indexData?.engineFamilies || !profile?.engineFamily) return null;
    return indexData.engineFamilies.find(
      family => family.id === profile.engineFamily || family.name === profile.engineFamily
    ) || null;
  }, [indexData?.engineFamilies, profile?.engineFamily]);

  const engineFamilyValue = engineFamilyEntry?.name || profile?.engineFamily || '';

  // Count enabled parameters by category
  const categoryCounts = useMemo(() => {
    const counts = {};
    for (const [id, param] of Object.entries(PARAMETER_CATALOG)) {
      if (param.category === 'signals') continue;
      const category = param.category;
      if (!counts[category]) {
        counts[category] = { enabled: 0, total: 0 };
      }
      counts[category].total++;
      if (thresholds?.[id]?.enabled !== false) {
        counts[category].enabled++;
      }
    }
    return counts;
  }, [thresholds]);

  const enabledRulesCount = useMemo(() => {
    return (anomalyRules || []).filter(r => r.enabled).length;
  }, [anomalyRules]);

  // v3.1.2: Filter engine sizes by selected family
  const availableEngineSizes = useMemo(() => {
    if (!indexData?.engineSizes || !profile?.engineFamily) return [];
    const familyId = engineFamilyEntry?.id || profile?.engineFamily;
    return indexData.engineSizes.filter(size => size.family === familyId);
  }, [engineFamilyEntry?.id, indexData?.engineSizes, profile?.engineFamily]);

  const selectableEngineSizes = useMemo(() => {
    if (!availableEngineSizes.length) return [];
    return availableEngineSizes.filter(size => !size.archived || size.id === profile?.engineSize);
  }, [availableEngineSizes, profile?.engineSize]);

  // v3.1.2: Get selected engine size details
  const selectedEngineSize = useMemo(() => {
    if (!indexData?.engineSizes || !profile?.engineSize) return null;
    return indexData.engineSizes.find(size => size.id === profile.engineSize);
  }, [indexData?.engineSizes, profile?.engineSize]);

  // v3.1.2: Handle engine family change - clear engine size if family changes
  const handleEngineFamilyChange = (newFamily) => {
    const updates = { ...profile, engineFamily: newFamily || null };
    // Clear engine size if family changes or is cleared
    if (profile?.engineSize) {
      const currentSize = indexData?.engineSizes?.find(s => s.id === profile.engineSize);
      const nextFamilyEntry = indexData?.engineFamilies?.find(
        family => family.name === newFamily || family.id === newFamily
      );
      if (!newFamily || currentSize?.family !== nextFamilyEntry?.id) {
        updates.engineSize = null;
        updates.engineParams = null;
      }
    }
    onChange(updates);
  };

  // v3.1.2: Handle engine size change - store engine-specific params
  const handleEngineSizeChange = (sizeId) => {
    const size = indexData?.engineSizes?.find(s => s.id === sizeId);
    onChange({
      ...profile,
      engineSize: sizeId || null,
      engineParams: size?.params || null
    });
  };

  return (
    <div className="space-y-6">
      {/* Profile info */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Profile Information</h3>
        <div className="grid grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Profile Name</label>
            <input
              type="text"
              value={profile?.name || ''}
              onChange={(e) => onChange({ ...profile, name: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Profile ID</label>
            <input
              type="text"
              value={profile?.profileId || ''}
              readOnly
              className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-500"
            />
          </div>
          <div className="col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              value={profile?.description || ''}
              onChange={(e) => onChange({ ...profile, description: e.target.value })}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Engine Family</label>
            <select
              value={engineFamilyValue}
              onChange={(e) => handleEngineFamilyChange(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="">None (Universal)</option>
              {(indexData?.engineFamilies || []).map(family => (
                <option key={family.id} value={family.name}>{family.name}</option>
              ))}
            </select>
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-sm font-medium text-gray-700">Engine Size</label>
              {isAdmin && (
                <button
                  type="button"
                  onClick={onOpenEngineSizeModal}
                  className="text-xs font-medium text-blue-600 hover:text-blue-700"
                >
                  Manage
                </button>
              )}
            </div>
            <select
              value={profile?.engineSize || ''}
              onChange={(e) => handleEngineSizeChange(e.target.value)}
              disabled={!profile?.engineFamily || selectableEngineSizes.length === 0}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-500"
            >
              <option value="">Select engine size...</option>
              {selectableEngineSizes.map(size => (
                <option key={size.id} value={size.id}>{size.name}</option>
              ))}
            </select>
            {!profile?.engineFamily && (
              <p className="text-xs text-gray-500 mt-1">Select an engine family first</p>
            )}
            {profile?.engineFamily && selectableEngineSizes.length === 0 && (
              <p className="text-xs text-gray-500 mt-1">No sizes available for this family yet.</p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Parent Profile</label>
            <input
              type="text"
              value={profile?.parent || ''}
              onChange={(e) => onChange({ ...profile, parent: e.target.value || null })}
              placeholder="e.g., global-defaults"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      </div>

      {/* Engine-specific parameters - v3.1.2 */}
      {selectedEngineSize?.params && (
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl border border-blue-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-2 flex items-center gap-2">
            <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Engine Parameters ({selectedEngineSize.name})
          </h3>
          <p className="text-sm text-gray-600 mb-4">
            {selectedEngineSize.description}
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Object.entries(selectedEngineSize.params).map(([key, value]) => {
              const labels = {
                fullLoadTpsThreshold: 'Full Load TPS',
                ratedRpm: 'Rated RPM',
                idleRpm: 'Idle RPM',
                tipMapDeltaThreshold: 'TIP-MAP Delta Max'
              };
              const units = {
                fullLoadTpsThreshold: '%',
                ratedRpm: 'RPM',
                idleRpm: 'RPM',
                tipMapDeltaThreshold: 'psi'
              };
              return (
                <div key={key} className="bg-white rounded-lg p-3 border border-blue-100">
                  <p className="text-xs text-gray-500 uppercase tracking-wide">{labels[key] || key}</p>
                  <p className="text-lg font-semibold text-gray-900">
                    {value}{units[key] ? <span className="text-sm text-gray-500 ml-1">{units[key]}</span> : null}
                  </p>
                </div>
              );
            })}
          </div>
          <p className="text-xs text-gray-500 mt-3">
            These parameters are available as <code className="bg-gray-100 px-1 rounded">engineParams.*</code> in custom rule conditions.
          </p>
        </div>
      )}

      {/* Configuration summary */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Configuration Summary</h3>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Object.entries(PARAMETER_CATEGORIES)
            .filter(([catId]) => catId !== 'signals')
            .map(([catId, category]) => {
            const counts = categoryCounts[catId] || { enabled: 0, total: 0 };
            return (
              <div
                key={catId}
                className="border border-gray-200 rounded-lg p-4 hover:border-gray-300 transition-colors"
              >
                <div className="flex items-center gap-2 mb-2">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: category.color }}
                  />
                  <span className="font-medium text-gray-900">{category.name}</span>
                </div>
                <p className="text-2xl font-bold text-gray-900">
                  {counts.enabled}/{counts.total}
                </p>
                <p className="text-xs text-gray-500">parameters enabled</p>
              </div>
            );
          })}
        </div>

        <div className="mt-4 border-t border-gray-200 pt-4">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-lg font-bold text-gray-900">{enabledRulesCount}</span>
              <span className="text-gray-500 ml-2">anomaly rules active</span>
            </div>
            <span className="text-sm text-gray-500">
              {(anomalyRules || []).length} total rules defined
            </span>
          </div>
        </div>
      </div>

      {/* Quick actions */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h3>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => {
              // Copy JSON to clipboard
              const data = {
                ...profile,
                thresholds: mapThresholdsToExistingSchema(thresholds, signalQuality),
                anomalyRules
              };
              navigator.clipboard.writeText(JSON.stringify(data, null, 2));
            }}
            className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            Copy as JSON
          </button>
          <button
            onClick={() => {
              // Download JSON
              const data = {
                ...profile,
                thresholds: mapThresholdsToExistingSchema(thresholds, signalQuality),
                anomalyRules
              };
              const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `${profile?.profileId || 'profile'}.json`;
              a.click();
              URL.revokeObjectURL(url);
            }}
            className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Export Profile
          </button>
        </div>
      </div>
    </div>
  );
}

function EngineSizeModal({
  isOpen,
  onClose,
  indexData,
  defaultFamilyId,
  selectedSizeId,
  onIndexUpdate,
  onSelectSize
}) {
  const [mode, setMode] = useState('add');
  const [familyFilter, setFamilyFilter] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [form, setForm] = useState({
    id: '',
    name: '',
    family: '',
    description: '',
    fullLoadTpsThreshold: '',
    ratedRpm: '',
    idleRpm: '',
    tipMapDeltaThreshold: ''
  });
  const [archived, setArchived] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const engineFamilies = indexData?.engineFamilies || [];
  const engineSizes = indexData?.engineSizes || [];

  const toNumber = (value) => {
    if (value === null || value === undefined) return null;
    const trimmed = String(value).trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  };

  const filteredSizes = useMemo(() => {
    if (!familyFilter) return engineSizes;
    return engineSizes.filter(size => size.family === familyFilter);
  }, [engineSizes, familyFilter]);

  const loadFormFromSize = useCallback((size, fallbackFamily = '') => {
    if (!size) {
      setForm({
        id: '',
        name: '',
        family: fallbackFamily,
        description: '',
        fullLoadTpsThreshold: '',
        ratedRpm: '',
        idleRpm: '',
        tipMapDeltaThreshold: ''
      });
      setArchived(false);
      return;
    }

    setForm({
      id: size.id || '',
      name: size.name || '',
      family: size.family || fallbackFamily,
      description: size.description || '',
      fullLoadTpsThreshold: size.params?.fullLoadTpsThreshold ?? '',
      ratedRpm: size.params?.ratedRpm ?? '',
      idleRpm: size.params?.idleRpm ?? '',
      tipMapDeltaThreshold: size.params?.tipMapDeltaThreshold ?? ''
    });
    setArchived(Boolean(size.archived));
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const initialFamily = defaultFamilyId || engineFamilies[0]?.id || '';
    setFamilyFilter(initialFamily);

    if (selectedSizeId) {
      const size = engineSizes.find(entry => entry.id === selectedSizeId);
      setMode('edit');
      setSelectedId(size?.id || '');
      loadFormFromSize(size, initialFamily);
    } else if (engineSizes.length > 0) {
      const firstSize = engineSizes[0];
      setMode('edit');
      setSelectedId(firstSize.id);
      loadFormFromSize(firstSize, initialFamily);
    } else {
      setMode('add');
      setSelectedId('');
      loadFormFromSize(null, initialFamily);
    }
    setError(null);
  }, [isOpen, defaultFamilyId, engineFamilies, engineSizes, selectedSizeId, loadFormFromSize]);

  useEffect(() => {
    if (!isOpen || mode !== 'edit') return;
    const size = engineSizes.find(entry => entry.id === selectedId);
    if (size) {
      loadFormFromSize(size, size.family);
    }
  }, [isOpen, mode, selectedId, engineSizes, loadFormFromSize]);

  useEffect(() => {
    if (!isOpen || mode !== 'add') return;
    const defaults = engineSizes.find(size => size.family === form.family)?.params || {};
    setForm(prev => ({
      ...prev,
      fullLoadTpsThreshold: prev.fullLoadTpsThreshold || defaults.fullLoadTpsThreshold || '',
      ratedRpm: prev.ratedRpm || defaults.ratedRpm || '',
      idleRpm: prev.idleRpm || defaults.idleRpm || '',
      tipMapDeltaThreshold: prev.tipMapDeltaThreshold || defaults.tipMapDeltaThreshold || ''
    }));
  }, [isOpen, mode, form.family, engineSizes]);

  const handleFieldChange = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const buildParams = () => {
    const params = {};
    const fullLoadTpsThreshold = toNumber(form.fullLoadTpsThreshold);
    if (fullLoadTpsThreshold !== null) params.fullLoadTpsThreshold = fullLoadTpsThreshold;
    const ratedRpm = toNumber(form.ratedRpm);
    if (ratedRpm !== null) params.ratedRpm = ratedRpm;
    const idleRpm = toNumber(form.idleRpm);
    if (idleRpm !== null) params.idleRpm = idleRpm;
    const tipMapDeltaThreshold = toNumber(form.tipMapDeltaThreshold);
    if (tipMapDeltaThreshold !== null) params.tipMapDeltaThreshold = tipMapDeltaThreshold;
    return params;
  };

  const handleSave = async () => {
    setError(null);
    const params = buildParams();

    if (!form.name.trim()) {
      setError('Engine size name is required.');
      return;
    }

    if (mode === 'add') {
      if (!form.id.trim()) {
        setError('Engine size ID is required.');
        return;
      }
      if (!form.family) {
        setError('Engine family is required.');
        return;
      }
    }

    try {
      setLoading(true);
      if (mode === 'add') {
        const updatedIndex = await addEngineSize({
          id: form.id.trim(),
          name: form.name.trim(),
          family: form.family,
          description: form.description.trim(),
          params
        });
        onIndexUpdate?.(updatedIndex);
        setMode('edit');
        setSelectedId(form.id.trim());
        onSelectSize?.(form.id.trim());
      } else {
        const updatedIndex = await updateEngineSize(selectedId, {
          name: form.name.trim(),
          family: form.family,
          description: form.description.trim(),
          params
        });
        onIndexUpdate?.(updatedIndex);
      }
    } catch (err) {
      setError(err.message || 'Failed to save engine size.');
    } finally {
      setLoading(false);
    }
  };

  const handleArchiveToggle = async () => {
    if (!selectedId) return;
    try {
      setLoading(true);
      const updatedIndex = await setEngineSizeArchived(selectedId, !archived);
      onIndexUpdate?.(updatedIndex);
      setArchived(!archived);
    } catch (err) {
      setError(err.message || 'Failed to update archive status.');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Manage Engine Sizes</h2>
            <p className="text-xs text-gray-500">Add, edit, or archive engine size definitions.</p>
          </div>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-6 py-4 space-y-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMode('add')}
              className={`px-3 py-1 rounded-full text-sm ${
                mode === 'add' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'
              }`}
            >
              Add New
            </button>
            <button
              type="button"
              onClick={() => setMode('edit')}
              className={`px-3 py-1 rounded-full text-sm ${
                mode === 'edit' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'
              }`}
            >
              Edit Existing
            </button>
          </div>

          {mode === 'edit' && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  Filter by Family
                </label>
                <select
                  value={familyFilter}
                  onChange={(e) => setFamilyFilter(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                >
                  <option value="">All Families</option>
                  {engineFamilies.map(family => (
                    <option key={family.id} value={family.id}>{family.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  Engine Size
                </label>
                <select
                  value={selectedId}
                  onChange={(e) => setSelectedId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                >
                  {filteredSizes.map(size => (
                    <option key={size.id} value={size.id}>
                      {size.name}{size.archived ? ' (Archived)' : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                Engine Size ID
              </label>
              <input
                type="text"
                value={form.id}
                onChange={(e) => handleFieldChange('id', e.target.value)}
                disabled={mode === 'edit'}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg disabled:bg-gray-100"
                placeholder="e.g., 11L"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                Display Name
              </label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => handleFieldChange('name', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                placeholder="e.g., 11L"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                Engine Family
              </label>
              <select
                value={form.family}
                onChange={(e) => handleFieldChange('family', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              >
                <option value="">Select family...</option>
                {engineFamilies.map(family => (
                  <option key={family.id} value={family.id}>{family.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                Description
              </label>
              <input
                type="text"
                value={form.description}
                onChange={(e) => handleFieldChange('description', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                placeholder="Optional description"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                Full Load TPS Threshold (%)
              </label>
              <input
                type="number"
                value={form.fullLoadTpsThreshold}
                onChange={(e) => handleFieldChange('fullLoadTpsThreshold', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                Rated RPM
              </label>
              <input
                type="number"
                value={form.ratedRpm}
                onChange={(e) => handleFieldChange('ratedRpm', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                Idle RPM
              </label>
              <input
                type="number"
                value={form.idleRpm}
                onChange={(e) => handleFieldChange('idleRpm', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                TIP-MAP Delta Threshold (psi)
              </label>
              <input
                type="number"
                value={form.tipMapDeltaThreshold}
                onChange={(e) => handleFieldChange('tipMapDeltaThreshold', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
            </div>
          </div>

          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200">
          <div>
            {mode === 'edit' && (
              <button
                type="button"
                onClick={handleArchiveToggle}
                disabled={loading || !selectedId}
                className={`px-3 py-2 text-sm font-medium rounded-lg ${
                  archived ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'
                }`}
              >
                {archived ? 'Unarchive' : 'Archive'}
              </button>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={loading}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Signal Quality section
 */
function SignalQualityEditor({ config, onChange }) {
  const signalConfig = config || {
    enabled: true,
    alertSeverity: 'info',
    suppressRelatedAlerts: true,
    defaults: { dropoutGapSec: 0.5 },
    channels: {}
  };

  const handleChange = (field, value) => {
    onChange({ ...signalConfig, [field]: value });
  };

  const handleChannelChange = (channelName, channelConfig) => {
    onChange({
      ...signalConfig,
      channels: {
        ...signalConfig.channels,
        [channelName]: channelConfig
      }
    });
  };

  const commonChannels = [
    { name: 'OILP_press', label: 'Oil Pressure', alerts: ['oil_pressure_warning_low', 'oil_pressure_critical_low'] },
    { name: 'ECT', label: 'Coolant Temp', alerts: ['coolant_critical_high', 'coolant_warning_high'] },
    { name: 'Vbat', label: 'Battery Voltage', alerts: ['battery_critical_low', 'battery_warning_low', 'battery_critical_high'] },
    { name: 'MAP', label: 'Manifold Pressure', alerts: [] },
    { name: 'rpm', label: 'Engine Speed', alerts: ['rpm_overspeed', 'rpm_critical_high', 'rpm_warning_high'] },
    { name: 'IAT', label: 'Intake Air Temp', alerts: [] },
    { name: 'OILT', label: 'Oil Temperature', alerts: [] }
  ];

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Signal Quality Settings</h3>

        <div className="space-y-4">
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={signalConfig.enabled !== false}
              onChange={(e) => handleChange('enabled', e.target.checked)}
              className="w-5 h-5 text-blue-600 rounded focus:ring-blue-500"
            />
            <div>
              <span className="font-medium text-gray-900">Enable Signal Dropout Detection</span>
              <p className="text-sm text-gray-500">Detect missing/NaN sensor values during engine operation</p>
            </div>
          </label>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Alert Severity</label>
              <select
                value={signalConfig.alertSeverity || 'info'}
                onChange={(e) => handleChange('alertSeverity', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              >
                <option value="info">Info</option>
                <option value="warning">Warning</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Default Gap Threshold</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={signalConfig.defaults?.dropoutGapSec ?? 0.5}
                  onChange={(e) => handleChange('defaults', {
                    ...signalConfig.defaults,
                    dropoutGapSec: parseFloat(e.target.value) || 0.5
                  })}
                  min={0.1}
                  max={10}
                  step={0.1}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg"
                />
                <span className="text-sm text-gray-500">seconds</span>
              </div>
            </div>
          </div>

          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={signalConfig.suppressRelatedAlerts !== false}
              onChange={(e) => handleChange('suppressRelatedAlerts', e.target.checked)}
              className="w-5 h-5 text-blue-600 rounded focus:ring-blue-500"
            />
            <div>
              <span className="font-medium text-gray-900">Suppress Related Alerts</span>
              <p className="text-sm text-gray-500">Hide threshold alerts when signal dropout is detected</p>
            </div>
          </label>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Per-Channel Configuration</h3>

        <div className="space-y-4">
          {commonChannels.map(channel => {
            const channelConfig = signalConfig.channels?.[channel.name] || {};
            const isEnabled = channelConfig.enabled !== false;

            return (
              <div key={channel.name} className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <label className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={isEnabled}
                      onChange={(e) => handleChannelChange(channel.name, {
                        ...channelConfig,
                        enabled: e.target.checked
                      })}
                      className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                    />
                    <span className="font-medium text-gray-900">{channel.label}</span>
                    <code className="text-xs bg-gray-100 px-2 py-1 rounded">{channel.name}</code>
                  </label>
                </div>

                {isEnabled && (
                  <div className="ml-7 space-y-3">
                    <div className="flex items-center gap-4">
                      <label className="text-sm text-gray-600">Gap threshold:</label>
                      <input
                        type="number"
                        value={channelConfig.dropoutGapSec ?? signalConfig.defaults?.dropoutGapSec ?? 0.5}
                        onChange={(e) => handleChannelChange(channel.name, {
                          ...channelConfig,
                          dropoutGapSec: parseFloat(e.target.value)
                        })}
                        min={0.1}
                        max={10}
                        step={0.1}
                        className="w-20 px-2 py-1 border border-gray-300 rounded text-sm"
                      />
                      <span className="text-sm text-gray-500">seconds</span>
                    </div>

                    {channel.alerts.length > 0 && (
                      <div>
                        <label className="text-sm text-gray-600 block mb-1">Suppress alerts on dropout:</label>
                        <div className="flex flex-wrap gap-2">
                          {channel.alerts.map(alertId => (
                            <label key={alertId} className="flex items-center gap-1 text-sm">
                              <input
                                type="checkbox"
                                checked={(channelConfig.suppressAlerts || []).includes(alertId)}
                                onChange={(e) => {
                                  const current = channelConfig.suppressAlerts || [];
                                  const updated = e.target.checked
                                    ? [...current, alertId]
                                    : current.filter(a => a !== alertId);
                                  handleChannelChange(channel.name, {
                                    ...channelConfig,
                                    suppressAlerts: updated
                                  });
                                }}
                                className="w-3 h-3 text-blue-600 rounded"
                              />
                              <code className="text-xs bg-gray-100 px-1 rounded">{alertId}</code>
                            </label>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/**
 * Advanced settings section
 * v3.1: Fixed Raw JSON editor to sync all state (profile, thresholds, anomalyRules, signalQuality)
 * v3.1.2: Use index data for fuel types and applications
 */
function AdvancedSettings({
  profile,
  thresholds,
  anomalyRules,
  signalQuality,
  onProfileChange,
  onThresholdsChange,
  onAnomalyRulesChange,
  onSignalQualityChange,
  indexData
}) {
  // Build full profile object for JSON display
  const fullProfile = useMemo(() => ({
    ...profile,
    thresholds: { ...thresholds, signalQuality },
    anomalyRules
  }), [profile, thresholds, anomalyRules, signalQuality]);

  const [jsonError, setJsonError] = useState(null);

  const handleJsonChange = useCallback((e) => {
    try {
      const parsed = JSON.parse(e.target.value);
      setJsonError(null);

      // Extract and update all state objects (v3.1 fix)
      const { thresholds: newThresholds, anomalyRules: newRules, ...newProfile } = parsed;

      // Update profile metadata
      onProfileChange(newProfile);

      // Update thresholds (extract signalQuality separately)
      if (newThresholds) {
        const { signalQuality: newSignalQuality, ...restThresholds } = newThresholds;
        onThresholdsChange(restThresholds);
        if (newSignalQuality) {
          onSignalQualityChange(newSignalQuality);
        }
      }

      // Update anomaly rules
      if (newRules) {
        onAnomalyRulesChange(newRules);
      }
    } catch (err) {
      setJsonError(err.message);
    }
  }, [onProfileChange, onThresholdsChange, onAnomalyRulesChange, onSignalQualityChange]);

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Profile Metadata</h3>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Version</label>
            <input
              type="text"
              value={profile?.version || '1.0.0'}
              onChange={(e) => onProfileChange({ ...profile, version: e.target.value })}
              className="w-full max-w-xs px-3 py-2 border border-gray-300 rounded-lg"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
            <select
              value={profile?.status || 'active'}
              onChange={(e) => onProfileChange({ ...profile, status: e.target.value })}
              className="w-full max-w-xs px-3 py-2 border border-gray-300 rounded-lg"
            >
              <option value="active">Active</option>
              <option value="draft">Draft</option>
              <option value="archived">Archived</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Fuel Type</label>
            <select
              value={profile?.fuelType || ''}
              onChange={(e) => onProfileChange({ ...profile, fuelType: e.target.value || null })}
              className="w-full max-w-xs px-3 py-2 border border-gray-300 rounded-lg"
            >
              <option value="">Any</option>
              {(indexData?.fuelTypes || []).map(fuel => (
                <option key={fuel.id} value={fuel.id}>{fuel.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Application</label>
            <select
              value={profile?.application || ''}
              onChange={(e) => onProfileChange({ ...profile, application: e.target.value || null })}
              className="w-full max-w-xs px-3 py-2 border border-gray-300 rounded-lg"
            >
              <option value="">Any</option>
              {(indexData?.applications || []).map(app => (
                <option key={app.id} value={app.id}>{app.name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Raw JSON</h3>
        <p className="text-sm text-gray-500 mb-4">
          View and edit the raw profile JSON. Changes made here will update all editors.
        </p>
        {jsonError && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            JSON Parse Error: {jsonError}
          </div>
        )}
        <textarea
          value={JSON.stringify(fullProfile, null, 2)}
          onChange={handleJsonChange}
          rows={20}
          className={`w-full font-mono text-sm px-3 py-2 border rounded-lg ${
            jsonError ? 'border-red-300 bg-red-50' : 'border-gray-300'
          }`}
          spellCheck={false}
        />
      </div>
    </div>
  );
}

/**
 * Main Config3Editor component
 */
export default function Config3Editor({
  profile: initialProfile,
  onSave,
  onBack
}) {
  const [profile, setProfile] = useState(initialProfile || {
    profileId: `profile-${Date.now()}`,
    name: 'New Profile',
    description: '',
    parent: 'global-defaults',
    engineFamily: null,
    version: '1.0.0',
    status: 'draft'
  });

  const [thresholds, setThresholds] = useState(initialProfile?.thresholds || {});
  const [anomalyRules, setAnomalyRules] = useState(initialProfile?.anomalyRules || []);
  const [signalQuality, setSignalQuality] = useState(initialProfile?.thresholds?.signalQuality || {});

  const [activeSection, setActiveSection] = useState('overview');
  const [activeSubsection, setActiveSubsection] = useState(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [validationErrors, setValidationErrors] = useState([]);
  const [saveMessage, setSaveMessage] = useState(null); // v3.1: Add save feedback message

  // v3.1.2: Load index data for engine families, sizes, and applications
  const [indexData, setIndexData] = useState(null);

  // v3.1.4: Engine size management modal state
  const [engineSizeModalOpen, setEngineSizeModalOpen] = useState(false);

  useEffect(() => {
    getIndex()
      .then(index => setIndexData(index))
      .catch(err => console.error('Failed to load profile index:', err));
  }, []);

  // Track initial mount to avoid marking hasChanges on load
  const isInitialMount = useRef(true);
  const initialStateRef = useRef({
    profile: JSON.stringify(profile),
    thresholds: JSON.stringify(thresholds),
    anomalyRules: JSON.stringify(anomalyRules),
    signalQuality: JSON.stringify(signalQuality)
  });

  // Track changes - only after initial mount and when state actually differs from initial
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }

    // Compare current state with initial to detect actual changes
    const currentState = {
      profile: JSON.stringify(profile),
      thresholds: JSON.stringify(thresholds),
      anomalyRules: JSON.stringify(anomalyRules),
      signalQuality: JSON.stringify(signalQuality)
    };

    const hasActualChanges =
      currentState.profile !== initialStateRef.current.profile ||
      currentState.thresholds !== initialStateRef.current.thresholds ||
      currentState.anomalyRules !== initialStateRef.current.anomalyRules ||
      currentState.signalQuality !== initialStateRef.current.signalQuality;

    setHasChanges(hasActualChanges);
  }, [profile, thresholds, anomalyRules, signalQuality]);

  const handleSectionChange = useCallback((section, subsection) => {
    setActiveSection(section);
    setActiveSubsection(subsection);
  }, []);

  // Validation must be defined before handleSave (v3.1 reorder)
  const handleValidate = useCallback(() => {
    const errors = [];

    // Check profile basics
    if (!profile.name?.trim()) {
      errors.push('Profile name is required');
    }
    if (!profile.profileId?.trim()) {
      errors.push('Profile ID is required');
    }

    // Check threshold validity
    for (const [id, config] of Object.entries(thresholds)) {
      if (!config || id === 'signalQuality') continue;

      const param = PARAMETER_CATALOG[id];
      if (!param) continue;

      // Check warning vs critical ordering
      if (config.warning?.min !== undefined && config.critical?.min !== undefined) {
        if (config.warning.min <= config.critical.min) {
          errors.push(`${param.name}: Warning min must be > critical min`);
        }
      }
      if (config.warning?.max !== undefined && config.critical?.max !== undefined) {
        if (config.warning.max >= config.critical.max) {
          errors.push(`${param.name}: Warning max must be < critical max`);
        }
      }

      // v3.1: Check min < max within each tier
      if (config.warning?.min !== undefined && config.warning?.max !== undefined) {
        if (config.warning.min >= config.warning.max) {
          errors.push(`${param.name}: Warning min must be < warning max`);
        }
      }
      if (config.critical?.min !== undefined && config.critical?.max !== undefined) {
        if (config.critical.min >= config.critical.max) {
          errors.push(`${param.name}: Critical min must be < critical max`);
        }
      }
    }

    // Check rules
    for (const rule of anomalyRules) {
      if (!rule.id?.trim()) {
        errors.push(`Rule "${rule.name || 'Unnamed'}": ID is required`);
      }
      if (!rule.name?.trim()) {
        errors.push(`Rule with ID "${rule.id}": Name is required`);
      }
      if (!rule.conditions || rule.conditions.length === 0) {
        errors.push(`Rule "${rule.name}": At least one condition is required`);
      }
    }

    setValidationErrors(errors);
    return errors.length === 0;
  }, [profile, thresholds, anomalyRules]);

  const handleSave = useCallback(async () => {
    // Clear previous messages
    setSaveMessage(null);

    // Validate before saving (v3.1 fix)
    const isValid = handleValidate();
    if (!isValid) {
      // v3.1: Show prominent validation failure message
      setSaveMessage({ type: 'error', text: 'Cannot save: Please fix validation errors below' });
      // Scroll to top to show error message
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return; // Don't save if validation fails
    }

    setIsSaving(true);
    try {
      const fullProfile = {
        ...profile,
        thresholds: mapThresholdsToExistingSchema(thresholds, signalQuality),
        anomalyRules,
        lastModified: new Date().toISOString()
      };
      await onSave?.(fullProfile);

      // Update initial state ref after successful save (v3.1 fix)
      initialStateRef.current = {
        profile: JSON.stringify(profile),
        thresholds: JSON.stringify(thresholds),
        anomalyRules: JSON.stringify(anomalyRules),
        signalQuality: JSON.stringify(signalQuality)
      };
      setHasChanges(false);
      // v3.1: Show success message
      setSaveMessage({ type: 'success', text: 'Profile saved successfully!' });
      setTimeout(() => setSaveMessage(null), 3000);
    } catch (error) {
      console.error('Failed to save:', error);
      setValidationErrors([error.message || 'Failed to save profile']);
      setSaveMessage({ type: 'error', text: error.message || 'Failed to save profile' });
    } finally {
      setIsSaving(false);
    }
  }, [profile, thresholds, anomalyRules, signalQuality, onSave, handleValidate]);

  // Render section content
  const renderContent = () => {
    switch (activeSection) {
      case 'overview':
        return (
          <ProfileOverview
            profile={profile}
            thresholds={thresholds}
            anomalyRules={anomalyRules}
            signalQuality={signalQuality}
            onChange={setProfile}
            indexData={indexData}
            onOpenEngineSizeModal={() => setEngineSizeModalOpen(true)}
          />
        );

      case 'thresholds':
        if (activeSubsection) {
          return (
            <CategoryParameterGrid
              categoryId={activeSubsection}
              thresholds={thresholds}
              onChange={setThresholds}
              engineFamily={profile?.engineFamily}
              engineSize={profile?.engineSize} // v3.1.3: Filter MFG params by engine size
              excludedCategoryIds={EXCLUDED_THRESHOLD_CATEGORY_IDS}
            />
          );
        }
        return (
          <ParameterGrid
            thresholds={thresholds}
            onChange={setThresholds}
            engineFamily={profile?.engineFamily}
            engineSize={profile?.engineSize} // v3.1.3: Filter MFG params by engine size
            showSearch={true}
            showCategoryTabs={true}
            showQuickActions={true}
            columns={2}
            excludedCategoryIds={EXCLUDED_THRESHOLD_CATEGORY_IDS}
          />
        );

      case 'rules':
        return (
          <RuleBuilder
            rules={anomalyRules}
            onChange={setAnomalyRules}
          />
        );

      case 'signals':
        return (
          <SignalQualityEditor
            config={signalQuality}
            onChange={setSignalQuality}
          />
        );

      case 'preview':
        return (
          <ThresholdPreview
            thresholds={mapThresholdsToExistingSchema(thresholds, signalQuality)}
            anomalyRules={anomalyRules}
          />
        );

      case 'advanced':
        return (
          <AdvancedSettings
            profile={profile}
            thresholds={thresholds}
            anomalyRules={anomalyRules}
            signalQuality={signalQuality}
            onProfileChange={setProfile}
            onThresholdsChange={setThresholds}
            onAnomalyRulesChange={setAnomalyRules}
            onSignalQualityChange={setSignalQuality}
            indexData={indexData}
          />
        );

      default:
        return <div>Unknown section</div>;
    }
  };

  return (
    <>
      <ConfiguratorLayout
        profile={profile}
        activeSection={activeSection}
        activeSubsection={activeSubsection}
        onSectionChange={handleSectionChange}
        onSave={handleSave}
        onValidate={handleValidate}
        onBack={onBack}
        hasChanges={hasChanges}
        isSaving={isSaving}
        validationErrors={validationErrors}
        saveMessage={saveMessage}
      >
        {renderContent()}
      </ConfiguratorLayout>

      <EngineSizeModal
        isOpen={engineSizeModalOpen}
        onClose={() => setEngineSizeModalOpen(false)}
        indexData={indexData}
        defaultFamilyId={profile?.engineFamily || ''}
        selectedSizeId={profile?.engineSize || ''}
        onIndexUpdate={setIndexData}
        onSelectSize={(sizeId) => setProfile(prev => ({ ...prev, engineSize: sizeId }))}
      />
    </>
  );
}
