// =============================================================================
// ECM VARIABLE DEFINITIONS
// Generated from variable definitions.xlsx
// =============================================================================

export const VARIABLE_DEFINITIONS = {
  // Adaptive and Closed Loop Fuel
  A_BM1: {
    name: 'Adaptive Fuel Trim - AL',
    description: 'Adaptive Learn Correction 1 - interpolated from LTFT table',
    unit: '%',
    range: '-35% to +35%',
    category: 'fuel'
  },
  CL_BM1: {
    name: 'Closed Loop Fuel Trim - CL',
    description: 'Closed Loop Block Multiplier - bank 1',
    unit: '%',
    range: '-35% to +35%',
    category: 'fuel'
  },
  A_BM2: {
    name: 'Adaptive Fuel Trim Bank 2',
    description: 'Adaptive Learn Correction 2 - interpolated from Gasoline Adaptive Table Bank 2',
    unit: '%',
    range: '-35% to +35%',
    category: 'fuel'
  },
  CL_BM2: {
    name: 'Closed Loop Fuel Trim Bank 2',
    description: 'Closed Loop Block Multiplier - bank 2',
    unit: '%',
    range: '-35% to +35%',
    category: 'fuel'
  },

  // Auxiliary Inputs
  AUX_DIG1_volt: { name: 'Aux Dig 1', description: 'AUX Digital Input 1 header voltage', unit: 'V', category: 'electrical' },
  AUX_DIG2_volt: { name: 'Aux Dig 2', description: 'AUX Digital Input 2 header voltage', unit: 'V', category: 'electrical' },
  AUX_DIG3_volt: { name: 'Aux Dig 3', description: 'AUX Digital Input 3 header voltage', unit: 'V', category: 'electrical' },
  AUX_PD1_raw: { name: 'Aux PD1', description: 'AUX Pull-Down Input 1 raw voltage', unit: 'V', category: 'electrical' },
  AUX_PD2_raw: { name: 'Aux PD2', description: 'AUX Pull-Down Input 2 raw voltage', unit: 'V', category: 'electrical' },
  AUX_PD3_raw: { name: 'Aux PD3', description: 'AUX Pull-Down Input 3 raw voltage', unit: 'V', category: 'electrical' },
  AUX_PU1_raw: { name: 'Aux PU1', description: 'AUX Pull-Up Input 1 raw voltage', unit: 'V', category: 'electrical' },
  AUX_PU2_raw: { name: 'Aux PU2', description: 'AUX Pull-Up Input 2 raw voltage', unit: 'V', category: 'electrical' },
  AUX_PU3_raw: { name: 'Aux PU3', description: 'AUX Pull-Up Input 3 raw voltage', unit: 'V', category: 'electrical' },
  AUX_PUD1_raw: { name: 'Aux PUD1', description: 'AUX Pull-Up/Pull-Down Input 1 raw voltage', unit: 'V', category: 'electrical' },
  AUX_PUD2_raw: { name: 'Aux PUD2', description: 'AUX Pull-Up/Pull-Down Input 2 raw voltage', unit: 'V', category: 'electrical' },
  AUX_PUD3_raw: { name: 'Aux PUD3', description: 'AUX Pull-Up/Pull-Down Input 3 raw voltage', unit: 'V', category: 'electrical' },

  // Pressure
  BP: {
    name: 'Barometric Pressure',
    description: 'Barometric Pressure measured once at key ON using TMAP sensor',
    unit: 'psia',
    category: 'air'
  },
  MAP: {
    name: 'Manifold Pressure',
    description: 'Intake Manifold Pressure used for engine load calculation',
    unit: 'psia',
    category: 'air'
  },
  rMAP: {
    name: 'Manifold Pressure',
    description: 'Intake Manifold Pressure (resolved)',
    unit: 'psia',
    category: 'air'
  },
  TIP: {
    name: 'Throttle Inlet Pressure',
    description: 'Throttle inlet pressure measured upstream of throttle blade',
    unit: 'psia',
    category: 'air'
  },
  OILP_press: {
    name: 'Oil Pressure',
    description: 'Engine oil pressure',
    unit: 'psi',
    category: 'thermal'
  },
  OILP_state: {
    name: 'Oil Pressure State',
    description: 'Oil pressure state (0=OK, 2=LOW)',
    unit: '',
    category: 'thermal',
    values: { 0: 'OK', 2: 'LOW' }
  },

  // Temperature
  ECT: { name: 'Engine Coolant Temp', description: 'Engine Coolant Temperature', unit: '°F', category: 'thermal' },
  rECT: { name: 'Engine Coolant Temp', description: 'Engine Coolant Temperature', unit: '°F', category: 'thermal' },
  ECTdt: { name: 'ECT Change Rate', description: 'Engine Coolant Temperature change rate', unit: '°F/s', category: 'thermal' },
  ECTs: { name: 'ECT Standard Operating', description: 'Standard operating Engine Coolant Temperature', unit: '°F', category: 'thermal' },
  IAT: { name: 'Intake Air Temp', description: 'Intake Air Temperature measured by TMAP thermistor', unit: '°F', category: 'thermal' },
  rIAT: { name: 'Intake Air Temp', description: 'Intake Air Temperature', unit: '°F', category: 'thermal' },
  MAT: { name: 'Manifold Temperature', description: 'Intake manifold runner temperature', unit: '°F', category: 'thermal' },
  FT: { name: 'Fuel Temperature', description: 'Fuel Temperature', unit: '°F', category: 'thermal' },
  OILT: { name: 'Oil Temperature', description: 'Oil temperature', unit: '°F', category: 'thermal' },
  AAT: { name: 'Ambient Air Temp', description: 'Ambient Air Temperature', unit: '°F', category: 'thermal' },
  ACT: { name: 'Auxiliary Coolant Temp', description: 'Auxiliary coolant temperature', unit: '°F', category: 'thermal' },
  UEGO_Tsensor: { name: 'UEGO Sensor Temp', description: 'UEGO sensor temperature actual', unit: '°F', category: 'thermal' },

  // Oxygen Sensors
  EGO1_volts: {
    name: 'EGO 1 Voltage',
    description: 'Exhaust Gas Oxygen Sensor 1 (Pre-Catalyst)',
    unit: 'V',
    range: '0.2V (Lean) to 0.8V (Rich)',
    category: 'fuel'
  },
  EGO2_volts: {
    name: 'EGO 2 Voltage',
    description: 'Exhaust Gas Oxygen Sensor 2 (Post-Catalyst)',
    unit: 'V',
    range: '0.6V to 0.8V',
    category: 'fuel'
  },
  EGO1Z_ohms: {
    name: 'EGO 1 Impedance',
    description: 'EGO1 measured impedance in ohms',
    unit: 'Ω',
    range: '20,000Ω (Cold) to 200Ω or less (Hot)',
    category: 'fuel'
  },
  EGO2Z_ohms: {
    name: 'EGO 2 Impedance',
    description: 'EGO2 measured impedance in ohms',
    unit: 'Ω',
    range: '20,000Ω (Cold) to 200Ω or less (Hot)',
    category: 'fuel'
  },
  Phi_UEGO: {
    name: 'UEGO Phi',
    description: 'UEGO phi sensor 1 - Equivalence ratio',
    unit: 'λ',
    range: 'Stoichiometric (Φ=1), Lean (Φ<1), Rich (Φ>1)',
    category: 'fuel'
  },
  Phi_UEGO2: { name: 'UEGO Phi 2', description: 'UEGO phi - sensor 2', unit: 'λ', category: 'fuel' },
  Phi_UEGO3: { name: 'UEGO Phi 3', description: 'UEGO phi - sensor 3', unit: 'λ', category: 'fuel' },
  Phi_UEGO4: { name: 'UEGO Phi 4', description: 'UEGO phi - sensor 4', unit: 'λ', category: 'fuel' },
  Phi_cmd: { name: 'Commanded Phi', description: 'Commanded equivalence ratio', unit: 'λ', category: 'fuel' },
  Phi_base: { name: 'Base Phi', description: 'Base lookup value commanded equivalence ratio', unit: 'λ', category: 'fuel' },
  EGO3_volts: { name: 'EGO 3 Voltage', description: 'Exhaust Gas Oxygen Sensor 3', unit: 'V', category: 'fuel' },
  EGO4_volts: { name: 'EGO 4 Voltage', description: 'Exhaust Gas Oxygen Sensor 4', unit: 'V', category: 'fuel' },
  EGO3Z_ohms: { name: 'EGO 3 Impedance', description: 'EGO3 measured impedance in ohms', unit: 'Ω', category: 'fuel' },
  EGO4Z_ohms: { name: 'EGO 4 Impedance', description: 'EGO4 measured impedance in ohms', unit: 'Ω', category: 'fuel' },
  EGO1_phiFB: { name: 'EGO1 Phi Feedback', description: 'EGO1 current phi', unit: 'λ', category: 'fuel' },
  EGO2_phiFB: { name: 'EGO2 Phi Feedback', description: 'EGO2 current phi', unit: 'λ', category: 'fuel' },

  // Throttle and Pedal
  TPS_pct: { name: 'TPS Position', description: 'DBW TPS position percent', unit: '%', category: 'air' },
  TPS_cmd_pct: { name: 'TPS Command', description: 'DBW TPS command percent', unit: '%', category: 'air' },
  TPS1_pct: { name: 'TPS1 Percent', description: 'DBW TPS1 percent', unit: '%', category: 'air' },
  TPS2_pct: { name: 'TPS2 Percent', description: 'DBW TPS2 percent', unit: '%', category: 'air' },
  TPS1_raw: { name: 'TPS1 Raw Voltage', description: 'Throttle position sensor 1 feedback', unit: 'V', category: 'air' },
  TPS2_raw: { name: 'TPS2 Raw Voltage', description: 'Throttle position sensor 2 feedback', unit: 'V', category: 'air' },
  FPP_pct: { name: 'FPP Position', description: 'Foot Pedal Position Actual', unit: '%', category: 'control' },
  FPP_cmd_pct: { name: 'FPP Command', description: 'Foot Pedal Position Command', unit: '%', category: 'control' },
  FPP1_pct: { name: 'FPP1 Percent', description: 'FPP1 percent', unit: '%', category: 'control' },
  FPP2_pct: { name: 'FPP2 Percent', description: 'FPP2 percent', unit: '%', category: 'control' },
  FPP1_rawfilt: { name: 'FPP1 Voltage', description: 'FPP1 raw (LPF) voltage', unit: 'V', category: 'control' },
  FPP2_rawfilt: { name: 'FPP2 Voltage', description: 'FPP2 raw (LPF) voltage', unit: 'V', category: 'control' },
  FPP1_full: { name: 'FPP1 Full Initial', description: 'Voltage at full open – FPP1', unit: 'V', category: 'control' },
  FPP1_idle: { name: 'FPP1 Idle Initial', description: 'Voltage at idle – FPP1', unit: 'V', category: 'control' },
  FPP2_full: { name: 'FPP2 Full Initial', description: 'Voltage at full open – FPP2', unit: 'V', category: 'control' },
  FPP2_idle: { name: 'FPP2 Idle Initial', description: 'Voltage at idle – FPP2', unit: 'V', category: 'control' },

  // Speed and Timing
  rpm: { name: 'Engine Speed', description: 'Engine speed', unit: 'RPM', category: 'timing' },
  rpmd_gov: { name: 'Governor Target', description: 'RPM trajectory target', unit: 'RPM', category: 'control' },
  spk_adv: { name: 'Spark Advance', description: 'Total final spark advance (°CAD BTDC)', unit: '°', category: 'timing' },
  run_tmr_sec: { name: 'Run Timer', description: 'Engine run time in seconds', unit: 'sec', category: 'timing' },
  start_tmr: { name: 'Start Time', description: 'Time from crank speed to run speed', unit: 'sec', category: 'timing' },
  HM_hours: { name: 'Hour Meter', description: 'Engine hour meter', unit: 'hours', category: 'timing' },
  HM_RAM_seconds: { name: 'Hour Meter (RAM)', description: 'Engine hour-meter including offset', unit: 'sec', category: 'timing' },
  HM_RAM_starts: { name: 'Cumulative Starts', description: 'Total number of engine starts', unit: '', category: 'timing' },
  HM_MIL_hours: { name: 'MIL On-Time', description: 'MIL on-time in hours', unit: 'hours', category: 'timing' },
  eng_load: { name: 'Engine Load', description: 'Fractional current engine load', unit: '%', category: 'timing' },

  // Fuel System
  fuel_type: {
    name: 'Fuel Type',
    description: 'Fuel type (NG, LPG, Diesel, Gasoline)',
    unit: '',
    category: 'fuel',
    values: { 0: 'Gasoline', 1: 'Propane', 2: 'Natural Gas' }
  },
  fuel_type_u16: {
    name: 'Fuel Type',
    description: 'Fuel type (NG, LPG, Diesel, Gasoline)',
    unit: '',
    category: 'fuel',
    values: { 0: 'Gasoline', 1: 'Propane', 2: 'Natural Gas' }
  },
  fuel_ctl_mode: {
    name: 'Fuel Control Mode',
    description: 'Current active fuel closed-loop control mode',
    unit: '',
    category: 'fuel',
    values: { 0: 'Open Loop', 2: 'Closed Loop', 3: 'CL + Adaptive' }
  },
  fuel_shutoff_chk: {
    name: 'Fuel Shutoff',
    description: 'Current fuel shutoff status',
    unit: '',
    category: 'fuel',
    values: { 0: 'Off (fuel enabled)', 1: 'On (fuel disabled)' }
  },
  FPin: { name: 'Fuel Rail Pressure', description: 'Gasoline fuel rail pressure', unit: 'psi', category: 'fuel' },
  PWe_avg: { name: 'Pulse Width Extended', description: 'Instantaneous total extended pulse width avg', unit: 'ms', category: 'fuel' },

  // EPR / MegaJector
  MJ_P_act: { name: 'EPR Actual Pressure', description: 'EPR feedback pressure', unit: 'psi', category: 'fuel' },
  MJ_P_cmd: { name: 'EPR Command Pressure', description: 'EPR pressure command', unit: 'psi', category: 'fuel' },
  EPR_cmd: { name: 'EPR Command', description: 'Electronic Pressure Regulator command', unit: 'psi', category: 'fuel' },
  EPR_actual: { name: 'EPR Actual', description: 'Electronic Pressure Regulator actual pressure', unit: 'psi', category: 'fuel' },
  EPR_DC_act: { name: 'EPR Duty Cycle', description: 'EPR duty cycle % feedback', unit: '%', category: 'fuel' },

  // MFG (Mixer/Fuel Gas)
  MFG_DPPress: { name: 'MFG Delta Pressure', description: 'Delta pressure between upstream and downstream MFG', unit: 'psi', category: 'fuel' },
  MFG_DSPress: { name: 'MFG Downstream Pressure', description: 'Pressure downstream of MFG throttle blade', unit: 'psi', category: 'fuel' },
  MFG_USPress: { name: 'MFG Upstream Pressure', description: 'Pressure upstream of MFG throttle blade', unit: 'psi', category: 'fuel' },
  MFG_TPS_act_pct: { name: 'MFG Throttle Actual', description: 'MFG actual throttle position %', unit: '%', category: 'fuel' },
  MFG_TPS_cmd_pct: { name: 'MFG Throttle Command', description: 'MFG commanded throttle position %', unit: '%', category: 'fuel' },
  MFG_mdot_act: { name: 'MFG Fuel Flow Actual', description: 'MFG reported mdot fuel flow', unit: 'g/s', category: 'fuel' },
  MFG_mdot_cmd: { name: 'MFG Fuel Flow Command', description: 'MFG commanded mdot fuel flow', unit: 'g/s', category: 'fuel' },
  MFG_mdot_act_pct: { name: 'MFG Flow Actual %', description: 'MFG reported mdot fuel flow percentage of MFG Full scale', unit: '%', category: 'fuel' },
  MFG_mdot_cmd_pct: { name: 'MFG Flow Command %', description: 'MFG commanded mdot fuel flow percentage of MFG Full scale', unit: '%', category: 'fuel' },
  MFG_status: { name: 'MFG Status', description: 'The overall status of the MFG', unit: '', category: 'fuel' },
  MFG_FTemp: { name: 'MFG Fuel Temperature', description: 'MFG fuel temperature', unit: '°F', category: 'fuel' },
  MFG_DPPress_final: { name: 'MFG Final Delta Pressure', description: 'MFG final dP used for mass-flow calculations', unit: 'psi', category: 'fuel' },

  // Electrical
  Vbat: { name: 'Battery Voltage', description: 'Battery voltage', unit: 'V', category: 'electrical' },
  Vsw: { name: 'Switched Voltage', description: 'Switched voltage to ECM (Key On)', unit: 'V', category: 'electrical' },

  // Governor
  Gov1_rpm: { name: 'Governor 1 RPM', description: 'Gov 1 current target speed', unit: 'RPM', category: 'control' },
  Gov1_volt: { name: 'Gov 1 Voltage', description: 'Governor 1 input voltage', unit: 'V', category: 'control' },
  Gov2_rpm: { name: 'Governor 2 RPM', description: 'Gov 2 current target speed', unit: 'RPM', category: 'control' },
  Gov2_volt: { name: 'Gov 2 Voltage', description: 'Governor 2 input voltage', unit: 'V', category: 'control' },
  Gov3_rpm: { name: 'Governor 3 RPM', description: 'Gov 3 current target speed', unit: 'RPM', category: 'control' },
  gov_max_abslimit: { name: 'Gov Max Limit', description: 'Absolute maximum upper speed bound', unit: 'RPM', category: 'control' },
  gov_min_abslimit: { name: 'Gov Min Limit', description: 'Absolute minimum lower speed bound', unit: 'RPM', category: 'control' },
  gov_sw_state: {
    name: 'Governor Switch State',
    description: 'Current governor selected switch state',
    unit: '',
    category: 'control',
    values: { 0: 'None', 1: 'GOV1', 2: 'GOV2', 3: 'GOV3' }
  },
  gov_type: {
    name: 'Active Governor Type',
    description: 'Current selected governor',
    unit: '',
    category: 'control',
    values: { 1: 'GOV1', 2: 'GOV2', 3: 'GOV3', 4: 'Min', 5: 'Max' }
  },
  max_gov_rpm: { name: 'Max Governor RPM', description: 'Max governor speed setting', unit: 'RPM', category: 'control' },
  min_gov_rpm: { name: 'Min Governor RPM', description: 'Min governor desired engine speed', unit: 'RPM', category: 'control' },

  // Remote/CAN
  RMT_speed: { name: 'TSC1 Speed Command', description: 'Speed command via J1939 from OEM controller', unit: 'RPM', category: 'control' },
  RMT_speed_SA: { name: 'TSC1 Speed Source Address', description: 'Remote speed source address', unit: '', category: 'control' },
  RS_speed: { name: 'Roadspeed', description: 'Current measured road speed', unit: 'mph', category: 'control' },
  RS_speed_d: { name: 'Roadspeed Limit Target', description: 'Desired roadspeed setpoint', unit: 'mph', category: 'control' },
  ME0mstr_MAP: { name: 'Master MAP Sync', description: 'Master/slave CAN sync MAP', unit: 'psia', category: 'control' },
  ME0slv1_MAP: { name: 'Slave 1 MAP Sync', description: 'Master/slave CAN sync MAP', unit: 'psia', category: 'control' },

  // Knock
  KNK_retard: { name: 'Knock Retard', description: 'Current knock retard command in CAD', unit: '°', category: 'timing' },
  KNKF_retard: { name: 'Knock Faulted Retard', description: 'Faulted KNK spark retard (CAD retard)', unit: '°', category: 'timing' },
  KNK_control_status: { name: 'Knock Control Status', description: 'Knock control system status', unit: '', category: 'timing' },

  // Load Limiting
  LoadLim_max_pct: { name: 'Load Limit Max %', description: 'Load limiting function maximum load', unit: '%', category: 'control' },
  LoadLim_max_TPS: { name: 'Load Limit Max TPS', description: 'Load limiting function maximum allowed TPS', unit: '%', category: 'control' },
  LoadLim_dmd_pct: { name: 'Load Limit Demand %', description: 'Load limiting function maximum load fraction - does not include derates', unit: '%', category: 'control' },
  LoadLim_max_gov_actv: { name: 'Load Limit Max Gov Active', description: 'Indicator for load limiting override of the Max Governor', unit: '', category: 'control' },

  // Status/Outputs
  FORCEIDLE_active: {
    name: 'Forced Idle Output',
    description: 'Logical indicating ongoing forced idle activity',
    unit: '',
    category: 'control',
    values: { 0: 'Off', 1: 'On' }
  },
  LOWREVLIM_active: {
    name: 'Low Rev Limit Output',
    description: 'Logical indicating ongoing low rev limit activity',
    unit: '',
    category: 'control',
    values: { 0: 'Off', 1: 'On' }
  },
  SD_active: {
    name: 'Shutdown Active',
    description: 'Shutdown derate is active',
    unit: '',
    category: 'control',
    values: { 0: 'Off', 1: 'On' }
  },
  derate1: {
    name: 'Derate 1 TPS',
    description: 'Maximum TPS % when derate 1 is active',
    unit: '%',
    category: 'control'
  },
  derate2: {
    name: 'Derate 2 TPS',
    description: 'Maximum TPS % when derate 2 is active',
    unit: '%',
    category: 'control'
  },
  MILout_mirror: {
    name: 'MIL Status',
    description: 'MIL output pin',
    unit: '',
    category: 'control',
    values: { 0: 'Not Active', 1: 'Active' }
  },
  spark_shutoff_chk: {
    name: 'Spark Shutoff',
    description: 'Spark shutoff status',
    unit: '',
    category: 'timing',
    values: { 0: 'Off (Spark enabled)', 1: 'On (Spark disabled)' }
  },
  sync_state: {
    name: 'Sync State',
    description: 'Engine synchronization state',
    unit: '',
    category: 'timing',
    values: { '-2': 'Cam', '-1': 'Crank', '0': 'Stopped' }
  },

  // VE Feedback
  VE5a_FB_raw: { name: 'VE Feedback Raw', description: 'VE feedback raw value', unit: '', category: 'fuel' },
  Phi1_post_delt: { name: 'Post Cat CL Offset', description: 'Post-catalyst phi target offset – sensor 1', unit: '', category: 'fuel' },
  TRIM_DC: { name: 'Trim Duty Cycle', description: 'Fuel trim duty cycle', unit: '%', category: 'fuel' },
  TRIM_BM: { name: 'Trim Block Multiplier', description: 'TRIM (fast) DC equivalent change from nominal Phi', unit: '%', category: 'fuel' },

  // CFV (Constant Flow Valve)
  CFV_cmd: { name: 'CFV Command', description: 'CFV flow command', unit: '', category: 'fuel' },
  CFV_FB: { name: 'CFV Feedback', description: 'CFV feedback position', unit: '', category: 'fuel' },

  // Additional Pressure Parameters
  MAPdt: { name: 'MAP Rate of Change', description: 'Rate of change of manifold absolute pressure', unit: 'psia/s', category: 'air' },

  // Boost Control
  Bst_cmd: { name: 'Boost Command', description: 'Boost pressure command', unit: 'psia', category: 'air' },
  Bst_act: { name: 'Boost Actual', description: 'Boost pressure actual', unit: 'psia', category: 'air' },
  WG_DC: { name: 'Wastegate Duty Cycle', description: 'Wastegate solenoid duty cycle', unit: '%', category: 'air' },

  // EGR
  EGR_pct: { name: 'EGR Percentage', description: 'EGR valve position percentage', unit: '%', category: 'air' },
  EGR_cmd_pct: { name: 'EGR Command', description: 'EGR valve command percentage', unit: '%', category: 'air' },

  // IAC (Idle Air Control)
  IAC_pct: { name: 'IAC Position', description: 'Idle Air Control valve position percentage', unit: '%', category: 'air' },
  IAC_cmd_pct: { name: 'IAC Command', description: 'Idle Air Control valve command percentage', unit: '%', category: 'air' },

  // Misc Timing
  CAD: { name: 'Crank Angle Degrees', description: 'Current crank angle degrees', unit: '°', category: 'timing' },
  cyl_fire: { name: 'Cylinder Fire', description: 'Current cylinder firing event', unit: '', category: 'timing' }
};

// Category display names and order
export const VARIABLE_CATEGORIES = {
  timing: { name: 'Timing & Context', icon: 'clock', order: 1 },
  fuel: { name: 'Fuel & Combustion', icon: 'flame', order: 2 },
  air: { name: 'Air System', icon: 'wind', order: 3 },
  electrical: { name: 'Electrical', icon: 'zap', order: 4 },
  thermal: { name: 'Thermal & Lubrication', icon: 'thermometer', order: 5 },
  control: { name: 'Speed & Control', icon: 'settings', order: 6 }
};

// Get variable info with fallback for unknown variables
export function getVariableInfo(varName) {
  if (VARIABLE_DEFINITIONS[varName]) {
    return VARIABLE_DEFINITIONS[varName];
  }
  // Return fallback for undefined variables
  return {
    name: varName,
    description: 'Undefined variable (raw ECM field)',
    unit: '',
    category: 'unknown'
  };
}

// Format a value based on variable definition
export function formatVariableValue(varName, value) {
  const info = getVariableInfo(varName);

  // Handle enum-type values
  if (info.values && info.values[value] !== undefined) {
    return info.values[value];
  }

  // Handle numeric values
  if (typeof value === 'number') {
    // Determine precision based on unit type
    if (info.unit === 'RPM' || info.unit === 'sec') {
      return Math.round(value).toString();
    } else if (info.unit === 'V' || info.unit === 'λ') {
      return value.toFixed(4);
    } else if (info.unit === '%' || info.unit === '°' || info.unit === 'psi' || info.unit === 'psia') {
      return value.toFixed(2);
    } else if (info.unit === '°F') {
      return value.toFixed(1);
    } else if (info.unit === 'hours') {
      return value.toFixed(4);
    } else {
      return value.toFixed(4);
    }
  }

  return String(value);
}

// Group snapshot variables by category
export function groupSnapshotByCategory(snapshot) {
  const groups = {};

  // Initialize all known categories
  Object.keys(VARIABLE_CATEGORIES).forEach(cat => {
    groups[cat] = [];
  });
  groups.unknown = [];

  // Group variables
  Object.entries(snapshot).forEach(([varName, value]) => {
    const info = getVariableInfo(varName);
    const category = info.category || 'unknown';

    if (!groups[category]) {
      groups[category] = [];
    }

    groups[category].push({
      varName,
      value,
      info,
      formattedValue: formatVariableValue(varName, value)
    });
  });

  return groups;
}
