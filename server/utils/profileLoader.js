/**
 * Profile Loader Utility
 * Handles loading, caching, and managing threshold profiles from the file system
 */

import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROFILES_DIR = path.join(__dirname, '../data/profiles');

// In-memory cache for loaded profiles
let profileCache = new Map();
let indexCache = null;
let cacheTimestamp = 0;
const CACHE_TTL = 60000; // 1 minute cache TTL

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

/**
 * Load the profiles index file
 */
export async function loadIndex(forceReload = false) {
  if (indexCache && isCacheValid() && !forceReload) {
    return indexCache;
  }

  try {
    const indexPath = path.join(PROFILES_DIR, '_index.json');
    const content = await fs.readFile(indexPath, 'utf8');
    indexCache = JSON.parse(content);
    cacheTimestamp = Date.now();
    return indexCache;
  } catch (error) {
    console.error('Error loading profiles index:', error);
    throw new Error('Failed to load profiles index');
  }
}

/**
 * Load a single profile by ID
 */
export async function loadProfile(profileId, forceReload = false) {
  if (profileCache.has(profileId) && isCacheValid() && !forceReload) {
    return profileCache.get(profileId);
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

    const indexPath = path.join(PROFILES_DIR, '_index.json');
    await fs.writeFile(indexPath, JSON.stringify(index, null, 2), 'utf8');
    indexCache = index;
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

  while (currentId) {
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
