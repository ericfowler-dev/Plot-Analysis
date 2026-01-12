// =============================================================================
// ECM DATA PARSERS - Adapted for Engine Control Module histogram and fault data
// =============================================================================

// Parse ECM information header
function parseECMInfo(lines) {
  const info = {};
  let section = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Section headers
    if (line.startsWith('========== ') && line.endsWith(' ==========')) {
      section = line.replace(/========== | ==========/g, '');
      continue;
    }

    // Skip empty lines and section headers
    if (!line || line.includes('==========')) continue;

    // Parse key-value pairs
    if (line.includes(',')) {
      const parts = line.split(',');
      if (parts.length >= 2) {
        const key = parts[0].trim();
        const value = parts.slice(1).join(',').trim().replace(/"/g, '');
        info[key] = value;
      }
    }
  }

  return info;
}

// Parse histogram data (2D matrices)
// Format from CSV:
// Speed/Load Histogram
// ,,Manifold Pressure
// ,, 0.761719, 16.660156, 21.761719, ...  <- X-axis labels (pressure values)
// Engine Speed, 715.000000, 0.036319, 0.022500, ...  <- First data row (RPM in col 1, data in cols 2+)
// , 1485.000000, 0.003319, 0.005569, ...  <- Subsequent rows (RPM in col 1, data in cols 2+)
function parseHistogram(lines, histogramName) {
  const histogram = {
    name: histogramName,
    data: [],
    xLabels: [],
    yLabels: []
  };

  let inHistogram = false;
  let foundXAxisLabels = false;
  let inDataSection = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Skip empty lines
    if (!line) continue;

    // Check if we found the histogram name
    if (line.includes(histogramName)) {
      inHistogram = true;
      continue;
    }

    if (inHistogram) {
      // Check for next section or end
      if (line.startsWith('==========') || line === '------------------- END -------------------') {
        break;
      }

      // Check for next histogram (stop parsing this one)
      if (line.endsWith('Histogram') && !line.includes(histogramName)) {
        break;
      }

      const parts = line.split(',').map(p => p.trim());

      // Look for X-axis labels row: starts with ",," followed by numbers
      // e.g., ",, 0.761719, 16.660156, 21.761719, ..."
      if (!foundXAxisLabels && parts[0] === '' && parts[1] === '') {
        // Check if there are numeric values after the empty fields
        const numericParts = parts.slice(2).filter(p => p !== '' && !isNaN(parseFloat(p)));
        if (numericParts.length > 0) {
          histogram.xLabels = numericParts.map(p => parseFloat(p));
          foundXAxisLabels = true;
          continue;
        }
      }

      // Look for data rows: "Engine Speed, RPM, data..." or ", RPM, data..."
      if (foundXAxisLabels) {
        // Data row starts with "Engine Speed," or just ","
        if (line.startsWith('Engine Speed,') || (parts[0] === '' && parts.length > 2)) {
          inDataSection = true;
        }

        if (inDataSection) {
          // RPM is in column 1 (index 1), data values start at column 2
          const rpmValue = parseFloat(parts[1]);
          if (!isNaN(rpmValue)) {
            histogram.yLabels.push(rpmValue);
            // Data values are in columns 2 onwards
            const rowData = parts.slice(2).map(p => {
              const val = parseFloat(p);
              return isNaN(val) ? 0 : val;
            });
            histogram.data.push(rowData);
          }
        }
      }
    }
  }

  return histogram;
}

// Parse all histograms from the file
function parseHistograms(content) {
  const lines = content.split('\n');
  const histograms = {};

  // Speed/Load Histogram - stops at next histogram or section
  const speedLoadMatch = content.match(/Speed\/Load Histogram[\s\S]*?(?=Knock Histogram|ECT Histogram|Intake Backfire|==========|$)/);
  if (speedLoadMatch) {
    histograms.speedLoad = parseHistogram(speedLoadMatch[0].split('\n'), 'Speed/Load Histogram');
  }

  // Knock Histogram - stops at next histogram or section
  const knockMatch = content.match(/Knock Histogram[\s\S]*?(?=ECT Histogram|Intake Backfire|==========|$)/);
  if (knockMatch) {
    histograms.knock = parseHistogram(knockMatch[0].split('\n'), 'Knock Histogram');
  }

  // ECT Histogram - 1D histogram (temperature vs time)
  // Format: , 110.000000, 0.033639 (temp, time in hours)
  // Structure it so x-axis = temperature, data = time
  const ectMatch = content.match(/ECT Histogram[\s\S]*?(?=Intake Backfire|==========|$)/);
  if (ectMatch) {
    const ectHistogram = {
      name: 'ECT Histogram',
      data: [],      // Will be [[time1, time2, ...]] - single row
      xLabels: [],   // Temperature values
      yLabels: [0]   // Dummy single row
    };

    const timeValues = [];
    const ectLines = ectMatch[0].split('\n');
    for (const line of ectLines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.includes('ECT Histogram') || trimmed.includes('ECT (deg F)')) {
        continue;
      }

      const parts = line.split(',').map(p => p.trim());
      // parts[0] = "" (empty), parts[1] = temp, parts[2] = time
      if (parts.length >= 3) {
        const temp = parseFloat(parts[1]);
        const time = parseFloat(parts[2]);
        if (!isNaN(temp) && !isNaN(time)) {
          ectHistogram.xLabels.push(temp); // Temperature as X label
          timeValues.push(time);            // Collect time values
        }
      }
    }
    ectHistogram.data = [timeValues]; // Single row of time values
    histograms.ect = ectHistogram;
  }

  // Intake Backfire Histogram (Lifetime)
  const backfireLifetimeMatch = content.match(/Intake Backfire Histogram \(Lifetime\)[\s\S]*?(?=Intake Backfire Histogram \(Recent\)|Intake Backfire Events|==========|$)/);
  if (backfireLifetimeMatch) {
    histograms.backfireLifetime = parseHistogram(backfireLifetimeMatch[0].split('\n'), 'Intake Backfire Histogram (Lifetime)');
  }

  // Intake Backfire Histogram (Recent)
  const backfireRecentMatch = content.match(/Intake Backfire Histogram \(Recent\)[\s\S]*?(?=Intake Backfire Events|==========|$)/);
  if (backfireRecentMatch) {
    histograms.backfireRecent = parseHistogram(backfireRecentMatch[0].split('\n'), 'Intake Backfire Histogram (Recent)');
  }

  return histograms;
}

// Parse fault data
function parseFaults(content) {
  const faults = [];
  const lines = content.split('\n');

  let currentFault = null;
  let inFaultSnapshot = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Start of fault snapshot data section
    if (line.includes('========== Fault Snap Shot Data ==========')) {
      inFaultSnapshot = true;
      continue;
    }

    if (inFaultSnapshot) {
      // DTC line - starts a new fault
      if (line.startsWith('DTC ')) {
        if (currentFault) {
          faults.push(currentFault);
        }

        const dtcMatch = line.match(/DTC (\d+): (.+)/);
        if (dtcMatch) {
          currentFault = {
            code: dtcMatch[1],
            description: dtcMatch[2],
            details: [],
            snapshot: {},
            // Initialize parsed fields
            occurredThisCycle: false,
            causedShutdown: false,
            startsSinceActive: 0,
            occurrenceCount: 0,
            initialOccurrence: 0,
            lastOccurrence: 0
          };
        }
      }
      // Parse specific fault detail lines
      else if (currentFault) {
        // Check for "Fault did not occur during this key cycle" or "Fault occurred during this key cycle"
        if (line.includes('Fault') && line.includes('occur') && line.includes('key cycle')) {
          currentFault.occurredThisCycle = !line.includes('did not');
          currentFault.details.push(line);
        }
        // Check for "Fault caused an engine shutdown"
        else if (line.includes('Fault caused') && line.includes('shutdown')) {
          currentFault.causedShutdown = true;
          currentFault.details.push(line);
        }
        // Check for "Starts since fault was active: X"
        else if (line.includes('Starts since fault was active')) {
          const match = line.match(/Starts since fault was active:\s*(\d+)/);
          if (match) {
            currentFault.startsSinceActive = parseInt(match[1], 10);
          }
          currentFault.details.push(line);
        }
        // Check for "Occurrence count: X"
        else if (line.includes('Occurrence count:')) {
          const match = line.match(/Occurrence count:\s*(\d+)/);
          if (match) {
            currentFault.occurrenceCount = parseInt(match[1], 10);
          }
          currentFault.details.push(line);
        }
        // Check for "Initial occurrence: X eng hours"
        else if (line.includes('Initial occurrence:')) {
          const match = line.match(/Initial occurrence:\s*([\d.]+)\s*eng hours/);
          if (match) {
            currentFault.initialOccurrence = parseFloat(match[1]);
          }
          currentFault.details.push(line);
        }
        // Check for "Last occurrence: X eng hours"
        else if (line.includes('Last occurrence:')) {
          const match = line.match(/Last occurrence:\s*([\d.]+)\s*eng hours/);
          if (match) {
            currentFault.lastOccurrence = parseFloat(match[1]);
          }
          currentFault.details.push(line);
        }
        // Other fault detail lines (MIL countdown, etc.)
        else if (line.includes('Fault') || line.includes('MIL countdown') || line.includes('Went previously active')) {
          currentFault.details.push(line);
        }
        // Parameter snapshot - comma-separated key, value pairs
        else if (line.includes(',') && !line.startsWith('=')) {
          const parts = line.split(',').map(p => p.trim());
          if (parts.length >= 2 && parts[0] !== '') {
            const param = parts[0];
            const value = parseFloat(parts[1]);
            currentFault.snapshot[param] = isNaN(value) ? parts[1] : value;
          }
        }
        // Stop at next section (starts with ======)
        else if (line.startsWith('======') && !line.includes('Fault Snap Shot Data')) {
          break;
        }
      }
    }
  }

  // Add the last fault
  if (currentFault) {
    faults.push(currentFault);
  }

  return faults;
}

// Main parsing function for ECM data files
export function parseECMData(content) {
  try {
    const lines = content.split('\n');

    // Parse ECM information
    const ecmInfo = parseECMInfo(lines);

    // Parse histograms
    const histograms = parseHistograms(content);

    // Parse faults (if this is a fault data file)
    const faults = parseFaults(content);

    return {
      ecmInfo,
      histograms,
      faults,
      parsed: true,
      error: null
    };

  } catch (error) {
    console.error('Error parsing ECM data:', error);
    return {
      ecmInfo: {},
      histograms: {},
      faults: [],
      parsed: false,
      error: error.message
    };
  }
}

// Format histogram data for visualization
export function formatHistogramForChart(histogram) {
  if (!histogram || !histogram.data.length) return [];

  const chartData = [];

  for (let y = 0; y < histogram.yLabels.length; y++) {
    for (let x = 0; x < histogram.xLabels.length; x++) {
      const value = histogram.data[y]?.[x] || 0;
      if (value > 0) { // Only include non-zero values for performance
        chartData.push({
          x: histogram.xLabels[x],
          y: histogram.yLabels[y],
          value: value,
          histogram: histogram.name
        });
      }
    }
  }

  return chartData;
}

// Extract summary statistics from parsed data
export function extractECMStats(parsedData) {
  const stats = {
    totalFaults: parsedData.faults.length,
    histogramCount: Object.keys(parsedData.histograms).length,
    engineHours: parseFloat(parsedData.ecmInfo['Hour meter']) || 0,
    engineStarts: parseInt(parsedData.ecmInfo['Cumulative Starts']) || 0,
    softwareVersion: parsedData.ecmInfo['ECI Mot XLS Rev'] || 'Unknown',
    hardwarePN: parsedData.ecmInfo['ECI H/W P/N'] || 'Unknown',
    serialNumber: parsedData.ecmInfo['ECI H/W S/N'] || 'Unknown'
  };

  // Calculate histogram totals
  stats.histogramStats = {};
  Object.entries(parsedData.histograms).forEach(([key, histogram]) => {
    const total = histogram.data.flat().reduce((sum, val) => sum + (val || 0), 0);
    stats.histogramStats[key] = {
      totalHours: total,
      dataPoints: histogram.data.length * (histogram.xLabels.length || 0)
    };
  });

  return stats;
}

// Utility functions
export const fmt = (val, decimals = 1) => {
  if (val == null || isNaN(val)) return '—';
  return Number(val).toFixed(decimals);
};

export const fmtTime = (date) => {
  if (!date) return '—';
  return date.toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
};

export const fmtDuration = (minutes) => {
  if (!minutes || isNaN(minutes)) return '—';
  const hours = Math.floor(minutes / 60);
  const mins = Math.floor(minutes % 60);
  return `${hours}h ${mins}m`;
};
