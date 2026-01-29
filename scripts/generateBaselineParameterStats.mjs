import fs from 'fs/promises';
import path from 'path';

const BASELINE_PATH = path.resolve('server/data/baselines/good_baseline.json');
const OUTPUT_PATH = path.resolve('server/data/baselines/baseline_parameter_stats.json');

const DEFAULT_THRESHOLD = 10;

function selectValue(stats, ...keys) {
  for (const key of keys) {
    if (stats?.[key] !== undefined && stats?.[key] !== null) {
      return Number(stats[key]);
    }
  }
  return null;
}

function makeSpan(entry) {
  const low = selectValue(entry, 'p05_padded', 'p05_mean', 'p05');
  const high = selectValue(entry, 'p95_padded', 'p95_mean', 'p95');
  if (low === null || high === null) {
    return null;
  }
  return Math.max(0, high - low);
}

(async function generate() {
  const raw = await fs.readFile(BASELINE_PATH, 'utf8');
  const baseline = JSON.parse(raw);

  const stats = {};

  for (const [groupName, groupData] of Object.entries(baseline.groups || {})) {
    for (const [sizeName, sizeData] of Object.entries(groupData || {})) {
      for (const [appName, appData] of Object.entries(sizeData || {})) {
        for (const [param, entry] of Object.entries(appData || {})) {
          if (!param || param === 'Time') continue;
          const span = makeSpan(entry);
          if (span === null) continue;

          const target = stats[param] ??= {
            occurrences: 0,
            totalSpan: 0,
            maxSpan: 0,
            minSpan: Infinity,
            ranges: [],
            samples: []
          };
          target.occurrences += 1;
          target.totalSpan += span;
          target.maxSpan = Math.max(target.maxSpan, span);
          target.minSpan = Math.min(target.minSpan, span);
          target.ranges.push(span);
          target.samples.push({
            group: groupName,
            size: sizeName,
            application: appName,
            span
          });
        }
      }
    }
  }

  const payload = {
    updated: new Date().toISOString(),
    parameters: {}
  };

  for (const [param, entry] of Object.entries(stats)) {
    const averageSpan = entry.occurrences ? entry.totalSpan / entry.occurrences : 0;
    payload.parameters[param] = {
      occurrences: entry.occurrences,
      averageSpan: averageSpan,
      maxSpan: entry.maxSpan,
      minSpan: entry.minSpan === Infinity ? 0 : entry.minSpan,
      wideVariance: entry.maxSpan >= DEFAULT_THRESHOLD,
      samples: entry.samples.slice(0, 3)
    };
  }

  await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await fs.writeFile(OUTPUT_PATH, JSON.stringify(payload, null, 2), 'utf8');
  console.log(`Baseline parameter stats written to ${path.relative(process.cwd(), OUTPUT_PATH)}`);
})();
