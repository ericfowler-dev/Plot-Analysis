/**
 * Parameter Catalog - Config 3.1
 * Centralized definitions for all configurable engine parameters
 * This catalog drives the UI generation and validation
 *
 * v3.1 Changes:
 * - Added 'evaluated' flag to indicate which parameters are actually
 *   checked by the anomaly detection engine vs. metadata-only
 * - Tightened battery max default from 32V to 15V
 */

// Parameter categories with metadata
export const PARAMETER_CATEGORIES = {
  electrical: {
    id: 'electrical',
    name: 'Electrical',
    description: 'Voltage and electrical system monitoring',
    icon: 'Zap',
    color: '#facc15' // yellow
  },
  thermal: {
    id: 'thermal',
    name: 'Thermal',
    description: 'Temperature monitoring',
    icon: 'Thermometer',
    color: '#f97316' // orange
  },
  pressure: {
    id: 'pressure',
    name: 'Pressure',
    description: 'Pressure monitoring',
    icon: 'Gauge',
    color: '#3b82f6' // blue
  },
  fuel: {
    id: 'fuel',
    name: 'Fuel System',
    description: 'Fuel trim and mixture control',
    icon: 'Fuel',
    color: '#22c55e' // green
  },
  engine: {
    id: 'engine',
    name: 'Engine',
    description: 'Engine speed and load parameters',
    icon: 'Settings',
    color: '#8b5cf6' // purple
  },
  knock: {
    id: 'knock',
    name: 'Knock Detection',
    description: 'Detonation and knock monitoring',
    icon: 'AlertTriangle',
    color: '#ef4444' // red
  },
  mfg: {
    id: 'mfg',
    name: 'MFG Fuel System',
    description: 'Mass Flow Gas fuel system (40L/53L)',
    icon: 'Workflow',
    color: '#06b6d4' // cyan
  },
  signals: {
    id: 'signals',
    name: 'Signal Quality',
    description: 'Sensor signal dropout detection',
    icon: 'Activity',
    color: '#64748b' // slate
  }
};

// Threshold types
export const THRESHOLD_TYPES = {
  RANGE: 'range',       // Both min and max (e.g., battery voltage)
  MAX_ONLY: 'max',      // Only maximum (e.g., temperature)
  MIN_ONLY: 'min',      // Only minimum (e.g., oil pressure)
  CUSTOM: 'custom'      // Complex/custom logic
};

/**
 * Parameter Catalog
 * Each parameter defines:
 * - id: Unique identifier (used in profile JSON)
 * - name: Display name
 * - category: Category ID from PARAMETER_CATEGORIES
 * - unit: Unit of measurement
 * - description: Help text
 * - dataColumns: Possible column names in data files
 * - thresholdType: RANGE, MAX_ONLY, MIN_ONLY, or CUSTOM
 * - defaults: Default threshold values
 * - validation: Min/max valid input values
 * - advanced: Available advanced options
 * - engineFamilies: Restrict to specific engine families (null = all)
 */
export const PARAMETER_CATALOG = {
  // ============== ELECTRICAL ==============
  battery: {
    id: 'battery',
    name: 'Battery Voltage',
    category: 'electrical',
    unit: 'V',
    description: 'System battery/alternator voltage. Monitors charging system health and detects low voltage conditions.',
    dataColumns: ['Vbat', 'battery_voltage', 'VBAT', 'vbat'],
    thresholdType: THRESHOLD_TYPES.RANGE,
    evaluated: true, // v3.1: Evaluated by anomaly engine
    defaults: {
      enabled: true,
      warning: { min: 11.5, max: 14.8 },
      critical: { min: 10.5, max: 15.5 }, // v3.1: Tightened from 32V to 15.5V to reduce false positives
      hysteresis: { lowClear: 12.0, highClear: 14.5 }
    },
    validation: { min: 0, max: 50, step: 0.1 },
    advanced: ['hysteresis', 'ignoreWhen', 'requireWhen'],
    engineFamilies: null
  },

  switchVoltage: {
    id: 'switchVoltage',
    name: 'Switch Voltage',
    category: 'electrical',
    unit: 'V',
    description: 'Ignition switch voltage. Used to detect key-on state and power status.',
    dataColumns: ['Vsw', 'vsw', 'VSW', 'switch_voltage'],
    thresholdType: THRESHOLD_TYPES.RANGE,
    evaluated: false, // v3.1: Not evaluated by anomaly engine (metadata only)
    defaults: {
      enabled: false,
      warning: { min: 8, max: 32 },
      critical: { min: 6, max: 35 }
    },
    validation: { min: 0, max: 50, step: 0.1 },
    advanced: ['hysteresis'],
    engineFamilies: null
  },

  // ============== THERMAL ==============
  coolantTemp: {
    id: 'coolantTemp',
    name: 'Coolant Temperature',
    category: 'thermal',
    unit: '°F',
    description: 'Engine coolant temperature. High values indicate overheating.',
    dataColumns: ['ECT', 'coolant_temp', 'engine_coolant_temp', 'ect'],
    thresholdType: THRESHOLD_TYPES.MAX_ONLY,
    evaluated: true, // v3.1: Evaluated by anomaly engine
    defaults: {
      enabled: true,
      warning: { max: 220 },
      critical: { max: 235 },
      gracePeriod: 60
    },
    validation: { min: 0, max: 300, step: 1 },
    advanced: ['gracePeriod', 'ignoreWhen', 'requireWhen'],
    engineFamilies: null
  },

  oilTemp: {
    id: 'oilTemp',
    name: 'Oil Temperature',
    category: 'thermal',
    unit: '°F',
    description: 'Engine oil temperature. High values may indicate cooling issues or excessive load.',
    dataColumns: ['OILT', 'oil_temp', 'OIL_TEMP', 'oilt'],
    thresholdType: THRESHOLD_TYPES.MAX_ONLY,
    evaluated: false, // v3.1: Not evaluated by anomaly engine (metadata only)
    defaults: {
      enabled: false, // v3.1: Disabled by default since not evaluated
      warning: { max: 250 },
      critical: { max: 270 }
    },
    validation: { min: 0, max: 350, step: 1 },
    advanced: ['ignoreWhen', 'requireWhen'],
    engineFamilies: null
  },

  intakeAirTemp: {
    id: 'intakeAirTemp',
    name: 'Intake Air Temp',
    category: 'thermal',
    unit: '°F',
    description: 'Intake air temperature. High values reduce engine efficiency and increase detonation risk.',
    dataColumns: ['IAT', 'intake_air_temp', 'INTAKE_AIR_TEMP', 'iat'],
    thresholdType: THRESHOLD_TYPES.MAX_ONLY,
    evaluated: false, // v3.1: Not evaluated by anomaly engine (metadata only)
    defaults: {
      enabled: false, // v3.1: Disabled by default since not evaluated
      warning: { max: 140 },
      critical: { max: 160 }
    },
    validation: { min: 0, max: 250, step: 1 },
    advanced: ['ignoreWhen', 'requireWhen'],
    engineFamilies: null
  },

  exhaustGasTemp: {
    id: 'exhaustGasTemp',
    name: 'Exhaust Gas Temp',
    category: 'thermal',
    unit: '°F',
    description: 'Exhaust gas temperature (when equipped). High values indicate lean mixture or ignition issues.',
    dataColumns: ['EGT', 'exhaust_gas_temp', 'egt', 'EXHAUST_TEMP'],
    thresholdType: THRESHOLD_TYPES.MAX_ONLY,
    evaluated: false, // v3.1: Not evaluated by anomaly engine (metadata only)
    defaults: {
      enabled: false,
      warning: { max: 1400 },
      critical: { max: 1600 }
    },
    validation: { min: 0, max: 2000, step: 10 },
    advanced: ['ignoreWhen', 'requireWhen'],
    engineFamilies: null
  },

  intercoolerTemp: {
    id: 'intercoolerTemp',
    name: 'Intercooler Temp',
    category: 'thermal',
    unit: '°F',
    description: 'Intercooler outlet temperature. Monitors charge air cooling effectiveness.',
    dataColumns: ['ICOT', 'intercooler_temp', 'charge_air_temp'],
    thresholdType: THRESHOLD_TYPES.MAX_ONLY,
    evaluated: false, // v3.1: Not evaluated by anomaly engine (metadata only)
    defaults: {
      enabled: false,
      warning: { max: 180 },
      critical: { max: 200 }
    },
    validation: { min: 0, max: 300, step: 1 },
    advanced: ['ignoreWhen', 'requireWhen'],
    engineFamilies: ['psi-hd']
  },

  catalystTemp: {
    id: 'catalystTemp',
    name: 'Catalyst Temperature',
    category: 'thermal',
    unit: '°F',
    description: 'Catalyst bed temperature. Monitors catalyst operating range.',
    dataColumns: ['CAT_TEMP', 'catalyst_temp', 'cat_temp'],
    thresholdType: THRESHOLD_TYPES.MAX_ONLY,
    evaluated: false, // v3.1: Not evaluated by anomaly engine (metadata only)
    defaults: {
      enabled: false,
      warning: { max: 1200 },
      critical: { max: 1400 }
    },
    validation: { min: 0, max: 2000, step: 10 },
    advanced: ['ignoreWhen', 'requireWhen'],
    engineFamilies: null
  },

  // ============== PRESSURE ==============
  oilPressure: {
    id: 'oilPressure',
    name: 'Oil Pressure',
    category: 'pressure',
    unit: 'psi',
    description: 'Engine oil pressure. Low values during running indicate lubrication issues.',
    dataColumns: ['OILP_press', 'oil_pressure', 'OIL_PRESS', 'oilp_press'],
    thresholdType: THRESHOLD_TYPES.MIN_ONLY,
    evaluated: true, // v3.1: Evaluated by anomaly engine
    defaults: {
      enabled: true,
      warning: { min: 8 },
      critical: { min: 6 },
      rpmDependent: true,
      rpmThreshold: 725
    },
    validation: { min: 0, max: 150, step: 1 },
    advanced: ['rpmDependent', 'rpmThreshold', 'ignoreWhen', 'requireWhen', 'hysteresis'],
    engineFamilies: null
  },

  manifoldPressure: {
    id: 'manifoldPressure',
    name: 'Manifold Pressure',
    category: 'pressure',
    unit: 'psia',
    description: 'Intake manifold absolute pressure. Indicates engine load and turbo boost.',
    dataColumns: ['MAP', 'manifold_pressure', 'MANIFOLD_ABS_PRESS', 'map'],
    thresholdType: THRESHOLD_TYPES.RANGE,
    evaluated: false, // v3.1: Not evaluated by anomaly engine (metadata only)
    defaults: {
      enabled: false, // v3.1: Disabled by default since not evaluated
      warning: { min: 2, max: 35 },
      critical: { min: 0.5, max: 40 }
    },
    validation: { min: 0, max: 60, step: 0.5 },
    advanced: ['ignoreWhen', 'requireWhen'],
    engineFamilies: null
  },

  throttleInletPressure: {
    id: 'throttleInletPressure',
    name: 'Throttle Inlet Pressure',
    category: 'pressure',
    unit: 'psia',
    description: 'Pressure at throttle body inlet. Used for TIP/MAP delta calculations.',
    dataColumns: ['TIP', 'throttle_inlet_pressure', 'tip'],
    thresholdType: THRESHOLD_TYPES.RANGE,
    evaluated: false, // v3.1: Not evaluated by anomaly engine (metadata only)
    defaults: {
      enabled: false,
      warning: { min: 2, max: 38 },
      critical: { min: 1, max: 42 }
    },
    validation: { min: 0, max: 60, step: 0.5 },
    advanced: ['ignoreWhen', 'requireWhen'],
    engineFamilies: null
  },

  fuelPressure: {
    id: 'fuelPressure',
    name: 'Fuel Pressure',
    category: 'pressure',
    unit: 'psi',
    description: 'Fuel system pressure. Low values may cause lean conditions.',
    dataColumns: ['FUEL_PRESS', 'fuel_pressure', 'fp'],
    thresholdType: THRESHOLD_TYPES.MIN_ONLY,
    evaluated: false, // v3.1: Not evaluated by anomaly engine (metadata only)
    defaults: {
      enabled: false,
      warning: { min: 35 },
      critical: { min: 25 }
    },
    validation: { min: 0, max: 200, step: 1 },
    advanced: ['ignoreWhen', 'requireWhen'],
    engineFamilies: null
  },

  crankcasePressure: {
    id: 'crankcasePressure',
    name: 'Crankcase Pressure',
    category: 'pressure',
    unit: 'inH2O',
    description: 'Crankcase pressure. High values indicate blowby or PCV issues.',
    dataColumns: ['CRANKCASE_PRESS', 'crankcase_pressure', 'ccp'],
    thresholdType: THRESHOLD_TYPES.MAX_ONLY,
    evaluated: false, // v3.1: Not evaluated by anomaly engine (metadata only)
    defaults: {
      enabled: false,
      warning: { max: 3 },
      critical: { max: 5 }
    },
    validation: { min: -10, max: 20, step: 0.5 },
    advanced: ['ignoreWhen', 'requireWhen'],
    engineFamilies: null
  },

  boostPressure: {
    id: 'boostPressure',
    name: 'Boost Pressure',
    category: 'pressure',
    unit: 'psi',
    description: 'Turbocharger boost pressure (gauge). Monitors turbo output.',
    dataColumns: ['BOOST', 'boost_pressure', 'boost', 'BP'],
    thresholdType: THRESHOLD_TYPES.MAX_ONLY,
    evaluated: false, // v3.1: Not evaluated by anomaly engine (metadata only)
    defaults: {
      enabled: false,
      warning: { max: 18 },
      critical: { max: 22 }
    },
    validation: { min: 0, max: 40, step: 0.5 },
    advanced: ['ignoreWhen', 'requireWhen'],
    engineFamilies: ['psi-hd']
  },

  // ============== FUEL SYSTEM ==============
  closedLoopTrimBank1: {
    id: 'closedLoopTrimBank1',
    name: 'Closed Loop Trim B1',
    category: 'fuel',
    unit: '%',
    description: 'Bank 1 closed-loop fuel trim. Large positive values indicate lean, negative values indicate rich.',
    dataColumns: ['CL_BM1', 'closed_loop_fuel', 'CL_FUEL_TRIM', 'cl_bm1'],
    thresholdType: THRESHOLD_TYPES.RANGE,
    evaluated: true, // v3.1: Evaluated via fuelTrim mapping
    defaults: {
      enabled: true,
      warning: { min: -25, max: 25 },
      critical: { min: -35, max: 35 }
    },
    validation: { min: -100, max: 100, step: 1 },
    advanced: ['ignoreWhen', 'requireWhen'],
    engineFamilies: null
  },

  closedLoopTrimBank2: {
    id: 'closedLoopTrimBank2',
    name: 'Closed Loop Trim B2',
    category: 'fuel',
    unit: '%',
    description: 'Bank 2 closed-loop fuel trim (V-engines). Large positive values indicate lean.',
    dataColumns: ['CL_BM2', 'cl_bm2', 'closed_loop_b2'],
    thresholdType: THRESHOLD_TYPES.RANGE,
    evaluated: true, // v3.1: Evaluated via fuelTrim mapping
    defaults: {
      enabled: false,
      warning: { min: -25, max: 25 },
      critical: { min: -35, max: 35 }
    },
    validation: { min: -100, max: 100, step: 1 },
    advanced: ['ignoreWhen', 'requireWhen'],
    engineFamilies: null
  },

  adaptiveTrimBank1: {
    id: 'adaptiveTrimBank1',
    name: 'Adaptive Trim B1',
    category: 'fuel',
    unit: '%',
    description: 'Bank 1 long-term adaptive fuel trim. Indicates chronic mixture correction.',
    dataColumns: ['A_BM1', 'adaptive_fuel', 'ADAPTIVE_FUEL_TRIM', 'a_bm1'],
    thresholdType: THRESHOLD_TYPES.RANGE,
    evaluated: true, // v3.1: Evaluated via fuelTrim mapping
    defaults: {
      enabled: true,
      warning: { min: -20, max: 20 },
      critical: { min: -30, max: 30 }
    },
    validation: { min: -100, max: 100, step: 1 },
    advanced: ['ignoreWhen', 'requireWhen'],
    engineFamilies: null
  },

  adaptiveTrimBank2: {
    id: 'adaptiveTrimBank2',
    name: 'Adaptive Trim B2',
    category: 'fuel',
    unit: '%',
    description: 'Bank 2 long-term adaptive fuel trim (V-engines).',
    dataColumns: ['A_BM2', 'a_bm2', 'adaptive_b2'],
    thresholdType: THRESHOLD_TYPES.RANGE,
    evaluated: true, // v3.1: Evaluated via fuelTrim mapping
    defaults: {
      enabled: false,
      warning: { min: -20, max: 20 },
      critical: { min: -30, max: 30 }
    },
    validation: { min: -100, max: 100, step: 1 },
    advanced: ['ignoreWhen', 'requireWhen'],
    engineFamilies: null
  },

  lambdaAFR: {
    id: 'lambdaAFR',
    name: 'Lambda / AFR',
    category: 'fuel',
    unit: 'λ',
    description: 'Air-fuel ratio from wideband oxygen sensor. 1.0 = stoichiometric.',
    dataColumns: ['Phi_UEGO', 'lambda', 'AFR', 'afr'],
    thresholdType: THRESHOLD_TYPES.RANGE,
    evaluated: false, // v3.1: Not evaluated by anomaly engine (metadata only)
    defaults: {
      enabled: false,
      warning: { min: 0.85, max: 1.15 },
      critical: { min: 0.75, max: 1.25 }
    },
    validation: { min: 0.5, max: 2.0, step: 0.01 },
    advanced: ['ignoreWhen', 'requireWhen'],
    engineFamilies: null
  },

  injectorDuty: {
    id: 'injectorDuty',
    name: 'Injector Duty Cycle',
    category: 'fuel',
    unit: '%',
    description: 'Fuel injector duty cycle. High values may indicate undersized injectors.',
    dataColumns: ['INJ_DUTY', 'injector_duty', 'inj_duty_pct'],
    thresholdType: THRESHOLD_TYPES.MAX_ONLY,
    evaluated: false, // v3.1: Not evaluated by anomaly engine (metadata only)
    defaults: {
      enabled: false,
      warning: { max: 80 },
      critical: { max: 95 }
    },
    validation: { min: 0, max: 100, step: 1 },
    advanced: ['ignoreWhen', 'requireWhen'],
    engineFamilies: null
  },

  veFeedback: {
    id: 'veFeedback',
    name: 'VE Feedback',
    category: 'fuel',
    unit: 'raw',
    description: 'Volumetric efficiency feedback correction. Indicates VE table accuracy.',
    dataColumns: ['VE5a_FB_raw', 've_feedback', 'VE_FB'],
    thresholdType: THRESHOLD_TYPES.RANGE,
    evaluated: false, // v3.1: Not evaluated by anomaly engine (metadata only)
    defaults: {
      enabled: false,
      warning: { min: -15, max: 15 },
      critical: { min: -25, max: 25 }
    },
    validation: { min: -100, max: 100, step: 1 },
    advanced: ['ignoreWhen', 'requireWhen'],
    engineFamilies: null
  },

  // ============== ENGINE ==============
  rpm: {
    id: 'rpm',
    name: 'Engine Speed',
    category: 'engine',
    unit: 'RPM',
    description: 'Engine rotational speed. High values risk mechanical damage.',
    dataColumns: ['rpm', 'RPM', 'engine_speed', 'ENGINE_SPEED'],
    thresholdType: THRESHOLD_TYPES.MAX_ONLY,
    evaluated: true, // v3.1: Evaluated by anomaly engine
    defaults: {
      enabled: true,
      warning: { max: 3200 },
      critical: { max: 3500 },
      overspeed: 3800
    },
    validation: { min: 0, max: 10000, step: 100 },
    advanced: ['overspeed', 'ignoreWhen', 'requireWhen'],
    engineFamilies: null
  },

  engineLoad: {
    id: 'engineLoad',
    name: 'Engine Load',
    category: 'engine',
    unit: '%',
    description: 'Calculated engine load percentage. 100% = wide open throttle.',
    dataColumns: ['eng_load', 'engine_load', 'ENG_LOAD', 'load'],
    thresholdType: THRESHOLD_TYPES.MAX_ONLY,
    evaluated: false, // v3.1: Not evaluated by anomaly engine (metadata only)
    defaults: {
      enabled: false,
      warning: { max: 95 },
      critical: { max: 100 }
    },
    validation: { min: 0, max: 150, step: 1 },
    advanced: ['ignoreWhen', 'requireWhen'],
    engineFamilies: null
  },

  throttlePosition: {
    id: 'throttlePosition',
    name: 'Throttle Position',
    category: 'engine',
    unit: '%',
    description: 'Throttle plate position percentage.',
    dataColumns: ['TPS_pct', 'throttle_position', 'TPS', 'tps'],
    thresholdType: THRESHOLD_TYPES.MAX_ONLY,
    evaluated: false, // v3.1: Not evaluated by anomaly engine (metadata only)
    defaults: {
      enabled: false,
      warning: { max: 95 },
      critical: { max: 100 }
    },
    validation: { min: 0, max: 100, step: 1 },
    advanced: ['ignoreWhen', 'requireWhen'],
    engineFamilies: null
  },

  sparkAdvance: {
    id: 'sparkAdvance',
    name: 'Spark Advance',
    category: 'engine',
    unit: '°BTDC',
    description: 'Ignition timing advance. Monitors timing stability.',
    dataColumns: ['spk_adv', 'spark_advance', 'IGN_ADV', 'ign_adv'],
    thresholdType: THRESHOLD_TYPES.RANGE,
    evaluated: false, // v3.1: Not evaluated by anomaly engine (metadata only)
    defaults: {
      enabled: false,
      warning: { min: 5, max: 50 },
      critical: { min: 0, max: 55 }
    },
    validation: { min: -20, max: 70, step: 1 },
    advanced: ['ignoreWhen', 'requireWhen'],
    engineFamilies: null
  },

  governorRpm1: {
    id: 'governorRpm1',
    name: 'Governor RPM 1',
    category: 'engine',
    unit: 'RPM',
    description: 'Governor RPM setpoint 1 (idle speed target).',
    dataColumns: ['Gov1_rpm', 'gov1_rpm', 'GOV1_RPM'],
    thresholdType: THRESHOLD_TYPES.RANGE,
    evaluated: false, // v3.1: Not evaluated by anomaly engine (metadata only)
    defaults: {
      enabled: false,
      warning: { min: 500, max: 1000 },
      critical: { min: 400, max: 1200 }
    },
    validation: { min: 0, max: 5000, step: 50 },
    advanced: ['ignoreWhen', 'requireWhen'],
    engineFamilies: null
  },

  governorRpm2: {
    id: 'governorRpm2',
    name: 'Governor RPM 2',
    category: 'engine',
    unit: 'RPM',
    description: 'Governor RPM setpoint 2 (rated speed target).',
    dataColumns: ['Gov2_rpm', 'gov2_rpm', 'GOV2_RPM'],
    thresholdType: THRESHOLD_TYPES.RANGE,
    evaluated: false, // v3.1: Not evaluated by anomaly engine (metadata only)
    defaults: {
      enabled: false,
      warning: { min: 1200, max: 2000 },
      critical: { min: 1000, max: 2200 }
    },
    validation: { min: 0, max: 5000, step: 50 },
    advanced: ['ignoreWhen', 'requireWhen'],
    engineFamilies: null
  },

  governorRpm3: {
    id: 'governorRpm3',
    name: 'Governor RPM 3',
    category: 'engine',
    unit: 'RPM',
    description: 'Governor RPM setpoint 3 (high idle target).',
    dataColumns: ['Gov3_rpm', 'gov3_rpm', 'GOV3_RPM'],
    thresholdType: THRESHOLD_TYPES.RANGE,
    evaluated: false, // v3.1: Not evaluated by anomaly engine (metadata only)
    defaults: {
      enabled: false,
      warning: { min: 1500, max: 3000 },
      critical: { min: 1200, max: 3500 }
    },
    validation: { min: 0, max: 5000, step: 50 },
    advanced: ['ignoreWhen', 'requireWhen'],
    engineFamilies: null
  },

  runTimer: {
    id: 'runTimer',
    name: 'Run Timer',
    category: 'engine',
    unit: 'seconds',
    description: 'Engine run time since start. Used for warmup detection.',
    dataColumns: ['run_tmr_sec', 'run_timer', 'RUN_TIMER'],
    thresholdType: THRESHOLD_TYPES.CUSTOM,
    evaluated: false, // v3.1: Not evaluated by anomaly engine (metadata only)
    defaults: {
      enabled: false
    },
    validation: { min: 0, max: 999999, step: 1 },
    advanced: [],
    engineFamilies: null
  },

  // ============== KNOCK DETECTION ==============
  knockRetard: {
    id: 'knockRetard',
    name: 'Knock Retard',
    category: 'knock',
    unit: '°',
    description: 'Timing retard due to knock detection. High values indicate detonation.',
    dataColumns: ['KNK_retard', 'knock_retard', 'KNOCK_RETARD', 'knk_retard'],
    thresholdType: THRESHOLD_TYPES.MAX_ONLY,
    evaluated: true, // v3.1: Evaluated via knock.maxRetard mapping
    defaults: {
      enabled: true,
      warning: { max: 10 },
      critical: { max: 15 }
    },
    validation: { min: 0, max: 30, step: 1 },
    advanced: ['ignoreWhen', 'requireWhen'],
    engineFamilies: null
  },

  knockCount: {
    id: 'knockCount',
    name: 'Knock Count',
    category: 'knock',
    unit: 'events',
    description: 'Total knock events detected.',
    dataColumns: ['KNK_COUNT', 'knock_count', 'knock_events'],
    thresholdType: THRESHOLD_TYPES.MAX_ONLY,
    evaluated: false, // v3.1: Not evaluated by anomaly engine (metadata only)
    defaults: {
      enabled: false,
      warning: { max: 50 },
      critical: { max: 100 }
    },
    validation: { min: 0, max: 10000, step: 1 },
    advanced: ['ignoreWhen', 'requireWhen'],
    engineFamilies: null
  },

  knockPercentage: {
    id: 'knockPercentage',
    name: 'Knock Time %',
    category: 'knock',
    unit: '%',
    description: 'Percentage of run time with active knock retard.',
    dataColumns: ['KNK_PCT', 'knock_percentage', 'knock_pct'],
    thresholdType: THRESHOLD_TYPES.MAX_ONLY,
    evaluated: true, // v3.1: Evaluated via knock.percentageThreshold mapping
    defaults: {
      enabled: true,
      warning: { max: 5 },
      critical: { max: 10 }
    },
    validation: { min: 0, max: 100, step: 1 },
    advanced: ['ignoreWhen', 'requireWhen'],
    engineFamilies: null
  },

  // ============== MFG FUEL SYSTEM (40L/53L) ==============
  mfgDeltaPressure: {
    id: 'mfgDeltaPressure',
    name: 'MFG Delta Pressure',
    category: 'mfg',
    unit: 'psi',
    description: 'Mass Flow Gas valve differential pressure. Monitors fuel flow consistency.',
    dataColumns: ['MFG_DPPress', 'mfg_dp', 'mfg_delta_pressure'],
    thresholdType: THRESHOLD_TYPES.RANGE,
    evaluated: false, // v3.1: Not evaluated by anomaly engine (metadata only)
    defaults: {
      enabled: false,
      warning: { min: 1, max: 8 },
      critical: { min: 0.5, max: 10 }
    },
    validation: { min: 0, max: 20, step: 0.1 },
    advanced: ['ignoreWhen', 'requireWhen'],
    engineFamilies: ['psi-hd']
  },

  mfgUpstreamPressure: {
    id: 'mfgUpstreamPressure',
    name: 'MFG Upstream Pressure',
    category: 'mfg',
    unit: 'psi',
    description: 'Pressure upstream of MFG valve. Monitors fuel supply.',
    dataColumns: ['MFG_USPress', 'mfg_us', 'mfg_upstream'],
    thresholdType: THRESHOLD_TYPES.RANGE,
    evaluated: false, // v3.1: Not evaluated by anomaly engine (metadata only)
    defaults: {
      enabled: false,
      warning: { min: 5, max: 25 },
      critical: { min: 3, max: 30 }
    },
    validation: { min: 0, max: 50, step: 0.5 },
    advanced: ['ignoreWhen', 'requireWhen'],
    engineFamilies: ['psi-hd']
  },

  mfgDownstreamPressure: {
    id: 'mfgDownstreamPressure',
    name: 'MFG Downstream Pressure',
    category: 'mfg',
    unit: 'psi',
    description: 'Pressure downstream of MFG valve. Monitors fuel delivery.',
    dataColumns: ['MFG_DSPress', 'mfg_ds', 'mfg_downstream'],
    thresholdType: THRESHOLD_TYPES.RANGE,
    evaluated: false, // v3.1: Not evaluated by anomaly engine (metadata only)
    defaults: {
      enabled: false,
      warning: { min: 3, max: 20 },
      critical: { min: 2, max: 25 }
    },
    validation: { min: 0, max: 50, step: 0.5 },
    advanced: ['ignoreWhen', 'requireWhen'],
    engineFamilies: ['psi-hd']
  },

  mfgThrottleActual: {
    id: 'mfgThrottleActual',
    name: 'MFG Throttle Actual',
    category: 'mfg',
    unit: '%',
    description: 'Actual MFG throttle position. Monitors actuator response.',
    dataColumns: ['MFG_TPS_act_pct', 'mfg_throttle_actual', 'mfg_tps_act'],
    thresholdType: THRESHOLD_TYPES.RANGE,
    evaluated: false, // v3.1: Not evaluated by anomaly engine (metadata only)
    defaults: {
      enabled: false,
      warning: { min: 0, max: 100 },
      critical: { min: 0, max: 100 }
    },
    validation: { min: 0, max: 100, step: 1 },
    advanced: ['ignoreWhen', 'requireWhen'],
    engineFamilies: ['psi-hd']
  },

  mfgThrottleCommand: {
    id: 'mfgThrottleCommand',
    name: 'MFG Throttle Command',
    category: 'mfg',
    unit: '%',
    description: 'Commanded MFG throttle position. Compare with actual for following error.',
    dataColumns: ['MFG_TPS_cmd_pct', 'mfg_throttle_command', 'mfg_tps_cmd'],
    thresholdType: THRESHOLD_TYPES.RANGE,
    evaluated: false, // v3.1: Not evaluated by anomaly engine (metadata only)
    defaults: {
      enabled: false,
      warning: { min: 0, max: 100 },
      critical: { min: 0, max: 100 }
    },
    validation: { min: 0, max: 100, step: 1 },
    advanced: ['ignoreWhen', 'requireWhen'],
    engineFamilies: ['psi-hd']
  },

  mfgThrottleError: {
    id: 'mfgThrottleError',
    name: 'MFG Throttle Error',
    category: 'mfg',
    unit: '%',
    description: 'Difference between commanded and actual MFG throttle position.',
    dataColumns: ['MFG_TPS_err', 'mfg_throttle_error'],
    thresholdType: THRESHOLD_TYPES.MAX_ONLY,
    evaluated: false, // v3.1: Not evaluated by anomaly engine (metadata only)
    defaults: {
      enabled: false,
      warning: { max: 5 },
      critical: { max: 10 }
    },
    validation: { min: 0, max: 100, step: 1 },
    advanced: ['ignoreWhen', 'requireWhen'],
    engineFamilies: ['psi-hd']
  },

  // ============== SIGNAL QUALITY ==============
  signalQuality: {
    id: 'signalQuality',
    name: 'Signal Dropout Detection',
    category: 'signals',
    unit: '',
    description: 'Detect missing/NaN values in sensor signals during engine operation.',
    dataColumns: [],
    thresholdType: THRESHOLD_TYPES.CUSTOM,
    evaluated: true, // v3.1: Evaluated by anomaly engine
    defaults: {
      enabled: true,
      alertSeverity: 'info',
      suppressRelatedAlerts: true,
      dropoutGapSec: 0.5
    },
    validation: { min: 0, max: 10, step: 0.1 },
    advanced: ['perChannelConfig'],
    engineFamilies: null
  }
};

/**
 * Get parameters by category
 */
export function getParametersByCategory(categoryId) {
  return Object.values(PARAMETER_CATALOG).filter(p => p.category === categoryId);
}

/**
 * Get all parameter IDs
 */
export function getAllParameterIds() {
  return Object.keys(PARAMETER_CATALOG);
}

/**
 * Get parameter by ID
 */
export function getParameter(parameterId) {
  return PARAMETER_CATALOG[parameterId] || null;
}

/**
 * Get parameters for a specific engine family
 */
export function getParametersForEngineFamily(engineFamily) {
  return Object.values(PARAMETER_CATALOG).filter(p =>
    p.engineFamilies === null || p.engineFamilies.includes(engineFamily)
  );
}

/**
 * Search parameters by name or description
 */
export function searchParameters(query) {
  const lowerQuery = query.toLowerCase();
  return Object.values(PARAMETER_CATALOG).filter(p =>
    p.name.toLowerCase().includes(lowerQuery) ||
    p.description.toLowerCase().includes(lowerQuery) ||
    p.id.toLowerCase().includes(lowerQuery)
  );
}

/**
 * Validate a threshold value against parameter constraints
 */
export function validateThresholdValue(parameterId, field, value) {
  const param = PARAMETER_CATALOG[parameterId];
  if (!param) return { valid: false, error: 'Unknown parameter' };

  const { validation } = param;
  if (!validation) return { valid: true };

  if (typeof value !== 'number' || isNaN(value)) {
    return { valid: false, error: 'Value must be a number' };
  }

  if (value < validation.min) {
    return { valid: false, error: `Value must be at least ${validation.min}` };
  }

  if (value > validation.max) {
    return { valid: false, error: `Value must be at most ${validation.max}` };
  }

  return { valid: true };
}

/**
 * Get default thresholds for a parameter
 */
export function getDefaultThresholds(parameterId) {
  const param = PARAMETER_CATALOG[parameterId];
  if (!param) return null;
  return JSON.parse(JSON.stringify(param.defaults));
}

/**
 * Check if parameter supports hysteresis
 */
export function supportsHysteresis(parameterId) {
  const param = PARAMETER_CATALOG[parameterId];
  return param?.advanced?.includes('hysteresis') || false;
}

/**
 * Check if parameter supports conditions (ignoreWhen/requireWhen)
 */
export function supportsConditions(parameterId) {
  const param = PARAMETER_CATALOG[parameterId];
  return param?.advanced?.includes('ignoreWhen') || param?.advanced?.includes('requireWhen') || false;
}

/**
 * v3.1: Check if parameter is evaluated by the anomaly detection engine
 * Parameters with evaluated: false are metadata-only and won't trigger alerts
 */
export function isParameterEvaluated(parameterId) {
  const param = PARAMETER_CATALOG[parameterId];
  return param?.evaluated === true;
}

/**
 * v3.1: Get all evaluated parameter IDs
 */
export function getEvaluatedParameterIds() {
  return Object.values(PARAMETER_CATALOG)
    .filter(p => p.evaluated === true)
    .map(p => p.id);
}

/**
 * v3.1: Get all non-evaluated parameter IDs (metadata only)
 */
export function getNonEvaluatedParameterIds() {
  return Object.values(PARAMETER_CATALOG)
    .filter(p => p.evaluated === false)
    .map(p => p.id);
}

export default PARAMETER_CATALOG;
