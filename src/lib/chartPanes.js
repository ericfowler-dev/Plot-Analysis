import { getYAxisId } from './bplotThresholds.js';
import { isDiscreteChannel } from './chartResample.js';

export const PANE_LABELS = {
  yRPM: 'RPM',
  yPress: 'Pressure',
  yTemp: 'Temperature',
  yPct: 'Percent',
  yVolt: 'Voltage',
  yDefault: 'Other',
  yAxisA: 'Axis A',
  yAxisB: 'Axis B',
  yAxisC: 'Axis C',
  digital: 'Digital'
};

export const PANE_ORDER = [
  'yRPM',
  'yPress',
  'yTemp',
  'yPct',
  'yVolt',
  'yDefault',
  'yAxisA',
  'yAxisB',
  'yAxisC',
  'digital'
];

export function paneIdForChannel(channel, axisAssignments = {}) {
  if (axisAssignments[channel]) return axisAssignments[channel];
  if (isDiscreteChannel(channel)) return 'digital';
  return getYAxisId(channel) || 'yDefault';
}

export function groupChannelsIntoPanes(channels, axisAssignments = {}) {
  const groups = new Map();
  for (const channel of channels || []) {
    const paneId = paneIdForChannel(channel, axisAssignments);
    if (!groups.has(paneId)) groups.set(paneId, []);
    groups.get(paneId).push(channel);
  }
  return PANE_ORDER
    .filter((paneId) => groups.has(paneId))
    .map((paneId) => ({
      id: paneId,
      label: PANE_LABELS[paneId] || paneId,
      channels: groups.get(paneId),
      flex: paneId === 'digital' ? 0.55 : 1
    }));
}
