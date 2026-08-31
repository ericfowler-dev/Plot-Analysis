const DEFAULT_CHANNELS = [
  'rpm',
  'RPM',
  'TPS_pct',
  'TPS_cmd_pct',
  'rpmd_gov',
  'MILout_mirror',
  'MFG_TPS_cmd_pct',
  'MFG_TPS_act_pct',
  'MFG_DPPress',
  'LoadLim_max_TPS'
];

const finite = value => {
  const parsed = typeof value === 'number' ? value : parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const findKey = (rows, candidate) => {
  const keys = Object.keys(rows?.[0] || {});
  return keys.find(key => key.toLowerCase() === candidate.toLowerCase()) || null;
};

const buildSamples = (rows, key) => rows
  .map(row => ({ time: finite(row?.Time), value: finite(row?.[key]) }))
  .filter(sample => sample.time !== null && sample.value !== null)
  .sort((a, b) => a.time - b.time);

const interpolate = (samples, targetTime) => {
  let left = 0;
  let right = samples.length - 1;
  while (left <= right) {
    const mid = (left + right) >> 1;
    const sample = samples[mid];
    if (sample.time === targetTime) return sample.value;
    if (sample.time < targetTime) left = mid + 1;
    else right = mid - 1;
  }

  if (right < 0 || left >= samples.length) return null;
  const before = samples[right];
  const after = samples[left];
  const span = after.time - before.time;
  if (span <= 0) return before.value;
  const ratio = (targetTime - before.time) / span;
  return before.value + (after.value - before.value) * ratio;
};

const correlationAtOffset = (primary, secondary, offsetSec) => {
  const start = Math.max(primary[0].time, secondary[0].time + offsetSec);
  const end = Math.min(primary[primary.length - 1].time, secondary[secondary.length - 1].time + offsetSec);
  const overlap = end - start;
  if (overlap < 10) return null;

  const sampleStep = Math.max(0.25, overlap / 800);
  let count = 0;
  let sumX = 0;
  let sumY = 0;
  let sumXX = 0;
  let sumYY = 0;
  let sumXY = 0;

  for (let time = start; time <= end; time += sampleStep) {
    const x = interpolate(primary, time);
    const y = interpolate(secondary, time - offsetSec);
    if (x === null || y === null) continue;
    count++;
    sumX += x;
    sumY += y;
    sumXX += x * x;
    sumYY += y * y;
    sumXY += x * y;
  }

  if (count < 20) return null;
  const varianceX = count * sumXX - sumX * sumX;
  const varianceY = count * sumYY - sumY * sumY;
  if (varianceX <= 1e-9 || varianceY <= 1e-9) return null;
  return (count * sumXY - sumX * sumY) / Math.sqrt(varianceX * varianceY);
};

const median = values => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

/**
 * Estimate the seconds to add to Secondary so shared signal events align with Primary.
 */
export function estimateTimelineAlignment(primaryRows, secondaryRows, options = {}) {
  if (!Array.isArray(primaryRows) || !Array.isArray(secondaryRows) ||
      primaryRows.length < 2 || secondaryRows.length < 2) {
    return { offsetSec: 0, confidence: 0, method: 'insufficient_data', channels: [] };
  }

  const maxOffsetSec = options.maxOffsetSec ?? 60;
  const offsetStepSec = options.offsetStepSec ?? 0.5;
  const candidates = options.channels || DEFAULT_CHANNELS;
  const results = [];
  const evaluatedPairs = new Set();

  for (const candidate of candidates) {
    const primaryKey = findKey(primaryRows, candidate);
    const secondaryKey = findKey(secondaryRows, candidate);
    if (!primaryKey || !secondaryKey) continue;
    const pairKey = `${primaryKey.toLowerCase()}::${secondaryKey.toLowerCase()}`;
    if (evaluatedPairs.has(pairKey)) continue;
    evaluatedPairs.add(pairKey);
    const primary = buildSamples(primaryRows, primaryKey);
    const secondary = buildSamples(secondaryRows, secondaryKey);
    if (primary.length < 20 || secondary.length < 20) continue;

    let bestOffset = 0;
    let bestScore = -Infinity;
    const zeroScore = correlationAtOffset(primary, secondary, 0) ?? -1;
    for (let offset = -maxOffsetSec; offset <= maxOffsetSec + 1e-9; offset += offsetStepSec) {
      const score = correlationAtOffset(primary, secondary, offset);
      if (score !== null && score > bestScore) {
        bestScore = score;
        bestOffset = offset;
      }
    }

    if (bestScore >= 0.35 && (bestScore - zeroScore >= 0.015 || bestScore >= 0.9)) {
      results.push({ channel: primaryKey, offsetSec: bestOffset, score: bestScore, zeroScore });
    }
  }

  if (results.length === 0) {
    return { offsetSec: 0, confidence: 0, method: 'no_correlated_channels', channels: [] };
  }

  const strongest = [...results].sort((a, b) => b.score - a.score).slice(0, 5);
  const offsetSec = median(strongest.map(result => result.offsetSec)) ?? 0;
  const deviation = median(strongest.map(result => Math.abs(result.offsetSec - offsetSec))) ?? 0;
  const meanScore = strongest.reduce((sum, result) => sum + result.score, 0) / strongest.length;
  const agreement = Math.max(0, 1 - deviation / 10);

  return {
    offsetSec: Math.round(offsetSec / offsetStepSec) * offsetStepSec,
    confidence: Math.max(0, Math.min(1, meanScore * agreement)),
    method: 'shared_signal_correlation',
    channels: strongest
  };
}
