// =============================================================================

import { extractEngineHourWindow } from './bplotEngineHours.js';
import { estimateTimelineAlignment } from './bplotAlignment.js';
// B-PLOT TIMELINE MERGE UTILITY
// Combines multiple B-Plot files into a unified timeline view
// =============================================================================

/**
 * Generate a unique ID for a file
 * @returns {string} Unique file ID
 */
export function generateFileId() {
  return `file_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

const getFileDuration = (file) => {
  const duration = file?.processed?.timeInfo?.duration;
  return Number.isFinite(duration) ? duration : 0;
};

const extractHourWindow = (file) => {
  const rows = file?.data?.data;
  return extractEngineHourWindow(rows);
};

const summarizeDualCorrelation = (files) => {
  const primary = files.find((file) => file.role === 'primary') || files[0] || null;
  const secondary = files.find((file) => file.role === 'secondary') || files.find((file) => file.id !== primary?.id) || null;

  if (!primary || !secondary) {
    return {
      mode: 'sequential',
      overlapRatio: null,
      durationSimilarity: null,
      reason: 'missing_primary_or_secondary'
    };
  }

  const primaryDuration = getFileDuration(primary);
  const secondaryDuration = getFileDuration(secondary);
  const maxDuration = Math.max(primaryDuration, secondaryDuration);
  const minDuration = Math.min(primaryDuration, secondaryDuration);
  const durationSimilarity = maxDuration > 0 ? minDuration / maxDuration : null;

  const primaryHours = extractHourWindow(primary);
  const secondaryHours = extractHourWindow(secondary);
  const alignment = estimateTimelineAlignment(
    primary?.processed?.chartData || [],
    secondary?.processed?.chartData || []
  );

  let hourOverlapWindow = null;
  let hourOverlapRatio = null;
  if (primaryHours && secondaryHours) {
    const overlapStart = Math.max(primaryHours.start, secondaryHours.start);
    const overlapEnd = Math.min(primaryHours.end, secondaryHours.end);
    const overlapDuration = Math.max(0, overlapEnd - overlapStart);
    const referenceDuration = Math.max(0, Math.min(primaryHours.duration, secondaryHours.duration));
    hourOverlapRatio = referenceDuration > 0 ? overlapDuration / referenceDuration : null;
    hourOverlapWindow = overlapDuration > 0 ? {
      start: overlapStart,
      end: overlapEnd,
      duration: overlapDuration
    } : null;
  }

  const overlapRatio = hourOverlapRatio ?? durationSimilarity ?? 0;
  const correlated = overlapRatio >= 0.8;

  return {
    mode: correlated ? 'correlated' : 'sequential',
    overlapRatio,
    durationSimilarity,
    alignmentOffsetSec: alignment.offsetSec,
    alignmentConfidence: alignment.confidence,
    alignmentMethod: alignment.method,
    alignmentChannels: alignment.channels,
    reason: correlated ? 'aligned_dual_capture' : 'insufficient_overlap',
    primary: {
      fileId: primary.id,
      fileName: primary.fileName,
      duration: primaryDuration,
      hourWindow: primaryHours
    },
    secondary: {
      fileId: secondary.id,
      fileName: secondary.fileName,
      duration: secondaryDuration,
      hourWindow: secondaryHours
    },
    overlapWindow: hourOverlapWindow
  };
};

/**
 * Combine multiple B-Plot files into a unified timeline
 * Files are placed sequentially with time offsets
 *
 * @param {Array} files - Array of { id, fileName, role, data, processed }
 * @param {Object} options
 * @param {'auto'|'sequential'|'correlated'} options.mode
 * @returns {Object} Combined data with file source markers
 */
export function combineTimelineData(files, options = {}) {
  const mode = options.mode || 'auto';
  if (!files || files.length === 0) {
    return {
      data: null,
      processed: null,
      fileBoundaries: [],
      totalDuration: 0,
      mode: 'sequential',
      correlation: null
    };
  }

  // Single file case - no combination needed
  if (files.length === 1) {
    const file = files[0];
    const duration = file.processed?.timeInfo?.duration || 0;
    return {
      data: file.data,
      processed: file.processed,
      fileBoundaries: [{
        fileId: file.id,
        fileName: file.fileName,
        startTime: 0,
        endTime: duration
      }],
      totalDuration: duration,
      mode: 'single',
      correlation: {
        mode: 'single',
        primary: {
          fileId: file.id,
          fileName: file.fileName,
          duration
        }
      }
    };
  }

  const correlation = summarizeDualCorrelation(files);
  const hasRolePair = Boolean(correlation?.primary && correlation?.secondary);
  const shouldUseCorrelatedMode = (
    (mode === 'correlated' && hasRolePair) ||
    (mode === 'auto' && correlation.mode === 'correlated')
  );

  if (shouldUseCorrelatedMode) {
    const primary = files.find((file) => file.role === 'primary') || files[0];
    const secondary = files.find((file) => file.role === 'secondary') || files.find((file) => file.id !== primary.id);
    const primaryDuration = getFileDuration(primary);
    const secondaryDuration = getFileDuration(secondary);
    const fileBoundaries = [
      {
        fileId: primary.id,
        fileName: primary.fileName,
        role: 'primary',
        startTime: 0,
        endTime: primaryDuration,
        correlated: true
      },
      {
        fileId: secondary.id,
        fileName: secondary.fileName,
        role: 'secondary',
        startTime: 0,
        endTime: secondaryDuration,
        correlated: true
      }
    ];

    // Correlated mode keeps plot channels unmerged and uses Primary as canonical chart data.
    // Secondary remains available for role-aware context and comparison.
    return {
      data: primary.data,
      processed: primary.processed,
      fileBoundaries,
      totalDuration: Math.max(primaryDuration, secondaryDuration),
      mode: 'correlated',
      correlation: {
        ...correlation,
        mode: 'correlated'
      }
    };
  }

  // Sort files by name (or could be by upload order)
  const sortedFiles = [...files];

  // Calculate time offsets for sequential playback
  let cumulativeOffset = 0;
  const filesWithOffsets = sortedFiles.map(file => {
    const duration = file.processed?.timeInfo?.duration || 0;
    const offset = cumulativeOffset;
    cumulativeOffset += duration;
    return {
      ...file,
      timeOffset: offset,
      duration
    };
  });

  // Create file boundaries for visual indicators
  const fileBoundaries = filesWithOffsets.map(f => ({
    fileId: f.id,
    fileName: f.fileName,
    startTime: f.timeOffset,
    endTime: f.timeOffset + f.duration
  }));

  // Merge all raw data points with source file indicators
  const combinedRawData = [];
  for (const file of filesWithOffsets) {
    if (!file.data?.data) continue;

    for (const row of file.data.data) {
      combinedRawData.push({
        ...row,
        Time: (row.Time || 0) + file.timeOffset,
        _sourceFile: file.fileName,
        _sourceFileId: file.id,
        _originalTime: row.Time || 0
      });
    }
  }

  // Sort by time
  combinedRawData.sort((a, b) => a.Time - b.Time);

  // Merge chart data (downsampled data for visualization)
  const combinedChartData = [];
  for (const file of filesWithOffsets) {
    if (!file.processed?.chartData) continue;

    for (const row of file.processed.chartData) {
      combinedChartData.push({
        ...row,
        Time: (row.Time || 0) + file.timeOffset,
        _sourceFile: file.fileName,
        _sourceFileId: file.id,
        _originalTime: row.Time || 0
      });
    }
  }
  combinedChartData.sort((a, b) => a.Time - b.Time);

  // Combine headers from all files (union of all channels)
  const allHeaders = new Set();
  for (const file of filesWithOffsets) {
    if (file.data?.headers) {
      file.data.headers.forEach(h => allHeaders.add(h));
    }
  }

  // Create combined data structure
  const combinedData = {
    headers: Array.from(allHeaders),
    data: combinedRawData,
    channels: Array.from(allHeaders).filter(h => h !== 'Time'),
    // Keep first file's metadata as base
    ...(filesWithOffsets[0]?.data || {})
  };
  combinedData.headers = Array.from(allHeaders);
  combinedData.data = combinedRawData;
  combinedData.channels = Array.from(allHeaders).filter(h => h !== 'Time');

  // Create combined processed structure
  const firstProcessed = filesWithOffsets[0]?.processed || {};
  const combinedProcessed = {
    ...firstProcessed,
    thresholdProfileId: firstProcessed?.thresholdProfileId || null,
    chartData: combinedChartData,
    rawData: combinedRawData,
    timeInfo: {
      startTime: 0,
      endTime: cumulativeOffset,
      duration: cumulativeOffset,
      dataPoints: combinedRawData.length
    },
    // Merge channel stats from all files
    channelStats: mergeChannelStats(filesWithOffsets.map(f => f.processed?.channelStats)),
    channelsByCategory: firstProcessed.channelsByCategory || {},
    // Combine alerts from all files
    alerts: mergeAlerts(filesWithOffsets),
    // Source files info
    sourceFiles: fileBoundaries
  };

  return {
    data: combinedData,
    processed: combinedProcessed,
    fileBoundaries,
    totalDuration: cumulativeOffset,
    mode: 'sequential',
    correlation
  };
}

/**
 * Merge channel statistics from multiple files
 * @param {Array} statsArray - Array of channelStats objects
 * @returns {Object} Merged channel statistics
 */
function mergeChannelStats(statsArray) {
  const merged = {};

  for (const stats of statsArray) {
    if (!stats) continue;

    for (const [channel, channelStats] of Object.entries(stats)) {
      if (!merged[channel]) {
        merged[channel] = { ...channelStats };
      } else {
        // Merge min/max/avg
        merged[channel].min = Math.min(merged[channel].min, channelStats.min);
        merged[channel].max = Math.max(merged[channel].max, channelStats.max);
        // Weighted average based on data points
        const totalPoints = merged[channel].count + channelStats.count;
        merged[channel].avg = (
          merged[channel].avg * merged[channel].count +
          channelStats.avg * channelStats.count
        ) / totalPoints;
        merged[channel].count = totalPoints;
      }
    }
  }

  return merged;
}

/**
 * Merge alerts from multiple files with source info
 * @param {Array} files - Files with processed.alerts
 * @returns {Array} Merged alerts with source file info
 */
function mergeAlerts(files) {
  const merged = [];

  for (const file of files) {
    if (!file.processed?.alerts) continue;
    const offset = file.timeOffset || 0;

    for (const alert of file.processed.alerts) {
      merged.push({
        ...alert,
        startTime: typeof alert.startTime === 'number' ? alert.startTime + offset : alert.startTime,
        endTime: typeof alert.endTime === 'number' ? alert.endTime + offset : alert.endTime,
        sourceFile: file.fileName,
        sourceFileId: file.id
      });
    }
  }

  return merged;
}

/**
 * Get time offset for a specific file
 * @param {Array} fileBoundaries - File boundary information
 * @param {string} fileId - File ID to look up
 * @returns {number} Time offset for the file
 */
export function getFileTimeOffset(fileBoundaries, fileId) {
  const boundary = fileBoundaries.find(b => b.fileId === fileId);
  return boundary?.startTime || 0;
}

/**
 * Find which file a time value belongs to
 * @param {Array} fileBoundaries - File boundary information
 * @param {number} time - Time value to look up
 * @returns {Object|null} File boundary info or null if not found
 */
export function findFileAtTime(fileBoundaries, time) {
  return fileBoundaries.find(b => time >= b.startTime && time < b.endTime) || null;
}
