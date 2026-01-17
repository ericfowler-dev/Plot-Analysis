// =============================================================================
// B-PLOT DATA PROCESSING - Analysis and statistics for time-series data
// =============================================================================

import {
  extractTimeInfo,
  calculateChannelStats,
  extractEngineEvents,
  downsampleData,
  getChannelsByCategory,
  generateEngineStates
} from './bplotParsers.js';
import { BPLOT_THRESHOLDS, BPLOT_PARAMETERS, VALUE_MAPPINGS, getDisplayValue, TIME_IN_STATE_CHANNELS, getChannelValidityPolicy } from './bplotThresholds.js';
import { detectAnomalies, formatAlert } from './anomalyEngine.js';

/**
 * Format duration - show seconds if < 1 minute, otherwise minutes
 */
export function formatDuration(seconds) {
  if (seconds < 60) {
    return `${seconds.toFixed(1)} seconds`;
  } else if (seconds < 3600) {
    return `${(seconds / 60).toFixed(1)} minutes`;
  } else {
    return `${(seconds / 3600).toFixed(2)} hours`;
  }
}

/**
 * Format runtime display - per spec:
 * - If < 60 seconds: show in seconds (e.g., "42 seconds")
 * - If >= 60 seconds: show as "X.X minutes" or "MM:SS"
 * @param {number} seconds - Duration in seconds
 * @param {boolean} useMMSS - If true, use MM:SS format instead of decimal minutes
 */
export function formatRuntime(seconds, useMMSS = false) {
  if (seconds < 60) {
    return `${Math.round(seconds)} seconds`;
  } else if (seconds < 3600) {
    if (useMMSS) {
      const mins = Math.floor(seconds / 60);
      const secs = Math.round(seconds % 60);
      return `${mins}:${secs.toString().padStart(2, '0')}`;
    }
    return `${(seconds / 60).toFixed(1)} minutes`;
  } else {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.round((seconds % 3600) / 60);
    return `${hrs}:${mins.toString().padStart(2, '0')}:00`;
  }
}

/**
 * Calculate time-in-state statistics for categorical variables
 * Uses dt-based accumulation (not count-based) for accuracy with variable sample rates
 * Also counts transitions into each state
 */
export function calculateTimeInState(data, channelName) {
  if (!data || data.length < 2) return [];

  const stateAccum = {};  // Accumulated time per state
  const transitionCounts = {};  // Number of entries into each state
  let totalTime = 0;
  let previousState = null;

  // Accumulate time using actual time deltas between samples
  for (let i = 1; i < data.length; i++) {
    const currentRow = data[i];
    const prevRow = data[i - 1];

    const val = currentRow[channelName];
    if (val === undefined || val === null || isNaN(val)) continue;

    // Calculate actual time delta
    const dt = currentRow.Time - prevRow.Time;
    if (dt <= 0 || dt > 10) continue;  // Skip invalid or stale samples (> 10s gap)

    if (channelName === 'OILP_state' && val !== 0 && val !== 1 && val !== 2) {
      continue;
    }
    const stateKey = Math.round(val);

    // Initialize state if first time seen
    if (stateAccum[stateKey] === undefined) {
      stateAccum[stateKey] = 0;
      transitionCounts[stateKey] = 0;
    }

    // Accumulate time for this state
    stateAccum[stateKey] += dt;
    totalTime += dt;

    // Count transitions (when state changes)
    if (previousState !== null && previousState !== stateKey) {
      transitionCounts[stateKey]++;
    }
    previousState = stateKey;
  }

  // Count first state entry
  if (data.length > 0) {
    const firstVal = data[0][channelName];
    if (firstVal !== undefined && firstVal !== null && !isNaN(firstVal)) {
      const firstState = Math.round(firstVal);
      if (transitionCounts[firstState] !== undefined) {
        transitionCounts[firstState]++;
      }
    }
  }

  if (totalTime === 0) return [];

  // Convert to statistics array
  const stats = Object.entries(stateAccum).map(([stateKey, accumulatedTime]) => {
    const percentage = (accumulatedTime / totalTime) * 100;
    const displayName = getDisplayValue(channelName, parseInt(stateKey));
    const transitions = transitionCounts[stateKey] || 0;

    // Flag unmapped values
    const isUnmapped = displayName === parseInt(stateKey) || displayName === stateKey;

    return {
      state: parseInt(stateKey),
      displayName: isUnmapped ? `${stateKey} (unmapped)` : displayName,
      isUnmapped,
      durationSeconds: accumulatedTime,
      percentage,
      transitions,
      durationFormatted: formatDuration(accumulatedTime)
    };
  });

  // Sort by percentage descending
  return stats.sort((a, b) => b.percentage - a.percentage);
}

/**
 * Process B-Plot data and generate comprehensive analysis
 */
export function processBPlotData(parsedData, thresholdProfile = null) {
  const { data, channels, headers } = parsedData;

  // Extract time information
  const timeInfo = extractTimeInfo(data);

  // Normalize time to start from 0 for charting
  const startTime = timeInfo ? timeInfo.startTime : 0;
  const normalizedData = data.map(row => {
    const rpmValue = row.rpm ?? row.RPM;
    const normalizedRow = {
      ...row,
      Time: row.Time - startTime  // Normalize to start from 0
    };

    if (rpmValue !== undefined && normalizedRow.rpm === undefined) {
      normalizedRow.rpm = rpmValue;
    }

    return normalizedRow;
  });

  // Calculate stats for ALL channels (not just key channels)
  const channelStats = {};
  const timeInStateStats = {};
  const sampleRate = timeInfo ? parseFloat(timeInfo.sampleRate) : 1;

  // Generate engine states for validity masking
  // This tracks engine state (off, cranking, running_unstable, running_stable, stopping)
  // for each sample, used to filter channel statistics appropriately
  const engineStates = generateEngineStates(normalizedData);

  for (const channel of channels) {
    if (headers.includes(channel.name)) {
      // Get validity policy for this channel
      const validityPolicy = getChannelValidityPolicy(channel.name);

      // Calculate stats with validity mask applied
      channelStats[channel.name] = calculateChannelStats(normalizedData, channel.name, {
        engineStates,
        policyConfig: validityPolicy
      });

      // Calculate time-in-state for categorical channels
      const param = BPLOT_PARAMETERS[channel.name];
      if (param?.showTimeInState || TIME_IN_STATE_CHANNELS.includes(channel.name)) {
        timeInStateStats[channel.name] = calculateTimeInState(data, channel.name, sampleRate);
      }
    }
  }

  // Extract engine events
  const engineEvents = extractEngineEvents(normalizedData);

  // Group channels by category
  const channelsByCategory = getChannelsByCategory(channels, (name, fallbackCategory) => {
    return BPLOT_PARAMETERS[name]?.category || fallbackCategory || 'other';
  });

  // Calculate operating statistics
  const operatingStats = calculateOperatingStats(data, channelStats);

  // Detect anomalies and warnings (pass raw data to check VSW)
  let alerts = [];
  if (thresholdProfile?.thresholds || thresholdProfile?.anomalyRules) {
    const profileAlerts = detectAnomalies(data, thresholdProfile, {
      sampleRate,
      gracePeriod: 5,
      minDuration: 0
    });
    alerts = profileAlerts.alerts.map(alert => ({
      severity: alert.severity,
      channel: alert.category || 'anomaly',
      message: formatAlert(alert),
      threshold: alert.threshold,
      ruleId: alert.ruleId
    }));
  } else {
    alerts = detectAlerts(data, channelStats);
  }

  // Generate summary with proper time formatting
  const summary = generateSummary(timeInfo, engineEvents, operatingStats, alerts);

  // Use higher sample count for charts to avoid truncation
  // For files with many points, use adaptive downsampling
  const maxChartPoints = Math.min(data.length, 5000);

  return {
    timeInfo,
    channelStats,
    timeInStateStats,
    engineEvents,
    channelsByCategory,
    operatingStats,
    alerts,
    summary,
    thresholdProfileId: thresholdProfile?.profileId || null,
    // Store both normalized (for charts) and raw data
    chartData: downsampleData(normalizedData, maxChartPoints),
    rawData: data,
    normalizedData
  };
}

/**
 * Calculate operating statistics from the data
 * Per rules:
 * - Runtime only when RPM > 550 (engine considered running)
 * - Average Load calculated based on MAP value
 * Uses dt-based time accumulation for accuracy
 */
function calculateOperatingStats(data, channelStats) {
  const stats = {
    totalRuntime: 0,
    idleTime: 0,
    loadedTime: 0,
    maxRPM: 0,
    avgRPM: 0,
    maxLoad: 0,
    avgLoad: 0,
    avgMAP: 0  // Average MAP when engine running
  };

  if (!data || data.length < 2) return stats;

  let rpmSum = 0;
  let mapSum = 0;
  let rpmSampleCount = 0;
  let mapSampleCount = 0;  // Samples for MAP average

  // Use dt-based time accumulation
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const prevRow = data[i - 1];
    const rpm = row.rpm ?? row.RPM ?? 0;
    const vsw = row.Vsw || 0;
    const map = row.MAP || 0;
    const load = row.eng_load || 0;

    // Calculate time delta
    const dt = row.Time - prevRow.Time;
    if (dt <= 0 || dt > 10) continue;  // Skip invalid or stale samples

    // Engine running: RPM > 550 (per spec)
    if (rpm > 550) {
      stats.totalRuntime += dt;
      rpmSum += rpm;
      rpmSampleCount++;

      if (rpm > stats.maxRPM) stats.maxRPM = rpm;
      if (load > stats.maxLoad) stats.maxLoad = load;

      // Accumulate MAP for average load calculation
      if (map > 0) {
        mapSum += map;
        mapSampleCount++;
      }

      // Idle: RPM between 550 and 900
      if (rpm <= 900) {
        stats.idleTime += dt;
      } else {
        // RPM > 900: loaded time
        stats.loadedTime += dt;
      }
    }
  }

  if (rpmSampleCount > 0) {
    stats.avgRPM = rpmSum / rpmSampleCount;
  }

  // Calculate average MAP when engine running (per rules: Average Load = MAP value)
  if (mapSampleCount > 0) {
    stats.avgMAP = mapSum / mapSampleCount;
    stats.avgLoad = stats.avgMAP;  // Display as MAP value
  }

  return stats;
}

/**
 * Configuration for data validity and anomaly detection
 */
const VALIDITY_CONFIG = {
  DEBOUNCE_SAMPLES: 3,      // Require N consecutive samples before valid
  RPM_THRESHOLD: 500,       // RPM threshold for engine running
  VSW_THRESHOLD: 1,         // VSW threshold (below = key off)
  CRANK_GRACE_SECONDS: 2,   // Grace period after engine start for transients
  STALE_THRESHOLD_SECONDS: 10  // Gap larger than this = stale data
};

/**
 * Hysteresis thresholds for alarms (trigger vs clear)
 */
export const ALARM_HYSTERESIS = {
  battery: {
    critical: { trigger: 10.5, clear: 11.0 },
    warning: { trigger: 11.5, clear: 12.0 }
  },
  mfg_dppress: {
    warning: { trigger: 0.5, clear: 0.7 }
  }
};

/**
 * Calculate the valid data window for anomaly detection
 * Features:
 * - Debounce: Require N consecutive samples of RPM > 500 and VSW active
 * - Grace period: Skip first N seconds after start for crank transients
 * - Stale detection: Skip gaps larger than threshold
 * @returns {Object} { validStartIndex, validEndIndex, validData, graceEndIndex }
 */
function getValidDataWindow(data) {
  let validStartIndex = -1;
  let graceEndIndex = -1;
  let validEndIndex = data.length - 1;
  let consecutiveValidCount = 0;
  let engineStarted = false;
  let startTime = null;

  for (let i = 0; i < data.length; i++) {
    const rpm = data[i].rpm ?? data[i].RPM ?? 0;
    const vsw = data[i].Vsw || 0;
    const time = data[i].Time;

    // Check if current sample meets validity criteria
    const isValidSample = rpm >= VALIDITY_CONFIG.RPM_THRESHOLD && vsw >= VALIDITY_CONFIG.VSW_THRESHOLD;

    if (isValidSample) {
      consecutiveValidCount++;

      // Engine start: Require N consecutive valid samples (debounce)
      if (!engineStarted && consecutiveValidCount >= VALIDITY_CONFIG.DEBOUNCE_SAMPLES) {
        engineStarted = true;
        validStartIndex = i - VALIDITY_CONFIG.DEBOUNCE_SAMPLES + 1;
        startTime = data[validStartIndex].Time;

        // Calculate grace period end index (for crank transients)
        const graceEndTime = startTime + VALIDITY_CONFIG.CRANK_GRACE_SECONDS;
        for (let j = validStartIndex; j < data.length; j++) {
          if (data[j].Time >= graceEndTime) {
            graceEndIndex = j;
            break;
          }
        }
        if (graceEndIndex === -1) graceEndIndex = validStartIndex;
      }
    } else {
      consecutiveValidCount = 0;
    }

    // VSW drop indicates shutdown - data after this is invalid
    if (engineStarted && vsw < VALIDITY_CONFIG.VSW_THRESHOLD && i > validStartIndex + 10) {
      validEndIndex = i;
      break;
    }
  }

  // If engine never started, return empty window
  if (validStartIndex === -1) {
    return { validStartIndex: 0, validEndIndex: 0, validData: [], graceEndIndex: 0 };
  }

  const validData = data.slice(validStartIndex, validEndIndex + 1);
  return { validStartIndex, validEndIndex, validData, graceEndIndex };
}

/**
 * Check for stale/missing values in data
 * @returns {Object} { isStale, gapSeconds, lastValidTime }
 */
function checkDataStaleness(data, channelName) {
  let maxGap = 0;
  let staleCount = 0;

  for (let i = 1; i < data.length; i++) {
    const val = data[i][channelName];
    const prevVal = data[i - 1][channelName];
    const dt = data[i].Time - data[i - 1].Time;

    // Check for stale (large time gap)
    if (dt > VALIDITY_CONFIG.STALE_THRESHOLD_SECONDS) {
      maxGap = Math.max(maxGap, dt);
      staleCount++;
    }

    // Check for null/NaN
    if (val === undefined || val === null || isNaN(val)) {
      staleCount++;
    }
  }

  return {
    isStale: staleCount > 0,
    maxGap,
    staleCount,
    stalePct: (staleCount / data.length) * 100
  };
}

/**
 * Detect alerts and warnings based on thresholds
 * Features:
 * - Valid window with debounce
 * - Grace period for crank transients
 * - Hysteresis for alarm trigger/clear
 * - Stale data detection
 */
function detectAlerts(data, channelStats) {
  const alerts = [];

  // Get the valid data window for anomaly detection
  const { validData, validStartIndex, validEndIndex, graceEndIndex } = getValidDataWindow(data);

  // If no valid running window, return no alerts
  if (validData.length === 0) {
    return alerts;
  }

  // Data after grace period (skip crank transients)
  const graceOffset = graceEndIndex > validStartIndex ? graceEndIndex - validStartIndex : 0;
  const dataAfterGrace = validData.slice(graceOffset);

  if (dataAfterGrace.length === 0) {
    return alerts;
  }

  // Check battery voltage - ONLY within valid running window, after grace period
  // Uses hysteresis: trigger at 10.5V, clear at 11.0V (critical)
  if (channelStats.Vbat) {
    const vBatValues = dataAfterGrace.map(row => row.Vbat || 0).filter(v => v > 0);

    if (vBatValues.length > 0) {
      const minVbat = Math.min(...vBatValues);

      // Use hysteresis thresholds
      if (minVbat < ALARM_HYSTERESIS.battery.critical.trigger) {
        alerts.push({
          severity: 'critical',
          channel: 'Vbat',
          message: `Battery voltage dropped critically low during engine run: ${minVbat.toFixed(1)}V`,
          threshold: ALARM_HYSTERESIS.battery.critical.trigger,
          minValue: minVbat
        });
      } else if (minVbat < ALARM_HYSTERESIS.battery.warning.trigger) {
        alerts.push({
          severity: 'warning',
          channel: 'Vbat',
          message: `Battery voltage dropped below normal during engine run: ${minVbat.toFixed(1)}V`,
          threshold: ALARM_HYSTERESIS.battery.warning.trigger,
          minValue: minVbat
        });
      }
    }
  }

  // Check for active DTC (MILout_mirror = 1 means active DTC)
  const dtcActiveData = validData.filter(row => row.MILout_mirror === 1);
  if (dtcActiveData.length > 0) {
    const dtcPercent = (dtcActiveData.length / validData.length) * 100;
    alerts.push({
      severity: 'warning',
      channel: 'MILout_mirror',
      message: `Active DTC detected for ${dtcPercent.toFixed(1)}% of engine run`,
      threshold: 0
    });
  }

  // Check coolant temperature - after grace period (skip crank transients)
  const ectValues = dataAfterGrace.map(row => row.ECT || 0).filter(v => v > 0);
  if (ectValues.length > 0) {
    const maxECT = Math.max(...ectValues);
    if (maxECT > BPLOT_THRESHOLDS.coolantTemp.critical_high) {
      alerts.push({
        severity: 'critical',
        channel: 'ECT',
        message: `Coolant temperature exceeded critical limit: ${maxECT.toFixed(1)}F`,
        threshold: BPLOT_THRESHOLDS.coolantTemp.critical_high
      });
    } else if (maxECT > BPLOT_THRESHOLDS.coolantTemp.warning_high) {
      alerts.push({
        severity: 'warning',
        channel: 'ECT',
        message: `Coolant temperature exceeded warning limit: ${maxECT.toFixed(1)}F`,
        threshold: BPLOT_THRESHOLDS.coolantTemp.warning_high
      });
    }
  }

  // Check oil pressure - after grace period when engine is running
  const oilpValues = dataAfterGrace
    .filter(row => ((row.rpm ?? row.RPM ?? 0)) > 500)
    .map(row => row.OILP_press || 0)
    .filter(v => v > 0);

  if (oilpValues.length > 0) {
    const minOilp = Math.min(...oilpValues);
    if (minOilp < BPLOT_THRESHOLDS.oilPressure.critical_low) {
      alerts.push({
        severity: 'critical',
        channel: 'OILP_press',
        message: `Oil pressure dropped critically low during engine run: ${minOilp.toFixed(1)} psi`,
        threshold: BPLOT_THRESHOLDS.oilPressure.critical_low
      });
    } else if (minOilp < BPLOT_THRESHOLDS.oilPressure.warning_low) {
      alerts.push({
        severity: 'warning',
        channel: 'OILP_press',
        message: `Oil pressure dropped below normal during engine run: ${minOilp.toFixed(1)} psi`,
        threshold: BPLOT_THRESHOLDS.oilPressure.warning_low
      });
    }
  }

  // Check for knock retard - after grace period
  const knockData = dataAfterGrace.filter(row => (row.KNK_retard || 0) > 0);
  if (knockData.length > 0) {
    const maxKnock = Math.max(...knockData.map(r => r.KNK_retard));
    const knockPercent = (knockData.length / dataAfterGrace.length) * 100;

    if (knockPercent > 5 || maxKnock > 10) {
      alerts.push({
        severity: 'warning',
        channel: 'KNK_retard',
        message: `Knock detected: ${knockPercent.toFixed(1)}% of engine run, max retard ${maxKnock.toFixed(1)}deg`,
        threshold: 5
      });
    }
  }

  // Check RPM exceeded limits - after grace period
  const rpmValues = dataAfterGrace.map(row => row.rpm ?? row.RPM ?? 0);
  if (rpmValues.length > 0) {
    const maxRPM = Math.max(...rpmValues);
    if (maxRPM > BPLOT_THRESHOLDS.rpm.warning_high) {
      alerts.push({
        severity: 'warning',
        channel: 'rpm',
        message: `RPM exceeded warning limit: ${maxRPM.toFixed(0)} RPM`,
        threshold: BPLOT_THRESHOLDS.rpm.warning_high
      });
    }
  }

  return alerts;
}

/**
 * Generate summary text for the analysis
 * Uses formatDuration to show seconds when < 1 minute
 */
function generateSummary(timeInfo, engineEvents, operatingStats, alerts) {
  const summary = {
    // Use formatDuration for proper time display (seconds if < 1 min)
    duration: timeInfo ? formatDuration(timeInfo.duration) : 'Unknown',
    durationSeconds: timeInfo ? timeInfo.duration : 0,
    sampleRate: timeInfo ? `${timeInfo.sampleRate} Hz` : 'Unknown',
    engineStarts: engineEvents.filter(e => e.type === 'start').length,
    engineStops: engineEvents.filter(e => e.type === 'stop').length,
    // Use formatRuntime for engine runtime (seconds if < 60s, else X.X minutes)
    totalRuntime: formatRuntime(operatingStats.totalRuntime),
    totalRuntimeSeconds: operatingStats.totalRuntime,
    idlePercent: operatingStats.totalRuntime > 0
      ? `${((operatingStats.idleTime / operatingStats.totalRuntime) * 100).toFixed(1)}%`
      : 'N/A',
    avgRPM: operatingStats.avgRPM != null ? operatingStats.avgRPM.toFixed(0) : 'N/A',
    maxRPM: operatingStats.maxRPM != null ? operatingStats.maxRPM.toFixed(0) : 'N/A',
    // Display as MAP value (psia) when RPM > 900, not as percentage
    avgLoad: operatingStats.avgMAP != null && operatingStats.avgMAP > 0 ? `${operatingStats.avgMAP.toFixed(1)} MAP` : 'N/A',
    avgMAP: operatingStats.avgMAP,
    criticalAlerts: alerts.filter(a => a.severity === 'critical').length,
    warnings: alerts.filter(a => a.severity === 'warning').length
  };

  return summary;
}

/**
 * Get chart data for a specific set of channels
 */
export function getChartData(data, channels, downsample = true) {
  const chartData = downsample ? downsampleData(data, 2000) : data;

  return chartData.map(row => {
    const point = { Time: row.Time };
    for (const channel of channels) {
      point[channel] = row[channel];
    }
    return point;
  });
}

/**
 * Get parameter info with units and description
 */
export function getParameterInfo(channelName) {
  return BPLOT_PARAMETERS[channelName] || {
    name: channelName,
    unit: '',
    description: channelName
  };
}

/**
 * Calculate health score based on alerts and operating conditions
 */
export function calculateHealthScore(alerts, operatingStats) {
  let score = 100;

  // Deduct for critical alerts
  score -= alerts.filter(a => a.severity === 'critical').length * 20;

  // Deduct for warnings
  score -= alerts.filter(a => a.severity === 'warning').length * 5;

  // Bonus for normal operation patterns
  if (operatingStats.avgRPM > 800 && operatingStats.avgRPM < 2500) {
    score += 5;
  }

  return Math.max(0, Math.min(100, score));
}
