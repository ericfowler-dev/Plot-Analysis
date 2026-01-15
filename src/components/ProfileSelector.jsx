/**
 * Profile Selector Component
 * Dropdown for selecting engine/fuel type profile on the upload page
 */

import React, { useState, useEffect } from 'react';
import { ChevronDown, Settings, AlertCircle, Check } from 'lucide-react';
import { useThresholds } from '../contexts/ThresholdContext';

export default function ProfileSelector({ onProfileChange, compact = false }) {
  const {
    selectedProfileId,
    selectProfile,
    selectableProfiles,
    resolvedProfile,
    loading,
    error
  } = useThresholds();

  const [isOpen, setIsOpen] = useState(false);

  // Get current profile info for display
  const currentProfile = selectableProfiles.find(
    p => p.profileId === selectedProfileId
  );

  const handleSelect = async (profileId) => {
    setIsOpen(false);
    await selectProfile(profileId);
    if (onProfileChange) {
      onProfileChange(profileId);
    }
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (!e.target.closest('.profile-selector')) {
        setIsOpen(false);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  if (compact) {
    return (
      <div className="profile-selector relative">
        <button
          onClick={() => setIsOpen(!isOpen)}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm text-slate-200 transition-colors"
        >
          <Settings className="w-4 h-4" />
          <span className="truncate max-w-[150px]">
            {loading ? 'Loading...' : currentProfile?.name || 'Select Profile'}
          </span>
          <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </button>

        {isOpen && (
          <ProfileDropdown
            profiles={selectableProfiles}
            selectedId={selectedProfileId}
            onSelect={handleSelect}
          />
        )}
      </div>
    );
  }

  return (
    <div className="profile-selector">
      <label className="block text-sm font-medium text-slate-300 mb-2">
        Engine Profile
      </label>

      <div className="relative">
        <button
          onClick={() => setIsOpen(!isOpen)}
          disabled={loading}
          className="w-full flex items-center justify-between px-4 py-3 bg-slate-700 hover:bg-slate-600 border border-slate-600 rounded-lg text-left transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 bg-slate-600 rounded-lg">
              <Settings className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <div className="text-slate-200 font-medium">
                {loading ? 'Loading...' : currentProfile?.name || 'Select Profile'}
              </div>
              {currentProfile?.description && !loading && (
                <div className="text-sm text-slate-400 truncate max-w-[300px]">
                  {currentProfile.description}
                </div>
              )}
            </div>
          </div>
          <ChevronDown className={`w-5 h-5 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </button>

        {isOpen && (
          <ProfileDropdown
            profiles={selectableProfiles}
            selectedId={selectedProfileId}
            onSelect={handleSelect}
          />
        )}
      </div>

      {error && (
        <div className="mt-2 flex items-center gap-2 text-amber-400 text-sm">
          <AlertCircle className="w-4 h-4" />
          <span>Using default thresholds (API unavailable)</span>
        </div>
      )}

      {resolvedProfile && !error && (
        <div className="mt-2 text-xs text-slate-500">
          Inheritance: {resolvedProfile.inheritanceChain?.join(' → ')}
        </div>
      )}
    </div>
  );
}

function ProfileDropdown({ profiles, selectedId, onSelect }) {
  return (
    <div className="absolute z-50 mt-2 w-full bg-slate-800 border border-slate-600 rounded-lg shadow-xl max-h-[400px] overflow-y-auto">
      {profiles.map((profile, idx) => {
        if (profile.isGroupHeader) {
          return (
            <div
              key={`header-${idx}`}
              className="px-4 py-2 text-xs font-semibold text-slate-400 uppercase tracking-wider bg-slate-900 border-t border-slate-700 first:border-t-0"
            >
              {profile.name}
            </div>
          );
        }

        const isSelected = profile.profileId === selectedId;

        return (
          <button
            key={profile.profileId}
            onClick={() => onSelect(profile.profileId)}
            className={`w-full px-4 py-3 flex items-center justify-between text-left hover:bg-slate-700 transition-colors ${
              isSelected ? 'bg-slate-700' : ''
            } ${profile.isDefault ? 'border-b border-slate-700' : ''}`}
          >
            <div>
              <div className={`font-medium ${isSelected ? 'text-blue-400' : 'text-slate-200'}`}>
                {profile.name}
              </div>
              {profile.description && (
                <div className="text-sm text-slate-400 mt-0.5">
                  {profile.description}
                </div>
              )}
              {profile.fuelTypeName && (
                <div className="text-xs text-slate-500 mt-1">
                  Fuel: {profile.fuelTypeName}
                </div>
              )}
              {profile.applicationName && (
                <div className="text-xs text-slate-500 mt-1">
                  Application: {profile.applicationName}
                </div>
              )}
            </div>
            {isSelected && (
              <Check className="w-5 h-5 text-blue-400 flex-shrink-0" />
            )}
          </button>
        );
      })}

      {profiles.length === 0 && (
        <div className="px-4 py-8 text-center text-slate-400">
          No profiles available
        </div>
      )}
    </div>
  );
}

/**
 * Simplified selector for inline use
 */
export function ProfileSelectorInline({ onProfileChange }) {
  const {
    selectedProfileId,
    selectProfile,
    selectableProfiles,
    loading
  } = useThresholds();

  const handleChange = async (e) => {
    const profileId = e.target.value;
    await selectProfile(profileId);
    if (onProfileChange) {
      onProfileChange(profileId);
    }
  };

  // Filter out group headers for simple select
  const options = selectableProfiles.filter(p => !p.isGroupHeader);

  return (
    <select
      value={selectedProfileId || ''}
      onChange={handleChange}
      disabled={loading}
      className="px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
    >
      {options.map(profile => (
        <option key={profile.profileId} value={profile.profileId}>
          {profile.name}
        </option>
      ))}
    </select>
  );
}
