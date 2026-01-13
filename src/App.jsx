import React, { useState, useMemo, useEffect, useCallback, useRef, useReducer, Component } from 'react';
import {
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, AreaChart, Area, ReferenceLine,
  ScatterChart, Scatter, Cell, BarChart, Bar
} from 'recharts';
import {
  FileSpreadsheet, Upload, AlertCircle, AlertTriangle, Clock, Zap,
  ThermometerSun, Battery, Activity, Gauge, Cpu, CheckCircle,
  ShieldAlert, Calendar, ChevronDown, ChevronRight, Table, X,
  Play, Pause, SkipBack, SkipForward, Camera, TrendingUp, Info,
  Search, Flag, Eye, Settings, BarChart3, Wrench
} from 'lucide-react';

// Import ECM-specific modules
import {
  parseECMData, formatHistogramForChart, extractECMStats
} from './lib/parsers';
import {
  ECM_THRESHOLDS, ECM_FAULT_MAPPING, ECM_SEVERITY_MAP, ECM_HISTOGRAM_CONFIG,
  ECM_PARAMETERS, ECM_FUEL_TYPES, ECM_SYSTEM_STATES, detectECMProduct
} from './lib/thresholds';
import {
  processAllHistograms, processFaultData, analyzeECMData, generateSummaryStats
} from './lib/processData';
import {
  VARIABLE_DEFINITIONS, VARIABLE_CATEGORIES, getVariableInfo, formatVariableValue, groupSnapshotByCategory
} from './lib/variableDefinitions';

// Import B-Plot modules
import { parseBPlotData } from './lib/bplotParsers';
import { processBPlotData } from './lib/bplotProcessData';
import BPlotAnalysis from './components/BPlotAnalysis';

// File type constants
const FILE_TYPES = {
  ECM: 'ecm',
  BPLOT: 'bplot',
  UNKNOWN: 'unknown'
};

// =============================================================================
// DEBUG FLAG - Set to true to enable console logging
// =============================================================================
const DEBUG = false;
const PERF = false;
const MAX_FILE_SIZE_MB = 50;
const WARN_FILE_SIZE_MB = 20;
const MB_BYTES = 1024 * 1024;

const perfNow = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

// =============================================================================
// FORMATTING HELPERS - No commas in numeric fields per requirements
// =============================================================================
const formatNumber = (value, decimals = null) => {
  if (value === null || value === undefined || value === '') return '—';
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num)) return String(value).replace(/"/g, '');
  // No commas - return plain number with optional decimal precision
  if (decimals !== null) return num.toFixed(decimals);
  return String(num);
};

const stripQuotes = (value) => {
  if (!value) return '—';
  return String(value).replace(/"/g, '');
};

// Threshold constants per requirements
const THRESHOLDS = {
  IDLE_RPM: 900,           // Idle: ≤ 900 RPM
  HIGH_LOAD_MAP: 24,       // High load: ≥ 24 PSIA
  COLD_ECT: 130,           // Cold: < 130°F
  HOT_ECT: 220             // Hot: > 220°F
};

// =============================================================================
// HELPER COMPONENTS
// =============================================================================
const InfoBox = ({ label, value, small, numeric }) => (
  <div className="bg-slate-800/50 rounded-lg p-4">
    <div className="text-xs text-slate-500 uppercase tracking-wider mb-1.5">{label}</div>
    <div className={`font-semibold ${small ? 'text-sm' : 'text-base'} text-white truncate font-mono`}>
      {numeric ? formatNumber(value) : (stripQuotes(value) || '—')}
    </div>
  </div>
);

const MetricCard = ({ icon, label, value, sub, unit, alert, info }) => {
  const [showInfo, setShowInfo] = useState(false);

  return (
    <div className={`bg-slate-900/50 rounded-xl border p-6 ${alert ? 'border-red-500/50' : 'border-slate-800'} relative`}>
      <div className="flex items-center gap-2 mb-4">
        <div className="w-9 h-9 rounded-lg bg-slate-800/50 flex items-center justify-center">{icon}</div>
        <div className="text-sm text-slate-400 uppercase tracking-wider font-medium flex-1">{label}</div>
        {info && (
          <div className="relative">
            <button
              onClick={() => setShowInfo(!showInfo)}
              className="w-5 h-5 rounded-full bg-slate-700 hover:bg-slate-600 flex items-center justify-center text-slate-400 hover:text-white transition-colors"
            >
              <Info className="w-3 h-3" />
            </button>
            {showInfo && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowInfo(false)} />
                <div className="absolute right-0 top-7 z-50 w-72 bg-slate-800 border border-slate-600 rounded-lg shadow-xl p-4 text-xs text-slate-300">
                  <div className="font-semibold text-white mb-2 text-sm">{label}</div>
                  {info}
                </div>
              </>
            )}
          </div>
        )}
      </div>
      <div className="text-2xl font-bold text-white font-mono">{value} {unit && <span className="text-lg text-slate-400">{unit}</span>}</div>
      {sub && <div className="text-sm text-slate-400 mt-2 font-mono">{sub}</div>}
    </div>
  );
};

const ChartCard = ({ title, icon, children, onClick }) => (
  <div
    className={`bg-slate-900/50 rounded-xl border border-slate-800 p-6 ${onClick ? 'cursor-pointer hover:border-slate-600 transition-colors' : ''}`}
    onClick={onClick}
  >
    <div className="flex items-center gap-2 mb-4 text-base font-semibold text-slate-300">
      {icon} {title}
    </div>
    {children}
  </div>
);

// =============================================================================
// HISTOGRAM SUMMARY CARDS - Per redesign requirements
// =============================================================================

// Card 1: Engine Speed vs Load (Usage Summary)
const SpeedLoadSummaryCard = ({ histogram, onClick }) => {
  if (!histogram || !histogram.data || histogram.data.length === 0) {
    return (
      <ChartCard title="Engine Speed vs Load" icon={<BarChart3 className="w-4 h-4 text-cyan-400" />}>
        <div className="text-slate-500 text-sm">No data available</div>
      </ChartCard>
    );
  }

  // Calculate statistics from histogram data
  let totalHours = 0;
  let idleHours = 0;
  let highLoadHours = 0;
  let minRPM = Infinity, maxRPM = 0;
  let minMAP = Infinity, maxMAP = 0;
  let primaryRPM = 0, primaryMAP = 0, primaryHours = 0;

  const yLabels = histogram.yLabels || [];
  const xLabels = histogram.xLabels || [];

  for (let y = 0; y < yLabels.length; y++) {
    for (let x = 0; x < xLabels.length; x++) {
      const value = histogram.data[y]?.[x] || 0;
      if (value > 0) {
        totalHours += value;
        const rpm = yLabels[y];
        const map = xLabels[x];

        if (rpm <= THRESHOLDS.IDLE_RPM) idleHours += value;
        if (map >= THRESHOLDS.HIGH_LOAD_MAP) highLoadHours += value;

        if (rpm < minRPM) minRPM = rpm;
        if (rpm > maxRPM) maxRPM = rpm;
        if (map < minMAP) minMAP = map;
        if (map > maxMAP) maxMAP = map;

        if (value > primaryHours) {
          primaryHours = value;
          primaryRPM = rpm;
          primaryMAP = map;
        }
      }
    }
  }

  const idlePercent = totalHours > 0 ? (idleHours / totalHours * 100) : 0;
  const highLoadPercent = totalHours > 0 ? (highLoadHours / totalHours * 100) : 0;

  return (
    <ChartCard title="Engine Speed vs Load" icon={<BarChart3 className="w-4 h-4 text-cyan-400" />} onClick={onClick}>
      <div className="space-y-3">
        <div className="flex justify-between text-sm">
          <span className="text-slate-400">Runtime</span>
          <span className="text-white font-mono">{formatNumber(totalHours, 2)} hours</span>
        </div>
        <div className="border-t border-slate-700 pt-3">
          <div className="text-xs text-slate-500 uppercase mb-2">Primary Operating Window</div>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div><span className="text-slate-400">RPM:</span> <span className="text-white font-mono">{formatNumber(minRPM, 0)}–{formatNumber(maxRPM, 0)}</span></div>
            <div><span className="text-slate-400">MAP:</span> <span className="text-white font-mono">{formatNumber(minMAP, 1)}–{formatNumber(maxMAP, 1)} PSIA</span></div>
          </div>
        </div>
        <div className="border-t border-slate-700 pt-3 grid grid-cols-2 gap-4">
          <div>
            <div className="text-xs text-slate-500">Idle (≤{THRESHOLDS.IDLE_RPM} RPM)</div>
            <div className="text-white font-mono">{formatNumber(idlePercent, 1)}%</div>
          </div>
          <div>
            <div className="text-xs text-slate-500">High Load (≥{THRESHOLDS.HIGH_LOAD_MAP} PSIA)</div>
            <div className="text-white font-mono">{formatNumber(highLoadPercent, 1)}%</div>
          </div>
        </div>
      </div>
    </ChartCard>
  );
};

// Card 2: Knock Detection Summary
const KnockSummaryCard = ({ histogram, onClick }) => {
  if (!histogram || !histogram.data || histogram.data.length === 0) {
    return (
      <ChartCard title="Knock Detection" icon={<Zap className="w-4 h-4 text-yellow-400" />}>
        <div className="text-slate-500 text-sm">No data available</div>
      </ChartCard>
    );
  }

  let totalSeconds = 0;
  let knockRPMMin = Infinity, knockRPMMax = 0;
  let knockMAPMin = Infinity, knockMAPMax = 0;
  let hasKnock = false;

  const yLabels = histogram.yLabels || [];
  const xLabels = histogram.xLabels || [];

  for (let y = 0; y < yLabels.length; y++) {
    for (let x = 0; x < xLabels.length; x++) {
      const value = histogram.data[y]?.[x] || 0;
      if (value > 0) {
        hasKnock = true;
        totalSeconds += value;
        const rpm = yLabels[y];
        const map = xLabels[x];
        if (rpm < knockRPMMin) knockRPMMin = rpm;
        if (rpm > knockRPMMax) knockRPMMax = rpm;
        if (map < knockMAPMin) knockMAPMin = map;
        if (map > knockMAPMax) knockMAPMax = map;
      }
    }
  }

  const totalMinutes = totalSeconds / 60;
  const totalHours = totalSeconds / 3600;

  return (
    <ChartCard title="Knock Detection" icon={<Zap className="w-4 h-4 text-yellow-400" />} onClick={onClick}>
      <div className="space-y-3">
        <div className="flex justify-between text-sm">
          <span className="text-slate-400">Total Knock Time</span>
          <span className="text-white font-mono">
            {totalHours >= 1
              ? `${formatNumber(totalHours, 2)} hrs`
              : totalMinutes >= 1
                ? `${formatNumber(totalMinutes, 1)} min`
                : `${formatNumber(totalSeconds, 1)} sec`}
          </span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-slate-400">Status</span>
          <span className={`font-semibold ${hasKnock ? 'text-yellow-400' : 'text-emerald-400'}`}>
            {hasKnock ? 'Detected' : 'None detected'}
          </span>
        </div>
        {hasKnock && (
          <div className="border-t border-slate-700 pt-3">
            <div className="text-xs text-slate-500 uppercase mb-2">Primary Knock Window</div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div><span className="text-slate-400">RPM:</span> <span className="text-white font-mono">{formatNumber(knockRPMMin, 0)}–{formatNumber(knockRPMMax, 0)}</span></div>
              <div><span className="text-slate-400">MAP:</span> <span className="text-white font-mono">{formatNumber(knockMAPMin, 1)}–{formatNumber(knockMAPMax, 1)} PSIA</span></div>
            </div>
          </div>
        )}
      </div>
    </ChartCard>
  );
};

// Card 3: Coolant Temperature (Thermal Summary)
const ECTSummaryCard = ({ histogram, onClick }) => {
  if (!histogram || !histogram.data || histogram.data.length === 0) {
    return (
      <ChartCard title="Coolant Temperature" icon={<ThermometerSun className="w-4 h-4 text-orange-400" />}>
        <div className="text-slate-500 text-sm">No data available</div>
      </ChartCard>
    );
  }

  let totalHours = 0;
  let coldHours = 0;   // < 130°F
  let normalHours = 0; // 130-220°F
  let hotHours = 0;    // > 220°F

  const xLabels = histogram.xLabels || [];
  const data = histogram.data[0] || [];

  for (let i = 0; i < xLabels.length; i++) {
    const temp = xLabels[i];
    const hours = data[i] || 0;
    totalHours += hours;

    if (temp < THRESHOLDS.COLD_ECT) {
      coldHours += hours;
    } else if (temp > THRESHOLDS.HOT_ECT) {
      hotHours += hours;
    } else {
      normalHours += hours;
    }
  }

  const coldPercent = totalHours > 0 ? (coldHours / totalHours * 100) : 0;
  const normalPercent = totalHours > 0 ? (normalHours / totalHours * 100) : 0;
  const hotPercent = totalHours > 0 ? (hotHours / totalHours * 100) : 0;

  return (
    <ChartCard title="Coolant Temperature" icon={<ThermometerSun className="w-4 h-4 text-orange-400" />} onClick={onClick}>
      <div className="space-y-3">
        <div className="flex justify-between text-sm">
          <span className="text-slate-400">Runtime</span>
          <span className="text-white font-mono">{formatNumber(totalHours, 2)} hours</span>
        </div>
        <div className="border-t border-slate-700 pt-3">
          <div className="text-xs text-slate-500 uppercase mb-2">Time in Temperature Bands</div>
          {/* Stacked bar visualization */}
          <div className="h-4 rounded-full overflow-hidden flex bg-slate-700 mb-2">
            {coldPercent > 0 && <div className="bg-blue-500" style={{ width: `${coldPercent}%` }} title={`Cold: ${formatNumber(coldPercent, 1)}%`} />}
            {normalPercent > 0 && <div className="bg-emerald-500" style={{ width: `${normalPercent}%` }} title={`Normal: ${formatNumber(normalPercent, 1)}%`} />}
            {hotPercent > 0 && <div className="bg-red-500" style={{ width: `${hotPercent}%` }} title={`Hot: ${formatNumber(hotPercent, 1)}%`} />}
          </div>
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-blue-500" />
              <span className="text-slate-400">Cold &lt;{THRESHOLDS.COLD_ECT}°F</span>
              <span className="text-white font-mono ml-auto">{formatNumber(coldPercent, 1)}%</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-emerald-500" />
              <span className="text-slate-400">Normal</span>
              <span className="text-white font-mono ml-auto">{formatNumber(normalPercent, 1)}%</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-red-500" />
              <span className="text-slate-400">Hot &gt;{THRESHOLDS.HOT_ECT}°F</span>
              <span className="text-white font-mono ml-auto">{formatNumber(hotPercent, 1)}%</span>
            </div>
          </div>
        </div>
      </div>
    </ChartCard>
  );
};

// Card 4 & 5: Intake Backfire Summary
const BackfireSummaryCard = ({ histogram, title, onClick }) => {
  const hasData = histogram && histogram.data && histogram.data.length > 0;

  if (!hasData) {
    return (
      <ChartCard title={title} icon={<AlertTriangle className="w-4 h-4 text-red-400" />}>
        <div className="text-slate-500 text-sm">Not available in this file</div>
      </ChartCard>
    );
  }

  let totalEvents = 0;
  let eventRPMMin = Infinity, eventRPMMax = 0;
  let eventMAPMin = Infinity, eventMAPMax = 0;
  let hasEvents = false;

  const yLabels = histogram.yLabels || [];
  const xLabels = histogram.xLabels || [];

  for (let y = 0; y < yLabels.length; y++) {
    for (let x = 0; x < xLabels.length; x++) {
      const value = histogram.data[y]?.[x] || 0;
      if (value > 0) {
        hasEvents = true;
        totalEvents += value;
        const rpm = yLabels[y];
        const map = xLabels[x];
        if (rpm < eventRPMMin) eventRPMMin = rpm;
        if (rpm > eventRPMMax) eventRPMMax = rpm;
        if (map < eventMAPMin) eventMAPMin = map;
        if (map > eventMAPMax) eventMAPMax = map;
      }
    }
  }

  return (
    <ChartCard title={title} icon={<AlertTriangle className="w-4 h-4 text-red-400" />} onClick={onClick}>
      <div className="space-y-3">
        <div className="flex justify-between text-sm">
          <span className="text-slate-400">Total Events</span>
          <span className={`font-mono ${hasEvents ? 'text-red-400' : 'text-white'}`}>{formatNumber(totalEvents, 0)}</span>
        </div>
        {hasEvents && (
          <div className="border-t border-slate-700 pt-3">
            <div className="text-xs text-slate-500 uppercase mb-2">Event Window</div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div><span className="text-slate-400">RPM:</span> <span className="text-white font-mono">{formatNumber(eventRPMMin, 0)}–{formatNumber(eventRPMMax, 0)}</span></div>
              <div><span className="text-slate-400">MAP:</span> <span className="text-white font-mono">{formatNumber(eventMAPMin, 1)}–{formatNumber(eventMAPMax, 1)} PSIA</span></div>
            </div>
          </div>
        )}
      </div>
    </ChartCard>
  );
};

// =============================================================================
// HEATMAP TABLE - Distribution Matrix for Histograms
// =============================================================================
const HeatmapTable = ({ histogram, title, faultOverlays = [], onCellClick, unit = 'hours', sourceInSeconds = false }) => {
  if (!histogram || !histogram.data || histogram.data.length === 0) {
    return (
      <div className="rounded-xl border border-[#344d65] bg-[#111921] p-8 text-center">
        <BarChart3 className="w-12 h-12 mx-auto mb-3 text-[#344d65]" />
        <p className="text-[#93adc8]">No histogram data available</p>
      </div>
    );
  }

  const yLabels = histogram.yLabels || [];
  const xLabels = histogram.xLabels || [];
  const data = histogram.data || [];

  // Conversion factor: if source is in seconds, convert to hours for display
  const conversionFactor = sourceInSeconds ? (1 / 3600) : 1;

  // Calculate totals and statistics (in display units)
  let grandTotal = 0;
  const rowTotals = [];
  const colTotals = new Array(xLabels.length).fill(0);
  let maxValue = 0;

  yLabels.forEach((_, yIdx) => {
    let rowTotal = 0;
    xLabels.forEach((_, xIdx) => {
      const rawValue = data[yIdx]?.[xIdx] || 0;
      const value = rawValue * conversionFactor; // Convert to display units
      rowTotal += value;
      colTotals[xIdx] += value;
      grandTotal += value;
      if (value > maxValue) maxValue = value;
    });
    rowTotals.push(rowTotal);
  });

  // Get cell color intensity based on value
  const getCellStyle = (value) => {
    if (value === 0 || !value) {
      return { backgroundColor: '#1a2632', opacity: 1 };
    }
    const intensity = Math.min(value / (maxValue * 0.5), 1); // Scale to 50% of max for better visibility
    const alpha = 0.2 + (intensity * 0.8); // Min 20%, max 100%
    return {
      backgroundColor: `rgba(25, 127, 230, ${alpha})`,
      opacity: 1
    };
  };

  // Check if a cell matches a fault location
  const getFaultAtCell = (rpm, map) => {
    return faultOverlays.find(fault => {
      const faultRPM = fault.snapshot?.rpm;
      const faultMAP = fault.snapshot?.rMAP;
      if (!faultRPM || !faultMAP) return false;
      // Find closest bin
      const rpmMatch = yLabels.some((y, idx) => {
        const nextY = yLabels[idx + 1] || y + 500;
        return faultRPM >= y && faultRPM < nextY && y === rpm;
      });
      const mapMatch = xLabels.some((x, idx) => {
        const nextX = xLabels[idx + 1] || x + 5;
        return faultMAP >= x && faultMAP < nextX && x === map;
      });
      return rpmMatch && mapMatch;
    });
  };

  return (
    <div className="rounded-xl border border-[#344d65] bg-[#111921] overflow-hidden">
      {/* Header */}
      <div className="bg-[#1a2632] px-6 py-3 border-b border-[#344d65] flex justify-between items-center">
        <h3 className="text-white font-bold text-sm tracking-wide uppercase">{title || 'Distribution Matrix'}</h3>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-[#93adc8]">MIN (0%)</span>
            <div className="w-24 h-2 rounded-full bg-gradient-to-r from-[#1a2632] via-[#197fe6]/50 to-[#197fe6]" />
            <span className="text-[10px] text-[#93adc8]">MAX</span>
          </div>
          {faultOverlays.length > 0 && (
            <div className="flex items-center gap-1 text-[10px] text-red-400">
              <div className="w-3 h-3 rounded-full bg-red-500 border-2 border-white" />
              {faultOverlays.length} Fault{faultOverlays.length > 1 ? 's' : ''} Overlaid
            </div>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="p-4 overflow-x-auto">
        <table className="w-full border-separate border-spacing-1">
          <thead>
            <tr>
              <th className="w-20 p-2 text-left text-[10px] font-bold text-[#93adc8] uppercase tracking-tighter">
                RPM \ MAP
              </th>
              {xLabels.map((x, idx) => (
                <th key={idx} className="w-20 p-2 text-center text-xs font-bold text-[#93adc8]">
                  {formatNumber(x, 1)}
                </th>
              ))}
              <th className="w-20 p-2 text-center text-xs font-bold text-[#197fe6] border-l border-[#344d65]/50">
                Row Total
              </th>
            </tr>
          </thead>
          <tbody>
            {yLabels.map((yLabel, yIdx) => (
              <tr key={yIdx}>
                <td className="p-2 text-right text-xs font-bold text-white border-r border-[#344d65]/50 pr-4">
                  {formatNumber(yLabel, 0)}
                </td>
                {xLabels.map((xLabel, xIdx) => {
                  const rawValue = data[yIdx]?.[xIdx] || 0;
                  const value = rawValue * conversionFactor; // Apply conversion for display
                  const percent = grandTotal > 0 ? (value / grandTotal * 100) : 0;
                  const cellStyle = getCellStyle(value);
                  const fault = getFaultAtCell(yLabel, xLabel);

                  return (
                    <td
                      key={xIdx}
                      className={`p-2 rounded border text-center cursor-pointer transition-all hover:border-[#197fe6] ${
                        fault ? 'border-red-500 border-2' : 'border-white/5'
                      }`}
                      style={cellStyle}
                      onClick={() => onCellClick && onCellClick(yLabel, xLabel, value)}
                      title={`RPM: ${yLabel}, MAP: ${xLabel}\n${unit === 'events' ? 'Events' : 'Hours'}: ${unit === 'events' ? Math.round(value) : value.toFixed(4)}\n${percent.toFixed(2)}% of total${fault ? `\nFault DTC ${fault.code}` : ''}`}
                    >
                      {value > 0 ? (
                        <>
                          <div className="text-[11px] font-bold text-white font-mono">
                            {unit === 'events' ? Math.round(value) : (value < 0.01 ? value.toFixed(4) : value.toFixed(2) + 'h')}
                          </div>
                          <div className="text-[10px] text-[#93adc8] font-mono">{percent.toFixed(1)}%</div>
                          {fault && (
                            <div className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-red-500 border border-white" />
                          )}
                        </>
                      ) : (
                        <div className="text-[11px] text-[#344d65]">--</div>
                      )}
                    </td>
                  );
                })}
                <td className="p-2 text-center text-xs font-bold text-white border-l border-[#344d65]/50 font-mono">
                  {grandTotal > 0 ? (rowTotals[yIdx] / grandTotal * 100).toFixed(1) : 0}%
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td className="p-2 text-right text-[10px] font-bold text-[#197fe6] uppercase pr-4 border-t border-[#344d65]/50">
                Col Total
              </td>
              {colTotals.map((total, idx) => (
                <td key={idx} className="p-2 text-center text-xs font-bold text-[#93adc8] border-t border-[#344d65]/50 font-mono">
                  {grandTotal > 0 ? (total / grandTotal * 100).toFixed(1) : 0}%
                </td>
              ))}
              <td className="p-2 text-center text-xs font-bold text-white border-t border-l border-[#344d65]/50 font-mono">
                {unit === 'events' ? formatNumber(grandTotal, 0) : formatNumber(grandTotal, 2) + 'h'}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Legend / Stats */}
      <div className="px-6 py-3 border-t border-[#344d65] bg-[#0a0f1d] flex justify-between items-center text-xs text-[#93adc8]">
        <div className="flex gap-6">
          <span>{unit === 'events' ? 'Total Events' : 'Total Runtime'}: <span className="text-white font-mono font-bold">{unit === 'events' ? formatNumber(grandTotal, 0) : formatNumber(grandTotal, 2) + 'h'}</span></span>
          <span>Max Cell: <span className="text-white font-mono font-bold">{unit === 'events' ? formatNumber(maxValue, 0) : formatNumber(maxValue, 4) + 'h'}</span></span>
          <span>Data Points: <span className="text-white font-mono">{yLabels.length * xLabels.length}</span></span>
        </div>
        <div className="text-[10px]">
          Click any cell for details
        </div>
      </div>
    </div>
  );
};

// =============================================================================
// ECT BAR CHART - Temperature Distribution
// =============================================================================
const ECTBarChart = ({ histogram }) => {
  if (!histogram) {
    return (
      <div className="rounded-xl border border-[#344d65] bg-[#111921] p-8 text-center">
        <ThermometerSun className="w-12 h-12 mx-auto mb-3 text-[#344d65]" />
        <p className="text-[#93adc8]">No ECT histogram data available</p>
      </div>
    );
  }

  const xLabels = histogram.xLabels || [];
  const rawData = histogram.data?.[0] || [];

  if (xLabels.length === 0 || rawData.length === 0) {
    return (
      <div className="rounded-xl border border-[#344d65] bg-[#111921] p-8 text-center">
        <ThermometerSun className="w-12 h-12 mx-auto mb-3 text-[#344d65]" />
        <p className="text-[#93adc8]">ECT histogram contains no data points</p>
      </div>
    );
  }

  // Prepare chart data with temperature zone classification
  const chartData = xLabels.map((temp, idx) => ({
    temp: `${temp}°F`,
    tempValue: temp,
    hours: rawData[idx] || 0,
    zone: temp < THRESHOLDS.COLD_ECT ? 'cold' : temp > THRESHOLDS.HOT_ECT ? 'hot' : 'normal'
  }));

  // Calculate statistics
  const totalHours = chartData.reduce((sum, d) => sum + d.hours, 0);
  const coldHours = chartData.filter(d => d.zone === 'cold').reduce((sum, d) => sum + d.hours, 0);
  const normalHours = chartData.filter(d => d.zone === 'normal').reduce((sum, d) => sum + d.hours, 0);
  const hotHours = chartData.filter(d => d.zone === 'hot').reduce((sum, d) => sum + d.hours, 0);

  // Find peak temperature (highest hours)
  const peakData = chartData.reduce((max, d) => d.hours > max.hours ? d : max, { hours: 0 });

  // Find temperature range with actual data
  const dataWithHours = chartData.filter(d => d.hours > 0);
  const minTemp = dataWithHours.length > 0 ? Math.min(...dataWithHours.map(d => d.tempValue)) : 0;
  const maxTemp = dataWithHours.length > 0 ? Math.max(...dataWithHours.map(d => d.tempValue)) : 0;

  // Calculate weighted average temperature
  const weightedAvg = totalHours > 0
    ? chartData.reduce((sum, d) => sum + (d.tempValue * d.hours), 0) / totalHours
    : 0;

  // Get bar color based on temperature zone
  const getBarColor = (entry) => {
    if (entry.zone === 'cold') return '#3b82f6'; // blue
    if (entry.zone === 'hot') return '#ef4444';  // red
    return '#10b981'; // emerald/green
  };

  // Custom tooltip
  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      const percent = totalHours > 0 ? (data.hours / totalHours * 100) : 0;
      return (
        <div className="bg-slate-800 border border-slate-600 rounded-lg p-3 shadow-xl">
          <div className="font-bold text-white mb-1">{data.temp}</div>
          <div className="text-sm space-y-1">
            <div className="flex justify-between gap-4">
              <span className="text-slate-400">Time:</span>
              <span className="text-white font-mono">{data.hours.toFixed(4)} hrs</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-slate-400">Percent:</span>
              <span className="text-white font-mono">{percent.toFixed(2)}%</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-slate-400">Zone:</span>
              <span className={`font-semibold ${
                data.zone === 'cold' ? 'text-blue-400' : data.zone === 'hot' ? 'text-red-400' : 'text-emerald-400'
              }`}>
                {data.zone.charAt(0).toUpperCase() + data.zone.slice(1)}
              </span>
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="rounded-xl border border-[#344d65] bg-[#111921] overflow-hidden">
      {/* Header */}
      <div className="bg-[#1a2632] px-6 py-3 border-b border-[#344d65] flex justify-between items-center">
        <h3 className="text-white font-bold text-sm tracking-wide uppercase">ECT Temperature Distribution</h3>
        <div className="flex items-center gap-4 text-xs">
          <span className="text-[#93adc8]">Total Runtime: <span className="text-white font-mono">{formatNumber(totalHours, 2)}h</span></span>
        </div>
      </div>

      {/* Chart */}
      <div className="p-6">
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#344d65" vertical={false} />
              <XAxis
                dataKey="temp"
                tick={{ fill: '#93adc8', fontSize: 10 }}
                angle={-45}
                textAnchor="end"
                height={60}
                interval={0}
                axisLine={{ stroke: '#344d65' }}
                tickLine={{ stroke: '#344d65' }}
              />
              <YAxis
                tick={{ fill: '#93adc8', fontSize: 11 }}
                axisLine={{ stroke: '#344d65' }}
                tickLine={{ stroke: '#344d65' }}
                tickFormatter={(value) => `${value.toFixed(2)}h`}
                label={{ value: 'Hours', angle: -90, position: 'insideLeft', fill: '#93adc8', fontSize: 12 }}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
              <Bar dataKey="hours" radius={[4, 4, 0, 0]}>
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={getBarColor(entry)} />
                ))}
              </Bar>
              {/* Reference lines for temperature zones */}
              <ReferenceLine x={`${THRESHOLDS.COLD_ECT}°F`} stroke="#3b82f6" strokeDasharray="5 5" strokeWidth={2} />
              <ReferenceLine x={`${THRESHOLDS.HOT_ECT}°F`} stroke="#ef4444" strokeDasharray="5 5" strokeWidth={2} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Legend */}
        <div className="flex justify-center gap-8 pt-4 border-t border-[#344d65] mt-4">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-blue-500" />
            <span className="text-xs text-[#93adc8]">Cold (&lt;{THRESHOLDS.COLD_ECT}°F)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-emerald-500" />
            <span className="text-xs text-[#93adc8]">Normal ({THRESHOLDS.COLD_ECT}–{THRESHOLDS.HOT_ECT}°F)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-red-500" />
            <span className="text-xs text-[#93adc8]">Hot (&gt;{THRESHOLDS.HOT_ECT}°F)</span>
          </div>
        </div>

        {/* Statistics Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6 pt-4 border-t border-[#344d65]">
          {/* Time by Zone */}
          <div className="bg-[#1a2632] rounded-lg p-4">
            <div className="text-[10px] text-[#93adc8] uppercase mb-2">Time by Zone</div>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-blue-400 text-xs">Cold</span>
                <span className="text-white font-mono text-sm">{formatNumber(coldHours, 2)}h ({totalHours > 0 ? (coldHours/totalHours*100).toFixed(1) : 0}%)</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-emerald-400 text-xs">Normal</span>
                <span className="text-white font-mono text-sm">{formatNumber(normalHours, 2)}h ({totalHours > 0 ? (normalHours/totalHours*100).toFixed(1) : 0}%)</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-red-400 text-xs">Hot</span>
                <span className="text-white font-mono text-sm">{formatNumber(hotHours, 2)}h ({totalHours > 0 ? (hotHours/totalHours*100).toFixed(1) : 0}%)</span>
              </div>
            </div>
          </div>

          {/* Peak Temperature */}
          <div className="bg-[#1a2632] rounded-lg p-4">
            <div className="text-[10px] text-[#93adc8] uppercase mb-2">Peak Operating Temp</div>
            <div className="text-2xl font-bold text-white font-mono">{peakData.tempValue}°F</div>
            <div className="text-xs text-[#93adc8] mt-1">{formatNumber(peakData.hours, 2)}h at this temp</div>
          </div>

          {/* Temperature Range */}
          <div className="bg-[#1a2632] rounded-lg p-4">
            <div className="text-[10px] text-[#93adc8] uppercase mb-2">Operating Range</div>
            <div className="text-xl font-bold text-white font-mono">{minTemp}°F – {maxTemp}°F</div>
            <div className="text-xs text-[#93adc8] mt-1">Span: {maxTemp - minTemp}°F</div>
          </div>

          {/* Average Temperature */}
          <div className="bg-[#1a2632] rounded-lg p-4">
            <div className="text-[10px] text-[#93adc8] uppercase mb-2">Weighted Avg Temp</div>
            <div className={`text-2xl font-bold font-mono ${
              weightedAvg < THRESHOLDS.COLD_ECT ? 'text-blue-400' :
              weightedAvg > THRESHOLDS.HOT_ECT ? 'text-red-400' : 'text-emerald-400'
            }`}>
              {formatNumber(weightedAvg, 1)}°F
            </div>
            <div className="text-xs text-[#93adc8] mt-1">
              {weightedAvg < THRESHOLDS.COLD_ECT ? 'Running cold' :
               weightedAvg > THRESHOLDS.HOT_ECT ? 'Running hot' : 'Normal operating temp'}
            </div>
          </div>
        </div>

        {/* Visual Zone Bar */}
        <div className="mt-4 pt-4 border-t border-[#344d65]">
          <div className="text-[10px] text-[#93adc8] uppercase mb-2">Time Distribution</div>
          <div className="h-6 rounded-lg overflow-hidden flex bg-[#1a2632]">
            {coldHours > 0 && (
              <div
                className="bg-blue-500 flex items-center justify-center text-[10px] text-white font-bold transition-all"
                style={{ width: `${(coldHours / totalHours) * 100}%` }}
              >
                {((coldHours / totalHours) * 100) >= 10 ? `${((coldHours / totalHours) * 100).toFixed(0)}%` : ''}
              </div>
            )}
            {normalHours > 0 && (
              <div
                className="bg-emerald-500 flex items-center justify-center text-[10px] text-white font-bold transition-all"
                style={{ width: `${(normalHours / totalHours) * 100}%` }}
              >
                {((normalHours / totalHours) * 100) >= 10 ? `${((normalHours / totalHours) * 100).toFixed(0)}%` : ''}
              </div>
            )}
            {hotHours > 0 && (
              <div
                className="bg-red-500 flex items-center justify-center text-[10px] text-white font-bold transition-all"
                style={{ width: `${(hotHours / totalHours) * 100}%` }}
              >
                {((hotHours / totalHours) * 100) >= 10 ? `${((hotHours / totalHours) * 100).toFixed(0)}%` : ''}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// =============================================================================
// FAULT SNAPSHOT TABLE - Full diagnostic detail
// =============================================================================
const FaultMasterDetail = ({ faults, selectedFaultIndex, onSelectFault }) => {
  if (!faults || faults.length === 0) {
    return (
      <div className="text-slate-500 text-sm p-8 text-center">
        <CheckCircle className="w-12 h-12 mx-auto mb-3 text-emerald-500/50" />
        <p className="text-emerald-400 font-medium">No faults recorded</p>
        <p className="text-slate-500 text-xs mt-1">This ECM has no stored fault codes</p>
      </div>
    );
  }

  const selectedFault = selectedFaultIndex !== null ? faults[selectedFaultIndex] : null;

  return (
    <div className="flex gap-4" style={{ minHeight: '400px' }}>
      {/* Left Panel - Fault List */}
      <div className="w-80 flex-shrink-0 flex flex-col border-r border-slate-700 pr-4">
        <div className="text-xs text-slate-500 uppercase tracking-wider mb-2 px-2">
          {faults.length} Fault{faults.length !== 1 ? 's' : ''} Recorded
        </div>
        <div className="flex-1 overflow-y-auto space-y-2 pr-2" style={{ maxHeight: '500px' }}>
          {faults.map((fault, idx) => (
            <div
              key={idx}
              onClick={() => onSelectFault(idx)}
              className={`p-3 rounded-lg cursor-pointer transition-all ${
                selectedFaultIndex === idx
                  ? 'bg-cyan-500/20 border border-cyan-500/50 shadow-lg shadow-cyan-500/10'
                  : 'bg-slate-800/50 border border-transparent hover:bg-slate-800 hover:border-slate-700'
              }`}
            >
              {/* Fault Header */}
              <div className="flex items-center justify-between mb-1">
                <span className={`font-mono font-bold ${selectedFaultIndex === idx ? 'text-cyan-400' : 'text-cyan-500'}`}>
                  DTC {fault.code}
                </span>
                <div className="flex items-center gap-1">
                  {fault.causedShutdown && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] bg-red-500/30 text-red-400 font-medium">
                      SHUTDOWN
                    </span>
                  )}
                  {fault.occurredThisCycle && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] bg-orange-500/30 text-orange-400 font-medium">
                      ACTIVE
                    </span>
                  )}
                </div>
              </div>

              {/* Fault Name */}
              <div className="text-sm text-white mb-2 line-clamp-2">{fault.description || 'Unknown fault'}</div>

              {/* Quick Stats */}
              <div className="flex items-center gap-3 text-[11px] text-slate-400">
                <span>Count: <span className="text-white font-mono">{fault.occurrenceCount || 0}</span></span>
                <span>Last: <span className="text-white font-mono">{formatNumber(fault.lastOccurrence, 2)}h</span></span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Right Panel - Fault Detail */}
      <div className="flex-1 min-w-0">
        {selectedFault ? (
          <FaultSnapshotDetailInline fault={selectedFault} />
        ) : (
          <div className="h-full flex items-center justify-center text-slate-500">
            <div className="text-center">
              <ChevronRight className="w-12 h-12 mx-auto mb-3 text-slate-600" />
              <p className="text-sm">Select a fault to view details</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// Inline version of fault detail (no close button, fits in master-detail layout)
const FaultSnapshotDetailInline = ({ fault }) => {
  const [showRawData, setShowRawData] = useState(false);

  if (!fault) return null;

  const snapshot = fault.snapshot || {};
  const groupedSnapshot = groupSnapshotByCategory(snapshot);

  // Category display names
  const categoryNames = {
    timing: 'Timing & Engine',
    fuel: 'Fuel System',
    air: 'Air & Intake',
    electrical: 'Electrical',
    thermal: 'Thermal',
    control: 'Control System',
    unknown: 'Other Parameters'
  };

  // Filter out empty categories
  const nonEmptyCategories = Object.entries(groupedSnapshot).filter(([_, vars]) => vars.length > 0);

  return (
    <div className="h-full overflow-y-auto pr-2" style={{ maxHeight: '500px' }}>
      {/* Header Info */}
      <div className="bg-slate-800/50 rounded-lg p-4 mb-4">
        <div className="flex items-start justify-between mb-3">
          <div>
            <div className="text-cyan-400 font-mono font-bold text-lg">DTC {fault.code}</div>
            <div className="text-white text-base">{fault.description || 'Unknown fault'}</div>
          </div>
          <div className="flex gap-2">
            {fault.causedShutdown && (
              <span className="px-2 py-1 rounded text-xs bg-red-500/30 text-red-400 font-medium">
                Caused Shutdown
              </span>
            )}
            {fault.occurredThisCycle && (
              <span className="px-2 py-1 rounded text-xs bg-orange-500/30 text-orange-400 font-medium">
                Active This Cycle
              </span>
            )}
          </div>
        </div>

        {/* Key Metrics Grid */}
        <div className="grid grid-cols-4 gap-3">
          <div className="bg-slate-900/50 rounded p-2">
            <div className="text-[10px] text-slate-500 uppercase">Occurrences</div>
            <div className="text-white font-mono font-bold">{fault.occurrenceCount || 0}</div>
          </div>
          <div className="bg-slate-900/50 rounded p-2">
            <div className="text-[10px] text-slate-500 uppercase">Starts Since</div>
            <div className="text-white font-mono font-bold">{fault.startsSinceActive || 0}</div>
          </div>
          <div className="bg-slate-900/50 rounded p-2">
            <div className="text-[10px] text-slate-500 uppercase">First @ Hours</div>
            <div className="text-white font-mono font-bold">{formatNumber(fault.initialOccurrence, 4)}</div>
          </div>
          <div className="bg-slate-900/50 rounded p-2">
            <div className="text-[10px] text-slate-500 uppercase">Last @ Hours</div>
            <div className="text-white font-mono font-bold">{formatNumber(fault.lastOccurrence, 4)}</div>
          </div>
        </div>
      </div>

      {/* Snapshot Variables by Category */}
      {nonEmptyCategories.length > 0 ? (
        <div className="space-y-3">
          {nonEmptyCategories.map(([category, variables]) => (
            <div key={category} className="bg-slate-800/30 rounded-lg overflow-hidden">
              <div className="bg-slate-800/50 px-3 py-2 text-xs font-semibold text-slate-300 uppercase tracking-wider">
                {categoryNames[category] || category}
              </div>
              <div className="p-3">
                <div className="grid grid-cols-2 gap-x-6 gap-y-1 max-w-lg">
                  {variables.map((v, idx) => (
                    <div key={idx} className="contents">
                      <div className="py-1 text-xs text-slate-400" title={v.info?.description || v.varName}>
                        {v.info?.name || v.varName}
                      </div>
                      <div className="py-1 text-xs text-white font-mono">
                        {v.formattedValue}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}

          {/* Raw Data Toggle */}
          <button
            onClick={() => setShowRawData(!showRawData)}
            className="w-full flex items-center justify-center gap-2 py-2 text-xs text-slate-400 hover:text-white bg-slate-800/30 rounded-lg transition-colors"
          >
            {showRawData ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            {showRawData ? 'Hide' : 'Show'} Raw Snapshot Data ({Object.keys(snapshot).length} fields)
          </button>

          {showRawData && (
            <div className="bg-slate-900/50 rounded-lg p-3 font-mono text-xs max-h-64 overflow-y-auto">
              <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 max-w-md">
                <div className="text-slate-500 font-semibold pb-1 border-b border-slate-700">Variable</div>
                <div className="text-slate-500 font-semibold pb-1 border-b border-slate-700">Raw Value</div>
                {Object.entries(snapshot).map(([key, value]) => (
                  <div key={key} className="contents">
                    <div className="py-0.5 text-cyan-400">{key}</div>
                    <div className="py-0.5 text-slate-300">{String(value)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="text-slate-500 text-sm text-center py-8">
          No snapshot data available for this fault
        </div>
      )}
    </div>
  );
};

// =============================================================================
// FAULT SNAPSHOT DETAIL VIEW - Full technical detail (ALL FIELDS)
// =============================================================================
const FaultSnapshotDetail = ({ fault, histograms, onClose }) => {
  if (!fault) return null;

  const snapshot = fault.snapshot || {};

  // Group ALL snapshot variables by category using variable definitions
  const groupedSnapshot = groupSnapshotByCategory(snapshot);

  // Category display order
  const categoryOrder = ['timing', 'fuel', 'air', 'electrical', 'thermal', 'control', 'unknown'];

  // Count total variables
  const totalVars = Object.keys(snapshot).length;

  return (
    <div className="bg-[#1a2632] rounded-xl border border-[#344d65] mt-4 overflow-hidden">
      {/* Header */}
      <div className="bg-[#111921] px-6 py-4 border-b border-[#344d65] flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold text-[#197fe6] font-mono">DTC {fault.code}</span>
            <span className="text-white text-lg">{fault.description}</span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-xs text-[#93adc8] bg-[#111921] px-3 py-1 rounded border border-[#344d65]">
            {totalVars} snapshot variables
          </span>
          {onClose && (
            <button onClick={onClose} className="text-[#93adc8] hover:text-white">
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {/* Fault Header Information */}
      <div className="px-6 py-4 bg-[#111921]/50 border-b border-[#344d65]">
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4 text-sm">
          <div>
            <div className="text-[10px] text-[#93adc8] uppercase tracking-wider mb-1">Occurred This Cycle</div>
            <div className={`font-mono font-bold ${fault.occurredThisCycle ? 'text-red-400' : 'text-emerald-400'}`}>
              {fault.occurredThisCycle ? 'Yes' : 'No'}
            </div>
          </div>
          <div>
            <div className="text-[10px] text-[#93adc8] uppercase tracking-wider mb-1">Caused Shutdown</div>
            <div className={`font-mono font-bold ${fault.causedShutdown ? 'text-red-400' : 'text-emerald-400'}`}>
              {fault.causedShutdown ? 'Yes' : 'No'}
            </div>
          </div>
          <div>
            <div className="text-[10px] text-[#93adc8] uppercase tracking-wider mb-1">Starts Since Active</div>
            <div className="font-mono font-bold text-white">{formatNumber(fault.startsSinceActive, 0)}</div>
          </div>
          <div>
            <div className="text-[10px] text-[#93adc8] uppercase tracking-wider mb-1">Occurrence Count</div>
            <div className="font-mono font-bold text-white">{formatNumber(fault.occurrenceCount, 0)}</div>
          </div>
          <div>
            <div className="text-[10px] text-[#93adc8] uppercase tracking-wider mb-1">Initial Occurrence</div>
            <div className="font-mono font-bold text-white">{formatNumber(fault.initialOccurrence, 4)} hrs</div>
          </div>
          <div>
            <div className="text-[10px] text-[#93adc8] uppercase tracking-wider mb-1">Last Occurrence</div>
            <div className="font-mono font-bold text-white">{formatNumber(fault.lastOccurrence, 4)} hrs</div>
          </div>
          <div>
            <div className="text-[10px] text-[#93adc8] uppercase tracking-wider mb-1">Fault RPM</div>
            <div className="font-mono font-bold text-[#197fe6]">{formatNumber(snapshot.rpm, 0)} RPM</div>
          </div>
          <div>
            <div className="text-[10px] text-[#93adc8] uppercase tracking-wider mb-1">Fault MAP</div>
            <div className="font-mono font-bold text-[#197fe6]">{formatNumber(snapshot.rMAP, 2)} psia</div>
          </div>
        </div>
      </div>

      {/* ALL Snapshot Variables by Category */}
      <div className="p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {categoryOrder.map(catKey => {
            const catVars = groupedSnapshot[catKey];
            if (!catVars || catVars.length === 0) return null;

            const catInfo = VARIABLE_CATEGORIES[catKey] || { name: 'Other Parameters', order: 99 };

            return (
              <div key={catKey} className="bg-[#111921] rounded-lg border border-[#344d65]/50 overflow-hidden">
                <div className="bg-[#1a2632] px-4 py-2 border-b border-[#344d65]/50">
                  <h4 className="text-xs font-bold text-[#93adc8] uppercase tracking-wider">
                    {catInfo.name} ({catVars.length})
                  </h4>
                </div>
                <div className="p-3 space-y-1 max-h-64 overflow-y-auto">
                  {catVars.map(({ varName, value, info, formattedValue }) => (
                    <div key={varName} className="flex justify-between items-center text-sm py-1 border-b border-[#344d65]/20 last:border-0">
                      <div className="flex flex-col">
                        <span className="text-white text-xs font-medium">{info.name}</span>
                        <span className="text-[10px] text-[#93adc8] font-mono">{varName}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-white font-mono text-sm font-bold">{formattedValue}</span>
                        {info.unit && <span className="text-[#93adc8] text-xs ml-1">{info.unit}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* Raw variable listing for verification */}
        <div className="mt-6 bg-[#111921] rounded-lg border border-[#344d65]/50 overflow-hidden">
          <details>
            <summary className="px-4 py-3 cursor-pointer text-xs font-bold text-[#93adc8] uppercase tracking-wider bg-[#1a2632] hover:bg-[#1a2632]/80">
              Raw Snapshot Data ({totalVars} variables) - Click to expand
            </summary>
            <div className="p-4 max-h-64 overflow-y-auto">
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 text-xs font-mono">
                {Object.entries(snapshot).map(([key, value]) => (
                  <div key={key} className="flex justify-between bg-[#0a0f1d] rounded px-2 py-1">
                    <span className="text-[#93adc8]">{key}</span>
                    <span className="text-white">{typeof value === 'number' ? value.toFixed(4) : value}</span>
                  </div>
                ))}
              </div>
            </div>
          </details>
        </div>
      </div>
    </div>
  );
};

// =============================================================================
// ERROR BOUNDARY - Catches runtime errors in child components
// =============================================================================
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Error caught by boundary:', error, errorInfo);
    this.setState({ errorInfo });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-950 flex items-center justify-center p-8">
          <div className="w-full max-w-2xl bg-red-950/30 border border-red-800 rounded-xl p-8 text-center">
            <AlertCircle className="w-16 h-16 mx-auto mb-4 text-red-400" />
            <h1 className="text-2xl font-bold text-red-400 mb-3">Something went wrong</h1>
            <p className="text-slate-400 mb-6">
              An unexpected error occurred while rendering the application.
            </p>
            <pre className="text-xs text-left bg-slate-900 p-4 rounded-lg overflow-auto max-h-48 mb-6 text-red-300">
              {this.state.error?.toString()}
            </pre>
            <button
              onClick={() => window.location.reload()}
              className="px-6 py-2.5 rounded-full text-base font-bold bg-emerald-500 text-white hover:bg-green-500 transition-colors"
            >
              Reload Application
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// =============================================================================
// STATE MANAGEMENT - useReducer for ECM/B-Plot analysis state
// =============================================================================
const analysisInitialState = {
  // Common
  fileType: null,
  fileName: '',
  parsed: false,
  // ECM specific
  ecmInfo: {},
  histograms: {},
  faults: [],
  stats: {},
  analysis: {},
  summaryStats: {},
  processedHistograms: {},
  selectedHistogram: 'speedLoad',
  // B-Plot specific
  bplotData: null,
  bplotProcessed: null
};

function analysisReducer(state, action) {
  switch (action.type) {
    case 'ECM_FILE_LOADED':
      const processedFaults = processFaultData(action.payload.faults);
      const processedHistograms = processAllHistograms(action.payload.histograms, ECM_HISTOGRAM_CONFIG);
      const analysis = analyzeECMData(action.payload.ecmInfo, processedHistograms, processedFaults, action.payload.stats);
      const summaryStats = generateSummaryStats(action.payload.ecmInfo, processedHistograms, processedFaults, action.payload.stats);

      return {
        ...state,
        fileType: FILE_TYPES.ECM,
        ecmInfo: action.payload.ecmInfo,
        histograms: action.payload.histograms,
        faults: processedFaults,
        stats: action.payload.stats,
        analysis,
        summaryStats,
        processedHistograms,
        fileName: action.payload.fileName,
        parsed: true
      };
    case 'BPLOT_FILE_LOADED':
      return {
        ...state,
        fileType: FILE_TYPES.BPLOT,
        bplotData: action.payload.data,
        bplotProcessed: action.payload.processed,
        fileName: action.payload.fileName,
        parsed: true
      };
    case 'SET_SELECTED_HISTOGRAM':
      return { ...state, selectedHistogram: action.payload };
    case 'RESET':
      return analysisInitialState;
    default:
      return state;
  }
}

// =============================================================================
// MAIN COMPONENT - PLOT ANALYZER
// =============================================================================
const PlotAnalyzer = () => {
  // ECM/B-Plot Analysis state managed by reducer
  const [state, dispatch] = useReducer(analysisReducer, analysisInitialState);
  const {
    fileType, ecmInfo, histograms, faults, stats, analysis, summaryStats,
    processedHistograms, selectedHistogram, fileName, parsed,
    bplotData, bplotProcessed
  } = state;

  // UI state
  const [rawSheets, setRawSheets] = useState({});
  const [rawSheetNames, setRawSheetNames] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [expandedSheets, setExpandedSheets] = useState({});
  const [showAllRows, setShowAllRows] = useState({});
  const [rawFileContent, setRawFileContent] = useState('');
  const [selectedFaultIndex, setSelectedFaultIndex] = useState(null);
  const [showFaultOverlays, setShowFaultOverlays] = useState(true);
  const workerRef = useRef(null);

  useEffect(() => {
    if (PERF) console.log(`[perf] tab change: ${activeTab}`);
  }, [activeTab]);

  // Initialize worker for plot data processing
  useEffect(() => {
    if (workerRef.current) return;
    try {
      const worker = new Worker(new URL('./workers/plotWorker.js', import.meta.url), { type: 'module' });
      worker.onmessage = (e) => {
        const { type, error, ...data } = e.data;
        if (type === 'error') {
          console.error('Worker error:', error);
          setError(error);
          setIsLoading(false);
        } else if (type === 'loaded') {
          if (data.processed) {
            const stats = {
              totalFaults: data.faults.length,
              histogramCount: Object.keys(data.histograms).length,
              engineHours: parseFloat(data.ecmInfo['Hour meter']) || 0,
              engineStarts: parseInt(data.ecmInfo['Cumulative Starts']) || 0,
              histogramStats: {}
            };
            Object.entries(data.histograms).forEach(([key, histogram]) => {
              const total = histogram.data.flat().reduce((sum, val) => sum + (val || 0), 0);
              stats.histogramStats[key] = { totalHours: total, dataPoints: histogram.data.length * (histogram.xLabels?.length || 0) };
            });
            dispatch({
              type: 'ECM_FILE_LOADED',
              payload: { ...data, stats, fileName: data.fileName }
            });
          } else {
            setError(data.error || 'Failed to process file');
          }
          setIsLoading(false);
        }
      };
      worker.onerror = (e) => {
        console.error('Worker initialization error:', e);
        // Worker failed to initialize - will fall back to main thread processing
      };
      workerRef.current = worker;
      console.log('Plot Analyzer worker initialized');
    } catch (err) {
      console.warn('Web Worker not supported, using main thread:', err);
    }
  }, []);

  // ----------------------------------------------------------------------------
  // FILE PROCESSING - Adapt for new Excel format
  // ---------------------------------------------------------------------------
  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const file = e.dataTransfer?.files?.[0];
    if (file && (/\.xlsx?$/i.test(file.name) || /\.csv$/i.test(file.name) || /\.bplt$/i.test(file.name))) {
      processFile(file);
    } else if (file) {
      setError('Please upload a CSV, Excel, or BPLT file (.csv, .xls, .xlsx, .bplt)');
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    if (e.target) e.target.value = '';
  };

  // Detect file type from content
  const detectFileType = (text, fileName) => {
    // Check for .bplt extension (binary file - should be handled by backend)
    if (fileName.toLowerCase().endsWith('.bplt')) {
      return FILE_TYPES.BPLOT;
    }

    // Check for ECM signature
    if (text.includes('========== 4G ECM Information ==========') ||
        text.includes('4G ECM Information') ||
        text.includes('ECI H/W P/N')) {
      return FILE_TYPES.ECM;
    }

    // Check for B-Plot CSV signature (time-series data)
    const firstLine = text.split('\n')[0] || '';
    const headers = firstLine.split(',').map(h => h.trim());
    if (headers[0] === 'Time' && headers.length > 30) {
      const bplotColumns = ['rpm', 'MAP', 'ECT', 'IAT', 'Vbat', 'TPS_pct'];
      const hasCommonColumns = bplotColumns.some(col =>
        headers.some(h => h.toLowerCase() === col.toLowerCase())
      );
      if (hasCommonColumns) {
        return FILE_TYPES.BPLOT;
      }
    }

    return FILE_TYPES.UNKNOWN;
  };

  const processFile = async (file) => {
    if (file.size > MAX_FILE_SIZE_MB * MB_BYTES) {
      setError(`File too large. Maximum size is ${MAX_FILE_SIZE_MB} MB.`);
      return;
    }

    if (file.size > WARN_FILE_SIZE_MB * MB_BYTES) {
      const proceed = window.confirm(
        `This file is ${(file.size / MB_BYTES).toFixed(1)} MB. Processing may take some time.\n\nContinue?`
      );
      if (!proceed) return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Handle .bplt files via backend API
      if (file.name.toLowerCase().endsWith('.bplt')) {
        const formData = new FormData();
        formData.append('file', file);

        const response = await fetch('/api/upload', {
          method: 'POST',
          body: formData
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || 'Failed to process BPLT file');
        }

        const result = await response.json();
        const text = result.content;

        // Parse as B-Plot CSV
        const bplotParsed = parseBPlotData(text);
        const bplotProcessedData = processBPlotData(bplotParsed);

        dispatch({
          type: 'BPLOT_FILE_LOADED',
          payload: {
            data: bplotParsed,
            processed: bplotProcessedData,
            fileName: file.name
          }
        });
        return;
      }

      // Read file as text for CSV files
      const text = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = (e) => reject(new Error('Failed to read file'));
        reader.readAsText(file);
      });

      // Detect file type
      const detectedType = detectFileType(text, file.name);
      console.log('Detected file type:', detectedType);

      if (detectedType === FILE_TYPES.BPLOT) {
        // Process as B-Plot time-series data
        const bplotParsed = parseBPlotData(text);
        const bplotProcessedData = processBPlotData(bplotParsed);

        dispatch({
          type: 'BPLOT_FILE_LOADED',
          payload: {
            data: bplotParsed,
            processed: bplotProcessedData,
            fileName: file.name
          }
        });
      } else if (detectedType === FILE_TYPES.ECM) {
        // Store raw file content for Raw tab
        setRawFileContent(text);

        // Parse ECM data
        console.log('Starting ECM data parsing...');
        const parsedData = parseECMData(text);
        console.log('Parsed data:', parsedData);

        if (!parsedData.parsed) {
          throw new Error(parsedData.error || 'Failed to parse ECM data');
        }

        // Extract statistics
        const stats = extractECMStats(parsedData);
        console.log('Extracted stats:', stats);

        // Dispatch to state management
        dispatch({
          type: 'ECM_FILE_LOADED',
          payload: {
            ...parsedData,
            stats,
            fileName: file.name
          }
        });
      } else {
        throw new Error('Unknown file format. Please upload an ECM download CSV or a B-Plot CSV file.');
      }

    } catch (error) {
      console.error('File processing error:', error);
      setError(`Failed to process file: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // ----------------------------------------------------------------------------
  // ECM CHART DATA - Prepare histogram data for visualization
  // ----------------------------------------------------------------------------
  const selectedHistogramData = useMemo(() => {
    if (!processedHistograms[selectedHistogram]) return [];
    return processedHistograms[selectedHistogram].data || [];
  }, [processedHistograms, selectedHistogram]);

  const histogramOptions = useMemo(() => {
    return Object.keys(processedHistograms).map(key => ({
      key,
      name: processedHistograms[key]?.title || key,
      dataPoints: processedHistograms[key]?.stats?.dataPoints || 0
    }));
  }, [processedHistograms]);

  // ----------------------------------------------------------------------------
  // RAW DATA SECTIONS - Parse file into sections for raw data display
  // ----------------------------------------------------------------------------
  const rawDataSections = useMemo(() => {
    if (!rawFileContent) return [];

    const lines = rawFileContent.split('\n');
    const sections = [];
    let currentSection = { name: 'Header', lines: [], startLine: 0 };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Check for section headers
      if (line.startsWith('========== ') && line.endsWith(' ==========')) {
        // Save previous section
        if (currentSection.lines.length > 0) {
          sections.push(currentSection);
        }

        // Start new section
        const sectionName = line.replace(/========== | ==========/g, '');
        currentSection = {
          name: sectionName,
          lines: [],
          startLine: i
        };
      } else if (line === '------------------- END -------------------') {
        // End of file
        if (currentSection.lines.length > 0) {
          sections.push(currentSection);
        }
        break;
      } else {
        // Add line to current section
        currentSection.lines.push(line);
      }
    }

    // Add final section
    if (currentSection.lines.length > 0) {
      sections.push(currentSection);
    }

    return sections;
  }, [rawFileContent]);

  const reset = () => {
    dispatch({ type: 'RESET' });
    setRawSheets({});
    setRawSheetNames([]);
    setRawFileContent('');
    setSelectedFaultIndex(null);
    setShowFaultOverlays(true);
    setActiveTab('overview');
  };

  // ----------------------------------------------------------------------------
  // RENDER: UPLOAD SCREEN
  // ----------------------------------------------------------------------------
  if (!parsed) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-8">
        <div
          className="w-full max-w-2xl border-2 border-dashed border-slate-700 rounded-3xl p-16 text-center hover:border-emerald-500/50 transition-all cursor-pointer"
          onClick={() => document.getElementById('fileIn').click()}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragEnter={handleDragOver}
        >
          <input id="fileIn" type="file" accept=".csv,.xlsx,.xls,.bplt" onChange={handleFileUpload} className="hidden" />

          {isLoading ? (
            <div className="flex flex-col items-center">
              <div className="w-16 h-16 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mb-4" />
              <p className="text-white text-lg">Analyzing plot data...</p>
            </div>
          ) : error ? (
            <div className="text-red-400">
              <AlertCircle className="w-16 h-16 mx-auto mb-4" />
              <p>{error}</p>
            </div>
          ) : (
            <>
              <h1 className="text-2xl font-bold text-white mb-3">ECM & B-Plot Analyzer</h1>
              <p className="text-slate-400 mb-6">Drop your ECM CSV or B-Plot file to analyze</p>
              <div className="text-xs text-slate-500 mb-6">
                Supports: ECM download CSV, B-Plot CSV, BPLT binary files<br/>
                Max file size: {MAX_FILE_SIZE_MB} MB
              </div>
              <div className="flex justify-center gap-6 text-sm text-slate-500">
                <span className="flex items-center gap-1"><Activity className="w-4 h-4 text-cyan-400" /> Data Analysis</span>
                <span className="flex items-center gap-1"><TrendingUp className="w-4 h-4 text-emerald-400" /> Trends</span>
                <span className="flex items-center gap-1"><AlertTriangle className="w-4 h-4 text-red-400" /> Anomalies</span>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  // ----------------------------------------------------------------------------
  // RENDER: B-PLOT TIME-SERIES ANALYSIS
  // ---------------------------------------------------------------------------
  if (fileType === FILE_TYPES.BPLOT && bplotProcessed) {
    return (
      <BPlotAnalysis
        data={bplotData}
        processedData={bplotProcessed}
        fileName={fileName}
        onReset={reset}
      />
    );
  }

  // ----------------------------------------------------------------------------
  // RENDER: ECM MAIN DASHBOARD
  // ---------------------------------------------------------------------------
  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Navigation Bar */}
      <nav className="flex items-center justify-between mx-4 mt-4 mb-4 bg-[#0a0f1d] border border-slate-700 p-2 rounded-lg">
        <div className="flex items-center gap-4 pl-2">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-slate-800/50 flex items-center justify-center">
              <Activity className="w-6 h-6 text-cyan-400" />
            </div>
            <div className="flex flex-col">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-tight">Plot Analyzer</span>
              <span className="text-[10px] text-slate-600">v1.0.1</span>
            </div>
          </div>
          {fileName && (
            <>
              <div className="h-8 w-px bg-slate-700" />
              <span className="text-sm text-slate-400">{fileName}</span>
            </>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('overview')}
            className={`px-6 py-2.5 rounded-full text-base font-medium transition-all duration-200 flex items-center gap-2 ${
              activeTab === 'overview'
                ? 'bg-blue-600 text-white shadow-[0_0_15px_rgba(37,99,235,0.4)]'
                : 'text-slate-400 hover:bg-white/5 hover:text-white'
            }`}
          >
            Overview
          </button>

          <button
            onClick={() => setActiveTab('charts')}
            className={`px-6 py-2.5 rounded-full text-base font-medium transition-all duration-200 flex items-center gap-2 ${
              activeTab === 'charts'
                ? 'bg-blue-600 text-white shadow-[0_0_15px_rgba(37,99,235,0.4)]'
                : 'text-slate-400 hover:bg-white/5 hover:text-white'
            }`}
          >
            Charts
          </button>

          <button
            onClick={() => setActiveTab('raw')}
            className={`px-6 py-2.5 rounded-full text-base font-medium transition-all duration-200 flex items-center gap-2 ${
              activeTab === 'raw'
                ? 'bg-blue-600 text-white shadow-[0_0_15px_rgba(37,99,235,0.4)]'
                : 'text-slate-400 hover:bg-white/5 hover:text-white'
            }`}
          >
            Raw
          </button>

          <div className="w-4" />

          <button
            onClick={reset}
            className="px-6 py-2.5 rounded-full text-base font-bold bg-emerald-500 text-white hover:bg-green-500 transition-colors flex items-center gap-2"
          >
            <Upload className="w-5 h-5" />
            Upload new Plot File
          </button>
        </div>
      </nav>

      <main className="w-full px-6 py-6 space-y-8 mx-auto" style={{ maxWidth: '98%' }}>

        {/* ==================== OVERVIEW ==================== */}
        {activeTab === 'overview' && parsed && (
          <>
            {/* ECM Device Information */}
            <div className="bg-slate-900/50 rounded-xl border border-slate-800 p-6">
              <div className="flex items-center gap-2 mb-5 text-base text-slate-300 font-semibold">
                <Cpu className="w-5 h-5 text-cyan-400" /> ECM Device Information
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-5">
                <InfoBox label="Hardware P/N" value={ecmInfo['ECI H/W P/N']} />
                <InfoBox label="Software Version" value={ecmInfo['ECI Mot XLS Rev']} />
                <InfoBox label="Serial Number" value={ecmInfo['ECI H/W S/N']} small />
                <InfoBox label="Engine P/N" value={(ecmInfo['Engine P/N'] || '').replace(/"/g, '')} />
                <InfoBox label="Engine S/N" value={(ecmInfo['Engine S/N'] || '').replace(/"/g, '')} small />
                <InfoBox label="Engine Hours" value={`${Number(stats.engineHours || 0).toFixed(1)}h`} />
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 border-t border-slate-700 pt-5">
                <InfoBox label="Customer S/W P/N" value={(ecmInfo['Customer S/W P/N'] || '').replace(/"/g, '')} />
                <InfoBox label="Download Date" value={ecmInfo['Download Date']} />
                <InfoBox label="Download Time" value={ecmInfo['Download Time']} />
                <InfoBox label="Manufacture Date" value={ecmInfo['ECI Manufacture Date']} />
                <InfoBox label="Calibration Date" value={ecmInfo['ECI Current Cal Date']} />
                <InfoBox label="Starts" value={stats.engineStarts || 0} />
              </div>
            </div>

            {/* Alerts and Recommendations */}
            {analysis?.alerts?.length > 0 && (
              <div className="bg-red-950/30 border border-red-800 rounded-xl p-4">
                <div className="flex items-center gap-3">
                  <ShieldAlert className="w-6 h-6 text-red-400" />
                  <div className="flex-1">
                    <div className="font-semibold text-red-400">{analysis.alerts.length} System Alert{analysis.alerts.length > 1 ? 's' : ''}</div>
                    <div className="text-sm text-red-300/70">Issues detected requiring attention</div>
                  </div>
                  <button onClick={() => setActiveTab('charts')} className="px-3 py-1.5 bg-red-600 hover:bg-red-500 rounded-lg text-sm">
                    View Details
                  </button>
                </div>
              </div>
            )}

            {/* Key Metrics */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-5">
              <MetricCard icon={<Gauge className="text-emerald-400 w-5 h-5" />} label="Engine Hours"
                value={Number(stats.engineHours || 0).toFixed(1)} unit="h" sub="Total runtime" />
              <MetricCard icon={<Activity className="text-cyan-400 w-5 h-5" />} label="Histograms"
                value={stats.histogramCount || 0} sub="Data sets analyzed" />
              <MetricCard icon={<TrendingUp className="text-violet-400 w-5 h-5" />} label="Total Operating Time"
                value={Number(summaryStats.performance?.totalOperatingHours || 0).toFixed(1)} unit="h" sub="Across all conditions" />
              <MetricCard icon={<Wrench className="text-amber-400 w-5 h-5" />} label="Faults"
                value={stats.totalFaults || 0} sub={`${faults.filter(f => f?.isCritical).length} critical`} />
              <MetricCard
                icon={<AlertTriangle className={`w-5 h-5 ${summaryStats.health?.overallHealth < 70 ? 'text-red-400' : summaryStats.health?.overallHealth < 85 ? 'text-orange-400' : 'text-emerald-400'}`} />}
                label="Health Score"
                value={summaryStats.health?.overallHealth || 0} unit="%"
                sub="System health indicator"
                alert={summaryStats.health?.overallHealth < 70}
                info={
                  <div className="space-y-2">
                    <p>Starts at <span className="text-white font-semibold">100%</span> and deducts points based on:</p>
                    <div className="space-y-1">
                      <div className="flex justify-between">
                        <span className="text-red-400">Critical faults:</span>
                        <span className="text-white">-20 pts each</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-orange-400">Warning faults:</span>
                        <span className="text-white">-5 pts each</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-amber-400">High temp time:</span>
                        <span className="text-white">up to -20 pts</span>
                      </div>
                    </div>
                    <div className="border-t border-slate-600 pt-2 mt-2">
                      <div className="text-[10px] uppercase text-slate-500 mb-1">Score Ranges</div>
                      <div className="flex gap-2 text-[10px]">
                        <span className="text-emerald-400">&gt;85% Good</span>
                        <span className="text-orange-400">70-85% Warning</span>
                        <span className="text-red-400">&lt;70% Critical</span>
                      </div>
                    </div>
                  </div>
                } />
            </div>

            {/* Histogram Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
              <SpeedLoadSummaryCard
                histogram={histograms.speedLoad}
                onClick={() => { dispatch({ type: 'SET_SELECTED_HISTOGRAM', payload: 'speedLoad' }); setActiveTab('charts'); }}
              />
              <KnockSummaryCard
                histogram={histograms.knock}
                onClick={() => { dispatch({ type: 'SET_SELECTED_HISTOGRAM', payload: 'knock' }); setActiveTab('charts'); }}
              />
              <ECTSummaryCard
                histogram={histograms.ect}
                onClick={() => { dispatch({ type: 'SET_SELECTED_HISTOGRAM', payload: 'ect' }); setActiveTab('charts'); }}
              />
              <BackfireSummaryCard
                histogram={histograms.backfireLifetime}
                title="Backfire (Lifetime)"
                onClick={() => { dispatch({ type: 'SET_SELECTED_HISTOGRAM', payload: 'backfireLifetime' }); setActiveTab('charts'); }}
              />
              <BackfireSummaryCard
                histogram={histograms.backfireRecent}
                title="Backfire (Recent)"
                onClick={() => { dispatch({ type: 'SET_SELECTED_HISTOGRAM', payload: 'backfireRecent' }); setActiveTab('charts'); }}
              />
            </div>

            {/* Fault Snapshot Section */}
            <div className="bg-slate-900/50 rounded-xl border border-slate-800 p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2 text-base font-semibold text-slate-300">
                  <AlertTriangle className="w-5 h-5 text-red-400" /> Fault Snapshot Data
                </div>
                {faults.length > 0 && (
                  <div className="flex items-center gap-3 text-sm">
                    {faults.filter(f => f?.causedShutdown).length > 0 && (
                      <span className="text-red-400">{faults.filter(f => f?.causedShutdown).length} Shutdown</span>
                    )}
                    {faults.filter(f => f?.occurredThisCycle).length > 0 && (
                      <span className="text-orange-400">{faults.filter(f => f?.occurredThisCycle).length} Active</span>
                    )}
                    <span className="text-slate-400">{faults.length} Total</span>
                  </div>
                )}
              </div>

              <FaultMasterDetail
                faults={faults}
                selectedFaultIndex={selectedFaultIndex}
                onSelectFault={setSelectedFaultIndex}
              />
            </div>
          </>
        )}

        {/* ==================== CHARTS ==================== */}
        {activeTab === 'charts' && (
          <div className="space-y-6">
            {/* Histogram Selector with Fault Overlay Toggle */}
            {histogramOptions.length > 0 && (
              <div className="bg-[#111921] rounded-xl border border-[#344d65] p-4">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-4">
                    <BarChart3 className="w-5 h-5 text-[#197fe6]" />
                    <span className="text-base font-semibold text-white">Histogram Analysis</span>
                  </div>
                  {faults.length > 0 && (
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={showFaultOverlays}
                        onChange={(e) => setShowFaultOverlays(e.target.checked)}
                        className="w-4 h-4 rounded border-[#344d65] bg-[#1a2632] text-[#197fe6] focus:ring-[#197fe6]"
                      />
                      <span className="text-sm text-[#93adc8]">Show Fault Overlays ({faults.length})</span>
                    </label>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {histogramOptions.map(option => (
                    <button
                      key={option.key}
                      onClick={() => dispatch({ type: 'SET_SELECTED_HISTOGRAM', payload: option.key })}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                        selectedHistogram === option.key
                          ? 'bg-[#197fe6] text-white shadow-lg'
                          : 'bg-[#1a2632] text-[#93adc8] hover:bg-[#344d65] border border-[#344d65]'
                      }`}
                    >
                      {option.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Heatmap Table for 2D Histograms */}
            {selectedHistogram && histograms[selectedHistogram] && selectedHistogram !== 'ect' && (
              <HeatmapTable
                histogram={histograms[selectedHistogram]}
                title={`${processedHistograms[selectedHistogram]?.title || selectedHistogram} - Distribution Matrix (${selectedHistogram.includes('backfire') ? 'Events' : 'Hours'} / %)`}
                faultOverlays={showFaultOverlays ? faults : []}
                unit={selectedHistogram.includes('backfire') ? 'events' : 'hours'}
                sourceInSeconds={selectedHistogram.includes('knock')}
              />
            )}

            {/* ECT Bar Chart for Temperature Distribution */}
            {selectedHistogram === 'ect' && histograms.ect && (
              <ECTBarChart histogram={histograms.ect} />
            )}

            {/* Fault Correlation Panel */}
            {faults.length > 0 && selectedHistogram === 'speedLoad' && (
              <div className="bg-[#111921] rounded-xl border border-[#344d65] p-6">
                <div className="flex items-center gap-2 mb-4">
                  <AlertTriangle className="w-5 h-5 text-red-400" />
                  <h3 className="text-white font-bold">Fault Operating Conditions</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {faults.map((fault, idx) => (
                    <div
                      key={idx}
                      className="bg-[#1a2632] rounded-lg p-4 border border-[#344d65] hover:border-red-500/50 cursor-pointer transition-all"
                      onClick={() => setSelectedFaultIndex(idx)}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[#197fe6] font-mono font-bold">DTC {fault.code}</span>
                        {fault.causedShutdown && (
                          <span className="text-[10px] bg-red-500/20 text-red-400 px-2 py-0.5 rounded">SHUTDOWN</span>
                        )}
                      </div>
                      <div className="text-sm text-white mb-2">{fault.description}</div>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <span className="text-[#93adc8]">RPM:</span>
                          <span className="text-white font-mono ml-1">{formatNumber(fault.snapshot?.rpm, 0)}</span>
                        </div>
                        <div>
                          <span className="text-[#93adc8]">MAP:</span>
                          <span className="text-white font-mono ml-1">{formatNumber(fault.snapshot?.rMAP, 2)} psia</span>
                        </div>
                        <div>
                          <span className="text-[#93adc8]">ECT:</span>
                          <span className="text-white font-mono ml-1">{formatNumber(fault.snapshot?.rECT, 1)}°F</span>
                        </div>
                        <div>
                          <span className="text-[#93adc8]">Hours:</span>
                          <span className="text-white font-mono ml-1">{formatNumber(fault.lastOccurrence, 4)}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Fault Detail View */}
            {selectedFaultIndex !== null && faults[selectedFaultIndex] && (
              <FaultSnapshotDetail
                fault={faults[selectedFaultIndex]}
                histograms={histograms}
                onClose={() => setSelectedFaultIndex(null)}
              />
            )}

            {/* No Charts Available */}
            {histogramOptions.length === 0 && (
              <div className="bg-[#111921] rounded-xl border border-[#344d65] p-12 text-center">
                <BarChart3 className="w-16 h-16 mx-auto mb-4 text-[#344d65]" />
                <h2 className="text-xl font-semibold text-[#93adc8]">No Charts Available</h2>
                <p className="text-[#344d65]">Upload an ECM data file to view histogram charts and analysis.</p>
              </div>
            )}
          </div>
        )}

        {/* ==================== RAW DATA ==================== */}
        {activeTab === 'raw' && (
          <div className="space-y-4">
            <div className="bg-slate-900/50 rounded-xl border border-slate-800 p-4">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5" /> Raw ECM Data Sections
              </h2>
              <div className="mb-4 text-sm text-slate-400">
                ECM data is organized into sections. Click on any section to view its raw content.
              </div>
              <div className="space-y-2">
                {rawDataSections.length === 0 ? (
                  <div className="text-sm text-slate-400">No raw data sections available.</div>
                ) : (
                  rawDataSections.map((section, index) => (
                    <div key={index} className="border border-slate-700 rounded-lg overflow-hidden">
                      <button
                        onClick={() => {
                          const isExpanding = !expandedSheets[section.name];
                          setExpandedSheets(prev => ({ ...prev, [section.name]: !prev[section.name] }));
                        }}
                        className="w-full p-3 flex items-center justify-between bg-slate-800/50 hover:bg-slate-800 transition"
                      >
                        <div className="flex items-center gap-3">
                          {expandedSheets[section.name] ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                          <div>
                            <span className="font-mono text-sm font-semibold text-white">{section.name}</span>
                            <div className="text-xs text-slate-400">Lines {section.startLine + 1} - {section.startLine + section.lines.length}</div>
                          </div>
                        </div>
                        <span className="text-xs text-slate-500 bg-slate-700 px-2 py-1 rounded">
                          {section.lines.length} lines
                        </span>
                      </button>
                      {expandedSheets[section.name] && (
                        <div className="p-4 bg-black/20 border-t border-slate-700">
                          <div className="bg-slate-950 rounded-lg p-4 max-h-96 overflow-y-auto">
                            <pre className="text-xs font-mono text-slate-300 whitespace-pre-wrap">
                              {section.lines.join('\n')}
                            </pre>
                          </div>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

// Wrap PlotAnalyzer with ErrorBoundary for production safety
const App = () => (
  <ErrorBoundary>
    <PlotAnalyzer />
  </ErrorBoundary>
);

export default App;
