import { useState } from 'react';
import {
  BPLOT_PARAMETERS,
  VALUE_MAPPINGS,
  getDisplayValue,
  getDecimalPlaces
} from '../../lib/bplotThresholds';
import { formatChartTick, isDiscreteChannel } from '../../lib/chartResample';
import { CURSOR_A_COLOR, CURSOR_B_COLOR, computeWindowStats, valueAtTime } from '../../lib/chartCursors';
import { getDerivedChannel } from '../../lib/chartDerived';

const formatValue = (channel, sample) => {
  if (!sample || typeof sample.value !== 'number') return '—';
  if (isDiscreteChannel(channel) || VALUE_MAPPINGS[channel]) {
    return String(getDisplayValue(channel, Math.round(sample.value)));
  }
  return sample.value.toFixed(getDecimalPlaces(channel));
};

const formatDelta = (channel, a, b) => {
  if (!a || !b || typeof a.value !== 'number' || typeof b.value !== 'number') return '—';
  if (isDiscreteChannel(channel) || VALUE_MAPPINGS[channel]) {
    return a.value === b.value ? '0' : 'changed';
  }
  const delta = b.value - a.value;
  const decimals = Math.max(getDecimalPlaces(channel), 3);
  const sign = delta > 0 ? '+' : '';
  return `${sign}${delta.toFixed(decimals)}`;
};

const channelLabel = (channel, role) => {
  const derived = getDerivedChannel(channel);
  const name = derived?.name || BPLOT_PARAMETERS[channel]?.name || channel;
  if (!role) return name;
  return `${name} (${role === 'primary' ? 'P' : 'S'})`;
};

export default function ChartCursorTable({
  chartSeries = [],
  seriesValueLookup = {},
  cursorA = null,
  cursorB = null,
  activeCursor = 'a',
  onActiveCursorChange,
  onClear
}) {
  const [expanded, setExpanded] = useState(false);
  const hasA = Number.isFinite(cursorA);
  const hasB = Number.isFinite(cursorB);
  const spanStart = hasA && hasB ? Math.min(cursorA, cursorB) : null;
  const spanEnd = hasA && hasB ? Math.max(cursorA, cursorB) : null;

  return (
    <div className="mt-2 rounded-lg border border-slate-800 bg-slate-950/70">
      <div className="flex flex-wrap items-center gap-2 px-3 py-1.5">
        <button
          type="button"
          onClick={() => onActiveCursorChange?.('a')}
          className={`px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide border ${
            activeCursor === 'a' ? 'bg-rose-500/20 text-rose-300 border-rose-400/70' : 'border-slate-700 text-slate-400'
          }`}
        >
          C1 {hasA ? formatChartTick(cursorA) : 'click plot'}
        </button>
        <button
          type="button"
          onClick={() => onActiveCursorChange?.('b')}
          className={`px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide border ${
            activeCursor === 'b' ? 'bg-blue-500/20 text-blue-300 border-blue-400/70' : 'border-slate-700 text-slate-400'
          }`}
        >
          C2 {hasB ? formatChartTick(cursorB) : 'then click'}
        </button>
        <span className="text-[11px] font-mono text-slate-300">
          Δ {hasA && hasB ? formatChartTick(cursorB - cursorA) : '—'}
        </span>
        <span className="text-[10px] text-slate-500 hidden md:inline">
          Next click plants {activeCursor === 'b' ? 'C2' : 'C1'}
        </span>
        <div className="ml-auto flex items-center gap-2">
          {(hasA || hasB) && (
            <button type="button" onClick={onClear} className="text-[10px] uppercase tracking-wide text-slate-400 hover:text-white">
              Clear
            </button>
          )}
          <button
            type="button"
            onClick={() => setExpanded((prev) => !prev)}
            className="text-[10px] uppercase tracking-wide text-slate-400 hover:text-white"
          >
            {expanded ? 'Hide values' : 'Values'}
          </button>
        </div>
      </div>
      {expanded && (
        <div className="max-h-40 overflow-auto border-t border-slate-800 text-[11px] font-mono">
          <table className="w-full border-collapse">
            <thead className="sticky top-0 bg-slate-950">
              <tr className="text-[10px] uppercase tracking-wide text-slate-500">
                <th className="text-left font-medium px-2 py-1">Channel</th>
                <th className="text-right font-medium px-2 py-1" style={{ color: CURSOR_A_COLOR }}>C1</th>
                <th className="text-right font-medium px-2 py-1" style={{ color: CURSOR_B_COLOR }}>C2</th>
                <th className="text-right font-medium px-2 py-1">Δ</th>
              </tr>
            </thead>
            <tbody>
              {chartSeries.map((series) => {
                const samples = seriesValueLookup[series.key] || [];
                const a = hasA ? valueAtTime(samples, cursorA) : null;
                const b = hasB ? valueAtTime(samples, cursorB) : null;
                return (
                  <tr key={series.key} className="border-t border-slate-800/80">
                    <td className="px-2 py-1 truncate" style={{ color: series.color }}>{channelLabel(series.channel, series.role)}</td>
                    <td className="px-2 py-1 text-right text-slate-200">{formatValue(series.channel, a)}</td>
                    <td className="px-2 py-1 text-right text-slate-200">{formatValue(series.channel, b)}</td>
                    <td className="px-2 py-1 text-right text-slate-300">{formatDelta(series.channel, a, b)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {spanStart !== null && (
            <div className="border-t border-slate-800 px-2 py-1.5 flex flex-wrap gap-x-4 gap-y-1">
              {chartSeries.map((series) => {
                if (isDiscreteChannel(series.channel)) return null;
                const stats = computeWindowStats(seriesValueLookup[series.key] || [], spanStart, spanEnd);
                if (!stats) return null;
                const decimals = getDecimalPlaces(series.channel);
                return (
                  <span key={`stat-${series.key}`} className="text-[10px]" style={{ color: series.color }}>
                    {channelLabel(series.channel, series.role)} min {stats.min.toFixed(decimals)} / max {stats.max.toFixed(decimals)}
                  </span>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}