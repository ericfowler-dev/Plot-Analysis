import fs from 'fs';

export const FILE_TYPES = {
  ECM_CSV: 'ecm_csv',           // ECM download CSV with histograms and faults
  BPLOT_CSV: 'bplot_csv',       // B-Plot time-series CSV (converted from .bplt)
  BPLOT_BINARY: 'bplot_binary', // Raw .bplt file (needs conversion)
  UNKNOWN: 'unknown'
};

/**
 * Detect the type of uploaded file based on content analysis
 * @param {string} filePath - Path to the file to analyze
 * @returns {Promise<string>} - File type constant
 */
export async function detectFileType(filePath) {
  try {
    // Read first 2KB of file for analysis
    const buffer = Buffer.alloc(2048);
    const fd = fs.openSync(filePath, 'r');
    fs.readSync(fd, buffer, 0, 2048, 0);
    fs.closeSync(fd);

    const content = buffer.toString('utf-8');
    const firstLine = content.split('\n')[0] || '';

    // Check for ECM CSV signature
    if (content.includes('========== 4G ECM Information ==========') ||
        content.includes('4G ECM Information') ||
        content.includes('ECI H/W P/N')) {
      return FILE_TYPES.ECM_CSV;
    }

    // Check for B-Plot CSV signature (time-series data)
    // First column should be "Time" and there should be many columns
    const headers = firstLine.split(',').map(h => h.trim());
    if (headers[0] === 'Time' && headers.length > 30) {
      // Additional check: look for common B-Plot columns
      const bplotColumns = ['rpm', 'MAP', 'ECT', 'IAT', 'Vbat', 'TPS_pct'];
      const hasCommonColumns = bplotColumns.some(col =>
        headers.some(h => h.toLowerCase() === col.toLowerCase())
      );

      if (hasCommonColumns) {
        return FILE_TYPES.BPLOT_CSV;
      }
    }

    // Check if it might be binary .bplt file incorrectly named
    if (content.includes('ECI Binary Plot Data File')) {
      return FILE_TYPES.BPLOT_BINARY;
    }

    return FILE_TYPES.UNKNOWN;

  } catch (error) {
    console.error('Error detecting file type:', error);
    return FILE_TYPES.UNKNOWN;
  }
}

/**
 * Get human-readable description of file type
 * @param {string} fileType - File type constant
 * @returns {string} - Human-readable description
 */
export function getFileTypeDescription(fileType) {
  switch (fileType) {
    case FILE_TYPES.ECM_CSV:
      return 'ECM Download Data (Histograms & Faults)';
    case FILE_TYPES.BPLOT_CSV:
      return 'B-Plot Time-Series Data';
    case FILE_TYPES.BPLOT_BINARY:
      return 'B-Plot Binary File (requires conversion)';
    default:
      return 'Unknown file format';
  }
}
