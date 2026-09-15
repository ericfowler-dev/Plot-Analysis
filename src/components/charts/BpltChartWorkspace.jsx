import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PanelLeftClose, PanelLeftOpen, Search } from 'lucide-react';
import {
  BPLOT_PARAMETERS,
  CATEGORY_COLORS,
  CATEGORY_ORDER,
  CATEGORY_LABELS,
  getDecimalPlaces,
  getYAxisId,
  getChartThresholdLines
} from '../../lib/bplotThresholds';
import {
  MAX_CHART_CHANNELS,
  TARGET_CHART_POINTS,
  CHART_LAYOUTS,
  getTimeDomain,
  resampleForViewport,
  buildAlignedOverlayGrid,
  buildTimeSamples,
  clampDomain,
  zoomDomainAround,
  panDomain,
  resolveLayoutChannels,
  isLayoutActive,
  formatChartTick
} from '../../lib/chartResample';
import { assignChartColors, getDefaultChannelColor } from '../../lib/chartColors';
import {
  availableDerivedChannels,
  decorateRowsWithDerived,
  getDerivedChannel
} from '../../lib/chartDerived';
import {
  parseChartTime,
  isClickNotDrag,
  hitTestCursor,
  snapTimeToRows,
  nudgeTime
} from '../../lib/chartCursors';
import ChartPane from './ChartPane';
import ChartCursorTable from './ChartCursorTable';
import ChartTimeNavigator from './ChartTimeNavigator';
const AXIS_LABELS = {
  yRPM: 'RPM',
  yVolt: 'Voltage (V)',
  yPress: 'Pressure',
  yTemp: 'Temp (°F)',
  yPct: 'Percent (%)',
  yDefault: '',
  yAxisA: 'Axis A',
  yAxisB: 'Axis B',
  yAxisC: 'Axis C'
};

const isValidHexColor = (value) => /^#[0-9a-fA-F]{6}$/.test(value || '');
const normalizeColor = (value, fallback = '#3b82f6') => (
  isValidHexColor(value) ? value.toLowerCase() : fallback
);
const getSeriesColorKey = (channel, role = null) => (role ? `${channel}__${role}` : channel);

const channelDisplayName = (channel) => (
  getDerivedChannel(channel)?.name || BPLOT_PARAMETERS[channel]?.name || channel
);

export default function BpltChartWorkspace({
  normalizedData = [],
  primaryNormalized = [],
  secondaryNormalized = [],
  selectedChannels = [],
  onSelectedChannelsChange,
  channelsByCategory = {},
  overlayEnabled = false,
  automaticAlignmentOffset = 0,
  highlightedChannel = null,
  selectedAlert = null,
  activeCorrelatedRole = 'primary',
  fileBoundaries = [],
  shouldShowFileBoundaries = false
}) {
  const [channelSearch, setChannelSearch] = useState('');
  const [expandedCategories, setExpandedCategories] = useState({ engine: true, speed_control: true, derived: true });
  const [showColorControls, setShowColorControls] = useState(false);
  const [showAxisControls, setShowAxisControls] = useState(false);
  const [channelColorOverrides, setChannelColorOverrides] = useState({});
  const [axisAssignments, setAxisAssignments] = useState({});
  const [axisBounds, setAxisBounds] = useState({});
  const [channelsPanelCollapsed, setChannelsPanelCollapsed] = useState(false);
  const [refAreaLeft, setRefAreaLeft] = useState(null);
  const [refAreaRight, setRefAreaRight] = useState(null);
  const [zoomedDomain, setZoomedDomain] = useState(null);
  const [manualAlignmentOffset, setManualAlignmentOffset] = useState('0');
  const [cursorTime, setCursorTime] = useState(null);
  const [cursorA, setCursorA] = useState(null);
  const [cursorB, setCursorB] = useState(null);
  const [activeCursor, setActiveCursor] = useState('a');
  const [plotWidth, setPlotWidth] = useState(900);
  const [isPanning, setIsPanning] = useState(false);

  const zoomRafId = useRef(null);
  const pendingZoomX = useRef(null);
  const plotRef = useRef(null);
  const panRef = useRef(null);
  const pointerRef = useRef(null);
  const cursorTimeRef = useRef(null);
  const domainRef = useRef({ zoomed: null, full: null });
  const cursorARef = useRef(null);
  const cursorBRef = useRef(null);
  const activeCursorRef = useRef('a');

  const parsedManualOffset = parseFloat(manualAlignmentOffset);
  const effectiveAlignmentOffset = automaticAlignmentOffset + (
    Number.isFinite(parsedManualOffset) ? parsedManualOffset : 0
  );
  const selectedAlertTimeOffset = overlayEnabled && activeCorrelatedRole === 'secondary'
    ? effectiveAlignmentOffset
    : 0;

  const derivedSourceSet = useMemo(() => {
    const set = new Set();
    Object.values(channelsByCategory || {}).forEach((channels) => {
      (channels || []).forEach((channel) => set.add(channel));
    });
    return set;
  }, [channelsByCategory]);

  const decoratedNormalized = useMemo(
    () => decorateRowsWithDerived(normalizedData, derivedSourceSet),
    [normalizedData, derivedSourceSet]
  );
  const decoratedPrimary = useMemo(
    () => decorateRowsWithDerived(primaryNormalized, derivedSourceSet),
    [primaryNormalized, derivedSourceSet]
  );
  const decoratedSecondary = useMemo(
    () => decorateRowsWithDerived(secondaryNormalized, derivedSourceSet),
    [secondaryNormalized, derivedSourceSet]
  );

  const sourceCount = overlayEnabled
    ? (decoratedPrimary.length + decoratedSecondary.length)
    : decoratedNormalized.length;

  const fullDomain = useMemo(() => {
    if (overlayEnabled) {
      const primaryDomain = getTimeDomain(decoratedPrimary);
      const secondaryDomain = getTimeDomain(decoratedSecondary);
      if (!primaryDomain && !secondaryDomain) return null;
      const secondaryShifted = secondaryDomain
        ? [secondaryDomain[0] + effectiveAlignmentOffset, secondaryDomain[1] + effectiveAlignmentOffset]
        : null;
      const start = Math.min(
        primaryDomain?.[0] ?? Infinity,
        secondaryShifted?.[0] ?? Infinity
      );
      const end = Math.max(
        primaryDomain?.[1] ?? -Infinity,
        secondaryShifted?.[1] ?? -Infinity
      );
      if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
      return [start, end];
    }
    return getTimeDomain(decoratedNormalized);
  }, [overlayEnabled, decoratedPrimary, decoratedSecondary, decoratedNormalized, effectiveAlignmentOffset]);

  const targetPoints = Math.max(400, Math.min(TARGET_CHART_POINTS, Math.round(plotWidth || 900)));
  const windowDomain = zoomedDomain || fullDomain;
  const windowStart = windowDomain?.[0];
  const windowEnd = windowDomain?.[1];

  const chartRenderData = useMemo(() => {
    if (overlayEnabled) {
      return buildAlignedOverlayGrid({
        primaryRows: decoratedPrimary,
        secondaryRows: decoratedSecondary,
        offsetSec: effectiveAlignmentOffset,
        channels: selectedChannels,
        startTime: windowStart,
        endTime: windowEnd,
        targetPoints
      });
    }
    return resampleForViewport(decoratedNormalized, {
      startTime: windowStart,
      endTime: windowEnd,
      targetPoints,
      channels: selectedChannels
    });
  }, [
    overlayEnabled,
    decoratedPrimary,
    decoratedSecondary,
    effectiveAlignmentOffset,
    selectedChannels,
    decoratedNormalized,
    windowStart,
    windowEnd,
    targetPoints
  ]);

  const chartAxes = useMemo(() => {
    const unitGroups = {};
    selectedChannels.forEach((channel) => {
      const axisId = axisAssignments[channel] || getYAxisId(channel);
      if (!unitGroups[axisId]) unitGroups[axisId] = [];
      unitGroups[axisId].push(channel);
    });

    const axes = Object.keys(unitGroups).map((axisId, index) => {
      const min = parseFloat(axisBounds[axisId]?.min);
      const max = parseFloat(axisBounds[axisId]?.max);
      const hasValidRange = !Number.isFinite(min) || !Number.isFinite(max) || min < max;
      return {
        id: axisId,
        label: AXIS_LABELS[axisId] || '',
        orientation: index % 2 === 0 ? 'left' : 'right',
        channels: unitGroups[axisId],
        decimals: getDecimalPlaces(unitGroups[axisId][0]),
        domain: [
          hasValidRange && Number.isFinite(min) ? min : 'auto',
          hasValidRange && Number.isFinite(max) ? max : 'auto'
        ]
      };
    });

    return {
      axes,
      channelToAxis: selectedChannels.reduce((acc, channel) => {
        acc[channel] = axisAssignments[channel] || getYAxisId(channel);
        return acc;
      }, {})
    };
  }, [selectedChannels, axisAssignments, axisBounds]);

  const defaultPrimaryColors = useMemo(
    () => assignChartColors(selectedChannels),
    [selectedChannels]
  );
  const defaultSecondaryColors = useMemo(
    () => assignChartColors(selectedChannels, { role: 'secondary' }),
    [selectedChannels]
  );

  const getDefaultSeriesColor = (channel, role = null) => {
    if (role === 'secondary') {
      return defaultSecondaryColors[channel] || getDefaultChannelColor(channel, 'secondary', selectedChannels);
    }
    return defaultPrimaryColors[channel] || getDefaultChannelColor(channel, null, selectedChannels);
  };

  const resolveSeriesColor = (channel, role = null) => {
    const effectiveRole = overlayEnabled ? role : null;
    const colorKey = getSeriesColorKey(channel, effectiveRole);
    const fallback = getDefaultSeriesColor(channel, effectiveRole);
    return normalizeColor(channelColorOverrides[colorKey] || fallback, fallback);
  };

  const chartSeries = useMemo(() => {
    if (overlayEnabled) {
      return selectedChannels.flatMap((channel) => {
        const channelLabel = channelDisplayName(channel);
        return [
          {
            key: `${channel}__primary`,
            channel,
            role: 'primary',
            name: `${channelLabel} (Primary)`,
            color: resolveSeriesColor(channel, 'primary'),
            strokeDasharray: undefined
          },
          {
            key: `${channel}__secondary`,
            channel,
            role: 'secondary',
            name: `${channelLabel} (Secondary)`,
            color: resolveSeriesColor(channel, 'secondary'),
            strokeDasharray: '7 3'
          }
        ];
      });
    }

    return selectedChannels.map((channel) => ({
      key: channel,
      channel,
      role: null,
      name: channelDisplayName(channel),
      color: resolveSeriesColor(channel),
      strokeDasharray: undefined
    }));
  }, [selectedChannels, overlayEnabled, channelColorOverrides, defaultPrimaryColors, defaultSecondaryColors]);

  const colorControlEntries = useMemo(() => {
    if (overlayEnabled) {
      return selectedChannels.flatMap((channel) => {
        const label = channelDisplayName(channel);
        return [
          {
            key: getSeriesColorKey(channel, 'primary'),
            label: `${label} (Primary)`,
            fallback: getDefaultSeriesColor(channel, 'primary')
          },
          {
            key: getSeriesColorKey(channel, 'secondary'),
            label: `${label} (Secondary)`,
            fallback: getDefaultSeriesColor(channel, 'secondary')
          }
        ];
      });
    }

    return selectedChannels.map((channel) => ({
      key: getSeriesColorKey(channel),
      label: channelDisplayName(channel),
      fallback: getDefaultSeriesColor(channel)
    }));
  }, [selectedChannels, overlayEnabled, defaultPrimaryColors, defaultSecondaryColors]);
  const seriesValueLookup = useMemo(() => {
    const lookup = {};
    chartSeries.forEach((series) => {
      lookup[series.key] = buildTimeSamples(chartRenderData, series.key);
    });
    return lookup;
  }, [chartSeries, chartRenderData]);

  const thresholdLines = useMemo(() => {
    const lines = [];
    selectedChannels.forEach((channel) => {
      getChartThresholdLines(channel).forEach((line, index) => {
        lines.push({
          ...line,
          id: `${channel}-${line.level}-${index}`,
          channel,
          yAxisId: chartAxes.channelToAxis[channel]
        });
      });
    });
    return lines;
  }, [selectedChannels, chartAxes]);

  const orderedCategories = useMemo(() => {
    const result = {};
    for (const category of CATEGORY_ORDER) {
      if (channelsByCategory[category]?.length) result[category] = channelsByCategory[category];
    }
    for (const [category, channels] of Object.entries(channelsByCategory)) {
      if (!result[category] && channels.length > 0) result[category] = channels;
    }
    const derived = availableDerivedChannels(derivedSourceSet).map((item) => item.id);
    if (derived.length) result.derived = derived;
    return result;
  }, [channelsByCategory, derivedSourceSet]);

  const availableChannelSet = useMemo(() => {
    const set = new Set();
    Object.values(orderedCategories).forEach((channels) => {
      channels.forEach((channel) => set.add(channel));
    });
    return set;
  }, [orderedCategories]);

  const searchNeedle = channelSearch.trim().toLowerCase();
  const filteredCategories = useMemo(() => {
    if (!searchNeedle) return orderedCategories;
    const result = {};
    Object.entries(orderedCategories).forEach(([category, channels]) => {
      const matched = channels.filter((channel) => {
        const name = channelDisplayName(channel).toLowerCase();
        return channel.toLowerCase().includes(searchNeedle) || name.includes(searchNeedle);
      });
      if (matched.length) result[category] = matched;
    });
    return result;
  }, [orderedCategories, searchNeedle]);

  useEffect(() => {
    cursorTimeRef.current = cursorTime;
  }, [cursorTime]);

  useEffect(() => {
    cursorARef.current = cursorA;
    cursorBRef.current = cursorB;
    activeCursorRef.current = activeCursor;
  }, [cursorA, cursorB, activeCursor]);

  useEffect(() => {
    domainRef.current = { zoomed: zoomedDomain, full: fullDomain };
  }, [zoomedDomain, fullDomain]);

  useEffect(() => () => {
    if (zoomRafId.current) cancelAnimationFrame(zoomRafId.current);
  }, []);

  useEffect(() => {
    const node = plotRef.current;
    if (!node || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect?.width;
      if (width) setPlotWidth(width);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const node = plotRef.current;
    if (!node) return undefined;
    const onWheel = (event) => {
      event.preventDefault();
      const { zoomed, full } = domainRef.current;
      const current = zoomed || full;
      if (!current || !full) return;
      const factor = event.deltaY > 0 ? 1.18 : 1 / 1.18;
      setZoomedDomain(zoomDomainAround(current, full, cursorTimeRef.current, factor));
    };
    node.addEventListener('wheel', onWheel, { passive: false });
    return () => node.removeEventListener('wheel', onWheel);
  }, []);

  const updateSeriesColor = (entry, nextColor) => {
    const normalized = normalizeColor(nextColor, entry.fallback);
    setChannelColorOverrides((prev) => {
      const next = { ...prev };
      if (normalized === entry.fallback) delete next[entry.key];
      else next[entry.key] = normalized;
      return next;
    });
  };

  const plantCursor = useCallback((which, time) => {
    const snapped = snapTimeToRows(chartRenderData, time);
    if (!Number.isFinite(snapped)) return;
    if (which === 'b') {
      setCursorB(snapped);
      setActiveCursor('b');
    } else {
      setCursorA(snapped);
      setActiveCursor('a');
    }
  }, [chartRenderData]);

  const clearCursors = useCallback(() => {
    setCursorA(null);
    setCursorB(null);
  }, []);

  const handleZoomMouseDown = (event) => {
    const native = event?.nativeEvent;
    const time = parseChartTime(event?.activeLabel);
    const domain = zoomedDomain || fullDomain;

    if (Number.isFinite(time) && domain) {
      if (hitTestCursor(time, cursorA, domain, plotWidth)) {
        pointerRef.current = { draggingCursor: 'a' };
        return;
      }
      if (hitTestCursor(time, cursorB, domain, plotWidth)) {
        pointerRef.current = { draggingCursor: 'b' };
        return;
      }
    }

    if (native?.shiftKey || native?.button === 1) {
      if (!domain) return;
      panRef.current = { x: event.chartX || 0, domain };
      setIsPanning(true);
      return;
    }

    pointerRef.current = {
      start: time,
      end: time,
      altKey: Boolean(native?.altKey || native?.ctrlKey || native?.metaKey),
      button: native?.button ?? 0
    };
    if (event && event.activeLabel !== undefined) {
      setRefAreaLeft(event.activeLabel);
      setRefAreaRight(null);
    }
  };

  const handleZoomMouseMove = useCallback((event) => {
    const nextTime = parseChartTime(event?.activeLabel);
    if (Number.isFinite(nextTime)) {
      setCursorTime(nextTime);
      if (pointerRef.current && !pointerRef.current.draggingCursor) {
        pointerRef.current.end = nextTime;
      }
    }

    if (pointerRef.current?.draggingCursor && Number.isFinite(nextTime)) {
      const snapped = snapTimeToRows(chartRenderData, nextTime);
      if (pointerRef.current.draggingCursor === 'b') setCursorB(snapped);
      else setCursorA(snapped);
      return;
    }

    if (panRef.current && fullDomain) {
      const width = plotWidth || 1;
      const { x, domain } = panRef.current;
      const nextX = event.chartX ?? x;
      const span = domain[1] - domain[0];
      const deltaSec = ((x - nextX) / width) * span;
      const nextDomain = panDomain(domain, fullDomain, deltaSec);
      panRef.current = { x: nextX, domain: nextDomain };
      setZoomedDomain(nextDomain);
      return;
    }

    if (refAreaLeft === null || event?.activeLabel === undefined) return;
    const nextX = event.activeLabel;
    if (pendingZoomX.current === nextX) return;
    pendingZoomX.current = nextX;
    if (!zoomRafId.current) {
      zoomRafId.current = requestAnimationFrame(() => {
        setRefAreaRight(pendingZoomX.current);
        zoomRafId.current = null;
      });
    }
  }, [fullDomain, plotWidth, refAreaLeft, chartRenderData]);

  const finishPointer = useCallback((plant) => {
    if (pointerRef.current?.draggingCursor) {
      pointerRef.current = null;
      return;
    }
    if (panRef.current) {
      panRef.current = null;
      setIsPanning(false);
      pointerRef.current = null;
      return;
    }

    const start = parseChartTime(pointerRef.current?.start ?? refAreaLeft);
    const end = parseChartTime(pointerRef.current?.end ?? refAreaRight ?? start);
    if (plant && isClickNotDrag(start, end)) {
      const forceB = pointerRef.current?.altKey || pointerRef.current?.button === 2;
      const which = forceB
        ? 'b'
        : (Number.isFinite(cursorARef.current) && !Number.isFinite(cursorBRef.current) ? 'b' : activeCursorRef.current);
      plantCursor(which === 'b' ? 'b' : 'a', start);
    } else if (Number.isFinite(start) && Number.isFinite(end) && Math.abs(end - start) > 0.01 && fullDomain) {
      setZoomedDomain(clampDomain([Math.min(start, end), Math.max(start, end)], fullDomain));
    }

    if (zoomRafId.current) {
      cancelAnimationFrame(zoomRafId.current);
      zoomRafId.current = null;
    }
    pendingZoomX.current = null;
    pointerRef.current = null;
    setRefAreaLeft(null);
    setRefAreaRight(null);
  }, [refAreaLeft, refAreaRight, fullDomain, plantCursor]);

  const handleZoomMouseUp = () => finishPointer(true);
  const handlePointerLeave = () => finishPointer(false);

  const handleResetZoom = () => setZoomedDomain(null);

  useEffect(() => {
    const node = plotRef.current;
    if (!node) return undefined;
    const onContextMenu = (event) => event.preventDefault();
    node.addEventListener('contextmenu', onContextMenu);
    return () => node.removeEventListener('contextmenu', onContextMenu);
  }, []);

  useEffect(() => {
    const onKey = (event) => {
      if (event.target && ['INPUT', 'SELECT', 'TEXTAREA'].includes(event.target.tagName)) return;
      if (event.key === 'Escape') {
        clearCursors();
        return;
      }
      if (event.key === '1' && Number.isFinite(cursorTimeRef.current)) {
        plantCursor('a', cursorTimeRef.current);
      }
      if (event.key === '2' && Number.isFinite(cursorTimeRef.current)) {
        plantCursor('b', cursorTimeRef.current);
      }
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
        const which = activeCursorRef.current;
        const current = which === 'b' ? cursorBRef.current : cursorARef.current;
        if (!Number.isFinite(current)) return;
        const next = nudgeTime(chartRenderData, current, event.key === 'ArrowLeft' ? -1 : 1);
        if (which === 'b') setCursorB(next);
        else setCursorA(next);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [chartRenderData, plantCursor, clearCursors]);

  useEffect(() => {
    if (!selectedAlert) return;
    const start = Number(selectedAlert.startTime) + selectedAlertTimeOffset;
    const end = Number(selectedAlert.endTime) + selectedAlertTimeOffset;
    if (Number.isFinite(start)) setCursorA(start);
    if (Number.isFinite(end)) setCursorB(end);
  }, [selectedAlert, selectedAlertTimeOffset]);

  const toggleChannel = (channel) => {
    if (!onSelectedChannelsChange) return;
    onSelectedChannelsChange((prev) => {
      if (prev.includes(channel)) return prev.filter((item) => item !== channel);
      if (prev.length >= MAX_CHART_CHANNELS) return prev;
      return [...prev, channel];
    });
  };

  const applyLayout = (layout) => {
    const next = resolveLayoutChannels(layout.channels, availableChannelSet);
    if (next.length && onSelectedChannelsChange) onSelectedChannelsChange(next);
  };

  const xDomain = zoomedDomain || ['dataMin', 'dataMax'];

  return (
    <div className="flex flex-col lg:flex-row gap-4 lg:h-[calc(100vh-280px)] min-h-[500px]">
      {channelsPanelCollapsed ? (
        <button
          onClick={() => setChannelsPanelCollapsed(false)}
          className="hidden lg:flex flex-col items-center justify-center w-10 bg-slate-900/80 border border-slate-800 rounded-xl flex-shrink-0 hover:bg-slate-800/80 transition-colors group"
          title="Expand channels panel"
        >
          <PanelLeftOpen className="w-4 h-4 text-slate-400 group-hover:text-white mb-2" />
          <span
            className="text-[10px] text-slate-400 group-hover:text-white uppercase tracking-widest font-bold"
            style={{ writingMode: 'vertical-rl', textOrientation: 'mixed' }}
          >
            Channels
          </span>
        </button>
      ) : (
        <aside className="w-full lg:w-64 lg:max-h-none bg-slate-900/80 border border-slate-800 rounded-xl overflow-y-auto flex-shrink-0 transition-all">
          <div className="p-4 border-b border-slate-700 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-slate-300">
                Channels ({selectedChannels.length}/{MAX_CHART_CHANNELS})
              </h3>
              <div className="flex items-center gap-2">
                {selectedChannels.length > 0 && (
                  <button
                    onClick={() => onSelectedChannelsChange?.([])}
                    className="text-xs text-slate-400 hover:text-red-400 transition-colors"
                  >
                    Clear
                  </button>
                )}
                <button
                  onClick={() => setChannelsPanelCollapsed(true)}
                  className="hidden lg:flex text-slate-400 hover:text-white transition-colors"
                  title="Collapse channels panel"
                >
                  <PanelLeftClose className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" />
              <input
                value={channelSearch}
                onChange={(event) => setChannelSearch(event.target.value)}
                placeholder="Search channels"
                className="w-full rounded border border-slate-700 bg-slate-950 py-1.5 pl-8 pr-2 text-xs text-slate-200 placeholder:text-slate-500"
              />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {CHART_LAYOUTS.map((layout) => {
                const enabled = resolveLayoutChannels(layout.channels, availableChannelSet).length > 0;
                const active = enabled && isLayoutActive(layout.channels, selectedChannels, availableChannelSet);
                return (
                  <button
                    key={layout.id}
                    type="button"
                    disabled={!enabled}
                    onClick={() => applyLayout(layout)}
                    className={`px-2 py-1 text-[10px] font-bold uppercase tracking-wide border ${
                      active
                        ? 'border-emerald-400 bg-emerald-500/20 text-emerald-200'
                        : enabled
                          ? 'border-slate-600 text-slate-300 hover:text-white hover:border-emerald-400/60'
                          : 'border-slate-800 text-slate-600'
                    }`}
                    style={{ fontFamily: 'Orbitron, sans-serif' }}
                  >
                    {layout.label}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="py-2">
            {Object.entries(filteredCategories).map(([category, channels]) => (
              <div key={category} className="border-b border-slate-800/50">
                <div
                  className="px-4 py-3 text-xs text-slate-400 uppercase tracking-wider cursor-pointer hover:bg-slate-800/30 flex justify-between items-center"
                  onClick={() => setExpandedCategories((prev) => ({ ...prev, [category]: !prev[category] }))}
                >
                  <span className="flex items-center gap-2">
                    <div
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: CATEGORY_COLORS[category] || '#6b7280' }}
                    />
                    {CATEGORY_LABELS[category] || category}
                  </span>
                  <span>{expandedCategories[category] || searchNeedle ? '▾' : '▸'}</span>
                </div>
                {(expandedCategories[category] || searchNeedle) && (
                  <div className="pb-2">
                    {channels.map((channel) => (
                      <label
                        key={channel}
                        className="flex items-center gap-3 px-5 py-2 text-sm text-slate-200 hover:bg-slate-800/40 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={selectedChannels.includes(channel)}
                          onChange={() => toggleChannel(channel)}
                          disabled={!selectedChannels.includes(channel) && selectedChannels.length >= MAX_CHART_CHANNELS}
                          className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-green-500 focus:ring-green-500 focus:ring-offset-slate-900"
                        />
                        <span className={selectedChannels.includes(channel) ? 'text-white' : ''}>
                          {channelDisplayName(channel)}
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </aside>
      )}

      <div className="flex-1 min-h-[300px] bg-slate-900/50 border border-slate-800 rounded-xl p-4 lg:p-6 flex flex-col">
        <div className="mb-3 rounded-lg border border-slate-700/70 bg-slate-900/60 p-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs text-slate-400">
              <span className="uppercase tracking-wider">Chart Appearance</span>
              <span
                className="ml-3 font-mono text-slate-500"
                title="Zoomed-out views draw a min/max envelope so spikes survive. Zoom in far enough and every raw sample is drawn."
              >
                {chartRenderData.length >= sourceCount
                  ? `All ${sourceCount.toLocaleString()} samples`
                  : `Envelope ${chartRenderData.length.toLocaleString()} of ${sourceCount.toLocaleString()} samples`}
                {zoomedDomain ? ` · window ${formatChartTick(zoomedDomain[1] - zoomedDomain[0])}` : ''}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => setShowColorControls((prev) => !prev)}
                className={`px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide border transition-colors ${
                  showColorControls
                    ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-300'
                    : 'bg-slate-800/60 border-slate-700 text-slate-400 hover:text-white'
                }`}
                style={{ fontFamily: 'Orbitron, sans-serif' }}
              >
                {showColorControls ? 'Hide Colors' : 'Colors'}
              </button>
              <button
                onClick={() => setShowAxisControls((prev) => !prev)}
                className={`px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide border transition-colors ${
                  showAxisControls
                    ? 'bg-violet-500/20 border-violet-500/50 text-violet-300'
                    : 'bg-slate-800/60 border-slate-700 text-slate-400 hover:text-white'
                }`}
                style={{ fontFamily: 'Orbitron, sans-serif' }}
              >
                {showAxisControls ? 'Hide Axes' : 'Axes'}
              </button>
              {zoomedDomain && (
                <button
                  onClick={handleResetZoom}
                  className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide border bg-emerald-500/20 border-emerald-500/50 text-emerald-300 hover:bg-emerald-500/30 transition-colors"
                  style={{ fontFamily: 'Orbitron, sans-serif' }}
                >
                  Reset Zoom
                </button>
              )}
              {Object.keys(channelColorOverrides).length > 0 && (
                <button
                  onClick={() => setChannelColorOverrides({})}
                  className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide border bg-slate-800/60 border-slate-700 text-slate-400 hover:text-white"
                  style={{ fontFamily: 'Orbitron, sans-serif' }}
                >
                  Reset Colors
                </button>
              )}
              {(Object.keys(axisAssignments).length > 0 || Object.keys(axisBounds).length > 0) && (
                <button
                  onClick={() => {
                    setAxisAssignments({});
                    setAxisBounds({});
                  }}
                  className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide border bg-slate-800/60 border-slate-700 text-slate-400 hover:text-white"
                  style={{ fontFamily: 'Orbitron, sans-serif' }}
                >
                  Reset Axes
                </button>
              )}
            </div>
          </div>
          <div className="mt-2 text-[10px] text-slate-500">
            Drag to zoom · Click C1, then click C2 · Or press C1/C2 then click · Shift-drag pan · Scroll zoom
          </div>
          {overlayEnabled && (
            <div className="mt-3 flex flex-wrap items-center gap-3 rounded border border-cyan-500/20 bg-cyan-500/5 px-3 py-2">
              <span className="text-[11px] text-cyan-200">
                Secondary shift: {effectiveAlignmentOffset >= 0 ? '+' : ''}{effectiveAlignmentOffset.toFixed(1)}s
              </span>
              <span className="text-[10px] text-slate-400">
                Auto {automaticAlignmentOffset >= 0 ? '+' : ''}{automaticAlignmentOffset.toFixed(1)}s
              </span>
              <label className="flex items-center gap-2 text-[10px] uppercase tracking-wide text-slate-400">
                Manual adjustment
                <input
                  type="number"
                  step="0.1"
                  value={manualAlignmentOffset}
                  onChange={(event) => setManualAlignmentOffset(event.target.value)}
                  className="w-20 rounded border border-slate-600 bg-slate-950 px-2 py-1 text-right font-mono text-slate-100"
                  aria-label="Manual secondary timeline adjustment in seconds"
                />
                sec
              </label>
              <button
                type="button"
                onClick={() => setManualAlignmentOffset('0')}
                className="text-[10px] uppercase tracking-wide text-slate-400 hover:text-white"
              >
                Reset
              </button>
            </div>
          )}
          {showColorControls && colorControlEntries.length > 0 && (
            <div className="mt-3 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
              {colorControlEntries.map((entry) => {
                const selectedColor = normalizeColor(
                  channelColorOverrides[entry.key] || entry.fallback,
                  entry.fallback
                );
                const canResetColor = selectedColor !== entry.fallback;
                return (
                  <div key={`color-${entry.key}`} className="flex items-center justify-between gap-3 rounded border border-slate-700/60 bg-slate-800/30 px-2.5 py-1.5">
                    <span className="text-[11px] text-slate-200 truncate" title={entry.label}>{entry.label}</span>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={selectedColor}
                        onChange={(event) => updateSeriesColor(entry, event.target.value)}
                        className="h-6 w-10 border border-slate-600 rounded bg-transparent cursor-pointer"
                        title={`Set ${entry.label} color`}
                      />
                      <button
                        type="button"
                        onClick={() => updateSeriesColor(entry, entry.fallback)}
                        disabled={!canResetColor}
                        className={`text-[10px] uppercase tracking-wide ${
                          canResetColor ? 'text-slate-300 hover:text-white' : 'text-slate-600'
                        }`}
                      >
                        Default
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {showAxisControls && selectedChannels.length > 0 && (
            <div className="mt-3 space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
                {selectedChannels.map((channel) => {
                  const automaticAxis = getYAxisId(channel);
                  const selectedAxis = axisAssignments[channel] || automaticAxis;
                  return (
                    <label key={`axis-${channel}`} className="flex items-center justify-between gap-2 rounded border border-slate-700/60 bg-slate-800/30 px-2.5 py-1.5">
                      <span className="text-[11px] text-slate-200 truncate" title={channelDisplayName(channel)}>
                        {channelDisplayName(channel)}
                      </span>
                      <select
                        value={selectedAxis}
                        onChange={(event) => {
                          const nextAxis = event.target.value;
                          setAxisAssignments((previous) => {
                            const next = { ...previous };
                            if (nextAxis === automaticAxis) delete next[channel];
                            else next[channel] = nextAxis;
                            return next;
                          });
                        }}
                        className="max-w-[130px] rounded border border-slate-600 bg-slate-950 px-1.5 py-1 text-[10px] text-slate-200"
                      >
                        <option value={automaticAxis}>Auto ({automaticAxis.replace(/^y/, '')})</option>
                        <option value="yRPM">RPM</option>
                        <option value="yVolt">Voltage</option>
                        <option value="yPress">Pressure</option>
                        <option value="yTemp">Temperature</option>
                        <option value="yPct">Percent</option>
                        <option value="yDefault">Generic</option>
                        <option value="yAxisA">Manual A</option>
                        <option value="yAxisB">Manual B</option>
                        <option value="yAxisC">Manual C</option>
                      </select>
                    </label>
                  );
                })}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
                {chartAxes.axes.map((axis) => (
                  <div key={`bounds-${axis.id}`} className="flex items-center gap-2 rounded border border-slate-700/60 bg-slate-950/40 px-2.5 py-1.5">
                    <span className="min-w-[64px] text-[10px] uppercase tracking-wide text-slate-400">{axis.label || axis.id}</span>
                    <input
                      type="number"
                      placeholder="Auto min"
                      value={axisBounds[axis.id]?.min || ''}
                      onChange={(event) => setAxisBounds((previous) => ({
                        ...previous,
                        [axis.id]: { ...previous[axis.id], min: event.target.value }
                      }))}
                      className="min-w-0 w-full rounded border border-slate-700 bg-slate-900 px-1.5 py-1 text-[10px] font-mono text-slate-100"
                    />
                    <input
                      type="number"
                      placeholder="Auto max"
                      value={axisBounds[axis.id]?.max || ''}
                      onChange={(event) => setAxisBounds((previous) => ({
                        ...previous,
                        [axis.id]: { ...previous[axis.id], min: previous[axis.id]?.min, max: event.target.value }
                      }))}
                      className="min-w-0 w-full rounded border border-slate-700 bg-slate-900 px-1.5 py-1 text-[10px] font-mono text-slate-100"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex-1 min-h-0 flex flex-col">
          <div
            ref={plotRef}
            className={`flex-1 min-h-[300px] ${isPanning ? 'cursor-grabbing' : 'cursor-crosshair'}`}
            onDoubleClick={handleResetZoom}
            onMouseLeave={handlePointerLeave}
          >
            {selectedChannels.length === 0 ? (
              <div className="h-full flex items-center justify-center text-sm text-slate-500">
                Select a channel or a layout preset to plot.
              </div>
            ) : (
              <ChartPane
                pane={{ id: 'main', channels: selectedChannels, flex: 1 }}
                data={chartRenderData}
                series={chartSeries}
                axes={chartAxes.axes}
                channelToAxis={chartAxes.channelToAxis}
                xDomain={xDomain}
                zoomedDomain={zoomedDomain}
                showXAxis
                cursorTime={cursorTime}
                cursorA={cursorA}
                cursorB={cursorB}
                refAreaLeft={refAreaLeft}
                refAreaRight={refAreaRight}
                thresholdLines={thresholdLines}
                fileBoundaries={fileBoundaries}
                shouldShowFileBoundaries={shouldShowFileBoundaries}
                selectedAlert={selectedAlert}
                selectedAlertTimeOffset={selectedAlertTimeOffset}
                highlightedChannel={highlightedChannel}
                seriesValueLookup={seriesValueLookup}
                onMouseDown={handleZoomMouseDown}
                onMouseMove={handleZoomMouseMove}
                onMouseUp={handleZoomMouseUp}
              />
            )}
          </div>
          <ChartTimeNavigator
            rows={overlayEnabled ? decoratedPrimary : decoratedNormalized}
            channels={selectedChannels}
            fullDomain={fullDomain}
            windowDomain={windowDomain}
            onWindowChange={(next) => setZoomedDomain(clampDomain(next, fullDomain))}
          />
          {selectedChannels.length > 0 && (
            <ChartCursorTable
              chartSeries={chartSeries}
              seriesValueLookup={seriesValueLookup}
              cursorA={cursorA}
              cursorB={cursorB}
              activeCursor={activeCursor}
              onActiveCursorChange={setActiveCursor}
              onClear={clearCursors}
            />
          )}
        </div>
      </div>
    </div>
  );
}
