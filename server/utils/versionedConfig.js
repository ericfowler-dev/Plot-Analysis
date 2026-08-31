function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function cloneValue(value) {
  if (Array.isArray(value)) return value.map(cloneValue);
  if (!isPlainObject(value)) return value;

  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [key, cloneValue(entry)])
  );
}

function deepMerge(stored, bundled) {
  if (!isPlainObject(stored) || !isPlainObject(bundled)) {
    return cloneValue(bundled);
  }

  const merged = cloneValue(stored);
  for (const [key, value] of Object.entries(bundled)) {
    merged[key] = isPlainObject(value) && isPlainObject(stored[key])
      ? deepMerge(stored[key], value)
      : cloneValue(value);
  }
  return merged;
}

function versionParts(version) {
  return String(version || '0')
    .split(/[.+-]/)
    .map(part => {
      const match = String(part).match(/^\d+/);
      return match ? Number(match[0]) : 0;
    });
}

export function compareConfigVersions(left, right) {
  const leftParts = versionParts(left);
  const rightParts = versionParts(right);
  const length = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < length; index += 1) {
    const difference = (leftParts[index] || 0) - (rightParts[index] || 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

function mergeObjectCollection(stored = [], bundled = [], keyForEntry) {
  const storedByKey = new Map();
  for (const entry of stored || []) {
    storedByKey.set(keyForEntry(entry), entry);
  }

  const bundledKeys = new Set();
  const merged = (bundled || []).map(entry => {
    const key = keyForEntry(entry);
    bundledKeys.add(key);
    const storedEntry = storedByKey.get(key);
    return storedEntry ? deepMerge(storedEntry, entry) : cloneValue(entry);
  });

  for (const entry of stored || []) {
    if (!bundledKeys.has(keyForEntry(entry))) {
      merged.push(cloneValue(entry));
    }
  }

  return merged;
}

function matrixKey(entry = {}) {
  const normalize = value => Array.isArray(value) ? [...value].sort().join(',') : String(value ?? '*');
  return [
    entry.profileId,
    normalize(entry.family),
    normalize(entry.size),
    normalize(entry.application),
    normalize(entry.fuelType),
    normalize(entry.variants),
    normalize(entry.excludeVariants)
  ].join('|');
}

/**
 * Prefer an explicitly newer bundled profile while retaining database-only
 * fields and rules. Equal versions keep the database copy so configurator
 * edits remain authoritative after a release has been applied.
 */
export function mergeVersionedProfile(stored, bundled) {
  if (!stored) return cloneValue(bundled);
  if (!bundled) return cloneValue(stored);
  if (compareConfigVersions(bundled.version, stored.version) <= 0) {
    return cloneValue(stored);
  }

  const merged = deepMerge(stored, bundled);
  merged.anomalyRules = mergeObjectCollection(
    stored.anomalyRules,
    bundled.anomalyRules,
    rule => rule?.id || rule?.name || JSON.stringify(rule)
  );
  return merged;
}

/**
 * Apply a newer bundled index/schema without dropping custom database items.
 * Bundled entries win on matching IDs; database-only entries are appended.
 */
export function mergeVersionedIndex(stored, bundled) {
  if (!stored) return cloneValue(bundled);
  if (!bundled) return cloneValue(stored);
  if (compareConfigVersions(bundled.version, stored.version) <= 0) {
    return cloneValue(stored);
  }

  const merged = deepMerge(stored, bundled);
  const collections = {
    engineFamilies: entry => entry?.id,
    engineSizes: entry => `${entry?.family || ''}|${entry?.id || entry?.name || ''}`,
    engineVariants: entry => entry?.id,
    fuelTypes: entry => entry?.id,
    fuelSystems: entry => entry?.id,
    applications: entry => entry?.id,
    profileMatrix: matrixKey
  };

  for (const [key, keyForEntry] of Object.entries(collections)) {
    merged[key] = mergeObjectCollection(stored[key], bundled[key], keyForEntry);
  }

  merged.profiles = [...new Set([...(bundled.profiles || []), ...(stored.profiles || [])])];
  return merged;
}
