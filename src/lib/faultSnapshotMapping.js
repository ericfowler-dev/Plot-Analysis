// =============================================================================
// FAULT SNAPSHOT MAPPING
// Maps ECM fault snapshot parameter names to B-Plot channel names
// =============================================================================

/**
 * Map ECM fault snapshot parameter names to B-Plot channel names
 * ECM snapshots use slightly different naming conventions
 */
export const SNAPSHOT_TO_BPLOT_MAP = {
  // Temperature
  'ECT': 'ECT',
  'rECT': 'ECT',
  'IAT': 'IAT',
  'rIAT': 'IAT',
  'MAT': 'MAT',
  'FT': 'FT',
  'OILT': 'OILT',

  // Engine
  'rpm': 'rpm',
  'RPM': 'rpm',

  // Pressure
  'MAP': 'MAP',
  'rMAP': 'MAP',
  'BP': 'BP',
  'TIP': 'TIP',
  'OILP_press': 'OILP_press',
  'FPin': 'FPin',

  // Electrical
  'Vbat': 'Vbat',
  'VBAT': 'Vbat',
  'Vsw': 'Vsw',
  'Gov1_volt': 'gov1_volt',
  'Gov2_volt': 'gov2_volt',
  'EGO1_volts': 'EGO1_volts',
  'EGO2_volts': 'EGO2_volts',

  // Throttle/Control
  'TPS_pct': 'TPS_pct',
  'TPS': 'TPS_pct',

  // Fuel
  'A_BM1': 'A_BM1',
  'CL_BM1': 'CL_BM1',
  'EPR': 'EPR',
  'Phi': 'Phi',

  // Ignition
  'spk_adv': 'spk_adv',
  'spark_adv': 'spk_adv',
  'KNK_retard': 'KNK_retard'
};

/**
 * Colors for different fault severity levels
 */
const FAULT_COLORS = {
  critical: '#ef4444',  // Red
  warning: '#f59e0b',   // Amber
  info: '#3b82f6',      // Blue
  default: '#ef4444'    // Default to red
};

/**
 * Get appropriate color for a fault based on its severity
 * @param {Object} fault - Fault object
 * @returns {string} Color hex code
 */
function getFaultColor(fault) {
  if (fault.causedShutdown) return FAULT_COLORS.critical;
  if (fault.occurredThisCycle) return FAULT_COLORS.warning;
  return FAULT_COLORS.default;
}

/**
 * Extract fault snapshot values relevant to currently displayed channels
 * @param {Object} fault - Fault object with snapshot property
 * @param {Array} selectedChannels - Currently selected chart channels
 * @returns {Array} Reference line configs for each matching parameter
 */
export function getFaultOverlayLines(fault, selectedChannels) {
  const lines = [];

  if (!fault?.snapshot) return lines;

  const color = getFaultColor(fault);

  for (const [snapshotKey, value] of Object.entries(fault.snapshot)) {
    // Skip non-numeric values
    if (typeof value !== 'number' || isNaN(value)) continue;

    const bplotChannel = SNAPSHOT_TO_BPLOT_MAP[snapshotKey];

    if (bplotChannel && selectedChannels.includes(bplotChannel)) {
      lines.push({
        channel: bplotChannel,
        value: value,
        faultCode: fault.code,
        faultDescription: fault.description,
        label: `DTC ${fault.code}: ${snapshotKey}`,
        shortLabel: `DTC ${fault.code}`,
        color: color,
        occurrenceCount: fault.occurrenceCount || 1,
        causedShutdown: fault.causedShutdown || false
      });
    }
  }

  return lines;
}

/**
 * Get all fault overlay lines for multiple faults
 * @param {Array} faults - Array of fault objects
 * @param {Array} selectedChannels - Currently selected chart channels
 * @returns {Array} All reference line configs
 */
export function getAllFaultOverlayLines(faults, selectedChannels) {
  if (!faults || !faults.length) return [];

  const allLines = [];
  for (const fault of faults) {
    const lines = getFaultOverlayLines(fault, selectedChannels);
    allLines.push(...lines);
  }

  // Sort by channel for consistent ordering
  allLines.sort((a, b) => a.channel.localeCompare(b.channel));

  return allLines;
}

/**
 * Get a summary of which channels have fault overlay data
 * @param {Array} faults - Array of fault objects
 * @returns {Set} Set of channel names that have fault data
 */
export function getChannelsWithFaultData(faults) {
  const channels = new Set();

  if (!faults || !faults.length) return channels;

  for (const fault of faults) {
    if (!fault.snapshot) continue;

    for (const snapshotKey of Object.keys(fault.snapshot)) {
      const bplotChannel = SNAPSHOT_TO_BPLOT_MAP[snapshotKey];
      if (bplotChannel) {
        channels.add(bplotChannel);
      }
    }
  }

  return channels;
}

/**
 * Get a display-friendly list of available fault snapshot parameters
 * @param {Array} faults - Array of fault objects
 * @returns {Array} List of { ecmName, bplotName, sampleValue }
 */
export function getAvailableFaultParameters(faults) {
  const params = new Map();

  if (!faults || !faults.length) return [];

  for (const fault of faults) {
    if (!fault.snapshot) continue;

    for (const [key, value] of Object.entries(fault.snapshot)) {
      const bplotChannel = SNAPSHOT_TO_BPLOT_MAP[key];
      if (bplotChannel && typeof value === 'number' && !params.has(bplotChannel)) {
        params.set(bplotChannel, {
          ecmName: key,
          bplotName: bplotChannel,
          sampleValue: value
        });
      }
    }
  }

  return Array.from(params.values());
}
