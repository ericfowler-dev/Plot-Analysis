import fs from 'fs';
import { parseBPlotData } from './src/lib/bplotParsers.js';
import { resolveProfile } from './server/utils/thresholdMerger.js';
import { detectAnomalies } from './src/lib/anomalyEngine.js';

const csvPath = 'example_files/40L_plot master 2024-0626-A-775kw-load-shut-down.csv';
const csv = fs.readFileSync(csvPath, 'utf8');
const { data } = parseBPlotData(csv);

const thresholds = await resolveProfile('psi-hd-40l-53l-mfg');

const { alerts, debugTrace } = detectAnomalies(data, thresholds, {
  debug: true,
  gracePeriod: 0,
  minDuration: 0,
  debugParams: ['eng_load']
});

const dpAlerts = alerts.filter(a =>
  (a.name || '').toLowerCase().includes('delta') ||
  (a.ruleId || '').includes('delta') ||
  (a.description || '').toLowerCase().includes('delta')
);

console.log('Total alerts:', alerts.length);
console.log('Delta-related alerts:', dpAlerts);

const lowDeltaSamples = debugTrace.filter(s => (s.mfgDelta ?? Number.POSITIVE_INFINITY) < 0.5 && (s.rpm ?? 0) >= 800);
console.log('Samples with DP < 0.5 & RPM >= 800:', lowDeltaSamples.length);

console.log('First 3 debug rows:', debugTrace.slice(0,3));

const stateCounts = debugTrace.reduce((acc, s) => { acc[s.engineState] = (acc[s.engineState] || 0) + 1; return acc; }, {});
console.log('Engine state counts:', stateCounts);
