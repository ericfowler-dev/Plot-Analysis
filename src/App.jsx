import React, { useState, useMemo, useEffect, useCallback, useRef, useReducer, Component } from 'react';
import { toJpeg } from 'html-to-image';
import { jsPDF } from 'jspdf';
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
import {
  formatHistogramBucketLabel,
  findHistogramBucketIndex
} from './lib/histogramBuckets';

// Import B-Plot modules
import { parseBPlotData } from './lib/bplotParsers';
import { processBPlotData, detectFuelSystem } from './lib/bplotProcessData';
import { combineTimelineData, generateFileId } from './lib/bplotTimelineMerge';
import {
  generateEcmFileId,
  combineFaultData,
  combineHistogramData,
  mergeEcmStats,
  getHistogramDifference,
  findMatchingFaults,
  getEcmInfoComparison
} from './lib/ecmTimelineMerge';
import BPlotAnalysis from './components/BPlotAnalysis';
import AppHeader from './components/AppHeader';
import BaselineSelector from './components/BaselineSelector';
import ReportIssue from './components/ReportIssue';
import FileRoleModal from './components/FileRoleModal';
import EcmComparison from './components/EcmComparison';
import CombinedFaultView from './components/CombinedFaultView';
import { useThresholds } from './contexts/ThresholdContext';
import { getResolvedProfile } from './lib/thresholdService';

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
const MAX_FILE_SIZE_MB = 100;
const WARN_FILE_SIZE_MB = 20;
const MB_BYTES = 1024 * 1024;
const GUI_REVISION = '2.7.4';
const PDF_EXPORT_LIGHT_CLASS = 'pdf-export-light';

const waitForNextPaint = () => new Promise((resolve) => {
  requestAnimationFrame(() => requestAnimationFrame(resolve));
});

const PRIMARY_ROLE_HINTS = [
  /\bprimary\b/i,
  /\bpri\b/i,
  /\becm1\b/i,
  /\bplot1\b/i,
  /\bbank[_\s-]*1\b/i,
  /\bleft\b/i,
  /\blh\b/i
];

const SECONDARY_ROLE_HINTS = [
  /\bsecondary\b/i,
  /\bsec\b/i,
  /\becm2\b/i,
  /\bplot2\b/i,
  /\bbank[_\s-]*2\b/i,
  /\bright\b/i,
  /\brh\b/i
];

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
  if (!value) return '-';
  return String(value).replace(/"/g, '').replace(/,{2,}/g, '').replace(/^,+|,+$/g, '').trim() || '-';
};

const SNAPSHOT_HOUR_KEYS = [
  'hm_hours',
  'hm_ram_seconds',
  'hm_ram',
  'hour_meter',
  'hour meter',
  'hourmeter'
];

const normalizeSnapshotKey = (key) => key
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '_')
  .replace(/^_+|_+$/g, '');

const getSnapshotHoursValue = (snapshot) => {
  if (!snapshot) return null;
  for (const [key, rawValue] of Object.entries(snapshot)) {
    const normalizedKey = normalizeSnapshotKey(key);
    if (!SNAPSHOT_HOUR_KEYS.includes(normalizedKey)) continue;
    const numericValue = typeof rawValue === 'number' ? rawValue : parseFloat(rawValue);
    if (!isNaN(numericValue)) return numericValue;
  }
  return null;
};

const parseHoursValue = (value) => {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const cleaned = String(value).replace(/[^0-9.+-]/g, '');
  const numericValue = parseFloat(cleaned);
  return Number.isFinite(numericValue) ? numericValue : null;
};

const inferRoleFromFileName = (fileName = '') => {
  const normalized = String(fileName || '').toLowerCase();
  if (PRIMARY_ROLE_HINTS.some((pattern) => pattern.test(normalized))) {
    return { role: 'primary', confidence: 'high' };
  }
  if (SECONDARY_ROLE_HINTS.some((pattern) => pattern.test(normalized))) {
    return { role: 'secondary', confidence: 'high' };
  }
  return { role: null, confidence: 'low' };
};

const assignRolesForDualFiles = (files) => {
  if (!Array.isArray(files) || files.length === 0) return [];

  const withHints = files.map((file, index) => {
    if (file.role === 'primary' || file.role === 'secondary') {
      return { ...file, roleConfidence: 'high' };
    }
    const inferred = inferRoleFromFileName(file.fileName || file.name || '');
    return {
      ...file,
      role: inferred.role || (index === 0 ? 'primary' : 'secondary'),
      roleConfidence: inferred.confidence
    };
  });

  // Enforce exactly one primary when possible.
  const primaryIndices = withHints
    .map((file, index) => ({ role: file.role, index }))
    .filter((item) => item.role === 'primary')
    .map((item) => item.index);

  if (primaryIndices.length === 0) {
    withHints[0].role = 'primary';
    withHints[0].roleConfidence = 'low';
  } else if (primaryIndices.length > 1) {
    const keepPrimary = primaryIndices[0];
    primaryIndices.slice(1).forEach((idx) => {
      withHints[idx].role = 'secondary';
      withHints[idx].roleConfidence = 'low';
    });
    withHints[keepPrimary].role = 'primary';
  }

  if (withHints.length > 1 && !withHints.some((file) => file.role === 'secondary')) {
    const firstNonPrimaryIndex = withHints.findIndex((file) => file.role !== 'primary');
    const targetIndex = firstNonPrimaryIndex >= 0 ? firstNonPrimaryIndex : 1;
    withHints[targetIndex].role = 'secondary';
    withHints[targetIndex].roleConfidence = 'low';
  }

  return withHints;
};

const requiresRoleSelection = (files) => {
  if (!Array.isArray(files) || files.length <= 1) return false;
  if (files.length !== 2) return true;
  const primaryCount = files.filter((file) => file.role === 'primary').length;
  const secondaryCount = files.filter((file) => file.role === 'secondary').length;
  const highConfidence = files.every((file) => file.roleConfidence === 'high');
  return !(primaryCount === 1 && secondaryCount === 1 && highConfidence);
};

const getFaultRecencyInfo = (engineHours, lastAtHours) => {
  const engineHoursValue = parseHoursValue(engineHours);
  const lastAtValue = parseHoursValue(lastAtHours);
  if (engineHoursValue === null || lastAtValue === null) {
    return {
      className: '',
      label: '',
      rank: 2,
      delta: null
    };
  }
  const delta = engineHoursValue - lastAtValue;
  if (delta <= 2) {
    return {
      className: 'fault-recency-current',
      label: 'CURRENT',
      rank: 0,
      delta
    };
  }
  if (delta <= 50) {
    return {
      className: 'fault-recency-recent',
      label: 'RECENT',
      rank: 1,
      delta
    };
  }
  return {
    className: '',
    label: '',
    rank: 2,
    delta
  };
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

const ChartCard = ({ title, icon, children, onClick, className = '' }) => (
  <div
    className={`bg-slate-900/50 rounded-xl border border-slate-800 p-6 ${onClick ? 'cursor-pointer hover:border-slate-600 transition-colors' : ''} ${className}`}
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
      <ChartCard title="Engine Speed vs Load" icon={<BarChart3 className="w-4 h-4 text-green-400" />}>
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
    <ChartCard title="Engine Speed vs Load" icon={<BarChart3 className="w-4 h-4 text-green-400" />} onClick={onClick}>
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
  const shouldFlash = totalHours > 2;

  return (
    <ChartCard
      title="Knock Detection"
      icon={<Zap className="w-4 h-4 text-yellow-400" />}
      onClick={onClick}
      className={shouldFlash ? 'card-flash-yellow' : ''}
    >
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

  const shouldFlash = totalEvents > 10;

  return (
    <ChartCard
      title={title}
      icon={<AlertTriangle className="w-4 h-4 text-red-400" />}
      onClick={onClick}
      className={shouldFlash ? 'card-flash-red' : ''}
    >
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
const HeatmapTable = ({ histogram, title, faultOverlays = [], onCellClick, unit = 'hours', sourceInSeconds = false, secondsPerUnit = 1 }) => {
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
  const yBucketLabels = yLabels.map((_, idx) => formatHistogramBucketLabel(yLabels, idx, 0));
  const xBucketLabels = xLabels.map((_, idx) => formatHistogramBucketLabel(xLabels, idx, 1));
  const mapColumnCount = Math.max(xLabels.length, 1);

  // Conversion factor: if source is in seconds, convert to hours for display
  const conversionFactor = sourceInSeconds ? (secondsPerUnit / 3600) : 1;

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
      const faultRPMIndex = findHistogramBucketIndex(yLabels, fault.snapshot?.rpm);
      const faultMAPIndex = findHistogramBucketIndex(xLabels, fault.snapshot?.rMAP);
      return faultRPMIndex === rpm && faultMAPIndex === map;
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
            <div className="w-24 h-2 rounded-full bg-gradient-to-r from-[#1a2632] via-[#22c55e]/50 to-[#22c55e]" />
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
              <th
                rowSpan={2}
                className="min-w-[8.5rem] p-3 text-left text-xs font-bold text-[#93adc8] uppercase tracking-[0.16em] align-bottom"
              >
                RPM Range
              </th>
              <th
                colSpan={mapColumnCount}
                className="p-3 text-center text-sm font-bold text-[#c8def5] uppercase tracking-[0.2em]"
              >
                MAP Range (PSIA)
              </th>
              <th
                rowSpan={2}
                className="min-w-[7rem] p-3 text-center text-xs font-bold text-[#22c55e] border-l border-[#344d65]/50 uppercase tracking-[0.16em] align-bottom"
              >
                Row Total
              </th>
            </tr>
            <tr>
              {xLabels.map((x, idx) => (
                <th key={idx} className="min-w-[8.25rem] px-4 py-3 text-center text-[13px] font-bold text-[#93adc8] whitespace-nowrap leading-snug">
                  {xBucketLabels[idx]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {yLabels.map((yLabel, yIdx) => (
              <tr key={yIdx}>
                <td className="p-2 text-right text-[11px] font-bold text-white border-r border-[#344d65]/50 pr-4 whitespace-nowrap">
                  {yBucketLabels[yIdx]}
                </td>
                {xLabels.map((xLabel, xIdx) => {
                  const rawValue = data[yIdx]?.[xIdx] || 0;
                  const value = rawValue * conversionFactor; // Apply conversion for display
                  const percent = grandTotal > 0 ? (value / grandTotal * 100) : 0;
                  const cellStyle = getCellStyle(value);
                  const fault = getFaultAtCell(yIdx, xIdx);

                  const faultDescription = fault?.description || fault?.faultInfo?.name;
                  return (
                    <td
                      key={xIdx}
                      className={`relative p-2 rounded border text-center cursor-pointer transition-all hover:border-[#22c55e] ${
                        fault ? 'border-red-500 border-2' : 'border-white/5'
                      }`}
                      style={cellStyle}
                      onClick={() => onCellClick && onCellClick(yLabel, xLabel, value)}
                      title={`RPM: ${yBucketLabels[yIdx]}, MAP: ${xBucketLabels[xIdx]}\n${unit === 'events' ? 'Events' : 'Hours'}: ${unit === 'events' ? Math.round(value) : value.toFixed(4)}\n${percent.toFixed(2)}% of total${fault ? `\nFault DTC ${fault.code}${faultDescription ? `\n${faultDescription}` : ''}` : ''}`}
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
                  <div>{grandTotal > 0 ? (rowTotals[yIdx] / grandTotal * 100).toFixed(1) : 0}%</div>
                  <div className="text-[10px] text-[#93adc8]">{unit === 'events' ? formatNumber(rowTotals[yIdx], 0) : rowTotals[yIdx].toFixed(2) + 'h'}</div>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td className="p-2 text-right text-[10px] font-bold text-[#22c55e] uppercase pr-4 border-t border-[#344d65]/50">
                Col Total
              </td>
              {colTotals.map((total, idx) => (
                <td key={idx} className="p-2 text-center text-xs font-bold text-[#93adc8] border-t border-[#344d65]/50 font-mono">
                  <div>{grandTotal > 0 ? (total / grandTotal * 100).toFixed(1) : 0}%</div>
                  <div className="text-[10px]">{unit === 'events' ? formatNumber(total, 0) : total.toFixed(2) + 'h'}</div>
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
  const bucketLabels = xLabels.map((_, idx) => `${formatHistogramBucketLabel(xLabels, idx, 0)}°F`);

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
    bucketLabel: bucketLabels[idx],
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
  let minTemp = 0;
  let maxTemp = 0;
  if (dataWithHours.length > 0) {
    minTemp = dataWithHours[0].tempValue;
    maxTemp = dataWithHours[0].tempValue;
    for (let i = 1; i < dataWithHours.length; i++) {
      const value = dataWithHours[i].tempValue;
      if (value < minTemp) minTemp = value;
      if (value > maxTemp) maxTemp = value;
    }
  }

  // Calculate weighted average temperature
  const weightedAvg = totalHours > 0
    ? chartData.reduce((sum, d) => sum + (d.tempValue * d.hours), 0) / totalHours
    : 0;
  const coldThresholdBucketIndex = findHistogramBucketIndex(xLabels, THRESHOLDS.COLD_ECT);
  const hotThresholdBucketIndex = findHistogramBucketIndex(xLabels, THRESHOLDS.HOT_ECT);

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
          <div className="font-bold text-white mb-1">{data.bucketLabel}</div>
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
          <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
            <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#344d65" vertical={false} />
              <XAxis
                dataKey="bucketLabel"
                tick={{ fill: '#93adc8', fontSize: 9 }}
                angle={-45}
                textAnchor="end"
                height={72}
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
              {coldThresholdBucketIndex !== null && chartData[coldThresholdBucketIndex] && (
                <ReferenceLine x={chartData[coldThresholdBucketIndex].bucketLabel} stroke="#3b82f6" strokeDasharray="5 5" strokeWidth={2} />
              )}
              {hotThresholdBucketIndex !== null && chartData[hotThresholdBucketIndex] && (
                <ReferenceLine x={chartData[hotThresholdBucketIndex].bucketLabel} stroke="#ef4444" strokeDasharray="5 5" strokeWidth={2} />
              )}
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
const FaultMasterDetail = ({ faults, selectedFaultIndex, onSelectFault, engineHours, sortByRecency, faultFilter }) => {
  if (!faults || faults.length === 0) {
    return (
      <div className="text-slate-500 text-sm p-8 text-center">
        <CheckCircle className="w-12 h-12 mx-auto mb-3 text-emerald-500/50" />
        <p className="text-emerald-400 font-medium">No faults recorded</p>
        <p className="text-slate-500 text-xs mt-1">This ECM has no stored fault codes</p>
      </div>
    );
  }

  const faultItems = faults.map((fault, idx) => ({
    fault,
    idx,
    recency: getFaultRecencyInfo(engineHours, fault?.lastOccurrence)
  }));

  const orderedFaultItems = sortByRecency
    ? [...faultItems].sort((a, b) => {
      if (a.recency.rank !== b.recency.rank) {
        return a.recency.rank - b.recency.rank;
      }
      const aDelta = a.recency.delta ?? Number.POSITIVE_INFINITY;
      const bDelta = b.recency.delta ?? Number.POSITIVE_INFINITY;
      if (aDelta !== bDelta) return aDelta - bDelta;
      return a.idx - b.idx;
    })
    : faultItems;

  const filteredFaultItems = orderedFaultItems.filter(({ fault, recency }) => {
    if (!faultFilter || faultFilter === 'total') return true;
    if (faultFilter === 'current') return recency.rank === 0;
    if (faultFilter === 'recent') return recency.rank === 1;
    if (faultFilter === 'shutdown') return Boolean(fault?.causedShutdown);
    return true;
  });

  const selectedFaultAllowed = selectedFaultIndex !== null && filteredFaultItems.some(item => item.idx === selectedFaultIndex);
  const selectedFault = selectedFaultAllowed ? faults[selectedFaultIndex] : null;

  const summaryStats = filteredFaultItems.reduce((acc, item) => {
    acc.total += 1;
    acc.occurrences += item.fault?.occurrenceCount || 0;
    if (item.fault?.lastOccurrence !== null && item.fault?.lastOccurrence !== undefined) {
      const lastVal = parseHoursValue(item.fault.lastOccurrence);
      if (lastVal !== null) {
        acc.latest = acc.latest === null ? lastVal : Math.max(acc.latest, lastVal);
      }
    }
    return acc;
  }, { total: 0, occurrences: 0, latest: null });

  const topByLastOccurrence = [...filteredFaultItems]
    .sort((a, b) => {
      const aLast = parseHoursValue(a.fault?.lastOccurrence) ?? -Infinity;
      const bLast = parseHoursValue(b.fault?.lastOccurrence) ?? -Infinity;
      return bLast - aLast;
    })
    .slice(0, 3);

  return (
    <div className="flex flex-col lg:flex-row gap-4" style={{ minHeight: '400px' }}>
      {/* Left Panel - Fault List */}
      <div className="w-full lg:w-80 flex-shrink-0 flex flex-col border-b lg:border-b-0 lg:border-r border-slate-700 pb-4 lg:pb-0 lg:pr-4">
        <div className="text-xs text-slate-500 uppercase tracking-wider mb-2 px-2">
          {filteredFaultItems.length} Fault{filteredFaultItems.length !== 1 ? 's' : ''} Recorded
        </div>
        <div className="flex-1 overflow-y-auto space-y-2 pr-2 max-h-[55vh] lg:max-h-[500px]">
          {filteredFaultItems.map(({ fault, idx, recency }) => {
            const recencyBadgeClass = recency.className === 'fault-recency-current'
              ? 'bg-red-500/20 text-red-300 border border-red-500/40'
              : recency.className === 'fault-recency-recent'
                ? 'bg-yellow-500/20 text-yellow-200 border border-yellow-400/40'
                : '';
            return (
            <div
              key={idx}
              onClick={() => onSelectFault(idx)}
              className={`fault-item p-3 rounded-lg cursor-pointer transition-all ${recency.className} ${
                selectedFaultIndex === idx
                  ? 'bg-green-500/20 border border-green-500/50 shadow-lg shadow-green-500/10'
                  : 'bg-slate-800/50 border border-transparent hover:bg-slate-800 hover:border-slate-700'
              }`}
            >
              {/* Fault Header */}
              <div className="flex items-center justify-between mb-1">
                <span className={`font-mono font-bold ${selectedFaultIndex === idx ? 'text-green-400' : 'text-green-500'}`}>
                  DTC {fault.code}
                </span>
                <div className="flex items-center gap-1">
                  {fault.causedShutdown && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] bg-red-500/30 text-red-400 font-medium flex items-center gap-1 shutdown-glow">
                      <AlertTriangle className="w-3 h-3" />
                      <span className="shutdown-text-glow">SHUTDOWN</span>
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
              <div className="flex items-center gap-3 text-[11px] text-slate-400 flex-wrap">
                <span>Count: <span className="text-white font-mono">{fault.occurrenceCount || 0}</span></span>
                <span>Last: <span className="text-white font-mono">{formatNumber(fault.lastOccurrence, 2)}h</span></span>
                {recency.label && (
                  <span className={`text-[10px] font-bold tracking-wide px-1.5 py-0.5 rounded ${recencyBadgeClass}`}>
                    {recency.label}
                  </span>
                )}
              </div>
            </div>
          )})}
        </div>
      </div>

      {/* Right Panel - Fault Detail */}
      <div className="flex-1 min-w-0">
        {selectedFault ? (
          <FaultSnapshotDetailInline fault={selectedFault} engineHours={engineHours} />
        ) : (
          <div className="h-full overflow-y-auto pr-2 max-h-[55vh] lg:max-h-[500px]">
            <div className="bg-slate-800/50 rounded-lg p-4 mb-4">
              <div className="flex items-center gap-2 mb-3 text-slate-300 font-semibold">
                <ChevronRight className="w-4 h-4 text-slate-400" />
                <span>Filtered Fault Summary</span>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-slate-900/50 rounded p-2">
                  <div className="text-[10px] text-slate-500 uppercase">Faults</div>
                  <div className="text-white font-mono font-bold">{summaryStats.total}</div>
                </div>
                <div className="bg-slate-900/50 rounded p-2">
                  <div className="text-[10px] text-slate-500 uppercase">Occurrences</div>
                  <div className="text-white font-mono font-bold">{summaryStats.occurrences}</div>
                </div>
                <div className="bg-slate-900/50 rounded p-2">
                  <div className="text-[10px] text-slate-500 uppercase">Latest @ Hours</div>
                  <div className="text-white font-mono font-bold">
                    {summaryStats.latest === null ? '—' : `${formatNumber(summaryStats.latest, 2)}h`}
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-slate-800/50 rounded-lg p-4">
              <div className="text-xs text-slate-400 uppercase tracking-wider mb-3">Most Recent Faults</div>
              {topByLastOccurrence.length === 0 ? (
                <div className="text-sm text-slate-500">No faults match this filter.</div>
              ) : (
                <div className="space-y-2">
                  {topByLastOccurrence.map(({ fault, idx }) => (
                    <button
                      key={idx}
                      onClick={() => onSelectFault(idx)}
                      className="w-full text-left bg-slate-900/40 hover:bg-slate-900/70 border border-slate-700/60 rounded-lg p-3 transition-colors"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-green-400 font-mono font-bold">DTC {fault.code}</span>
                        <span className="text-xs text-slate-400 font-mono">
                          {formatNumber(fault.lastOccurrence, 2)}h
                        </span>
                      </div>
                      <div className="text-sm text-white line-clamp-2">{fault.description || 'Unknown fault'}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// =============================================================================
// FAULT TIMELINE TAB - Initial/Last occurrence sequencing
// =============================================================================
const FaultTimelineTab = ({ faults, engineHours, sortKey, onSortChange, showSource = false }) => {
  if (!faults || faults.length === 0) {
    return (
      <div className="bg-slate-900/50 rounded-xl border border-slate-800 p-8 text-center">
        <CheckCircle className="w-12 h-12 mx-auto mb-3 text-emerald-500/50" />
        <p className="text-emerald-400 font-medium">No faults recorded</p>
        <p className="text-slate-500 text-xs mt-1">This ECM has no stored fault codes</p>
      </div>
    );
  }

  const timelineItems = faults.map((fault) => {
    const initial = parseHoursValue(fault?.initialOccurrence);
    const last = parseHoursValue(fault?.lastOccurrence);
    const recency = getFaultRecencyInfo(engineHours, last);
    return {
      fault,
      initial,
      last,
      recency,
      status: fault?.occurredThisCycle ? 'Active' : 'Historic'
    };
  });

  const sortedItems = [...timelineItems].sort((a, b) => {
    if (sortKey === 'last') {
      const aVal = a.last ?? -Infinity;
      const bVal = b.last ?? -Infinity;
      if (aVal !== bVal) return bVal - aVal;
      return (a.initial ?? -Infinity) - (b.initial ?? -Infinity);
    }
    const aVal = a.initial ?? Infinity;
    const bVal = b.initial ?? Infinity;
    if (aVal !== bVal) return aVal - bVal;
    return (a.last ?? Infinity) - (b.last ?? Infinity);
  });

  const activeCount = timelineItems.filter(item => item.status === 'Active').length;
  const historicCount = timelineItems.length - activeCount;

  return (
    <div className="space-y-4">
      <div className="bg-slate-900/50 rounded-xl border border-slate-800 p-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Clock className="w-5 h-5 text-green-400" />
            <div className="text-base font-semibold text-slate-300">Fault Occurrence Timeline</div>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <div className="text-slate-400">Current Hours:</div>
            <div className="text-white font-mono">{formatNumber(engineHours, 1)}h</div>
            <div className="text-slate-400">Active:</div>
            <div className="text-white font-mono">{activeCount}</div>
            <div className="text-slate-400">Historic:</div>
            <div className="text-white font-mono">{historicCount}</div>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2 text-[10px] font-bold uppercase tracking-widest">
          <span className="text-slate-500">Sort by</span>
          <button
            type="button"
            onClick={() => onSortChange('initial')}
            className={`px-3 py-1 rounded border transition-colors ${
              sortKey === 'initial'
                ? 'border-green-500/60 text-green-300 bg-green-500/10'
                : 'border-slate-700 text-slate-400 hover:border-slate-500 hover:text-slate-200'
            }`}
          >
            Initial Occurrence
          </button>
          <button
            type="button"
            onClick={() => onSortChange('last')}
            className={`px-3 py-1 rounded border transition-colors ${
              sortKey === 'last'
                ? 'border-green-500/60 text-green-300 bg-green-500/10'
                : 'border-slate-700 text-slate-400 hover:border-slate-500 hover:text-slate-200'
            }`}
          >
            Last Occurrence
          </button>
        </div>
      </div>

      <div className="bg-slate-900/50 rounded-xl border border-slate-800 overflow-hidden">
        <div className="grid grid-cols-12 gap-2 px-4 py-3 text-[10px] uppercase tracking-widest text-slate-500 border-b border-slate-800">
          <div className="col-span-2">DTC</div>
          {showSource && <div className="col-span-1">ECM</div>}
          <div className={showSource ? 'col-span-3' : 'col-span-4'}>Description</div>
          <div className="col-span-1">Status</div>
          <div className="col-span-2">Initial</div>
          <div className="col-span-2">Last</div>
          <div className="col-span-1 text-right">Δ Hrs</div>
        </div>
        <div className="divide-y divide-slate-800">
          {sortedItems.map((item, index) => {
            const { fault, initial, last, recency, status } = item;
            const delta = (last !== null && last !== undefined && Number.isFinite(engineHours))
              ? engineHours - last
              : null;
            const recencyBadgeClass = recency.className === 'fault-recency-current'
              ? 'bg-red-500/20 text-red-300 border border-red-500/40'
              : recency.className === 'fault-recency-recent'
                ? 'bg-yellow-500/20 text-yellow-200 border border-yellow-400/40'
                : '';
            const sourceIsPrimary = fault?.sourceRole === 'primary';
            return (
              <div key={`${fault.code}-${index}`} className="grid grid-cols-12 gap-2 px-4 py-3 text-sm text-slate-200">
                <div className="col-span-2 font-mono text-green-400">DTC {fault.code}</div>
                {showSource && (
                  <div className="col-span-1">
                    <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide border ${
                      sourceIsPrimary
                        ? 'bg-blue-500/20 border-blue-500/40 text-blue-300'
                        : 'bg-orange-500/20 border-orange-500/40 text-orange-300'
                    }`}>
                      {sourceIsPrimary ? 'P' : 'S'}
                    </span>
                  </div>
                )}
                <div className={showSource ? 'col-span-3 text-slate-100' : 'col-span-4 text-slate-100'}>{fault.description || 'Unknown fault'}</div>
                <div className="col-span-1">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                    status === 'Active'
                      ? 'border-orange-400/60 text-orange-300 bg-orange-500/10'
                      : 'border-slate-600 text-slate-300 bg-slate-800/40'
                  }`}>
                    {status}
                  </span>
                </div>
                <div className="col-span-2 font-mono text-slate-300">
                  {initial === null ? '—' : `${formatNumber(initial, 2)}h`}
                </div>
                <div className="col-span-2 font-mono text-slate-300 flex items-center gap-2">
                  <span>{last === null ? '—' : `${formatNumber(last, 2)}h`}</span>
                  {recency.label && (
                    <span className={`text-[9px] font-bold tracking-wide px-1.5 py-0.5 rounded ${recencyBadgeClass}`}>
                      {recency.label}
                    </span>
                  )}
                </div>
                <div className="col-span-1 text-right font-mono text-slate-300">
                  {delta === null || Number.isNaN(delta) ? '—' : `${formatNumber(delta, 1)}h`}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

// Inline version of fault detail (no close button, fits in master-detail layout)
const FaultSnapshotDetailInline = ({ fault, engineHours }) => {
  const [showRawData, setShowRawData] = useState(false);

  if (!fault) return null;

  const recency = getFaultRecencyInfo(engineHours, fault?.lastOccurrence);
  const recencyBadgeClass = recency.className === 'fault-recency-current'
    ? 'bg-red-500/20 text-red-300 border border-red-500/40'
    : recency.className === 'fault-recency-recent'
      ? 'bg-yellow-500/20 text-yellow-200 border border-yellow-400/40'
      : '';

  const snapshot = fault.snapshot || {};
  const snapshotHours = getSnapshotHoursValue(snapshot);
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
            <div className="text-green-400 font-mono font-bold text-lg">DTC {fault.code}</div>
            <div className="text-white text-base">{fault.description || 'Unknown fault'}</div>
          </div>
          <div className="flex gap-2 flex-wrap justify-end">
            {recency.label && (
              <span className={`px-2 py-1 rounded text-xs font-bold tracking-wide border ${recencyBadgeClass}`}>
                {recency.label}
              </span>
            )}
            {fault.causedShutdown && (
              <span className="px-2 py-1 rounded text-xs bg-red-500/30 text-red-400 font-medium flex items-center gap-1 shutdown-glow">
                <AlertTriangle className="w-3 h-3" />
                <span className="shutdown-text-glow">Caused Shutdown</span>
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

        {snapshotHours !== null && (
          <div className="mt-3 text-green-400 font-bold text-lg tracking-wide">
            Snapshot data Hours: {formatNumber(snapshotHours, 2)}
          </div>
        )}
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
                    <div className="py-0.5 text-green-400">{key}</div>
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
            <span className="text-2xl font-bold text-[#22c55e] font-mono">DTC {fault.code}</span>
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
            <div className="font-mono font-bold text-[#22c55e]">{formatNumber(snapshot.rpm, 0)} RPM</div>
          </div>
          <div>
            <div className="text-[10px] text-[#93adc8] uppercase tracking-wider mb-1">Fault MAP</div>
            <div className="font-mono font-bold text-[#22c55e]">{formatNumber(snapshot.rMAP, 2)} psia</div>
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
  // File loading flags (independent tracking)
  hasEcm: false,
  hasBplt: false,
  ecmFileName: '',
  bpltFileName: '',
  // Legacy fileType for backward compatibility
  fileType: null,
  fileName: '',
  parsed: false,
  // Active view tab
  activeTab: 'overview',
  // ECM specific - single file (backward compatible)
  ecmInfo: {},
  histograms: {},
  faults: [],
  stats: {},
  analysis: {},
  summaryStats: {},
  processedHistograms: {},
  selectedHistogram: 'speedLoad',
  // ECM multi-file support (Primary/Secondary)
  ecmFiles: [],                // Array of { id, fileName, role, ecmInfo, histograms, faults, stats }
  hasPrimaryEcm: false,
  hasSecondaryEcm: false,
  combinedEcmHistograms: {},   // Merged histogram data from both ECMs
  combinedEcmFaults: [],       // Combined faults with source attribution
  ecmViewMode: 'combined',     // 'combined' | 'side-by-side' | 'primary' | 'secondary'
  ecmComparisonStats: null,    // Merged stats from both ECMs
  // B-Plot specific - single file (backward compatible)
  bplotData: null,
  bplotProcessed: null,
  // B-Plot multi-file support
  bplotFiles: [],              // Array of { id, fileName, role, data, processed, timeOffset }
  combinedBplotData: null,     // Merged timeline data for unified view
  combinedBplotProcessed: null,// Combined processed results
  fileBoundaries: [],          // Array of { fileId, fileName, startTime, endTime }
  bplotMergeMode: 'sequential',// 'single' | 'sequential' | 'correlated'
  bplotCorrelation: null,      // Correlation summary for dual-plot mode
  // ECM fault overlay for B-Plot charts
  ecmFaultsForOverlay: [],     // ECM faults to overlay on B-Plot charts
  ecmFaultsBySource: { primary: [], secondary: [] }, // ECM faults separated by source
  // File role selection modal
  pendingRoleSelection: null   // { fileType: 'ecm'|'bplot', files: [] } when awaiting role selection
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
        hasEcm: true,
        ecmFileName: action.payload.fileName,
        fileType: state.hasBplt ? 'both' : FILE_TYPES.ECM,
        ecmInfo: action.payload.ecmInfo,
        histograms: action.payload.histograms,
        faults: processedFaults,
        stats: action.payload.stats,
        analysis,
        summaryStats,
        processedHistograms,
        fileName: action.payload.fileName,
        parsed: true,
        activeTab: state.hasBplt ? 'overview-ecm' : 'overview'
      };

    case 'ECM_FILES_LOADED': {
      // Multi-ECM file load with Primary/Secondary roles
      const { files } = action.payload;
      const primaryFile = files.find(f => f.role === 'primary');
      const secondaryFile = files.find(f => f.role === 'secondary');

      // Process faults for each file
      const processedFiles = files.map(file => ({
        ...file,
        faults: processFaultData(file.faults),
        processedHistograms: processAllHistograms(file.histograms, ECM_HISTOGRAM_CONFIG)
      }));

      // Combine faults with source attribution
      const combinedFaults = combineFaultData(processedFiles);
      const combinedHistograms = combineHistogramData(processedFiles);
      const comparisonStats = mergeEcmStats(processedFiles);

      // Use primary file for main display (backward compatible)
      const primaryProcessed = processedFiles.find(f => f.role === 'primary') || processedFiles[0];
      const primaryFaults = primaryProcessed?.faults || [];
      const primaryHistograms = primaryProcessed?.processedHistograms || {};
      const primaryAnalysis = analyzeECMData(
        primaryProcessed?.ecmInfo,
        primaryHistograms,
        primaryFaults,
        primaryProcessed?.stats
      );
      const primarySummaryStats = generateSummaryStats(
        primaryProcessed?.ecmInfo,
        primaryHistograms,
        primaryFaults,
        primaryProcessed?.stats
      );

      // Separate faults by source for BPLOT overlay
      const primaryFaultsForOverlay = combinedFaults.filter(f => f.sourceRole === 'primary');
      const secondaryFaultsForOverlay = combinedFaults.filter(f => f.sourceRole === 'secondary');

      return {
        ...state,
        hasEcm: true,
        hasPrimaryEcm: Boolean(primaryFile),
        hasSecondaryEcm: Boolean(secondaryFile),
        ecmFileName: files.map(f => f.fileName).join(', '),
        fileType: state.hasBplt ? 'both' : FILE_TYPES.ECM,
        // Primary ECM data for backward compatible views
        ecmInfo: primaryProcessed?.ecmInfo || {},
        histograms: primaryProcessed?.histograms || {},
        faults: primaryFaults,
        stats: primaryProcessed?.stats || {},
        analysis: primaryAnalysis,
        summaryStats: primarySummaryStats,
        processedHistograms: primaryHistograms,
        // Multi-ECM specific
        ecmFiles: processedFiles,
        combinedEcmHistograms: combinedHistograms,
        combinedEcmFaults: combinedFaults,
        ecmComparisonStats: comparisonStats,
        ecmFaultsForOverlay: combinedFaults,
        ecmFaultsBySource: {
          primary: primaryFaultsForOverlay,
          secondary: secondaryFaultsForOverlay
        },
        fileName: files.map(f => f.fileName).join(', '),
        parsed: true,
        activeTab: state.hasBplt ? 'overview-ecm' : 'overview',
        pendingRoleSelection: null
      };
    }

    case 'SET_ECM_FILE_ROLE': {
      // Update role for a specific ECM file
      const { fileId, role } = action.payload;
      const updatedFiles = state.ecmFiles.map(f =>
        f.id === fileId ? { ...f, role } : f
      );

      // If setting as primary, ensure no other file is primary
      if (role === 'primary') {
        updatedFiles.forEach(f => {
          if (f.id !== fileId && f.role === 'primary') {
            f.role = 'secondary';
          }
        });
      }

      // Recalculate combined data
      const combinedFaults = combineFaultData(updatedFiles);
      const combinedHistograms = combineHistogramData(updatedFiles);
      const comparisonStats = mergeEcmStats(updatedFiles);

      const primaryFile = updatedFiles.find(f => f.role === 'primary');
      const secondaryFile = updatedFiles.find(f => f.role === 'secondary');

      return {
        ...state,
        ecmFiles: updatedFiles,
        hasPrimaryEcm: Boolean(primaryFile),
        hasSecondaryEcm: Boolean(secondaryFile),
        combinedEcmHistograms: combinedHistograms,
        combinedEcmFaults: combinedFaults,
        ecmComparisonStats: comparisonStats,
        ecmFaultsBySource: {
          primary: combinedFaults.filter(f => f.sourceRole === 'primary'),
          secondary: combinedFaults.filter(f => f.sourceRole === 'secondary')
        }
      };
    }

    case 'SET_ECM_VIEW_MODE':
      return { ...state, ecmViewMode: action.payload };

    case 'SET_PENDING_ROLE_SELECTION':
      return { ...state, pendingRoleSelection: action.payload };

    case 'CLEAR_PENDING_ROLE_SELECTION':
      return { ...state, pendingRoleSelection: null };
    case 'BPLOT_FILE_LOADED':
      return {
        ...state,
        hasBplt: true,
        bpltFileName: action.payload.fileName,
        fileType: state.hasEcm ? 'both' : FILE_TYPES.BPLOT,
        bplotData: action.payload.data,
        bplotProcessed: action.payload.processed,
        bplotMergeMode: 'single',
        bplotCorrelation: null,
        fileName: action.payload.fileName,
        parsed: true,
        activeTab: state.hasEcm ? 'overview-ecm' : 'overview'
      };
    case 'BPLOT_FILES_LOADED': {
      // Multi-file B-Plot load with combined timeline
      const bplotFilesWithRoles = action.payload.files.map((f, idx) => ({
        ...f,
        role: f.role || (idx === 0 ? 'primary' : 'secondary')
      }));
      return {
        ...state,
        hasBplt: true,
        bpltFileName: bplotFilesWithRoles.map(f => f.fileName).join(', '),
        fileType: state.hasEcm ? 'both' : FILE_TYPES.BPLOT,
        bplotFiles: bplotFilesWithRoles,
        combinedBplotData: action.payload.combinedData,
        combinedBplotProcessed: action.payload.combinedProcessed,
        fileBoundaries: action.payload.fileBoundaries || [],
        bplotMergeMode: action.payload.mergeMode || 'sequential',
        bplotCorrelation: action.payload.correlation || null,
        // Set primary data to combined for display
        bplotData: action.payload.combinedData,
        bplotProcessed: action.payload.combinedProcessed,
        fileName: bplotFilesWithRoles.map(f => f.fileName).join(', '),
        parsed: true,
        activeTab: state.hasEcm ? 'overview-ecm' : 'overview'
      };
    }

    case 'SET_BPLOT_FILE_ROLE': {
      // Update role for a specific BPLOT file
      const { fileId, role } = action.payload;
      const updatedBplotFiles = state.bplotFiles.map(f =>
        f.id === fileId ? { ...f, role } : f
      );

      // If setting as primary, ensure no other file is primary
      if (role === 'primary') {
        updatedBplotFiles.forEach(f => {
          if (f.id !== fileId && f.role === 'primary') {
            f.role = 'secondary';
          }
        });
      }

      return {
        ...state,
        bplotFiles: updatedBplotFiles
      };
    }
    case 'BPLOT_REPROCESSED':
      return {
        ...state,
        bplotProcessed: action.payload.processed
      };
    case 'BPLOT_FILES_REPROCESSED':
      return {
        ...state,
        bplotFiles: action.payload.files,
        combinedBplotData: action.payload.combinedData,
        combinedBplotProcessed: action.payload.combinedProcessed,
        fileBoundaries: action.payload.fileBoundaries || [],
        bplotMergeMode: action.payload.mergeMode || state.bplotMergeMode,
        bplotCorrelation: action.payload.correlation || state.bplotCorrelation,
        bplotData: action.payload.combinedData,
        bplotProcessed: action.payload.combinedProcessed
      };
    case 'ADD_BPLOT_FILE':
      // Add a single file to existing multi-file set
      const newFiles = [...state.bplotFiles, action.payload.file];
      return {
        ...state,
        bplotFiles: newFiles,
        combinedBplotData: action.payload.combinedData,
        combinedBplotProcessed: action.payload.combinedProcessed,
        fileBoundaries: action.payload.fileBoundaries || [],
        bplotMergeMode: action.payload.mergeMode || state.bplotMergeMode,
        bplotCorrelation: action.payload.correlation || state.bplotCorrelation,
        bplotData: action.payload.combinedData,
        bplotProcessed: action.payload.combinedProcessed,
        fileName: newFiles.map(f => f.fileName).join(', ')
      };
    case 'BOTH_FILES_LOADED': {
      // Load both ECM and BPLT files at once
      // Handle single ECM or multiple ECM files
      const ecmDataArray = Array.isArray(action.payload.ecmData)
        ? action.payload.ecmData
        : [action.payload.ecmData];

      // Process ECM files with roles
      const ecmFilesProcessed = ecmDataArray.map((ecmData, idx) => ({
        id: ecmData.id || generateEcmFileId(),
        fileName: ecmData.fileName,
        role: ecmData.role || (idx === 0 ? 'primary' : 'secondary'),
        ecmInfo: ecmData.ecmInfo,
        histograms: ecmData.histograms,
        faults: processFaultData(ecmData.faults),
        stats: ecmData.stats,
        processedHistograms: processAllHistograms(ecmData.histograms, ECM_HISTOGRAM_CONFIG)
      }));

      const hasMutliEcm = ecmFilesProcessed.length > 1;
      const primaryEcm = ecmFilesProcessed.find(f => f.role === 'primary') || ecmFilesProcessed[0];
      const secondaryEcm = ecmFilesProcessed.find(f => f.role === 'secondary');

      // Combine ECM data if multiple files
      const bothCombinedFaults = hasMutliEcm ? combineFaultData(ecmFilesProcessed) : primaryEcm.faults;
      const bothCombinedHistograms = hasMutliEcm ? combineHistogramData(ecmFilesProcessed) : {};
      const bothComparisonStats = hasMutliEcm ? mergeEcmStats(ecmFilesProcessed) : null;

      const bothProcessedFaults = primaryEcm.faults;
      const bothProcessedHistograms = primaryEcm.processedHistograms;
      const bothAnalysis = analyzeECMData(primaryEcm.ecmInfo, bothProcessedHistograms, bothProcessedFaults, primaryEcm.stats);
      const bothSummaryStats = generateSummaryStats(primaryEcm.ecmInfo, bothProcessedHistograms, bothProcessedFaults, primaryEcm.stats);

      // Process BPLOT files with roles
      const bplotFilesWithRoles = action.payload.bplotFiles.map((f, idx) => ({
        ...f,
        role: f.role || (idx === 0 ? 'primary' : 'secondary')
      }));

      // Debug logging
      console.log('[BOTH_FILES_LOADED] ECM files:', ecmFilesProcessed.length, ecmFilesProcessed.map(f => `${f.fileName} (${f.role})`));
      console.log('[BOTH_FILES_LOADED] BPLOT files:', bplotFilesWithRoles.length, bplotFilesWithRoles.map(f => `${f.fileName} (${f.role})`));
      console.log('[BOTH_FILES_LOADED] hasPrimaryEcm:', Boolean(primaryEcm), 'hasSecondaryEcm:', Boolean(secondaryEcm));

      return {
        ...state,
        // ECM data (primary for backward compatibility)
        hasEcm: true,
        hasPrimaryEcm: Boolean(primaryEcm),
        hasSecondaryEcm: Boolean(secondaryEcm),
        ecmFileName: ecmFilesProcessed.map(f => f.fileName).join(', '),
        ecmInfo: primaryEcm.ecmInfo,
        histograms: primaryEcm.histograms,
        faults: bothProcessedFaults,
        stats: primaryEcm.stats,
        analysis: bothAnalysis,
        summaryStats: bothSummaryStats,
        processedHistograms: bothProcessedHistograms,
        // Multi-ECM specific
        ecmFiles: ecmFilesProcessed,
        combinedEcmHistograms: bothCombinedHistograms,
        combinedEcmFaults: bothCombinedFaults,
        ecmComparisonStats: bothComparisonStats,
        ecmFaultsBySource: hasMutliEcm ? {
          primary: bothCombinedFaults.filter(f => f.sourceRole === 'primary'),
          secondary: bothCombinedFaults.filter(f => f.sourceRole === 'secondary')
        } : { primary: bothProcessedFaults, secondary: [] },
        // BPLT data
        hasBplt: true,
        bpltFileName: bplotFilesWithRoles.map(f => f.fileName).join(', '),
        bplotFiles: bplotFilesWithRoles,
        combinedBplotData: action.payload.combinedData,
        combinedBplotProcessed: action.payload.combinedProcessed,
        fileBoundaries: action.payload.fileBoundaries || [],
        bplotMergeMode: action.payload.mergeMode || 'sequential',
        bplotCorrelation: action.payload.correlation || null,
        bplotData: action.payload.combinedData,
        bplotProcessed: action.payload.combinedProcessed,
        // Combined
        fileType: 'both',
        fileName: primaryEcm.fileName,
        parsed: true,
        activeTab: 'overview-ecm',
        ecmFaultsForOverlay: bothCombinedFaults,
        pendingRoleSelection: null
      };
    }
    case 'SET_ECM_FAULTS_FOR_OVERLAY':
      // Set ECM faults for overlay on B-Plot charts
      return {
        ...state,
        ecmFaultsForOverlay: action.payload
      };
    case 'SET_SELECTED_HISTOGRAM':
      return { ...state, selectedHistogram: action.payload };
    case 'SET_ACTIVE_TAB':
      return { ...state, activeTab: action.payload };
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
    resolvedProfile,
    selectProfile,
    selectedProfileId,
    baselineSelection,
    baselineAlertsEnabled,
    loading: profileLoading,
    error: profileError
  } = useThresholds();
  const activeThresholdProfile = useMemo(() => {
    // Use the resolved profile even if it's the fallback
    // This ensures basic threshold checks work even when API is unavailable
    if (!resolvedProfile) {
      return null;
    }
    // Log warning if using fallback (API unavailable)
    if (resolvedProfile.profileId === 'fallback' && profileError) {
      console.warn('Using fallback thresholds - API server may not be running. Start with: npm run dev');
    }
    return resolvedProfile;
  }, [resolvedProfile, profileError]);

  const [baselineData, setBaselineData] = useState(null);

  useEffect(() => {
    let isMounted = true;
    const loadBaselines = async () => {
      try {
        const response = await fetch('/api/baselines');
        if (!response.ok) throw new Error('Failed to load baseline data');
        const payload = await response.json();
        const data = payload?.data || payload;
        if (isMounted) {
          setBaselineData(data);
        }
      } catch (err) {
        console.warn('Baseline data unavailable:', err);
      }
    };
    loadBaselines();
    return () => { isMounted = false; };
  }, []);

  const selectedBaseline = useMemo(() => {
    if (!baselineSelection?.group || !baselineSelection?.size || !baselineSelection?.application) {
      return null;
    }
    return baselineData?.groups?.[baselineSelection.group]?.[baselineSelection.size]?.[baselineSelection.application] || null;
  }, [baselineData, baselineSelection]);

  const baselineOptions = useMemo(() => ({
    baseline: selectedBaseline,
    baselineSelection,
    baselineAlertsEnabled: baselineAlertsEnabled && Boolean(selectedBaseline)
  }), [selectedBaseline, baselineSelection, baselineAlertsEnabled]);
  const {
    hasEcm, hasBplt, ecmFileName, bpltFileName, activeTab,
    fileType, ecmInfo, histograms, faults, stats, analysis, summaryStats,
    processedHistograms, selectedHistogram, fileName, parsed,
    bplotData, bplotProcessed,
    bplotFiles, combinedBplotData, combinedBplotProcessed, fileBoundaries, bplotMergeMode, bplotCorrelation,
    ecmFaultsForOverlay,
    // Multi-ECM state
    ecmFiles, hasPrimaryEcm, hasSecondaryEcm, combinedEcmHistograms,
    combinedEcmFaults, ecmViewMode, ecmComparisonStats, ecmFaultsBySource,
    pendingRoleSelection
  } = state;

  // Tab change handler
  const handleTabChange = (tabId) => {
    dispatch({ type: 'SET_ACTIVE_TAB', payload: tabId });
  };

  // UI state
  const [rawSheets, setRawSheets] = useState({});
  const [rawSheetNames, setRawSheetNames] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [expandedSheets, setExpandedSheets] = useState({});
  const [showAllRows, setShowAllRows] = useState({});
  const [rawFileContent, setRawFileContent] = useState('');
  const [selectedFaultIndex, setSelectedFaultIndex] = useState(null);
  const [sortFaultsByRecency, setSortFaultsByRecency] = useState(() => {
    if (typeof window === 'undefined') return true;
    const stored = window.localStorage.getItem('plot-analyzer-sort-faults-by-recency');
    if (stored === 'true') return true;
    if (stored === 'false') return false;
    return true;
  });
  const [faultFilter, setFaultFilter] = useState('total');
  const [showFaultOverlays, setShowFaultOverlays] = useState(true);
  const [scrollToAlerts, setScrollToAlerts] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [showReportIssue, setShowReportIssue] = useState(false);
  const [faultTimelineSort, setFaultTimelineSort] = useState('initial');
  const [userFields, setUserFields] = useState({
    engineSn: '',
    caseFile: '',
    ref: ''
  });
  const [userFieldsDraft, setUserFieldsDraft] = useState({
    engineSn: '',
    caseFile: '',
    ref: ''
  });
  const [isUserFieldsEditing, setIsUserFieldsEditing] = useState(false);
  const reportRef = useRef(null);
  const workerRef = useRef(null);
  const alertsRef = useRef(null);
  const [ecmDisplayRole, setEcmDisplayRole] = useState('primary');

  const hasDualEcm = hasPrimaryEcm && hasSecondaryEcm;
  const activeEcmFile = useMemo(() => {
    if (!hasDualEcm) return null;
    return (
      ecmFiles.find((file) => file.role === ecmDisplayRole) ||
      ecmFiles.find((file) => file.role === 'primary') ||
      ecmFiles[0] ||
      null
    );
  }, [hasDualEcm, ecmFiles, ecmDisplayRole]);

  useEffect(() => {
    if (!hasDualEcm && ecmDisplayRole !== 'primary') {
      setEcmDisplayRole('primary');
    }
    if (hasDualEcm && !activeEcmFile) {
      setEcmDisplayRole('primary');
    }
  }, [hasDualEcm, activeEcmFile, ecmDisplayRole]);

  const displayEcmInfo = hasDualEcm ? (activeEcmFile?.ecmInfo || {}) : ecmInfo;
  const displayHistograms = hasDualEcm ? (activeEcmFile?.histograms || {}) : histograms;
  const displayFaults = hasDualEcm ? (activeEcmFile?.faults || []) : faults;
  const displayStats = hasDualEcm ? (activeEcmFile?.stats || {}) : stats;
  const displayProcessedHistograms = hasDualEcm ? (activeEcmFile?.processedHistograms || {}) : processedHistograms;

  const displayAnalysis = useMemo(() => {
    if (!hasDualEcm) return analysis;
    return analyzeECMData(displayEcmInfo, displayProcessedHistograms, displayFaults, displayStats);
  }, [hasDualEcm, analysis, displayEcmInfo, displayProcessedHistograms, displayFaults, displayStats]);

  const displaySummaryStats = useMemo(() => {
    if (!hasDualEcm) return summaryStats;
    return generateSummaryStats(displayEcmInfo, displayProcessedHistograms, displayFaults, displayStats);
  }, [hasDualEcm, summaryStats, displayEcmInfo, displayProcessedHistograms, displayFaults, displayStats]);

  const ecmChartsTabId = hasBplt ? 'charts-ecm' : 'charts';

  useEffect(() => {
    if (PERF) console.log(`[perf] tab change: ${activeTab}`);
  }, [activeTab]);

  useEffect(() => {
    if (!scrollToAlerts) return;
    if (activeTab !== 'charts' && activeTab !== 'charts-ecm') return;
    if (!displayAnalysis?.alerts?.length) return;
    if (alertsRef.current) {
      alertsRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    setScrollToAlerts(false);
  }, [scrollToAlerts, activeTab, displayAnalysis?.alerts?.length]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem('plot-analyzer-sort-faults-by-recency', String(sortFaultsByRecency));
  }, [sortFaultsByRecency]);

  useEffect(() => {
    setSelectedFaultIndex(null);
  }, [faultFilter, sortFaultsByRecency, displayStats.engineHours, ecmDisplayRole]);

  const faultRecencyCounts = useMemo(() => {
    if (!displayFaults || displayFaults.length === 0) {
      return { current: 0, recent: 0 };
    }
    let current = 0;
    let recent = 0;
    displayFaults.forEach((fault) => {
      const info = getFaultRecencyInfo(displayStats.engineHours, fault?.lastOccurrence);
      if (info.rank === 0) current += 1;
      if (info.rank === 1) recent += 1;
    });
    return { current, recent };
  }, [displayFaults, displayStats.engineHours]);

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
      if (DEBUG) console.log('Plot Analyzer worker initialized');
    } catch (err) {
      console.warn('Web Worker not supported, using main thread:', err);
    }
  }, []);

  // Reprocess B-Plot anomalies when threshold profile changes (ID or version)
  useEffect(() => {
    if (!hasBplt || !activeThresholdProfile) return;
    const profileId = activeThresholdProfile.profileId;
    const profileVersion = activeThresholdProfile.version;

    // Check if profile ID or version changed - reprocess if either is different
    const profileChanged = (processed) => {
      if (!processed) return true;
      if (processed.thresholdProfileId !== profileId) return true;
      if (processed.thresholdProfileVersion !== profileVersion) return true;
      const processedSelection = processed.baselineSelection || {};
      if ((processedSelection.group || '') !== (baselineSelection?.group || '')) return true;
      if ((processedSelection.size || '') !== (baselineSelection?.size || '')) return true;
      if ((processedSelection.application || '') !== (baselineSelection?.application || '')) return true;
      if (Boolean(processed.baselineAlertsEnabled) !== Boolean(baselineOptions.baselineAlertsEnabled)) return true;
      return false;
    };

    if (bplotFiles.length > 0) {
      if (!profileChanged(combinedBplotProcessed)) return;
      const updatedFiles = bplotFiles.map(file => ({
        ...file,
        processed: processBPlotData(file.data, activeThresholdProfile, baselineOptions)
      }));
      const combined = combineTimelineData(updatedFiles, { mode: 'auto' });
      dispatch({
        type: 'BPLOT_FILES_REPROCESSED',
        payload: {
          files: updatedFiles,
          combinedData: combined.data,
          combinedProcessed: combined.processed,
          fileBoundaries: combined.fileBoundaries,
          mergeMode: combined.mode,
          correlation: combined.correlation
        }
      });
      return;
    }

    if (!bplotData || !profileChanged(bplotProcessed)) return;
    const updatedProcessed = processBPlotData(bplotData, activeThresholdProfile, baselineOptions);
    dispatch({
      type: 'BPLOT_REPROCESSED',
      payload: { processed: updatedProcessed }
    });
  }, [
    activeThresholdProfile,
    hasBplt,
    bplotFiles,
    bplotData,
    bplotProcessed,
    combinedBplotProcessed,
    baselineOptions,
    baselineSelection
  ]);

  // ----------------------------------------------------------------------------
  // FILE PROCESSING - Adapt for new Excel format
  // ---------------------------------------------------------------------------
  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const items = e.dataTransfer?.items;
    const files = items && items.length > 0
      ? Array.from(items)
        .filter(item => item.kind === 'file')
        .map(item => item.getAsFile())
        .filter(Boolean)
      : Array.from(e.dataTransfer?.files || []);

    if (files.length > 0) {
      // Filter valid files
      const validFiles = files.filter(file =>
        /\.xlsx?$/i.test(file.name) || /\.csv$/i.test(file.name) || /\.bplt$/i.test(file.name)
      );

      if (validFiles.length === 0) {
        setError('Failed to process file: Unknown file format. Please upload an ECM download CSV or a .bplt file.');
      } else if (validFiles.length === 1) {
        processFile(validFiles[0]);
      } else {
        processFiles(validFiles);
      }
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleFileUpload = (e) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      if (files.length === 1) {
        processFile(files[0]);
      } else {
        processFiles(Array.from(files));
      }
    }
    if (e.target) e.target.value = '';
  };

  const parseApiResponse = async (response) => {
    const contentType = response.headers.get('content-type') || '';
    const text = await response.text();

    if (contentType.includes('application/json')) {
      try {
        return { json: JSON.parse(text), text };
      } catch (error) {
        return { json: null, text };
      }
    }

    return { json: null, text };
  };

  const formatApiError = (response, payload) => {
    const statusLabel = response?.status ? `HTTP ${response.status}` : 'HTTP error';
    const errorText = payload?.json?.error || payload?.json?.message || payload?.text || '';
    const isHtml = typeof errorText === 'string' && errorText.trim().startsWith('<');
    if (isHtml || !errorText) {
      return `${statusLabel}: Upload failed. Server returned a non-JSON response.`;
    }
    const compact = typeof errorText === 'string'
      ? errorText.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
      : String(errorText);
    return `${statusLabel}: ${compact}`;
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
          const payload = await parseApiResponse(response);
          throw new Error(formatApiError(response, payload));
        }

        const payload = await parseApiResponse(response);
        const result = payload.json;
        if (!result?.content) {
          throw new Error('Upload succeeded but returned no file content.');
        }
        const text = result.content;

        // Parse as B-Plot CSV
        const bplotParsed = parseBPlotData(text);

        // Auto-detect fuel system and select appropriate profile
        let profileToUse = activeThresholdProfile;
        const detectedFuelSystem = detectFuelSystem(bplotParsed.headers, bplotParsed.data);
        const hasManualBaselineSelection = baselineSelection?.group;

        // Only auto-switch profiles when:
        // 1. MFG fuel system detected (always switch for safety - these engines need specific thresholds)
        // 2. No manual baseline selection AND detected profile differs from current
        const shouldAutoSwitch = detectedFuelSystem.profileId === 'psi-hd-40l-53l-mfg' ||
          (!hasManualBaselineSelection && detectedFuelSystem.profileId !== selectedProfileId);

        if (detectedFuelSystem.profileId && shouldAutoSwitch && detectedFuelSystem.profileId !== selectedProfileId) {
          if (DEBUG) console.log(`Auto-detected ${detectedFuelSystem.fuelSystemName} fuel system, switching to profile: ${detectedFuelSystem.profileName}`);
          try {
            profileToUse = await getResolvedProfile(detectedFuelSystem.profileId);
            // Update the UI profile selector to match
            selectProfile(detectedFuelSystem.profileId);
          } catch (err) {
            console.warn('Failed to load auto-detected profile, using current:', err);
          }
        }

        const bplotProcessedData = processBPlotData(bplotParsed, profileToUse, baselineOptions);

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

      if (detectedType === FILE_TYPES.BPLOT) {
        // Process as B-Plot time-series data
        const bplotParsed = parseBPlotData(text);

        // Auto-detect fuel system and select appropriate profile
        let profileToUse = activeThresholdProfile;
        const detectedFuelSystem = detectFuelSystem(bplotParsed.headers, bplotParsed.data);
        const hasManualBaselineSelection = baselineSelection?.group;

        // Only auto-switch profiles when:
        // 1. MFG fuel system detected (always switch for safety - these engines need specific thresholds)
        // 2. No manual baseline selection AND detected profile differs from current
        const shouldAutoSwitch = detectedFuelSystem.profileId === 'psi-hd-40l-53l-mfg' ||
          (!hasManualBaselineSelection && detectedFuelSystem.profileId !== selectedProfileId);

        if (detectedFuelSystem.profileId && shouldAutoSwitch && detectedFuelSystem.profileId !== selectedProfileId) {
          if (DEBUG) console.log(`Auto-detected ${detectedFuelSystem.fuelSystemName} fuel system, switching to profile: ${detectedFuelSystem.profileName}`);
          try {
            profileToUse = await getResolvedProfile(detectedFuelSystem.profileId);
            // Update the UI profile selector to match
            selectProfile(detectedFuelSystem.profileId);
          } catch (err) {
            console.warn('Failed to load auto-detected profile, using current:', err);
          }
        }

        const bplotProcessedData = processBPlotData(bplotParsed, profileToUse, baselineOptions);

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
        const parsedData = parseECMData(text);

        if (!parsedData.parsed) {
          throw new Error(parsedData.error || 'Failed to parse ECM data');
        }

        // Extract statistics
        const stats = extractECMStats(parsedData);

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
        throw new Error('Unknown file format. Please upload an ECM download CSV or a .bplt file.');
      }

    } catch (error) {
      console.error('File processing error:', error);
      if (error?.message === 'Failed to fetch' || error?.message?.startsWith('Unknown file format.')) {
        setError('Failed to process file: Unknown file format. Please upload an ECM download CSV or a .bplt file.');
      } else {
        setError(`Failed to process file: ${error?.message}`);
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Process multiple files - combines B-Plot files into unified timeline
  const processFiles = async (files) => {
    // Check total size
    const totalSize = files.reduce((sum, f) => sum + f.size, 0);
    if (totalSize > MAX_FILE_SIZE_MB * MB_BYTES * files.length) {
      setError(`Total file size too large. Maximum ${MAX_FILE_SIZE_MB} MB per file.`);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const bplotFilesData = [];
      const ecmFilesData = []; // Support multiple ECM files
      let profileToUse = activeThresholdProfile;
      let profileAutoDetected = false;

      // Process each file
      for (const file of files) {
        // Handle .bplt files via backend API
        if (file.name.toLowerCase().endsWith('.bplt')) {
          const formData = new FormData();
          formData.append('file', file);

          const response = await fetch('/api/upload', {
            method: 'POST',
            body: formData
          });

          if (!response.ok) {
            const payload = await parseApiResponse(response);
            throw new Error(`Failed to process ${file.name}: ${formatApiError(response, payload)}`);
          }

          const payload = await parseApiResponse(response);
          const result = payload.json;
          if (!result?.content) {
            throw new Error(`Failed to process ${file.name}: upload returned no file content.`);
          }
          const text = result.content;

          const bplotParsed = parseBPlotData(text);

          // Auto-detect fuel system from first BPLOT file
          if (!profileAutoDetected) {
            const detectedFuelSystem = detectFuelSystem(bplotParsed.headers, bplotParsed.data);
            if (detectedFuelSystem.profileId && detectedFuelSystem.profileId !== selectedProfileId) {
              if (DEBUG) console.log(`Auto-detected ${detectedFuelSystem.fuelSystemName} fuel system, switching to profile: ${detectedFuelSystem.profileName}`);
              try {
                profileToUse = await getResolvedProfile(detectedFuelSystem.profileId);
                selectProfile(detectedFuelSystem.profileId);
              } catch (err) {
                console.warn('Failed to load auto-detected profile, using current:', err);
              }
            }
            profileAutoDetected = true;
          }

          const bplotProcessedData = processBPlotData(bplotParsed, profileToUse, baselineOptions);

          bplotFilesData.push({
            id: generateFileId(),
            fileName: file.name,
            data: bplotParsed,
            processed: bplotProcessedData
          });
          continue;
        }

        // Read file as text for CSV files
        const text = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (e) => resolve(e.target.result);
          reader.onerror = () => reject(new Error(`Failed to read ${file.name}`));
          reader.readAsText(file);
        });

        const detectedType = detectFileType(text, file.name);

        if (detectedType === FILE_TYPES.BPLOT) {
          const bplotParsed = parseBPlotData(text);

          // Auto-detect fuel system from first BPLOT file
          if (!profileAutoDetected) {
            const detectedFuelSystem = detectFuelSystem(bplotParsed.headers, bplotParsed.data);
            if (detectedFuelSystem.profileId && detectedFuelSystem.profileId !== selectedProfileId) {
              if (DEBUG) console.log(`Auto-detected ${detectedFuelSystem.fuelSystemName} fuel system, switching to profile: ${detectedFuelSystem.profileName}`);
              try {
                profileToUse = await getResolvedProfile(detectedFuelSystem.profileId);
                selectProfile(detectedFuelSystem.profileId);
              } catch (err) {
                console.warn('Failed to load auto-detected profile, using current:', err);
              }
            }
            profileAutoDetected = true;
          }

          const bplotProcessedData = processBPlotData(bplotParsed, profileToUse, baselineOptions);

          bplotFilesData.push({
            id: generateFileId(),
            fileName: file.name,
            data: bplotParsed,
            processed: bplotProcessedData
          });
        } else if (detectedType === FILE_TYPES.ECM) {
          // Parse full ECM data (not just faults)
          const parsedData = parseECMData(text);
          if (parsedData.parsed) {
            const stats = {
              totalFaults: parsedData.faults.length,
              histogramCount: Object.keys(parsedData.histograms).length,
              engineHours: parseFloat(parsedData.ecmInfo['Hour meter']) || 0,
              engineStarts: parseInt(parsedData.ecmInfo['Cumulative Starts']) || 0,
              histogramStats: {}
            };
            Object.entries(parsedData.histograms).forEach(([key, histogram]) => {
              const total = histogram.data.flat().reduce((sum, val) => sum + (val || 0), 0);
              stats.histogramStats[key] = { totalHours: total, dataPoints: histogram.data.length * (histogram.xLabels?.length || 0) };
            });

            ecmFilesData.push({
              id: generateEcmFileId(),
              ecmInfo: parsedData.ecmInfo,
              histograms: parsedData.histograms,
              faults: parsedData.faults,
              stats,
              fileName: file.name
            });
          }
        }
      }

      // Dispatch based on what was loaded
      const bplotFilesWithRoles = assignRolesForDualFiles(bplotFilesData);
      const ecmFilesWithRoles = assignRolesForDualFiles(ecmFilesData);
      const hasBpltFiles = bplotFilesWithRoles.length > 0;
      const hasEcmFiles = ecmFilesWithRoles.length > 0;
      const needsEcmRoleSelection = requiresRoleSelection(ecmFilesWithRoles);
      const needsBplotRoleSelection = requiresRoleSelection(bplotFilesWithRoles);

      // Debug logging
      console.log(`[Multi-file upload] ECM files: ${ecmFilesWithRoles.length}, BPLOT files: ${bplotFilesWithRoles.length}`);
      if (ecmFilesWithRoles.length > 0) {
        console.log('[Multi-file upload] ECM file names:', ecmFilesWithRoles.map(f => f.fileName));
      }

      // Check if we need role selection (2+ files of same type)
      if (needsEcmRoleSelection || needsBplotRoleSelection) {
        console.log('[Multi-file upload] Showing role selection modal');

        // Store pending files and show role selection modal
        const pendingFiles = {
          ecmFiles: ecmFilesWithRoles,
          bplotFiles: bplotFilesWithRoles,
          needsEcmRoleSelection,
          needsBplotRoleSelection
        };

        dispatch({
          type: 'SET_PENDING_ROLE_SELECTION',
          payload: pendingFiles
        });

        setIsLoading(false);
        return;
      }

      if (hasBpltFiles && hasEcmFiles) {
        // BOTH files loaded - use single combined action
        const combined = combineTimelineData(bplotFilesWithRoles, { mode: 'auto' });
        dispatch({
          type: 'BOTH_FILES_LOADED',
          payload: {
            ecmData: ecmFilesWithRoles.length === 1 ? ecmFilesWithRoles[0] : ecmFilesWithRoles,
            bplotFiles: bplotFilesWithRoles,
            combinedData: combined.data,
            combinedProcessed: combined.processed,
            fileBoundaries: combined.fileBoundaries,
            mergeMode: combined.mode,
            correlation: combined.correlation
          }
        });
      } else if (hasBpltFiles) {
        // Only BPLT files
        const combined = combineTimelineData(bplotFilesWithRoles, { mode: 'auto' });
        dispatch({
          type: 'BPLOT_FILES_LOADED',
          payload: {
            files: bplotFilesWithRoles,
            combinedData: combined.data,
            combinedProcessed: combined.processed,
            fileBoundaries: combined.fileBoundaries,
            mergeMode: combined.mode,
            correlation: combined.correlation
          }
        });
      } else if (hasEcmFiles) {
        // Only ECM file(s)
        if (ecmFilesWithRoles.length === 1) {
          dispatch({
            type: 'ECM_FILE_LOADED',
            payload: ecmFilesWithRoles[0]
          });
        } else {
          dispatch({
            type: 'ECM_FILES_LOADED',
            payload: { files: ecmFilesWithRoles }
          });
        }
      } else if (files.length === 1) {
        // Single file - use original handler
        await processFile(files[0]);
      } else {
        throw new Error('No valid files found. Upload ECM CSV or B-Plot files.');
      }

    } catch (error) {
      console.error('Multi-file processing error:', error);
      if (error?.message === 'Failed to fetch' || error?.message?.startsWith('Unknown file format.')) {
        setError('Failed to process file: Unknown file format. Please upload an ECM download CSV or a .bplt file.');
      } else {
        setError(`Failed to process files: ${error?.message}`);
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Handle adding ECM file for overlay on B-Plot charts
  const handleAddEcmFile = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv,text/csv,text/plain';
    input.onchange = async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;

      setIsLoading(true);
      setError(null);

      try {
        const text = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (ev) => resolve(ev.target.result);
          reader.onerror = () => reject(new Error('Failed to read file'));
          reader.readAsText(file);
        });

        const detectedType = detectFileType(text, file.name);

        if (detectedType !== FILE_TYPES.ECM) {
          throw new Error('Please select an ECM download CSV file containing fault data.');
        }

        const parsedData = parseECMData(text);
        if (!parsedData.parsed) {
          throw new Error(parsedData.error || 'Failed to parse ECM data');
        }

        if (parsedData.faults.length === 0) {
          throw new Error('No fault data found in ECM file.');
        }

        const processedFaults = processFaultData(parsedData.faults);
        dispatch({
          type: 'SET_ECM_FAULTS_FOR_OVERLAY',
          payload: processedFaults
        });
      } catch (error) {
        console.error('ECM overlay file error:', error);
        setError(`Failed to load ECM data: ${error.message}`);
      } finally {
        setIsLoading(false);
      }
    };
    input.click();
  };

  // ----------------------------------------------------------------------------
  // ROLE SELECTION HANDLERS - For multi-file uploads
  // ----------------------------------------------------------------------------
  const handleRoleSelectionComplete = useCallback((updatedFiles) => {
    const { ecmFiles: updatedEcmFiles, bplotFiles: updatedBplotFiles } = updatedFiles;

    const hasEcmFiles = updatedEcmFiles && updatedEcmFiles.length > 0;
    const hasBplotFiles = updatedBplotFiles && updatedBplotFiles.length > 0;

    if (hasBplotFiles && hasEcmFiles) {
      // BOTH files loaded
      const combined = combineTimelineData(updatedBplotFiles, { mode: 'auto' });
      dispatch({
        type: 'BOTH_FILES_LOADED',
        payload: {
          ecmData: updatedEcmFiles.length === 1 ? updatedEcmFiles[0] : updatedEcmFiles,
          bplotFiles: updatedBplotFiles,
          combinedData: combined.data,
          combinedProcessed: combined.processed,
          fileBoundaries: combined.fileBoundaries,
          mergeMode: combined.mode,
          correlation: combined.correlation
        }
      });
    } else if (hasBplotFiles) {
      const combined = combineTimelineData(updatedBplotFiles, { mode: 'auto' });
      dispatch({
        type: 'BPLOT_FILES_LOADED',
        payload: {
          files: updatedBplotFiles,
          combinedData: combined.data,
          combinedProcessed: combined.processed,
          fileBoundaries: combined.fileBoundaries,
          mergeMode: combined.mode,
          correlation: combined.correlation
        }
      });
    } else if (hasEcmFiles) {
      if (updatedEcmFiles.length === 1) {
        dispatch({
          type: 'ECM_FILE_LOADED',
          payload: updatedEcmFiles[0]
        });
      } else {
        dispatch({
          type: 'ECM_FILES_LOADED',
          payload: { files: updatedEcmFiles }
        });
      }
    }
  }, []);

  const handleRoleSelectionCancel = useCallback(() => {
    dispatch({ type: 'CLEAR_PENDING_ROLE_SELECTION' });
  }, []);

  // ----------------------------------------------------------------------------
  // ECM CHART DATA - Prepare histogram data for visualization
  // ----------------------------------------------------------------------------
  const selectedHistogramData = useMemo(() => {
    if (!displayProcessedHistograms[selectedHistogram]) return [];
    return displayProcessedHistograms[selectedHistogram].data || [];
  }, [displayProcessedHistograms, selectedHistogram]);

  const histogramOptions = useMemo(() => {
    return Object.keys(displayProcessedHistograms).map(key => ({
      key,
      name: displayProcessedHistograms[key]?.title || key,
      dataPoints: displayProcessedHistograms[key]?.stats?.dataPoints || 0
    }));
  }, [displayProcessedHistograms]);

  useEffect(() => {
    if (!selectedHistogram) return;
    if (displayProcessedHistograms[selectedHistogram]) return;
    const firstHistogram = Object.keys(displayProcessedHistograms)[0];
    if (firstHistogram) {
      dispatch({ type: 'SET_SELECTED_HISTOGRAM', payload: firstHistogram });
    }
  }, [displayProcessedHistograms, selectedHistogram]);

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

  const startUserFieldsEdit = () => {
    setUserFieldsDraft(userFields);
    setIsUserFieldsEditing(true);
  };

  const handleUserFieldsDraftChange = (field, value) => {
    setUserFieldsDraft((prev) => ({ ...prev, [field]: value }));
  };

  const saveUserFields = () => {
    setUserFields({
      engineSn: userFieldsDraft.engineSn?.trim() || '',
      caseFile: userFieldsDraft.caseFile?.trim() || '',
      ref: userFieldsDraft.ref?.trim() || ''
    });
    setIsUserFieldsEditing(false);
  };

  const cancelUserFieldsEdit = () => {
    setUserFieldsDraft(userFields);
    setIsUserFieldsEditing(false);
  };

  const reset = () => {
    dispatch({ type: 'RESET' });
    setRawSheets({});
    setRawSheetNames([]);
    setRawFileContent('');
    setSelectedFaultIndex(null);
    setShowFaultOverlays(true);
    handleTabChange('overview');
    setUserFields({ engineSn: '', caseFile: '', ref: '' });
    setUserFieldsDraft({ engineSn: '', caseFile: '', ref: '' });
    setIsUserFieldsEditing(false);
  };

  const exportToPDF = useCallback(async () => {
    const reportNode = reportRef.current;
    if (isExporting || !reportNode) return;
    setIsExporting(true);

    try {
      reportNode.classList.add(PDF_EXPORT_LIGHT_CLASS);
      await waitForNextPaint();

      const dataUrl = await toJpeg(reportNode, {
        backgroundColor: '#ffffff',
        cacheBust: true,
        pixelRatio: 1.5,
        quality: 0.85
      });

      const img = new Image();
      img.src = dataUrl;
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
      });

      const orientation = img.width > img.height ? 'landscape' : 'portrait';
      const pdf = new jsPDF({
        orientation,
        unit: 'pt',
        format: 'a4'
      });

      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const scale = pageWidth / img.width;
      const scaledHeight = img.height * scale;

      if (scaledHeight <= pageHeight) {
        pdf.addImage(dataUrl, 'JPEG', 0, 0, pageWidth, scaledHeight);
      } else {
        const pageHeightPx = Math.floor(pageHeight / scale);
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        canvas.width = img.width;
        canvas.height = pageHeightPx;

        let remainingHeight = img.height;
        let offsetY = 0;
        let pageIndex = 0;

        while (remainingHeight > 0) {
          if (!ctx) break;
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(
            img,
            0,
            offsetY,
            img.width,
            pageHeightPx,
            0,
            0,
            img.width,
            pageHeightPx
          );

          const pageData = canvas.toDataURL('image/jpeg', 0.85);
          if (pageIndex > 0) pdf.addPage();
          pdf.addImage(pageData, 'JPEG', 0, 0, pageWidth, pageHeight);

          remainingHeight -= pageHeightPx;
          offsetY += pageHeightPx;
          pageIndex += 1;
        }
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const sanitizePart = (value) => String(value || '')
        .trim()
        .replace(/[^a-zA-Z0-9_-]+/g, '-')
        .replace(/^-+|-+$/g, '');
      const fieldParts = [
        sanitizePart(userFields.engineSn),
        sanitizePart(userFields.caseFile),
        sanitizePart(userFields.ref)
      ].filter(Boolean);
      const fieldSuffix = fieldParts.length > 0 ? `-${fieldParts.join('-')}` : '';
      pdf.save(`plot-analysis${fieldSuffix}-${timestamp}.pdf`);
    } catch (error) {
      console.error('PDF export failed:', error);
      setError('PDF export failed. Please try again.');
    } finally {
      reportNode.classList.remove(PDF_EXPORT_LIGHT_CLASS);
      setIsExporting(false);
    }
  }, [isExporting, userFields]);

  // ----------------------------------------------------------------------------
  // RENDER: UPLOAD SCREEN
  // ----------------------------------------------------------------------------
  if (!parsed) {
    return (
      <div className="bg-[#050505] font-sans text-slate-300 min-h-screen selection:bg-[#00FF88] selection:text-black overflow-x-hidden">
        <div className="fixed inset-0 grid-pattern pointer-events-none" />

        <nav className="relative z-10 border-b border-[#262626] bg-[#050505]/90 backdrop-blur-md">
          <div className="max-w-[1400px] mx-auto px-6 h-16 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 bg-[#121212] rounded flex items-center justify-center border border-[#00FF88]/20">
                <span className="material-symbols-outlined text-[#00FF88] scale-110">equalizer</span>
              </div>
              <div>
                <h1 className="font-black text-lg tracking-wider leading-none text-white" style={{ fontFamily: 'Orbitron, sans-serif' }}>PLOT ANALYZER</h1>
                <p className="text-[10px] tracking-widest text-[#00FF88] mt-1" style={{ fontFamily: 'Orbitron, sans-serif' }}>DATA ANALYSIS V{GUI_REVISION}</p>
              </div>
            </div>
            <button
              onClick={() => document.getElementById('fileIn').click()}
              className="flex items-center gap-2 bg-transparent border border-[#00FF88]/40 text-[#00FF88] hover:bg-[#00FF88] hover:text-black transition-all duration-300 px-4 py-2 rounded text-xs font-bold uppercase tracking-widest group"
            >
              <span className="material-symbols-outlined text-sm transition-transform group-hover:-translate-y-0.5">upload</span>
              Import New Files
            </button>
          </div>
        </nav>

        <main className="relative z-10 upload-shell px-6 pt-16 pb-24">
          <div className="relative group">
            <div
              className="upload-dashed-border p-1"
              style={{
                backgroundImage: 'url(/upload-bg.png)',
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                borderRadius: '1rem',
                filter: 'contrast(1.1) brightness(0.8)'
              }}
            >
              <div
                className="upload-panel-bg backdrop-blur-md rounded-xl p-12 md:p-20 flex flex-col items-center text-center transition-all duration-300 border border-white/5"
                onClick={() => document.getElementById('fileIn').click()}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragEnter={handleDragOver}
                style={{ cursor: 'pointer' }}
              >
                <input id="fileIn" type="file" accept=".csv,.xlsx,.xls,.bplt,text/csv,text/plain,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/octet-stream" multiple onChange={handleFileUpload} className="hidden" />

                {isLoading ? (
                  <>
                    <div className="w-20 h-20 border-4 border-[#00FF88] border-t-transparent rounded-full animate-spin mb-8" />
                    <h2 className="text-4xl font-black text-[#00FF88] mb-4 tracking-tight" style={{ fontFamily: 'Orbitron, sans-serif', textShadow: '0 0 15px rgba(0, 255, 136, 0.6)' }}>
                      Analyzing...
                    </h2>
                  </>
                ) : error ? (
                  <>
                    <div className="w-20 h-20 mb-8 flex items-center justify-center bg-red-500/10 rounded-2xl border border-red-500/30">
                      <span className="material-symbols-outlined text-red-400 text-5xl">error</span>
                    </div>
                    <h2 className="text-2xl font-black text-red-400 mb-4" style={{ fontFamily: 'Orbitron, sans-serif' }}>
                      Upload Error
                    </h2>
                    <p className="text-sm text-slate-500">{error}</p>
                  </>
                ) : (
                  <>
                    <div className="w-20 h-20 mb-8 flex items-center justify-center bg-[#00FF88]/10 rounded-2xl border border-[#00FF88]/30 group-hover:scale-110 group-hover:border-[#00FF88] transition-all duration-500">
                      <span className="material-symbols-outlined text-[#00FF88] text-5xl">cloud_upload</span>
                    </div>
                    <h2 className="text-4xl font-black text-[#00FF88] mb-4 tracking-tight" style={{ fontFamily: 'Orbitron, sans-serif', textShadow: '0 0 15px rgba(0, 255, 136, 0.6)' }}>
                      UPLOAD DATA FILES
                    </h2>
                    <div className="space-y-2">
                      <p className="text-xl font-medium text-slate-100">
                        Upload dual-ECM files or drop mixed ECM/B-Plot files to analyze
                      </p>
                      <p className="text-sm text-slate-500 max-w-md mx-auto leading-relaxed">
                        Supports: ECM download CSV, .bplt, BPLT CSV files<br />
                        Dual ECM V-Engine: Primary Plot + Primary ECM + Secondary Plot + Secondary ECM<br />
                        Max file size: {MAX_FILE_SIZE_MB} MB per file
                      </p>
                    </div>
                    <label
                      htmlFor="fileIn"
                      className="mt-10 cursor-pointer bg-[#00FF88] text-black font-black px-10 py-4 rounded-full hover:shadow-[0_0_30px_rgba(0,255,136,0.6)] hover:scale-105 transition-all active:scale-95 uppercase tracking-[0.2em] text-sm inline-block"
                      onClick={(e) => e.stopPropagation()}
                    >
                      Select Files
                    </label>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="upload-baseline-spacing">
            <BaselineSelector />
          </div>

          <button
            onClick={() => setShowReportIssue(true)}
            className="mt-12 mx-auto flex items-center gap-3 px-6 py-3 text-white border border-red-500 bg-red-600/30 hover:bg-red-600/50 hover:border-red-400 shadow-[0_0_15px_rgba(255,0,0,0.5)] hover:shadow-[0_0_25px_rgba(255,0,0,0.7)] transition-all duration-300 rounded-lg"
          >
            <span className="material-symbols-outlined text-red-300">bug_report</span>
            <span className="text-sm font-medium">Report an Issue</span>
          </button>

          <div className="mt-16 flex flex-wrap justify-center gap-10 opacity-40 hover:opacity-100 transition-opacity duration-500">
            <div className="flex items-center gap-2 text-[10px] font-bold tracking-[0.25em] text-slate-400 uppercase">
              <span className="material-symbols-outlined text-[#00FF88] text-lg">analytics</span>
              ANALYSIS
            </div>
            <div className="flex items-center gap-2 text-[10px] font-bold tracking-[0.25em] text-slate-400 uppercase">
              <span className="material-symbols-outlined text-[#00FF88] text-lg">trending_up</span>
              TRENDS
            </div>
            <div className="flex items-center gap-2 text-[10px] font-bold tracking-[0.25em] text-slate-400 uppercase">
              <span className="material-symbols-outlined text-orange-500/80 text-lg">warning</span>
              ANOMALIES
            </div>
          </div>
        </main>

        <div className="fixed top-1/4 -left-20 w-96 h-96 bg-[#00FF88]/5 blur-[120px] rounded-full pointer-events-none" />
        <div className="fixed bottom-1/4 -right-20 w-[30rem] h-[30rem] bg-[#00FF88]/5 blur-[150px] rounded-full pointer-events-none" />
        <ReportIssue isOpen={showReportIssue} onClose={() => setShowReportIssue(false)} />
        <FileRoleModal
          isOpen={Boolean(pendingRoleSelection)}
          pendingFiles={pendingRoleSelection}
          onComplete={handleRoleSelectionComplete}
          onCancel={handleRoleSelectionCancel}
        />
      </div>
    );
  }

  // ----------------------------------------------------------------------------
  // RENDER: B-PLOT TIME-SERIES ANALYSIS (BPLT only)
  // ---------------------------------------------------------------------------
  if (fileType === FILE_TYPES.BPLOT && bplotProcessed) {
    return (
      <>
        <BPlotAnalysis
          data={bplotData}
          processedData={bplotProcessed}
          fileName={fileName}
          onReset={reset}
          ecmFaults={ecmFaultsForOverlay}
          fileBoundaries={fileBoundaries}
          bplotFiles={bplotFiles}
          bplotMergeMode={bplotMergeMode}
          bplotCorrelation={bplotCorrelation}
          onAddEcmFile={handleAddEcmFile}
          onExport={exportToPDF}
          onReportIssue={() => setShowReportIssue(true)}
          reportRef={reportRef}
          userFields={userFields}
          userFieldsDraft={userFieldsDraft}
          isUserFieldsEditing={isUserFieldsEditing}
          onStartUserFieldsEdit={startUserFieldsEdit}
          onUserFieldsDraftChange={handleUserFieldsDraftChange}
          onSaveUserFields={saveUserFields}
          onCancelUserFields={cancelUserFieldsEdit}
        />
        <ReportIssue isOpen={showReportIssue} onClose={() => setShowReportIssue(false)} />
      </>
    );
  }

  // ----------------------------------------------------------------------------
  // RENDER: COMBINED ECM + BPLT VIEW (Both files loaded)
  // ---------------------------------------------------------------------------
  // Check if we're on a BPLT tab when both files are loaded
  const isBpltTab = activeTab.includes('-bplt') || (activeTab === 'channels' || activeTab === 'events');
  if (fileType === 'both' && bplotProcessed && isBpltTab) {
    // Map combined tab IDs to BPlotAnalysis tab names
    const bpltTabMap = {
      'overview-bplt': 'overview',
      'charts-bplt': 'charts',
      'channels-bplt': 'channels',
      'events-bplt': 'events'
    };
    const mappedTab = bpltTabMap[activeTab] || 'overview';

    return (
      <div className="min-h-screen bg-[#020617] text-white" ref={reportRef}>
        <AppHeader
          hasEcm={hasEcm}
          hasBplt={hasBplt}
          hasPrimaryEcm={hasPrimaryEcm}
          hasSecondaryEcm={hasSecondaryEcm}
          ecmFileName={ecmFileName}
          bpltFileName={bpltFileName}
          ecmFiles={ecmFiles}
          bplotFiles={bplotFiles}
          activeTab={activeTab}
          onTabChange={handleTabChange}
          onImport={reset}
          onExport={exportToPDF}
          onReportIssue={() => setShowReportIssue(true)}
          eventCount={bplotProcessed?.events?.length || 0}
          faultCount={hasPrimaryEcm && hasSecondaryEcm ? combinedEcmFaults.length : displayFaults.length || 0}
          activeProfileName={activeThresholdProfile?.name}
          activeProfileId={activeThresholdProfile?.profileId}
          activeEcmRole={hasDualEcm ? activeEcmFile?.role : null}
          onEcmRoleChange={hasDualEcm ? setEcmDisplayRole : null}
          userFields={userFields}
          userFieldsDraft={userFieldsDraft}
          isUserFieldsEditing={isUserFieldsEditing}
          onStartUserFieldsEdit={startUserFieldsEdit}
          onUserFieldsDraftChange={handleUserFieldsDraftChange}
          onSaveUserFields={saveUserFields}
          onCancelUserFields={cancelUserFieldsEdit}
        />
        <input id="fileIn" type="file" accept=".csv,.xlsx,.xls,.bplt,text/csv,text/plain,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/octet-stream" multiple onChange={handleFileUpload} className="hidden" />
        <BPlotAnalysis
          data={bplotData}
          processedData={bplotProcessed}
          fileName={bpltFileName}
          onReset={reset}
          ecmFaults={ecmFaultsForOverlay}
          fileBoundaries={fileBoundaries}
          bplotFiles={bplotFiles}
          bplotMergeMode={bplotMergeMode}
          bplotCorrelation={bplotCorrelation}
          onAddEcmFile={null}
          externalActiveTab={mappedTab}
          activeCorrelatedRole={hasDualEcm ? ecmDisplayRole : null}
          onCorrelatedRoleChange={hasDualEcm ? setEcmDisplayRole : null}
          hideHeader={true}
        />
        <ReportIssue isOpen={showReportIssue} onClose={() => setShowReportIssue(false)} />
      </div>
    );
  }

  // ----------------------------------------------------------------------------
  // RENDER: ECM MAIN DASHBOARD
  // ---------------------------------------------------------------------------
  return (
    <div className="min-h-screen bg-[#020617] text-white" ref={reportRef}>
      <AppHeader
        hasEcm={hasEcm}
        hasBplt={hasBplt}
        hasPrimaryEcm={hasPrimaryEcm}
        hasSecondaryEcm={hasSecondaryEcm}
        ecmFileName={ecmFileName || fileName}
        bpltFileName={bpltFileName}
        ecmFiles={ecmFiles}
        bplotFiles={bplotFiles}
        activeTab={activeTab}
        onTabChange={handleTabChange}
        onImport={reset}
        onExport={exportToPDF}
        onReportIssue={() => setShowReportIssue(true)}
        eventCount={bplotProcessed?.events?.length || 0}
        faultCount={hasPrimaryEcm && hasSecondaryEcm ? combinedEcmFaults.length : displayFaults.length || 0}
        activeProfileName={activeThresholdProfile?.name}
        activeProfileId={activeThresholdProfile?.profileId}
        activeEcmRole={hasDualEcm ? activeEcmFile?.role : null}
        onEcmRoleChange={hasDualEcm ? setEcmDisplayRole : null}
        userFields={userFields}
        userFieldsDraft={userFieldsDraft}
        isUserFieldsEditing={isUserFieldsEditing}
        onStartUserFieldsEdit={startUserFieldsEdit}
        onUserFieldsDraftChange={handleUserFieldsDraftChange}
        onSaveUserFields={saveUserFields}
        onCancelUserFields={cancelUserFieldsEdit}
      />
      <input id="fileIn" type="file" accept=".csv,.xlsx,.xls,.bplt,text/csv,text/plain,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/octet-stream" multiple onChange={handleFileUpload} className="hidden" />

      <main className="w-full px-6 py-6 space-y-8 mx-auto" style={{ maxWidth: '98%' }}>
        {/* ==================== OVERVIEW ==================== */}
        {(activeTab === 'overview' || activeTab === 'overview-ecm') && parsed && (
          <>
            {/* ECM Device Information */}
            <div className="bg-slate-900/50 rounded-xl border border-slate-800 p-6">
              <div className="flex items-center gap-2 mb-5 text-base text-slate-300 font-semibold">
                <Cpu className="w-5 h-5 text-green-400" /> ECM Device Information
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-5">
                <InfoBox label="Hardware P/N" value={displayEcmInfo['ECI H/W P/N']} />
                <InfoBox label="Software Version" value={displayEcmInfo['ECI Mot XLS Rev']} />
                <InfoBox label="Serial Number" value={displayEcmInfo['ECI H/W S/N']} small />
                <InfoBox label="Engine P/N" value={(displayEcmInfo['Engine P/N'] || '').replace(/"/g, '')} />
                <InfoBox label="Engine S/N" value={(displayEcmInfo['Engine S/N'] || '').replace(/"/g, '')} small />
                <InfoBox label="Engine Hours" value={`${Number(displayStats.engineHours || 0).toFixed(1)}h`} />
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 border-t border-slate-700 pt-5">
                <InfoBox label="Customer S/W P/N" value={(displayEcmInfo['Customer S/W P/N'] || '').replace(/"/g, '')} />
                <InfoBox label="Download Date" value={displayEcmInfo['Download Date']} />
                <InfoBox label="Download Time" value={displayEcmInfo['Download Time']} />
                <InfoBox label="Manufacture Date" value={displayEcmInfo['ECI Manufacture Date']} />
                <InfoBox label="Calibration Date" value={displayEcmInfo['ECI Current Cal Date']} />
                <InfoBox label="Starts" value={displayStats.engineStarts || 0} />
              </div>
            </div>

            {/* Alerts and Recommendations */}
            {displayAnalysis?.alerts?.length > 0 && (
              <div className="bg-red-950/50 border border-red-600/70 rounded-xl p-4">
                <div className="flex items-center gap-3">
                  <ShieldAlert className="w-6 h-6 text-red-400" />
                  <div className="flex-1">
                    <div className="font-semibold text-red-400">{displayAnalysis.alerts.length} System Alert{displayAnalysis.alerts.length > 1 ? 's' : ''}</div>
                    <div className="text-sm text-red-300/70">Issues detected requiring attention</div>
                  </div>
                  <button
                    onClick={() => {
                      setScrollToAlerts(true);
                      handleTabChange(ecmChartsTabId);
                    }}
                    className="px-3 py-1.5 bg-red-600 hover:bg-red-500 rounded-lg text-sm"
                  >
                    View Details
                  </button>
                </div>
              </div>
            )}

            {/* Key Metrics */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-5">
              <MetricCard icon={<Gauge className="text-emerald-400 w-5 h-5" />} label="Engine Hours"
                value={Number(displayStats.engineHours || 0).toFixed(1)} unit="h" sub="Total runtime" />
              <MetricCard icon={<Activity className="text-green-400 w-5 h-5" />} label="Histograms"
                value={displayStats.histogramCount || 0} sub="Data sets analyzed" />
              <MetricCard icon={<Wrench className="text-amber-400 w-5 h-5" />} label="Faults"
                value={displayStats.totalFaults || 0} sub={`${displayFaults.filter(f => f?.isCritical).length} critical`} />
              <MetricCard
                icon={<AlertTriangle className={`w-5 h-5 ${displaySummaryStats.health?.overallHealth < 70 ? 'text-red-400' : displaySummaryStats.health?.overallHealth < 85 ? 'text-orange-400' : 'text-emerald-400'}`} />}
                label="Health Score"
                value={displaySummaryStats.health?.overallHealth || 0} unit="%"
                sub="System health indicator"
                alert={displaySummaryStats.health?.overallHealth < 70}
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
                histogram={displayHistograms.speedLoad}
                onClick={() => { dispatch({ type: 'SET_SELECTED_HISTOGRAM', payload: 'speedLoad' }); handleTabChange(ecmChartsTabId); }}
              />
              <KnockSummaryCard
                histogram={displayHistograms.knock}
                onClick={() => { dispatch({ type: 'SET_SELECTED_HISTOGRAM', payload: 'knock' }); handleTabChange(ecmChartsTabId); }}
              />
              <ECTSummaryCard
                histogram={displayHistograms.ect}
                onClick={() => { dispatch({ type: 'SET_SELECTED_HISTOGRAM', payload: 'ect' }); handleTabChange(ecmChartsTabId); }}
              />
              <BackfireSummaryCard
                histogram={displayHistograms.backfireLifetime}
                title="Backfire (Lifetime)"
                onClick={() => { dispatch({ type: 'SET_SELECTED_HISTOGRAM', payload: 'backfireLifetime' }); handleTabChange(ecmChartsTabId); }}
              />
              <BackfireSummaryCard
                histogram={displayHistograms.backfireRecent}
                title="Backfire (Recent)"
                onClick={() => { dispatch({ type: 'SET_SELECTED_HISTOGRAM', payload: 'backfireRecent' }); handleTabChange(ecmChartsTabId); }}
              />
            </div>

            {/* Fault Snapshot Section */}
            {hasDualEcm ? (
              <div className="bg-slate-900/50 rounded-xl border border-slate-800 p-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 text-base font-semibold text-slate-300">
                      <AlertTriangle className="w-5 h-5 text-red-400" /> Fault Correlation Workspace
                    </div>
                    <p className="text-sm text-slate-500 mt-2">
                      Snapshot details, fault timeline, and Primary/Secondary correlation are unified in one page.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleTabChange('fault-correlation')}
                    className="px-4 py-2 text-xs font-bold uppercase tracking-wider border border-yellow-500/50 text-yellow-300 bg-yellow-500/10 hover:bg-yellow-500/20 transition-colors rounded"
                  >
                    Open Fault Correlation
                  </button>
                </div>
              </div>
            ) : (
              <div className="bg-slate-900/50 rounded-xl border border-slate-800 p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2 text-base font-semibold text-slate-300">
                    <AlertTriangle className="w-5 h-5 text-red-400" /> Fault Snapshot Data
                  </div>
                  {displayFaults.length > 0 && (
                    <div className="flex flex-wrap items-center gap-4 text-sm">
                      <label className="flex items-center gap-2 text-[11px] text-slate-400 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={sortFaultsByRecency}
                          onChange={(e) => setSortFaultsByRecency(e.target.checked)}
                          className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-emerald-400 focus:ring-emerald-400"
                        />
                        Sort by recency
                      </label>
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        {[
                          { key: 'current', label: 'Current', count: faultRecencyCounts.current, classes: 'text-red-300 border-red-500/40' },
                          { key: 'recent', label: 'Recent', count: faultRecencyCounts.recent, classes: 'text-yellow-200 border-yellow-400/40' },
                          { key: 'shutdown', label: 'Shutdown', count: displayFaults.filter(f => f?.causedShutdown).length, classes: 'text-red-300 border-red-500/40' },
                          { key: 'total', label: 'Total', count: displayFaults.length, classes: 'text-slate-300 border-slate-600/50' }
                        ].map((pill) => (
                          <button
                            key={pill.key}
                            onClick={() => setFaultFilter(pill.key)}
                            className={`px-3 py-1 rounded-full border transition-all ${
                              faultFilter === pill.key
                                ? `bg-slate-800/70 ${pill.classes} shadow-[0_0_10px_rgba(148,163,184,0.15)]`
                                : 'bg-slate-900/40 text-slate-400 border-slate-700/60 hover:border-slate-500/70 hover:text-slate-200'
                            }`}
                          >
                            {pill.count} {pill.label}
                          </button>
                        ))}
                        <button
                          onClick={() => setFaultFilter('total')}
                          className="px-3 py-1 rounded-full border border-slate-600/60 text-slate-300 hover:text-white hover:border-slate-400/80 transition-colors"
                        >
                          Reset Filter
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                <FaultMasterDetail
                  faults={displayFaults}
                  selectedFaultIndex={selectedFaultIndex}
                  onSelectFault={setSelectedFaultIndex}
                  engineHours={displayStats.engineHours}
                  sortByRecency={sortFaultsByRecency}
                  faultFilter={faultFilter}
                />
              </div>
            )}
          </>
        )}

        {/* ==================== FAULT TIMELINE ==================== */}
        {(activeTab === 'faults' || activeTab === 'faults-ecm') && (
          <FaultTimelineTab
            faults={displayFaults}
            engineHours={displayStats.engineHours}
            sortKey={faultTimelineSort}
            onSortChange={setFaultTimelineSort}
            showSource={hasDualEcm}
          />
        )}

        {/* ==================== ECM COMPARE ==================== */}
        {activeTab === 'ecm-compare' && hasPrimaryEcm && hasSecondaryEcm && (
          <EcmComparison
            ecmFiles={ecmFiles}
            combinedEcmHistograms={combinedEcmHistograms}
            combinedEcmFaults={combinedEcmFaults}
            ecmComparisonStats={ecmComparisonStats}
          />
        )}

        {/* ==================== FAULT CORRELATION (Unified) ==================== */}
        {(activeTab === 'fault-correlation' || activeTab === 'ecm-faults' || activeTab === 'combined-faults') && hasPrimaryEcm && hasSecondaryEcm && (
          <CombinedFaultView
            combinedFaults={combinedEcmFaults}
            ecmComparisonStats={ecmComparisonStats}
            primaryEngineHours={ecmComparisonStats?.engineHours?.primary}
            secondaryEngineHours={ecmComparisonStats?.engineHours?.secondary}
          />
        )}

        {/* ==================== CHARTS ==================== */}
        {(activeTab === 'charts' || activeTab === 'charts-ecm') && (
          <div className="space-y-6">
            {displayAnalysis?.alerts?.length > 0 && (
              <div ref={alertsRef} className="bg-red-950/50 border border-red-600/70 rounded-xl p-4">
                <div className="flex items-center gap-3 mb-3">
                  <ShieldAlert className="w-5 h-5 text-red-400" />
                  <div className="font-semibold text-red-400">System Alerts</div>
                </div>
                <div className="space-y-3">
                  {displayAnalysis.alerts.map((alert, index) => {
                    const isWarning = alert.level === 'warning';
                    const borderColor = isWarning ? 'border-red-500/40' : 'border-red-500/60';
                    const bgColor = isWarning ? 'bg-red-950/40' : 'bg-red-950/60';
                    const textColor = isWarning ? 'text-red-300' : 'text-red-300';
                    return (
                      <div key={index} className={`rounded-lg border ${borderColor} ${bgColor} p-3`}>
                        <div className={`text-sm font-semibold ${textColor}`}>
                          {alert.message}
                        </div>
                        {alert.recommendation && (
                          <div className="text-xs text-slate-300 mt-1">
                            Recommendation: {alert.recommendation}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            {/* Histogram Selector with Fault Overlay Toggle */}
            {histogramOptions.length > 0 && (
              <div className="bg-[#111921] rounded-xl border border-[#344d65] p-4">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-4">
                    <BarChart3 className="w-5 h-5 text-[#22c55e]" />
                    <span className="text-base font-semibold text-white">Histogram Analysis</span>
                  </div>
                  {displayFaults.length > 0 && (
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={showFaultOverlays}
                        onChange={(e) => setShowFaultOverlays(e.target.checked)}
                        className="w-4 h-4 rounded border-[#344d65] bg-[#1a2632] text-[#22c55e] focus:ring-[#22c55e]"
                      />
                      <span className="text-sm text-[#93adc8]">Show Fault Overlays ({displayFaults.length})</span>
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
                          ? 'bg-[#22c55e] text-white shadow-lg'
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
            {selectedHistogram && displayHistograms[selectedHistogram] && selectedHistogram !== 'ect' && (
              <HeatmapTable
                histogram={displayHistograms[selectedHistogram]}
                title={`${displayProcessedHistograms[selectedHistogram]?.title || selectedHistogram} - Distribution Matrix (${selectedHistogram.includes('backfire') ? 'Events' : 'Hours'} / %)`}
                faultOverlays={showFaultOverlays ? displayFaults : []}
                unit={selectedHistogram.includes('backfire') ? 'events' : 'hours'}
                sourceInSeconds={selectedHistogram.includes('knock')}
                secondsPerUnit={ECM_HISTOGRAM_CONFIG.knock?.secondsPerUnit || 1}
              />
            )}

            {/* ECT Bar Chart for Temperature Distribution */}
            {selectedHistogram === 'ect' && displayHistograms.ect && (
              <ECTBarChart histogram={displayHistograms.ect} />
            )}

            {/* Fault Correlation Panel */}
            {displayFaults.length > 0 && selectedHistogram === 'speedLoad' && (
              <div className="bg-[#111921] rounded-xl border border-[#344d65] p-6">
                <div className="flex items-center gap-2 mb-4">
                  <AlertTriangle className="w-5 h-5 text-red-400" />
                  <h3 className="text-white font-bold">Fault Operating Conditions</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {displayFaults.map((fault, idx) => (
                    <div
                      key={idx}
                      className="bg-[#1a2632] rounded-lg p-4 border border-[#344d65] hover:border-red-500/50 cursor-pointer transition-all"
                      onClick={() => setSelectedFaultIndex(idx)}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[#22c55e] font-mono font-bold">DTC {fault.code}</span>
                      {fault.causedShutdown && (
                        <span className="text-[10px] bg-red-500/20 text-red-400 px-2 py-0.5 rounded flex items-center gap-1 shutdown-glow">
                          <AlertTriangle className="w-3 h-3" />
                          <span className="shutdown-text-glow">SHUTDOWN</span>
                        </span>
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
            {selectedFaultIndex !== null && displayFaults[selectedFaultIndex] && (
              <FaultSnapshotDetail
                fault={displayFaults[selectedFaultIndex]}
                histograms={displayHistograms}
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
        {(activeTab === 'raw' || activeTab === 'raw-ecm') && (
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
      <ReportIssue isOpen={showReportIssue} onClose={() => setShowReportIssue(false)} />
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
