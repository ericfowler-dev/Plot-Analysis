import test from 'node:test';
import assert from 'node:assert/strict';
import { estimateTimelineAlignment } from '../src/lib/bplotAlignment.js';

const signal = time => (
  Math.sin(time / 8) * 30 +
  Math.exp(-Math.pow((time - 35) / 3, 2)) * 400 +
  Math.exp(-Math.pow((time - 82) / 5, 2)) * 250
);

test('estimates the offset to add to a secondary timeline', () => {
  const primary = [];
  const secondary = [];
  for (let time = 0; time <= 120; time += 0.5) {
    primary.push({ Time: time, rpm: 900 + signal(time), TPS_pct: 30 + signal(time) / 20 });
    secondary.push({ Time: time, rpm: 900 + signal(time + 8), TPS_pct: 30 + signal(time + 8) / 20 });
  }

  const result = estimateTimelineAlignment(primary, secondary, {
    maxOffsetSec: 15,
    offsetStepSec: 0.5
  });

  assert.equal(result.offsetSec, 8);
  assert.ok(result.confidence > 0.9);
});
