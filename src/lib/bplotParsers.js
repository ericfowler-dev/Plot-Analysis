// =============================================================================
// B-PLOT DATA PARSERS - For time-series engine data from BPLT files
// =============================================================================

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
  start_timer: 'start_tmr',
  governor_rpm_demand: 'rpmd_gov',
  remote_speed_tsc1: 'RMT_speed',
  tsc1_speed_command: 'RMT_speed',
  rmt_speed_sa: 'RMT_speed_SA',
  tps_command_pct: 'TPS_cmd_pct',
  tps_command: 'TPS_cmd_pct',
  tps_actual_pct: 'TPS_pct',
  tps_actual: 'TPS_pct',
  governor_switch_state: 'gov_sw_state',
  governor_type: 'gov_type',
  load_limit_max_tps: 'LoadLim_max_TPS',
  gov_max_abs_limit: 'gov_max_abslimit',
  gov_min_abs_limit: 'gov_min_abslimit',
  adaptive_fuel_trim_al: 'A_BM1',
  closed_loop_fuel_trim_cl: 'CL_BM1',
  epr_command_pressure: 'EPR_cmd',
  epr_actual_pressure: 'EPR_actual',
  fuel_shutoff_status: 'fuel_shutoff_chk',
  gasoline_fuel_pressure: 'FPin',
  average_pulse_width: 'PWe_avg',
  o2_sensor_pre_cat: 'EGO1_volts',
  o2_sensor_post_cat: 'EGO2_volts',
  uego_phi: 'Phi_UEGO',
  mfg_delta_press_dp: 'MFG_DPPress',
  mfg_delta_press: 'MFG_DPPress',
  mfg_upstream_pressure: 'MFG_USPress',
  mfg_downstream_pressure: 'MFG_DSPress',
  engine_coolant_temp: 'ECT',
  oil_temperature: 'OILT',
  intake_air_temp: 'IAT',
  fuel_temperature: 'FT',
  manifold_absolute_pressure: 'MAP',
  barometric_pressure: 'BP',
  oil_pressure: 'OILP_press',
  oil_pressure_state: 'OILP_state',
  throttle_inlet_pressure: 'TIP'
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
 * Calculate statistics for a specific channel
 */
export function calculateChannelStats(data, channelName) {
  const values = data.map(row => row[channelName]).filter(v => !isNaN(v));

  if (values.length === 0) return null;

  const sorted = [...values].sort((a, b) => a - b);
  const sum = values.reduce((a, b) => a + b, 0);

  return {
    name: channelName,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    avg: sum / values.length,
    median: sorted[Math.floor(sorted.length / 2)],
    stdDev: calculateStdDev(values, sum / values.length),
    count: values.length
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
