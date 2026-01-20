/**
 * Threshold Context
 * React context for managing threshold profile state across the application
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  listProfiles,
  getIndex,
  getResolvedProfile,
  getSelectableProfiles
} from '../lib/thresholdService';

const ThresholdContext = createContext(null);

// Default thresholds to use if no profile is selected or API fails
const FALLBACK_THRESHOLDS = {
  battery: {
    critical: { min: 10.5, max: 32 },
    warning: { min: 11.5, max: 30 },
    hysteresis: { lowClear: 12.0, highClear: 29 }
  },
  coolantTemp: {
    critical: { max: 235 },
    warning: { max: 220 },
    gracePeriod: 60
  },
  oilPressure: {
    // Legacy static thresholds (used if useDynamicThreshold is false)
    critical: { min: 10 },
    warning: { min: 20 },

    // Engine state tracking - suppresses false warnings during startup/shutdown
    rpmDependent: true,                    // Enable engine state tracking
    rpmCrankingThreshold: 100,             // RPM to detect cranking
    rpmThreshold: 500,                     // RPM to consider engine "running"
    rpmStableThreshold: 800,               // RPM for stable operation

    // Timing thresholds for state transitions (seconds)
    startHoldoffSeconds: 3,                // Wait time after RPM > running before checking
    stableHoldoffSeconds: 2,               // Wait time after RPM > stable before stable state
    stopHoldoffSeconds: 2,                 // Time in stopping state before OFF
    shutdownRpmRate: -300,                 // RPM/sec rate to detect shutdown

    // Dynamic RPM-based thresholds
    useDynamicThreshold: true,             // Use RPM-based minimum pressure calculation
    pressureMap: [                         // RPM to minimum pressure map (psi)
      { rpm: 0, pressure: 0 },
      { rpm: 600, pressure: 8 },
      { rpm: 1000, pressure: 15 },
      { rpm: 1500, pressure: 25 },
      { rpm: 2000, pressure: 35 },
      { rpm: 3000, pressure: 45 }
    ],
    warningOffsetPsi: 5,                   // Warning threshold = minPressure + this offset
    criticalOffsetPsi: 0,                  // Critical threshold = minPressure + this offset

    // Persistence timers (seconds) - prevents momentary alerts
    usePersistence: true,                  // Enable persistence timers
    warnPersistSeconds: 1.5,               // Time below threshold before warning
    criticalPersistSeconds: 0.5,           // Time below threshold before critical
    clearPersistSeconds: 1.0,              // Time above threshold before clearing

    // Hysteresis (psi) - prevents alert chatter
    hysteresisPsi: 3,                      // Must recover above threshold + this to clear

    // Signal filtering
    filterWindowMs: 500                    // Low-pass filter window (milliseconds)
  },
  rpm: {
    warning: { max: 3200 },
    critical: { max: 3500 },
    overspeed: 3800
  },
  fuelTrim: {
    closedLoop: {
      warning: { min: -25, max: 25 },
      critical: { min: -35, max: 35 }
    },
    adaptive: {
      warning: { min: -20, max: 20 },
      critical: { min: -30, max: 30 }
    }
  },
  knock: {
    maxRetard: { warning: 10, critical: 15 },
    percentageThreshold: { warning: 5, critical: 10 }
  }
};

export function ThresholdProvider({ children }) {
  // Currently selected profile ID
  const [selectedProfileId, setSelectedProfileId] = useState('psi-hd-40l-53l-mfg');
  const [baselineSelection, setBaselineSelection] = useState({
    group: '',
    size: '',
    application: ''
  });

  // Resolved profile with all inherited values
  const [resolvedProfile, setResolvedProfile] = useState(null);

  // List of all available profiles
  const [profiles, setProfiles] = useState([]);

  // Selectable profiles for the dropdown
  const [selectableProfiles, setSelectableProfiles] = useState([]);

  // Index data (engine families, fuel types, etc.)
  const [index, setIndex] = useState(null);

  // Loading and error states
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Feature flag - enables the new threshold system
  const [thresholdSystemEnabled, setThresholdSystemEnabled] = useState(true);

  /**
   * Load initial data
   */
  const loadInitialData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const [profilesList, indexData, selectableData] = await Promise.all([
        listProfiles(),
        getIndex(),
        getSelectableProfiles()
      ]);

      setProfiles(profilesList);
      setIndex(indexData);
      setSelectableProfiles(selectableData.profiles);

      // Load the default profile
      if (selectedProfileId) {
        const resolved = await getResolvedProfile(selectedProfileId);
        setResolvedProfile(resolved);
      }
    } catch (err) {
      console.error('Failed to load threshold data:', err);
      setError(err.message);
      // Use fallback thresholds
      setResolvedProfile({
        profileId: 'fallback',
        name: 'Fallback Defaults',
        thresholds: FALLBACK_THRESHOLDS,
        anomalyRules: []
      });
    } finally {
      setLoading(false);
    }
  }, [selectedProfileId]);

  /**
   * Change the selected profile
   */
  const selectProfile = useCallback(async (profileId) => {
    if (!profileId || profileId === selectedProfileId) return;

    try {
      setLoading(true);
      const resolved = await getResolvedProfile(profileId);
      setSelectedProfileId(profileId);
      setResolvedProfile(resolved);
      setError(null);
    } catch (err) {
      console.error(`Failed to load profile ${profileId}:`, err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [selectedProfileId]);

  /**
   * Refresh profile data (after edits)
   */
  const refreshProfiles = useCallback(async () => {
    try {
      const [profilesList, selectableData] = await Promise.all([
        listProfiles(),
        getSelectableProfiles()
      ]);
      setProfiles(profilesList);
      setSelectableProfiles(selectableData.profiles);

      // Reload current profile
      if (selectedProfileId) {
        const resolved = await getResolvedProfile(selectedProfileId);
        setResolvedProfile(resolved);
      }
    } catch (err) {
      console.error('Failed to refresh profiles:', err);
    }
  }, [selectedProfileId]);

  /**
   * Get current thresholds (with fallback)
   */
  const getThresholds = useCallback(() => {
    if (!thresholdSystemEnabled) {
      return FALLBACK_THRESHOLDS;
    }
    return resolvedProfile?.thresholds || FALLBACK_THRESHOLDS;
  }, [thresholdSystemEnabled, resolvedProfile]);

  /**
   * Get current anomaly rules
   */
  const getAnomalyRules = useCallback(() => {
    if (!thresholdSystemEnabled) {
      return [];
    }
    return resolvedProfile?.anomalyRules || [];
  }, [thresholdSystemEnabled, resolvedProfile]);

  /**
   * Get a specific threshold value
   */
  const getThreshold = useCallback((path) => {
    const thresholds = getThresholds();
    const parts = path.split('.');
    let value = thresholds;

    for (const part of parts) {
      if (value && typeof value === 'object' && part in value) {
        value = value[part];
      } else {
        return undefined;
      }
    }

    return value;
  }, [getThresholds]);

  // Load initial data on mount
  useEffect(() => {
    loadInitialData();
  }, []);

  const value = {
    // State
    selectedProfileId,
    resolvedProfile,
    profiles,
    selectableProfiles,
    baselineSelection,
    index,
    loading,
    error,
    thresholdSystemEnabled,

    // Actions
    selectProfile,
    refreshProfiles,
    setBaselineSelection,
    setThresholdSystemEnabled,

    // Helpers
    getThresholds,
    getAnomalyRules,
    getThreshold,

    // Fallback for when system is disabled or loading fails
    FALLBACK_THRESHOLDS
  };

  return (
    <ThresholdContext.Provider value={value}>
      {children}
    </ThresholdContext.Provider>
  );
}

/**
 * Hook to use threshold context
 */
export function useThresholds() {
  const context = useContext(ThresholdContext);
  if (!context) {
    throw new Error('useThresholds must be used within a ThresholdProvider');
  }
  return context;
}

/**
 * Hook to get just the current thresholds (convenience)
 */
export function useCurrentThresholds() {
  const { getThresholds, loading, error } = useThresholds();
  return {
    thresholds: getThresholds(),
    loading,
    error
  };
}

export default ThresholdContext;
