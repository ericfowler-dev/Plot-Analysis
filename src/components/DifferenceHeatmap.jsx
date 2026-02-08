import React from 'react';
import { BarChart3 } from 'lucide-react';

// =============================================================================
// DIFFERENCE HEATMAP COMPONENT
// Histogram comparison visualization showing Primary minus Secondary values
// =============================================================================

const formatNumber = (value, decimals = 2) => {
  if (value === null || value === undefined || value === '') return '-';
  const num = typeof value === 'number' ? value : parseFloat(value);
  if (isNaN(num)) return '-';
  return num.toFixed(decimals);
};

const DifferenceHeatmap = ({
  differenceData,
  title = 'Histogram Difference',
  primaryLabel = 'Primary',
  secondaryLabel = 'Secondary',
  unitLabel = 'hours',
  metricLabel = 'operating time',
  sourceInSeconds = false,
  secondsPerUnit = 1
}) => {
  if (!differenceData || !differenceData.data || differenceData.data.length === 0) {
    return (
      <div className="rounded-xl border border-slate-700 bg-slate-900/50 p-8 text-center">
        <BarChart3 className="w-12 h-12 mx-auto mb-3 text-slate-600" />
        <p className="text-slate-400">No difference data available</p>
      </div>
    );
  }

  const { data: rawData, xLabels, yLabels, maxAbsDiff: rawMaxAbsDiff } = differenceData;
  const isEventUnits = unitLabel === 'events' || unitLabel === 'counts' || unitLabel === 'occurrences';

  // Conversion factor: if source is in seconds, convert to hours for display
  const conversionFactor = sourceInSeconds ? (secondsPerUnit / 3600) : 1;

  // Apply conversion to data
  const data = rawData.map(row => row.map(val => val * conversionFactor));
  const maxAbsDiff = rawMaxAbsDiff * conversionFactor;

  const valueDecimals = isEventUnits ? 0 : 2;
  const tooltipDecimals = isEventUnits ? 0 : 4;
  const comparisonNoun = isEventUnits ? 'events' : 'time';
  const overallUnitNoun = isEventUnits ? 'events' : unitLabel;

  // Calculate totals for each column and row
  const rowTotals = data.map(row => row.reduce((sum, val) => sum + val, 0));
  const colTotals = xLabels.map((_, idx) =>
    data.reduce((sum, row) => sum + (row[idx] || 0), 0)
  );

  // Get cell color based on difference value
  // Green = Primary higher, Red = Secondary higher
  const getCellColor = (value) => {
    if (value === 0 || maxAbsDiff === 0) {
      return 'rgba(51, 65, 85, 0.45)';
    }

    const intensity = Math.min(Math.abs(value) / maxAbsDiff, 1);
    const alpha = 0.18 + (intensity * 0.45);

    if (value > 0) {
      // Primary higher - blue tint
      return `rgba(37, 99, 235, ${alpha})`; // blue-600
    } else {
      // Secondary higher - orange tint
      return `rgba(194, 65, 12, ${alpha})`; // orange-700
    }
  };

  const getCellTextColor = (value) => {
    if (value === 0) return 'text-slate-200';
    return 'text-white';
  };

  const getTotalTextColor = (value) => {
    if (value === 0) return 'text-slate-300';
    return value > 0 ? 'text-blue-200' : 'text-orange-200';
  };

  // Calculate summary stats
  const totalDiff = rowTotals.reduce((sum, val) => sum + val, 0);
  const primaryMore = totalDiff > 0;
  const diffMagnitude = Math.abs(totalDiff).toFixed(valueDecimals);

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-900/50 overflow-hidden">
      {/* Header */}
      <div className="bg-slate-800/50 px-4 py-3 border-b border-slate-700">
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-white font-bold text-sm tracking-wide">{title}</h3>
          <div className="flex items-center gap-4">
            {/* Legend */}
            <div className="flex items-center gap-4 text-xs">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded bg-blue-500/60" />
                <span className="text-blue-400">Primary has more {comparisonNoun}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded bg-slate-700" />
                <span className="text-slate-400">Equal</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded bg-orange-500/60" />
                <span className="text-orange-400">Secondary has more {comparisonNoun}</span>
              </div>
            </div>
          </div>
        </div>
        {/* Explanation */}
        <div className="bg-slate-900/50 rounded-lg p-3 text-sm">
          <div className="font-semibold text-white mb-1">What does this show?</div>
          <p className="text-slate-400 text-xs leading-relaxed">
            This heatmap compares {metricLabel} between the Primary and Secondary ECMs at each RPM/MAP combination.
            {totalDiff !== 0 ? (
              <span className={primaryMore ? 'text-blue-400' : 'text-orange-400'}>
                {' '}Overall, the <strong>{primaryMore ? 'Primary' : 'Secondary'} ECM</strong> logged <strong>{diffMagnitude} more {overallUnitNoun}</strong>.
              </span>
            ) : (
              <span className="text-slate-300"> Both ECMs have identical {metricLabel}.</span>
            )}
          </p>
        </div>
      </div>

      {/* Table */}
      <div className="p-4 overflow-x-auto">
        <table className="w-full border-separate border-spacing-1">
          <thead>
            <tr>
              <th className="w-16 p-2 text-left text-[10px] font-bold text-slate-500 uppercase">
                RPM \ MAP
              </th>
              {xLabels.map((x, idx) => (
                <th key={idx} className="w-16 p-2 text-center text-xs font-bold text-slate-400">
                  {formatNumber(x, 1)}
                </th>
              ))}
              <th className="w-20 p-2 text-center text-xs font-bold text-slate-400 border-l border-slate-700/50">
                Row Sum
              </th>
            </tr>
          </thead>
          <tbody>
            {yLabels.map((yLabel, yIdx) => (
              <tr key={yIdx}>
                <td className="p-2 text-right text-xs font-bold text-white border-r border-slate-700/50 pr-3">
                  {formatNumber(yLabel, 0)}
                </td>
                {xLabels.map((_, xIdx) => {
                  const value = data[yIdx]?.[xIdx] || 0;
                  const bgColor = getCellColor(value);
                  const textColor = getCellTextColor(value);

                  return (
                    <td
                      key={xIdx}
                      className={`p-2 rounded border border-white/5 text-center transition-all hover:border-green-500/50`}
                      style={{ backgroundColor: bgColor }}
                      title={`RPM: ${yLabel}, MAP: ${xLabels[xIdx]}\nDifference: ${formatNumber(value, tooltipDecimals)} ${unitLabel}\n${value > 0 ? 'Primary' : value < 0 ? 'Secondary' : 'Both'} higher`}
                    >
                      {value !== 0 ? (
                        <div className={`text-[11px] font-mono font-bold drop-shadow-[0_1px_1px_rgba(0,0,0,0.85)] ${value > 0 ? 'text-blue-200' : 'text-orange-200'}`}>
                          <span className="text-[9px]">{value > 0 ? 'P+' : 'S+'}</span>{formatNumber(Math.abs(value), isEventUnits ? 0 : (Math.abs(value) < 0.01 ? 4 : 2))}
                        </div>
                      ) : (
                        <div className="text-[11px] text-slate-300 font-mono">0</div>
                      )}
                    </td>
                  );
                })}
                <td className={`p-2 text-center text-xs font-bold font-mono border-l border-slate-700/50 ${getTotalTextColor(rowTotals[yIdx])}`}>
                  {rowTotals[yIdx] !== 0 ? (<><span className="text-[9px]">{rowTotals[yIdx] > 0 ? 'P+' : 'S+'}</span>{formatNumber(Math.abs(rowTotals[yIdx]), 2)}</>) : '0'}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td className="p-2 text-right text-[10px] font-bold text-slate-400 uppercase pr-3 border-t border-slate-700/50">
                Col Sum
              </td>
              {colTotals.map((total, idx) => (
                <td key={idx} className={`p-2 text-center text-xs font-bold font-mono border-t border-slate-700/50 ${getTotalTextColor(total)}`}>
                  {total !== 0 ? (<><span className="text-[9px]">{total > 0 ? 'P+' : 'S+'}</span>{formatNumber(Math.abs(total), valueDecimals)}</>) : '0'}
                </td>
              ))}
              <td className="p-2 text-center text-xs font-bold text-white font-mono border-t border-l border-slate-700/50">
                {/* Grand total */}
                {formatNumber(rowTotals.reduce((sum, val) => sum + val, 0), valueDecimals)} {unitLabel}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Stats Footer */}
      <div className="px-4 py-3 border-t border-slate-700 bg-slate-800/30 flex justify-between items-center text-xs text-slate-400">
        <div className="flex gap-6">
          <span>
            Max Positive: <span className="text-blue-400 font-mono">{formatNumber(differenceData.maxDiff, tooltipDecimals)} {unitLabel}</span>
          </span>
          <span>
            Max Negative: <span className="text-orange-400 font-mono">{formatNumber(differenceData.minDiff, tooltipDecimals)} {unitLabel}</span>
          </span>
          <span>
            Total Diff: <span className={`font-mono ${getTotalTextColor(rowTotals.reduce((sum, val) => sum + val, 0))}`}>
              {formatNumber(rowTotals.reduce((sum, val) => sum + val, 0), valueDecimals)} {unitLabel}
            </span>
          </span>
        </div>
        <div className="text-[10px] text-slate-500">
          <span className="text-blue-400">P+</span> = Primary has more {comparisonNoun} | <span className="text-orange-400">S+</span> = Secondary has more {comparisonNoun}
        </div>
      </div>
    </div>
  );
};

export default DifferenceHeatmap;
