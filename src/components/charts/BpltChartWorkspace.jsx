import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, LineChart, Line, ReferenceLine, ReferenceArea
} from 'recharts';
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
import { formatDuration } from '../../lib/bplotProcessData';
import {
  MAX_CHART_CHANNELS,
  TARGET_CHART_POINTS,
  CHART_LAYOUTS,
  isDiscreteChannel,
  getTimeDomain,
  resampleForViewport,
  buildAlignedOverlayGrid,
  buildTimeSamples,
  clampDomain,
  zoomDomainAround,
  panDomain,
  resolveLayoutChannels,
  formatChartTick
} from '../../lib/chartResample';
import ChartErrorBoundary from './ChartErrorBoundary';
import ChartValueTooltip from './ChartValueTooltip';

const DEFAULT_CHART_PALETTE = [
  '#38bdf8', '#22c55e', '#a78bfa', '#14b8a6', '#60a5fa',
  '#2dd4bf', '#818cf8', '#84cc16', '#06b6d4', '#34d399',
  '#7dd3fc', '#4ade80', '#67e8f9', '#86efac', '#c4b5fd'
];
const DEFAULT_SECONDARY_CHART_PALETTE = [
  '#f97316', '#ef4444', '#f43f5e', '#eab308', '#ec4899',
  '#f59e0b', '#fb7185', '#f472b6', '#fbbf24', '#fb923c',
  '#fda4af', '#facc15', '#e879f9', '#fca5a1', '#d946ef'
];

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
const normalizeColor = (value, fallback = '#38bdf8') => (
  isValidHexColor(value) ? value.toLowerCase() : fallback
);
const getSeriesColorKey = (channel, role = null) => (role ? `${channel}__${role}` : channel);

const getSeverityLabel = (severity, category) => {
  if (category === 'signal_quality') return 'Sensor';
  if (severity === 'critical') return 'Critical';
  if (severity === 'info') return 'Info';
  return 'Warning';
};

const getAlertDisplayName = (alert) => {
  const fallback = alert?.channel || 'Anomaly';
  if (!alert?.name) return fallback;
  const cleaned = alert.name.replace(/^\s*(critical|warning|info)\s*[:-]?\s*/i, '').trim();
  return cleaned || fallback;
};

const safeToFixed = (value, decimals, fallback = '') => {
  if (typeof value !== 'number' || Number.isNaN(value)) return fallback;
  return value.toFixed(decimals);
};

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
  const [expandedCategories, setExpandedCategories] = useState({ engine: true, speed_control: true });
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
  const [plotWidth, setPlotWidth] = useState(900);
  const [isPanning, setIsPanning] = useState(false);

  const zoomRafId = useRef(null);
  const pendingZoomX = useRef(null);
  const plotRef = useRef(null);
  const panRef = useRef(null);
  const cursorTimeRef = useRef(null);
  const domainRef = useRef({ zoomed: null, full: null });

  const parsedManualOffset = parseFloat(manualAlignmentOffset);
  const effectiveAlignmentOffset = automaticAlignmentOffset + (
    Number.isFinite(parsedManualOffset) ? parsedManualOffset : 0
  );
  const selectedAlertTimeOffset = overlayEnabled && activeCorrelatedRole === 'secondary'
    ? effectiveAlignmentOffset
    : 0;

  const sourceCount = overlayEnabled
    ? (primaryNormalized.length + secondaryNormalized.length)
    : normalizedData.length;

  const fullDomain = useMemo(() => {
    if (overlayEnabled) {
      const primaryDomain = getTimeDomain(primaryNormalized);
      const secondaryDomain = getTimeDomain(secondaryNormalized);
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
    return getTimeDomain(normalizedData);
  }, [overlayEnabled, primaryNormalized, secondaryNormalized, normalizedData, effectiveAlignmentOffset]);

  const targetPoints = Math.max(400, Math.min(TARGET_CHART_POINTS, Math.round(plotWidth || 900)));
  const windowDomain = zoomedDomain || fullDomain;
  const windowStart = windowDomain?.[0];
  const windowEnd = windowDomain?.[1];

  const chartRenderData = useMemo(() => {
    if (overlayEnabled) {
      return buildAlignedOverlayGrid({
        primaryRows: primaryNormalized,
        secondaryRows: secondaryNormalized,
        offsetSec: effectiveAlignmentOffset,
        channels: selectedChannels,
        startTime: windowStart,
        endTime: windowEnd,
        targetPoints
      });
    }
    return resampleForViewport(normalizedData, {
      startTime: windowStart,
      endTime: windowEnd,
      targetPoints,
      channels: selectedChannels
    });
  }, [
    overlayEnabled,
    primaryNormalized,
    secondaryNormalized,
    effectiveAlignmentOffset,
    selectedChannels,
    normalizedData,
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

  const getDefaultSeriesColor = (channelIndex, role = null) => {
    if (role === 'secondary') {
      return DEFAULT_SECONDARY_CHART_PALETTE[channelIndex % DEFAULT_SECONDARY_CHART_PALETTE.length];
    }
    return DEFAULT_CHART_PALETTE[channelIndex % DEFAULT_CHART_PALETTE.length];
  };

  const resolveSeriesColor = (channel, channelIndex, role = null) => {
    const effectiveRole = overlayEnabled ? role : null;
    const colorKey = getSeriesColorKey(channel, effectiveRole);
    const fallback = getDefaultSeriesColor(channelIndex, effectiveRole);
    return normalizeColor(channelColorOverrides[colorKey] || fallback, fallback);
  };

  const chartSeries = useMemo(() => {
    if (overlayEnabled) {
      return selectedChannels.flatMap((channel, channelIndex) => {
        const channelLabel = BPLOT_PARAMETERS[channel]?.name || channel;
        return [
          {
            key: `${channel}__primary`,
            channel,
            role: 'primary',
            name: `${channelLabel} (Primary)`,
            color: resolveSeriesColor(channel, channelIndex, 'primary'),
            strokeDasharray: undefined
          },
          {
            key: `${channel}__secondary`,
            channel,
            role: 'secondary',
            name: `${channelLabel} (Secondary)`,
            color: resolveSeriesColor(channel, channelIndex, 'secondary'),
            strokeDasharray: '7 3'
          }
        ];
      });
    }

    return selectedChannels.map((channel, channelIndex) => ({
      key: channel,
      channel,
      role: null,
      name: BPLOT_PARAMETERS[channel]?.name || channel,
      color: resolveSeriesColor(channel, channelIndex),
      strokeDasharray: undefined
    }));
  }, [selectedChannels, overlayEnabled, channelColorOverrides]);

  const colorControlEntries = useMemo(() => {
    if (overlayEnabled) {
      return selectedChannels.flatMap((channel, channelIndex) => {
        const label = BPLOT_PARAMETERS[channel]?.name || channel;
        return [
          {
            key: getSeriesColorKey(channel, 'primary'),
            label: `${label} (Primary)`,
            fallback: getDefaultSeriesColor(channelIndex, 'primary')
          },
          {
            key: getSeriesColorKey(channel, 'secondary'),
            label: `${label} (Secondary)`,
            fallback: getDefaultSeriesColor(channelIndex, 'secondary')
          }
        ];
      });
    }

    return selectedChannels.map((channel, channelIndex) => ({
      key: getSeriesColorKey(channel),
      label: BPLOT_PARAMETERS[channel]?.name || channel,
      fallback: getDefaultSeriesColor(channelIndex)
    }));
  }, [selectedChannels, overlayEnabled]);

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
    return result;
  }, [channelsByCategory]);

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
        const name = (BPLOT_PARAMETERS[channel]?.name || channel).toLowerCase();
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

  const handleZoomMouseDown = (event) => {
    if (event?.nativeEvent?.shiftKey || event?.nativeEvent?.button === 1) {
      const domain = zoomedDomain || fullDomain;
      if (!domain) return;
      panRef.current = { x: event.chartX || 0, domain };
      setIsPanning(true);
      return;
    }
    if (event && event.activeLabel !== undefined) {
      setRefAreaLeft(event.activeLabel);
      setRefAreaRight(null);
    }
  };

  const handleZoomMouseMove = useCallback((event) => {
    if (event?.activeLabel !== undefined) {
      const nextTime = typeof event.activeLabel === 'number'
        ? event.activeLabel
        : parseFloat(event.activeLabel);
      if (Number.isFinite(nextTime)) setCursorTime(nextTime);
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
  }, [fullDomain, plotWidth, refAreaLeft]);

  const handleZoomMouseUp = () => {
    if (panRef.current) {
      panRef.current = null;
      setIsPanning(false);
      return;
    }
    if (refAreaLeft !== null && refAreaRight !== null) {
      const left = Math.min(refAreaLeft, refAreaRight);
      const right = Math.max(refAreaLeft, refAreaRight);
      if (right - left > 0.01 && fullDomain) {
        setZoomedDomain(clampDomain([left, right], fullDomain));
      }
    }
    if (zoomRafId.current) {
      cancelAnimationFrame(zoomRafId.current);
      zoomRafId.current = null;
    }
    pendingZoomX.current = null;
    setRefAreaLeft(null);
    setRefAreaRight(null);
  };

  const handleResetZoom = () => setZoomedDomain(null);

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
                return (
                  <button
                    key={layout.id}
                    type="button"
                    disabled={!enabled}
                    onClick={() => applyLayout(layout)}
                    className={`px-2 py-1 text-[10px] font-bold uppercase tracking-wide border ${
                      enabled
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
                          {BPLOT_PARAMETERS[channel]?.name || channel}
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
              <span className="ml-3 font-mono text-slate-500">
                Showing {chartRenderData.length} of {sourceCount} samples
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
            Drag to zoom · Shift-drag to pan · Scroll to zoom · Double-click to reset
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
                      <span className="text-[11px] text-slate-200 truncate" title={BPLOT_PARAMETERS[channel]?.name || channel}>
                        {BPLOT_PARAMETERS[channel]?.name || channel}
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

        <div
          ref={plotRef}
          className={`flex-1 h-[300px] lg:h-auto ${isPanning ? 'cursor-grabbing' : 'cursor-crosshair'}`}
          onDoubleClick={handleResetZoom}
        >
          {selectedChannels.length === 0 ? (
            <div className="h-full flex items-center justify-center text-sm text-slate-500">
              Select a channel or a layout preset to plot.
            </div>
          ) : (
            <ChartErrorBoundary fallbackHeight="100%">
              <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                <LineChart
                  data={chartRenderData}
                  onMouseDown={handleZoomMouseDown}
                  onMouseMove={handleZoomMouseMove}
                  onMouseUp={handleZoomMouseUp}
                  onMouseLeave={() => {
                    setCursorTime(null);
                    handleZoomMouseUp();
                  }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis
                    dataKey="Time"
                    stroke="#64748b"
                    fontSize={12}
                    type="number"
                    domain={xDomain}
                    allowDataOverflow={!!zoomedDomain}
                    tickFormatter={formatChartTick}
                  />
                  {chartAxes.axes.map((axis, index) => (
                    <YAxis
                      key={axis.id}
                      yAxisId={axis.id}
                      orientation={axis.orientation}
                      stroke={index === 0 ? '#64748b' : '#94a3b8'}
                      fontSize={12}
                      domain={axis.domain}
                      tickFormatter={(value) => safeToFixed(value, axis.decimals, '')}
                      label={{
                        value: axis.label,
                        angle: axis.orientation === 'left' ? -90 : 90,
                        position: axis.orientation === 'left' ? 'insideLeft' : 'insideRight',
                        style: { textAnchor: 'middle', fill: '#64748b', fontSize: 10 }
                      }}
                    />
                  ))}
                  <Tooltip
                    cursor={false}
                    content={(props) => (
                      <ChartValueTooltip
                        {...props}
                        chartSeries={chartSeries}
                        seriesValueLookup={seriesValueLookup}
                        shouldShowFileBoundaries={shouldShowFileBoundaries}
                        cursorTime={cursorTime}
                      />
                    )}
                  />
                  <Legend
                    verticalAlign="top"
                    height={60}
                    wrapperStyle={{ fontSize: 11, lineHeight: 1.2, paddingTop: '10px' }}
                  />
                  {chartSeries.map((series) => (
                    <Line
                      key={series.key}
                      yAxisId={chartAxes.channelToAxis[series.channel]}
                      type={isDiscreteChannel(series.channel) ? 'stepAfter' : 'linear'}
                      dataKey={series.key}
                      stroke={series.color}
                      dot={false}
                      strokeDasharray={series.strokeDasharray}
                      strokeWidth={highlightedChannel === series.channel ? 4 : 2}
                      name={series.name}
                      isAnimationActive={false}
                      connectNulls={false}
                      style={highlightedChannel === series.channel ? { filter: 'drop-shadow(0 0 4px currentColor)' } : undefined}
                    />
                  ))}
                  {Number.isFinite(cursorTime) && chartAxes.axes[0] && (
                    <ReferenceLine
                      x={cursorTime}
                      yAxisId={chartAxes.axes[0].id}
                      stroke="#e2e8f0"
                      strokeOpacity={0.45}
                      strokeDasharray="3 3"
                    />
                  )}
                  {thresholdLines.map((line) => (
                    <ReferenceLine
                      key={line.id}
                      y={line.y}
                      yAxisId={line.yAxisId || chartAxes.axes[0]?.id}
                      stroke={line.level === 'critical' ? '#ef4444' : '#f59e0b'}
                      strokeDasharray={line.level === 'critical' ? '4 2' : '6 4'}
                      strokeOpacity={0.7}
                      ifOverflow="hidden"
                      label={{
                        value: `${BPLOT_PARAMETERS[line.channel]?.name || line.channel} ${line.label}`,
                        fill: line.level === 'critical' ? '#fca5a5' : '#fcd34d',
                        fontSize: 10,
                        position: 'insideTopRight'
                      }}
                    />
                  ))}
                  {shouldShowFileBoundaries && fileBoundaries.map((boundary, idx) => (
                    idx > 0 && (
                      <ReferenceLine
                        key={`file-boundary-${boundary.fileId}`}
                        x={boundary.startTime}
                        yAxisId={chartAxes.axes[0]?.id}
                        stroke="#22c55e"
                        strokeDasharray="5 5"
                        strokeWidth={2}
                        label={{
                          value: boundary.fileName.replace(/\.[^.]+$/, ''),
                          position: 'top',
                          fill: '#22c55e',
                          fontSize: 10
                        }}
                      />
                    )
                  ))}
                  {selectedAlert && selectedAlert.startTime !== undefined && selectedAlert.endTime !== undefined && (
                    <ReferenceArea
                      x1={selectedAlert.startTime - (selectedAlert.minDuration || 0) + selectedAlertTimeOffset}
                      x2={selectedAlert.endTime + selectedAlertTimeOffset}
                      yAxisId={chartAxes.channelToAxis[selectedAlert.channel] || chartAxes.axes[0]?.id}
                      stroke={selectedAlert.severity === 'critical' ? '#ef4444' : '#f59e0b'}
                      fill={selectedAlert.severity === 'critical' ? '#ef4444' : '#f59e0b'}
                      fillOpacity={0.08}
                      ifOverflow="extendDomain"
                      label={{
                        value: `${getSeverityLabel(selectedAlert.severity, selectedAlert.category)}: ${getAlertDisplayName(selectedAlert)}` +
                          ((selectedAlert.minDuration || 0) > 0 ? ` (delay ${formatDuration(selectedAlert.minDuration)})` : ''),
                        position: 'insideTopLeft',
                        fill: '#ffffff',
                        fontSize: 11
                      }}
                    />
                  )}
                  {refAreaLeft !== null && refAreaRight !== null && (
                    <ReferenceArea
                      x1={refAreaLeft}
                      x2={refAreaRight}
                      yAxisId={chartAxes.axes[0]?.id}
                      strokeOpacity={0.3}
                      fill="#22c55e"
                      fillOpacity={0.15}
                    />
                  )}
                </LineChart>
              </ResponsiveContainer>
            </ChartErrorBoundary>
          )}
        </div>
        {Number.isFinite(cursorTime) && (
          <div className="mt-2 text-[11px] font-mono text-slate-400">
            Cursor {formatChartTick(cursorTime)}
            {chartSeries.slice(0, 6).map((series) => {
              const samples = seriesValueLookup[series.key] || [];
              const nearest = samples.length
                ? samples.reduce((best, sample) => (
                  !best || Math.abs(sample.time - cursorTime) < Math.abs(best.time - cursorTime)
                    ? sample
                    : best
                ), null)
                : null;
              if (!nearest) return null;
              return (
                <span key={series.key} className="ml-3" style={{ color: series.color }}>
                  {series.name} {isDiscreteChannel(series.channel) ? nearest.value : nearest.value.toFixed(getDecimalPlaces(series.channel))}
                </span>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
