export function sanitizeChartData(rawData = [], timeKey = 'Time') {
  if (!Array.isArray(rawData)) return [];
  return rawData
    .map(r => {
      const copy = { ...r };
      copy[timeKey] = Number(copy[timeKey]);
      // coerce other numeric fields if needed
      Object.keys(copy).forEach(k => {
        if (k !== timeKey && copy[k] !== null && copy[k] !== undefined && copy[k] !== '') {
          const n = Number(copy[k]);
          if (!Number.isNaN(n)) copy[k] = n;
        }
      });
      return copy;
    })
    .filter(r => typeof r[timeKey] === 'number' && !Number.isNaN(r[timeKey]));
}