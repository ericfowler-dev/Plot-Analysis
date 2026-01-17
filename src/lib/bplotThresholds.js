// =============================================================================
// B-PLOT THRESHOLDS AND PARAMETER DEFINITIONS
// =============================================================================

// =============================================================================
// VALIDITY POLICIES
// Defines when channel data is considered valid for statistics and alerts
// =============================================================================

/**
 * Validity Policy Types
 * Used to determine when channel data should be included in statistics/alerts
 */
export const VALIDITY_POLICY = {
  ALWAYS_VALID: 'AlwaysValid',                     // No restrictions - include all samples
  VALID_WHEN_KEY_ON: 'ValidWhenKeyOn',             // VSW > 0 (key in run position)
  VALID_WHEN_ENGINE_RUNNING: 'ValidWhenEngineRunning',   // RPM > threshold (engine cranking or running)
  VALID_WHEN_ENGINE_STABLE: 'ValidWhenEngineStable',     // Engine in stable running state only
  VALID_WHEN_FUEL_ENABLED: 'ValidWhenFuelEnabled',       // Fuel shutoff not active
  VALID_WHEN_RPM_ABOVE: 'ValidWhenRpmAbove'              // Custom RPM threshold per channel
};

/**
 * Default validity configuration
 * Can be overridden per-channel in BPLOT_PARAMETERS
 */
export const DEFAULT_VALIDITY_CONFIG = {
  rpmRunningThreshold: 500,      // RPM to consider engine "running"
  rpmStableThreshold: 800,       // RPM for stable operation
  vswThreshold: 1,               // VSW voltage for key-on detection
  startupGraceSeconds: 3,        // Ignore first N seconds after engine start
  shutdownGraceSeconds: 2        // Ignore last N seconds before engine stop
};

/**
 * Channel validity policy overrides
 * Maps channel names to their validity requirements
 * Default is ALWAYS_VALID if not specified
 */
export const CHANNEL_VALIDITY_POLICIES = {
  // Oil Pressure - only valid during stable running for alerts, running for stats
  OILP_press: {
    statsPolicy: VALIDITY_POLICY.VALID_WHEN_ENGINE_RUNNING,
    alertPolicy: VALIDITY_POLICY.VALID_WHEN_ENGINE_STABLE,
    excludeNegative: false,    // 0 is valid for oil pressure
    excludeZero: false
  },

  // EPR (Electronic Pressure Regulator) - only valid when engine running
  EPR_cmd: {
    statsPolicy: VALIDITY_POLICY.VALID_WHEN_ENGINE_RUNNING,
    alertPolicy: VALIDITY_POLICY.VALID_WHEN_ENGINE_RUNNING,
    excludeNegative: true      // Negative values are sensor errors
  },
  EPR_actual: {
    statsPolicy: VALIDITY_POLICY.VALID_WHEN_ENGINE_RUNNING,
    alertPolicy: VALIDITY_POLICY.VALID_WHEN_ENGINE_RUNNING,
    excludeNegative: true      // Negative values are sensor errors
  },
  MJ_P_act: {
    statsPolicy: VALIDITY_POLICY.VALID_WHEN_ENGINE_RUNNING,
    alertPolicy: VALIDITY_POLICY.VALID_WHEN_ENGINE_RUNNING,
    excludeNegative: true
  },
  MJ_P_cmd: {
    statsPolicy: VALIDITY_POLICY.VALID_WHEN_ENGINE_RUNNING,
    alertPolicy: VALIDITY_POLICY.VALID_WHEN_ENGINE_RUNNING,
    excludeNegative: true
  },

  // Pulse Width - only valid when engine running (0 when not injecting)
  PWe_avg: {
    statsPolicy: VALIDITY_POLICY.VALID_WHEN_ENGINE_RUNNING,
    alertPolicy: VALIDITY_POLICY.VALID_WHEN_ENGINE_RUNNING,
    excludeZero: true          // 0 means no injection
  },

  // Fuel trim - only valid in closed loop operation
  CL_BM1: {
    statsPolicy: VALIDITY_POLICY.VALID_WHEN_ENGINE_STABLE,
    alertPolicy: VALIDITY_POLICY.VALID_WHEN_ENGINE_STABLE
  },
  A_BM1: {
    statsPolicy: VALIDITY_POLICY.VALID_WHEN_ENGINE_STABLE,
    alertPolicy: VALIDITY_POLICY.VALID_WHEN_ENGINE_STABLE
  },

  // Engine load - only meaningful when running
  eng_load: {
    statsPolicy: VALIDITY_POLICY.VALID_WHEN_ENGINE_RUNNING,
    alertPolicy: VALIDITY_POLICY.VALID_WHEN_ENGINE_RUNNING
  },

  // Knock retard - only valid when engine running
  KNK_retard: {
    statsPolicy: VALIDITY_POLICY.VALID_WHEN_ENGINE_RUNNING,
    alertPolicy: VALIDITY_POLICY.VALID_WHEN_ENGINE_RUNNING
  },

  // Ignition timing - only valid when engine running
  SA: {
    statsPolicy: VALIDITY_POLICY.VALID_WHEN_ENGINE_RUNNING,
    alertPolicy: VALIDITY_POLICY.VALID_WHEN_ENGINE_RUNNING
  },

  // Manifold pressure - meaningful when key on
  MAP: {
    statsPolicy: VALIDITY_POLICY.VALID_WHEN_KEY_ON,
    alertPolicy: VALIDITY_POLICY.VALID_WHEN_ENGINE_RUNNING
  },

  // Coolant temperature - valid when key on (sensor always reads)
  ECT: {
    statsPolicy: VALIDITY_POLICY.VALID_WHEN_KEY_ON,
    alertPolicy: VALIDITY_POLICY.VALID_WHEN_ENGINE_RUNNING
  },

  // Battery voltage - always valid (monitors battery state)
  Vbat: {
    statsPolicy: VALIDITY_POLICY.ALWAYS_VALID,
    alertPolicy: VALIDITY_POLICY.ALWAYS_VALID
  },

  // RPM - always valid
  rpm: {
    statsPolicy: VALIDITY_POLICY.ALWAYS_VALID,
    alertPolicy: VALIDITY_POLICY.VALID_WHEN_ENGINE_RUNNING
  },
  RPM: {
    statsPolicy: VALIDITY_POLICY.ALWAYS_VALID,
    alertPolicy: VALIDITY_POLICY.VALID_WHEN_ENGINE_RUNNING
  },

  // UEGO/Lambda sensors - only valid when engine running
  Phi_UEGO: {
    statsPolicy: VALIDITY_POLICY.VALID_WHEN_ENGINE_RUNNING,
    alertPolicy: VALIDITY_POLICY.VALID_WHEN_ENGINE_STABLE
  },

  // Governor RPM demand - only meaningful when running
  rpmd_gov: {
    statsPolicy: VALIDITY_POLICY.VALID_WHEN_ENGINE_RUNNING,
    alertPolicy: VALIDITY_POLICY.VALID_WHEN_ENGINE_RUNNING
  },

  // MFG pressure channels - only valid when running
  MFG_DPPress: {
    statsPolicy: VALIDITY_POLICY.VALID_WHEN_ENGINE_RUNNING,
    alertPolicy: VALIDITY_POLICY.VALID_WHEN_ENGINE_RUNNING
  },
  MFG_DSPress: {
    statsPolicy: VALIDITY_POLICY.VALID_WHEN_ENGINE_RUNNING,
    alertPolicy: VALIDITY_POLICY.VALID_WHEN_ENGINE_RUNNING
  },
  MFG_USPress: {
    statsPolicy: VALIDITY_POLICY.VALID_WHEN_ENGINE_RUNNING,
    alertPolicy: VALIDITY_POLICY.VALID_WHEN_ENGINE_RUNNING
  },

  // Computed MFG fuel pressure fields - only valid when engine running stable
  MFG_FuelPressure_inWC: {
    statsPolicy: VALIDITY_POLICY.VALID_WHEN_ENGINE_STABLE,
    alertPolicy: VALIDITY_POLICY.VALID_WHEN_ENGINE_STABLE,
    excludeNegative: true
  },
  MFG_FuelPressure_psig: {
    statsPolicy: VALIDITY_POLICY.VALID_WHEN_ENGINE_STABLE,
    alertPolicy: VALIDITY_POLICY.VALID_WHEN_ENGINE_STABLE,
    excludeNegative: true
  }
};

/**
 * Get validity policy for a channel
 * Returns the policy config or default (AlwaysValid) if not specified
 */
export function getChannelValidityPolicy(channelName) {
  return CHANNEL_VALIDITY_POLICIES[channelName] || {
    statsPolicy: VALIDITY_POLICY.ALWAYS_VALID,
    alertPolicy: VALIDITY_POLICY.ALWAYS_VALID
  };
}

/**
 * Threshold values for alert detection
 */
export const BPLOT_THRESHOLDS = {
  battery: {
    min: 10.0,
    max: 16.0,
    warning_low: 11.5,
    warning_high: 15.0,
    critical_low: 10.5,
    critical_high: 15.5
  },
  rpm: {
    idle_min: 600,
    idle_max: 1000,
    max: 3600,
    warning_high: 3200,
    critical_high: 3500
  },
  coolantTemp: {
    min: 32,
    max: 250,
    normal_min: 160,
    normal_max: 210,
    warning_high: 220,
    critical_high: 235
  },
  oilPressure: {
    min: 0,
    max: 100,
    warning_low: 20,
    critical_low: 10,
    idle_min: 15
  },
  manifoldPressure: {
    min: 0,
    max: 35,
    idle_typical: 4,
    full_load: 30
  },
  knock: {
    warning_threshold: 3,
    critical_threshold: 8
  }
};

/**
 * Parameter definitions with units and descriptions
 * Categories: engine, speed_control, fuel, ignition, electrical, pressure, temperature, system, auxiliary
 */
export const BPLOT_PARAMETERS = {
  // Time
  Time: {
    name: 'Time',
    unit: 's',
    description: 'Elapsed time since recording start',
    category: 'time'
  },

  // =============================================================================
  // ENGINE SECTION
  // =============================================================================
  MILout_mirror: {
    name: 'MIL Status',
    unit: '',
    description: '0=DTC Not Active; 1=DTC Active',
    category: 'engine',
    hideAverage: true,
    showTimeInState: true
  },
  fuel_ctl_mode: {
    name: 'Fuel Control Mode',
    unit: '',
    description: '0=Open Loop; 2=Closed Loop; 3=CL + Adaptive',
    category: 'engine',
    hideAverage: true,
    showTimeInState: true
  },
  rpm: {
    name: 'RPM',
    unit: 'RPM',
    description: 'Engine crankshaft rotational speed',
    category: 'speed_control'
  },
  RPM: {
    name: 'RPM',
    unit: 'RPM',
    description: 'Engine crankshaft rotational speed',
    category: 'speed_control'
  },
  fuel_type: {
    name: 'Fuel Type',
    unit: '',
    description: '0=Gasoline; 1=Propane; 2=NG',
    category: 'engine',
    hideAverage: true
  },
  HM_RAM_seconds: {
    name: 'Hour Meter',
    unit: 'hrs',
    description: 'Engine hours from RAM',
    category: 'engine',
    hideAverage: true
  },
  HM_RAM: {
    name: 'Hour Meter',
    unit: 'hrs',
    description: 'Engine hours from RAM',
    category: 'engine',
    hideAverage: true
  },
  start_tmr: {
    name: 'Start Timer',
    unit: 's',
    description: 'Time since engine start',
    category: 'engine',
    hideAverage: true
  },
  eng_load: {
    name: 'Engine Load',
    unit: '%',
    description: 'Calculated engine load percentage',
    category: 'engine'
  },
  sync_state: {
    name: 'Sync State',
    unit: '',
    description: '>0=presync; 0=stopped; -1=crank syncd; -2=Crank and Cam Syncd',
    category: 'engine',
    hideAverage: true,
    showTimeInState: true
  },

  // =============================================================================
  // SPEED CONTROL SECTION
  // =============================================================================
  rpmd_gov: {
    name: 'Governor RPM Demand',
    unit: 'RPM',
    description: 'Governor demanded RPM',
    category: 'speed_control'
  },
  TSC1_rpmcmd: {
    name: 'TSC1 Speed Command',
    unit: 'RPM',
    description: 'Remote speed command via TSC1',
    category: 'speed_control'
  },
  RMT_speed: {
    name: 'Remote Speed TSC1',
    unit: 'RPM',
    description: 'Remote speed command via TSC1',
    category: 'speed_control'
  },
  RMT_speed_SA: {
    name: 'RMT_speed_SA',
    unit: '',
    description: 'TSC1 speed source address',
    category: 'speed_control'
  },
  gov1_rpm: {
    name: 'Gov1 RPM',
    unit: 'RPM',
    description: 'Governor position 1 RPM setting',
    category: 'speed_control',
    showMinOnly: true
  },
  gov2_rpm: {
    name: 'Gov2 RPM',
    unit: 'RPM',
    description: 'Governor position 2 RPM setting',
    category: 'speed_control',
    showMinOnly: true
  },
  gov3_rpm: {
    name: 'Gov3 RPM',
    unit: 'RPM',
    description: 'Governor position 3 RPM setting',
    category: 'speed_control',
    showMinOnly: true
  },
  Gov1_rpm: {
    name: 'Gov1 RPM',
    unit: 'RPM',
    description: 'Governor position 1 RPM setting',
    category: 'speed_control',
    showMinOnly: true
  },
  Gov2_rpm: {
    name: 'Gov2 RPM',
    unit: 'RPM',
    description: 'Governor position 2 RPM setting',
    category: 'speed_control',
    showMinOnly: true
  },
  Gov3_rpm: {
    name: 'Gov3 RPM',
    unit: 'RPM',
    description: 'Governor position 3 RPM setting',
    category: 'speed_control',
    showMinOnly: true
  },
  min_gov_rpm: {
    name: 'Min Governor RPM',
    unit: 'RPM',
    description: 'Minimum governor RPM setting',
    category: 'speed_control'
  },
  max_gov_rpm: {
    name: 'Max Governor RPM',
    unit: 'RPM',
    description: 'Maximum governor RPM setting',
    category: 'speed_control'
  },
  gov_min_abslimit: {
    name: 'Gov Min Abs Limit',
    unit: 'RPM',
    description: 'Governor minimum absolute limit',
    category: 'speed_control',
    showMinOnly: true
  },
  TPS_cmd_pct: {
    name: 'Throttle Command',
    unit: '%',
    description: 'Commanded throttle position',
    category: 'speed_control'
  },
  TPS_pct: {
    name: 'Throttle Position',
    unit: '%',
    description: 'Throttle position percentage',
    category: 'speed_control'
  },
  gov_sw_state: {
    name: 'Governor Switch State',
    unit: '',
    description: 'Governor switch position',
    category: 'speed_control'
  },
  gov_type: {
    name: 'Governor Type',
    unit: '',
    description: 'Active governor type',
    category: 'speed_control',
    hideAverage: true
  },
  LoadLim_max_TPS: {
    name: 'Load Limit Max TPS',
    unit: '%',
    description: 'Load limit maximum TPS',
    category: 'speed_control'
  },
  gov_max_abslimit: {
    name: 'Gov Max Abs Limit',
    unit: 'RPM',
    description: 'Governor maximum absolute limit',
    category: 'speed_control'
  },

  // =============================================================================
  // FUEL SECTION
  // =============================================================================
  A_BM1: {
    name: 'Adaptive Fuel Trim - AL',
    unit: '%',
    description: 'Long-term fuel trim adaptive value',
    category: 'fuel'
  },
  CL_BM1: {
    name: 'Closed Loop Fuel Trim - CL',
    unit: '%',
    description: 'Short-term fuel trim correction',
    category: 'fuel'
  },
  EPR_cmd: {
    name: 'EPR Command Pressure',
    unit: 'psi',
    description: 'Electronic pressure regulator command',
    category: 'fuel'
  },
  EPR_actual: {
    name: 'EPR Actual Pressure',
    unit: 'psi',
    description: 'Electronic pressure regulator actual',
    category: 'fuel'
  },
  MJ_P_act: {
    name: 'EPR Actual Pressure',
    unit: 'psi',
    description: 'Electronic pressure regulator actual pressure',
    category: 'fuel'
  },
  MJ_P_cmd: {
    name: 'EPR Command Pressure',
    unit: 'psi',
    description: 'Electronic pressure regulator command pressure',
    category: 'fuel'
  },
  fuel_shutoff_chk: {
    name: 'Fuel Shutoff Status',
    unit: '',
    description: '0=Off (fuel enabled); 1=On (fuel disabled)',
    category: 'fuel',
    hideAverage: true,
    showTimeInState: true
  },
  FPin: {
    name: 'Gasoline Fuel Pressure',
    unit: 'psi',
    description: 'Fuel pressure at inlet',
    category: 'fuel'
  },
  PWe_avg: {
    name: 'Average Pulse Width',
    unit: 'ms',
    description: 'Average injector pulse width',
    category: 'fuel'
  },
  Phi_UEGO: {
    name: 'UEGO Phi',
    unit: '',
    description: 'UEGO sensor equivalence ratio',
    category: 'fuel'
  },
  Phi1_post_delt: {
    name: 'Post Phi Delta',
    unit: '',
    description: 'Post catalyst phi delta correction',
    category: 'fuel'
  },
  // MFG Fuel-related items
  MFG_DPPress: {
    name: 'MFG Delta Press - DP',
    unit: 'psi',
    description: 'Manufacturing differential pressure (Flag if < 0.5 during run)',
    category: 'fuel',
    warningThreshold: 0.5
  },
  MFG_DSPress: {
    name: 'MFG Downstream Pressure',
    unit: 'psi',
    description: 'Manufacturing downstream pressure',
    category: 'fuel'
  },
  MFG_DSPressdt: {
    name: 'MFG Downstream Pressure',
    unit: 'psi',
    description: 'Manufacturing downstream pressure (dt variant)',
    category: 'fuel'
  },
  MFG_USPress: {
    name: 'MFG Upstream Pressure',
    unit: 'psi',
    description: 'Manufacturing upstream pressure',
    category: 'fuel'
  },
  MFG_TPS_act_pct: {
    name: 'MFG Throttle Actual %',
    unit: '%',
    description: 'Manufacturing throttle actual percent',
    category: 'fuel'
  },
  MFG_TPS_cmd_pct: {
    name: 'MFG Throttle Command %',
    unit: '%',
    description: 'Manufacturing throttle command percent',
    category: 'fuel'
  },
  MFG_FuelPressure_inWC: {
    name: 'MFG Fuel Pressure (inWC)',
    unit: 'inWC',
    description: 'Computed MFG fuel gauge pressure. Formula: (MFG_USPress - BP) × 27. Valid range: 20-30 inWC at full load.',
    category: 'fuel',
    computed: true,
    warningThreshold: { min: 20, max: 35 },
    criticalThreshold: { min: 15, max: 45 }
  },
  MFG_FuelPressure_psig: {
    name: 'MFG Fuel Pressure (psig)',
    unit: 'psig',
    description: 'Computed MFG fuel gauge pressure. Formula: MFG_USPress - BP. Valid range: 0.74-1.11 psig.',
    category: 'fuel',
    computed: true
  },
  FT: {
    name: 'Fuel Temperature',
    unit: 'F',
    description: 'Fuel temperature',
    category: 'temperature'
  },

  // =============================================================================
  // IGNITION SECTION (renamed from Timing)
  // =============================================================================
  spk_adv: {
    name: 'Spark Advance',
    unit: 'deg',
    description: 'Ignition timing advance',
    category: 'ignition'
  },
  KNK_retard: {
    name: 'Knock Retard',
    unit: 'deg',
    description: 'Timing retard due to knock detection',
    category: 'ignition'
  },
  spark_shutoff_chk: {
    name: 'Spark Shutoff',
    unit: '',
    description: '0=Off (spark enabled); 1=On (spark disabled)',
    category: 'ignition',
    hideAverage: true,
    showTimeInState: true
  },

  // =============================================================================
  // ELECTRICAL SECTION
  // =============================================================================
  gov1_volt: {
    name: 'Gov1 Voltage',
    unit: 'V',
    description: 'Governor position 1 voltage input',
    category: 'engine'
  },
  gov2_volt: {
    name: 'Gov2 Voltage',
    unit: 'V',
    description: 'Governor position 2 voltage input',
    category: 'engine'
  },
  Vbat: {
    name: 'Battery Voltage',
    unit: 'V',
    description: 'System battery voltage',
    category: 'electrical'
  },
  Vsw: {
    name: 'VSW',
    unit: 'V',
    description: 'Switched Voltage (VSW)',
    category: 'electrical'
  },
  EGO1_volts: {
    name: 'O2 Sensor Pre-Cat',
    unit: 'V',
    description: 'Pre-catalyst oxygen sensor voltage',
    category: 'fuel'
  },
  EGO2_volts: {
    name: 'O2 Sensor Post-Cat',
    unit: 'V',
    description: 'Post-catalyst oxygen sensor voltage',
    category: 'fuel'
  },

  // =============================================================================
  // PRESSURE SECTION
  // =============================================================================
  MAP: {
    name: 'Manifold Absolute Pressure',
    unit: 'psia',
    description: 'Intake manifold absolute pressure',
    category: 'pressure'
  },
  BP: {
    name: 'Barometric Pressure',
    unit: 'psia',
    description: 'Atmospheric/barometric pressure',
    category: 'pressure'
  },
  TIP: {
    name: 'Throttle Inlet Pressure',
    unit: 'psia',
    description: 'Pressure measured before the throttle blade',
    category: 'pressure'
  },
  OILP_press: {
    name: 'Oil Pressure',
    unit: 'psi',
    description: 'Engine oil pressure',
    category: 'pressure'
  },

  // =============================================================================
  // TEMPERATURE SECTION
  // =============================================================================
  ECT: {
    name: 'Engine Coolant Temperature',
    unit: 'F',
    description: 'Engine coolant temperature',
    category: 'temperature'
  },
  rECT: {
    name: 'Engine Coolant Temp (Raw)',
    unit: 'F',
    description: 'Raw engine coolant temperature',
    category: 'temperature'
  },
  IAT: {
    name: 'Intake Air Temperature',
    unit: 'F',
    description: 'Intake air temperature at sensor',
    category: 'temperature'
  },
  rIAT: {
    name: 'Intake Air Temp (Raw)',
    unit: 'F',
    description: 'Raw intake air temperature',
    category: 'temperature'
  },
  MAT: {
    name: 'Manifold Air Temperature',
    unit: 'F',
    description: 'Air temperature in intake manifold',
    category: 'temperature'
  },
  OILT: {
    name: 'Oil Temperature',
    unit: 'F',
    description: 'Engine oil temperature',
    category: 'temperature'
  },

  // =============================================================================
  // SYSTEM SECTION
  // =============================================================================
  LoadLim_max: {
    name: 'Load Limit Max',
    unit: '%',
    description: 'Maximum load limit',
    category: 'system'
  },
  LoadLim_perf_stat: {
    name: 'Load Limit Performance Status',
    unit: '',
    description: 'Load limiting performance status',
    category: 'system'
  },
  LoadLim_T_active: {
    name: 'Load Limit Temperature Active',
    unit: '',
    description: 'Temperature-based load limiting active',
    category: 'system'
  },
  FORCEIDLE_active: {
    name: 'Force Idle Active',
    unit: '',
    description: 'Force idle mode active flag',
    category: 'system'
  },
  LOWREVLIM_active: {
    name: 'Low Rev Limit Active',
    unit: '',
    description: 'Low rev limiter active flag',
    category: 'system'
  },
  OILP_state: {
    name: 'Oil Pressure State',
    unit: '',
    description: 'Oil pressure monitoring state',
    category: 'system'
  },
  DERATE1_active: {
    name: 'Derate 1 Active',
    unit: '',
    description: 'First level power derate active',
    category: 'system'
  },
  DERATE2_active: {
    name: 'Derate 2 Active',
    unit: '',
    description: 'Second level power derate active',
    category: 'system'
  },
  SD_active: {
    name: 'Shutdown Active',
    unit: '',
    description: 'Engine shutdown active flag',
    category: 'system'
  },

  // =============================================================================
  // AUXILIARY SECTION
  // =============================================================================
  AUX_PD1_raw: {
    name: 'Aux PD1 Raw',
    unit: 'V',
    description: 'Auxiliary pull-down input 1',
    category: 'auxiliary'
  },
  AUX_PU1_raw: {
    name: 'Aux PU1 Raw',
    unit: 'V',
    description: 'Auxiliary pull-up input 1',
    category: 'auxiliary'
  },
  AUX_PU2_raw: {
    name: 'Aux PU2 Raw',
    unit: 'V',
    description: 'Auxiliary pull-up input 2',
    category: 'auxiliary'
  },
  AUX_PU3_raw: {
    name: 'Aux PU3 Raw',
    unit: 'V',
    description: 'Auxiliary pull-up input 3',
    category: 'auxiliary'
  },
  AUX_DIG1_volt: {
    name: 'Aux Digital 1',
    unit: 'V',
    description: 'Auxiliary digital input 1 voltage',
    category: 'auxiliary'
  },
  AUX_DIG2_volt: {
    name: 'Aux Digital 2',
    unit: 'V',
    description: 'Auxiliary digital input 2 voltage',
    category: 'auxiliary'
  },
  AUX_DIG3_volt: {
    name: 'Aux Digital 3',
    unit: 'V',
    description: 'Auxiliary digital input 3 voltage',
    category: 'auxiliary'
  }
};

/**
 * Category display order and labels (per spec)
 */
export const CATEGORY_ORDER = [
  'engine',
  'speed_control',
  'fuel',
  'ignition',
  'electrical',
  'temperature',
  'pressure',
  'ignition_electrical',
  'system',
  'auxiliary'
];

export const CATEGORY_LABELS = {
  engine: 'Engine',
  speed_control: 'Speed Control',
  fuel: 'Fuel',
  ignition: 'Ignition',
  electrical: 'Electrical',
  ignition_electrical: 'Ignition / Electrical',
  pressure: 'Pressure',
  temperature: 'Temperature',
  system: 'System',
  auxiliary: 'Auxiliary'
};

/**
 * Categorical value mappings for human-readable display
 */
export const VALUE_MAPPINGS = {
  fuel_type: {
    0: 'Gasoline',
    1: 'Propane',
    2: 'NG'
  },
  fuel_ctl_mode: {
    0: 'Open Loop',
    2: 'Closed Loop',
    3: 'CL + Adaptive'
  },
  MILout_mirror: {
    0: 'Not Active',
    1: 'Active'
  },
  gov_sw_state: {
    0: 'None',
    1: 'GOV1',
    2: 'GOV2',
    3: 'GOV3'
  },
  gov_type: {
    1: 'GOV1',
    2: 'GOV2',
    3: 'GOV3',
    4: 'Min',
    5: 'Max'
  },
  fuel_shutoff_chk: {
    0: 'Off (fuel enabled)',
    1: 'On (fuel disabled)'
  },
  OILP_state: {
    0: 'OK',
    2: 'LOW'
  },
  spark_shutoff_chk: {
    0: 'Off (spark enabled)',
    1: 'On (Spark Disabled)'
  }
};

/**
 * Special mapping for sync_state (uses ranges, not exact values)
 */
export function getSyncStateDisplay(value) {
  if (value > 0) return 'presync';
  if (value === 0) return 'stopped';
  if (value === -1) return 'crank';
  if (value === -2) return 'Crank and Cam Syncd';
  return String(value);
}

/**
 * Get human-readable value for categorical channels
 */
export function getDisplayValue(channelName, rawValue) {
  // Special handling for sync_state
  if (channelName === 'sync_state') {
    return getSyncStateDisplay(rawValue);
  }

  const mapping = VALUE_MAPPINGS[channelName];
  if (mapping && mapping[rawValue] !== undefined) {
    return mapping[rawValue];
  }
  return rawValue;
}

/**
 * Channels that should show time-in-state statistics
 */
export const TIME_IN_STATE_CHANNELS = [
  'fuel_ctl_mode',
  'fuel_type',
  'MILout_mirror',
  'gov_sw_state',
  'gov_type',
  'sync_state',
  'fuel_shutoff_chk',
  'spark_shutoff_chk',
  'OILP_state'
];

/**
 * Channel unit types for multi-axis charting
 */
export const CHANNEL_UNIT_TYPES = {
  // RPM channels - 0 decimals
  rpm: 'rpm',
  RPM: 'rpm',
  rpmd_gov: 'rpm',
  TSC1_rpmcmd: 'rpm',
  RMT_speed: 'rpm',
  gov1_rpm: 'rpm',
  gov2_rpm: 'rpm',
  gov3_rpm: 'rpm',
  Gov1_rpm: 'rpm',
  Gov2_rpm: 'rpm',
  Gov3_rpm: 'rpm',
  min_gov_rpm: 'rpm',
  max_gov_rpm: 'rpm',
  gov_min_abslimit: 'rpm',
  gov_max_abslimit: 'rpm',

  // Pressure channels - 2 decimals
  MAP: 'pressure',
  BP: 'pressure',
  TIP: 'pressure',
  OILP_press: 'pressure',
  EPR_cmd: 'pressure',
  EPR_actual: 'pressure',
  FPin: 'pressure',
  MFG_DPPress: 'pressure',
  MFG_USPress: 'pressure',
  MFG_DSPress: 'pressure',
  MFG_DSPressdt: 'pressure',
  MJ_P_act: 'pressure',
  MJ_P_cmd: 'pressure',

  // Voltage channels - 1 decimal
  Vbat: 'voltage',
  Vsw: 'voltage',
  EGO1_volts: 'voltage',
  EGO2_volts: 'voltage',
  gov1_volt: 'voltage',
  gov2_volt: 'voltage',

  // Temperature channels - 1 decimal
  ECT: 'temperature',
  IAT: 'temperature',
  MAT: 'temperature',
  OILT: 'temperature',
  FT: 'temperature',
  rIAT: 'temperature',
  rECT: 'temperature',

  // Percentage channels - 1 decimal
  TPS_pct: 'percentage',
  TPS_cmd_pct: 'percentage',
  eng_load: 'percentage',
  A_BM1: 'percentage',
  CL_BM1: 'percentage',
  MFG_TPS_act_pct: 'percentage',
  MFG_TPS_cmd_pct: 'percentage',

  // Computed MFG fuel pressure - pressure formatting (2 decimal)
  MFG_FuelPressure_inWC: 'pressure',
  MFG_FuelPressure_psig: 'pressure'
};

/**
 * Get decimal places for a channel based on unit type
 */
export function getDecimalPlaces(channelName) {
  const unitType = CHANNEL_UNIT_TYPES[channelName];
  switch (unitType) {
    case 'rpm': return 0;
    case 'pressure': return 2;
    case 'voltage': return 1;
    case 'temperature': return 1;
    case 'percentage': return 1;
    default: return 2;
  }
}

/**
 * Map unit types to axis IDs per spec: yRPM, yVolt, yPress, yTemp, yPct
 */
const AXIS_ID_MAP = {
  rpm: 'yRPM',
  voltage: 'yVolt',
  pressure: 'yPress',
  temperature: 'yTemp',
  percentage: 'yPct'
};

/**
 * Get Y-axis ID for a channel
 * Returns: yRPM, yVolt, yPress, yTemp, yPct, or yDefault
 */
export function getYAxisId(channelName) {
  const unitType = CHANNEL_UNIT_TYPES[channelName];
  return AXIS_ID_MAP[unitType] || 'yDefault';
}

/**
 * Get threshold info for a parameter
 */
export function getThresholdForParameter(paramName) {
  const thresholdMap = {
    Vbat: BPLOT_THRESHOLDS.battery,
    rpm: BPLOT_THRESHOLDS.rpm,
    ECT: BPLOT_THRESHOLDS.coolantTemp,
    OILP_press: BPLOT_THRESHOLDS.oilPressure,
    MAP: BPLOT_THRESHOLDS.manifoldPressure,
    KNK_retard: BPLOT_THRESHOLDS.knock
  };

  return thresholdMap[paramName] || null;
}

/**
 * Severity colors for UI
 */
export const SEVERITY_COLORS = {
  critical: '#ef4444',
  warning: '#f97316',
  info: '#3b82f6',
  normal: '#22c55e'
};

/**
 * Category colors for charts
 */
export const CATEGORY_COLORS = {
  engine: '#3b82f6',
  speed_control: '#06b6d4',
  fuel: '#22c55e',
  ignition: '#f97316',
  electrical: '#eab308',
  ignition_electrical: '#f59e0b',
  pressure: '#8b5cf6',
  temperature: '#ef4444',
  system: '#6b7280',
  auxiliary: '#84cc16',
  other: '#9ca3af'
};
