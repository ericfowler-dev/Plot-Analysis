/**
 * ConfiguratorLayout - Config 3.0
 * Main layout component with sidebar navigation for threshold configuration
 */

import React, { useState, useCallback } from 'react';
import { PARAMETER_CATEGORIES } from '../../lib/parameterCatalog';

// Icons (inline SVG for simplicity)
const Icons = {
  Zap: () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
  ),
  Thermometer: () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  ),
  Gauge: () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  Fuel: () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
    </svg>
  ),
  Settings: () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ),
  AlertTriangle: () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
    </svg>
  ),
  Workflow: () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
    </svg>
  ),
  Activity: () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  ),
  ChartLine: () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
    </svg>
  ),
  List: () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
    </svg>
  ),
  Eye: () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
    </svg>
  ),
  Sliders: () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
    </svg>
  ),
  Save: () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
    </svg>
  ),
  ArrowLeft: () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
    </svg>
  ),
  Check: () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  ),
  X: () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  )
};

// Navigation sections
const NAVIGATION_SECTIONS = [
  {
    id: 'overview',
    name: 'Overview',
    icon: 'List',
    description: 'Profile summary and status'
  },
  {
    id: 'thresholds',
    name: 'Thresholds',
    icon: 'Sliders',
    description: 'Configure parameter thresholds',
    subsections: Object.entries(PARAMETER_CATEGORIES)
      .filter(([id]) => id !== 'signals')
      .map(([id, cat]) => ({
      id: `thresholds-${id}`,
      name: cat.name,
      icon: cat.icon,
      color: cat.color,
      parentId: 'thresholds'
    }))
  },
  {
    id: 'rules',
    name: 'Anomaly Rules',
    icon: 'AlertTriangle',
    description: 'Custom detection rules'
  },
  {
    id: 'signals',
    name: 'Signal Quality',
    icon: 'Activity',
    description: 'Dropout and signal monitoring'
  },
  {
    id: 'preview',
    name: 'Preview',
    icon: 'Eye',
    description: 'Test with uploaded data'
  },
  {
    id: 'advanced',
    name: 'Advanced',
    icon: 'Settings',
    description: 'Advanced configuration'
  }
];

/**
 * Get icon component by name
 */
function getIcon(iconName) {
  const IconComponent = Icons[iconName];
  return IconComponent ? <IconComponent /> : null;
}

/**
 * Sidebar navigation item
 */
function NavItem({ item, isActive, isExpanded, hasChildren, onSelect, onToggle, level = 0 }) {
  const paddingLeft = level === 0 ? 'pl-4' : 'pl-8';
  const isSubsection = level > 0;

  return (
    <div>
      <button
        onClick={() => {
          if (hasChildren && !isSubsection) {
            onToggle(item.id);
          }
          onSelect(item.id);
        }}
        className={`
          w-full flex items-center gap-3 px-4 py-3 text-left transition-colors
          ${paddingLeft}
          ${isActive
            ? 'bg-blue-50 text-blue-700 border-r-2 border-blue-600'
            : 'text-gray-700 hover:bg-gray-50'
          }
          ${isSubsection ? 'text-sm' : ''}
        `}
        style={item.color && isActive ? { borderRightColor: item.color } : {}}
      >
        <span
          className={`flex-shrink-0 ${isActive ? 'text-blue-600' : 'text-gray-400'}`}
          style={item.color ? { color: item.color } : {}}
        >
          {getIcon(item.icon)}
        </span>
        <span className="flex-1 truncate">{item.name}</span>
        {hasChildren && !isSubsection && (
          <span className={`transform transition-transform ${isExpanded ? 'rotate-90' : ''}`}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </span>
        )}
      </button>

      {/* Subsections */}
      {hasChildren && isExpanded && item.subsections && (
        <div className="bg-gray-50">
          {item.subsections.map(sub => (
            <NavItem
              key={sub.id}
              item={sub}
              isActive={isActive && sub.id === item.activeSubsection}
              hasChildren={false}
              onSelect={onSelect}
              onToggle={onToggle}
              level={1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Action button component
 */
function ActionButton({ icon, label, onClick, variant = 'default', disabled = false }) {
  const variants = {
    default: 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50',
    primary: 'bg-blue-600 text-white hover:bg-blue-700',
    success: 'bg-green-600 text-white hover:bg-green-700',
    danger: 'bg-red-600 text-white hover:bg-red-700'
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`
        flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm
        transition-colors disabled:opacity-50 disabled:cursor-not-allowed
        ${variants[variant]}
      `}
    >
      {icon && getIcon(icon)}
      {label}
    </button>
  );
}

/**
 * ConfiguratorLayout component
 */
export default function ConfiguratorLayout({
  profile,
  activeSection = 'overview',
  activeSubsection = null,
  onSectionChange,
  onSave,
  onValidate,
  onBack,
  hasChanges = false,
  isSaving = false,
  validationErrors = [],
  saveMessage = null,
  children
}) {
  const [expandedSections, setExpandedSections] = useState(['thresholds']);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const handleToggleSection = useCallback((sectionId) => {
    setExpandedSections(prev =>
      prev.includes(sectionId)
        ? prev.filter(id => id !== sectionId)
        : [...prev, sectionId]
    );
  }, []);

  const handleSelectSection = useCallback((sectionId) => {
    // If it's a subsection, extract parent and notify
    if (sectionId.includes('-')) {
      const [parent, ...rest] = sectionId.split('-');
      const subsection = rest.join('-');
      onSectionChange?.(parent, subsection);
    } else {
      onSectionChange?.(sectionId, null);
    }
  }, [onSectionChange]);

  return (
    <div className="configurator-layout flex h-full bg-gray-100">
      {/* Sidebar */}
      <aside
        className={`
          bg-white border-r border-gray-200 flex flex-col transition-all duration-300
          ${sidebarCollapsed ? 'w-16' : 'w-64'}
        `}
      >
        {/* Sidebar Header */}
        <div className="p-4 border-b border-gray-200">
          {!sidebarCollapsed && (
            <>
              <h2 className="text-lg font-semibold text-gray-900 truncate">
                {profile?.name || 'New Profile'}
              </h2>
              <p className="text-sm text-gray-500 truncate">
                {profile?.engineFamily || 'No engine family'}
              </p>
            </>
          )}
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="mt-2 p-1 text-gray-400 hover:text-gray-600"
            title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <svg className={`w-5 h-5 transform ${sidebarCollapsed ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
            </svg>
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-2">
          {NAVIGATION_SECTIONS.map(section => {
            const isActive = activeSection === section.id ||
              (activeSubsection && section.subsections?.some(s => s.id === `${section.id}-${activeSubsection}`));
            const hasChildren = section.subsections && section.subsections.length > 0;
            const isExpanded = expandedSections.includes(section.id);

            return (
              <NavItem
                key={section.id}
                item={{
                  ...section,
                  activeSubsection: activeSubsection ? `${section.id}-${activeSubsection}` : null
                }}
                isActive={isActive}
                isExpanded={isExpanded}
                hasChildren={hasChildren}
                onSelect={handleSelectSection}
                onToggle={handleToggleSection}
              />
            );
          })}
        </nav>

        {/* Sidebar Footer - Quick Status */}
        {!sidebarCollapsed && (
          <div className="p-4 border-t border-gray-200">
            {hasChanges && (
              <div className="flex items-center gap-2 text-amber-600 text-sm mb-2">
                <span className="w-2 h-2 bg-amber-500 rounded-full"></span>
                Unsaved changes
              </div>
            )}
            {validationErrors.length > 0 && (
              <div className="flex items-center gap-2 text-red-600 text-sm">
                <span className="w-2 h-2 bg-red-500 rounded-full"></span>
                {validationErrors.length} validation error{validationErrors.length > 1 ? 's' : ''}
              </div>
            )}
          </div>
        )}
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="bg-white border-b border-gray-200 px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={onBack}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
                title="Back to profile list"
              >
                {getIcon('ArrowLeft')}
              </button>
              <div>
                <h1 className="text-xl font-semibold text-gray-900">
                  {getSectionTitle(activeSection, activeSubsection)}
                </h1>
                <p className="text-sm text-gray-500">
                  {getSectionDescription(activeSection, activeSubsection)}
                </p>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-3">
              <ActionButton
                icon="Check"
                label="Validate"
                onClick={onValidate}
                variant="default"
              />
              <ActionButton
                icon="Save"
                label={isSaving ? 'Saving...' : 'Save Profile'}
                onClick={onSave}
                variant="primary"
                disabled={isSaving || !hasChanges}
              />
            </div>
          </div>
        </header>

        {/* Save Message Banner */}
        {saveMessage && (
          <div className={`px-6 py-3 ${
            saveMessage.type === 'success' ? 'bg-green-50 border-b border-green-200' :
            saveMessage.type === 'error' ? 'bg-red-50 border-b border-red-200' :
            'bg-blue-50 border-b border-blue-200'
          }`}>
            <div className={`flex items-center gap-2 text-sm font-medium ${
              saveMessage.type === 'success' ? 'text-green-700' :
              saveMessage.type === 'error' ? 'text-red-700' :
              'text-blue-700'
            }`}>
              {saveMessage.type === 'success' ? (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              ) : saveMessage.type === 'error' ? (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              ) : null}
              {saveMessage.text}
            </div>
          </div>
        )}

        {/* Validation Errors Banner */}
        {validationErrors.length > 0 && (
          <div className="px-6 py-3 bg-red-50 border-b border-red-200">
            <div className="text-sm font-medium text-red-700 mb-2">
              {validationErrors.length} validation error{validationErrors.length > 1 ? 's' : ''}:
            </div>
            <ul className="text-sm text-red-600 list-disc list-inside space-y-1">
              {validationErrors.slice(0, 5).map((err, i) => (
                <li key={i}>{err}</li>
              ))}
              {validationErrors.length > 5 && (
                <li>...and {validationErrors.length - 5} more</li>
              )}
            </ul>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {children}
        </div>
      </main>
    </div>
  );
}

/**
 * Get section title
 */
function getSectionTitle(sectionId, subsectionId) {
  const section = NAVIGATION_SECTIONS.find(s => s.id === sectionId);
  if (!section) return 'Configuration';

  if (subsectionId && section.subsections) {
    const subsection = section.subsections.find(s => s.id === `${sectionId}-${subsectionId}`);
    if (subsection) return `${section.name}: ${subsection.name}`;
  }

  return section.name;
}

/**
 * Get section description
 */
function getSectionDescription(sectionId, subsectionId) {
  const section = NAVIGATION_SECTIONS.find(s => s.id === sectionId);
  if (!section) return '';

  if (subsectionId && section.subsections) {
    const subsection = section.subsections.find(s => s.id === `${sectionId}-${subsectionId}`);
    if (subsection) {
      const category = PARAMETER_CATEGORIES[subsectionId];
      return category?.description || '';
    }
  }

  return section.description || '';
}

export { NAVIGATION_SECTIONS, Icons };
