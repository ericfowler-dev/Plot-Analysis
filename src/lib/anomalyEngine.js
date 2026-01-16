/**
 * Anomaly Detection Engine
 * Uses configurable threshold profiles to detect anomalies in engine data
 */

/**
 * Alert severity levels
 */
export const SEVERITY = {
  CRITICAL: 'critical',
  WARNING: 'warning',
  INFO: 'info'
};

/**
 * Alert categories
 */
export const CATEGORIES = {
  VOLTAGE: 'voltage',
  THERMAL: 'thermal',
  PRESSURE: 'pressure',
  FUEL: 'fuel',
  KNOCK: 'knock',
  FAULT: 'fault',
  CUSTOM: 'custom'
};

/**
 * Default parameter mappings (maps threshold keys to data column names)
 */
const DEFAULT_PARAM_MAPPINGS = {
  battery: ['Vbat', 'battery_voltage', 'VBAT', 'vbat'],
  coolantTemp: ['ECT', 'coolant_temp', 'engine_coolant_temp', 'ect'],
  oilPressure: ['OILP_press', 'oil_pressure', 'OIL_PRESS', 'oilp_press'],
  manifoldPressure: ['MAP', 'manifold_pressure', 'MANIFOLD_ABS_PRESS', 'map'],
  rpm: ['rpm', 'RPM', 'engine_speed', 'ENGINE_SPEED'],
  vsw: ['Vsw', 'VSW', 'vsw'],
  fuelTrimCL: ['CL_BM1', 'closed_loop_fuel', 'CL_FUEL_TRIM', 'cl_bm1'],
  fuelTrimAdaptive: ['A_BM1', 'adaptive_fuel', 'ADAPTIVE_FUEL_TRIM', 'a_bm1'],
  knock: ['KNK_retard', 'knock_retard', 'KNOCK_RETARD', 'knk_retard'],
  oilTemp: ['OILT', 'oil_temp', 'OIL_TEMP', 'oilt'],
  intakeAirTemp: ['IAT', 'intake_air_temp', 'INTAKE_AIR_TEMP', 'iat'],
  milStatus: ['MILout_mirror', 'MIL_status', 'mil_status', 'milout_mirror'],
  engineLoad: ['eng_load', 'engine_load', 'ENG_LOAD', 'load']
};

/**
 * Find the matching column name for a parameter in the data
 */
function findColumnName(data, paramKey, customMappings = {}) {
  const mappings = customMappings[paramKey] || DEFAULT_PARAM_MAPPINGS[paramKey] || [paramKey];

  if (!data || data.length === 0) return null;

  const firstRow = data[0];
  for (const mapping of mappings) {
    if (mapping in firstRow) {
      return mapping;
    }
  }
  return null;
}

/**
 * Get value from data row using parameter mapping
 */
function getParamValue(row, paramKey, columnMap) {
  const column = columnMap[paramKey];
  if (!column) return undefined;
  const value = row[column];
  return typeof value === 'number' ? value : parseFloat(value);
}

function evaluateCondition(condition, row, columnMap) {
  const value = row[condition.param] ?? getParamValue(row, condition.param, columnMap);
  if (value === undefined) return false;

  switch (condition.operator) {
    case '>': return value > condition.value;
    case '<': return value < condition.value;
    case '>=': return value >= condition.value;
    case '<=': return value <= condition.value;
    case '==': return value == condition.value;
    case '!=': return value != condition.value;
    default: return false;
  }
}

function shouldSkipThreshold(config, row, columnMap) {
  if (!config) return false;

  if (Array.isArray(config.ignoreWhen) && config.ignoreWhen.length > 0) {
    const shouldIgnore = config.ignoreWhen.some(condition => evaluateCondition(condition, row, columnMap));
    if (shouldIgnore) return true;
  }

  if (Array.isArray(config.requireWhen) && config.requireWhen.length > 0) {
    const meetsRequirements = config.requireWhen.every(condition => evaluateCondition(condition, row, columnMap));
    if (!meetsRequirements) return true;
  }

  return false;
}

/**
 * Create a column mapping for all parameters
 */
function createColumnMap(data, thresholds) {
  const columnMap = {};
  const metadata = thresholds?.metadata?.parameterMappings || {};

  // Map standard parameters
  for (const key of Object.keys(DEFAULT_PARAM_MAPPINGS)) {
    columnMap[key] = findColumnName(data, key, metadata);
  }

  // Also map any custom parameters used in anomaly rules
  if (data && data.length > 0) {
    const firstRow = data[0];
    for (const column of Object.keys(firstRow)) {
      // Direct column name mapping
      if (!(column in columnMap)) {
        columnMap[column] = column;
      }
    }
  }

  return columnMap;
}

/**
 * Check if engine is running (for context-aware checks)
 */
function isEngineRunning(row, columnMap) {
  const rpm = getParamValue(row, 'rpm', columnMap);
  const vsw = row.Vsw ?? row.vsw ?? row.VSW;
  return rpm > 400 && (vsw === undefined || vsw > 1);
}

/**
 * Engine state constants
 * Defines the states for engine operation lifecycle
 */
const ENGINE_STATE = {
  OFF: 'off',                     // Engine not running (RPM near 0)
  CRANKING: 'cranking',           // Engine cranking/starting (RPM rising but not yet stable)
  RUNNING_UNSTABLE: 'running_unstable', // Engine running but in warmup/stabilization period
  RUNNING_STABLE: 'running_stable',     // Engine running in stable operation - OK to check oil pressure
  STOPPING: 'stopping'            // Engine shutting down (RPM decreasing)
};

/**
 * Engine state tracker for detecting startup/shutdown transitions
 * This helps suppress false oil pressure warnings during normal engine transitions
 *
 * State transitions:
 * OFF -> CRANKING: RPM rises above cranking threshold
 * CRANKING -> RUNNING_UNSTABLE: RPM above running threshold for startHoldoffSeconds
 * RUNNING_UNSTABLE -> RUNNING_STABLE: RPM above stable threshold for stableHoldoffSeconds
 * RUNNING_STABLE -> STOPPING: RPM dropping rapidly or falls below running threshold
 * STOPPING -> OFF: RPM near zero for stopHoldoffSeconds
 * Any state -> OFF: RPM stays near zero
 */
class EngineStateTracker {
  constructor(config = {}) {
    // Configurable RPM thresholds
    this.rpmCrankingThreshold = config.rpmCrankingThreshold || 100;   // RPM to detect cranking
    this.rpmRunningThreshold = config.rpmRunningThreshold || 500;     // RPM to consider engine "running"
    this.rpmStableThreshold = config.rpmStableThreshold || 800;       // RPM for stable operation

    // Configurable timing thresholds (seconds)
    this.startHoldoffSeconds = config.startHoldoffSeconds || 3;       // Time after RPM > running before unstable
    this.stableHoldoffSeconds = config.stableHoldoffSeconds || 2;     // Time after RPM > stable before stable state
    this.stopHoldoffSeconds = config.stopHoldoffSeconds || 2;         // Time in stopping before OFF

    // RPM rate threshold for detecting shutdown
    this.shutdownRpmRate = config.shutdownRpmRate || -300;            // RPM/sec to detect rapid decel

    // State tracking
    this.state = ENGINE_STATE.OFF;
    this.stateStartTime = 0;
    this.lastRpm = 0;
    this.lastTime = 0;

    // RPM history for rate calculation and smoothing
    this.rpmHistory = [];
    this.historyWindowSize = 10; // samples for rate calculation

    // Track time above thresholds for state transitions
    this.timeAboveRunning = 0;
    this.timeAboveStable = 0;
    this.lastAboveRunningTime = null;
    this.lastAboveStableTime = null;
  }

  /**
   * Update engine state based on current RPM and time
   * Returns the current engine state and metadata
   */
  update(rpm, time) {
    // Track RPM history for rate calculation
    this.rpmHistory.push({ rpm, time });
    if (this.rpmHistory.length > this.historyWindowSize) {
      this.rpmHistory.shift();
    }

    // Calculate RPM rate of change (RPM/second)
    const rpmRate = this.calculateRpmRate();
    const smoothedRpm = this.getSmoothedRpm();

    const prevState = this.state;
    const timeDelta = this.lastTime > 0 ? time - this.lastTime : 0;

    // Track continuous time above thresholds
    if (smoothedRpm >= this.rpmRunningThreshold) {
      if (this.lastAboveRunningTime === null) {
        this.lastAboveRunningTime = time;
      }
      this.timeAboveRunning = time - this.lastAboveRunningTime;
    } else {
      this.lastAboveRunningTime = null;
      this.timeAboveRunning = 0;
    }

    if (smoothedRpm >= this.rpmStableThreshold) {
      if (this.lastAboveStableTime === null) {
        this.lastAboveStableTime = time;
      }
      this.timeAboveStable = time - this.lastAboveStableTime;
    } else {
      this.lastAboveStableTime = null;
      this.timeAboveStable = 0;
    }

    // State machine logic
    switch (this.state) {
      case ENGINE_STATE.OFF:
        if (smoothedRpm >= this.rpmCrankingThreshold) {
          this.state = ENGINE_STATE.CRANKING;
          this.stateStartTime = time;
        }
        break;

      case ENGINE_STATE.CRANKING:
        if (smoothedRpm < this.rpmCrankingThreshold) {
          // Cranking failed or stopped
          this.state = ENGINE_STATE.OFF;
          this.stateStartTime = time;
        } else if (this.timeAboveRunning >= this.startHoldoffSeconds) {
          // Engine has been above running threshold long enough
          this.state = ENGINE_STATE.RUNNING_UNSTABLE;
          this.stateStartTime = time;
        }
        break;

      case ENGINE_STATE.RUNNING_UNSTABLE:
        if (smoothedRpm < this.rpmCrankingThreshold) {
          // Engine stopped
          this.state = ENGINE_STATE.OFF;
          this.stateStartTime = time;
        } else if (smoothedRpm < this.rpmRunningThreshold) {
          // Engine slowing down
          this.state = ENGINE_STATE.STOPPING;
          this.stateStartTime = time;
        } else if (rpmRate < this.shutdownRpmRate) {
          // Rapid deceleration detected
          this.state = ENGINE_STATE.STOPPING;
          this.stateStartTime = time;
        } else if (this.timeAboveStable >= this.stableHoldoffSeconds) {
          // Engine has been stable long enough
          this.state = ENGINE_STATE.RUNNING_STABLE;
          this.stateStartTime = time;
        }
        break;

      case ENGINE_STATE.RUNNING_STABLE:
        if (smoothedRpm < this.rpmCrankingThreshold) {
          // Engine stopped suddenly
          this.state = ENGINE_STATE.OFF;
          this.stateStartTime = time;
        } else if (smoothedRpm < this.rpmRunningThreshold) {
          // RPM dropped below running threshold
          this.state = ENGINE_STATE.STOPPING;
          this.stateStartTime = time;
        } else if (rpmRate < this.shutdownRpmRate) {
          // Rapid deceleration - shutting down
          this.state = ENGINE_STATE.STOPPING;
          this.stateStartTime = time;
        }
        break;

      case ENGINE_STATE.STOPPING:
        if (smoothedRpm < this.rpmCrankingThreshold) {
          const timeInState = time - this.stateStartTime;
          if (timeInState >= this.stopHoldoffSeconds || smoothedRpm < 50) {
            // Engine has stopped
            this.state = ENGINE_STATE.OFF;
            this.stateStartTime = time;
          }
        } else if (smoothedRpm >= this.rpmRunningThreshold && rpmRate >= 0) {
          // RPM recovered - may have been a transient dip
          this.state = ENGINE_STATE.RUNNING_UNSTABLE;
          this.stateStartTime = time;
        }
        break;
    }

    this.lastRpm = rpm;
    this.lastTime = time;

    return {
      state: this.state,
      prevState,
      timeInState: time - this.stateStartTime,
      rpmRate,
      smoothedRpm,
      timeAboveRunning: this.timeAboveRunning,
      timeAboveStable: this.timeAboveStable,
      stateChanged: prevState !== this.state
    };
  }

  /**
   * Calculate RPM rate of change from history (RPM/second)
   */
  calculateRpmRate() {
    if (this.rpmHistory.length < 2) return 0;

    const oldest = this.rpmHistory[0];
    const newest = this.rpmHistory[this.rpmHistory.length - 1];
    const timeDiff = newest.time - oldest.time;

    if (timeDiff <= 0) return 0;

    return (newest.rpm - oldest.rpm) / timeDiff;
  }

  /**
   * Get smoothed RPM value (simple moving average)
   */
  getSmoothedRpm() {
    if (this.rpmHistory.length === 0) return 0;
    const sum = this.rpmHistory.reduce((acc, h) => acc + h.rpm, 0);
    return sum / this.rpmHistory.length;
  }

  /**
   * Check if oil pressure monitoring should be active
   * Returns true only when engine is in RUNNING_STABLE state
   */
  shouldCheckOilPressure() {
    return this.state === ENGINE_STATE.RUNNING_STABLE;
  }

  /**
   * Check if we're in a state where warnings should be suppressed
   * Returns true for OFF, CRANKING, and STOPPING states
   */
  shouldSuppressWarnings() {
    return this.state === ENGINE_STATE.OFF ||
           this.state === ENGINE_STATE.CRANKING ||
           this.state === ENGINE_STATE.STOPPING;
  }

  /**
   * Get the current state name for display
   */
  getStateName() {
    const names = {
      [ENGINE_STATE.OFF]: 'Off',
      [ENGINE_STATE.CRANKING]: 'Cranking',
      [ENGINE_STATE.RUNNING_UNSTABLE]: 'Running (Stabilizing)',
      [ENGINE_STATE.RUNNING_STABLE]: 'Running (Stable)',
      [ENGINE_STATE.STOPPING]: 'Stopping'
    };
    return names[this.state] || this.state;
  }

  /**
   * Reset tracker state
   */
  reset() {
    this.state = ENGINE_STATE.OFF;
    this.stateStartTime = 0;
    this.lastRpm = 0;
    this.lastTime = 0;
    this.rpmHistory = [];
    this.timeAboveRunning = 0;
    this.timeAboveStable = 0;
    this.lastAboveRunningTime = null;
    this.lastAboveStableTime = null;
  }
}

/**
 * Oil pressure signal filter - simple moving average for noise reduction
 */
class OilPressureFilter {
  constructor(windowMs = 500, sampleRate = 10) {
    this.windowSize = Math.max(1, Math.round((windowMs / 1000) * sampleRate));
    this.history = [];
  }

  /**
   * Add a pressure reading and return filtered value
   */
  filter(pressure) {
    this.history.push(pressure);
    if (this.history.length > this.windowSize) {
      this.history.shift();
    }
    // Return moving average
    const sum = this.history.reduce((acc, p) => acc + p, 0);
    return sum / this.history.length;
  }

  reset() {
    this.history = [];
  }
}

/**
 * Calculate minimum allowable oil pressure based on RPM
 * Uses a configurable piecewise linear map
 *
 * @param {number} rpm - Current engine RPM
 * @param {Array} pressureMap - Array of {rpm, pressure} points defining the curve
 * @returns {number} Minimum allowable oil pressure in psi
 */
function calculateMinOilPressure(rpm, pressureMap) {
  // Default pressure map if none provided
  const defaultMap = [
    { rpm: 0, pressure: 0 },
    { rpm: 600, pressure: 8 },
    { rpm: 1000, pressure: 15 },
    { rpm: 1500, pressure: 25 },
    { rpm: 2000, pressure: 35 },
    { rpm: 3000, pressure: 45 }
  ];

  const map = pressureMap && pressureMap.length >= 2 ? pressureMap : defaultMap;

  // Sort map by RPM
  const sortedMap = [...map].sort((a, b) => a.rpm - b.rpm);

  // Handle edge cases
  if (rpm <= sortedMap[0].rpm) return sortedMap[0].pressure;
  if (rpm >= sortedMap[sortedMap.length - 1].rpm) return sortedMap[sortedMap.length - 1].pressure;

  // Find the two points to interpolate between
  for (let i = 0; i < sortedMap.length - 1; i++) {
    if (rpm >= sortedMap[i].rpm && rpm <= sortedMap[i + 1].rpm) {
      const p1 = sortedMap[i];
      const p2 = sortedMap[i + 1];

      // Linear interpolation
      const ratio = (rpm - p1.rpm) / (p2.rpm - p1.rpm);
      return p1.pressure + ratio * (p2.pressure - p1.pressure);
    }
  }

  return 0;
}

/**
 * Oil pressure alert state tracker with persistence and hysteresis
 */
class OilPressureAlertTracker {
  constructor(config = {}) {
    // Persistence timers (seconds)
    this.warnPersistSeconds = config.warnPersistSeconds || 1.5;
    this.criticalPersistSeconds = config.criticalPersistSeconds || 0.5;
    this.clearPersistSeconds = config.clearPersistSeconds || 1.0;

    // Hysteresis offset (psi) - must recover above threshold + this value to clear
    this.hysteresisPsi = config.hysteresisPsi || 3;

    // Warning and critical offsets from RPM-based minimum
    this.warningOffsetPsi = config.warningOffsetPsi || 5;
    this.criticalOffsetPsi = config.criticalOffsetPsi || 0;

    // State tracking
    this.warningActive = false;
    this.criticalActive = false;
    this.belowWarningSince = null;
    this.belowCriticalSince = null;
    this.aboveWarningSince = null;
    this.aboveCriticalSince = null;
  }

  /**
   * Check oil pressure and return alert state
   * @param {number} pressure - Filtered oil pressure value
   * @param {number} minPressure - RPM-based minimum pressure
   * @param {number} time - Current time
   * @returns {Object} Alert state { warning: boolean, critical: boolean }
   */
  check(pressure, minPressure, time) {
    const warningThreshold = minPressure + this.warningOffsetPsi;
    const criticalThreshold = minPressure + this.criticalOffsetPsi;
    const warningClearThreshold = warningThreshold + this.hysteresisPsi;
    const criticalClearThreshold = criticalThreshold + this.hysteresisPsi;

    // Check warning state
    if (pressure < warningThreshold) {
      if (this.belowWarningSince === null) {
        this.belowWarningSince = time;
      }
      this.aboveWarningSince = null;

      // Activate warning if below threshold for persistence time
      if (!this.warningActive && (time - this.belowWarningSince) >= this.warnPersistSeconds) {
        this.warningActive = true;
      }
    } else if (pressure >= warningClearThreshold) {
      if (this.aboveWarningSince === null) {
        this.aboveWarningSince = time;
      }
      this.belowWarningSince = null;

      // Clear warning if above clear threshold for persistence time
      if (this.warningActive && (time - this.aboveWarningSince) >= this.clearPersistSeconds) {
        this.warningActive = false;
      }
    }

    // Check critical state
    if (pressure < criticalThreshold) {
      if (this.belowCriticalSince === null) {
        this.belowCriticalSince = time;
      }
      this.aboveCriticalSince = null;

      // Activate critical if below threshold for persistence time
      if (!this.criticalActive && (time - this.belowCriticalSince) >= this.criticalPersistSeconds) {
        this.criticalActive = true;
      }
    } else if (pressure >= criticalClearThreshold) {
      if (this.aboveCriticalSince === null) {
        this.aboveCriticalSince = time;
      }
      this.belowCriticalSince = null;

      // Clear critical if above clear threshold for persistence time
      if (this.criticalActive && (time - this.aboveCriticalSince) >= this.clearPersistSeconds) {
        this.criticalActive = false;
      }
    }

    return {
      warning: this.warningActive,
      critical: this.criticalActive,
      warningThreshold,
      criticalThreshold,
      minPressure
    };
  }

  /**
   * Force clear all alerts (used when engine state changes)
   */
  clearAll() {
    this.warningActive = false;
    this.criticalActive = false;
    this.belowWarningSince = null;
    this.belowCriticalSince = null;
    this.aboveWarningSince = null;
    this.aboveCriticalSince = null;
  }

  reset() {
    this.clearAll();
  }
}

/**
 * Hysteresis state tracker for alerts
 */
class HysteresisTracker {
  constructor() {
    this.states = new Map();
  }

  check(alertId, currentValue, triggerThreshold, clearThreshold, compareFn) {
    const wasActive = this.states.get(alertId) || false;

    if (wasActive) {
      // Already triggered - check if should clear
      const shouldClear = compareFn === 'min'
        ? currentValue > clearThreshold
        : currentValue < clearThreshold;
      if (shouldClear) {
        this.states.set(alertId, false);
        return false;
      }
      return true;
    } else {
      // Not triggered - check if should trigger
      const shouldTrigger = compareFn === 'min'
        ? currentValue < triggerThreshold
        : currentValue > triggerThreshold;
      if (shouldTrigger) {
        this.states.set(alertId, true);
        return true;
      }
      return false;
    }
  }

  reset() {
    this.states.clear();
  }
}

/**
 * Main anomaly detection function
 * Processes time-series data and returns detected anomalies
 *
 * @param {Array} data - Array of data rows with parameter values
 * @param {Object} thresholds - Resolved threshold profile with all values
 * @param {Object} options - Detection options
 * @returns {Object} Detection results with alerts and statistics
 */
export function detectAnomalies(data, thresholds, options = {}) {
  const {
    gracePeriod = 5, // seconds to ignore at start
    sampleRate = 1,  // samples per second (estimated if not provided)
    minDuration = 0  // minimum alert duration in seconds
  } = options;

  if (!data || data.length === 0) {
    return { alerts: [], statistics: {}, events: [] };
  }

  // Create column mapping
  const columnMap = createColumnMap(data, thresholds);

  // Initialize trackers
  const hysteresis = new HysteresisTracker();
  const alerts = [];
  const events = [];
  const statistics = {
    totalSamples: data.length,
    runningSamples: 0,
    alertCounts: {},
    engineStates: {
      [ENGINE_STATE.OFF]: 0,
      [ENGINE_STATE.CRANKING]: 0,
      [ENGINE_STATE.RUNNING_UNSTABLE]: 0,
      [ENGINE_STATE.RUNNING_STABLE]: 0,
      [ENGINE_STATE.STOPPING]: 0
    }
  };

  // Track alert durations
  const alertStartTimes = new Map();
  const alertValues = new Map();

  // Get oil pressure configuration
  const oilPressureConfig = thresholds.thresholds?.oilPressure || {};

  // Initialize engine state tracker for oil pressure monitoring
  const engineStateTracker = new EngineStateTracker({
    rpmCrankingThreshold: oilPressureConfig.rpmCrankingThreshold || 100,
    rpmRunningThreshold: oilPressureConfig.rpmThreshold || 500,
    rpmStableThreshold: oilPressureConfig.rpmStableThreshold || 800,
    startHoldoffSeconds: oilPressureConfig.startHoldoffSeconds || 3,
    stableHoldoffSeconds: oilPressureConfig.stableHoldoffSeconds || 2,
    stopHoldoffSeconds: oilPressureConfig.stopHoldoffSeconds || 2,
    shutdownRpmRate: oilPressureConfig.shutdownRpmRate || -300
  });

  // Estimate sample rate from time column if available
  let effectiveSampleRate = sampleRate;
  if (data.length > 1 && data[0].Time !== undefined) {
    const timeDiff = data[1].Time - data[0].Time;
    if (timeDiff > 0) {
      effectiveSampleRate = 1 / timeDiff;
    }
  }

  const graceSamples = Math.round(gracePeriod * effectiveSampleRate);

  // Initialize oil pressure filter for noise reduction
  const oilPressureFilter = new OilPressureFilter(
    oilPressureConfig.filterWindowMs || 500,
    effectiveSampleRate
  );

  // Initialize oil pressure alert tracker with persistence and hysteresis
  const oilPressureAlertTracker = new OilPressureAlertTracker({
    warnPersistSeconds: oilPressureConfig.warnPersistSeconds || 1.5,
    criticalPersistSeconds: oilPressureConfig.criticalPersistSeconds || 0.5,
    clearPersistSeconds: oilPressureConfig.clearPersistSeconds || 1.0,
    hysteresisPsi: oilPressureConfig.hysteresisPsi || 3,
    warningOffsetPsi: oilPressureConfig.warningOffsetPsi || 5,
    criticalOffsetPsi: oilPressureConfig.criticalOffsetPsi || 0
  });

  // Track previous engine state for clearing alerts on state change
  let prevEngineState = ENGINE_STATE.OFF;

  // Process each data row
  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    const time = row.Time ?? i / effectiveSampleRate;
    const isRunning = isEngineRunning(row, columnMap);

    if (isRunning) {
      statistics.runningSamples++;
    }

    // Update engine state tracker (needed for oil pressure monitoring)
    const rpm = getParamValue(row, 'rpm', columnMap) || 0;
    const engineState = engineStateTracker.update(rpm, time);
    statistics.engineStates[engineState.state]++;

    // Clear oil pressure alerts when transitioning out of RUNNING_STABLE
    if (prevEngineState === ENGINE_STATE.RUNNING_STABLE && engineState.state !== ENGINE_STATE.RUNNING_STABLE) {
      oilPressureAlertTracker.clearAll();
    }
    prevEngineState = engineState.state;

    // Skip grace period
    if (i < graceSamples) continue;

    // Run threshold checks
    if (thresholds.thresholds) {
      // Battery voltage check
      if (thresholds.thresholds.battery?.enabled !== false) {
        checkBatteryVoltage(row, time, thresholds.thresholds.battery, columnMap, hysteresis, alerts, alertStartTimes, alertValues);
      }

      // Coolant temperature check
      if (thresholds.thresholds.coolantTemp?.enabled !== false && isRunning) {
        checkCoolantTemp(row, time, thresholds.thresholds.coolantTemp, columnMap, alerts, alertStartTimes, alertValues, i, graceSamples, effectiveSampleRate);
      }

      // Oil pressure check - uses engine state tracker for startup/shutdown awareness
      // Only checks during RUNNING_STABLE state with RPM-based dynamic thresholds
      if (thresholds.thresholds.oilPressure?.enabled !== false) {
        checkOilPressure(
          row, time, thresholds.thresholds.oilPressure, columnMap,
          alerts, alertStartTimes, alertValues,
          engineStateTracker, oilPressureFilter, oilPressureAlertTracker, rpm
        );
      }

      // RPM check
      if (thresholds.thresholds.rpm?.enabled !== false && isRunning) {
        checkRPM(row, time, thresholds.thresholds.rpm, columnMap, alerts, alertStartTimes, alertValues);
      }

      // Fuel trim check
      if (thresholds.thresholds.fuelTrim?.enabled !== false && isRunning) {
        checkFuelTrim(row, time, thresholds.thresholds.fuelTrim, columnMap, alerts, alertStartTimes, alertValues);
      }

      // Knock check
      if (thresholds.thresholds.knock?.enabled !== false && isRunning) {
        checkKnock(row, time, thresholds.thresholds.knock, columnMap, alerts, alertStartTimes, alertValues);
      }
    }

    // Run custom anomaly rules
    if (thresholds.anomalyRules && thresholds.anomalyRules.length > 0) {
      checkAnomalyRules(row, time, thresholds.anomalyRules, columnMap, alerts, alertStartTimes, alertValues, isRunning);
    }
  }

  // Finalize any open alerts
  const lastTime = data[data.length - 1]?.Time ?? data.length / effectiveSampleRate;
  for (const [alertId, startTime] of alertStartTimes.entries()) {
    const existingAlert = alerts.find(a => a.id === alertId && !a.endTime);
    if (existingAlert) {
      existingAlert.endTime = lastTime;
      existingAlert.duration = lastTime - existingAlert.startTime;
    }
  }

  // Calculate alert statistics
  for (const alert of alerts) {
    const key = `${alert.category}_${alert.severity}`;
    statistics.alertCounts[key] = (statistics.alertCounts[key] || 0) + 1;
  }

  // Filter alerts by minimum duration (use per-alert minDuration if set, otherwise global)
  const filteredAlerts = alerts.filter(a => {
    const requiredDuration = a.minDuration || minDuration;
    return (a.duration || 0) >= requiredDuration;
  });

  return {
    alerts: filteredAlerts,
    statistics,
    events
  };
}

/**
 * Battery voltage threshold check
 */
function checkBatteryVoltage(row, time, config, columnMap, hysteresis, alerts, startTimes, values) {
  if (shouldSkipThreshold(config, row, columnMap)) return;
  const voltage = getParamValue(row, 'battery', columnMap);
  if (voltage === undefined || isNaN(voltage)) return;

  // Critical low
  if (config.critical?.min) {
    const alertId = 'battery_critical_low';
    const clearThreshold = config.hysteresis?.lowClear || (config.critical.min + 1);
    const isActive = hysteresis.check(alertId, voltage, config.critical.min, clearThreshold, 'min');

    handleAlertState(alertId, isActive, time, voltage, alerts, startTimes, values, {
      name: 'Critical Low Battery Voltage',
      severity: SEVERITY.CRITICAL,
      category: CATEGORIES.VOLTAGE,
      threshold: config.critical.min,
      unit: 'V'
    });
  }

  // Warning low
  if (config.warning?.min) {
    const alertId = 'battery_warning_low';
    const clearThreshold = config.hysteresis?.lowClear || (config.warning.min + 0.5);
    const isActive = hysteresis.check(alertId, voltage, config.warning.min, clearThreshold, 'min');

    handleAlertState(alertId, isActive, time, voltage, alerts, startTimes, values, {
      name: 'Low Battery Voltage',
      severity: SEVERITY.WARNING,
      category: CATEGORIES.VOLTAGE,
      threshold: config.warning.min,
      unit: 'V'
    });
  }

  // Critical high
  if (config.critical?.max) {
    const alertId = 'battery_critical_high';
    const clearThreshold = config.hysteresis?.highClear || (config.critical.max - 1);
    const isActive = hysteresis.check(alertId, voltage, config.critical.max, clearThreshold, 'max');

    handleAlertState(alertId, isActive, time, voltage, alerts, startTimes, values, {
      name: 'Critical High Battery Voltage',
      severity: SEVERITY.CRITICAL,
      category: CATEGORIES.VOLTAGE,
      threshold: config.critical.max,
      unit: 'V'
    });
  }
}

/**
 * Coolant temperature threshold check
 */
function checkCoolantTemp(row, time, config, columnMap, alerts, startTimes, values, sampleIdx, graceSamples, sampleRate) {
  if (shouldSkipThreshold(config, row, columnMap)) return;
  const temp = getParamValue(row, 'coolantTemp', columnMap);
  if (temp === undefined || isNaN(temp)) return;

  // Check grace period for warmup
  const warmupGrace = config.gracePeriod || 60;
  const warmupSamples = graceSamples + Math.round(warmupGrace * sampleRate);
  if (sampleIdx < warmupSamples) return;

  // Critical high
  if (config.critical?.max && temp > config.critical.max) {
    const alertId = 'coolant_critical_high';
    handleAlertState(alertId, true, time, temp, alerts, startTimes, values, {
      name: 'Critical High Coolant Temperature',
      severity: SEVERITY.CRITICAL,
      category: CATEGORIES.THERMAL,
      threshold: config.critical.max,
      unit: '°F'
    });
  } else if (startTimes.has('coolant_critical_high')) {
    handleAlertState('coolant_critical_high', false, time, temp, alerts, startTimes, values, {});
  }

  // Warning high
  if (config.warning?.max && temp > config.warning.max) {
    const alertId = 'coolant_warning_high';
    handleAlertState(alertId, true, time, temp, alerts, startTimes, values, {
      name: 'High Coolant Temperature',
      severity: SEVERITY.WARNING,
      category: CATEGORIES.THERMAL,
      threshold: config.warning.max,
      unit: '°F'
    });
  } else if (startTimes.has('coolant_warning_high')) {
    handleAlertState('coolant_warning_high', false, time, temp, alerts, startTimes, values, {});
  }
}

/**
 * Oil pressure threshold check
 * Uses comprehensive engine state tracking, RPM-based dynamic thresholds,
 * signal filtering, and persistence/hysteresis to eliminate false warnings
 * during normal startup and shutdown sequences.
 *
 * Key features:
 * - Only evaluates warnings when engine is in RUNNING_STABLE state
 * - Calculates minimum allowable pressure based on current RPM
 * - Filters oil pressure signal to reduce noise
 * - Requires persistence time before triggering/clearing alerts
 * - Uses hysteresis to prevent alert chatter
 */
function checkOilPressure(row, time, config, columnMap, alerts, startTimes, values,
                          engineStateTracker, oilPressureFilter, oilPressureAlertTracker, rpm) {
  if (shouldSkipThreshold(config, row, columnMap)) return;

  const rawPressure = getParamValue(row, 'oilPressure', columnMap);
  if (rawPressure === undefined || isNaN(rawPressure)) return;

  // Apply low-pass filter to reduce noise (if filter available)
  const filteredPressure = oilPressureFilter ? oilPressureFilter.filter(rawPressure) : rawPressure;

  // Check engine state - only evaluate in RUNNING_STABLE state
  if (engineStateTracker && config.rpmDependent !== false) {
    if (!engineStateTracker.shouldCheckOilPressure()) {
      // Not in stable running state - close any open alerts and return
      // This suppresses false warnings during startup, shutdown, and cranking
      if (startTimes.has('oil_pressure_critical_low')) {
        handleAlertState('oil_pressure_critical_low', false, time, filteredPressure, alerts, startTimes, values, {});
      }
      if (startTimes.has('oil_pressure_warning_low')) {
        handleAlertState('oil_pressure_warning_low', false, time, filteredPressure, alerts, startTimes, values, {});
      }
      return;
    }
  }

  // Calculate RPM-based minimum oil pressure threshold
  // This makes thresholds dynamic based on engine speed
  const rpmValue = rpm !== undefined ? rpm : (getParamValue(row, 'rpm', columnMap) || 0);
  const minPressure = config.useDynamicThreshold !== false
    ? calculateMinOilPressure(rpmValue, config.pressureMap)
    : 0;

  // Use the alert tracker for persistence and hysteresis (if available)
  if (oilPressureAlertTracker && config.usePersistence !== false) {
    const alertState = oilPressureAlertTracker.check(filteredPressure, minPressure, time);

    // Handle critical alert
    if (alertState.critical) {
      if (!startTimes.has('oil_pressure_critical_low')) {
        handleAlertState('oil_pressure_critical_low', true, time, filteredPressure, alerts, startTimes, values, {
          name: 'Critical Low Oil Pressure',
          severity: SEVERITY.CRITICAL,
          category: CATEGORIES.PRESSURE,
          threshold: alertState.criticalThreshold,
          unit: 'psi',
          minDuration: config.criticalPersistSeconds || 0.5
        });
      }
    } else if (startTimes.has('oil_pressure_critical_low')) {
      handleAlertState('oil_pressure_critical_low', false, time, filteredPressure, alerts, startTimes, values, {});
    }

    // Handle warning alert
    if (alertState.warning && !alertState.critical) {
      if (!startTimes.has('oil_pressure_warning_low')) {
        handleAlertState('oil_pressure_warning_low', true, time, filteredPressure, alerts, startTimes, values, {
          name: 'Low Oil Pressure',
          severity: SEVERITY.WARNING,
          category: CATEGORIES.PRESSURE,
          threshold: alertState.warningThreshold,
          unit: 'psi',
          minDuration: config.warnPersistSeconds || 1.5
        });
      }
    } else if (startTimes.has('oil_pressure_warning_low') && !alertState.warning) {
      handleAlertState('oil_pressure_warning_low', false, time, filteredPressure, alerts, startTimes, values, {});
    }
  } else {
    // Fallback to static threshold checks (legacy behavior)
    // Still uses engine state gating but with fixed thresholds

    // Critical low - use dynamic threshold if available, otherwise config value
    const criticalThreshold = config.useDynamicThreshold !== false
      ? minPressure + (config.criticalOffsetPsi || 0)
      : (config.critical?.min || 10);

    if (filteredPressure < criticalThreshold) {
      const alertId = 'oil_pressure_critical_low';
      handleAlertState(alertId, true, time, filteredPressure, alerts, startTimes, values, {
        name: 'Critical Low Oil Pressure',
        severity: SEVERITY.CRITICAL,
        category: CATEGORIES.PRESSURE,
        threshold: criticalThreshold,
        unit: 'psi'
      });
    } else if (startTimes.has('oil_pressure_critical_low')) {
      handleAlertState('oil_pressure_critical_low', false, time, filteredPressure, alerts, startTimes, values, {});
    }

    // Warning low - use dynamic threshold if available, otherwise config value
    const warningThreshold = config.useDynamicThreshold !== false
      ? minPressure + (config.warningOffsetPsi || 5)
      : (config.warning?.min || 20);

    if (filteredPressure < warningThreshold) {
      const alertId = 'oil_pressure_warning_low';
      handleAlertState(alertId, true, time, filteredPressure, alerts, startTimes, values, {
        name: 'Low Oil Pressure',
        severity: SEVERITY.WARNING,
        category: CATEGORIES.PRESSURE,
        threshold: warningThreshold,
        unit: 'psi'
      });
    } else if (startTimes.has('oil_pressure_warning_low')) {
      handleAlertState('oil_pressure_warning_low', false, time, filteredPressure, alerts, startTimes, values, {});
    }
  }
}

/**
 * RPM threshold check
 */
function checkRPM(row, time, config, columnMap, alerts, startTimes, values) {
  if (shouldSkipThreshold(config, row, columnMap)) return;
  const rpm = getParamValue(row, 'rpm', columnMap);
  if (rpm === undefined || isNaN(rpm)) return;

  // Critical overspeed
  if (config.overspeed && rpm > config.overspeed) {
    const alertId = 'rpm_overspeed';
    handleAlertState(alertId, true, time, rpm, alerts, startTimes, values, {
      name: 'Engine Overspeed',
      severity: SEVERITY.CRITICAL,
      category: CATEGORIES.FAULT,
      threshold: config.overspeed,
      unit: 'RPM'
    });
  } else if (startTimes.has('rpm_overspeed')) {
    handleAlertState('rpm_overspeed', false, time, rpm, alerts, startTimes, values, {});
  }

  // Critical high
  if (config.critical?.max && rpm > config.critical.max) {
    const alertId = 'rpm_critical_high';
    handleAlertState(alertId, true, time, rpm, alerts, startTimes, values, {
      name: 'Critical High RPM',
      severity: SEVERITY.CRITICAL,
      category: CATEGORIES.FAULT,
      threshold: config.critical.max,
      unit: 'RPM'
    });
  } else if (startTimes.has('rpm_critical_high')) {
    handleAlertState('rpm_critical_high', false, time, rpm, alerts, startTimes, values, {});
  }

  // Warning high
  if (config.warning?.max && rpm > config.warning.max) {
    const alertId = 'rpm_warning_high';
    handleAlertState(alertId, true, time, rpm, alerts, startTimes, values, {
      name: 'High RPM',
      severity: SEVERITY.WARNING,
      category: CATEGORIES.FAULT,
      threshold: config.warning.max,
      unit: 'RPM'
    });
  } else if (startTimes.has('rpm_warning_high')) {
    handleAlertState('rpm_warning_high', false, time, rpm, alerts, startTimes, values, {});
  }
}

/**
 * Fuel trim threshold check
 */
function checkFuelTrim(row, time, config, columnMap, alerts, startTimes, values) {
  if (shouldSkipThreshold(config, row, columnMap)) return;
  const clTrim = getParamValue(row, 'fuelTrimCL', columnMap);
  const adaptTrim = getParamValue(row, 'fuelTrimAdaptive', columnMap);

  // Closed loop trim checks
  if (clTrim !== undefined && !isNaN(clTrim) && config.closedLoop) {
    // Critical lean
    if (config.closedLoop.critical?.max && clTrim > config.closedLoop.critical.max) {
      handleAlertState('fuel_cl_critical_lean', true, time, clTrim, alerts, startTimes, values, {
        name: 'Critical Lean Fuel Trim',
        severity: SEVERITY.CRITICAL,
        category: CATEGORIES.FUEL,
        threshold: config.closedLoop.critical.max,
        unit: '%'
      });
    } else if (startTimes.has('fuel_cl_critical_lean')) {
      handleAlertState('fuel_cl_critical_lean', false, time, clTrim, alerts, startTimes, values, {});
    }

    // Warning lean
    if (config.closedLoop.warning?.max && clTrim > config.closedLoop.warning.max) {
      handleAlertState('fuel_cl_warning_lean', true, time, clTrim, alerts, startTimes, values, {
        name: 'Lean Fuel Trim',
        severity: SEVERITY.WARNING,
        category: CATEGORIES.FUEL,
        threshold: config.closedLoop.warning.max,
        unit: '%'
      });
    } else if (startTimes.has('fuel_cl_warning_lean')) {
      handleAlertState('fuel_cl_warning_lean', false, time, clTrim, alerts, startTimes, values, {});
    }

    // Critical rich
    if (config.closedLoop.critical?.min && clTrim < config.closedLoop.critical.min) {
      handleAlertState('fuel_cl_critical_rich', true, time, clTrim, alerts, startTimes, values, {
        name: 'Critical Rich Fuel Trim',
        severity: SEVERITY.CRITICAL,
        category: CATEGORIES.FUEL,
        threshold: config.closedLoop.critical.min,
        unit: '%'
      });
    } else if (startTimes.has('fuel_cl_critical_rich')) {
      handleAlertState('fuel_cl_critical_rich', false, time, clTrim, alerts, startTimes, values, {});
    }

    // Warning rich
    if (config.closedLoop.warning?.min && clTrim < config.closedLoop.warning.min) {
      handleAlertState('fuel_cl_warning_rich', true, time, clTrim, alerts, startTimes, values, {
        name: 'Rich Fuel Trim',
        severity: SEVERITY.WARNING,
        category: CATEGORIES.FUEL,
        threshold: config.closedLoop.warning.min,
        unit: '%'
      });
    } else if (startTimes.has('fuel_cl_warning_rich')) {
      handleAlertState('fuel_cl_warning_rich', false, time, clTrim, alerts, startTimes, values, {});
    }
  }
}

/**
 * Knock detection check
 */
function checkKnock(row, time, config, columnMap, alerts, startTimes, values) {
  if (shouldSkipThreshold(config, row, columnMap)) return;
  const knockRetard = getParamValue(row, 'knock', columnMap);
  if (knockRetard === undefined || isNaN(knockRetard)) return;

  // Critical knock
  if (config.maxRetard?.critical && knockRetard > config.maxRetard.critical) {
    handleAlertState('knock_critical', true, time, knockRetard, alerts, startTimes, values, {
      name: 'Critical Knock Detected',
      severity: SEVERITY.CRITICAL,
      category: CATEGORIES.KNOCK,
      threshold: config.maxRetard.critical,
      unit: '°'
    });
  } else if (startTimes.has('knock_critical')) {
    handleAlertState('knock_critical', false, time, knockRetard, alerts, startTimes, values, {});
  }

  // Warning knock
  if (config.maxRetard?.warning && knockRetard > config.maxRetard.warning) {
    handleAlertState('knock_warning', true, time, knockRetard, alerts, startTimes, values, {
      name: 'Knock Detected',
      severity: SEVERITY.WARNING,
      category: CATEGORIES.KNOCK,
      threshold: config.maxRetard.warning,
      unit: '°'
    });
  } else if (startTimes.has('knock_warning')) {
    handleAlertState('knock_warning', false, time, knockRetard, alerts, startTimes, values, {});
  }
}

/**
 * Evaluate a single condition against a row
 */
function evaluateRuleCondition(condition, row, columnMap) {
  const value = row[condition.param] ?? getParamValue(row, condition.param, columnMap);
  if (value === undefined) return false;

  switch (condition.operator) {
    case '>': return value > condition.value;
    case '<': return value < condition.value;
    case '>=': return value >= condition.value;
    case '<=': return value <= condition.value;
    case '==': return value == condition.value;
    case '!=': return value != condition.value;
    default: return false;
  }
}

/**
 * Check custom anomaly rules
 */
function checkAnomalyRules(row, time, rules, columnMap, alerts, startTimes, values, isRunning) {
  for (const rule of rules) {
    if (!rule.enabled) continue;

    // Check requireWhen conditions first - ALL must be true for rule to apply
    if (Array.isArray(rule.requireWhen) && rule.requireWhen.length > 0) {
      const meetsRequirements = rule.requireWhen.every(condition =>
        evaluateRuleCondition(condition, row, columnMap)
      );
      if (!meetsRequirements) {
        // Requirements not met, end any active alert
        const alertId = `custom_${rule.id}`;
        if (startTimes.has(alertId)) {
          handleAlertState(alertId, false, time, null, alerts, startTimes, values, {});
        }
        continue;
      }
    }

    // Evaluate main conditions
    const conditionResults = (rule.conditions || []).map(condition =>
      evaluateRuleCondition(condition, row, columnMap)
    );

    // Apply logic
    const isTriggered = rule.logic === 'OR'
      ? conditionResults.some(r => r)
      : conditionResults.every(r => r);

    const alertId = `custom_${rule.id}`;

    if (isTriggered) {
      handleAlertState(alertId, true, time, null, alerts, startTimes, values, {
        name: rule.name,
        description: rule.description,
        severity: rule.severity || SEVERITY.WARNING,
        category: rule.category || CATEGORIES.CUSTOM,
        ruleId: rule.id,
        minDuration: rule.duration || 0
      });
    } else if (startTimes.has(alertId)) {
      handleAlertState(alertId, false, time, null, alerts, startTimes, values, {});
    }
  }
}

/**
 * Handle alert state transitions
 */
function handleAlertState(alertId, isActive, time, value, alerts, startTimes, values, config) {
  if (isActive) {
    if (!startTimes.has(alertId)) {
      // New alert
      startTimes.set(alertId, time);
      values.set(alertId, { min: value, max: value, sum: value, count: 1 });

      alerts.push({
        id: alertId,
        name: config.name,
        description: config.description,
        severity: config.severity,
        category: config.category,
        threshold: config.threshold,
        unit: config.unit,
        ruleId: config.ruleId,
        minDuration: config.minDuration || 0,
        startTime: time,
        endTime: null,
        duration: null,
        value: value,
        minValue: value,
        maxValue: value
      });
    } else {
      // Update existing alert
      const stats = values.get(alertId);
      if (value !== null) {
        stats.min = Math.min(stats.min, value);
        stats.max = Math.max(stats.max, value);
        stats.sum += value;
        stats.count++;
      }

      // Update the alert record
      const existingAlert = alerts.find(a => a.id === alertId && !a.endTime);
      if (existingAlert) {
        existingAlert.value = value;
        existingAlert.minValue = stats.min;
        existingAlert.maxValue = stats.max;
      }
    }
  } else {
    if (startTimes.has(alertId)) {
      // Close the alert
      const existingAlert = alerts.find(a => a.id === alertId && !a.endTime);
      if (existingAlert) {
        existingAlert.endTime = time;
        existingAlert.duration = time - existingAlert.startTime;
      }
      startTimes.delete(alertId);
      values.delete(alertId);
    }
  }
}

/**
 * Summarize alerts for display
 */
export function summarizeAlerts(alerts) {
  const summary = {
    critical: [],
    warning: [],
    info: [],
    totalDuration: {
      critical: 0,
      warning: 0
    }
  };

  for (const alert of alerts) {
    const bucket = summary[alert.severity] || summary.warning;
    bucket.push(alert);

    if (alert.duration) {
      summary.totalDuration[alert.severity] = (summary.totalDuration[alert.severity] || 0) + alert.duration;
    }
  }

  return summary;
}

/**
 * Format alert for display
 */
export function formatAlert(alert) {
  let message = alert.name;

  if (alert.value !== null && alert.unit) {
    message += `: ${alert.value.toFixed(1)}${alert.unit}`;
  }

  if (alert.threshold !== undefined) {
    message += ` (threshold: ${alert.threshold}${alert.unit || ''})`;
  }

  if (alert.duration) {
    message += ` for ${alert.duration.toFixed(1)}s`;
  }

  return message;
}
