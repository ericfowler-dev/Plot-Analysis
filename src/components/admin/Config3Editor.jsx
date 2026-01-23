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
 */

import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import ConfiguratorLayout from './ConfiguratorLayout';
import ParameterGrid, { CategoryParameterGrid } from './ParameterGrid';
import RuleBuilder from './RuleBuilder';
import ThresholdPreview from './ThresholdPreview';
import { PARAMETER_CATALOG, PARAMETER_CATEGORIES } from '../../lib/parameterCatalog';

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
 */
function ProfileOverview({ profile, thresholds, anomalyRules, signalQuality, onChange }) {
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
              value={profile?.engineFamily || ''}
              onChange={(e) => onChange({ ...profile, engineFamily: e.target.value || null })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="">None (Universal)</option>
              <option value="psi-hd">PSI HD</option>
              <option value="psi-industrial">PSI Industrial</option>
            </select>
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
 */
function AdvancedSettings({
  profile,
  thresholds,
  anomalyRules,
  signalQuality,
  onProfileChange,
  onThresholdsChange,
  onAnomalyRulesChange,
  onSignalQualityChange
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
              <option value="natural_gas">Natural Gas</option>
              <option value="propane">Propane/LPG</option>
              <option value="gasoline">Gasoline</option>
              <option value="diesel">Diesel</option>
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
              <option value="generator">Generator</option>
              <option value="compressor">Compressor</option>
              <option value="pump">Pump</option>
              <option value="vehicle">Vehicle</option>
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
              excludedCategoryIds={EXCLUDED_THRESHOLD_CATEGORY_IDS}
            />
          );
        }
        return (
          <ParameterGrid
            thresholds={thresholds}
            onChange={setThresholds}
            engineFamily={profile?.engineFamily}
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
          />
        );

      default:
        return <div>Unknown section</div>;
    }
  };

  return (
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
  );
}
