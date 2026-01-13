/**
 * Threshold Service
 * Frontend API client for threshold profile operations
 */

const API_BASE = '/api/thresholds';

/**
 * Helper function for API calls
 */
async function apiCall(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;

  try {
    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      },
      ...options
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || `HTTP ${response.status}`);
    }

    return data;
  } catch (error) {
    console.error(`API call failed: ${endpoint}`, error);
    throw error;
  }
}

/**
 * Get list of all profiles with metadata
 */
export async function listProfiles() {
  const result = await apiCall('/');
  return result.profiles;
}

/**
 * Get the profiles index (engine families, fuel types, etc.)
 */
export async function getIndex() {
  const result = await apiCall('/index');
  return result.index;
}

/**
 * Get profiles organized by engine family
 */
export async function getProfilesByFamily() {
  const result = await apiCall('/by-family');
  return result.byFamily;
}

/**
 * Get a single profile by ID (raw, without inheritance)
 */
export async function getProfile(profileId) {
  const result = await apiCall(`/profile/${profileId}`);
  return result.profile;
}

/**
 * Get a profile with all inherited values merged
 */
export async function getResolvedProfile(profileId) {
  const result = await apiCall(`/resolved/${profileId}`);
  return result.profile;
}

/**
 * Create or update a profile
 */
export async function saveProfile(profile) {
  const result = await apiCall('/profile', {
    method: 'POST',
    body: JSON.stringify(profile)
  });
  return result.profile;
}

/**
 * Update an existing profile
 */
export async function updateProfile(profileId, updates) {
  const result = await apiCall(`/profile/${profileId}`, {
    method: 'PUT',
    body: JSON.stringify(updates)
  });
  return result.profile;
}

/**
 * Delete a profile
 */
export async function deleteProfile(profileId) {
  const result = await apiCall(`/profile/${profileId}`, {
    method: 'DELETE'
  });
  return result;
}

/**
 * Duplicate a profile
 */
export async function duplicateProfile(profileId, newId, newName) {
  const result = await apiCall(`/duplicate/${profileId}`, {
    method: 'POST',
    body: JSON.stringify({ newId, newName })
  });
  return result.profile;
}

/**
 * Compare two profiles
 */
export async function compareProfiles(profile1, profile2) {
  const result = await apiCall(`/compare?profile1=${profile1}&profile2=${profile2}`);
  return result.comparison;
}

/**
 * Get effective threshold value for a path
 */
export async function getEffectiveThreshold(profileId, path) {
  const result = await apiCall(`/effective/${profileId}/${path}`);
  return result.effective;
}

/**
 * Export all profiles as JSON
 */
export async function exportProfiles() {
  const response = await fetch(`${API_BASE}/export`);
  if (!response.ok) {
    throw new Error('Failed to export profiles');
  }
  return await response.json();
}

/**
 * Import profiles from JSON data
 */
export async function importProfiles(file, overwrite = false) {
  const formData = new FormData();
  formData.append('file', file);

  const url = `${API_BASE}/import${overwrite ? '?overwrite=true' : ''}`;
  const response = await fetch(url, {
    method: 'POST',
    body: formData
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'Import failed');
  }
  return data.results;
}

/**
 * Validate threshold values
 */
export async function validateThresholds(thresholds) {
  const result = await apiCall('/validate', {
    method: 'POST',
    body: JSON.stringify({ thresholds })
  });
  return result.validation;
}

/**
 * Clear server-side cache
 */
export async function clearCache() {
  const result = await apiCall('/clear-cache', {
    method: 'POST'
  });
  return result;
}

/**
 * Get selectable profiles for the upload page
 * Returns profiles grouped by engine family with fuel type variants
 */
export async function getSelectableProfiles() {
  const [index, profiles] = await Promise.all([
    getIndex(),
    listProfiles()
  ]);

  // Build a hierarchical structure for the selector
  const selectableProfiles = [];

  // Add Global Defaults as an option
  const globalDefaults = profiles.find(p => p.profileId === 'global-defaults');
  if (globalDefaults) {
    selectableProfiles.push({
      profileId: 'global-defaults',
      name: 'Use Default Thresholds',
      description: 'Standard thresholds for all engine types',
      engineFamily: null,
      fuelType: null,
      isDefault: true
    });
  }

  // Group profiles by engine family
  for (const family of index.engineFamilies) {
    const familyProfiles = profiles.filter(
      p => p.engineFamily === family.name && p.fuelType
    );

    if (familyProfiles.length > 0) {
      // Add engine family as a group header
      selectableProfiles.push({
        isGroupHeader: true,
        name: family.name,
        description: family.description
      });

      // Add fuel type variants
      for (const profile of familyProfiles) {
        const fuelInfo = index.fuelTypes.find(f => f.id === profile.fuelType);
        selectableProfiles.push({
          profileId: profile.profileId,
          name: `${family.name} - ${fuelInfo?.name || profile.fuelType}`,
          description: profile.description,
          engineFamily: family.name,
          fuelType: profile.fuelType,
          fuelTypeName: fuelInfo?.name
        });
      }
    }
  }

  return {
    profiles: selectableProfiles,
    engineFamilies: index.engineFamilies,
    fuelTypes: index.fuelTypes
  };
}
