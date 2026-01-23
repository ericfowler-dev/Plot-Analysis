/**
 * Threshold Editor Component
 * Detailed editor for threshold profile values
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  ArrowLeft,
  Save,
  AlertCircle,
  AlertTriangle,
  Info,
  ChevronDown,
  ChevronRight,
  RotateCcw,
  Plus,
  Trash2,
  Copy
} from 'lucide-react';
import { getResolvedProfile, validateThresholds } from '../../lib/thresholdService';
import { BPLOT_PARAMETERS } from '../../lib/bplotThresholds';
import {
  ENGINE_STATE_OPTIONS,
  SIGNAL_PARAMETER_OPTIONS,
  PARAMETER_OPTIONS,
  ALL_CONDITION_LOOKUP,
  PARAMETER_LOOKUP,
  CONDITION_OPERATORS,
  isEnginePredicate
} from '../../lib/conditionParameters';

// Threshold categories for organization
const THRESHOLD_CATEGORIES = [
  {
    id: 'battery',
    name: 'Battery / Voltage',
    icon: '🔋',
    fields: [
      { path: 'battery.critical.min', label: 'Critical Low', unit: 'V', type: 'number', step: 0.1 },
      { path: 'battery.critical.max', label: 'Critical High', unit: 'V', type: 'number', step: 0.1 },
      { path: 'battery.warning.min', label: 'Warning Low', unit: 'V', type: 'number', step: 0.1 },
      { path: 'battery.warning.max', label: 'Warning High', unit: 'V', type: 'number', step: 0.1 },
      { path: 'battery.hysteresis.lowClear', label: 'Clear Low', unit: 'V', type: 'number', step: 0.1 },
      { path: 'battery.hysteresis.highClear', label: 'Clear High', unit: 'V', type: 'number', step: 0.1 },
      { path: 'battery.enabled', label: 'Enabled', type: 'boolean' }
    ]
  },
  {
    id: 'coolantTemp',
    name: 'Coolant Temperature',
    icon: '🌡️',
    fields: [
      { path: 'coolantTemp.critical.max', label: 'Critical Max', unit: '°F', type: 'number', step: 1 },
      { path: 'coolantTemp.warning.max', label: 'Warning Max', unit: '°F', type: 'number', step: 1 },
      { path: 'coolantTemp.gracePeriod', label: 'Grace Period', unit: 's', type: 'number', step: 1 },
      { path: 'coolantTemp.enabled', label: 'Enabled', type: 'boolean' }
    ]
  },
  {
    id: 'oilPressure',
    name: 'Oil Pressure',
    icon: '🛢️',
    fields: [
      { path: 'oilPressure.critical.min', label: 'Critical Min', unit: 'psi', type: 'number', step: 1 },
      { path: 'oilPressure.warning.min', label: 'Warning Min', unit: 'psi', type: 'number', step: 1 },
      { path: 'oilPressure.rpmThreshold', label: 'RPM Threshold', unit: 'RPM', type: 'number', step: 50 },
      { path: 'oilPressure.rpmDependent', label: 'RPM Dependent', type: 'boolean' },
      { path: 'oilPressure.enabled', label: 'Enabled', type: 'boolean' }
    ]
  },
  {
    id: 'rpm',
    name: 'Engine Speed',
    icon: '⚡',
    fields: [
      { path: 'rpm.warning.max', label: 'Warning Max', unit: 'RPM', type: 'number', step: 100 },
      { path: 'rpm.critical.max', label: 'Critical Max', unit: 'RPM', type: 'number', step: 100 },
      { path: 'rpm.overspeed', label: 'Overspeed', unit: 'RPM', type: 'number', step: 100 },
      { path: 'rpm.enabled', label: 'Enabled', type: 'boolean' }
    ]
  },
  {
    id: 'fuelTrim',
    name: 'Fuel Trim',
    icon: '⛽',
    fields: [
      { path: 'fuelTrim.closedLoop.warning.min', label: 'CL Warning Min', unit: '%', type: 'number', step: 1 },
      { path: 'fuelTrim.closedLoop.warning.max', label: 'CL Warning Max', unit: '%', type: 'number', step: 1 },
      { path: 'fuelTrim.closedLoop.critical.min', label: 'CL Critical Min', unit: '%', type: 'number', step: 1 },
      { path: 'fuelTrim.closedLoop.critical.max', label: 'CL Critical Max', unit: '%', type: 'number', step: 1 },
      { path: 'fuelTrim.adaptive.warning.min', label: 'Adaptive Warning Min', unit: '%', type: 'number', step: 1 },
      { path: 'fuelTrim.adaptive.warning.max', label: 'Adaptive Warning Max', unit: '%', type: 'number', step: 1 },
      { path: 'fuelTrim.adaptive.critical.min', label: 'Adaptive Critical Min', unit: '%', type: 'number', step: 1 },
      { path: 'fuelTrim.adaptive.critical.max', label: 'Adaptive Critical Max', unit: '%', type: 'number', step: 1 },
      { path: 'fuelTrim.enabled', label: 'Enabled', type: 'boolean' }
    ]
  },
  {
    id: 'knock',
    name: 'Knock Detection',
    icon: '💥',
    fields: [
      { path: 'knock.maxRetard.warning', label: 'Max Retard Warning', unit: '°', type: 'number', step: 1 },
      { path: 'knock.maxRetard.critical', label: 'Max Retard Critical', unit: '°', type: 'number', step: 1 },
      { path: 'knock.percentageThreshold.warning', label: 'Time % Warning', unit: '%', type: 'number', step: 1 },
      { path: 'knock.percentageThreshold.critical', label: 'Time % Critical', unit: '%', type: 'number', step: 1 },
      { path: 'knock.enabled', label: 'Enabled', type: 'boolean' }
    ]
  },
  {
    id: 'oilTemp',
    name: 'Oil Temperature',
    icon: '🌡️',
    fields: [
      { path: 'oilTemp.warning.max', label: 'Warning Max', unit: '°F', type: 'number', step: 1 },
      { path: 'oilTemp.critical.max', label: 'Critical Max', unit: '°F', type: 'number', step: 1 },
      { path: 'oilTemp.enabled', label: 'Enabled', type: 'boolean' }
    ]
  },
  {
    id: 'manifoldPressure',
    name: 'Manifold Pressure',
    icon: '📊',
    fields: [
      { path: 'manifoldPressure.warning.min', label: 'Warning Min', unit: 'psia', type: 'number', step: 0.5 },
      { path: 'manifoldPressure.warning.max', label: 'Warning Max', unit: 'psia', type: 'number', step: 0.5 },
      { path: 'manifoldPressure.critical.min', label: 'Critical Min', unit: 'psia', type: 'number', step: 0.5 },
      { path: 'manifoldPressure.critical.max', label: 'Critical Max', unit: 'psia', type: 'number', step: 0.5 },
      { path: 'manifoldPressure.enabled', label: 'Enabled', type: 'boolean' }
    ]
  }
];

const PARAMETER_ALIASES = {
  RPM: 'rpm',
  HM_RAM_seconds: 'HM_RAM',
  Gov1_rpm: 'gov1_rpm',
  Gov2_rpm: 'gov2_rpm',
  Gov3_rpm: 'gov3_rpm'
};

export default function ThresholdEditor({ profile, index, onSave, onCancel, loading }) {
  // Edit state
  const [editedProfile, setEditedProfile] = useState(null);
  const [resolvedParent, setResolvedParent] = useState(null);
  const [expandedCategories, setExpandedCategories] = useState({});
  const [validation, setValidation] = useState({ warnings: [], errors: [], isValid: true });
  const [hasChanges, setHasChanges] = useState(false);

  // Initialize edit state
  useEffect(() => {
    setEditedProfile(JSON.parse(JSON.stringify(profile)));

    // Expand all categories by default
    const expanded = {};
    THRESHOLD_CATEGORIES.forEach(cat => {
      expanded[cat.id] = true;
    });
    setExpandedCategories(expanded);

    // Load parent profile for inheritance display
    if (profile.parent) {
      getResolvedProfile(profile.parent)
        .then(setResolvedParent)
        .catch(console.error);
    }
  }, [profile]);

  /**
   * Get value at path from object
   */
  const getValueAtPath = useCallback((obj, path) => {
    const parts = path.split('.');
    let value = obj;
    for (const part of parts) {
      if (value && typeof value === 'object' && part in value) {
        value = value[part];
      } else {
        return undefined;
      }
    }
    return value;
  }, []);

  /**
   * Set value at path in object
   */
  const setValueAtPath = useCallback((obj, path, value) => {
    const parts = path.split('.');
    const newObj = JSON.parse(JSON.stringify(obj));
    let current = newObj;

    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!(part in current) || typeof current[part] !== 'object') {
        current[part] = {};
      }
      current = current[part];
    }

    current[parts[parts.length - 1]] = value;
    return newObj;
  }, []);

  /**
   * Handle field change
   */
  const handleFieldChange = useCallback((path, value, type) => {
    setEditedProfile(prev => {
      let parsedValue = value;

      if (type === 'number') {
        parsedValue = value === '' ? undefined : parseFloat(value);
      } else if (type === 'boolean') {
        parsedValue = value;
      }

      const newProfile = {
        ...prev,
        thresholds: setValueAtPath(prev.thresholds || {}, path, parsedValue)
      };

      return newProfile;
    });
    setHasChanges(true);
  }, [setValueAtPath]);

  /**
   * Reset field to inherited value
   */
  const handleResetField = useCallback((path) => {
    setEditedProfile(prev => {
      const parts = path.split('.');
      const newThresholds = JSON.parse(JSON.stringify(prev.thresholds || {}));

      // Navigate to parent and delete the key
      let current = newThresholds;
      for (let i = 0; i < parts.length - 1; i++) {
        if (current[parts[i]]) {
          current = current[parts[i]];
        } else {
          return prev; // Path doesn't exist
        }
      }
      delete current[parts[parts.length - 1]];

      // Clean up empty parent objects
      const cleanupEmpty = (obj, pathParts, depth = 0) => {
        if (depth >= pathParts.length - 1) return;
        const key = pathParts[depth];
        if (obj[key] && typeof obj[key] === 'object' && Object.keys(obj[key]).length === 0) {
          delete obj[key];
        } else if (obj[key]) {
          cleanupEmpty(obj[key], pathParts, depth + 1);
          if (typeof obj[key] === 'object' && Object.keys(obj[key]).length === 0) {
            delete obj[key];
          }
        }
      };
      cleanupEmpty(newThresholds, parts);

      return { ...prev, thresholds: newThresholds };
    });
    setHasChanges(true);
  }, []);

  /**
   * Validate current thresholds
   */
  const handleValidate = useCallback(async () => {
    if (!editedProfile?.thresholds) return;

    try {
      // Merge with parent to get full thresholds for validation
      const merged = resolvedParent
        ? { ...resolvedParent.thresholds, ...editedProfile.thresholds }
        : editedProfile.thresholds;

      const result = await validateThresholds(merged);
      setValidation(result);
    } catch (err) {
      console.error('Validation failed:', err);
    }
  }, [editedProfile, resolvedParent]);

  useEffect(() => {
    if (hasChanges) {
      handleValidate();
    }
  }, [editedProfile?.thresholds, hasChanges, handleValidate]);

  /**
   * Handle save
   */
  const handleSave = useCallback(() => {
    if (!validation.isValid) {
      if (!confirm('There are validation errors. Save anyway?')) {
        return;
      }
    }
    onSave(editedProfile);
  }, [editedProfile, validation, onSave]);

  const handleSaveAs = useCallback(() => {
    if (!validation.isValid) {
      if (!confirm('There are validation errors. Save anyway?')) {
        return;
      }
    }
    const newId = prompt('Enter new profile ID (lowercase, hyphens allowed):');
    if (!newId) return;
    const newName = prompt('Enter display name for the new profile:');
    if (!newName) return;

    const now = new Date().toISOString();
    const newProfile = {
      ...editedProfile,
      profileId: newId,
      name: newName,
      status: 'draft',
      version: '1.0.0',
      createdAt: now,
      lastModified: now
    };

    onSave(newProfile);
  }, [editedProfile, onSave, validation]);

  /**
   * Toggle category expansion
   */
  const toggleCategory = (categoryId) => {
    setExpandedCategories(prev => ({
      ...prev,
      [categoryId]: !prev[categoryId]
    }));
  };

  if (!editedProfile) {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-slate-900 z-50 overflow-auto">
      {/* Header */}
      <div className="sticky top-0 bg-slate-800 border-b border-slate-700 z-10">
        <div className="max-w-4xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={onCancel}
                className="p-2 hover:bg-slate-700 rounded-lg transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div>
                <h1 className="text-xl font-semibold text-slate-100">
                  {editedProfile.name}
                </h1>
                <p className="text-sm text-slate-400">
                  {editedProfile.profileId}
                  {editedProfile.parent && ` • Inherits from: ${editedProfile.parent}`}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {hasChanges && (
                <span className="text-sm text-amber-400">Unsaved changes</span>
              )}
              <button
                onClick={onCancel}
                className="px-4 py-2 text-slate-300 hover:bg-slate-700 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={loading}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                {loading ? 'Saving...' : 'Save Changes'}
              </button>
              <button
                onClick={handleSaveAs}
                disabled={loading}
                className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg transition-colors disabled:opacity-50"
              >
                <Copy className="w-4 h-4" />
                Save As
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Validation Messages */}
      {(validation.errors.length > 0 || validation.warnings.length > 0) && (
        <div className="max-w-4xl mx-auto px-6 py-4 space-y-2">
          {validation.errors.map((error, idx) => (
            <div key={`error-${idx}`} className="flex items-center gap-2 px-4 py-2 bg-red-500/20 text-red-400 rounded-lg text-sm">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          ))}
          {validation.warnings.map((warning, idx) => (
            <div key={`warning-${idx}`} className="flex items-center gap-2 px-4 py-2 bg-amber-500/20 text-amber-400 rounded-lg text-sm">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <span>{warning}</span>
            </div>
          ))}
        </div>
      )}

      {/* Profile Metadata */}
      <div className="max-w-4xl mx-auto px-6 py-4">
        <div className="bg-slate-800 rounded-lg border border-slate-700 p-4">
          <h2 className="text-sm font-medium text-slate-300 mb-3">Profile Information</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-slate-500 mb-1">Display Name</label>
              <input
                type="text"
                value={editedProfile.name}
                onChange={(e) => {
                  setEditedProfile(prev => ({ ...prev, name: e.target.value }));
                  setHasChanges(true);
                }}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-200 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Status</label>
              <select
                value={editedProfile.status || 'active'}
                onChange={(e) => {
                  setEditedProfile(prev => ({ ...prev, status: e.target.value }));
                  setHasChanges(true);
                }}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-200 text-sm"
              >
                <option value="active">Active</option>
                <option value="draft">Draft</option>
              </select>
            </div>
            <div className="col-span-2">
              <label className="block text-xs text-slate-500 mb-1">Description</label>
              <textarea
                value={editedProfile.description || ''}
                onChange={(e) => {
                  setEditedProfile(prev => ({ ...prev, description: e.target.value }));
                  setHasChanges(true);
                }}
                rows={2}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-200 text-sm"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Threshold Categories */}
      <div className="max-w-4xl mx-auto px-6 pb-8 space-y-4">
        {THRESHOLD_CATEGORIES.map(category => {
          const isExpanded = expandedCategories[category.id];

          return (
            <div key={category.id} className="bg-slate-800 rounded-lg border border-slate-700">
              <button
                onClick={() => toggleCategory(category.id)}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-750 transition-colors"
              >
                <div className="flex items-center gap-3">
                  {isExpanded ? (
                    <ChevronDown className="w-5 h-5 text-slate-400" />
                  ) : (
                    <ChevronRight className="w-5 h-5 text-slate-400" />
                  )}
                  <span className="text-lg">{category.icon}</span>
                  <span className="font-medium text-slate-200">{category.name}</span>
                </div>
              </button>

              {isExpanded && (
                <div className="border-t border-slate-700 p-4">
                  <div className="grid grid-cols-2 gap-4">
                    {category.fields.map(field => {
                      const currentValue = getValueAtPath(editedProfile.thresholds || {}, field.path);
                      const inheritedValue = resolvedParent
                        ? getValueAtPath(resolvedParent.thresholds || {}, field.path)
                        : undefined;
                      const isOverridden = currentValue !== undefined;
                      const displayValue = currentValue ?? inheritedValue ?? '';

                      return (
                        <div key={field.path} className="flex flex-col">
                          <div className="flex items-center justify-between mb-1">
                            <label className="text-xs text-slate-400">
                              {field.label}
                              {field.unit && <span className="text-slate-500 ml-1">({field.unit})</span>}
                            </label>
                            {isOverridden && inheritedValue !== undefined && (
                              <button
                                onClick={() => handleResetField(field.path)}
                                className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300"
                                title={`Reset to inherited value: ${inheritedValue}`}
                              >
                                <RotateCcw className="w-3 h-3" />
                                Reset
                              </button>
                            )}
                          </div>

                          {field.type === 'boolean' ? (
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={displayValue === true || displayValue === 'true'}
                                onChange={(e) => handleFieldChange(field.path, e.target.checked, 'boolean')}
                                className="w-4 h-4 rounded border-slate-600 bg-slate-700"
                              />
                              <span className="text-sm text-slate-300">
                                {displayValue ? 'Yes' : 'No'}
                              </span>
                            </label>
                          ) : (
                            <div className="relative">
                              <input
                                type="number"
                                value={displayValue}
                                onChange={(e) => handleFieldChange(field.path, e.target.value, 'number')}
                                step={field.step}
                                className={`w-full px-3 py-2 bg-slate-700 border rounded-lg text-slate-200 text-sm ${
                                  isOverridden ? 'border-blue-500' : 'border-slate-600'
                                }`}
                                placeholder={inheritedValue !== undefined ? `Inherited: ${inheritedValue}` : ''}
                              />
                              {isOverridden && (
                                <div className="absolute right-2 top-1/2 -translate-y-1/2">
                                  <span className="text-xs text-blue-400">Override</span>
                                </div>
                              )}
                            </div>
                          )}

                          {!isOverridden && inheritedValue !== undefined && (
                            <div className="text-xs text-slate-500 mt-1">
                              Inherited: {String(inheritedValue)}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  <ConditionListEditor
                    title="Ignore When (skip checks)"
                    conditions={getValueAtPath(editedProfile.thresholds || {}, `${category.id}.ignoreWhen`) || []}
                    onChange={(updated) => {
                      setEditedProfile(prev => ({
                        ...prev,
                        thresholds: setValueAtPath(prev.thresholds || {}, `${category.id}.ignoreWhen`, updated)
                      }));
                      setHasChanges(true);
                    }}
                  />

                  <ConditionListEditor
                    title="Require When (only check if true)"
                    conditions={getValueAtPath(editedProfile.thresholds || {}, `${category.id}.requireWhen`) || []}
                    onChange={(updated) => {
                      setEditedProfile(prev => ({
                        ...prev,
                        thresholds: setValueAtPath(prev.thresholds || {}, `${category.id}.requireWhen`, updated)
                      }));
                      setHasChanges(true);
                    }}
                  />
                </div>
              )}
            </div>
          );
        })}

        {/* Anomaly Rules Section */}
        <div className="bg-slate-800 rounded-lg border border-slate-700">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700">
            <div className="flex items-center gap-3">
              <span className="text-lg">🎯</span>
              <span className="font-medium text-slate-200">Custom Anomaly Rules</span>
            </div>
            <button
              onClick={() => {
                const newRule = {
                  id: `rule-${Date.now()}`,
                  name: 'New Rule',
                  description: '',
                  enabled: true,
                  conditions: [{ param: '', operator: '>', value: 0 }],
                  logic: 'AND',
                  duration: 0,
                  severity: 'warning',
                  category: 'custom'
                };
                setEditedProfile(prev => ({
                  ...prev,
                  anomalyRules: [...(prev.anomalyRules || []), newRule]
                }));
                setHasChanges(true);
              }}
              className="flex items-center gap-1 px-3 py-1 bg-slate-700 hover:bg-slate-600 rounded text-sm text-slate-300"
            >
              <Plus className="w-4 h-4" />
              Add Rule
            </button>
          </div>

          <div className="p-4">
            {(!editedProfile.anomalyRules || editedProfile.anomalyRules.length === 0) ? (
              <div className="text-center py-8 text-slate-500">
                No custom anomaly rules defined.
                <br />
                <span className="text-sm">Rules are inherited from parent profiles.</span>
              </div>
            ) : (
              <div className="space-y-3">
                {editedProfile.anomalyRules.map((rule, ruleIdx) => (
                  <AnomalyRuleEditor
                    key={rule.id}
                    rule={rule}
                    onUpdate={(updatedRule) => {
                      setEditedProfile(prev => ({
                        ...prev,
                        anomalyRules: prev.anomalyRules.map((r, i) =>
                          i === ruleIdx ? updatedRule : r
                        )
                      }));
                      setHasChanges(true);
                    }}
                    onDelete={() => {
                      setEditedProfile(prev => ({
                        ...prev,
                        anomalyRules: prev.anomalyRules.filter((_, i) => i !== ruleIdx)
                      }));
                      setHasChanges(true);
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Anomaly Rule Editor Component
 * Enhanced with timing fields and engine state predicates
 */
function AnomalyRuleEditor({ rule, onUpdate, onDelete }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showTiming, setShowTiming] = useState(
    !!(rule.triggerPersistenceSec || rule.clearPersistenceSec ||
       rule.startDelaySec || rule.stopDelaySec || rule.windowSec)
  );

  // Check if a parameter is an engine state predicate
  const isEnginePredicate = (param) => ENGINE_STATE_OPTIONS.some(opt => opt.key === param);
  const isTipMapDeltaRule = rule.type === 'tip_map_delta';
  const tipMapConfig = rule.config || {};
  const loadGateConfig = tipMapConfig.loadGate || {};

  // Get timing summary for collapsed view
  const getTimingSummary = () => {
    const parts = [];
    if (rule.triggerPersistenceSec) parts.push(`trigger ${rule.triggerPersistenceSec}s`);
    if (rule.startDelaySec) parts.push(`start delay ${rule.startDelaySec}s`);
    if (rule.stopDelaySec) parts.push(`stop delay ${rule.stopDelaySec}s`);
    return parts.length > 0 ? ` • ${parts.join(', ')}` : '';
  };

  return (
    <div className="bg-slate-700 rounded-lg">
      <div className="flex items-center justify-between px-4 py-3">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-3 flex-1 text-left"
        >
          {isExpanded ? (
            <ChevronDown className="w-4 h-4 text-slate-400" />
          ) : (
            <ChevronRight className="w-4 h-4 text-slate-400" />
          )}
          <div>
            <div className="font-medium text-slate-200">{rule.name}</div>
            <div className="text-xs text-slate-400">
              {rule.conditions?.length || 0} condition(s) • {rule.severity} • {rule.enabled ? 'Enabled' : 'Disabled'}
              {getTimingSummary()}
            </div>
          </div>
        </button>
        <button
          onClick={onDelete}
          className="p-2 hover:bg-red-500/20 rounded-lg transition-colors"
        >
          <Trash2 className="w-4 h-4 text-slate-400 hover:text-red-400" />
        </button>
      </div>

      {isExpanded && (
        <div className="px-4 pb-4 border-t border-slate-600 pt-4 space-y-4">
          {/* Basic Info */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Rule Name</label>
              <input
                type="text"
                value={rule.name}
                onChange={(e) => onUpdate({ ...rule, name: e.target.value })}
                className="w-full px-3 py-2 bg-slate-600 border border-slate-500 rounded text-slate-200 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Severity</label>
              <select
                value={rule.severity}
                onChange={(e) => onUpdate({ ...rule, severity: e.target.value })}
                className="w-full px-3 py-2 bg-slate-600 border border-slate-500 rounded text-slate-200 text-sm"
              >
                <option value="warning">Warning</option>
                <option value="critical">Critical</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1">Description</label>
            <input
              type="text"
              value={rule.description || ''}
              onChange={(e) => onUpdate({ ...rule, description: e.target.value })}
              className="w-full px-3 py-2 bg-slate-600 border border-slate-500 rounded text-slate-200 text-sm"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Logic</label>
              <select
                value={rule.logic || 'AND'}
                onChange={(e) => onUpdate({ ...rule, logic: e.target.value })}
                className="w-full px-3 py-2 bg-slate-600 border border-slate-500 rounded text-slate-200 text-sm"
              >
                <option value="AND">All conditions (AND)</option>
                <option value="OR">Any condition (OR)</option>
              </select>
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 cursor-pointer pb-2">
                <input
                  type="checkbox"
                  checked={rule.enabled}
                  onChange={(e) => onUpdate({ ...rule, enabled: e.target.checked })}
                  className="w-4 h-4 rounded border-slate-500 bg-slate-600"
                />
                <span className="text-sm text-slate-300">Rule Enabled</span>
              </label>
            </div>
          </div>

          {/* Timing Settings (Collapsible) */}
          <div className="border border-slate-600 rounded-lg">
            <button
              onClick={() => setShowTiming(!showTiming)}
              className="w-full flex items-center justify-between px-3 py-2 text-sm text-slate-300 hover:bg-slate-600/50"
            >
              <span className="flex items-center gap-2">
                {showTiming ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                Timing & Delays
              </span>
              {(rule.triggerPersistenceSec || rule.startDelaySec || rule.stopDelaySec) && (
                <span className="text-xs text-blue-400">Configured</span>
              )}
            </button>

            {showTiming && (
              <div className="px-3 pb-3 pt-2 border-t border-slate-600 space-y-4">
                {/* Help text */}
                <p className="text-[10px] text-slate-500 bg-slate-700/50 p-2 rounded">
                  These settings control when alerts trigger and clear. Use them to filter out brief spikes or transient conditions.
                </p>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">
                      Trigger Persistence (s)
                    </label>
                    <input
                      type="number"
                      step="0.5"
                      min="0"
                      value={rule.triggerPersistenceSec || ''}
                      onChange={(e) => onUpdate({ ...rule, triggerPersistenceSec: parseFloat(e.target.value) || 0 })}
                      placeholder="0"
                      className="w-full px-3 py-2 bg-slate-600 border border-slate-500 rounded text-slate-200 text-sm"
                    />
                    <p className="text-[10px] text-slate-500 mt-1">
                      Condition must be continuously true for this long before alert triggers. Prevents brief spikes from causing alerts.
                    </p>
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">
                      Clear Persistence (s)
                    </label>
                    <input
                      type="number"
                      step="0.5"
                      min="0"
                      value={rule.clearPersistenceSec || ''}
                      onChange={(e) => onUpdate({ ...rule, clearPersistenceSec: parseFloat(e.target.value) || 0 })}
                      placeholder="0"
                      className="w-full px-3 py-2 bg-slate-600 border border-slate-500 rounded text-slate-200 text-sm"
                    />
                    <p className="text-[10px] text-slate-500 mt-1">
                      After alert triggers, condition must be false for this long before clearing. Prevents alert flickering.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">
                      Start Delay (s)
                    </label>
                    <input
                      type="number"
                      step="1"
                      min="0"
                      value={rule.startDelaySec || ''}
                      onChange={(e) => onUpdate({ ...rule, startDelaySec: parseFloat(e.target.value) || 0 })}
                      placeholder="0"
                      className="w-full px-3 py-2 bg-slate-600 border border-slate-500 rounded text-slate-200 text-sm"
                    />
                    <p className="text-[10px] text-slate-500 mt-1">
                      Ignore this rule for X seconds after engine starts. Use for startup transients (e.g., oil pressure building).
                    </p>
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">
                      Stop Delay (s)
                    </label>
                    <input
                      type="number"
                      step="1"
                      min="0"
                      value={rule.stopDelaySec || ''}
                      onChange={(e) => onUpdate({ ...rule, stopDelaySec: parseFloat(e.target.value) || 0 })}
                      placeholder="0"
                      className="w-full px-3 py-2 bg-slate-600 border border-slate-500 rounded text-slate-200 text-sm"
                    />
                    <p className="text-[10px] text-slate-500 mt-1">
                      Ignore this rule for X seconds after engine stops. Use for shutdown transients.
                    </p>
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-slate-400 mb-1">
                    Evaluation Window (s)
                  </label>
                  <input
                    type="number"
                    step="1"
                    min="0"
                    value={rule.windowSec || ''}
                    onChange={(e) => onUpdate({ ...rule, windowSec: parseFloat(e.target.value) || 0 })}
                    placeholder="Optional - leave empty for continuous"
                    className="w-full px-3 py-2 bg-slate-600 border border-slate-500 rounded text-slate-200 text-sm"
                  />
                  <p className="text-[10px] text-slate-500 mt-1">
                    <strong>Rolling window mode:</strong> Instead of requiring the condition to be continuously true,
                    this counts total time the condition was true within this window. If total time exceeds
                    Trigger Persistence, alert fires. Example: Window=10s, Trigger=3s means if condition is
                    true for 3+ seconds (total) within any 10-second period, the alert triggers.
                  </p>
                </div>
              </div>
            )}
          </div>

          {isTipMapDeltaRule && (
            <div className="border border-slate-600 rounded-lg p-3 space-y-3">
              <div className="text-xs text-slate-400 uppercase tracking-wider">TIP/MAP Delta Config</div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">
                    Full Load MAP (psia)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={tipMapConfig.fullLoadMapPsi ?? ''}
                    onChange={(e) => onUpdate({
                      ...rule,
                      config: {
                        ...tipMapConfig,
                        fullLoadMapPsi: parseFloat(e.target.value)
                      }
                    })}
                    className="w-full px-3 py-2 bg-slate-600 border border-slate-500 rounded text-slate-200 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">
                    No Load MAP (psia)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={tipMapConfig.noLoadMapPsi ?? ''}
                    onChange={(e) => onUpdate({
                      ...rule,
                      config: {
                        ...tipMapConfig,
                        noLoadMapPsi: parseFloat(e.target.value)
                      }
                    })}
                    className="w-full px-3 py-2 bg-slate-600 border border-slate-500 rounded text-slate-200 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">
                    Load Limit (%)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="100"
                    value={tipMapConfig.loadLimitPct ?? ''}
                    onChange={(e) => onUpdate({
                      ...rule,
                      config: {
                        ...tipMapConfig,
                        loadLimitPct: parseFloat(e.target.value)
                      }
                    })}
                    className="w-full px-3 py-2 bg-slate-600 border border-slate-500 rounded text-slate-200 text-sm"
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">
                    Ideal Delta (psi)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={tipMapConfig.deltaIdealPsi ?? ''}
                    onChange={(e) => onUpdate({
                      ...rule,
                      config: {
                        ...tipMapConfig,
                        deltaIdealPsi: parseFloat(e.target.value)
                      }
                    })}
                    className="w-full px-3 py-2 bg-slate-600 border border-slate-500 rounded text-slate-200 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">
                    High Delta (psi)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={tipMapConfig.deltaHighPsi ?? ''}
                    onChange={(e) => onUpdate({
                      ...rule,
                      config: {
                        ...tipMapConfig,
                        deltaHighPsi: parseFloat(e.target.value)
                      }
                    })}
                    className="w-full px-3 py-2 bg-slate-600 border border-slate-500 rounded text-slate-200 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">
                    Low Delta (psi)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={tipMapConfig.deltaLowPsi ?? ''}
                    onChange={(e) => onUpdate({
                      ...rule,
                      config: {
                        ...tipMapConfig,
                        deltaLowPsi: parseFloat(e.target.value)
                      }
                    })}
                    className="w-full px-3 py-2 bg-slate-600 border border-slate-500 rounded text-slate-200 text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">
                    Load Gate Param
                  </label>
                  <select
                    value={loadGateConfig.param || 'MAP'}
                    onChange={(e) => onUpdate({
                      ...rule,
                      config: {
                        ...tipMapConfig,
                        loadGate: {
                          ...loadGateConfig,
                          param: e.target.value
                        }
                      }
                    })}
                    className="w-full px-3 py-2 bg-slate-600 border border-slate-500 rounded text-slate-200 text-sm"
                  >
                    {SIGNAL_PARAMETER_OPTIONS.map(option => (
                      <option key={option.key} value={option.key}>
                        {option.label}{option.unit ? ` (${option.unit})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">
                    Operator
                  </label>
                  <select
                    value={loadGateConfig.operator || '>='}
                    onChange={(e) => onUpdate({
                      ...rule,
                      config: {
                        ...tipMapConfig,
                        loadGate: {
                          ...loadGateConfig,
                          operator: e.target.value
                        }
                      }
                    })}
                    className="w-full px-3 py-2 bg-slate-600 border border-slate-500 rounded text-slate-200 text-sm"
                  >
                    {CONDITION_OPERATORS.map(op => (
                      <option key={op} value={op}>{op}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">
                    Load Threshold
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={loadGateConfig.value ?? ''}
                    onChange={(e) => onUpdate({
                      ...rule,
                      config: {
                        ...tipMapConfig,
                        loadGate: {
                          ...loadGateConfig,
                          value: e.target.value === '' ? null : parseFloat(e.target.value)
                        }
                      }
                    })}
                    className="w-full px-3 py-2 bg-slate-600 border border-slate-500 rounded text-slate-200 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">
                    Debounce (s)
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    value={loadGateConfig.debounceSec ?? ''}
                    onChange={(e) => onUpdate({
                      ...rule,
                      config: {
                        ...tipMapConfig,
                        loadGate: {
                          ...loadGateConfig,
                          debounceSec: parseFloat(e.target.value) || 0
                        }
                      }
                    })}
                    className="w-full px-3 py-2 bg-slate-600 border border-slate-500 rounded text-slate-200 text-sm"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Require When (Engine State Conditions) */}
          <EngineStateConditionEditor
            title="Require When"
            subtitle="Rule only evaluates when ALL these are true"
            conditions={rule.requireWhen || []}
            onChange={(updated) => onUpdate({ ...rule, requireWhen: updated })}
          />

          {/* Ignore When (Engine State Conditions) */}
          <EngineStateConditionEditor
            title="Ignore When"
            subtitle="Rule skips when ANY of these is true"
            conditions={rule.ignoreWhen || []}
            onChange={(updated) => onUpdate({ ...rule, ignoreWhen: updated })}
          />

          {/* Main Conditions */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs text-slate-400">Signal Conditions</label>
              <button
                onClick={() => onUpdate({
                  ...rule,
                  conditions: [...(rule.conditions || []), { param: '', operator: '>', value: 0 }]
                })}
                className="text-xs text-blue-400 hover:text-blue-300"
              >
                + Add Condition
              </button>
            </div>
            <div className="space-y-2">
              {(rule.conditions || []).map((condition, condIdx) => (
                <div key={condIdx} className="flex items-center gap-2">
                  {(() => {
                    const paramMeta = ALL_CONDITION_LOOKUP.get(condition.param);
                    const isCustom = !paramMeta;
                    const selectValue = isCustom ? '__custom__' : (paramMeta?.canonicalKey || condition.param);
                    const isPredicate = isEnginePredicate(condition.param);

                    return (
                      <div className="flex-1 flex items-center gap-2">
                        <select
                          value={selectValue}
                          onChange={(e) => {
                            const newConditions = [...rule.conditions];
                            const nextParam = e.target.value === '__custom__' ? '' : e.target.value;
                            const nextIsPredicate = isEnginePredicate(nextParam);
                            newConditions[condIdx] = {
                              ...condition,
                              param: nextParam,
                              // For predicates, default to == 1 (true)
                              operator: nextIsPredicate ? '==' : condition.operator,
                              value: nextIsPredicate ? 1 : condition.value
                            };
                            onUpdate({ ...rule, conditions: newConditions });
                          }}
                          className="flex-1 px-2 py-1 bg-slate-600 border border-slate-500 rounded text-slate-200 text-sm"
                          title={paramMeta?.description || 'Select a parameter'}
                        >
                          <option value="__custom__">Custom parameter...</option>
                          <optgroup label="Engine State">
                            {ENGINE_STATE_OPTIONS.map(option => (
                              <option key={option.key} value={option.key}>
                                {option.label}
                              </option>
                            ))}
                          </optgroup>
                          <optgroup label="Signals">
                            {SIGNAL_PARAMETER_OPTIONS.map(option => (
                              <option key={option.key} value={option.key}>
                                {option.label}{option.unit ? ` (${option.unit})` : ''}
                              </option>
                            ))}
                          </optgroup>
                        </select>
                        {isCustom && (
                          <input
                            type="text"
                            value={condition.param}
                            onChange={(e) => {
                              const newConditions = [...rule.conditions];
                              newConditions[condIdx] = { ...condition, param: e.target.value };
                              onUpdate({ ...rule, conditions: newConditions });
                            }}
                            placeholder="Parameter"
                            className="flex-1 px-2 py-1 bg-slate-600 border border-slate-500 rounded text-slate-200 text-sm"
                          />
                        )}
                      </div>
                    );
                  })()}
                  <select
                    value={condition.operator}
                    onChange={(e) => {
                      const newConditions = [...rule.conditions];
                      newConditions[condIdx] = { ...condition, operator: e.target.value };
                      onUpdate({ ...rule, conditions: newConditions });
                    }}
                    className="px-2 py-1 bg-slate-600 border border-slate-500 rounded text-slate-200 text-sm"
                  >
                    <option value=">">&gt;</option>
                    <option value="<">&lt;</option>
                    <option value=">=">&gt;=</option>
                    <option value="<=">&lt;=</option>
                    <option value="==">==</option>
                    <option value="!=">!=</option>
                  </select>
                  {isEnginePredicate(condition.param) ? (
                    <select
                      value={condition.value}
                      onChange={(e) => {
                        const newConditions = [...rule.conditions];
                        newConditions[condIdx] = { ...condition, value: parseInt(e.target.value) };
                        onUpdate({ ...rule, conditions: newConditions });
                      }}
                      className="w-28 px-2 py-1 bg-slate-600 border border-slate-500 rounded text-slate-200 text-sm"
                    >
                      <option value={1}>True</option>
                      <option value={0}>False</option>
                    </select>
                  ) : (
                    <div className="relative w-28">
                      <input
                        type="number"
                        value={condition.value}
                        onChange={(e) => {
                          const newConditions = [...rule.conditions];
                          newConditions[condIdx] = { ...condition, value: parseFloat(e.target.value) || 0 };
                          onUpdate({ ...rule, conditions: newConditions });
                        }}
                        className="w-full px-2 py-1 bg-slate-600 border border-slate-500 rounded text-slate-200 text-sm pr-8"
                      />
                      {ALL_CONDITION_LOOKUP.get(condition.param)?.unit && (
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-slate-400">
                          {ALL_CONDITION_LOOKUP.get(condition.param)?.unit}
                        </span>
                      )}
                    </div>
                  )}
                  <button
                    onClick={() => {
                      const newConditions = rule.conditions.filter((_, i) => i !== condIdx);
                      onUpdate({ ...rule, conditions: newConditions });
                    }}
                    className="p-1 hover:bg-red-500/20 rounded"
                  >
                    <Trash2 className="w-4 h-4 text-slate-400 hover:text-red-400" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Engine State Condition Editor Component
 * For Require When / Ignore When blocks
 */
function EngineStateConditionEditor({ title, subtitle, conditions, onChange }) {
  const [isExpanded, setIsExpanded] = useState(conditions.length > 0);

  return (
    <div className="border border-slate-600 rounded-lg">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-3 py-2 text-sm text-slate-300 hover:bg-slate-600/50"
      >
        <span className="flex items-center gap-2">
          {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          {title}
        </span>
        {conditions.length > 0 && (
          <span className="text-xs text-blue-400">{conditions.length} condition(s)</span>
        )}
      </button>

      {isExpanded && (
        <div className="px-3 pb-3 pt-2 border-t border-slate-600">
          <p className="text-[10px] text-slate-500 mb-2">{subtitle}</p>

          <div className="space-y-2">
            {conditions.map((condition, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <select
                  value={condition.param || ''}
                  onChange={(e) => {
                    const updated = [...conditions];
                    updated[idx] = { ...condition, param: e.target.value, operator: '==', value: 1 };
                    onChange(updated);
                  }}
                  className="flex-1 px-2 py-1 bg-slate-600 border border-slate-500 rounded text-slate-200 text-sm"
                >
                  <option value="">Select engine state...</option>
                  {ENGINE_STATE_OPTIONS.map(opt => (
                    <option key={opt.key} value={opt.key}>{opt.label}</option>
                  ))}
                </select>
                <select
                  value={condition.value}
                  onChange={(e) => {
                    const updated = [...conditions];
                    updated[idx] = { ...condition, value: parseInt(e.target.value) };
                    onChange(updated);
                  }}
                  className="w-24 px-2 py-1 bg-slate-600 border border-slate-500 rounded text-slate-200 text-sm"
                >
                  <option value={1}>is True</option>
                  <option value={0}>is False</option>
                </select>
                <button
                  onClick={() => onChange(conditions.filter((_, i) => i !== idx))}
                  className="p-1 hover:bg-red-500/20 rounded"
                >
                  <Trash2 className="w-4 h-4 text-slate-400 hover:text-red-400" />
                </button>
              </div>
            ))}
          </div>

          <button
            onClick={() => onChange([...conditions, { param: 'EngineStable', operator: '==', value: 1 }])}
            className="text-xs text-blue-400 hover:text-blue-300 mt-2"
          >
            + Add Condition
          </button>
        </div>
      )}
    </div>
  );
}

function ConditionListEditor({ title, conditions, onChange }) {
  const activeConditions = conditions || [];

  return (
    <div className="mt-4">
      <div className="flex items-center justify-between mb-2">
        <label className="text-xs text-slate-400">{title}</label>
        <button
          onClick={() => onChange([...(activeConditions || []), { param: '', operator: '>', value: 0 }])}
          className="text-xs text-blue-400 hover:text-blue-300"
        >
          + Add Condition
        </button>
      </div>
      <div className="space-y-2">
        {(activeConditions || []).map((condition, condIdx) => {
          const paramMeta = PARAMETER_LOOKUP.get(condition.param);
          const isCustom = !paramMeta;
          const selectValue = isCustom ? '__custom__' : (paramMeta?.canonicalKey || condition.param);

          return (
            <div key={condIdx} className="flex items-center gap-2">
              <div className="flex-1 flex items-center gap-2">
                <select
                  value={selectValue}
                  onChange={(e) => {
                    const nextParam = e.target.value === '__custom__' ? '' : e.target.value;
                    const updated = [...activeConditions];
                    updated[condIdx] = { ...condition, param: nextParam };
                    onChange(updated);
                  }}
                  className="flex-1 px-2 py-1 bg-slate-600 border border-slate-500 rounded text-slate-200 text-sm"
                  title={paramMeta?.description || 'Select a parameter'}
                >
                  <option value="__custom__">Custom parameter...</option>
                  {PARAMETER_OPTIONS.map(option => (
                    <option key={option.key} value={option.key}>
                      {option.label}{option.unit ? ` (${option.unit})` : ''}
                    </option>
                  ))}
                </select>
                {isCustom && (
                  <input
                    type="text"
                    value={condition.param}
                    onChange={(e) => {
                      const updated = [...activeConditions];
                      updated[condIdx] = { ...condition, param: e.target.value };
                      onChange(updated);
                    }}
                    placeholder="Parameter"
                    className="flex-1 px-2 py-1 bg-slate-600 border border-slate-500 rounded text-slate-200 text-sm"
                  />
                )}
              </div>
              <select
                value={condition.operator}
                onChange={(e) => {
                  const updated = [...activeConditions];
                  updated[condIdx] = { ...condition, operator: e.target.value };
                  onChange(updated);
                }}
                className="px-2 py-1 bg-slate-600 border border-slate-500 rounded text-slate-200 text-sm"
              >
                {CONDITION_OPERATORS.map(op => (
                  <option key={op} value={op}>{op}</option>
                ))}
              </select>
              <div className="relative w-28">
                <input
                  type="number"
                  value={condition.value}
                  onChange={(e) => {
                    const updated = [...activeConditions];
                    updated[condIdx] = { ...condition, value: parseFloat(e.target.value) || 0 };
                    onChange(updated);
                  }}
                  className="w-full px-2 py-1 bg-slate-600 border border-slate-500 rounded text-slate-200 text-sm pr-8"
                />
                {paramMeta?.unit && (
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-slate-400">
                    {paramMeta.unit}
                  </span>
                )}
              </div>
              <button
                onClick={() => {
                  const updated = activeConditions.filter((_, i) => i !== condIdx);
                  onChange(updated);
                }}
                className="p-1 hover:bg-red-500/20 rounded"
              >
                <Trash2 className="w-4 h-4 text-slate-400 hover:text-red-400" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
