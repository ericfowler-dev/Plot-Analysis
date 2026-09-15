import { TIME_IN_STATE_CHANNELS, VALUE_MAPPINGS } from './bplotThresholds.js';

export const MAX_CHART_CHANNELS = 20;
export const TARGET_CHART_POINTS = 1600;
export const MIN_ZOOM_SPAN_SEC = 0.2;

export const CHART_LAYOUTS = [
  {
    id: 'mapTip',
    label: 'MAP / TIP',
    channels: ['rpm', 'MAP', 'TIP', 'LoadLim_max_TPS', 'TPS_pct', 'MILout_mirror', 'IAT', 'spk_adv']
  },
  {
    id: 'tpsLoad',
    label: 'TPS / Load',
    channels: ['rpm', 'MAP', 'TIP', 'MAT', 'LoadLim_max_TPS', 'TPS_pct', 'A_BM1', 'CL_BM1', 'MILout_mirror']
  },
  {
    id: 'fuel',
    label: 'Fuel Trim',
    channels: ['rpm', 'MAP', 'A_BM1', 'CL_BM1', 'fuel_ctl_mode', 'MILout_mirror', 'EGO1_volts', 'EGO2_volts', 'Phi_UEGO']
  },
  {
    id: 'temp',
    label: 'Temp',
    channels: ['rpm', 'ECT', 'IAT', 'MAT', 'MAP', 'MILout_mirror', 'OILT']
  },
  {
    id: 'electrical',
    label: 'Electrical',
    channels: ['rpm', 'Vbat', 'Vsw', 'AUX_DIG1_volt', 'AUX_PU1_raw', 'AUX_PU2_raw', 'AUX_PU3_raw']
  },
  {
    id: 'mfg',
    label: 'MFG',
    channels: ['rpm', 'MAP', 'Phi_UEGO', 'MILout_mirror', 'BP', 'MFG_TPS_act_pct', 'MFG_USPress', 'MFG_DPPress', 'MFG_DSPress']
  }
];

export function isDiscreteChannel(channelName) {
  if (!channelName) return false;
  if (channelName === 'sync_state') return true;
  if (TIME_IN_STATE_CHANNELS.includes(channelName)) return true;
  return Boolean(VALUE_MAPPINGS[channelName]);
}

export function getTime(row) {
  if (!row) return null;
  const value = typeof row.Time === 'number' ? row.Time : parseFloat(row.Time);
  return Number.isFinite(value) ? value : null;
}

export function getNumeric(row, key) {
  if (!row || key == null) return null;
  const value = row[key];
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (value === null || value === undefined || value === '') return null;
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function formatChartTick(value) {
  if (typeof value !== 'number' || Number.isNaN(value)) return '';
  const abs = Math.abs(value);
  if (abs < 60) return `${value.toFixed(abs < 10 ? 2 : 1)}s`;
  if (abs < 3600) return `${(value / 60).toFixed(1)}m`;
  return `${(value / 3600).toFixed(2)}h`;
}

export function getTimeDomain(data) {
  if (!Array.isArray(data) || data.length === 0) return null;
  let start = null;
  let end = null;
  for (const row of data) {
    const time = getTime(row);
    if (time === null) continue;
    if (start === null || time < start) start = time;
    if (end === null || time > end) end = time;
  }
  if (start === null || end === null) return null;
  return [start, end];
}

export function lowerBoundTime(data, target) {
  let lo = 0;
  let hi = data.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    const midTime = getTime(data[mid]);
    if (midTime === null || midTime < target) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export function upperBoundTime(data, target) {
  let lo = 0;
  let hi = data.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    const midTime = getTime(data[mid]);
    if (midTime === null || midTime <= target) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export function sliceTimeWindow(data, startTime, endTime) {
  if (!Array.isArray(data) || data.length === 0) return [];
  const hasStart = Number.isFinite(startTime);
  const hasEnd = Number.isFinite(endTime);
  if (!hasStart && !hasEnd) return data;

  const lo = hasStart ? lowerBoundTime(data, startTime) : 0;
  const hi = hasEnd ? upperBoundTime(data, endTime) : data.length;
  const from = Math.max(0, lo - 1);
  const to = Math.min(data.length, Math.max(from, hi + 1));
  return data.slice(from, to);
}

export function buildTimeSamples(rows, channel) {
  const samples = [];
  if (!Array.isArray(rows) || !channel) return samples;
  for (const row of rows) {
    const time = getTime(row);
    const value = getNumeric(row, channel);
    if (time === null || value === null) continue;
    samples.push({ time, value });
  }
  return samples;
}

export function interpolateSample(samples, targetTime, mode = 'linear') {
  if (!Array.isArray(samples) || samples.length === 0 || !Number.isFinite(targetTime)) return null;

  let lo = 0;
  let hi = samples.length - 1;
  if (targetTime < samples[0].time) return null;
  if (targetTime > samples[hi].time) {
    return mode === 'hold' ? samples[hi].value : null;
  }
  if (targetTime === samples[0].time) return samples[0].value;
  if (targetTime === samples[hi].time) return samples[hi].value;

  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const sample = samples[mid];
    if (sample.time === targetTime) return sample.value;
    if (sample.time < targetTime) lo = mid + 1;
    else hi = mid - 1;
  }

  const before = samples[Math.max(0, hi)];
  const after = samples[Math.min(samples.length - 1, lo)];
  if (!before || !after) return null;
  if (mode === 'hold') return before.value;

  const span = after.time - before.time;
  if (span <= 0) return before.value;
  const ratio = (targetTime - before.time) / span;
  return before.value + (after.value - before.value) * ratio;
}

export function findNearestSample(samples, targetTime) {
  if (!Array.isArray(samples) || samples.length === 0 || !Number.isFinite(targetTime)) return null;

  let lo = 0;
  let hi = samples.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const candidateTime = samples[mid].time;
    if (candidateTime === targetTime) return samples[mid];
    if (candidateTime < targetTime) lo = mid + 1;
    else hi = mid - 1;
  }

  const candidates = [];
  if (lo < samples.length) candidates.push(samples[lo]);
  if (hi >= 0) candidates.push(samples[hi]);
  if (candidates.length === 0) return null;

  return candidates.reduce((best, candidate) => (
    !best || Math.abs(candidate.time - targetTime) < Math.abs(best.time - targetTime)
      ? candidate
      : best
  ), null);
}

function pickBucketExtrema(bucketRows, channels) {
  if (!bucketRows.length) return [];

  const analog = channels.filter((channel) => !isDiscreteChannel(channel));
  const discrete = channels.filter((channel) => isDiscreteChannel(channel));
  const driverPool = analog.length ? analog : channels;
  let driver = driverPool[0];
  let bestRange = -1;

  for (const channel of driverPool) {
    let min = Infinity;
    let max = -Infinity;
    for (const row of bucketRows) {
      const value = getNumeric(row, channel);
      if (value === null) continue;
      if (value < min) min = value;
      if (value > max) max = value;
    }
    if (max - min > bestRange) {
      bestRange = max - min;
      driver = channel;
    }
  }

  let minIndex = 0;
  let maxIndex = 0;
  let minValue = Infinity;
  let maxValue = -Infinity;
  const transitionIndexes = [];
  const previousDiscrete = {};

  for (let i = 0; i < bucketRows.length; i += 1) {
    const row = bucketRows[i];
    const value = driver ? getNumeric(row, driver) : null;
    if (value !== null) {
      if (value < minValue) {
        minValue = value;
        minIndex = i;
      }
      if (value > maxValue) {
        maxValue = value;
        maxIndex = i;
      }
    }

    for (const channel of discrete) {
      const discreteValue = getNumeric(row, channel);
      if (discreteValue === null) continue;
      if (i > 0 && previousDiscrete[channel] !== undefined && previousDiscrete[channel] !== discreteValue) {
        transitionIndexes.push(i);
      }
      previousDiscrete[channel] = discreteValue;
    }
  }

  const picked = new Set([0, bucketRows.length - 1, minIndex, maxIndex]);
  if (transitionIndexes.length) picked.add(transitionIndexes[0]);
  return Array.from(picked).sort((a, b) => a - b).map((index) => bucketRows[index]);
}

export function resampleForViewport(data, {
  startTime,
  endTime,
  targetPoints = TARGET_CHART_POINTS,
  channels = []
} = {}) {
  if (!Array.isArray(data) || data.length === 0) return [];

  const windowed = (Number.isFinite(startTime) || Number.isFinite(endTime))
    ? sliceTimeWindow(data, startTime, endTime)
    : data;

  if (windowed.length <= targetPoints) return windowed;

  const bucketCount = Math.max(2, Math.floor(targetPoints / 2));
  const sampled = [];
  const seenTimes = new Set();
  const pushRow = (row) => {
    const time = getTime(row);
    const key = time === null ? sampled.length : time;
    if (seenTimes.has(key)) return;
    seenTimes.add(key);
    sampled.push(row);
  };

  pushRow(windowed[0]);
  const count = windowed.length;
  for (let bucket = 0; bucket < bucketCount; bucket += 1) {
    const start = Math.floor((bucket * count) / bucketCount);
    const end = Math.floor(((bucket + 1) * count) / bucketCount);
    if (end <= start) continue;
    const extrema = pickBucketExtrema(windowed.slice(start, end), channels);
    extrema.forEach(pushRow);
  }
  pushRow(windowed[count - 1]);

  sampled.sort((a, b) => (getTime(a) ?? 0) - (getTime(b) ?? 0));
  return sampled;
}

function shiftWindow(rows, offsetSec, startTime, endTime) {
  const offset = Number.isFinite(offsetSec) ? offsetSec : 0;
  const windowed = sliceTimeWindow(
    rows,
    Number.isFinite(startTime) ? startTime - offset : startTime,
    Number.isFinite(endTime) ? endTime - offset : endTime
  );
  if (!offset) return windowed;
  const shifted = [];
  for (const row of windowed) {
    const time = getTime(row);
    if (time === null) continue;
    shifted.push({ ...row, Time: time + offset });
  }
  return shifted;
}

export function buildAlignedOverlayGrid({
  primaryRows = [],
  secondaryRows = [],
  offsetSec = 0,
  channels = [],
  startTime,
  endTime,
  targetPoints = TARGET_CHART_POINTS
} = {}) {
  const offset = Number.isFinite(offsetSec) ? offsetSec : 0;
  const primaryWindow = sliceTimeWindow(primaryRows, startTime, endTime);
  const secondaryWindow = shiftWindow(secondaryRows, offset, startTime, endTime);

  if (!primaryWindow.length && !secondaryWindow.length) return [];

  const primaryResampled = resampleForViewport(primaryWindow, {
    targetPoints: Math.max(200, Math.floor(targetPoints / 2)),
    channels
  });
  const secondaryResampled = resampleForViewport(secondaryWindow, {
    targetPoints: Math.max(200, Math.floor(targetPoints / 2)),
    channels
  });

  const times = [];
  const seen = new Set();
  const addTime = (row) => {
    const time = getTime(row);
    if (time === null || seen.has(time)) return;
    seen.add(time);
    times.push(time);
  };
  primaryResampled.forEach(addTime);
  secondaryResampled.forEach(addTime);
  times.sort((a, b) => a - b);
  if (!times.length) return [];

  const primarySamples = {};
  const secondarySamples = {};
  for (const channel of channels) {
    primarySamples[channel] = buildTimeSamples(primaryWindow, channel);
    secondarySamples[channel] = buildTimeSamples(secondaryWindow, channel);
  }

  return times.map((time) => {
    const point = { Time: time };
    for (const channel of channels) {
      const mode = isDiscreteChannel(channel) ? 'hold' : 'linear';
      const primaryValue = interpolateSample(primarySamples[channel], time, mode);
      const secondaryValue = interpolateSample(secondarySamples[channel], time, mode);
      if (primaryValue !== null) point[`${channel}__primary`] = primaryValue;
      if (secondaryValue !== null) point[`${channel}__secondary`] = secondaryValue;
    }
    return point;
  });
}

export function clampDomain(domain, fullDomain, minSpan = MIN_ZOOM_SPAN_SEC) {
  if (!Array.isArray(fullDomain) || fullDomain.length !== 2) return domain;
  const [fullStart, fullEnd] = fullDomain;
  if (!Number.isFinite(fullStart) || !Number.isFinite(fullEnd) || fullEnd <= fullStart) {
    return domain;
  }

  const fullSpan = fullEnd - fullStart;
  const spanFloor = Math.min(minSpan, fullSpan);
  let start = Number.isFinite(domain?.[0]) ? domain[0] : fullStart;
  let end = Number.isFinite(domain?.[1]) ? domain[1] : fullEnd;
  if (end < start) [start, end] = [end, start];

  let span = Math.max(spanFloor, end - start);
  span = Math.min(span, fullSpan);
  if (start < fullStart) start = fullStart;
  if (start + span > fullEnd) start = fullEnd - span;
  return [start, start + span];
}

export function zoomDomainAround(domain, fullDomain, cursorTime, factor) {
  const current = clampDomain(domain, fullDomain);
  if (!current) return domain;
  const [start, end] = current;
  const span = end - start;
  const cursor = Number.isFinite(cursorTime) ? Math.min(end, Math.max(start, cursorTime)) : (start + end) / 2;
  const nextSpan = span * factor;
  const ratio = span === 0 ? 0.5 : (cursor - start) / span;
  const nextStart = cursor - nextSpan * ratio;
  return clampDomain([nextStart, nextStart + nextSpan], fullDomain);
}

export function panDomain(domain, fullDomain, deltaSec) {
  if (!Number.isFinite(deltaSec)) return domain;
  const current = clampDomain(domain, fullDomain);
  if (!current) return domain;
  return clampDomain([current[0] + deltaSec, current[1] + deltaSec], fullDomain);
}

export function resolveLayoutChannels(layoutChannels, availableChannels, limit = MAX_CHART_CHANNELS) {
  if (!Array.isArray(layoutChannels) || !availableChannels) return [];
  const available = availableChannels instanceof Set
    ? availableChannels
    : new Set(availableChannels);
  const resolved = [];
  for (const channel of layoutChannels) {
    if (available.has(channel)) resolved.push(channel);
    else if (channel === 'rpm' && available.has('RPM')) resolved.push('RPM');
    else if (channel === 'RPM' && available.has('rpm')) resolved.push('rpm');
    if (resolved.length >= limit) break;
  }
  return resolved;
}
