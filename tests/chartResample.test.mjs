import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resampleForViewport,
  buildAlignedOverlayGrid,
  interpolateSample,
  buildTimeSamples,
  getNumeric,
  summarizeOverlayCoverage,
  isDiscreteChannel,
  zoomDomainAround,
  clampDomain,
  resolveLayoutChannels,
  CHART_LAYOUTS
} from '../src/lib/chartResample.js';
import { readSeriesTooltipValue } from '../src/lib/chartTooltip.js';
import { getChartThresholdLines } from '../src/lib/bplotThresholds.js';

test('resample preserves a non-RPM spike that row-decimation would drop', () => {
  const data = [];
  for (let i = 0; i < 5000; i += 1) {
    data.push({ Time: i * 0.1, rpm: 1800, MAP: 14, OILP_press: 40 });
  }
  data[2500] = { Time: 250, rpm: 1800, MAP: 41.7, OILP_press: 40 };

  const sampled = resampleForViewport(data, {
    targetPoints: 200,
    channels: ['rpm', 'MAP', 'OILP_press']
  });

  assert.ok(sampled.length <= 400, `expected a thinned series, got ${sampled.length}`);
  const peak = Math.max(...sampled.map((row) => row.MAP));
  assert.ok(peak >= 41, `expected MAP spike to survive, peak was ${peak}`);
});

test('zooming into a short window returns every raw sample', () => {
  const data = [];
  for (let i = 0; i < 1000; i += 1) {
    data.push({ Time: i, rpm: 1000 + i, MAP: 10 });
  }

  const windowed = resampleForViewport(data, {
    startTime: 80,
    endTime: 90,
    targetPoints: 400,
    channels: ['rpm', 'MAP']
  });

  assert.equal(windowed.length, 13);
  assert.equal(windowed[0].Time, 79);
  assert.equal(windowed[windowed.length - 1].Time, 91);
});

test('overlay grid keeps primary and secondary MAP independent', () => {
  const primary = [];
  const secondary = [];
  for (let i = 0; i <= 10; i += 1) {
    primary.push({ Time: i, MAP: 10 });
    secondary.push({ Time: i, MAP: 30 });
  }

  const grid = buildAlignedOverlayGrid({
    primaryRows: primary,
    secondaryRows: secondary,
    offsetSec: 0,
    channels: ['MAP']
  });

  const mid = grid.find((row) => row.Time === 5);
  assert.ok(mid);
  assert.equal(mid.MAP__primary, 10);
  assert.equal(mid.MAP__secondary, 30);
});

test('overlay still finds secondary RPM when the column is named RPM', () => {
  const primary = [
    { Time: 0, rpm: 1000, MAP: 10 },
    { Time: 2, rpm: 1100, MAP: 12 }
  ];
  const secondary = [
    { Time: 0, RPM: 1800, MAP: 20 },
    { Time: 2, RPM: 1900, MAP: 22 }
  ];
  assert.equal(getNumeric(secondary[0], 'rpm'), 1800);

  const grid = buildAlignedOverlayGrid({
    primaryRows: primary,
    secondaryRows: secondary,
    channels: ['rpm', 'MAP']
  });
  const first = grid.find((row) => row.Time === 0);
  assert.equal(first.rpm__primary, 1000);
  assert.equal(first.rpm__secondary, 1800);

  const coverage = summarizeOverlayCoverage({
    primaryRows: primary,
    secondaryRows: secondary,
    channels: ['rpm', 'MAP']
  });
  assert.deepEqual(coverage.matchedChannels, ['rpm', 'MAP']);
  assert.equal(coverage.missingChannels.length, 0);
  assert.ok(coverage.overlapSec > 0);
});

test('overlay grid shares timestamps so primary and secondary exist on the same hover', () => {
  const primary = [
    { Time: 0, rpm: 1000, MAP: 10 },
    { Time: 2, rpm: 1200, MAP: 20 }
  ];
  const secondary = [
    { Time: 0.1, rpm: 1010, MAP: 11 },
    { Time: 2.1, rpm: 1210, MAP: 21 }
  ];

  const grid = buildAlignedOverlayGrid({
    primaryRows: primary,
    secondaryRows: secondary,
    offsetSec: 0,
    channels: ['rpm', 'MAP']
  });

  assert.ok(grid.length >= 2);
  const withBoth = grid.filter((row) => (
    Number.isFinite(row.rpm__primary) && Number.isFinite(row.rpm__secondary)
  ));
  assert.ok(withBoth.length >= 2, 'expected aligned overlay rows to carry both roles');

  const atPrimaryStamp = grid.find((row) => row.Time === 0);
  assert.ok(atPrimaryStamp);
  assert.equal(atPrimaryStamp.rpm__primary, 1000);
  assert.equal(atPrimaryStamp.rpm__secondary, undefined);

  const atSecondaryStamp = grid.find((row) => row.Time === 0.1);
  assert.ok(atSecondaryStamp);
  assert.equal(atSecondaryStamp.rpm__secondary, 1010);
  assert.ok(Math.abs(atSecondaryStamp.rpm__primary - 1010) < 0.01);
});

test('overlay tooltip reads each file instead of a copied payload value', () => {
  const lookup = {
    MAP__primary: [{ time: 0, value: 10 }, { time: 10, value: 10 }],
    MAP__secondary: [{ time: 0, value: 30 }, { time: 10, value: 30 }]
  };
  const payload = [{
    dataKey: 'MAP__primary',
    value: 10,
    payload: { Time: 5, MAP__primary: 10, MAP__secondary: 10 }
  }];
  const primary = readSeriesTooltipValue({ key: 'MAP__primary', channel: 'MAP' }, payload, lookup, 5);
  const secondary = readSeriesTooltipValue({ key: 'MAP__secondary', channel: 'MAP' }, payload, lookup, 5);
  assert.equal(primary, 10);
  assert.equal(secondary, 30);
});

test('discrete channels hold the previous state instead of blending', () => {
  const samples = buildTimeSamples([
    { Time: 0, MILout_mirror: 0 },
    { Time: 10, MILout_mirror: 1 }
  ], 'MILout_mirror');

  assert.equal(isDiscreteChannel('MILout_mirror'), true);
  assert.equal(interpolateSample(samples, 4, 'hold'), 0);
  assert.equal(interpolateSample(samples, 4, 'linear'), 0.4);
});

test('zoom around a cursor stays inside the recording and never inverts', () => {
  const full = [0, 100];
  const zoomed = zoomDomainAround([20, 80], full, 50, 0.5);
  assert.ok(zoomed[1] > zoomed[0]);
  assert.ok(zoomed[0] >= 0);
  assert.ok(zoomed[1] <= 100);
  assert.ok((zoomed[1] - zoomed[0]) < 60);

  const clamped = clampDomain([-20, 5], full);
  assert.deepEqual(clamped, [0, 25]);
});

test('layout presets only keep channels that exist on the plot', () => {
  const resolved = resolveLayoutChannels(
    ['rpm', 'OILP_press', 'ECT', 'missing'],
    ['MAP', 'OILP_press', 'ECT']
  );
  assert.deepEqual(resolved, ['OILP_press', 'ECT']);
});

test('EDIS quick-filter layouts cover MAP/TIP, TPS Load Limit, Fuel Trim, Temp, Electrical, MFG', () => {
  const byId = Object.fromEntries(CHART_LAYOUTS.map((layout) => [layout.id, layout]));
  assert.deepEqual(Object.keys(byId).sort(), ['electrical', 'fuel', 'mapTip', 'mfg', 'temp', 'tpsLoad']);
  assert.equal(byId.fuel.label, 'Fuel Trim');
  assert.equal(byId.tpsLoad.label, 'TPS Load Limit');
  assert.deepEqual(byId.mapTip.channels, ['rpm', 'MAP', 'TIP', 'TIP_MAP_delta', 'TPS_pct', 'MILout_mirror', 'IAT']);
  assert.ok(!byId.mapTip.channels.includes('LoadLim_max_TPS'));
  assert.ok(!byId.mapTip.channels.includes('spk_adv'));
  assert.deepEqual(byId.tpsLoad.channels, ['rpm', 'MAP', 'TIP', 'MAT', 'LoadLim_max_TPS', 'TPS_pct', 'LoadLim_TPS_delta', 'A_BM1', 'CL_BM1', 'MILout_mirror']);
  assert.deepEqual(byId.fuel.channels, ['rpm', 'MAP', 'A_BM1', 'CL_BM1', 'fuel_ctl_mode', 'MILout_mirror', 'EGO1_volts', 'EGO2_volts', 'Phi_UEGO']);
  assert.deepEqual(byId.temp.channels, ['rpm', 'ECT', 'IAT', 'MAT', 'MAP', 'MILout_mirror', 'OILT']);
  assert.deepEqual(byId.electrical.channels, ['rpm', 'Vbat', 'Vsw', 'AUX_DIG1_volt', 'AUX_PU1_raw', 'AUX_PU2_raw', 'AUX_PU3_raw']);
  assert.deepEqual(byId.mfg.channels, ['rpm', 'MAP', 'Phi_UEGO', 'MILout_mirror', 'BP', 'MFG_TPS_act_pct', 'MFG_USPress', 'MFG_DPPress', 'MFG_DSPress', 'MFG_US_BP_delta']);
});
test('chart threshold guides expose oil and battery floors', () => {
  const oil = getChartThresholdLines('OILP_press');
  assert.ok(oil.some((line) => line.level === 'critical' && line.y === 6));
  assert.ok(oil.some((line) => line.level === 'warning' && line.y === 8));
  const battery = getChartThresholdLines('Vbat');
  assert.ok(battery.some((line) => line.label === 'Warning min'));
});
