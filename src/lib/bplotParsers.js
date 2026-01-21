// =============================================================================
// B-PLOT DATA PARSERS - For time-series engine data from BPLT files
// =============================================================================

import {
  VALIDITY_POLICY,
  DEFAULT_VALIDITY_CONFIG,
  getChannelValidityPolicy
} from './bplotThresholds.js';

// =============================================================================
// VALIDITY MASK SYSTEM
// Determines which samples are valid for statistics and alerts per channel
// =============================================================================

/**
 * Engine state constants (must match anomalyEngine.js)
 */
const ENGINE_STATE = {
  OFF: 'off',
  CRANKING: 'cranking',
  RUNNING_UNSTABLE: 'running_unstable',
  RUNNING_STABLE: 'running_stable',
  STOPPING: 'stopping'
};

/**
 * Check if a sample is valid based on the validity policy
 *
 * @param {Object} row - The data row to check
 * @param {string} policy - The validity policy to apply
 * @param {Object} engineState - Engine state info for this sample (optional)
 * @param {Object} config - Validity configuration
 * @returns {boolean} True if the sample is valid for the given policy
 */
export function isSampleValid(row, policy, engineState = null, config = DEFAULT_VALIDITY_CONFIG) {
  const rpm = row.rpm ?? row.RPM ?? 0;
  const vsw = row.Vsw ?? row.vsw ?? row.VSW ?? 0;
  const fuelShutoff = row.fuel_shutoff_chk ?? 0;

  switch (policy) {
    case VALIDITY_POLICY.ALWAYS_VALID:
      return true;

    case VALIDITY_POLICY.VALID_WHEN_KEY_ON:
      return vsw >= config.vswThreshold;

    case VALIDITY_POLICY.VALID_WHEN_ENGINE_RUNNING:
      // Valid when RPM above running threshold OR engine state is running/unstable
      if (engineState) {
        return engineState === ENGINE_STATE.RUNNING_STABLE ||
               engineState === ENGINE_STATE.RUNNING_UNSTABLE;
      }
      return rpm >= config.rpmRunningThreshold;

    case VALIDITY_POLICY.VALID_WHEN_ENGINE_STABLE:
      // Valid only when engine is in stable running state
      if (engineState) {
        return engineState === ENGINE_STATE.RUNNING_STABLE;
      }
      // Fallback: RPM above stable threshold
      return rpm >= config.rpmStableThreshold;

    case VALIDITY_POLICY.VALID_WHEN_FUEL_ENABLED:
      // Valid when fuel shutoff is not active (0 = fuel enabled)
      return fuelShutoff === 0 && rpm >= config.rpmRunningThreshold;

    case VALIDITY_POLICY.VALID_WHEN_RPM_ABOVE:
      // Custom RPM threshold - requires config.customRpmThreshold
      const threshold = config.customRpmThreshold || config.rpmRunningThreshold;
      return rpm >= threshold;

    default:
      return true;
  }
}

/**
 * Check if a value passes additional validity filters
 *
 * @param {number} value - The value to check
 * @param {Object} policyConfig - Policy configuration with excludeNegative, excludeZero flags
 * @returns {boolean} True if the value passes filters
 */
export function isValueValid(value, policyConfig = {}) {
  if (isNaN(value)) return false;
  if (policyConfig.excludeNegative && value < 0) return false;
  if (policyConfig.excludeZero && value === 0) return false;
  return true;
}

/**
 * Generate engine state for each sample in the dataset
 * This is a simplified version - for full state tracking, use EngineStateTracker from anomalyEngine.js
 *
 * @param {Array} data - Array of data rows
 * @param {Object} config - Validity configuration
 * @returns {Array} Array of engine states corresponding to each data row
 */
export function generateEngineStates(data, config = DEFAULT_VALIDITY_CONFIG) {
  const states = [];
  let lastState = ENGINE_STATE.OFF;
  let stateStartTime = 0;
  let rpmHistory = [];
  const historySize = 5;

  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    const rpm = row.rpm ?? row.RPM ?? 0;
    const time = row.Time ?? i / 10;

    // Maintain RPM history for smoothing
    rpmHistory.push(rpm);
    if (rpmHistory.length > historySize) {
      rpmHistory.shift();
    }
    const smoothedRpm = rpmHistory.reduce((a, b) => a + b, 0) / rpmHistory.length;

    // Simple state machine
    let newState = lastState;

    switch (lastState) {
      case ENGINE_STATE.OFF:
        if (smoothedRpm >= 100) {
          newState = ENGINE_STATE.CRANKING;
          stateStartTime = time;
        }
        break;

      case ENGINE_STATE.CRANKING:
        if (smoothedRpm < 100) {
          newState = ENGINE_STATE.OFF;
          stateStartTime = time;
        } else if (smoothedRpm >= config.rpmRunningThreshold &&
                   (time - stateStartTime) >= config.startupGraceSeconds) {
          newState = ENGINE_STATE.RUNNING_UNSTABLE;
          stateStartTime = time;
        }
        break;

      case ENGINE_STATE.RUNNING_UNSTABLE:
        if (smoothedRpm < 100) {
          newState = ENGINE_STATE.OFF;
          stateStartTime = time;
        } else if (smoothedRpm < config.rpmRunningThreshold) {
          newState = ENGINE_STATE.STOPPING;
          stateStartTime = time;
        } else if (smoothedRpm >= config.rpmStableThreshold &&
                   (time - stateStartTime) >= 2) {
          newState = ENGINE_STATE.RUNNING_STABLE;
          stateStartTime = time;
        }
        break;

      case ENGINE_STATE.RUNNING_STABLE:
        if (smoothedRpm < 100) {
          newState = ENGINE_STATE.OFF;
          stateStartTime = time;
        } else if (smoothedRpm < config.rpmRunningThreshold) {
          newState = ENGINE_STATE.STOPPING;
          stateStartTime = time;
        }
        break;

      case ENGINE_STATE.STOPPING:
        if (smoothedRpm < 100) {
          newState = ENGINE_STATE.OFF;
          stateStartTime = time;
        } else if (smoothedRpm >= config.rpmRunningThreshold) {
          newState = ENGINE_STATE.RUNNING_UNSTABLE;
          stateStartTime = time;
        }
        break;
    }

    lastState = newState;
    states.push(newState);
  }

  return states;
}

/**
 * Parse B-Plot CSV content into structured data
 * @param {string} content - Raw CSV content
 * @returns {Object} Parsed B-Plot data with headers and time series
 */
export function parseBPlotData(content) {
  const lines = content.split('\n').filter(line => line.trim());

  if (lines.length < 2) {
    throw new Error('Invalid B-Plot CSV: insufficient data');
  }

  // Parse header row
  const rawHeaders = lines[0].split(',').map(h => h.trim());
  const headers = [];
  const seenHeaders = new Set();

  for (const header of rawHeaders) {
    const mapped = normalizeChannelName(header);
    const finalHeader = seenHeaders.has(mapped) ? header : mapped;
    headers.push(finalHeader);
    seenHeaders.add(finalHeader);
  }

  // Validate it's a B-Plot file (should have Time as first column)
  if (headers[0] !== 'Time') {
    throw new Error('Invalid B-Plot CSV: first column must be "Time"');
  }

  // Parse data rows
  const data = [];
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',');
    if (values.length !== headers.length) continue;

    const row = {};
    for (let j = 0; j < headers.length; j++) {
      const value = parseFloat(values[j]);
      row[headers[j]] = isNaN(value) ? 0 : value;
    }
    data.push(row);
  }

  // Extract channel info
  const channels = headers.slice(1).map(name => ({
    name,
    category: categorizeChannel(name)
  }));

  return {
    headers,
    channels,
    data,
    rowCount: data.length,
    columnCount: headers.length
  };
}

const CHANNEL_ALIASES = {
  rpm: 'rpm',
  engine_speed: 'rpm',
  fuel_control_mode: 'fuel_ctl_mode',
  fuel_type: 'fuel_type',
  mil_status: 'MILout_mirror',
  sync_state: 'sync_state',
  spark_shutoff: 'spark_shutoff_chk',
  battery_voltage: 'Vbat',
  vsw: 'Vsw',
  hour_meter: 'HM_RAM_seconds',
  hm_hours: 'HM_hours',
  hm_ram_starts: 'HM_RAM_starts',
  start_timer: 'start_tmr',
  governor_rpm_demand: 'rpmd_gov',
  remote_speed_tsc1: 'RMT_speed',
  tsc1_speed_command: 'RMT_speed',
  rmt_speed_sa: 'RMT_speed_SA',
  tps_command_pct: 'TPS_cmd_pct',
  tps_command: 'TPS_cmd_pct',
  tps_actual_pct: 'TPS_pct',
  tps_actual: 'TPS_pct',
  tps1_pct: 'TPS1_pct',
  tps2_pct: 'TPS2_pct',
  governor_switch_state: 'gov_sw_state',
  governor_type: 'gov_type',
  load_limit_max_tps: 'LoadLim_max_TPS',
  load_limit_max_pct: 'LoadLim_max_pct',
  gov_max_abs_limit: 'gov_max_abslimit',
  gov_min_abs_limit: 'gov_min_abslimit',
  adaptive_fuel_trim_al: 'A_BM1',
  adaptive_fuel_trim_bank_2: 'A_BM2',
  closed_loop_fuel_trim_cl: 'CL_BM1',
  closed_loop_fuel_trim_bank_2: 'CL_BM2',
  epr_command_pressure: 'EPR_cmd',
  epr_actual_pressure: 'EPR_actual',
  epr_duty_cycle: 'EPR_DC_act',
  fuel_shutoff_status: 'fuel_shutoff_chk',
  gasoline_fuel_pressure: 'FPin',
  average_pulse_width: 'PWe_avg',
  o2_sensor_pre_cat: 'EGO1_volts',
  o2_sensor_post_cat: 'EGO2_volts',
  ego3_volts: 'EGO3_volts',
  ego4_volts: 'EGO4_volts',
  uego_phi: 'Phi_UEGO',
  phi_uego2: 'Phi_UEGO2',
  phi_uego3: 'Phi_UEGO3',
  phi_uego4: 'Phi_UEGO4',
  phi_cmd: 'Phi_cmd',
  // Mass Flow Gas Valve (MFG) channels (UI-friendly names -> canonical)
  mass_flow_gas_valve_delta_pressure: 'MFG_DPPress',
  mass_flow_gas_valve_upstream_pressure: 'MFG_USPress',
  mass_flow_gas_valve_downstream_pressure: 'MFG_DSPress',
  mfg_delta_press_dp: 'MFG_DPPress',
  mfg_delta_press: 'MFG_DPPress',
  mfg_upstream_pressure: 'MFG_USPress',
  mfg_downstream_pressure: 'MFG_DSPress',
  mfg_fuel_flow_actual: 'MFG_mdot_act',
  mfg_fuel_flow_command: 'MFG_mdot_cmd',
  mfg_tps_actual: 'MFG_TPS_act_pct',
  mfg_tps_command: 'MFG_TPS_cmd_pct',
  engine_coolant_temp: 'ECT',
  ect_rate_of_change: 'ECTdt',
  oil_temperature: 'OILT',
  intake_air_temp: 'IAT',
  ambient_air_temp: 'AAT',
  auxiliary_coolant_temp: 'ACT',
  fuel_temperature: 'FT',
  manifold_absolute_pressure: 'MAP',
  barometric_pressure: 'BP',
  oil_pressure: 'OILP_press',
  oil_pressure_state: 'OILP_state',
  throttle_inlet_pressure: 'TIP',
  engine_load: 'eng_load',
  spark_advance: 'spk_adv',
  knock_retard: 'KNK_retard',
  derate_1: 'derate1',
  derate_2: 'derate2',
  shutdown_active: 'SD_active',
  forced_idle_active: 'FORCEIDLE_active',
  low_rev_limit_active: 'LOWREVLIM_active'
};

function normalizeChannelKey(name) {
  return name
    .trim()
    .toLowerCase()
    .replace(/%/g, 'pct')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function normalizeChannelName(name) {
  const normalizedKey = normalizeChannelKey(name);
  return CHANNEL_ALIASES[normalizedKey] || name.trim();
}

/**
 * Categorize a channel by its name
 * Categories per spec: engine, speed_control, fuel, ignition_electrical, pressure, temperature, system, auxiliary
 */
function categorizeChannel(name) {
  const lowerName = name.toLowerCase();
  const categories = {
    // ENGINE: MIL Status, Fuel Control Mode, Fuel Type, Hour Meter, Start Timer
    engine: ['milout_mirror', 'fuel_ctl_mode', 'fuel_type', 'hm_ram', 'hm_hours', 'start_tmr', 'eng_load', 'sync_state'],
    // SPEED CONTROL: All RPM-related items, Gov RPM Demand, TSC1 Speed Command, Gov1/2/3_rpm, Throttle Cmd/Pos, Gov Switch State, Gov Type
    speed_control: ['rpm', 'rpmd_gov', 'tsc1', 'rmt_speed', 'rmt_speed_sa', 'gov1_rpm', 'gov2_rpm', 'gov3_rpm', 'min_gov_rpm', 'max_gov_rpm',
                    'gov_min_abslimit', 'gov_max_abslimit', 'tps_cmd_pct', 'tps_pct', 'gov_sw_state', 'gov_type', 'loadlim_max_tps'],
    // FUEL: All MFG_ variables, Trims (A_BM1, CL_BM1), EPR, MJ_P, FT (Fuel Temp), Gasoline Fuel Pressure (FPin)
    fuel: ['a_bm1', 'cl_bm1', 'epr_', 'mj_p_', 'fuel_shutoff', 'fpin', 'pwe_avg', 'phi', 'mfg_', 'ft'],
    // IGNITION: Spark items, Knock Retard
    ignition: ['spk_adv', 'knk_retard', 'spark_shutoff'],
    // ELECTRICAL: Battery, Key Switch, Gov voltages
    electrical: ['vbat', 'vsw', 'gov1_volt', 'gov2_volt'],
    // IGNITION/ELECTRICAL: Legacy bucket
    ignition_electrical: ['ego1', 'ego2'],
    // PRESSURE: MAP, BP, TIP, Oil Pressure
    pressure: ['map', 'bp', 'tip', 'oilp_press'],
    // TEMPERATURE: Coolant, IAT, MAT, Oil Temp
    temperature: ['ect', 'rect', 'iat', 'riat', 'mat', 'oilt'],
    // SYSTEM: Derate, Shutdown, Force Idle, Load Limits
    system: ['derate', 'sd_active', 'forceidle', 'lowrevlim', 'oilp_state', 'loadlim_max', 'loadlim_perf', 'loadlim_t'],
    // AUXILIARY: Aux inputs
    auxiliary: ['aux_']
  };

  for (const [category, patterns] of Object.entries(categories)) {
    if (patterns.some(p => lowerName.includes(p))) {
      return category;
    }
  }
  return 'other';
}

/**
 * Extract time range and duration from B-Plot data
 */
export function extractTimeInfo(data) {
  if (!data || data.length === 0) return null;

  const times = data.map(row => row.Time);
  const startTime = Math.min(...times);
  const endTime = Math.max(...times);
  const duration = endTime - startTime;

  // Calculate sample rate
  const sampleRate = data.length / duration;

  return {
    startTime,
    endTime,
    duration,
    sampleCount: data.length,
    sampleRate: sampleRate.toFixed(2)
  };
}

/**
 * Calculate statistics for a specific channel with optional validity mask
 *
 * @param {Array} data - Array of data rows
 * @param {string} channelName - Name of the channel to calculate stats for
 * @param {Object} options - Options for validity filtering
 * @param {Array} options.engineStates - Array of engine states for each row (optional)
 * @param {string} options.policy - Validity policy to apply (optional)
 * @param {Object} options.policyConfig - Policy-specific configuration (optional)
 * @returns {Object|null} Channel statistics or null if no valid data
 */
export function calculateChannelStats(data, channelName, options = {}) {
  const { engineStates, policy, policyConfig } = options;

  // Get channel's validity policy if not explicitly provided
  const channelPolicy = policy || getChannelValidityPolicy(channelName);
  const statsPolicy = channelPolicy.statsPolicy || VALIDITY_POLICY.ALWAYS_VALID;

  // Extract valid values based on validity mask
  const validValues = [];
  let totalCount = 0;
  let validCount = 0;

  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    const value = row[channelName];

    if (isNaN(value)) continue;
    totalCount++;

    // Check sample validity based on policy
    const engineState = engineStates ? engineStates[i] : null;
    const sampleIsValid = isSampleValid(row, statsPolicy, engineState);

    // Check value validity (negative/zero exclusions)
    const valueIsValid = isValueValid(value, policyConfig || channelPolicy);

    if (sampleIsValid && valueIsValid) {
      validValues.push(value);
      validCount++;
    }
  }

  // Return null with metadata if no valid values
  if (validValues.length === 0) {
    return {
      name: channelName,
      min: null,
      max: null,
      avg: null,
      median: null,
      stdDev: null,
      count: 0,
      totalCount,
      validCount: 0,
      noValidData: true,
      policy: statsPolicy
    };
  }

  const sorted = [...validValues].sort((a, b) => a - b);
  const sum = validValues.reduce((a, b) => a + b, 0);

  return {
    name: channelName,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    avg: sum / validValues.length,
    median: sorted[Math.floor(sorted.length / 2)],
    stdDev: calculateStdDev(validValues, sum / validValues.length),
    count: validValues.length,
    totalCount,
    validCount,
    noValidData: false,
    policy: statsPolicy
  };
}

/**
 * Calculate standard deviation
 */
function calculateStdDev(values, mean) {
  const squareDiffs = values.map(v => Math.pow(v - mean, 2));
  const avgSquareDiff = squareDiffs.reduce((a, b) => a + b, 0) / values.length;
  return Math.sqrt(avgSquareDiff);
}

/**
 * Extract engine events (starts, stops, rpm changes)
 * Per rules: Engine Start = RPM crosses 500 RPM threshold (rising from 0 or near 0)
 */
export function extractEngineEvents(data) {
  const events = [];
  let engineRunning = false;
  let startIndex = null;

  for (let i = 0; i < data.length; i++) {
    const rpm = data[i].rpm ?? data[i].RPM ?? 0;
    const time = data[i].Time;

    // Engine start detection (RPM crosses 500 threshold - per rules)
    if (!engineRunning && rpm >= 500) {
      engineRunning = true;
      startIndex = i;
      events.push({
        type: 'start',
        time,
        index: i,
        rpm
      });
    }

    // Engine stop detection (RPM drops below 200)
    if (engineRunning && rpm < 200) {
      engineRunning = false;
      const runDuration = time - data[startIndex].Time;
      events.push({
        type: 'stop',
        time,
        index: i,
        rpm,
        runDuration
      });
    }
  }

  return events;
}

/**
 * Downsample data for chart rendering (reduces data points for performance)
 */
export function downsampleData(data, targetPoints = 2000) {
  if (data.length <= targetPoints) return data;

  const step = Math.ceil(data.length / targetPoints);
  const sampled = [];

  for (let i = 0; i < data.length; i += step) {
    sampled.push(data[i]);
  }

  return sampled;
}

/**
 * Extract data for a specific time window
 */
export function extractTimeWindow(data, startTime, endTime) {
  return data.filter(row => row.Time >= startTime && row.Time <= endTime);
}

/**
 * Get all unique channel names by category
 */
export function getChannelsByCategory(channels, resolveCategory) {
  const byCategory = {};

  for (const channel of channels) {
    const category = resolveCategory ? resolveCategory(channel.name, channel.category) : channel.category;
    if (!byCategory[category]) {
      byCategory[category] = [];
    }
    byCategory[category].push(channel.name);
  }

  return byCategory;
}
