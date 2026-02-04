// =============================================================================
// ECM TIMELINE MERGE UTILITY
// Combines multiple ECM files (Primary/Secondary) for dual-ECM PSI engines
// =============================================================================

/**
 * Generate a unique ID for an ECM file
 * @returns {string} Unique file ID
 */
export function generateEcmFileId() {
  return `ecm_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Combine fault data from multiple ECM files with source attribution
 * @param {Array} ecmFiles - Array of { id, fileName, role, faults, ... }
 * @returns {Array} Combined faults with source file info
 */
export function combineFaultData(ecmFiles) {
  if (!ecmFiles || ecmFiles.length === 0) {
    return [];
  }

  const combined = [];

  for (const file of ecmFiles) {
    if (!file.faults) continue;

    for (const fault of file.faults) {
      combined.push({
        ...fault,
        sourceFileId: file.id,
        sourceFileName: file.fileName,
        sourceRole: file.role, // 'primary' or 'secondary'
        // Create a compound key for matching faults across ECMs
        faultKey: `${fault.code}_${fault.description || ''}`
      });
    }
  }

  // Sort by role (primary first), then by occurrence count desc
  combined.sort((a, b) => {
    // Primary faults first
    if (a.sourceRole !== b.sourceRole) {
      return a.sourceRole === 'primary' ? -1 : 1;
    }
    // Then by occurrence count (highest first)
    return (b.occurrenceCount || 0) - (a.occurrenceCount || 0);
  });

  return combined;
}

/**
 * Find matching faults across ECM files (same DTC code on both ECMs)
 * @param {Array} combinedFaults - Combined faults from combineFaultData
 * @returns {Map} Map of faultKey -> { primary: fault, secondary: fault }
 */
export function findMatchingFaults(combinedFaults) {
  const faultMap = new Map();

  for (const fault of combinedFaults) {
    const key = fault.faultKey;
    if (!faultMap.has(key)) {
      faultMap.set(key, { primary: null, secondary: null });
    }
    const entry = faultMap.get(key);
    if (fault.sourceRole === 'primary') {
      entry.primary = fault;
    } else if (fault.sourceRole === 'secondary') {
      entry.secondary = fault;
    }
  }

  return faultMap;
}

/**
 * Combine histogram data from multiple ECM files (additive merge)
 * @param {Array} ecmFiles - Array of { id, fileName, role, histograms, ... }
 * @returns {Object} Combined histograms { histogramKey: { data, xLabels, yLabels, sources } }
 */
export function combineHistogramData(ecmFiles) {
  if (!ecmFiles || ecmFiles.length === 0) {
    return {};
  }

  // Collect all histogram keys
  const allKeys = new Set();
  for (const file of ecmFiles) {
    if (file.histograms) {
      Object.keys(file.histograms).forEach(key => allKeys.add(key));
    }
  }

  const combined = {};

  for (const key of allKeys) {
    // Find the first file with this histogram to get dimensions
    const refFile = ecmFiles.find(f => f.histograms?.[key]);
    if (!refFile) continue;

    const refHist = refFile.histograms[key];
    const yLabels = refHist.yLabels || [];
    const xLabels = refHist.xLabels || [];

    // Initialize combined data matrix with zeros
    const combinedData = yLabels.map(() => xLabels.map(() => 0));
    const sources = [];

    // Add data from each file
    for (const file of ecmFiles) {
      const hist = file.histograms?.[key];
      if (!hist || !hist.data) continue;

      sources.push({
        fileId: file.id,
        fileName: file.fileName,
        role: file.role
      });

      // Add values (assumes same dimensions)
      for (let y = 0; y < yLabels.length && y < hist.data.length; y++) {
        for (let x = 0; x < xLabels.length && x < (hist.data[y]?.length || 0); x++) {
          combinedData[y][x] += hist.data[y][x] || 0;
        }
      }
    }

    combined[key] = {
      data: combinedData,
      xLabels,
      yLabels,
      title: refHist.title || key,
      sources
    };
  }

  return combined;
}

/**
 * Get histogram data by source (primary or secondary only)
 * @param {Array} ecmFiles - Array of ECM files
 * @param {string} role - 'primary' or 'secondary'
 * @returns {Object} Histograms from the specified source
 */
export function getHistogramsByRole(ecmFiles, role) {
  const file = ecmFiles.find(f => f.role === role);
  return file?.histograms || {};
}

/**
 * Calculate difference between Primary and Secondary histogram values
 * @param {Object} primaryHistogram - Primary ECM histogram
 * @param {Object} secondaryHistogram - Secondary ECM histogram
 * @returns {Object} Difference histogram { data, xLabels, yLabels, maxDiff, minDiff }
 */
export function getHistogramDifference(primaryHistogram, secondaryHistogram) {
  if (!primaryHistogram || !secondaryHistogram) {
    return null;
  }

  const yLabels = primaryHistogram.yLabels || [];
  const xLabels = primaryHistogram.xLabels || [];

  // Create difference matrix
  const diffData = [];
  let maxDiff = 0;
  let minDiff = 0;

  for (let y = 0; y < yLabels.length; y++) {
    const row = [];
    for (let x = 0; x < xLabels.length; x++) {
      const primaryVal = primaryHistogram.data?.[y]?.[x] || 0;
      const secondaryVal = secondaryHistogram.data?.[y]?.[x] || 0;
      const diff = primaryVal - secondaryVal;
      row.push(diff);

      if (diff > maxDiff) maxDiff = diff;
      if (diff < minDiff) minDiff = diff;
    }
    diffData.push(row);
  }

  return {
    data: diffData,
    xLabels,
    yLabels,
    title: primaryHistogram.title || 'Difference',
    maxDiff,
    minDiff,
    // Max absolute difference for color scaling
    maxAbsDiff: Math.max(Math.abs(maxDiff), Math.abs(minDiff))
  };
}

/**
 * Merge ECM statistics from multiple files
 * @param {Array} ecmFiles - Array of { id, fileName, role, stats, ecmInfo, ... }
 * @returns {Object} Merged statistics
 */
export function mergeEcmStats(ecmFiles) {
  if (!ecmFiles || ecmFiles.length === 0) {
    return {
      totalFaults: 0,
      uniqueFaults: 0,
      matchingFaults: 0,
      engineHours: { primary: null, secondary: null },
      engineStarts: { primary: null, secondary: null }
    };
  }

  const primary = ecmFiles.find(f => f.role === 'primary');
  const secondary = ecmFiles.find(f => f.role === 'secondary');

  // Collect all unique fault codes
  const primaryFaultCodes = new Set((primary?.faults || []).map(f => f.code));
  const secondaryFaultCodes = new Set((secondary?.faults || []).map(f => f.code));
  const allFaultCodes = new Set([...primaryFaultCodes, ...secondaryFaultCodes]);

  // Count matching faults (appear on both ECMs)
  let matchingFaults = 0;
  for (const code of primaryFaultCodes) {
    if (secondaryFaultCodes.has(code)) {
      matchingFaults++;
    }
  }

  return {
    totalFaults: (primary?.faults?.length || 0) + (secondary?.faults?.length || 0),
    uniqueFaults: allFaultCodes.size,
    matchingFaults,
    primaryOnlyFaults: primaryFaultCodes.size - matchingFaults,
    secondaryOnlyFaults: secondaryFaultCodes.size - matchingFaults,
    engineHours: {
      primary: primary?.stats?.engineHours ?? parseFloat(primary?.ecmInfo?.['Hour meter']) ?? null,
      secondary: secondary?.stats?.engineHours ?? parseFloat(secondary?.ecmInfo?.['Hour meter']) ?? null
    },
    engineStarts: {
      primary: primary?.stats?.engineStarts ?? parseInt(primary?.ecmInfo?.['Cumulative Starts']) ?? null,
      secondary: secondary?.stats?.engineStarts ?? parseInt(secondary?.ecmInfo?.['Cumulative Starts']) ?? null
    },
    ecmInfo: {
      primary: primary?.ecmInfo || {},
      secondary: secondary?.ecmInfo || {}
    }
  };
}

/**
 * Get ECM info comparison data (side-by-side fields)
 * @param {Array} ecmFiles - Array of ECM files with ecmInfo
 * @returns {Array} Array of { field, primary, secondary, match }
 */
export function getEcmInfoComparison(ecmFiles) {
  const primary = ecmFiles.find(f => f.role === 'primary');
  const secondary = ecmFiles.find(f => f.role === 'secondary');

  if (!primary && !secondary) return [];

  // Collect all fields
  const allFields = new Set([
    ...Object.keys(primary?.ecmInfo || {}),
    ...Object.keys(secondary?.ecmInfo || {})
  ]);

  // Important fields to show first
  const priorityFields = [
    'ECI H/W P/N',
    'ECI S/W P/N',
    'Hour meter',
    'Cumulative Starts',
    'Fuel Type',
    'Product Type',
    'Configuration',
    'Software Version'
  ];

  const comparison = [];

  // Add priority fields first
  for (const field of priorityFields) {
    if (allFields.has(field)) {
      const pVal = primary?.ecmInfo?.[field];
      const sVal = secondary?.ecmInfo?.[field];
      comparison.push({
        field,
        primary: pVal,
        secondary: sVal,
        match: pVal === sVal
      });
      allFields.delete(field);
    }
  }

  // Add remaining fields
  for (const field of allFields) {
    const pVal = primary?.ecmInfo?.[field];
    const sVal = secondary?.ecmInfo?.[field];
    comparison.push({
      field,
      primary: pVal,
      secondary: sVal,
      match: pVal === sVal
    });
  }

  return comparison;
}

/**
 * Correlate ECM hour meter time to BPLOT timeline position
 * @param {number} ecmHours - ECM hour meter value
 * @param {number} bplotOffset - Offset in hours from start of BPLOT
 * @param {number} bplotDuration - Total BPLOT duration in seconds
 * @returns {number|null} Estimated position in BPLOT timeline (seconds)
 */
export function correlateEcmToBplotTime(ecmHours, bplotOffset = 0, bplotDuration = 0) {
  if (ecmHours === null || ecmHours === undefined) return null;
  if (!bplotDuration || bplotDuration <= 0) return null;

  // ECM hours to seconds, adjusted by offset
  const offsetHours = bplotOffset || 0;
  const ecmSeconds = (ecmHours - offsetHours) * 3600;

  // Clamp to BPLOT timeline
  if (ecmSeconds < 0) return 0;
  if (ecmSeconds > bplotDuration) return bplotDuration;

  return ecmSeconds;
}
