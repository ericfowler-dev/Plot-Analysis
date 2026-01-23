/**
 * ThresholdCard - Config 3.0
 * Individual parameter configuration card with visual threshold editing
 */

import React, { useState, useCallback, useMemo } from 'react';
import { THRESHOLD_TYPES, supportsHysteresis, supportsConditions } from '../../lib/parameterCatalog';
import {
  ENGINE_STATE_OPTIONS,
  SIGNAL_PARAMETER_OPTIONS,
  CONDITION_OPERATORS,
  ALL_CONDITION_LOOKUP,
  isEnginePredicate
} from '../../lib/conditionParameters';

/**
 * Range slider component with visual zones
 */
function ThresholdSlider({
  value,
  onChange,
  min,
  max,
  step,
  warningValue,
  criticalValue,
  type, // 'min' or 'max'
  label,
  unit,
  disabled = false
}) {
  const percentage = ((value - min) / (max - min)) * 100;

  // Calculate zone positions
  const zones = useMemo(() => {
    if (type === 'min') {
      // For minimum thresholds (e.g., oil pressure)
      // Critical zone: 0 to critical
      // Warning zone: critical to warning
      // Normal zone: warning to max
      const criticalPct = ((criticalValue - min) / (max - min)) * 100;
      const warningPct = ((warningValue - min) / (max - min)) * 100;
      return {
        critical: { start: 0, width: criticalPct },
        warning: { start: criticalPct, width: warningPct - criticalPct },
        normal: { start: warningPct, width: 100 - warningPct }
      };
    } else {
      // For maximum thresholds (e.g., temperature)
      // Normal zone: 0 to warning
      // Warning zone: warning to critical
      // Critical zone: critical to max
      const warningPct = ((warningValue - min) / (max - min)) * 100;
      const criticalPct = ((criticalValue - min) / (max - min)) * 100;
      return {
        normal: { start: 0, width: warningPct },
        warning: { start: warningPct, width: criticalPct - warningPct },
        critical: { start: criticalPct, width: 100 - criticalPct }
      };
    }
  }, [type, min, max, warningValue, criticalValue]);

  return (
    <div className="space-y-2">
      <div className="flex justify-between items-center">
        <label className="text-sm font-medium text-gray-700">{label}</label>
        <div className="flex items-center gap-2">
          <input
            type="number"
            value={value}
            onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
            min={min}
            max={max}
            step={step}
            disabled={disabled}
            className="w-20 px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
          />
          <span className="text-sm text-gray-500">{unit}</span>
        </div>
      </div>

      {/* Visual slider with zones */}
      <div className="relative h-6 bg-gray-200 rounded-lg overflow-hidden">
        {/* Zone backgrounds */}
        <div
          className="absolute h-full bg-red-200"
          style={{ left: `${zones.critical.start}%`, width: `${zones.critical.width}%` }}
        />
        <div
          className="absolute h-full bg-yellow-200"
          style={{ left: `${zones.warning.start}%`, width: `${zones.warning.width}%` }}
        />
        <div
          className="absolute h-full bg-green-200"
          style={{ left: `${zones.normal.start}%`, width: `${zones.normal.width}%` }}
        />

        {/* Slider input */}
        <input
          type="range"
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          min={min}
          max={max}
          step={step}
          disabled={disabled}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
        />

        {/* Slider thumb indicator */}
        <div
          className="absolute top-0 bottom-0 w-1 bg-blue-600 pointer-events-none"
          style={{ left: `${percentage}%`, transform: 'translateX(-50%)' }}
        >
          <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-3 h-3 bg-blue-600 rounded-full border-2 border-white shadow" />
        </div>
      </div>

      {/* Scale labels */}
      <div className="flex justify-between text-xs text-gray-400">
        <span>{min}{unit}</span>
        <span>{max}{unit}</span>
      </div>
    </div>
  );
}

/**
 * Condition editor for ignoreWhen/requireWhen
 */
function ConditionEditor({ conditions, onChange, label }) {
  const [expanded, setExpanded] = useState(false);

  const addCondition = () => {
    onChange([...conditions, { param: '', operator: '>=', value: 0 }]);
  };

  const updateCondition = (index, field, value) => {
    const updated = [...conditions];
    updated[index] = { ...updated[index], [field]: value };
    onChange(updated);
  };

  const removeCondition = (index) => {
    onChange(conditions.filter((_, i) => i !== index));
  };

  return (
    <div className="border border-gray-200 rounded-lg p-3">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center justify-between w-full text-left"
      >
        <span className="text-sm font-medium text-gray-700">{label}</span>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">
            {conditions.length} condition{conditions.length !== 1 ? 's' : ''}
          </span>
          <svg
            className={`w-4 h-4 text-gray-400 transform transition-transform ${expanded ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {expanded && (
        <div className="mt-3 space-y-2">
          {conditions.map((condition, index) => {
            const isPredicate = isEnginePredicate(condition.param);
            const paramMeta = ALL_CONDITION_LOOKUP.get(condition.param);
            return (
              <div key={index} className="flex flex-wrap gap-2">
                  <select
                    value={condition.param}
                    onChange={(e) => updateCondition(index, 'param', e.target.value)}
                    className="flex-1 min-w-[160px] px-2 py-1 text-sm border border-gray-300 rounded bg-white"
                  >
                    <option value="">Select parameter</option>
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
                <select
                  value={condition.operator}
                  onChange={(e) => updateCondition(index, 'operator', e.target.value)}
                  className="px-2 py-1 text-sm border border-gray-300 rounded bg-white"
                >
                  {CONDITION_OPERATORS.map(op => (
                    <option key={op} value={op}>{op}</option>
                  ))}
                </select>
                <div className="relative w-24">
                  <input
                    type="number"
                    value={condition.value}
                    onChange={(e) => updateCondition(index, 'value', parseFloat(e.target.value) || 0)}
                    className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                  />
                  {!isPredicate && paramMeta?.unit && (
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-gray-400">
                      {paramMeta.unit}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => removeCondition(index)}
                  className="p-1 text-red-500 hover:bg-red-50 rounded"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            );
          })}
          <button
            onClick={addCondition}
            className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add condition
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Main ThresholdCard component
 */
export default function ThresholdCard({
  parameter,
  config,
  onChange,
  onReset,
  validation = {}
}) {
  const [showAdvanced, setShowAdvanced] = useState(false);

  const handleChange = useCallback((field, value) => {
    onChange({
      ...config,
      [field]: value
    });
  }, [config, onChange]);

  const handleNestedChange = useCallback((parent, field, value) => {
    onChange({
      ...config,
      [parent]: {
        ...config[parent],
        [field]: value
      }
    });
  }, [config, onChange]);

  const isEnabled = config?.enabled !== false;
  const hasErrors = validation.errors && validation.errors.length > 0;

  // Determine threshold type and render appropriate controls
  const renderThresholdControls = () => {
    const { thresholdType, validation: paramValidation, unit, defaults } = parameter;
    const { min: vMin, max: vMax, step = 1 } = paramValidation || { min: 0, max: 100 };

    switch (thresholdType) {
      case THRESHOLD_TYPES.RANGE:
        return (
          <div className="space-y-4">
            {/* Warning Min/Max */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Warning Low</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={config?.warning?.min ?? defaults?.warning?.min ?? ''}
                    onChange={(e) => handleNestedChange('warning', 'min', parseFloat(e.target.value))}
                    min={vMin}
                    max={vMax}
                    step={step}
                    disabled={!isEnabled}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                  />
                  <span className="text-sm text-gray-500">{unit}</span>
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Warning High</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={config?.warning?.max ?? defaults?.warning?.max ?? ''}
                    onChange={(e) => handleNestedChange('warning', 'max', parseFloat(e.target.value))}
                    min={vMin}
                    max={vMax}
                    step={step}
                    disabled={!isEnabled}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                  />
                  <span className="text-sm text-gray-500">{unit}</span>
                </div>
              </div>
            </div>

            {/* Critical Min/Max */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Critical Low</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={config?.critical?.min ?? defaults?.critical?.min ?? ''}
                    onChange={(e) => handleNestedChange('critical', 'min', parseFloat(e.target.value))}
                    min={vMin}
                    max={vMax}
                    step={step}
                    disabled={!isEnabled}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                  />
                  <span className="text-sm text-gray-500">{unit}</span>
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Critical High</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={config?.critical?.max ?? defaults?.critical?.max ?? ''}
                    onChange={(e) => handleNestedChange('critical', 'max', parseFloat(e.target.value))}
                    min={vMin}
                    max={vMax}
                    step={step}
                    disabled={!isEnabled}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                  />
                  <span className="text-sm text-gray-500">{unit}</span>
                </div>
              </div>
            </div>
          </div>
        );

      case THRESHOLD_TYPES.MAX_ONLY:
        return (
          <div className="space-y-4">
            <ThresholdSlider
              value={config?.warning?.max ?? defaults?.warning?.max ?? vMax * 0.8}
              onChange={(v) => handleNestedChange('warning', 'max', v)}
              min={vMin}
              max={vMax}
              step={step}
              warningValue={config?.warning?.max ?? defaults?.warning?.max ?? vMax * 0.8}
              criticalValue={config?.critical?.max ?? defaults?.critical?.max ?? vMax * 0.9}
              type="max"
              label="Warning Max"
              unit={unit}
              disabled={!isEnabled}
            />
            <ThresholdSlider
              value={config?.critical?.max ?? defaults?.critical?.max ?? vMax * 0.9}
              onChange={(v) => handleNestedChange('critical', 'max', v)}
              min={vMin}
              max={vMax}
              step={step}
              warningValue={config?.warning?.max ?? defaults?.warning?.max ?? vMax * 0.8}
              criticalValue={config?.critical?.max ?? defaults?.critical?.max ?? vMax * 0.9}
              type="max"
              label="Critical Max"
              unit={unit}
              disabled={!isEnabled}
            />
          </div>
        );

      case THRESHOLD_TYPES.MIN_ONLY:
        return (
          <div className="space-y-4">
            <ThresholdSlider
              value={config?.warning?.min ?? defaults?.warning?.min ?? vMax * 0.2}
              onChange={(v) => handleNestedChange('warning', 'min', v)}
              min={vMin}
              max={vMax}
              step={step}
              warningValue={config?.warning?.min ?? defaults?.warning?.min ?? vMax * 0.2}
              criticalValue={config?.critical?.min ?? defaults?.critical?.min ?? vMax * 0.1}
              type="min"
              label="Warning Min"
              unit={unit}
              disabled={!isEnabled}
            />
            <ThresholdSlider
              value={config?.critical?.min ?? defaults?.critical?.min ?? vMax * 0.1}
              onChange={(v) => handleNestedChange('critical', 'min', v)}
              min={vMin}
              max={vMax}
              step={step}
              warningValue={config?.warning?.min ?? defaults?.warning?.min ?? vMax * 0.2}
              criticalValue={config?.critical?.min ?? defaults?.critical?.min ?? vMax * 0.1}
              type="min"
              label="Critical Min"
              unit={unit}
              disabled={!isEnabled}
            />
          </div>
        );

      case THRESHOLD_TYPES.CUSTOM:
        return (
          <div className="text-sm text-gray-500 italic">
            Custom configuration - see Advanced settings
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div
      className={`
        bg-white rounded-xl border shadow-sm overflow-hidden transition-all
        ${hasErrors ? 'border-red-300' : 'border-gray-200'}
        ${!isEnabled ? 'opacity-60' : ''}
      `}
    >
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {/* Enable toggle */}
          <button
            onClick={() => handleChange('enabled', !isEnabled)}
            className={`
              relative w-10 h-6 rounded-full transition-colors
              ${isEnabled ? 'bg-blue-600' : 'bg-gray-300'}
            `}
          >
            <span
              className={`
                absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow transition-transform
                ${isEnabled ? 'translate-x-4' : 'translate-x-0'}
              `}
            />
          </button>

          <div>
            <h3 className="font-medium text-gray-900">{parameter.name}</h3>
            <p className="text-xs text-gray-500">{parameter.unit}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Help tooltip */}
          <button
            className="p-1 text-gray-400 hover:text-gray-600 rounded"
            title={parameter.description}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </button>

          {/* Reset button */}
          <button
            onClick={onReset}
            className="p-1 text-gray-400 hover:text-gray-600 rounded"
            title="Reset to defaults"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>
      </div>

      {/* Description */}
      <div className="px-4 py-2 bg-gray-50 text-sm text-gray-600">
        {parameter.description}
      </div>

      {/* Main Controls */}
      <div className="px-4 py-4">
        {renderThresholdControls()}
      </div>

      {/* Validation Errors */}
      {hasErrors && (
        <div className="px-4 pb-3">
          {validation.errors.map((error, i) => (
            <div key={i} className="flex items-center gap-2 text-sm text-red-600">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {error}
            </div>
          ))}
        </div>
      )}

      {/* Advanced Settings */}
      {parameter.advanced && parameter.advanced.length > 0 && (
        <div className="border-t border-gray-100">
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="w-full px-4 py-2 flex items-center justify-between text-sm text-gray-600 hover:bg-gray-50"
          >
            <span>Advanced Settings</span>
            <svg
              className={`w-4 h-4 transform transition-transform ${showAdvanced ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {showAdvanced && (
            <div className="px-4 py-4 space-y-4 bg-gray-50">
              {/* Hysteresis */}
              {supportsHysteresis(parameter.id) && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Hysteresis Low Clear</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        value={config?.hysteresis?.lowClear ?? ''}
                        onChange={(e) => handleNestedChange('hysteresis', 'lowClear', parseFloat(e.target.value))}
                        disabled={!isEnabled}
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                      />
                      <span className="text-sm text-gray-500">{parameter.unit}</span>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Hysteresis High Clear</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        value={config?.hysteresis?.highClear ?? ''}
                        onChange={(e) => handleNestedChange('hysteresis', 'highClear', parseFloat(e.target.value))}
                        disabled={!isEnabled}
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                      />
                      <span className="text-sm text-gray-500">{parameter.unit}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Grace Period (for coolant temp) */}
              {parameter.advanced.includes('gracePeriod') && (
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Grace Period (warmup)</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={config?.gracePeriod ?? parameter.defaults?.gracePeriod ?? 60}
                      onChange={(e) => handleChange('gracePeriod', parseInt(e.target.value))}
                      min={0}
                      max={600}
                      disabled={!isEnabled}
                      className="w-24 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                    />
                    <span className="text-sm text-gray-500">seconds</span>
                  </div>
                </div>
              )}

              {/* RPM Dependent (for oil pressure) */}
              {parameter.advanced.includes('rpmDependent') && (
                <div className="space-y-3">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={config?.rpmDependent !== false}
                      onChange={(e) => handleChange('rpmDependent', e.target.checked)}
                      disabled={!isEnabled}
                      className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-700">RPM Dependent (only check when engine running)</span>
                  </label>

                  {config?.rpmDependent !== false && (
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">RPM Threshold</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          value={config?.rpmThreshold ?? parameter.defaults?.rpmThreshold ?? 725}
                          onChange={(e) => handleChange('rpmThreshold', parseInt(e.target.value))}
                          min={0}
                          max={2000}
                          disabled={!isEnabled}
                          className="w-24 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                        />
                        <span className="text-sm text-gray-500">RPM</span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Overspeed (for RPM) */}
              {parameter.advanced.includes('overspeed') && (
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Overspeed Limit</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={config?.overspeed ?? parameter.defaults?.overspeed ?? 3800}
                      onChange={(e) => handleChange('overspeed', parseInt(e.target.value))}
                      min={1000}
                      max={10000}
                      step={100}
                      disabled={!isEnabled}
                      className="w-24 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                    />
                    <span className="text-sm text-gray-500">RPM</span>
                  </div>
                </div>
              )}

              {/* Conditional evaluation */}
              {supportsConditions(parameter.id) && (
                <>
                  <ConditionEditor
                    conditions={config?.ignoreWhen || []}
                    onChange={(conditions) => handleChange('ignoreWhen', conditions)}
                    label="Ignore When (skip evaluation if ANY is true)"
                  />
                  <ConditionEditor
                    conditions={config?.requireWhen || []}
                    onChange={(conditions) => handleChange('requireWhen', conditions)}
                    label="Require When (only evaluate if ALL are true)"
                  />
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
