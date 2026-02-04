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
  secondaryLabel = 'Secondary'
}) => {
  if (!differenceData || !differenceData.data || differenceData.data.length === 0) {
    return (
      <div className="rounded-xl border border-slate-700 bg-slate-900/50 p-8 text-center">
        <BarChart3 className="w-12 h-12 mx-auto mb-3 text-slate-600" />
        <p className="text-slate-400">No difference data available</p>
      </div>
    );
  }

  const { data, xLabels, yLabels, maxAbsDiff } = differenceData;

  // Calculate totals for each column and row
  const rowTotals = data.map(row => row.reduce((sum, val) => sum + val, 0));
  const colTotals = xLabels.map((_, idx) =>
    data.reduce((sum, row) => sum + (row[idx] || 0), 0)
  );

  // Get cell color based on difference value
  // Green = Primary higher, Red = Secondary higher
  const getCellColor = (value) => {
    if (value === 0 || maxAbsDiff === 0) {
      return 'bg-slate-800';
    }

    const intensity = Math.min(Math.abs(value) / maxAbsDiff, 1);
    const alpha = 0.2 + (intensity * 0.6);

    if (value > 0) {
      // Primary higher - blue tint
      return `rgba(59, 130, 246, ${alpha})`; // blue-500
    } else {
      // Secondary higher - orange tint
      return `rgba(249, 115, 22, ${alpha})`; // orange-500
    }
  };

  const getCellTextColor = (value) => {
    if (value === 0) return 'text-slate-500';
    return value > 0 ? 'text-blue-400' : 'text-orange-400';
  };

  // Calculate summary stats
  const totalDiff = rowTotals.reduce((sum, val) => sum + val, 0);
  const primaryMore = totalDiff > 0;
  const diffHours = Math.abs(totalDiff).toFixed(2);

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
                <span className="text-blue-400">Primary has more time</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded bg-slate-700" />
                <span className="text-slate-400">Equal</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded bg-orange-500/60" />
                <span className="text-orange-400">Secondary has more time</span>
              </div>
            </div>
          </div>
        </div>
        {/* Explanation */}
        <div className="bg-slate-900/50 rounded-lg p-3 text-sm">
          <div className="font-semibold text-white mb-1">What does this show?</div>
          <p className="text-slate-400 text-xs leading-relaxed">
            This heatmap compares operating time between the Primary and Secondary ECMs at each RPM/MAP combination.
            {totalDiff !== 0 ? (
              <span className={primaryMore ? 'text-blue-400' : 'text-orange-400'}>
                {' '}Overall, the <strong>{primaryMore ? 'Primary' : 'Secondary'} ECM</strong> logged <strong>{diffHours} more hours</strong> of operation.
              </span>
            ) : (
              <span className="text-slate-300"> Both ECMs have logged identical operating time.</span>
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
                      style={{ backgroundColor: typeof bgColor === 'string' && bgColor.startsWith('rgba') ? bgColor : undefined }}
                      title={`RPM: ${yLabel}, MAP: ${xLabels[xIdx]}\nDifference: ${formatNumber(value, 4)}h\n${value > 0 ? 'Primary' : value < 0 ? 'Secondary' : 'Both'} higher`}
                    >
                      {value !== 0 ? (
                        <div className={`text-[11px] font-mono font-bold ${textColor}`}>
                          {value > 0 ? '+' : ''}{formatNumber(value, value === 0 ? 0 : Math.abs(value) < 0.01 ? 4 : 2)}
                        </div>
                      ) : (
                        <div className="text-[11px] text-slate-600">0</div>
                      )}
                    </td>
                  );
                })}
                <td className={`p-2 text-center text-xs font-bold font-mono border-l border-slate-700/50 ${getCellTextColor(rowTotals[yIdx])}`}>
                  {rowTotals[yIdx] !== 0 && (rowTotals[yIdx] > 0 ? '+' : '')}{formatNumber(rowTotals[yIdx], 2)}
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
                <td key={idx} className={`p-2 text-center text-xs font-bold font-mono border-t border-slate-700/50 ${getCellTextColor(total)}`}>
                  {total !== 0 && (total > 0 ? '+' : '')}{formatNumber(total, 2)}
                </td>
              ))}
              <td className="p-2 text-center text-xs font-bold text-white font-mono border-t border-l border-slate-700/50">
                {/* Grand total */}
                {formatNumber(rowTotals.reduce((sum, val) => sum + val, 0), 2)}h
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Stats Footer */}
      <div className="px-4 py-3 border-t border-slate-700 bg-slate-800/30 flex justify-between items-center text-xs text-slate-400">
        <div className="flex gap-6">
          <span>
            Max Positive: <span className="text-blue-400 font-mono">{formatNumber(differenceData.maxDiff, 4)}h</span>
          </span>
          <span>
            Max Negative: <span className="text-orange-400 font-mono">{formatNumber(differenceData.minDiff, 4)}h</span>
          </span>
          <span>
            Total Diff: <span className={`font-mono ${getCellTextColor(rowTotals.reduce((sum, val) => sum + val, 0))}`}>
              {formatNumber(rowTotals.reduce((sum, val) => sum + val, 0), 2)}h
            </span>
          </span>
        </div>
        <div className="text-[10px] text-slate-500">
          Positive = Primary has more time | Negative = Secondary has more time
        </div>
      </div>
    </div>
  );
};

export default DifferenceHeatmap;
