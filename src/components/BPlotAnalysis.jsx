import React, { useState, useMemo } from 'react';
import {
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, LineChart, Line, AreaChart, Area, ReferenceLine, Brush
} from 'recharts';
import {
  Activity, AlertCircle, AlertTriangle, Clock, Zap,
  ThermometerSun, Battery, Gauge, TrendingUp, Play,
  ChevronDown, ChevronRight, Droplets, Settings, FileText, Eye, EyeOff, Upload
} from 'lucide-react';
import { BPLOT_PARAMETERS, CATEGORY_COLORS, CATEGORY_ORDER, CATEGORY_LABELS, VALUE_MAPPINGS, getDisplayValue, TIME_IN_STATE_CHANNELS, CHANNEL_UNIT_TYPES, getDecimalPlaces, getYAxisId, getSyncStateDisplay } from '../lib/bplotThresholds';
import { getChartData, getParameterInfo, formatDuration, calculateTimeInState } from '../lib/bplotProcessData';
import { getAllFaultOverlayLines, getChannelsWithFaultData } from '../lib/faultSnapshotMapping';
import AppHeader from './AppHeader';

// Maximum channels that can be selected for charting
const MAX_CHART_CHANNELS = 8;

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
          ? 'bg-red-500 shadow-[0_0_12px_4px_rgba(239,68,68,0.6)] animate-pulse'
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

const AlertCard = ({ alert }) => {
  const bgColor = alert.severity === 'critical' ? 'bg-red-950/50 border-red-500/50' : 'bg-yellow-950/50 border-yellow-500/50';
  const iconColor = alert.severity === 'critical' ? 'text-red-400' : 'text-yellow-400';

  return (
    <div className={`${bgColor} border rounded-lg p-4`}>
      <div className="flex items-start gap-3">
        {alert.severity === 'critical' ?
          <AlertCircle className={`w-5 h-5 ${iconColor} mt-0.5`} /> :
          <AlertTriangle className={`w-5 h-5 ${iconColor} mt-0.5`} />
        }
        <div>
          <div className={`font-medium ${iconColor}`}>
            {alert.severity === 'critical' ? 'Critical' : 'Warning'}: {alert.channel}
          </div>
          <div className="text-slate-300 text-sm mt-1">{alert.message}</div>
        </div>
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
  externalActiveTab,        // External tab control (for combined view)
  hideHeader = false        // Hide header when embedded in combined view
}) => {
  const [internalActiveTab, setInternalActiveTab] = useState('overview');
  // Use external tab if provided, otherwise use internal state
  const activeTab = externalActiveTab || internalActiveTab;
  const setActiveTab = externalActiveTab ? () => {} : setInternalActiveTab;
  const [selectedChannels, setSelectedChannels] = useState(['rpm', 'MAP']);
  const [expandedCategories, setExpandedCategories] = useState({ engine: true });
  const [showFaultOverlays, setShowFaultOverlays] = useState(true);
  const [showFileBoundaries, setShowFileBoundaries] = useState(true);

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

  // Calculate MIL status - check if any data point has MILout_mirror = 1
  const milStatus = useMemo(() => {
    if (!rawData || rawData.length === 0) return { isActive: false, percentage: 0 };
    const activeCount = rawData.filter(row => row.MILout_mirror === 1).length;
    return {
      isActive: activeCount > 0,
      percentage: ((activeCount / rawData.length) * 100).toFixed(1)
    };
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

  // =============================================================================
  // RENDER
  // =============================================================================
  return (
    <div className={hideHeader ? '' : 'min-h-screen bg-[#020617]'} style={{ color: 'white' }}>
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
            eventCount={processedData?.events?.length || 0}
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
                    className="flex items-center gap-2 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide bg-slate-800/50 border border-slate-700 text-slate-400 hover:text-white hover:border-orange-500/40 transition-colors"
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

      {/* Main Content - Full width for charts, constrained for other tabs */}
      <main className={`${activeTab === 'charts' ? 'px-6' : 'max-w-7xl mx-auto'} p-6`}>
        {/* Alerts Section */}
        {alerts.length > 0 && (
          <div className={`mb-6 space-y-2 ${activeTab === 'charts' ? 'max-w-7xl mx-auto' : ''}`}>
            {alerts.map((alert, i) => (
              <AlertCard key={i} alert={alert} />
            ))}
          </div>
        )}

        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Summary Metrics */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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
              <MetricCard
                icon={<Gauge className="w-5 h-5 text-blue-400" />}
                label="Avg RPM"
                value={summary.avgRPM}
                unit="RPM"
              />
              <MetricCard
                icon={<TrendingUp className="w-5 h-5 text-purple-400" />}
                label="Max RPM"
                value={summary.maxRPM}
                unit="RPM"
              />
            </div>

            {/* Operating Stats */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-slate-900/50 rounded-xl border border-slate-800 p-6">
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

              <div className="bg-slate-900/50 rounded-xl border border-slate-800 p-6">
                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <Activity className="w-5 h-5 text-slate-400" />
                  Key Parameters
                </h3>
                <div className="space-y-2">
                  {channelStats.ECT && (
                    <StatRow
                      label="Coolant Temp"
                      value={`${channelStats.ECT.min.toFixed(0)} - ${channelStats.ECT.max.toFixed(0)}`}
                      unit="F"
                    />
                  )}
                  {channelStats.Vbat && (
                    <StatRow
                      label="Battery Voltage"
                      value={`${channelStats.Vbat.min.toFixed(1)} - ${channelStats.Vbat.max.toFixed(1)}`}
                      unit="V"
                    />
                  )}
                  {channelStats.MAP && (
                    <StatRow
                      label="MAP Range"
                      value={`${channelStats.MAP.min.toFixed(1)} - ${channelStats.MAP.max.toFixed(1)}`}
                      unit="psia"
                    />
                  )}
                  {channelStats.TPS_pct && (
                    <StatRow
                      label="Throttle Range"
                      value={`${channelStats.TPS_pct.min.toFixed(0)} - ${channelStats.TPS_pct.max.toFixed(0)}`}
                      unit="%"
                    />
                  )}
                </div>
              </div>
            </div>

            {/* Quick Chart Preview - RPM & MAP */}
            <div className="bg-slate-900/50 rounded-xl border border-slate-800 p-6">
              <h3 className="text-lg font-semibold mb-4">RPM & MAP Over Time</h3>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                    <XAxis
                      dataKey="Time"
                      stroke="#64748b"
                      fontSize={12}
                      type="number"
                      domain={['dataMin', 'dataMax']}
                      tickFormatter={(v) => {
                        if (v < 60) return `${v.toFixed(0)}s`;
                        if (v < 3600) return `${(v / 60).toFixed(1)}m`;
                        return `${(v / 3600).toFixed(1)}h`;
                      }}
                    />
                    <YAxis yAxisId="rpm" stroke="#3b82f6" fontSize={12} domain={[0, 'auto']} />
                    <YAxis yAxisId="map" orientation="right" stroke="#8b5cf6" fontSize={12} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155' }}
                      labelFormatter={(v) => `Time: ${formatDuration(v)}`}
                      formatter={(value, name) => {
                        if (typeof value === 'number') {
                          return [value.toFixed(1), name];
                        }
                        return [value, name];
                      }}
                    />
                    <Legend />
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
          </div>
        )}

        {activeTab === 'charts' && (
          <div className="flex gap-4 h-[calc(100vh-280px)] min-h-[500px]">
            {/* Sidebar - Channel Selection */}
            <aside className="w-64 bg-slate-900/80 border border-slate-800 rounded-xl overflow-y-auto flex-shrink-0">
              <div className="p-4 border-b border-slate-700">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium text-slate-300">
                    Channels ({selectedChannels.length}/{MAX_CHART_CHANNELS})
                  </h3>
                  {selectedChannels.length > 0 && (
                    <button
                      onClick={() => setSelectedChannels([])}
                      className="text-xs text-slate-400 hover:text-red-400 transition-colors"
                    >
                      Clear
                    </button>
                  )}
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

            {/* Main Chart Area */}
            <div className="flex-1 bg-slate-900/50 border border-slate-800 rounded-xl p-6 flex flex-col">
              <div className="flex-1">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                    <XAxis
                      dataKey="Time"
                      stroke="#64748b"
                      fontSize={12}
                      type="number"
                      domain={['dataMin', 'dataMax']}
                      tickFormatter={(v) => {
                        if (v < 60) return `${v.toFixed(0)}s`;
                        if (v < 3600) return `${(v / 60).toFixed(1)}m`;
                        return `${(v / 3600).toFixed(1)}h`;
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
                        tickFormatter={(v) => v.toFixed(axis.decimals)}
                        label={{
                          value: axis.label,
                          angle: axis.orientation === 'left' ? -90 : 90,
                          position: axis.orientation === 'left' ? 'insideLeft' : 'insideRight',
                          style: { textAnchor: 'middle', fill: '#64748b', fontSize: 10 }
                        }}
                      />
                    ))}
                    <Tooltip
                      contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.95)', border: '1px solid #334155', borderRadius: '6px' }}
                      labelFormatter={(v, payload) => {
                        const sourceFile = payload?.[0]?.payload?._sourceFile;
                        if (sourceFile && fileBoundaries.length > 1) {
                          return `Time: ${formatDuration(v)} | File: ${sourceFile}`;
                        }
                        return `Time: ${formatDuration(v)}`;
                      }}
                      formatter={(value, name, entry) => {
                        const channelName = entry?.dataKey || name;
                        const param = BPLOT_PARAMETERS[channelName];
                        const decimals = getDecimalPlaces(channelName);
                        const isCategorical = VALUE_MAPPINGS[channelName] || channelName === 'sync_state';
                        if (isCategorical) {
                          const displayText = getDisplayValue(channelName, Math.round(value));
                          return [displayText, param ? `${param.name}` : channelName];
                        }
                        return [
                          typeof value === 'number' ? value.toFixed(decimals) : value,
                          param ? `${param.name} (${param.unit})` : channelName
                        ];
                      }}
                    />
                    <Legend />
                    {selectedChannels.map((channel, i) => (
                      <Line
                        key={channel}
                        yAxisId={chartAxes.channelToAxis[channel]}
                        type="monotone"
                        dataKey={channel}
                        stroke={Object.values(CATEGORY_COLORS)[i % Object.values(CATEGORY_COLORS).length]}
                        dot={false}
                        strokeWidth={2}
                        name={BPLOT_PARAMETERS[channel]?.name || channel}
                      />
                    ))}
                    {/* File boundary markers for multi-file view */}
                    {showFileBoundaries && fileBoundaries.length > 1 && fileBoundaries.map((boundary, idx) => (
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
                    {/* ECM fault snapshot overlay lines */}
                    {showFaultOverlays && faultOverlayLines.map((line, idx) => (
                      <ReferenceLine
                        key={`fault-${line.faultCode}-${line.channel}-${idx}`}
                        y={line.value}
                        yAxisId={chartAxes.channelToAxis[line.channel]}
                        stroke={line.color}
                        strokeDasharray="8 4"
                        strokeWidth={2}
                        label={{
                          value: line.shortLabel,
                          position: 'right',
                          fill: line.color,
                          fontSize: 9,
                          fontWeight: 'bold'
                        }}
                      />
                    ))}
                    <Brush
                      dataKey="Time"
                      height={20}
                      stroke="#22c55e"
                      travellerWidth={8}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'channels' && (
          <div className="space-y-4">
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
                        const hideAvg = param?.hideAverage;
                        const showMinOnly = param?.showMinOnly;
                        const showTimeInState = param?.showTimeInState || TIME_IN_STATE_CHANNELS.includes(channel);
                        const stateStats = timeInStateStats?.[channel];
                        const decimals = getDecimalPlaces(channel);

                        return (
                          <div
                            key={channel}
                            className="bg-slate-800/50 rounded-lg p-3"
                          >
                            <div className="font-medium text-sm">{param?.name || channel}</div>
                            {param?.description && (
                              <div className="text-xs text-slate-500 mb-1">{param.description}</div>
                            )}
                            {showTimeInState && stateStats && stateStats.length > 0 ? (
                              // Show time-in-state breakdown for categorical channels with progress bars
                              <div className="text-xs mt-2 space-y-2">
                                {stateStats.map((s, i) => (
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
                            ) : stats && (
                              <div className="text-xs text-slate-400 mt-1 space-y-0.5">
                                {showMinOnly ? (
                                  // Show only Min value for specific channels
                                  <div>Min: {stats.min.toFixed(decimals)} {param?.unit}</div>
                                ) : (
                                  <>
                                    <div>Min: {stats.min.toFixed(decimals)} {param?.unit}</div>
                                    <div>Max: {stats.max.toFixed(decimals)} {param?.unit}</div>
                                    {!hideAvg && (
                                      <div>Avg: {stats.avg.toFixed(decimals)} {param?.unit}</div>
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
                        {event.rpm.toFixed(0)} RPM
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
