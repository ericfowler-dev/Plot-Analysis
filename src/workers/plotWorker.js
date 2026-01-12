// =============================================================================
// ECM DATA PROCESSING WORKER
// Handles parsing and processing of Engine Control Module histogram and fault data
// =============================================================================

import { parseECMData, formatHistogramForChart, extractECMStats } from '../lib/parsers.js';

// Process ECM data file
function processECMFile(buffer) {
  try {
    // Convert buffer to text
    const text = new TextDecoder('utf-8').decode(buffer);

    // Parse the ECM data
    const parsedData = parseECMData(text);

    if (!parsedData.parsed) {
      throw new Error(parsedData.error || 'Failed to parse ECM data');
    }

    // Extract statistics
    const stats = extractECMStats(parsedData);

    // Format histogram data for charts
    const chartData = {};
    Object.entries(parsedData.histograms).forEach(([key, histogram]) => {
      chartData[key] = formatHistogramForChart(histogram);
    });

    // Return processed data
    return {
      ecmInfo: parsedData.ecmInfo,
      histograms: parsedData.histograms,
      faults: parsedData.faults,
      stats,
      chartData,
      processed: true,
      error: null
    };

  } catch (error) {
    console.error('Worker processing error:', error);
    return {
      ecmInfo: {},
      histograms: {},
      faults: [],
      stats: {},
      chartData: {},
      processed: false,
      error: error.message
    };
  }
}

// Load raw sheet data (for CSV files with multiple sheets - though ECM files are typically single-sheet)
function loadRawSheet(buffer, sheetName) {
  try {
    const text = new TextDecoder('utf-8').decode(buffer);

    // For ECM files, we don't have traditional sheets, but we can parse sections
    const lines = text.split('\n');
    const sections = {};
    let currentSection = 'General';

    sections[currentSection] = [];

    for (const line of lines) {
      const trimmed = line.trim();

      // Section headers
      if (trimmed.startsWith('========== ') && trimmed.endsWith(' ==========')) {
        currentSection = trimmed.replace(/========== | ==========/g, '');
        sections[currentSection] = [];
      } else {
        sections[currentSection].push(line);
      }
    }

    // Return the requested section or general info
    const sheetData = sections[sheetName] || sections['General'] || [];

    return {
      name: sheetName,
      rows: sheetData.map((line, index) => ({
        id: index + 1,
        content: line
      })),
      parsed: true
    };

  } catch (error) {
    return {
      name: sheetName,
      rows: [],
      error: error.message,
      parsed: false
    };
  }
}

// Main message handler
self.onmessage = function(e) {
  const { type, buffer, name } = e.data;

  try {
    if (type === 'load') {
      // Process main ECM data file
      const result = processECMFile(buffer);
      self.postMessage({
        type: 'loaded',
        ...result
      });
    }
    else if (type === 'rawSheet') {
      // Load raw sheet data
      const result = loadRawSheet(buffer, name);
      self.postMessage({
        type: 'rawSheet',
        name: name,
        rows: result.rows,
        parsed: result.parsed,
        error: result.error
      });
    }
    else {
      self.postMessage({
        type: 'error',
        message: `Unknown message type: ${type}`
      });
    }
  } catch (error) {
    self.postMessage({
      type: 'error',
      message: `Worker error: ${error.message}`
    });
  }
};

// Handle worker errors
self.onerror = function(error) {
  self.postMessage({
    type: 'error',
    message: `Worker error: ${error.message}`
  });
};
