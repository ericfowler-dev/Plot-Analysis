import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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

const OFFSET_X = 36;
const OFFSET_Y = -48;
const VIEW_PAD = 12;

const positionTooltip = (coordinate, container, boxSize) => {
  const rect = container?.getBoundingClientRect();
  const pointX = (rect?.left || 0) + (Number(coordinate?.x) || 0);
  const pointY = (rect?.top || 0) + (Number(coordinate?.y) || 0);
  const width = boxSize?.width || 320;
  const height = boxSize?.height || 220;
  const viewW = window.innerWidth;
  const viewH = window.innerHeight;

  let left = pointX + OFFSET_X;
  let top = pointY + OFFSET_Y;

  if (left + width > viewW - VIEW_PAD) left = pointX - width - OFFSET_X;
  if (left < VIEW_PAD) left = VIEW_PAD;

  const cursorInLowerHalf = rect ? (Number(coordinate?.y) || 0) > rect.height * 0.42 : false;
  if (cursorInLowerHalf || top + height > viewH - 160) {
    top = Math.max(VIEW_PAD, (rect?.top || 0) + 10);
  }
  if (top + height > viewH - VIEW_PAD) top = Math.max(VIEW_PAD, viewH - height - VIEW_PAD);
  if (top < VIEW_PAD) top = VIEW_PAD;

  return { left, top };
};

export default function ChartValueTooltip({
  active,
  label,
  payload = [],
  coordinate = null,
  chartSeries = [],
  seriesValueLookup = {},
  shouldShowFileBoundaries = false,
  cursorTime = null,
  containerRef = null
}) {
  const boxRef = useRef(null);
  const [boxSize, setBoxSize] = useState({ width: 320, height: 220 });

  const visible = active || Number.isFinite(cursorTime);

  useLayoutEffect(() => {
    if (!visible || !boxRef.current) return undefined;
    const node = boxRef.current;
    const update = () => {
      const next = { width: node.offsetWidth, height: node.offsetHeight };
      setBoxSize((prev) => (
        prev.width === next.width && prev.height === next.height ? prev : next
      ));
    };
    update();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null;
    observer?.observe(node);
    return () => observer?.disconnect();
  }, [visible, chartSeries.length, label, cursorTime]);

  if (!visible) return null;

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
  const { left, top } = positionTooltip(coordinate, containerRef?.current, boxSize);

  const body = (
    <div
      ref={boxRef}
      className="max-w-[360px] max-h-[42vh] overflow-y-auto rounded-md border border-slate-600 bg-slate-950/95 px-3 py-2 text-xs shadow-2xl"
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

  if (typeof document === 'undefined') return body;

  return createPortal(
    <div className="fixed z-[80]" style={{ left, top, pointerEvents: 'none' }}>
      {body}
    </div>,
    document.body
  );
}