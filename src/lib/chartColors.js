import { BPLOT_PARAMETERS, CHANNEL_UNIT_TYPES } from './bplotThresholds.js';

/**
 * Locked, name-stable colors for the traces techs plot every day.
 * Same-family signals sit near each other on the hue wheel;
 * unrelated families sit far apart (temp red vs O2 green vs pressure blue).
 */
export const CHANNEL_COLOR_MAP = {
  rpm: '#e2e8f0',
  RPM: '#e2e8f0',
  rpmd_gov: '#cbd5e1',
  TSC1_rpmcmd: '#94a3b8',

  ECT: '#ef4444',
  rECT: '#f87171',
  IAT: '#f97316',
  rIAT: '#fb923c',
  MAT: '#f59e0b',
  OILT: '#d97706',
  FT: '#b45309',
  AAT: '#ea580c',

  MAP: '#3b82f6',
  TIP: '#22d3ee',
  BP: '#64748b',
  OILP_press: '#1d4ed8',
  rMAP: '#60a5fa',

  TPS_pct: '#e879f9',
  TPS_cmd_pct: '#c026d3',
  LoadLim_max_TPS: '#a1a1aa',
  LoadLim_max_pct: '#71717a',
  MFG_TPS_act_pct: '#f0abfc',
  MFG_TPS_cmd_pct: '#d946ef',
  eng_load: '#c084fc',

  A_BM1: '#7c3aed',
  CL_BM1: '#c026d3',
  A_BM2: '#7c3aed',
  CL_BM2: '#ddd6fe',

  Phi_UEGO: '#84cc16',
  Phi_UEGO2: '#a3e635',
  Phi_cmd: '#65a30d',
  EGO1_volts: '#22c55e',
  EGO2_volts: '#4ade80',
  EGO3_volts: '#16a34a',
  EGO4_volts: '#86efac',

  Vbat: '#eab308',
  Vsw: '#facc15',

  MILout_mirror: '#94a3b8',
  fuel_ctl_mode: '#fb7185',
  fuel_type: '#fda4af',
  fuel_shutoff_chk: '#f43f5e',
  run_mode: '#cbd5e1',
  OILP_state: '#64748b',

  spk_adv: '#fde047',
  knk_retard: '#facc15',
  spark_shutoff_chk: '#fef08a',

  MFG_USPress: '#f97316',
  MFG_DSPress: '#eab308',
  MFG_DPPress: '#a855f7',
  MFG_DPPress_final: '#6d28d9',
  TIP_MAP_delta: '#818cf8',
  LoadLim_TPS_delta: '#f472b6',
  MFG_US_BP_delta: '#38bdf8',

  AUX_DIG1_volt: '#22d3ee',
  AUX_DIG2_volt: '#67e8f9',
  AUX_DIG3_volt: '#06b6d4',
  AUX_PU1_raw: '#a78bfa',
  AUX_PU2_raw: '#f472b6',
  AUX_PU3_raw: '#818cf8',
  AUX_PD1_raw: '#2dd4bf',
  AUX_PD2_raw: '#14b8a6',
  AUX_PD3_raw: '#5eead4'
};

export const FAMILY_PALETTES = {
  temperature: ['#ef4444', '#f97316', '#f59e0b', '#d97706', '#b45309', '#f87171', '#fb923c'],
  pressure: ['#3b82f6', '#22d3ee', '#1d4ed8', '#38bdf8', '#0ea5e9', '#64748b', '#2563eb'],
  rpm: ['#e2e8f0', '#cbd5e1', '#94a3b8', '#f8fafc'],
  throttle: ['#e879f9', '#c026d3', '#f0abfc', '#a1a1aa', '#d946ef'],
  trim: ['#a855f7', '#c084fc', '#7c3aed', '#ddd6fe'],
  afr: ['#84cc16', '#a3e635', '#65a30d', '#4d7c0f'],
  ego: ['#22c55e', '#4ade80', '#16a34a', '#86efac'],
  supply: ['#eab308', '#facc15', '#ca8a04', '#fde047'],
  spark: ['#fde047', '#facc15', '#fef08a', '#eab308'],
  status: ['#94a3b8', '#fb7185', '#cbd5e1', '#f43f5e', '#64748b'],
  aux: ['#22d3ee', '#a78bfa', '#f472b6', '#818cf8', '#2dd4bf', '#67e8f9'],
  mfg: ['#f97316', '#eab308', '#a855f7', '#38bdf8'],
  default: ['#eab308', '#3b82f6', '#ef4444', '#22c55e', '#a855f7', '#22d3ee', '#f97316', '#fde047']
};

export function parseHex(hex) {
  const value = String(hex || '').replace('#', '');
  if (value.length !== 6) return null;
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  if (![r, g, b].every(Number.isFinite)) return null;
  return { r, g, b };
}

export function hexToHsl(hex) {
  const rgb = parseHex(hex);
  if (!rgb) return null;
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return { h: h * 360, s, l };
}

export function hueDistance(hexA, hexB) {
  const a = hexToHsl(hexA);
  const b = hexToHsl(hexB);
  if (!a || !b) return 180;
  return Math.min(Math.abs(a.h - b.h), 360 - Math.abs(a.h - b.h));
}

function toHex({ r, g, b }) {
  const clamp = (n) => Math.max(0, Math.min(255, Math.round(n)));
  return `#${[clamp(r), clamp(g), clamp(b)].map((n) => n.toString(16).padStart(2, '0')).join('')}`;
}

export function mixHex(hexA, hexB, amount) {
  const a = parseHex(hexA);
  const b = parseHex(hexB);
  if (!a || !b) return hexA;
  const t = Math.max(0, Math.min(1, amount));
  return toHex({
    r: a.r + (b.r - a.r) * t,
    g: a.g + (b.g - a.g) * t,
    b: a.b + (b.b - a.b) * t
  });
}

export function shiftColorForSecondary(hex) {
  // Overlay secondary keeps the exact family color; dash pattern tells files apart.
  // Lightening toward white made 18 overlay traces look like one pastel smear.
  return hex;
}

export const SHORT_CHANNEL_NAMES = {
  rpm: 'RPM',
  RPM: 'RPM',
  MAP: 'MAP',
  TIP: 'TIP',
  BP: 'Baro',
  ECT: 'ECT',
  IAT: 'IAT',
  MAT: 'MAT',
  OILT: 'Oil T',
  TPS_pct: 'TPS',
  TPS_cmd_pct: 'TPS cmd',
  LoadLim_max_TPS: 'LoadLim TPS',
  A_BM1: 'Adapt trim',
  CL_BM1: 'CL trim',
  Phi_UEGO: 'Phi',
  EGO1_volts: 'EGO1',
  EGO2_volts: 'EGO2',
  Vbat: 'Vbat',
  Vsw: 'Vsw',
  MILout_mirror: 'MIL',
  fuel_ctl_mode: 'Fuel mode',
  spk_adv: 'Spark',
  MFG_TPS_act_pct: 'MFG TPS',
  MFG_USPress: 'MFG US',
  MFG_DSPress: 'MFG DS',
  MFG_DPPress: 'MFG ΔP',
  TIP_MAP_delta: 'TIP−MAP',
  LoadLim_TPS_delta: 'Lim−TPS',
  MFG_US_BP_delta: 'US−Baro',
  AUX_DIG1_volt: 'AUX DIG1',
  AUX_PU1_raw: 'AUX PU1',
  AUX_PU2_raw: 'AUX PU2',
  AUX_PU3_raw: 'AUX PU3'
};

export function shortChannelName(channel, role = null) {
  const base = SHORT_CHANNEL_NAMES[channel]
    || channel.replace(/_/g, ' ');
  if (role === 'primary') return `${base} · P`;
  if (role === 'secondary') return `${base} · S`;
  return base;
}

export function getColorFamily(channel) {
  if (!channel) return 'default';
  if (/^AUX[_-]/i.test(channel)) return 'aux';
  if (/^EGO\d/i.test(channel)) return 'ego';
  if (/^Phi_/i.test(channel)) return 'afr';
  if (/^(A_BM|CL_BM)/i.test(channel)) return 'trim';
  if (/_delta$/i.test(channel)) {
    if (/TPS|LoadLim/i.test(channel)) return 'throttle';
    return 'pressure';
  }
  if (/^MFG_/i.test(channel)) return 'mfg';
  if (/spk|spark|knk/i.test(channel)) return 'spark';
  if (/MIL|fuel_ctl|run_mode|shutoff|sync_state/i.test(channel)) return 'status';

  const unit = CHANNEL_UNIT_TYPES[channel];
  if (unit === 'temperature') return 'temperature';
  if (unit === 'pressure') return 'pressure';
  if (unit === 'rpm') return 'rpm';
  if (unit === 'percentage') return 'throttle';
  if (unit === 'voltage') {
    if (/^Vbat|^Vsw|battery/i.test(channel)) return 'supply';
    return 'supply';
  }

  const category = BPLOT_PARAMETERS[channel]?.category;
  if (category === 'temperature') return 'temperature';
  if (category === 'pressure') return 'pressure';
  if (category === 'electrical') return 'supply';
  if (category === 'auxiliary') return 'aux';
  if (category === 'ignition') return 'spark';
  if (category === 'fuel') return 'trim';
  if (category === 'engine' || category === 'system') return 'status';
  if (category === 'speed_control') return 'rpm';
  return 'default';
}

function hashName(value) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
}

export function assignChartColors(channels, { role = null } = {}) {
  const list = Array.isArray(channels) ? channels.filter(Boolean) : [];
  const used = new Set();
  const assigned = {};

  for (const channel of list) {
    const locked = CHANNEL_COLOR_MAP[channel];
    if (!locked) continue;
    assigned[channel] = locked;
    used.add(locked.toLowerCase());
  }

  for (const channel of list) {
    if (assigned[channel]) continue;
    const palette = FAMILY_PALETTES[getColorFamily(channel)] || FAMILY_PALETTES.default;
    const start = hashName(channel) % palette.length;
    let color = palette[start];
    for (let i = 0; i < palette.length; i += 1) {
      const candidate = palette[(start + i) % palette.length];
      if (!used.has(candidate.toLowerCase())) {
        color = candidate;
        break;
      }
    }
    assigned[channel] = color;
    used.add(color.toLowerCase());
  }

  if (role === 'secondary') {
    for (const channel of list) {
      assigned[channel] = shiftColorForSecondary(assigned[channel]);
    }
  }

  return assigned;
}

export function getDefaultChannelColor(channel, role = null, channels = null) {
  const set = Array.isArray(channels) && channels.length ? channels : [channel];
  const map = assignChartColors(set, { role });
  return map[channel] || FAMILY_PALETTES.default[0];
}
