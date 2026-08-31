import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractEngineHourWindow,
  normalizeEngineHourValue
} from '../src/lib/bplotEngineHours.js';

test('HM_RAM_seconds values are already engine hours', () => {
  assert.equal(normalizeEngineHourValue('HM_RAM_seconds', 1.49666667), 1.49666667);
});

test('engine-hour window uses chronological first and last values', () => {
  const window = extractEngineHourWindow([
    { Time: 20, HM_RAM_seconds: 2.2 },
    { Time: 0, HM_RAM_seconds: 1.5 },
    { Time: 10, HM_RAM_seconds: 1.8 }
  ]);

  assert.equal(window.column, 'HM_RAM_seconds');
  assert.equal(window.start, 1.5);
  assert.equal(window.end, 2.2);
  assert.ok(Math.abs(window.duration - 0.7) < 1e-9);
});
