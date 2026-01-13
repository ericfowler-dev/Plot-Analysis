/**
 * App Wrapper Component
 * Wraps the main application with threshold context and admin functionality
 * Feature-flagged for safe integration
 */

import React, { useState, useEffect } from 'react';
import { Settings, X } from 'lucide-react';
import { ThresholdProvider, useThresholds } from '../contexts/ThresholdContext';
import ThresholdManager from './admin/ThresholdManager';
import ProfileSelector from './ProfileSelector';
import App from '../App';

/**
 * Feature flag for the new threshold system
 * Set to false to completely disable the new system
 */
const ENABLE_THRESHOLD_SYSTEM = true;

/**
 * Main wrapper that provides threshold context
 */
export default function AppWrapper() {
  if (!ENABLE_THRESHOLD_SYSTEM) {
    // Feature disabled - render original app without threshold system
    return <App />;
  }

  return (
    <ThresholdProvider>
      <AppWithThresholds />
    </ThresholdProvider>
  );
}

/**
 * App with threshold integration
 */
function AppWithThresholds() {
  const [showAdmin, setShowAdmin] = useState(false);
  const { selectedProfileId, resolvedProfile } = useThresholds();

  // Check for /admin route (simple client-side routing)
  useEffect(() => {
    const checkRoute = () => {
      if (window.location.hash === '#/admin' || window.location.pathname === '/admin') {
        setShowAdmin(true);
      }
    };
    checkRoute();
    window.addEventListener('hashchange', checkRoute);
    return () => window.removeEventListener('hashchange', checkRoute);
  }, []);

  // Handle admin panel close
  const handleCloseAdmin = () => {
    setShowAdmin(false);
    // Clear the admin route
    if (window.location.hash === '#/admin') {
      window.location.hash = '';
    }
  };

  // Show admin panel
  if (showAdmin) {
    return <ThresholdManager onClose={handleCloseAdmin} />;
  }

  // Render main app with floating admin button
  return (
    <div className="relative">
      {/* Main Application */}
      <App />

      {/* Floating Admin Button */}
      <AdminFloatingButton onClick={() => setShowAdmin(true)} />

      {/* Profile indicator (shown when not using defaults) */}
      {selectedProfileId && selectedProfileId !== 'global-defaults' && (
        <ProfileIndicator profile={resolvedProfile} onClick={() => setShowAdmin(true)} />
      )}
    </div>
  );
}

/**
 * Floating button to access admin panel
 */
function AdminFloatingButton({ onClick }) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="fixed bottom-6 right-6 z-40 flex items-center gap-2 px-4 py-3 bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded-full shadow-lg transition-all"
      title="Threshold Settings"
    >
      <Settings className="w-5 h-5 text-slate-400" />
      {isHovered && (
        <span className="text-sm text-slate-300">Threshold Settings</span>
      )}
    </button>
  );
}

/**
 * Profile indicator showing current threshold profile
 */
function ProfileIndicator({ profile, onClick }) {
  if (!profile) return null;

  return (
    <button
      onClick={onClick}
      className="fixed bottom-6 left-6 z-40 flex items-center gap-2 px-4 py-2 bg-blue-500/20 border border-blue-500/50 rounded-lg text-sm text-blue-300 hover:bg-blue-500/30 transition-colors"
    >
      <Settings className="w-4 h-4" />
      <span>Profile: {profile.name}</span>
    </button>
  );
}

/**
 * Hook to use threshold data in analysis components
 * Returns null-safe thresholds that fall back to defaults
 */
export function useAnalysisThresholds() {
  const context = useThresholds();

  if (!ENABLE_THRESHOLD_SYSTEM) {
    return {
      thresholds: null,
      anomalyRules: [],
      profileName: 'Default',
      isEnabled: false
    };
  }

  return {
    thresholds: context.getThresholds(),
    anomalyRules: context.getAnomalyRules(),
    profileName: context.resolvedProfile?.name || 'Default',
    isEnabled: context.thresholdSystemEnabled,
    loading: context.loading
  };
}
