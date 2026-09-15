import test from 'node:test';
import assert from 'node:assert/strict';
import { decorateRowsWithDerived, availableDerivedChannels } from '../src/lib/chartDerived.js';
import { groupChannelsIntoPanes } from '../src/lib/chartPanes.js';
import { isLayoutActive, CHART_LAYOUTS } from '../src/lib/chartResample.js';
import {
  isClickNotDrag,
  computeWindowStats,
  snapTimeToRows,
  nudgeTime
} from '../src/lib/chartCursors.js';

test('TIP-MAP and load-limit derived traces are the source minus the source', () => {
  const rows = decorateRowsWithDerived([
    { Time: 1, TIP: 20, MAP: 14, LoadLim_max_TPS: 40, TPS_pct: 28, MFG_USPress: 16, BP: 14.7 }
  ]);
  assert.equal(rows[0].TIP_MAP_delta, 6);
  assert.equal(rows[0].LoadLim_TPS_delta, 12);
  assert.ok(Math.abs(rows[0].MFG_US_BP_delta - 1.3) < 1e-9);
});

test('derived channels only appear when both sources exist', () => {
  const available = availableDerivedChannels(['MAP', 'TIP', 'rpm']);
  assert.deepEqual(available.map((item) => item.id), ['TIP_MAP_delta']);
});

test('stacked panes split RPM, pressure, temp and digital', () => {
  const panes = groupChannelsIntoPanes(['rpm', 'MAP', 'TIP', 'ECT', 'MILout_mirror']);
  assert.deepEqual(panes.map((pane) => pane.id), ['yRPM', 'yPress', 'yTemp', 'digital']);
  assert.deepEqual(panes.find((pane) => pane.id === 'yPress').channels, ['MAP', 'TIP']);
});

test('a tiny pointer move is a cursor plant, a real drag is a zoom', () => {
  assert.equal(isClickNotDrag(10, 10.05), true);
  assert.equal(isClickNotDrag(10, 12), false);
});

test('window stats and snap/nudge follow the nearest samples', () => {
  const rows = [];
  for (let i = 0; i < 20; i += 1) rows.push({ Time: i, MAP: i * 2 });
  assert.equal(snapTimeToRows(rows, 4.6), 5);
  assert.equal(nudgeTime(rows, 5, 1), 6);
  assert.equal(nudgeTime(rows, 5, -1), 4);
  const stats = computeWindowStats(rows.map((row) => ({ time: row.Time, value: row.MAP })), 2, 4);
  assert.equal(stats.min, 4);
  assert.equal(stats.max, 8);
  assert.equal(stats.mean, 6);
});

test('a layout is active only when the selected channels match it', () => {
  const layout = CHART_LAYOUTS.find((item) => item.id === 'mapTip');
  const available = layout.channels;
  assert.equal(isLayoutActive(layout.channels, layout.channels, available), true);
  assert.equal(isLayoutActive(layout.channels, layout.channels.slice(0, -1), available), false);
});
