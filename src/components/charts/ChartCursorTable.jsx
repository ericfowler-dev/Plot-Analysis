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
  onClear
}) {
  const hasA = Number.isFinite(cursorA);
  const hasB = Number.isFinite(cursorB);
  const spanStart = hasA && hasB ? Math.min(cursorA, cursorB) : null;
  const spanEnd = hasA && hasB ? Math.max(cursorA, cursorB) : null;

  return (
    <aside className="w-full xl:w-72 flex-shrink-0 bg-slate-900/80 border border-slate-800 rounded-xl overflow-hidden flex flex-col max-h-[420px] xl:max-h-none">
      <div className="px-3 py-2 border-b border-slate-700 flex items-center justify-between">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400" style={{ fontFamily: 'Orbitron, sans-serif' }}>
            Cursor Information
          </div>
          <div className="mt-1 flex items-center gap-2 text-[10px]">
            <span className="px-1.5 py-0.5 rounded border" style={{ color: CURSOR_A_COLOR, borderColor: CURSOR_A_COLOR }}>C1</span>
            <span className="px-1.5 py-0.5 rounded border" style={{ color: CURSOR_B_COLOR, borderColor: CURSOR_B_COLOR }}>C2</span>
            <span className="text-slate-500">C2 − C1</span>
          </div>
        </div>
        {(hasA || hasB) && (
          <button type="button" onClick={onClear} className="text-[10px] uppercase tracking-wide text-slate-400 hover:text-white">
            Clear
          </button>
        )}
      </div>
      <div className="overflow-auto text-[11px] font-mono">
        <table className="w-full border-collapse">
          <thead className="sticky top-0 bg-slate-900">
            <tr className="text-[10px] uppercase tracking-wide text-slate-500">
              <th className="text-left font-medium px-2 py-1.5">Channel</th>
              <th className="text-right font-medium px-2 py-1.5" style={{ color: CURSOR_A_COLOR }}>C1</th>
              <th className="text-right font-medium px-2 py-1.5" style={{ color: CURSOR_B_COLOR }}>C2</th>
              <th className="text-right font-medium px-2 py-1.5 text-slate-300">Δ</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-t border-slate-800">
              <td className="px-2 py-1 text-slate-300">Time</td>
              <td className="px-2 py-1 text-right" style={{ color: CURSOR_A_COLOR }}>{hasA ? formatChartTick(cursorA) : '—'}</td>
              <td className="px-2 py-1 text-right" style={{ color: CURSOR_B_COLOR }}>{hasB ? formatChartTick(cursorB) : '—'}</td>
              <td className="px-2 py-1 text-right text-slate-200">
                {hasA && hasB ? formatChartTick(cursorB - cursorA) : '—'}
              </td>
            </tr>
            {hasA && hasB && (
              <tr className="border-t border-slate-800/70">
                <td className="px-2 py-1 text-slate-500">Time (s)</td>
                <td className="px-2 py-1 text-right text-slate-400">{cursorA.toFixed(3)}</td>
                <td className="px-2 py-1 text-right text-slate-400">{cursorB.toFixed(3)}</td>
                <td className="px-2 py-1 text-right text-slate-300">{(cursorB - cursorA).toFixed(3)}</td>
              </tr>
            )}
            {chartSeries.map((series) => {
              const samples = seriesValueLookup[series.key] || [];
              const a = hasA ? valueAtTime(samples, cursorA) : null;
              const b = hasB ? valueAtTime(samples, cursorB) : null;
              return (
                <tr key={series.key} className="border-t border-slate-800/80">
                  <td className="px-2 py-1 truncate" style={{ color: series.color }} title={channelLabel(series.channel, series.role)}>
                    {channelLabel(series.channel, series.role)}
                  </td>
                  <td className="px-2 py-1 text-right text-slate-200">{formatValue(series.channel, a)}</td>
                  <td className="px-2 py-1 text-right text-slate-200">{formatValue(series.channel, b)}</td>
                  <td className="px-2 py-1 text-right text-slate-300">{formatDelta(series.channel, a, b)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {spanStart !== null && (
          <div className="border-t border-slate-800 px-2 py-2 space-y-1">
            <div className="text-[10px] uppercase tracking-wide text-slate-500">In C1–C2 window</div>
            {chartSeries.map((series) => {
              if (isDiscreteChannel(series.channel)) return null;
              const stats = computeWindowStats(seriesValueLookup[series.key] || [], spanStart, spanEnd);
              if (!stats) return null;
              const decimals = getDecimalPlaces(series.channel);
              return (
                <div key={`stat-${series.key}`} className="flex justify-between gap-2 text-[10px]" style={{ color: series.color }}>
                  <span className="truncate">{channelLabel(series.channel, series.role)}</span>
                  <span className="text-slate-300 whitespace-nowrap">
                    min {stats.min.toFixed(decimals)} · max {stats.max.toFixed(decimals)} · μ {stats.mean.toFixed(decimals)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
        {!hasA && !hasB && (
          <div className="px-3 py-4 text-[11px] text-slate-500">
            Click the plot to plant C1. Alt-click (or press 2) to plant C2.
          </div>
        )}
      </div>
    </aside>
  );
}
