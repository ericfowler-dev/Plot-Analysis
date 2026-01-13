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
  const headers = lines[0].split(',').map(h => h.trim());

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

/**
 * Categorize a channel by its name
 * Categories per spec: engine, speed_control, fuel, ignition_electrical, pressure, temperature, system, auxiliary
 */
function categorizeChannel(name) {
  const categories = {
    // ENGINE: MIL Status, Fuel Control Mode, RPM, Fuel Type, Hour Meter, Start Timer
    engine: ['rpm', 'RPM', 'eng_load', 'sync_state', 'MILout_mirror', 'fuel_ctl_mode', 'fuel_type', 'HM_RAM', 'start_tmr'],
    // SPEED CONTROL: Gov RPM Demand, TSC1 Speed Command, RMT_speed, Gov1/2/3_rpm, Throttle Cmd/Pos, Gov Switch State, Gov Type
    speed_control: ['rpmd_gov', 'TSC1', 'RMT_speed', 'gov1_rpm', 'gov2_rpm', 'gov3_rpm', 'min_gov_rpm', 'max_gov_rpm',
                    'gov_min_abslimit', 'gov_max_abslimit', 'TPS_pct', 'TPS_cmd', 'gov_sw_state', 'gov_type', 'LoadLim_max_TPS'],
    // FUEL: All MFG_ variables, Trims (A_BM1, CL_BM1), EPR, MJ_P, FT (Fuel Temp), Gasoline Fuel Pressure (FPin)
    fuel: ['A_BM1', 'CL_BM1', 'EPR_', 'MJ_P_', 'fuel_shutoff', 'FPin', 'PWe_avg', 'Phi', 'MFG_DPPress', 'MFG_USPress', 'MFG_DSPress', 'MFG_TPS', 'FT'],
    // IGNITION/ELECTRICAL: Spark items, Gov1/2_volt, Battery, Key Switch, O2 sensors
    ignition_electrical: ['spk_adv', 'KNK_retard', 'spark_shutoff', 'gov1_volt', 'gov2_volt', 'Vbat', 'Vsw', 'EGO1', 'EGO2'],
    // PRESSURE: MAP, BP, TIP, Oil Pressure
    pressure: ['MAP', 'BP', 'TIP', 'OILP_press'],
    // TEMPERATURE: Coolant, IAT, MAT, Oil Temp
    temperature: ['ECT', 'rECT', 'IAT', 'rIAT', 'MAT', 'OILT'],
    // SYSTEM: Derate, Shutdown, Force Idle, Load Limits
    system: ['DERATE', 'SD_active', 'FORCEIDLE', 'LOWREVLIM', 'OILP_state', 'LoadLim_max', 'LoadLim_perf', 'LoadLim_T'],
    // AUXILIARY: Aux inputs
    auxiliary: ['AUX_']
  };

  for (const [category, patterns] of Object.entries(categories)) {
    if (patterns.some(p => name.includes(p))) {
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
    const rpm = data[i].rpm || 0;
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
export function getChannelsByCategory(channels) {
  const byCategory = {};

  for (const channel of channels) {
    if (!byCategory[channel.category]) {
      byCategory[channel.category] = [];
    }
    byCategory[channel.category].push(channel.name);
  }

  return byCategory;
}
