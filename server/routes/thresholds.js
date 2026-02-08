/**
 * Threshold Profile API Routes
 * Provides CRUD operations for threshold profiles and admin functionality
 */

import express from 'express';
import multer from 'multer';
import {
  loadIndex,
  loadProfile,
  loadAllProfiles,
  saveProfile,
  deleteProfile,
  listProfiles,
  getProfilesByFamily,
  duplicateProfile,
  exportAllProfiles,
  importProfiles,
  clearCache,
  addEngineSize,
  updateEngineSize,
  setEngineSizeArchived,
  resolveProfileFromDimensions
} from '../utils/profileLoader.js';
import {
  resolveProfile,
  getEffectiveThreshold,
  compareProfiles,
  validateThresholdValues
} from '../utils/thresholdMerger.js';
import { requireAdmin, getAdminActor } from '../utils/adminAuth.js';
import { recordConfiguratorChange } from '../utils/configuratorStore.js';
import {
  detectProfile,
  getAvailableVariants,
  ENGINE_VARIANT_SIGNATURES
} from '../utils/profileAutoDetect.js';

const router = express.Router();

// Configure multer for JSON file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/json' || file.originalname.endsWith('.json')) {
      cb(null, true);
    } else {
      cb(new Error('Only JSON files are allowed'));
    }
  }
});

/**
 * GET /api/thresholds
 * List all available profiles with metadata
 */
router.get('/', async (req, res) => {
  try {
    const profiles = await listProfiles();
    res.json({ success: true, profiles });
  } catch (error) {
    console.error('Error listing profiles:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/thresholds/index
 * Get the profiles index with engine families, fuel types, etc.
 */
router.get('/index', async (req, res) => {
  try {
    const index = await loadIndex();
    res.json({ success: true, index });
  } catch (error) {
    console.error('Error loading index:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/thresholds/index/engine-sizes
 * Add a new engine size definition to the index
 */
router.post('/index/engine-sizes', requireAdmin, async (req, res) => {
  try {
    const index = await addEngineSize(req.body);
    await recordConfiguratorChange({
      actor: req.adminActor || getAdminActor(req),
      action: 'engineSize.create',
      details: { id: req.body?.id, family: req.body?.family }
    });
    res.json({ success: true, index });
  } catch (error) {
    console.error('Error adding engine size:', error);
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * PUT /api/thresholds/index/engine-sizes/:id
 * Update an existing engine size definition
 */
router.put('/index/engine-sizes/:id', requireAdmin, async (req, res) => {
  try {
    const index = await updateEngineSize(req.params.id, req.body);
    await recordConfiguratorChange({
      actor: req.adminActor || getAdminActor(req),
      action: 'engineSize.update',
      details: { id: req.params.id }
    });
    res.json({ success: true, index });
  } catch (error) {
    console.error('Error updating engine size:', error);
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * PATCH /api/thresholds/index/engine-sizes/:id
 * Archive/unarchive an engine size definition
 */
router.patch('/index/engine-sizes/:id', requireAdmin, async (req, res) => {
  try {
    const { archived } = req.body;
    const index = await setEngineSizeArchived(req.params.id, archived);
    await recordConfiguratorChange({
      actor: req.adminActor || getAdminActor(req),
      action: 'engineSize.archive',
      details: { id: req.params.id, archived: Boolean(archived) }
    });
    res.json({ success: true, index });
  } catch (error) {
    console.error('Error archiving engine size:', error);
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/thresholds/by-family
 * Get profiles organized by engine family
 */
router.get('/by-family', async (req, res) => {
  try {
    const byFamily = await getProfilesByFamily();
    res.json({ success: true, byFamily });
  } catch (error) {
    console.error('Error getting profiles by family:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/thresholds/profile/:profileId
 * Get a single profile by ID (raw, without inheritance resolution)
 */
router.get('/profile/:profileId', async (req, res) => {
  try {
    const { profileId } = req.params;
    const profile = await loadProfile(profileId);
    res.json({ success: true, profile });
  } catch (error) {
    console.error(`Error loading profile ${req.params.profileId}:`, error);
    const status = error.message.includes('not found') ? 404 : 500;
    res.status(status).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/thresholds/resolved/:profileId
 * Get a profile with all inherited values merged
 */
router.get('/resolved/:profileId', async (req, res) => {
  try {
    const { profileId } = req.params;
    const resolved = await resolveProfile(profileId);
    res.json({ success: true, profile: resolved });
  } catch (error) {
    console.error(`Error resolving profile ${req.params.profileId}:`, error);
    const status = error.message.includes('not found') ? 404 : 500;
    res.status(status).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/thresholds/profile
 * Create or update a profile
 */
router.post('/profile', requireAdmin, async (req, res) => {
  try {
    const profile = req.body;

    if (!profile || !profile.profileId) {
      return res.status(400).json({ success: false, error: 'Profile with profileId is required' });
    }

    // Validate threshold values if thresholds are provided
    if (profile.thresholds) {
      const validation = validateThresholdValues(profile.thresholds);
      if (!validation.isValid) {
        return res.status(400).json({
          success: false,
          error: 'Invalid threshold values',
          validationErrors: validation.errors,
          validationWarnings: validation.warnings
        });
      }
    }

    let action = 'profile.create';
    try {
      await loadProfile(profile.profileId);
      action = 'profile.update';
    } catch {}

    const saved = await saveProfile(profile);
    await recordConfiguratorChange({
      actor: req.adminActor || getAdminActor(req),
      action,
      details: { profileId: saved.profileId }
    });
    res.json({ success: true, profile: saved });
  } catch (error) {
    console.error('Error saving profile:', error);
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * PUT /api/thresholds/profile/:profileId
 * Update an existing profile
 */
router.put('/profile/:profileId', requireAdmin, async (req, res) => {
  try {
    const { profileId } = req.params;
    const updates = req.body;

    // Load existing profile
    const existing = await loadProfile(profileId);

    // Merge updates
    const updated = {
      ...existing,
      ...updates,
      profileId, // Ensure profileId can't be changed
      lastModified: new Date().toISOString()
    };

    // Validate threshold values if thresholds are provided
    if (updated.thresholds) {
      const validation = validateThresholdValues(updated.thresholds);
      if (!validation.isValid) {
        return res.status(400).json({
          success: false,
          error: 'Invalid threshold values',
          validationErrors: validation.errors,
          validationWarnings: validation.warnings
        });
      }
    }

    const saved = await saveProfile(updated);
    await recordConfiguratorChange({
      actor: req.adminActor || getAdminActor(req),
      action: 'profile.update',
      details: { profileId: saved.profileId }
    });
    res.json({ success: true, profile: saved });
  } catch (error) {
    console.error(`Error updating profile ${req.params.profileId}:`, error);
    const status = error.message.includes('not found') ? 404 : 400;
    res.status(status).json({ success: false, error: error.message });
  }
});

/**
 * DELETE /api/thresholds/profile/:profileId
 * Delete a profile
 */
router.delete('/profile/:profileId', requireAdmin, async (req, res) => {
  try {
    const { profileId } = req.params;
    const result = await deleteProfile(profileId);
    await recordConfiguratorChange({
      actor: req.adminActor || getAdminActor(req),
      action: 'profile.delete',
      details: { profileId }
    });
    res.json({ success: true, ...result });
  } catch (error) {
    console.error(`Error deleting profile ${req.params.profileId}:`, error);
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/thresholds/duplicate/:profileId
 * Duplicate a profile with a new ID
 */
router.post('/duplicate/:profileId', requireAdmin, async (req, res) => {
  try {
    const { profileId } = req.params;
    const { newId, newName } = req.body;

    if (!newId) {
      return res.status(400).json({ success: false, error: 'newId is required' });
    }

    const duplicated = await duplicateProfile(profileId, newId, newName);
    await recordConfiguratorChange({
      actor: req.adminActor || getAdminActor(req),
      action: 'profile.duplicate',
      details: { sourceId: profileId, profileId: newId }
    });
    res.json({ success: true, profile: duplicated });
  } catch (error) {
    console.error(`Error duplicating profile ${req.params.profileId}:`, error);
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/thresholds/compare
 * Compare two profiles
 * Query params: profile1, profile2
 */
router.get('/compare', async (req, res) => {
  try {
    const { profile1, profile2 } = req.query;

    if (!profile1 || !profile2) {
      return res.status(400).json({ success: false, error: 'Both profile1 and profile2 are required' });
    }

    const comparison = await compareProfiles(profile1, profile2);
    res.json({ success: true, comparison });
  } catch (error) {
    console.error('Error comparing profiles:', error);
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/thresholds/effective/:profileId/:path
 * Get the effective value for a specific threshold path
 */
router.get('/effective/:profileId/:path(*)', async (req, res) => {
  try {
    const { profileId, path } = req.params;
    const effective = await getEffectiveThreshold(profileId, path);
    res.json({ success: true, effective });
  } catch (error) {
    console.error('Error getting effective threshold:', error);
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/thresholds/export
 * Export all profiles as JSON
 */
router.get('/export', async (req, res) => {
  try {
    const exportData = await exportAllProfiles();
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="threshold-profiles-${new Date().toISOString().split('T')[0]}.json"`);
    res.json(exportData);
  } catch (error) {
    console.error('Error exporting profiles:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/thresholds/import
 * Import profiles from JSON file
 * Query param: overwrite=true to overwrite existing profiles
 */
router.post('/import', requireAdmin, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }

    const overwrite = req.query.overwrite === 'true';
    const exportData = JSON.parse(req.file.buffer.toString('utf8'));

    // Validate export data structure
    if (!exportData.profiles || !Array.isArray(exportData.profiles)) {
      return res.status(400).json({ success: false, error: 'Invalid import file format' });
    }

    const results = await importProfiles(exportData, overwrite);
    await recordConfiguratorChange({
      actor: req.adminActor || getAdminActor(req),
      action: 'profile.import',
      details: {
        imported: results.imported?.length || 0,
        skipped: results.skipped?.length || 0,
        errors: results.errors?.length || 0
      }
    });
    res.json({ success: true, results });
  } catch (error) {
    console.error('Error importing profiles:', error);
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/thresholds/validate
 * Validate threshold values without saving
 */
router.post('/validate', async (req, res) => {
  try {
    const { thresholds } = req.body;

    if (!thresholds) {
      return res.status(400).json({ success: false, error: 'thresholds object is required' });
    }

    const validation = validateThresholdValues(thresholds);
    res.json({ success: true, validation });
  } catch (error) {
    console.error('Error validating thresholds:', error);
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/thresholds/clear-cache
 * Clear the profile cache (useful for development)
 */
router.post('/clear-cache', requireAdmin, async (req, res) => {
  try {
    clearCache();
    res.json({ success: true, message: 'Cache cleared' });
  } catch (error) {
    console.error('Error clearing cache:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/thresholds/auto-detect
 * Automatically detect the appropriate profile based on data characteristics
 *
 * Request body:
 * - data: Array of data rows to analyze (required)
 * - metadata: Optional file metadata (engineSize, fuelType, etc.)
 * - hintFamily: Optional hint for engine family
 * - sampleSize: Max rows to analyze (default 1000)
 *
 * Returns detection results with suggested profile and confidence scores
 */
router.post('/auto-detect', async (req, res) => {
  try {
    const { data, metadata, hintFamily, sampleSize } = req.body;

    if (!data || !Array.isArray(data) || data.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Data array is required for auto-detection'
      });
    }

    const result = await detectProfile(data, {
      metadata: metadata || {},
      hintFamily,
      sampleSize
    });

    res.json({
      success: true,
      detection: result
    });
  } catch (error) {
    console.error('Error in auto-detection:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/thresholds/variants
 * Get list of available engine variants for selection UI
 */
router.get('/variants', async (req, res) => {
  try {
    const variants = getAvailableVariants();
    const index = await loadIndex();

    res.json({
      success: true,
      variants,
      engineVariants: index.engineVariants || [],
      signatures: ENGINE_VARIANT_SIGNATURES
    });
  } catch (error) {
    console.error('Error getting variants:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/thresholds/engine-config/:sizeId
 * Get engine size configuration including supported variants
 */
router.get('/engine-config/:sizeId', async (req, res) => {
  try {
    const { sizeId } = req.params;
    const index = await loadIndex();

    const engineSize = index.engineSizes?.find(
      s => s.id.toLowerCase() === sizeId.toLowerCase()
    );

    if (!engineSize) {
      return res.status(404).json({
        success: false,
        error: `Engine size ${sizeId} not found`
      });
    }

    // Get variant definitions
    const variantDefs = {};
    for (const variantId of (engineSize.supportedVariants || [])) {
      const variantDef = index.engineVariants?.find(v => v.id === variantId);
      if (variantDef) {
        variantDefs[variantId] = variantDef;
      }
    }

    res.json({
      success: true,
      engineSize,
      variants: variantDefs,
      variantConfigs: engineSize.variantConfigs || {}
    });
  } catch (error) {
    console.error('Error getting engine config:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/thresholds/resolve-variant
 * Resolve the profile ID for a given engine size and variant combination
 *
 * Request body:
 * - engineSize: Engine size ID (e.g., "5.7L")
 * - variants: Array of variant IDs (e.g., ["turbo", "cac"])
 */
router.post('/resolve-variant', async (req, res) => {
  try {
    const { engineSize, variants } = req.body;

    if (!engineSize) {
      return res.status(400).json({
        success: false,
        error: 'engineSize is required'
      });
    }

    const index = await loadIndex();

    const engineConfig = index.engineSizes?.find(
      s => s.id.toLowerCase() === engineSize.toLowerCase()
    );

    if (!engineConfig) {
      return res.status(404).json({
        success: false,
        error: `Engine size ${engineSize} not found`
      });
    }

    // Build variant key
    const variantKey = (variants || []).sort().join('-') || 'default';

    // Look up variant config
    let profileId = null;
    let matchedConfig = null;

    if (engineConfig.variantConfigs) {
      // Try exact match first
      if (engineConfig.variantConfigs[variantKey]) {
        matchedConfig = engineConfig.variantConfigs[variantKey];
        profileId = matchedConfig.profileId;
      } else {
        // Try partial matches - find best match
        const requestedVariants = new Set(variants || []);
        let bestMatch = null;
        let bestMatchScore = -1;

        for (const [key, config] of Object.entries(engineConfig.variantConfigs)) {
          const configVariants = new Set(key.split('-'));
          let score = 0;

          // Count matching variants
          for (const v of requestedVariants) {
            if (configVariants.has(v)) score++;
          }
          // Penalize extra variants in config
          for (const v of configVariants) {
            if (!requestedVariants.has(v)) score -= 0.5;
          }

          if (score > bestMatchScore) {
            bestMatchScore = score;
            bestMatch = { key, config };
          }
        }

        if (bestMatch) {
          matchedConfig = bestMatch.config;
          profileId = matchedConfig.profileId;
        }
      }
    }

    // Fallback to family base profile
    if (!profileId) {
      const family = index.engineFamilies?.find(f => f.id === engineConfig.family);
      profileId = family?.baseProfile || 'global-defaults';
    }

    // Verify profile exists
    try {
      await loadProfile(profileId);
    } catch {
      // Profile doesn't exist, fall back
      const family = index.engineFamilies?.find(f => f.id === engineConfig.family);
      profileId = family?.baseProfile || 'global-defaults';
      matchedConfig = null;
    }

    res.json({
      success: true,
      profileId,
      engineSize,
      requestedVariants: variants || [],
      matchedVariantConfig: matchedConfig,
      engineConfig: {
        family: engineConfig.family,
        params: engineConfig.params,
        supportedVariants: engineConfig.supportedVariants || [],
        defaultVariants: engineConfig.defaultVariants || []
      }
    });
  } catch (error) {
    console.error('Error resolving variant:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/thresholds/resolve-dimensions
 * Resolve a profile from 4 dimensions: family, size, application, fuelType + variants
 * Returns the best matching profile with fallback resolution
 */
router.post('/resolve-dimensions', async (req, res) => {
  try {
    const { family, size, application, fuelType, variants } = req.body;

    if (!family) {
      return res.status(400).json({
        success: false,
        error: 'family is required'
      });
    }

    const result = await resolveProfileFromDimensions(
      family,
      size || '*',
      application || '*',
      fuelType || '*',
      variants || []
    );

    // Optionally resolve the full profile
    let resolvedProfile = null;
    try {
      resolvedProfile = await resolveProfile(result.profileId);
    } catch (err) {
      console.error(`Failed to resolve profile ${result.profileId}:`, err.message);
    }

    res.json({
      success: true,
      ...result,
      resolvedProfile
    });
  } catch (error) {
    console.error('Error resolving dimensions:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
