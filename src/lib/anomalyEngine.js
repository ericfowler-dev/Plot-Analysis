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
 * Engine state predicates for use in conditions
 * These map to the engine state tracker's current state
 */
export const ENGINE_STATE_PREDICATES = {
  ENGINE_RUNNING: 'EngineRunning',
  ENGINE_STABLE: 'EngineStable',
  ENGINE_STARTING: 'EngineStarting',
  ENGINE_STOPPING: 'EngineStopping',
  KEY_ON: 'KeyOn',
  FUEL_ENABLED: 'FuelEnabled'
};

/**
 * List of all available engine state predicates for UI dropdowns
 */
export const ENGINE_STATE_PREDICATE_OPTIONS = [
  { key: 'EngineRunning', label: 'Engine Running', description: 'Engine RPM above running threshold' },
  { key: 'EngineStable', label: 'Engine Stable', description: 'Engine running in stable operation' },
  { key: 'EngineStarting', label: 'Engine Starting', description: 'Engine in cranking or warmup phase' },
  { key: 'EngineStopping', label: 'Engine Stopping', description: 'Engine shutting down' },
  { key: 'KeyOn', label: 'Key On', description: 'Ignition switch is on (Vsw > 1)' },
  { key: 'FuelEnabled', label: 'Fuel Enabled', description: 'Fuel system is active' }
];

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
  CUSTOM: 'custom',
  SIGNAL_QUALITY: 'signal_quality'
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
  // Try direct access first
  let value = row[condition.param];

  // If not found, try case-insensitive lookup
  if (value === undefined) {
    const paramLower = condition.param.toLowerCase();
    for (const key of Object.keys(row)) {
      if (key.toLowerCase() === paramLower) {
        value = row[key];
        break;
      }
    }
  }

  // Fall back to column map lookup
  if (value === undefined) {
    value = getParamValue(row, condition.param, columnMap);
  }

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
    this.rpmRunningThreshold = config.rpmRunningThreshold || 650;     // RPM to consider engine "running"
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
  // DEPRECATED: This function is no longer used - oil pressure thresholds
  // now come from user config (warning.min, critical.min)

  // Default pressure map if none provided
  const defaultMap = [
    { rpm: 0, pressure: 0 },
    { rpm: 600, pressure: 4 },
    { rpm: 1000, pressure: 8 },
    { rpm: 1500, pressure: 10 },
    { rpm: 2000, pressure: 10 },
    { rpm: 3000, pressure: 10 }
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
   * @deprecated This method uses dynamic RPM-based thresholds. Use checkOilPressure function instead.
   */
  check(pressure, minPressure, time) {
    // DEPRECATED: This method is no longer used - see checkOilPressure function

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
 * Rule timing tracker for managing persistence and delay timers for custom rules
 * Supports:
 * - Trigger persistence: condition must be true for X seconds before triggering
 * - Clear persistence: condition must be false for X seconds before clearing
 * - Start delay: skip evaluation for X seconds after engine starts
 * - Stop delay: skip evaluation for X seconds after engine stops
 * - Window evaluation: track occurrences within a rolling time window
 */
class RuleTimingTracker {
  constructor() {
    // Map of rule ID -> timing state
    this.ruleStates = new Map();
    // Track engine state transitions
    this.lastEngineStartTime = null;
    this.lastEngineStopTime = null;
    this.lastEngineState = ENGINE_STATE.OFF;
  }

  /**
   * Update engine state transition times
   */
  updateEngineState(engineState, time) {
    if (this.lastEngineState !== engineState.state) {
      // Detect state transitions
      if (engineState.state === ENGINE_STATE.RUNNING_STABLE ||
          engineState.state === ENGINE_STATE.RUNNING_UNSTABLE) {
        if (this.lastEngineState === ENGINE_STATE.OFF ||
            this.lastEngineState === ENGINE_STATE.CRANKING) {
          this.lastEngineStartTime = time;
        }
      } else if (engineState.state === ENGINE_STATE.STOPPING ||
                 engineState.state === ENGINE_STATE.OFF) {
        if (this.lastEngineState === ENGINE_STATE.RUNNING_STABLE ||
            this.lastEngineState === ENGINE_STATE.RUNNING_UNSTABLE) {
          this.lastEngineStopTime = time;
        }
      }
      this.lastEngineState = engineState.state;
    }
  }

  /**
   * Check if rule should be evaluated based on start/stop delays
   */
  shouldEvaluate(ruleId, rule, time) {
    const startDelaySec = rule.startDelaySec || 0;
    const stopDelaySec = rule.stopDelaySec || 0;

    // Check start delay
    if (startDelaySec > 0 && this.lastEngineStartTime !== null) {
      const timeSinceStart = time - this.lastEngineStartTime;
      if (timeSinceStart < startDelaySec) {
        return false;
      }
    }

    // Check stop delay
    if (stopDelaySec > 0 && this.lastEngineStopTime !== null) {
      const timeSinceStop = time - this.lastEngineStopTime;
      if (timeSinceStop < stopDelaySec) {
        return false;
      }
    }

    return true;
  }

  /**
   * Check if alert should trigger/clear based on persistence timers
   * Returns { shouldTrigger: boolean, shouldClear: boolean, isActive: boolean }
   */
  checkPersistence(ruleId, conditionMet, time, rule) {
    const triggerPersistenceSec = rule.triggerPersistenceSec || 0;
    const clearPersistenceSec = rule.clearPersistenceSec || 0;

    // Get or create state for this rule
    let state = this.ruleStates.get(ruleId);
    if (!state) {
      state = {
        isActive: false,
        conditionTrueSince: null,
        conditionFalseSince: null,
        windowHistory: [] // for windowed evaluation
      };
      this.ruleStates.set(ruleId, state);
    }

    // Track window history if windowSec is set
    if (rule.windowSec) {
      state.windowHistory.push({ time, met: conditionMet });
      // Remove entries outside the window
      const windowStart = time - rule.windowSec;
      state.windowHistory = state.windowHistory.filter(h => h.time >= windowStart);

      // For windowed evaluation, count total time condition was met in window
      const totalTimeMet = state.windowHistory.reduce((acc, h, i, arr) => {
        if (!h.met) return acc;
        const nextTime = i < arr.length - 1 ? arr[i + 1].time : time;
        return acc + (nextTime - h.time);
      }, 0);

      // Check if condition met for required time within window
      conditionMet = totalTimeMet >= (rule.triggerPersistenceSec || 0);
    }

    if (conditionMet) {
      state.conditionFalseSince = null;

      if (state.conditionTrueSince === null) {
        state.conditionTrueSince = time;
      }

      // Check trigger persistence
      if (!state.isActive) {
        const duration = time - state.conditionTrueSince;
        if (duration >= triggerPersistenceSec) {
          state.isActive = true;
          return { shouldTrigger: true, shouldClear: false, isActive: true };
        }
      }
    } else {
      state.conditionTrueSince = null;

      if (state.conditionFalseSince === null) {
        state.conditionFalseSince = time;
      }

      // Check clear persistence
      if (state.isActive) {
        const duration = time - state.conditionFalseSince;
        if (duration >= clearPersistenceSec) {
          state.isActive = false;
          return { shouldTrigger: false, shouldClear: true, isActive: false };
        }
      }
    }

    return {
      shouldTrigger: false,
      shouldClear: false,
      isActive: state.isActive
    };
  }

  /**
   * Force clear a rule's state
   */
  clearRule(ruleId) {
    this.ruleStates.delete(ruleId);
  }

  reset() {
    this.ruleStates.clear();
    this.lastEngineStartTime = null;
    this.lastEngineStopTime = null;
    this.lastEngineState = ENGINE_STATE.OFF;
  }
}

/**
 * Channel dropout tracker for detecting signal loss
 * Only detects dropouts (NaN/undefined values) during engine operation
 */
class ChannelDropoutTracker {
  constructor(channelName, config = {}) {
    this.channelName = channelName;
    this.dropoutGapSec = config.dropoutGapSec ?? 0.5;
    this.suppressAlerts = config.suppressAlerts ?? [];

    // Detection state
    this.dropoutStart = null;
    this.hasDropout = false;
  }

  /**
   * Check for dropout (NaN, null, undefined values)
   * @param {number|null|undefined} value - The current value
   * @param {number} time - Current timestamp in seconds
   * @param {boolean} engineRunning - Whether engine is currently running
   * @returns {Object|null} Dropout issue if detected, null otherwise
   */
  update(value, time, engineRunning) {
    // Only check during engine operation
    if (!engineRunning) {
      this.dropoutStart = null;
      this.hasDropout = false;
      return null;
    }

    // Check for dropout (NaN, null, undefined)
    const isDropout = value === undefined || value === null || Number.isNaN(value);

    if (isDropout) {
      if (this.dropoutStart === null) {
        this.dropoutStart = time;
      }
      const dropoutDuration = time - this.dropoutStart;

      if (dropoutDuration >= this.dropoutGapSec) {
        this.hasDropout = true;
        return {
          type: 'dropout',
          channel: this.channelName,
          duration: dropoutDuration
        };
      }
    } else {
      // Valid value - reset dropout tracking
      this.dropoutStart = null;
      this.hasDropout = false;
    }

    return null;
  }

  /**
   * Get the list of alert IDs that should be suppressed when dropout detected
   */
  getSuppressedAlerts() {
    if (this.hasDropout) {
      return this.suppressAlerts;
    }
    return [];
  }

  reset() {
    this.dropoutStart = null;
    this.hasDropout = false;
  }
}

/**
 * Signal dropout analyzer - coordinates per-channel dropout tracking
 * Only detects signal loss (NaN/null values) during engine operation
 */
class SignalQualityAnalyzer {
  constructor(config = {}) {
    this.enabled = config.enabled !== false;
    this.alertSeverity = config.alertSeverity ?? SEVERITY.INFO;
    this.suppressRelatedAlerts = config.suppressRelatedAlerts !== false;

    // Default dropout threshold
    this.defaultDropoutGapSec = config.defaults?.dropoutGapSec ?? 0.5;

    // Per-channel configuration
    this.channelConfigs = config.channels ?? {};

    // Channel trackers (created on demand)
    this.trackers = new Map();
  }

  /**
   * Get or create a tracker for a channel
   */
  getTracker(channelName) {
    if (!this.trackers.has(channelName)) {
      const channelConfig = this.channelConfigs[channelName] || {};

      // Skip if explicitly disabled
      if (channelConfig.enabled === false) {
        return null;
      }

      const config = {
        dropoutGapSec: channelConfig.dropoutGapSec ?? this.defaultDropoutGapSec,
        suppressAlerts: channelConfig.suppressAlerts ?? []
      };

      this.trackers.set(channelName, new ChannelDropoutTracker(channelName, config));
    }

    return this.trackers.get(channelName);
  }

  /**
   * Process a data row and return any dropout issues
   * @param {Object} row - Data row with channel values
   * @param {number} time - Current timestamp
   * @param {boolean} engineRunning - Whether engine is running
   * @returns {Object} { issues: Array, suppressedAlertIds: Set }
   */
  processRow(row, time, engineRunning) {
    if (!this.enabled) {
      return { issues: [], suppressedAlertIds: new Set() };
    }

    const allIssues = [];
    const suppressedAlertIds = new Set();

    // Check configured channels
    for (const channelName of Object.keys(this.channelConfigs)) {
      const tracker = this.getTracker(channelName);
      if (!tracker) continue;

      const value = row[channelName];
      const issue = tracker.update(value, time, engineRunning);

      if (issue) {
        allIssues.push(issue);
      }

      // Collect suppressed alerts
      if (this.suppressRelatedAlerts) {
        for (const alertId of tracker.getSuppressedAlerts()) {
          suppressedAlertIds.add(alertId);
        }
      }
    }

    return { issues: allIssues, suppressedAlertIds };
  }

  reset() {
    for (const tracker of this.trackers.values()) {
      tracker.reset();
    }
  }
}

/**
 * Evaluate an engine state predicate
 * @param {string} predicate - The predicate name (e.g., 'EngineRunning')
 * @param {Object} engineState - Current engine state from tracker
 * @param {Object} row - Current data row
 * @param {Object} columnMap - Column name mapping
 * @returns {boolean} True if predicate is satisfied
 */
function evaluateEngineStatePredicate(predicate, engineState, row, columnMap) {
  const state = engineState?.state || ENGINE_STATE.OFF;
  const vsw = row?.Vsw ?? row?.vsw ?? row?.VSW ?? 0;

  switch (predicate) {
    case ENGINE_STATE_PREDICATES.ENGINE_RUNNING:
    case 'EngineRunning':
      return state === ENGINE_STATE.RUNNING_UNSTABLE ||
             state === ENGINE_STATE.RUNNING_STABLE;

    case ENGINE_STATE_PREDICATES.ENGINE_STABLE:
    case 'EngineStable':
      return state === ENGINE_STATE.RUNNING_STABLE;

    case ENGINE_STATE_PREDICATES.ENGINE_STARTING:
    case 'EngineStarting':
      return state === ENGINE_STATE.CRANKING ||
             state === ENGINE_STATE.RUNNING_UNSTABLE;

    case ENGINE_STATE_PREDICATES.ENGINE_STOPPING:
    case 'EngineStopping':
      return state === ENGINE_STATE.STOPPING;

    case ENGINE_STATE_PREDICATES.KEY_ON:
    case 'KeyOn':
      return vsw > 1;

    case ENGINE_STATE_PREDICATES.FUEL_ENABLED:
    case 'FuelEnabled':
      // Check for fuel enable signal if available, otherwise infer from engine running
      const fuelEnable = row?.FUEL_ENABLE ?? row?.fuel_enable ?? row?.FuelEnable;
      if (fuelEnable !== undefined) {
        return fuelEnable > 0;
      }
      // Fallback: assume fuel enabled when engine is running
      return state === ENGINE_STATE.RUNNING_UNSTABLE ||
             state === ENGINE_STATE.RUNNING_STABLE;

    default:
      return false;
  }
}

/**
 * Check if a string is an engine state predicate
 */
function isEngineStatePredicate(param) {
  return ENGINE_STATE_PREDICATE_OPTIONS.some(opt => opt.key === param);
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
    minDuration = 0,  // minimum alert duration in seconds
    debug = false,    // when true, return debug traces for engine state/params
    debugParams = []  // additional param keys to capture in debug traces
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

  // Optional debug trace capture for troubleshooting engine state/inputs
  const debugTrace = debug ? [] : null;

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

  // Initialize rule timing tracker for custom rules with persistence/delay
  const ruleTimingTracker = new RuleTimingTracker();

  // Initialize signal quality analyzer for sensor fault detection
  const signalQualityConfig = thresholds.thresholds?.signalQuality || {};
  const signalQualityAnalyzer = new SignalQualityAnalyzer(signalQualityConfig);
  const signalQualitySeverity = signalQualityConfig.alertSeverity === 'warning'
    ? SEVERITY.WARNING
    : SEVERITY.INFO;

  // Track suppressed alerts due to signal quality issues (accumulated across all rows)
  const allSuppressedAlertIds = new Set();

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

    // Update rule timing tracker with engine state transitions
    ruleTimingTracker.updateEngineState(engineState, time);

    // Skip grace period
    if (i < graceSamples) continue;

    // Check for signal dropouts - only during engine operation
    if (signalQualityConfig.enabled !== false) {
      const suppressedThisRow = checkSignalQuality(
        row, time, signalQualityAnalyzer,
        alerts, alertStartTimes, alertValues,
        signalQualitySeverity, isRunning
      );
      // Accumulate suppressed alert IDs
      for (const alertId of suppressedThisRow) {
        allSuppressedAlertIds.add(alertId);
      }
    }

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

    // Run custom anomaly rules with timing and engine state support
    if (thresholds.anomalyRules && thresholds.anomalyRules.length > 0) {
      checkAnomalyRules(
        row, time, thresholds.anomalyRules, columnMap,
        alerts, alertStartTimes, alertValues, isRunning,
        engineState, ruleTimingTracker
      );
    }

    // Capture debug trace if enabled (lightweight subset to avoid bloat)
    if (debugTrace) {
      const base = {
        idx: i,
        time,
        engineState: engineState.state,
        rpm,
        vsw: row.Vsw ?? row.vsw ?? row.VSW,
        mfgDelta: row.MFG_DPPress ?? getParamValue(row, 'MFG_DPPress', columnMap),
        mfgUpstream: row.MFG_USPress ?? getParamValue(row, 'MFG_USPress', columnMap),
        mfgDownstream: row.MFG_DSPress ?? getParamValue(row, 'MFG_DSPress', columnMap),
        throttleActual: row.MFG_TPS_act_pct ?? getParamValue(row, 'MFG_TPS_act_pct', columnMap),
        throttleCommand: row.MFG_TPS_cmd_pct ?? getParamValue(row, 'MFG_TPS_cmd_pct', columnMap),
        engLoad: row.eng_load ?? getParamValue(row, 'eng_load', columnMap)
      };

      // Attach any caller-requested params
      if (Array.isArray(debugParams) && debugParams.length > 0) {
        for (const key of debugParams) {
          base[key] = row[key] ?? getParamValue(row, key, columnMap);
        }
      }

      debugTrace.push(base);
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
  // Also filter out alerts that should be suppressed due to signal quality issues
  const filteredAlerts = alerts.filter(a => {
    const requiredDuration = a.minDuration || minDuration;
    if ((a.duration || 0) < requiredDuration) return false;

    // Check if this alert should be suppressed due to signal quality
    if (signalQualityConfig.suppressRelatedAlerts && allSuppressedAlertIds.has(a.id)) {
      return false;
    }

    return true;
  });

  return {
    alerts: filteredAlerts,
    statistics,
    events,
    debugTrace
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
 * Uses user-configured thresholds with optional engine state gating.
 *
 * Key features:
 * - Uses configured Warning Min and Critical Min as the primary thresholds
 * - When RPM Dependent is enabled, only checks when engine is in RUNNING_STABLE state
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

  // Check engine state - only evaluate in RUNNING_STABLE state when RPM dependent
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

  // Get user-configured thresholds (these are the primary thresholds)
  const userWarningMin = config.warning?.min;
  const userCriticalMin = config.critical?.min;

  // Use user-configured thresholds directly
  // These are the values set in the UI (Warning Min, Critical Min)
  const warningThreshold = userWarningMin !== undefined ? userWarningMin : 20;
  const criticalThreshold = userCriticalMin !== undefined ? userCriticalMin : 10;

  // Simple threshold comparison using user-configured values
  // Critical low
  if (filteredPressure < criticalThreshold) {
    if (!startTimes.has('oil_pressure_critical_low')) {
      handleAlertState('oil_pressure_critical_low', true, time, filteredPressure, alerts, startTimes, values, {
        name: 'Critical Low Oil Pressure',
        severity: SEVERITY.CRITICAL,
        category: CATEGORIES.PRESSURE,
        threshold: criticalThreshold,
        unit: 'psi'
      });
    }
  } else if (startTimes.has('oil_pressure_critical_low')) {
    handleAlertState('oil_pressure_critical_low', false, time, filteredPressure, alerts, startTimes, values, {});
  }

  // Warning low (only if not already critical)
  if (filteredPressure < warningThreshold && filteredPressure >= criticalThreshold) {
    if (!startTimes.has('oil_pressure_warning_low')) {
      handleAlertState('oil_pressure_warning_low', true, time, filteredPressure, alerts, startTimes, values, {
        name: 'Low Oil Pressure',
        severity: SEVERITY.WARNING,
        category: CATEGORIES.PRESSURE,
        threshold: warningThreshold,
        unit: 'psi'
      });
    }
  } else if (startTimes.has('oil_pressure_warning_low')) {
    handleAlertState('oil_pressure_warning_low', false, time, filteredPressure, alerts, startTimes, values, {});
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
 * Supports both signal comparisons and engine state predicates
 *
 * @param {Object} condition - Condition to evaluate { param, operator, value }
 * @param {Object} row - Current data row
 * @param {Object} columnMap - Column name mapping
 * @param {Object} engineState - Current engine state (optional, for predicates)
 * @returns {boolean} True if condition is met
 */
function evaluateRuleCondition(condition, row, columnMap, engineState = null) {
  // Check if this is an engine state predicate
  if (isEngineStatePredicate(condition.param)) {
    const predicateResult = evaluateEngineStatePredicate(condition.param, engineState, row, columnMap);
    // For predicates, operator and value determine expected result
    // e.g., { param: 'EngineStable', operator: '==', value: 1 } means "when engine is stable"
    // e.g., { param: 'EngineStable', operator: '==', value: 0 } means "when engine is NOT stable"
    const expectedValue = condition.value === 1 || condition.value === true || condition.value === 'true';
    switch (condition.operator) {
      case '==': return predicateResult === expectedValue;
      case '!=': return predicateResult !== expectedValue;
      default: return predicateResult === expectedValue;
    }
  }

  // Standard signal comparison
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
 * Check custom anomaly rules with timing and engine state support
 *
 * Enhanced rule evaluation supporting:
 * - Engine state predicates (EngineRunning, EngineStable, etc.)
 * - Timing fields (triggerPersistenceSec, clearPersistenceSec, startDelaySec, stopDelaySec, windowSec)
 * - Require When / Ignore When blocks with engine state conditions
 *
 * @param {Object} row - Current data row
 * @param {number} time - Current time
 * @param {Array} rules - Array of anomaly rules to evaluate
 * @param {Object} columnMap - Column name mapping
 * @param {Array} alerts - Alerts array (mutated)
 * @param {Map} startTimes - Alert start times (mutated)
 * @param {Map} values - Alert values (mutated)
 * @param {boolean} isRunning - Whether engine is running
 * @param {Object} engineState - Current engine state from tracker
 * @param {RuleTimingTracker} ruleTimingTracker - Timing tracker instance
 */
function checkAnomalyRules(row, time, rules, columnMap, alerts, startTimes, values, isRunning,
                           engineState = null, ruleTimingTracker = null) {
  for (const rule of rules) {
    if (!rule.enabled) continue;

    const alertId = `custom_${rule.id}`;

    // Check start/stop delays if timing tracker available
    if (ruleTimingTracker && !ruleTimingTracker.shouldEvaluate(alertId, rule, time)) {
      // In delay period - don't trigger new alerts, but don't close existing ones either
      continue;
    }

    // Check ignoreWhen conditions - if ANY is true, skip this rule
    if (Array.isArray(rule.ignoreWhen) && rule.ignoreWhen.length > 0) {
      const shouldIgnore = rule.ignoreWhen.some(condition =>
        evaluateRuleCondition(condition, row, columnMap, engineState)
      );
      if (shouldIgnore) {
        // Ignored - end any active alert
        if (startTimes.has(alertId)) {
          handleAlertState(alertId, false, time, null, alerts, startTimes, values, {});
          if (ruleTimingTracker) ruleTimingTracker.clearRule(alertId);
        }
        continue;
      }
    }

    // Check requireWhen conditions - ALL must be true for rule to apply
    if (Array.isArray(rule.requireWhen) && rule.requireWhen.length > 0) {
      const meetsRequirements = rule.requireWhen.every(condition =>
        evaluateRuleCondition(condition, row, columnMap, engineState)
      );
      if (!meetsRequirements) {
        // Requirements not met, end any active alert
        if (startTimes.has(alertId)) {
          handleAlertState(alertId, false, time, null, alerts, startTimes, values, {});
          if (ruleTimingTracker) ruleTimingTracker.clearRule(alertId);
        }
        continue;
      }
    }

    // Evaluate main conditions (supporting both signals and engine state predicates)
    const conditionResults = (rule.conditions || []).map(condition =>
      evaluateRuleCondition(condition, row, columnMap, engineState)
    );

    // Apply logic
    const conditionsMet = rule.logic === 'OR'
      ? conditionResults.some(r => r)
      : conditionResults.every(r => r);

    // Apply timing (persistence, windowing) if tracker available and timing fields are set
    const hasTiming = rule.triggerPersistenceSec || rule.clearPersistenceSec ||
                      rule.windowSec || rule.startDelaySec || rule.stopDelaySec;

    if (ruleTimingTracker && hasTiming) {
      const persistence = ruleTimingTracker.checkPersistence(alertId, conditionsMet, time, rule);

      if (persistence.shouldTrigger) {
        // Conditions met for required persistence - trigger alert
        handleAlertState(alertId, true, time, null, alerts, startTimes, values, {
          name: rule.name,
          description: rule.description,
          severity: rule.severity || SEVERITY.WARNING,
          category: rule.category || CATEGORIES.CUSTOM,
          ruleId: rule.id,
          minDuration: 0 // Persistence already applied
        });
      } else if (persistence.shouldClear) {
        // Conditions not met for clear persistence - clear alert
        handleAlertState(alertId, false, time, null, alerts, startTimes, values, {});
      }
      // If neither shouldTrigger nor shouldClear, maintain current state (handled by persistence tracker)

    } else {
      // No timing - use legacy immediate trigger/clear behavior
      if (conditionsMet) {
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
}

/**
 * Check for signal dropouts on configured channels
 * Called per-row from detectAnomalies(), follows same pattern as other check functions
 *
 * @param {Object} row - Current data row
 * @param {number} time - Current timestamp
 * @param {SignalQualityAnalyzer} analyzer - Signal quality analyzer instance
 * @param {Array} alerts - Alerts array (mutated)
 * @param {Map} startTimes - Alert start times (mutated)
 * @param {Map} values - Alert values (mutated)
 * @param {string} severity - Alert severity level
 * @param {boolean} engineRunning - Whether engine is currently running
 * @returns {Set} Set of alert IDs to suppress due to signal loss
 */
function checkSignalQuality(row, time, analyzer, alerts, startTimes, values, severity, engineRunning) {
  if (!analyzer || !analyzer.enabled) {
    return new Set();
  }

  const { issues, suppressedAlertIds } = analyzer.processRow(row, time, engineRunning);

  // Process dropout issues into alerts
  for (const issue of issues) {
    const alertId = `signal_dropout_${issue.channel}`;

    handleAlertState(alertId, true, time, null, alerts, startTimes, values, {
      name: `${issue.channel} signal lost`,
      description: `No valid data for ${issue.duration?.toFixed(1)}s while engine running - check sensor connection`,
      severity: severity,
      category: CATEGORIES.SIGNAL_QUALITY,
      channel: issue.channel,
      minDuration: 0
    });
  }

  // Close alerts for channels that no longer have dropouts
  for (const [alertId] of startTimes.entries()) {
    if (alertId.startsWith('signal_dropout_')) {
      const channel = alertId.replace('signal_dropout_', '');

      // Check if there's still a dropout for this channel
      const stillHasDropout = issues.some(i => i.channel === channel);

      if (!stillHasDropout) {
        handleAlertState(alertId, false, time, null, alerts, startTimes, values, {});
      }
    }
  }

  return suppressedAlertIds;
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

  if (alert.value != null && typeof alert.value === 'number' && alert.unit) {
    message += `: ${alert.value.toFixed(1)}${alert.unit}`;
  }

  if (alert.threshold !== undefined) {
    message += ` (threshold: ${alert.threshold}${alert.unit || ''})`;
  }

  if (alert.duration != null && typeof alert.duration === 'number') {
    message += ` for ${alert.duration.toFixed(1)}s`;
  }

  return message;
}
