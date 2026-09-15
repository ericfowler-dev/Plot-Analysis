import { findNearestSample, getTime } from './chartResample.js';

export const CURSOR_CLICK_MAX_SPAN_SEC = 0.15;
export const CURSOR_HIT_PX = 10;
export const CURSOR_A_COLOR = '#f43f5e';
export const CURSOR_B_COLOR = '#3b82f6';

export function parseChartTime(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = parseFloat(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

export function isClickNotDrag(startTime, endTime, threshold = CURSOR_CLICK_MAX_SPAN_SEC) {
  if (!Number.isFinite(startTime)) return false;
  if (!Number.isFinite(endTime)) return true;
  return Math.abs(endTime - startTime) <= threshold;
}

export function cursorHitSeconds(domain, plotWidth, slopPx = CURSOR_HIT_PX) {
  if (!Array.isArray(domain) || domain.length !== 2 || !Number.isFinite(plotWidth) || plotWidth <= 0) {
    return 0.05;
  }
  const span = domain[1] - domain[0];
  if (!Number.isFinite(span) || span <= 0) return 0.05;
  return (slopPx / plotWidth) * span;
}

export function hitTestCursor(time, cursorTime, domain, plotWidth) {
  if (!Number.isFinite(time) || !Number.isFinite(cursorTime)) return false;
  return Math.abs(time - cursorTime) <= cursorHitSeconds(domain, plotWidth);
}

export function snapTimeToRows(rows, time) {
  if (!Number.isFinite(time) || !Array.isArray(rows) || rows.length === 0) return time;
  const samples = [];
  for (const row of rows) {
    const rowTime = getTime(row);
    if (rowTime !== null) samples.push({ time: rowTime, value: rowTime });
  }
  const nearest = findNearestSample(samples, time);
  return nearest ? nearest.time : time;
}

export function valueAtTime(samples, time) {
  return findNearestSample(samples, time);
}

export function computeWindowStats(samples, startTime, endTime) {
  if (!Array.isArray(samples) || !Number.isFinite(startTime) || !Number.isFinite(endTime)) return null;
  const lo = Math.min(startTime, endTime);
  const hi = Math.max(startTime, endTime);
  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  let count = 0;
  for (const sample of samples) {
    if (!sample || sample.time < lo || sample.time > hi || typeof sample.value !== 'number') continue;
    count += 1;
    sum += sample.value;
    if (sample.value < min) min = sample.value;
    if (sample.value > max) max = sample.value;
  }
  if (!count) return null;
  return { min, max, mean: sum / count, count };
}

export function nudgeTime(rows, time, direction) {
  if (!Number.isFinite(time) || !Array.isArray(rows) || rows.length === 0) return time;
  const times = [];
  for (const row of rows) {
    const rowTime = getTime(row);
    if (rowTime !== null) times.push(rowTime);
  }
  if (!times.length) return time;
  if (direction < 0) {
    for (let i = times.length - 1; i >= 0; i -= 1) {
      if (times[i] < time - 1e-9) return times[i];
    }
    return times[0];
  }
  for (let i = 0; i < times.length; i += 1) {
    if (times[i] > time + 1e-9) return times[i];
  }
  return times[times.length - 1];
}
