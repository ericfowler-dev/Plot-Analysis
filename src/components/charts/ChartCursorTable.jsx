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

const formatStat = (channel, value) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  return value.toFixed(getDecimalPlaces(channel));
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
  onClear,
  expanded = false,
  onExpandedChange
}) {
  const hasA = Number.isFinite(cursorA);
  const hasB = Number.isFinite(cursorB);
  const spanStart = hasA && hasB ? Math.min(cursorA, cursorB) : null;
  const spanEnd = hasA && hasB ? Math.max(cursorA, cursorB) : null;

  return (
    <div className="relative mt-2">
      {expanded && (
        <div className="absolute left-0 right-0 bottom-full mb-2 z-20 rounded-lg border border-slate-600 bg-slate-950/95 shadow-2xl shadow-black/50 overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-slate-800">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-slate-300" style={{ fontFamily: 'Orbitron, sans-serif' }}>
                Cursor Information
              </div>
              <div className="text-[10px] text-slate-500">
                C1 / C2 / C2−C1{spanStart !== null ? ' · min / max / mean in the C1–C2 window' : ''}
              </div>
            </div>
            <button
              type="button"
              onClick={() => onExpandedChange?.(false)}
              className="text-[10px] uppercase tracking-wide text-slate-400 hover:text-white"
            >
              Close
            </button>
          </div>
          <div className="max-h-[min(360px,46vh)] overflow-auto text-[11px] font-mono">
            <table className="w-full border-collapse">
              <thead className="sticky top-0 bg-slate-950">
                <tr className="text-[10px] uppercase tracking-wide text-slate-500">
                  <th className="text-left font-medium px-3 py-1.5">Channel</th>
                  <th className="text-right font-medium px-3 py-1.5" style={{ color: CURSOR_A_COLOR }}>C1</th>
                  <th className="text-right font-medium px-3 py-1.5" style={{ color: CURSOR_B_COLOR }}>C2</th>
                  <th className="text-right font-medium px-3 py-1.5 text-slate-200">C2−C1</th>
                  <th className="text-right font-medium px-3 py-1.5">Min</th>
                  <th className="text-right font-medium px-3 py-1.5">Max</th>
                  <th className="text-right font-medium px-3 py-1.5">Mean</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-slate-800">
                  <td className="px-3 py-1.5 text-slate-300">Time</td>
                  <td className="px-3 py-1.5 text-right" style={{ color: CURSOR_A_COLOR }}>{hasA ? formatChartTick(cursorA) : '—'}</td>
                  <td className="px-3 py-1.5 text-right" style={{ color: CURSOR_B_COLOR }}>{hasB ? formatChartTick(cursorB) : '—'}</td>
                  <td className="px-3 py-1.5 text-right text-slate-100">{hasA && hasB ? formatChartTick(cursorB - cursorA) : '—'}</td>
                  <td className="px-3 py-1.5 text-right text-slate-500">—</td>
                  <td className="px-3 py-1.5 text-right text-slate-500">—</td>
                  <td className="px-3 py-1.5 text-right text-slate-500">—</td>
                </tr>
                {hasA && hasB && (
                  <tr className="border-t border-slate-800/70">
                    <td className="px-3 py-1.5 text-slate-500">Time (s)</td>
                    <td className="px-3 py-1.5 text-right text-slate-400">{cursorA.toFixed(3)}</td>
                    <td className="px-3 py-1.5 text-right text-slate-400">{cursorB.toFixed(3)}</td>
                    <td className="px-3 py-1.5 text-right text-slate-200">{(cursorB - cursorA).toFixed(3)}</td>
                    <td className="px-3 py-1.5 text-right text-slate-500">—</td>
                    <td className="px-3 py-1.5 text-right text-slate-500">—</td>
                    <td className="px-3 py-1.5 text-right text-slate-500">—</td>
                  </tr>
                )}
                {chartSeries.map((series) => {
                  const samples = seriesValueLookup[series.key] || [];
                  const a = hasA ? valueAtTime(samples, cursorA) : null;
                  const b = hasB ? valueAtTime(samples, cursorB) : null;
                  const stats = spanStart !== null && !isDiscreteChannel(series.channel)
                    ? computeWindowStats(samples, spanStart, spanEnd)
                    : null;
                  return (
                    <tr key={series.key} className="border-t border-slate-800/80">
                      <td className="px-3 py-1.5 truncate" style={{ color: series.color }} title={channelLabel(series.channel, series.role)}>
                        {channelLabel(series.channel, series.role)}
                      </td>
                      <td className="px-3 py-1.5 text-right text-slate-200">{formatValue(series.channel, a)}</td>
                      <td className="px-3 py-1.5 text-right text-slate-200">{formatValue(series.channel, b)}</td>
                      <td className="px-3 py-1.5 text-right text-slate-100">{formatDelta(series.channel, a, b)}</td>
                      <td className="px-3 py-1.5 text-right text-slate-300">{stats ? formatStat(series.channel, stats.min) : '—'}</td>
                      <td className="px-3 py-1.5 text-right text-slate-300">{stats ? formatStat(series.channel, stats.max) : '—'}</td>
                      <td className="px-3 py-1.5 text-right text-slate-300">{stats ? formatStat(series.channel, stats.mean) : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!hasA && !hasB && (
              <div className="px-3 py-4 text-[11px] text-slate-500">
                Click the plot to plant C1, then click again for C2. This table fills in as soon as both are set.
              </div>
            )}
          </div>
        </div>
      )}

      <div className="rounded-lg border border-slate-800 bg-slate-950/70">
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
          <div className="ml-auto flex items-center gap-2">
            {(hasA || hasB) && (
              <button type="button" onClick={onClear} className="text-[10px] uppercase tracking-wide text-slate-400 hover:text-white">
                Clear
              </button>
            )}
            <button
              type="button"
              onClick={() => onExpandedChange?.(!expanded)}
              className={`px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide border ${
                expanded
                  ? 'bg-emerald-500/20 border-emerald-400/70 text-emerald-200'
                  : 'border-slate-600 text-slate-300 hover:text-white'
              }`}
              style={{ fontFamily: 'Orbitron, sans-serif' }}
            >
              {expanded ? 'Hide cursor info' : 'Cursor info'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}