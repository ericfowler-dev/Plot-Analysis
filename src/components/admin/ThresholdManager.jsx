/**
 * Threshold Manager Component
 * Admin interface for managing threshold profiles
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Settings,
  Plus,
  Upload,
  Download,
  Trash2,
  Copy,
  Edit3,
  ChevronRight,
  ChevronDown,
  AlertCircle,
  Check,
  X,
  RefreshCw,
  ArrowLeft,
  Layers
} from 'lucide-react';
import {
  listProfiles,
  getIndex,
  getProfile,
  saveProfile,
  deleteProfile,
  duplicateProfile,
  exportProfiles,
  importProfiles
} from '../../lib/thresholdService';
import ThresholdEditor from './ThresholdEditor';

export default function ThresholdManager({ onClose }) {
  // Data state
  const [profiles, setProfiles] = useState([]);
  const [index, setIndex] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // UI state
  const [expandedFamilies, setExpandedFamilies] = useState({});
  const [selectedProfile, setSelectedProfile] = useState(null);
  const [editingProfile, setEditingProfile] = useState(null);
  const [showNewProfileModal, setShowNewProfileModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);

  // Action state
  const [actionLoading, setActionLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState(null);

  /**
   * Load profiles and index data
   */
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [profilesList, indexData] = await Promise.all([
        listProfiles(),
        getIndex()
      ]);
      setProfiles(profilesList);
      setIndex(indexData);

      // Auto-expand all families
      const expanded = {};
      indexData.engineFamilies.forEach(f => {
        expanded[f.name] = true;
      });
      setExpandedFamilies(expanded);
    } catch (err) {
      console.error('Failed to load data:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  /**
   * Group profiles by engine family
   */
  const getProfilesByFamily = useCallback(() => {
    const grouped = {
      'Global': profiles.filter(p => !p.engineFamily)
    };

    if (index) {
      index.engineFamilies.forEach(family => {
        grouped[family.name] = profiles.filter(p => p.engineFamily === family.name);
      });
    }

    return grouped;
  }, [profiles, index]);

  const getApplicationName = useCallback((applicationId) => {
    if (!applicationId) return 'General';
    const application = index?.applications?.find(app => app.id === applicationId);
    return application?.name || applicationId;
  }, [index]);

  const groupProfilesByApplication = useCallback((familyProfiles) => {
    const grouped = new Map();
    for (const profile of familyProfiles) {
      const key = profile.application || 'general';
      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
      grouped.get(key).push(profile);
    }

    const orderedKeys = [
      'general',
      ...(index?.applications || []).map(app => app.id)
    ];
    const result = [];

    for (const key of orderedKeys) {
      if (!grouped.has(key)) continue;
      result.push({ key, name: getApplicationName(key), profiles: grouped.get(key) });
    }

    for (const [key, value] of grouped.entries()) {
      if (!orderedKeys.includes(key)) {
        result.push({ key, name: getApplicationName(key), profiles: value });
      }
    }

    return result;
  }, [getApplicationName, index]);

  /**
   * Handle profile edit
   */
  const handleEditProfile = async (profileId) => {
    try {
      setActionLoading(true);
      const profile = await getProfile(profileId);
      setEditingProfile(profile);
    } catch (err) {
      showMessage(`Failed to load profile: ${err.message}`, 'error');
    } finally {
      setActionLoading(false);
    }
  };

  /**
   * Handle profile save
   */
  const handleSaveProfile = async (profile) => {
    try {
      setActionLoading(true);
      await saveProfile(profile);
      showMessage('Profile saved successfully', 'success');
      setEditingProfile(null);
      await loadData();
    } catch (err) {
      showMessage(`Failed to save: ${err.message}`, 'error');
    } finally {
      setActionLoading(false);
    }
  };

  /**
   * Handle profile deletion
   */
  const handleDeleteProfile = async (profileId) => {
    if (!confirm(`Are you sure you want to delete "${profileId}"? This cannot be undone.`)) {
      return;
    }

    try {
      setActionLoading(true);
      await deleteProfile(profileId);
      showMessage('Profile deleted', 'success');
      setSelectedProfile(null);
      await loadData();
    } catch (err) {
      showMessage(`Failed to delete: ${err.message}`, 'error');
    } finally {
      setActionLoading(false);
    }
  };

  /**
   * Handle profile duplication
   */
  const handleDuplicateProfile = async (profileId) => {
    const newId = prompt('Enter new profile ID (lowercase, hyphens allowed):');
    if (!newId) return;

    const newName = prompt('Enter display name for the new profile:');
    if (!newName) return;

    try {
      setActionLoading(true);
      await duplicateProfile(profileId, newId, newName);
      showMessage('Profile duplicated', 'success');
      await loadData();
    } catch (err) {
      showMessage(`Failed to duplicate: ${err.message}`, 'error');
    } finally {
      setActionLoading(false);
    }
  };

  /**
   * Handle export
   */
  const handleExport = async () => {
    try {
      setActionLoading(true);
      const data = await exportProfiles();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `threshold-profiles-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showMessage('Profiles exported', 'success');
    } catch (err) {
      showMessage(`Export failed: ${err.message}`, 'error');
    } finally {
      setActionLoading(false);
    }
  };

  /**
   * Handle import
   */
  const handleImport = async (file, overwrite) => {
    try {
      setActionLoading(true);
      const results = await importProfiles(file, overwrite);
      showMessage(
        `Imported: ${results.imported.length}, Skipped: ${results.skipped.length}, Errors: ${results.errors.length}`,
        results.errors.length > 0 ? 'warning' : 'success'
      );
      setShowImportModal(false);
      await loadData();
    } catch (err) {
      showMessage(`Import failed: ${err.message}`, 'error');
    } finally {
      setActionLoading(false);
    }
  };

  /**
   * Show temporary message
   */
  const showMessage = (text, type = 'info') => {
    setActionMessage({ text, type });
    setTimeout(() => setActionMessage(null), 5000);
  };

  /**
   * Toggle family expansion
   */
  const toggleFamily = (familyName) => {
    setExpandedFamilies(prev => ({
      ...prev,
      [familyName]: !prev[familyName]
    }));
  };

  // If editing a profile, show the editor
  if (editingProfile) {
    return (
      <ThresholdEditor
        profile={editingProfile}
        index={index}
        onSave={handleSaveProfile}
        onCancel={() => setEditingProfile(null)}
        loading={actionLoading}
      />
    );
  }

  const groupedProfiles = getProfilesByFamily();

  return (
    <div className="fixed inset-0 bg-slate-900 z-50 overflow-auto">
      {/* Header */}
      <div className="sticky top-0 bg-slate-800 border-b border-slate-700 z-10">
        <div className="max-w-6xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              {onClose && (
                <button
                  onClick={onClose}
                  className="p-2 hover:bg-slate-700 rounded-lg transition-colors"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
              )}
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-500/20 rounded-lg">
                  <Settings className="w-6 h-6 text-blue-400" />
                </div>
                <div>
                  <h1 className="text-xl font-semibold text-slate-100">
                    Threshold Management
                  </h1>
                  <p className="text-sm text-slate-400">
                    Configure anomaly detection thresholds by engine type
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {onClose && (
                <button
                  onClick={onClose}
                  className="flex items-center gap-2 px-3 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm transition-colors"
                >
                  <Upload className="w-4 h-4" />
                  Upload New Files
                </button>
              )}
              <button
                onClick={loadData}
                disabled={loading}
                className="flex items-center gap-2 px-3 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm transition-colors"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
              <button
                onClick={() => setShowImportModal(true)}
                className="flex items-center gap-2 px-3 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm transition-colors"
              >
                <Upload className="w-4 h-4" />
                Import
              </button>
              <button
                onClick={handleExport}
                disabled={actionLoading}
                className="flex items-center gap-2 px-3 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm transition-colors"
              >
                <Download className="w-4 h-4" />
                Export
              </button>
              <button
                onClick={() => setShowNewProfileModal(true)}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm font-medium transition-colors"
              >
                <Plus className="w-4 h-4" />
                New Profile
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Action Message */}
      {actionMessage && (
        <div className={`max-w-6xl mx-auto px-6 py-3`}>
          <div className={`flex items-center gap-2 px-4 py-3 rounded-lg ${
            actionMessage.type === 'success' ? 'bg-green-500/20 text-green-400' :
            actionMessage.type === 'error' ? 'bg-red-500/20 text-red-400' :
            actionMessage.type === 'warning' ? 'bg-amber-500/20 text-amber-400' :
            'bg-blue-500/20 text-blue-400'
          }`}>
            {actionMessage.type === 'success' ? <Check className="w-4 h-4" /> :
             actionMessage.type === 'error' ? <AlertCircle className="w-4 h-4" /> :
             <AlertCircle className="w-4 h-4" />}
            <span>{actionMessage.text}</span>
          </div>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="max-w-6xl mx-auto px-6 py-8">
          <div className="flex items-center gap-3 px-4 py-3 bg-red-500/20 text-red-400 rounded-lg">
            <AlertCircle className="w-5 h-5" />
            <span>Failed to load profiles: {error}</span>
            <button
              onClick={loadData}
              className="ml-auto px-3 py-1 bg-red-500/20 hover:bg-red-500/30 rounded text-sm"
            >
              Retry
            </button>
          </div>
        </div>
      )}

      {/* Loading State */}
      {loading && !error && (
        <div className="max-w-6xl mx-auto px-6 py-16 text-center">
          <RefreshCw className="w-8 h-8 text-slate-400 animate-spin mx-auto mb-4" />
          <p className="text-slate-400">Loading profiles...</p>
        </div>
      )}

      {/* Profile List */}
      {!loading && !error && (
        <div className="max-w-6xl mx-auto px-6 py-6">
          <div className="space-y-4">
            {Object.entries(groupedProfiles).map(([familyName, familyProfiles]) => (
              <div key={familyName} className="bg-slate-800 rounded-lg border border-slate-700">
                {/* Family Header */}
                <button
                  onClick={() => toggleFamily(familyName)}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-750 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    {expandedFamilies[familyName] ? (
                      <ChevronDown className="w-5 h-5 text-slate-400" />
                    ) : (
                      <ChevronRight className="w-5 h-5 text-slate-400" />
                    )}
                    <Layers className="w-5 h-5 text-blue-400" />
                    <span className="font-medium text-slate-200">{familyName}</span>
                    <span className="text-sm text-slate-500">
                      ({familyProfiles.length} profile{familyProfiles.length !== 1 ? 's' : ''})
                    </span>
                  </div>
                </button>

                {/* Profiles */}
                {expandedFamilies[familyName] && familyProfiles.length > 0 && (
                  <div className="border-t border-slate-700">
                    {groupProfilesByApplication(familyProfiles).map(group => (
                      <div key={`${familyName}-${group.key}`} className="border-b border-slate-700 last:border-b-0">
                        <div className="px-4 py-2 text-xs font-semibold text-slate-400 uppercase tracking-wider bg-slate-900/40">
                          {group.name}
                        </div>
                        {group.profiles.map(profile => (
                          <ProfileRow
                            key={profile.profileId}
                            profile={profile}
                            index={index}
                            isSelected={selectedProfile === profile.profileId}
                            onSelect={() => setSelectedProfile(
                              selectedProfile === profile.profileId ? null : profile.profileId
                            )}
                            onEdit={() => handleEditProfile(profile.profileId)}
                            onDuplicate={() => handleDuplicateProfile(profile.profileId)}
                            onDelete={() => handleDeleteProfile(profile.profileId)}
                          />
                        ))}
                      </div>
                    ))}
                  </div>
                )}

                {expandedFamilies[familyName] && familyProfiles.length === 0 && (
                  <div className="px-4 py-6 text-center text-slate-500 border-t border-slate-700">
                    No profiles in this family
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Import Modal */}
      {showImportModal && (
        <ImportModal
          onImport={handleImport}
          onClose={() => setShowImportModal(false)}
          loading={actionLoading}
        />
      )}

      {/* New Profile Modal */}
      {showNewProfileModal && (
        <NewProfileModal
          index={index}
          profiles={profiles}
          onSave={handleSaveProfile}
          onClose={() => setShowNewProfileModal(false)}
          loading={actionLoading}
        />
      )}
    </div>
  );
}

/**
 * Profile Row Component
 */
function ProfileRow({ profile, index, isSelected, onSelect, onEdit, onDuplicate, onDelete }) {
  const fuelType = index?.fuelTypes.find(f => f.id === profile.fuelType);
  const application = index?.applications?.find(app => app.id === profile.application);
  const isGlobal = profile.profileId === 'global-defaults';

  return (
    <div
      className={`px-4 py-3 border-b border-slate-700 last:border-b-0 ${
        isSelected ? 'bg-slate-700/50' : 'hover:bg-slate-750'
      }`}
    >
      <div className="flex items-center justify-between">
        <button
          onClick={onSelect}
          className="flex-1 flex items-center gap-4 text-left"
        >
          <div className="w-8 h-8 rounded-lg bg-slate-700 flex items-center justify-center">
            <Settings className="w-4 h-4 text-slate-400" />
          </div>
          <div>
            <div className="font-medium text-slate-200">
              {profile.name}
              {profile.status === 'draft' && (
                <span className="ml-2 text-xs px-2 py-0.5 bg-amber-500/20 text-amber-400 rounded">
                  Draft
                </span>
              )}
            </div>
            <div className="text-sm text-slate-400">
              {profile.description || 'No description'}
            </div>
            <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
              {profile.fuelType && (
                <span>Fuel: {fuelType?.name || profile.fuelType}</span>
              )}
              {profile.application && (
                <span>App: {application?.name || profile.application}</span>
              )}
              {profile.parent && (
                <span>Inherits: {profile.parent}</span>
              )}
              <span>v{profile.version || '1.0'}</span>
            </div>
          </div>
        </button>

        <div className="flex items-center gap-1">
          <button
            onClick={onEdit}
            className="p-2 hover:bg-slate-600 rounded-lg transition-colors"
            title="Edit profile"
          >
            <Edit3 className="w-4 h-4 text-slate-400" />
          </button>
          <button
            onClick={onDuplicate}
            className="p-2 hover:bg-slate-600 rounded-lg transition-colors"
            title="Duplicate profile"
          >
            <Copy className="w-4 h-4 text-slate-400" />
          </button>
          {!isGlobal && (
            <button
              onClick={onDelete}
              className="p-2 hover:bg-red-500/20 rounded-lg transition-colors"
              title="Delete profile"
            >
              <Trash2 className="w-4 h-4 text-slate-400 hover:text-red-400" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Import Modal Component
 */
function ImportModal({ onImport, onClose, loading }) {
  const [file, setFile] = useState(null);
  const [overwrite, setOverwrite] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (file) {
      onImport(file, overwrite);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-slate-800 rounded-lg shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
          <h2 className="text-lg font-semibold text-slate-100">Import Profiles</h2>
          <button onClick={onClose} className="p-1 hover:bg-slate-700 rounded">
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Select JSON File
            </label>
            <input
              type="file"
              accept=".json"
              onChange={(e) => setFile(e.target.files[0])}
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-200"
            />
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={overwrite}
              onChange={(e) => setOverwrite(e.target.checked)}
              className="w-4 h-4 rounded border-slate-600 bg-slate-700"
            />
            <span className="text-sm text-slate-300">Overwrite existing profiles</span>
          </label>

          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-slate-300 hover:bg-slate-700 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!file || loading}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors disabled:opacity-50"
            >
              {loading ? 'Importing...' : 'Import'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/**
 * New Profile Modal Component
 */
function NewProfileModal({ index, profiles, onSave, onClose, loading }) {
  const [profileId, setProfileId] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [parent, setParent] = useState('global-defaults');
  const [engineFamily, setEngineFamily] = useState('');
  const [fuelType, setFuelType] = useState('');
  const [application, setApplication] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();

    const newProfile = {
      profileId,
      name,
      description,
      parent: parent || null,
      engineFamily: engineFamily || null,
      fuelType: fuelType || null,
      application: application || null,
      version: '1.0.0',
      status: 'draft',
      createdAt: new Date().toISOString(),
      thresholds: {},
      anomalyRules: []
    };

    onSave(newProfile);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-slate-800 rounded-lg shadow-xl w-full max-w-lg">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
          <h2 className="text-lg font-semibold text-slate-100">Create New Profile</h2>
          <button onClick={onClose} className="p-1 hover:bg-slate-700 rounded">
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">
                Profile ID *
              </label>
              <input
                type="text"
                value={profileId}
                onChange={(e) => setProfileId(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))}
                placeholder="my-engine-profile"
                required
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-200"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">
                Display Name *
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My Engine Profile"
                required
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-200"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Profile description..."
              rows={2}
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-200"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">
              Inherit From
            </label>
            <select
              value={parent}
              onChange={(e) => setParent(e.target.value)}
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-200"
            >
              <option value="">None (start from scratch)</option>
              {profiles.map(p => (
                <option key={p.profileId} value={p.profileId}>{p.name}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">
                Engine Family
              </label>
              <select
                value={engineFamily}
                onChange={(e) => setEngineFamily(e.target.value)}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-200"
              >
                <option value="">None</option>
                {index?.engineFamilies.map(f => (
                  <option key={f.id} value={f.name}>{f.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">
                Fuel Type
              </label>
              <select
                value={fuelType}
                onChange={(e) => setFuelType(e.target.value)}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-200"
              >
                <option value="">None</option>
                {index?.fuelTypes.map(f => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">
              Application
            </label>
            <select
              value={application}
              onChange={(e) => setApplication(e.target.value)}
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-200"
            >
              <option value="">None</option>
              {index?.applications?.map(app => (
                <option key={app.id} value={app.id}>{app.name}</option>
              ))}
            </select>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-700">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-slate-300 hover:bg-slate-700 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!profileId || !name || loading}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors disabled:opacity-50"
            >
              {loading ? 'Creating...' : 'Create Profile'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
