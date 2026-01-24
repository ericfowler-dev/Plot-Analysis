import React, { useState, useMemo } from 'react';
import {
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, LineChart, Line, AreaChart, Area, ReferenceLine, ReferenceArea, Brush
} from 'recharts';
import {
  Activity, AlertCircle, AlertTriangle, Clock, Zap, Info,
  ThermometerSun, Battery, Gauge, TrendingUp, Play,
  ChevronDown, ChevronRight, Droplets, Settings, FileText, Eye, EyeOff, Upload
} from 'lucide-react';
import { BPLOT_PARAMETERS, CATEGORY_COLORS, CATEGORY_ORDER, CATEGORY_LABELS, VALUE_MAPPINGS, getDisplayValue, TIME_IN_STATE_CHANNELS, CHANNEL_UNIT_TYPES, getDecimalPlaces, getYAxisId, getSyncState } from '../lib/bplotThresholds';
import parameterDefinitions4g from '../lib/parameterDefinitions4g.json';
import { getChartData, getParameterInfo, formatDuration, calculateTimeInState } from '../lib/bplotProcessData';
import { getAllFaultOverlayLines, getChannelsWithFaultData } from '../lib/faultSnapshotMapping';
import AppHeader from './AppHeader';
import { useThresholds } from '../contexts/ThresholdContext';
import ChartErrorBoundary from './charts/ChartErrorBoundary';
import { sanitizeChartData } from '../lib/chartUtils';

// Maximum channels that can be selected for charting
const MAX_CHART_CHANNELS = 20;

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
    <span className={`text-sm font-medium ${isActive ? 'text-red-400' : 'text-slate-400'}`}>{`MIL ${isActive ? 'ON' : 'OFF'}`}</span>
  </div>
);

const MetricCard = ({ icon, label, value, sub, unit, alert }) => (
  <div className={`bg-slate-900/50 rounded-xl border p-6 ${alert ? 'border-red-500/50' : 'border-slate-800'}`}>  <div className="flex items-center gap-2 mb-4">
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

const getSeverityLabel = (severity, category) => {
  if (category === 'signal_quality') return 'Sensor';
  if (severity === 'critical') return 'Critical';
  if (severity === 'info') return 'Info';
  return 'Warning';
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

  // For signal quality alerts, use the descriptive name; for others use severity: channel format
  const alertTitle = alert.category === 'signal_quality' && alert.name
    ? alert.name
    : `${getSeverityLabel(alert.severity, alert.category)}: ${alert.channel}`;

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
          <div className={`font-medium ${iconColor}`}>{alertTitle}</div>
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
  onAddEcmFile,             // Callback to add ECM file for overlay
  onExport,                 // Callback to export report
  onReportIssue,            // Callback to open report issue modal
  externalActiveTab,        // External tab control (for combined view)
  hideHeader = false,       // Hide header when embedded in combined view
  reportRef                // Ref for PDF export
}) => {
  // Get active profile for display
  const { resolvedProfile } = useThresholds();

  const [internalActiveTab, setInternalActiveTab] = useState('overview');
  // Use external tab if provided, otherwise use internal state
  const activeTab = externalActiveTab || internalActiveTab;
  const setActiveTab = externalActiveTab ? () => {} : setInternalActiveTab;
  const [selectedChannels, setSelectedChannels] = useState(['rpm', 'MAP']);
  const [expandedCategories, setExpandedCategories] = useState({ engine: true });
  const [showFaultOverlays, setShowFaultOverlays] = useState(true);
  const [showFileBoundaries, setShowFileBoundaries] = useState(true);
  const [highlightedChannel, setHighlightedChannel] = useState(null);
  const [selectedAlert, setSelectedAlert] = useState(null);

  const {
    timeInfo,
    channelStats,
    timeInStateStats,
    engineEvents,
    channelsByCategory,
    operatingStats,
    alerts,
    summary,
    chartData,
    rawData
  } = processedData;

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

  const engineHours = useMemo(() => {
    const hourColumns = ['HM_RAM_seconds', 'Engine Hours', 'Hour Meter'];
    for (const col of hourColumns) {
      const hourData = rawData.filter(r => r[col] !== undefined && !isNaN(r[col]));
      if (hourData.length > 0) {
        const sorted = [...hourData].sort((a, b) => (a.Time || 0) - (b.Time || 0));
        return {
          column: col,
          start: Math.floor(sorted[0][col]),
          end: Math.floor(sorted[sorted.length - 1][col])
        };
      }
    }
    return null;
  }, [rawData]);

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

  // Get chart data for selected channels
  const displayChartData = useMemo(() => {
    if (!chartData || chartData.length === 0) return [];
    return chartData.map(row => {
      const point = { Time: row.Time };
      selectedChannels.forEach(ch => {
        point[ch] = row[ch];
      });
      return point;
    });
  }, [chartData, selectedChannels]);

  // Sanitize chart data to avoid NaN / non-numeric issues
  const safeChartData = useMemo(() => sanitizeChartData(chartData || []), [chartData]);
  const safeDisplayChartData = useMemo(() => sanitizeChartData(displayChartData || []), [displayChartData]);

  // Calculate unique Y-axes needed based on selected channels' unit types
  const chartAxes = useMemo(() => {
    // Axis label mapping
    const AXIS_LABELS = {
      yRPM: 'RPM',
      yVolt: 'Voltage (V)',
      yPress: 'Pressure',
      yTemp: 'Temp (°F)',
      yPct: 'Percent (%)',
      yDefault: ''
    };

    // Group channels by axis ID
    const unitGroups = {};
    selectedChannels.forEach(channel => {
      const axisId = getYAxisId(channel);
      if (!unitGroups[axisId]) {
        unitGroups[axisId] = [];
      }
      unitGroups[axisId].push(channel);
    });

    // Create axis config for each unit type
    const uniqueTypes = Object.keys(unitGroups);
    const axes = uniqueTypes.map((axisId, index) => ({
      id: axisId,
      label: AXIS_LABELS[axisId] || '',
      orientation: index % 2 === 0 ? 'left' : 'right',
      channels: unitGroups[axisId],
      decimals: getDecimalPlaces(unitGroups[axisId][0])
    }));

    return { axes, channelToAxis: selectedChannels.reduce((acc, ch) => {
      acc[ch] = getYAxisId(ch);
      return acc;
    }, {}) };
  }, [selectedChannels]);

  // Compute fault overlay reference lines based on selected channels
  const faultOverlayLines = useMemo(() => {
    if (!showFaultOverlays || !ecmFaults.length) return [];
    return getAllFaultOverlayLines(ecmFaults, selectedChannels);
  }, [ecmFaults, selectedChannels, showFaultOverlays]);

  // Get channels that have fault data available
  const channelsWithFaultData = useMemo(() => {
    return getChannelsWithFaultData(ecmFaults);
  }, [ecmFaults]);

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
            bpltFileName={fileName}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            onImport={onReset}
            onExport={onExport}
            onReportIssue={onReportIssue}
            eventCount={processedData?.events?.length || 0}
            activeProfileName={resolvedProfile?.name}
            activeProfileId={resolvedProfile?.profileId}
          />

          {/* Secondary Controls Bar */}
          <div className="border-b border-green-500/20 bg-slate-900/30 px-6 py-2">
            <div className="max-w-[1920px] mx-auto flex items-center justify-between">
              {/* Status Indicators */}
              <div className="flex items-center gap-4">
                <MILStatusIndicator isActive={milStatus.isActive} />
              </div>

              {/* Overlay Controls */}
              <div className="flex items-center gap-3">
                {ecmFaults.length > 0 && (
                  <button
                    onClick={() => setShowFaultOverlays(!showFaultOverlays)}
                    className={`flex items-center gap-2 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide transition-colors ${
                      showFaultOverlays
                        ? 'bg-red-500/15 border border-red-500/40 text-red-400'
                        : 'bg-slate-800/50 border border-slate-700 text-slate-400'
                    }`}
                    style={{ fontFamily: 'Orbitron, sans-serif', clipPath: 'polygon(4px 0, 100% 0, 100% calc(100% - 4px), calc(100% - 4px) 100%, 0 100%, 0 4px)' }}
                    title={showFaultOverlays ? 'Hide fault overlays' : 'Show fault overlays'}
                  >
                    {showFaultOverlays ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                    DTC ({ecmFaults.length})
                  </button>
                )}
                {fileBoundaries.length > 1 && (
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
                {ecmFaults.length === 0 && onAddEcmFile && (
                  <button
                    onClick={onAddEcmFile}
                    className="flex items-center gap-2 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide bg-slate-800/50 border border-slate-700 text-slate-400 hover:text-white hover:border-white"
                    style={{ fontFamily: 'Orbitron, sans-serif', clipPath: 'polygon(4px 0, 100% 0, 100% calc(100% - 4px), calc(100% - 4px) 100%, 0 100%, 0 4px)' }}
                    title="Add ECM file to overlay fault snapshot data on charts"
                  >
                    <AlertTriangle className="w-3 h-3" />
                    Add ECM Data
                  </button>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {/* Secondary Controls Bar for embedded mode */}
      {hideHeader && (
        <div className="border-b border-green-500/20 bg-slate-900/30 px-6 py-2">
          <div className="max-w-[1920px] mx-auto flex items-center justify-between">
            <div className="flex items-center gap-4">
              <MILStatusIndicator isActive={milStatus.isActive} />
            </div>
            <div className="flex items-center gap-3">
              {ecmFaults.length > 0 && (
                <button
                  onClick={() => setShowFaultOverlays(!showFaultOverlays)}
                  className={`flex items-center gap-2 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide transition-colors ${
                    showFaultOverlays
                      ? 'bg-red-500/15 border border-red-500/40 text-red-400'
                      : 'bg-slate-800/50 border border-slate-700 text-slate-400'
                  }`}
                  style={{ fontFamily: 'Orbitron, sans-serif', clipPath: 'polygon(4px 0, 100% 0, 100% calc(100% - 4px), calc(100% - 4px) 100%, 0 100%, 0 4px)' }}
                >
                  {showFaultOverlays ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                  DTC ({ecmFaults.length})
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Main Content - Full width for overview and charts, constrained for other tabs */}
      <main className={"w-[90%] max-w-[1920px] mx-auto " + (activeTab === 'charts' || activeTab === 'overview' ? 'px-6 md:px-16 lg:px-24' : 'max-w-7xl mx-auto px-6') + " py-6">}
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
            {/* Engine Hours */}
            {engineHours && (
              <div className="grid grid-cols-2 gap-4">
                <MetricCard
                  icon={<Clock className="w-5 h-5 text-orange-400" />}
                  label="Engine Hours Plot Start"
                  value={engineHours.start}
                  unit="hrs"
                />
                <MetricCard
                  icon={<Clock className="w-5 h-5 text-orange-400" />}
                  label="Engine Hours Plot End"
                  value={engineHours.end}
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