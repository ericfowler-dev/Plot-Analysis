/**
 * Profile Loader Utility
 * Handles loading, caching, and managing threshold profiles from the file system
 */

import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getPool } from '../db/pool.js';
import { ensureProfilesTables } from '../db/schema.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROFILES_DIR = path.join(__dirname, '../data/profiles');

// In-memory cache for loaded profiles
let profileCache = new Map();
let indexCache = null;
let cacheTimestamp = 0;
const CACHE_TTL = 60000; // 1 minute cache TTL
const pool = getPool();

async function useDatabase() {
  if (!pool) return false;
  await ensureProfilesTables();
  return true;
}

/**
 * Clear the profile cache
 */
export function clearCache() {
  profileCache.clear();
  indexCache = null;
  cacheTimestamp = 0;
}

/**
 * Check if cache is still valid
 */
function isCacheValid() {
  return Date.now() - cacheTimestamp < CACHE_TTL;
}

function toNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

async function saveIndex(index) {
  const dbReady = await useDatabase();
  if (dbReady) {
    await pool.query(
      `INSERT INTO profile_index (id, payload, updated_at)
       VALUES (1, $1, NOW())
       ON CONFLICT (id) DO UPDATE SET payload = $1, updated_at = NOW()`,
      [index]
    );
  }

  const indexPath = path.join(PROFILES_DIR, '_index.json');
  await fs.writeFile(indexPath, JSON.stringify(index, null, 2), 'utf8');
  indexCache = index;
  cacheTimestamp = Date.now();
}

/**
 * Load the profiles index file
 */
export async function loadIndex(forceReload = false) {
  if (indexCache && isCacheValid() && !forceReload) {
    return indexCache;
  }

  const dbReady = await useDatabase();
  if (dbReady) {
    const result = await pool.query('SELECT payload FROM profile_index WHERE id=1');
    if (result.rows.length > 0) {
      indexCache = result.rows[0].payload;
      cacheTimestamp = Date.now();
      return indexCache;
    }
  }

  try {
    const indexPath = path.join(PROFILES_DIR, '_index.json');
    const content = await fs.readFile(indexPath, 'utf8');
    const parsed = JSON.parse(content);
    indexCache = {
      ...parsed,
      engineFamilies: Array.isArray(parsed.engineFamilies) ? parsed.engineFamilies : [],
      engineSizes: Array.isArray(parsed.engineSizes) ? parsed.engineSizes : [],
      fuelTypes: Array.isArray(parsed.fuelTypes) ? parsed.fuelTypes : [],
      applications: Array.isArray(parsed.applications) ? parsed.applications : [],
      profiles: Array.isArray(parsed.profiles) ? parsed.profiles : []
    };
    cacheTimestamp = Date.now();
    return indexCache;
  } catch (error) {
    console.error('Error loading profiles index:', error);
    throw new Error('Failed to load profiles index');
  }
}

/**
 * Add a new engine size to the profiles index
 */
export async function addEngineSize(payload = {}) {
  const index = await loadIndex(true);
  const engineSizes = Array.isArray(index.engineSizes) ? index.engineSizes : [];
  index.engineSizes = engineSizes;

  const rawId = String(payload.id || '').trim();
  if (!rawId) {
    throw new Error('Engine size id is required');
  }
  const rawName = String(payload.name || rawId).trim();

  const familyValue = String(payload.family || '').trim();
  if (!familyValue) {
    throw new Error('Engine family is required');
  }
  const familyEntry = (index.engineFamilies || []).find(
    entry => entry.id === familyValue || entry.name === familyValue
  );
  if (!familyEntry) {
    throw new Error(`Unknown engine family: ${familyValue}`);
  }

  if (engineSizes.some(size => size.id === rawId)) {
    throw new Error(`Engine size already exists: ${rawId}`);
  }

  const familyDefaults = engineSizes.find(size => size.family === familyEntry.id)?.params || {};
  const paramsInput = payload.params || {};
  const params = {
    fullLoadTpsThreshold: toNumber(paramsInput.fullLoadTpsThreshold ?? payload.fullLoadTpsThreshold)
      ?? familyDefaults.fullLoadTpsThreshold
      ?? 80,
    ratedRpm: toNumber(paramsInput.ratedRpm ?? payload.ratedRpm)
      ?? familyDefaults.ratedRpm
      ?? 1800,
    idleRpm: toNumber(paramsInput.idleRpm ?? payload.idleRpm)
      ?? familyDefaults.idleRpm
      ?? 700
  };

  const tipMapDelta = toNumber(paramsInput.tipMapDeltaThreshold ?? payload.tipMapDeltaThreshold);
  if (tipMapDelta !== null) {
    params.tipMapDeltaThreshold = tipMapDelta;
  } else if (familyDefaults.tipMapDeltaThreshold !== undefined) {
    params.tipMapDeltaThreshold = familyDefaults.tipMapDeltaThreshold;
  }

  const description = String(payload.description || '').trim();

  engineSizes.push({
    id: rawId,
    name: rawName,
    family: familyEntry.id,
    description,
    params,
    archived: false
  });

  index.lastUpdated = new Date().toISOString();
  await saveIndex(index);
  return index;
}

/**
 * Update an existing engine size definition in the index
 */
export async function updateEngineSize(engineSizeId, updates = {}) {
  const index = await loadIndex(true);
  const engineSizes = Array.isArray(index.engineSizes) ? index.engineSizes : [];
  index.engineSizes = engineSizes;

  const targetId = String(engineSizeId || '').trim();
  if (!targetId) {
    throw new Error('Engine size id is required');
  }

  const sizeEntry = engineSizes.find(size => size.id === targetId);
  if (!sizeEntry) {
    throw new Error(`Engine size not found: ${targetId}`);
  }

  const nextName = updates.name !== undefined ? String(updates.name).trim() : sizeEntry.name;
  if (!nextName) {
    throw new Error('Engine size name is required');
  }

  let nextFamily = sizeEntry.family;
  if (updates.family) {
    const familyValue = String(updates.family).trim();
    const familyEntry = (index.engineFamilies || []).find(
      entry => entry.id === familyValue || entry.name === familyValue
    );
    if (!familyEntry) {
      throw new Error(`Unknown engine family: ${familyValue}`);
    }
    nextFamily = familyEntry.id;
  }

  const nextDescription = updates.description !== undefined
    ? String(updates.description).trim()
    : (sizeEntry.description || '');

  const paramsInput = updates.params || {};
  const mergedParams = {
    ...sizeEntry.params
  };

  const fullLoadTpsThreshold = toNumber(paramsInput.fullLoadTpsThreshold);
  if (fullLoadTpsThreshold !== null) {
    mergedParams.fullLoadTpsThreshold = fullLoadTpsThreshold;
  }
  const ratedRpm = toNumber(paramsInput.ratedRpm);
  if (ratedRpm !== null) {
    mergedParams.ratedRpm = ratedRpm;
  }
  const idleRpm = toNumber(paramsInput.idleRpm);
  if (idleRpm !== null) {
    mergedParams.idleRpm = idleRpm;
  }
  if (paramsInput.tipMapDeltaThreshold !== undefined) {
    const tipMapDelta = toNumber(paramsInput.tipMapDeltaThreshold);
    if (tipMapDelta !== null) {
      mergedParams.tipMapDeltaThreshold = tipMapDelta;
    } else {
      delete mergedParams.tipMapDeltaThreshold;
    }
  }

  sizeEntry.name = nextName;
  sizeEntry.family = nextFamily;
  sizeEntry.description = nextDescription;
  sizeEntry.params = mergedParams;

  index.lastUpdated = new Date().toISOString();
  await saveIndex(index);
  return index;
}

/**
 * Archive/unarchive an engine size definition in the index
 */
export async function setEngineSizeArchived(engineSizeId, archived = true) {
  const index = await loadIndex(true);
  const engineSizes = Array.isArray(index.engineSizes) ? index.engineSizes : [];
  index.engineSizes = engineSizes;

  const targetId = String(engineSizeId || '').trim();
  if (!targetId) {
    throw new Error('Engine size id is required');
  }

  const sizeEntry = engineSizes.find(size => size.id === targetId);
  if (!sizeEntry) {
    throw new Error(`Engine size not found: ${targetId}`);
  }

  sizeEntry.archived = Boolean(archived);
  index.lastUpdated = new Date().toISOString();
  await saveIndex(index);
  return index;
}

/**
 * Load a single profile by ID
 */
export async function loadProfile(profileId, forceReload = false) {
  if (profileCache.has(profileId) && isCacheValid() && !forceReload) {
    return profileCache.get(profileId);
  }

  const dbReady = await useDatabase();
  if (dbReady) {
    const result = await pool.query('SELECT profile FROM profiles WHERE profile_id = $1', [profileId]);
    if (result.rows.length > 0) {
      const profile = result.rows[0].profile;
      profileCache.set(profileId, profile);
      cacheTimestamp = Date.now();
      return profile;
    }
  }

  try {
    const profilePath = path.join(PROFILES_DIR, `${profileId}.json`);
    const content = await fs.readFile(profilePath, 'utf8');
    const profile = JSON.parse(content);
    profileCache.set(profileId, profile);
    cacheTimestamp = Date.now();
    return profile;
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new Error(`Profile not found: ${profileId}`);
    }
    console.error(`Error loading profile ${profileId}:`, error);
    throw new Error(`Failed to load profile: ${profileId}`);
  }
}

/**
 * Load all profiles
 */
export async function loadAllProfiles(forceReload = false) {
  const dbReady = await useDatabase();
  if (dbReady) {
    const result = await pool.query('SELECT profile FROM profiles');
    return result.rows.map(r => r.profile);
  }

  const index = await loadIndex(forceReload);
  const profiles = [];

  for (const profileId of index.profiles) {
    try {
      const profile = await loadProfile(profileId, forceReload);
      profiles.push(profile);
    } catch (error) {
      console.error(`Skipping profile ${profileId}:`, error.message);
    }
  }

  return profiles;
}

/**
 * Validate profile structure
 */
export function validateProfile(profile) {
  const errors = [];

  if (!profile.profileId) {
    errors.push('profileId is required');
  }
  if (!profile.name) {
    errors.push('name is required');
  }
  if (typeof profile.thresholds !== 'object') {
    errors.push('thresholds must be an object');
  }

  // Validate profileId format (alphanumeric with hyphens)
  if (profile.profileId && !/^[a-z0-9-]+$/.test(profile.profileId)) {
    errors.push('profileId must contain only lowercase letters, numbers, and hyphens');
  }

  if (errors.length > 0) {
    throw new Error(`Profile validation failed: ${errors.join(', ')}`);
  }

  return true;
}

/**
 * Save a profile to disk
 */
export async function saveProfile(profile) {
  if (!profile.profileId) {
    throw new Error('Profile must have a profileId');
  }

  // Validate profile structure
  validateProfile(profile);

  // Update metadata
  profile.lastModified = new Date().toISOString();

  // Save to DB if available
  const dbReady = await useDatabase();
  if (dbReady) {
    await pool.query(
      `INSERT INTO profiles (profile_id, profile, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (profile_id) DO UPDATE SET profile = $2, updated_at = NOW()`,
      [profile.profileId, profile]
    );
  }

  // Also write to disk for backward compatibility
  const profilePath = path.join(PROFILES_DIR, `${profile.profileId}.json`);
  await fs.writeFile(profilePath, JSON.stringify(profile, null, 2), 'utf8');

  // Update cache
  profileCache.set(profile.profileId, profile);

  // Update index if this is a new profile
  await updateIndex(profile.profileId);

  return profile;
}

/**
 * Delete a profile
 */
export async function deleteProfile(profileId) {
  // Don't allow deleting global-defaults
  if (profileId === 'global-defaults') {
    throw new Error('Cannot delete global-defaults profile');
  }

  // Check if other profiles depend on this one
  const allProfiles = await loadAllProfiles();
  const dependents = allProfiles.filter(p => p.parent === profileId);
  if (dependents.length > 0) {
    throw new Error(`Cannot delete profile: ${dependents.map(p => p.profileId).join(', ')} depend on it`);
  }

  const profilePath = path.join(PROFILES_DIR, `${profileId}.json`);
  await fs.unlink(profilePath);

  // Update cache
  profileCache.delete(profileId);

  // Update index
  await removeFromIndex(profileId);

  return { deleted: profileId };
}

/**
 * Update the index file with a new profile
 */
async function updateIndex(profileId) {
  const index = await loadIndex(true);

  if (!index.profiles.includes(profileId)) {
    index.profiles.push(profileId);
    index.lastUpdated = new Date().toISOString();

    await saveIndex(index);
  }
}

/**
 * Remove a profile from the index
 */
async function removeFromIndex(profileId) {
  const index = await loadIndex(true);

  const idx = index.profiles.indexOf(profileId);
  if (idx > -1) {
    index.profiles.splice(idx, 1);
    index.lastUpdated = new Date().toISOString();

    const dbReady = await useDatabase();
    if (dbReady) {
      await pool.query(
        `INSERT INTO profile_index (id, payload, updated_at)
         VALUES (1, $1, NOW())
         ON CONFLICT (id) DO UPDATE SET payload = $1, updated_at = NOW()`,
        [index]
      );
    }

    const indexPath = path.join(PROFILES_DIR, '_index.json');
    await fs.writeFile(indexPath, JSON.stringify(index, null, 2), 'utf8');
    indexCache = index;
  }
}

/**
 * Get profile hierarchy (profile + all ancestors)
 */
export async function getProfileHierarchy(profileId) {
  const hierarchy = [];
  let currentId = profileId;
  const visited = new Set();
  const chain = [];

  while (currentId) {
    if (visited.has(currentId)) {
      const cycleStart = chain.indexOf(currentId);
      const cycle = cycleStart >= 0 ? chain.slice(cycleStart) : [...chain];
      cycle.push(currentId);
      throw new Error(`Circular profile inheritance: ${cycle.join(' -> ')}`);
    }
    visited.add(currentId);
    chain.push(currentId);
    const profile = await loadProfile(currentId);
    hierarchy.unshift(profile); // Add to beginning (ancestors first)
    currentId = profile.parent;
  }

  return hierarchy;
}

/**
 * List available profiles with metadata
 */
export async function listProfiles() {
  const profiles = await loadAllProfiles();

  return profiles.map(p => ({
    profileId: p.profileId,
    name: p.name,
    description: p.description,
    parent: p.parent,
    engineFamily: p.engineFamily,
    fuelType: p.fuelType,
    application: p.application,
    status: p.status,
    version: p.version,
    lastModified: p.lastModified
  }));
}

/**
 * Get profiles organized by engine family
 */
export async function getProfilesByFamily() {
  const index = await loadIndex();
  const profiles = await loadAllProfiles();

  const byFamily = {};

  // Add "Global" as a pseudo-family
  byFamily['Global'] = profiles.filter(p => !p.engineFamily);

  // Group by engine family
  for (const family of index.engineFamilies) {
    byFamily[family.name] = profiles.filter(p => p.engineFamily === family.name);
  }

  return byFamily;
}

/**
 * Duplicate a profile with a new ID
 */
export async function duplicateProfile(sourceId, newId, newName) {
  const source = await loadProfile(sourceId);

  const newProfile = {
    ...source,
    profileId: newId,
    name: newName || `${source.name} (Copy)`,
    createdAt: new Date().toISOString(),
    lastModified: new Date().toISOString(),
    status: 'draft'
  };

  return await saveProfile(newProfile);
}

/**
 * Export all profiles as a single JSON object
 */
export async function exportAllProfiles() {
  const index = await loadIndex();
  const profiles = await loadAllProfiles();

  return {
    exportVersion: '1.0',
    exportDate: new Date().toISOString(),
    index: index,
    profiles: profiles
  };
}

/**
 * Import profiles from an export object
 */
export async function importProfiles(exportData, overwrite = false) {
  const results = {
    imported: [],
    skipped: [],
    errors: []
  };

  for (const profile of exportData.profiles) {
    try {
      // Check if profile exists
      let exists = false;
      try {
        await loadProfile(profile.profileId);
        exists = true;
      } catch {
        exists = false;
      }

      if (exists && !overwrite) {
        results.skipped.push(profile.profileId);
        continue;
      }

      await saveProfile(profile);
      results.imported.push(profile.profileId);
    } catch (error) {
      results.errors.push({ profileId: profile.profileId, error: error.message });
    }
  }

  // Clear cache to ensure fresh data
  clearCache();

  return results;
}
