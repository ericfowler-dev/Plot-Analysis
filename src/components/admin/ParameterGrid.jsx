/**
 * ParameterGrid - Config 3.0
 * Grid display of parameter cards with search and category filtering
 */

import React, { useState, useMemo, useCallback } from 'react';
import ThresholdCard from './ThresholdCard';
import {
  PARAMETER_CATALOG,
  PARAMETER_CATEGORIES,
  getDefaultThresholds
} from '../../lib/parameterCatalog';

/**
 * Search bar component
 */
function SearchBar({ value, onChange, placeholder = 'Search parameters...' }) {
  return (
    <div className="relative">
      <svg
        className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
      />
      {value && (
        <button
          onClick={() => onChange('')}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  );
}

/**
 * Category filter tabs
 */
function CategoryTabs({ categories, activeCategory, onSelect }) {
  return (
    <div className="flex flex-wrap gap-2">
      <button
        onClick={() => onSelect(null)}
        className={`
          px-4 py-2 rounded-lg text-sm font-medium transition-colors
          ${activeCategory === null
            ? 'bg-blue-600 text-white'
            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }
        `}
      >
        All
      </button>
      {Object.values(categories).map(category => (
        <button
          key={category.id}
          onClick={() => onSelect(category.id)}
          className={`
            px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2
            ${activeCategory === category.id
              ? 'text-white'
              : 'text-gray-700 hover:bg-gray-200'
            }
          `}
          style={activeCategory === category.id ? { backgroundColor: category.color } : { backgroundColor: '#f3f4f6' }}
        >
          <span
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: category.color }}
          />
          {category.name}
        </button>
      ))}
    </div>
  );
}

/**
 * Quick actions toolbar
 */
function QuickActions({ onEnableAll, onDisableAll, onResetAll, enabledCount, totalCount }) {
  return (
    <div className="flex items-center gap-4 text-sm">
      <span className="text-gray-500">
        {enabledCount} of {totalCount} enabled
      </span>
      <div className="flex gap-2">
        <button
          onClick={onEnableAll}
          className="px-3 py-1 text-blue-600 hover:bg-blue-50 rounded"
        >
          Enable All
        </button>
        <button
          onClick={onDisableAll}
          className="px-3 py-1 text-gray-600 hover:bg-gray-100 rounded"
        >
          Disable All
        </button>
        <button
          onClick={onResetAll}
          className="px-3 py-1 text-amber-600 hover:bg-amber-50 rounded"
        >
          Reset All to Defaults
        </button>
      </div>
    </div>
  );
}

/**
 * Empty state when no parameters match
 */
function EmptyState({ searchQuery, activeCategory }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-gray-500">
      <svg className="w-12 h-12 mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <p className="text-lg font-medium">No parameters found</p>
      <p className="text-sm">
        {searchQuery
          ? `No parameters match "${searchQuery}"`
          : activeCategory
            ? `No parameters in this category`
            : 'No parameters available'
        }
      </p>
    </div>
  );
}

/**
 * Main ParameterGrid component
 * v3.1.3: Added engineSize prop to filter MFG parameters for non-MFG engines
 */
export default function ParameterGrid({
  thresholds,
  onChange,
  engineFamily = null,
  engineSize = null, // v3.1.3: Filter by engine size for fuel-system-specific params
  filterCategory = null,
  showSearch = true,
  showCategoryTabs = true,
  showQuickActions = true,
  columns = 2,
  excludedCategoryIds = [],
  excludedParameterIds = []
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [categorySelection, setCategorySelection] = useState(null);

  const excludedCategorySet = useMemo(() => new Set(excludedCategoryIds), [excludedCategoryIds]);
  const excludedParameterSet = useMemo(() => new Set(excludedParameterIds), [excludedParameterIds]);

  const enforcedCategory = useMemo(() => {
    if (!filterCategory) return null;
    return excludedCategorySet.has(filterCategory) ? null : filterCategory;
  }, [filterCategory, excludedCategorySet]);

  const activeCategory = useMemo(() => {
    const candidate = enforcedCategory ?? categorySelection;
    if (candidate && excludedCategorySet.has(candidate)) {
      return null;
    }
    return candidate;
  }, [enforcedCategory, categorySelection, excludedCategorySet]);

  const handleSelectCategory = useCallback((categoryId) => {
    if (enforcedCategory) return;
    if (categoryId && excludedCategorySet.has(categoryId)) return;
    setCategorySelection(categoryId);
  }, [enforcedCategory, excludedCategorySet]);

  // Filter parameters based on search and category
  const filteredParameters = useMemo(() => {
    let params = Object.values(PARAMETER_CATALOG).filter(param =>
      !excludedParameterSet.has(param.id) && !excludedCategorySet.has(param.category)
    );

    // Filter by engine family if specified
    if (engineFamily) {
      params = params.filter(p =>
        p.engineFamilies === null || p.engineFamilies.includes(engineFamily)
      );
    }

    // v3.1.3: Filter by engine size if specified (for fuel-system-specific params like MFG)
    // Parameters with applicableEngines set are only shown if the engine size matches
    if (engineSize) {
      params = params.filter(p =>
        !p.applicableEngines || p.applicableEngines.includes(engineSize)
      );
    } else if (engineFamily) {
      // If engine family is set but no specific size, hide params requiring specific engines
      params = params.filter(p => !p.applicableEngines);
    }

    // Filter by category
    if (activeCategory) {
      params = params.filter(p => p.category === activeCategory);
    }

    // Filter by search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      params = params.filter(p =>
        p.name.toLowerCase().includes(query) ||
        p.description.toLowerCase().includes(query) ||
        p.id.toLowerCase().includes(query)
      );
    }

    return params;
  }, [engineFamily, engineSize, activeCategory, searchQuery, excludedCategorySet, excludedParameterSet]);

  // Group parameters by category for display
  const groupedParameters = useMemo(() => {
    if (activeCategory) {
      return { [activeCategory]: filteredParameters };
    }

    const groups = {};
    for (const param of filteredParameters) {
      if (!groups[param.category]) {
        groups[param.category] = [];
      }
      groups[param.category].push(param);
    }
    return groups;
  }, [filteredParameters, activeCategory]);

  // Count enabled parameters
  const enabledCount = useMemo(() => {
    return filteredParameters.filter(p => {
      const config = thresholds?.[p.id];
      return config?.enabled !== false;
    }).length;
  }, [filteredParameters, thresholds]);

  // Handle parameter change
  const handleParameterChange = useCallback((parameterId, config) => {
    onChange({
      ...thresholds,
      [parameterId]: config
    });
  }, [thresholds, onChange]);

  // Handle reset to defaults
  const handleReset = useCallback((parameterId) => {
    const defaults = getDefaultThresholds(parameterId);
    handleParameterChange(parameterId, defaults);
  }, [handleParameterChange]);

  // Bulk actions
  const handleEnableAll = useCallback(() => {
    const updated = { ...thresholds };
    for (const param of filteredParameters) {
      updated[param.id] = {
        ...(updated[param.id] || param.defaults),
        enabled: true
      };
    }
    onChange(updated);
  }, [filteredParameters, thresholds, onChange]);

  const handleDisableAll = useCallback(() => {
    const updated = { ...thresholds };
    for (const param of filteredParameters) {
      updated[param.id] = {
        ...(updated[param.id] || param.defaults),
        enabled: false
      };
    }
    onChange(updated);
  }, [filteredParameters, thresholds, onChange]);

  const handleResetAll = useCallback(() => {
    const updated = { ...thresholds };
    for (const param of filteredParameters) {
      updated[param.id] = getDefaultThresholds(param.id);
    }
    onChange(updated);
  }, [filteredParameters, thresholds, onChange]);

  // Validate a parameter's config
  const getValidation = useCallback((parameterId) => {
    const config = thresholds?.[parameterId];
    const param = PARAMETER_CATALOG[parameterId];
    const errors = [];

    if (!config || !param) return { errors };

    // Check that warning thresholds are less severe than critical
    if (config.warning && config.critical) {
      if (config.warning.min !== undefined && config.critical.min !== undefined) {
        if (config.warning.min <= config.critical.min) {
          errors.push('Warning min must be greater than critical min');
        }
      }
      if (config.warning.max !== undefined && config.critical.max !== undefined) {
        if (config.warning.max >= config.critical.max) {
          errors.push('Warning max must be less than critical max');
        }
      }
    }

    return { errors };
  }, [thresholds]);

  const gridColsClass = columns === 1 ? 'grid-cols-1' : columns === 3 ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3' : 'grid-cols-1 md:grid-cols-2';
  const visibleCategories = useMemo(() => {
    return Object.fromEntries(
      Object.entries(PARAMETER_CATEGORIES).filter(([id]) => !excludedCategorySet.has(id))
    );
  }, [excludedCategorySet]);

  return (
    <div className="space-y-6">
      {/* Search and filters */}
      <div className="space-y-4">
        {showSearch && (
          <SearchBar
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="Search parameters by name or description..."
          />
        )}

        {showCategoryTabs && (
          <CategoryTabs
            categories={visibleCategories}
            activeCategory={activeCategory}
            onSelect={handleSelectCategory}
          />
        )}

        {showQuickActions && (
          <QuickActions
            onEnableAll={handleEnableAll}
            onDisableAll={handleDisableAll}
            onResetAll={handleResetAll}
            enabledCount={enabledCount}
            totalCount={filteredParameters.length}
          />
        )}
      </div>

      {/* Parameter cards */}
      {filteredParameters.length === 0 ? (
        <EmptyState searchQuery={searchQuery} activeCategory={activeCategory} />
      ) : (
        <div className="space-y-8">
          {Object.entries(groupedParameters).map(([categoryId, params]) => {
            const category = PARAMETER_CATEGORIES[categoryId];
            return (
              <div key={categoryId}>
                {/* Category header (only show when viewing all categories) */}
                {!activeCategory && (
                  <div className="flex items-center gap-3 mb-4">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: category?.color || '#6b7280' }}
                    />
                    <h3 className="text-lg font-semibold text-gray-900">
                      {category?.name || categoryId}
                    </h3>
                    <span className="text-sm text-gray-500">
                      ({params.length} parameter{params.length !== 1 ? 's' : ''})
                    </span>
                  </div>
                )}

                {/* Parameter grid */}
                <div className={`grid ${gridColsClass} gap-4`}>
                  {params.map(param => (
                    <ThresholdCard
                      key={param.id}
                      parameter={param}
                      config={thresholds?.[param.id] || param.defaults}
                      onChange={(config) => handleParameterChange(param.id, config)}
                      onReset={() => handleReset(param.id)}
                      validation={getValidation(param.id)}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * Single category view component (for sidebar subsection navigation)
 * v3.1.3: Added engineSize prop for fuel-system-specific filtering
 */
export function CategoryParameterGrid({
  categoryId,
  thresholds,
  onChange,
  engineFamily = null,
  engineSize = null, // v3.1.3: Filter by engine size for MFG params
  excludedCategoryIds = [],
  excludedParameterIds = []
}) {
  return (
    <ParameterGrid
      thresholds={thresholds}
      onChange={onChange}
      engineFamily={engineFamily}
      engineSize={engineSize}
      filterCategory={categoryId}
      showSearch={true}
      showCategoryTabs={false}
      showQuickActions={true}
      columns={2}
      excludedCategoryIds={excludedCategoryIds}
      excludedParameterIds={excludedParameterIds}
    />
  );
}
