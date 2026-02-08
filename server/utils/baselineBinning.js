/**
 * Baseline Binning Utility
 * Computes operating-point-binned statistics for baseline data.
 * Enables the anomaly engine to use bin-specific p05/p95 bounds
 * instead of global percentiles, accounting for how parameters
 * naturally vary across operating conditions (MAP, RPM, etc.).
 */

/**
 * Default MAP pressure bins (PSI absolute) for operating-point binning.
 * These represent typical engine load ranges:
 *   - Idle/low load: < 8 PSI
 *   - Part load: 8-14, 14-20 PSI
 *   - High load: 20-28 PSI
 *   - Full load/boost: > 28 PSI
 */
export const DEFAULT_MAP_BINS = [
  { binMin: 0,  binMax: 8,  label: 'idle' },
  { binMin: 8,  binMax: 14, label: 'low_load' },
  { binMin: 14, binMax: 20, label: 'mid_load' },
  { binMin: 20, binMax: 28, label: 'high_load' },
  { binMin: 28, binMax: 50, label: 'full_load' }
];

/**
 * Default RPM bins for RPM-indexed operating-point binning.
 */
export const DEFAULT_RPM_BINS = [
  { binMin: 0,    binMax: 800,  label: 'cranking' },
  { binMin: 800,  binMax: 1200, label: 'idle' },
  { binMin: 1200, binMax: 1500, label: 'low_rpm' },
  { binMin: 1500, binMax: 1800, label: 'mid_rpm' },
  { binMin: 1800, binMax: 2500, label: 'high_rpm' }
];

/** Minimum samples per bin to produce valid statistics */
const MIN_BIN_SAMPLES = 20;

/**
 * Compute percentile from a sorted array
 * @param {number[]} sorted - Pre-sorted array of values
 * @param {number} p - Percentile (0-100)
 * @returns {number}
 */
function percentile(sorted, p) {
  if (sorted.length === 0) return NaN;
  if (sorted.length === 1) return sorted[0];
  const idx = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);
  if (lower === upper) return sorted[lower];
  const frac = idx - lower;
  return sorted[lower] * (1 - frac) + sorted[upper] * frac;
}

/**
 * Compute mean of an array
 * @param {number[]} values
 * @returns {number}
 */
function mean(values) {
  if (values.length === 0) return NaN;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/**
 * Compute standard deviation
 * @param {number[]} values
 * @param {number} avg - Pre-computed mean
 * @returns {number}
 */
function stdDev(values, avg) {
  if (values.length < 2) return 0;
  const sumSq = values.reduce((sum, v) => sum + (v - avg) ** 2, 0);
  return Math.sqrt(sumSq / (values.length - 1));
}

/**
 * Compute statistics for an array of values
 * @param {number[]} values - Raw values (not necessarily sorted)
 * @returns {{ p05: number, p95: number, mean: number, std: number, n: number, min: number, max: number }}
 */
function computeStats(values) {
  if (values.length === 0) {
    return { p05: NaN, p95: NaN, mean: NaN, std: NaN, n: 0, min: NaN, max: NaN };
  }
  const sorted = [...values].sort((a, b) => a - b);
  const avg = mean(values);
  return {
    p05: percentile(sorted, 5),
    p95: percentile(sorted, 95),
    mean: avg,
    std: stdDev(values, avg),
    n: values.length,
    min: sorted[0],
    max: sorted[sorted.length - 1]
  };
}

/**
 * Compute binned statistics for a channel across operating-point bins.
 *
 * @param {Array<Object>} rows - Data rows, each with named columns
 * @param {string} channelName - Name of the channel to compute stats for (e.g., "OILP_press")
 * @param {string} indexParam - Operating-point index parameter (e.g., "MAP", "rpm")
 * @param {string[]} [indexAliases=[]] - Alternative names for the index parameter
 * @param {Array<{binMin: number, binMax: number, label?: string}>} [bins] - Bin definitions
 * @param {Object} [options={}] - Additional options
 * @param {number} [options.minBinSamples=20] - Minimum samples per bin for valid stats
 * @param {Function} [options.filterFn] - Optional filter predicate for rows
 * @returns {{ global: Object, byOperatingPoint: { indexParam: string, bins: Array<Object> } }}
 */
export function computeBinnedStats(rows, channelName, indexParam, indexAliases = [], bins = null, options = {}) {
  const { minBinSamples = MIN_BIN_SAMPLES, filterFn } = options;

  // Use default bins based on index param
  if (!bins) {
    bins = indexParam.toLowerCase() === 'rpm' ? DEFAULT_RPM_BINS : DEFAULT_MAP_BINS;
  }

  // Resolve actual column names (case-insensitive matching)
  const allColumns = rows.length > 0 ? Object.keys(rows[0]) : [];
  const resolvedChannel = resolveColumnName(channelName, allColumns);
  const resolvedIndex = resolveColumnName(indexParam, allColumns, indexAliases);

  if (!resolvedChannel) {
    return { global: computeStats([]), byOperatingPoint: null, error: `Channel "${channelName}" not found` };
  }

  // Collect all valid values for global stats
  const allValues = [];
  // Collect values per bin
  const binValues = bins.map(() => []);

  for (const row of rows) {
    // Apply custom filter if provided
    if (filterFn && !filterFn(row)) continue;

    const value = parseFloat(row[resolvedChannel]);
    if (isNaN(value)) continue;

    allValues.push(value);

    // Bin by index parameter if available
    if (resolvedIndex) {
      const indexValue = parseFloat(row[resolvedIndex]);
      if (!isNaN(indexValue)) {
        for (let i = 0; i < bins.length; i++) {
          if (indexValue >= bins[i].binMin && indexValue < bins[i].binMax) {
            binValues[i].push(value);
            break;
          }
        }
      }
    }
  }

  // Compute global stats
  const global = computeStats(allValues);

  // Compute per-bin stats
  if (!resolvedIndex) {
    return { global, byOperatingPoint: null };
  }

  const binnedResults = bins.map((bin, i) => {
    const stats = computeStats(binValues[i]);
    return {
      binMin: bin.binMin,
      binMax: bin.binMax,
      label: bin.label || `${bin.binMin}-${bin.binMax}`,
      ...stats,
      valid: binValues[i].length >= minBinSamples
    };
  });

  return {
    global,
    byOperatingPoint: {
      indexParam,
      bins: binnedResults
    }
  };
}

/**
 * Apply padding to binned statistics using the same strategy as the existing baseline system.
 * Padding strategy: pad p05/p95 by a percentage of the observed range,
 * with a minimum padding per channel and a cap.
 *
 * @param {Object} binnedStats - Output from computeBinnedStats
 * @param {Object} paddingConfig - Padding configuration
 * @param {number} paddingConfig.rangePaddingPct - Fraction of range to pad (e.g., 0.1 = 10%)
 * @param {number} paddingConfig.rangePaddingCapPct - Maximum padding as fraction of range (e.g., 0.25)
 * @param {number} paddingConfig.minPadding - Minimum absolute padding value
 * @returns {Object} - Same structure with p05_padded/p95_padded added
 */
export function padBinnedStats(binnedStats, paddingConfig) {
  const { rangePaddingPct = 0.1, rangePaddingCapPct = 0.25, minPadding = 0.5 } = paddingConfig;

  function applyPadding(stats) {
    if (stats.n === 0 || isNaN(stats.p05) || isNaN(stats.p95)) {
      return { ...stats, p05_padded: stats.p05, p95_padded: stats.p95 };
    }

    const range = stats.p95 - stats.p05;
    let padding = range * rangePaddingPct;
    padding = Math.max(padding, minPadding);
    padding = Math.min(padding, range * rangePaddingCapPct);

    return {
      ...stats,
      p05_padded: stats.p05 - padding,
      p95_padded: stats.p95 + padding
    };
  }

  const result = {
    global: applyPadding(binnedStats.global)
  };

  if (binnedStats.byOperatingPoint) {
    result.byOperatingPoint = {
      indexParam: binnedStats.byOperatingPoint.indexParam,
      bins: binnedStats.byOperatingPoint.bins.map(bin => applyPadding(bin))
    };
  }

  if (binnedStats.error) {
    result.error = binnedStats.error;
  }

  return result;
}

/**
 * Compute binned baseline for all channels in a dataset.
 *
 * @param {Array<Object>} rows - Data rows
 * @param {string[]} channelNames - Channels to compute stats for
 * @param {string} indexParam - Operating-point index parameter
 * @param {string[]} [indexAliases=[]] - Alternative names for the index parameter
 * @param {Array<{binMin: number, binMax: number, label?: string}>} [bins] - Bin definitions
 * @param {Object} [paddingConfig] - Padding configuration per channel
 * @param {Object} [options={}] - Additional options passed to computeBinnedStats
 * @returns {Object} - Channel name -> { global, byOperatingPoint } with padded stats
 */
export function computeAllChannelBinnedStats(rows, channelNames, indexParam, indexAliases = [], bins = null, paddingConfig = {}, options = {}) {
  const result = {};

  for (const channel of channelNames) {
    const raw = computeBinnedStats(rows, channel, indexParam, indexAliases, bins, options);

    // Determine per-channel min padding
    const chanPadding = {
      rangePaddingPct: paddingConfig.rangePaddingPct || 0.1,
      rangePaddingCapPct: paddingConfig.rangePaddingCapPct || 0.25,
      minPadding: paddingConfig.minPaddingByChannel?.[channel]
        ?? paddingConfig.defaultMinPadding
        ?? 0.5
    };

    result[channel] = padBinnedStats(raw, chanPadding);
  }

  return result;
}

/**
 * Convert binned stats to the format expected by the existing baseline store.
 * Merges the new byOperatingPoint data alongside the existing flat stats format
 * for backward compatibility.
 *
 * @param {Object} binnedChannelStats - Output from computeAllChannelBinnedStats
 * @param {number} fileCount - Number of files contributing to this baseline
 * @returns {Object} - Channel data in baseline store format with byOperatingPoint added
 */
export function toBinnedBaselineFormat(binnedChannelStats, fileCount = 1) {
  const result = {};

  for (const [channel, stats] of Object.entries(binnedChannelStats)) {
    if (stats.error || !stats.global || stats.global.n === 0) continue;

    const entry = {
      // Existing flat format fields (backward compatible)
      p05_mean: stats.global.p05,
      p95_mean: stats.global.p95,
      p05_padded: stats.global.p05_padded,
      p95_padded: stats.global.p95_padded,
      files: fileCount,
      // Extended stats
      mean: stats.global.mean,
      std: stats.global.std,
      n: stats.global.n
    };

    // Add binned data if available
    if (stats.byOperatingPoint) {
      entry.byOperatingPoint = {
        indexParam: stats.byOperatingPoint.indexParam,
        bins: stats.byOperatingPoint.bins
          .filter(bin => bin.valid)
          .map(bin => ({
            binMin: bin.binMin,
            binMax: bin.binMax,
            label: bin.label,
            p05: bin.p05,
            p95: bin.p95,
            p05_padded: bin.p05_padded,
            p95_padded: bin.p95_padded,
            mean: bin.mean,
            std: bin.std,
            n: bin.n
          }))
      };
    }

    result[channel] = entry;
  }

  return result;
}

/**
 * Resolve a column name case-insensitively with aliases
 * @param {string} name - Desired column name
 * @param {string[]} availableColumns - Available column names in data
 * @param {string[]} [aliases=[]] - Alternative names to try
 * @returns {string|null} - Resolved column name or null
 */
function resolveColumnName(name, availableColumns, aliases = []) {
  // Exact match
  if (availableColumns.includes(name)) return name;

  // Case-insensitive match
  const lower = name.toLowerCase();
  const found = availableColumns.find(c => c.toLowerCase() === lower);
  if (found) return found;

  // Try aliases
  for (const alias of aliases) {
    if (availableColumns.includes(alias)) return alias;
    const aliasLower = alias.toLowerCase();
    const aliasFound = availableColumns.find(c => c.toLowerCase() === aliasLower);
    if (aliasFound) return aliasFound;
  }

  return null;
}
