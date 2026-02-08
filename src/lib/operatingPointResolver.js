/**
 * Operating-Point-Aware Threshold Resolver
 *
 * Provides piecewise-linear interpolation for thresholds that vary
 * with operating conditions (MAP, RPM, etc.).
 *
 * Example: oil pressure warning threshold varies by RPM:
 *   breakpoints: [{indexValue: 700, warning: {min: 8}}, {indexValue: 1800, warning: {min: 18}}]
 *   At RPM=1250 -> interpolated warning.min = 13
 *
 * Example: TIP-MAP delta boundaries vary by MAP:
 *   breakpoints: [{indexValue: 9, warning: {max: 3}}, {indexValue: 18, warning: {max: 6}}]
 *   At MAP=14 -> interpolated warning.max = 4.67
 */

/**
 * Piecewise-linear interpolation for a single threshold value.
 *
 * @param {Array<Object>} breakpoints - Sorted array of {indexValue, warning: {min,max}, critical: {min,max}}
 * @param {number} currentValue - Current operating point value (e.g., current MAP or RPM)
 * @param {string} tier - 'warning' or 'critical'
 * @param {string} bound - 'min' or 'max'
 * @returns {number|null} Interpolated threshold value, or null if not defined
 */
export function interpolateThreshold(breakpoints, currentValue, tier, bound) {
  if (!breakpoints || breakpoints.length === 0 || currentValue == null) return null;

  const sorted = breakpoints.length > 1 && breakpoints[0].indexValue > breakpoints[1].indexValue
    ? [...breakpoints].sort((a, b) => a.indexValue - b.indexValue)
    : breakpoints;

  // Below lowest breakpoint - clamp to first
  if (currentValue <= sorted[0].indexValue) {
    return sorted[0][tier]?.[bound] ?? null;
  }

  // Above highest breakpoint - clamp to last
  if (currentValue >= sorted[sorted.length - 1].indexValue) {
    return sorted[sorted.length - 1][tier]?.[bound] ?? null;
  }

  // Find bracketing breakpoints and interpolate
  for (let i = 0; i < sorted.length - 1; i++) {
    if (currentValue >= sorted[i].indexValue && currentValue <= sorted[i + 1].indexValue) {
      const p1 = sorted[i];
      const p2 = sorted[i + 1];

      const v1 = p1[tier]?.[bound];
      const v2 = p2[tier]?.[bound];

      // If either endpoint is undefined, return the defined one (or null)
      if (v1 == null && v2 == null) return null;
      if (v1 == null) return v2;
      if (v2 == null) return v1;

      const ratio = (currentValue - p1.indexValue) / (p2.indexValue - p1.indexValue);
      return v1 + ratio * (v2 - v1);
    }
  }

  return null;
}

/**
 * Resolve effective thresholds for a parameter at a given operating point.
 * Falls back to flat thresholds if operatingPointAware is not enabled.
 *
 * @param {Object} config - Parameter threshold config from profile
 *   Expected shape: { warning: {min, max}, critical: {min, max}, operatingPointAware: {enabled, indexParam, breakpoints} }
 * @param {number|null} operatingPointValue - Current value of the index parameter
 * @returns {Object} Resolved thresholds: {warningMin, warningMax, criticalMin, criticalMax, isOperatingPointAware, indexParam, indexValue}
 */
export function resolveOperatingPointThreshold(config, operatingPointValue) {
  if (!config) {
    return {
      warningMin: null, warningMax: null,
      criticalMin: null, criticalMax: null,
      isOperatingPointAware: false
    };
  }

  const opConfig = config.operatingPointAware;

  if (!opConfig?.enabled || !opConfig?.breakpoints || opConfig.breakpoints.length < 2 || operatingPointValue == null) {
    // Return flat thresholds
    return {
      warningMin: config.warning?.min ?? null,
      warningMax: config.warning?.max ?? null,
      criticalMin: config.critical?.min ?? null,
      criticalMax: config.critical?.max ?? null,
      isOperatingPointAware: false
    };
  }

  return {
    warningMin: interpolateThreshold(opConfig.breakpoints, operatingPointValue, 'warning', 'min'),
    warningMax: interpolateThreshold(opConfig.breakpoints, operatingPointValue, 'warning', 'max'),
    criticalMin: interpolateThreshold(opConfig.breakpoints, operatingPointValue, 'critical', 'min'),
    criticalMax: interpolateThreshold(opConfig.breakpoints, operatingPointValue, 'critical', 'max'),
    isOperatingPointAware: true,
    indexParam: opConfig.indexParam,
    indexValue: operatingPointValue
  };
}

/**
 * Get the operating-point index value from a data row.
 *
 * @param {Object} row - Data row
 * @param {string} indexParam - Primary parameter name (e.g., 'MAP', 'rpm')
 * @param {Array<string>} indexParamAliases - Alternative column names
 * @param {Object} columnMap - Column name mapping from anomaly engine
 * @returns {number|null} The operating point value, or null if not found
 */
export function getOperatingPointValue(row, indexParam, indexParamAliases = [], columnMap = {}) {
  if (!row || !indexParam) return null;

  // Try direct access
  let value = row[indexParam];
  if (value !== undefined) {
    const num = typeof value === 'number' ? value : parseFloat(value);
    if (Number.isFinite(num)) return num;
  }

  // Try aliases
  for (const alias of indexParamAliases) {
    value = row[alias];
    if (value !== undefined) {
      const num = typeof value === 'number' ? value : parseFloat(value);
      if (Number.isFinite(num)) return num;
    }
  }

  // Try column map
  const mapped = columnMap[indexParam];
  if (mapped && row[mapped] !== undefined) {
    value = row[mapped];
    const num = typeof value === 'number' ? value : parseFloat(value);
    if (Number.isFinite(num)) return num;
  }

  // Case-insensitive fallback
  const lower = indexParam.toLowerCase();
  for (const key of Object.keys(row)) {
    if (key.toLowerCase() === lower) {
      value = row[key];
      const num = typeof value === 'number' ? value : parseFloat(value);
      if (Number.isFinite(num)) return num;
    }
  }

  return null;
}

/**
 * Resolve threshold for a computed delta parameter (e.g., TIP - MAP).
 * The delta threshold config includes param1, param2, and operatingPointAware settings.
 *
 * @param {Object} config - Delta threshold config
 *   Shape: { enabled, param1, param2, operatingPointAware: {...}, warning: {min,max}, critical: {min,max} }
 * @param {Object} row - Current data row
 * @param {Object} columnMap - Column name mapping
 * @returns {Object|null} { delta, thresholds: {warningMin, warningMax, criticalMin, criticalMax}, indexValue } or null if params not found
 */
export function resolveDeltaThreshold(config, row, columnMap) {
  if (!config?.enabled) return null;

  const param1Key = config.param1;
  const param2Key = config.param2;
  if (!param1Key || !param2Key) return null;

  // Get values for both parameters
  const val1 = getOperatingPointValue(row, param1Key, [], columnMap);
  const val2 = getOperatingPointValue(row, param2Key, [], columnMap);
  if (val1 == null || val2 == null) return null;

  const delta = val1 - val2;

  // Get operating point for threshold interpolation
  const opConfig = config.operatingPointAware;
  let indexValue = null;
  if (opConfig?.enabled && opConfig?.indexParam) {
    indexValue = getOperatingPointValue(row, opConfig.indexParam, opConfig.indexParamAliases || [], columnMap);
  }

  const thresholds = resolveOperatingPointThreshold(config, indexValue);

  return {
    delta,
    param1Value: val1,
    param2Value: val2,
    thresholds,
    indexValue
  };
}

/**
 * Find the appropriate operating-point bin for a given value.
 *
 * @param {Array<Object>} bins - Array of {binMin, binMax, ...stats}
 * @param {number} value - The operating point value to bin
 * @returns {Object|null} The matching bin, or null if no match
 */
export function findOperatingPointBin(bins, value) {
  if (!bins || !Array.isArray(bins) || value == null) return null;

  for (const bin of bins) {
    if (value >= bin.binMin && value < bin.binMax) {
      return bin;
    }
  }

  // Check if value equals the upper bound of the last bin
  if (bins.length > 0) {
    const lastBin = bins[bins.length - 1];
    if (value >= lastBin.binMin && value <= lastBin.binMax) {
      return lastBin;
    }
  }

  return null;
}

/**
 * Validate an operatingPointAware configuration block.
 *
 * @param {Object} opConfig - The operatingPointAware config
 * @returns {Object} { valid: boolean, errors: string[] }
 */
export function validateOperatingPointConfig(opConfig) {
  const errors = [];

  if (!opConfig) return { valid: true, errors: [] };
  if (!opConfig.enabled) return { valid: true, errors: [] };

  if (!opConfig.indexParam) {
    errors.push('operatingPointAware.indexParam is required when enabled');
  }

  if (!opConfig.breakpoints || !Array.isArray(opConfig.breakpoints)) {
    errors.push('operatingPointAware.breakpoints must be an array');
    return { valid: false, errors };
  }

  if (opConfig.breakpoints.length < 2) {
    errors.push('operatingPointAware requires at least 2 breakpoints');
  }

  // Check monotonically increasing index values
  for (let i = 1; i < opConfig.breakpoints.length; i++) {
    if (opConfig.breakpoints[i].indexValue <= opConfig.breakpoints[i - 1].indexValue) {
      errors.push(`Breakpoint index values must be monotonically increasing (breakpoint ${i})`);
      break;
    }
  }

  // Check that warning bounds are inside critical bounds at each breakpoint
  for (let i = 0; i < opConfig.breakpoints.length; i++) {
    const bp = opConfig.breakpoints[i];
    const wMin = bp.warning?.min;
    const wMax = bp.warning?.max;
    const cMin = bp.critical?.min;
    const cMax = bp.critical?.max;

    if (wMin != null && cMin != null && wMin < cMin) {
      errors.push(`Breakpoint ${i} (indexValue=${bp.indexValue}): warning.min (${wMin}) should be >= critical.min (${cMin})`);
    }
    if (wMax != null && cMax != null && wMax > cMax) {
      errors.push(`Breakpoint ${i} (indexValue=${bp.indexValue}): warning.max (${wMax}) should be <= critical.max (${cMax})`);
    }
  }

  return { valid: errors.length === 0, errors };
}
