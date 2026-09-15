import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CHANNEL_COLOR_MAP,
  assignChartColors,
  getColorFamily,
  hueDistance,
  shiftColorForSecondary
} from '../src/lib/chartColors.js';

test('ECT stays the same red no matter which channels are selected first', () => {
  const a = assignChartColors(['rpm', 'ECT', 'IAT']);
  const b = assignChartColors(['EGO1_volts', 'MAP', 'ECT']);
  assert.equal(a.ECT, CHANNEL_COLOR_MAP.ECT);
  assert.equal(b.ECT, CHANNEL_COLOR_MAP.ECT);
  assert.equal(a.ECT, b.ECT);
});

test('temperatures share a warm family and stay distinct from each other', () => {
  const colors = assignChartColors(['ECT', 'IAT', 'MAT', 'OILT']);
  assert.ok(hueDistance(colors.ECT, colors.IAT) < 50, `ECT vs IAT hue ${hueDistance(colors.ECT, colors.IAT)}`);
  assert.ok(hueDistance(colors.ECT, colors.MAT) < 55, `ECT vs MAT hue ${hueDistance(colors.ECT, colors.MAT)}`);
  const unique = new Set(Object.values(colors));
  assert.equal(unique.size, 4);
});

test('ECT and EGO1 sit on opposite sides of the hue wheel', () => {
  const colors = assignChartColors(['ECT', 'EGO1_volts']);
  const distance = hueDistance(colors.ECT, colors.EGO1_volts);
  assert.ok(distance > 90, `expected strong contrast, hue distance was ${distance}`);
  assert.equal(getColorFamily('ECT'), 'temperature');
  assert.equal(getColorFamily('EGO1_volts'), 'ego');
});

test('MAP and TIP are related blues, not the same color as coolant', () => {
  const colors = assignChartColors(['MAP', 'TIP', 'ECT']);
  assert.ok(hueDistance(colors.MAP, colors.TIP) < 50);
  assert.ok(hueDistance(colors.MAP, colors.ECT) > 90);
});

test('Temp layout traces are all unique', () => {
  const colors = assignChartColors(['rpm', 'ECT', 'IAT', 'MAT', 'MAP', 'MILout_mirror', 'OILT']);
  const unique = new Set(Object.values(colors));
  assert.equal(unique.size, 7);
});

test('overlay secondary uses the same family color so dash pattern tells files apart', () => {
  const primary = assignChartColors(['MAP', 'ECT']);
  const secondary = assignChartColors(['MAP', 'ECT'], { role: 'secondary' });
  assert.equal(secondary.MAP, primary.MAP);
  assert.equal(secondary.ECT, primary.ECT);
  assert.equal(shiftColorForSecondary(primary.ECT), primary.ECT);
});

test('MFG upstream is not another blue next to MAP', () => {
  const colors = assignChartColors(['MAP', 'MFG_USPress', 'MFG_DSPress', 'MFG_DPPress']);
  assert.ok(hueDistance(colors.MAP, colors.MFG_USPress) > 70, `MAP vs US hue ${hueDistance(colors.MAP, colors.MFG_USPress)}`);
  const unique = new Set(Object.values(colors));
  assert.equal(unique.size, 4);
});
