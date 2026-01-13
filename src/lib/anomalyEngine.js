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
    alertCounts: {}
  };

  // Track alert durations
  const alertStartTimes = new Map();
  const alertValues = new Map();

  // Estimate sample rate from time column if available
  let effectiveSampleRate = sampleRate;
  if (data.length > 1 && data[0].Time !== undefined) {
    const timeDiff = data[1].Time - data[0].Time;
    if (timeDiff > 0) {
      effectiveSampleRate = 1 / timeDiff;
    }
  }

  const graceSamples = Math.round(gracePeriod * effectiveSampleRate);

  // Process each data row
  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    const time = row.Time ?? i / effectiveSampleRate;
    const isRunning = isEngineRunning(row, columnMap);

    if (isRunning) {
      statistics.runningSamples++;
    }

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

      // Oil pressure check
      if (thresholds.thresholds.oilPressure?.enabled !== false) {
        checkOilPressure(row, time, thresholds.thresholds.oilPressure, columnMap, alerts, alertStartTimes, alertValues);
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

  // Filter alerts by minimum duration
  const filteredAlerts = alerts.filter(a => (a.duration || 0) >= minDuration);

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
 */
function checkOilPressure(row, time, config, columnMap, alerts, startTimes, values) {
  const pressure = getParamValue(row, 'oilPressure', columnMap);
  const rpm = getParamValue(row, 'rpm', columnMap);
  if (pressure === undefined || isNaN(pressure)) return;

  // Only check when RPM above threshold
  const rpmThreshold = config.rpmThreshold || 500;
  if (config.rpmDependent && (rpm === undefined || rpm < rpmThreshold)) return;

  // Critical low
  if (config.critical?.min && pressure < config.critical.min) {
    const alertId = 'oil_pressure_critical_low';
    handleAlertState(alertId, true, time, pressure, alerts, startTimes, values, {
      name: 'Critical Low Oil Pressure',
      severity: SEVERITY.CRITICAL,
      category: CATEGORIES.PRESSURE,
      threshold: config.critical.min,
      unit: 'psi'
    });
  } else if (startTimes.has('oil_pressure_critical_low')) {
    handleAlertState('oil_pressure_critical_low', false, time, pressure, alerts, startTimes, values, {});
  }

  // Warning low
  if (config.warning?.min && pressure < config.warning.min) {
    const alertId = 'oil_pressure_warning_low';
    handleAlertState(alertId, true, time, pressure, alerts, startTimes, values, {
      name: 'Low Oil Pressure',
      severity: SEVERITY.WARNING,
      category: CATEGORIES.PRESSURE,
      threshold: config.warning.min,
      unit: 'psi'
    });
  } else if (startTimes.has('oil_pressure_warning_low')) {
    handleAlertState('oil_pressure_warning_low', false, time, pressure, alerts, startTimes, values, {});
  }
}

/**
 * RPM threshold check
 */
function checkRPM(row, time, config, columnMap, alerts, startTimes, values) {
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
 * Check custom anomaly rules
 */
function checkAnomalyRules(row, time, rules, columnMap, alerts, startTimes, values, isRunning) {
  for (const rule of rules) {
    if (!rule.enabled) continue;

    // Evaluate conditions
    const conditionResults = (rule.conditions || []).map(condition => {
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
    });

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
        ruleId: rule.id
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
