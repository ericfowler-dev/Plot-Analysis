/**
 * BreakpointEditor - Operating Point Aware Threshold Editor
 * Table-based editor for piecewise-linear breakpoint configurations.
 * Allows admins to define how thresholds vary by an index parameter (RPM, MAP, etc.)
 */

import React, { useState, useCallback, useMemo } from 'react';

const INDEX_PARAM_OPTIONS = [
  { value: 'rpm', label: 'Engine RPM', unit: 'RPM', aliases: ['RPM', 'engine_speed'] },
  { value: 'MAP', label: 'Manifold Pressure (MAP)', unit: 'PSI', aliases: ['manifold_pressure', 'MANIFOLD_ABS_PRESS'] },
  { value: 'eng_load', label: 'Engine Load', unit: '%', aliases: ['engine_load', 'ENG_LOAD'] }
];

/**
 * Visual preview of the piecewise-linear threshold curve
 */
function BreakpointChart({ breakpoints, thresholdType }) {
  if (!breakpoints || breakpoints.length < 2) return null;

  const width = 320;
  const height = 120;
  const padding = { top: 10, right: 10, bottom: 25, left: 40 };
  const plotW = width - padding.left - padding.right;
  const plotH = height - padding.top - padding.bottom;

  // Determine value range from breakpoints
  const indexValues = breakpoints.map(bp => bp.indexValue);
  const xMin = Math.min(...indexValues);
  const xMax = Math.max(...indexValues);

  const allValues = [];
  breakpoints.forEach(bp => {
    if (bp.warning?.min != null) allValues.push(bp.warning.min);
    if (bp.warning?.max != null) allValues.push(bp.warning.max);
    if (bp.critical?.min != null) allValues.push(bp.critical.min);
    if (bp.critical?.max != null) allValues.push(bp.critical.max);
  });

  if (allValues.length === 0) return null;

  const yMin = Math.min(...allValues) * 0.9;
  const yMax = Math.max(...allValues) * 1.1;

  const toX = (v) => padding.left + ((v - xMin) / (xMax - xMin || 1)) * plotW;
  const toY = (v) => padding.top + plotH - ((v - yMin) / (yMax - yMin || 1)) * plotH;

  const makePath = (key, subKey) => {
    const points = breakpoints
      .filter(bp => bp[key]?.[subKey] != null)
      .map(bp => `${toX(bp.indexValue)},${toY(bp[key][subKey])}`);
    return points.length >= 2 ? `M${points.join('L')}` : null;
  };

  const paths = [];
  if (thresholdType === 'min' || thresholdType === 'both') {
    const warnMinPath = makePath('warning', 'min');
    const critMinPath = makePath('critical', 'min');
    if (warnMinPath) paths.push({ d: warnMinPath, color: '#f59e0b', label: 'Warn Min' });
    if (critMinPath) paths.push({ d: critMinPath, color: '#ef4444', label: 'Crit Min' });
  }
  if (thresholdType === 'max' || thresholdType === 'both') {
    const warnMaxPath = makePath('warning', 'max');
    const critMaxPath = makePath('critical', 'max');
    if (warnMaxPath) paths.push({ d: warnMaxPath, color: '#f59e0b', label: 'Warn Max', dashed: true });
    if (critMaxPath) paths.push({ d: critMaxPath, color: '#ef4444', label: 'Crit Max', dashed: true });
  }

  // Grid lines
  const xTicks = breakpoints.map(bp => bp.indexValue);
  const yTicks = 4;
  const yTickValues = Array.from({ length: yTicks + 1 }, (_, i) => yMin + (i * (yMax - yMin)) / yTicks);

  return (
    <svg width={width} height={height} className="bg-gray-50 rounded border border-gray-200">
      {/* Grid */}
      {yTickValues.map((v, i) => (
        <g key={`y-${i}`}>
          <line x1={padding.left} y1={toY(v)} x2={width - padding.right} y2={toY(v)} stroke="#e5e7eb" strokeWidth="0.5" />
          <text x={padding.left - 4} y={toY(v) + 3} textAnchor="end" className="text-[9px] fill-gray-400">
            {Math.round(v * 10) / 10}
          </text>
        </g>
      ))}
      {xTicks.map((v, i) => (
        <g key={`x-${i}`}>
          <line x1={toX(v)} y1={padding.top} x2={toX(v)} y2={height - padding.bottom} stroke="#e5e7eb" strokeWidth="0.5" />
          <text x={toX(v)} y={height - 5} textAnchor="middle" className="text-[9px] fill-gray-400">
            {v}
          </text>
        </g>
      ))}

      {/* Curves */}
      {paths.map((p, i) => (
        <path
          key={i}
          d={p.d}
          fill="none"
          stroke={p.color}
          strokeWidth={1.5}
          strokeDasharray={p.dashed ? '4,3' : 'none'}
        />
      ))}

      {/* Breakpoint dots */}
      {breakpoints.map((bp, i) => (
        <g key={`bp-${i}`}>
          {bp.warning?.min != null && <circle cx={toX(bp.indexValue)} cy={toY(bp.warning.min)} r={2.5} fill="#f59e0b" />}
          {bp.warning?.max != null && <circle cx={toX(bp.indexValue)} cy={toY(bp.warning.max)} r={2.5} fill="#f59e0b" stroke="white" strokeWidth={0.5} />}
          {bp.critical?.min != null && <circle cx={toX(bp.indexValue)} cy={toY(bp.critical.min)} r={2.5} fill="#ef4444" />}
          {bp.critical?.max != null && <circle cx={toX(bp.indexValue)} cy={toY(bp.critical.max)} r={2.5} fill="#ef4444" stroke="white" strokeWidth={0.5} />}
        </g>
      ))}
    </svg>
  );
}

/**
 * Main BreakpointEditor component
 */
export default function BreakpointEditor({ config, onChange, parameterUnit }) {
  const [validationErrors, setValidationErrors] = useState([]);

  const opConfig = config?.operatingPointAware || {
    enabled: false,
    indexParam: 'rpm',
    indexParamAliases: [],
    breakpoints: []
  };

  const isEnabled = opConfig.enabled === true;
  const breakpoints = opConfig.breakpoints || [];

  // Determine threshold type based on breakpoints content
  const thresholdType = useMemo(() => {
    if (breakpoints.length === 0) return 'min';
    const hasMin = breakpoints.some(bp => bp.warning?.min != null || bp.critical?.min != null);
    const hasMax = breakpoints.some(bp => bp.warning?.max != null || bp.critical?.max != null);
    if (hasMin && hasMax) return 'both';
    if (hasMax) return 'max';
    return 'min';
  }, [breakpoints]);

  const selectedParamOption = INDEX_PARAM_OPTIONS.find(o => o.value === opConfig.indexParam) || INDEX_PARAM_OPTIONS[0];

  const handleToggle = useCallback((enabled) => {
    const updated = {
      ...config,
      operatingPointAware: {
        ...opConfig,
        enabled,
        // Ensure we have at least 2 breakpoints when enabling
        breakpoints: enabled && breakpoints.length < 2
          ? [
              { indexValue: 700, warning: { min: 8 }, critical: { min: 5 } },
              { indexValue: 1800, warning: { min: 18 }, critical: { min: 12 } }
            ]
          : breakpoints
      }
    };
    onChange(updated);
  }, [config, opConfig, breakpoints, onChange]);

  const handleIndexParamChange = useCallback((paramValue) => {
    const option = INDEX_PARAM_OPTIONS.find(o => o.value === paramValue) || INDEX_PARAM_OPTIONS[0];
    onChange({
      ...config,
      operatingPointAware: {
        ...opConfig,
        indexParam: option.value,
        indexParamAliases: option.aliases
      }
    });
  }, [config, opConfig, onChange]);

  const updateBreakpoint = useCallback((index, field, subField, value) => {
    const updated = breakpoints.map((bp, i) => {
      if (i !== index) return bp;
      if (subField) {
        return {
          ...bp,
          [field]: {
            ...bp[field],
            [subField]: value
          }
        };
      }
      return { ...bp, [field]: value };
    });

    // Re-sort by indexValue
    updated.sort((a, b) => a.indexValue - b.indexValue);

    onChange({
      ...config,
      operatingPointAware: { ...opConfig, breakpoints: updated }
    });
  }, [config, opConfig, breakpoints, onChange]);

  const addBreakpoint = useCallback(() => {
    const lastBp = breakpoints[breakpoints.length - 1];
    const newBp = lastBp
      ? {
          indexValue: lastBp.indexValue + 200,
          warning: { ...lastBp.warning },
          critical: { ...lastBp.critical }
        }
      : { indexValue: 1000, warning: { min: 10 }, critical: { min: 7 } };

    const updated = [...breakpoints, newBp].sort((a, b) => a.indexValue - b.indexValue);

    onChange({
      ...config,
      operatingPointAware: { ...opConfig, breakpoints: updated }
    });
  }, [config, opConfig, breakpoints, onChange]);

  const removeBreakpoint = useCallback((index) => {
    if (breakpoints.length <= 2) return; // Minimum 2 breakpoints
    const updated = breakpoints.filter((_, i) => i !== index);
    onChange({
      ...config,
      operatingPointAware: { ...opConfig, breakpoints: updated }
    });
  }, [config, opConfig, breakpoints, onChange]);

  // Validate breakpoints
  const validate = useCallback(() => {
    const errors = [];
    if (breakpoints.length < 2) {
      errors.push('At least 2 breakpoints are required');
    }
    for (let i = 1; i < breakpoints.length; i++) {
      if (breakpoints[i].indexValue <= breakpoints[i - 1].indexValue) {
        errors.push(`Index values must be increasing (breakpoint ${i + 1})`);
      }
    }
    breakpoints.forEach((bp, i) => {
      const wMin = bp.warning?.min;
      const cMin = bp.critical?.min;
      if (wMin != null && cMin != null && wMin < cMin) {
        errors.push(`Breakpoint ${i + 1}: Warning min should be >= critical min`);
      }
      const wMax = bp.warning?.max;
      const cMax = bp.critical?.max;
      if (wMax != null && cMax != null && wMax > cMax) {
        errors.push(`Breakpoint ${i + 1}: Warning max should be <= critical max`);
      }
    });
    setValidationErrors(errors);
    return errors.length === 0;
  }, [breakpoints]);

  // Show columns based on what the breakpoints contain
  const showMinColumns = thresholdType === 'min' || thresholdType === 'both';
  const showMaxColumns = thresholdType === 'max' || thresholdType === 'both';

  return (
    <div className="border border-indigo-200 rounded-lg bg-indigo-50/30 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 flex items-center justify-between border-b border-indigo-100">
        <div className="flex items-center gap-3">
          <button
            onClick={() => handleToggle(!isEnabled)}
            className={`relative w-9 h-5 rounded-full transition-colors ${
              isEnabled ? 'bg-indigo-600' : 'bg-gray-300'
            }`}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                isEnabled ? 'translate-x-4' : 'translate-x-0'
              }`}
            />
          </button>
          <div>
            <span className="text-sm font-medium text-gray-900">Operating Point Aware</span>
            <p className="text-xs text-gray-500">Thresholds vary by operating condition</p>
          </div>
        </div>
        {isEnabled && (
          <select
            value={opConfig.indexParam || 'rpm'}
            onChange={(e) => handleIndexParamChange(e.target.value)}
            className="text-sm px-2 py-1 border border-gray-300 rounded-lg bg-white"
          >
            {INDEX_PARAM_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        )}
      </div>

      {isEnabled && (
        <div className="p-4 space-y-4">
          {/* Chart preview */}
          {breakpoints.length >= 2 && (
            <div className="flex justify-center">
              <BreakpointChart breakpoints={breakpoints} thresholdType={thresholdType} />
            </div>
          )}

          {/* Breakpoint table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="px-2 py-1.5 text-left text-xs font-medium text-gray-500 uppercase">
                    {selectedParamOption.label} ({selectedParamOption.unit})
                  </th>
                  {showMinColumns && (
                    <>
                      <th className="px-2 py-1.5 text-center text-xs font-medium text-amber-600 uppercase">
                        Warn Min
                      </th>
                      <th className="px-2 py-1.5 text-center text-xs font-medium text-red-600 uppercase">
                        Crit Min
                      </th>
                    </>
                  )}
                  {showMaxColumns && (
                    <>
                      <th className="px-2 py-1.5 text-center text-xs font-medium text-amber-600 uppercase">
                        Warn Max
                      </th>
                      <th className="px-2 py-1.5 text-center text-xs font-medium text-red-600 uppercase">
                        Crit Max
                      </th>
                    </>
                  )}
                  <th className="px-2 py-1.5 w-8"></th>
                </tr>
              </thead>
              <tbody>
                {breakpoints.map((bp, i) => (
                  <tr key={i} className="border-b border-gray-100 hover:bg-white/50">
                    <td className="px-2 py-1.5">
                      <input
                        type="number"
                        value={bp.indexValue ?? ''}
                        onChange={(e) => updateBreakpoint(i, 'indexValue', null, parseFloat(e.target.value) || 0)}
                        className="w-20 px-2 py-1 text-sm border border-gray-300 rounded bg-white"
                      />
                    </td>
                    {showMinColumns && (
                      <>
                        <td className="px-2 py-1.5 text-center">
                          <input
                            type="number"
                            value={bp.warning?.min ?? ''}
                            onChange={(e) => updateBreakpoint(i, 'warning', 'min', parseFloat(e.target.value))}
                            className="w-16 px-2 py-1 text-sm border border-amber-200 rounded bg-amber-50/50 text-center"
                            step="0.5"
                          />
                        </td>
                        <td className="px-2 py-1.5 text-center">
                          <input
                            type="number"
                            value={bp.critical?.min ?? ''}
                            onChange={(e) => updateBreakpoint(i, 'critical', 'min', parseFloat(e.target.value))}
                            className="w-16 px-2 py-1 text-sm border border-red-200 rounded bg-red-50/50 text-center"
                            step="0.5"
                          />
                        </td>
                      </>
                    )}
                    {showMaxColumns && (
                      <>
                        <td className="px-2 py-1.5 text-center">
                          <input
                            type="number"
                            value={bp.warning?.max ?? ''}
                            onChange={(e) => updateBreakpoint(i, 'warning', 'max', parseFloat(e.target.value))}
                            className="w-16 px-2 py-1 text-sm border border-amber-200 rounded bg-amber-50/50 text-center"
                            step="0.5"
                          />
                        </td>
                        <td className="px-2 py-1.5 text-center">
                          <input
                            type="number"
                            value={bp.critical?.max ?? ''}
                            onChange={(e) => updateBreakpoint(i, 'critical', 'max', parseFloat(e.target.value))}
                            className="w-16 px-2 py-1 text-sm border border-red-200 rounded bg-red-50/50 text-center"
                            step="0.5"
                          />
                        </td>
                      </>
                    )}
                    <td className="px-2 py-1.5">
                      <button
                        onClick={() => removeBreakpoint(i)}
                        disabled={breakpoints.length <= 2}
                        className="p-1 text-gray-400 hover:text-red-500 disabled:opacity-30 disabled:cursor-not-allowed"
                        title={breakpoints.length <= 2 ? 'Minimum 2 breakpoints required' : 'Remove breakpoint'}
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Add breakpoint button */}
          <div className="flex items-center justify-between">
            <button
              onClick={addBreakpoint}
              className="flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-700 font-medium"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Breakpoint
            </button>

            {/* Add min/max column toggles */}
            <div className="flex items-center gap-3 text-xs">
              <label className="flex items-center gap-1 text-gray-500">
                <input
                  type="checkbox"
                  checked={showMinColumns}
                  onChange={(e) => {
                    if (!e.target.checked && !showMaxColumns) return;
                    // Add or remove min fields from breakpoints
                    const updated = breakpoints.map(bp => {
                      const newBp = { ...bp };
                      if (!e.target.checked) {
                        if (newBp.warning) { delete newBp.warning.min; if (Object.keys(newBp.warning).length === 0) delete newBp.warning; }
                        if (newBp.critical) { delete newBp.critical.min; if (Object.keys(newBp.critical).length === 0) delete newBp.critical; }
                      } else {
                        newBp.warning = { ...newBp.warning, min: 0 };
                        newBp.critical = { ...newBp.critical, min: 0 };
                      }
                      return newBp;
                    });
                    onChange({ ...config, operatingPointAware: { ...opConfig, breakpoints: updated } });
                  }}
                  className="w-3 h-3 text-indigo-600 rounded"
                />
                Min columns
              </label>
              <label className="flex items-center gap-1 text-gray-500">
                <input
                  type="checkbox"
                  checked={showMaxColumns}
                  onChange={(e) => {
                    if (!e.target.checked && !showMinColumns) return;
                    const updated = breakpoints.map(bp => {
                      const newBp = { ...bp };
                      if (!e.target.checked) {
                        if (newBp.warning) { delete newBp.warning.max; if (Object.keys(newBp.warning).length === 0) delete newBp.warning; }
                        if (newBp.critical) { delete newBp.critical.max; if (Object.keys(newBp.critical).length === 0) delete newBp.critical; }
                      } else {
                        newBp.warning = { ...newBp.warning, max: 100 };
                        newBp.critical = { ...newBp.critical, max: 100 };
                      }
                      return newBp;
                    });
                    onChange({ ...config, operatingPointAware: { ...opConfig, breakpoints: updated } });
                  }}
                  className="w-3 h-3 text-indigo-600 rounded"
                />
                Max columns
              </label>
            </div>
          </div>

          {/* Description field */}
          <div>
            <input
              type="text"
              value={opConfig.description || ''}
              onChange={(e) => onChange({
                ...config,
                operatingPointAware: { ...opConfig, description: e.target.value }
              })}
              placeholder="Description of how thresholds vary (optional)"
              className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg bg-white placeholder-gray-400"
            />
          </div>

          {/* Validation errors */}
          {validationErrors.length > 0 && (
            <div className="space-y-1">
              {validationErrors.map((err, i) => (
                <div key={i} className="flex items-center gap-2 text-xs text-red-600">
                  <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  {err}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
