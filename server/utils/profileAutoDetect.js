/**
 * Profile Auto-Detection Engine
 *
 * Analyzes data characteristics to automatically suggest the appropriate
 * threshold profile based on engine configuration signatures.
 *
 * Detection strategies:
 * 1. Channel presence detection - identify available sensors/signals
 * 2. Value range analysis - detect operating characteristics
 * 3. Pattern matching - identify engine behavior patterns
 * 4. Metadata extraction - use embedded file metadata if available
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROFILES_DIR = path.join(__dirname, '..', 'data', 'profiles');

/**
 * Detection rule types
 */
export const DETECTION_RULE_TYPES = {
  CHANNEL_PRESENT: 'channel_present',      // Channel exists in data
  CHANNEL_ABSENT: 'channel_absent',        // Channel does not exist
  VALUE_RANGE: 'value_range',              // Values fall within range
  VALUE_ABOVE: 'value_above',              // Max value above threshold
  VALUE_BELOW: 'value_below',              // Min value below threshold
  DELTA_RANGE: 'delta_range',              // Delta between two channels in range
  PATTERN_MATCH: 'pattern_match',          // Regex match on channel name
  METADATA_MATCH: 'metadata_match'         // Match file metadata field
};

/**
 * Engine variant characteristics for auto-detection
 * Maps variant features to detection rules
 */
export const ENGINE_VARIANT_SIGNATURES = {
  // Turbo detection
  turbo: {
    name: 'Turbocharged',
    rules: [
      // TIP (Throttle Inlet Pressure) channel indicates turbo
      { type: DETECTION_RULE_TYPES.CHANNEL_PRESENT, channel: 'TIP', weight: 0.8 },
      { type: DETECTION_RULE_TYPES.CHANNEL_PRESENT, channel: 'TIP_press', weight: 0.8 },
      { type: DETECTION_RULE_TYPES.CHANNEL_PRESENT, channel: 'BoostPressure', weight: 0.9 },
      { type: DETECTION_RULE_TYPES.CHANNEL_PRESENT, channel: 'Boost_press', weight: 0.9 },
      // MAP values above atmospheric (14.7 psi) indicate boost
      { type: DETECTION_RULE_TYPES.VALUE_ABOVE, channel: 'MAP', threshold: 16, weight: 0.7 },
      // Wastegate/turbo control channels
      { type: DETECTION_RULE_TYPES.CHANNEL_PRESENT, channel: 'WG_DC', weight: 0.6 },
      { type: DETECTION_RULE_TYPES.CHANNEL_PRESENT, channel: 'Wastegate_DC', weight: 0.6 }
    ],
    threshold: 0.6 // Confidence threshold to classify as turbo
  },

  // Charge Air Cooler (CAC/Intercooler) detection
  cac: {
    name: 'Charge Air Cooled',
    rules: [
      // CAC-specific temperature channels
      { type: DETECTION_RULE_TYPES.CHANNEL_PRESENT, channel: 'CAC_temp', weight: 0.9 },
      { type: DETECTION_RULE_TYPES.CHANNEL_PRESENT, channel: 'CAC_outlet_temp', weight: 0.9 },
      { type: DETECTION_RULE_TYPES.CHANNEL_PRESENT, channel: 'Intercooler_temp', weight: 0.9 },
      // TIP/MAP delta characteristic of CAC systems (cooled air = lower TIP)
      {
        type: DETECTION_RULE_TYPES.DELTA_RANGE,
        channel1: 'TIP',
        channel2: 'MAP',
        min: 0.5,  // CAC typically shows TIP slightly above MAP
        max: 8,    // But not excessively
        weight: 0.7
      },
      // IAT (Intake Air Temp) significantly cooler than ambient indicates CAC
      { type: DETECTION_RULE_TYPES.VALUE_BELOW, channel: 'IAT', threshold: 140, weight: 0.4 }
    ],
    threshold: 0.5
  },

  // MFG (Mass Flow Gas) fuel system detection
  mfg: {
    name: 'MFG Fuel System',
    rules: [
      { type: DETECTION_RULE_TYPES.CHANNEL_PRESENT, channel: 'MFG_DPPress', weight: 0.9 },
      { type: DETECTION_RULE_TYPES.CHANNEL_PRESENT, channel: 'MFG_USPress', weight: 0.9 },
      { type: DETECTION_RULE_TYPES.CHANNEL_PRESENT, channel: 'MFG_DSPress', weight: 0.9 },
      { type: DETECTION_RULE_TYPES.CHANNEL_PRESENT, channel: 'MFG_TPS_act_pct', weight: 0.8 },
      { type: DETECTION_RULE_TYPES.CHANNEL_PRESENT, channel: 'MFG_TPS_cmd_pct', weight: 0.8 }
    ],
    threshold: 0.7
  },

  // EPR (Electronic Pressure Regulator) fuel system detection
  epr: {
    name: 'EPR Fuel System',
    rules: [
      { type: DETECTION_RULE_TYPES.CHANNEL_PRESENT, channel: 'EPR_cmd', weight: 0.9 },
      { type: DETECTION_RULE_TYPES.CHANNEL_PRESENT, channel: 'EPR_act', weight: 0.9 },
      { type: DETECTION_RULE_TYPES.CHANNEL_PRESENT, channel: 'FuelPress_cmd', weight: 0.7 },
      { type: DETECTION_RULE_TYPES.CHANNEL_PRESENT, channel: 'FuelPress_act', weight: 0.7 }
    ],
    threshold: 0.6
  },

  // Natural gas fuel detection
  natural_gas: {
    name: 'Natural Gas',
    rules: [
      { type: DETECTION_RULE_TYPES.CHANNEL_PRESENT, channel: 'NGPress', weight: 0.8 },
      { type: DETECTION_RULE_TYPES.CHANNEL_PRESENT, channel: 'NG_pressure', weight: 0.8 },
      { type: DETECTION_RULE_TYPES.METADATA_MATCH, field: 'fuelType', value: 'natural_gas', weight: 1.0 },
      { type: DETECTION_RULE_TYPES.METADATA_MATCH, field: 'fuelType', value: 'cng', weight: 1.0 }
    ],
    threshold: 0.5
  },

  // Propane/LPG fuel detection
  propane: {
    name: 'Propane/LPG',
    rules: [
      { type: DETECTION_RULE_TYPES.CHANNEL_PRESENT, channel: 'LPGPress', weight: 0.8 },
      { type: DETECTION_RULE_TYPES.CHANNEL_PRESENT, channel: 'PropanePress', weight: 0.8 },
      { type: DETECTION_RULE_TYPES.METADATA_MATCH, field: 'fuelType', value: 'propane', weight: 1.0 },
      { type: DETECTION_RULE_TYPES.METADATA_MATCH, field: 'fuelType', value: 'lpg', weight: 1.0 }
    ],
    threshold: 0.5
  }
};

/**
 * Engine size detection based on operational characteristics
 */
export const ENGINE_SIZE_SIGNATURES = {
  '5.7L': {
    rules: [
      // Typical TPS at full load for 5.7L is ~38%
      { type: DETECTION_RULE_TYPES.VALUE_RANGE, channel: 'TPS', min: 30, max: 45, condition: 'fullLoad', weight: 0.6 },
      // Rated RPM typically 1800
      { type: DETECTION_RULE_TYPES.VALUE_RANGE, channel: 'rpm', min: 1750, max: 1850, condition: 'steadyState', weight: 0.5 },
      { type: DETECTION_RULE_TYPES.METADATA_MATCH, field: 'engineSize', value: '5.7L', weight: 1.0 }
    ]
  },
  '8.8L': {
    rules: [
      // Typical TPS at full load for 8.8L is ~45%
      { type: DETECTION_RULE_TYPES.VALUE_RANGE, channel: 'TPS', min: 40, max: 50, condition: 'fullLoad', weight: 0.6 },
      { type: DETECTION_RULE_TYPES.METADATA_MATCH, field: 'engineSize', value: '8.8L', weight: 1.0 }
    ]
  },
  '40L': {
    rules: [
      // 40L engines use MFG fuel system
      { type: DETECTION_RULE_TYPES.CHANNEL_PRESENT, channel: 'MFG_DPPress', weight: 0.7 },
      // Higher TPS at full load (~85%)
      { type: DETECTION_RULE_TYPES.VALUE_RANGE, channel: 'TPS', min: 80, max: 90, condition: 'fullLoad', weight: 0.5 },
      { type: DETECTION_RULE_TYPES.METADATA_MATCH, field: 'engineSize', value: '40L', weight: 1.0 }
    ]
  },
  '53L': {
    rules: [
      { type: DETECTION_RULE_TYPES.CHANNEL_PRESENT, channel: 'MFG_DPPress', weight: 0.7 },
      { type: DETECTION_RULE_TYPES.VALUE_RANGE, channel: 'TPS', min: 80, max: 90, condition: 'fullLoad', weight: 0.5 },
      { type: DETECTION_RULE_TYPES.METADATA_MATCH, field: 'engineSize', value: '53L', weight: 1.0 }
    ]
  }
};

/**
 * Profile mapping rules - map detected characteristics to profiles
 * Order matters - more specific rules should come first
 */
export const PROFILE_MAPPING_RULES = [
  // 5.7L Turbo CAC
  {
    profileId: 'psi-industrial-5.7l-turbo-cac',
    conditions: {
      engineSize: '5.7L',
      variants: ['turbo', 'cac']
    },
    priority: 100
  },
  // 5.7L Turbo non-CAC
  {
    profileId: 'psi-industrial-5.7l-turbo',
    conditions: {
      engineSize: '5.7L',
      variants: ['turbo'],
      excludeVariants: ['cac']
    },
    priority: 90
  },
  // 5.7L NA (naturally aspirated)
  {
    profileId: 'psi-industrial-5.7l-na',
    conditions: {
      engineSize: '5.7L',
      excludeVariants: ['turbo']
    },
    priority: 80
  },
  // 40L/53L MFG
  {
    profileId: 'psi-hd-40l-53l-mfg',
    conditions: {
      engineSize: ['40L', '53L'],
      variants: ['mfg']
    },
    priority: 100
  },
  // PSI HD base
  {
    profileId: 'psi-hd-base',
    conditions: {
      engineFamily: 'psi-hd'
    },
    priority: 10
  },
  // PSI Industrial base
  {
    profileId: 'psi-industrial-base',
    conditions: {
      engineFamily: 'psi-industrial'
    },
    priority: 10
  }
];

/**
 * Analyze data to extract statistical summaries for detection
 */
function analyzeDataStatistics(data) {
  if (!data || data.length === 0) return {};

  const stats = {};
  const columns = Object.keys(data[0]);

  for (const column of columns) {
    const values = data
      .map(row => row[column])
      .filter(v => typeof v === 'number' && Number.isFinite(v));

    if (values.length === 0) continue;

    stats[column] = {
      count: values.length,
      min: Math.min(...values),
      max: Math.max(...values),
      mean: values.reduce((a, b) => a + b, 0) / values.length,
      present: true
    };
  }

  return stats;
}

/**
 * Case-insensitive channel lookup
 */
function findChannel(stats, channelName) {
  const lower = channelName.toLowerCase();
  for (const key of Object.keys(stats)) {
    if (key.toLowerCase() === lower) {
      return stats[key];
    }
  }
  return null;
}

/**
 * Check if a channel exists (case-insensitive)
 */
function channelExists(stats, channelName) {
  return findChannel(stats, channelName) !== null;
}

/**
 * Evaluate a single detection rule
 */
function evaluateRule(rule, stats, metadata = {}) {
  switch (rule.type) {
    case DETECTION_RULE_TYPES.CHANNEL_PRESENT:
      return channelExists(stats, rule.channel) ? rule.weight : 0;

    case DETECTION_RULE_TYPES.CHANNEL_ABSENT:
      return !channelExists(stats, rule.channel) ? rule.weight : 0;

    case DETECTION_RULE_TYPES.VALUE_ABOVE: {
      const channelStats = findChannel(stats, rule.channel);
      if (!channelStats) return 0;
      return channelStats.max > rule.threshold ? rule.weight : 0;
    }

    case DETECTION_RULE_TYPES.VALUE_BELOW: {
      const channelStats = findChannel(stats, rule.channel);
      if (!channelStats) return 0;
      return channelStats.min < rule.threshold ? rule.weight : 0;
    }

    case DETECTION_RULE_TYPES.VALUE_RANGE: {
      const channelStats = findChannel(stats, rule.channel);
      if (!channelStats) return 0;
      // Check if operating range overlaps with expected range
      if (channelStats.max >= rule.min && channelStats.min <= rule.max) {
        return rule.weight;
      }
      return 0;
    }

    case DETECTION_RULE_TYPES.DELTA_RANGE: {
      const stats1 = findChannel(stats, rule.channel1);
      const stats2 = findChannel(stats, rule.channel2);
      if (!stats1 || !stats2) return 0;
      // Use mean values to estimate typical delta
      const delta = stats1.mean - stats2.mean;
      if (delta >= rule.min && delta <= rule.max) {
        return rule.weight;
      }
      return 0;
    }

    case DETECTION_RULE_TYPES.PATTERN_MATCH: {
      const regex = new RegExp(rule.pattern, 'i');
      for (const channel of Object.keys(stats)) {
        if (regex.test(channel)) {
          return rule.weight;
        }
      }
      return 0;
    }

    case DETECTION_RULE_TYPES.METADATA_MATCH: {
      const value = metadata[rule.field];
      if (value === undefined) return 0;
      const valueStr = String(value).toLowerCase();
      const matchStr = String(rule.value).toLowerCase();
      return valueStr === matchStr || valueStr.includes(matchStr) ? rule.weight : 0;
    }

    default:
      return 0;
  }
}

/**
 * Detect engine variants from data statistics
 */
function detectVariants(stats, metadata = {}) {
  const detected = {};

  for (const [variantId, signature] of Object.entries(ENGINE_VARIANT_SIGNATURES)) {
    let totalWeight = 0;
    let earnedWeight = 0;
    const matchedRules = [];

    for (const rule of signature.rules) {
      totalWeight += rule.weight;
      const score = evaluateRule(rule, stats, metadata);
      earnedWeight += score;
      if (score > 0) {
        matchedRules.push({ ...rule, score });
      }
    }

    const confidence = totalWeight > 0 ? earnedWeight / totalWeight : 0;
    const isDetected = confidence >= signature.threshold;

    detected[variantId] = {
      name: signature.name,
      detected: isDetected,
      confidence: Math.round(confidence * 100) / 100,
      matchedRules
    };
  }

  return detected;
}

/**
 * Detect engine size from data statistics
 */
function detectEngineSize(stats, metadata = {}) {
  const candidates = [];

  for (const [sizeId, signature] of Object.entries(ENGINE_SIZE_SIGNATURES)) {
    let totalWeight = 0;
    let earnedWeight = 0;

    for (const rule of signature.rules) {
      totalWeight += rule.weight;
      earnedWeight += evaluateRule(rule, stats, metadata);
    }

    const confidence = totalWeight > 0 ? earnedWeight / totalWeight : 0;
    if (confidence > 0.3) {
      candidates.push({ sizeId, confidence });
    }
  }

  // Sort by confidence descending
  candidates.sort((a, b) => b.confidence - a.confidence);
  return candidates;
}

/**
 * Match detected characteristics to a profile
 */
function matchProfile(detectedVariants, detectedSize, detectedFamily, existingProfiles) {
  const activeVariants = Object.entries(detectedVariants)
    .filter(([_, v]) => v.detected)
    .map(([id]) => id);

  const candidates = [];

  for (const rule of PROFILE_MAPPING_RULES) {
    let matches = true;
    let score = rule.priority;

    // Check engine size
    if (rule.conditions.engineSize) {
      const sizes = Array.isArray(rule.conditions.engineSize)
        ? rule.conditions.engineSize
        : [rule.conditions.engineSize];
      if (!sizes.includes(detectedSize)) {
        matches = false;
      }
    }

    // Check engine family
    if (rule.conditions.engineFamily && rule.conditions.engineFamily !== detectedFamily) {
      matches = false;
    }

    // Check required variants
    if (rule.conditions.variants) {
      for (const variant of rule.conditions.variants) {
        if (!activeVariants.includes(variant)) {
          matches = false;
          break;
        }
      }
    }

    // Check excluded variants
    if (rule.conditions.excludeVariants) {
      for (const variant of rule.conditions.excludeVariants) {
        if (activeVariants.includes(variant)) {
          matches = false;
          break;
        }
      }
    }

    // Verify profile exists
    if (matches && !existingProfiles.includes(rule.profileId)) {
      // Profile doesn't exist - suggest fallback
      continue;
    }

    if (matches) {
      candidates.push({ profileId: rule.profileId, score });
    }
  }

  // Sort by score descending
  candidates.sort((a, b) => b.score - a.score);
  return candidates;
}

/**
 * Load existing profiles list
 */
async function loadExistingProfiles() {
  try {
    const indexPath = path.join(PROFILES_DIR, '_index.json');
    const content = await fs.readFile(indexPath, 'utf-8');
    const index = JSON.parse(content);
    return index.profiles || [];
  } catch (err) {
    console.error('Failed to load profiles index:', err.message);
    return ['global-defaults', 'psi-hd-base', 'psi-industrial-base'];
  }
}

/**
 * Main auto-detection function
 *
 * @param {Array} data - Array of data rows to analyze
 * @param {Object} options - Detection options
 * @param {Object} options.metadata - Optional file metadata (engine size, fuel type, etc.)
 * @param {string} options.hintFamily - Hint for engine family if known
 * @param {number} options.sampleSize - Max rows to analyze (default 1000)
 * @returns {Object} Detection results with suggested profile and confidence
 */
export async function detectProfile(data, options = {}) {
  const {
    metadata = {},
    hintFamily = null,
    sampleSize = 1000
  } = options;

  // Sample data if too large
  const sampleData = data.length > sampleSize
    ? data.filter((_, i) => i % Math.ceil(data.length / sampleSize) === 0)
    : data;

  // Analyze data statistics
  const stats = analyzeDataStatistics(sampleData);
  const availableChannels = Object.keys(stats);

  // Detect variants
  const variants = detectVariants(stats, metadata);

  // Detect engine size
  const sizeCandiates = detectEngineSize(stats, metadata);
  const detectedSize = sizeCandiates.length > 0 ? sizeCandiates[0].sizeId : null;

  // Determine engine family from metadata or hints
  let engineFamily = metadata.engineFamily || hintFamily;
  if (!engineFamily && detectedSize) {
    // Infer family from size
    if (['40L', '53L', '22L'].includes(detectedSize)) {
      engineFamily = 'psi-hd';
    } else if (['5.7L', '8.8L', '4.3L'].includes(detectedSize)) {
      engineFamily = 'psi-industrial';
    }
  }

  // Load existing profiles
  const existingProfiles = await loadExistingProfiles();

  // Match to profile
  const profileCandidates = matchProfile(variants, detectedSize, engineFamily, existingProfiles);

  // Build result
  const result = {
    detectedVariants: variants,
    detectedSize: detectedSize ? {
      sizeId: detectedSize,
      confidence: sizeCandiates[0]?.confidence || 0,
      alternatives: sizeCandiates.slice(1)
    } : null,
    detectedFamily: engineFamily,
    availableChannels,
    channelCount: availableChannels.length,
    sampleCount: sampleData.length,
    suggestedProfile: profileCandidates.length > 0 ? profileCandidates[0] : null,
    alternativeProfiles: profileCandidates.slice(1, 4),
    confidence: calculateOverallConfidence(variants, sizeCandiates, profileCandidates)
  };

  // Add human-readable summary
  result.summary = buildDetectionSummary(result);

  return result;
}

/**
 * Calculate overall detection confidence
 */
function calculateOverallConfidence(variants, sizeCandiates, profileCandidates) {
  let score = 0;
  let factors = 0;

  // Variant detection confidence
  const detectedVariants = Object.values(variants).filter(v => v.detected);
  if (detectedVariants.length > 0) {
    const avgVariantConf = detectedVariants.reduce((sum, v) => sum + v.confidence, 0) / detectedVariants.length;
    score += avgVariantConf * 0.4;
    factors += 0.4;
  }

  // Size detection confidence
  if (sizeCandiates.length > 0) {
    score += sizeCandiates[0].confidence * 0.3;
    factors += 0.3;
  }

  // Profile match
  if (profileCandidates.length > 0) {
    score += 0.3; // Binary - either we have a match or not
    factors += 0.3;
  }

  return factors > 0 ? Math.round((score / factors) * 100) / 100 : 0;
}

/**
 * Build human-readable detection summary
 */
function buildDetectionSummary(result) {
  const parts = [];

  // Detected variants
  const activeVariants = Object.entries(result.detectedVariants)
    .filter(([_, v]) => v.detected)
    .map(([_, v]) => v.name);

  if (activeVariants.length > 0) {
    parts.push(`Detected: ${activeVariants.join(', ')}`);
  }

  // Engine size
  if (result.detectedSize) {
    parts.push(`Engine: ${result.detectedSize.sizeId} (${Math.round(result.detectedSize.confidence * 100)}% confidence)`);
  }

  // Suggested profile
  if (result.suggestedProfile) {
    parts.push(`Suggested profile: ${result.suggestedProfile.profileId}`);
  } else {
    parts.push('No specific profile match - using defaults');
  }

  return parts.join(' | ');
}

/**
 * Get detection rules for a specific variant (for UI display)
 */
export function getVariantDetectionRules(variantId) {
  return ENGINE_VARIANT_SIGNATURES[variantId] || null;
}

/**
 * Get all available variant IDs
 */
export function getAvailableVariants() {
  return Object.entries(ENGINE_VARIANT_SIGNATURES).map(([id, sig]) => ({
    id,
    name: sig.name,
    threshold: sig.threshold
  }));
}

export default {
  detectProfile,
  getVariantDetectionRules,
  getAvailableVariants,
  ENGINE_VARIANT_SIGNATURES,
  ENGINE_SIZE_SIGNATURES,
  PROFILE_MAPPING_RULES,
  DETECTION_RULE_TYPES
};
