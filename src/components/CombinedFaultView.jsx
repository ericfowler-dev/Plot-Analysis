import React, { useState, useMemo, useEffect, useRef, useLayoutEffect } from 'react';
import { AlertTriangle, CheckCircle, ChevronDown, ChevronRight, Filter, Search } from 'lucide-react';

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

const toTimelineLabel = (fault) => {
  if (!fault?.code) return 'DTC';
  const desc = fault.description || '';
  const shortDesc = desc.length > 16 ? desc.slice(0, 16) + '…' : desc;
  return shortDesc ? `${fault.code} – ${shortDesc}` : `DTC ${fault.code}`;
};

const CARD_WIDTH = 280;
const CARD_HEIGHT = 92;
const ROW_GAP = 8;
const HORIZONTAL_GAP = 14;
const AXIS_HEIGHT = 28;
const STREAM_PADDING_X = 40;
const VIEWPORT_BOTTOM_PADDING = 44;
const DEFAULT_VIEWPORT_HEIGHT = 720;

const buildTicks = (min, max, desired = 6) => {
  if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) {
    return [min || 0, (max || 1)];
  }
  const range = max - min;
  const rawStep = range / Math.max(1, desired - 1);
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const step = Math.max(magnitude, Math.ceil(rawStep / magnitude) * magnitude / 2);
  const ticks = [];
  const first = Math.floor(min / step) * step;
  for (let v = first; v <= max + step * 0.5; v += step) {
    ticks.push(v);
  }
  return ticks;
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
const FaultDetail = ({ fault }) => {
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
  const layoutRootRef = useRef(null);
  const [viewportHeight, setViewportHeight] = useState(DEFAULT_VIEWPORT_HEIGHT);

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
        const status = fault.occurredThisCycle ? 'active' : 'stored';
        return {
          filteredIndex,
          hour,
          lane: fault.sourceRole === 'primary' ? 1 : 2,
          code: fault.code,
          description: fault.description,
          timelineLabel: toTimelineLabel(fault),
          sourceRole: fault.sourceRole,
          occurrenceCount: fault.occurrenceCount,
          sourceFileName: fault.sourceFileName,
          status,
          fault
        };
      })
      .filter(Boolean)
      // Keep rendering cost predictable on very large data sets.
      .slice(0, 240);
  }, [filteredFaults]);

  const eventStreamRef = useRef(null);
  const [streamViewport, setStreamViewport] = useState({ width: 1200, height: 240 });

  useLayoutEffect(() => {
    if (!layoutRootRef.current || typeof window === 'undefined') return undefined;

    let frameId = null;

    const updateHeight = () => {
      if (!layoutRootRef.current) return;
      const rect = layoutRootRef.current.getBoundingClientRect();
      const available = window.innerHeight - rect.top - VIEWPORT_BOTTOM_PADDING;
      const nextHeight = Number.isFinite(available) && available > 0
        ? Math.floor(available)
        : DEFAULT_VIEWPORT_HEIGHT;
      setViewportHeight((prev) => (prev === nextHeight ? prev : nextHeight));
    };

    const scheduleUpdate = () => {
      if (frameId !== null) {
        cancelAnimationFrame(frameId);
      }
      frameId = requestAnimationFrame(() => {
        frameId = null;
        updateHeight();
      });
    };

    updateHeight();
    window.addEventListener('resize', scheduleUpdate);

    let observer = null;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(scheduleUpdate);
      observer.observe(layoutRootRef.current);
    }

    return () => {
      window.removeEventListener('resize', scheduleUpdate);
      if (observer) observer.disconnect();
      if (frameId !== null) cancelAnimationFrame(frameId);
    };
  }, []);

  useLayoutEffect(() => {
    if (!eventStreamRef.current) return undefined;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry?.contentRect) return;
      setStreamViewport((prev) => {
        const nextWidth = Math.max(1, Math.round(entry.contentRect.width || prev.width));
        const nextHeight = Math.max(1, Math.round(entry.contentRect.height || prev.height));
        if (nextWidth === prev.width && nextHeight === prev.height) return prev;
        return { width: nextWidth, height: nextHeight };
      });
    });
    observer.observe(eventStreamRef.current);
    return () => observer.disconnect();
  }, []);

  const timelineDomain = useMemo(() => {
    const values = timelinePoints.map((point) => point.hour);
    if (values.length === 0) return [0, 1];
    const min = Math.min(...values);
    const max = Math.max(...values);
    const padding = Math.max(0.5, Math.max(1e-3, max - min) * 0.06);
    return [Math.max(0, min - padding), max + padding];
  }, [timelinePoints]);

  const streamLayout = useMemo(() => {
    if (timelinePoints.length === 0) {
      return {
        cards: [],
        width: streamViewport.width || 1200,
        height: CARD_HEIGHT + AXIS_HEIGHT + ROW_GAP,
        axisY: CARD_HEIGHT,
        ticks: []
      };
    }

    const [domainMin, domainMax] = timelineDomain;
    const hourRange = Math.max(0.01, domainMax - domainMin);
    const viewportWidth = Math.max(320, streamViewport.width || 1200);
    const pxPerHour = (viewportWidth - STREAM_PADDING_X * 2) / hourRange;
    const contentWidth = viewportWidth;

    const roleWeight = (role) => (role === 'primary' ? 0 : 1);
    const compareCards = (a, b) => {
      if (sortBy === 'recency') {
        return (b.hour ?? 0) - (a.hour ?? 0);
      }
      if (sortBy === 'code') {
        return (a.code || '').localeCompare(b.code || '');
      }
      if (sortBy === 'status') {
        const diff = (a.status === 'active' ? 0 : 1) - (b.status === 'active' ? 0 : 1);
        if (diff !== 0) return diff;
        return (b.hour ?? 0) - (a.hour ?? 0);
      }
      if (sortBy === 'ecm') {
        const diff = roleWeight(a.sourceRole) - roleWeight(b.sourceRole);
        if (diff !== 0) return diff;
        return (b.hour ?? 0) - (a.hour ?? 0);
      }
      if (sortBy === 'count') {
        return (b.occurrenceCount || 0) - (a.occurrenceCount || 0);
      }
      return (a.hour ?? 0) - (b.hour ?? 0);
    };

    const ordered = [...timelinePoints].sort(compareCards);
    // Interval-based packing: track all [left, right] spans per row so cards
    // on opposite sides of the timeline can share the same row.
    const rowIntervals = []; // Array of arrays: [[left, right], ...]
    const cards = ordered.map((point) => {
      const hourX = STREAM_PADDING_X + (point.hour - domainMin) * pxPerHour;
      const rawLeft = hourX - CARD_WIDTH / 2;
      const clampedLeft = Math.max(0, Math.min(rawLeft, contentWidth - CARD_WIDTH - STREAM_PADDING_X));
      const cardRight = clampedLeft + CARD_WIDTH;

      let row = 0;
      for (; row < rowIntervals.length; row++) {
        const fits = rowIntervals[row].every(
          ([l, r]) => cardRight + HORIZONTAL_GAP <= l || clampedLeft >= r + HORIZONTAL_GAP
        );
        if (fits) break;
      }
      if (row === rowIntervals.length) {
        rowIntervals.push([[clampedLeft, cardRight]]);
      } else {
        rowIntervals[row].push([clampedLeft, cardRight]);
      }

      return {
        ...point,
        x: clampedLeft,
        connectorX: hourX,
        row
      };
    });

    const rowCount = Math.max(1, rowIntervals.length);
    const axisY = rowCount * (CARD_HEIGHT + ROW_GAP);
    const height = axisY + AXIS_HEIGHT;
    const ticks = buildTicks(domainMin, domainMax, 6);

    return { cards, width: contentWidth, height, axisY, ticks };
  }, [timelinePoints, timelineDomain, streamViewport.width, sortBy]);

  const timelineScale = useMemo(() => {
    const scaleX = streamLayout.width > 0 && streamViewport.width
      ? Math.min(1, streamViewport.width / streamLayout.width)
      : 1;
    const scaleY = streamLayout.height > 0 && streamViewport.height
      ? Math.min(1, streamViewport.height / streamLayout.height)
      : 1;
    return Math.min(scaleX, scaleY);
  }, [streamLayout.width, streamLayout.height, streamViewport.width, streamViewport.height]);

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
    <div
      ref={layoutRootRef}
      className="flex min-h-0 flex-col gap-2 overflow-hidden"
      style={{ height: `${viewportHeight}px` }}
    >
      {/* Summary Stats */}
      <div className="grid grid-cols-4 gap-2 shrink-0">
        <button
          onClick={() => setSourceFilter('all')}
          className={`p-2 rounded-lg border transition-all ${
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
          className={`p-2 rounded-lg border transition-all ${
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
          className={`p-2 rounded-lg border transition-all ${
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
          className={`p-2 rounded-lg border transition-all ${
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
      <div className="flex items-center gap-3 shrink-0">
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
            <option value="status">Sort by Status</option>
            <option value="ecm">Sort by ECM</option>
          </select>
        </div>
      </div>

      {/* Correlated Fault Timeline — content-sized, capped at 40% of viewport */}
      <div className="bg-slate-900/50 rounded-xl border border-slate-800 p-3 flex min-h-0 shrink-0 flex-col"
        style={{ maxHeight: `${Math.max(200, Math.floor(viewportHeight * 0.4))}px` }}
      >
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <div>
            <div className="text-sm font-semibold text-slate-200">Fault Timeline Correlation</div>
            <div className="text-xs text-slate-500">Cards are packed into rows to avoid overlap. Click a card for details.</div>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-xs">
            <div className="text-blue-300">Primary Hours: <span className="font-mono text-white">{formatNumber(primaryEngineHours, 1)}h</span></div>
            <div className="text-orange-300">Secondary Hours: <span className="font-mono text-white">{formatNumber(secondaryEngineHours, 1)}h</span></div>
          </div>
        </div>

        {timelinePoints.length === 0 ? (
          <div className="text-sm text-slate-500 py-6 text-center flex-1 min-h-0">
            No numeric hour data available for timeline plotting.
          </div>
        ) : (
          <>
            <div
              ref={eventStreamRef}
              className="relative border border-slate-800 rounded-lg bg-slate-950/40 overflow-hidden flex-1 min-h-[180px]"
            >
              {(() => {
                // Cards render at natural size; container scales to keep everything visible without scrollbars
                const scaledHeight = streamLayout.height;
                const scaledAxisY = streamLayout.axisY;

                return (
                  <div
                    className="relative"
                    style={{
                      width: `${streamLayout.width}px`,
                      height: `${scaledHeight}px`,
                      paddingBottom: `${AXIS_HEIGHT}px`,
                      transform: timelineScale < 1 ? `scale(${timelineScale})` : undefined,
                      transformOrigin: 'top left'
                    }}
                  >
                    {/* Connector lines */}
                    {streamLayout.cards.map((card) => {
                      const top = card.row * (CARD_HEIGHT + ROW_GAP);
                      const lineTop = top + CARD_HEIGHT;
                      const lineHeight = Math.max(0, scaledAxisY - lineTop);
                      const connectorColor = card.sourceRole === 'primary' ? '#38bdf8' : '#fb923c';
                      return (
                        <div
                          key={`line-${card.filteredIndex}-${card.row}`}
                          className="absolute"
                          style={{
                            left: `${card.connectorX}px`,
                            top: `${lineTop}px`,
                            width: '2px',
                            height: `${lineHeight}px`,
                            background: `linear-gradient(180deg, ${connectorColor} 0%, ${connectorColor}44 100%)`,
                            boxShadow: `0 0 6px ${connectorColor}66`
                          }}
                        >
                          <div
                            className="absolute left-1/2 -translate-x-1/2 w-2 h-2 rounded-full"
                            style={{
                              bottom: '-2px',
                              backgroundColor: connectorColor,
                              boxShadow: `0 0 8px ${connectorColor}99`
                            }}
                          />
                        </div>
                      );
                    })}

                    {/* Cards */}
                    {streamLayout.cards.map((card) => {
                      const top = card.row * (CARD_HEIGHT + ROW_GAP);
                      const isSelected = card.filteredIndex === selectedFaultIndex;
                      const statusColor = card.status === 'active'
                        ? 'bg-red-500/20 text-red-300 border-red-500/40'
                        : 'bg-amber-500/10 text-amber-200 border-amber-400/30';
                      return (
                        <div
                          key={`card-${card.filteredIndex}-${card.row}`}
                          className={`absolute dtc-event-chip bg-slate-900/90 border border-slate-700 rounded-lg shadow-lg transition-all hover:border-emerald-400/60 hover:shadow-emerald-500/15 cursor-pointer ${
                            isSelected ? 'ring-2 ring-emerald-400/70 shadow-emerald-500/20' : ''
                          }`}
                          style={{
                            left: `${card.x}px`,
                            top: `${top}px`,
                            width: `${CARD_WIDTH}px`,
                            minHeight: `${CARD_HEIGHT}px`,
                            maxHeight: `${CARD_HEIGHT}px`,
                            padding: '8px 12px',
                            overflow: 'hidden'
                          }}
                          onClick={() => setSelectedFaultIndex(card.filteredIndex)}
                          title={card.description || 'Fault'}
                        >
                          <div className="flex items-center justify-between text-[11px]">
                            <SourceBadge role={card.sourceRole} />
                            <span className="text-slate-300 font-mono">{formatNumber(card.hour, 1)}h</span>
                          </div>
                          <div className="flex items-center justify-between mt-1">
                            <div className="text-green-400 font-mono font-bold text-lg leading-tight">DTC {card.code}</div>
                            <span className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${statusColor}`}>
                              {card.status === 'active' ? 'ACTIVE' : 'STORED'}
                            </span>
                          </div>
                          {card.description && (
                            <div className="text-xs text-slate-400 truncate mt-0.5" title={card.description}>
                              {card.description}
                            </div>
                          )}
                          <div className="flex items-center justify-between text-[11px] text-slate-400 mt-1">
                            <span>Count: <span className="text-white font-mono">{card.occurrenceCount || 0}</span></span>
                            <span className="text-slate-500 truncate" title={card.sourceFileName}>
                              File
                            </span>
                          </div>
                        </div>
                      );
                    })}

                    {/* Static axis for connector targets */}
                    <div
                      className="absolute left-0 right-0 border-t border-slate-700"
                      style={{
                        top: `${scaledAxisY}px`,
                        height: `${AXIS_HEIGHT}px`,
                        background: 'linear-gradient(180deg, rgba(15,23,42,0.75), rgba(15,23,42,0.95))'
                      }}
                    >
                      <div className="relative h-full">
                        {streamLayout.ticks.map((tick) => {
                          const x = STREAM_PADDING_X + ((tick - timelineDomain[0]) / (timelineDomain[1] - timelineDomain[0])) * (streamLayout.width - STREAM_PADDING_X * 2);
                          return (
                            <div key={tick} className="absolute text-[10px] text-slate-300 flex flex-col items-center" style={{ left: `${x}px`, bottom: 0 }}>
                              <div className="w-px h-3 bg-slate-500" />
                              <div className="mt-1 font-mono">{formatNumber(tick, 1)}h</div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
            <div className="flex items-center justify-center gap-6 mt-2 text-xs shrink-0">
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-blue-400" />
                <span className="text-blue-300">Primary ECM</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-orange-400" />
                <span className="text-orange-300">Secondary ECM</span>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Main content - Master-Detail layout */}
      <div className="flex gap-4 min-h-0 flex-1">
        {/* Fault List */}
        <div className="w-1/2 flex flex-col overflow-hidden min-h-0">
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
        <div className="w-1/2 bg-slate-900/30 rounded-xl border border-slate-800 p-4 overflow-hidden min-h-0">
          <FaultDetail
            fault={selectedFault}
          />
        </div>
      </div>
    </div>
  );
};

export default CombinedFaultView;
