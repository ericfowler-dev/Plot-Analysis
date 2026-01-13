/**
 * Threshold Merger Utility
 * Handles inheritance resolution and merging of threshold profiles
 */

import { loadProfile, getProfileHierarchy } from './profileLoader.js';

/**
 * Deep merge two objects, with source overriding target
 * Arrays are replaced, not merged
 */
export function deepMerge(target, source) {
  const result = { ...target };

  for (const key of Object.keys(source)) {
    if (source[key] === null || source[key] === undefined) {
      continue; // Skip null/undefined values (don't override)
    }

    if (
      typeof source[key] === 'object' &&
      !Array.isArray(source[key]) &&
      source[key] !== null &&
      typeof target[key] === 'object' &&
      !Array.isArray(target[key]) &&
      target[key] !== null
    ) {
      // Recursively merge objects
      result[key] = deepMerge(target[key], source[key]);
    } else {
      // Replace value (including arrays)
      result[key] = source[key];
    }
  }

  return result;
}

/**
 * Merge thresholds from multiple profiles in hierarchy order
 * Later profiles override earlier ones
 */
export function mergeThresholds(hierarchy) {
  let merged = {};

  for (const profile of hierarchy) {
    if (profile.thresholds) {
      merged = deepMerge(merged, profile.thresholds);
    }
  }

  return merged;
}

/**
 * Merge anomaly rules from multiple profiles
 * Rules with the same ID are replaced, new rules are added
 */
export function mergeAnomalyRules(hierarchy) {
  const rulesMap = new Map();

  for (const profile of hierarchy) {
    if (profile.anomalyRules && Array.isArray(profile.anomalyRules)) {
      for (const rule of profile.anomalyRules) {
        rulesMap.set(rule.id, {
          ...rule,
          sourceProfile: profile.profileId
        });
      }
    }
  }

  return Array.from(rulesMap.values());
}

/**
 * Resolve a profile with all inherited values merged
 * Returns a complete profile with all thresholds filled in
 */
export async function resolveProfile(profileId) {
  const hierarchy = await getProfileHierarchy(profileId);

  if (hierarchy.length === 0) {
    throw new Error(`Profile not found: ${profileId}`);
  }

  const leafProfile = hierarchy[hierarchy.length - 1];

  // Build the resolved profile
  const resolved = {
    // Use leaf profile's metadata
    profileId: leafProfile.profileId,
    name: leafProfile.name,
    description: leafProfile.description,
    engineFamily: leafProfile.engineFamily,
    fuelType: leafProfile.fuelType,
    application: leafProfile.application,
    version: leafProfile.version,
    status: leafProfile.status,

    // Track inheritance
    inheritanceChain: hierarchy.map(p => p.profileId),

    // Merge thresholds from all ancestors
    thresholds: mergeThresholds(hierarchy),

    // Merge anomaly rules from all ancestors
    anomalyRules: mergeAnomalyRules(hierarchy),

    // Include metadata from global defaults
    metadata: hierarchy[0].metadata || {}
  };

  return resolved;
}

/**
 * Get effective threshold value for a specific parameter
 * Returns the value and which profile it came from
 */
export async function getEffectiveThreshold(profileId, thresholdPath) {
  const hierarchy = await getProfileHierarchy(profileId);
  const pathParts = thresholdPath.split('.');

  let effectiveValue = undefined;
  let sourceProfile = null;

  for (const profile of hierarchy) {
    let value = profile.thresholds;

    for (const part of pathParts) {
      if (value && typeof value === 'object' && part in value) {
        value = value[part];
      } else {
        value = undefined;
        break;
      }
    }

    if (value !== undefined) {
      effectiveValue = value;
      sourceProfile = profile.profileId;
    }
  }

  return {
    value: effectiveValue,
    source: sourceProfile,
    path: thresholdPath
  };
}

/**
 * Compare two profiles and return differences
 */
export async function compareProfiles(profileId1, profileId2) {
  const resolved1 = await resolveProfile(profileId1);
  const resolved2 = await resolveProfile(profileId2);

  const differences = [];

  function findDifferences(obj1, obj2, path = '') {
    const allKeys = new Set([...Object.keys(obj1 || {}), ...Object.keys(obj2 || {})]);

    for (const key of allKeys) {
      const currentPath = path ? `${path}.${key}` : key;
      const val1 = obj1?.[key];
      const val2 = obj2?.[key];

      if (typeof val1 === 'object' && typeof val2 === 'object' && !Array.isArray(val1) && !Array.isArray(val2)) {
        findDifferences(val1, val2, currentPath);
      } else if (JSON.stringify(val1) !== JSON.stringify(val2)) {
        differences.push({
          path: currentPath,
          profile1: { id: profileId1, value: val1 },
          profile2: { id: profileId2, value: val2 }
        });
      }
    }
  }

  findDifferences(resolved1.thresholds, resolved2.thresholds);

  return {
    profile1: profileId1,
    profile2: profileId2,
    differences
  };
}

/**
 * Validate that a profile's thresholds are within acceptable ranges
 */
export function validateThresholdValues(thresholds) {
  const warnings = [];
  const errors = [];

  // Battery voltage checks
  if (thresholds.battery) {
    const { critical, warning } = thresholds.battery;
    if (critical?.min && warning?.min && critical.min >= warning.min) {
      errors.push('Battery critical min should be less than warning min');
    }
    if (critical?.max && warning?.max && critical.max <= warning.max) {
      errors.push('Battery critical max should be greater than warning max');
    }
    if (critical?.min && critical.min < 8) {
      warnings.push('Battery critical min below 8V is unusually low');
    }
  }

  // Coolant temp checks
  if (thresholds.coolantTemp) {
    const { critical, warning } = thresholds.coolantTemp;
    if (critical?.max && warning?.max && critical.max <= warning.max) {
      errors.push('Coolant temp critical max should be greater than warning max');
    }
    if (critical?.max && critical.max > 260) {
      warnings.push('Coolant temp critical max above 260°F is unusually high');
    }
  }

  // Oil pressure checks
  if (thresholds.oilPressure) {
    const { critical, warning } = thresholds.oilPressure;
    if (critical?.min && warning?.min && critical.min >= warning.min) {
      errors.push('Oil pressure critical min should be less than warning min');
    }
    if (critical?.min && critical.min < 5) {
      warnings.push('Oil pressure critical min below 5 psi is very low');
    }
  }

  // RPM checks
  if (thresholds.rpm) {
    const { critical, warning, overspeed } = thresholds.rpm;
    if (critical?.max && warning?.max && critical.max <= warning.max) {
      errors.push('RPM critical max should be greater than warning max');
    }
    if (overspeed && critical?.max && overspeed <= critical.max) {
      errors.push('RPM overspeed should be greater than critical max');
    }
  }

  return { warnings, errors, isValid: errors.length === 0 };
}

/**
 * Create a minimal override profile (only include changed values)
 */
export function createOverrideProfile(baseProfile, modifiedProfile) {
  function getOverrides(base, modified, path = '') {
    const overrides = {};

    for (const key of Object.keys(modified)) {
      const currentPath = path ? `${path}.${key}` : key;
      const baseVal = base?.[key];
      const modVal = modified[key];

      if (typeof modVal === 'object' && !Array.isArray(modVal) && modVal !== null) {
        const nested = getOverrides(baseVal, modVal, currentPath);
        if (Object.keys(nested).length > 0) {
          overrides[key] = nested;
        }
      } else if (JSON.stringify(baseVal) !== JSON.stringify(modVal)) {
        overrides[key] = modVal;
      }
    }

    return overrides;
  }

  return getOverrides(baseProfile.thresholds, modifiedProfile.thresholds);
}
