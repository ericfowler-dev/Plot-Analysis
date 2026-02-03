import React, { useState, useMemo } from 'react';
import { Cpu, BarChart3, AlertTriangle, Check, X, ChevronDown, ChevronRight } from 'lucide-react';
import DifferenceHeatmap from './DifferenceHeatmap';
import { getHistogramDifference, getEcmInfoComparison, findMatchingFaults } from '../lib/ecmTimelineMerge';

// =============================================================================
// ECM COMPARISON COMPONENT
// Side-by-side comparison view for Primary and Secondary ECMs
// =============================================================================

const formatNumber = (value, decimals = null) => {
  if (value === null || value === undefined || value === '') return '-';
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num)) return String(value).replace(/"/g, '');
  if (decimals !== null) return num.toFixed(decimals);
  return String(num);
};

const stripQuotes = (value) => {
  if (!value) return '-';
  return String(value).replace(/"/g, '');
};

// ECM Info Panel - Shows key device information
const EcmInfoPanel = ({ ecmInfo, stats, role, fileName }) => {
  const [expanded, setExpanded] = useState(true);
  const isPrimary = role === 'primary';

  return (
    <div className={`rounded-xl border overflow-hidden ${
      isPrimary
        ? 'bg-blue-950/30 border-blue-500/30'
        : 'bg-slate-900/50 border-slate-700/50'
    }`}>
      {/* Header */}
      <div
        className={`flex items-center justify-between px-4 py-3 cursor-pointer ${
          isPrimary ? 'bg-blue-500/10' : 'bg-slate-800/50'
        }`}
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3">
          <div className={`w-8 h-8 rounded flex items-center justify-center ${
            isPrimary ? 'bg-blue-500/20' : 'bg-slate-700/50'
          }`}>
            <Cpu className={`w-4 h-4 ${isPrimary ? 'text-blue-400' : 'text-slate-400'}`} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className={`text-xs font-bold uppercase tracking-wider ${
                isPrimary ? 'text-blue-400' : 'text-slate-400'
              }`} style={{ fontFamily: 'Orbitron, sans-serif' }}>
                {isPrimary ? 'PRIMARY' : 'SECONDARY'} ECM
              </span>
            </div>
            <span className="text-xs text-slate-500 font-mono truncate max-w-[200px] block" title={fileName}>
              {fileName}
            </span>
          </div>
        </div>
        {expanded ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
      </div>

      {/* Content */}
      {expanded && (
        <div className="p-4 space-y-4">
          {/* Key Metrics */}
          <div className="grid grid-cols-2 gap-3">
            <InfoCell label="Engine Hours" value={formatNumber(stats?.engineHours || ecmInfo['Hour meter'], 1)} unit="h" />
            <InfoCell label="Starts" value={formatNumber(stats?.engineStarts || ecmInfo['Cumulative Starts'], 0)} />
            <InfoCell label="Hardware P/N" value={stripQuotes(ecmInfo['ECI H/W P/N'])} small />
            <InfoCell label="Software P/N" value={stripQuotes(ecmInfo['ECI S/W P/N'])} small />
          </div>

          {/* Additional Info */}
          <div className="grid grid-cols-2 gap-3 pt-3 border-t border-slate-700/50">
            <InfoCell label="Serial Number" value={stripQuotes(ecmInfo['ECI H/W S/N'])} small />
            <InfoCell label="Fuel Type" value={stripQuotes(ecmInfo['Fuel Type'])} />
            <InfoCell label="Download Date" value={stripQuotes(ecmInfo['Download Date'])} />
            <InfoCell label="Download Time" value={stripQuotes(ecmInfo['Download Time'])} />
          </div>
        </div>
      )}
    </div>
  );
};

// Info cell for ECM panels
const InfoCell = ({ label, value, unit, small }) => (
  <div className="bg-slate-800/30 rounded-lg p-2">
    <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-0.5">{label}</div>
    <div className={`font-mono text-white ${small ? 'text-xs' : 'text-sm'} truncate`} title={value}>
      {value}{unit && <span className="text-slate-400 ml-1">{unit}</span>}
    </div>
  </div>
);

// Comparison row for ECM info fields
const ComparisonRow = ({ field, primary, secondary, match }) => (
  <div className={`flex items-center py-2 px-3 rounded ${
    match ? 'bg-slate-800/30' : 'bg-yellow-900/20'
  }`}>
    <div className="w-1/4 text-xs text-slate-400 truncate" title={field}>{field}</div>
    <div className="w-5/12 text-xs text-white font-mono truncate px-2" title={primary}>
      {stripQuotes(primary) || '-'}
    </div>
    <div className="w-5/12 text-xs text-white font-mono truncate px-2" title={secondary}>
      {stripQuotes(secondary) || '-'}
    </div>
    <div className="w-8 flex justify-center">
      {match ? (
        <Check className="w-4 h-4 text-green-400" />
      ) : (
        <X className="w-4 h-4 text-yellow-400" />
      )}
    </div>
  </div>
);

// Histogram selector for comparison
const HistogramSelector = ({ histogramOptions, selected, onSelect }) => (
  <div className="flex flex-wrap gap-2">
    {histogramOptions.map(option => (
      <button
        key={option.key}
        onClick={() => onSelect(option.key)}
        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
          selected === option.key
            ? 'bg-green-500 text-black shadow-lg'
            : 'bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700'
        }`}
      >
        {option.name}
      </button>
    ))}
  </div>
);

// Main EcmComparison component
const EcmComparison = ({
  ecmFiles = [],
  combinedEcmHistograms = {},
  combinedEcmFaults = [],
  ecmComparisonStats = null
}) => {
  const [selectedHistogram, setSelectedHistogram] = useState('speedLoad');
  const [showInfoComparison, setShowInfoComparison] = useState(false);

  // Get primary and secondary ECM files
  const primaryEcm = useMemo(() =>
    ecmFiles.find(f => f.role === 'primary'),
    [ecmFiles]
  );
  const secondaryEcm = useMemo(() =>
    ecmFiles.find(f => f.role === 'secondary'),
    [ecmFiles]
  );

  // Get histogram options
  const histogramOptions = useMemo(() => {
    const allKeys = new Set();
    ecmFiles.forEach(file => {
      if (file.histograms) {
        Object.keys(file.histograms).forEach(key => allKeys.add(key));
      }
    });

    return Array.from(allKeys).map(key => ({
      key,
      name: key === 'speedLoad' ? 'Speed vs Load'
        : key === 'knock' ? 'Knock Detection'
        : key === 'ect' ? 'Coolant Temp'
        : key === 'backfireLifetime' ? 'Backfire (Lifetime)'
        : key === 'backfireRecent' ? 'Backfire (Recent)'
        : key
    }));
  }, [ecmFiles]);

  // Calculate histogram difference
  const histogramDiff = useMemo(() => {
    if (!primaryEcm?.histograms?.[selectedHistogram] || !secondaryEcm?.histograms?.[selectedHistogram]) {
      return null;
    }
    return getHistogramDifference(
      primaryEcm.histograms[selectedHistogram],
      secondaryEcm.histograms[selectedHistogram]
    );
  }, [primaryEcm, secondaryEcm, selectedHistogram]);

  // Get ECM info comparison
  const infoComparison = useMemo(() =>
    getEcmInfoComparison(ecmFiles),
    [ecmFiles]
  );

  // Find matching faults
  const matchingFaultsMap = useMemo(() =>
    findMatchingFaults(combinedEcmFaults),
    [combinedEcmFaults]
  );

  // Count stats
  const matchCount = useMemo(() => {
    let count = 0;
    matchingFaultsMap.forEach(entry => {
      if (entry.primary && entry.secondary) count++;
    });
    return count;
  }, [matchingFaultsMap]);

  if (!primaryEcm || !secondaryEcm) {
    return (
      <div className="bg-slate-900/50 rounded-xl border border-slate-800 p-8 text-center">
        <Cpu className="w-12 h-12 mx-auto mb-4 text-slate-600" />
        <p className="text-slate-400">
          Load both Primary and Secondary ECM files to enable comparison view
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-slate-900/50 rounded-xl border border-slate-800 p-4">
          <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">Total Faults</div>
          <div className="text-2xl font-bold text-white font-mono">
            {ecmComparisonStats?.totalFaults || 0}
          </div>
          <div className="text-xs text-slate-400 mt-1">Combined from both ECMs</div>
        </div>
        <div className="bg-slate-900/50 rounded-xl border border-slate-800 p-4">
          <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">Matching Faults</div>
          <div className="text-2xl font-bold text-yellow-400 font-mono">
            {ecmComparisonStats?.matchingFaults || matchCount}
          </div>
          <div className="text-xs text-slate-400 mt-1">Same DTC on both ECMs</div>
        </div>
        <div className="bg-blue-950/30 rounded-xl border border-blue-500/30 p-4">
          <div className="text-xs text-blue-400 uppercase tracking-wider mb-1">Primary Only</div>
          <div className="text-2xl font-bold text-blue-400 font-mono">
            {ecmComparisonStats?.primaryOnlyFaults || 0}
          </div>
          <div className="text-xs text-slate-400 mt-1">{formatNumber(ecmComparisonStats?.engineHours?.primary, 1)}h runtime</div>
        </div>
        <div className="bg-slate-900/50 rounded-xl border border-slate-700/50 p-4">
          <div className="text-xs text-slate-400 uppercase tracking-wider mb-1">Secondary Only</div>
          <div className="text-2xl font-bold text-slate-300 font-mono">
            {ecmComparisonStats?.secondaryOnlyFaults || 0}
          </div>
          <div className="text-xs text-slate-400 mt-1">{formatNumber(ecmComparisonStats?.engineHours?.secondary, 1)}h runtime</div>
        </div>
      </div>

      {/* Side-by-side ECM Info */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <EcmInfoPanel
          ecmInfo={primaryEcm.ecmInfo || {}}
          stats={primaryEcm.stats}
          role="primary"
          fileName={primaryEcm.fileName}
        />
        <EcmInfoPanel
          ecmInfo={secondaryEcm.ecmInfo || {}}
          stats={secondaryEcm.stats}
          role="secondary"
          fileName={secondaryEcm.fileName}
        />
      </div>

      {/* ECM Info Comparison Table */}
      <div className="bg-slate-900/50 rounded-xl border border-slate-800 overflow-hidden">
        <button
          className="w-full flex items-center justify-between px-4 py-3 bg-slate-800/50 hover:bg-slate-800/70 transition-colors"
          onClick={() => setShowInfoComparison(!showInfoComparison)}
        >
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-300">
            <BarChart3 className="w-4 h-4 text-green-400" />
            ECM Configuration Comparison
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-500">
              {infoComparison.filter(c => !c.match).length} differences found
            </span>
            {showInfoComparison ? (
              <ChevronDown className="w-4 h-4 text-slate-400" />
            ) : (
              <ChevronRight className="w-4 h-4 text-slate-400" />
            )}
          </div>
        </button>

        {showInfoComparison && (
          <div className="p-4">
            {/* Header */}
            <div className="flex items-center py-2 px-3 bg-slate-800/50 rounded mb-2">
              <div className="w-1/4 text-[10px] text-slate-500 uppercase tracking-wider">Field</div>
              <div className="w-5/12 text-[10px] text-blue-400 uppercase tracking-wider px-2">Primary</div>
              <div className="w-5/12 text-[10px] text-slate-400 uppercase tracking-wider px-2">Secondary</div>
              <div className="w-8 text-[10px] text-slate-500 uppercase tracking-wider text-center">Match</div>
            </div>
            {/* Rows */}
            <div className="space-y-1 max-h-80 overflow-y-auto">
              {infoComparison.map((row, idx) => (
                <ComparisonRow
                  key={idx}
                  field={row.field}
                  primary={row.primary}
                  secondary={row.secondary}
                  match={row.match}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Histogram Comparison */}
      <div className="bg-slate-900/50 rounded-xl border border-slate-800 p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2 text-base font-semibold text-slate-300">
            <BarChart3 className="w-5 h-5 text-green-400" />
            Histogram Comparison
          </div>
        </div>

        {/* Histogram Selector */}
        <div className="mb-4">
          <HistogramSelector
            histogramOptions={histogramOptions}
            selected={selectedHistogram}
            onSelect={setSelectedHistogram}
          />
        </div>

        {/* Difference Heatmap */}
        {histogramDiff ? (
          <DifferenceHeatmap
            differenceData={histogramDiff}
            title={`${selectedHistogram} - Primary vs Secondary Difference`}
            primaryLabel={primaryEcm.fileName}
            secondaryLabel={secondaryEcm.fileName}
          />
        ) : (
          <div className="text-center py-8 text-slate-500">
            <BarChart3 className="w-12 h-12 mx-auto mb-3 text-slate-600" />
            <p>No histogram data available for comparison</p>
          </div>
        )}
      </div>

      {/* Matching Faults Section */}
      {matchCount > 0 && (
        <div className="bg-yellow-950/30 rounded-xl border border-yellow-500/30 p-6">
          <div className="flex items-center gap-2 mb-4 text-base font-semibold text-yellow-400">
            <AlertTriangle className="w-5 h-5" />
            Matching Faults ({matchCount})
          </div>
          <p className="text-sm text-slate-400 mb-4">
            These DTCs appear on both Primary and Secondary ECMs, indicating a system-wide issue.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {Array.from(matchingFaultsMap.entries())
              .filter(([_, entry]) => entry.primary && entry.secondary)
              .slice(0, 6)
              .map(([key, entry]) => (
                <div
                  key={key}
                  className="bg-slate-800/50 rounded-lg p-3 border border-yellow-500/20"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-green-400 font-mono font-bold">
                      DTC {entry.primary.code}
                    </span>
                    <span className="text-xs text-yellow-400 bg-yellow-500/20 px-2 py-0.5 rounded">
                      Both ECMs
                    </span>
                  </div>
                  <div className="text-sm text-white mb-2 line-clamp-1">
                    {entry.primary.description}
                  </div>
                  <div className="flex gap-4 text-xs">
                    <div className="text-blue-400">
                      Primary: {entry.primary.occurrenceCount || 0}x
                    </div>
                    <div className="text-slate-400">
                      Secondary: {entry.secondary.occurrenceCount || 0}x
                    </div>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default EcmComparison;
