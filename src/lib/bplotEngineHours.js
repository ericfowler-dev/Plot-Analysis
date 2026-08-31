// Engine-hour channels in B-Plot exports are counters expressed in hours.
// HM_RAM_seconds is retained for compatibility with the source calibration name;
// its recorded values are hours and must not be divided by 3600.
export const ENGINE_HOUR_COLUMN_CANDIDATES = [
  'Hour meter',
  'Hour Meter',
  'HourMeter',
  'Engine Hours',
  'HM_RAM_seconds',
  'hm_ram_seconds',
  'HM_RAM',
  'hm_ram',
  'hm_hours',
  'HM_Hours'
];

const toFiniteNumber = (value) => {
  const numeric = typeof value === 'number' ? value : parseFloat(value);
  return Number.isFinite(numeric) ? numeric : null;
};

export function findEngineHourColumn(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const keys = Object.keys(rows.find(row => row && typeof row === 'object') || {});
  return ENGINE_HOUR_COLUMN_CANDIDATES.reduce((match, candidate) => (
    match || keys.find(key => key.toLowerCase() === candidate.toLowerCase()) || null
  ), null);
}

export function normalizeEngineHourValue(_column, value) {
  return toFiniteNumber(value);
}

/**
 * Return the chronological first and last valid counter values.
 */
export function extractEngineHourWindow(rows) {
  const column = findEngineHourColumn(rows);
  if (!column) return null;

  const samples = rows
    .map((row, index) => ({
      index,
      time: toFiniteNumber(row?.Time),
      value: normalizeEngineHourValue(column, row?.[column])
    }))
    .filter(sample => sample.value !== null)
    .sort((a, b) => {
      if (a.time === null && b.time === null) return a.index - b.index;
      if (a.time === null) return 1;
      if (b.time === null) return -1;
      return a.time - b.time || a.index - b.index;
    });

  if (samples.length === 0) return null;
  const start = samples[0].value;
  const end = samples[samples.length - 1].value;
  return {
    column,
    start,
    end,
    duration: Math.abs(end - start)
  };
}

export function formatEngineHourValue(value, decimals = 2) {
  return Number.isFinite(value) ? value.toFixed(decimals) : '-';
}
