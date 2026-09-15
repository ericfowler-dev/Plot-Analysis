import { getNumeric } from './chartResample.js';

export const DERIVED_CHANNELS = [
  {
    id: 'TIP_MAP_delta',
    name: 'TIP-MAP DELTA',
    unit: 'psia',
    unitType: 'pressure',
    description: 'Throttle inlet pressure minus manifold pressure',
    sources: ['TIP', 'MAP']
  },
  {
    id: 'LoadLim_TPS_delta',
    name: 'Load Limit − TPS',
    unit: '%',
    unitType: 'percentage',
    description: 'Load-limit max TPS minus actual TPS',
    sources: ['LoadLim_max_TPS', 'TPS_pct']
  },
  {
    id: 'MFG_US_BP_delta',
    name: 'MFG US − Baro',
    unit: 'psi',
    unitType: 'pressure',
    description: 'MFG upstream pressure minus barometric pressure',
    sources: ['MFG_USPress', 'BP']
  }
];

export const DERIVED_CHANNEL_IDS = DERIVED_CHANNELS.map((item) => item.id);

export function getDerivedChannel(id) {
  return DERIVED_CHANNELS.find((item) => item.id === id) || null;
}

export function availableDerivedChannels(channelSet) {
  const available = channelSet instanceof Set ? channelSet : new Set(channelSet || []);
  return DERIVED_CHANNELS.filter((item) => item.sources.every((source) => available.has(source)));
}

export function computeDerivedValue(row, spec) {
  if (!row || !spec) return null;
  const left = getNumeric(row, spec.sources[0]);
  const right = getNumeric(row, spec.sources[1]);
  if (left === null || right === null) return null;
  return left - right;
}

export function decorateRowsWithDerived(rows, channelSet = null) {
  if (!Array.isArray(rows) || rows.length === 0) return rows;
  const specs = channelSet
    ? availableDerivedChannels(channelSet)
    : DERIVED_CHANNELS;
  if (!specs.length) return rows;

  return rows.map((row) => {
    let extras = null;
    for (const spec of specs) {
      if (row[spec.id] != null) continue;
      const value = computeDerivedValue(row, spec);
      if (value === null) continue;
      if (!extras) extras = {};
      extras[spec.id] = value;
    }
    return extras ? { ...row, ...extras } : row;
  });
}
