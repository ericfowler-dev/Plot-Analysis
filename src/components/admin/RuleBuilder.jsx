/**
 * RuleBuilder - Config 3.1
 * Visual anomaly rule builder with condition editing
 *
 * v3.1 Changes:
 * - Fixed parameter duplicates (RPM, rpm, Rpm now show as single "Engine Speed" option)
 * - Added delta condition support for comparing two parameters
 */

import React, { useState, useCallback } from 'react';
import { ENGINE_STATE_PREDICATE_OPTIONS } from '../../lib/anomalyEngine';
import { PARAMETER_CATALOG } from '../../lib/parameterCatalog';

// Available severity levels
const SEVERITY_OPTIONS = [
  { value: 'critical', label: 'Critical', color: '#ef4444' },
  { value: 'warning', label: 'Warning', color: '#f59e0b' },
  { value: 'info', label: 'Info', color: '#3b82f6' }
];

// Available categories
const CATEGORY_OPTIONS = [
  { value: 'voltage', label: 'Voltage' },
  { value: 'thermal', label: 'Thermal' },
  { value: 'pressure', label: 'Pressure' },
  { value: 'fuel', label: 'Fuel' },
  { value: 'knock', label: 'Knock' },
  { value: 'fault', label: 'Fault' },
  { value: 'custom', label: 'Custom' }
];

// Available operators
const OPERATOR_OPTIONS = [
  { value: '<', label: '< (less than)' },
  { value: '<=', label: '<= (less or equal)' },
  { value: '>', label: '> (greater than)' },
  { value: '>=', label: '>= (greater or equal)' },
  { value: '==', label: '== (equals)' },
  { value: '!=', label: '!= (not equals)' }
];

// v3.1: Condition types for simple vs delta comparisons
const CONDITION_TYPES = [
  { value: 'simple', label: 'Simple (param vs value)', description: 'Compare a parameter to a fixed value' },
  { value: 'delta', label: 'Delta (param1 - param2)', description: 'Compare the difference between two parameters' }
];

// Get all available parameters for condition dropdowns
// v3.1: Use parameter IDs instead of dataColumns to avoid duplicates (RPM, rpm, Rpm)
const getAvailableParams = () => {
  const params = [];

  // Add engine state predicates
  for (const pred of ENGINE_STATE_PREDICATE_OPTIONS) {
    params.push({
      value: pred.key,
      label: pred.label,
      group: 'Engine State',
      description: pred.description
    });
  }

  // Add parameters from catalog - use canonical ID, not dataColumns
  for (const param of Object.values(PARAMETER_CATALOG)) {
    // Use the first dataColumn as the value (primary column name for data matching)
    const primaryColumn = param.dataColumns[0] || param.id;
    params.push({
      value: primaryColumn,
      label: param.name,
      group: param.category,
      description: param.description,
      unit: param.unit
    });
  }

  return params;
};

const AVAILABLE_PARAMS = getAvailableParams();

/**
 * Parameter select dropdown - reusable component
 */
function ParameterSelect({ value, onChange, includeEngineState = true, className = '' }) {
  return (
    <select
      value={value || ''}
      onChange={(e) => onChange(e.target.value)}
      className={`px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 ${className}`}
    >
      <option value="">Select parameter...</option>
      {includeEngineState && (
        <optgroup label="Engine State">
          {ENGINE_STATE_PREDICATE_OPTIONS.map(p => (
            <option key={p.key} value={p.key}>{p.label}</option>
          ))}
        </optgroup>
      )}
      {Object.entries(
        AVAILABLE_PARAMS.filter(p => p.group !== 'Engine State')
          .reduce((acc, p) => {
            if (!acc[p.group]) acc[p.group] = [];
            acc[p.group].push(p);
            return acc;
          }, {})
      ).map(([group, params]) => (
        <optgroup key={group} label={group}>
          {params.map(p => (
            <option key={p.value} value={p.value}>{p.label}</option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

/**
 * Condition block component
 * v3.1: Supports both simple and delta condition types
 */
function ConditionBlock({ condition, onChange, onRemove }) {
  const handleChange = (field, value) => {
    onChange({ ...condition, [field]: value });
  };

  const conditionType = condition.type || 'simple';
  const isEnginePredicate = ENGINE_STATE_PREDICATE_OPTIONS.some(p => p.key === condition.param);
  const isDelta = conditionType === 'delta';

  return (
    <div className="p-3 bg-gray-50 rounded-lg border border-gray-200 space-y-2">
      {/* Condition type toggle */}
      <div className="flex items-center gap-2 pb-2 border-b border-gray-200">
        <span className="text-xs text-gray-500">Type:</span>
        <div className="flex bg-gray-100 rounded p-0.5">
          {CONDITION_TYPES.map(ct => (
            <button
              key={ct.value}
              onClick={() => handleChange('type', ct.value)}
              className={`px-2 py-1 text-xs rounded transition-colors ${
                conditionType === ct.value
                  ? 'bg-white text-blue-600 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
              title={ct.description}
            >
              {ct.label}
            </button>
          ))}
        </div>
        <div className="flex-1" />
        {/* Remove button */}
        <button
          onClick={onRemove}
          className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg"
          title="Remove condition"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Condition inputs */}
      <div className="flex items-center gap-2 flex-wrap">
        {isDelta ? (
          /* Delta condition: param1 - param2 > value */
          <>
            <ParameterSelect
              value={condition.param1 || condition.param}
              onChange={(v) => handleChange('param1', v)}
              includeEngineState={false}
              className="flex-1 min-w-[140px]"
            />
            <span className="text-gray-500 font-medium px-1">−</span>
            <ParameterSelect
              value={condition.param2}
              onChange={(v) => handleChange('param2', v)}
              includeEngineState={false}
              className="flex-1 min-w-[140px]"
            />
            <select
              value={condition.operator || '>'}
              onChange={(e) => handleChange('operator', e.target.value)}
              className="w-28 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
            >
              {OPERATOR_OPTIONS.map(op => (
                <option key={op.value} value={op.value}>{op.label}</option>
              ))}
            </select>
            <input
              type="number"
              value={condition.value ?? 0}
              onChange={(e) => handleChange('value', parseFloat(e.target.value) || 0)}
              className="w-20 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
              placeholder="Δ"
            />
          </>
        ) : (
          /* Simple condition: param > value */
          <>
            <ParameterSelect
              value={condition.param}
              onChange={(v) => handleChange('param', v)}
              includeEngineState={true}
              className="flex-1 min-w-[200px]"
            />
            <select
              value={condition.operator || '>='}
              onChange={(e) => handleChange('operator', e.target.value)}
              className="w-32 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
            >
              {isEnginePredicate ? (
                <>
                  <option value="==">is</option>
                  <option value="!=">is not</option>
                </>
              ) : (
                OPERATOR_OPTIONS.map(op => (
                  <option key={op.value} value={op.value}>{op.label}</option>
                ))
              )}
            </select>
            {isEnginePredicate ? (
              <select
                value={condition.value ?? 1}
                onChange={(e) => handleChange('value', parseInt(e.target.value))}
                className="w-24 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
              >
                <option value={1}>true</option>
                <option value={0}>false</option>
              </select>
            ) : (
              <input
                type="number"
                value={condition.value ?? 0}
                onChange={(e) => handleChange('value', parseFloat(e.target.value) || 0)}
                className="w-24 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
              />
            )}
          </>
        )}
      </div>

      {/* Helper text for delta conditions */}
      {isDelta && (
        <p className="text-xs text-gray-500 italic">
          Example: If MAP − TIP &gt; 5, triggers when MAP is more than 5 units above TIP
        </p>
      )}
    </div>
  );
}

/**
 * Logic connector (AND/OR)
 */
function LogicConnector({ value, onChange }) {
  return (
    <div className="flex items-center justify-center py-2">
      <div className="flex bg-gray-100 rounded-lg p-1">
        <button
          onClick={() => onChange('AND')}
          className={`px-4 py-1 text-sm font-medium rounded-md transition-colors ${
            value === 'AND'
              ? 'bg-white text-blue-600 shadow'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          AND
        </button>
        <button
          onClick={() => onChange('OR')}
          className={`px-4 py-1 text-sm font-medium rounded-md transition-colors ${
            value === 'OR'
              ? 'bg-white text-blue-600 shadow'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          OR
        </button>
      </div>
    </div>
  );
}

/**
 * Timing configuration panel
 */
function TimingPanel({ timing, onChange }) {
  const handleChange = (field, value) => {
    onChange({ ...timing, [field]: value });
  };

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-4">
      <h4 className="font-medium text-blue-900">Timing Configuration</h4>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs text-blue-700 mb-1">
            Trigger Persistence (seconds)
          </label>
          <input
            type="number"
            value={timing?.triggerPersistenceSec ?? 0}
            onChange={(e) => handleChange('triggerPersistenceSec', parseFloat(e.target.value) || 0)}
            min={0}
            step={0.5}
            className="w-full px-3 py-2 border border-blue-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
          />
          <p className="text-xs text-blue-600 mt-1">Condition must be true for this long before triggering</p>
        </div>

        <div>
          <label className="block text-xs text-blue-700 mb-1">
            Clear Persistence (seconds)
          </label>
          <input
            type="number"
            value={timing?.clearPersistenceSec ?? 0}
            onChange={(e) => handleChange('clearPersistenceSec', parseFloat(e.target.value) || 0)}
            min={0}
            step={0.5}
            className="w-full px-3 py-2 border border-blue-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
          />
          <p className="text-xs text-blue-600 mt-1">Condition must be false for this long before clearing</p>
        </div>

        <div>
          <label className="block text-xs text-blue-700 mb-1">
            Start Delay (seconds)
          </label>
          <input
            type="number"
            value={timing?.startDelaySec ?? 0}
            onChange={(e) => handleChange('startDelaySec', parseFloat(e.target.value) || 0)}
            min={0}
            step={1}
            className="w-full px-3 py-2 border border-blue-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
          />
          <p className="text-xs text-blue-600 mt-1">Skip evaluation for this long after engine start</p>
        </div>

        <div>
          <label className="block text-xs text-blue-700 mb-1">
            Stop Delay (seconds)
          </label>
          <input
            type="number"
            value={timing?.stopDelaySec ?? 0}
            onChange={(e) => handleChange('stopDelaySec', parseFloat(e.target.value) || 0)}
            min={0}
            step={1}
            className="w-full px-3 py-2 border border-blue-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
          />
          <p className="text-xs text-blue-600 mt-1">Skip evaluation for this long after engine stop</p>
        </div>
      </div>
    </div>
  );
}

/**
 * Single rule editor
 */
function RuleEditor({ rule, onChange, onDelete, isNew = false }) {
  const [expanded, setExpanded] = useState(isNew);
  const [showTiming, setShowTiming] = useState(
    rule.triggerPersistenceSec > 0 || rule.clearPersistenceSec > 0 ||
    rule.startDelaySec > 0 || rule.stopDelaySec > 0
  );

  const handleChange = (field, value) => {
    onChange({ ...rule, [field]: value });
  };

  const addCondition = (type) => {
    const conditions = rule[type] || [];
    handleChange(type, [...conditions, { param: '', operator: '>=', value: 0 }]);
  };

  const updateCondition = (type, index, condition) => {
    const conditions = [...(rule[type] || [])];
    conditions[index] = condition;
    handleChange(type, conditions);
  };

  const removeCondition = (type, index) => {
    const conditions = (rule[type] || []).filter((_, i) => i !== index);
    handleChange(type, conditions);
  };

  const severityColor = SEVERITY_OPTIONS.find(s => s.value === rule.severity)?.color || '#6b7280';

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
      {/* Header */}
      <div
        className="px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-gray-50"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3">
          {/* Enable toggle */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleChange('enabled', !rule.enabled);
            }}
            className={`
              relative w-10 h-6 rounded-full transition-colors
              ${rule.enabled ? 'bg-blue-600' : 'bg-gray-300'}
            `}
          >
            <span
              className={`
                absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow transition-transform
                ${rule.enabled ? 'translate-x-4' : 'translate-x-0'}
              `}
            />
          </button>

          {/* Severity badge */}
          <span
            className="px-2 py-1 text-xs font-medium rounded text-white"
            style={{ backgroundColor: severityColor }}
          >
            {rule.severity?.toUpperCase() || 'WARNING'}
          </span>

          {/* Rule name */}
          <span className="font-medium text-gray-900">{rule.name || 'Unnamed Rule'}</span>
        </div>

        <div className="flex items-center gap-2">
          {/* Condition count badge */}
          <span className="text-xs text-gray-500">
            {(rule.conditions || []).length} condition{(rule.conditions || []).length !== 1 ? 's' : ''}
          </span>

          {/* Expand/collapse icon */}
          <svg
            className={`w-5 h-5 text-gray-400 transform transition-transform ${expanded ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>

      {/* Expanded content */}
      {expanded && (
        <div className="border-t border-gray-200 p-4 space-y-4">
          {/* Basic info */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Rule Name</label>
              <input
                type="text"
                value={rule.name || ''}
                onChange={(e) => handleChange('name', e.target.value)}
                placeholder="e.g., High Load Temperature Warning"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Rule ID</label>
              <input
                type="text"
                value={rule.id || ''}
                onChange={(e) => handleChange('id', e.target.value.replace(/[^a-z0-9-]/gi, '-').toLowerCase())}
                placeholder="e.g., high-load-temp"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              value={rule.description || ''}
              onChange={(e) => handleChange('description', e.target.value)}
              placeholder="Describe what this rule detects..."
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Severity</label>
              <select
                value={rule.severity || 'warning'}
                onChange={(e) => handleChange('severity', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                {SEVERITY_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
              <select
                value={rule.category || 'custom'}
                onChange={(e) => handleChange('category', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                {CATEGORY_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Main conditions */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-gray-700">Trigger Conditions</label>
              <LogicConnector
                value={rule.logic || 'AND'}
                onChange={(v) => handleChange('logic', v)}
              />
            </div>

            <div className="space-y-2">
              {(rule.conditions || []).map((condition, index) => (
                <ConditionBlock
                  key={index}
                  condition={condition}
                  onChange={(c) => updateCondition('conditions', index, c)}
                  onRemove={() => removeCondition('conditions', index)}
                />
              ))}
            </div>

            <button
              onClick={() => addCondition('conditions')}
              className="mt-2 flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add condition
            </button>
          </div>

          {/* Require When */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Require When (only evaluate rule when ALL are true)
            </label>
            <div className="space-y-2">
              {(rule.requireWhen || []).map((condition, index) => (
                <ConditionBlock
                  key={index}
                  condition={condition}
                  onChange={(c) => updateCondition('requireWhen', index, c)}
                  onRemove={() => removeCondition('requireWhen', index)}
                />
              ))}
            </div>
            <button
              onClick={() => addCondition('requireWhen')}
              className="mt-2 flex items-center gap-2 text-sm text-green-600 hover:text-green-700"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add requirement
            </button>
          </div>

          {/* Ignore When */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Ignore When (skip rule evaluation when ANY is true)
            </label>
            <div className="space-y-2">
              {(rule.ignoreWhen || []).map((condition, index) => (
                <ConditionBlock
                  key={index}
                  condition={condition}
                  onChange={(c) => updateCondition('ignoreWhen', index, c)}
                  onRemove={() => removeCondition('ignoreWhen', index)}
                />
              ))}
            </div>
            <button
              onClick={() => addCondition('ignoreWhen')}
              className="mt-2 flex items-center gap-2 text-sm text-amber-600 hover:text-amber-700"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add ignore condition
            </button>
          </div>

          {/* Timing toggle */}
          <div>
            <button
              onClick={() => setShowTiming(!showTiming)}
              className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700"
            >
              <svg
                className={`w-4 h-4 transform transition-transform ${showTiming ? 'rotate-90' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              {showTiming ? 'Hide' : 'Show'} timing configuration
            </button>

            {showTiming && (
              <div className="mt-2">
                <TimingPanel
                  timing={{
                    triggerPersistenceSec: rule.triggerPersistenceSec,
                    clearPersistenceSec: rule.clearPersistenceSec,
                    startDelaySec: rule.startDelaySec,
                    stopDelaySec: rule.stopDelaySec
                  }}
                  onChange={(timing) => {
                    onChange({
                      ...rule,
                      ...timing
                    });
                  }}
                />
              </div>
            )}
          </div>

          {/* Delete button */}
          <div className="pt-4 border-t border-gray-200">
            <button
              onClick={onDelete}
              className="flex items-center gap-2 text-sm text-red-600 hover:text-red-700"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              Delete Rule
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Main RuleBuilder component
 */
export default function RuleBuilder({ rules, onChange }) {
  const [newRuleKey, setNewRuleKey] = useState(0);

  const handleAddRule = useCallback(() => {
    const newRule = {
      id: `custom-rule-${Date.now()}`,
      name: 'New Rule',
      description: '',
      enabled: true,
      conditions: [],
      logic: 'AND',
      severity: 'warning',
      category: 'custom',
      requireWhen: [],
      ignoreWhen: []
    };
    onChange([...rules, newRule]);
    setNewRuleKey(prev => prev + 1);
  }, [rules, onChange]);

  const handleUpdateRule = useCallback((index, updatedRule) => {
    const updated = [...rules];
    updated[index] = updatedRule;
    onChange(updated);
  }, [rules, onChange]);

  const handleDeleteRule = useCallback((index) => {
    const updated = rules.filter((_, i) => i !== index);
    onChange(updated);
  }, [rules, onChange]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Anomaly Rules</h3>
          <p className="text-sm text-gray-500">
            Define custom rules to detect specific conditions in your data
          </p>
        </div>
        <button
          onClick={handleAddRule}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Rule
        </button>
      </div>

      {/* Rules list */}
      {rules.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-xl border-2 border-dashed border-gray-300">
          <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          <h3 className="mt-2 text-sm font-medium text-gray-900">No rules defined</h3>
          <p className="mt-1 text-sm text-gray-500">
            Create custom rules to detect specific conditions
          </p>
          <div className="mt-6">
            <button
              onClick={handleAddRule}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add your first rule
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {rules.map((rule, index) => (
            <RuleEditor
              key={rule.id || index}
              rule={rule}
              onChange={(r) => handleUpdateRule(index, r)}
              onDelete={() => handleDeleteRule(index)}
              isNew={index === rules.length - 1 && newRuleKey > 0}
            />
          ))}
        </div>
      )}
    </div>
  );
}
