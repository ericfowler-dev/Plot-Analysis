// =============================================================================
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

/**
 * Combine multiple B-Plot files into a unified timeline
 * Files are placed sequentially with time offsets
 *
 * @param {Array} files - Array of { id, fileName, data, processed }
 * @returns {Object} Combined data with file source markers
 */
export function combineTimelineData(files) {
  if (!files || files.length === 0) {
    return {
      data: null,
      processed: null,
      fileBoundaries: [],
      totalDuration: 0
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
      totalDuration: duration
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
    totalDuration: cumulativeOffset
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
