import React, { useState, useMemo, useEffect } from 'react';
import { AlertTriangle, CheckCircle, ChevronDown, ChevronRight, Filter, Search } from 'lucide-react';
import { ResponsiveContainer, ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine } from 'recharts';

// =============================================================================
// COMBINED FAULT VIEW COMPONENT
// Unified fault list showing faults from both Primary and Secondary ECMs
// =============================================================================

const formatNumber = (value, decimals = null) => {
  if (value === null || value === undefined || value === '') return '-';
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num)) return String(value).replace(/"/g, '');
  if (decimals !== null) return num.toFixed(decimals);
  return String(num);
};

const parseHours = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const numeric = typeof value === 'number' ? value : parseFloat(value);
  return Number.isFinite(numeric) ? numeric : null;
};

// Source badge component
const SourceBadge = ({ role }) => {
  const isPrimary = role === 'primary';
  return (
    <span className={`
      px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide
      ${isPrimary
        ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
        : 'bg-orange-500/20 text-orange-400 border border-orange-500/30'
      }
    `} style={{ fontFamily: 'Orbitron, sans-serif' }}>
      {isPrimary ? 'Primary' : 'Secondary'}
    </span>
  );
};

const FaultTimelineTooltip = ({ active, payload }) => {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0]?.payload;
  if (!point) return null;
  return (
    <div className="bg-slate-900 border border-slate-600 rounded-lg p-3 text-xs shadow-xl max-w-xs">
      <div className="text-green-400 font-mono font-bold mb-1">DTC {point.code}</div>
      <div className="text-white mb-2 line-clamp-2">{point.description || 'Unknown fault'}</div>
      <div className="space-y-1 text-slate-300">
        <div>
          Side: <span className={point.sourceRole === 'primary' ? 'text-blue-300' : 'text-orange-300'}>
            {point.sourceRole === 'primary' ? 'Primary ECM' : 'Secondary ECM'}
          </span>
        </div>
        <div>Last occurrence: <span className="text-white font-mono">{formatNumber(point.hour, 2)}h</span></div>
        <div>Count: <span className="text-white font-mono">{point.occurrenceCount || 0}</span></div>
        <div className="text-slate-400 truncate" title={point.sourceFileName}>File: {point.sourceFileName}</div>
      </div>
    </div>
  );
};

// Fault item row
const FaultRow = ({ fault, isSelected, onClick, engineHours }) => {
  // Calculate recency
  const delta = engineHours && fault.lastOccurrence
    ? engineHours - parseFloat(fault.lastOccurrence)
    : null;

  const recencyLabel = delta !== null && delta <= 2 ? 'CURRENT'
    : delta !== null && delta <= 50 ? 'RECENT'
    : null;

  const recencyClass = recencyLabel === 'CURRENT'
    ? 'bg-red-500/20 text-red-300 border-red-500/40'
    : recencyLabel === 'RECENT'
      ? 'bg-yellow-500/20 text-yellow-200 border-yellow-400/40'
      : '';

  return (
    <div
      onClick={onClick}
      className={`
        p-3 rounded-lg cursor-pointer transition-all border
        ${isSelected
          ? 'bg-green-500/20 border-green-500/50 shadow-lg shadow-green-500/10'
          : 'bg-slate-800/50 border-slate-700/30 hover:bg-slate-800 hover:border-slate-600'
        }
      `}
    >
      {/* Header row */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className={`font-mono font-bold ${isSelected ? 'text-green-400' : 'text-green-500'}`}>
            DTC {fault.code}
          </span>
          <SourceBadge role={fault.sourceRole} />
        </div>
        <div className="flex items-center gap-2">
          {fault.causedShutdown && (
            <span className="px-1.5 py-0.5 rounded text-[10px] bg-red-500/30 text-red-400 font-medium flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />
              SHUTDOWN
            </span>
          )}
          {recencyLabel && (
            <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${recencyClass}`}>
              {recencyLabel}
            </span>
          )}
        </div>
      </div>

      {/* Description */}
      <div className="text-sm text-white mb-2 line-clamp-1">{fault.description || 'Unknown fault'}</div>

      {/* Quick stats */}
      <div className="flex items-center gap-4 text-[11px] text-slate-400">
        <span>Count: <span className="text-white font-mono">{fault.occurrenceCount || 0}</span></span>
        <span>Last: <span className="text-white font-mono">{formatNumber(fault.lastOccurrence, 2)}h</span></span>
        <span className="text-slate-500 truncate" title={fault.sourceFileName}>
          File: {fault.sourceFileName}
        </span>
      </div>
    </div>
  );
};

// Fault detail panel
const FaultDetail = ({ fault, engineHours }) => {
  const [showRaw, setShowRaw] = useState(false);

  if (!fault) {
    return (
      <div className="flex items-center justify-center h-full text-slate-500">
        <p>Select a fault to view details</p>
      </div>
    );
  }

  const snapshot = fault.snapshot || {};
  const snapshotKeys = Object.keys(snapshot);

  return (
    <div className="h-full overflow-y-auto">
      {/* Header */}
      <div className="bg-slate-800/50 rounded-lg p-4 mb-4">
        <div className="flex items-start justify-between mb-3">
          <div>
            <div className="text-green-400 font-mono font-bold text-lg">DTC {fault.code}</div>
            <div className="text-white text-base">{fault.description || 'Unknown fault'}</div>
          </div>
          <SourceBadge role={fault.sourceRole} />
        </div>

        {/* Key metrics */}
        <div className="grid grid-cols-4 gap-3">
          <div className="bg-slate-900/50 rounded p-2">
            <div className="text-[10px] text-slate-500 uppercase">Occurrences</div>
            <div className="text-white font-mono font-bold">{fault.occurrenceCount || 0}</div>
          </div>
          <div className="bg-slate-900/50 rounded p-2">
            <div className="text-[10px] text-slate-500 uppercase">First @ Hours</div>
            <div className="text-white font-mono font-bold">{formatNumber(fault.initialOccurrence, 2)}</div>
          </div>
          <div className="bg-slate-900/50 rounded p-2">
            <div className="text-[10px] text-slate-500 uppercase">Last @ Hours</div>
            <div className="text-white font-mono font-bold">{formatNumber(fault.lastOccurrence, 2)}</div>
          </div>
          <div className="bg-slate-900/50 rounded p-2">
            <div className="text-[10px] text-slate-500 uppercase">Starts Since</div>
            <div className="text-white font-mono font-bold">{fault.startsSinceActive || 0}</div>
          </div>
        </div>

        {/* Status badges */}
        <div className="flex gap-2 mt-3">
          {fault.causedShutdown && (
            <span className="px-2 py-1 rounded text-xs bg-red-500/30 text-red-400">
              Caused Shutdown
            </span>
          )}
          {fault.occurredThisCycle && (
            <span className="px-2 py-1 rounded text-xs bg-orange-500/30 text-orange-400">
              Active This Cycle
            </span>
          )}
        </div>
      </div>

      {/* Snapshot data */}
      {snapshotKeys.length > 0 && (
        <div className="bg-slate-800/30 rounded-lg overflow-hidden">
          <button
            className="w-full flex items-center justify-between p-3 bg-slate-800/50 hover:bg-slate-800/70 transition-colors"
            onClick={() => setShowRaw(!showRaw)}
          >
            <span className="text-sm font-semibold text-slate-300">
              Snapshot Data ({snapshotKeys.length} fields)
            </span>
            {showRaw ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
          </button>

          {showRaw && (
            <div className="p-3 max-h-64 overflow-y-auto">
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs font-mono">
                {snapshotKeys.map(key => (
                  <div key={key} className="flex justify-between py-1 border-b border-slate-700/30">
                    <span className="text-slate-400">{key}</span>
                    <span className="text-white">{formatNumber(snapshot[key], 4)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Source file info */}
      <div className="mt-4 p-3 bg-slate-800/30 rounded-lg">
        <div className="text-xs text-slate-500 uppercase mb-1">Source File</div>
        <div className="text-sm text-white font-mono truncate" title={fault.sourceFileName}>
          {fault.sourceFileName}
        </div>
      </div>
    </div>
  );
};

// Main CombinedFaultView component
const CombinedFaultView = ({
  combinedFaults = [],
  ecmComparisonStats = null,
  primaryEngineHours = null,
  secondaryEngineHours = null
}) => {
  const [selectedFaultIndex, setSelectedFaultIndex] = useState(null);
  const [sourceFilter, setSourceFilter] = useState('all'); // 'all', 'primary', 'secondary', 'matching'
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('recency'); // 'recency', 'count', 'code'

  // Calculate engine hours for the selected fault
  const getEngineHours = (fault) => {
    return fault?.sourceRole === 'primary' ? primaryEngineHours : secondaryEngineHours;
  };

  // Find matching faults (same code on both ECMs)
  const matchingCodes = useMemo(() => {
    const primaryCodes = new Set(
      combinedFaults.filter(f => f.sourceRole === 'primary').map(f => f.code)
    );
    const secondaryCodes = new Set(
      combinedFaults.filter(f => f.sourceRole === 'secondary').map(f => f.code)
    );
    const matching = new Set();
    primaryCodes.forEach(code => {
      if (secondaryCodes.has(code)) matching.add(code);
    });
    return matching;
  }, [combinedFaults]);

  // Filter and sort faults
  const filteredFaults = useMemo(() => {
    let filtered = [...combinedFaults];

    // Apply source filter
    if (sourceFilter === 'primary') {
      filtered = filtered.filter(f => f.sourceRole === 'primary');
    } else if (sourceFilter === 'secondary') {
      filtered = filtered.filter(f => f.sourceRole === 'secondary');
    } else if (sourceFilter === 'matching') {
      filtered = filtered.filter(f => matchingCodes.has(f.code));
    }

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(f =>
        f.code?.toLowerCase().includes(query) ||
        f.description?.toLowerCase().includes(query)
      );
    }

    // Sort
    filtered.sort((a, b) => {
      if (sortBy === 'recency') {
        const aLast = parseFloat(a.lastOccurrence) || 0;
        const bLast = parseFloat(b.lastOccurrence) || 0;
        return bLast - aLast;
      }
      if (sortBy === 'count') {
        return (b.occurrenceCount || 0) - (a.occurrenceCount || 0);
      }
      if (sortBy === 'code') {
        return (a.code || '').localeCompare(b.code || '');
      }
      return 0;
    });

    return filtered;
  }, [combinedFaults, sourceFilter, searchQuery, sortBy, matchingCodes]);

  useEffect(() => {
    if (selectedFaultIndex === null) return;
    if (selectedFaultIndex >= filteredFaults.length) {
      setSelectedFaultIndex(null);
    }
  }, [filteredFaults.length, selectedFaultIndex]);

  const timelinePoints = useMemo(() => {
    return filteredFaults
      .map((fault, filteredIndex) => {
        const hour = parseHours(fault.lastOccurrence);
        if (!Number.isFinite(hour)) return null;
        return {
          filteredIndex,
          hour,
          lane: fault.sourceRole === 'primary' ? 1 : 2,
          code: fault.code,
          description: fault.description,
          sourceRole: fault.sourceRole,
          occurrenceCount: fault.occurrenceCount,
          sourceFileName: fault.sourceFileName
        };
      })
      .filter(Boolean)
      // Keep rendering cost predictable on very large data sets.
      .slice(0, 240);
  }, [filteredFaults]);

  const primaryTimelinePoints = useMemo(
    () => timelinePoints.filter((point) => point.sourceRole === 'primary'),
    [timelinePoints]
  );
  const secondaryTimelinePoints = useMemo(
    () => timelinePoints.filter((point) => point.sourceRole === 'secondary'),
    [timelinePoints]
  );

  const timelineDomain = useMemo(() => {
    const values = timelinePoints.map((point) => point.hour);
    const primaryHoursValue = parseHours(primaryEngineHours);
    const secondaryHoursValue = parseHours(secondaryEngineHours);
    if (Number.isFinite(primaryHoursValue)) values.push(primaryHoursValue);
    if (Number.isFinite(secondaryHoursValue)) values.push(secondaryHoursValue);
    if (values.length === 0) return [0, 1];
    const min = Math.min(...values);
    const max = Math.max(...values);
    const padding = Math.max(0.5, (max - min) * 0.06);
    return [Math.max(0, min - padding), max + padding];
  }, [timelinePoints, primaryEngineHours, secondaryEngineHours]);

  const selectedFault = selectedFaultIndex !== null ? filteredFaults[selectedFaultIndex] : null;

  // Counts
  const primaryCount = combinedFaults.filter(f => f.sourceRole === 'primary').length;
  const secondaryCount = combinedFaults.filter(f => f.sourceRole === 'secondary').length;
  const matchingCount = ecmComparisonStats?.matchingFaults ?? matchingCodes.size;

  if (combinedFaults.length === 0) {
    return (
      <div className="bg-slate-900/50 rounded-xl border border-slate-800 p-8 text-center">
        <CheckCircle className="w-12 h-12 mx-auto mb-4 text-emerald-500/50" />
        <p className="text-emerald-400 font-medium">No faults recorded</p>
        <p className="text-slate-500 text-sm mt-1">Both ECMs report no stored fault codes</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary Stats */}
      <div className="grid grid-cols-4 gap-3">
        <button
          onClick={() => setSourceFilter('all')}
          className={`p-3 rounded-lg border transition-all ${
            sourceFilter === 'all'
              ? 'bg-green-500/20 border-green-500/50'
              : 'bg-slate-900/50 border-slate-700 hover:border-slate-600'
          }`}
        >
          <div className="text-[10px] text-slate-500 uppercase">Total Faults</div>
          <div className="text-xl font-bold text-white font-mono">{combinedFaults.length}</div>
        </button>
        <button
          onClick={() => setSourceFilter('primary')}
          className={`p-3 rounded-lg border transition-all ${
            sourceFilter === 'primary'
              ? 'bg-blue-500/20 border-blue-500/50'
              : 'bg-slate-900/50 border-slate-700 hover:border-slate-600'
          }`}
        >
          <div className="text-[10px] text-blue-400 uppercase">Primary ECM</div>
          <div className="text-xl font-bold text-blue-400 font-mono">{primaryCount}</div>
        </button>
        <button
          onClick={() => setSourceFilter('secondary')}
          className={`p-3 rounded-lg border transition-all ${
            sourceFilter === 'secondary'
              ? 'bg-orange-500/20 border-orange-500/50'
              : 'bg-slate-900/50 border-slate-700 hover:border-slate-600'
          }`}
        >
          <div className="text-[10px] text-orange-400 uppercase">Secondary ECM</div>
          <div className="text-xl font-bold text-orange-400 font-mono">{secondaryCount}</div>
        </button>
        <button
          onClick={() => setSourceFilter('matching')}
          className={`p-3 rounded-lg border transition-all ${
            sourceFilter === 'matching'
              ? 'bg-yellow-500/20 border-yellow-500/50'
              : 'bg-slate-900/50 border-slate-700 hover:border-slate-600'
          }`}
        >
          <div className="text-[10px] text-yellow-400 uppercase">Matching DTCs</div>
          <div className="text-xl font-bold text-yellow-400 font-mono">{matchingCount}</div>
        </button>
      </div>

      {/* Search and Sort */}
      <div className="flex items-center gap-3">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            placeholder="Search by DTC code or description..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-800/50 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-green-500/50"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-slate-500" />
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-green-500/50"
          >
            <option value="recency">Sort by Recency</option>
            <option value="count">Sort by Count</option>
            <option value="code">Sort by Code</option>
          </select>
        </div>
      </div>

      {/* Correlated Fault Timeline */}
      <div className="bg-slate-900/50 rounded-xl border border-slate-800 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <div>
            <div className="text-sm font-semibold text-slate-200">Fault Timeline Correlation</div>
            <div className="text-xs text-slate-500">X-axis = engine hours, with role-specific DTC events from both ECMs.</div>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-xs">
            <div className="text-blue-300">Primary Hours: <span className="font-mono text-white">{formatNumber(primaryEngineHours, 1)}h</span></div>
            <div className="text-orange-300">Secondary Hours: <span className="font-mono text-white">{formatNumber(secondaryEngineHours, 1)}h</span></div>
          </div>
        </div>

        {timelinePoints.length === 0 ? (
          <div className="text-sm text-slate-500 py-6 text-center">
            No numeric hour data available for timeline plotting.
          </div>
        ) : (
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 10, right: 20, left: 10, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis
                  type="number"
                  dataKey="hour"
                  domain={timelineDomain}
                  stroke="#94a3b8"
                  tick={{ fontSize: 11 }}
                  tickFormatter={(value) => `${formatNumber(value, 1)}h`}
                />
                <YAxis
                  type="number"
                  dataKey="lane"
                  domain={[0.5, 2.5]}
                  ticks={[1, 2]}
                  stroke="#94a3b8"
                  tick={{ fontSize: 11 }}
                  tickFormatter={(value) => (value === 1 ? 'Primary' : 'Secondary')}
                />
                <Tooltip content={<FaultTimelineTooltip />} />

                {timelinePoints.slice(0, 120).map((point, idx) => (
                  <ReferenceLine
                    key={`fault-line-${point.code}-${idx}`}
                    x={point.hour}
                    stroke={point.sourceRole === 'primary' ? 'rgba(96,165,250,0.25)' : 'rgba(251,146,60,0.25)'}
                    strokeWidth={1}
                  />
                ))}

                <Scatter
                  name="Primary ECM"
                  data={primaryTimelinePoints}
                  fill="#60a5fa"
                  onClick={(point) => {
                    if (typeof point?.payload?.filteredIndex === 'number') {
                      setSelectedFaultIndex(point.payload.filteredIndex);
                    }
                  }}
                />
                <Scatter
                  name="Secondary ECM"
                  data={secondaryTimelinePoints}
                  fill="#fb923c"
                  onClick={(point) => {
                    if (typeof point?.payload?.filteredIndex === 'number') {
                      setSelectedFaultIndex(point.payload.filteredIndex);
                    }
                  }}
                />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Main content - Master-Detail layout */}
      <div className="flex gap-4" style={{ minHeight: '500px' }}>
        {/* Fault List */}
        <div className="w-1/2 flex flex-col">
          <div className="text-xs text-slate-500 uppercase tracking-wider mb-2 px-1">
            {filteredFaults.length} Fault{filteredFaults.length !== 1 ? 's' : ''} Found
          </div>
          <div className="flex-1 overflow-y-auto space-y-2 pr-2">
            {filteredFaults.map((fault, idx) => (
              <FaultRow
                key={`${fault.code}-${fault.sourceFileId}-${idx}`}
                fault={fault}
                isSelected={selectedFaultIndex === idx}
                onClick={() => setSelectedFaultIndex(idx)}
                engineHours={getEngineHours(fault)}
              />
            ))}
            {filteredFaults.length === 0 && (
              <div className="text-center py-8 text-slate-500">
                No faults match the current filter
              </div>
            )}
          </div>
        </div>

        {/* Fault Detail */}
        <div className="w-1/2 bg-slate-900/30 rounded-xl border border-slate-800 p-4">
          <FaultDetail
            fault={selectedFault}
            engineHours={selectedFault ? getEngineHours(selectedFault) : null}
          />
        </div>
      </div>
    </div>
  );
};

export default CombinedFaultView;
