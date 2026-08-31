import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import {
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, LineChart, Line, AreaChart, Area, ReferenceLine, ReferenceArea, Brush
} from 'recharts';
import {
  Activity, AlertCircle, AlertTriangle, Clock, Zap, Info,
  ThermometerSun, Battery, Gauge, TrendingUp, Play,
  ChevronDown, ChevronRight, ChevronLeft, Droplets, Settings, FileText, Upload, PanelLeftClose, PanelLeftOpen
} from 'lucide-react';
import { BPLOT_PARAMETERS, CATEGORY_COLORS, CATEGORY_ORDER, CATEGORY_LABELS, VALUE_MAPPINGS, getDisplayValue, TIME_IN_STATE_CHANNELS, CHANNEL_UNIT_TYPES, getDecimalPlaces, getYAxisId, getSyncStateDisplay } from '../lib/bplotThresholds';
import parameterDefinitions4g from '../lib/parameterDefinitions4g.json';
import { getChartData, getParameterInfo, formatDuration, calculateTimeInState } from '../lib/bplotProcessData';
import { extractEngineHourWindow, formatEngineHourValue } from '../lib/bplotEngineHours';
import AppHeader from './AppHeader';
import { useThresholds } from '../contexts/ThresholdContext';

// Maximum channels that can be selected for charting
const MAX_CHART_CHANNELS = 20;
// Primary palette: cool tones (blues, cyans, greens, teals, purples)
const DEFAULT_CHART_PALETTE = [
  '#38bdf8', '#22c55e', '#a78bfa', '#14b8a6', '#60a5fa',
  '#2dd4bf', '#818cf8', '#84cc16', '#06b6d4', '#34d399',
  '#7dd3fc', '#4ade80', '#67e8f9', '#86efac', '#c4b5fd'
];
// Secondary palette: warm tones (oranges, reds, pinks, yellows, magentas)
const DEFAULT_SECONDARY_CHART_PALETTE = [
  '#f97316', '#ef4444', '#f43f5e', '#eab308', '#ec4899',
  '#f59e0b', '#fb7185', '#f472b6', '#fbbf24', '#fb923c',
  '#fda4af', '#facc15', '#e879f9', '#fca5a1', '#d946ef'
];

const isValidHexColor = (value) => /^#[0-9a-fA-F]{6}$/.test(value || '');

const normalizeColor = (value, fallback = '#38bdf8') => (
  isValidHexColor(value) ? value.toLowerCase() : fallback
);

const getSeriesColorKey = (channel, role = null) => (
  role ? `${channel}__${role}` : channel
);

const findNearestSeriesSample = (samples, targetTime) => {
  if (!Array.isArray(samples) || samples.length === 0 || !Number.isFinite(targetTime)) return null;

  let left = 0;
  let right = samples.length - 1;

  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    const candidateTime = samples[mid].time;
    if (candidateTime === targetTime) return samples[mid];
    if (candidateTime < targetTime) {
      left = mid + 1;
    } else {
      right = mid - 1;
    }
  }

  const candidates = [];
  if (left < samples.length) candidates.push(samples[left]);
  if (right >= 0) candidates.push(samples[right]);
  if (candidates.length === 0) return null;

  return candidates.reduce((best, candidate) => (
    !best || Math.abs(candidate.time - targetTime) < Math.abs(best.time - targetTime)
      ? candidate
      : best
  ), null);
};

// =============================================================================
// HELPER COMPONENTS
// =============================================================================

/**
 * MIL Status Indicator - Red glowing circle when DTC is active
 * MIL Status 0 = OFF (No active DTC)
 * MIL Status 1 = ON (Red Glowing Circle - Active DTC)
 */
const MILStatusIndicator = ({ isActive }) => (
  <div className="flex items-center gap-2">
    <div
      className={`w-4 h-4 rounded-full transition-all duration-300 ${
        isActive
          ? 'bg-red-500 shadow-[0_0_12px_4px_rgba(239,68,68,0.2)] animate-pulse'
          : 'bg-slate-600'
      }`}
    />
    <span className={`text-sm font-medium ${isActive ? 'text-red-400' : 'text-slate-400'}`}>
      MIL {isActive ? 'ON' : 'OFF'}
    </span>
  </div>
);

const MetricCard = ({ icon, label, value, sub, unit, alert }) => (
  <div className={`bg-slate-900/50 rounded-xl border p-6 ${alert ? 'border-red-500/50' : 'border-slate-800'}`}>
    <div className="flex items-center gap-2 mb-4">
      <div className="w-9 h-9 rounded-lg bg-slate-800/50 flex items-center justify-center">{icon}</div>
      <div className="text-sm text-slate-400 uppercase tracking-wider font-medium">{label}</div>
    </div>
    <div className="text-2xl font-bold text-white font-mono">
      {value} {unit && <span className="text-lg text-slate-400">{unit}</span>}
    </div>
    {sub && <div className="text-sm text-slate-400 mt-2 font-mono">{sub}</div>}
  </div>
);

const StatRow = ({ label, value, unit }) => (
  <div className="flex justify-between text-sm py-1">
    <span className="text-slate-400">{label}</span>
    <span className="text-white font-mono">{value}{unit && ` ${unit}`}</span>
  </div>
);

const isFiniteNumber = (value) => typeof value === 'number' && Number.isFinite(value);

const formatNumber = (value, decimals) => (
  isFiniteNumber(value) ? value.toFixed(decimals) : '-'
);

const TelemetryRange = ({ label, stats, unit, decimals = 1 }) => {
  if (!stats) return null;

  const { min, max, avg } = stats;
  const hasRange = isFiniteNumber(min) && isFiniteNumber(max) && isFiniteNumber(avg);
  const fallbackValue = isFiniteNumber(avg)
    ? avg
    : isFiniteNumber(min)
      ? min
      : isFiniteNumber(max)
        ? max
        : null;

  return (
    <div className="flex flex-col gap-0.5">
      <div className="text-sm text-slate-300 font-semibold leading-tight">{label}</div>
      {hasRange ? (
        <div className="text-sm font-mono text-slate-200 leading-tight">
          Min: {formatNumber(min, decimals)} | Avg: {formatNumber(avg, decimals)} | Max: {formatNumber(max, decimals)}
          {unit && <span className="text-xs text-slate-500 uppercase"> {unit}</span>}
        </div>
      ) : (
        <div className="text-sm font-mono text-slate-200 leading-tight">
          Value: {formatNumber(fallbackValue, decimals)}
          {unit && <span className="text-xs text-slate-500 uppercase"> {unit}</span>}
        </div>
      )}
    </div>
  );
};

const DiscreteStat = ({ label, value }) => (
  <div className="flex items-center justify-between text-sm leading-tight">
    <span className="text-slate-500">{label}</span>
    <span className="text-slate-200 font-semibold">{value ?? '-'}</span>
  </div>
);

const PARAMETER_DEFINITIONS_4G = new Map(
  (parameterDefinitions4g?.parameters || []).map((param) => [param.name, param.definition])
);

const get4GDefinition = (channelName) => PARAMETER_DEFINITIONS_4G.get(channelName);

const mergeTimeInStateByLabel = (stateStats) => {
  if (!stateStats || stateStats.length === 0) return stateStats;

  const grouped = new Map();
  let totalDuration = 0;

  stateStats.forEach((entry) => {
    totalDuration += entry.durationSeconds || 0;
    const key = entry.displayName || String(entry.state);
    if (!grouped.has(key)) {
      grouped.set(key, {
        displayName: key,
        durationSeconds: 0,
        transitions: 0
      });
    }
    const current = grouped.get(key);
    current.durationSeconds += entry.durationSeconds || 0;
    current.transitions += entry.transitions || 0;
  });

  return Array.from(grouped.values()).map((entry) => ({
    ...entry,
    percentage: totalDuration > 0 ? (entry.durationSeconds / totalDuration) * 100 : 0,
    durationFormatted: formatDuration(entry.durationSeconds)
  })).sort((a, b) => b.percentage - a.percentage);
};

const FUEL_TYPE_LABELS = {
  0: 'Gasoline',
  1: 'Propane',
  2: 'Natural Gas'
};

const normalizeFuelTypeValue = (value) => {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.round(value);
  if (typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Number(value))) {
    return Math.round(Number(value));
  }
  return null;
};

const getFuelTypeLabel = (value) => {
  const normalized = normalizeFuelTypeValue(value);
  if (normalized === null) return 'Unknown';
  return FUEL_TYPE_LABELS[normalized] ?? 'Unknown';
};

const safeToFixed = (value, decimals, fallback = '-') => {
  if (typeof value !== 'number' || Number.isNaN(value)) return fallback;
  return value.toFixed(decimals);
};

const parseTooltipNumber = (value) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = parseFloat(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
};

const ChartValueTooltip = ({
  active,
  label,
  payload = [],
  chartSeries = [],
  seriesValueLookup = {},
  shouldShowFileBoundaries = false
}) => {
  if (!active) return null;

  const numericTime = typeof label === 'number' ? label : parseFloat(label);
  const hasNumericTime = Number.isFinite(numericTime);
  const payloadByKey = new Map(payload.map((entry) => [String(entry?.dataKey || ''), entry]));
  const sourceFile = payload.find((entry) => entry?.payload?._sourceFile)?.payload?._sourceFile;

  const rows = chartSeries.map((series) => {
    const fromPayload = payloadByKey.get(series.key)?.value;
    let numericValue = parseTooltipNumber(fromPayload);
    let isApproximate = false;

    if (numericValue === null && hasNumericTime) {
      const nearestSample = findNearestSeriesSample(seriesValueLookup[series.key], numericTime);
      if (nearestSample) {
        numericValue = nearestSample.value;
        isApproximate = Math.abs(nearestSample.time - numericTime) > 0.001;
      }
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
      if (isCategorical) {
        displayValue = getDisplayValue(channelName, Math.round(numericValue));
      } else {
        displayValue = safeToFixed(numericValue, decimals);
      }
      // Approximate indicator removed per user request
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
        Time: {hasNumericTime ? formatDuration(numericTime) : label}
        {sourceFile && shouldShowFileBoundaries ? ` | File: ${sourceFile}` : ''}
      </div>
      <div className="space-y-px">
        {visibleRows.map((row) => (
          <div key={row.key} className="flex items-center justify-between gap-4 py-0.5">
            <span className="min-w-0 flex-1 truncate" style={{ color: row.color }}>{row.label}</span>
            <span className="font-mono text-white whitespace-nowrap">{row.value}</span>
          </div>
        ))}
        {hiddenCount > 0 && (
          <div className="pt-1 text-slate-500 text-center">+{hiddenCount} more channels</div>
        )}
      </div>
    </div>
  );
};

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

const AlertCard = ({ alert, onClick, isHighlighted, onToggleShow }) => {
  const handleCardClick = () => {
    if (onClick) onClick();
  };

  const handleToggleClick = (e) => {
    e.stopPropagation();
    if (onToggleShow) onToggleShow();
  };

  // Determine styles based on severity
  let bgColor, hoverBg, iconColor;
  if (alert.severity === 'critical') {
    bgColor = 'bg-red-950/50 border-red-500/50';
    hoverBg = 'hover:bg-red-900/30';
    iconColor = 'text-red-400';
  } else if (alert.severity === 'info') {
    bgColor = 'bg-cyan-950/50 border-cyan-500/50';
    hoverBg = 'hover:bg-cyan-900/30';
    iconColor = 'text-cyan-400';
  } else {
    bgColor = 'bg-yellow-950/50 border-yellow-500/50';
    hoverBg = 'hover:bg-amber-900/20';
    iconColor = 'text-yellow-400';
  }
  const highlightRing = isHighlighted ? 'ring-2 ring-green-400/70 shadow-[0_0_12px_rgba(74,222,128,0.45)]' : '';
  const toggleLabel = isHighlighted ? 'On Chart' : 'Show on Chart';

  // Select appropriate icon
  const IconComponent = alert.severity === 'critical' ? AlertCircle
    : alert.severity === 'info' ? Info
    : AlertTriangle;

  const alertTitle = `${getSeverityLabel(alert.severity, alert.category)}: ${getAlertDisplayName(alert)}`;

  // For signal quality alerts, show description; for others show message
  const alertBody = alert.category === 'signal_quality' && alert.description
    ? alert.description
    : alert.message;

  return (
    <div
      className={`${bgColor} ${hoverBg} border rounded-lg p-4 transition-colors ${highlightRing} ${onClick ? 'cursor-pointer' : ''}`}
      onClick={handleCardClick}
    >
      <div className="flex items-start gap-3">
        <IconComponent className={`w-5 h-5 ${iconColor} mt-0.5`} />
        <div className="flex-1 min-w-0">
          <div className={`font-medium ${iconColor}`}>
            {alertTitle}
          </div>
          <div className="text-slate-300 text-sm mt-1">
            {alertBody}
            {alert.startTime !== undefined && alert.endTime !== undefined && (
              <div className="text-xs text-slate-400 mt-1">
                {formatDuration(alert.startTime)} → {formatDuration(alert.endTime)} ({formatDuration(alert.duration || (alert.endTime - alert.startTime))})
              </div>
            )}
          </div>
        </div>
        <button
          onClick={handleToggleClick}
          className={`ml-3 px-3 py-2 text-xs font-semibold rounded-md border transition-colors ${
            isHighlighted
              ? 'bg-green-500/20 border-green-400/60 text-green-100 hover:bg-green-500/30'
              : 'bg-slate-800/70 border-slate-600 text-slate-200 hover:bg-slate-700'
          }`}
          title="Toggle highlight on chart"
        >
          {toggleLabel}
        </button>
      </div>
    </div>
  );
};

// =============================================================================
// MAIN B-PLOT ANALYSIS COMPONENT
// =============================================================================

const BPlotAnalysis = ({
  data,
  processedData,
  fileName,
  onReset,
  ecmFaults = [],           // ECM faults for overlay
  fileBoundaries = [],      // File boundaries for multi-file view
  bplotFiles = [],          // Array of loaded B-Plot files
  bplotMergeMode = 'sequential',
  bplotCorrelation = null,
  onAddEcmFile,             // Callback to add ECM file for overlay
  onExport,                 // Callback to export report
  onReportIssue,            // Callback to open report issue modal
  externalActiveTab,        // External tab control (for combined view)
  activeCorrelatedRole: externalCorrelatedRole = null,
  onCorrelatedRoleChange = null,
  hideHeader = false,       // Hide header when embedded in combined view
  reportRef,               // Ref for PDF export
  userFields,
  userFieldsDraft,
  isUserFieldsEditing = false,
  onStartUserFieldsEdit,
  onUserFieldsDraftChange,
  onSaveUserFields,
  onCancelUserFields
}) => {
  // Get active profile for display
  const { resolvedProfile } = useThresholds();

  const [internalActiveTab, setInternalActiveTab] = useState('overview');
  // Use external tab if provided, otherwise use internal state
  const activeTab = externalActiveTab || internalActiveTab;
  const setActiveTab = externalActiveTab ? () => {} : setInternalActiveTab;
  const [selectedChannels, setSelectedChannels] = useState(['rpm', 'MAP']);
  const [expandedCategories, setExpandedCategories] = useState({ engine: true });
  const [showFileBoundaries, setShowFileBoundaries] = useState(true);
  const [highlightedChannel, setHighlightedChannel] = useState(null);
  const [selectedAlert, setSelectedAlert] = useState(null);
  const [internalCorrelatedRole, setInternalCorrelatedRole] = useState('primary');
  const [overlayCorrelatedPlots, setOverlayCorrelatedPlots] = useState(false);
  const [manualAlignment, setManualAlignment] = useState({ pairKey: '', value: '0' });
  const [showColorControls, setShowColorControls] = useState(false);
  const [showAxisControls, setShowAxisControls] = useState(false);
  const [channelColorOverrides, setChannelColorOverrides] = useState({});
  const [axisAssignments, setAxisAssignments] = useState({});
  const [axisBounds, setAxisBounds] = useState({});
  const [channelsPanelCollapsed, setChannelsPanelCollapsed] = useState(false);
  const [refAreaLeft, setRefAreaLeft] = useState(null);
  const [refAreaRight, setRefAreaRight] = useState(null);
  const [zoomedDomain, setZoomedDomain] = useState(null);
  const zoomRafId = useRef(null);
  const pendingZoomX = useRef(null);

  const primaryBplotFile = useMemo(
    () => bplotFiles.find((file) => file.role === 'primary'),
    [bplotFiles]
  );
  const secondaryBplotFile = useMemo(
    () => bplotFiles.find((file) => file.role === 'secondary'),
    [bplotFiles]
  );
  const dualRoleMode = Boolean(primaryBplotFile && secondaryBplotFile);
  const activeCorrelatedRole = (
    externalCorrelatedRole === 'secondary' || externalCorrelatedRole === 'primary'
  ) ? externalCorrelatedRole : internalCorrelatedRole;
  const setCorrelatedRole = useCallback(
    (role) => (onCorrelatedRoleChange || setInternalCorrelatedRole)(role),
    [onCorrelatedRoleChange]
  );

  useEffect(() => {
    if (!dualRoleMode) return;
    if (activeCorrelatedRole === 'secondary' && !secondaryBplotFile) {
      setCorrelatedRole('primary');
    }
  }, [dualRoleMode, activeCorrelatedRole, secondaryBplotFile, setCorrelatedRole]);

  useEffect(() => {
    if (!dualRoleMode && overlayCorrelatedPlots) {
      setOverlayCorrelatedPlots(false);
    }
  }, [dualRoleMode, overlayCorrelatedPlots]);

  useEffect(() => () => {
    if (zoomRafId.current) {
      cancelAnimationFrame(zoomRafId.current);
      zoomRafId.current = null;
    }
    pendingZoomX.current = null;
  }, []);

  const activeBplotFile = useMemo(() => {
    if (!dualRoleMode) return null;
    if (activeCorrelatedRole === 'secondary') {
      return secondaryBplotFile || primaryBplotFile;
    }
    return primaryBplotFile || secondaryBplotFile;
  }, [dualRoleMode, activeCorrelatedRole, primaryBplotFile, secondaryBplotFile]);

  const effectiveProcessedData = dualRoleMode
    ? (activeBplotFile?.processed || processedData)
    : processedData;

  const {
    timeInfo = null,
    channelStats = {},
    timeInStateStats = {},
    engineEvents = [],
    channelsByCategory = {},
    operatingStats = {},
    alerts = [],
    summary = {},
    chartData = [],
    rawData = []
  } = effectiveProcessedData || {};

  const activePlotFileName = activeBplotFile?.fileName || data?.fileName || fileName;
  const displayFileName = dualRoleMode
    ? `${primaryBplotFile?.fileName || 'Primary'} + ${secondaryBplotFile?.fileName || 'Secondary'}`
    : fileName;
  const shouldShowFileBoundaries = !dualRoleMode && fileBoundaries.length > 1;

  // Calculate MIL status - check if MILout_mirror = 1 while engine running (RPM >= 500) for minimum duration
  const milStatus = useMemo(() => {
    if (!rawData || rawData.length === 0) return { isActive: false, percentage: 0, duration: 0 };

    const MIN_DURATION_SECONDS = 5; // Minimum duration to consider MIL active (filters out shutdown blips)

    // Filter to engine running data and sort by time
    const engineRunningData = rawData
      .filter(row => (row.rpm ?? row.RPM ?? 0) >= 500)
      .sort((a, b) => (a.Time ?? 0) - (b.Time ?? 0));

    if (engineRunningData.length === 0) return { isActive: false, percentage: 0, duration: 0 };

    // Calculate total duration where MIL = 1 while engine running
    let totalMilDuration = 0;
    let milStartTime = null;

    for (let i = 0; i < engineRunningData.length; i++) {
      const row = engineRunningData[i];
      const isMilActive = row.MILout_mirror === 1;
      const currentTime = row.Time ?? 0;

      if (isMilActive && milStartTime === null) {
        milStartTime = currentTime;
      } else if (!isMilActive && milStartTime !== null) {
        totalMilDuration += currentTime - milStartTime;
        milStartTime = null;
      }
    }

    // Handle case where MIL is still active at end of data
    if (milStartTime !== null) {
      const lastTime = engineRunningData[engineRunningData.length - 1].Time ?? 0;
      totalMilDuration += lastTime - milStartTime;
    }

    const activeCount = engineRunningData.filter(row => row.MILout_mirror === 1).length;

    return {
      isActive: totalMilDuration >= MIN_DURATION_SECONDS,
      percentage: ((activeCount / engineRunningData.length) * 100).toFixed(1),
      duration: totalMilDuration.toFixed(1)
    };
  }, [rawData]);

  const engineHours = useMemo(() => extractEngineHourWindow(rawData), [rawData]);

  // Get ordered categories for display
  const orderedCategories = useMemo(() => {
    const result = {};
    for (const category of CATEGORY_ORDER) {
      if (channelsByCategory[category] && channelsByCategory[category].length > 0) {
        result[category] = channelsByCategory[category];
      }
    }
    // Add any remaining categories not in CATEGORY_ORDER
    for (const [category, channels] of Object.entries(channelsByCategory)) {
      if (!result[category] && channels.length > 0) {
        result[category] = channels;
      }
    }
    return result;
  }, [channelsByCategory]);

  const primaryChartData = useMemo(
    () => primaryBplotFile?.processed?.chartData || [],
    [primaryBplotFile]
  );
  const secondaryChartData = useMemo(
    () => secondaryBplotFile?.processed?.chartData || [],
    [secondaryBplotFile]
  );
  const alignmentPairKey = `${primaryBplotFile?.id || ''}::${secondaryBplotFile?.id || ''}`;
  const manualAlignmentOffset = manualAlignment.pairKey === alignmentPairKey
    ? manualAlignment.value
    : '0';
  const setManualAlignmentOffset = useCallback((value) => {
    setManualAlignment({ pairKey: alignmentPairKey, value });
  }, [alignmentPairKey]);
  const automaticAlignmentOffset = Number.isFinite(bplotCorrelation?.alignmentOffsetSec)
    ? bplotCorrelation.alignmentOffsetSec
    : 0;
  const parsedManualAlignmentOffset = parseFloat(manualAlignmentOffset);
  const effectiveAlignmentOffset = automaticAlignmentOffset + (
    Number.isFinite(parsedManualAlignmentOffset) ? parsedManualAlignmentOffset : 0
  );

  const shouldOverlayCorrelatedPlots = dualRoleMode && overlayCorrelatedPlots;
  const selectedAlertTimeOffset = shouldOverlayCorrelatedPlots && activeCorrelatedRole === 'secondary'
    ? effectiveAlignmentOffset
    : 0;

  const correlatedOverlayChartData = useMemo(() => {
    if (!shouldOverlayCorrelatedPlots) return [];
    const merged = new Map();

    const addRows = (rows, role) => {
      rows.forEach((row) => {
        const rawTime = row?.Time;
        const numericTime = typeof rawTime === 'number' ? rawTime : parseFloat(rawTime);
        if (!Number.isFinite(numericTime)) return;
        const displayTime = numericTime + (role === 'secondary' ? effectiveAlignmentOffset : 0);
        const timeKey = displayTime.toFixed(3);
        if (!merged.has(timeKey)) {
          merged.set(timeKey, { Time: displayTime });
        }
        const point = merged.get(timeKey);
        selectedChannels.forEach((channel) => {
          const rawValue = row?.[channel];
          if (rawValue === undefined || rawValue === null || rawValue === '') return;
          if (typeof rawValue === 'number' && Number.isFinite(rawValue)) {
            point[`${channel}__${role}`] = rawValue;
            return;
          }
          const parsedValue = parseFloat(rawValue);
          if (Number.isFinite(parsedValue)) {
            point[`${channel}__${role}`] = parsedValue;
          }
        });
      });
    };

    addRows(primaryChartData, 'primary');
    addRows(secondaryChartData, 'secondary');

    return Array.from(merged.values()).sort((a, b) => (a.Time || 0) - (b.Time || 0));
  }, [shouldOverlayCorrelatedPlots, primaryChartData, secondaryChartData, selectedChannels, effectiveAlignmentOffset]);

  const chartRenderData = useMemo(() => {
    if (shouldOverlayCorrelatedPlots) return correlatedOverlayChartData;
    return chartData || [];
  }, [shouldOverlayCorrelatedPlots, correlatedOverlayChartData, chartData]);

  const visibleChartData = useMemo(() => {
    if (!zoomedDomain) return chartRenderData;
    const [min, max] = zoomedDomain;
    if (!Number.isFinite(min) || !Number.isFinite(max)) return chartRenderData;
    return chartRenderData.filter((row) => {
      const t = typeof row?.Time === 'number' ? row.Time : parseFloat(row?.Time);
      return Number.isFinite(t) && t >= min && t <= max;
    });
  }, [chartRenderData, zoomedDomain]);

  // Calculate unique Y-axes needed based on selected channels' unit types
  const chartAxes = useMemo(() => {
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

    // Group channels by axis ID
    const unitGroups = {};
    selectedChannels.forEach(channel => {
      const axisId = axisAssignments[channel] || getYAxisId(channel);
      if (!unitGroups[axisId]) {
        unitGroups[axisId] = [];
      }
      unitGroups[axisId].push(channel);
    });

    // Create axis config for each unit type
    const uniqueTypes = Object.keys(unitGroups);
    const axes = uniqueTypes.map((axisId, index) => {
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

    return { axes, channelToAxis: selectedChannels.reduce((acc, ch) => {
      acc[ch] = axisAssignments[ch] || getYAxisId(ch);
      return acc;
    }, {}) };
  }, [selectedChannels, axisAssignments, axisBounds]);

  const getDefaultSeriesColor = (channelIndex, role = null) => {
    if (role === 'secondary') {
      return DEFAULT_SECONDARY_CHART_PALETTE[channelIndex % DEFAULT_SECONDARY_CHART_PALETTE.length];
    }
    return DEFAULT_CHART_PALETTE[channelIndex % DEFAULT_CHART_PALETTE.length];
  };

  const resolveSeriesColor = (channel, channelIndex, role = null) => {
    const effectiveRole = shouldOverlayCorrelatedPlots ? role : null;
    const colorKey = getSeriesColorKey(channel, effectiveRole);
    const fallback = getDefaultSeriesColor(channelIndex, effectiveRole);
    return normalizeColor(channelColorOverrides[colorKey] || fallback, fallback);
  };

  const chartSeries = useMemo(() => {
    if (shouldOverlayCorrelatedPlots) {
      return selectedChannels.flatMap((channel, channelIndex) => {
        const channelLabel = BPLOT_PARAMETERS[channel]?.name || channel;
        const primaryKey = `${channel}__primary`;
        const secondaryKey = `${channel}__secondary`;

        return [
          {
            key: primaryKey,
            channel,
            role: 'primary',
            name: `${channelLabel} (Primary)`,
            color: resolveSeriesColor(channel, channelIndex, 'primary'),
            strokeDasharray: undefined
          },
          {
            key: secondaryKey,
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
  }, [selectedChannels, shouldOverlayCorrelatedPlots, channelColorOverrides]);

  const colorControlEntries = useMemo(() => {
    if (shouldOverlayCorrelatedPlots) {
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
  }, [selectedChannels, shouldOverlayCorrelatedPlots]);

  const updateSeriesColor = (entry, nextColor) => {
    const normalized = normalizeColor(nextColor, entry.fallback);
    setChannelColorOverrides((prev) => {
      const next = { ...prev };
      if (normalized === entry.fallback) {
        delete next[entry.key];
      } else {
        next[entry.key] = normalized;
      }
      return next;
    });
  };

  const handleZoomMouseDown = (e) => {
    if (e && e.activeLabel !== undefined) {
      setRefAreaLeft(e.activeLabel);
      setRefAreaRight(null);
    }
  };

  const handleZoomMouseMove = useCallback((e) => {
    if (refAreaLeft === null || e?.activeLabel === undefined) return;

    const nextX = e.activeLabel;
    if (pendingZoomX.current === nextX) return;
    pendingZoomX.current = nextX;

    if (!zoomRafId.current) {
      zoomRafId.current = requestAnimationFrame(() => {
        setRefAreaRight(pendingZoomX.current);
        zoomRafId.current = null;
      });
    }
  }, [refAreaLeft]);

  const handleZoomMouseUp = () => {
    if (refAreaLeft !== null && refAreaRight !== null) {
      const left = Math.min(refAreaLeft, refAreaRight);
      const right = Math.max(refAreaLeft, refAreaRight);
      if (right - left > 0.01) {
        setZoomedDomain([left, right]);
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

  const handleResetZoom = () => {
    setZoomedDomain(null);
  };

  const seriesValueLookup = useMemo(() => {
    const lookup = {};
    chartSeries.forEach((series) => {
      lookup[series.key] = [];
    });

    chartRenderData.forEach((row) => {
      const rowTime = typeof row?.Time === 'number' ? row.Time : parseFloat(row?.Time);
      if (!Number.isFinite(rowTime)) return;
      chartSeries.forEach((series) => {
        const rawValue = row?.[series.key];
        if (rawValue === undefined || rawValue === null || rawValue === '') return;
        const numericValue = typeof rawValue === 'number' ? rawValue : parseFloat(rawValue);
        if (!Number.isFinite(numericValue)) return;
        lookup[series.key].push({ time: rowTime, value: numericValue });
      });
    });

    return lookup;
  }, [chartSeries, chartRenderData]);

  const rpmStats = channelStats.rpm || channelStats.RPM;
  const fuelTypeValue = timeInStateStats?.fuel_type?.[0]?.state ?? channelStats.fuel_type?.avg;
  const fuelTypeLabel = getFuelTypeLabel(fuelTypeValue);

  const toggleChannel = (channel) => {
    setSelectedChannels(prev => {
      if (prev.includes(channel)) {
        return prev.filter(c => c !== channel);
      }
      if (prev.length >= MAX_CHART_CHANNELS) return prev; // Max channels limit
      return [...prev, channel];
    });
  };

  const toggleCategory = (category) => {
    setExpandedCategories(prev => ({
      ...prev,
      [category]: !prev[category]
    }));
  };

  const isAlertSelected = (alert) => {
    if (!selectedAlert || !alert) return false;
    if (selectedAlert.id && alert.id) return selectedAlert.id === alert.id;
    return selectedAlert.ruleId === alert.ruleId &&
      selectedAlert.channel === alert.channel &&
      selectedAlert.startTime === alert.startTime;
  };

  const handleAlertClick = (alert) => {
    const channel = alert.channel;
    // Toggle off if clicking the same alert
    if (isAlertSelected(alert)) {
      setSelectedAlert(null);
      setHighlightedChannel(null);
      return;
    }

    setSelectedAlert(alert);
    setHighlightedChannel(channel);

    if (!selectedChannels.includes(channel)) {
      setSelectedChannels(prev => {
        if (prev.length >= MAX_CHART_CHANNELS) {
          // Replace last channel if at max
          return [...prev.slice(0, -1), channel];
        }
        return [...prev, channel];
      });
    }

    // Jump to charts tab for correlation
    setInternalActiveTab('charts');
  };

  // =============================================================================
  // RENDER
  // =============================================================================
  return (
    <div className={hideHeader ? '' : 'min-h-screen bg-[#020617]'} style={{ color: 'white' }} ref={reportRef}>
      {!hideHeader && (
        <>
          <AppHeader
            hasEcm={false}
            hasBplt={true}
            ecmFileName=""
            bpltFileName={displayFileName}
            bplotFiles={bplotFiles}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            onImport={onReset}
            onExport={onExport}
            onReportIssue={onReportIssue}
            eventCount={engineEvents.length || 0}
            activeProfileName={resolvedProfile?.name}
            activeProfileId={resolvedProfile?.profileId}
            userFields={userFields}
            userFieldsDraft={userFieldsDraft}
            isUserFieldsEditing={isUserFieldsEditing}
            onStartUserFieldsEdit={onStartUserFieldsEdit}
            onUserFieldsDraftChange={onUserFieldsDraftChange}
            onSaveUserFields={onSaveUserFields}
            onCancelUserFields={onCancelUserFields}
            dualRoleMode={dualRoleMode}
            overlayCorrelatedPlots={overlayCorrelatedPlots}
            onToggleOverlay={() => setOverlayCorrelatedPlots(prev => !prev)}
          />

          {/* Secondary Controls Bar */}
          <div className="border-b border-green-500/20 bg-slate-900/30 px-4 sm:px-6 py-2">
            <div className="max-w-[1920px] mx-auto flex flex-wrap items-center justify-between gap-2 sm:gap-3">
              {/* Status Indicators */}
              <div className="flex items-center gap-4">
                <MILStatusIndicator isActive={milStatus.isActive} />
              </div>

              {/* Overlay Controls */}
              <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                {dualRoleMode && (
                  <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 pr-2 border-r border-slate-700/60">
                    <span className="text-[10px] uppercase tracking-wider text-slate-400" style={{ fontFamily: 'Orbitron, sans-serif' }}>
                      Plot Context
                    </span>
                    <button
                      onClick={() => setCorrelatedRole('primary')}
                      className={`px-2 sm:px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide border transition-colors ${
                        activeCorrelatedRole === 'primary'
                          ? 'bg-blue-500/20 border-blue-500/50 text-blue-300'
                          : 'bg-slate-800/60 border-slate-700 text-slate-400 hover:text-white'
                      }`}
                      style={{ fontFamily: 'Orbitron, sans-serif' }}
                    >
                      Primary Plot
                    </button>
                    <button
                      onClick={() => setCorrelatedRole('secondary')}
                      className={`px-2 sm:px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide border transition-colors ${
                        activeCorrelatedRole === 'secondary'
                          ? 'bg-orange-500/20 border-orange-500/50 text-orange-300'
                          : 'bg-slate-800/60 border-slate-700 text-slate-400 hover:text-white'
                      }`}
                      style={{ fontFamily: 'Orbitron, sans-serif' }}
                    >
                      Secondary Plot
                    </button>
                    <button
                      onClick={() => setOverlayCorrelatedPlots((prev) => !prev)}
                      className={`px-2 sm:px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide border transition-colors ${
                        overlayCorrelatedPlots
                          ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300'
                          : 'bg-slate-800/60 border-slate-700 text-slate-400 hover:text-white'
                      }`}
                      style={{ fontFamily: 'Orbitron, sans-serif' }}
                      title="Overlay primary and secondary plots on the same chart"
                    >
                      Overlay P+S
                    </button>
                  </div>
                )}
                {shouldShowFileBoundaries && (
                  <button
                    onClick={() => setShowFileBoundaries(!showFileBoundaries)}
                    className={`flex items-center gap-2 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide transition-colors ${
                      showFileBoundaries
                        ? 'bg-green-500/15 border border-green-500/40 text-green-400'
                        : 'bg-slate-800/50 border border-slate-700 text-slate-400'
                    }`}
                    style={{ fontFamily: 'Orbitron, sans-serif', clipPath: 'polygon(4px 0, 100% 0, 100% calc(100% - 4px), calc(100% - 4px) 100%, 0 100%, 0 4px)' }}
                    title={showFileBoundaries ? 'Hide file boundaries' : 'Show file boundaries'}
                  >
                    <FileText className="w-3 h-3" />
                    Files ({fileBoundaries.length})
                  </button>
                )}
                {dualRoleMode && bplotCorrelation?.overlapRatio !== null && (
                  <span className="text-[10px] font-mono text-slate-400 truncate max-w-[200px] sm:max-w-none">
                    Overlap: {(bplotCorrelation.overlapRatio * 100).toFixed(0)}% | {overlayCorrelatedPlots ? 'Mode: Overlay' : `Active: ${activePlotFileName}`}
                  </span>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {/* Secondary Controls Bar for embedded mode */}
      {hideHeader && (
        <div className="border-b border-green-500/20 bg-slate-900/30 px-4 sm:px-6 py-2">
          <div className="max-w-[1920px] mx-auto flex flex-wrap items-center justify-between gap-2 sm:gap-3">
            <div className="flex items-center gap-4">
              <MILStatusIndicator isActive={milStatus.isActive} />
            </div>
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              {dualRoleMode && (
                <>
                  <button
                    onClick={() => setCorrelatedRole('primary')}
                    className={`px-2 sm:px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide border transition-colors ${
                      activeCorrelatedRole === 'primary'
                        ? 'bg-blue-500/20 border-blue-500/50 text-blue-300'
                        : 'bg-slate-800/60 border-slate-700 text-slate-400 hover:text-white'
                    }`}
                    style={{ fontFamily: 'Orbitron, sans-serif' }}
                  >
                    Primary Plot
                  </button>
                  <button
                    onClick={() => setCorrelatedRole('secondary')}
                    className={`px-2 sm:px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide border transition-colors ${
                      activeCorrelatedRole === 'secondary'
                        ? 'bg-orange-500/20 border-orange-500/50 text-orange-300'
                        : 'bg-slate-800/60 border-slate-700 text-slate-400 hover:text-white'
                    }`}
                    style={{ fontFamily: 'Orbitron, sans-serif' }}
                  >
                    Secondary Plot
                  </button>
                  <button
                    onClick={() => setOverlayCorrelatedPlots((prev) => !prev)}
                    className={`px-2 sm:px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide border transition-colors ${
                      overlayCorrelatedPlots
                        ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300'
                        : 'bg-slate-800/60 border-slate-700 text-slate-400 hover:text-white'
                    }`}
                    style={{ fontFamily: 'Orbitron, sans-serif' }}
                    title="Overlay primary and secondary plots on the same chart"
                  >
                    Overlay P+S
                  </button>
                </>
              )}
              {shouldShowFileBoundaries && (
                <button
                  onClick={() => setShowFileBoundaries(!showFileBoundaries)}
                  className={`flex items-center gap-2 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide transition-colors ${
                    showFileBoundaries
                      ? 'bg-green-500/15 border border-green-500/40 text-green-400'
                      : 'bg-slate-800/50 border border-slate-700 text-slate-400'
                  }`}
                  style={{ fontFamily: 'Orbitron, sans-serif', clipPath: 'polygon(4px 0, 100% 0, 100% calc(100% - 4px), calc(100% - 4px) 100%, 0 100%, 0 4px)' }}
                >
                  <FileText className="w-3 h-3" />
                  Files ({fileBoundaries.length})
                </button>
              )}
              {dualRoleMode && bplotCorrelation?.overlapRatio !== null && (
                <span className="text-[10px] font-mono text-slate-400 truncate max-w-[200px] sm:max-w-none">
                  Overlap: {(bplotCorrelation.overlapRatio * 100).toFixed(0)}% | {overlayCorrelatedPlots ? 'Mode: Overlay' : `Active: ${activePlotFileName}`}
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Main Content - Full width for overview and charts, constrained for other tabs */}
      <main
        className={`w-[90%] max-w-[1920px] mx-auto ${
          activeTab === 'charts' || activeTab === 'overview'
            ? 'px-6 md:px-16 lg:px-24'
            : 'max-w-7xl mx-auto px-6'
        } py-6`}
      >
        {/* Alerts Section (non-overview, non-charts tabs - charts shows alerts below) */}
        {activeTab !== 'overview' && activeTab !== 'charts' && alerts.length > 0 && (
          <div className="mb-6 space-y-2">
            {alerts.map((alert, i) => (
              <AlertCard
                key={i}
                alert={alert}
                onClick={() => handleAlertClick(alert)}
                isHighlighted={isAlertSelected(alert)}
                onToggleShow={() => handleAlertClick(alert)}
              />
            ))}
          </div>
        )}

        {activeTab === 'overview' && (
          <div className="space-y-6">
            {dualRoleMode && (
              <div className="bg-slate-900/60 border border-blue-500/30 rounded-xl p-5">
                <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                  <h3 className="text-sm font-bold uppercase tracking-wider text-blue-300" style={{ fontFamily: 'Orbitron, sans-serif' }}>
                    Dual Plot Correlation
                  </h3>
                  <div className="flex flex-wrap items-center gap-3">
                    <span className={`text-[11px] font-bold uppercase tracking-wider ${activeCorrelatedRole === 'secondary' ? 'text-orange-300' : 'text-blue-300'}`}>
                      Active Context: {activeCorrelatedRole === 'secondary' ? 'Secondary Plot' : 'Primary Plot'}
                    </span>
                    {bplotCorrelation?.overlapRatio !== null && (
                      <span className="text-xs text-slate-300 font-mono">
                        Window overlap: {(bplotCorrelation.overlapRatio * 100).toFixed(0)}%
                      </span>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  <div className="bg-slate-800/50 border border-blue-500/20 rounded-lg p-3">
                    <div className="text-blue-300 uppercase tracking-wider mb-1">Primary Plot</div>
                    <div className="text-white font-mono truncate" title={primaryBplotFile?.fileName}>{primaryBplotFile?.fileName || '-'}</div>
                    <div className="text-slate-400 mt-1">
                      Duration: {(bplotCorrelation?.primary?.duration || 0).toFixed(1)}s
                    </div>
                    {bplotCorrelation?.primary?.hourWindow && (
                      <div className="text-slate-400 mt-1">
                        Engine Hours: {formatEngineHourValue(bplotCorrelation.primary.hourWindow.start)}h → {formatEngineHourValue(bplotCorrelation.primary.hourWindow.end)}h
                      </div>
                    )}
                  </div>
                  <div className="bg-slate-800/50 border border-orange-500/20 rounded-lg p-3">
                    <div className="text-orange-300 uppercase tracking-wider mb-1">Secondary Plot</div>
                    <div className="text-white font-mono truncate" title={secondaryBplotFile?.fileName}>{secondaryBplotFile?.fileName || '-'}</div>
                    <div className="text-slate-400 mt-1">
                      Duration: {(bplotCorrelation?.secondary?.duration || 0).toFixed(1)}s
                    </div>
                    {bplotCorrelation?.secondary?.hourWindow && (
                      <div className="text-slate-400 mt-1">
                        Engine Hours: {formatEngineHourValue(bplotCorrelation.secondary.hourWindow.start)}h → {formatEngineHourValue(bplotCorrelation.secondary.hourWindow.end)}h
                      </div>
                    )}
                  </div>
                </div>
                {bplotCorrelation?.overlapWindow && (
                  <div className="mt-3 text-xs text-emerald-300">
                    Correlated operating window: {bplotCorrelation.overlapWindow.start.toFixed(2)}h -&gt; {bplotCorrelation.overlapWindow.end.toFixed(2)}h
                  </div>
                )}
                {Number.isFinite(bplotCorrelation?.alignmentOffsetSec) && (
                  <div className="mt-2 text-xs text-cyan-300">
                    Automatic overlay alignment: shift Secondary by {bplotCorrelation.alignmentOffsetSec >= 0 ? '+' : ''}{bplotCorrelation.alignmentOffsetSec.toFixed(1)}s
                    {Number.isFinite(bplotCorrelation.alignmentConfidence) && ` (${(bplotCorrelation.alignmentConfidence * 100).toFixed(0)}% confidence)`}
                  </div>
                )}
              </div>
            )}
            {/* Engine Hours */}
            {engineHours && (
              <div className="grid grid-cols-2 gap-4">
                <MetricCard
                  icon={<Clock className="w-5 h-5 text-orange-400" />}
                  label="Engine Hours Plot Start"
                  value={formatEngineHourValue(engineHours.start)}
                  unit="hrs"
                />
                <MetricCard
                  icon={<Clock className="w-5 h-5 text-orange-400" />}
                  label="Engine Hours Plot End"
                  value={formatEngineHourValue(engineHours.end)}
                  unit="hrs"
                />
              </div>
            )}

            {/* Summary Metrics */}
            <div className="grid grid-cols-2 gap-4">
              <MetricCard
                icon={<Clock className="w-5 h-5 text-green-400" />}
                label="Recording Duration"
                value={summary.duration}
              />
              <MetricCard
                icon={<Activity className="w-5 h-5 text-green-400" />}
                label="Engine Runtime"
                value={summary.totalRuntime}
              />
            </div>

            {/* Operating Stats and Key Parameters */}
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
              <div className="xl:col-span-3">
                <div className="bg-slate-900/50 rounded-xl border border-slate-800 p-6 h-full">
                  <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                    <Settings className="w-5 h-5 text-slate-400" />
                    Operating Statistics
                  </h3>
                  <div className="space-y-2">
                    <StatRow label="Idle Time" value={summary.idlePercent} />
                    <StatRow label="Average Load" value={summary.avgLoad} />
                    <StatRow label="Sample Rate" value={summary.sampleRate} />
                    <StatRow label="Engine Starts" value={summary.engineStarts} />
                    <StatRow label="Engine Stops" value={summary.engineStops} />
                  </div>
                </div>
              </div>
              <div className="xl:col-span-9">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Activity className="w-5 h-5 text-slate-400" />
                    <h3 className="text-lg font-semibold">Key Parameters <span className="text-sm text-slate-500">BY SYSTEM</span></h3>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div className="bg-slate-900/50 rounded-xl border border-cyan-400/20 p-4 transition-colors hover:border-cyan-400/40 hover:shadow-[0_0_18px_rgba(34,211,238,0.18)] h-full flex flex-col">
                    <div className="mb-4">
                      <h3 className="text-[11px] font-black uppercase tracking-widest text-cyan-400">Electrical System</h3>
                    </div>
                    <div className="divide-y divide-cyan-400/30">
                      <div className="py-2.5 first:pt-0 last:pb-0">
                        <TelemetryRange label="Battery Voltage" stats={channelStats.Vbat} unit="V" decimals={1} />
                      </div>
                    </div>
                  </div>
                  <div className="bg-slate-900/50 rounded-xl border border-green-400/20 p-4 transition-colors hover:border-green-400/40 hover:shadow-[0_0_18px_rgba(74,222,128,0.18)] h-full flex flex-col">
                    <div className="mb-4">
                      <h3 className="text-[11px] font-black uppercase tracking-widest text-green-400">Engine Speed & Load</h3>
                    </div>
                    <div className="divide-y divide-green-400/30">
                      <div className="py-2.5 first:pt-0 last:pb-0">
                        <TelemetryRange label="RPM" stats={rpmStats} unit="RPM" decimals={0} />
                      </div>
                    </div>
                  </div>
                  <div className="bg-slate-900/50 rounded-xl border border-cyan-400/20 p-4 transition-colors hover:border-cyan-400/40 hover:shadow-[0_0_18px_rgba(34,211,238,0.18)] h-full flex flex-col">
                    <div className="mb-4">
                      <h3 className="text-[11px] font-black uppercase tracking-widest text-cyan-400">Air Intake</h3>
                    </div>
                    <div className="divide-y divide-cyan-400/30">
                      <div className="py-2.5 first:pt-0 last:pb-0">
                        <TelemetryRange label="Manifold Absolute Pressure" stats={channelStats.MAP} unit="psia" decimals={1} />
                      </div>
                      <div className="py-2.5 first:pt-0 last:pb-0">
                        <TelemetryRange label="Intake Air Temperature" stats={channelStats.IAT} unit="F" decimals={1} />
                      </div>
                      <div className="py-2.5 first:pt-0 last:pb-0">
                        <TelemetryRange label="Throttle Inlet Pressure" stats={channelStats.TIP} unit="psia" decimals={1} />
                      </div>
                    </div>
                  </div>
                  <div className="bg-slate-900/50 rounded-xl border border-orange-400/20 p-4 transition-colors hover:border-orange-400/40 hover:shadow-[0_0_18px_rgba(251,146,60,0.18)] h-full flex flex-col">
                    <div className="mb-4">
                      <h3 className="text-[11px] font-black uppercase tracking-widest text-orange-400">Thermal Management</h3>
                    </div>
                    <div className="divide-y divide-orange-400/30">
                      <div className="py-2.5 first:pt-0 last:pb-0">
                        <TelemetryRange label="Engine Coolant Temp" stats={channelStats.ECT} unit="F" decimals={0} />
                      </div>
                    </div>
                  </div>
                  <div className="bg-slate-900/50 rounded-xl border border-yellow-400/20 p-4 transition-colors hover:border-yellow-400/40 hover:shadow-[0_0_18px_rgba(250,204,21,0.18)] h-full flex flex-col">
                    <div className="mb-4">
                      <h3 className="text-[11px] font-black uppercase tracking-widest text-yellow-400">Lubrication</h3>
                    </div>
                    <div className="divide-y divide-yellow-400/30">
                      <div className="py-2.5 first:pt-0 last:pb-0">
                        <TelemetryRange label="Oil Pressure" stats={channelStats.OILP_press} unit="psi" decimals={1} />
                      </div>
                    </div>
                  </div>
                  <div className="bg-slate-900/50 rounded-xl border border-green-400/20 p-4 transition-colors hover:border-green-400/40 hover:shadow-[0_0_18px_rgba(74,222,128,0.18)] h-full flex flex-col">
                    <div className="mb-4">
                      <h3 className="text-[11px] font-black uppercase tracking-widest text-green-400">Fuel & Combustion</h3>
                    </div>
                    <div className="divide-y divide-emerald-400/30">
                      <div className="py-2.5 first:pt-0 last:pb-0">
                        <TelemetryRange label="Phi UEGO" stats={channelStats.Phi_UEGO} decimals={2} />
                      </div>
                      <div className="py-2.5 first:pt-0 last:pb-0">
                        <TelemetryRange label="Closed Loop Fuel Correction" stats={channelStats.CL_BM1} unit="%" decimals={2} />
                      </div>
                      <div className="py-2.5 first:pt-0 last:pb-0">
                        <TelemetryRange label="Adaptive Learn Fuel Correction" stats={channelStats.A_BM1} unit="%" decimals={2} />
                      </div>
                    </div>
                    {(timeInStateStats?.fuel_type?.length || channelStats.fuel_type) && (
                      <div className="mt-4 border-t border-slate-800/80 pt-3">
                        <DiscreteStat label="Fuel Type" value={fuelTypeLabel} />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Quick Chart Preview - RPM & MAP */}
            <div className="bg-slate-900/50 rounded-xl border border-slate-800 p-6">
              <h3 className="text-lg font-semibold mb-4">RPM & MAP Over Time</h3>
              <div className="h-96">
                <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                    <XAxis
                      dataKey="Time"
                      stroke="#64748b"
                      fontSize={12}
                      type="number"
                      domain={['dataMin', 'dataMax']}
                      tickFormatter={(v) => {
                        if (typeof v !== 'number' || Number.isNaN(v)) return '';
                        if (v < 60) return `${safeToFixed(v, 0)}s`;
                        if (v < 3600) return `${safeToFixed(v / 60, 1)}m`;
                        return `${safeToFixed(v / 3600, 1)}h`;
                      }}
                    />
                    <YAxis yAxisId="rpm" stroke="#3b82f6" fontSize={12} domain={[0, 'auto']} />
                    <YAxis yAxisId="map" orientation="right" stroke="#8b5cf6" fontSize={12} />
                    <Tooltip
                      wrapperStyle={{ maxWidth: '90vw', fontSize: '12px', pointerEvents: 'none' }}
                      contentStyle={{
                        backgroundColor: '#1e293b',
                        border: '1px solid #334155',
                        padding: '8px',
                        maxWidth: '280px',
                        maxHeight: '40vh',
                        overflowY: 'auto',
                        overflowX: 'hidden',
                        whiteSpace: 'normal',
                        wordBreak: 'break-word'
                      }}
                      itemStyle={{ whiteSpace: 'normal' }}
                      labelFormatter={(v) => `Time: ${formatDuration(v)}`}
                      formatter={(value, name) => {
                        if (typeof value === 'number') {
                          return [safeToFixed(value, 1), name];
                        }
                        return [value ?? '—', name];
                      }}
                    />
                    <Legend
                      verticalAlign="top"
                      height={60}
                      wrapperStyle={{
                        fontSize: 11,
                        lineHeight: 1.2,
                        paddingTop: '10px'
                      }}
                    />
                    <Line
                      yAxisId="rpm"
                      type="monotone"
                      dataKey="rpm"
                      stroke="#3b82f6"
                      dot={false}
                      strokeWidth={2}
                      name="RPM"
                    />
                    <Line
                      yAxisId="map"
                      type="monotone"
                      dataKey="MAP"
                      stroke="#8b5cf6"
                      dot={false}
                      strokeWidth={2}
                      name="MAP (psia)"
                    />
                    <Brush
                      dataKey="Time"
                      height={18}
                      stroke="#22c55e"
                      travellerWidth={8}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Alerts Section (overview, below chart) */}
            {alerts.length > 0 && (
              <div className="space-y-2">
                {alerts.map((alert, i) => (
                  <AlertCard
                    key={i}
                    alert={alert}
                    onClick={() => handleAlertClick(alert)}
                    isHighlighted={isAlertSelected(alert)}
                    onToggleShow={() => handleAlertClick(alert)}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'charts' && (
          <>
          <div className="flex flex-col lg:flex-row gap-4 lg:h-[calc(100vh-280px)] min-h-[500px]">
            {/* Sidebar - Channel Selection (collapsible) */}
            {channelsPanelCollapsed ? (
              <button
                onClick={() => setChannelsPanelCollapsed(false)}
                className="hidden lg:flex flex-col items-center justify-center w-10 bg-slate-900/80 border border-slate-800 rounded-xl flex-shrink-0 hover:bg-slate-800/80 transition-colors group"
                title="Expand channels panel"
              >
                <PanelLeftOpen className="w-4 h-4 text-slate-400 group-hover:text-white mb-2" />
                <span className="text-[10px] text-slate-400 group-hover:text-white uppercase tracking-widest font-bold"
                  style={{ writingMode: 'vertical-rl', textOrientation: 'mixed' }}
                >
                  Channels
                </span>
              </button>
            ) : (
              <aside className="w-full lg:w-64 lg:max-h-none bg-slate-900/80 border border-slate-800 rounded-xl overflow-y-auto flex-shrink-0 transition-all">
                <div className="p-4 border-b border-slate-700">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-medium text-slate-300">
                      Channels ({selectedChannels.length}/{MAX_CHART_CHANNELS})
                    </h3>
                    <div className="flex items-center gap-2">
                      {selectedChannels.length > 0 && (
                        <button
                          onClick={() => setSelectedChannels([])}
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
                </div>
                <div className="py-2">
                  {Object.entries(orderedCategories).map(([category, channels]) => (
                    <div key={category} className="border-b border-slate-800/50">
                      <div
                        className="px-4 py-3 text-xs text-slate-400 uppercase tracking-wider cursor-pointer hover:bg-slate-800/30 flex justify-between items-center"
                        onClick={() => toggleCategory(category)}
                      >
                        <span className="flex items-center gap-2">
                          <div
                            className="w-2 h-2 rounded-full"
                            style={{ backgroundColor: CATEGORY_COLORS[category] || '#6b7280' }}
                          />
                          {CATEGORY_LABELS[category] || category}
                        </span>
                        <span>{expandedCategories[category] ? '▾' : '▸'}</span>
                      </div>
                      {expandedCategories[category] && (
                        <div className="pb-2">
                          {channels.map(channel => (
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

            {/* Main Chart Area */}
            <div className="flex-1 min-h-[300px] bg-slate-900/50 border border-slate-800 rounded-xl p-4 lg:p-6 flex flex-col">
              <div className="mb-3 rounded-lg border border-slate-700/70 bg-slate-900/60 p-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="text-xs text-slate-400 uppercase tracking-wider">
                    Chart Appearance
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
                        onClick={() => {
                          setChannelColorOverrides({});
                        }}
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
                {shouldOverlayCorrelatedPlots && (
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
                              onChange={(e) => {
                                updateSeriesColor(entry, e.target.value);
                              }}
                              className="h-6 w-10 border border-slate-600 rounded bg-transparent cursor-pointer"
                              title={`Set ${entry.label} color`}
                            />
                            <button
                              type="button"
                              onClick={() => {
                                updateSeriesColor(entry, entry.fallback);
                              }}
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
                              [axis.id]: { ...previous[axis.id], max: event.target.value }
                            }))}
                            className="min-w-0 w-full rounded border border-slate-700 bg-slate-900 px-1.5 py-1 text-[10px] font-mono text-slate-100"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <div className="flex-1 h-[300px] lg:h-auto">
                <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                  <LineChart
                    data={visibleChartData}
                    onMouseDown={handleZoomMouseDown}
                    onMouseMove={handleZoomMouseMove}
                    onMouseUp={handleZoomMouseUp}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                    <XAxis
                      dataKey="Time"
                      stroke="#64748b"
                      fontSize={12}
                      type="number"
                      domain={zoomedDomain || ['dataMin', 'dataMax']}
                      allowDataOverflow={!!zoomedDomain}
                      tickFormatter={(v) => {
                        if (typeof v !== 'number' || Number.isNaN(v)) return '';
                        if (v < 60) return `${safeToFixed(v, 0)}s`;
                        if (v < 3600) return `${safeToFixed(v / 60, 1)}m`;
                        return `${safeToFixed(v / 3600, 1)}h`;
                      }}
                    />
                    {/* Dynamic Y-axes based on selected channels' unit types */}
                    {chartAxes.axes.map((axis, index) => (
                      <YAxis
                        key={axis.id}
                        yAxisId={axis.id}
                        orientation={axis.orientation}
                        stroke={index === 0 ? '#64748b' : '#94a3b8'}
                        fontSize={12}
                        domain={axis.domain}
                        tickFormatter={(v) => safeToFixed(v, axis.decimals, '')}
                        label={{
                          value: axis.label,
                          angle: axis.orientation === 'left' ? -90 : 90,
                          position: axis.orientation === 'left' ? 'insideLeft' : 'insideRight',
                          style: { textAnchor: 'middle', fill: '#64748b', fontSize: 10 }
                        }}
                      />
                    ))}
                    <Tooltip
                      content={(props) => (
                        <ChartValueTooltip
                          {...props}
                          chartSeries={chartSeries}
                          seriesValueLookup={seriesValueLookup}
                          shouldShowFileBoundaries={shouldShowFileBoundaries}
                        />
                      )}
                    />
                    <Legend
                      verticalAlign="top"
                      height={60}
                      wrapperStyle={{
                        fontSize: 11,
                        lineHeight: 1.2,
                        paddingTop: '10px'
                      }}
                    />
                    {chartSeries.map((series) => (
                      <Line
                        key={series.key}
                        yAxisId={chartAxes.channelToAxis[series.channel]}
                        type="monotone"
                        dataKey={series.key}
                        stroke={series.color}
                        dot={false}
                        strokeDasharray={series.strokeDasharray}
                        strokeWidth={highlightedChannel === series.channel ? 4 : 2}
                        name={series.name}
                        isAnimationActive={false}
                        style={highlightedChannel === series.channel ? { filter: 'drop-shadow(0 0 4px currentColor)' } : undefined}
                        connectNulls
                      />
                    ))}
                    {/* File boundary markers for multi-file view */}
                    {showFileBoundaries && shouldShowFileBoundaries && fileBoundaries.map((boundary, idx) => (
                      idx > 0 && (
                        <ReferenceLine
                          key={`file-boundary-${boundary.fileId}`}
                          x={boundary.startTime}
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
                    {/* Alert overlay for selected alert only */}
                    {selectedAlert && selectedAlert.startTime !== undefined && selectedAlert.endTime !== undefined && (() => {
                      const persistence = selectedAlert.minDuration || 0;
                      // Place the band starting at estimated onset (start minus persistence)
                      const bandStart = selectedAlert.startTime - persistence + selectedAlertTimeOffset;
                      const bandEnd = selectedAlert.endTime + selectedAlertTimeOffset;
                      const labelText = `${getSeverityLabel(selectedAlert.severity, selectedAlert.category)}: ${getAlertDisplayName(selectedAlert)}` +
                        (persistence > 0 ? ` (delay ${formatDuration(persistence)})` : '');

                      return (
                        <ReferenceArea
                          x1={bandStart}
                          x2={bandEnd}
                          yAxisId={chartAxes.channelToAxis[selectedAlert.channel] || chartAxes.axes[0]?.id}
                          stroke={selectedAlert.severity === 'critical' ? '#ef4444' : '#f59e0b'}
                          fill={selectedAlert.severity === 'critical' ? '#ef4444' : '#f59e0b'}
                          fillOpacity={0.08}
                          ifOverflow="extendDomain"
                          label={{
                            value: labelText,
                            position: 'insideTopLeft',
                            fill: '#ffffff',
                            fontSize: 11
                          }}
                        />
                      );
                    })()}
                    {/* Drag-to-zoom selection area */}
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
                    {!zoomedDomain && (
                      <Brush
                        dataKey="Time"
                        height={20}
                        stroke="#22c55e"
                        travellerWidth={8}
                      />
                    )}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
          {/* Alerts Section - Below charts */}
          {alerts.length > 0 && (
            <div className="mt-6 space-y-2 max-w-7xl mx-auto">
              {alerts.map((alert, i) => (
                <AlertCard
                  key={i}
                  alert={alert}
                  onClick={() => handleAlertClick(alert)}
                  isHighlighted={isAlertSelected(alert)}
                  onToggleShow={() => handleAlertClick(alert)}
                />
              ))}
            </div>
          )}
          </>
        )}

        {activeTab === 'channels' && (
          <div className="space-y-4">
            {dualRoleMode && (
              <div className="bg-slate-900/60 border border-slate-700 rounded-lg px-4 py-3 text-xs text-slate-300">
                Channel values are currently from <span className={activeCorrelatedRole === 'secondary' ? 'text-orange-300' : 'text-blue-300'}>
                  {activeCorrelatedRole === 'secondary' ? 'Secondary Plot' : 'Primary Plot'}
                </span>{' '}
                ({activePlotFileName}). Use the Primary/Secondary controls to switch context across pages.
              </div>
            )}
            {Object.entries(orderedCategories).map(([category, channels]) => (
              <div key={category} className="bg-slate-900/50 rounded-xl border border-slate-800">
                <button
                  onClick={() => toggleCategory(category)}
                  className="w-full px-6 py-4 flex items-center justify-between hover:bg-slate-800/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: CATEGORY_COLORS[category] || '#6b7280' }}
                    />
                    <span className="font-medium">{CATEGORY_LABELS[category] || category}</span>
                    <span className="text-slate-500 text-sm">({channels.length} channels)</span>
                  </div>
                  {expandedCategories[category] ?
                    <ChevronDown className="w-5 h-5 text-slate-400" /> :
                    <ChevronRight className="w-5 h-5 text-slate-400" />
                  }
                </button>
                {expandedCategories[category] && (
                  <div className="px-6 pb-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {channels.map(channel => {
                        const stats = channelStats[channel];
                        const param = BPLOT_PARAMETERS[channel];
                        const fallbackDescription = !param ? get4GDefinition(channel) : null;
                        const description = param?.description || fallbackDescription;
                        const hideAvg = param?.hideAverage;
                        const showMinOnly = param?.showMinOnly;
                        const showMaxOnly = param?.showMaxOnly;
                        const showTimeInState = param?.showTimeInState || TIME_IN_STATE_CHANNELS.includes(channel);
                        const stateStats = timeInStateStats?.[channel];
                        const displayStateStats = channel === 'sync_state' || channel === 'OILP_state'
                          ? mergeTimeInStateByLabel(stateStats)
                          : stateStats;
                        const decimals = getDecimalPlaces(channel);

                        return (
                          <div
                            key={channel}
                            className="bg-slate-800/50 rounded-lg p-3"
                          >
                            <div className="font-medium text-sm">{param?.name || channel}</div>
                            {description && (
                              <div className="text-xs text-slate-500 mb-1">{description}</div>
                            )}
                            {showTimeInState && displayStateStats && displayStateStats.length > 0 ? (
                              // Show time-in-state breakdown for categorical channels with progress bars
                              <div className="text-xs mt-2 space-y-2">
                                {displayStateStats.map((s, i) => (
                                  <div key={i}>
                                    <div className="flex justify-between items-center mb-0.5">
                                      <span className="text-green-400">{s.displayName}</span>
                                      <span className="text-slate-400">
                                        {s.durationFormatted} ({s.percentage.toFixed(0)}%)
                                      </span>
                                    </div>
                                    {/* Progress bar */}
                                    <div className="w-full h-1.5 bg-slate-700 rounded-full overflow-hidden">
                                      <div
                                        className="h-full bg-green-500 rounded-full transition-all"
                                        style={{ width: `${Math.min(100, s.percentage)}%` }}
                                      />
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : stats && stats.noValidData ? (
                              // Show message when no valid running data exists
                              <div className="text-xs text-amber-500/80 mt-1 italic">
                                No valid running data in range
                              </div>
                            ) : stats && (
                              <div className="text-xs text-slate-400 mt-1 space-y-0.5">
                                {showMinOnly ? (
                                  <div>Min: {stats.min?.toFixed(decimals) ?? '-'} {param?.unit}</div>
                                ) : showMaxOnly ? (
                                  <div>Max: {stats.max?.toFixed(decimals) ?? '-'} {param?.unit}</div>
                                ) : (
                                  <>
                                    <div>Min: {stats.min?.toFixed(decimals) ?? '-'} {param?.unit}</div>
                                    <div>Max: {stats.max?.toFixed(decimals) ?? '-'} {param?.unit}</div>
                                    {!hideAvg && (
                                      <div>Avg: {stats.avg?.toFixed(decimals) ?? '-'} {param?.unit}</div>
                                    )}
                                  </>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {activeTab === 'events' && (
          <div className="space-y-4">
            <div className="bg-slate-900/50 rounded-xl border border-slate-800 p-6">
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Play className="w-5 h-5 text-green-400" />
                Engine Events
              </h3>
              {engineEvents.length === 0 ? (
                <p className="text-slate-400">No engine events detected</p>
              ) : (
                <div className="space-y-2">
                  {engineEvents.map((event, i) => (
                    <div
                      key={i}
                      className={`flex items-center gap-4 p-3 rounded-lg ${
                        event.type === 'start' ? 'bg-green-950/30' : 'bg-red-950/30'
                      }`}
                    >
                      <div className={`w-2 h-2 rounded-full ${
                        event.type === 'start' ? 'bg-green-400' : 'bg-red-400'
                      }`} />
                      <div className="flex-1">
                        <span className="font-medium">
                          {event.type === 'start' ? 'Engine Start' : 'Engine Stop'}
                        </span>
                        <span className="text-slate-400 ml-2">
                          at {formatDuration(event.time)}
                        </span>
                        {event.runDuration && (
                          <span className="text-slate-400 ml-2">
                            (ran for {formatDuration(event.runDuration)})
                          </span>
                        )}
                      </div>
                      <div className="text-sm font-mono text-slate-400">
                        {safeToFixed(event.rpm, 0)} RPM
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default BPlotAnalysis;
