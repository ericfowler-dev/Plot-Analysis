import { interpolateSample, isDiscreteChannel } from './chartResample.js';

export function parseTooltipNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = parseFloat(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

export function readSeriesTooltipValue(series, payload = [], lookup = {}, time = null) {
  if (Number.isFinite(time) && lookup[series.key]?.length) {
    const mode = isDiscreteChannel(series.channel) ? 'hold' : 'linear';
    const interpolated = interpolateSample(lookup[series.key], time, mode);
    if (interpolated !== null) return interpolated;
  }

  const row = payload.find((entry) => entry?.payload)?.payload;
  if (row) {
    const direct = parseTooltipNumber(row[series.key]);
    if (direct !== null) return direct;
  }

  const entry = payload.find((item) => String(item?.dataKey || '') === String(series.key));
  return parseTooltipNumber(entry?.value);
}
