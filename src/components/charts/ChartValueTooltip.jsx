import { BPLOT_PARAMETERS, VALUE_MAPPINGS, getDisplayValue, getDecimalPlaces } from '../../lib/bplotThresholds';
import { formatDuration } from '../../lib/bplotProcessData';
import { findNearestSample, formatChartTick } from '../../lib/chartResample';

const parseTooltipNumber = (value) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = parseFloat(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
};

const safeToFixed = (value, decimals, fallback = '—') => {
  if (typeof value !== 'number' || Number.isNaN(value)) return fallback;
  return value.toFixed(decimals);
};

export default function ChartValueTooltip({
  active,
  label,
  payload = [],
  chartSeries = [],
  seriesValueLookup = {},
  shouldShowFileBoundaries = false,
  cursorTime = null
}) {
  if (!active && !Number.isFinite(cursorTime)) return null;

  const numericTime = Number.isFinite(cursorTime)
    ? cursorTime
    : (typeof label === 'number' ? label : parseFloat(label));
  const hasNumericTime = Number.isFinite(numericTime);
  const payloadByKey = new Map(payload.map((entry) => [String(entry?.dataKey || ''), entry]));
  const sourceFile = payload.find((entry) => entry?.payload?._sourceFile)?.payload?._sourceFile;

  const rows = chartSeries.map((series) => {
    const fromPayload = payloadByKey.get(series.key)?.value;
    let numericValue = parseTooltipNumber(fromPayload);

    if (numericValue === null && hasNumericTime) {
      const nearestSample = findNearestSample(seriesValueLookup[series.key], numericTime);
      if (nearestSample) numericValue = nearestSample.value;
    }

    const channelName = series.channel || series.key;
    const role = series.role || null;
    const param = BPLOT_PARAMETERS[channelName];
    const decimals = getDecimalPlaces(channelName);
    const isCategorical = Boolean(VALUE_MAPPINGS[channelName]) || channelName === 'sync_state';
    const roleSuffix = role ? ` (${role === 'primary' ? 'Primary' : 'Secondary'})` : '';
    const displayLabel = param
      ? `${param.name}${param.unit ? ` (${param.unit})` : ''}${roleSuffix}`
      : `${channelName}${roleSuffix}`;

    let displayValue = '—';
    if (numericValue !== null) {
      displayValue = isCategorical
        ? getDisplayValue(channelName, Math.round(numericValue))
        : safeToFixed(numericValue, decimals);
    }

    return {
      key: series.key,
      label: displayLabel,
      value: displayValue,
      color: series.color
    };
  });

  const MAX_TOOLTIP_ROWS = 20;
  const visibleRows = rows.slice(0, MAX_TOOLTIP_ROWS);
  const hiddenCount = rows.length - visibleRows.length;

  return (
    <div
      className="max-w-[480px] max-h-[50vh] overflow-y-auto rounded-md border border-slate-700 bg-slate-900/95 px-3 py-2 text-xs shadow-xl"
      style={{ pointerEvents: 'none' }}
    >
      <div className="mb-1.5 text-sm font-semibold text-white">
        Time: {hasNumericTime ? `${formatChartTick(numericTime)} (${formatDuration(numericTime)})` : label}
        {sourceFile && shouldShowFileBoundaries ? ` | File: ${sourceFile}` : ''}
      </div>
      <div className="space-y-px">
        {visibleRows.map((row) => (
          <div key={row.key} className="flex items-center justify-between gap-4 py-0.5">
            <span className="min-w-0 flex-1 truncate flex items-center gap-2" style={{ color: row.color }}>
              <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ backgroundColor: row.color }} />
              {row.label}
            </span>
            <span className="font-mono text-white whitespace-nowrap">{row.value}</span>
          </div>
        ))}
        {hiddenCount > 0 && (
          <div className="pt-1 text-slate-500 text-center">+{hiddenCount} more channels</div>
        )}
      </div>
    </div>
  );
}
