// =============================================================================
// ECM THRESHOLDS AND CONFIGURATION
// Engine Control Module specific settings and thresholds
// =============================================================================

// ECM Product Detection
export function detectECMProduct(fileContent) {
  // Detect ECM type from file content
  if (fileContent.includes('4G ECM')) {
    return '4G_ECM';
  }
  if (fileContent.includes('Engine Control')) {
    return 'GENERIC_ECM';
  }
  return 'UNKNOWN';
}

// ECM Voltage and Current Thresholds
export const ECM_THRESHOLDS = {
  // Battery voltage thresholds
  batteryVoltage: {
    min: 10.0,      // Minimum battery voltage (V)
    max: 32.0,      // Maximum battery voltage (V)
    warningLow: 12.0,   // Low voltage warning
    warningHigh: 30.0   // High voltage warning
  },

  // Engine speed thresholds (RPM)
  engineSpeed: {
    idle: 600,      // Idle speed
    max: 5000,      // Maximum speed
    overspeed: 4500 // Overspeed warning
  },

  // Manifold pressure thresholds (psia)
  manifoldPressure: {
    min: 0.5,       // Minimum pressure
    max: 35.0,      // Maximum pressure
    atmospheric: 14.7 // Standard atmospheric pressure
  },

  // Engine coolant temperature thresholds (°F)
  coolantTemp: {
    min: 110,       // Minimum operating temp
    max: 240,       // Maximum operating temp
    warningHigh: 220, // High temperature warning
    criticalHigh: 235 // Critical high temperature
  },

  // Oil pressure thresholds (psi)
  oilPressure: {
    min: 10,        // Minimum oil pressure
    max: 100,       // Maximum oil pressure
    warningLow: 25, // Low pressure warning
    criticalLow: 15 // Critical low pressure
  },

  // Fuel system thresholds
  fuelSystem: {
    pressureMin: 30,    // Minimum fuel pressure (psi)
    pressureMax: 80,    // Maximum fuel pressure (psi)
    temperatureMax: 200 // Maximum fuel temperature (°F)
  },

  // Knock detection thresholds
  knockDetection: {
    maxEvents: 10,     // Maximum knock events per hour
    severityThreshold: 0.5 // Knock severity threshold
  },

  // Backfire detection
  backfireDetection: {
    maxEvents: 5,      // Maximum backfire events
    timeWindow: 3600   // Analysis window (seconds)
  }
};

// ECM Fault Code Mapping
export const ECM_FAULT_MAPPING = {
  // Common fault codes
  '1153': { name: 'Closed-loop NG high', severity: 2, category: 'Fuel System' },
  '1625': { name: 'J1939 shutdown request', severity: 3, category: 'Communications' },
  '1151': { name: 'Closed-loop Gasoline high', severity: 2, category: 'Fuel System' },
  '1152': { name: 'Closed-loop Gasoline low', severity: 2, category: 'Fuel System' },
  '1154': { name: 'Closed-loop NG low', severity: 2, category: 'Fuel System' },
  '1213': { name: 'Injector 1 peak current high', severity: 2, category: 'Injector' },
  '1214': { name: 'Injector 2 peak current high', severity: 2, category: 'Injector' },
  '1215': { name: 'Injector 3 peak current high', severity: 2, category: 'Injector' },
  '1216': { name: 'Injector 4 peak current high', severity: 2, category: 'Injector' },
  '1217': { name: 'Injector 5 peak current high', severity: 2, category: 'Injector' },
  '1218': { name: 'Injector 6 peak current high', severity: 2, category: 'Injector' },
  '1221': { name: 'Injector 1 peak current low', severity: 1, category: 'Injector' },
  '1222': { name: 'Injector 2 peak current low', severity: 1, category: 'Injector' },
  '1223': { name: 'Injector 3 peak current low', severity: 1, category: 'Injector' },
  '1224': { name: 'Injector 4 peak current low', severity: 1, category: 'Injector' },
  '1225': { name: 'Injector 5 peak current low', severity: 1, category: 'Injector' },
  '1226': { name: 'Injector 6 peak current low', severity: 1, category: 'Injector' },
  '1231': { name: 'Injector 1 offset high', severity: 1, category: 'Injector' },
  '1232': { name: 'Injector 2 offset high', severity: 1, category: 'Injector' },
  '1233': { name: 'Injector 3 offset high', severity: 1, category: 'Injector' },
  '1234': { name: 'Injector 4 offset high', severity: 1, category: 'Injector' },
  '1235': { name: 'Injector 5 offset high', severity: 1, category: 'Injector' },
  '1236': { name: 'Injector 6 offset high', severity: 1, category: 'Injector' },
  '1241': { name: 'Injector 1 offset low', severity: 1, category: 'Injector' },
  '1242': { name: 'Injector 2 offset low', severity: 1, category: 'Injector' },
  '1243': { name: 'Injector 3 offset low', severity: 1, category: 'Injector' },
  '1244': { name: 'Injector 4 offset low', severity: 1, category: 'Injector' },
  '1245': { name: 'Injector 5 offset low', severity: 1, category: 'Injector' },
  '1246': { name: 'Injector 6 offset low', severity: 1, category: 'Injector' },
  '1311': { name: 'EGO Sensor Circuit Slow Response Bank 1', severity: 1, category: 'Oxygen Sensor' },
  '1312': { name: 'EGO Sensor Circuit Slow Response Bank 2', severity: 1, category: 'Oxygen Sensor' },
  '1321': { name: 'Knock Control Limit Attained', severity: 1, category: 'Knock Control' },
  '1331': { name: 'Knock Sensor 1 Circuit Low Input', severity: 2, category: 'Knock Sensor' },
  '1332': { name: 'Knock Sensor 1 Circuit High Input', severity: 2, category: 'Knock Sensor' },
  '1333': { name: 'Knock Sensor 2 Circuit Low Input', severity: 2, category: 'Knock Sensor' },
  '1334': { name: 'Knock Sensor 2 Circuit High Input', severity: 2, category: 'Knock Sensor' },
  '1341': { name: 'EGO Sensor Circuit Low Voltage Bank 1', severity: 2, category: 'Oxygen Sensor' },
  '1342': { name: 'EGO Sensor Circuit Low Voltage Bank 2', severity: 2, category: 'Oxygen Sensor' },
  '1343': { name: 'EGO Sensor Circuit High Voltage Bank 1', severity: 2, category: 'Oxygen Sensor' },
  '1344': { name: 'EGO Sensor Circuit High Voltage Bank 2', severity: 2, category: 'Oxygen Sensor' },
  '1411': { name: 'Secondary Air Injection System Incorrect Flow Detected', severity: 2, category: 'Air Injection' },
  '1412': { name: 'Secondary Air Injection System Monitor Circuit Low Voltage', severity: 2, category: 'Air Injection' },
  '1413': { name: 'Secondary Air Injection System Monitor Circuit High Voltage', severity: 2, category: 'Air Injection' },
  '1431': { name: 'Fuel Level Sensor Circuit Performance', severity: 1, category: 'Fuel System' },
  '1432': { name: 'Fuel Level Sensor Circuit Low Voltage', severity: 1, category: 'Fuel System' },
  '1433': { name: 'Fuel Level Sensor Circuit High Voltage', severity: 1, category: 'Fuel System' },
  '1441': { name: 'Evaporative Emission Control System Incorrect Purge Flow', severity: 1, category: 'EVAP' },
  '1442': { name: 'Evaporative Emission Control System Small Leak Detected', severity: 1, category: 'EVAP' },
  '1443': { name: 'Evaporative Emission Control System Purge Control Valve Circuit', severity: 2, category: 'EVAP' },
  '1444': { name: 'Evaporative Emission Control System Purge Control Valve Circuit Open', severity: 2, category: 'EVAP' },
  '1445': { name: 'Evaporative Emission Control System Purge Control Valve Circuit Shorted', severity: 2, category: 'EVAP' },
  '1446': { name: 'Evaporative Emission Control System Vent Control Circuit', severity: 2, category: 'EVAP' },
  '1447': { name: 'Evaporative Emission Control System Vent Control Circuit Open', severity: 2, category: 'EVAP' },
  '1448': { name: 'Evaporative Emission Control System Vent Control Circuit Shorted', severity: 2, category: 'EVAP' },
  '1449': { name: 'Evaporative Emission Control System Vent Valve High During Ignition Off', severity: 2, category: 'EVAP' }
};

// ECM Severity Levels
export const ECM_SEVERITY_MAP = {
  1: { level: 'INFO', color: '#f59e0b', description: 'Informational - Monitor condition' },
  2: { level: 'WARNING', color: '#f97316', description: 'Warning - Requires attention' },
  3: { level: 'CRITICAL', color: '#ef4444', description: 'Critical - Immediate action required' }
};

// ECM Histogram Configuration
export const ECM_HISTOGRAM_CONFIG = {
  speedLoad: {
    title: 'Engine Speed vs Load Histogram',
    xAxis: 'Manifold Pressure (psia)',
    yAxis: 'Engine Speed (RPM)',
    unit: 'hours',
    description: 'Time spent at different engine speeds and manifold pressures'
  },
  knock: {
    title: 'Knock Detection Histogram',
    xAxis: 'Manifold Pressure (psia)',
    yAxis: 'Engine Speed (RPM)',
    unit: 'events',
    description: 'Engine knock events by speed and load',
    secondsPerUnit: 6.6
  },
  ect: {
    title: 'Engine Coolant Temperature Histogram',
    xAxis: 'Temperature (°F)',
    yAxis: 'Time (Hours)',
    unit: 'hours',
    description: 'Time spent at different coolant temperatures'
  },
  backfireLifetime: {
    title: 'Intake Backfire Events (Lifetime)',
    xAxis: 'Manifold Pressure (psia)',
    yAxis: 'Engine Speed (RPM)',
    unit: 'events',
    description: 'Total backfire events over engine lifetime'
  },
  backfireRecent: {
    title: 'Intake Backfire Events (Recent)',
    xAxis: 'Manifold Pressure (psia)',
    yAxis: 'Engine Speed (RPM)',
    unit: 'events',
    description: 'Recent backfire events'
  }
};

// ECM Parameter Definitions
export const ECM_PARAMETERS = {
  rpm: { name: 'Engine Speed', unit: 'RPM', description: 'Engine rotational speed' },
  BP: { name: 'Boost Pressure', unit: 'psia', description: 'Manifold absolute pressure' },
  Vbat: { name: 'Battery Voltage', unit: 'V', description: 'Battery system voltage' },
  EGO1_volts: { name: 'EGO1 Voltage', unit: 'V', description: 'Exhaust gas oxygen sensor 1 voltage' },
  EGO2_volts: { name: 'EGO2 Voltage', unit: 'V', description: 'Exhaust gas oxygen sensor 2 voltage' },
  TPS_pct: { name: 'Throttle Position', unit: '%', description: 'Throttle position percentage' },
  CL_BM1: { name: 'Closed Loop Base Fuel Bank 1', unit: '%', description: 'Closed loop fuel trim bank 1' },
  A_BM1: { name: 'Adaptive Fuel Bank 1', unit: '%', description: 'Adaptive fuel trim bank 1' },
  run_tmr_sec: { name: 'Run Timer', unit: 'seconds', description: 'Engine run time in seconds' },
  Phi_UEGO: { name: 'Air/Fuel Ratio', unit: 'λ', description: 'Air-fuel ratio from wideband sensor' },
  rMAP: { name: 'Relative MAP', unit: 'psia', description: 'Relative manifold absolute pressure' },
  rECT: { name: 'Relative ECT', unit: '°F', description: 'Relative engine coolant temperature' },
  rIAT: { name: 'Relative IAT', unit: '°F', description: 'Relative intake air temperature' },
  OILP_press: { name: 'Oil Pressure', unit: 'psi', description: 'Engine oil pressure' },
  spk_adv: { name: 'Spark Advance', unit: '°', description: 'Ignition spark advance' },
  FPP_pct: { name: 'Fuel Pump Duty Cycle', unit: '%', description: 'Fuel pump duty cycle' },
  TIP: { name: 'Throttle Inlet Pressure', unit: 'psia', description: 'Throttle inlet pressure' },
  rpmd_gov: { name: 'Governor Desired RPM', unit: 'RPM', description: 'Governor desired engine speed' },
  VE5a_FB_raw: { name: 'Volumetric Efficiency Feedback', unit: 'raw', description: 'Raw volumetric efficiency feedback' }
};

// ECM Fuel Types
export const ECM_FUEL_TYPES = {
  0: 'Gasoline',
  1: 'Propane (LPG)',
  2: 'Natural Gas (NG)',
  3: 'Diesel',
  4: 'Ethanol',
  5: 'Methanol'
};

// ECM System States
export const ECM_SYSTEM_STATES = {
  0: 'Engine Off',
  1: 'Cranking',
  2: 'Running',
  3: 'Shutdown',
  4: 'Fault Shutdown',
  5: 'Idle',
  6: 'Load'
};
